/**
 * Copy a brief's cover sheet page as a layout: text lines (with alignment, tabs, bold, size),
 * horizontal rules, tables (grid from the drawn borders, with merged cells) and images.
 * Running headers/footers and images repeated on other pages are left out.
 */
import type { PdfFragment, PdfPage } from '../extract/pdf';
import { joinFragments } from '../extract/pdf';
import type { ImagePlacement, Seg } from '../extract/pdfGraphics';
import { cleanText } from '../text';
import type { CoverBlock, CoverLayout, CoverRun, CoverTableCell, CoverTextLine } from '../types';

const TOL = 2.5; // points: lines this close are the same line
const BULLET = /^[•●▪◦·○■□►➢✓-]$/;

interface HSeg {
  y: number;
  x1: number;
  x2: number;
  t: number;
}
interface VSeg {
  x: number;
  y1: number;
  y2: number;
  t: number;
}

interface Grid {
  xs: number[];
  /** Top to bottom (PDF y descending). */
  ys: number[];
  h: HSeg[];
  v: VSeg[];
}

function cluster(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1]! <= TOL) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

function splitSegs(segs: Seg[]): { h: HSeg[]; v: VSeg[] } {
  const h: HSeg[] = [];
  const v: VSeg[] = [];
  for (const s of segs) {
    if (s.h <= 3 && s.w > 3) h.push({ y: s.y + s.h / 2, x1: s.x, x2: s.x + s.w, t: s.h });
    else if (s.w <= 3 && s.h > 3) v.push({ x: s.x + s.w / 2, y1: s.y, y2: s.y + s.h, t: s.w });
  }
  return { h, v };
}

/** Group segments that touch into tables; leftover long horizontals become rules. */
export function findTables(segs: Seg[]): { grids: Grid[]; rules: HSeg[] } {
  const { h, v } = splitSegs(segs);
  const n = h.length + v.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  h.forEach((a, i) =>
    v.forEach((b, j) => {
      if (b.x >= a.x1 - TOL && b.x <= a.x2 + TOL && a.y >= b.y1 - TOL && a.y <= b.y2 + TOL) union(i, h.length + j);
    }),
  );
  const groups = new Map<number, { h: HSeg[]; v: VSeg[] }>();
  h.forEach((a, i) => {
    const g = groups.get(find(i)) ?? { h: [], v: [] };
    g.h.push(a);
    groups.set(find(i), g);
  });
  v.forEach((b, j) => {
    const g = groups.get(find(h.length + j)) ?? { h: [], v: [] };
    g.v.push(b);
    groups.set(find(h.length + j), g);
  });
  const grids: Grid[] = [];
  const rules: HSeg[] = [];
  for (const g of groups.values()) {
    const xs = cluster(g.v.map((s) => s.x));
    const ys = cluster(g.h.map((s) => s.y)).reverse();
    if (xs.length >= 2 && ys.length >= 2) grids.push({ xs, ys, h: g.h, v: g.v });
    else if (g.v.length === 0) rules.push(...g.h);
  }
  // Join collinear pieces of the same rule.
  rules.sort((a, b) => a.y - b.y || a.x1 - b.x1);
  const joined: HSeg[] = [];
  for (const r of rules) {
    const last = joined[joined.length - 1];
    if (last && Math.abs(last.y - r.y) <= 1 && r.x1 <= last.x2 + TOL) last.x2 = Math.max(last.x2, r.x2);
    else joined.push({ ...r });
  }
  return { grids, rules: joined.filter((r) => r.x2 - r.x1 >= 40) };
}

const hasV = (g: Grid, x: number, y: number) => g.v.some((s) => Math.abs(s.x - x) <= TOL && y >= s.y1 - 1 && y <= s.y2 + 1);
const hasH = (g: Grid, y: number, x: number) => g.h.some((s) => Math.abs(s.y - y) <= TOL && x >= s.x1 - 1 && x <= s.x2 + 1);

interface PlacedFrag extends PdfFragment {
  y: number;
}

