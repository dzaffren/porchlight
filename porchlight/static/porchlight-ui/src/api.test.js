// Tests for the page's calls to Forge and Jira. @forge/bridge only works inside Jira,
// so its invoke and requestJira are replaced with test doubles here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge/bridge', () => ({ invoke: vi.fn(), requestJira: vi.fn(), router: { open: vi.fn() } }));

import { invoke, requestJira, router } from '@forge/bridge';
import {
  addTeammate,
  countOpenWork,
  fetchDisplayNames,
  fetchMyself,
  fetchNotes,
  fetchTeam,
  openInJira,
  openWorkJql,
  removeTeammate,
  searchOpenWork,
  searchRecentActivity,
  searchUsers,
} from './api.js';

/** A minimal stand-in for the fetch-style Response that requestJira returns. */
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => vi.resetAllMocks());

describe('fetchDisplayNames', () => {
  it('asks Jira for all the authors in one request, with each account ID encoded', async () => {
    requestJira.mockResolvedValue(reply(200, {
      values: [
        { accountId: '712020:aisha-rahman', displayName: 'Aisha Rahman' },
        { accountId: '712020:daniel-tan', displayName: 'Daniel Tan' },
      ],
    }));

    const names = await fetchDisplayNames(['712020:aisha-rahman', '712020:daniel-tan']);

    expect(requestJira).toHaveBeenCalledTimes(1);
    expect(requestJira).toHaveBeenCalledWith(
      '/rest/api/3/user/bulk?maxResults=100&accountId=712020%3Aaisha-rahman&accountId=712020%3Adaniel-tan',
    );
    expect(names).toEqual({ '712020:aisha-rahman': 'Aisha Rahman', '712020:daniel-tan': 'Daniel Tan' });
  });

  it('makes no request when there is nobody to look up', async () => {
    expect(await fetchDisplayNames([])).toEqual({});
    expect(requestJira).not.toHaveBeenCalled();
  });

  it('fails when Jira refuses, so the page can fall back to "A teammate"', async () => {
    requestJira.mockResolvedValue(reply(403, {}));

    await expect(fetchDisplayNames(['712020:daniel-tan'])).rejects.toThrow(/403/);
  });
});

describe('fetchMyself', () => {
  it("returns the viewer's account ID and name", async () => {
    requestJira.mockResolvedValue(reply(200, { accountId: '712020:aisha-rahman', displayName: 'Aisha Rahman', emailAddress: 'not-needed' }));

    expect(await fetchMyself()).toEqual({ accountId: '712020:aisha-rahman', displayName: 'Aisha Rahman' });
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/myself');
  });
});

describe('fetchNotes', () => {
  it('returns the notes from the listNotes resolver', async () => {
    invoke.mockResolvedValue({ ok: true, notes: [{ id: '1' }] });

    expect(await fetchNotes()).toEqual([{ id: '1' }]);
    expect(invoke).toHaveBeenCalledWith('listNotes');
  });

  it('fails when the resolver does not answer ok', async () => {
    invoke.mockResolvedValue(undefined);

    await expect(fetchNotes()).rejects.toThrow();
  });
});

