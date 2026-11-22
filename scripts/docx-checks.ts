/**
 * Shared .docx checks used by `npm run validate:docx` and the Playwright e2e tests:
 * zip/XML validity, document structure, PDF conversion (LibreOffice or Word) and page order.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { effectiveHeadings, TOC_TITLE } from '../src/lib/generate';
import type { PdfjsLike } from '../src/lib/extract/pdf';
import type { TemplateConfig } from '../src/lib/types';

const SCRIPTS = import.meta.dirname;

export type Check = { name: string; ok: boolean; detail?: string; skipped?: boolean };

// ---------- tools ----------
export function findSoffice(): string | null {
  for (const c of [
    'soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
  ]) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
}
export function hasWord(): boolean {
  if (process.platform !== 'win32') return false;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', "if (Test-Path 'HKLM:\\SOFTWARE\\Classes\\Word.Application') { 'yes' }"], { encoding: 'utf8' });
  return r.stdout.trim() === 'yes';
}
export function findPdftotext(): string | null {
  for (const c of ['pdftotext', 'C:\\Program Files\\Git\\ucrt64\\bin\\pdftotext.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe']) {
    const r = spawnSync(c, ['-v'], { encoding: 'utf8' });
    if (r.error) continue;
    if (r.status === 0 || /pdftotext/i.test(`${r.stdout ?? ''}${r.stderr ?? ''}`)) return c;
  }
  return null;
}

// ---------- checks ----------
export async function checkZip(bytes: Uint8Array): Promise<Check[]> {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  const checks: Check[] = [];
  const dirs = entries.filter((e) => e.dir).map((e) => e.name);
  checks.push({ name: 'zip has no directory entries', ok: dirs.length === 0, detail: dirs.join(', ') });
  const bad: string[] = [];
  for (const e of entries) {
    if (e.dir || !/\.(xml|rels)$/.test(e.name)) continue;
    const res = XMLValidator.validate(await e.async('string'));
    if (res !== true) bad.push(`${e.name}: ${res.err.msg} (line ${res.err.line})`);
  }
  checks.push({ name: 'all XML parts are well-formed', ok: bad.length === 0, detail: bad.join('; ') });
  return checks;
}

export async function checkStructure(bytes: Uint8Array, config: TemplateConfig): Promise<Check[]> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = await zip.file('word/document.xml')!.async('string');
  const settings = await zip.file('word/settings.xml')!.async('string');
  const sections = doc.match(/<w:sectPr\b/g)?.length ?? 0;
  const expectedSections = config.rubric.kind === 'none' ? 2 : 3;
  const h1 = effectiveHeadings(config).filter((h) => h.level === 1);
  const h1Paras = [...doc.matchAll(/<w:p><w:pPr><w:pStyle w:val="Heading1"\/>(<w:pageBreakBefore\/>)?/g)];
  const lastSect = doc.slice(doc.lastIndexOf('<w:sectPr'));
  const checks: Check[] = [
    { name: `${expectedSections} sections (cover | TOC + body${config.rubric.kind === 'none' ? '' : ' | rubric'})`, ok: sections >= expectedSections, detail: `found ${sections}` },
    { name: 'cover section has titlePg (no page number)', ok: /<w:titlePg\/>/.test(doc.slice(0, doc.indexOf('</w:sectPr>'))) },
    { name: 'TOC field covers Heading 1–2', ok: /TOC \\h \\o &quot;1-2&quot;/.test(doc) },
    { name: 'updateFields is on', ok: /<w:updateFields\b/.test(settings) },
    { name: `${h1.length} Heading 1 paragraphs`, ok: h1Paras.length === h1.length, detail: `found ${h1Paras.length}` },
    {
      name: config.onePartPerPage ? 'every H1 has pageBreakBefore' : 'first heading breaks after TOC',
      ok: config.onePartPerPage ? h1Paras.every((m) => m[1]) : true,
    },
    { name: 'no ShadingType.SOLID', ok: !/w:val="solid"/.test(doc) },
    { name: 'no percentage table widths', ok: !/w:type="pct"/.test(doc) },
  ];
  if (config.rubric.kind !== 'none') {
    const landscape = /w:orient="landscape"/.test(lastSect);
    const expectLandscape = config.rubric.kind === 'pdf-pages' ? config.rubric.landscape : true;
    checks.push({ name: `rubric section is ${expectLandscape ? 'landscape' : 'portrait'}`, ok: landscape === expectLandscape });
  }
  return checks;
}

export function toPdf(docx: string, soffice: string | null, word: boolean): { pdf: string | null; via: string } {
  const pdf = docx.replace(/\.docx$/, '.pdf');
  if (soffice) {
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dirname(docx), docx], { stdio: 'ignore', timeout: 120000 });
    return { pdf: existsSync(pdf) ? pdf : null, via: 'LibreOffice' };
  }
  if (word) {
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(SCRIPTS, 'word-to-pdf.ps1'), '-In', docx, '-Out', pdf], {
      stdio: 'pipe',
      timeout: 180000,
    });
    return { pdf: existsSync(pdf) ? pdf : null, via: 'Microsoft Word' };
  }
  return { pdf: null, via: 'none' };
}

export const norm = (s: string) => s.replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

export async function checkPdf(pdf: string, pdftotext: string, config: TemplateConfig, rubricMarker: string | null): Promise<Check[]> {
  const text = execFileSync(pdftotext, ['-layout', pdf, '-'], { encoding: 'utf8' });
  const pages = text.split('\f').filter((p, i, arr) => i < arr.length - 1 || p.trim());
  const firstLine = (p: string) => norm(p.split('\n').find((l) => l.trim()) ?? '');
  const has = (p: string | undefined, s: string) => !!p && norm(p).includes(norm(s));
  const checks: Check[] = [];
  const cover = pages[0] ?? '';
  checks.push({
    name: 'page 1 is the cover',
    ok: has(cover, 'Student ID') && (!config.cover.subjectCode || has(cover, config.cover.subjectCode)),
    detail: firstLine(cover),
  });
  checks.push({ name: 'page 2 is the TOC', ok: firstLine(pages[1] ?? '') === norm(TOC_TITLE), detail: firstLine(pages[1] ?? '') });
  // TOC lists every heading.
  const hs = effectiveHeadings(config);
  const missingToc = hs.filter((h) => !has(pages[1], h.text.slice(0, 30)));
  checks.push({ name: 'TOC lists every heading', ok: missingToc.length === 0, detail: missingToc.map((h) => h.text).join(' | ') });

  const h1 = hs.filter((h) => h.level === 1);
  // With "one part per page" each H1 must be the first line of its page; otherwise H1s flow, so just find them in order.
  const pageOf = config.onePartPerPage
    ? h1.map((h) => pages.findIndex((p, i) => i >= 2 && firstLine(p).startsWith(norm(h.text).slice(0, 40))))
    : h1.map((h) => pages.findIndex((p, i) => i >= 2 && has(p, h.text.slice(0, 40))));
  const missing = h1.filter((_, i) => pageOf[i]! < 0).map((h) => h.text);
  checks.push({
    name: config.onePartPerPage ? 'every H1 is found at the top of a page' : 'every H1 is in the body (flowing)',
    ok: missing.length === 0,
    detail: missing.join(' | '),
  });
  if (!config.onePartPerPage) {
    const inOrder = pageOf.every((p, i) => i === 0 || p >= pageOf[i - 1]!);
    checks.push({ name: 'body starts on page 3, headings in order', ok: inOrder && pageOf[0] === 2, detail: `pages ${pageOf.map((p) => p + 1).join(', ')}` });
  }
  if (config.onePartPerPage) {
    const consecutive = pageOf.every((p, i) => i === 0 || p > pageOf[i - 1]!);
    checks.push({ name: 'each H1 starts its own page, in order', ok: consecutive && pageOf[0] === 2, detail: `pages ${pageOf.map((p) => p + 1).join(', ')}` });
  }
  if (rubricMarker) {
    const rubricPage = pages.findIndex((p) => has(p, rubricMarker));
    const lastH1 = Math.max(...pageOf);
    checks.push({
      name: 'rubric is last, after the report body',
      ok: rubricPage > lastH1 && pages.slice(rubricPage).every((p) => !h1.some((h) => firstLine(p).startsWith(norm(h.text).slice(0, 40)))),
      detail: `rubric starts on page ${rubricPage + 1} of ${pages.length}`,
    });
    // Orientation of the rubric pages.
    const doc = await (pdfjs as unknown as PdfjsLike).getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 }).promise;
    const vp = (await doc.getPage(rubricPage + 1)).getViewport({ scale: 1 });
    const want = config.rubric.kind === 'pdf-pages' ? config.rubric.landscape : true;
    checks.push({ name: `rubric page is ${want ? 'landscape' : 'portrait'} in the PDF`, ok: vp.width > vp.height === want, detail: `${Math.round(vp.width)}x${Math.round(vp.height)}` });
    await doc.destroy();
  }
  checks.push({ name: 'page count', ok: true, detail: `${pages.length} pages` });
  return checks;
}


export interface FullCheckOptions {
  /** Text that marks the first rubric page (null when there is no rubric). */
  rubricMarker: string | null;
  /** Convert to PDF and check page order when a converter is available. */
  pdf?: boolean;
}