/** Turn the fragments of one visual line into a cover text line, relative to [left, right]. */
export function textLine(frags: PdfFragment[], left: number, right: number): CoverTextLine & { start: number; end: number } {
  const sorted = [...frags].sort((a, b) => a.x - b.x);
  const size = Math.max(...sorted.map((f) => f.size));
  const segs: PdfFragment[][] = [];
  let end = -Infinity;
  for (const f of sorted) {
    const gap = f.x - end;
    const prev = segs[segs.length - 1];
    const afterBullet = prev && prev.length === 1 && BULLET.test(prev[0]!.str.trim()) && gap > 0.3 * size;
    // A label's colon column ("Submission Date   : …") starts a new tab stop too.
    const colon = prev && /^\s*:/.test(f.str) && gap > 0.15 * size;
    if (!prev || gap > Math.max(1.5 * size, 10) || afterBullet || colon) segs.push([f]);
    else prev.push(f);
    end = Math.max(end, f.x + f.width);
  }
  const runs: CoverRun[] = [];
  const tabs: number[] = [];
  segs.forEach((s, i) => {
    const text = cleanText(joinFragments(s));
    if (!text) return;
    const chars = s.reduce((n, f) => n + f.str.trim().length, 0);
    const boldChars = s.filter((f) => f.bold).reduce((n, f) => n + f.str.trim().length, 0);
    const bold = chars > 0 && boldChars / chars > 0.5;
    if (i > 0) tabs.push(Math.max(0, s[0]!.x - left));
    runs.push({ text, bold, ...(i > 0 ? { tab: true } : {}) });
  });
  const start = sorted[0]?.x ?? left;
  const width = right - left;
  const mid = (start + end) / 2;
  let align: CoverTextLine['align'] = 'left';
  if (segs.length === 1 && Math.abs(mid - (left + right) / 2) <= Math.max(6, 0.04 * width) && start - left > 10) align = 'center';
  else if (segs.length === 1 && right - end < 8 && start > (left + right) / 2) align = 'right';
  return {
    runs,
    size: Math.round(size * 2) / 2,
    align,
    indent: align === 'left' ? Math.max(0, Math.round((start - left) * 10) / 10) : 0,
    tabs: align === 'left' ? tabs.map((t) => Math.round(t * 10) / 10) : [],
    start,
    end,
  };
}

