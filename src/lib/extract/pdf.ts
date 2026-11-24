/**
 * PDF text extraction with pdfjs-dist.
 *
 * pdf.js returns text in small fragments ("T", "ask B1:", "Doma", "in" …). We group
 * fragments into lines by baseline (y within ~2pt), sort by x, and only insert a space
 * when the horizontal gap between fragments is wider than a fraction of the font size.
 */
import type { PageSize } from '../types';
import { imageDataUrl, readGraphics, type ImagePlacement, type PageGraphics } from './pdfGraphics';

export interface PdfFragment {
  str: string;
  x: number;
  width: number;
  size: number;
  bold: boolean;
}

export interface PdfLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  fragments: PdfFragment[];
}

export interface PdfPage {
  page: number;
  width: number;
  height: number;
  landscape: boolean;
  lines: PdfLine[];
  /** Table borders, rules and image placements (no image pixels). */
  graphics?: PageGraphics;
}

export interface PdfExtract {
  pages: PdfPage[];
  pageSizes: PageSize[];
  /** True when the PDF has (almost) no extractable text, e.g. a scan. */
  noTextLayer: boolean;
}

/** Minimal slice of the pdfjs API we use, so Node tests can pass the legacy build. */
export interface PdfjsLike {
  getDocument(src: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
    verbosity?: number;
    isOffscreenCanvasSupported?: boolean;
    isImageDecoderSupported?: boolean;
  }): {
    promise: Promise<PdfDocLike>;
  };
  OPS?: Record<string, number>;
}
interface PdfDocLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}
interface PdfPageLike {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList(): Promise<{ fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }>;
  commonObjs: { has(id: string): boolean; get(id: string): { name?: string } | undefined };
  objs: { has(id: string): boolean; get(id: string): unknown };
}
interface RawItem {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
}

const LINE_TOLERANCE = 2; // points
const SPACE_GAP_RATIO = 0.18; // gap > 18% of font size ⇒ word break

function isRawItem(i: unknown): i is RawItem {
  return typeof i === 'object' && i !== null && 'str' in i && 'transform' in i;
}

export function joinFragments(frags: PdfFragment[]): string {
  let out = '';
  let prevEnd: number | null = null;
  for (const f of frags) {
    if (prevEnd !== null) {
      const gap = f.x - prevEnd;
      const needsSpace = gap > SPACE_GAP_RATIO * f.size && !out.endsWith(' ') && !f.str.startsWith(' ');
      if (needsSpace) out += ' ';
    }
    out += f.str;
    prevEnd = f.x + f.width;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function groupLines(frags: (PdfFragment & { y: number })[]): PdfLine[] {
  const lines: { y: number; frags: (PdfFragment & { y: number })[] }[] = [];
  for (const f of frags) {
    let line = lines.find((l) => Math.abs(l.y - f.y) <= LINE_TOLERANCE);
    if (!line) {
      line = { y: f.y, frags: [] };
      lines.push(line);
    }
    line.frags.push(f);
  }
  lines.sort((a, b) => b.y - a.y); // PDF y grows upward
  return lines.map((l) => {
    l.frags.sort((a, b) => a.x - b.x);
    const chars = l.frags.reduce((n, f) => n + f.str.trim().length, 0);
    const boldChars = l.frags.filter((f) => f.bold).reduce((n, f) => n + f.str.trim().length, 0);
    const first = l.frags[0];
    return {
      text: joinFragments(l.frags),
      x: first ? first.x : 0,
      y: l.y,
      size: Math.max(...l.frags.map((f) => f.size)),
      bold: chars > 0 && boldChars / chars > 0.5,
      fragments: l.frags,
    };
  });
}

async function loadDefaultPdfjs(): Promise<PdfjsLike> {
  const mod = await import('./pdfjs-setup');
  return mod.getPdfjs();
}

export async function extractPdf(data: ArrayBuffer | Uint8Array, pdfjs?: PdfjsLike): Promise<PdfExtract> {
  const lib = pdfjs ?? (await loadDefaultPdfjs());
  // pdf.js may transfer (detach) the buffer, so always hand it a copy.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice();
  const doc = await lib.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 }).promise;
  const pages: PdfPage[] = [];
  let totalChars = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      // The operator list loads font objects so we can read real font names (bold detection).
      const ol = await page.getOperatorList();
      let graphics: PageGraphics | undefined;
      try {
        graphics = readGraphics(ol, lib.OPS);
      } catch {
        graphics = undefined;
      }
      const tc = await page.getTextContent();
      const fontCache = new Map<string, boolean>();
      const isBoldFont = (id: string): boolean => {
        const cached = fontCache.get(id);
        if (cached !== undefined) return cached;
        let name = '';
        try {
          name = page.commonObjs.has(id) ? (page.commonObjs.get(id)?.name ?? '') : '';
        } catch {
          name = '';
        }
        const bold = /bold|black|heavy|semibold|demi/i.test(name);
        fontCache.set(id, bold);
        return bold;
      };
      const frags: (PdfFragment & { y: number })[] = [];
      for (const it of tc.items) {
        if (!isRawItem(it) || it.str.length === 0) continue;
        if (!it.str.trim()) continue;
        const [a = 1, b = 0, , , e = 0, f = 0] = it.transform;
        const size = Math.hypot(a, b) || 1;
        totalChars += it.str.trim().length;
        frags.push({ str: it.str, x: e, y: f, width: it.width, size, bold: isBoldFont(it.fontName) });
      }
      const width = Math.round(vp.width);
      const height = Math.round(vp.height);
      pages.push({ page: n, width, height, landscape: width > height, lines: groupLines(frags), ...(graphics ? { graphics } : {}) });
    }
  } finally {
    await doc.destroy();
  }
  return {
    pages,
    pageSizes: pages.map(({ page, width, height, landscape }) => ({ page, width, height, landscape })),
    noTextLayer: totalChars < 20,
  };
}

/** Image pixels (PNG data URLs) for the given pages, keyed by page then image id. */
export async function extractPageImages(
  data: ArrayBuffer | Uint8Array,
  wanted: Map<number, ImagePlacement[]>,
  pdfjs?: PdfjsLike,
): Promise<Map<number, Map<string, string>>> {
  const out = new Map<number, Map<string, string>>();
  if (wanted.size === 0) return out;
  const lib = pdfjs ?? (await loadDefaultPdfjs());
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data)).slice();
  // Raw pixel data (not ImageBitmaps), so images can be encoded without a canvas.
  const doc = await lib.getDocument({
    data: bytes,
    isEvalSupported: false,
    verbosity: 0,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  }).promise;
  try {
    for (const [n, imgs] of wanted) {
      const page = await doc.getPage(n);
      const ol = await page.getOperatorList();
      const placed = readGraphics(ol, lib.OPS).images;
      const urls = new Map<string, string>();
      for (const img of imgs) {
        const match = placed.find((p) => p.id === img.id) ?? img;
        const url = await imageDataUrl(match, page.objs, page.commonObjs);
        if (url) urls.set(img.id, url);
      }
      out.set(n, urls);
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
