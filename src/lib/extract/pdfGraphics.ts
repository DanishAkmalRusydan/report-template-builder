/**
 * Read the vector graphics of a PDF page from pdf.js's operator list: thin filled rectangles and
 * stroked lines (table borders, horizontal rules) and image placements (logos).
 * Coordinates are PDF points with y growing upward, after applying the transform stack.
 */
import { bytesToBase64, encodePng, pdfImageToRgba } from '../png';

/** An axis-aligned thin rectangle: a line segment with thickness. */
export interface Seg {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImagePlacement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Inline images carry their data directly. */
  inline?: unknown;
}

export interface PageGraphics {
  segs: Seg[];
  images: ImagePlacement[];
}

export interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

// pdf.js 4.x operator codes (used when the library object doesn't expose OPS).
const DEFAULT_OPS: Record<string, number> = {
  setLineWidth: 2,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  constructPath: 91,
};

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function bbox(m: M, pts: [number, number][]): Seg {
  const t = pts.map(([x, y]) => apply(m, x, y));
  const xs = t.map((p) => p[0]);
  const ys = t.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function isLight(c: unknown): boolean {
  if (typeof c === 'string') {
    const m = c.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return !!m && [m[1], m[2], m[3]].every((h) => parseInt(h!, 16) > 235);
  }
  if (c && typeof c === 'object' && '0' in c) {
    const a = c as unknown as ArrayLike<number>;
    return a[0]! > 235 && a[1]! > 235 && a[2]! > 235;
  }
  return false;
}

const THIN = 3; // points: thicker filled shapes are shading, not lines

/** Extract line segments and image placements from an operator list. */
export function readGraphics(ol: OperatorListLike, ops: Record<string, number> = DEFAULT_OPS): PageGraphics {
  const O = { ...DEFAULT_OPS, ...ops };
  const segs: Seg[] = [];
  const images: ImagePlacement[] = [];
  let ctm: M = IDENTITY;
  let lineWidth = 1;
  let fillLight = false;
  let strokeLight = false;
  const stack: { ctm: M; lineWidth: number; fillLight: boolean; strokeLight: boolean }[] = [];
  let rects: [number, number, number, number][] = [];
  let lines: [number, number, number, number][] = [];

  const emitFilled = () => {
    if (fillLight) return;
    for (const [x, y, w, h] of rects) {
      const s = bbox(ctm, [
        [x, y],
        [x + w, y + h],
      ]);
      if (s.w <= THIN || s.h <= THIN) segs.push(s);
    }
  };
  const emitStroked = () => {
    if (strokeLight) return;
    const lw = Math.max(0.3, lineWidth * Math.hypot(ctm[0], ctm[1]));
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      const [ax, ay] = apply(ctm, x1, y1);
      const [bx, by] = apply(ctm, x2, y2);
      if (Math.abs(ay - by) < 0.5) segs.push({ x: Math.min(ax, bx), y: ay - lw / 2, w: Math.abs(bx - ax), h: lw });
      else if (Math.abs(ax - bx) < 0.5) segs.push({ x: ax - lw / 2, y: Math.min(ay, by), w: lw, h: Math.abs(by - ay) });
    };
    for (const [x, y, w, h] of rects) {
      edge(x, y, x + w, y);
      edge(x, y + h, x + w, y + h);
      edge(x, y, x, y + h);
      edge(x + w, y, x + w, y + h);
    }
    for (const [x1, y1, x2, y2] of lines) edge(x1, y1, x2, y2);
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]!;
    const args = ol.argsArray[i] as unknown[] | null;
    switch (fn) {
      case O.save:
        stack.push({ ctm, lineWidth, fillLight, strokeLight });
        break;
      case O.restore: {
        const s = stack.pop();
        if (s) ({ ctm, lineWidth, fillLight, strokeLight } = s);
        break;
      }
      case O.transform:
        ctm = mul(ctm, args as unknown as M);
        break;
      case O.paintFormXObjectBegin: {
        stack.push({ ctm, lineWidth, fillLight, strokeLight });
        const m = args?.[0] as M | undefined;
        if (m && m.length === 6) ctm = mul(ctm, m);
        break;
      }
      case O.paintFormXObjectEnd: {
        const s = stack.pop();
        if (s) ({ ctm, lineWidth, fillLight, strokeLight } = s);
        break;
      }
      case O.setLineWidth:
        lineWidth = Number(args?.[0] ?? 1);
        break;
      case O.setFillRGBColor:
        fillLight = isLight(args?.[0] !== undefined && typeof args[0] === 'string' ? args[0] : args);
        break;
      case O.setStrokeRGBColor:
        strokeLight = isLight(args?.[0] !== undefined && typeof args[0] === 'string' ? args[0] : args);
        break;
      case O.constructPath: {
        const pathOps = (args?.[0] ?? []) as number[];
        const coords = (args?.[1] ?? []) as number[];
        let k = 0;
        let cx = 0;
        let cy = 0;
        let sx = 0;
        let sy = 0;
        for (const op of pathOps) {
          if (op === O.rectangle) {
            rects.push([coords[k]!, coords[k + 1]!, coords[k + 2]!, coords[k + 3]!]);
            cx = sx = coords[k]!;
            cy = sy = coords[k + 1]!;
            k += 4;
          } else if (op === O.moveTo) {
            cx = sx = coords[k]!;
            cy = sy = coords[k + 1]!;
            k += 2;
          } else if (op === O.lineTo) {
            lines.push([cx, cy, coords[k]!, coords[k + 1]!]);
            cx = coords[k]!;
            cy = coords[k + 1]!;
            k += 2;
          } else if (op === O.curveTo) {
            cx = coords[k + 4]!;
            cy = coords[k + 5]!;
            k += 6;
          } else if (op === O.curveTo2 || op === O.curveTo3) {
            cx = coords[k + 2]!;
            cy = coords[k + 3]!;
            k += 4;
          } else if (op === O.closePath) {
            if (cx !== sx || cy !== sy) lines.push([cx, cy, sx, sy]);
            cx = sx;
            cy = sy;
          }
        }
        break;
      }
      case O.fill:
      case O.eoFill:
        emitFilled();
        rects = [];
        lines = [];
        break;
      case O.stroke:
      case O.closeStroke:
        emitStroked();
        rects = [];
        lines = [];
        break;
      case O.fillStroke:
      case O.eoFillStroke:
      case O.closeFillStroke:
      case O.closeEOFillStroke:
        emitFilled();
        emitStroked();
        rects = [];
        lines = [];
        break;
      case O.endPath:
        rects = [];
        lines = [];
        break;
      case O.paintImageXObject:
      case O.paintInlineImageXObject: {
        const b = bbox(ctm, [
          [0, 0],
          [1, 1],
        ]);
        if (b.w > 1 && b.h > 1) {
          const inline = fn === O.paintInlineImageXObject;
          images.push({
            id: inline ? `inline_${i}` : String(args?.[0]),
            x: b.x,
            y: b.y,
            width: b.w,
            height: b.h,
            ...(inline ? { inline: args?.[0] } : {}),
          });
        }
        break;
      }
      default:
        break;
    }
  }
  return { segs, images };
}

