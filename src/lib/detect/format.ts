import type { BriefLine, FormatRules, PageNumberPosition, Sourced, SourceRef } from '../types';
import { COLOUR_NAMES, KNOWN_FONTS } from './patterns';
import { parseDate } from './dates';

const src = (l: BriefLine): SourceRef => ({ index: l.index, line: l.text, ...(l.page ? { page: l.page } : {}) });
const sourced = <T>(value: T, l: BriefLine): Sourced<T> => ({ value, source: src(l) });

/** First known font mentioned in a string, by position. */
function firstFont(s: string): string | undefined {
  let best: { font: string; pos: number } | undefined;
  for (const f of KNOWN_FONTS) {
    const pos = s.toLowerCase().indexOf(f.toLowerCase());
    if (pos >= 0 && (!best || pos < best.pos)) best = { font: f, pos };
  }
  return best?.font;
}

function detectFont(lines: BriefLine[]): Sourced<string> | undefined {
  const fontLine = lines.find((l) => /\bfont\b(?!\s*size)/i.test(l.text) && firstFont(l.text));
  if (fontLine) return sourced(firstFont(fontLine.text)!, fontLine);
  const any = lines.find((l) => firstFont(l.text) && /\b(1[0-4]|[89])\s*(pt|point)?\b/.test(l.text));
  return any ? sourced(firstFont(any.text)!, any) : undefined;
}

function detectSize(lines: BriefLine[], font?: string): Sourced<number> | undefined {
  const plausible = (n: number) => n >= 8 && n <= 20;
  const sizeLines = lines.filter((l) => /\bfont\s*size\b|\bsize\s*:?\s*\d|\b\d{1,2}\s*(pt|point)\b/i.test(l.text));
  for (const l of sizeLines) {
    if (font) {
      // "Font Size: Arial (11), Times New Roman (12)" → size for the chosen font.
      const esc = font.replace(/ /g, '\\s*');
      const m = l.text.match(new RegExp(`${esc}\\s*\\(?\\s*(\\d{1,2}(?:\\.5)?)`, 'i'));
      if (m?.[1] && plausible(Number(m[1]))) return sourced(Number(m[1]), l);
    }
    const nums = [...l.text.matchAll(/(\d{1,2}(?:\.5)?)/g)].map((m) => Number(m[1])).filter(plausible);
    if (nums[0] !== undefined) return sourced(nums[0], l);
  }
  // "Times New Roman 12" on the font line.
  if (font) {
    for (const l of lines) {
      const m = l.text.match(new RegExp(`${font.replace(/ /g, '\\s*')}[,\\s]*\\(?(\\d{1,2})\\s*(pt|point)?`, 'i'));
      if (m?.[1] && plausible(Number(m[1]))) return sourced(Number(m[1]), l);
    }
  }
  return undefined;
}

function detectSpacing(lines: BriefLine[]): Sourced<number> | undefined {
  for (const l of lines) {
    const t = l.text;
    if (!/spacing|spaced/i.test(t)) continue;
    if (/double/i.test(t)) return sourced(2, l);
    if (/single/i.test(t)) return sourced(1, l);
    const m = t.match(/spac(?:ing|ed)\s*:?\s*(?:of\s*)?(\d(?:\.\d{1,2})?)/i) ?? t.match(/(\d(?:\.\d{1,2})?)\s*(?:line\s*)?spac/i);
    if (m?.[1]) {
      const v = Number(m[1]);
      if (v >= 1 && v <= 3) return sourced(v, l);
    }
  }
  return undefined;
}

function detectJustified(lines: BriefLine[]): Sourced<boolean> | undefined {
  const j = lines.find((l) => /\bjustif(y|ied|ication)\b/i.test(l.text) && /align|paragraph|text|justified/i.test(l.text));
  if (j) return sourced(true, j);
  const left = lines.find((l) => /\b(left[- ]aligned|align(ed)?\s*left)\b/i.test(l.text) && !/page\s*num/i.test(l.text));
  return left ? sourced(false, left) : undefined;
}

