import {
  AlignmentType,
  BorderStyle,
  HeightRule,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableCellBorders,
} from 'docx';
import type { CoverPage, PaperSize } from '../types';
import { STYLE_IDS } from './styles';
import { MARGIN, PAPER, splitWidth } from './units';

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const ALL: ITableCellBorders = { top: border, bottom: border, left: border, right: border };
const NONE: ITableCellBorders = { top: none, bottom: none, left: none, right: none };

const para = (text: string, style: string = STYLE_IDS.coverText, opts: { bold?: boolean; italics?: boolean; before?: number } = {}) =>
  new Paragraph({
    style,
    ...(opts.before ? { spacing: { before: opts.before } } : {}),
    children: [new TextRun({ text, ...(opts.bold ? { bold: true } : {}), ...(opts.italics ? { italics: true } : {}) })],
  });

const spacer = (twips: number) => new Paragraph({ style: STYLE_IDS.coverText, spacing: { before: twips, after: 0 }, children: [] });

function cell(text: string, width: number, opts: { bold?: boolean; height?: number; header?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: ALL,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...(opts.header ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } } : {}),
    children: [
      new Paragraph({
        style: STYLE_IDS.tableText,
        alignment: AlignmentType.CENTER,
        children: text ? [new TextRun({ text, ...(opts.bold ? { bold: true } : {}) })] : [],
      }),
    ],
  });
}

/** Group member table: (Picture |) Name | Student ID, with empty rows for the students to fill. */
export function memberTable(cover: CoverPage, width: number, rowHeight = cover.showPictureColumn ? 1700 : 500): Table {
  const headers = [...(cover.showPictureColumn ? ['Picture'] : []), 'Name', 'Student ID'];
  const cols = splitWidth(width, cover.showPictureColumn ? [2, 5, 3] : [6, 4]);
  const rows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => cell(h, cols[i]!, { bold: true, header: true })),
    }),
    ...Array.from(
      { length: Math.max(1, Math.min(8, cover.memberRows)) },
      () =>
        new TableRow({
          height: { value: rowHeight, rule: HeightRule.ATLEAST },
          cantSplit: true,
          children: headers.map((_, i) => cell('', cols[i]!)),
        }),
    ),
  ];
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    rows,
  });
}

/** Label | value table used to rebuild a brief's own cover sheet fields. */
function fieldTable(fields: { label: string; value: string }[], width: number): Table {
  const cols = splitWidth(width, [4, 6]);
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    rows: fields.map(
      (f) =>
        new TableRow({
          height: { value: 440, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({
              width: { size: cols[0]!, type: WidthType.DXA },
              borders: ALL,
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ style: STYLE_IDS.tableText, children: [new TextRun({ text: f.label, bold: true })] })],
            }),
            new TableCell({
              width: { size: cols[1]!, type: WidthType.DXA },
              borders: ALL,
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [new Paragraph({ style: STYLE_IDS.tableText, children: f.value ? [new TextRun(f.value)] : [] })],
            }),
          ],
        }),
    ),
  });
}

function dataUrlBytes(dataUrl: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = dataUrl.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!m) return null;
  const bin = atob(m[2]!);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const t = m[1]!.toLowerCase();
  return { data, type: t === 'jpeg' ? 'jpg' : (t as 'png' | 'jpg' | 'gif' | 'bmp') };
}

function logoParagraph(cover: CoverPage): Paragraph | null {
  if (!cover.logo) return null;
  const img = dataUrlBytes(cover.logo.dataUrl);
  if (!img) return null;
  // Fit within 2.2" x 1.2".
  const maxW = 210;
  const maxH = 115;
  const scale = Math.min(maxW / cover.logo.widthPx, maxH / cover.logo.heightPx, 1);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new ImageRun({
        type: img.type,
        data: img.data,
        transformation: { width: Math.round(cover.logo.widthPx * scale), height: Math.round(cover.logo.heightPx * scale) },
      }),
    ],
  });
}

/**
 * Cover content, either generated or rebuilt from the brief's own cover fields.
 * `available` is the vertical space (twips) for the content; picture rows shrink to fit it.
 */
