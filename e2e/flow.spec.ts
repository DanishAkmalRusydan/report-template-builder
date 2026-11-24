// 1. Upload each brief (+ rubric), go through all 4 steps, download, and run the
//    same checks as `npm run validate:docx` on the downloaded file.
// 4. No console errors, and no requests to any host other than the app's own.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { checkDocxFile, rubricMarkerFor } from '../scripts/docx-checks';
import { FIXTURES, ROOT, fixtureCases } from '../scripts/fixture-cases';
import { currentConfig, downloadDocx, expectBriefLoaded, foreignRequests, next, uploadBrief, watchPage } from './helpers';

// The bundled sample always runs (also in CI); real briefs in fixtures/ run when present locally.
const cases = [
  { brief: join(ROOT, 'public/samples/sample-brief.docx') },
  ...fixtureCases().map((c) => ({ brief: join(FIXTURES, c.brief), ...(c.rubricDocx ? { rubric: join(FIXTURES, c.rubricDocx) } : {}) })),
];

for (const c of cases) {
  const label = `${basename(c.brief)}${c.rubric ? ` + ${basename(c.rubric)}` : ''}`;

  test(`builds a valid template from ${label}`, async ({ page, baseURL }, testInfo) => {
    const guards = watchPage(page);
    await page.goto('/#/build');
    await expect(page.getByRole('heading', { name: 'Upload your brief' })).toBeVisible();

    // Step 1: upload.
    await uploadBrief(page, c.brief);
    await expectBriefLoaded(page);
    if (c.rubric) {
      await page.getByLabel('Rubric file (.docx or .pdf)').setInputFiles(c.rubric);
      await expect(page.getByText(/^Rubric added/)).toBeVisible();
    }

    const lab2 = basename(c.brief) === 'CAI20103_Lab2.pdf';
    if (lab2) {
      // The rubric inside the brief is used.
      await expect(page.getByTestId('rubric-status')).toContainText('The brief has a rubric (pages 8–9)');
    }

    // Steps 2–4.
    await next(page, 'Next: structure');
    await expect(page.getByRole('heading', { name: 'Check the structure' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Report headings' }).getByRole('listitem').first()).toBeVisible();
    await next(page, 'Next: format & cover');
    await expect(page.getByRole('heading', { name: 'Format & cover' })).toBeVisible();
    if (lab2) {
      // The brief's own cover sheet (page 10) is copied instead of generating one.
      await expect(page.getByTestId('exact-cover-note')).toBeVisible();
      await expect(page.getByText(/own cover sheet \(page 10\)/)).toBeVisible();
      await expect(page.getByTestId('copied-cover').getByText('Instructions to students:')).toBeVisible();
    }
    await next(page, 'Next: review');
    await expect(page.getByRole('heading', { name: 'Review & download' })).toBeVisible();

    // Live preview shows the cover, contents and the rubric when there is one.
    const preview = page.getByRole('complementary', { name: 'Live preview' });
    await expect(preview.getByRole('button', { name: /Page 1: Cover/ })).toBeVisible();
    await expect(preview.getByRole('button', { name: /Page 2: Contents/ })).toBeVisible();

    // Download.
    const config = await currentConfig(page);
    const { path, name } = await downloadDocx(page, testInfo.outputDir);
    expect(name).toMatch(/^[A-Za-z0-9_]+_Report_Template\.docx$/);
    await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();

    // Same checks as validate:docx (structure + PDF page order when a converter is installed).
    const rubricBytes = c.rubric ? new Uint8Array(readFileSync(c.rubric)) : undefined;
    const { checks } = await checkDocxFile(path, config, { rubricMarker: await rubricMarkerFor(config, rubricBytes) });
    for (const ch of checks) console.log(`   ${ch.skipped ? '–' : ch.ok ? '✓' : '✗'} ${ch.name}${ch.detail ? `  (${ch.detail})` : ''}`);
    expect(checks.filter((ch) => !ch.ok && !ch.skipped).map((ch) => `${ch.name}: ${ch.detail ?? ''}`)).toEqual([]);

    // The template appears in History.
    await page.getByRole('link', { name: 'History' }).click();
    await expect(page.getByText(name)).toBeVisible();

    // Privacy + console.
    expect(foreignRequests(guards, baseURL!)).toEqual([]);
    expect(guards.consoleErrors).toEqual([]);
  });
}
