// The one end-to-end test for the catch-up-view slice (docs/specs/catch-up-view.md).
//
// It walks the real path through every layer:
//   Team page → team resolvers → Forge SQL (team_members) → back on screen after a reload
//   Team page → requestJira as the viewer → Jira search → four sections → a ticket in Jira
//
// The saved login is one account, so the test puts that same person on the team and
// catches up on them (spec ledger O15). The demo tickets on the dev site are assigned to
// that account. The unit tests prove the search uses the picked person, not the viewer.
import { test, expect } from '@playwright/test';
import { PAGE_PATH, porchlightFrame, collectPolicyErrors } from './helpers.js';

// The field that only the Team page has. We find Porchlight's frame by it.
const ADD_LABEL = 'Add a teammate';

// A Jira ticket key, such as PAY-142: a project key in capitals, a dash, a number.
const TICKET_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

test('a teammate added to the team stays after a reload, and their catch-up opens a ticket', async ({ page, context }, testInfo) => {
  // This test opens the page twice and waits for Jira's searches, so it gets more
  // time than the 90 seconds in playwright.config.js.
  test.setTimeout(180_000);

  // Collect any content-security-policy complaints from the browser (decision D15).
  const policyErrors = collectPolicyErrors(page);

  // Who is logged in? page.request sends the saved login's cookies, and the relative
  // address goes to the site in baseURL. Jira answers with the person's account.
  const myself = await page.request.get('/rest/api/3/myself');
  expect(myself.ok(), 'the saved login is still valid (run npm run e2e:login if not)').toBe(true);
  const { accountId, displayName } = await myself.json();
  // Name the account in the report, so a failure says whose team list it touched.
  testInfo.annotations.push({ type: 'account', description: `${displayName} (${accountId})` });

  // Each row on the team list is a button that opens that person's catch-up.
  const catchUpButton = (app) => app.getByRole('button', { name: `Catch up on ${displayName}`, exact: true });

  await page.goto(`${PAGE_PATH}/team`);
  let app = await porchlightFrame(page, ADD_LABEL);

  // The field shows before the team list arrives from the database. Wait for the list,
  // or for the empty porch when nobody is on the team, before asking who is on it.
  await expect(
    app.getByRole('list', { name: 'Team', exact: true }).or(app.getByText('No one on the team yet')),
  ).toBeVisible();

  // An earlier run may have left this person on the team. Take them off first: that
  // walks scenario 2, and it lets the add below run every time.
  if ((await catchUpButton(app).count()) > 0) {
    await app.getByRole('button', { name: `Take ${displayName} off the team`, exact: true }).click();
    await expect(
      app.getByRole('status').filter({ hasText: `${displayName} is off the team. Their Jira tickets are unchanged.` }),
    ).toBeVisible();
    await expect(catchUpButton(app)).toHaveCount(0);
  }

  // Scenario 1: search Jira's users by name and add the person.
  await app.getByLabel(ADD_LABEL).fill(displayName);
  await app.getByRole('button', { name: `Add ${displayName} to the team`, exact: true }).click();
  await expect(app.getByRole('status').filter({ hasText: `${displayName} is on the team.` })).toBeVisible();

  // Reload: the person must come back from the database, not from the page's memory.
  await page.reload();
  app = await porchlightFrame(page, ADD_LABEL);
  await expect(catchUpButton(app)).toBeVisible();

  // Scenario 3: open their catch-up. The panel names the person and says it reads as you.
  await catchUpButton(app).click();
  await expect(app.getByRole('heading', { level: 2, name: displayName, exact: true })).toBeVisible();
  await expect(app.getByText('Showing only tickets you can open.')).toBeVisible();
  for (const section of ['Open work', 'Latest changes', 'Blockers', 'Next steps']) {
    await expect(app.getByRole('heading', { level: 3, name: section, exact: true })).toBeVisible();
  }

  // The "Open work" section is the nearest <section> around its heading. Its ticket
  // keys are links. The loading rows have no links, so this also waits for Jira's answer.
  const openWork = app
    .getByRole('heading', { level: 3, name: 'Open work', exact: true })
    .locator('xpath=ancestor::section[1]');
  const firstTicket = openWork.getByRole('link').filter({ hasText: TICKET_KEY }).first();
  await expect(firstTicket).toBeVisible();
  const key = (await firstTicket.textContent()).trim();

  // Every line opens its ticket in Jira, in a new tab. Start waiting for the tab
  // before the click, so a fast tab is not missed.
  const [ticketPage] = await Promise.all([context.waitForEvent('page'), firstTicket.click()]);
  // The key must end there, so PAY-14 does not pass for PAY-142.
  await expect(ticketPage).toHaveURL(new RegExp(`/browse/${key}(?:[/?#]|$)`));
  await ticketPage.close();

  // Keep a picture of the page in the report, to check the catch-up by eye.
  await testInfo.attach('catch-up', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  expect(policyErrors, 'the page breaks no content security rule').toEqual([]);
});
