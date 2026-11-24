import type { BriefLine, ParsedBrief, RubricLayout } from './types';
import { extractBrief, type ExtractedBrief } from './extract';
import { cleanText } from './text';
import { extractPageImages, extractPdf, type PdfjsLike } from './extract/pdf';
import { markRepeated, pdfToLines } from './extract';
import { buildCoverLayout, coverImages } from './detect/coverLayout';
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
  const brief = detectAll(fileName, ex, opts);
  await addCoverLayout(brief, ex, data, opts.pdfjs);
  return brief;
}

/** Copy the brief's own cover sheet page (PDF) so the template can reuse it as it is. */
async function addCoverLayout(brief: ParsedBrief, ex: ExtractedBrief, data: ArrayBuffer | Uint8Array, pdfjs?: PdfjsLike): Promise<void> {
  const n = brief.cover.coverPages?.[0];
  const page = n !== undefined ? ex.pdf?.pages.find((p) => p.page === n) : undefined;
  if (!page || !ex.pdf) return;
  try {
    const others = ex.pdf.pages.filter((p) => p !== page);
    const wanted = coverImages(page, others);
    let urls = new Map<string, string>();
    if (wanted.length) {
      try {
        urls = (await extractPageImages(data, new Map([[page.page, wanted]]), pdfjs)).get(page.page) ?? urls;
      } catch {
        // Images are a nice-to-have; copy the rest of the cover without them.
      }
    }
    const layout = buildCoverLayout({ page, otherPages: others, repeated: ex.repeated ?? new Set(), imageUrls: urls });
    if (layout && layout.blocks.length) brief.cover.layout = layout;
  } catch {
    // Fall back to rebuilding the cover from its fields.
  }
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

export interface ParsedRubricPdf extends RubricLayout {
  /** Rubric pages in the file. */
  pages: number[];
  landscape: boolean;
  pageCount: number;
}

/** Read a rubric given as its own PDF and rebuild its table. */
export async function parseRubricPdf(data: ArrayBuffer | Uint8Array, opts: { pdfjs?: PdfjsLike } = {}): Promise<ParsedRubricPdf> {
  const pdf = await extractPdf(data, opts.pdfjs);
  if (pdf.noTextLayer) throw new Error('This rubric PDF has no text layer (it is probably a scan). Add the rubric as a .docx instead.');
  const lines = pdfToLines(pdf);
  const found = detectRubric(lines, pdf.pageSizes);
  // The whole file is the rubric when no page stands out.
  const pages = found.found ? found.pages : pdf.pages.map((p) => p.page);
  const layout = rubricLayoutFromPdf(pdf.pages, pages, markRepeated(pdf));
  if (!layout || layout.rows.length === 0)
    throw new Error('The table in this rubric PDF could not be read. Add the rubric as a .docx instead.');
  const landscape = pages.every((n) => pdf.pageSizes.find((s) => s.page === n)?.landscape);
  return { ...layout, pages, landscape, pageCount: pages.length };
}
