/**
 * Generates bundled, fictional sample assets (safe to commit):
 *   public/samples/sample-brief.docx  – the "Try an example" brief
 *   src/assets/placeholderLogo.ts     – placeholder university logo (PNG data URL)
 * Usage: npx vite-node scripts/make-assets.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { AlignmentType, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { createCanvas } from '@napi-rs/canvas';

const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
const gap = () => new Paragraph({ children: [] });
const cell = (text: string, width: number, bold = false) =>
  new TableCell({ width: { size: width, type: WidthType.DXA }, children: [p(text, bold)] });

const brief = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [
    {
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'BIT2234 DATABASE SYSTEMS', bold: true, size: 28 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Group Assignment 1: Campus Library Booking System', bold: true })] }),
        p('Assignment (25%)', true),
        p('Submission Date: 15 March 2027', true),
        p('Lecturer: Dr. Example Lecturer'),
        p('Mode: Group of 3 – 4 students'),
        gap(),
        p('Assignment Title: Designing a Room Booking Database for a Campus Library'),
        gap(),
        p('Scenario', true),
        p('The campus library wants to replace its paper booking sheets with a small database system. Students book discussion rooms, librarians approve bookings and the library reports on room usage every month.'),
        gap(),
        p('PART A: REQUIREMENTS ANALYSIS', true),
        p('Task A1: Stakeholders and Use Cases', true),
        p('Identify at least THREE stakeholders and describe their main use cases.'),
        p('Task A2: Business Rules', true),
        p('List the business rules that the database must enforce.'),
        p('PART B: DATABASE DESIGN', true),
        p('Task B1: Entity Relationship Diagram', true),
        p('Draw an ERD with at least FIVE entities. Explain each relationship.'),
        p('Task B2: Normalisation', true),
        p('Normalise your tables to Third Normal Form (3NF) and justify each step.'),
        p('PART C: IMPLEMENTATION', true),
        p('Task C1: SQL Schema', true),
        p('Create the tables with suitable keys and constraints.'),
        p('Task C2: Queries and Reports', true),
        p('Write FIVE queries that answer the library’s monthly reporting needs.'),
        p('PART D: REFLECTION', true),
        p('Each member writes a short reflection on what they learned.'),
        gap(),
        p('DELIVERABLES', true),
        p('i. SQL script (.sql)'),
        p('ii. Report (Maximum 12 Pages)'),
        p('iii. Group Contribution Table'),
        gap(),
        p('DOCUMENTATION FORMAT FOR REPORT', true),
        p('i. Font Style: Calibri'),
        p('ii. Font Size: 11'),
        p('iii. Spacing: 1.15 line'),
        p('iv. Paragraph: Justified'),
        p('v. Page Number: Bottom centre'),
        p('vi. Paper Size: A4'),
        p('vii. Use APA style for references.'),
        gap(),
        p('RUBRIC', true),
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          columnWidths: [3000, 2000, 2000, 2000],
          rows: [
            new TableRow({ children: [cell('Criteria', 3000, true), cell('Excellent (4)', 2000, true), cell('Average (2)', 2000, true), cell('Not Attempted (0)', 2000, true)] }),
            new TableRow({ children: [cell('ERD (30%)', 3000), cell('Complete and correct', 2000), cell('Some errors', 2000), cell('None', 2000)] }),
            new TableRow({ children: [cell('Normalisation (30%)', 3000), cell('Correct to 3NF', 2000), cell('Partly correct', 2000), cell('None', 2000)] }),
            new TableRow({ children: [cell('SQL (40%)', 3000), cell('Runs, all constraints', 2000), cell('Runs with issues', 2000), cell('None', 2000)] }),
          ],
        }),
      ],
    },
  ],
});

mkdirSync('public/samples', { recursive: true });
writeFileSync('public/samples/sample-brief.docx', new Uint8Array(await Packer.toArrayBuffer(brief)));
console.log('public/samples/sample-brief.docx');

// Placeholder logo: a navy crest with a book, clearly generic.
const W = 360;
const H = 200;
const c = createCanvas(W, H);
const g = c.getContext('2d');
g.fillStyle = '#ffffff';
g.fillRect(0, 0, W, H);
g.fillStyle = '#14254a';
g.beginPath();
g.moveTo(60, 30);
g.lineTo(140, 30);
g.lineTo(140, 110);
g.quadraticCurveTo(140, 160, 100, 175);
g.quadraticCurveTo(60, 160, 60, 110);
g.closePath();
g.fill();
g.fillStyle = '#ffffff';
g.fillRect(78, 70, 20, 40);
g.fillRect(102, 70, 20, 40);
g.fillStyle = '#c8632b';
g.fillRect(98, 66, 4, 48);
g.fillStyle = '#14254a';
g.font = 'bold 30px serif';
g.fillText('YOUR', 160, 95);
g.fillText('UNIVERSITY', 160, 130);
g.font = '16px sans-serif';
g.fillStyle = '#6b7280';
g.fillText('Logo placeholder', 162, 158);
mkdirSync('src/assets', { recursive: true });
const dataUrl = `data:image/png;base64,${c.toBuffer('image/png').toString('base64')}`;
writeFileSync(
  'src/assets/placeholderLogo.ts',
  `// Generated by scripts/make-assets.ts – a generic placeholder, not a real university logo.\nexport const PLACEHOLDER_LOGO = { dataUrl: '${dataUrl}', widthPx: ${W}, heightPx: ${H} };\n`,
);
console.log('src/assets/placeholderLogo.ts');
