/**
 * Merge a rubric .docx into the generated template as its final section, unchanged:
 * same content, page size/orientation/margins, fonts, spacing and table formatting.
 *
 * The template's last section holds a placeholder paragraph; it is replaced by the
 * rubric's <w:body> content (everything before its final <w:sectPr>).
 */
import { RUBRIC_PLACEHOLDER } from './constants';
import { attr, inner, mergeProps, PPR_ORDER, RPR_ORDER, topLevel } from './xml';
import { getText, readZip, repackZip } from './zip';

type Files = Map<string, Uint8Array | string>;

export const RUBRIC_STYLES = { body: 'RubricBody', cell: 'RubricCell' } as const;

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  svg: 'image/svg+xml',
};

const TABLE_GRID =
  '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/>' +
  '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>' +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('') +
  '</w:tblBorders></w:tblPr></w:style>';

/** Remove revision-tracking ids and other noise Word adds. */
export function stripNoise(xml: string): string {
  return xml
    .replace(/\s(?:w14:paraId|w14:textId|w:rsid\w*)="[^"]*"/g, '')
    .replace(/<w:proofErr\b[^>]*\/>/g, '')
    .replace(/<w:bookmarkStart w:id="\d+" w:name="_GoBack"\/>/g, '')
    .replace(/<w:commentRangeStart\b[^>]*\/>|<w:commentRangeEnd\b[^>]*\/>/g, '')
    .replace(/<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:commentReference\b[^>]*\/><\/w:r>/g, '')
    .replace(/<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<w:footnoteReference\b[^>]*\/><\/w:r>/g, '');
}

/** Drop w14/w15/w16* attributes and elements (for parts whose roots may not declare them). */
function stripExtNs(xml: string): string {
  return xml
    .replace(/\s(?:w14|w15|w16\w*):[\w]+="[^"]*"/g, '')
    .replace(/<(w14|w15|w16\w*):[\w]+\b[^>]*\/>/g, '')
    .replace(/<(w14|w15|w16\w*):([\w]+)\b[^>]*>[\s\S]*?<\/\1:\2>/g, '');
}

export interface ThemeFonts {
  minor: string;
  major: string;
  /** Keep theme attributes on w:rFonts (when the template carries the rubric's theme). */
  keepTheme?: boolean;
}

export function readThemeFonts(themeXml: string | undefined): ThemeFonts {
  const minor = themeXml?.match(/<a:minorFont>\s*<a:latin typeface="([^"]*)"/)?.[1] || 'Calibri';
  const major = themeXml?.match(/<a:majorFont>\s*<a:latin typeface="([^"]*)"/)?.[1] || minor;
  return { minor, major };
}

/**
 * Add concrete font names next to theme font references (w:asciiTheme="minorHAnsi" → w:ascii="Aptos").
 * With keepTheme the theme attributes stay too, so Word resolves (and falls back) exactly as in
 * the original rubric, while apps without theme support still get a font name.
 */
export function resolveThemeFonts(xml: string, fonts: ThemeFonts, keepTheme = fonts.keepTheme ?? false): string {
  return xml.replace(/<w:rFonts\b([^>]*)\/>/g, (el, attrs: string) => {
    if (!/Theme=/i.test(attrs)) return el;
    const vals = new Map<string, string>();
    for (const m of attrs.matchAll(/w:(\w+)="([^"]*)"/g)) vals.set(m[1]!, m[2]!);
    for (const slot of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
      const theme = vals.get(`${slot}Theme`) ?? (slot === 'cs' ? vals.get('cstheme') : undefined);
      if (theme && !vals.has(slot)) vals.set(slot, theme.startsWith('major') ? fonts.major : fonts.minor);
    }
    if (!keepTheme) for (const k of [...vals.keys()]) if (/theme$/i.test(k)) vals.delete(k);
    const order = ['ascii', 'eastAsia', 'hAnsi', 'cs', 'hint', 'asciiTheme', 'eastAsiaTheme', 'hAnsiTheme', 'cstheme'];
    const out = [...vals.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, v]) => ` w:${k}="${v}"`).join('');
    return `<w:rFonts${out}/>`;
  });
}

function stylesById(stylesXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of stylesXml.matchAll(/<w:style\b[^>]*>[\s\S]*?<\/w:style>/g)) {
    const id = m[0].match(/w:styleId="([^"]+)"/)?.[1];
    if (id) map.set(id, m[0]);
  }
  return map;
}

