import { buildCoverLayout, findTables, textLine } from './coverLayout';
import { parseBrief } from '../parse';
import { LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';
import type { Seg } from '../extract/pdfGraphics';
import type { PdfPage } from '../extract/pdf';

const h = (x1: number, x2: number, y: number): Seg => ({ x: x1, y: y - 0.25, w: x2 - x1, h: 0.5 });
const v = (x: number, y1: number, y2: number): Seg => ({ x: x - 0.25, y: y1, w: 0.5, h: y2 - y1 });
const frag = (str: string, x: number, width: number, bold = false) => ({ str, x, width, size: 12, bold });

describe('findTables', () => {
  it('builds a grid from borders and finds merged cells', () => {
    // 2 columns x 2 rows; the top row has no middle border (one merged cell).
    const segs = [h(100, 300, 700), h(100, 300, 680), h(100, 300, 650), v(100, 650, 700), v(300, 650, 700), v(200, 650, 680)];
    const { grids, rules } = findTables(segs);
    expect(rules).toEqual([]);
    expect(grids).toHaveLength(1);
    expect(grids[0]!.xs.map(Math.round)).toEqual([100, 200, 300]);
    expect(grids[0]!.ys.map(Math.round)).toEqual([700, 680, 650]);
  });

  it('treats a lone long line as a rule and joins its pieces', () => {
    const { grids, rules } = findTables([h(36, 300, 500), h(300, 576, 500), h(10, 20, 400)]);
    expect(grids).toEqual([]);
    expect(rules).toHaveLength(1);
    expect(Math.round(rules[0]!.x1)).toBe(36);
    expect(Math.round(rules[0]!.x2)).toBe(576);
  });
});

describe('textLine', () => {
  it('splits a label from its colon column with a tab', () => {
    const t = textLine([frag('Submission Date', 36, 90, true), frag(':', 146, 4, true)], 36, 576);
    expect(t.runs).toEqual([
      { text: 'Submission Date', bold: true },
      { text: ':', bold: true, tab: true },
    ]);
    expect(t.align).toBe('left');
    expect(t.tabs).toEqual([110]);
  });

  it('centres a line in the middle of the page and keeps bullets as a tab', () => {
    expect(textLine([frag('ASSIGNMENT (Lab 2)', 250, 112, true)], 36, 576).align).toBe('center');
    const b = textLine([frag('•', 54, 4), frag('This is an individual assignment.', 72, 180)], 36, 576);
    expect(b.runs.map((r) => r.text)).toEqual(['•', 'This is an individual assignment.']);
    expect(b.indent).toBe(18);
  });
});

describe('buildCoverLayout', () => {
  it('leaves out running headers and keeps cells with their text', () => {
    const page: PdfPage = {
      page: 2,
      width: 612,
      height: 792,
      landscape: false,
      lines: [
        { text: 'COURSE HEADER', x: 400, y: 760, size: 12, bold: false, fragments: [frag('COURSE HEADER', 400, 100)] },
        {
          text: 'Name Student ID',
          x: 110,
          y: 685,
          size: 12,
          bold: true,
          fragments: [frag('Name', 110, 30, true), frag('Student ID', 210, 60, true)],
        },
      ],
      graphics: {
        segs: [h(100, 300, 700), h(100, 300, 680), h(100, 300, 650), v(100, 650, 700), v(300, 650, 700), v(200, 650, 700)],
        images: [],
      },
    };
    const layout = buildCoverLayout({ page, otherPages: [], repeated: new Set(['COURSE HEADER']), imageUrls: new Map() })!;
    expect(layout.blocks).toHaveLength(1);
    const table = layout.blocks[0]!;
    expect(table.kind).toBe('table');
    if (table.kind !== 'table') return;
    expect(table.rows[0]!.cells.map((c) => c.lines[0]?.runs[0]?.text)).toEqual(['Name', 'Student ID']);
    expect(table.rows[1]!.cells.every((c) => c.lines.length === 0)).toBe(true);
  });
});

describe.runIf(hasFixture(LAB2))('cover layout (Lab 2 PDF)', () => {
  it('copies the cover sheet page: logo, rules, fields and both tables', async () => {
    const brief = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    const l = brief.cover.layout!;
    expect(l.page).toBe(10);
    const kinds = l.blocks.map((b) => b.kind);
    expect(kinds.filter((k) => k === 'image')).toHaveLength(1); // the big logo, not the header logo
    expect(kinds.filter((k) => k === 'rule')).toHaveLength(2);
    const text = l.blocks.flatMap((b) => (b.kind === 'text' ? [b.runs.map((r) => r.text).join(' ')] : []));
    expect(text).toContain('ASSIGNMENT (Lab 2)');
    expect(text).toContain('Lecturer’s Name : DR. HAFIZUL BIN OTHMAN');
    expect(text.some((t) => /RB – CAI20103|INTELLIGENT SYSTEMS$/.test(t) && !/^INTELLIGENT/.test(t))).toBe(false);
    const tables = l.blocks.filter((b) => b.kind === 'table');
    expect(tables).toHaveLength(2);
    const [members, marks] = tables as Extract<(typeof l.blocks)[number], { kind: 'table' }>[];
    expect(members!.rows).toHaveLength(6);
    expect(members!.rows[0]!.cells.map((c) => c.lines.map((x) => x.runs[0]!.text).join(' '))).toEqual([
      'Name',
      'Student ID',
      'Total (100%)',
    ]);
    expect(marks!.rows[0]!.cells[0]).toMatchObject({ colSpan: 2 });
    const img = l.blocks.find((b) => b.kind === 'image');
    expect(img?.kind === 'image' && img.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
