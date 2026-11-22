import { AlignmentType, LineRuleType, type IStylesOptions } from 'docx';
import type { ResolvedFormat } from '../types';
import { halfPoints, lineValue } from './units';

export const STYLE_IDS = {
  coverTitle: 'CoverTitle',
  coverText: 'CoverText',
  tocTitle: 'TocTitle',
  tableText: 'TableText',
} as const;

/**
 * Document styles. Heading 1/2 use Word's built-in ids so the TOC field picks them up.
 * Every spacing explicitly sets lineRule "auto" (Google Docs otherwise guesses).
 */
export function buildStyles(f: ResolvedFormat): IStylesOptions {
  const font = f.font;
  const size = halfPoints(f.fontSizePt);
  const line = lineValue(f.lineSpacing);
  const black = '000000';
  return {
    default: {
      document: {
        run: { font, size, color: black },
        paragraph: {
          spacing: { line, lineRule: LineRuleType.AUTO, before: 0, after: 120 },
          alignment: f.justified ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        },
      },
      heading1: {
        run: { font, size: halfPoints(f.fontSizePt + 2), bold: true, color: black },
        paragraph: {
          keepNext: true,
          keepLines: true,
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 240, line, lineRule: LineRuleType.AUTO },
          outlineLevel: 0,
        },
      },
      heading2: {
        run: { font, size: halfPoints(f.fontSizePt + 1), bold: true, color: black },
        paragraph: {
          keepNext: true,
          keepLines: true,
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 120, line, lineRule: LineRuleType.AUTO },
          outlineLevel: 1,
        },
      },
    },
    paragraphStyles: [
      {
        id: STYLE_IDS.coverTitle,
        name: 'Cover Title',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font, size: halfPoints(f.fontSizePt + 4), bold: true, color: black },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: 240, lineRule: LineRuleType.AUTO } },
      },
      {
        id: STYLE_IDS.coverText,
        name: 'Cover Text',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font, size: halfPoints(f.fontSizePt), color: black },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80, line: 240, lineRule: LineRuleType.AUTO } },
      },
      {
        id: STYLE_IDS.tocTitle,
        name: 'TOC Title',
        basedOn: 'Normal',
        next: 'Normal',
        run: { font, size: halfPoints(f.fontSizePt + 2), bold: true, color: black },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240, line, lineRule: LineRuleType.AUTO } },
      },
      {
        id: STYLE_IDS.tableText,
        name: 'Table Text',
        basedOn: 'Normal',
        next: STYLE_IDS.tableText,
        run: { font, size: halfPoints(Math.max(9, f.fontSizePt - 1)), color: black },
        paragraph: { alignment: AlignmentType.LEFT, spacing: { before: 40, after: 40, line: 240, lineRule: LineRuleType.AUTO } },
      },
    ],
  };
}
