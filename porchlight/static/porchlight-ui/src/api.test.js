// Tests for the page's calls to Forge and Jira. @forge/bridge only works inside Jira,
// so its invoke and requestJira are replaced with test doubles here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge/bridge', () => ({ invoke: vi.fn(), requestJira: vi.fn() }));

import { invoke, requestJira } from '@forge/bridge';
import { fetchDisplayNames, fetchMyself, fetchNotes } from './api.js';

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
