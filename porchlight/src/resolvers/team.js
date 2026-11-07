// The team resolvers the Porchlight page calls with invoke() from @forge/bridge:
//   invoke('listTeam')
//   invoke('addTeammate', { accountId })
//
// Anyone who can open Porchlight may change the team list (spec catch-up-view, decision D16).
// Each person on the list shows who added them, and that adder always comes from
// Forge's trusted context, never from the payload.
//
// Return values follow the notes resolvers:
//   - { ok: true, ... } when it worked.
//   - { ok: false, error } for an answer the page shows to the person.
//   - A thrown error for anything else (database down, no signed-in user).
import { ensureMigrated } from '../db/migrate.js';
import { addMember, listMembers } from '../db/team.js';
import { signedInAccountId } from './context.js';

// Atlassian account IDs look like "712020:6d1f0a3e-..." or, for older accounts,
// "5b10ac8d82e05b22cc7d4ef5". Letters, digits, ":", "_" and "-", at most 128 characters
// (the column size). Anything else is refused before it reaches the database.
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Read the teammate's account ID from the untrusted payload.
 *
 * @param {{ payload?: { accountId?: unknown } }} req
 * @returns {string | null} the account ID, or null when it is missing or malformed
 */
function payloadAccountId(req) {
  const accountId = req.payload?.accountId;
  return typeof accountId === 'string' && ACCOUNT_ID_PATTERN.test(accountId) ? accountId : null;
}

/**
 * Everyone on the team, oldest first, at most 200 people.
 *
 * @param {{ context: { accountId?: string } }} req
 */
export async function listTeam(req) {
  signedInAccountId(req);
  await ensureMigrated();
  return { ok: true, members: await listMembers() };
}

/**
 * Put one person on the team.
 *
 * @param {{ payload: { accountId?: unknown }, context: { accountId?: string } }} req
 * @returns {Promise<{ ok: true, member: object }
 *                 | { ok: false, error: 'already_on_team', member: object }
 *                 | { ok: false, error: 'bad_request' }>}
 *   For already_on_team, `member` is the row as it was first added, so the page can
 *   say who is already there.
 */
export async function addTeammate(req) {
  const addedByAccountId = signedInAccountId(req);
  const accountId = payloadAccountId(req);
  if (!accountId) {
    return { ok: false, error: 'bad_request' };
  }

  await ensureMigrated();
  const { member, added } = await addMember({ accountId, addedByAccountId });
  if (!added) {
    return { ok: false, error: 'already_on_team', member };
  }

  // The proof line from the spec's non-functionals: `forge logs` shows one per add.
  console.log(`porchlight.team.added by=${addedByAccountId}`);
  return { ok: true, member };
}