function coverContent(cover: CoverPage, width: number, available: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let used = 0;
  // Rough line-height estimates (12pt text, 16pt titles) – good enough to size the member rows.
  const charsPerLine = Math.max(30, Math.floor(width / 120));
  const lines = (s: string) => Math.max(1, Math.ceil(s.length / charsPerLine));
  const push = (p: Paragraph | Table, h: number) => {
    out.push(p);
    used += h;
  };
  const title = (s: string) => push(para(s, STYLE_IDS.coverTitle), lines(s) * 400 + 120);
  const text = (s: string, o: { bold?: boolean; italics?: boolean; before?: number } = {}) =>
    push(para(s, STYLE_IDS.coverText, o), lines(s) * 290 + 80 + (o.before ?? 0));
  const gap = (h: number) => push(spacer(h), h + 20);

  const logo = logoParagraph(cover);
  if (logo) push(logo, 115 * 15 + 240);
  if (cover.universityName) title(cover.universityName);
  gap(cover.mode === 'from-brief' ? 240 : 480);
  const subject = [cover.subjectCode, cover.subjectName].filter(Boolean).join(' ');
  if (cover.mode === 'from-brief') {
    if (cover.subjectName) title(cover.subjectName);
    if (cover.subjectCode) text(`(${cover.subjectCode})`, { bold: true });
    if (cover.assignmentName) text(cover.assignmentName, { bold: true, before: 120 });
    if (cover.assignmentTitle) text(cover.assignmentTitle, { italics: true, before: 120 });
    gap(240);
    const fields = cover.briefFields.length
      ? cover.briefFields
      : [
          { label: 'Lecturer’s Name', value: cover.lecturer },
          ...(cover.weightage ? [{ label: 'Weightage', value: cover.weightage }] : []),
          ...(cover.semester ? [{ label: 'Semester', value: cover.semester }] : []),
        ];
    push(fieldTable(fields, width), fields.length * 460);
    gap(360);
  } else {
    if (subject) title(subject);
    if (cover.assignmentName) text(cover.assignmentName, { bold: true, before: 120 });
    if (cover.assignmentTitle) text(cover.assignmentTitle, { italics: true, before: 240 });
    gap(480);
    if (cover.lecturer) text(`Lecturer: ${cover.lecturer}`);
    if (cover.semester) text(`Semester: ${cover.semester}`);
    gap(480);
  }
  const rows = Math.max(1, Math.min(8, cover.memberRows));
  const max = cover.showPictureColumn ? 1700 : 500;
  const min = cover.showPictureColumn ? 700 : 400;
  const fit = Math.floor((available - used - 520) / rows);
  out.push(memberTable(cover, width, Math.max(min, Math.min(max, fit))));
  return out;
}

/**
 * The cover section's children. With a colour, the cover is one full-bleed shaded table cell
 * (the section has zero margins) so only the cover page is coloured.
 */
export function buildCover(cover: CoverPage, paper: PaperSize, colourHex?: string): { children: (Paragraph | Table)[]; fullBleed: boolean } {
  const page = PAPER[paper];
  if (!colourHex || colourHex.toUpperCase() === 'FFFFFF') {
    return { children: coverContent(cover, page.width - 2 * MARGIN, page.height - 2 * MARGIN - 300), fullBleed: false };
  }
  const inner = page.width - 2 * MARGIN;
  const table = new Table({
    width: { size: page.width, type: WidthType.DXA },
    columnWidths: [page.width],
    layout: TableLayoutType.FIXED,
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({
        // Leave room for the section's mandatory final paragraph so it doesn't spill onto page 2.
        height: { value: page.height - 200, rule: HeightRule.EXACT },
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: page.width, type: WidthType.DXA },
            borders: NONE,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: colourHex.toUpperCase() },
            // Word adds vertical cell margins on top of an exact row height, so pad the top with a spacer instead.
            margins: { top: 0, bottom: 0, left: MARGIN, right: MARGIN },
            children: [spacer(MARGIN), ...coverContent(cover, inner, page.height - 200 - 2 * MARGIN)],
          }),
        ],
      }),
    ],
  });
  return {
    // The section's final paragraph: 1pt, exact line height, hidden paragraph mark, so it takes no space.
    children: [
      table,
      new Paragraph({
        spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' },
        run: { size: 2, vanish: true },
        children: [new TextRun({ text: '', size: 2, vanish: true })],
      }),
    ],
    fullBleed: true,
  };
}
