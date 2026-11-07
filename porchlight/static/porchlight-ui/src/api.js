// Everything the page asks of Forge and Jira goes through this file.
// Keeping it in one place means the tests can swap it for test doubles, because
// @forge/bridge only works inside Jira's frame, not in a test runner.
import { invoke, requestJira, router } from '@forge/bridge';

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
 * @returns {Promise<{ accountId: string, displayName: string }>}
 */
export async function fetchMyself() {
  const response = await requestJira('/rest/api/3/myself');
  if (!response.ok) {
    throw new Error(`Jira /myself answered ${response.status}`);
  }
  const me = await response.json();
  return { accountId: me.accountId, displayName: me.displayName };
}

/** Jira's /user/bulk returns at most this many people per request. */
const NAMES_PER_REQUEST = 100;

/**
 * Current display names for a list of account IDs, in as few requests as Jira allows.
 * Names are looked up each time rather than stored with the note, so a renamed
 * person shows their new name (decision D12).
 *
 * @param {string[]} accountIds - any number; asked for in batches of 100
 * @returns {Promise<Record<string, string>>} accountId → display name
 */
export async function fetchDisplayNames(accountIds) {
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
  return Object.fromEntries(pages.flatMap((page) => page.values).map((user) => [user.accountId, user.displayName]));
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

// The account ID goes inside a JQL string, so it must never carry quotes or spaces.
// IDs come from our own team list, but that list is filled from the page, so check
// again here, with the same rule as the team resolvers.
const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/;

function checkAccountId(accountId) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) {
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
 * @returns {Promise<Array<{ accountId: string, displayName: string }>>}
 */
export async function searchUsers(query) {
  const users = await jira(`/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`);
  return users
    .filter((user) => user.accountType === 'atlassian')
    .map((user) => ({ accountId: user.accountId, displayName: user.displayName }));
}

// "Flagged" is a custom field, and its ID (such as customfield_10021) differs per site.
// It never changes while the page is open, so it is looked up once and kept.
let flaggedFieldPromise = null;

/** The ID of the site's "Flagged" field, or null if the site has none. */
export function findFlaggedFieldId() {
  flaggedFieldPromise ??= jira('/rest/api/3/field')
    .then((fields) => fields.find((field) => field.custom && field.name === 'Flagged')?.id ?? null)
    .catch((error) => {
      // Forget a failure, so "Try again" asks Jira again instead of failing forever.
      flaggedFieldPromise = null;
      throw error;
    });
  return flaggedFieldPromise;
}

/**
 * Up to 100 of the teammate's open tickets, newest update first, with everything that
 * open work, blockers and next steps need (decision D22).
 * @param {string} accountId
 * @param {string | null} flaggedFieldId - from findFlaggedFieldId
 * @returns {Promise<{ issues: Array, isLast: boolean }>}
 */
export async function searchOpenWork(accountId, flaggedFieldId) {
  const jql = openWorkJql(accountId);
  const fields = ['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks'];
  if (flaggedFieldId) fields.push(flaggedFieldId);
  const page = await jira('/rest/api/3/search/jql', { jql, maxResults: 100, fields });
  return { issues: page.issues, isLast: page.isLast ?? !page.nextPageToken };
}

/**
 * How many open tickets the teammate has in all. search/jql gives no total, so this
 * is asked only when the open-work search was not the last page.
 */
export async function countOpenWork(accountId) {
  const answer = await jira('/rest/api/3/search/approximate-count', { jql: openWorkFilter(accountId) });
  return answer.count;
}

// How many history entries and comments one top-up request asks for.
const HISTORY_PAGE = 100;
const COMMENT_PAGE = 50;

/** A clipped ticket's newest history entries. The changelog is oldest first, so read its end. */
async function newestHistories(key, total) {
  const startAt = Math.max(0, total - HISTORY_PAGE);
  const page = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=${HISTORY_PAGE}`);
  return page.values;
}

/** A clipped ticket's newest comments. */
async function newestComments(key) {
  const page = await jira(`/rest/api/3/issue/${encodeURIComponent(key)}/comment?orderBy=-created&maxResults=${COMMENT_PAGE}`);
  return page.comments;
}

/**
 * One ticket from the activity search. The search returns only some history entries
 * and comments per ticket; when `total` says there are more, fetch the newest ones.
 */
async function withNewestEntries(issue) {
  const changelog = issue.changelog ?? { histories: [], total: 0 };
  const comment = issue.fields.comment ?? { comments: [], total: 0 };
  const historyClipped = changelog.total > changelog.histories.length;
  const commentsClipped = comment.total > comment.comments.length;
  if (!historyClipped && !commentsClipped) return issue;

  const [histories, comments] = await Promise.all([
    historyClipped ? newestHistories(issue.key, changelog.total) : changelog.histories,
    commentsClipped ? newestComments(issue.key) : comment.comments,
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
 */
export async function searchRecentActivity(accountId) {
  checkAccountId(accountId);
  const page = await jira('/rest/api/3/search/jql', {
    jql: `issuekey in updatedBy("${accountId}", "-14d") ORDER BY updated DESC`,
    maxResults: 20,
    fields: ['summary', 'comment'],
    expand: 'changelog',
  });
  return Promise.all(page.issues.map(withNewestEntries));
}

/**
 * Open a Jira page, such as "/browse/PAY-142", in a new tab. The page runs in a
 * sandboxed frame, where a plain link would open inside the frame; Forge's router
 * opens it in Jira itself.
 */
export function openInJira(path) {
  return router.open(path);
}
