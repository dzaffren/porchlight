// Tests for the catch-up rules (decision D18), with Aisha Rahman's tickets from
// scenario 3 in docs/specs/catch-up-view.md. The fixture is shaped like Jira's own
// answers to the two searches in api.js, so these tests need neither Jira nor React.
import { describe, it, expect } from 'vitest';
import { adfToText, fourteenDaysBefore, toBlockers, toChanges, toNextSteps, toOpenWork } from './catchup.js';

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const FLAGGED = 'customfield_10021';

// Today in the scenario: 10 November 2026.
const NOW = new Date('2026-11-10T09:00:00.000Z');

const TODO = { key: 'new', name: 'To Do' };
const IN_PROGRESS = { key: 'indeterminate', name: 'In Progress' };
const DONE = { key: 'done', name: 'Done' };

const status = (name, category) => ({ name, statusCategory: category });

/** One ticket as the open-work search returns it. */
function issue(key, summary, { statusName, category, updated, duedate = null, priority = '3', links = [], flagged = null }) {
  return {
    key,
    fields: {
      summary,
      status: status(statusName, category),
      updated,
      duedate,
      priority: { id: priority, name: 'Medium' },
      issuelinks: links,
      [FLAGGED]: flagged,
    },
  };
}

/** An "is blocked by" link to another ticket, as it appears on the blocked ticket. */
const blockedBy = (key, summary, category) => ({
  type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
  inwardIssue: { key, fields: { summary, status: status(category.name, category) } },
});

// Her 6 open tickets, most recently updated first, as Jira sorts them.
// HR-12 is not here: Daniel cannot open the HR project, so Jira never returns it.
const AISHA_OPEN = [
  issue('PAY-142', 'Retry failed bank transfers', {
    statusName: 'In Progress', category: IN_PROGRESS, updated: '2026-11-06T08:30:00.000+0000',
    // PAY-142 blocks another ticket. That is an outward link, so it is not a blocker of PAY-142.
    links: [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key: 'PAY-150' } }],
  }),
  issue('PAY-147', 'Show transfer status to customers', {
    statusName: 'In Progress', category: IN_PROGRESS, updated: '2026-11-05T10:00:00.000+0000',
    links: [blockedBy('OPS-31', 'Bank API sandbox access', IN_PROGRESS)],
  }),
  issue('PAY-139', 'Bank API timeout alerts', {
    statusName: 'In Review', category: IN_PROGRESS, updated: '2026-11-05T07:00:00.000+0000',
    // Blocked by a ticket that is done, so it no longer blocks anything.
    links: [blockedBy('OPS-29', 'Open the firewall for the bank API', DONE)],
  }),
  issue('PAY-160', 'Refund file for the finance team', {
    statusName: 'To Do', category: TODO, updated: '2026-11-04T06:00:00.000+0000',
    flagged: [{ id: '10019', value: 'Impediment' }],
  }),
  issue('PAY-151', 'Year-end batch job', {
    statusName: 'To Do', category: TODO, updated: '2026-10-30T03:00:00.000+0000', duedate: '2026-12-20',
  }),
  issue('OPS-44', 'Rotate the bank API certificate', {
    statusName: 'To Do', category: TODO, updated: '2026-10-28T03:00:00.000+0000', duedate: '2027-01-09',
  }),
];