interface ObjsLike {
  has(id: string): boolean;
  get(id: string, callback?: (data: unknown) => void): unknown;
}

/** pdf.js resolves image objects asynchronously; wait for one (or give up after a few seconds). */
function waitFor(objs: ObjsLike, id: string, ms = 5000): Promise<unknown> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    try {
      objs.get(id, (d) => {
        clearTimeout(t);
        resolve(d);
      });
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

/** Decode a placed image to a PNG data URL (null when its pixels aren't available). */
export async function imageDataUrl(img: ImagePlacement, objs: ObjsLike, commonObjs: ObjsLike): Promise<string | null> {
  let data: unknown = img.inline;
  if (!data) {
    // "g_…" ids are shared across pages (commonObjs); others belong to the page.
    data = await waitFor(img.id.startsWith('g_') ? commonObjs : objs, img.id);
  }
  const d = data as { width?: number; height?: number; kind?: number; data?: Uint8Array } | null;
  if (!d?.width || !d.height || !d.data) return null;
  // Skip huge images (photos/backgrounds) to keep the template and browser storage small.
  if (d.width * d.height > 2_500_000) return null;
  const png = await encodePng(d.width, d.height, pdfImageToRgba({ width: d.width, height: d.height, kind: d.kind ?? 3, data: d.data }));
  return `data:image/png;base64,${bytesToBase64(png)}`;
}
