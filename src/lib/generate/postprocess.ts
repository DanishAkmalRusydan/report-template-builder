import type { TemplateConfig } from '../types';
import { RUBRIC_PLACEHOLDER } from './constants';
import { mergeRubricFiles } from './mergeRubric';
import { patchToc } from './toc';
import { escapeXml } from './xml';
import { getText, readZip, repackZip } from './zip';

/**
 * Post-process the docx library output: fill the TOC cache, merge the rubric .docx,
 * and re-pack the zip without directory entries.
 */
export async function finaliseDocx(raw: Uint8Array, config: TemplateConfig, rubric?: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const files = await readZip(raw);
  const toc = patchToc(getText(files, 'word/document.xml')!, getText(files, 'word/styles.xml')!, config);
  files.set('word/document.xml', toc.documentXml);
  files.set('word/styles.xml', toc.stylesXml);

  if (config.rubric.kind === 'docx') {
    const bytes = rubric ?? config.rubric.bytes;
    if (bytes) {
      mergeRubricFiles(files, await readZip(bytes));
    } else {
      // No rubric file available (e.g. rebuilding from history): leave a visible note instead.
      const doc = getText(files, 'word/document.xml')!;
      files.set('word/document.xml', doc.replace(RUBRIC_PLACEHOLDER, escapeXml('Attach the rubric here.')));
    }
  }
  return repackZip(files);
}
