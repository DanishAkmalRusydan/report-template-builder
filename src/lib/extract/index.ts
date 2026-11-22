import type { BriefLine, PageSize } from '../types';
import { cleanText } from '../text';
import { extractDocx } from './docx';
import { extractPdf, type PdfExtract, type PdfjsLike } from './pdf';

export interface ExtractedBrief {
  kind: 'docx' | 'pdf' | 'text';
  lines: BriefLine[];
  pageSizes: PageSize[];
  noTextLayer: boolean;
  /** Raw PDF pages (fragments kept) for table rebuilding. */
  pdf?: PdfExtract;
  /** Running header/footer texts. */
  repeated?: Set<string>;
}

/** Running headers/footers: identical text on at least half the pages (and ≥ 3 pages). */
export function markRepeated(pdf: PdfExtract): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pdf.pages) {
    const seen = new Set(p.lines.map((l) => cleanText(l.text)));
    for (const t of seen) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const minPages = Math.max(3, Math.ceil(pdf.pages.length / 2));
  return new Set([...counts].filter(([, n]) => n >= minPages).map(([t]) => t));
}

export function pdfToLines(pdf: PdfExtract): BriefLine[] {
  const repeated = markRepeated(pdf);
  const lines: BriefLine[] = [];
  for (const p of pdf.pages) {
    for (const l of p.lines) {
      const text = cleanText(l.text);
      if (!text) continue;
      lines.push({
        index: lines.length,
        text,
        bold: l.bold,
        page: p.page,
        inTable: false,
        x: Math.round(l.x),
        fontSize: Math.round(l.size * 10) / 10,
        ...(repeated.has(text) ? { repeated: true } : {}),
      });
    }
  }
  return lines;
}

export async function extractBrief(
  fileName: string,
  data: ArrayBuffer | Uint8Array,
  opts: { pdfjs?: PdfjsLike } = {},
): Promise<ExtractedBrief> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) {
    const { paragraphs } = await extractDocx(data);
    const lines: BriefLine[] = [];
    for (const p of paragraphs) {
      const text = cleanText(p.text);
      if (!text) continue;
      lines.push({
        index: lines.length,
        text,
        bold: p.isBold,
        inTable: p.inTable,
        ...(p.tableCol !== undefined ? { tableCol: p.tableCol } : {}),
        ...(p.tableRow !== undefined ? { tableRow: p.tableRow, tableId: p.tableId } : {}),
        ...(p.styleName ? { styleName: p.styleName } : {}),
      });
    }
    return { kind: 'docx', lines, pageSizes: [], noTextLayer: lines.length === 0 };
  }
  if (lower.endsWith('.pdf')) {
    const pdf = await extractPdf(data, opts.pdfjs);
    return {
      kind: 'pdf',
      lines: pdfToLines(pdf),
      pageSizes: pdf.pageSizes,
      noTextLayer: pdf.noTextLayer,
      pdf,
      repeated: markRepeated(pdf),
    };
  }
  throw new Error('Unsupported file type. Upload a .docx or .pdf brief.');
}
