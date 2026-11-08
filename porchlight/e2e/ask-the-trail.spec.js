// The one end-to-end test for the ask-the-trail slice (docs/specs/ask-the-trail.md,
// scenarios 1 and 2).
//
// It walks the real path through every layer:
//   Rovo Chat → the Porchlight agent → porchlight-catch-up action → Jira reads as the asker
//   → the model's answer in Rovo Chat, with every ticket as a link
//
// Rovo Chat only runs on the demo site (spec ledger O1), so this test points there and
// ignores PL_SITE. The saved login is one account, so the test asks the agent about that
// same person. The demo tickets PAY-1 to PAY-6 and OPS-1 to OPS-2 are assigned to them.
//
// Rovo's model writes the words, and they differ each run (spec ledger O8). So the test
// checks facts only: which ticket keys are links, where each link goes, and that no link
// points at a ticket that was never seeded. It never checks a sentence.
//
// Rovo Chat is Atlassian's page, not ours, so every element is found by its role and
// accessible name. A hidden ticket (HR-12) needs a second person, so the unit tests prove
// that one (test/unit/rovo-catch-up.test.js).
import { test, expect } from '@playwright/test';

// The demo site with Rovo Chat and Porchlight installed (decision D30).
const DEMO_SITE = 'https://one-atlas-jddo.atlassian.net';

// Every ticket made on the demo site for this person. Any other key in an answer was
// invented by the model, or came from someone else's work.
const SEEDED_KEYS = ['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4', 'PAY-5', 'PAY-6', 'OPS-1', 'OPS-2'];

// A ticket link in an answer must open that ticket on the demo site, and the key must end
// the address, so PAY-1 does not pass for PAY-12. The group captures the key.
const TICKET_LINK = /^https:\/\/one-atlas-jddo\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)$/;

// The agent ends a catch-up with the action's footer, "Showing only tickets you can open."
// The model may change the words around it, so the test looks for this part only.
const FOOTER = /tickets you can open/i;

// How long the links in an answer must stay the same before the answer counts as done.
// The model streams its answer, so links appear one by one. A short wait is enough once
// the footer is there; without the footer, the test waits longer.
const QUIET_AFTER_FOOTER_MS = 2_000;
const QUIET_WITHOUT_FOOTER_MS = 10_000;

// The longest the test waits for one answer: the action reads Jira, then the model writes.
const ANSWER_TIMEOUT_MS = 90_000;

test.use({ baseURL: DEMO_SITE });

/**
 * The full address of every Jira ticket link inside the Rovo panel, in page order.
 * `a.href` is the address the browser resolved, so a relative link shows its real site.
 *
 * @param {import('@playwright/test').Locator} panel the Rovo Chat panel
 * @returns {Promise<string[]>}
 */
function ticketLinks(panel) {
  return panel.locator('a[href*="/browse/"]').evaluateAll((links) => links.map((link) => link.href));
}

/**
 * Wait until the answer to the last message stops changing, then return its ticket links.
 *
 * New messages go to the end of the chat, so the links after the first `before` links
 * belong to the new answer. The answer is done when it has at least one link, and its
 * links stayed the same for a short time after the footer, or a longer time without it.
 *
 * @param {import('@playwright/test').Locator} panel the Rovo Chat panel
 * @param {{ links: number, footers: number }} before the counts taken just before sending
 * @param {string} what what the answer is for, for the failure message
 * @returns {Promise<string[]>} the new answer's ticket link addresses
 */
async function settledAnswer(panel, before, what) {
  let links = [];
  let seen = null;
  let sameSince = 0;
  await expect.poll(async () => {
    links = (await ticketLinks(panel)).slice(before.links);
    const now = Date.now();
    const signature = links.join(' ');
    if (signature !== seen) {
      seen = signature;
      sameSince = now;
    }
    const footerShown = (await panel.getByText(FOOTER).count()) > before.footers;
    const quiet = footerShown ? QUIET_AFTER_FOOTER_MS : QUIET_WITHOUT_FOOTER_MS;
    return links.length > 0 && now - sameSince >= quiet;
  }, { message: `the answer to "${what}" should link at least one ticket and stop changing`, timeout: ANSWER_TIMEOUT_MS, intervals: [1_000] }).toBe(true);
  return links;
}

/**
 * Check every link in an answer: it opens a ticket on the demo site, and that ticket is
 * one of the seeded ones. Returns the keys it links, once each.
 *
 * @param {string[]} links the answer's ticket link addresses
 * @returns {string[]} the linked keys, without repeats
 */
function linkedKeys(links) {
  for (const href of links) {
    expect(href, 'every ticket link opens /browse/<KEY> on the demo site').toMatch(TICKET_LINK);
  }
  const keys = [...new Set(links.map((href) => href.match(TICKET_LINK)[1]))];
  for (const key of keys) {
    expect(SEEDED_KEYS, `${key} is a seeded ticket, not one the model made up`).toContain(key);
  }
  return keys;
}

