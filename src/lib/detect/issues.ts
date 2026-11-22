import type {
  BriefLine,
  DetectedCover,
  DetectedRubric,
  FormatRules,
  Heading,
  Issue,
  Sourced,
  SourceRef,
} from '../types';
import { BULLET_RE } from './patterns';

const src = (l: BriefLine): SourceRef => ({ index: l.index, line: l.text, ...(l.page ? { page: l.page } : {}) });

const ROMAN_ITEM_RE = /^([ivx]{1,5}|[a-h]|\d{1,2})[.)]\s+(.+)$/i;
const DOC_LIKE_RE = /\b(table|reflection|appendix|appendices|log ?book|form|declaration|minutes|journal)\b/i;

/**
 * Report sections a brief asks for in its DELIVERABLES list, e.g. the "o Problem Selection"
 * items under "iii. Report", plus document-like deliverables such as "Group Contribution Table".
 */
export function detectDeliverables(lines: BriefLine[]): Sourced<string>[] {
  const out: Sourced<string>[] = [];
  const usable = lines.filter((l) => !l.repeated);
  const start = usable.findIndex((l) => /^deliverables?\b/i.test(l.text));
  if (start < 0) return out;
  let underReport = false;
  for (let i = start + 1; i < usable.length; i++) {
    const l = usable[i]!;
    const t = l.text;
    // Stop at the next brief section (ALL CAPS bold title).
    if (l.bold && /^[^a-z]{4,}$/.test(t) && !ROMAN_ITEM_RE.test(t)) break;
    const item = t.match(ROMAN_ITEM_RE);
    if (item && !BULLET_RE.test(t)) {
      const name = item[2]!.replace(/\s*\(.*?\)\s*/g, ' ').trim();
      underReport = /\breport\b/i.test(name);
      if (!underReport && DOC_LIKE_RE.test(name) && name.split(/\s+/).length <= 6) out.push({ value: name, source: src(l) });
      continue;
    }
    if (underReport && BULLET_RE.test(t)) {
      const name = t.replace(BULLET_RE, '').trim();
      if (name && name.split(/\s+/).length <= 6 && !/^\d/.test(name)) out.push({ value: name, source: src(l) });
    }
  }
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = d.value.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const GENERIC = new Set(['analysis', 'design', 'model', 'section', 'report', 'part', 'task', 'chapter', 'and', 'the', 'for', 'with', 'from']);

function tokens(s: string): string[] {
  return s
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w.toLowerCase()))
    .map((w) => w.toLowerCase().slice(0, 5));
}

/** Does any heading cover this deliverable? Matches word stems and acronyms (NLP ↔ Natural Language Processing). */
export function deliverableCovered(deliverable: string, headings: Heading[]): boolean {
  const dTokens = tokens(deliverable);
  const acronyms = deliverable.match(/\b[A-Z]{2,5}\b/g) ?? [];
  return headings.some((h) => {
    const hTokens = new Set(tokens(h.text));
    if (dTokens.some((t) => hTokens.has(t))) return true;
    const words = h.text.split(/[\s&,:()-]+/).filter((w) => /^[A-Za-z]/.test(w) && w.length > 2);
    const initials = words.map((w) => w[0]!.toUpperCase()).join('');
    return acronyms.some((a) => initials.includes(a) || h.text.toUpperCase().includes(a));
  });
}

export interface IssueInput {
  headings: Heading[];
  format: FormatRules;
  cover: DetectedCover;
  rubric: DetectedRubric;
  deliverables: Sourced<string>[];
  /** Current template choices (from the UI); defaults reflect the generator defaults. */
  template?: {
    coverColourHex?: string;
    onePartPerPage?: boolean;
    includeRubric?: boolean;
    /** Pages the rubric will take in the template (from the rubric file); defaults to the detected count or 1. */
    rubricPages?: number;
  };
  /** "Today" (injectable for tests). */
  now?: Date;
}

/** Rough page count of the generated template: cover + TOC + one page per H1 + rubric. */
export function estimatePages(input: IssueInput): number {
  const t = input.template ?? {};
  const h1 = input.headings.filter((h) => h.level === 1).length;
  const body = t.onePartPerPage === false ? Math.max(1, Math.ceil(h1 / 3)) : h1;
  const rubric = t.includeRubric === false ? 0 : (t.rubricPages ?? (input.rubric.found ? Math.max(1, input.rubric.pages.length) : 0));
  return 1 + 1 + body + rubric;
}

