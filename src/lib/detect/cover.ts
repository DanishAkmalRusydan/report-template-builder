import type { BriefLine, CoverField, DetectedCover, GroupType, PageSize, Sourced, SourceRef } from '../types';

const src = (l: BriefLine): SourceRef => ({ index: l.index, line: l.text, ...(l.page ? { page: l.page } : {}) });
const sourced = <T>(value: T, l: BriefLine): Sourced<T> => ({ value, source: src(l) });

/** "CIT22803", "CAI20103", "BIT 1234", "MPU2233U3" */
export const SUBJECT_CODE_RE = /\b([A-Z]{2,4}\s?\d{4,5}(?:[A-Z]\d?)?)\b/;

const COVER_LABELS = [
  /received date/i,
  /submission date/i,
  /lecturer/i,
  /weightage/i,
  /semester/i,
  /student id|matric/i,
  /cover (sheet|page)/i,
  /\bname\b/i,
  /total\b|marks/i,
  /programme|program\b/i,
];

function coverScore(lines: BriefLine[]): number {
  const text = lines.map((l) => l.text).join('\n');
  const labels = COVER_LABELS.filter((re) => re.test(text)).length;
  const fields = lines.filter((l) => /^[A-Za-z’' ]{3,30}\s*:\s*/.test(l.text)).length;
  return labels + Math.min(3, Math.floor(fields / 2));
}

/** A real cover sheet has many label fields and few prose lines. */
function findCoverPages(lines: BriefLine[], pageSizes: PageSize[], excludePages: Set<number>): number[] {
  const pages: number[] = [];
  for (const p of pageSizes) {
    if (excludePages.has(p.page)) continue;
    const pl = lines.filter((l) => l.page === p.page && !l.repeated);
    if (pl.length === 0 || pl.length > 40) continue;
    const prose = pl.filter((l) => l.text.split(/\s+/).length > 14).length;
    const explicit = pl.some((l) => /cover sheet|this cover|attach it to your assignment/i.test(l.text));
    if ((coverScore(pl) >= 6 && prose <= 3) || (explicit && coverScore(pl) >= 4)) pages.push(p.page);
  }
  return pages;
}

function groupTypeOf(lines: BriefLine[]): { type: Sourced<GroupType>; size?: { min: number; max: number } } {
  for (const l of lines) {
    const m = l.text.match(/group(?:s)?\s+of\s+(\d+)\s*(?:–|-|to|—)\s*(\d+)/i) ?? l.text.match(/(\d+)\s*(?:–|-|to)\s*(\d+)\s+(?:students|members)\s+per\s+group/i);
    if (m) return { type: sourced<GroupType>('group', l), size: { min: Number(m[1]), max: Number(m[2]) } };
    const single = l.text.match(/group\s+of\s+(\d+)\b/i);
    if (single) {
      const n = Number(single[1]);
      return { type: sourced<GroupType>('group', l), size: { min: n, max: n } };
    }
  }
  const individual = lines.find((l) => /\b(an?\s+)?individual\s+(assignment|work|project|task|submission)\b|\bindividually\b/i.test(l.text));
  if (individual) return { type: sourced<GroupType>('individual', individual) };
  const group = lines.find((l) => /\bgroup\s+(assignment|project|work|members?)\b|\bin groups\b/i.test(l.text));
  if (group) return { type: sourced<GroupType>('group', group) };
  return { type: { value: 'unknown' } };
}

const stripTrailingDot = (s: string) => s.replace(/\.\s*$/, '').trim();

export function detectCover(
  lines: BriefLine[],
  pageSizes: PageSize[] = [],
  opts: { excludePages?: number[] } = {},
): DetectedCover {
  const exclude = new Set(opts.excludePages ?? []);
  const coverPages = findCoverPages(lines, pageSizes, exclude);
  const coverSet = new Set(coverPages);
  const onCover = (l: BriefLine) => l.page !== undefined && coverSet.has(l.page);
  const body = lines.filter((l) => !onCover(l) && !(l.page !== undefined && exclude.has(l.page)));
  const coverLines = lines.filter(onCover);

  const result: DetectedCover = {
    groupType: { value: 'unknown' },
    briefHasCover: coverPages.length > 0,
    coverFields: [],
    ...(coverPages.length ? { coverPages } : {}),
  };

  // Subject code + name: prefer a line that is "CODE NAME".
  for (const l of lines) {
    const m = l.text.match(SUBJECT_CODE_RE);
    if (!m?.[1]) continue;
    result.subjectCode ??= sourced(m[1].replace(/\s/g, ''), l);
    const after = l.text
      .slice((m.index ?? 0) + m[1].length)
      .replace(/^[\s:–—-]+/, '')
      .replace(/^\(|\)$/g, '')
      .trim();
    if (after && after.split(/\s+/).length <= 8 && /^[A-Za-z]/.test(after) && !/[.:;]$/.test(after)) {
      result.subjectName = sourced(after, l);
      break;
    }
  }
  // "COURSE CODE CAI20103 Intelligent Systems" / "Subject: Intelligent Systems"
  if (!result.subjectName) {
    const l = lines.find((x) => /^(subject|course)\s*(name|title)?\s*:/i.test(x.text));
    const v = l?.text.replace(/^(subject|course)\s*(name|title)?\s*:\s*/i, '').trim();
    if (l && v) result.subjectName = sourced(v, l);
  }

  // Assignment name: an early "Assignment 2: …" / "ASSIGNMENT (Lab 2)" / "Lab Report 1" line.
  const early = body.filter((l) => !l.repeated).slice(0, 20);
  const nameLine = early.find((l) => /^(assignment|lab(oratory)?|project|coursework|case study|mini project|individual assignment|group assignment)\b/i.test(l.text) && l.text.split(/\s+/).length <= 12 && !/^assignment title/i.test(l.text) && !/^assignment\s*\(\d+\s*%\)$/i.test(l.text));
  if (nameLine) result.assignmentName = sourced(stripTrailingDot(nameLine.text), nameLine);

  // Assignment title: "Assignment Title: …", "Project Title: …", "Title: …", or the line after a "TITLE" heading.
  const titleLine = body.find((l) => /^(assignment|project|report)?\s*title\s*:\s*\S/i.test(l.text));
  if (titleLine) {
    result.assignmentTitle = sourced(stripTrailingDot(titleLine.text.replace(/^(assignment|project|report)?\s*title\s*:\s*/i, '')), titleLine);
  } else {
    const idx = body.findIndex((l) => /^title$/i.test(l.text));
    const next = idx >= 0 ? body[idx + 1] : undefined;
    if (next) result.assignmentTitle = sourced(stripTrailingDot(next.text), next);
  }

  // Lecturer, weightage, semester – check the cover sheet first, then the body.
  const ordered = [...coverLines, ...body];
  for (const l of ordered) {
    const m = l.text.match(/^lecturer[’']?s?\s*(name)?\s*:\s*(.{3,})$/i) ?? l.text.match(/^(prepared for|submitted to)\s*:\s*(.{3,})$/i);
    if (m?.[2]) {
      result.lecturer = sourced(m[2].trim(), l);
      break;
    }
  }
  for (const l of ordered) {
    const m = l.text.match(/weightage\s*:?\s*(\d{1,3}\s*%)/i) ?? l.text.match(/^assignment\s*\((\d{1,3}\s*%)\)/i);
    if (m?.[1]) {
      result.weightage = sourced(m[1].replace(/\s/g, ''), l);
      break;
    }
  }
  for (const l of ordered) {
    const m = l.text.match(/^semester\s*:?\s*(.{3,})$/i) ?? l.text.match(/\b((?:jan(?:uary)?|feb|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov|dec)\s+20\d{2})\s+semester\b/i);
    if (m?.[1]) {
      result.semester = sourced(m[1].trim(), l);
      break;
    }
  }

  // Cover sheet label/value fields, kept in order (used to rebuild the brief's own cover).
  const fields: CoverField[] = [];
  for (const l of coverLines) {
    if (l.repeated) continue;
    const m = l.text.match(/^([A-Za-z’' ]{3,30}?)\s*:\s*(.*)$/);
    if (m?.[1] && !/instructions/i.test(m[1])) fields.push({ label: m[1].trim(), value: (m[2] ?? '').trim() });
  }
  result.coverFields = fields;

  const g = groupTypeOf(body);
  result.groupType = g.type;
  if (g.size) result.groupSize = g.size;
  if (coverLines.length) {
    const cg = groupTypeOf(coverLines);
    if (cg.type.value !== 'unknown') result.coverGroupType = cg.type;
  }
  return result;
}
