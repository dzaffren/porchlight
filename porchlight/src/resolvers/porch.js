// The porch light resolvers the Porchlight page calls with invoke() from @forge/bridge:
//   invoke('listStatuses')
//   invoke('setMyStatus', { kind, untilDate, timeZone })
//
// Each person sets only their own porch light (spec porch-status, decisions D24 and D26).
// Whose row changes always comes from Forge's trusted context, never from the payload.
// Anyone who can open Porchlight reads everyone's porch light: setting it announces it.
//
// Return values follow the notes and team resolvers:
//   - { ok: true, ... } when it worked.
//   - { ok: false, error } for an answer the page shows to the person.
//   - A thrown error for anything else (database down, no signed-in user).
import { checkStatusDate, effectiveStatus, isKnownTimeZone, todayIn } from '../lib/porch.js';
import { ensureMigrated } from '../db/migrate.js';
import { deleteStatus, getStatus, listStatuses as listStoredStatuses, upsertStatus } from '../db/porch.js';
import { signedInAccountId } from './context.js';

/**
 * Everyone's stored porch light choice, as saved: { accountId, kind, untilDate }.
 *
 * These are raw choices. A passed date is still returned as it was stored, because only the
 * page knows each person's Jira time zone and `active` flag, and so only the page can work out
 * Here, Away, Leaving or Left with effectiveStatus() from src/lib/porch.js.
 *
 * @param {{ context: { accountId?: string } }} req
 */
export async function listStatuses(req) {
  signedInAccountId(req);
  await ensureMigrated();
  return { ok: true, statuses: await listStoredStatuses() };
}

// The answers from checkStatusDate that a real form can never send: only a changed request
// can carry an unknown kind or a badly written date.
const MALFORMED_CHOICE = ['bad_kind', 'bad_date'];

/**
 * Set the signed-in person's own porch light.
 *
 * The whole payload is untrusted. The page sends the person's own Jira time zone, because the
 * resolver cannot ask Jira itself (no @forge/api, decision D21), and "today" must be the
 * person's own day (scenario 5). The time zone only decides which day it is; it never decides
 * whose row changes.
 *
 * Checks, in order:
 *  1. The time zone is one Intl knows.               Else { ok: false, error: 'bad_request' }
 *  2. The kind and date pass checkStatusDate.        Else 'bad_request', 'past' or 'too_far'
 *  3. The stored choice has not already become Left. Else { ok: false, error: 'left' }
 *
 * @param {{ payload: { kind?: unknown, untilDate?: unknown, timeZone?: unknown },
 *           context: { accountId?: string } }} req
 * @returns {Promise<{ ok: true, status: { kind: 'here' } | { kind: 'away' | 'leaving', untilDate: string } }
 *                 | { ok: false, error: 'bad_request' | 'past' | 'too_far' | 'left' }>}
 */
export async function setMyStatus(req) {
  const accountId = signedInAccountId(req);
  const { kind, untilDate, timeZone } = req.payload ?? {};
  const now = new Date();

  if (!isKnownTimeZone(timeZone)) {
    return { ok: false, error: 'bad_request' };
  }

  // The same date rule the page runs before sending. The page's check can be skipped by anyone
  // who calls the resolver directly, so it runs again here, with the server's clock.
  const check = checkStatusDate(kind, untilDate, todayIn(timeZone, now));
  if (!check.ok) {
    return { ok: false, error: MALFORMED_CHOICE.includes(check.error) ? 'bad_request' : check.error };
  }

  // Left is final (scenario 3): once the stored Leaving date has passed in the person's own
  // day, nobody can change their porch light again, not even to Here. The person is calling,
  // so they are an active account; only the date can make them Left here.
  await ensureMigrated();
  const stored = await getStatus(accountId);
  if (effectiveStatus(stored, { active: true, timeZone }, now).kind === 'left') {
    return { ok: false, error: 'left' };
  }

  // Here is no row: deleting it turns the porch light off. Any date sent with Here is ignored.
  // Away and Leaving replace whatever the person saved before.
  let status;
  if (kind === 'here') {
    await deleteStatus(accountId);
    status = { kind: 'here' };
  } else {
    await upsertStatus(accountId, kind, untilDate);
    status = { kind, untilDate };
  }

  // The proof line from the spec's non-functionals: `forge logs` shows one per save.
  console.log(`porchlight.status.set kind=${kind} by=${accountId}`);
  return { ok: true, status };
}