export function detectIssues(input: IssueInput): Issue[] {
  const issues: Issue[] = [];
  const { cover, format } = input;
  const now = input.now ?? new Date();

  // 1. Group vs individual mismatch between the brief's cover sheet and its instructions.
  const coverType = cover.coverGroupType?.value;
  const bodyType = cover.groupType.value;
  if (coverType && bodyType !== 'unknown' && coverType !== bodyType) {
    const size = cover.groupSize ? ` (${cover.groupSize.min === cover.groupSize.max ? cover.groupSize.min : `${cover.groupSize.min}–${cover.groupSize.max}`} students)` : '';
    issues.push({
      id: 'group-mismatch',
      severity: 'warning',
      message: `The brief's cover sheet says "${coverType} assignment", but the instructions say it is a ${bodyType} assignment${size}.`,
      fix: bodyType === 'group' ? 'The template uses a group member table. Check with your lecturer if unsure.' : 'Set member rows to 1 for an individual submission.',
      ...(cover.coverGroupType?.source ? { source: cover.coverGroupType.source } : {}),
    });
  }

  // 2. Due date in the past.
  if (format.dueDate) {
    const due = new Date(`${format.dueDate.value}T23:59:59`);
    if (due.getTime() < now.getTime()) {
      issues.push({
        id: 'due-past',
        severity: 'warning',
        message: `The due date in the brief (${format.dueDate.value}) has already passed.`,
        fix: 'Make sure this is the current brief and not last semester’s.',
        ...(format.dueDate.source ? { source: format.dueDate.source } : {}),
      });
    }
  }

  // 3. Brief requires a coloured cover but the template cover is white.
  if (format.coverColour && format.coverColour.value.hex !== 'FFFFFF') {
    const chosen = input.template?.coverColourHex;
    if (!chosen || chosen.toUpperCase() === 'FFFFFF') {
      issues.push({
        id: 'cover-colour',
        severity: 'warning',
        message: `The brief says the cover must be ${format.coverColour.value.name}, but the template cover is white.`,
        fix: `Turn on the cover colour (${format.coverColour.value.name}) in Format & cover, or print the cover on coloured paper.`,
        ...(format.coverColour.source ? { source: format.coverColour.source } : {}),
      });
    }
  }

  // 4. Page limit.
  if (format.maxPages) {
    const pages = estimatePages(input);
    if (pages > format.maxPages.value) {
      issues.push({
        id: 'page-limit',
        severity: 'warning',
        message: `The empty template already has about ${pages} pages, over the ${format.maxPages.value}-page limit.`,
        fix: 'Turn off "one part per page", or check whether the cover, contents and rubric count toward the limit.',
        ...(format.maxPages.source ? { source: format.maxPages.source } : {}),
      });
    } else {
      issues.push({
        id: 'page-limit-info',
        severity: 'info',
        message: `Page limit: ${format.maxPages.value} pages. The empty template has about ${pages}.`,
        ...(format.maxPages.source ? { source: format.maxPages.source } : {}),
      });
    }
  }

  // 5. Deliverables with no matching heading.
  const missing = input.deliverables.filter((d) => !deliverableCovered(d.value, input.headings));
  if (missing.length) {
    issues.push({
      id: 'deliverables-missing',
      severity: 'warning',
      message: `The brief lists deliverables with no matching heading: ${missing.map((d) => d.value).join(', ')}.`,
      fix: 'Add a heading for each one in the Structure step if it belongs in the report.',
      ...(missing[0]?.source ? { source: missing[0].source } : {}),
    });
  }

  // 6. Low-confidence headings to review.
  const low = input.headings.filter((h) => h.origin === 'detected' && h.confidence < 0.6);
  if (low.length) {
    issues.push({
      id: 'low-confidence',
      severity: 'info',
      message: `${low.length} heading${low.length > 1 ? 's were' : ' was'} detected with low confidence: ${low.map((h) => `"${h.text}"`).join(', ')}.`,
      fix: 'Check them in the Structure step.',
    });
  }

  if (input.headings.length === 0) {
    issues.push({
      id: 'no-headings',
      severity: 'warning',
      message: 'No report headings were found in the brief.',
      fix: 'Add your headings in the Structure step.',
    });
  }

  return issues;
}
