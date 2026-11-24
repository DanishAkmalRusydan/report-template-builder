import { buildTemplate, buildTemplateBytes, DOCX_MIME, TOC_TITLE } from './buildTemplate';
import { estimateHeadingPages } from './toc';
import { templateFileName } from './filename';
import { openDocx, malformedParts, sampleConfig } from '../../test/docx';
import type { TemplateConfig } from '../types';

async function build(over: Partial<TemplateConfig> = {}) {
  const config = sampleConfig(over);
  const parts = await openDocx(await buildTemplateBytes(config));
  return { config, parts, doc: await parts.text('word/document.xml'), styles: await parts.text('word/styles.xml') };
}

const sections = (doc: string) => doc.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];

describe('buildTemplate', () => {
  it('returns a .docx Blob', async () => {
    const blob = await buildTemplate(sampleConfig());
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(5000);
  });

  it('produces well-formed XML in a zip without directory entries', async () => {
    const { parts } = await build();
    expect(parts.dirEntries).toEqual([]);
    expect(await malformedParts(parts)).toEqual([]);
    expect(parts.names[0]).toBe('[Content_Types].xml');
  });

  it('orders cover → TOC → body, with the cover in its own titlePage section', async () => {
    const { doc } = await build();
    const s = sections(doc);
    expect(s).toHaveLength(2);
    expect(s[0]).toContain('<w:titlePg/>');
    expect(s[0]).toContain('w:w="11906" w:h="16838"');
    const tocAt = doc.indexOf(TOC_TITLE);
    expect(doc.indexOf('Student ID')).toBeLessThan(tocAt);
    expect(doc.indexOf('Part A: Introduction')).toBeGreaterThan(doc.indexOf('TOC \\h \\o &quot;1-2&quot;'));
  });

  it('uses a real TOC field for Heading 1–2 and asks Word to update fields', async () => {
    const { doc, parts } = await build();
    expect(doc).toMatch(/<w:instrText[^>]*>TOC \\h \\o &quot;1-2&quot;<\/w:instrText>/);
    expect(await parts.text('word/settings.xml')).toContain('<w:updateFields');
  });

  it('pre-fills the TOC with every heading and an estimated page number', async () => {
    const { doc, styles } = await build();
    expect(doc).toContain(
      '<w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t xml:space="preserve">Part A: Introduction</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>3</w:t>',
    );
    expect(doc).toContain(
      '<w:pStyle w:val="TOC2"/></w:pPr><w:r><w:t xml:space="preserve">Task A1: Background</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>3</w:t>',
    );
    expect(styles).toMatch(/w:styleId="TOC1"[\s\S]*?w:leader="dot"/);
  });

  it('makes H1/H2 bold Heading styles in the brief font with keepNext', async () => {
    const { styles } = await build();
    const h1 = styles.match(/<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)![0];
    expect(h1).toContain('<w:keepNext/>');
    expect(h1).toContain('<w:b/>');
    expect(h1).toContain('w:ascii="Arial"');
    expect(h1).toContain('<w:sz w:val="26"/>');
    expect(styles).toMatch(
      /<w:docDefaults>[\s\S]*w:ascii="Arial"[\s\S]*<w:sz w:val="22"\/>[\s\S]*w:line="360"[\s\S]*<w:jc w:val="both"\/>/,
    );
  });

  it('starts each H1 on a new page, and only the first when "one part per page" is off', async () => {
    const on = await build();
    expect(on.doc.match(/<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/>/g)).toHaveLength(4); // 3 parts + References
    expect(on.doc).not.toMatch(/<w:pStyle w:val="Heading2"\/><w:pageBreakBefore\/>/);
    const off = await build({ onePartPerPage: false });
    expect(off.doc.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  });

  it('writes no body text under headings', async () => {
    const { doc } = await build();
    const body = doc.slice(doc.indexOf('</w:sdt>'));
    const texts = [...body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    expect(texts).toEqual(['Part A: Introduction', 'Task A1: Background', 'Part B: Method', 'Part C: Results', 'References']);
  });

  it('adds or removes References with the toggle', async () => {
    expect((await build({ includeReferences: false })).doc).not.toContain('>References<');
    const withRefs = await build({ headings: [{ id: 'r', level: 1, text: 'References', confidence: 1, origin: 'user' }] });
    expect(withRefs.doc.match(/>References<\/w:t>/g)).toHaveLength(2); // TOC entry + heading, not duplicated
  });

  it('puts the page number in the footer, aligned per config, and none on the cover', async () => {
    const { parts, doc } = await build({ format: { ...sampleConfig().format, pageNumber: 'bottom-center' } });
    const footers = await Promise.all(parts.names.filter((n) => /word\/footer\d+\.xml$/.test(n)).map((n) => parts.text(n)));
    const withPage = footers.filter((f) => /PAGE/.test(f));
    expect(withPage.length).toBeGreaterThanOrEqual(1);
    expect(withPage.every((f) => f.includes('<w:jc w:val="center"/>'))).toBe(true);
    // The cover section's footers contain no PAGE field.
    const coverFooterIds = [...sections(doc)[0]!.matchAll(/<w:footerReference [^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
    const rels = await parts.text('word/_rels/document.xml.rels');
    for (const id of coverFooterIds) {
      const target = rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))![1];
      expect(await parts.text(`word/${target}`)).not.toMatch(/PAGE/);
    }
  });

  it('uses DXA widths for every table and cell, never percentages or solid shading', async () => {
    const { doc } = await build({ format: { ...sampleConfig().format, coverColourHex: 'DCEBF7' } });
    expect(doc).not.toMatch(/w:type="pct"/);
    expect(doc).not.toMatch(/w:type="auto"/);
    expect(doc).not.toMatch(/w:val="solid"/);
    expect(doc.match(/<w:tblW [^>]*>/g)!.every((t) => /w:type="dxa"/.test(t))).toBe(true);
    expect(doc.match(/<w:tcW [^>]*>/g)!.every((t) => /w:type="dxa"/.test(t))).toBe(true);
    expect(doc).toMatch(/<w:tblGrid><w:gridCol w:w="\d+"\/>/);
  });

  it('sets lineRule explicitly on every spacing that has a line value', async () => {
    const { doc, styles } = await build();
    const spacings = [...`${doc}${styles}`.matchAll(/<w:spacing\b[^>]*\/>/g)].map((m) => m[0]).filter((s) => /w:line=/.test(s));
    expect(spacings.length).toBeGreaterThan(5);
    expect(spacings.filter((s) => !/w:lineRule="(auto|exact)"/.test(s))).toEqual([]);
  });

  it('colours only the cover: zero-margin cover section with a shaded full-page cell', async () => {
    const { doc } = await build({ format: { ...sampleConfig().format, coverColourHex: 'DCEBF7' } });
    const [cover, main] = sections(doc);
    expect(cover).toContain('w:top="0" w:right="0" w:bottom="0" w:left="0"');
    expect(main).toContain('w:top="1440"');
    expect(doc).toMatch(/<w:shd w:fill="DCEBF7" w:color="auto" w:val="clear"\/>|<w:shd w:val="clear" w:color="auto" w:fill="DCEBF7"\/>/);
    expect(doc).toMatch(/<w:trHeight w:val="16638" w:hRule="exact"\/>/);
    expect(doc.match(/DCEBF7/g)).toHaveLength(1);
  });

  it('builds the member table with the chosen rows and optional picture column', async () => {
    const three = await build({ cover: { ...sampleConfig().cover, memberRows: 3 } });
    const memberTable = (d: string) =>
      d.slice(d.lastIndexOf('<w:tbl>', d.indexOf('>Student ID<')), d.indexOf('</w:tbl>', d.indexOf('>Student ID<')));
    expect(memberTable(three.doc).match(/<w:tr>/g)).toHaveLength(4); // header + 3
    expect(memberTable(three.doc)).toContain('>Picture<');
    const noPic = await build({ cover: { ...sampleConfig().cover, showPictureColumn: false } });
    expect(memberTable(noPic.doc)).not.toContain('>Picture<');
  });

  it('rebuilds a brief cover from its fields', async () => {
    const { doc } = await build({
      cover: {
        ...sampleConfig().cover,
        mode: 'from-brief',
        briefFields: [
          { label: 'Lecturer’s Name', value: 'DR. X' },
          { label: 'Semester', value: 'SEPT 2026' },
        ],
      },
    });
    expect(doc).toContain('>Lecturer’s Name<');
    expect(doc).toContain('>DR. X<');
    expect(doc).toContain('>(ABC12345)<');
  });

  it('adds a landscape rubric section rebuilt from PDF rows', async () => {
    const { doc } = await build({
      rubric: {
        kind: 'pdf-pages',
        pages: [8, 9],
        landscape: true,
        before: ['RUBRIC for (LAB 2)'],
        rows: [
          ['Criteria', 'Excellent (4)'],
          ['Design', 'Complete'],
        ],
        after: ['OVERALL SCORE'],
      },
    });
    const s = sections(doc);
    expect(s).toHaveLength(3);
    expect(s[2]).toContain('w:w="16838" w:h="11906" w:orient="landscape"');
    const rubricPart = doc.slice(doc.indexOf('RUBRIC for (LAB 2)'));
    expect(rubricPart).toContain('<w:tblHeader/>');
    expect(rubricPart.indexOf('Excellent (4)')).toBeLessThan(rubricPart.indexOf('OVERALL SCORE'));
  });

  it('leaves a visible note when a .docx rubric is selected but its bytes are missing', async () => {
    const { doc } = await build({ rubric: { kind: 'docx', fileName: 'r.docx' } });
    expect(doc).toContain('Attach the rubric here.');
    expect(doc).not.toContain('[[RUBRIC_CONTENT]]');
  });

  it('supports US Letter', async () => {
    const { doc } = await build({ format: { ...sampleConfig().format, paper: 'Letter' } });
    expect(sections(doc)[1]).toContain('w:w="12240" w:h="15840"');
  });
});

describe('estimateHeadingPages', () => {
  it('counts cover and TOC, then one page per H1', () => {
    expect(estimateHeadingPages(sampleConfig()).map((e) => e.page)).toEqual([3, 3, 4, 5, 6]);
    expect(estimateHeadingPages(sampleConfig({ onePartPerPage: false })).map((e) => e.page)).toEqual([3, 3, 3, 3, 3]);
  });
});

describe('templateFileName', () => {
  it.each([
    ['CAI20103', 'ASSIGNMENT (Lab 2)', 'CAI20103_Lab_2_Report_Template.docx'],
    ['CIT22803', 'Assignment 2: EIS Innovation Proposal for a Business Sector', 'CIT22803_Assignment_2_Report_Template.docx'],
    ['', 'Final Project', 'Final_Project_Report_Template.docx'],
    ['BIT2234', 'Group Assignment 1: Campus Library Booking System', 'BIT2234_Assignment_1_Report_Template.docx'],
  ])('%s + %s → %s', (code, name, expected) => {
    expect(templateFileName(sampleConfig({ cover: { ...sampleConfig().cover, subjectCode: code, assignmentName: name } }))).toBe(expected);
  });
});

describe('copied cover sheet', () => {
  it('renders the brief’s cover layout instead of a generated cover', async () => {
    // 1x1 white PNG.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const { doc, parts } = await build({
      cover: {
        ...sampleConfig().cover,
        mode: 'from-brief',
        briefLayout: {
          page: 10,
          pageWidth: 612,
          pageHeight: 792,
          left: 36,
          right: 576,
          blocks: [
            { kind: 'image', top: 70, bottom: 130, x: 223, width: 165, dataUrl: png, align: 'center' },
            {
              kind: 'text',
              top: 150,
              bottom: 165,
              runs: [{ text: 'ASSIGNMENT (Lab 2)', bold: true }],
              size: 12,
              align: 'center',
              indent: 0,
              tabs: [],
            },
            { kind: 'rule', top: 200, bottom: 201, x: 36, width: 540, thickness: 1.4 },
            {
              kind: 'text',
              top: 215,
              bottom: 230,
              runs: [
                { text: 'Lecturer’s Name', bold: true },
                { text: ': DR. X', bold: true, tab: true },
              ],
              size: 12,
              align: 'left',
              indent: 0,
              tabs: [110],
            },
            {
              kind: 'table',
              top: 300,
              bottom: 360,
              x: 36,
              colWidths: [360, 180],
              rows: [
                {
                  height: 30,
                  cells: [
                    {
                      col: 0,
                      colSpan: 2,
                      rowSpan: 1,
                      lines: [{ runs: [{ text: 'MARKS', bold: true }], size: 12, align: 'center', indent: 0, tabs: [] }],
                    },
                  ],
                },
                {
                  height: 30,
                  cells: [
                    { col: 0, colSpan: 1, rowSpan: 1, lines: [] },
                    { col: 1, colSpan: 1, rowSpan: 1, lines: [] },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    const cover = doc.slice(0, doc.indexOf('<w:sectPr'));
    expect(cover).toContain('ASSIGNMENT (Lab 2)');
    expect(cover).toContain('<w:tab/>');
    expect(cover).toContain('<w:gridSpan w:val="2"/>');
    expect(cover).toMatch(/<w:pBdr>\s*<w:bottom/);
    expect(cover).not.toContain('Picture'); // no generated member table
    expect(parts.names.some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
  });
});
