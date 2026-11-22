/**
 * Rebuild a rubric table from PDF pages.
 *
 * Columns: vertical "gutters" (x ranges almost no text covers) between table lines.
 * Rows: a new row starts on a line that has text in every achievement-level column
 * (Excellent … Not Attempted); other lines continue the current row.
 */
import type { PdfFragment, PdfLine, PdfPage } from '../extract/pdf';
import { joinFragments } from '../extract/pdf';
import { cleanText } from '../text';
import type { BriefLine, RubricLayout } from '../types';

const LEVEL_RE = /\b(excellent|very good|good|average|satisfactory|fair|poor|weak|needs? improvement|not attempted|unsatisfactory|outstanding|developing|beginning|proficient|accomplished|exemplary)\b/gi;
const END_RE = /overall score|total score|^comments\s*:|evaluated by|signature/i;
const GAP_SPLIT = 8; // points; chunks further apart than this are separate cells

interface TLine {
  page: number;
  line: PdfLine;
}

function chunkCount(l: PdfLine): number {
  let n = 0;
  let end = -Infinity;
  for (const f of l.fragments) {
    if (f.x - end > GAP_SPLIT) n += 1;
    end = Math.max(end, f.x + f.width);
  }
  return n;
}

function levelHits(text: string): number {
  return new Set((text.match(LEVEL_RE) ?? []).map((s) => s.toLowerCase())).size;
}

/** Gutter x-positions (centres) between columns. */
function findGutters(lines: PdfLine[]): number[] {
  const frags = lines.flatMap((l) => l.fragments);
  if (frags.length === 0) return [];
  const minX = Math.floor(Math.min(...frags.map((f) => f.x)));
  const maxX = Math.ceil(Math.max(...frags.map((f) => f.x + f.width)));
  const cov = new Array<number>(maxX - minX + 1).fill(0);
  for (const f of frags) {
    for (let x = Math.ceil(f.x); x < Math.floor(f.x + f.width); x++) cov[x - minX]! += 1;
  }
  const gutters: number[] = [];
  let start = -1;
  for (let i = 0; i < cov.length; i++) {
    const open = cov[i]! <= 1;
    if (open && start < 0) start = i;
    if ((!open || i === cov.length - 1) && start >= 0) {
      const end = open ? i : i - 1;
      if (end - start + 1 >= 3 && start > 0 && end < cov.length - 1) gutters.push(minX + (start + end) / 2);
      start = -1;
    }
  }
  // Merge gutters closer than 6pt.
  const merged: number[] = [];
  for (const g of gutters) {
    const last = merged[merged.length - 1];
    if (last !== undefined && g - last < 6) merged[merged.length - 1] = (last + g) / 2;
    else merged.push(g);
  }
  return merged;
}

function columnOf(f: PdfFragment, gutters: number[]): number {
  const x = f.x + 1;
  let c = 0;
  while (c < gutters.length && x > gutters[c]!) c++;
  return c;
}

/**
 * Split a fragment that runs across a gutter (pdf.js sometimes merges neighbouring cells,
 * e.g. "Functional with minorRuns with"). The split point is estimated from the width,
 * then snapped to a nearby space or lower→Upper case change.
 */
export function splitAtGutters(f: PdfFragment, gutters: number[]): PdfFragment[] {
  // Only split when a real chunk of text sits past the gutter, not a slight overflow.
  const inside = gutters.filter((g) => g > f.x + 10 && g < f.x + f.width - 10);
  if (inside.length === 0 || f.str.length < 2) return [f];
  const g = inside[0]!;
  const ratio = (g - f.x) / f.width;
  let idx = Math.round(ratio * f.str.length);
  // A lower→Upper change with no space ("minorRuns") is the strongest sign of two merged cells.
  const caseChange = (i: number) => /[a-z,.)]/.test(f.str[i - 1]!) && /[A-Z]/.test(f.str[i]!);
  const space = (i: number) => f.str[i] === ' ' || f.str[i - 1] === ' ';
  let best = -1;
  for (const test of [caseChange, space]) {
    for (let d = 0; d <= 6 && best < 0; d++) {
      for (const i of [idx - d, idx + d]) {
        if (i > 0 && i < f.str.length && test(i)) {
          best = i;
          break;
        }
      }
    }
    if (best > 0) break;
  }
  if (best > 0) idx = best;
  if (idx <= 0 || idx >= f.str.length) return [f];
  const leftStr = f.str.slice(0, idx);
  const rightStr = f.str.slice(idx);
  const leftW = f.width * (leftStr.length / f.str.length);
  const left: PdfFragment = { ...f, str: leftStr.trimEnd(), width: leftW };
  const right: PdfFragment = { ...f, str: rightStr.trimStart(), x: Math.max(g + 1, f.x + leftW), width: f.width - leftW };
  return [left, ...splitAtGutters(right, gutters)];
}

function cellsOf(l: PdfLine, gutters: number[], split: boolean): string[] {
  const cols: PdfFragment[][] = Array.from({ length: gutters.length + 1 }, () => []);
  const frags = split ? l.fragments.flatMap((x) => splitAtGutters(x, gutters)) : l.fragments;
  for (const f of frags) cols[columnOf(f, gutters)]!.push(f);
  return cols.map((fs) => cleanText(joinFragments(fs)));
}