/** All checks for one generated .docx on disk. */
export async function checkDocxFile(file: string, config: TemplateConfig, opts: FullCheckOptions): Promise<{ checks: Check[]; via: string }> {
  const bytes = new Uint8Array(readFileSync(file));
  const checks: Check[] = [...(await checkZip(bytes)), ...(await checkStructure(bytes, config))];
  let via = 'none';
  if (opts.pdf === false) return { checks, via };
  const soffice = findSoffice();
  const word = !soffice && hasWord();
  const pdftotext = findPdftotext();
  if (!soffice && !word) {
    checks.push({ name: 'PDF conversion', ok: true, skipped: true, detail: 'Install LibreOffice to run page-order checks' });
    return { checks, via };
  }
  try {
    const r = toPdf(file, soffice, word);
    via = r.via;
    checks.push({ name: `opens and converts to PDF (${r.via})`, ok: !!r.pdf });
    if (r.pdf && pdftotext) checks.push(...(await checkPdf(r.pdf, pdftotext, config, opts.rubricMarker)));
    else if (!pdftotext) checks.push({ name: 'pdftotext page-order checks', ok: true, skipped: true, detail: 'pdftotext not installed' });
  } catch (e) {
    checks.push({ name: `opens and converts to PDF (${soffice ? 'LibreOffice' : 'Word'})`, ok: false, detail: String((e as Error).message).slice(0, 300) });
  }
  return { checks, via };
}

/** Text of the first rubric page, used to find where the rubric starts in the PDF. */
export async function rubricMarkerFor(config: TemplateConfig, rubricDocx?: Uint8Array): Promise<string | null> {
  if (config.rubric.kind === 'pdf-pages') return config.rubric.before?.find((t) => /rubric/i.test(t)) ?? config.rubric.rows?.[0]?.find(Boolean) ?? null;
  if (rubricDocx) {
    const z = await JSZip.loadAsync(rubricDocx);
    const xml = await z.file('word/document.xml')!.async('string');
    return (xml.match(/<w:t(?:\s[^>]*)?>([^<]{4,})<\/w:t>/)?.[1] ?? '').trim() || null;
  }
  return null;
}