const AISHA = '712020:aisha-rahman';
const GET = { method: 'GET', headers: { Accept: 'application/json' } };
const post = (body) => ({
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('team resolvers', () => {
  it('fetchTeam returns the members from listTeam', async () => {
    invoke.mockResolvedValue({ ok: true, members: [{ accountId: AISHA }] });

    expect(await fetchTeam()).toEqual([{ accountId: AISHA }]);
    expect(invoke).toHaveBeenCalledWith('listTeam');
  });

  it('fetchTeam fails when the resolver does not answer ok', async () => {
    invoke.mockResolvedValue({ ok: false, error: 'db_down' });

    await expect(fetchTeam()).rejects.toThrow();
  });

  it("addTeammate passes the resolver's answer back, including already_on_team", async () => {
    invoke.mockResolvedValue({ ok: false, error: 'already_on_team' });

    expect(await addTeammate(AISHA)).toEqual({ ok: false, error: 'already_on_team' });
    expect(invoke).toHaveBeenCalledWith('addTeammate', { accountId: AISHA });
  });

  it('addTeammate fails when the resolver call fails', async () => {
    invoke.mockRejectedValue(new Error('network'));

    await expect(addTeammate(AISHA)).rejects.toThrow('network');
  });

  it('removeTeammate sends the account ID to removeTeammate', async () => {
    invoke.mockResolvedValue({ ok: true });

    expect(await removeTeammate(AISHA)).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('removeTeammate', { accountId: AISHA });
  });
});

describe('searchUsers', () => {
  it('searches Jira users by name and keeps only real people', async () => {
    requestJira.mockResolvedValue(reply(200, [
      { accountId: AISHA, accountType: 'atlassian', displayName: 'Aisha Rahman' },
      { accountId: 'app-1', accountType: 'app', displayName: 'Aisha Bot' },
      { accountId: 'cust-1', accountType: 'customer', displayName: 'Aisha (customer)' },
    ]));

    expect(await searchUsers('Aisha R')).toEqual([{ accountId: AISHA, displayName: 'Aisha Rahman' }]);
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/user/search?query=Aisha%20R&maxResults=10', GET);
  });

  it('fails when Jira refuses', async () => {
    requestJira.mockResolvedValue(reply(500, {}));

    await expect(searchUsers('Aisha')).rejects.toThrow(/500/);
  });
});

describe('findFlaggedFieldId', () => {
  // The answer is kept for the page's lifetime, so each test loads a fresh copy of api.js.
  async function freshApi() {
    vi.resetModules();
    const bridge = await import('@forge/bridge');
    const api = await import('./api.js');
    return { bridge, api };
  }

  it('finds the custom field named Flagged, and asks Jira only once', async () => {
    const { bridge, api } = await freshApi();
    bridge.requestJira.mockResolvedValue(reply(200, [
      { id: 'summary', name: 'Summary', custom: false },
      { id: 'customfield_10021', name: 'Flagged', custom: true },
    ]));

    expect(await api.findFlaggedFieldId()).toBe('customfield_10021');
    expect(await api.findFlaggedFieldId()).toBe('customfield_10021');
    expect(bridge.requestJira).toHaveBeenCalledTimes(1);
    expect(bridge.requestJira).toHaveBeenCalledWith('/rest/api/3/field', GET);
  });

  it('answers null when the site has no Flagged field', async () => {
    const { bridge, api } = await freshApi();
    bridge.requestJira.mockResolvedValue(reply(200, [{ id: 'summary', name: 'Summary', custom: false }]));

    expect(await api.findFlaggedFieldId()).toBeNull();
  });

  it('asks again after a failure, so Try again can work', async () => {
    const { bridge, api } = await freshApi();
    bridge.requestJira
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(reply(200, [{ id: 'customfield_10021', name: 'Flagged', custom: true }]));

    await expect(api.findFlaggedFieldId()).rejects.toThrow(/503/);
    expect(await api.findFlaggedFieldId()).toBe('customfield_10021');
  });
});

describe('searchOpenWork', () => {
  it("searches the teammate's open tickets, newest update first, with links and the Flagged field", async () => {
    requestJira.mockResolvedValue(reply(200, { issues: [{ key: 'PAY-142' }], isLast: true }));

    expect(await searchOpenWork(AISHA, 'customfield_10021')).toEqual({ issues: [{ key: 'PAY-142' }], isLast: true });
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/search/jql', post({
      jql: 'assignee = "712020:aisha-rahman" AND statusCategory != Done ORDER BY updated DESC',
      maxResults: 100,
      fields: ['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks', 'customfield_10021'],
    }));
  });

  it('leaves the Flagged field out when the site has none', async () => {
    requestJira.mockResolvedValue(reply(200, { issues: [], isLast: true }));

    await searchOpenWork(AISHA, null);

    const body = JSON.parse(requestJira.mock.calls[0][1].body);
    expect(body.fields).toEqual(['summary', 'status', 'updated', 'duedate', 'priority', 'issuelinks']);
  });

  it('says it is not the last page when Jira has more', async () => {
    requestJira.mockResolvedValue(reply(200, { issues: [], nextPageToken: 'abc', isLast: false }));

    expect((await searchOpenWork(AISHA, null)).isLast).toBe(false);
  });

  it('fails when Jira does not answer', async () => {
    requestJira.mockRejectedValue(new Error('timeout'));

    await expect(searchOpenWork(AISHA, null)).rejects.toThrow('timeout');
  });
});