/** Ensure explicit spacing / alignment so the template's own defaults don't leak into the rubric. */
function pinParagraphProps(pPr: string): string {
  const kids = topLevel(pPr);
  const spacing = kids.find((k) => k.name === 'w:spacing')?.xml;
  let sp = spacing ?? '<w:spacing/>';
  const ensure = (a: string, v: string) => {
    if (!new RegExp(`\\sw:${a}=`).test(sp)) sp = sp.replace(/\/>$/, ` w:${a}="${v}"/>`);
  };
  ensure('before', '0');
  ensure('after', '0');
  ensure('line', '240');
  ensure('lineRule', 'auto');
  const extra = kids.some((k) => k.name === 'w:jc') ? '' : '<w:jc w:val="left"/>';
  const ind = kids.some((k) => k.name === 'w:ind') ? '' : '<w:ind w:left="0" w:right="0" w:firstLine="0"/>';
  return mergeProps(PPR_ORDER, pPr, sp, extra, ind);
}

/** Build the Rubric Body / Rubric Cell paragraph styles from the rubric's own defaults. */
export function rubricStyles(rubricStylesXml: string, fonts: ThemeFonts): string {
  const defaults = inner(rubricStylesXml, 'w:docDefaults') ?? '';
  const defR = inner(inner(defaults, 'w:rPrDefault') ?? '', 'w:rPr');
  const defP = inner(inner(defaults, 'w:pPrDefault') ?? '', 'w:pPr');
  const styles = stylesById(rubricStylesXml);
  const normal = [...styles.values()].find((s) => /w:type="paragraph"/.test(s) && /w:default="1"/.test(s));
  const normalR = normal ? inner(normal, 'w:rPr') : undefined;
  const normalP = normal ? inner(normal.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, ''), 'w:pPr') : undefined;
  const grid = styles.get('TableGrid');
  const gridP = grid ? inner(grid, 'w:pPr') : undefined;

  let rPr = mergeProps(RPR_ORDER, defR, normalR);
  if (!/<w:rFonts/.test(rPr)) rPr = mergeProps(RPR_ORDER, rPr, `<w:rFonts w:ascii="${fonts.minor}" w:hAnsi="${fonts.minor}" w:cs="${fonts.minor}"/>`);
  if (!/<w:sz\b/.test(rPr)) rPr = mergeProps(RPR_ORDER, rPr, '<w:sz w:val="22"/><w:szCs w:val="22"/>');
  rPr = mergeProps(RPR_ORDER, rPr, /<w:color\b/.test(rPr) ? '' : '<w:color w:val="000000"/>');
  rPr = resolveThemeFonts(rPr, fonts);
  const bodyP = pinParagraphProps(mergeProps(PPR_ORDER, defP, normalP));
  const cellP = pinParagraphProps(mergeProps(PPR_ORDER, defP, normalP, gridP));
  const style = (id: string, name: string, pPr: string) =>
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:qFormat/>` +
    `<w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  return style(RUBRIC_STYLES.body, 'Rubric Body', bodyP) + style(RUBRIC_STYLES.cell, 'Rubric Cell', cellP);
}

/**
 * Give every rubric paragraph without its own style (or with the default "Normal" style)
 * the Rubric Body / Rubric Cell style, so the template's Normal formatting doesn't apply.
 */
export function assignRubricStyles(content: string, defaultStyleIds: string[] = ['Normal']): string {
  let depth = 0;
  return content.replace(/<w:tbl>|<\/w:tbl>|<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>(?:<w:pPr>((?:(?!<\/w:pPr>)[\s\S])*)<\/w:pPr>)?/g, (m, pPr: string | undefined) => {
    if (m === '<w:tbl>') {
      depth++;
      return m;
    }
    if (m === '</w:tbl>') {
      depth--;
      return m;
    }
    const id = depth > 0 ? RUBRIC_STYLES.cell : RUBRIC_STYLES.body;
    const styleEl = `<w:pStyle w:val="${id}"/>`;
    if (m.endsWith('/>') && !m.includes('<w:pPr>')) return `${m.slice(0, -2)}><w:pPr>${styleEl}</w:pPr></w:p>`;
    const open = m.match(/^<w:p(?:\s[^>]*)?>/)![0];
    if (pPr === undefined) return `${open}<w:pPr>${styleEl}</w:pPr>`;
    const existing = pPr.match(/^<w:pStyle w:val="([^"]+)"\/>/)?.[1];
    if (existing && !defaultStyleIds.includes(existing)) return m;
    const rest = existing ? pPr.replace(/^<w:pStyle w:val="[^"]+"\/>/, '') : pPr;
    return `${open}<w:pPr>${styleEl}${rest}</w:pPr>`;
  });
}

