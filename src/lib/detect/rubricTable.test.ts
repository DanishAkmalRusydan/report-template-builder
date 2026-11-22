import { splitAtGutters } from './rubricTable';
import { parseBrief } from '../parse';
import { LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';

describe('splitAtGutters', () => {
  const f = { str: 'Functional with minorRuns with', x: 378, width: 154, size: 9, bold: false };

  it('splits a merged fragment at the lower→Upper boundary nearest the gutter', () => {
    expect(splitAtGutters(f, [483]).map((x) => x.str)).toEqual(['Functional with minor', 'Runs with']);
  });

  it('leaves a fragment that only slightly overflows a gutter alone', () => {
    const g = { ...f, str: 'Functional with minor', width: 105 };
    expect(splitAtGutters(g, [481.5])).toEqual([g]);
  });
});

describe.runIf(hasFixture(LAB2))('rubricLayoutFromPdf (Lab 2 PDF)', () => {
  it('rebuilds the 8-column rubric with header rows, 8 criteria rows, and title/sign-off lines', async () => {
    const { rubric } = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    const l = rubric.layout!;
    expect(l.before).toContain('RUBRIC for (LAB 2)');
    expect(l.after).toEqual(['OVERALL SCORE', 'Comments:', 'Evaluated by:', '(Signature)', 'Name:', 'Date:']);
    expect(l.rows.every((r) => r.length === 8)).toBe(true);
    expect(l.rows[0]![0]).toBe('COMPONENTS OF CRITERIA / WEIGHTAGE (%)');
    expect(l.rows[0]![7]).toBe('TOTAL SCORE 100 Marks');
    expect(l.rows[1]!.slice(2, 7)).toEqual(['Excellent (4)', 'Good (3)', 'Average (2)', 'Need Improvement (1)', 'Not Attempted (0)']);
    const data = l.rows.slice(2);
    expect(data).toHaveLength(8);
    expect(data.map((r) => r[0]).filter(Boolean)).toEqual(['CONTENT (40%)', 'PROCESS (30%)', 'PRODUCT (30%)']);
    expect(data[0]!.slice(1, 7)).toEqual([
      'Problem Selection & Justification (10%)',
      'Strong comparison, clear rationale, high innovation potential',
      'Well justified selection',
      'Adequate justification',
      'Weak justification',
      'None',
    ]);
    const prolog = data.find((r) => r[1]!.startsWith('Prolog Implementation'))!;
    expect(prolog.slice(3, 7)).toEqual(['Functional with minor issues', 'Runs with limitations', 'Incomplete', 'Not executable']);
  });
});
