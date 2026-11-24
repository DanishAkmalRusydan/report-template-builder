// 3. A scanned PDF (no text layer) shows the friendly error, and pasting the text works instead.
import { expect, test } from '@playwright/test';
import { emptyPdf, foreignRequests, uploadBrief, watchPage } from './helpers';

test('a scanned PDF shows the friendly no-text error and offers paste instead', async ({ page, baseURL }) => {
  const guards = watchPage(page);
  await page.goto('/#/build');
  await uploadBrief(page, { name: 'scan.pdf', mimeType: 'application/pdf', buffer: emptyPdf() });

  await expect(page.getByText('This PDF has no text layer. Paste the brief text instead.')).toBeVisible();
  const alert = page.getByRole('alert').filter({ hasText: 'This PDF has no text layer' });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next: structure' })).toBeDisabled();

  // Recover by pasting the text.
  await alert.getByRole('button', { name: 'Paste text' }).click();
  await page
    .getByRole('textbox', { name: 'Brief text' })
    .fill('ABC1234 SOFTWARE TESTING\nPart 1 – Test Plan\nTask 1.1 Scope\nPart 2 – Test Cases\nFont: Arial 12');
  await page.getByRole('button', { name: 'Use this text' }).click();
  await expect(page.getByText('Found 2 parts and 1 sub-task.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next: structure' })).toBeEnabled();

  expect(foreignRequests(guards, baseURL!)).toEqual([]);
  expect(guards.consoleErrors).toEqual([]);
});

test('an unsupported file type is rejected with a plain message', async ({ page }) => {
  await page.goto('/#/build');
  await uploadBrief(page, { name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('Upload the brief as a .docx or .pdf file.')).toBeVisible();
});
