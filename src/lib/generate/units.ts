import type { PaperSize } from '../types';

/** Twentieths of a point. 1 inch = 1440 DXA. */
export const INCH = 1440;
export const MARGIN = INCH;

export const PAPER: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
};

/** Usable text width for a portrait page with 1-inch margins. */
export const textWidth = (paper: PaperSize) => PAPER[paper].width - 2 * MARGIN;

/** Word line spacing in 240ths of a line (lineRule "auto"). */
export const lineValue = (spacing: number) => Math.round(spacing * 240);

/** Font size in half-points. */
export const halfPoints = (pt: number) => Math.round(pt * 2);

/** Split a width into integer DXA columns from relative weights, summing exactly to total. */
export function splitWidth(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.floor((total * w) / sum));
  const diff = total - cols.reduce((a, b) => a + b, 0);
  cols[cols.length - 1]! += diff;
  return cols;
}
