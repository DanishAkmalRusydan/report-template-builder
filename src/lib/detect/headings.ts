import type { BriefLine, Heading, SourceRef } from '../types';
import { isAllCaps, isTitleCase, makeId, textKey, wordCount } from '../text';
import {
  BULLET_RE,
  H1_PART_RE,
  H2_TASK_RE,
  HEADING_TRAILER_RE,
  IGNORE_SECTION_RE,
  NUMBERED_RE,
  REFERENCES_RE,
  STEP_RE,
} from './patterns';

export interface HeadingOptions {
  /** PDF pages to skip entirely (rubric pages, the brief's own cover sheet). */
  excludePages?: number[];
}

export interface HeadingResult {
  headings: Heading[];
  wantsReferences: boolean;
}

const src = (l: BriefLine): SourceRef => ({ index: l.index, line: l.text, ...(l.page ? { page: l.page } : {}) });

const endsWithSentencePunct = (s: string) => /[.;,!?]$/.test(s.trim());

/** A bold or ALL CAPS line that names a section of the brief (not a report heading). */
function isSectionTitle(l: BriefLine): boolean {
  const t = l.text;
  if (wordCount(t) > 8 || endsWithSentencePunct(t)) return false;
  if (BULLET_RE.test(t) || /^\d/.test(t)) return false;
  return (l.bold && (isAllCaps(t) || isTitleCase(t))) || (isAllCaps(t) && wordCount(t) >= 1 && t.length >= 4);
}

function nextContentLine(lines: BriefLine[], i: number): BriefLine | undefined {
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l && !l.repeated) return l;
  }
  return undefined;
}

function partHeading(l: BriefLine): { text: string; confidence: number } | null {
  const m = l.text.match(H1_PART_RE);
  if (!m) return null;
  const sep = m[3] ?? '';
  const rest = (m[4] ?? '').trim();
  if (wordCount(l.text) > 16) return null;
  // "Section 2 of the report should …" → not a heading.
  if (!sep && rest && !(isTitleCase(rest) || isAllCaps(rest))) return null;
  if (endsWithSentencePunct(rest) && !/\)$/.test(rest)) return null;
  let confidence = 0.8;
  if (l.bold) confidence += 0.15;
  if (isAllCaps(l.text)) confidence += 0.03;
  if (sep) confidence += 0.02;
  return { text: l.text, confidence: Math.min(1, confidence) };
}

function taskHeading(l: BriefLine): { text: string; confidence: number } | null {
  const m = l.text.match(H2_TASK_RE);
  if (!m) return null;
  const rest = (m[4] ?? '').trim();
  if (wordCount(l.text) > 14) return null;
  if (rest && endsWithSentencePunct(rest)) return null;
  if (!m[3] && rest && !isTitleCase(rest)) return null;
  return { text: l.text, confidence: l.bold ? 0.95 : 0.8 };
}

function numberedHeading(l: BriefLine): { text: string; confidence: number } | null {
  const m = l.text.match(NUMBERED_RE);
  if (!m) return null;
  const rest = (m[2] ?? '').trim();
  if (wordCount(rest) > 10 || endsWithSentencePunct(rest) || rest.includes(':')) return null;
  if (!isTitleCase(rest)) return null;
  let confidence = 0.6;
  if (l.inTable && l.tableCol === 0) confidence = 0.9;
  else if (l.bold) confidence = 0.8;
  return { text: l.text, confidence };
}

/**
 * Short Title Case label directly followed by a question, e.g.
 *   "Failure Scenario" / "What happens if Plan A cannot be executed?"
 * Only used inside a part. Low confidence so the UI asks for review.
 */
function labelBeforeQuestion(lines: BriefLine[], i: number): { text: string; confidence: number } | null {
  const l = lines[i];
  if (!l) return null;
  const t = l.text;
  if (wordCount(t) > 5 || wordCount(t) < 2 || endsWithSentencePunct(t) || t.includes(':')) return null;
  if (BULLET_RE.test(t) || !isTitleCase(t)) return null;
  // The question may wrap onto a second line.
  const next = nextContentLine(lines, i);
  if (!next) return null;
  const after = nextContentLine(lines, next.index);
  const question = next.text.endsWith('?') || (after !== undefined && !next.text.endsWith('.') && after.text.endsWith('?') && wordCount(after.text) <= 3);
  if (!question) return null;
  return { text: t, confidence: 0.55 };
}

