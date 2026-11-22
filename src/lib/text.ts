/** Normalise whitespace and typographic oddities found in extracted brief text. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u2010\u2011\u2012]/g, '-') // hyphen variants, incl. non-breaking hyphen
    .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
    .replace(/\s+([,.;:)\]])/g, '$1') // "time ." → "time."
    .replace(/([([])\s+/g, '$1') // "( 40%" → "(40%"
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Case-insensitive, whitespace-insensitive key for de-duplication. */
export function textKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with', 'vs', 'via',
]);

/** True when most significant words start with a capital letter (or the line is all caps). */
export function isTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0) return false;
  const significant = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  if (significant.length === 0) return false;
  const capped = significant.filter((w) => /^[^A-Za-z]*[A-Z]/.test(w));
  return capped.length / significant.length >= 0.75;
}

export function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

let counter = 0;
/** Short unique id; deterministic prefix keeps snapshots readable. */
export function makeId(prefix = 'h'): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
