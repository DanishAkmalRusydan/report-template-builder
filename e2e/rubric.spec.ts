// A brief without a rubric asks for one; a rubric PDF added separately is rebuilt as a table.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURES, ROOT } from '../scripts/fixture-cases';
import { expectBriefLoaded, next, uploadBrief } from './helpers';

const LAB2 = join(FIXTURES, 'CAI20103_Lab2.pdf');

test('a brief without a rubric asks for the rubric file', async ({ page }) => {
  await page.goto('/#/build');
  await page.getByRole('button', { name: 'Paste text instead' }).click();
  await page.getByRole('textbox', { name: 'Brief text' }).fill('ABC1234 SOFTWARE TESTING\nPart 1 – Test Plan\nPart 2 – Test Cases\nFont: Arial 12');
  await page.getByRole('button', { name: 'Use this text' }).click();
  await expect(page.getByText('Found 2 parts.')).toBeVisible();
  await expect(page.getByTestId('rubric-status')).toContainText('No rubric was found in the brief');

  await next(page, 'Next: structure');
  await next(page, 'Next: format & cover');
  await next(page, 'Next: review');
  await expect(page.getByText('There is no rubric: none was found in the brief and no rubric file was added.')).toBeVisible();
});

test('a separate rubric PDF is rebuilt as a table and goes last', async ({ page }) => {
  test.skip(!existsSync(LAB2), 'needs fixtures/CAI20103_Lab2.pdf');
  await page.goto('/#/build');
  await uploadBrief(page, join(ROOT, 'public/samples/sample-brief.docx'));
  await expectBriefLoaded(page);
  await page.getByLabel('Rubric file (.docx or .pdf)').setInputFiles(LAB2);
  await expect(page.getByText(/^Rubric added: a table of \d+ rows/)).toBeVisible();
  await expect(page.getByText('rebuilt as a table')).toBeVisible();
  await expect(page.getByTestId('rubric-status')).toHaveCount(0);

  const preview = page.getByRole('complementary', { name: 'Live preview' });
  await expect(preview.getByRole('button', { name: /: Rubric/ }).first()).toBeVisible();
  await next(page, 'Next: structure');
  await next(page, 'Next: format & cover');
  await next(page, 'Next: review');
  await expect(page.getByText('There is no rubric')).toHaveCount(0);
});
