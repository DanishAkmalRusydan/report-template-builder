import { detectHeadings } from './headings';
import { parseBrief } from '../parse';
import { lines } from '../../test/lines';
import { A2, LAB2, hasFixture, pdfjs, readFixture } from '../../test/fixtures';

const outline = (r: ReturnType<typeof detectHeadings>) => r.headings.map((h) => `H${h.level} ${h.text}`);

describe('detectHeadings (rules)', () => {
  it('detects PART / Part – / SECTION headings as H1 and appends a (CHAPTER n) trailer', () => {
    const r = detectHeadings(
      lines('**PART A: Introduction', '(CHAPTER 5)', 'Some text.', '**Part 1 – Literature Review', 'More text.', '**SECTION 2: Method', 'Text.'),
    );
    expect(outline(r)).toEqual(['H1 PART A: Introduction (CHAPTER 5)', 'H1 Part 1 – Literature Review', 'H1 SECTION 2: Method']);
  });

  it('nests Task / Activity lines as H2 under the current H1', () => {
    const r = detectHeadings(lines('**PART A: Design', '**Task A1: Requirements', 'Do this.', '**Task 2.1 Data Model', '**Activity 3: Testing', '**PART B: Build'));
    expect(outline(r)).toEqual(['H1 PART A: Design', 'H2 Task A1: Requirements', 'H2 Task 2.1 Data Model', 'H2 Activity 3: Testing', 'H1 PART B: Build']);
  });

  it('uses numbered question titles as H1, preferring the first table column', () => {
    const r = detectHeadings(
      lines('|0|No.', '|1|Assignment Question', '|0|1. Business Sector and Current Issues', '|1|Select ONE sector.', '|0|2. Proposed Solution', '|1|Propose a system.'),
    );
    expect(outline(r)).toEqual(['H1 1. Business Sector and Current Issues', 'H1 2. Proposed Solution']);
    expect(r.headings[0]!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('ignores instruction sentences, Step lines, bullets and DELIVERABLES / DOCUMENTATION FORMAT content', () => {
    const r = detectHeadings(
      lines(
        '**INSTRUCTIONS',
        '1. Activity must be completed in the form of a typewritten document.',
        '**PART A: Analysis',
        'Step 1: Present all proposed problems.',
        '• Task 1: not a heading in a bullet',
        '**DELIVERABLES',
        '**Task 9: Submit Files',
        '1. Source Code',
        '2. Demo Video',
        '**DOCUMENTATION FORMAT FOR REPORT',
        'Section 1: Arial',
      ),
    );
    expect(outline(r)).toEqual(['H1 PART A: Analysis']);
  });

  it('does not treat "Section 2 of the report should…" as a heading', () => {
    expect(detectHeadings(lines('Section 2 of the report should describe the method')).headings).toEqual([]);
  });

  it('de-duplicates repeated headings', () => {
    const r = detectHeadings(lines('**PART A: Intro', 'x', '**PART A: Intro', '**PART B: End'));
    expect(outline(r)).toEqual(['H1 PART A: Intro', 'H1 PART B: End']);
  });

  it('adds References as the last H1 when the report structure lists it', () => {
    const r = detectHeadings(lines('|0|1. Introduction', '|0|2. Discussion', '**Report Structure', 'Cover Page', 'Content', 'References'));
    expect(outline(r)).toEqual(['H1 1. Introduction', 'H1 2. Discussion', 'H1 References']);
    expect(r.wantsReferences).toBe(true);
  });

  it('turns numbered items into H2 when the brief uses PART headings', () => {
    const r = detectHeadings(lines('**PART A: Theory', '1. Key Concepts', '2. Related Work', '**PART B: Practice'));
    expect(outline(r)).toEqual(['H1 PART A: Theory', 'H2 1. Key Concepts', 'H2 2. Related Work', 'H1 PART B: Practice']);
  });

  it('promotes tasks to H1 when there are no parts', () => {
    const r = detectHeadings(lines('**Task 1: Setup', 'x', '**Task 2: Analysis'));
    expect(outline(r)).toEqual(['H1 Task 1: Setup', 'H1 Task 2: Analysis']);
  });

  it('flags a short label followed by a question as a low-confidence H2', () => {
    const r = detectHeadings(lines('**PART E: FAILURE ANALYSIS', 'Students must analyse:', 'Failure Scenario', 'What happens if it fails?'));
    expect(outline(r)).toEqual(['H1 PART E: FAILURE ANALYSIS', 'H2 Failure Scenario']);
    expect(r.headings[1]!.confidence).toBeLessThan(0.6);
  });

  it('skips excluded pages', () => {
    const r = detectHeadings(lines('@1 **PART A: Real', '@8 **PART Z: Rubric Page'), { excludePages: [8] });
    expect(outline(r)).toEqual(['H1 PART A: Real']);
  });

  it('returns a source line and confidence for every heading', () => {
    const r = detectHeadings(lines('**PART A: Intro'));
    expect(r.headings[0]).toMatchObject({ origin: 'detected', source: { index: 0, line: 'PART A: Intro' } });
    expect(r.headings[0]!.confidence).toBeGreaterThan(0.9);
  });
});

describe.runIf(hasFixture(LAB2))('detectHeadings (Lab 2 PDF)', () => {
  it('finds Part A–E as H1 and the tasks plus Failure Scenario / Recovery Strategy as H2', async () => {
    const b = await parseBrief(LAB2, readFixture(LAB2), { pdfjs });
    const h1 = b.headings.filter((h) => h.level === 1).map((h) => h.text);
    const h2 = b.headings.filter((h) => h.level === 2).map((h) => h.text);
    expect(h1.map((t) => t.slice(0, 6))).toEqual(['PART A', 'PART B', 'PART C', 'PART D', 'PART E']);
    expect(h1[0]).toBe('PART A: CONSTRAINT SATISFACTION & RULE-BASED DECISION MAKING (CHAPTER 5)');
    expect(h2).toEqual([
      'Task B1: Domain Vocabulary Development',
      'Task B2: Knowledge Representation',
      'Task B3: Information Extraction',
      'Task B4: Critical Evaluation',
      'Task C1: Goal Definition',
      'Task C2: Action Modelling',
      'Task C3: Plan Generation',
      'Task C4: Plan Comparison',
      'Failure Scenario',
      'Recovery Strategy',
    ]);
    // Tasks sit under the right part.
    const order = b.headings.map((h) => h.text.slice(0, 7));
    expect(order.indexOf('Task B1')).toBeGreaterThan(order.indexOf('PART B:'));
    expect(order.indexOf('Task C1')).toBeGreaterThan(order.indexOf('PART C:'));
    expect(order.indexOf('Failure')).toBeGreaterThan(order.indexOf('PART E:'));
    expect(b.wantsReferences).toBe(false);
  });
});

describe.runIf(hasFixture(A2))('detectHeadings (A2.docx)', () => {
  it('finds questions 1–7 plus References as H1', async () => {
    const b = await parseBrief(A2, readFixture(A2));
    expect(b.headings.map((h) => `H${h.level} ${h.text}`)).toEqual([
      'H1 1. Business Sector and Current Issues',
      'H1 2. Proposed EIS Solution',
      'H1 3. EIS Tools and Technologies',
      'H1 4. Simple EIS System Diagram',
      'H1 5. Commercial Relevance',
      'H1 6. Societal Relevance',
      'H1 7. Conclusion and Recommendation',
      'H1 References',
    ]);
  });
});
