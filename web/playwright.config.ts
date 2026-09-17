import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4187';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    timezoneId: 'America/Los_Angeles',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 3 } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4187 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
});
