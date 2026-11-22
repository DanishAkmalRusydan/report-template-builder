import { expect, type Page } from '@playwright/test';
import type { TemplateConfig } from '../src/lib/types';

export interface Guards {
  consoleErrors: string[];
  requests: string[];
}

/** Record console errors, page errors and every network request the page makes. */
export function watchPage(page: Page): Guards {
  const g: Guards = { consoleErrors: [], requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') g.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => g.consoleErrors.push(`pageerror: ${e.message}`));
  page.on('request', (r) => g.requests.push(r.url()));
  return g;
}

/** Privacy: after load, the app may only talk to its own origin (plus in-memory data:/blob: URLs). */
export function foreignRequests(g: Guards, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  return g.requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
}

export async function uploadBrief(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel('Assignment brief').setInputFiles(file);
}

export async function expectBriefLoaded(page: Page) {
  await expect(page.getByRole('button', { name: 'Next: structure' })).toBeEnabled();
  await expect(page.getByText(/^Found \d+ parts?/)).toBeVisible();
}

export async function next(page: Page, label: 'Next: structure' | 'Next: format & cover' | 'Next: review') {
  await page.getByRole('button', { name: label }).click();
}

/** Click Download and save the file; returns its path and suggested file name. */
export async function downloadDocx(page: Page, dir: string): Promise<{ path: string; name: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .docx' }).click()]);
  const name = download.suggestedFilename();
  const path = `${dir}/${name}`;
  await download.saveAs(path);
  return { path, name };
}

/** The template config the app built (from its persisted store). */
export async function currentConfig(page: Page): Promise<TemplateConfig> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('rtb-builder') ?? '{}').state.config);
}

/** A valid one-page PDF with no text layer (like a scan without OCR). */
export function emptyPdf(): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${off.toString().padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}
