/**
 * Captures README screenshots (light + dark) of the landing page and each builder step,
 * using the bundled fictional sample brief. Needs a running server:
 *   npm run build && npx vite preview --port 4173      (in one terminal)
 *   npx vite-node scripts/screenshots.ts               (in another)
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const BASE = process.env.SCREENSHOT_URL ?? 'http://localhost:4173';
const OUT = 'docs/screenshots';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400); // let transitions settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${OUT}/${name}.png`);
}

async function step(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Builder steps' }).getByRole('button', { name: new RegExp(label) }).click();
}

mkdirSync(OUT, { recursive: true });
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch(channel && channel !== 'chromium' ? { channel } : {});
for (const theme of ['light', 'dark'] as const) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/#/`);
  await page.waitForTimeout(800);
  await shot(page, `landing-${theme}`);

  await page.goto(`${BASE}/#/build?example=1`);
  await page.getByText(/^Found \d+ parts/).waitFor();
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
  await shot(page, `builder-upload-${theme}`);
  await step(page, 'Structure');
  await shot(page, `builder-structure-${theme}`);
  await step(page, 'Format');
  await shot(page, `builder-format-${theme}`);
  await step(page, 'Review');
  await shot(page, `builder-review-${theme}`);
  await context.close();
}
await browser.close();
