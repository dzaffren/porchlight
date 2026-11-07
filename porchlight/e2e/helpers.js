// Shared pieces for the end-to-end tests. Both specs import from here, so the page
// address and the way we find Porchlight inside Jira live in one place.
//
// This file does not end in .spec.js, so Playwright never runs it as a test
// (playwright.config.js only picks up *.spec.js).
import { expect } from '@playwright/test';

// The Porchlight global page on the development site: /jira/apps/<app id>/<environment id>.
// The page has two subpages (decision D20). Forge adds the subpage's route to this
// address, so Notes is `${PAGE_PATH}/notes` and Team is `${PAGE_PATH}/team`.
// Set PL_PAGE_PATH to point the tests at another install.
export const PAGE_PATH =
  process.env.PL_PAGE_PATH ?? '/jira/apps/0eed6567-84e7-45fa-865b-80463e0c7d9e/518c4558-46df-494b-89e9-65eaf06c8240';

/**
 * Jira shows a Custom UI page inside an iframe, so the test cannot look for our
 * elements on the main page. This finds the frame that has a field with the given
 * label, for example "Add a teammate".
 *
 * Frames load at different speeds, so it keeps checking every frame until one of
 * them has the field, for up to a minute.
 *
 * @param {import('@playwright/test').Page} page the Jira page
 * @param {string} label the label of a field that only Porchlight's frame has
 * @returns {Promise<import('@playwright/test').Frame>} the Porchlight frame
 */
export async function porchlightFrame(page, label) {
  let found = null;
  await expect.poll(async () => {
    for (const frame of page.frames()) {
      // The main frame is Jira itself, never our app.
      if (frame === page.mainFrame()) continue;
      // A frame can go away while we ask it, so a failed count counts as "not here".
      const fields = await frame.getByLabel(label).count().catch(() => 0);
      if (fields > 0) {
        found = frame;
        return true;
      }
    }
    return false;
  }, { message: `the Porchlight frame with "${label}" should load`, timeout: 60_000 }).toBe(true);
  return found;
}

/**
 * Start collecting the browser's content-security-policy complaints (decision D15).
 * Custom UI pages run under a strict policy, and a break shows only as a console
 * message, so the tests read the console and expect this list to stay empty.
 *
 * Call it before page.goto(), so no message is missed.
 *
 * @param {import('@playwright/test').Page} page the Jira page
 * @returns {string[]} the complaints so far; the list grows while the test runs
 */
export function collectPolicyErrors(page) {
  const policyErrors = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to apply inline style/i.test(message.text())) policyErrors.push(message.text());
  });
  return policyErrors;
}
