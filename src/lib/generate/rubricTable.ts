import { AlignmentType, BorderStyle, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx';
import { STYLE_IDS } from './styles';
import { splitWidth } from './units';

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;

/** Rubric section content: title lines, the table, then the score/sign-off lines. */
export function rubricContent(layout: { before?: string[]; rows?: string[][]; after?: string[] }, width: number): (Paragraph | Table)[] {
  const line = (text: string, bold: boolean, center: boolean) =>
    new Paragraph({
      style: STYLE_IDS.tableText,
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [new TextRun({ text, ...(bold ? { bold: true } : {}) })],
    });
  const before = (layout.before ?? []).map((t) => line(t, /^[^a-z]+$/.test(t) || /rubric/i.test(t), /rubric|faculty/i.test(t)));
  const after = (layout.after ?? []).map((t) => line(t, /score|comments/i.test(t), false));
  return [...before, ...rubricTable(layout.rows ?? [], width), ...(after.length ? [new Paragraph({ children: [] }), ...after] : [])];
}

/** Rebuild a rubric (rows of cell text, first row = header) as a Word table. */
export function rubricTable(rows: string[][], width: number): (Paragraph | Table)[] {
  if (rows.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: 'Rubric', bold: true })] }), new Paragraph({ children: [new TextRun('Paste the rubric here.')] })];
  }
  const nCols = Math.max(...rows.map((r) => r.length));
  // First two columns (component, criteria) slightly wider than the level descriptors.
  const weights = Array.from({ length: nCols }, (_, i) => (i < 2 ? 1.3 : 1));
  const cols = splitWidth(width, weights);
  const table = new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map(
      (r, ri) =>
        new TableRow({
          tableHeader: ri === 0,
          cantSplit: true,
          children: Array.from({ length: nCols }, (_, ci) => {
            const text = r[ci] ?? '';
            return new TableCell({
              width: { size: cols[ci]!, type: WidthType.DXA },
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              ...(ri === 0 ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } } : {}),
              children: text.split('\n').map(
                (line) =>
                  new Paragraph({
                    style: STYLE_IDS.tableText,
                    alignment: ri === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                    children: line ? [new TextRun({ text: line, ...(ri === 0 || ci === 0 ? { bold: true } : {}) })] : [],
                  }),
              ),
            });
          }),
        }),
    ),
  });
  return [table];
}
