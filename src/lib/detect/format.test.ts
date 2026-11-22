import { detectFormat } from './format';
import { parseDate } from './dates';
import { parseBrief } from '../parse';
import { lines } from '../../test/lines';
import { A2, LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';

const values = (f: ReturnType<typeof detectFormat>) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v as { value: unknown }).value]));

describe('parseDate', () => {
  it.each([
    ['Submission Date: 8TH NOVEMBER 2026', '2026-11-08'],
    ['Due date of submission: 1 December 2026', '2026-12-01'],
    ['Deadline: December 1st, 2026', '2026-12-01'],
    ['Due: 05/01/2027', '2027-01-05'],
    ['Due 2026-12-15', '2026-12-15'],
    ['Submit by 3 Sept 2026', '2026-09-03'],
  ])('%s → %s', (s, iso) => expect(parseDate(s)).toBe(iso));

  it('returns undefined without a date', () => expect(parseDate('Submission Date:')).toBeUndefined());
});

describe('detectFormat (rules)', () => {
  it('reads common phrasings and keeps the source line', () => {
    const f = detectFormat(
      lines(
        'Font: Calibri 11pt',
        'Double spacing throughout',
        'Text must be justified',
        'Page numbers centred at the bottom',
        'Use A4 paper',
        'The cover page colour must be light green',
        'Report should not exceed 15 pages',
        'Deadline: 3 March 2027',
      ),
    );
    expect(values(f)).toEqual({
      font: 'Calibri',
      fontSizePt: 11,
      lineSpacing: 2,
      justified: true,
      pageNumber: 'bottom-center',
      paper: 'A4',
      coverColour: { name: 'light green', hex: 'E2EFDA' },
      maxPages: 15,
      dueDate: '2027-03-03',
    });
    expect(f.font!.source!.line).toBe('Font: Calibri 11pt');
  });

  it('picks the size that belongs to the chosen font', () => {
    const f = detectFormat(lines('Font Style: Times New Roman or Arial', 'Font Size: Arial (11), Times New Roman (12)'));
    expect(f.font!.value).toBe('Times New Roman');
    expect(f.fontSizePt!.value).toBe(12);
  });

  it('returns an empty object when nothing is stated', () => {
    expect(detectFormat(lines('Write a report about your project.'))).toEqual({});
  });
});

describe.runIf(hasFixture(LAB2))('detectFormat (Lab 2 PDF)', () => {
  it('Arial 11, 1.5 spacing, justified, A4, bottom right, light blue cover, max 10 pages', async () => {
    const b = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    expect(values(b.format)).toEqual({
      font: 'Arial',
      fontSizePt: 11,
      lineSpacing: 1.5,
      justified: true,
      pageNumber: 'bottom-right',
      paper: 'A4',
      coverColour: { name: 'light blue', hex: 'DCEBF7' },
      maxPages: 10,
      dueDate: '2026-12-01',
    });
    expect(b.format.coverColour!.source!.line).toMatch(/LIGHT BLUE/);
    expect(b.format.coverColour!.source!.page).toBe(7);
  });
});

describe.runIf(hasFixture(A2))('detectFormat (A2.docx)', () => {
  it('Times New Roman 12, 1.5 spacing, justified', async () => {
    const b = await parseBrief(A2, readFixture(A2));
    expect(values(b.format)).toEqual({
      font: 'Times New Roman',
      fontSizePt: 12,
      lineSpacing: 1.5,
      justified: true,
      dueDate: '2026-11-08',
    });
  });
});
