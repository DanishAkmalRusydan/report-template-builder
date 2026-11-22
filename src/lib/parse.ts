import type { BriefLine, ParsedBrief } from './types';
import { extractBrief, type ExtractedBrief } from './extract';
import { cleanText } from './text';
import type { PdfjsLike } from './extract/pdf';
import { detectHeadings } from './detect/headings';
import { detectFormat } from './detect/format';
import { detectCover } from './detect/cover';
import { detectRubric, scorePage } from './detect/rubric';
import { rubricLayoutFromDocxLines, rubricLayoutFromPdf } from './detect/rubricTable';
import { detectDeliverables, detectIssues } from './detect/issues';

export class NoTextLayerError extends Error {
  constructor() {
    super('This PDF has no text layer. Paste the brief text instead.');
    this.name = 'NoTextLayerError';
  }
}

export interface ParseOptions {
  pdfjs?: PdfjsLike;
  now?: Date;
}

/** Full pipeline: extract → detect → ParsedBrief. Pure, so it can run in a Web Worker. */
export async function parseBrief(fileName: string, data: ArrayBuffer | Uint8Array, opts: ParseOptions = {}): Promise<ParsedBrief> {
  const ex = await extractBrief(fileName, data, opts.pdfjs ? { pdfjs: opts.pdfjs } : {});
  if (ex.noTextLayer) throw new NoTextLayerError();
  return detectAll(fileName, ex, opts);
}

/** Parse brief text pasted by the user (e.g. from a scanned PDF they ran through OCR). */
export function parseBriefText(text: string, opts: ParseOptions = {}): ParsedBrief {
  const lines: BriefLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const t = cleanText(raw.replace(/^\*\*(.*)\*\*$/, '$1'));
    if (t) lines.push({ index: lines.length, text: t, bold: false, inTable: false });
  }
  if (lines.length === 0) throw new Error('The pasted text is empty.');
  return detectAll('Pasted brief', { kind: 'text', lines, pageSizes: [], noTextLayer: false }, opts);
}

function detectAll(fileName: string, ex: ExtractedBrief, opts: ParseOptions): ParsedBrief {
  const rubric = detectRubric(ex.lines, ex.pageSizes);
  if (rubric.found && ex.pdf) {
    const layout = rubricLayoutFromPdf(ex.pdf.pages, rubric.pages, ex.repeated);
    if (layout) rubric.layout = layout;
  } else if (ex.kind === 'docx') {
    const layout = rubricLayoutFromDocxLines(ex.lines, scorePage);
    if (layout) {
      rubric.found = true;
      rubric.layout = layout;
      // Wide rubric tables (5+ columns) read better in landscape.
      rubric.landscape = (layout.rows[0]?.length ?? 0) >= 5;
    }
  }
  const cover = detectCover(ex.lines, ex.pageSizes, { excludePages: rubric.pages });
  const excludePages = [...rubric.pages, ...(cover.coverPages ?? [])];
  const { headings, wantsReferences } = detectHeadings(ex.lines, { excludePages });
  const format = detectFormat(ex.lines.filter((l) => l.page === undefined || !rubric.pages.includes(l.page)));
  const deliverables = detectDeliverables(ex.lines);
  const issues = detectIssues({ headings, format, cover, rubric, deliverables, ...(opts.now ? { now: opts.now } : {}) });
  return {
    fileName,
    kind: ex.kind,
    lines: ex.lines,
    pageSizes: ex.pageSizes,
    headings,
    format,
    cover,
    rubric,
    wantsReferences,
    deliverables,
    issues,
  };
}