const SCORE_ONLY = /^\(\d{1,3}\)$/;

/** Rebuild a rubric that is a real table inside a .docx brief (rows/cells are known exactly). */
export function rubricLayoutFromDocxLines(lines: BriefLine[], score: (ls: BriefLine[]) => number): RubricLayout | null {
  const tables = new Map<number, BriefLine[]>();
  for (const l of lines) {
    if (l.tableId === undefined) continue;
    const arr = tables.get(l.tableId) ?? [];
    arr.push(l);
    tables.set(l.tableId, arr);
  }
  let best: { id: number; s: number } | null = null;
  for (const [id, ls] of tables) {
    const s = score(ls);
    if (s >= 3 && (!best || s > best.s)) best = { id, s };
  }
  if (!best) return null;
  const tl = tables.get(best.id)!;
  const nRows = Math.max(...tl.map((l) => l.tableRow ?? 0)) + 1;
  const nCols = Math.max(...tl.map((l) => l.tableCol ?? 0)) + 1;
  const rows = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => [] as string[]));
  for (const l of tl) rows[l.tableRow ?? 0]![l.tableCol ?? 0]!.push(l.text);
  const firstIdx = tl[0]!.index;
  const title = [...lines.slice(Math.max(0, firstIdx - 3), firstIdx)].reverse().find((l) => l.tableId === undefined && /rubric|marking/i.test(l.text));
  return { before: title ? [title.text] : [], rows: rows.map((r) => r.map((c) => c.join('\n'))), after: [] };
}

export function rubricLayoutFromPdf(pages: PdfPage[], rubricPages: number[], repeated: Set<string> = new Set()): RubricLayout | null {
  const all: TLine[] = [];
  for (const p of pages) {
    if (!rubricPages.includes(p.page)) continue;
    for (const line of p.lines) {
      if (repeated.has(cleanText(line.text))) continue;
      all.push({ page: p.page, line });
    }
  }
  if (all.length === 0) return null;

  const levelIdx = all.findIndex((t) => levelHits(t.line.text) >= 3);
  if (levelIdx < 0) return null;
  // Walk back over multi-cell header lines above the level line.
  let start = levelIdx;
  while (start > 0 && all[start - 1]!.page === all[levelIdx]!.page && chunkCount(all[start - 1]!.line) >= 2) start--;
  let end = all.length;
  for (let i = levelIdx + 1; i < all.length; i++) {
    if (END_RE.test(cleanText(all[i]!.line.text))) {
      end = i;
      break;
    }
  }
  const table = all.slice(start, end);
  // Header lines above the level line often span several columns, so leave them out of gutter detection.
  const dataLines = all.slice(levelIdx, end).map((t) => t.line);
  const gutters = findGutters(dataLines);
  if (gutters.length < 2) return null;
  // Header-only columns to the right of all data (e.g. an empty "TOTAL SCORE / Marks" column).
  const dataMaxX = Math.max(...dataLines.flatMap((l) => l.fragments.map((f) => f.x + f.width)));
  const beyond = all
    .slice(start, levelIdx)
    .flatMap((t) => t.line.fragments)
    .filter((f) => f.x > dataMaxX + 3)
    .map((f) => f.x);
  if (beyond.length) gutters.push((dataMaxX + Math.min(...beyond)) / 2);

  // Level columns: where the level labels sit on the level line.
  const levelLine = all[levelIdx]!.line;
  const levelCols = new Set(
    levelLine.fragments.filter((f) => levelHits(f.str) > 0).map((f) => columnOf(f, gutters)),
  );

  const rows: string[][] = [];
  let current: string[][] | null = null; // cells → lines
  const flush = () => {
    if (current) rows.push(current.map((ls) => ls.filter(Boolean).join(' ').trim()));
  };
  for (const [i, t] of table.entries()) {
    const isHeader = start + i < levelIdx;
    const cells = cellsOf(t.line, gutters, !isHeader);
    const filledLevels = [...levelCols].filter((c) => cells[c]).length;
    const scoresOnly = cells.filter(Boolean).every((c) => SCORE_ONLY.test(c));
    const startsRow = i === 0 || t.line === levelLine || (!scoresOnly && levelCols.size > 0 && filledLevels === levelCols.size);
    if (startsRow || !current) {
      flush();
      current = cells.map((c) => [c]);
    } else {
      cells.forEach((c, ci) => current![ci]!.push(c));
    }
  }
  flush();

  // Drop columns that are empty in every row.
  const nCols = gutters.length + 1;
  const keep = Array.from({ length: nCols }, (_, c) => rows.some((r) => r[c])).map((k, c) => (k ? c : -1)).filter((c) => c >= 0);
  const trimmed = rows.map((r) => keep.map((c) => r[c] ?? ''));

  const before = all.slice(0, start).map((t) => cleanText(t.line.text)).filter(Boolean);
  const after = all.slice(end).map((t) => cleanText(t.line.text)).filter(Boolean);
  return { before, rows: trimmed, after };
}
