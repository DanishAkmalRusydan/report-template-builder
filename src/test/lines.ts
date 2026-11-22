import type { BriefLine } from '../lib/types';

/**
 * Build BriefLine[] from short strings for synthetic tests.
 *   "**Bold line"   → bold
 *   "|0|cell text"  → inside a table, column 0
 *   "@3 text"       → on PDF page 3
 */
export function lines(...texts: string[]): BriefLine[] {
  return texts.map((raw, index) => {
    let t = raw;
    let page: number | undefined;
    let tableCol: number | undefined;
    const pm = t.match(/^@(\d+)\s+/);
    if (pm) {
      page = Number(pm[1]);
      t = t.slice(pm[0].length);
    }
    const tm = t.match(/^\|(\d)\|/);
    if (tm) {
      tableCol = Number(tm[1]);
      t = t.slice(tm[0].length);
    }
    const bold = t.startsWith('**');
    if (bold) t = t.slice(2);
    return {
      index,
      text: t,
      bold,
      inTable: tableCol !== undefined,
      ...(tableCol !== undefined ? { tableCol } : {}),
      ...(page !== undefined ? { page } : {}),
    };
  });
}
