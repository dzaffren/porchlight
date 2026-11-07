// The Rovo action behind the Porchlight agent: "porchlight-catch-up" in manifest.yml.
//
// A person asks the agent in Rovo Chat, such as "Catch me up on Aisha". Rovo's model calls
// this function with the name, and writes its answer from the JSON this function returns.
// See "Interface" in docs/specs/ask-the-trail.md for every result and field.
//
//   payload.person / payload.accountId   (written by the model: untrusted)
//     → 1. find the person      → "none" | "several" | one person
//     → 2. read, all at once     site address, the asker, the person, porch light, catch-up
//     → 3. shape the answer      "found", with a link on every ticket
//   any failure                  → "jira-error" (never a half answer, never a thrown error)
//
// Security:
//  - Every Jira read runs with api.asUser(): as the person chatting, so Jira's own permissions
//    hide every ticket they cannot open (decision D31). No check of our own can miss one.
//  - The inputs are text the model wrote. `person` reaches Jira only URL-encoded inside the
//    user search, cut to 100 characters. `accountId` is used only when it passes isAccountId,
//    so a quote can never reach JQL.
//  - The porch light is one asApp SQL read by a bound account ID. Porch lights are already
//    shown to everyone who opens Porchlight (decision D24).
//  - Nothing is stored, and the log line names nobody.
import api, { assumeTrustedRoute } from '@forge/api';
import { fourteenDaysBefore } from '../lib/catchup.js';
import {
  countOpenWork,
  findFlaggedFieldId,
  isAccountId,
  loadCatchUp,
  openWorkJql,
  searchOpenWork,
  searchRecentActivity,
  searchUsers,
} from '../lib/catchup-jira.js';
import { effectiveStatus } from '../lib/porch.js';
import { ensureMigrated } from '../db/migrate.js';
import { getStatus } from '../db/porch.js';

// The longest name we pass to Jira's user search. A real name is far shorter; the model
// sometimes writes a whole sentence instead (docs/learnings/forge.md).
const PERSON_LIMIT = 100;

// "several" lists this many names. The agent asks for the full name when there are more.
const MATCH_LIMIT = 5;

// "Latest changes" sends at most the 30 newest changes, plus a count of the rest (D33).
const CHANGES_LIMIT = 30;

// Words that mean "the person chatting", as in "catch me up on me" (ledger O10).
const ME = ['me', 'my', 'myself'];

const FOOTER = 'Showing only tickets you can open.';

/**
 * One Jira REST call as the person chatting: a GET, or a POST when there is a body.
 * This is the same jira(path, body) "transport" the page builds with requestJira, so the
 * shared reads in src/lib/catchup-jira.js run here unchanged.
 *
 * assumeTrustedRoute tells Forge the path is safe to send as it is. The reads build their
 * paths from fixed text, and URL-encode every value they put in, so that holds.
 *
 * A non-2xx answer throws. Its message has only the status, because a path can hold a name.
 */
