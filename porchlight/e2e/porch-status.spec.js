// The one end-to-end test for the porch-status slice (docs/specs/porch-status.md).
//
// It walks the real path through every layer:
//   "Your porch light" card → setMyStatus resolver → Forge SQL (porch_statuses)
//   → listStatuses + Jira user/bulk (time zone, active) → the lamp on the card and the row
//   → back on screen after a reload
//
// The saved login is one account, so the test sets that person's own porch light and reads
// it back on their own team row. The unit tests prove that nobody can set another person's
// porch light, and that Left comes from a passed Leaving date or `active: false`.
//
// The test changes real data on the dev site, so it always leaves the porch light at Here:
// the walk ends with Here, and the afterEach hook below sets Here again when a step failed.
import { test, expect } from '@playwright/test';
import { PAGE_PATH, porchlightFrame, collectPolicyErrors } from './helpers.js';
// The same date helpers the page uses, so "today" here matches "today" on the page.
import { todayIn, addDays } from '../src/lib/porch.js';

// The field that only the Team page has. We find Porchlight's frame by it.
const ADD_LABEL = 'Add a teammate';

// What the "Your porch light" card says when the lamp is off.
const OFF_TEXT = 'Here, porch light off';

// What the card can say once its status has arrived from the database. Until then it may
// show a loading state, so the test waits for one of these before it reads the card.
const ANY_STATUS = /Here, porch light off|Away until|Leaving on|Left/;

// Any status text a team row can show. A row shows nothing when the person is Here.
const ROW_STATUS = /Away until|Leaving on|\bLeft\b/;

/**
 * The status text the page shows for a date, such as "14 Nov" for "2026-11-14".
 * The page builds it the same way: a UTC date, written in British day-month order.
 *
 * @param {string} date "YYYY-MM-DD"
 * @returns {string}
 */
function dayText(date) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/**
 * The "Your porch light" card at the top of the Team column. It is a <section> named by
 * its heading, so it has the accessibility role "region".
 *
 * @param {import('@playwright/test').Frame} app the Porchlight frame
 */
function myCard(app) {
  return app.getByRole('region', { name: 'Your porch light', exact: true });
}

/**
 * Change your own porch light through the card's form, and wait for the toast that says
 * it was saved.
 *
 * @param {import('@playwright/test').Frame} app the Porchlight frame
 * @param {{ kind: 'here' | 'away' | 'leaving', date?: string, toast: string }} choice
 *   `date` is "YYYY-MM-DD"; Here needs none. `toast` is the message the page shows after saving.
 */
async function setPorchLight(app, { kind, date, toast }) {
  const card = myCard(app);
  await card.getByRole('button', { name: 'Change', exact: true }).click();
  // The select's option values are here, away and leaving.
  await card.getByLabel('Status', { exact: true }).selectOption(kind);
  if (date) {
    // A date input takes its value as "YYYY-MM-DD", whatever the browser's language.
    await card.getByLabel('Date', { exact: true }).fill(date);
  }
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(app.getByRole('status').filter({ hasText: toast })).toBeVisible();
}

// When any step fails, the porch light may be left on. Open the Team page again and set
// Here, so the next run and the people using the dev site see the light off.
// Fixtures such as `page` are still open in afterEach, so the hook can use the browser.
test.afterEach(async ({ page }, testInfo) => {
  // A passing walk already ended with Here.
  if (testInfo.status === testInfo.expectedStatus) return;

  await page.goto(`${PAGE_PATH}/team`);
  const app = await porchlightFrame(page, ADD_LABEL);
  await expect(myCard(app)).toContainText(ANY_STATUS);
  if (!(await myCard(app).textContent()).includes(OFF_TEXT)) {
    await setPorchLight(app, { kind: 'here', toast: 'Your porch light is off.' });
  }
});

