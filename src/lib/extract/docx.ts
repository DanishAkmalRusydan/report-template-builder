import JSZip from 'jszip';

export interface DocxParagraph {
  text: string;
  isBold: boolean;
  styleName?: string;
  inTable: boolean;
  /** 0-based cell column within its table row. */
  tableCol?: number;
  /** 0-based row index within its table. */
  tableRow?: number;
  /** Sequential id of the table (outermost tables count in document order). */
  tableId?: number;
}

export interface DocxExtract {
  paragraphs: DocxParagraph[];
}

type Bytes = ArrayBuffer | Uint8Array;

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** An on/off property like <w:b/>, <w:b w:val="0"/>, <w:b w:val="false"/>. */
function toggleOn(xml: string, tag: string): boolean | undefined {
  const m = xml.match(new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`));
  if (!m) return undefined;
  const v = m[1];
  return v === undefined || !['0', 'false', 'off'].includes(v);
}

interface StyleInfo {
  name: string;
  bold?: boolean;
  basedOn?: string;
}

function parseStyles(xml: string): Map<string, StyleInfo> {
  const map = new Map<string, StyleInfo>();
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const id = attrs.match(/w:styleId="([^"]+)"/)?.[1];
    if (!id) continue;
    const name = body.match(/<w:name w:val="([^"]+)"/)?.[1] ?? id;
    const rPr = body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
    map.set(id, {
      name,
      bold: toggleOn(rPr, 'b'),
      basedOn: body.match(/<w:basedOn w:val="([^"]+)"/)?.[1],
    });
  }
  return map;
}

function styleBold(styles: Map<string, StyleInfo>, id: string | undefined): boolean {
  let cur = id;
  for (let depth = 0; cur && depth < 10; depth++) {
    const s = styles.get(cur);
    if (!s) return false;
    if (s.bold !== undefined) return s.bold;
    cur = s.basedOn;
  }
  return false;
}

/** Text of one run, treating <w:tab/> and <w:br/> as spaces. */
function runText(run: string): string {
  let out = '';
  for (const m of run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\s*\/>|<w:(tab|br|cr)\b[^>]*\/>/g)) {
    if (m[2]) out += ' ';
    else if (m[1] !== undefined) out += decodeXml(m[1]);
  }
  return out;
}

function parseParagraph(p: string, styles: Map<string, StyleInfo>): Omit<DocxParagraph, 'inTable'> {
  const pPr = p.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? '';
  const styleId = pPr.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
  const paraStyleBold = styleBold(styles, styleId);
  const runs = p.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [];
  let text = '';
  let boldChars = 0;
  let totalChars = 0;
  for (const r of runs) {
    const t = runText(r);
    if (!t) continue;
    text += t;
    const rPr = r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
    const rStyle = rPr.match(/<w:rStyle w:val="([^"]+)"/)?.[1];
    const runBold = toggleOn(rPr, 'b') ?? (rStyle ? styleBold(styles, rStyle) : undefined) ?? paraStyleBold;
    const visible = t.replace(/\s/g, '').length;
    totalChars += visible;
    if (runBold) boldChars += visible;
  }
  return {
    text: text.replace(/\s+/g, ' ').trim(),
    isBold: totalChars > 0 && boldChars / totalChars > 0.5,
    styleName: styleId ? (styles.get(styleId)?.name ?? styleId) : undefined,
  };
}

/**
 * Walk the document body in order. Tables are walked row by row and cell by cell
 * so paragraphs keep reading order and know their column.
 */
function walkBody(xml: string, styles: Map<string, StyleInfo>): DocxParagraph[] {
  const out: DocxParagraph[] = [];
  // Tokenise into the tags we care about, tracking nesting.
  const re = /<w:tbl>|<\/w:tbl>|<w:tr\b[^>]*>|<\/w:tr>|<w:tc>|<w:tc\b[^>]*>|<\/w:tc>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const stack: { row: number; col: number; id: number }[] = [];
  let tables = 0;
  for (const m of xml.matchAll(re)) {
    const tag = m[0];
    if (tag === '<w:tbl>') stack.push({ row: -1, col: -1, id: tables++ });
    else if (tag === '</w:tbl>') stack.pop();
    else if (tag.startsWith('<w:tr')) {
      const t = stack[stack.length - 1];
      if (t) {
        t.row += 1;
        t.col = -1;
      }
    } else if (tag.startsWith('<w:tc')) {
      const t = stack[stack.length - 1];
      if (t) t.col += 1;
    } else if (tag === '</w:tr>' || tag === '</w:tc>') {
      // no-op
    } else if (tag.startsWith('<w:p')) {
      if (tag.endsWith('/>')) continue;
      const para = parseParagraph(tag, styles);
      const t = stack[stack.length - 1];
      out.push({
        ...para,
        inTable: stack.length > 0,
        ...(t ? { tableCol: t.col, tableRow: t.row, tableId: stack[0]!.id } : {}),
      });
    }
  }
  return out;
}

/** Read word/document.xml and return its paragraphs in reading order. */
export async function extractDocx(data: Bytes): Promise<DocxExtract> {
  const zip = await JSZip.loadAsync(data);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('This file is not a valid Word document (word/document.xml missing).');
  const [docXml, stylesXml] = await Promise.all([
    docFile.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? Promise.resolve(''),
  ]);
  const body = docXml.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? docXml;
  return { paragraphs: walkBody(body, parseStyles(stylesXml)) };
}
