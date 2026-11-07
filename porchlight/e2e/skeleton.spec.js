// The one end-to-end test for the skeleton slice (docs/specs/skeleton.md, scenario 1).
//
// It walks the real path through every layer:
//   Jira page → Custom UI frame → saveNote resolver → Forge SQL → listNotes → back on screen
//
// One account is used, so "a teammate sees it" is proven by reloading as the same person.
// The unit tests prove the list is never filtered by author (spec ledger O9).
import { test, expect } from '@playwright/test';
import { PAGE_PATH, porchlightFrame, collectPolicyErrors } from './helpers.js';

test('a saved note is listed first, with its author and today, after a reload', async ({ page }, testInfo) => {
  // Collect any content-security-policy complaints from the browser (decision D15).
  const policyErrors = collectPolicyErrors(page);

  // A unique note, so this run never matches a note from an earlier run.
  const text = `E2E check ${new Date().toISOString()}: payments retry 3 times because the bank API times out under load.`;

  // Notes is a subpage of the Porchlight page (decision D20), at the /notes route.
  await page.goto(`${PAGE_PATH}/notes`);
  const app = await porchlightFrame(page, 'Note for the next person');

  // The composer says who the note is saved as; the card must show the same name.
  const savedAs = app.locator('.composer__foot strong');
  await expect(savedAs).not.toHaveText('you');
  const authorName = (await savedAs.textContent()).trim();

  await app.getByLabel('Note for the next person').fill(text);
  await app.getByRole('button', { name: 'Save note' }).click();
  await expect(app.getByRole('status').filter({ hasText: "Note saved. The light's on." })).toBeVisible();

  // Reload: the note must come back from the database, not from the page's memory.
  await page.reload();
  const again = await porchlightFrame(page, 'Note for the next person');
  const first = again.getByRole('article').first();
  await expect(first).toContainText(text);
  await expect(first.getByRole('heading')).toHaveText(authorName);
  await expect(first.locator('time')).toHaveText(/^Today, \d\d:\d\d$/);

  // Keep a picture of the page in the report, to check the lantern's glow by eye.
  await testInfo.attach('porchlight-after-reload', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  expect(policyErrors, 'the page breaks no content security rule').toEqual([]);
});
