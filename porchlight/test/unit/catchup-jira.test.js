// Tests for the catch-up's Jira reads in src/lib/catchup-jira.js (decisions D22, D23, D32).
// The page passes requestJira and the Rovo action passes asUser(), so here a fake `jira`
// function stands in for both. It records every call, so each test can check the exact
// request: the same paths, JQL, fields, maxResults and expand that the page sent before.
import { describe, it, expect, vi } from 'vitest';
import {
  checkAccountId,
  countOpenWork,
  findFlaggedFieldId,
  isAccountId,
  loadCatchUp,
  openWorkJql,
  searchOpenWork,
  searchRecentActivity,
  searchUsers,
} from '../../src/lib/catchup-jira.js';

const AISHA = '712020:aisha-rahman';
const FLAGGED = 'customfield_10021';

/**
 * A stand-in for the jira(path, body) transport. `answer` gets each request and returns
 * what Jira would send back. `calls` keeps every request as { path, body } (body is
 * undefined for a GET).
 */
function fakeJira(answer) {
  const calls = [];
  async function jira(path, body) {
    calls.push({ path, body });
    return answer(path, body);
  }
  return { jira, calls };
}

describe('the account ID check', () => {
  it('knows a real Atlassian account ID', () => {
    expect(isAccountId(AISHA)).toBe(true);
    expect(isAccountId('5b10ac8d82e05b22cc7d4ef5')).toBe(true);
    expect(() => checkAccountId(AISHA)).not.toThrow();
  });

  it.each([
    'x" OR assignee is not EMPTY OR assignee = "y',
    'name with spaces',
    '',
    'a'.repeat(129),
    undefined,
    42,
  ])('refuses %j before any request', async (bad) => {
    const { jira, calls } = fakeJira(() => ({}));

    expect(isAccountId(bad)).toBe(false);
    expect(() => checkAccountId(bad)).toThrow(/account ID/);
    expect(() => openWorkJql(bad)).toThrow(/account ID/);
    await expect(searchOpenWork(jira, bad, null)).rejects.toThrow(/account ID/);
    await expect(countOpenWork(jira, bad)).rejects.toThrow(/account ID/);
    await expect(searchRecentActivity(jira, bad)).rejects.toThrow(/account ID/);
    expect(calls).toEqual([]);
  });
});

describe('openWorkJql', () => {
  it('builds the open-work search, newest update first', () => {
    expect(openWorkJql(AISHA)).toBe('assignee = "712020:aisha-rahman" AND statusCategory != Done ORDER BY updated DESC');
  });
});

describe('searchUsers', () => {
  it('searches Jira users by name and keeps only real people', async () => {
    const { jira, calls } = fakeJira(() => [
      { accountId: AISHA, accountType: 'atlassian', displayName: 'Aisha Rahman' },
      { accountId: 'app-1', accountType: 'app', displayName: 'Aisha Bot' },
      { accountId: 'cust-1', accountType: 'customer', displayName: 'Aisha (customer)' },
    ]);

    expect(await searchUsers(jira, 'Aisha R')).toEqual([{ accountId: AISHA, displayName: 'Aisha Rahman' }]);
    expect(calls).toEqual([{ path: '/rest/api/3/user/search?query=Aisha%20R&maxResults=10', body: undefined }]);
  });
});

describe('findFlaggedFieldId', () => {
  it('finds the custom field named Flagged', async () => {
    const { jira, calls } = fakeJira(() => [
      { id: 'summary', name: 'Summary', custom: false },
      { id: FLAGGED, name: 'Flagged', custom: true },
    ]);

    expect(await findFlaggedFieldId(jira)).toBe(FLAGGED);
    expect(calls).toEqual([{ path: '/rest/api/3/field', body: undefined }]);
  });

  it('answers null when the site has no Flagged field', async () => {
    const { jira } = fakeJira(() => [{ id: 'summary', name: 'Summary', custom: false }]);

    expect(await findFlaggedFieldId(jira)).toBeNull();
  });

  it('keeps no cache, so each caller decides how long to keep the answer', async () => {
    const { jira, calls } = fakeJira(() => []);

    await findFlaggedFieldId(jira);
    await findFlaggedFieldId(jira);

    expect(calls).toHaveLength(2);
  });
});