describe('the account ID check before building JQL', () => {
  it.each([
    'x" OR assignee is not EMPTY OR assignee = "y',
    '',
    'a'.repeat(129),
    'name with spaces',
  ])('refuses %j and asks Jira nothing', async (bad) => {
    await expect(searchOpenWork(bad, null)).rejects.toThrow(/account ID/);
    await expect(countOpenWork(bad)).rejects.toThrow(/account ID/);
    await expect(searchRecentActivity(bad)).rejects.toThrow(/account ID/);
    expect(() => openWorkJql(bad)).toThrow(/account ID/);
    expect(requestJira).not.toHaveBeenCalled();
  });
});

describe('countOpenWork', () => {
  it('counts every open ticket of the teammate', async () => {
    requestJira.mockResolvedValue(reply(200, { count: 63 }));

    expect(await countOpenWork(AISHA)).toBe(63);
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/search/approximate-count', post({
      jql: 'assignee = "712020:aisha-rahman" AND statusCategory != Done',
    }));
  });
});

describe('searchRecentActivity', () => {
  const ticket = (key, histories, historyTotal, comments, commentTotal) => ({
    key,
    fields: { summary: key, comment: { comments, total: commentTotal, maxResults: comments.length } },
    changelog: { histories, total: historyTotal, maxResults: histories.length },
  });

  it('searches tickets the teammate updated in the last 14 days, with history and comments', async () => {
    const answer = { issues: [ticket('PAY-142', [{ id: '1' }], 1, [], 0)], isLast: true };
    requestJira.mockResolvedValue(reply(200, answer));

    expect(await searchRecentActivity(AISHA)).toEqual(answer.issues);
    expect(requestJira).toHaveBeenCalledTimes(1);
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/search/jql', post({
      jql: 'issuekey in updatedBy("712020:aisha-rahman", "-14d") ORDER BY updated DESC',
      maxResults: 20,
      fields: ['summary', 'comment'],
      expand: 'changelog',
    }));
  });

  it('fetches the newest history and comments of a ticket the search clipped', async () => {
    const clipped = ticket('PAY-139', [{ id: 'old' }], 250, [{ id: 'old-comment' }], 80);
    const whole = ticket('PAY-147', [{ id: '5' }], 1, [{ id: 'c5' }], 1);
    requestJira.mockImplementation(async (path) => {
      if (path === '/rest/api/3/search/jql') return reply(200, { issues: [clipped, whole], isLast: true });
      if (path === '/rest/api/3/issue/PAY-139/changelog?startAt=150&maxResults=100') return reply(200, { values: [{ id: 'newest' }] });
      if (path === '/rest/api/3/issue/PAY-139/comment?orderBy=-created&maxResults=50') return reply(200, { comments: [{ id: 'newest-comment' }] });
      throw new Error(`unexpected request ${path}`);
    });

    const [first, second] = await searchRecentActivity(AISHA);

    expect(first.changelog.histories).toEqual([{ id: 'newest' }]);
    expect(first.fields.comment.comments).toEqual([{ id: 'newest-comment' }]);
    expect(first.fields.summary).toBe('PAY-139');
    expect(second).toEqual(whole);
    expect(requestJira).toHaveBeenCalledTimes(3);
    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/issue/PAY-139/changelog?startAt=150&maxResults=100', GET);
  });

  it('starts the history top-up at 0 for a ticket with fewer than 100 entries', async () => {
    requestJira.mockImplementation(async (path) => {
      if (path === '/rest/api/3/search/jql') return reply(200, { issues: [ticket('PAY-1', [{ id: '1' }], 60, [], 0)] });
      return reply(200, { values: [] });
    });

    await searchRecentActivity(AISHA);

    expect(requestJira).toHaveBeenCalledWith('/rest/api/3/issue/PAY-1/changelog?startAt=0&maxResults=100', GET);
  });

  it('fails when a top-up fails, so the page shows its error', async () => {
    requestJira.mockImplementation(async (path) => {
      if (path === '/rest/api/3/search/jql') return reply(200, { issues: [ticket('PAY-1', [], 0, [], 70)] });
      return reply(500, {});
    });

    await expect(searchRecentActivity(AISHA)).rejects.toThrow(/500/);
  });
});

describe('openWorkJql and openInJira', () => {
  it('builds the same open-work search for the "more in Jira" link', () => {
    expect(openWorkJql(AISHA)).toBe('assignee = "712020:aisha-rahman" AND statusCategory != Done ORDER BY updated DESC');
  });

  it("opens a Jira page through Forge's router", async () => {
    router.open.mockResolvedValue(undefined);

    await openInJira('/browse/PAY-142');

    expect(router.open).toHaveBeenCalledWith('/browse/PAY-142');
  });
});