function detectPageNumber(lines: BriefLine[]): Sourced<PageNumberPosition> | undefined {
  const l = lines.find((x) => /page\s*number/i.test(x.text));
  if (!l) return undefined;
  const t = l.text.toLowerCase();
  if (/\bno page number|without page number/.test(t)) return sourced('none', l);
  const top = /\btop\b|header/.test(t);
  const side = /\bright\b/.test(t) ? 'right' : /\bleft\b/.test(t) ? 'left' : /\bcent(er|re)|middle/.test(t) ? 'center' : 'right';
  if (top) return sourced('top-right', l);
  return sourced(`bottom-${side}` as PageNumberPosition, l);
}

function detectPaper(lines: BriefLine[]): Sourced<'A4' | 'Letter'> | undefined {
  const l = lines.find((x) => /\b(paper|page)\s*(size)?\b/i.test(x.text) && /\b(A4|letter)\b/i.test(x.text));
  if (l) return sourced(/\bA4\b/i.test(l.text) ? 'A4' : 'Letter', l);
  const a4 = lines.find((x) => /\bA4\s*(paper|size)\b/i.test(x.text));
  return a4 ? sourced('A4', a4) : undefined;
}

function detectCoverColour(lines: BriefLine[]): FormatRules['coverColour'] {
  const names = Object.keys(COLOUR_NAMES).sort((a, b) => b.length - a.length);
  for (const l of lines) {
    const t = l.text.toLowerCase();
    if (!/cover/.test(t) || !/colou?r|coloured|in (light )?\w+ (paper|colour)/.test(t)) continue;
    const name = names.find((n) => new RegExp(`\\b${n}\\b`).test(t));
    if (name) return sourced({ name, hex: COLOUR_NAMES[name]! }, l);
  }
  return undefined;
}

function detectMaxPages(lines: BriefLine[]): Sourced<number> | undefined {
  for (const l of lines) {
    const m =
      l.text.match(/max(?:imum)?\.?\s*(?:of\s*)?(\d{1,3})\s*pages?/i) ??
      l.text.match(/(?:not\s+exceed(?:ing)?|no more than|up to|limit(?:ed)? to)\s*(\d{1,3})\s*pages?/i) ??
      l.text.match(/(\d{1,3})\s*pages?\s*(?:max(?:imum)?|only|limit)/i) ??
      l.text.match(/page\s*limit\s*:?\s*(\d{1,3})/i);
    if (m?.[1]) return sourced(Number(m[1]), l);
  }
  return undefined;
}

function detectDueDate(lines: BriefLine[]): Sourced<string> | undefined {
  for (const l of lines) {
    if (!/\b(due|deadline|submission date|submit (by|before|on)|date of submission)\b/i.test(l.text)) continue;
    const iso = parseDate(l.text);
    if (iso) return sourced(iso, l);
  }
  return undefined;
}

export function detectFormat(lines: BriefLine[]): FormatRules {
  const usable = lines.filter((l) => !l.repeated);
  const font = detectFont(usable);
  const rules: FormatRules = {};
  if (font) rules.font = font;
  const size = detectSize(usable, font?.value);
  if (size) rules.fontSizePt = size;
  const spacing = detectSpacing(usable);
  if (spacing) rules.lineSpacing = spacing;
  const justified = detectJustified(usable);
  if (justified) rules.justified = justified;
  const pageNumber = detectPageNumber(usable);
  if (pageNumber) rules.pageNumber = pageNumber;
  const paper = detectPaper(usable);
  if (paper) rules.paper = paper;
  const cover = detectCoverColour(usable);
  if (cover) rules.coverColour = cover;
  const maxPages = detectMaxPages(usable);
  if (maxPages) rules.maxPages = maxPages;
  const due = detectDueDate(usable);
  if (due) rules.dueDate = due;
  return rules;
}
