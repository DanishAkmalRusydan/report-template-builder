import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  TableOfContents,
  TextRun,
  type ISectionOptions,
} from 'docx';
import type { PageNumberPosition, TemplateConfig } from '../types';
import { effectiveHeadings } from './headings';
import { buildCover } from './cover';
import { buildStyles, STYLE_IDS } from './styles';
import { MARGIN, PAPER } from './units';
import { rubricContent } from './rubricTable';
import { finaliseDocx } from './postprocess';

import { RUBRIC_PLACEHOLDER, TOC_TITLE } from './constants';
export { RUBRIC_PLACEHOLDER, TOC_TITLE };

function pageNumberParagraph(pos: PageNumberPosition): Paragraph {
  const alignment = pos === 'bottom-center' ? AlignmentType.CENTER : pos === 'bottom-left' ? AlignmentType.LEFT : AlignmentType.RIGHT;
  return new Paragraph({ alignment, children: [new TextRun({ children: [PageNumber.CURRENT] })] });
}

function numbering(pos: PageNumberPosition): Pick<ISectionOptions, 'headers' | 'footers'> {
  if (pos === 'none') return { headers: { default: new Header({ children: [] }) }, footers: { default: new Footer({ children: [] }) } };
  if (pos === 'top-right')
    return {
      headers: { default: new Header({ children: [pageNumberParagraph(pos)] }) },
      footers: { default: new Footer({ children: [] }) },
    };
  return {
    headers: { default: new Header({ children: [] }) },
    footers: { default: new Footer({ children: [pageNumberParagraph(pos)] }) },
  };
}

function bodyHeadings(config: TemplateConfig): Paragraph[] {
  const out: Paragraph[] = [];
  let firstH1 = true;
  for (const h of effectiveHeadings(config)) {
    const level = h.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
    // The first heading always starts a new page after the TOC; later H1s only when "one part per page" is on.
    const breakBefore = firstH1 || (h.level === 1 && config.onePartPerPage);
    out.push(new Paragraph({ heading: level, pageBreakBefore: breakBefore, children: [new TextRun(h.text)] }));
    firstH1 = false;
  }
  return out;
}

const tinyParagraph = () =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: '', size: 2 })],
  });

/** Build the .docx document model. */
export function buildDocument(config: TemplateConfig): Document {
  const f = config.format;
  const page = PAPER[f.paper];
  const size = { width: page.width, height: page.height, orientation: PageOrientation.PORTRAIT };
  const margin = { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 708, footer: 708, gutter: 0 };
  const cover = buildCover(config.cover, f.paper, f.coverColourHex);

  const sections: ISectionOptions[] = [
    {
      properties: {
        titlePage: true,
        page: {
          size,
          margin: cover.fullBleed
            ? { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0, gutter: 0 }
            : { ...margin, top: cover.margins.top, bottom: cover.margins.bottom, left: cover.margins.side, right: cover.margins.side },
        },
      },
      // 1pt-high header/footer paragraphs so they don't push a full-bleed cover onto a second page.
      headers: { default: new Header({ children: [tinyParagraph()] }), first: new Header({ children: [tinyParagraph()] }) },
      footers: { default: new Footer({ children: [tinyParagraph()] }), first: new Footer({ children: [tinyParagraph()] }) },
      children: cover.children,
    },
    {
      properties: { type: SectionType.NEXT_PAGE, page: { size, margin } },
      ...numbering(f.pageNumber),
      children: [
        new Paragraph({ style: STYLE_IDS.tocTitle, children: [new TextRun(TOC_TITLE)] }),
        new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        ...bodyHeadings(config),
      ],
    },
  ];

  const r = config.rubric;
  if (r.kind !== 'none') {
    const landscape = r.kind === 'pdf-pages' && r.landscape;
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { ...size, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin },
      },
      ...numbering(f.pageNumber),
      children:
        r.kind === 'docx'
          ? [new Paragraph({ children: [new TextRun(RUBRIC_PLACEHOLDER)] })]
          : rubricContent(r, (landscape ? page.height : page.width) - 2 * MARGIN),
    });
  }

  return new Document({
    creator: 'Report Template Builder',
    title: [config.cover.subjectCode, config.cover.assignmentName].filter(Boolean).join(' ') || 'Report Template',
    description: 'Empty report template generated from an assignment brief.',
    features: { updateFields: true },
    styles: buildStyles(f),
    sections,
  });
}

/**
 * Build the template as .docx bytes. If a rubric .docx is supplied it is merged in as the final section.
 * Works in the browser and in Node.
 */
export async function buildTemplateBytes(config: TemplateConfig, rubricDocx?: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const doc = buildDocument(config);
  const raw = new Uint8Array(await Packer.toArrayBuffer(doc));
  return finaliseDocx(raw, config, rubricDocx);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Browser-friendly wrapper returning a Blob. */
export async function buildTemplate(config: TemplateConfig, rubricDocx?: ArrayBuffer | Uint8Array): Promise<Blob> {
  const bytes = await buildTemplateBytes(config, rubricDocx);
  return new Blob([bytes], { type: DOCX_MIME });
}
