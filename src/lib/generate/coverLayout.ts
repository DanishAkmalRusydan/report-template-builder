/**
 * Render a copied cover sheet (CoverLayout) as Word content: each text line is a paragraph with
 * the same alignment, tabs, bold and size; rules are bottom borders; tables keep their column widths,
 * row heights and merged cells; images keep their size. Everything is scaled down to fit if needed.
 */
import {
  AlignmentType,
  BorderStyle,
  HeightRule,
  ImageRun,
  LineRuleType,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type ITableCellBorders,
} from 'docx';
import type { CoverLayout, CoverTextLine } from '../types';
import { STYLE_IDS } from './styles';
import { layoutHeight } from './coverGeometry';

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;
const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
const ALL: ITableCellBorders = { top: border, bottom: border, left: border, right: border };
const CELL_PAD_TW = 100; // 5pt, matching the layout reader

function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m) return null;
  const bin = atob(m[1]!);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Word content for a copied cover. `width`/`height` are the space available, in twips.
 */
export function layoutContent(l: CoverLayout, width: number, height: number): (Paragraph | Table)[] {
  const contentW = l.right - l.left;
  const contentH = layoutHeight(l);
  const s = Math.min(1, width / 20 / Math.max(1, contentW), height / 20 / Math.max(1, contentH + 20));
  const tw = (pt: number) => Math.max(0, Math.round(pt * s * 20));
  const half = (pt: number) => Math.max(12, Math.round(pt * s * 2));

  const runsOf = (line: CoverTextLine) =>
    line.runs.map((r) => new TextRun({ bold: r.bold, size: half(line.size), children: r.tab ? [new Tab(), r.text] : [r.text] }));

  const textParagraph = (line: CoverTextLine, before: number, lineHeight: number, extraIndent = 0) =>
    new Paragraph({
      style: STYLE_IDS.coverText,
      alignment: ALIGN[line.align],
      indent: { left: tw(line.indent) + extraIndent, right: 0, firstLine: 0 },
      ...(line.tabs.length ? { tabStops: line.tabs.map((t) => ({ type: TabStopType.LEFT, position: tw(t) })) } : {}),
      spacing: { before: tw(before), after: 0, line: tw(lineHeight), lineRule: LineRuleType.AT_LEAST },
      children: runsOf(line),
    });

  const spacer = (before: number) =>
    new Paragraph({
      style: STYLE_IDS.coverText,
      spacing: { before: 0, after: 0, line: Math.max(20, tw(before)), lineRule: LineRuleType.EXACT },
      children: [new TextRun({ text: '', size: 2 })],
    });

  const out: (Paragraph | Table)[] = [];
  let cursor = l.blocks[0]?.top ?? 0;
  for (const b of l.blocks) {
    const before = Math.max(0, b.top - cursor);
    if (b.kind === 'text') {
      out.push(textParagraph(b, before, b.bottom - b.top));
    } else if (b.kind === 'rule') {
      out.push(
        new Paragraph({
          style: STYLE_IDS.coverText,
          indent: { left: tw(b.x - l.left), right: tw(l.right - (b.x + b.width)), firstLine: 0 },
          spacing: { before: tw(before), after: 0, line: 20, lineRule: LineRuleType.EXACT },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: Math.max(4, Math.min(48, Math.round(b.thickness * s * 8))),
              color: '000000',
              space: 0,
            },
          },
          children: [new TextRun({ text: '', size: 2 })],
        }),
      );
    } else if (b.kind === 'image') {
      const data = dataUrlBytes(b.dataUrl);
      if (data) {
        const h = b.bottom - b.top;
        out.push(
          new Paragraph({
            style: STYLE_IDS.coverText,
            alignment: ALIGN[b.align],
            indent: { left: b.align === 'left' ? tw(b.x - l.left) : 0, firstLine: 0 },
            spacing: { before: tw(before), after: 0, line: 240, lineRule: LineRuleType.AUTO },
            // docx sizes images in pixels at 96 dpi.
            children: [
              new ImageRun({
                type: 'png',
                data,
                transformation: { width: Math.round((b.width * s * 96) / 72), height: Math.round((h * s * 96) / 72) },
              }),
            ],
          }),
        );
      }
    } else {
      // A paragraph before every table carries the gap (and keeps two tables from merging).
      out.push(spacer(before));
      const cols = b.colWidths.map(tw);
      const sumCols = (c: number, span: number) => cols.slice(c, c + span).reduce((a, x) => a + x, 0);
      out.push(
        new Table({
          width: { size: cols.reduce((a, x) => a + x, 0), type: WidthType.DXA },
          columnWidths: cols,
          layout: TableLayoutType.FIXED,
          indent: { size: tw(b.x - l.left), type: WidthType.DXA },
          rows: b.rows.map(
            (row) =>
              new TableRow({
                height: { value: tw(row.height), rule: HeightRule.ATLEAST },
                cantSplit: true,
                children: row.cells.map(
                  (c) =>
                    new TableCell({
                      width: { size: sumCols(c.col, c.colSpan), type: WidthType.DXA },
                      ...(c.colSpan > 1 ? { columnSpan: c.colSpan } : {}),
                      ...(c.rowSpan > 1 ? { rowSpan: c.rowSpan } : {}),
                      borders: ALL,
                      verticalAlign: VerticalAlign.CENTER,
                      margins: { top: 0, bottom: 0, left: CELL_PAD_TW, right: CELL_PAD_TW },
                      children: c.lines.length
                        ? c.lines.map(
                            (ln) =>
                              new Paragraph({
                                style: STYLE_IDS.coverText,
                                alignment: ALIGN[ln.align],
                                indent: { left: tw(ln.indent), firstLine: 0 },
                                spacing: { before: 0, after: 0, line: tw(ln.size * 1.15), lineRule: LineRuleType.AT_LEAST },
                                children: runsOf(ln),
                              }),
                          )
                        : [
                            new Paragraph({
                              style: STYLE_IDS.coverText,
                              alignment: AlignmentType.LEFT,
                              spacing: { before: 0, after: 0 },
                              children: [],
                            }),
                          ],
                    }),
                ),
              }),
          ),
        }),
      );
    }
    cursor = Math.max(cursor, b.bottom);
  }
  return out;
}
