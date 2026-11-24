import { detectCover } from './cover';
import { parseBrief } from '../parse';
import { lines } from '../../test/lines';
import { A2, LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';

describe('detectCover (rules)', () => {
  it('reads subject code + name, assignment, title, lecturer and group size', () => {
    const c = detectCover(
      lines(
        '**BIT2234 DATABASE SYSTEMS',
        '**Group Assignment 1: Library System',
        'Project Title: Smart Library Booking',
        'Lecturer: Ms. Aina Rahman',
        'Weightage: 20%',
        'Work in a group of 2 - 4 students.',
      ),
    );
    expect(c.subjectCode?.value).toBe('BIT2234');
    expect(c.subjectName?.value).toBe('DATABASE SYSTEMS');
    expect(c.assignmentName?.value).toBe('Group Assignment 1: Library System');
    expect(c.assignmentTitle?.value).toBe('Smart Library Booking');
    expect(c.lecturer?.value).toBe('Ms. Aina Rahman');
    expect(c.weightage?.value).toBe('20%');
    expect(c.groupType.value).toBe('group');
    expect(c.groupSize).toEqual({ min: 2, max: 4 });
    expect(c.briefHasCover).toBe(false);
  });

  it('detects individual work', () => {
    expect(detectCover(lines('This is an individual assignment.')).groupType.value).toBe('individual');
  });

  it('ignores a "Lecturer Name" checklist item with no value', () => {
    expect(detectCover(lines('Include:', 'Lecturer Name', 'Student IDs')).lecturer).toBeUndefined();
  });
});

describe.runIf(hasFixture(LAB2))('detectCover (Lab 2 PDF)', () => {
  it('finds the cover sheet on the last page and its fields', async () => {
    const { cover } = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    expect(cover.briefHasCover).toBe(true);
    expect(cover.coverPages).toEqual([10]);
    expect(cover.subjectCode?.value).toBe('CAI20103');
    expect(cover.subjectName?.value).toBe('INTELLIGENT SYSTEMS');
    expect(cover.assignmentName?.value).toBe('ASSIGNMENT (Lab 2)');
    expect(cover.assignmentTitle?.value).toBe('Prolog-Based Intelligent Analysis and Planning System for a Real-World Problem');
    // Real lecturer name kept out of the repo: check the shape only.
    expect(cover.lecturer?.value).toMatch(/^DR\. [A-Z]+( [A-Z]+)+$/);
    expect(cover.weightage?.value).toBe('15%');
    expect(cover.semester?.value).toBe('SEPT 2026');
    expect(cover.groupType.value).toBe('group');
    expect(cover.groupSize).toEqual({ min: 3, max: 5 });
    expect(cover.coverGroupType?.value).toBe('individual');
    expect(cover.coverFields.map((f) => f.label)).toEqual(['Received Date', 'Submission Date', 'Lecturer’s Name', 'Weightage', 'Semester']);
  });
});

describe.runIf(hasFixture(A2))('detectCover (A2.docx)', () => {
  it('has no cover in the brief and reads the subject line', async () => {
    const { cover } = await parseBrief(A2, readFixture(A2));
    expect(cover.briefHasCover).toBe(false);
    expect(cover.subjectCode?.value).toBe('CIT22803');
    expect(cover.subjectName?.value).toBe('ENTERPRISE INFORMATION SYSTEM');
    expect(cover.assignmentName?.value).toBe('Assignment 2: EIS Innovation Proposal for a Business Sector');
    expect(cover.assignmentTitle?.value).toBe('Designing an Innovative Enterprise Information System for Commercial and Societal Value');
    expect(cover.weightage?.value).toBe('30%');
    expect(cover.lecturer).toBeUndefined();
    expect(cover.groupType.value).toBe('group');
  });
});

describe('detectCover: other cover sheet styles', () => {
  it('finds a declaration-style cover sheet without colon fields', async () => {
    const { lines } = await import('../../test/lines');
    const page1 = [
      'FACULTY OF COMPUTING',
      'ASSIGNMENT FRONT PAGE',
      'Student Name',
      'Matric No.',
      'Programme',
      'Lecturer',
      'Submission Date',
      'Declaration',
      'I declare that this work is my own.',
      'Signature',
    ];
    const page2 = [
      'Part A – Introduction',
      'Write an introduction of about 500 words describing the system and its users in detail please.',
    ];
    const all = lines(...page1.map((t) => `@1 ${t}`), ...page2.map((t) => `@2 ${t}`));
    const c = detectCover(all, [
      { page: 1, width: 595, height: 842, landscape: false },
      { page: 2, width: 595, height: 842, landscape: false },
    ]);
    expect(c.briefHasCover).toBe(true);
    expect(c.coverPages).toEqual([1]);
  });
});
