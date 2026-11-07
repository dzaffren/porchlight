// Playwright settings for the end-to-end tests, which walk the real Porchlight
// pages inside Jira on the development site:
//   e2e/skeleton.spec.js  — the Notes page (skeleton slice)
//   e2e/catch-up.spec.js  — the Team page and a catch-up (catch-up-view slice)
//   e2e/porch-status.spec.js — your porch light on the Team page (porch-status slice)
//   e2e/ask-the-trail.spec.js — the Porchlight agent in Rovo Chat, on the demo site (ask-the-trail slice)
// e2e/helpers.js holds what they share; it is not a test.
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
  // One spec file at a time. catch-up.spec.js takes the signed-in person off the team and
  // adds them back, and porch-status.spec.js reads that same person's team row, so running
  // them side by side on the one real site would make them fail at random.
  workers: 1,
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
