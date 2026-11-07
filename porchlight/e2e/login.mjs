// One-time login for the e2e test (spec ledger O3).
//
// Why it works this way:
//   Atlassian sends a Google-linked account to Google sign-in, and Google refuses to sign
//   in inside a browser that Playwright launched. So this script starts Chrome the normal
//   way, as a plain program. You sign in there exactly as you always do. When you reach
//   Jira, Playwright attaches to that window (through Chrome's DevTools port) and saves
//   the logged-in session to e2e/.auth/state.json for the test to reuse.
//
//   1. spawn chrome.exe  --user-data-dir=e2e/.auth/chrome-profile  --remote-debugging-port
//   2. you log in by hand
//   3. Playwright connects, sees a Jira page, saves state.json, and closes Chrome
//
// The profile folder and state.json hold a live session for your account. Both are in
// e2e/.auth/, which is git-ignored. Never commit or share them.
//
// Run: npm run e2e:login   (a .mjs file, so Node reads it as an ES module)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = process.env.PL_SITE ?? 'https://dzaffren.atlassian.net';
const AUTH_DIR = resolve('e2e/.auth');
const STATE_FILE = resolve(AUTH_DIR, 'state.json');
// A separate profile, never your everyday one: Chrome only opens the DevTools port on a
// non-default profile, and this keeps your own browsing data out of the saved session.
const PROFILE_DIR = resolve(AUTH_DIR, 'chrome-profile');
// Only reachable from this laptop (127.0.0.1), and only while this script runs.
const DEBUG_PORT = 9333;
const FIVE_MINUTES = 5 * 60 * 1000;

/** Find Chrome. Set PL_CHROME_PATH to use another install. */
function chromePath() {
  const candidates = [
    process.env.PL_CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Chrome not found. Set PL_CHROME_PATH to chrome.exe.');
  return found;
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Wait until Chrome's DevTools port answers, then attach Playwright to it. */
async function attach() {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await wait(500);
    }
  }
}

/** True when some tab is on a Jira page of our site, which means the login finished. */
function onJira(context) {
  return context.pages().some((page) => {
    try {
      const url = new URL(page.url());
      return url.origin === SITE && url.pathname.startsWith('/jira');
    } catch {
      return false;
    }
  });
}

mkdirSync(PROFILE_DIR, { recursive: true });
const chrome = spawn(
  chromePath(),
  [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    `${SITE}/jira`,
  ],
  { stdio: 'ignore' },
);

const browser = await attach();
const context = browser.contexts()[0];
console.log('Log in to Atlassian in the Chrome window, the way you usually do. This script waits up to 5 minutes.');

const deadline = Date.now() + FIVE_MINUTES;
while (!onJira(context)) {
  if (Date.now() > deadline) {
    chrome.kill();
    throw new Error('No Jira page after 5 minutes. Run npm run e2e:login again.');
  }
  await wait(2000);
}

// Give Jira a moment to finish setting its cookies, then save the session.
// Only cookies are saved: an Atlassian login lives in cookies. (Playwright's full
// storageState() also visits every site the login touched to copy local storage,
// which breaks on a Chrome window that Playwright did not start.)
await wait(3000);
// Keep Atlassian's cookies only. The Google sign-in also leaves Google cookies in this
// profile; the test does not need them, so they never go into state.json.
const isAtlassian = (domain) => /(^|\.)atlassian\.(net|com)$/.test(domain.replace(/^\./, ''));
const cookies = (await context.cookies()).filter((cookie) => isAtlassian(cookie.domain));
writeFileSync(STATE_FILE, JSON.stringify({ cookies, origins: [] }, null, 2));
console.log(`Saved ${cookies.length} login cookies to e2e/.auth/state.json. Chrome closes now.`);

await browser.close();
chrome.kill();
