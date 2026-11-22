const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => n.toString().padStart(2, '0');

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Find the first date in free text. Handles "8TH NOVEMBER 2026", "1 December 2026",
 * "December 1, 2026", "01/12/2026" (day first, as used in Malaysian/UK briefs) and "2026-12-01".
 */
export function parseDate(text: string): string | undefined {
  const t = text.replace(/(\d)\s*(st|nd|rd|th)\b/gi, '$1');
  const monthRe = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  let m = t.match(new RegExp(`\\b(\\d{1,2})\\s+${monthRe},?\\s+(\\d{4})\\b`, 'i'));
  if (m) return iso(Number(m[3]), MONTHS[m[2]!.toLowerCase()]!, Number(m[1]));
  m = t.match(new RegExp(`\\b${monthRe}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'));
  if (m) return iso(Number(m[3]), MONTHS[m[1]!.toLowerCase()]!, Number(m[2]));
  m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return undefined;
}
