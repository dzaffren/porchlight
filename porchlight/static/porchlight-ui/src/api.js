// Everything the page asks of Forge and Jira goes through this file.
// Keeping it in one place means the tests can swap it for test doubles, because
// @forge/bridge only works inside Jira's frame, not in a test runner.
import { invoke, requestJira, router, view } from '@forge/bridge';
import * as catchUpJira from '@lib/catchup-jira.js';

/**
 * The newest notes from everyone, from the listNotes resolver.
 * @returns {Promise<Array<{ id: string, body: string, authorAccountId: string, createdAt: string }>>}
 */
export async function fetchNotes() {
  const result = await invoke('listNotes');
  if (!result?.ok) {
    throw new Error('listNotes did not return notes');
  }
  return result.notes;
}

/**
 * Save one note through the saveNote resolver.
 * Resolves to { ok: true, note } or { ok: false, error }; rejects when the save failed.
 */
export function saveNote({ body, clientKey }) {
  return invoke('saveNote', { body, clientKey });
}

/**
 * Who is looking at the page. requestJira runs as the viewer, so Jira's own
 * permissions apply (the read:jira-user scope in manifest.yml allows it).
 * The time zone is the one the viewer set in their Atlassian profile, such as
 * "Asia/Kuala_Lumpur". The porch light form checks dates in it, and sends it on save.
 * @returns {Promise<{ accountId: string, displayName: string, timeZone: string | undefined }>}
 */
export async function fetchMyself() {
  const response = await requestJira('/rest/api/3/myself');
  if (!response.ok) {
    throw new Error(`Jira /myself answered ${response.status}`);
  }
  const me = await response.json();
  return { accountId: me.accountId, displayName: me.displayName, timeZone: me.timeZone };
}

/** Jira's /user/bulk returns at most this many people per request. */
const NAMES_PER_REQUEST = 100;

/**
 * What Jira says about each person: their current name, whether the account is active,
 * and their profile's time zone. All of it is looked up each time, never stored
 * (decisions D12 and D27), so a renamed or deactivated person shows as they are now.
 *
 * A person Jira leaves out of its answer is left out here too. The page then keeps their
 * stored porch light, rather than guess that they have left (risk O3).
 *
 * @param {string[]} accountIds - any number; asked for in batches of 100
 * @returns {Promise<Record<string, { displayName: string, active: boolean, timeZone: string | undefined }>>}
 */
export async function fetchPeople(accountIds) {
  if (accountIds.length === 0) {
    return {};
  }
  // Jira answers at most 100 people per request, and a team list plus the people who
  // added them can be more (the list holds up to 200). Ask in batches of 100, together.
  const batches = [];
  for (let i = 0; i < accountIds.length; i += NAMES_PER_REQUEST) {
    batches.push(accountIds.slice(i, i + NAMES_PER_REQUEST));
  }
  const pages = await Promise.all(batches.map(async (batch) => {
    const query = batch.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
    const response = await requestJira(`/rest/api/3/user/bulk?maxResults=${NAMES_PER_REQUEST}&${query}`);
    if (!response.ok) {
      throw new Error(`Jira /user/bulk answered ${response.status}`);
    }
    return response.json();
  }));
  // Keep only the three fields the page uses; Jira sends more (such as email addresses).
  return Object.fromEntries(pages.flatMap((page) => page.values).map((user) => [
    user.accountId,
    { displayName: user.displayName, active: user.active, timeZone: user.timeZone },
  ]));
}

/**
 * Current display names for a list of account IDs, in as few requests as Jira allows.
 * Names are looked up each time rather than stored with the note, so a renamed
 * person shows their new name (decision D12). It is the same request as fetchPeople.
 *
 * @param {string[]} accountIds
 * @returns {Promise<Record<string, string>>} accountId → display name
 */
export async function fetchDisplayNames(accountIds) {
  const people = await fetchPeople(accountIds);
  return Object.fromEntries(Object.entries(people).map(([accountId, person]) => [accountId, person.displayName]));
}

// ---------------------------------------------------------------------------------
// The team list (resolvers in src/resolvers/team.js, stored in Forge SQL).
// ---------------------------------------------------------------------------------

/**
 * Everyone on the team, oldest first, from the listTeam resolver.
 * @returns {Promise<Array<{ accountId: string, addedByAccountId: string, addedAt: string }>>}
 */
export async function fetchTeam() {
  const result = await invoke('listTeam');
  if (!result?.ok) {
    throw new Error('listTeam did not return the team');
  }
  return result.members;
}

/**
 * Put one person on the team. Resolves to the resolver's answer: { ok: true, … } or
 * { ok: false, error } (such as 'already_on_team'). Rejects when the call failed.
 */
