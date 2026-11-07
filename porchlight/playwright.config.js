// Playwright settings for the end-to-end tests, which walk the real Porchlight
// pages inside Jira on the development site:
//   e2e/skeleton.spec.js  — the Notes page (skeleton slice)
//   e2e/catch-up.spec.js  — the Team page and a catch-up (catch-up-view slice)
// e2e/helpers.js holds what both share; it is not a test.
//
// Run order:
//   1. npm run e2e:login   (once, or when the saved login expires) — you log in by hand
//   2. npm run e2e         after each `forge deploy`
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.js',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PL_SITE ?? 'https://dzaffren.atlassian.net',
    // The login saved by e2e/login.mjs (npm run e2e:login). Git-ignored: it is a live session for your account.
    storageState: 'e2e/.auth/state.json',
    // Google Chrome already on this laptop, so Playwright downloads no browser.
    channel: process.env.PL_BROWSER_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