describe('searchOpenWork', () => {
  it("searches the teammate's open tickets, with links and the Flagged field", async () => {
    const { jira, calls } = fakeJira(() => ({ issues: [{ key: 'PAY-142' }], isLast: true }));

    expect(await searchOpenWork(jira, AISHA, FLAGGED)).toEqual({ issues: [{ key: 'PAY-142' }], isLast: true });
    expect(calls).toEqual([{
      path: '/rest/api/3/search/jql',
      body: {
        jql: 'assignee = "712020:aisha-rahman" AND statusCategory != Done ORDER BY updated DESC',
        maxResults: 100,
        fields: ['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks', FLAGGED],
      },
    }]);
  });

  it('leaves the Flagged field out when the site has none', async () => {
    const { jira, calls } = fakeJira(() => ({ issues: [], isLast: true }));

    await searchOpenWork(jira, AISHA, null);

    expect(calls[0].body.fields).toEqual(['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks']);
  });

  it('says it is not the last page when Jira sends a next-page token and no isLast', async () => {
    const { jira } = fakeJira(() => ({ issues: [], nextPageToken: 'abc' }));

    expect((await searchOpenWork(jira, AISHA, null)).isLast).toBe(false);
  });
});

describe('countOpenWork', () => {
  it('counts every open ticket of the teammate, with no ORDER BY', async () => {
    const { jira, calls } = fakeJira(() => ({ count: 63 }));

    expect(await countOpenWork(jira, AISHA)).toBe(63);
    expect(calls).toEqual([{
      path: '/rest/api/3/search/approximate-count',
      body: { jql: 'assignee = "712020:aisha-rahman" AND statusCategory != Done' },
    }]);
  });
});

describe('searchRecentActivity', () => {
  // One ticket as the activity search returns it: some history and comments, and the totals.
  const ticket = (key, histories, historyTotal, comments, commentTotal) => ({
    key,
    fields: { summary: key, comment: { comments, total: commentTotal, maxResults: comments.length } },
    changelog: { histories, total: historyTotal, maxResults: histories.length },
  });

  it('searches tickets the teammate updated in the last 14 days, with history and comments', async () => {
    const issues = [ticket('PAY-142', [{ id: '1' }], 1, [], 0)];
    const { jira, calls } = fakeJira(() => ({ issues, isLast: true }));

    expect(await searchRecentActivity(jira, AISHA)).toEqual(issues);
    expect(calls).toEqual([{
      path: '/rest/api/3/search/jql',
      body: {
        jql: 'issuekey in updatedBy("712020:aisha-rahman", "-14d") ORDER BY updated DESC',
        maxResults: 20,
        fields: ['summary', 'comment'],
        expand: 'changelog',
      },
    }]);
  });

  it('fetches the newest history of a ticket whose history the search clipped', async () => {
    const clipped = ticket('PAY-139', [{ id: 'old' }], 250, [{ id: 'c1' }], 1);
    const { jira, calls } = fakeJira((path) => {
      if (path === '/rest/api/3/search/jql') return { issues: [clipped] };
      return { values: [{ id: 'newest' }] };
    });

    const [issue] = await searchRecentActivity(jira, AISHA);

    // 250 entries, oldest first: the newest 100 start at 150.
    expect(calls.map((call) => call.path)).toEqual([
      '/rest/api/3/search/jql',
      '/rest/api/3/issue/PAY-139/changelog?startAt=150&maxResults=100',
    ]);
    expect(calls[1].body).toBeUndefined();
    expect(issue.changelog.histories).toEqual([{ id: 'newest' }]);
    expect(issue.changelog.total).toBe(250);
    expect(issue.fields.comment.comments).toEqual([{ id: 'c1' }]);
  });

  it('starts the history top-up at 0 for a ticket with fewer than 100 entries', async () => {
    const { jira, calls } = fakeJira((path) => {
      if (path === '/rest/api/3/search/jql') return { issues: [ticket('PAY-1', [{ id: '1' }], 60, [], 0)] };
      return { values: [] };
    });

    await searchRecentActivity(jira, AISHA);

    expect(calls[1].path).toBe('/rest/api/3/issue/PAY-1/changelog?startAt=0&maxResults=100');
  });

  it('fetches the newest comments of a ticket whose comments the search clipped', async () => {
    const clipped = ticket('PAY 7', [], 0, [{ id: 'old-comment' }], 80);
    const whole = ticket('PAY-147', [{ id: '5' }], 1, [{ id: 'c5' }], 1);
    const { jira, calls } = fakeJira((path) => {
      if (path === '/rest/api/3/search/jql') return { issues: [clipped, whole] };
      return { comments: [{ id: 'newest-comment' }] };
    });

    const [first, second] = await searchRecentActivity(jira, AISHA);

    // The key is encoded into the path, and the newest 50 are asked for.
    expect(calls.map((call) => call.path)).toEqual([
      '/rest/api/3/search/jql',
      '/rest/api/3/issue/PAY%207/comment?orderBy=-created&maxResults=50',
    ]);
    expect(first.fields.comment.comments).toEqual([{ id: 'newest-comment' }]);
    expect(first.fields.comment.total).toBe(80);
    expect(first.fields.summary).toBe('PAY 7');
    expect(second).toBe(whole);
  });

  it('fails when a top-up fails, so the caller shows its error', async () => {
    const { jira } = fakeJira((path) => {
      if (path === '/rest/api/3/search/jql') return { issues: [ticket('PAY-1', [], 0, [], 70)] };
      throw new Error('Jira answered 500');
    });

    await expect(searchRecentActivity(jira, AISHA)).rejects.toThrow(/500/);
  });
});

