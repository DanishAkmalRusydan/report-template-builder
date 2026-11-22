import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Browser: CI uses Playwright's bundled Chromium. Locally on Windows, use the built-in Microsoft Edge
// (also Chromium) so no browser download is needed. Override with PW_CHANNEL=chrome / chromium.
const channel = process.env.PW_CHANNEL ?? (!process.env.CI && process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  // Converting to PDF with Word/LibreOffice takes a while.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  // Serial: Word's COM automation and LibreOffice don't like parallel conversions.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...(channel && channel !== 'chromium' ? { channel } : {}) },
    },
  ],
  // Test the production build, as it will run on GitHub Pages.
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
