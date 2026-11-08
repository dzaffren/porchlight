// The catch-up's Jira reads, shared by the page and the Rovo action (decision D32).
//
// Every read takes a `jira(path, body)` function first. That function is the
// "transport": it sends one Jira REST call and resolves to the JSON answer, or rejects
// when Jira answers with an error. Each caller brings its own:
//
//   page (static/porchlight-ui/src/api.js) ── jira() with requestJira ──┐
//                                                                       ├─ these reads → Jira
//   Rovo action (backend Forge function) ─── jira() with asUser() ──────┘
//
// Both run as the person looking, so Jira only returns tickets that person can open
// (decision D21). So this file imports nothing from @forge/bridge (it only works inside
// Jira's frame) or @forge/api (it only works in a Forge function). Nothing here is stored.
//
// A GET passes only a path. A POST passes a path and a body (a plain object), and the
// transport turns the body into JSON.
import { toBlockers, toChanges, toNextSteps, toOpenWork } from './catchup.js';

// The account ID goes inside a JQL string, so it must never carry quotes or spaces.
// IDs come from our own team list, or from the Rovo model's input, so check them here
// with the same rule as the team resolvers.
const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Does this look like an Atlassian account ID, such as "712020:aisha-rahman"?
 * @param {unknown} accountId - untrusted, so it may not even be a string
 * @returns {boolean}
 */
export function isAccountId(accountId) {
  return typeof accountId === 'string' && ACCOUNT_ID.test(accountId);
}

/** Throws unless the value is an Atlassian account ID. Runs before any JQL is built. */
export function checkAccountId(accountId) {
  if (!isAccountId(accountId)) {
    throw new Error('Not an Atlassian account ID');
  }
}

/** The teammate's open tickets, as JQL: assigned to them and not done. */
function openWorkFilter(accountId) {
  checkAccountId(accountId);
  return `assignee = "${accountId}" AND statusCategory != Done`;
}

/** The open-work search, newest update first. Also used for the "and N more in Jira" link. */
export function openWorkJql(accountId) {
  return `${openWorkFilter(accountId)} ORDER BY updated DESC`;
}

/**
 * People on this site whose name matches, for "Add a teammate".
 * Only real people (accountType "atlassian"); apps and service customers are left out.
 * @param {(path: string, body?: object) => Promise<any>} jira - the transport
 * @param {string} query - any text; it is URL-encoded into the path
 * @returns {Promise<Array<{ accountId: string, displayName: string }>>}
 */
export async function searchUsers(jira, query) {
  const users = await jira(`/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`);
  return users
    .filter((user) => user.accountType === 'atlassian')
    .map((user) => ({ accountId: user.accountId, displayName: user.displayName }));
}

/**
 * The ID of the site's "Flagged" field, or null if the site has none.
 * "Flagged" is a custom field, and its ID (such as customfield_10021) differs per site.
 * There is no cache here: the page keeps the answer while it is open, and the action
 * asks each time, because a Forge function keeps nothing between calls.
 * @param {(path: string, body?: object) => Promise<any>} jira - the transport
 * @returns {Promise<string | null>}
 */
export async function findFlaggedFieldId(jira) {
  const fields = await jira('/rest/api/3/field');
  return fields.find((field) => field.custom && field.name === 'Flagged')?.id ?? null;
}

/**
 * Up to 100 of the teammate's open tickets, newest update first, with everything that
 * open work, blockers and next steps need (decision D22).
 * @param {(path: string, body?: object) => Promise<any>} jira - the transport
 * @param {string} accountId
 * @param {string | null} flaggedFieldId - from findFlaggedFieldId
 * @returns {Promise<{ issues: Array, isLast: boolean }>}
 */
export async function searchOpenWork(jira, accountId, flaggedFieldId) {
  const jql = openWorkJql(accountId);
  const fields = ['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks'];
  if (flaggedFieldId) fields.push(flaggedFieldId);
  const page = await jira('/rest/api/3/search/jql', { jql, maxResults: 100, fields });
  return { issues: page.issues, isLast: page.isLast ?? !page.nextPageToken };
}

/**
 * How many open tickets the teammate has in all. search/jql gives no total, so this
 * is asked only when the open-work search was not the last page.
 * @param {(path: string, body?: object) => Promise<any>} jira - the transport
 * @param {string} accountId
 * @returns {Promise<number>}
 */