test('the Porchlight agent catches you up in Rovo Chat, and answers a narrow question, with every ticket linked', async ({ page }, testInfo) => {
  // Two answers from a model, each after a Jira read, take longer than the 90 seconds
  // in playwright.config.js.
  test.setTimeout(240_000);

  // Atlassian's cookie banner may show across the top of the page. The test leaves it
  // alone, as the other e2e tests do: it does not cover Rovo Chat, which opens at the
  // bottom right. (Clicking its "Only necessary" button in a test did not close it.)

  // Who is logged in? page.request sends the saved login's cookies, and the relative
  // address goes to the demo site in baseURL. Jira answers with the person's account.
  const myself = await page.request.get('/rest/api/3/myself');
  expect(myself.ok(), 'the saved login works on the demo site (run npm run e2e:login against it if not)').toBe(true);
  const { accountId, displayName } = await myself.json();
  // Name the account in the report, so a failure says whose tickets the agent read.
  testInfo.annotations.push({ type: 'account', description: `${displayName} (${accountId})` });

  // The elements of Rovo Chat. It sits in Jira's own page, not in a frame. Two buttons open
  // it: the round "Open Rovo Chat" at the bottom right and "Ask Rovo" in the top bar. The
  // round one is not always there, so take whichever shows first.
  const openChat = page
    .getByRole('button', { name: 'Open Rovo Chat', exact: true })
    .or(page.getByRole('button', { name: 'Ask Rovo', exact: true }))
    .first();
  // The prompt changes its name once a chat has a message in it, so accept both names.
  const prompt = page.getByRole('textbox', {
    name: /^(Ask, @mention, or \/ for actions|Describe what you want to know or do next)$/,
  });
  const agentPicker = page.getByRole('button', { name: /^Change agent - / });

  // Step 1, scenario 1: open Rovo Chat. The panel may still be opening from an earlier visit,
  // and a click then closes it again, so click only while the prompt is missing, give the
  // panel 10 seconds, and try again until it stays open (toPass repeats the block).
  await page.goto('/jira/for-you');
  await expect(openChat.or(prompt).first(), 'Jira shows Rovo Chat or its button').toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    if (!(await prompt.isVisible())) await openChat.click({ timeout: 5_000 });
    await expect(prompt).toBeVisible({ timeout: 10_000 });
  }, 'Rovo Chat opens and stays open').toPass({ timeout: 60_000 });

  // The Rovo panel: the innermost <div> that holds both the agent picker (at the top) and
  // the prompt (at the bottom), so the chat between them is inside it. Jira's own page also
  // lists ticket links (For you shows PAY-4), so every link check stays in here.
  // It starts from the prompt's own ancestors, about 30 <div>s instead of every <div> on
  // the page, and keeps those that also hold the picker. XPath gives them outermost first,
  // so the last one is the innermost.
  const panel = prompt.locator('xpath=ancestor::div').filter({ has: agentPicker }).last();

  // Pick the Porchlight agent through the picker, as a person would. On the demo site,
  // Porchlight is a favourite agent (set once, like the seeded tickets), so the picker
  // lists it first. The picker's search is not used: in most runs it ignored the typed
  // name and the list never loaded past Rovo's own agents.
  await agentPicker.click();
  // Each agent in the list is a button named "<agent> <agent> <heart button's name>".
  // The name must start with "Porchlight", which leaves out the heart button inside it
  // ("Remove Porchlight from favourites").
  await page.getByRole('button', { name: /^Porchlight\b/ }).click();
  await expect(agentPicker, 'the chat now talks to the Porchlight agent').toHaveAccessibleName('Change agent - Porchlight');

  /**
   * Type a message into the prompt and send it. Returns the link and footer counts from
   * just before sending, so the answer's links can be told apart from older ones.
   *
   * @param {string} text the message
   * @returns {Promise<{ links: number, footers: number }>}
   */
  async function send(text) {
    const before = {
      links: (await ticketLinks(panel)).length,
      footers: await panel.getByText(FOOTER).count(),
    };
    await prompt.fill(text);
    await expect(prompt).toHaveText(text);
    await panel.getByRole('button', { name: 'Submit', exact: true }).click();
    return before;
  }

  // Steps 2 and 3, scenario 1: "Catch me up on <name>". The answer must link the open
  // work (PAY-1), both blockers (PAY-2, blocked by OPS-1, and PAY-4, flagged) and the
  // next step (PAY-5, due 20 Dec), and every link must be a seeded ticket on the demo site.
  const catchUp = `Catch me up on ${displayName}`;
  const catchUpKeys = linkedKeys(await settledAnswer(panel, await send(catchUp), catchUp));
  for (const key of ['PAY-1', 'PAY-2', 'PAY-4', 'PAY-5']) {
    expect(catchUpKeys, `the catch-up links ${key}`).toContain(key);
  }

  // Step 4, scenario 2: a narrow question, in the same chat. Only the links after this
  // message count. The answer must link both blockers, and again only seeded tickets.
  const blocking = `What's blocking ${displayName}?`;
  const blockingKeys = linkedKeys(await settledAnswer(panel, await send(blocking), blocking));
  for (const key of ['PAY-2', 'PAY-4']) {
    expect(blockingKeys, `the blockers answer links ${key}`).toContain(key);
  }

  // Keep a picture of the chat in the report, to read both answers by eye.
  await testInfo.attach('ask-the-trail', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});
