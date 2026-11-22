import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildDocument, buildTemplateBytes } from './buildTemplate';
import { assignRubricStyles, mergeRubric, readThemeFonts, resolveThemeFonts, stripNoise } from './mergeRubric';
import { openDocx, malformedParts, sampleConfig } from '../../test/docx';
import { RUBRIC_A2, hasFixture, readFixture } from '../../test/fixtures';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

/** A small rubric .docx with an image, a numbered list, a table and theme fonts. */
async function syntheticRubric(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdHdr99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>',
  );
  zip.file('word/media/image1.png', PNG);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W}><w:body>` +
      '<w:p w14:paraId="1A2B3C4D" w14:textId="77777777" w:rsidR="00AB12CD"><w:r w:rsidRPr="00112233"><w:rPr><w:b/></w:rPr><w:t>MY RUBRIC</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Criterion one</w:t></w:r></w:p>' +
      '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId7"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
      '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="13000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="13000"/></w:tblGrid>' +
      '<w:tr><w:tc><w:tcPr><w:tcW w:w="13000" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/></w:rPr><w:t>Excellent</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p/>' +
      '<w:sectPr w:rsidR="00AB12CD"><w:headerReference w:type="default" r:id="rIdHdr99"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>',
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
      '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8"/></w:tblBorders></w:tblPr></w:style></w:styles>',
  );
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  );
  zip.file(
    'word/theme/theme1.xml',
    '<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>',
  );
  zip.file(
    'word/fontTable.xml',
    `<?xml version="1.0"?><w:fonts ${W}><w:font w:name="Verdana"><w:family w:val="swiss"/></w:font></w:fonts>`,
  );
  return zip.generateAsync({ type: 'uint8array' });
}

async function merged(rubric: Uint8Array) {
  const base = await buildTemplateBytes(sampleConfig({ rubric: { kind: 'docx', fileName: 'r.docx' } }), rubric);
  const parts = await openDocx(base);
  return { parts, doc: await parts.text('word/document.xml'), styles: await parts.text('word/styles.xml') };
}

describe('mergeRubric helpers', () => {
  it('strips paraId/textId/rsid attributes', () => {
    expect(stripNoise('<w:p w14:paraId="1" w14:textId="2" w:rsidR="3" w:rsidRDefault="4"><w:r w:rsidRPr="5"/></w:p>')).toBe('<w:p><w:r/></w:p>');
  });

  it('resolves theme fonts to names, optionally keeping the theme attributes', () => {
    const fonts = readThemeFonts('<a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Verdana"/></a:minorFont>');
    expect(fonts).toEqual({ minor: 'Verdana', major: 'Georgia' });
    expect(resolveThemeFonts('<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="majorHAnsi"/>', fonts)).toBe('<w:rFonts w:ascii="Verdana" w:hAnsi="Georgia"/>');
    expect(resolveThemeFonts('<w:rFonts w:asciiTheme="minorHAnsi"/>', fonts, true)).toBe('<w:rFonts w:ascii="Verdana" w:asciiTheme="minorHAnsi"/>');
    expect(resolveThemeFonts('<w:rFonts w:ascii="Arial"/>', fonts)).toBe('<w:rFonts w:ascii="Arial"/>');
  });

  it('assigns Rubric Body / Rubric Cell to unstyled and Normal paragraphs only', () => {
    const out = assignRubricStyles(
      '<w:p><w:r/></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="center"/></w:pPr></w:p><w:tbl><w:tr><w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr></w:p></w:tc></w:tr></w:tbl><w:p/>',
    );
    expect(out).toBe(
      '<w:p><w:pPr><w:pStyle w:val="RubricBody"/></w:pPr><w:r/></w:p>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:p>' +
        '<w:p><w:pPr><w:pStyle w:val="RubricBody"/><w:jc w:val="center"/></w:pPr></w:p>' +
        '<w:tbl><w:tr><w:tc><w:p><w:pPr><w:pStyle w:val="RubricCell"/><w:jc w:val="right"/></w:pPr></w:p></w:tc></w:tr></w:tbl>' +
        '<w:p><w:pPr><w:pStyle w:val="RubricBody"/></w:pPr></w:p>',
    );
  });
});

describe('mergeRubric (synthetic rubric)', () => {
  it('replaces the placeholder with the rubric body as the final section', async () => {
    const { doc, parts } = await merged(await syntheticRubric());
    expect(doc).not.toContain('[[RUBRIC_CONTENT]]');
    expect(doc.indexOf('MY RUBRIC')).toBeGreaterThan(doc.indexOf('>References<'));
    expect(doc).not.toMatch(/w14:paraId|w14:textId|w:rsid/);
    expect(parts.dirEntries).toEqual([]);
    expect(await malformedParts(parts)).toEqual([]);
  });

  it('copies page size, orientation and margins into the last section, without the rubric header', async () => {
    const { doc } = await merged(await syntheticRubric());
    const last = doc.slice(doc.lastIndexOf('<w:sectPr'));
    expect(last).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    expect(last).toContain('w:top="720" w:right="720" w:bottom="720" w:left="720"');
    expect(doc).not.toContain('rIdHdr99');
  });

  it('adds Rubric Body / Rubric Cell styles from the rubric defaults and keeps TableGrid', async () => {
    const { styles } = await merged(await syntheticRubric());
    const body = styles.match(/<w:style [^>]*w:styleId="RubricBody"[\s\S]*?<\/w:style>/)![0];
    const cell = styles.match(/<w:style [^>]*w:styleId="RubricCell"[\s\S]*?<\/w:style>/)![0];
    expect(body).toContain('w:ascii="Verdana"');
    expect(body).toContain('<w:sz w:val="20"/>');
    expect(body).toMatch(/w:after="100" w:line="276"/);
    expect(cell).toMatch(/w:after="0" w:line="240"/);
    expect(styles).toMatch(/w:styleId="TableGrid"[\s\S]*?<w:top w:val="single" w:sz="8"\/>/);
  });

  it('copies images with renamed relationship ids and content types', async () => {
    const { doc, parts } = await merged(await syntheticRubric());
    const rels = await parts.text('word/_rels/document.xml.rels');
    const id = doc.match(/<a:blip r:embed="([^"]+)"/)![1]!;
    expect(id).toMatch(/^rIdRubric\d+$/);
    expect(rels).toContain(`Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/rubric_image1.png"`);
    expect(parts.names).toContain('word/media/rubric_image1.png');
    expect(await parts.text('[Content_Types].xml')).toMatch(/Extension="png"/);
  });

  it('copies numbering definitions with offset ids', async () => {
    const { doc, parts } = await merged(await syntheticRubric());
    expect(doc).toContain('<w:numId w:val="1001"/>');
    const numbering = await parts.text('word/numbering.xml');
    expect(numbering).toMatch(/<w:abstractNum w:abstractNumId="1000">/);
    expect(numbering).toMatch(/<w:num w:numId="1001"><w:abstractNumId w:val="1000"\/>/);
    expect(numbering.lastIndexOf('<w:abstractNum ')).toBeLessThan(numbering.indexOf('<w:num '));
  });

  it('carries the theme and font table so fonts resolve and substitute as in the original', async () => {
    const { doc, parts } = await merged(await syntheticRubric());
    expect(parts.names).toContain('word/theme/theme1.xml');
    expect(await parts.text('word/fontTable.xml')).toContain('<w:font w:name="Verdana">');
    expect(doc).toContain('<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/>');
  });

  it('mergeRubric() merges into a template Blob that still has its placeholder', async () => {
    const raw = await Packer.toBlob(buildDocument(sampleConfig({ rubric: { kind: 'docx', fileName: 'r.docx' } })));
    const out = await openDocx(await mergeRubric(raw, await syntheticRubric()));
    expect(await out.text('word/document.xml')).toContain('MY RUBRIC');
    expect(out.dirEntries).toEqual([]);
  });

  it('mergeRubric() refuses a template without a rubric placeholder', async () => {
    const raw = await buildTemplateBytes(sampleConfig({ rubric: { kind: 'none' } }));
    await expect(mergeRubric(raw, await syntheticRubric())).rejects.toThrow(/placeholder/);
  });
});

describe.runIf(hasFixture(RUBRIC_A2))('mergeRubric (RUBRIC_A2.docx fixture)', () => {
  it('merges the real rubric unchanged in landscape', async () => {
    const { doc, styles, parts } = await merged(readFixture(RUBRIC_A2));
    expect(await malformedParts(parts)).toEqual([]);
    expect(doc).toContain('RUBRIC ASSIGNMENT 2');
    expect(doc).toContain('Criteria &amp; Weight');
    expect(doc.match(/<w:tblStyle w:val="TableGrid"\/>/g)).toHaveLength(3);
    expect(doc.slice(doc.lastIndexOf('<w:sectPr'))).toContain('w:w="16838" w:h="11906" w:orient="landscape"');
    expect(styles).toContain('w:styleId="RubricCell"');
    expect(styles).toContain('w:ascii="Aptos"');
    expect(doc).not.toMatch(/w14:paraId|w:rsid/);
    // Every namespace prefix used in the body is declared on the root.
    const root = doc.match(/<w:document\b[^>]*>/)![0];
    const used = new Set([...doc.matchAll(/<\/?([a-z0-9]+):/gi)].map((m) => m[1]!));
    for (const p of used) expect(root).toContain(`xmlns:${p}=`);
  });
});
