// 2. Reorder and rename a heading, turn "one part per page" off, set member rows to 3,
//    and check the downloaded .docx reflects every change.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { checkDocxFile } from '../scripts/docx-checks';
import { ROOT } from '../scripts/fixture-cases';
import { currentConfig, downloadDocx, expectBriefLoaded, foreignRequests, next, uploadBrief, watchPage } from './helpers';

test('edits in the wizard show up in the downloaded file', async ({ page, baseURL }, testInfo) => {
  const guards = watchPage(page);
  await page.goto('/#/build');
  await uploadBrief(page, join(ROOT, 'public/samples/sample-brief.docx'));
  await expectBriefLoaded(page);
  await next(page, 'Next: structure');

  // Rename the first heading.
  const first = page.getByLabel('Heading 1 text');
  await first.fill('PART A: Requirements and Scope');

  // Reorder with the keyboard: move "Task A2" above "Task A1".
  const handle = page.getByRole('button', { name: /^Move "Task A2: Business Rules"/ });
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: /^Move "Task A2: Business Rules", position 2 of/ })).toBeFocused();
  const order = await page.getByRole('list', { name: 'Report headings' }).getByRole('textbox').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(order.slice(0, 3)).toEqual(['PART A: Requirements and Scope', 'Task A2: Business Rules', 'Task A1: Stakeholders and Use Cases']);

  // Live preview updates instantly.
  await expect(page.getByRole('complementary', { name: 'Live preview' }).getByText('PART A: Requirements and Scope').first()).toBeVisible();

  await next(page, 'Next: format & cover');

  // One part per page off.
  const onePart = page.getByRole('switch', { name: 'One part per page' });
  await expect(onePart).toBeChecked();
  await onePart.click();
  await expect(onePart).not.toBeChecked();

  // Member rows → 3 with the keyboard.
  const rows = page.getByRole('slider', { name: 'Group member rows' });
  await rows.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(rows).toHaveAttribute('aria-valuenow', '3');

  await next(page, 'Next: review');
  const config = await currentConfig(page);
  expect(config.onePartPerPage).toBe(false);
  expect(config.cover.memberRows).toBe(3);
  const { path } = await downloadDocx(page, testInfo.outputDir);

  const doc = await (await JSZip.loadAsync(readFileSync(path))).file('word/document.xml')!.async('string');
  const body = doc.slice(doc.indexOf('</w:sdt>'));
  // Renamed and reordered.
  expect(body).toContain('PART A: Requirements and Scope');
  expect(body.indexOf('Task A2: Business Rules')).toBeLessThan(body.indexOf('Task A1: Stakeholders and Use Cases'));
  // Only the first heading breaks after the contents page.
  expect(doc.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  // Header row + 3 member rows.
  const tableStart = doc.lastIndexOf('<w:tbl>', doc.indexOf('>Student ID<'));
  const memberTable = doc.slice(tableStart, doc.indexOf('</w:tbl>', tableStart));
  expect(memberTable.match(/<w:tr>/g)).toHaveLength(4);

  // Still a valid document with the body flowing after the contents page.
  const { checks } = await checkDocxFile(path, config, { rubricMarker: config.rubric.kind === 'pdf-pages' ? 'Criteria' : null });
  expect(checks.filter((ch) => !ch.ok && !ch.skipped).map((ch) => `${ch.name}: ${ch.detail ?? ''}`)).toEqual([]);

  expect(foreignRequests(guards, baseURL!)).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});
