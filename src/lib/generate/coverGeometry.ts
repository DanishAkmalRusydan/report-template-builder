// Pure geometry for copied covers (no docx import, so the live preview can use it cheaply).
import type { CoverLayout, CoverPage } from '../types';
import { MARGIN } from './units';

export interface CoverMargins {
  top: number;
  bottom: number;
  side: number;
}

/** Height of the copied content, in points. */
export function layoutHeight(l: CoverLayout): number {
  if (l.blocks.length === 0) return 0;
  return Math.max(...l.blocks.map((b) => b.bottom)) - l.blocks[0]!.top;
}

/** Side margin (twips) matching the copied page's own margins, within 0.5"–1". */
export function layoutMargin(l: CoverLayout): number {
  return Math.round(Math.min(MARGIN, Math.max(720, l.left * 20)));
}

/** Margins for the cover page: the copied page's own margins, or the default 1". */
export function coverMargins(cover: CoverPage): CoverMargins {
  const l = cover.mode === 'from-brief' ? cover.briefLayout : undefined;
  if (!l?.blocks.length) return { top: MARGIN, bottom: MARGIN, side: MARGIN };
  return { top: Math.round(Math.min(MARGIN, Math.max(720, l.blocks[0]!.top * 20))), bottom: 720, side: layoutMargin(l) };
}
