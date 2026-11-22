// 4. Every page loads without console errors and makes no requests to other hosts.
import { expect, test } from '@playwright/test';
import { foreignRequests, watchPage } from './helpers';

const routes = [
  { path: '/#/', heading: /Turn any assignment brief/ },
  { path: '/#/build', heading: 'Upload your brief' },
  { path: '/#/history', heading: 'History' },
  { path: '/#/presets', heading: 'University profiles' },
];

for (const r of routes) {
  test(`${r.path} loads cleanly`, async ({ page, baseURL }) => {
    const guards = watchPage(page);
    await page.goto(r.path);
    await expect(page.getByRole('heading', { level: 1, name: r.heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(foreignRequests(guards, baseURL!)).toEqual([]);
    expect(guards.consoleErrors).toEqual([]);
  });
}

test('refreshing a deep link does not 404', async ({ page }) => {
  await page.goto('/#/history');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
});

test('the example brief loads from the landing page', async ({ page, baseURL }) => {
  const guards = watchPage(page);
  await page.goto('/#/');
  await page.getByRole('link', { name: 'Try an example' }).click();
  await expect(page.getByText('Found 4 parts and 6 sub-tasks.')).toBeVisible();
  expect(foreignRequests(guards, baseURL!)).toEqual([]);
});

test('dark mode toggles and is remembered', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});