export async function countOpenWork(jira, accountId) {
  const answer = await jira('/rest/api/3/search/approximate-count', { jql: openWorkFilter(accountId) });
  return answer.count;
}

// How many history entries and comments one top-up request asks for.
const HISTORY_PAGE = 100;
const COMMENT_PAGE = 50;

/** A clipped ticket's newest history entries. The changelog is oldest first, so read its end. */
async function newestHistories(jira, key, total) {
  const startAt = Math.max(0, total - HISTORY_PAGE);
  const page = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=${HISTORY_PAGE}`);
  return page.values;
}

/** A clipped ticket's newest comments. */
async function newestComments(jira, key) {
  const page = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?orderBy=-created&maxResults=${COMMENT_PAGE}`);
  return page.comments;
}

/**
 * One ticket from the activity search. The search returns only some history entries
 * and comments per ticket; when `total` says there are more, fetch the newest ones.
 * A ticket that was not clipped comes back as the same object.
 */
async function withNewestEntries(jira, issue) {
  const changelog = issue.changelog ?? { histories: [], total: 0 };
  const comment = issue.fields.comment ?? { comments: [], total: 0 };
  const historyClipped = changelog.total > changelog.histories.length;
  const commentsClipped = comment.total > comment.comments.length;
  if (!historyClipped && !commentsClipped) return issue;

  const [histories, comments] = await Promise.all([
    historyClipped ? newestHistories(jira, issue.key, changelog.total) : changelog.histories,
    commentsClipped ? newestComments(jira, issue.key) : comment.comments,
  ]);
  return {
    ...issue,
    fields: { ...issue.fields, comment: { ...comment, comments } },
    changelog: { ...changelog, histories },
  };
}

/**
 * The 20 tickets the teammate most recently updated in the last 14 days, each with its
 * status history and comments (decision D23). catchup.js keeps only their own changes.
 * @param {(path: string, body?: object) => Promise<any>} jira - the transport
 * @param {string} accountId
 * @returns {Promise<Array>} Jira's issues, with clipped ones topped up
 */
export async function searchRecentActivity(jira, accountId) {
  checkAccountId(accountId);
  const page = await jira('/rest/api/3/search/jql', {
    jql: `issuekey in updatedBy("${accountId}", "-14d") ORDER BY updated DESC`,
    maxResults: 20,
    fields: ['summary', 'comment'],
    expand: 'changelog',
  });
  return Promise.all(page.issues.map((issue) => withNewestEntries(jira, issue)));
}

/**
 * Read everything one catch-up needs from Jira and sort it into the four sections.
 * Rejects if any read fails, so the caller shows one error, never half a catch-up.
 *
 *   findFlaggedFieldId → searchOpenWork → (countOpenWork, only if there is more than one page)
 *   searchRecentActivity  (at the same time as the line above)
 *   → catchup.js → openWork · changes · blockers · nextSteps
 *
 * `reads` holds the four reads with the transport already filled in. The page passes
 * its api.js module (so its tests can swap api.js for test doubles); the action passes
 * its own object built from the functions above.
 *
 * @param {{
 *   findFlaggedFieldId: () => Promise<string | null>,
 *   searchOpenWork: (accountId: string, flaggedFieldId: string | null) => Promise<{ issues: Array, isLast: boolean }>,
 *   countOpenWork: (accountId: string) => Promise<number>,
 *   searchRecentActivity: (accountId: string) => Promise<Array>,
 * }} reads
 * @param {string} accountId - the teammate
 * @param {Date} now - the start of the 14-day window is worked out from this
 */
export async function loadCatchUp(reads, accountId, now) {
  const openWork = reads.findFlaggedFieldId().then(async (flaggedFieldId) => {
    const search = await reads.searchOpenWork(accountId, flaggedFieldId);
    // search/jql gives no total, so count only when there is more than one page.
    const total = search.isLast ? search.issues.length : await reads.countOpenWork(accountId);
    return { issues: search.issues, total, flaggedFieldId };
  });
  const [open, recent] = await Promise.all([openWork, reads.searchRecentActivity(accountId)]);
  return {
    openWork: toOpenWork(open.issues, open.total),
    changes: toChanges(recent, accountId, now),
    blockers: toBlockers(open.issues, open.flaggedFieldId),
    nextSteps: toNextSteps(open.issues),
  };
}
