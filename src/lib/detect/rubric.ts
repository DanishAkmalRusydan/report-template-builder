import type { BriefLine, DetectedRubric, PageSize } from '../types';

const STRONG = [/\brubrics?\b/i, /levels? of achievements?/i];
const WEAK = [
  /\bexcellent\b/i,
  /\bnot attempted\b/i,
  /\bneeds? improvement\b/i,
  /\bcriteria\b/i,
  /\bdescriptors?\b/i,
  /\bweightage\b/i,
  /\(4\)\s*\(3\)\s*\(2\)\s*\(1\)/,
  /\bsatisfactory\b/i,
  /\bpoor\b/i,
];
const TAIL = /overall score|total score|evaluated by|comments\s*:|marks awarded/i;
/** Instructions like "Refer to the attached rubrics" must not count. */
const INSTRUCTION = /\b(refer|attach|attached|see|follow|guide)\b/i;

export function scorePage(lines: BriefLine[]): number {
  let score = 0;
  const joined = lines
    .filter((l) => !l.repeated && !INSTRUCTION.test(l.text))
    .map((l) => l.text)
    .join('\n');
  for (const re of STRONG) if (re.test(joined)) score += 2;
  for (const re of WEAK) if (re.test(joined)) score += 1;
  return score;
}

/** Find the rubric pages in a PDF brief (or rubric text in a .docx brief). */
export function detectRubric(lines: BriefLine[], pageSizes: PageSize[]): DetectedRubric {
  if (pageSizes.length === 0) {
    const score = scorePage(lines);
    return { found: score >= 4, pages: [], landscape: false, confidence: Math.min(1, score / 6) };
  }
  const byPage = new Map<number, BriefLine[]>();
  for (const l of lines) {
    if (l.page === undefined) continue;
    const arr = byPage.get(l.page) ?? [];
    arr.push(l);
    byPage.set(l.page, arr);
  }
  const scores = pageSizes.map((p) => ({ page: p.page, landscape: p.landscape, score: scorePage(byPage.get(p.page) ?? []) }));
  const pages: number[] = [];
  let best = 0;
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i]!;
    if (s.score >= 4) {
      pages.push(s.page);
      best = Math.max(best, s.score);
      continue;
    }
    // Continuation page: same orientation as the previous rubric page, with rubric rows or a score/sign-off block.
    const prev = scores[i - 1];
    if (prev && pages.includes(prev.page) && prev.landscape === s.landscape) {
      const text = (byPage.get(s.page) ?? []).map((l) => l.text).join('\n');
      if (s.score >= 1 || TAIL.test(text)) pages.push(s.page);
    }
  }
  if (pages.length === 0) return { found: false, pages: [], landscape: false, confidence: 0 };
  const landscape = pages.every((p) => pageSizes.find((s) => s.page === p)?.landscape);
  return { found: true, pages, landscape, confidence: Math.min(1, best / 6) };
}
