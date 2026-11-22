import { extractPdf, groupLines, joinFragments, type PdfFragment } from './pdf';
import { extractBrief } from './index';
import { LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';

const frag = (str: string, x: number, width: number, extra: Partial<PdfFragment> = {}): PdfFragment => ({
  str,
  x,
  width,
  size: 12,
  bold: false,
  ...extra,
});

describe('joinFragments', () => {
  it('joins touching fragments without a space and gapped ones with a space', () => {
    // Real Lab 2 layout: "T" | "ask B1:" | "Doma" | "in" | "Vocab" | "ulary Development"
    const line = [frag('T', 72, 7), frag('ask B1:', 79, 43), frag('Doma', 125, 33), frag('in', 158, 11), frag('Vocab', 172, 35), frag('ulary Development', 207, 107)];
    expect(joinFragments(line)).toBe('Task B1: Domain Vocabulary Development');
  });

  it('does not double spaces', () => {
    expect(joinFragments([frag('Hello ', 0, 30), frag('world', 40, 30)])).toBe('Hello world');
  });
});

describe('groupLines', () => {
  it('groups by baseline within 2pt, orders top to bottom and left to right, and flags bold lines', () => {
    const out = groupLines([
      { ...frag('second', 50, 30), y: 700 },
      { ...frag('First', 10, 25, { bold: true }), y: 720 },
      { ...frag('line', 40, 20, { bold: true }), y: 721.5 },
      { ...frag('row', 10, 30), y: 700.8 },
    ]);
    expect(out.map((l) => l.text)).toEqual(['First line', 'row second']);
    expect(out[0]!.bold).toBe(true);
    expect(out[1]!.bold).toBe(false);
    expect(out[1]!.x).toBe(10);
  });
});

describe.runIf(hasFixture(LAB2))('extractPdf (Lab 2 fixture)', () => {
  it('returns lines per page and page sizes, with the rubric pages in landscape', async () => {
    const r = await extractPdf(readFixture(LAB2), pdfjs);
    expect(r.pages).toHaveLength(10);
    expect(r.noTextLayer).toBe(false);
    expect(r.pageSizes.filter((p) => p.landscape).map((p) => p.page)).toEqual([8, 9]);
    expect(r.pageSizes[0]).toMatchObject({ width: 612, height: 792, landscape: false });
    const p3 = r.pages[2]!.lines.map((l) => l.text);
    expect(p3).toContain('Task B1: Domain Vocabulary Development');
    expect(r.pages[2]!.lines.find((l) => l.text.startsWith('Task B1'))!.bold).toBe(true);
  });

  it('keeps reading order within a page', async () => {
    const r = await extractPdf(readFixture(LAB2), pdfjs);
    const p6 = r.pages[5]!.lines.map((l) => l.text);
    const i = p6.indexOf('Failure Scenario');
    expect(i).toBeGreaterThan(-1);
    expect(p6[i + 1]).toBe('What happens if Plan A cannot be executed?');
  });

  it('extractBrief flags running headers/footers as repeated', async () => {
    const r = await extractBrief(LAB2, readFixture(LAB2), { pdfjs });
    const header = r.lines.filter((l) => l.text === 'CAI20103 INTELLIGENT SYSTEMS');
    expect(header.length).toBeGreaterThanOrEqual(10);
    expect(header.every((l) => l.repeated)).toBe(true);
    expect(r.lines.find((l) => l.text.startsWith('PART A'))!.repeated).toBeUndefined();
  });
});
