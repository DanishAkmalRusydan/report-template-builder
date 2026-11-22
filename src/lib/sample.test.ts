// The bundled "Try an example" brief (public/samples/sample-brief.docx, fictional, committed).
import { readFileSync } from 'node:fs';
import { parseBrief, parseBriefText } from './parse';
import { makeConfig } from './config';

const sample = () => new Uint8Array(readFileSync('public/samples/sample-brief.docx'));

describe('sample brief', () => {
  it('detects parts, tasks, references, format and the rubric table', async () => {
    const b = await parseBrief('sample-brief.docx', sample(), { now: new Date('2026-11-22') });
    expect(b.headings.filter((h) => h.level === 1).map((h) => h.text)).toEqual([
      'PART A: REQUIREMENTS ANALYSIS',
      'PART B: DATABASE DESIGN',
      'PART C: IMPLEMENTATION',
      'PART D: REFLECTION',
      'References',
    ]);
    expect(b.headings.filter((h) => h.level === 2)).toHaveLength(6);
    expect(b.format.font?.value).toBe('Calibri');
    expect(b.format.lineSpacing?.value).toBe(1.15);
    expect(b.format.pageNumber?.value).toBe('bottom-center');
    expect(b.cover.groupSize).toEqual({ min: 3, max: 4 });
    expect(b.rubric.layout?.rows[0]).toEqual(['Criteria', 'Excellent (4)', 'Average (2)', 'Not Attempted (0)']);
    const config = makeConfig(b);
    expect(config.rubric.kind).toBe('pdf-pages');
    expect(config.cover.memberRows).toBe(4);
  });
});

describe('parseBriefText', () => {
  it('detects headings and format from pasted text', () => {
    const b = parseBriefText('ABC1234 SOFTWARE TESTING\nPart 1 – Test Plan\nTask 1.1 Scope\nPart 2 – Test Cases\nFont: Arial 12\nLine spacing: 2');
    expect(b.kind).toBe('text');
    expect(b.headings.map((h) => `H${h.level} ${h.text}`)).toEqual(['H1 Part 1 – Test Plan', 'H2 Task 1.1 Scope', 'H1 Part 2 – Test Cases']);
    expect(b.format.font?.value).toBe('Arial');
    expect(b.format.fontSizePt?.value).toBe(12);
    expect(b.format.lineSpacing?.value).toBe(2);
  });

  it('rejects empty text', () => {
    expect(() => parseBriefText('  \n ')).toThrow(/empty/);
  });
});