/** Lines of fragments, top to bottom. */
function toLines(frags: PlacedFrag[]): PlacedFrag[][] {
  const lines: { y: number; f: PlacedFrag[] }[] = [];
  for (const f of frags) {
    const l = lines.find((x) => Math.abs(x.y - f.y) <= 2);
    if (l) l.f.push(f);
    else lines.push({ y: f.y, f: [f] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => l.f);
}

const CELL_PAD = 5;

function buildTable(g: Grid, frags: PlacedFrag[], pageHeight: number): CoverBlock {
  const nCols = g.xs.length - 1;
  const nRows = g.ys.length - 1;
  const covered = Array.from({ length: nRows }, () => new Array<boolean>(nCols).fill(false));
  const rows: { height: number; cells: CoverTableCell[] }[] = [];
  const owner = new Map<string, { cell: CoverTableCell; frags: PlacedFrag[]; x1: number; x2: number }>();
  for (let r = 0; r < nRows; r++) {
    const top = g.ys[r]!;
    const bottom = g.ys[r + 1]!;
    const cells: CoverTableCell[] = [];
    for (let c = 0; c < nCols; c++) {
      if (covered[r]![c]) continue;
      const midY = (top + bottom) / 2;
      let colSpan = 1;
      while (c + colSpan < nCols && !hasV(g, g.xs[c + colSpan]!, midY)) colSpan++;
      const midX = (g.xs[c]! + g.xs[c + colSpan]!) / 2;
      let rowSpan = 1;
      while (r + rowSpan < nRows && !hasH(g, g.ys[r + rowSpan]!, midX)) rowSpan++;
      for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + colSpan; cc++) covered[rr]![cc] = true;
      const cell: CoverTableCell = { col: c, colSpan, rowSpan, lines: [] };
      cells.push(cell);
      const entry = { cell, frags: [] as PlacedFrag[], x1: g.xs[c]!, x2: g.xs[c + colSpan]! };
      for (let rr = r; rr < r + rowSpan; rr++) for (let cc = c; cc < c + colSpan; cc++) owner.set(`${rr},${cc}`, entry);
    }
    rows.push({ height: Math.round((top - bottom) * 10) / 10, cells });
  }
  for (const f of frags) {
    const cx = f.x + f.width / 2;
    const c = g.xs.findIndex((x, i) => i < nCols && cx >= x && cx < g.xs[i + 1]!);
    const r = g.ys.findIndex((y, i) => i < nRows && f.y <= y && f.y > g.ys[i + 1]!);
    owner.get(`${r},${c}`)?.frags.push(f);
  }
  for (const e of new Set(owner.values())) {
    e.cell.lines = toLines(e.frags).map((l) => {
      const { start: _s, end: _e, ...line } = textLine(l, e.x1 + CELL_PAD, e.x2 - CELL_PAD);
      return line;
    });
  }
  const x0 = g.xs[0]!;
  return {
    kind: 'table',
    top: pageHeight - g.ys[0]!,
    bottom: pageHeight - g.ys[g.ys.length - 1]!,
    x: x0,
    colWidths: g.xs.slice(1).map((x, i) => Math.round((x - g.xs[i]!) * 10) / 10),
    rows,
  };
}

// Same size = same picture (a header logo can move when a page has different margins).
const sameSize = (a: ImagePlacement, b: ImagePlacement) =>
  a.id === b.id || (Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5);

export interface CoverLayoutInput {
  page: PdfPage;
  /** Other pages of the brief, to spot running-header images. */
  otherPages: PdfPage[];
  /** Running header/footer texts. */
  repeated: Set<string>;
  /** PNG data URLs for this page's images, by image id. */
  imageUrls: Map<string, string>;
}

/** Images on the cover that are not part of a running header (worth decoding). */
export function coverImages(page: PdfPage, otherPages: PdfPage[]): ImagePlacement[] {
  const imgs = page.graphics?.images ?? [];
  const area = page.width * page.height;
  // A running-header logo sits in the same place on most pages; a title-page logo may repeat once.
  const minRepeats = Math.max(2, Math.ceil(otherPages.length / 2));
  return imgs.filter(
    (img) =>
      img.width * img.height < 0.85 * area &&
      otherPages.filter((p) => (p.graphics?.images ?? []).some((o) => sameSize(o, img))).length < minRepeats,
  );
}

export function buildCoverLayout(input: CoverLayoutInput): CoverLayout | null {
  const { page, repeated } = input;
  const H = page.height;
  const frags: PlacedFrag[] = page.lines
    .filter((l) => !repeated.has(cleanText(l.text)))
    .flatMap((l) => l.fragments.map((f) => ({ ...f, y: l.y })));
  if (frags.length === 0) return null;

  const { grids, rules } = findTables(page.graphics?.segs ?? []);
  const inGrid = (f: PlacedFrag) =>
    grids.find((g) => {
      const cx = f.x + f.width / 2;
      return cx >= g.xs[0]! && cx <= g.xs[g.xs.length - 1]! && f.y <= g.ys[0]! && f.y >= g.ys[g.ys.length - 1]!;
    });
  const byGrid = new Map<Grid, PlacedFrag[]>();
  const free: PlacedFrag[] = [];
  for (const f of frags) {
    const g = inGrid(f);
    if (g) byGrid.set(g, [...(byGrid.get(g) ?? []), f]);
    else free.push(f);
  }

  const images = coverImages(page, input.otherPages).filter((i) => input.imageUrls.has(i.id));

  // Content edges: everything that will be copied.
  const xs1 = [...free.map((f) => f.x), ...grids.map((g) => g.xs[0]!), ...rules.map((r) => r.x1), ...images.map((i) => i.x)];
  const xs2 = [
    ...free.map((f) => f.x + f.width),
    ...grids.map((g) => g.xs[g.xs.length - 1]!),
    ...rules.map((r) => r.x2),
    ...images.map((i) => i.x + i.width),
  ];
  let left = Math.min(...xs1);
  let right = Math.max(...xs2);
  // Assume symmetric page margins, so centred lines stay centred.
  const margin = Math.max(0, Math.min(left, page.width - right));
  left = margin;
  right = page.width - margin;

  const blocks: CoverBlock[] = [];
  for (const l of toLines(free)) {
    const t = textLine(l, left, right);
    if (t.runs.length === 0) continue;
    const y = l[0]!.y;
    const { start: _s, end: _e, ...line } = t;
    blocks.push({ kind: 'text', top: H - (y + 0.85 * t.size), bottom: H - (y - 0.3 * t.size), ...line });
  }
  for (const r of rules)
    blocks.push({
      kind: 'rule',
      top: H - r.y - r.t / 2,
      bottom: H - r.y + r.t / 2,
      x: r.x1,
      width: r.x2 - r.x1,
      thickness: Math.max(0.5, r.t),
    });
  for (const img of images) {
    const mid = img.x + img.width / 2;
    const align = Math.abs(mid - page.width / 2) < 12 ? 'center' : img.x - left < 12 ? 'left' : 'right';
    blocks.push({
      kind: 'image',
      top: H - (img.y + img.height),
      bottom: H - img.y,
      x: img.x,
      width: img.width,
      dataUrl: input.imageUrls.get(img.id)!,
      align,
    });
  }
  for (const g of grids) blocks.push(buildTable(g, byGrid.get(g) ?? [], H));
  blocks.sort((a, b) => a.top - b.top);
  return { page: page.page, pageWidth: page.width, pageHeight: H, left, right, blocks };
}