// The latest-changes search: tickets Aisha (or anyone) touched, with history and comments.
const adf = (...paragraphs) => ({
  type: 'doc',
  version: 1,
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
const move = (id, accountId, created, from, to) => ({
  id, author: { accountId }, created, items: [{ field: 'status', fieldtype: 'jira', fromString: from, toString: to }],
});
const comment = (id, accountId, created, body) => ({ id, author: { accountId }, created, body });
const touched = (key, summary, histories, comments = []) => ({
  key,
  fields: { summary, comment: { comments, total: comments.length, maxResults: 50 } },
  changelog: { histories, total: histories.length, maxResults: 100 },
});

const AISHA_RECENT = [
  touched('PAY-142', 'Retry failed bank transfers', [
    move('1', AISHA, '2026-11-06T08:30:00.000+0000', 'To Do', 'In Progress'),
    // Daniel moved it once too. Only Aisha's own changes count.
    move('2', DANIEL, '2026-11-07T02:00:00.000+0000', 'In Progress', 'In Review'),
  ]),
  touched('PAY-139', 'Bank API timeout alerts', [
    move('3', AISHA, '2026-10-31T05:00:00.000+0000', 'In Progress', 'In Review'),
    // A change to another field is not a status move.
    { id: '4', author: { accountId: AISHA }, created: '2026-11-01T05:00:00.000+0000', items: [{ field: 'assignee', fromString: 'Ravi Kumar', toString: 'Aisha Rahman' }] },
  ], [
    comment('c1', AISHA, '2026-11-05T07:00:00.000+0000', adf('The alert fires after 3 timeouts in 5 minutes,', 'the same as the retry limit.')),
    comment('c2', DANIEL, '2026-11-05T09:00:00.000+0000', adf('Thanks, makes sense.')),
  ]),
  touched('PAY-147', 'Show transfer status to customers', [
    move('5', AISHA, '2026-11-05T03:00:00.000+0000', 'To Do', 'In Progress'),
  ]),
  touched('PAY-160', 'Refund file for the finance team', [], [
    comment('c3', AISHA, '2026-11-04T06:00:00.000+0000', adf('Waiting on finance for the refund file format.')),
  ]),
  touched('PAY-133', 'Settlement report totals', [
    move('6', AISHA, '2026-10-28T01:00:00.000+0000', 'In Review', 'Done'),
    // 26 October is before the 14 days start (27 October), so it is left out.
    move('7', AISHA, '2026-10-26T01:00:00.000+0000', 'In Progress', 'In Review'),
  ]),
];

describe('fourteenDaysBefore', () => {
  it('starts the latest changes on 27 October when today is 10 November', () => {
    expect(fourteenDaysBefore(NOW).toISOString()).toBe('2026-10-27T09:00:00.000Z');
  });
});

describe('toOpenWork', () => {
  it("lists Aisha's 6 open tickets in Jira's order, with their real status", () => {
    const work = toOpenWork(AISHA_OPEN, 6);

    expect(work.rows.map((r) => r.key)).toEqual(['PAY-142', 'PAY-147', 'PAY-139', 'PAY-160', 'PAY-151', 'OPS-44']);
    expect(work.rows[0]).toEqual({
      key: 'PAY-142',
      summary: 'Retry failed bank transfers',
      statusName: 'In Progress',
      statusCategory: 'indeterminate',
      updated: '2026-11-06T08:30:00.000+0000',
    });
    expect(work.more).toBe(0);
  });

  it('shows the first 50 of 63 and counts the other 13', () => {
    const many = Array.from({ length: 100 }, (_, i) => issue(`PAY-${300 - i}`, `Ticket ${i}`, {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000',
    })).slice(0, 63);

    const work = toOpenWork(many, 63);

    expect(work.rows).toHaveLength(50);
    expect(work.rows[0].key).toBe('PAY-300');
    expect(work.more).toBe(13);
  });

  it('never counts fewer than zero more', () => {
    expect(toOpenWork(AISHA_OPEN, 3).more).toBe(0);
  });
});

describe('toBlockers', () => {
  it('lists PAY-147, blocked by OPS-31, and PAY-160, which is flagged', () => {
    expect(toBlockers(AISHA_OPEN, FLAGGED)).toEqual([
      {
        key: 'PAY-147',
        summary: 'Show transfer status to customers',
        statusName: 'In Progress',
        statusCategory: 'indeterminate',
        blockedBy: { key: 'OPS-31', summary: 'Bank API sandbox access' },
        flagged: false,
      },
      {
        key: 'PAY-160',
        summary: 'Refund file for the finance team',
        statusName: 'To Do',
        statusCategory: 'new',
        blockedBy: null,
        flagged: true,
      },
    ]);
  });

  it('ignores a link to a done ticket and an outward "blocks" link', () => {
    const keys = toBlockers(AISHA_OPEN, FLAGGED).map((b) => b.key);
    expect(keys).not.toContain('PAY-139');
    expect(keys).not.toContain('PAY-142');
  });

  it('names the blocking ticket when a ticket is also flagged', () => {
    const both = issue('PAY-170', 'Both', {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000',
      links: [blockedBy('OPS-31', 'Bank API sandbox access', TODO)], flagged: [{ id: '1', value: 'Impediment' }],
    });
    expect(toBlockers([both], FLAGGED)[0]).toMatchObject({ blockedBy: { key: 'OPS-31' }, flagged: true });
  });

  it('counts a blocking ticket with no status category as not done', () => {
    const odd = issue('PAY-171', 'Odd link', {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000',
      links: [{ type: { inward: 'is blocked by' }, inwardIssue: { key: 'OPS-1', fields: { summary: 'No status' } } }],
    });
    expect(toBlockers([odd], FLAGGED)).toHaveLength(1);
  });

  it('falls back to links only when the site has no Flagged field', () => {
    expect(toBlockers(AISHA_OPEN, null).map((b) => b.key)).toEqual(['PAY-147']);
  });

  it('does not count an empty Flagged field', () => {
    const empty = issue('PAY-172', 'Not flagged', {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000', flagged: [],
    });
    expect(toBlockers([empty], FLAGGED)).toEqual([]);
  });
});

describe('toNextSteps', () => {
  it('lists To Do tickets by due date, starting with PAY-151, with no due date last', () => {
    expect(toNextSteps(AISHA_OPEN)).toEqual([
      { key: 'PAY-151', summary: 'Year-end batch job', statusName: 'To Do', statusCategory: 'new', due: '2026-12-20' },
      { key: 'OPS-44', summary: 'Rotate the bank API certificate', statusName: 'To Do', statusCategory: 'new', due: '2027-01-09' },
      { key: 'PAY-160', summary: 'Refund file for the finance team', statusName: 'To Do', statusCategory: 'new', due: null },
    ]);
  });

  it('orders tickets with the same due date by priority, highest first', () => {
    const todo = (key, priority) => issue(key, key, {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000', duedate: '2026-12-01', priority,
    });
    // Jira's priority IDs: 1 is Highest, 5 is Lowest. "10" must sort after "2" as a number.
    expect(toNextSteps([todo('A-1', '10'), todo('A-2', '2'), todo('A-3', '1')]).map((s) => s.key)).toEqual(['A-3', 'A-2', 'A-1']);
  });

  it('shows the first 5 only', () => {
    const todos = Array.from({ length: 8 }, (_, i) => issue(`A-${i}`, 'x', {
      statusName: 'To Do', category: TODO, updated: '2026-11-01T00:00:00.000+0000',
    }));
    expect(toNextSteps(todos)).toHaveLength(5);
  });
});

describe('toChanges', () => {
  it("lists Aisha's own status moves and comments since 27 October, newest first", () => {
    expect(toChanges(AISHA_RECENT, AISHA, NOW).map((c) => [c.key, c.text, c.created])).toEqual([
      ['PAY-142', 'Moved to In Progress', '2026-11-06T08:30:00.000+0000'],
      ['PAY-139', 'Commented: “The alert fires after 3 timeouts in 5 minutes, the same as the retry limit.”', '2026-11-05T07:00:00.000+0000'],
      ['PAY-147', 'Moved to In Progress', '2026-11-05T03:00:00.000+0000'],
      ['PAY-160', 'Commented: “Waiting on finance for the refund file format.”', '2026-11-04T06:00:00.000+0000'],
      ['PAY-139', 'Moved to In Review', '2026-10-31T05:00:00.000+0000'],
      ['PAY-133', 'Moved to Done', '2026-10-28T01:00:00.000+0000'],
    ]);
  });

  it('gives every change its own id, for React keys', () => {
    const ids = toChanges(AISHA_RECENT, AISHA, NOW).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cuts a long comment at 140 characters and adds …', () => {
    const long = 'a'.repeat(200);
    const [change] = toChanges([touched('PAY-1', 'x', [], [comment('c9', AISHA, '2026-11-09T00:00:00.000+0000', adf(long))])], AISHA, NOW);
    expect(change.text).toBe(`Commented: “${'a'.repeat(140)}…”`);
  });

  it('shows nothing for someone who did nothing in the last 14 days', () => {
    expect(toChanges([], AISHA, NOW)).toEqual([]);
  });
});

describe('adfToText', () => {
  it('joins the text of every paragraph with a space', () => {
    expect(adfToText(adf('First line.', 'Second line.'))).toBe('First line. Second line.');
  });

  it('keeps text split over several nodes in one paragraph together', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bank ' }, { type: 'text', text: 'API', marks: [{ type: 'strong' }] }, { type: 'text', text: ' is down.' }] }],
    };
    expect(adfToText(doc)).toBe('Bank API is down.');
  });

  it('reads text inside lists and treats a line break as a space', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }, { type: 'hardBreak' }, { type: 'text', text: 'two' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] },
        ],
      }],
    };
    expect(adfToText(doc)).toBe('one two three');
  });

  it('gives an empty string for an empty or missing document', () => {
    expect(adfToText(undefined)).toBe('');
    expect(adfToText({ type: 'doc', content: [] })).toBe('');
  });
});
