// Small string-level OOXML helpers (no DOM, so they run in Web Workers and Node alike).

export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface XmlChild {
  name: string;
  xml: string;
}

/** Top-level child elements of an XML fragment (handles nesting of same-named elements). */
export function topLevel(xml: string): XmlChild[] {
  const out: XmlChild[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    const m = /^<([\w:]+)(?:\s[^>]*?)?(\/?)>/.exec(xml.slice(lt));
    if (!m || xml[lt + 1] === '/' || xml[lt + 1] === '?' || xml[lt + 1] === '!') {
      i = lt + 1;
      continue;
    }
    const name = m[1]!;
    if (m[2] === '/') {
      out.push({ name, xml: m[0] });
      i = lt + m[0].length;
      continue;
    }
    const re = new RegExp(`<${name}(?=[\\s/>])[^>]*?(/?)>|</${name}>`, 'g');
    re.lastIndex = lt + m[0].length;
    let depth = 1;
    let mm: RegExpExecArray | null = null;
    while (depth > 0 && (mm = re.exec(xml))) {
      if (mm[0].startsWith('</')) depth--;
      else if (mm[1] !== '/') depth++;
    }
    const end = mm ? mm.index + mm[0].length : xml.length;
    out.push({ name, xml: xml.slice(lt, end) });
    i = end;
  }
  return out;
}

/** Schema order of w:rPr children (Word is strict about element order). */
export const RPR_ORDER = [
  'w:rStyle',
  'w:rFonts',
  'w:b',
  'w:bCs',
  'w:i',
  'w:iCs',
  'w:caps',
  'w:smallCaps',
  'w:strike',
  'w:dstrike',
  'w:outline',
  'w:shadow',
  'w:emboss',
  'w:imprint',
  'w:noProof',
  'w:snapToGrid',
  'w:vanish',
  'w:webHidden',
  'w:color',
  'w:spacing',
  'w:w',
  'w:kern',
  'w:position',
  'w:sz',
  'w:szCs',
  'w:highlight',
  'w:u',
  'w:effect',
  'w:bdr',
  'w:shd',
  'w:fitText',
  'w:vertAlign',
  'w:rtl',
  'w:cs',
  'w:em',
  'w:lang',
  'w:eastAsianLayout',
  'w:specVanish',
  'w:oMath',
];

/** Schema order of w:pPr children. */
export const PPR_ORDER = [
  'w:pStyle',
  'w:keepNext',
  'w:keepLines',
  'w:pageBreakBefore',
  'w:framePr',
  'w:widowControl',
  'w:numPr',
  'w:suppressLineNumbers',
  'w:pBdr',
  'w:shd',
  'w:tabs',
  'w:suppressAutoHyphens',
  'w:kinsoku',
  'w:wordWrap',
  'w:overflowPunct',
  'w:topLinePunct',
  'w:autoSpaceDE',
  'w:autoSpaceDN',
  'w:bidi',
  'w:adjustRightInd',
  'w:snapToGrid',
  'w:spacing',
  'w:ind',
  'w:contextualSpacing',
  'w:mirrorIndents',
  'w:suppressOverlap',
  'w:jc',
  'w:textDirection',
  'w:textAlignment',
  'w:textboxTightWrap',
  'w:outlineLvl',
  'w:divId',
  'w:cnfStyle',
  'w:rPr',
  'w:sectPr',
  'w:pPrChange',
];

/** Merge property children; later sources win per element name. Non-w: (e.g. w14:) children are dropped. */
export function mergeProps(order: string[], ...sources: (string | undefined)[]): string {
  const map = new Map<string, string>();
  for (const s of sources) {
    if (!s) continue;
    for (const c of topLevel(s)) if (c.name.startsWith('w:')) map.set(c.name, c.xml);
  }
  const rank = (n: string) => {
    const i = order.indexOf(n);
    return i < 0 ? order.length : i;
  };
  return [...map.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([, x]) => x)
    .join('');
}

/** Inner XML of the first <tag>…</tag> (non-self-closing), or undefined. */
export function inner(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m?.[1];
}

/** Read an attribute from the first matching element. */
export function attr(xml: string, tag: string, name: string): string | undefined {
  const el = xml.match(new RegExp(`<${tag}(?=[\\s/>])[^>]*>`))?.[0];
  return el?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}
