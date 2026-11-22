import JSZip from 'jszip';
import { extractDocx } from './docx';
import { extractBrief } from './index';
import { A2, RUBRIC_A2, hasFixture, readFixture } from '../../test/fixtures';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

async function makeDocx(body: string, styles = ''): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`);
  if (styles) zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('extractDocx (synthetic)', () => {
  it('joins runs and treats <w:tab/> and <w:br/> as spaces', async () => {
    const bytes = await makeDocx(
      '<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t>big</w:t><w:br/><w:t xml:space="preserve">world </w:t></w:r><w:r><w:t>&amp; more</w:t></w:r></w:p>',
    );
    const { paragraphs } = await extractDocx(bytes);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.text).toBe('Hello big world & more');
  });

  it('detects bold from runs, w:val toggles and paragraph styles', async () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="MyHead"><w:name w:val="My Head"/><w:basedOn w:val="Heading1"/></w:style>';
    const bytes = await makeDocx(
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold run</w:t></w:r></w:p>' +
        '<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>Not bold</w:t></w:r></w:p>' +
        '<w:p><w:pPr><w:pStyle w:val="MyHead"/></w:pPr><w:r><w:t>Inherited</w:t></w:r></w:p>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b w:val="false"/></w:rPr><w:t>Override</w:t></w:r></w:p>',
      styles,
    );
    const { paragraphs } = await extractDocx(bytes);
    expect(paragraphs.map((p) => [p.text, p.isBold])).toEqual([
      ['Bold run', true],
      ['Not bold', false],
      ['Inherited', true],
      ['Override', false],
    ]);
    expect(paragraphs[2]!.styleName).toBe('My Head');
  });

  it('reports table membership with row and column', async () => {
    const cell = (t: string) => `<w:tc><w:tcPr/><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
    const bytes = await makeDocx(
      '<w:p><w:r><w:t>Before</w:t></w:r></w:p>' +
        `<w:tbl><w:tblPr/><w:tr>${cell('No.')}${cell('Question')}</w:tr><w:tr>${cell('1. Intro')}${cell('Describe it.')}</w:tr></w:tbl>` +
        '<w:p><w:r><w:t>After</w:t></w:r></w:p>',
    );
    const { paragraphs } = await extractDocx(bytes);
    expect(paragraphs.map((p) => [p.text, p.inTable, p.tableRow, p.tableCol])).toEqual([
      ['Before', false, undefined, undefined],
      ['No.', true, 0, 0],
      ['Question', true, 0, 1],
      ['1. Intro', true, 1, 0],
      ['Describe it.', true, 1, 1],
      ['After', false, undefined, undefined],
    ]);
  });

  it('rejects files without word/document.xml', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(extractDocx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/not a valid Word/);
  });
});

describe.runIf(hasFixture(A2))('extractDocx (A2.docx fixture)', () => {
  it('returns paragraphs in order with bold and table info', async () => {
    const { paragraphs } = await extractDocx(readFixture(A2));
    const texts = paragraphs.map((p) => p.text).filter(Boolean);
    expect(texts[0]).toBe('CIT22803 ENTERPRISE INFORMATION SYSTEM');
    expect(paragraphs[0]!.isBold).toBe(true);
    const q1 = paragraphs.find((p) => p.text === '1. Business Sector and Current Issues');
    expect(q1).toMatchObject({ inTable: true, tableCol: 0 });
    const desc = paragraphs.find((p) => p.text.startsWith('Select ONE business sector. Briefly'));
    expect(desc).toMatchObject({ inTable: true, tableCol: 1 });
    expect(texts.indexOf('References')).toBeGreaterThan(texts.indexOf('7. Conclusion and Recommendation'));
  });

  it('extractBrief normalises to BriefLines', async () => {
    const r = await extractBrief(A2, readFixture(A2));
    expect(r.kind).toBe('docx');
    expect(r.lines.every((l, i) => l.index === i && l.text.length > 0)).toBe(true);
    expect(r.lines.find((l) => l.text === 'Font: Times New Roman')).toBeTruthy();
  });
});

describe.runIf(hasFixture(RUBRIC_A2))('extractDocx (RUBRIC_A2.docx fixture)', () => {
  it('decodes XML entities in rubric cells', async () => {
    const { paragraphs } = await extractDocx(readFixture(RUBRIC_A2));
    expect(paragraphs.some((p) => p.text === 'Criteria & Weight' && p.inTable)).toBe(true);
  });
});