describe('loadCatchUp', () => {
  const NOW = new Date('2026-11-10T09:00:00.000Z');

  // An open ticket: To Do and flagged, so it shows in open work, blockers and next steps.
  const OPEN = {
    key: 'PAY-142',
    fields: {
      summary: 'Retry failed payouts',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      updated: '2026-11-09T08:00:00.000+0000',
      duedate: '2026-11-20',
      [FLAGGED]: [{ value: 'Impediment' }],
    },
  };

  // A status move by Aisha 2 days ago, and one 20 days ago (outside the 14-day window).
  const RECENT = [{
    key: 'PAY-139',
    fields: { summary: 'Payout report', comment: { comments: [], total: 0 } },
    changelog: {
      histories: [
        { id: '1', author: { accountId: AISHA }, created: '2026-11-08T10:00:00.000+0000', items: [{ field: 'status', toString: 'In Review' }] },
        { id: '2', author: { accountId: AISHA }, created: '2026-10-21T10:00:00.000+0000', items: [{ field: 'status', toString: 'In Progress' }] },
      ],
      total: 2,
    },
  }];

  /** The four reads, as vi.fn() test doubles. */
  function fakeReads({ isLast }) {
    return {
      findFlaggedFieldId: vi.fn().mockResolvedValue(FLAGGED),
      searchOpenWork: vi.fn().mockResolvedValue({ issues: [OPEN], isLast }),
      countOpenWork: vi.fn().mockResolvedValue(63),
      searchRecentActivity: vi.fn().mockResolvedValue(RECENT),
    };
  }

  it('sorts the two searches into the four sections, without a count on the last page', async () => {
    const reads = fakeReads({ isLast: true });

    const catchUp = await loadCatchUp(reads, AISHA, NOW);

    expect(reads.searchOpenWork).toHaveBeenCalledWith(AISHA, FLAGGED);
    expect(reads.searchRecentActivity).toHaveBeenCalledWith(AISHA);
    expect(reads.countOpenWork).not.toHaveBeenCalled();
    expect(catchUp).toEqual({
      openWork: {
        rows: [{ key: 'PAY-142', summary: 'Retry failed payouts', statusName: 'To Do', statusCategory: 'new', updated: '2026-11-09T08:00:00.000+0000' }],
        more: 0,
      },
      changes: [{ id: 'PAY-139-history-1', key: 'PAY-139', text: 'Moved to In Review', created: '2026-11-08T10:00:00.000+0000' }],
      blockers: [{ key: 'PAY-142', summary: 'Retry failed payouts', statusName: 'To Do', statusCategory: 'new', blockedBy: null, flagged: true }],
      nextSteps: [{ key: 'PAY-142', summary: 'Retry failed payouts', statusName: 'To Do', statusCategory: 'new', due: '2026-11-20' }],
    });
  });

  it('asks for the count only when the open-work search was not the last page', async () => {
    const reads = fakeReads({ isLast: false });

    const catchUp = await loadCatchUp(reads, AISHA, NOW);

    expect(reads.countOpenWork).toHaveBeenCalledWith(AISHA);
    expect(catchUp.openWork.more).toBe(62);
  });

  it('fails as a whole when any read fails, so nobody sees half a catch-up', async () => {
    const reads = fakeReads({ isLast: true });
    reads.searchRecentActivity.mockRejectedValue(new Error('timeout'));

    await expect(loadCatchUp(reads, AISHA, NOW)).rejects.toThrow('timeout');
  });
});
