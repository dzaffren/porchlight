// One-time login for the e2e test (spec ledger O3).
//
// Atlassian's login has two-step checks and bot checks, so a robot cannot log in on
// its own. Instead this opens a real Edge window: you log in by hand, and the script
// saves the logged-in session to e2e/.auth/state.json for the test to reuse.
//
// That file is a live session for your account. It is git-ignored; never commit or share it.
//
// Run: npm run e2e:login  (a .mjs file, so Node reads it as an ES module)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SITE = process.env.PL_SITE ?? 'https://dzaffren.atlassian.net';
const STATE_FILE = 'e2e/.auth/state.json';
const FIVE_MINUTES = 5 * 60 * 1000;

const browser = await chromium.launch({ channel: process.env.PL_BROWSER_CHANNEL ?? 'msedge', headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${SITE}/jira`);
console.log('Log in to Atlassian in the Edge window. This script waits up to 5 minutes.');

// Logged in = back on the site, on a Jira page (not on id.atlassian.com).
await page.waitForURL((url) => url.origin === SITE && url.pathname.startsWith('/jira'), { timeout: FIVE_MINUTES });
await page.waitForLoadState('networkidle');

mkdirSync('e2e/.auth', { recursive: true });
await context.storageState({ path: STATE_FILE });
console.log(`Saved the login to ${STATE_FILE}. The window closes now.`);
await browser.close();