export function detectHeadings(lines: BriefLine[], opts: HeadingOptions = {}): HeadingResult {
  const exclude = new Set(opts.excludePages ?? []);
  const usable = lines.filter((l) => !l.repeated && !(l.page !== undefined && exclude.has(l.page)));

  type Cand = { level: 1 | 2; text: string; confidence: number; line: BriefLine; kind: 'part' | 'task' | 'numbered' | 'label' };
  const cands: Cand[] = [];
  let ignoring = false;
  let inPart = false;
  let wantsReferences = false;

  for (let i = 0; i < usable.length; i++) {
    const l = usable[i];
    if (!l) continue;
    const t = l.text;

    if (REFERENCES_RE.test(t)) {
      wantsReferences = true;
      continue;
    }
    if (/\b(references|referencing|citations?|apa (style|format)|harvard (style|referencing))\b/i.test(t) && !/^refer\b/i.test(t)) {
      wantsReferences = true;
    }

    const part = partHeading(l);
    // Inside an ignored section (e.g. DOCUMENTATION FORMAT) only a bold or ALL CAPS part heading ends it.
    if (part && (!ignoring || l.bold || isAllCaps(t))) {
      ignoring = false;
      inPart = true;
      let text = part.text;
      const next = usable[i + 1];
      if (next && HEADING_TRAILER_RE.test(next.text)) {
        text = `${text} ${next.text}`;
        i += 1;
      }
      cands.push({ level: 1, text, confidence: part.confidence, line: l, kind: 'part' });
      continue;
    }

    if (isSectionTitle(l) && !taskHeading(l)) {
      if (IGNORE_SECTION_RE.test(t)) ignoring = true;
      else {
        ignoring = false;
        // A new top-level brief section (e.g. "SYSTEM PIPELINE") ends the current part.
        if (isAllCaps(t)) inPart = false;
      }
      continue;
    }

    if (ignoring) continue;
    if (STEP_RE.test(t) || BULLET_RE.test(t)) continue;

    const task = taskHeading(l);
    if (task) {
      cands.push({ level: 2, text: task.text, confidence: task.confidence, line: l, kind: 'task' });
      continue;
    }

    const num = numberedHeading(l);
    if (num) {
      cands.push({ level: 1, text: num.text, confidence: num.confidence, line: l, kind: 'numbered' });
      continue;
    }

    if (inPart) {
      const label = labelBeforeQuestion(usable, i);
      if (label) cands.push({ level: 2, text: label.text, confidence: label.confidence, line: l, kind: 'label' });
    }
  }

  // Numbered items are H1 only when they form a series (≥ 2); under PART headings they become H2.
  const numbered = cands.filter((c) => c.kind === 'numbered');
  const hasParts = cands.some((c) => c.kind === 'part');
  let filtered = cands.filter((c) => c.kind !== 'numbered' || numbered.length >= 2);
  if (hasParts) filtered = filtered.map((c) => (c.kind === 'numbered' ? { ...c, level: 2 as const } : c));
  // Without any H1, tasks become the top level.
  if (!filtered.some((c) => c.level === 1)) filtered = filtered.map((c) => ({ ...c, level: 1 as const }));
  // Drop leading H2s that have no H1 above them.
  const firstH1 = filtered.findIndex((c) => c.level === 1);
  filtered = filtered.filter((c, idx) => c.level === 1 || idx > firstH1);

  // De-duplicate, keeping the higher-confidence copy in its first position.
  const seen = new Map<string, number>();
  const out: Heading[] = [];
  for (const c of filtered) {
    const key = textKey(c.text);
    const prev = seen.get(key);
    if (prev !== undefined) {
      const existing = out[prev];
      if (existing && c.confidence > existing.confidence) out[prev] = { ...existing, confidence: c.confidence };
      continue;
    }
    seen.set(key, out.length);
    out.push({
      id: makeId('h'),
      level: c.level,
      text: c.text,
      confidence: Math.round(c.confidence * 100) / 100,
      source: src(c.line),
      origin: 'detected',
    });
  }

  if (wantsReferences && !out.some((h) => REFERENCES_RE.test(h.text))) {
    const refLine = usable.find((l) => REFERENCES_RE.test(l.text));
    out.push({
      id: makeId('h'),
      level: 1,
      text: 'References',
      confidence: refLine ? 0.9 : 0.7,
      ...(refLine ? { source: src(refLine) } : {}),
      origin: 'detected',
    });
  }

  return { headings: out, wantsReferences };
}