async function jiraAsAsker(path, body) {
  const options = body === undefined
    ? { method: 'GET', headers: { Accept: 'application/json' } }
    : { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const response = await api.asUser().requestJira(assumeTrustedRoute(path), options);
  if (!response.ok) {
    throw new Error(`Jira answered ${response.status}`);
  }
  return response.json();
}

// The shared reads, with this file's transport filled in. loadCatchUp takes them as one
// object, the same way the page passes its api.js module.
const reads = {
  findFlaggedFieldId: () => findFlaggedFieldId(jiraAsAsker),
  searchOpenWork: (accountId, flaggedFieldId) => searchOpenWork(jiraAsAsker, accountId, flaggedFieldId),
  countOpenWork: (accountId) => countOpenWork(jiraAsAsker, accountId),
  searchRecentActivity: (accountId) => searchRecentActivity(jiraAsAsker, accountId),
};

/** A person as the result shows them: only who they are. */
const named = ({ accountId, displayName }) => ({ accountId, displayName });

/** What the porch-light rule needs about a person, from Jira's user APIs. */
const detailsFrom = ({ active, timeZone }) => ({ active, timeZone });

/** The `person` input, trimmed and cut to PERSON_LIMIT characters. Anything else is "". */
function cleanPerson(person) {
  if (typeof person !== 'string') return '';
  // Array.from splits by character, so an emoji or accent is never cut in half.
  return Array.from(person.trim()).slice(0, PERSON_LIMIT).join('').trim();
}

/**
 * Step 1: who the asker means.
 *
 *   valid accountId input  → GET user?accountId=…  (the asker picked from "several")
 *   "me", "my", "myself"   → GET myself            (the asker themselves)
 *   any other name         → user search: one match, or exactly one with that full name
 *
 * @returns {Promise<
 *   | { result: 'found', person: { accountId, displayName }, details?: object, asker?: object }
 *   | { result: 'none', searched: string }
 *   | { result: 'several', matches: Array<{ accountId, displayName }>, more: number }>}
 *   `details` ({ active, timeZone }) is set when Jira's answer already had them, so step 2
 *   does not ask again. `asker` is set when the person is the asker, for the same reason.
 */
async function findPerson(payload) {
  if (isAccountId(payload.accountId)) {
    const user = await jiraAsAsker(`/rest/api/3/user?accountId=${encodeURIComponent(payload.accountId)}`);
    return { result: 'found', person: named(user), details: detailsFrom(user) };
  }

  const typed = cleanPerson(payload.person);
  if (ME.includes(typed.toLowerCase())) {
    const myself = await jiraAsAsker('/rest/api/3/myself');
    return { result: 'found', person: named(myself), details: detailsFrom(myself), asker: myself };
  }
  // No name at all: the prompt asks for one first, so this is only a model's mistake.
  // Answer "none" without searching, because an empty search would list everyone.
  if (typed === '') {
    return { result: 'none', searched: '' };
  }

  const matches = await searchUsers(jiraAsAsker, typed);
  if (matches.length === 0) {
    return { result: 'none', searched: typed };
  }
  // "Aisha Rahman" typed, and Jira returns Aisha Rahman and Aisha Rahmat: the asker already
  // said which one (ledger O12). Only an exact full name counts, with case ignored.
  const exact = matches.filter((match) => match.displayName?.trim().toLowerCase() === typed.toLowerCase());
  const chosen = matches.length === 1 ? matches[0] : exact.length === 1 ? exact[0] : null;
  if (!chosen) {
    return { result: 'several', matches: matches.slice(0, MATCH_LIMIT).map(named), more: Math.max(0, matches.length - MATCH_LIMIT) };
  }
  // The user search gives no `active` flag or time zone, so there are no details: step 2 reads them.
  return { result: 'found', person: chosen };
}

/**
 * Step 2 and 3: read everything for the found person at the same time, and shape the answer.
 *
 * @param {{ person: { accountId, displayName }, details?: object, asker?: object }} found - from findPerson
 * @param {Date} now
 */
async function readCatchUp({ person, details, asker }, now) {
  const { accountId } = person;
  // Ask Jira for the person's `active` flag and time zone only when step 1 did not get them.
  const detailsRead = details
    ? Promise.resolve(details)
    : jiraAsAsker(`/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`).then(detailsFrom);

  const [serverInfo, myself, personDetails, row, catchUp] = await Promise.all([
    // The site address for the links. Rovo's context has no site URL (ledger O9).
    jiraAsAsker('/rest/api/3/serverInfo'),
    // The asker's own time zone, for when Jira hides the person's (the same as the page).
    asker ? Promise.resolve(asker) : jiraAsAsker('/rest/api/3/myself'),
    detailsRead,
    // A fresh install on a new site may have no tables yet, so run the migrations first.
    ensureMigrated().then(() => getStatus(accountId)),
    loadCatchUp(reads, accountId, now),
  ]);

  // Jira's baseUrl may end in "/"; drop it so links never have "//browse".
  const site = String(serverInfo.baseUrl).replace(/\/+$/, '');
  const link = (key) => `${site}/browse/${key}`;
  const ticket = (row) => ({ key: row.key, summary: row.summary, url: link(row.key) });

  const { openWork, changes, blockers, nextSteps } = catchUp;
  return {
    result: 'found',
    person,
    porchLight: effectiveStatus(row, personDetails, now, myself.timeZone),
    openWork: {
      tickets: openWork.rows.map((row) => ({ key: row.key, summary: row.summary, status: row.statusName, url: link(row.key) })),
      more: openWork.more,
      // The same search as the page's "and 13 more in Jira" link.
      moreUrl: openWork.more > 0 ? `${site}/issues/?jql=${encodeURIComponent(openWorkJql(accountId))}` : null,
    },
    latestChanges: {
      since: fourteenDaysBefore(now).toISOString().slice(0, 10),
      more: Math.max(0, changes.length - CHANGES_LIMIT),
      // toChanges sorts newest first, so the first 30 are the newest. Jira writes times as
      // "2026-11-06T08:30:00.000+0000", so the first ten characters are the day.
      items: changes.slice(0, CHANGES_LIMIT).map((change) => ({
        date: change.created.slice(0, 10),
        what: change.text,
        key: change.key,
        url: link(change.key),
      })),
    },
    // A ticket both flagged and blocked names its blocker, the same as the panel.
    blockers: blockers.map((row) => (row.blockedBy
      ? { ...ticket(row), blockedBy: { key: row.blockedBy.key, summary: row.blockedBy.summary, url: link(row.blockedBy.key) } }
      : { ...ticket(row), flagged: true })),
    nextSteps: nextSteps.map((row) => ({ key: row.key, summary: row.summary, due: row.due, url: link(row.key) })),
    footer: FOOTER,
  };
}

/** How many different tickets a result names, for the log line. */
function distinctTickets(answer) {
  if (answer.result !== 'found') return null;
  const keys = new Set([
    ...answer.openWork.tickets.map((row) => row.key),
    ...answer.latestChanges.items.map((row) => row.key),
    ...answer.blockers.flatMap((row) => [row.key, row.blockedBy?.key].filter(Boolean)),
    ...answer.nextSteps.map((row) => row.key),
  ]);
  return keys.size;
}

/**
 * The action handler, named `index.catchUp` in manifest.yml.
 *
 * Forge passes the action's inputs as top-level keys of `payload` (`person`, `accountId`),
 * and its own trusted `payload.context`. We never need the context: asUser() already knows
 * who is chatting, and Jira's /myself tells us the rest.
 *
 * It never throws. A thrown error would reach the model as a vague failure, so every
 * problem becomes { result: "jira-error" }, which the prompt turns into "ask again".
 *
 * @param {{ person?: unknown, accountId?: unknown }} payload
 * @returns {Promise<object>} one of the four results in the spec's "Results" section
 */
export async function catchUp(payload) {
  const started = Date.now();
  const now = new Date();
  let found = null;
  let answer;
  try {
    const lookup = await findPerson(payload ?? {});
    if (lookup.result === 'found') {
      found = lookup;
      answer = await readCatchUp(lookup, now);
    } else {
      answer = lookup;
    }
  } catch (error) {
    // Only the message: the payload holds the asker's words, which may name someone.
    console.error(`porchlight.rovo.catchUp error: ${error.message}`);
    answer = found ? { result: 'jira-error', person: found.person } : { result: 'jira-error' };
  }

  // The proof line from the spec's non-functionals: one per ask, with no names or IDs.
  const tickets = distinctTickets(answer);
  const ms = Date.now() - started;
  console.log(`porchlight.rovo.catchUp result=${answer.result}${tickets === null ? '' : ` tickets=${tickets}`} ms=${ms}`);
  return answer;
}
