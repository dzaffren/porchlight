// The catch-up rules (decision D18), as plain functions.
//
// Each function takes Jira's own answers (from the searches in catchup-jira.js) and
// returns the rows one section of the catch-up shows. Nothing here talks to Jira or
// React, so every rule is tested on its own in test/unit/catchup.test.js.
//
// Two callers share this file, so both give the same answer by the same rules (D32):
//  - the page's catch-up panel (static/porchlight-ui imports it as @lib/catchup.js), and
//  - the Rovo action, which runs in a Forge function on the backend.
//
//   open-work search ──┬─ toOpenWork  → "Open work"     (first 50, plus "and N more")
//   (one request, D22) ├─ toBlockers  → "Blockers"      (flagged, or blocked by an unfinished ticket)
//                      └─ toNextSteps → "Next steps"    (To Do, by due date then priority, first 5)
//   activity search ────── toChanges  → "Latest changes" (their own moves and comments, 14 days)
//
// Security: summaries and comments are typed by people in Jira. These functions only
// copy them as strings; the components render them as text, never as HTML.

const OPEN_WORK_LIMIT = 50;
const NEXT_STEPS_LIMIT = 5;
const COMMENT_LIMIT = 140;
const DAY_MS = 86_400_000;

// Jira's fixed status categories: "new" (To Do), "indeterminate" (In Progress), "done".
const DONE = 'done';
const TO_DO = 'new';
const BLOCKED_BY = 'is blocked by';

/**
 * Jira writes times as "2026-11-06T08:30:00.000+0000". Some browsers only read the
 * offset with a colon ("+00:00"), so add one before parsing.
 * It lives here, not in the page's format.js, so this file needs nothing from the page.
 * @returns {number} milliseconds since 1970, like Date.parse
 */
export const parseJiraTime = (value) => Date.parse(value.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

/** The start of the latest-changes window: 14 days before now. */
export function fourteenDaysBefore(now) {
  return new Date(now.getTime() - 14 * DAY_MS);
}

/** The fields every ticket row shows, taken from one Jira issue. */
function ticketFields(issue) {
  const status = issue.fields.status ?? {};
  return {
    key: issue.key,
    summary: issue.fields.summary,
    statusName: status.name,
    statusCategory: status.statusCategory?.key,
  };
}

/**
 * "Open work": the tickets in Jira's own order (most recently updated first).
 *
 * @param {Array} issues - the open-work search's issues
 * @param {number} total - how many open tickets there are in all (from the count, or issues.length)
 * @returns {{ rows: Array<{ key, summary, statusName, statusCategory, updated }>, more: number }}
 */
export function toOpenWork(issues, total) {
  const rows = issues.slice(0, OPEN_WORK_LIMIT).map((issue) => ({
    ...ticketFields(issue),
    updated: issue.fields.updated,
  }));
  return { rows, more: Math.max(0, total - rows.length) };
}

/**
 * The first "is blocked by" link to a ticket that is not done, or undefined.
 * On the blocked ticket, Jira puts the blocking ticket in `inwardIssue`. A blocking
 * ticket with no status category is counted as not done, so a blocker is never hidden.
 */
function openBlockingLink(issue) {
  return (issue.fields.issuelinks ?? []).find((link) =>
    link.inwardIssue
    && link.type?.inward === BLOCKED_BY
    && link.inwardIssue.fields?.status?.statusCategory?.key !== DONE);
}

/**
 * "Blockers": open tickets that are flagged, or blocked by a ticket that is not done.
 * When a ticket is both, the row names the blocking ticket, because that says more.
 *
 * @param {Array} issues - the open-work search's issues
 * @param {string | null} flaggedFieldId - the site's "Flagged" field, or null if it has none
 */
export function toBlockers(issues, flaggedFieldId) {
  const rows = [];
  for (const issue of issues) {
    const flagValue = flaggedFieldId ? issue.fields[flaggedFieldId] : null;
    const flagged = Array.isArray(flagValue) && flagValue.length > 0;
    const link = openBlockingLink(issue);
    if (!flagged && !link) continue;
    rows.push({
      ...ticketFields(issue),
      blockedBy: link ? { key: link.inwardIssue.key, summary: link.inwardIssue.fields?.summary ?? '' } : null,
      flagged,
    });
  }
  return rows;
}

/** Sort key for a priority. Jira's IDs run 1 (Highest) to 5 (Lowest); none sorts last. */
const priorityRank = (issue) => {
  const rank = Number(issue.fields.priority?.id);
  return Number.isFinite(rank) ? rank : Infinity;
};

/**
 * "Next steps": To Do tickets, soonest due date first, then highest priority.
 * Tickets with no due date come last. Only the first 5.
 * Due dates are "YYYY-MM-DD" strings, which sort correctly as text.
 */
export function toNextSteps(issues) {
  return issues
    .filter((issue) => issue.fields.status?.statusCategory?.key === TO_DO)
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => {
      const dueA = a.issue.fields.duedate;
      const dueB = b.issue.fields.duedate;
      if (dueA !== dueB) {
        if (!dueA) return 1;
        if (!dueB) return -1;
        return dueA < dueB ? -1 : 1;
      }
      return priorityRank(a.issue) - priorityRank(b.issue) || a.index - b.index;
    })
    .slice(0, NEXT_STEPS_LIMIT)
    .map(({ issue }) => ({ ...ticketFields(issue), due: issue.fields.duedate ?? null }));
}

/**
 * Plain text from a comment in Atlassian Document Format (ADF): Jira's JSON tree for
 * rich text. Text inside one paragraph or heading runs together; paragraphs, list items
 * and line breaks become one space each.
 */
export function adfToText(doc) {
  function walk(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return ' ';
    const children = (node.content ?? []).map(walk);
    const inline = node.type === 'paragraph' || node.type === 'heading';
    return children.join(inline ? '' : ' ');
  }
  if (typeof doc === 'string') return doc.trim();
  return walk(doc).replace(/\s+/g, ' ').trim();
}

/** "Commented: “…”", with the comment cut to 140 characters. */
function commentText(body) {
  const characters = Array.from(adfToText(body));
  if (characters.length === 0) return 'Commented';
  const cut = characters.length > COMMENT_LIMIT;
  return `Commented: “${characters.slice(0, COMMENT_LIMIT).join('')}${cut ? '…' : ''}”`;
}

/**
 * "Latest changes": status moves and comments that this person made in the last
 * 14 days, newest first. Changes by anyone else are left out (D18).
 *
 * @param {Array} issues - the activity search's issues, with changelog and comments
 * @param {string} accountId - the teammate
 * @param {Date} now
 * @returns {Array<{ id: string, key: string, text: string, created: string }>}
 */
export function toChanges(issues, accountId, now) {
  const since = fourteenDaysBefore(now).getTime();
  const mine = (entry) => entry.author?.accountId === accountId && parseJiraTime(entry.created) >= since;
  const changes = [];

  for (const issue of issues) {
    for (const history of issue.changelog?.histories ?? []) {
      if (!mine(history)) continue;
      const statusItem = history.items?.find((item) => item.field === 'status');
      if (statusItem) {
        changes.push({ id: `${issue.key}-history-${history.id}`, key: issue.key, text: `Moved to ${statusItem.toString}`, created: history.created });
      }
    }
    for (const comment of issue.fields?.comment?.comments ?? []) {
      if (!mine(comment)) continue;
      changes.push({ id: `${issue.key}-comment-${comment.id}`, key: issue.key, text: commentText(comment.body), created: comment.created });
    }
  }

  return changes.sort((a, b) => parseJiraTime(b.created) - parseJiraTime(a.created));
}
