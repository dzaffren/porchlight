// The two resolvers the Porchlight page calls with invoke() from @forge/bridge:
//   invoke('saveNote', { body, clientKey })  and  invoke('listNotes').
//
// Forge hands each resolver a `req` object with two parts:
//   - req.payload: whatever the page sent. Untrusted: a person can change it in the browser.
//   - req.context: filled in by Forge itself, including the signed-in user's accountId. Trusted.
//
// Return values:
//   - { ok: true, ... } when it worked.
//   - { ok: false, error } for a problem the person can fix (empty note, too long).
//   - A thrown error for anything else (database down, no signed-in user). invoke()
//     then rejects on the page, and the page shows "Couldn't save your note. Try again."
import { validateNoteBody } from '../lib/validate.js';
import { ensureMigrated } from '../db/migrate.js';
import { insertNoteOnce, listNewestNotes } from '../db/notes.js';

// The page makes client keys with crypto.randomUUID(), which looks like
// "6f1c2a4e-1b7d-4c3e-9a51-2f8e0d4b7c11". Anything else is refused.
const CLIENT_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the signed-in user's account ID from Forge's context.
 * The author always comes from here, never from the payload, so nobody can save as someone else.
 */
function signedInAccountId(req) {
  const accountId = req.context?.accountId;
  if (!accountId) {
    throw new Error('Porchlight needs a signed-in Atlassian account.');
  }
  return accountId;
}

/**
 * Save one note.
 *
 * @param {{ payload: { body?: unknown, clientKey?: unknown }, context: { accountId?: string } }} req
 */
export async function saveNote(req) {
  const authorAccountId = signedInAccountId(req);
  const { body, clientKey } = req.payload ?? {};

  if (typeof clientKey !== 'string' || !CLIENT_KEY_PATTERN.test(clientKey)) {
    return { ok: false, error: 'bad_request' };
  }

  // Check the text again on the server. The page already checked it, but the
  // page's check can be skipped by anyone who calls the resolver directly.
  const check = validateNoteBody(body);
  if (!check.ok) {
    return check;
  }

  await ensureMigrated();
  const note = await insertNoteOnce({ clientKey, body: check.body, authorAccountId });
  if (!note) {
    // The key exists, but on another author's note. A real page never does this,
    // because every save gets a fresh random key.
    throw new Error('This client key is already used by another note.');
  }

  // The proof line from the spec's non-functionals: `forge logs` shows one per save.
  console.log(`porchlight.note.saved id=${note.id}`);
  return { ok: true, note };
}

/**
 * List the newest notes from everyone on the site. Notes are never filtered by author:
 * the whole team reads the same list.
 *
 * @param {{ context: { accountId?: string } }} req
 */
export async function listNotes(req) {
  signedInAccountId(req);
  await ensureMigrated();
  return { ok: true, notes: await listNewestNotes() };
}