function parseRels(xml: string | undefined): Map<string, { type: string; target: string; external: boolean }> {
  const map = new Map<string, { type: string; target: string; external: boolean }>();
  for (const m of (xml ?? '').matchAll(/<Relationship\b[^>]*\/>/g)) {
    const el = m[0];
    const id = el.match(/\sId="([^"]+)"/)?.[1];
    const type = el.match(/\sType="([^"]+)"/)?.[1];
    const target = el.match(/\sTarget="([^"]+)"/)?.[1];
    if (id && type && target) map.set(id, { type, target, external: /TargetMode="External"/.test(el) });
  }
  return map;
}

function addDefaultContentType(ct: string, ext: string): string {
  const type = CONTENT_TYPES[ext.toLowerCase()];
  if (!type || new RegExp(`Extension="${ext}"`, 'i').test(ct)) return ct;
  return ct.replace('<Override', `<Default Extension="${ext}" ContentType="${type}"/><Override`);
}

/** Merge rubric files into the template files (mutates `files`). */
export function mergeRubricFiles(files: Files, rubric: Files): void {
  const rDoc = getText(rubric, 'word/document.xml');
  if (!rDoc) throw new Error('The rubric file is not a valid Word document.');
  let doc = getText(files, 'word/document.xml')!;
  let styles = getText(files, 'word/styles.xml')!;
  let rels = getText(files, 'word/_rels/document.xml.rels')!;
  let ct = getText(files, '[Content_Types].xml')!;
  const rTheme = getText(rubric, 'word/theme/theme1.xml');
  const fonts = readThemeFonts(rTheme);
  // The template has no theme of its own: carry the rubric's theme so its theme fonts resolve
  // (and fall back when not installed) exactly as in the original file.
  if (rTheme && !files.has('word/theme/theme1.xml')) {
    files.set('word/theme/theme1.xml', rTheme);
    rels = rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdRubricTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>',
    );
    ct = ct.replace('</Types>', '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>');
    fonts.keepTheme = true;
  }
  const rStyles = getText(rubric, 'word/styles.xml') ?? '';

  // 1. Rubric body content (minus the final sectPr).
  const body = rDoc.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1] ?? '';
  const finalSect = body.match(/<w:sectPr\b[^>]*>(?:(?!<w:sectPr\b)[\s\S])*<\/w:sectPr>\s*$/)?.[0] ?? '';
  let content = finalSect ? body.slice(0, body.length - finalSect.length) : body;
  content = stripNoise(content).replace(/<w:(?:header|footer)Reference\b[^>]*\/>/g, '');
  content = resolveThemeFonts(content, fonts);
  const rubricDefaultStyle = [...stylesById(rStyles).entries()].find(([, s]) => /w:type="paragraph"/.test(s) && /w:default="1"/.test(s))?.[0] ?? 'Normal';
  content = assignRubricStyles(content, [...new Set(['Normal', rubricDefaultStyle])]);

  // 2. Relationships (images, hyperlinks, embedded parts): copy with new ids.
  const rRels = parseRels(getText(rubric, 'word/_rels/document.xml.rels'));
  const idMap = new Map<string, string>();
  let n = 0;
  const usedIds = new Set([...rels.matchAll(/\sId="([^"]+)"/g)].map((m) => m[1]!));
  for (const m of content.matchAll(/\sr:(?:embed|id|link|pict|dm|lo|qs|cs)="([^"]+)"/g)) {
    const old = m[1]!;
    if (idMap.has(old)) continue;
    const rel = rRels.get(old);
    if (!rel) continue;
    let newId: string;
    do newId = `rIdRubric${++n}`;
    while (usedIds.has(newId));
    usedIds.add(newId);
    idMap.set(old, newId);
    let target = rel.target;
    if (!rel.external) {
      const srcPath = target.startsWith('/') ? target.slice(1) : `word/${target}`;
      const data = rubric.get(srcPath);
      if (data !== undefined) {
        const dir = target.includes('/') ? target.slice(0, target.lastIndexOf('/') + 1) : '';
        const base = target.slice(target.lastIndexOf('/') + 1);
        target = `${dir}rubric_${base}`;
        files.set(`word/${target}`, data);
        const ext = base.split('.').pop() ?? '';
        ct = addDefaultContentType(ct, ext);
        const override = getText(rubric, '[Content_Types].xml')?.match(new RegExp(`<Override PartName="/${srcPath.replace(/[.]/g, '\\.')}" ContentType="([^"]+)"/>`))?.[1];
        if (override) ct = ct.replace('</Types>', `<Override PartName="/word/${target}" ContentType="${override}"/></Types>`);
      }
    }
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${newId}" Type="${rel.type}" Target="${target}"${rel.external ? ' TargetMode="External"' : ''}/></Relationships>`,
    );
  }
  content = content.replace(/(\sr:(?:embed|id|link|pict|dm|lo|qs|cs)=")([^"]+)"/g, (all, pre: string, id: string) => (idMap.has(id) ? `${pre}${idMap.get(id)}"` : all));

  // 3. Numbering: copy referenced definitions with offset ids.
  const numIds = new Set([...content.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => Number(m[1])).filter((x) => x > 0));
  const rNumbering = getText(rubric, 'word/numbering.xml');
  if (numIds.size && rNumbering) {
    const OFFSET = 1000;
    let numbering = getText(files, 'word/numbering.xml');
    if (!numbering) {
      numbering = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';
      rels = rels.replace('</Relationships>', '<Relationship Id="rIdRubricNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>');
      ct = ct.replace('</Types>', '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>');
    }
    const nums: string[] = [];
    const absIds = new Set<number>();
    for (const m of rNumbering.matchAll(/<w:num w:numId="(\d+)"[^>]*>[\s\S]*?<\/w:num>/g)) {
      const id = Number(m[1]);
      if (!numIds.has(id)) continue;
      const abs = Number(attr(m[0], 'w:abstractNumId', 'w:val'));
      absIds.add(abs);
      nums.push(
        stripExtNs(m[0])
          .replace(/w:numId="\d+"/, `w:numId="${id + OFFSET}"`)
          .replace(/<w:abstractNumId w:val="\d+"\/>/, `<w:abstractNumId w:val="${abs + OFFSET}"/>`),
      );
    }
    const abstracts: string[] = [];
    for (const m of rNumbering.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>[\s\S]*?<\/w:abstractNum>/g)) {
      const id = Number(m[1]);
      if (!absIds.has(id)) continue;
      abstracts.push(resolveThemeFonts(stripExtNs(stripNoise(m[0])), fonts).replace(/w:abstractNumId="\d+"/, `w:abstractNumId="${id + OFFSET}"`));
    }
    const firstNum = numbering.search(/<w:num\s/);
    numbering =
      firstNum >= 0
        ? numbering.slice(0, firstNum) + abstracts.join('') + numbering.slice(firstNum)
        : numbering.replace('</w:numbering>', abstracts.join('') + '</w:numbering>');
    numbering = numbering.replace('</w:numbering>', nums.join('') + '</w:numbering>');
    files.set('word/numbering.xml', numbering);
    content = content.replace(/<w:numId w:val="(\d+)"\/>/g, (all, v: string) => (Number(v) > 0 ? `<w:numId w:val="${Number(v) + OFFSET}"/>` : all));
  }

  // 4. Styles: Rubric Body / Rubric Cell, plus any style the rubric uses that the template lacks.
  const baseStyles = stylesById(styles);
  const rubricStyleMap = stylesById(rStyles);
  const needed = new Set<string>();
  const want = (id: string) => {
    if (needed.has(id) || baseStyles.has(id)) return;
    const s = rubricStyleMap.get(id);
    if (!s) {
      if (id === 'TableGrid') needed.add(id);
      return;
    }
    needed.add(id);
    const basedOn = s.match(/<w:basedOn w:val="([^"]+)"/)?.[1];
    if (basedOn) want(basedOn);
    const link = s.match(/<w:link w:val="([^"]+)"/)?.[1];
    if (link) want(link);
  };
  for (const m of content.matchAll(/<w:(?:pStyle|rStyle|tblStyle)\s+w:val="([^"]+)"\/>/g)) {
    if (m[1] !== RUBRIC_STYLES.body && m[1] !== RUBRIC_STYLES.cell) want(m[1]!);
  }
  const copied = [...needed].map((id) => {
    const s = rubricStyleMap.get(id);
    return s ? resolveThemeFonts(stripExtNs(stripNoise(s)), fonts) : TABLE_GRID;
  });
  styles = styles.replace('</w:styles>', rubricStyles(rStyles, fonts) + copied.join('') + '</w:styles>');

  // 4b. Font table: copy the rubric's font descriptions (family, PANOSE, charset) so Word substitutes
  //     missing fonts the same way it does for the original (e.g. Aptos → Calibri, not Cambria).
  const rFontTable = getText(rubric, 'word/fontTable.xml');
  const baseFontTable = getText(files, 'word/fontTable.xml');
  if (rFontTable && baseFontTable) {
    const have = new Set([...baseFontTable.matchAll(/<w:font w:name="([^"]+)"/g)].map((m) => m[1]!));
    const add = [...rFontTable.matchAll(/<w:font w:name="([^"]+)"[^>]*>[\s\S]*?<\/w:font>/g)]
      .filter((m) => !have.has(m[1]!))
      .map((m) => stripExtNs(m[0]).replace(/<w:embed(?:Regular|Bold|Italic|BoldItalic)\b[^>]*\/>/g, ''));
    if (add.length) {
      // The docx library writes an empty, self-closing <w:fonts …/> root.
      const merged = /<\/w:fonts>\s*$/.test(baseFontTable)
        ? baseFontTable.replace(/<\/w:fonts>\s*$/, `${add.join('')}</w:fonts>`)
        : baseFontTable.replace(/<w:fonts\b([^>]*?)\s*\/>\s*$/, `<w:fonts$1>${add.join('')}</w:fonts>`);
      files.set('word/fontTable.xml', merged);
    }
  }

  // 5. Replace the placeholder paragraph.
  const at = doc.indexOf(RUBRIC_PLACEHOLDER);
  if (at < 0) throw new Error('Rubric placeholder not found in the template.');
  const pStart = Math.max(doc.lastIndexOf('<w:p>', at), doc.lastIndexOf('<w:p ', at));
  const pEnd = doc.indexOf('</w:p>', at) + '</w:p>'.length;
  doc = doc.slice(0, pStart) + content + doc.slice(pEnd);

  // 6. Final section takes the rubric's page size, orientation and margins.
  if (finalSect) {
    const pgSz = finalSect.match(/<w:pgSz\b[^>]*\/>/)?.[0];
    const pgMar = finalSect.match(/<w:pgMar\b[^>]*\/>/)?.[0];
    const lastSectAt = doc.lastIndexOf('<w:sectPr');
    let last = doc.slice(lastSectAt);
    if (pgSz) last = last.replace(/<w:pgSz\b[^>]*\/>/, pgSz);
    if (pgMar) last = last.replace(/<w:pgMar\b[^>]*\/>/, pgMar);
    doc = doc.slice(0, lastSectAt) + last;
  }

  // 7. Namespaces used by the rubric content must be declared on the template's root.
  const rRoot = rDoc.match(/<w:document\b[^>]*>/)?.[0] ?? '';
  let root = doc.match(/<w:document\b[^>]*>/)![0];
  const newRoot = root;
  for (const m of rRoot.matchAll(/\sxmlns:(\w+)="([^"]+)"/g)) {
    if (!new RegExp(`\\sxmlns:${m[1]}=`).test(root)) root = root.replace(/>$/, ` xmlns:${m[1]}="${m[2]}">`);
  }
  const declared = new Set([...root.matchAll(/\sxmlns:(\w+)=/g)].map((m) => m[1]!));
  const ignorable = new Set([...(attr(root, 'w:document', 'mc:Ignorable') ?? '').split(/\s+/), ...(attr(rRoot, 'w:document', 'mc:Ignorable') ?? '').split(/\s+/)].filter((p) => p && declared.has(p)));
  root = /\smc:Ignorable="/.test(root) ? root.replace(/\smc:Ignorable="[^"]*"/, ` mc:Ignorable="${[...ignorable].join(' ')}"`) : root;
  doc = doc.replace(newRoot, root);

  files.set('word/document.xml', doc);
  files.set('word/styles.xml', styles);
  files.set('word/_rels/document.xml.rels', rels);
  files.set('[Content_Types].xml', ct);
}

/** Merge a rubric .docx into a template .docx (spec-level API). */
export async function mergeRubric(base: ArrayBuffer | Uint8Array | Blob, rubricDocx: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const baseBytes = base instanceof Blob ? new Uint8Array(await base.arrayBuffer()) : base;
  const files = await readZip(baseBytes);
  mergeRubricFiles(files, await readZip(rubricDocx));
  return repackZip(files);
}
