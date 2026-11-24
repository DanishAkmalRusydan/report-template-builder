import { detectRubric, scorePage } from './rubric';
import { parseBrief } from '../parse';
import { lines } from '../../test/lines';
import { A2, LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';
import type { PageSize } from '../types';

const size = (page: number, landscape = false): PageSize => ({
  page,
  width: landscape ? 842 : 595,
  height: landscape ? 595 : 842,
  landscape,
});

describe('detectRubric (rules)', () => {
  it('does not count "refer to the attached rubrics" instructions', () => {
    expect(scorePage(lines('Refer to the attached rubrics as a guide.'))).toBe(0);
  });

  it('finds rubric pages and a continuation page with the score block', () => {
    const l = lines(
      '@1 Introduction text',
      '@2 RUBRIC for Assignment 1',
      '@2 Criteria Excellent Good Average Not Attempted',
      '@3 Presentation Clear Mostly clear Unclear None',
      '@3 OVERALL SCORE',
      '@4 Appendix',
    );
    const r = detectRubric(l, [size(1), size(2, true), size(3, true), size(4)]);
    expect(r).toMatchObject({ found: true, pages: [2, 3], landscape: true });
  });

  it('reports not found when there is no rubric', () => {
    expect(detectRubric(lines('@1 Hello'), [size(1)]).found).toBe(false);
  });
});

describe.runIf(hasFixture(LAB2))('detectRubric (Lab 2 PDF)', () => {
  it('finds the rubric on pages 8–9 in landscape', async () => {
    const { rubric } = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    expect(rubric).toMatchObject({ found: true, pages: [8, 9], landscape: true });
  });
});

describe.runIf(hasFixture(A2))('detectRubric (A2.docx)', () => {
  it('has no rubric inside the brief', async () => {
    const { rubric } = await parseBrief(A2, readFixture(A2));
    expect(rubric.found).toBe(false);
  });
});

describe.runIf(hasFixture(LAB2))('parseRubricPdf', () => {
  it('finds the rubric pages in a PDF and rebuilds the table', async () => {
    const { parseRubricPdf } = await import('../parse');
    const r = await parseRubricPdf(readFixture(LAB2), { pdfjs });
    expect(r.pages).toEqual([8, 9]);
    expect(r.landscape).toBe(true);
    expect(r.rows.length).toBeGreaterThan(5);
  });
});
