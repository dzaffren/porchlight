// The porch light resolvers the Porchlight page calls with invoke() from @forge/bridge:
//   invoke('listStatuses')
//   invoke('setMyStatus', { kind, untilDate })
//
// Each person sets only their own porch light (spec porch-status, decisions D24 and D26).
// Whose row changes always comes from Forge's trusted context, never from the payload.
// Anyone who can open Porchlight reads everyone's porch light: setting it announces it.
//
// Return values follow the notes and team resolvers:
//   - { ok: true, ... } when it worked.
//   - { ok: false, error } for an answer the page shows to the person.
//   - A thrown error for anything else (database down, no signed-in user).
import { checkStatusDate, effectiveStatus, todayIn } from '../lib/porch.js';
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

// The two edges of the calendar. At any moment, the date in every place on Earth lies between
// "today" in these two zones. (The Etc/ names have their sign reversed on purpose: "Etc/GMT+12"
// is UTC-12.)
const LAST_DAY_ZONE = 'Etc/GMT+12'; // UTC-12: the last place where a day is still running
const FIRST_DAY_ZONE = 'Etc/GMT-14'; // UTC+14: the first place where a new day starts

/**
 * Set the signed-in person's own porch light.
 *
 * The whole payload is untrusted. The resolver cannot ask Jira for the person's time zone
 * (no @forge/api, decision D21), and it never takes one from the page: a changed request could
 * name a zone a day behind and undo a Left (review finding F1). So it checks dates against the
 * whole planet instead, with the server's clock:
 *  - a date is "past" only once it has ended everywhere (in UTC-12), and "too far" only when it
 *    is over a year after the newest day anywhere (UTC+14), so a real choice is never refused;
 *  - Leaving counts as Left as soon as the day after it has begun anywhere (UTC+14), so nobody
 *    can stretch Left by choosing a zone. The lamp everyone sees still uses each person's own
 *    Jira time zone, worked out on the page.
 * The page checks the person's own day first, so the words a person sees come from there.
 *
 * Checks, in order:
 *  1. The kind and date pass checkStatusDate.        Else 'bad_request', 'past' or 'too_far'
 *  2. The stored choice has not already become Left. Else { ok: false, error: 'left' }
 *
 * @param {{ payload: { kind?: unknown, untilDate?: unknown }, context: { accountId?: string } }} req
 * @returns {Promise<{ ok: true, status: { kind: 'here' } | { kind: 'away' | 'leaving', untilDate: string } }
 *                 | { ok: false, error: 'bad_request' | 'past' | 'too_far' | 'left' }>}
 */
export async function setMyStatus(req) {
  const accountId = signedInAccountId(req);
  const { kind, untilDate } = req.payload ?? {};
  const now = new Date();

  // The same date rule the page runs before sending, run twice: once against the oldest
  // "today" on Earth for "past", once against the newest for "too far". The page's own check
  // can be skipped by anyone who calls the resolver directly, so it runs again here.
  const againstLastDay = checkStatusDate(kind, untilDate, todayIn(LAST_DAY_ZONE, now));
  if (MALFORMED_CHOICE.includes(againstLastDay.error)) {
    return { ok: false, error: 'bad_request' };
  }
  if (againstLastDay.error === 'past') {
    return { ok: false, error: 'past' };
  }
  if (checkStatusDate(kind, untilDate, todayIn(FIRST_DAY_ZONE, now)).error === 'too_far') {
    return { ok: false, error: 'too_far' };
  }

  // Left is final (scenario 3): once the stored Leaving date has passed, nobody can change their
  // porch light again, not even to Here. The person is calling, so they are an active account;
  // only the date can make them Left here.
  await ensureMigrated();
  const stored = await getStatus(accountId);
  if (effectiveStatus(stored, { active: true, timeZone: FIRST_DAY_ZONE }, now).kind === 'left') {
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
