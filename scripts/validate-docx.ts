/**
 * npm run validate:docx
 *
 * Generates templates from every brief in fixtures/, writes them to out/, then checks:
 *   1. every XML part is well-formed and the zip has no directory entries,
 *   2. the document structure (sections, page breaks, TOC field, rubric section last),
 *   3. it opens and converts to PDF (LibreOffice headless, or Microsoft Word on Windows),
 *   4. page order in the PDF with pdftotext: cover, TOC, each H1 on its own page, rubric last.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseBrief } from '../src/lib/parse';
import { makeConfig } from '../src/lib/config';
import { buildTemplateBytes, templateFileName } from '../src/lib/generate';
import type { PdfjsLike } from '../src/lib/extract/pdf';
import { checkDocxFile, findPdftotext, findSoffice, hasWord, rubricMarkerFor } from './docx-checks';
import { FIXTURES, ROOT, fixtureCases } from './fixture-cases';

const OUT = join(ROOT, 'out');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const cases = fixtureCases();
  if (cases.length === 0) {
    console.log('No fixtures found in fixtures/. Add briefs (and RUBRIC_<name>.docx files) to validate.');
    return;
  }
  const soffice = findSoffice();
  const word = !soffice && hasWord();
  console.log(`Converter: ${soffice ? 'LibreOffice' : word ? 'Microsoft Word (COM)' : 'none – PDF checks skipped'}; pdftotext: ${findPdftotext() ? 'yes' : 'no'}\n`);

  let failed = 0;
  for (const c of cases) {
    const brief = await parseBrief(c.brief, new Uint8Array(readFileSync(join(FIXTURES, c.brief))), { pdfjs: pdfjs as unknown as PdfjsLike });
    const rubricBytes = c.rubricDocx ? new Uint8Array(readFileSync(join(FIXTURES, c.rubricDocx))) : undefined;
    const config = makeConfig(brief, {
      universityName: 'Sample University',
      ...(c.rubricDocx ? { rubric: { kind: 'docx', fileName: c.rubricDocx } } : {}),
    });
    const file = join(OUT, templateFileName(config));
    writeFileSync(file, await buildTemplateBytes(config, rubricBytes));

    const { checks, via } = await checkDocxFile(file, config, { rubricMarker: await rubricMarkerFor(config, rubricBytes) });
    console.log(`■ ${c.brief}${c.rubricDocx ? ` + ${c.rubricDocx}` : ''}  →  out/${basename(file)}`);
    for (const ch of checks) {
      const mark = ch.skipped ? '–' : ch.ok ? '✓' : '✗';
      if (!ch.ok && !ch.skipped) failed++;
      console.log(`   ${mark} ${ch.name}${ch.detail ? `  (${ch.detail})` : ''}`);
    }
    console.log(via !== 'none' ? `   PDF: out/${basename(file).replace(/\.docx$/, '.pdf')}\n` : '');
  }
  if (failed) {
    console.log(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
