import { deliverableCovered, detectDeliverables, detectIssues, estimatePages, type IssueInput } from './issues';
import { parseBrief } from '../parse';
import { lines } from '../../test/lines';
import { LAB2, A2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';
import type { Heading } from '../types';

const h = (text: string, level: 1 | 2 = 1, confidence = 0.9): Heading => ({ id: text, level, text, confidence, origin: 'detected' });

const base = (): IssueInput => ({
  headings: [h('PART A: Intro'), h('PART B: Method')],
  format: {},
  cover: { groupType: { value: 'unknown' }, briefHasCover: false, coverFields: [] },
  rubric: { found: false, pages: [], landscape: false, confidence: 0 },
  deliverables: [],
  now: new Date('2026-11-22T10:00:00'),
});

const ids = (input: IssueInput) => detectIssues(input).map((i) => i.id);

describe('detectIssues', () => {
  it('returns nothing for a clean brief', () => {
    expect(detectIssues(base())).toEqual([]);
  });

  it('warns when the cover says individual but the brief says group', () => {
    const input = base();
    input.cover = { ...input.cover, groupType: { value: 'group' }, groupSize: { min: 3, max: 5 }, coverGroupType: { value: 'individual' } };
    const issue = detectIssues(input).find((i) => i.id === 'group-mismatch');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toMatch(/individual.*group.*3–5/);
  });

  it('warns when the due date has passed, but not on the due date itself', () => {
    const input = base();
    input.format = { dueDate: { value: '2026-11-08' } };
    expect(ids(input)).toContain('due-past');
    input.format = { dueDate: { value: '2026-11-22' } };
    expect(ids(input)).not.toContain('due-past');
  });

  it('warns about a white cover only when the brief asks for a colour', () => {
    const input = base();
    input.format = { coverColour: { value: { name: 'light blue', hex: 'DCEBF7' } } };
    expect(ids(input)).toContain('cover-colour');
    input.template = { coverColourHex: 'DCEBF7' };
    expect(ids(input)).not.toContain('cover-colour');
  });

  it('warns when cover + TOC + parts + rubric exceed the page limit', () => {
    const input = base();
    input.headings = ['A', 'B', 'C', 'D', 'E'].map((x) => h(`PART ${x}`));
    input.rubric = { found: true, pages: [8, 9], landscape: true, confidence: 1 };
    input.format = { maxPages: { value: 8 } };
    expect(estimatePages(input)).toBe(9);
    expect(ids(input)).toContain('page-limit');
    input.template = { onePartPerPage: false };
    expect(ids(input)).toContain('page-limit-info');
  });

  it('lists deliverables that have no heading', () => {
    const input = base();
    input.deliverables = [{ value: 'Method Overview' }, { value: 'Reflection' }];
    const issue = detectIssues(input).find((i) => i.id === 'deliverables-missing');
    expect(issue?.message).toMatch(/Reflection/);
    expect(issue?.message).not.toMatch(/Method/);
  });
});

describe('deliverableCovered', () => {
  it('matches word stems and acronyms', () => {
    const hs = [h('PART B: NATURAL LANGUAGE PROCESSING'), h('Task C4: Plan Comparison', 2)];
    expect(deliverableCovered('NLP Design', hs)).toBe(true);
    expect(deliverableCovered('Plan Comparison', hs)).toBe(true);
    expect(deliverableCovered('Reflection', hs)).toBe(false);
  });
});

describe('detectDeliverables', () => {
  it('reads report sub-items and document-like deliverables', () => {
    const d = detectDeliverables(
      lines('**DELIVERABLES', 'i. Source code', 'o 3 test cases', 'ii. Report (Maximum 10 Pages)', 'o Problem Selection', 'o Reflection', 'iii. Group Contribution Table', 'o Role', '**FORMAT'),
    );
    expect(d.map((x) => x.value)).toEqual(['Problem Selection', 'Reflection', 'Group Contribution Table']);
  });
});

describe.runIf(hasFixture(LAB2))('issues (Lab 2 PDF)', () => {
  it('flags group mismatch, white cover, missing deliverables and low-confidence headings', async () => {
    const b = await parseBrief(LAB2, readFixture(LAB2), { pdfjs, now: new Date('2026-11-22') });
    const byId = Object.fromEntries(b.issues.map((i) => [i.id, i]));
    expect(byId['group-mismatch']).toBeTruthy();
    expect(byId['cover-colour']).toBeTruthy();
    expect(byId['due-past']).toBeUndefined();
    expect(byId['page-limit-info']?.message).toMatch(/10 pages.*about 9/);
    expect(byId['deliverables-missing']?.message).toMatch(/Reflection/);
    expect(byId['deliverables-missing']?.message).toMatch(/Group Contribution Table/);
    expect(byId['low-confidence']).toBeTruthy();
  });
});

describe.runIf(hasFixture(A2))('issues (A2.docx)', () => {
  it('flags the past due date only', async () => {
    const b = await parseBrief(A2, readFixture(A2), { now: new Date('2026-11-22') });
    expect(b.issues.map((i) => i.id)).toEqual(['due-past']);
  });
});