test('your porch light set to Away shows on your card and row after a reload, then Here turns it off', async ({ page }, testInfo) => {
  // This test opens the page twice and saves twice, so it gets more time than the
  // 90 seconds in playwright.config.js.
  test.setTimeout(180_000);

  // Collect any content-security-policy complaints from the browser (decision D15).
  const policyErrors = collectPolicyErrors(page);

  // Who is logged in? page.request sends the saved login's cookies, and the relative
  // address goes to the site in baseURL. Jira answers with the person's account and the
  // time zone from their Atlassian profile.
  const myself = await page.request.get('/rest/api/3/myself');
  expect(myself.ok(), 'the saved login is still valid (run npm run e2e:login if not)').toBe(true);
  const { accountId, displayName, timeZone } = await myself.json();
  // Name the account in the report, so a failure says whose porch light it touched.
  testInfo.annotations.push({ type: 'account', description: `${displayName} (${accountId}, ${timeZone})` });

  // "One week ahead" counts from today in the person's own day (spec ledger O4), the
  // same day the page and the resolver use to check the date.
  const awayDate = addDays(todayIn(timeZone, new Date()), 7);
  const awayText = `Away until ${dayText(awayDate)}`;

  // The person's own row on the team list. The row is a list item; its first button
  // opens their catch-up, and the lamp with its text sits inside that button.
  const catchUpButton = (app) => app.getByRole('button', { name: `Catch up on ${displayName}`, exact: true });
  const myRow = (app) =>
    app.getByRole('list', { name: 'Team', exact: true }).getByRole('listitem').filter({ has: catchUpButton(app) });

  await page.goto(`${PAGE_PATH}/team`);
  let app = await porchlightFrame(page, ADD_LABEL);

  // The field shows before the team list arrives from the database. Wait for the list,
  // or for the empty porch when nobody is on the team, before asking who is on it.
  await expect(
    app.getByRole('list', { name: 'Team', exact: true }).or(app.getByText('No one on the team yet')),
  ).toBeVisible();

  // The row check below needs the person on the team. catch-up.spec.js leaves them on it,
  // but a fresh site or a failed run may not, so add them when they are missing.
  if ((await catchUpButton(app).count()) === 0) {
    await app.getByLabel(ADD_LABEL).fill(displayName);
    await app.getByRole('button', { name: `Add ${displayName} to the team`, exact: true }).click();
    await expect(app.getByRole('status').filter({ hasText: `${displayName} is on the team.` })).toBeVisible();
  }

  // Start clean: an earlier run, or the person themselves, may have left the light on.
  await expect(myCard(app)).toContainText(ANY_STATUS);
  if (!(await myCard(app).textContent()).includes(OFF_TEXT)) {
    await setPorchLight(app, { kind: 'here', toast: 'Your porch light is off.' });
  }
  await expect(myCard(app)).toContainText(OFF_TEXT);

  // Scenario 1: leave the porch light on while away.
  await setPorchLight(app, { kind: 'away', date: awayDate, toast: `Your porch light is on: ${awayText}.` });
  await expect(myCard(app)).toContainText(awayText);
  await expect(myRow(app)).toContainText(awayText);

  // Reload: the status must come back from the database, not from the page's memory.
  await page.reload();
  app = await porchlightFrame(page, ADD_LABEL);
  await expect(myCard(app)).toContainText(awayText);
  await expect(myRow(app)).toContainText(awayText);

  // Keep a picture of the page in the report, to check the lit lamp by eye.
  await testInfo.attach('porch-light-away', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  // Scenario 2: set Here, and the lamp is off from that moment, on the card and the row.
  await setPorchLight(app, { kind: 'here', toast: 'Your porch light is off.' });
  await expect(myCard(app)).toContainText(OFF_TEXT);
  // The row is still there, with no status on it at all: a row shows text only when the lamp is on.
  await expect(myRow(app)).toBeVisible();
  await expect(myRow(app)).not.toContainText(ROW_STATUS);

  expect(policyErrors, 'the page breaks no content security rule').toEqual([]);
});