export function addTeammate(accountId) {
  return invoke('addTeammate', { accountId });
}

/** Take one person off the team. Same answers as addTeammate. Jira is not touched. */
export function removeTeammate(accountId) {
  return invoke('removeTeammate', { accountId });
}

// ---------------------------------------------------------------------------------
// Porch lights (resolvers in src/resolvers/porch.js, stored in Forge SQL).
// Only what a person chose is stored: "away until" or "leaving on" a date. Here has no
// row, and Left is never stored; @lib/porch.js works both out when the page shows them.
// ---------------------------------------------------------------------------------

/**
 * Everyone's stored porch light, from the listStatuses resolver.
 * @returns {Promise<Array<{ accountId: string, kind: 'away' | 'leaving', untilDate: string }>>}
 */
export async function fetchStatuses() {
  const result = await invoke('listStatuses');
  if (!result?.ok) {
    throw new Error('listStatuses did not return statuses');
  }
  return result.statuses;
}

/**
 * Set the viewer's own porch light. The resolver takes whose row it is from Forge's
 * context, never from the page, so nobody can set someone else's.
 *
 * No time zone is sent: the resolver never trusts one from the page, so it checks dates
 * against every time zone on Earth instead (review finding F1). The page's own check, in the
 * viewer's own day, runs first and gives the person the words they see.
 *
 * @param {{ kind: 'here' | 'away' | 'leaving', untilDate: string | null }} choice
 * @returns {Promise<{ ok: true, status: unknown } | { ok: false, error: 'bad_request' | 'past' | 'too_far' | 'left' }>}
 *   Rejects when the call itself failed.
 */
export function setMyStatus({ kind, untilDate }) {
  return invoke('setMyStatus', { kind, untilDate });
}

// ---------------------------------------------------------------------------------
// Jira reads for the catch-up. requestJira runs as the viewer, so Jira only returns
// tickets the viewer can open (decision D21). Nothing here is stored.
// ---------------------------------------------------------------------------------

/**
 * One Jira REST call that expects JSON back: a GET, or a POST when there is a body.
 * A non-2xx answer becomes an error, so the catch-up can show "Couldn't load … Try again."
 */
async function jira(path, body) {
  const options = body === undefined
    ? { method: 'GET', headers: { Accept: 'application/json' } }
    : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await requestJira(path, options);
  if (!response.ok) {
    throw new Error(`Jira ${path} answered ${response.status}`);
  }
  return response.json();
}

// The reads themselves live in the backend's src/lib/catchup-jira.js, so the Rovo action
// sends exactly the same requests (decision D32). Each wrapper below fills in this page's
// jira() as the transport, and keeps the names and arguments the page has always used.

/** The open-work search, newest update first. Also used for the "and N more in Jira" link. */
export { openWorkJql } from '@lib/catchup-jira.js';

/** People on this site whose name matches, for "Add a teammate". Only real people. */
export const searchUsers = (query) => catchUpJira.searchUsers(jira, query);

// "Flagged" is a custom field, and its ID (such as customfield_10021) differs per site.
// It never changes while the page is open, so it is looked up once and kept.
let flaggedFieldPromise = null;

/** The ID of the site's "Flagged" field, or null if the site has none. */
export function findFlaggedFieldId() {
  flaggedFieldPromise ??= catchUpJira.findFlaggedFieldId(jira).catch((error) => {
    // Forget a failure, so "Try again" asks Jira again instead of failing forever.
    flaggedFieldPromise = null;
    throw error;
  });
  return flaggedFieldPromise;
}

/** Up to 100 of the teammate's open tickets, with what all three open-work sections need. */
export const searchOpenWork = (accountId, flaggedFieldId) => catchUpJira.searchOpenWork(jira, accountId, flaggedFieldId);

/** How many open tickets the teammate has in all; asked only when there is a second page. */
export const countOpenWork = (accountId) => catchUpJira.countOpenWork(jira, accountId);

/** The 20 tickets the teammate most recently updated in 14 days, with history and comments. */
export const searchRecentActivity = (accountId) => catchUpJira.searchRecentActivity(jira, accountId);

/**
 * The Jira site's address, such as "https://handover-demo.atlassian.net", from Forge's
 * context. Links use it as their full href, so a middle-click or "Open link in new tab"
 * goes to Jira, not to the app frame's own host.
 * @returns {Promise<string>}
 */
export async function getSiteUrl() {
  const context = await view.getContext();
  return String(context.siteUrl ?? '').replace(/\/+$/, '');
}

/**
 * Open a Jira page, such as "/browse/PAY-142", in a new tab. The page runs in a
 * sandboxed frame, where a plain link would open inside the frame; Forge's router
 * opens it in Jira itself.
 */
export function openInJira(path) {
  return router.open(path);
}
