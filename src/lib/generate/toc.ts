import type { TemplateConfig } from '../types';
import { effectiveHeadings } from './headings';
import { textWidth } from './units';
import { escapeXml } from './xml';

/** Estimated page per heading: cover = 1, TOC = 2, then each page-breaking heading starts a new page. */
export function estimateHeadingPages(config: TemplateConfig): { text: string; level: 1 | 2; page: number }[] {
  let page = 2;
  let first = true;
  return effectiveHeadings(config).map((h) => {
    if (first || (h.level === 1 && config.onePartPerPage)) page += 1;
    first = false;
    return { text: h.text, level: h.level, page };
  });
}

function tocStyle(id: string, name: string, indent: number, tabPos: number): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>` +
    `<w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${tabPos}"/></w:tabs>` +
    `<w:spacing w:before="0" w:after="100" w:line="360" w:lineRule="auto"/>${indent ? `<w:ind w:left="${indent}"/>` : ''}<w:jc w:val="left"/></w:pPr></w:style>`
  );
}

/**
 * Fill the TOC field's cached result with the headings and estimated page numbers, so the
 * contents page isn't blank in viewers that don't update fields. Word refreshes it on open
 * (updateFields + dirty field). Also defines TOC 1 / TOC 2 styles with dot leaders.
 */
export function patchToc(documentXml: string, stylesXml: string, config: TemplateConfig): { documentXml: string; stylesXml: string } {
  const tab = textWidth(config.format.paper);
  const entries = estimateHeadingPages(config)
    .map(
      (e) =>
        `<w:p><w:pPr><w:pStyle w:val="TOC${e.level}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(e.text)}</w:t></w:r>` +
        `<w:r><w:tab/></w:r><w:r><w:t>${e.page}</w:t></w:r></w:p>`,
    )
    .join('');
  const sep = documentXml.indexOf('w:fldCharType="separate"');
  let doc = documentXml;
  if (sep >= 0) {
    const endOfPara = doc.indexOf('</w:p>', sep) + '</w:p>'.length;
    doc = doc.slice(0, endOfPara) + entries + doc.slice(endOfPara);
  }
  let styles = stylesXml;
  if (!/w:styleId="TOC1"/.test(styles)) {
    styles = styles.replace('</w:styles>', `${tocStyle('TOC1', 'toc 1', 0, tab)}${tocStyle('TOC2', 'toc 2', 240, tab)}</w:styles>`);
  }
  return { documentXml: doc, stylesXml: styles };
}
