// Unit tests for the Rovo action handler, catchUp, in src/rovo/catch-up.js.
// Scenarios 1, 3, 4 and 5 and ledger items O10, O11 and O12 in docs/specs/ask-the-trail.md.
// The catch-up rules and the Jira reads have their own tests (catchup.test.js and
// catchup-jira.test.js); these check how the action finds the person and shapes its answer.
//
// Two fakes stand in for Forge:
//  - @forge/api: asUser().requestJira answers from a table of Jira answers, keyed by path,
//    and records every call. A fake Jira that never returns HR-12 is how Jira's own
//    permissions look from the action: the asker's hidden tickets never arrive.
//  - @forge/sql: the in-memory database the other tests use (fake-forge-sql.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// vi.mock runs before the imports, so the fake Jira it uses is built with vi.hoisted.
const jira = vi.hoisted(() => ({
  // path → the JSON Jira sends back, or a function (body) → JSON for a POST.
  answers: {},
  // Every request, as { path, method, body } with the body parsed back from JSON.
  calls: [],
  // A path → status table: a matching request gets that error status instead.
  failures: {},
  reset() {
    this.answers = {};
    this.calls = [];
    this.failures = {};
  },
}));

vi.mock('@forge/api', () => ({
  // The real assumeTrustedRoute wraps a path in a Route object. The fake wraps it too,
  // so requestJira below can check that every path went through it.
  assumeTrustedRoute: (path) => ({ trustedPath: path }),
  default: {
    asUser: () => ({
      async requestJira(route, options = {}) {
        if (typeof route?.trustedPath !== 'string') {
          throw new Error('fake @forge/api: requestJira got a path without assumeTrustedRoute');
        }
        const path = route.trustedPath;
        const body = options.body === undefined ? undefined : JSON.parse(options.body);
        jira.calls.push({ path, method: options.method ?? 'GET', body });
        const status = jira.failures[path];
        if (status) {
          return { ok: false, status, json: async () => ({ errorMessages: ['down'] }) };
        }
        if (!(path in jira.answers)) {
          throw new Error(`fake @forge/api: no answer for ${path}`);
        }
        const answer = jira.answers[path];
        return { ok: true, status: 200, json: async () => (typeof answer === 'function' ? answer(body) : answer) };
      },
    }),
  },
}));

vi.mock('@forge/sql', () => import('./fake-forge-sql.js'));

const AISHA = '712020:aisha-rahman';
const AISHA_KARIM = '712020:aisha-karim';
const DANIEL = '712020:daniel-tan';
const RAVI = '712020:ravi-kumar';
const FLAGGED = 'customfield_10021';
const SITE = 'https://one-atlas-jddo.atlassian.net';
const KUALA_LUMPUR = 'Asia/Kuala_Lumpur';

const SEARCH = '/rest/api/3/search/jql';
const userPath = (accountId) => `/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`;
const userSearchPath = (query) => `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=10`;
const browse = (key) => `${SITE}/browse/${key}`;

/** A person as Jira's user APIs return them. */
const user = (accountId, displayName, extra = {}) => ({
  accountId,
  displayName,
  accountType: 'atlassian',
  active: true,
  timeZone: KUALA_LUMPUR,
  ...extra,
});

/** One open ticket as the open-work search returns it. */
function openIssue(key, summary, category, statusName, extra = {}) {
  return {
    key,
    fields: {
      summary,
      status: { name: statusName, statusCategory: { key: category } },
      updated: '2026-11-06T08:30:00.000+0000',
      duedate: null,
      priority: { id: '3' },
      issuelinks: [],
      ...extra,
    },
  };
}

/** A status move by `accountId`, as one changelog history entry. */
const statusMove = (id, accountId, created, to) => ({
  id,
  author: { accountId },
  created,
  items: [{ field: 'status', toString: to }],
});

/** A comment by `accountId`, in Atlassian Document Format. */
const comment = (id, accountId, created, text) => ({
  id,
  author: { accountId },
  created,
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
});

/** One ticket as the activity search returns it, with its history and comments. */
const activityIssue = (key, summary, histories = [], comments = []) => ({
  key,
  fields: { summary, comment: { comments, total: comments.length } },
  changelog: { histories, total: histories.length },
});

// Aisha's open tickets in scenario 1. HR-12 is hers too, but Daniel cannot open the HR
// project, so Jira (as Daniel) never returns it.
const AISHA_OPEN_WORK = [
  openIssue('PAY-142', 'Retry failed bank transfers', 'indeterminate', 'In Progress'),
  openIssue('PAY-147', 'Settle refunds in batches', 'indeterminate', 'In Progress', {
    issuelinks: [{
      type: { inward: 'is blocked by' },
      inwardIssue: { key: 'OPS-31', fields: { summary: 'Bank API sandbox access', status: { statusCategory: { key: 'new' } } } },
    }],
  }),
  openIssue('PAY-160', 'Reconcile December fees', 'indeterminate', 'In Progress', { [FLAGGED]: [{ value: 'Impediment' }] }),
  openIssue('PAY-151', 'Year-end batch job', 'new', 'To Do', { duedate: '2026-12-20' }),
];

const AISHA_ACTIVITY = [
  activityIssue('PAY-142', 'Retry failed bank transfers', [statusMove('1', AISHA, '2026-11-06T08:30:00.000+0000', 'In Progress')]),
  activityIssue('PAY-139', 'Bank retry window', [], [comment('7', AISHA, '2026-11-05T03:00:00.000+0000', 'Bank says the retry window is 24h')]),
];

/**
 * Teach the fake Jira one person's world, as Daniel sees it.
 * `openWork` and `activity` are the two searches' issues; the JQL in the body tells them apart.
 */
function seedJira({ person, openWork = [], activity = [], isLast = true, count = openWork.length }) {
  Object.assign(jira.answers, {
    '/rest/api/3/serverInfo': { baseUrl: `${SITE}/` },
    '/rest/api/3/myself': user(DANIEL, 'Daniel Tan'),
    '/rest/api/3/field': [{ id: FLAGGED, name: 'Flagged', custom: true }],
    [userPath(person.accountId)]: person,
    [SEARCH]: (body) => (body.jql.startsWith('assignee')
      ? { issues: openWork, isLast }
      : { issues: activity, isLast: true }),
    '/rest/api/3/search/approximate-count': { count },
  });
}

/** The payload Rovo sends the action: the model's inputs, plus Forge's trusted context. */
const payload = (inputs) => ({ ...inputs, context: { accountId: DANIEL, cloudId: 'cloud-1' } });

async function load() {
  vi.resetModules();
  const { fake } = await import('@forge/sql');
  fake.reset();
  jira.reset();
  const { catchUp } = await import('../../src/rovo/catch-up.js');
  const { ensureMigrated } = await import('../../src/db/migrate.js');
  const { upsertStatus } = await import('../../src/db/porch.js');
  /** Save a porch light, as the person would from the Porchlight page. */
  async function setPorchLight(accountId, kind, untilDate) {
    await ensureMigrated();
    await upsertStatus(accountId, kind, untilDate);
  }
  return { catchUp, setPorchLight };
}

/** Every key that a found result names, anywhere in it. */
const keysIn = (result) => [...JSON.stringify(result).matchAll(/"key":"([A-Z]+-\d+)"/g)].map((match) => match[1]);

/** True when no request path or body carries this text. */
const neverSent = (text) => jira.calls.every((call) => !call.path.includes(text) && !JSON.stringify(call.body ?? '').includes(text));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  // 10 November 2026, 10:00 in Kuala Lumpur: "today" in the spec's acceptance criteria.
  vi.setSystemTime(new Date('2026-11-10T02:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('catchUp: found (scenario 1)', () => {
  it('found: porch light, four parts, links, footer', async () => {
    const { catchUp, setPorchLight } = await load();
    await setPorchLight(AISHA, 'away', '2026-11-20');
    jira.answers[userSearchPath('Aisha Rahman')] = [user(AISHA, 'Aisha Rahman')];
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: AISHA_OPEN_WORK, activity: AISHA_ACTIVITY });

    const result = await catchUp(payload({ person: 'Aisha Rahman' }));

    expect(result).toEqual({
      result: 'found',
      person: { accountId: AISHA, displayName: 'Aisha Rahman' },
      porchLight: { kind: 'away', untilDate: '2026-11-20' },
      openWork: {
        tickets: [
          { key: 'PAY-142', summary: 'Retry failed bank transfers', status: 'In Progress', url: browse('PAY-142') },
          { key: 'PAY-147', summary: 'Settle refunds in batches', status: 'In Progress', url: browse('PAY-147') },
          { key: 'PAY-160', summary: 'Reconcile December fees', status: 'In Progress', url: browse('PAY-160') },
          { key: 'PAY-151', summary: 'Year-end batch job', status: 'To Do', url: browse('PAY-151') },
        ],
        more: 0,
        moreUrl: null,
      },
      latestChanges: {
        since: '2026-10-27',
        more: 0,
        items: [
          { date: '2026-11-06', what: 'Moved to In Progress', key: 'PAY-142', url: browse('PAY-142') },
          { date: '2026-11-05', what: 'Commented: “Bank says the retry window is 24h”', key: 'PAY-139', url: browse('PAY-139') },
        ],
      },
      blockers: [
        {
          key: 'PAY-147',
          summary: 'Settle refunds in batches',
          url: browse('PAY-147'),
          blockedBy: { key: 'OPS-31', summary: 'Bank API sandbox access', url: browse('OPS-31') },
        },
        { key: 'PAY-160', summary: 'Reconcile December fees', url: browse('PAY-160'), flagged: true },
      ],
      nextSteps: [{ key: 'PAY-151', summary: 'Year-end batch job', due: '2026-12-20', url: browse('PAY-151') }],
      footer: 'Showing only tickets you can open.',
    });
    expect(JSON.stringify(result)).not.toContain('HR-12');
  });

  it('reads Jira only as the asker, and reads the person only once', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Aisha Rahman')] = [user(AISHA, 'Aisha Rahman')];
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: AISHA_OPEN_WORK, activity: AISHA_ACTIVITY });

    await catchUp(payload({ person: 'Aisha Rahman' }));

    expect(jira.calls.filter((call) => call.path === userPath(AISHA))).toHaveLength(1);
    expect(jira.calls.filter((call) => call.path === SEARCH).map((call) => call.method)).toEqual(['POST', 'POST']);
  });

  it('links "and N more in Jira" to the open-work search when there are over 50 tickets', async () => {
    const { catchUp } = await load();
    const many = Array.from({ length: 60 }, (_, index) => openIssue(`PAY-${index + 1}`, `Ticket ${index + 1}`, 'indeterminate', 'In Progress'));
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: many, isLast: false, count: 63 });

    const result = await catchUp(payload({ person: 'Aisha Rahman', accountId: AISHA }));

    expect(result.openWork.tickets).toHaveLength(50);
    expect(result.openWork.more).toBe(13);
    expect(result.openWork.moreUrl).toBe(
      `${SITE}/issues/?jql=${encodeURIComponent(`assignee = "${AISHA}" AND statusCategory != Done ORDER BY updated DESC`)}`,
    );
  });

  it('35 changes give 30 and more 5', async () => {
    const { catchUp } = await load();
    const moves = Array.from({ length: 35 }, (_, index) =>
      statusMove(String(index), AISHA, `2026-11-0${1 + Math.floor(index / 5)}T0${index % 5}:00:00.000+0000`, 'In Progress'));
    seedJira({ person: user(AISHA, 'Aisha Rahman'), activity: [activityIssue('PAY-142', 'Retry failed bank transfers', moves)] });

    const result = await catchUp(payload({ person: 'Aisha Rahman', accountId: AISHA }));

    expect(result.latestChanges.items).toHaveLength(30);
    expect(result.latestChanges.more).toBe(5);
    expect(result.latestChanges.items[0].date).toBe('2026-11-07');
    expect(result.latestChanges.items[29].date).toBe('2026-11-02');
  });
});

describe('catchUp: finding the person (scenario 3, O10, O12)', () => {
  it('several: two Aishas and no exact name ask which one, and read nobody\'s work', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Aisha')] = [user(AISHA, 'Aisha Rahman'), user(AISHA_KARIM, 'Aisha Karim')];

    const result = await catchUp(payload({ person: 'Aisha' }));

    expect(result).toEqual({
      result: 'several',
      matches: [
        { accountId: AISHA, displayName: 'Aisha Rahman' },
        { accountId: AISHA_KARIM, displayName: 'Aisha Karim' },
      ],
      more: 0,
    });
    expect(jira.calls.map((call) => call.path)).toEqual([userSearchPath('Aisha')]);
  });

  it('several: lists up to 5 names and counts the others', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Aisha')] = Array.from({ length: 7 }, (_, index) => user(`712020:aisha-${index}`, `Aisha ${index}`));

    const result = await catchUp(payload({ person: 'Aisha' }));

    expect(result.result).toBe('several');
    expect(result.matches.map((match) => match.displayName)).toEqual(['Aisha 0', 'Aisha 1', 'Aisha 2', 'Aisha 3', 'Aisha 4']);
    expect(result.more).toBe(2);
  });

  it('exact full name wins over a near match, with case and spaces ignored', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('aisha rahman')] = [user(AISHA, 'Aisha Rahman'), user('712020:aisha-rahmat', 'Aisha Rahmat')];
    seedJira({ person: user(AISHA, 'Aisha Rahman') });

    const result = await catchUp(payload({ person: '  aisha rahman ' }));

    expect(result.result).toBe('found');
    expect(result.person).toEqual({ accountId: AISHA, displayName: 'Aisha Rahman' });
  });

  it('none: nobody matches, and the answer says the name searched', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Zara')] = [];

    expect(await catchUp(payload({ person: 'Zara' }))).toEqual({ result: 'none', searched: 'Zara' });
    expect(jira.calls).toHaveLength(1);
  });

  it('accountId on the second call reads that person, with no user search', async () => {
    const { catchUp } = await load();
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: AISHA_OPEN_WORK });

    const result = await catchUp(payload({ person: 'Aisha Rahman', accountId: AISHA }));

    expect(result.result).toBe('found');
    expect(result.person).toEqual({ accountId: AISHA, displayName: 'Aisha Rahman' });
    expect(jira.calls.some((call) => call.path.startsWith('/rest/api/3/user/search'))).toBe(false);
    expect(jira.calls.filter((call) => call.path === userPath(AISHA))).toHaveLength(1);
  });

  it('me reads the asker', async () => {
    const { catchUp } = await load();
    seedJira({ person: user(DANIEL, 'Daniel Tan') });

    const result = await catchUp(payload({ person: 'Myself' }));

    expect(result.result).toBe('found');
    expect(result.person).toEqual({ accountId: DANIEL, displayName: 'Daniel Tan' });
    expect(jira.calls.filter((call) => call.path === '/rest/api/3/myself')).toHaveLength(1);
    expect(jira.calls.some((call) => call.path.startsWith('/rest/api/3/user'))).toBe(false);
  });
});

describe('catchUp: nothing in Jira (scenario 4)', () => {
  it('found with empty parts, porch light here', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Ravi Kumar')] = [user(RAVI, 'Ravi Kumar')];
    seedJira({ person: user(RAVI, 'Ravi Kumar') });

    expect(await catchUp(payload({ person: 'Ravi Kumar' }))).toEqual({
      result: 'found',
      person: { accountId: RAVI, displayName: 'Ravi Kumar' },
      porchLight: { kind: 'here' },
      openWork: { tickets: [], more: 0, moreUrl: null },
      latestChanges: { since: '2026-10-27', more: 0, items: [] },
      blockers: [],
      nextSteps: [],
      footer: 'Showing only tickets you can open.',
    });
  });
});

describe('catchUp: Jira does not answer (scenario 5)', () => {
  it('jira-error names no ticket, and the next call succeeds', async () => {
    const { catchUp } = await load();
    jira.answers[userSearchPath('Aisha Rahman')] = [user(AISHA, 'Aisha Rahman')];
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: AISHA_OPEN_WORK, activity: AISHA_ACTIVITY });
    jira.failures[SEARCH] = 503;

    const failed = await catchUp(payload({ person: 'Aisha Rahman' }));

    expect(failed).toEqual({ result: 'jira-error', person: { accountId: AISHA, displayName: 'Aisha Rahman' } });
    expect(keysIn(failed)).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('503'));

    delete jira.failures[SEARCH];
    const again = await catchUp(payload({ person: 'Aisha Rahman' }));

    expect(again.result).toBe('found');
    expect(again.openWork.tickets).toHaveLength(4);
  });

  it('jira-error names no person when the user search itself fails', async () => {
    const { catchUp } = await load();
    jira.failures[userSearchPath('Aisha Rahman')] = 500;

    expect(await catchUp(payload({ person: 'Aisha Rahman' }))).toEqual({ result: 'jira-error' });
  });
});

describe('catchUp: untrusted inputs', () => {
  it('a quote in accountId is refused: it falls back to the name search and never reaches JQL', async () => {
    const { catchUp } = await load();
    const injected = 'x" OR assignee is not EMPTY OR assignee = "y';
    jira.answers[userSearchPath('Aisha Rahman')] = [user(AISHA, 'Aisha Rahman')];
    seedJira({ person: user(AISHA, 'Aisha Rahman') });

    const result = await catchUp(payload({ person: 'Aisha Rahman', accountId: injected }));

    expect(result.person).toEqual({ accountId: AISHA, displayName: 'Aisha Rahman' });
    expect(jira.calls[0].path).toBe(userSearchPath('Aisha Rahman'));
    expect(neverSent('assignee is not EMPTY')).toBe(true);
    expect(neverSent(encodeURIComponent(injected))).toBe(true);
  });

  it('a person over 100 characters is cut before the search', async () => {
    const { catchUp } = await load();
    const long = `${'A'.repeat(100)}${'B'.repeat(50)}`;
    jira.answers[userSearchPath('A'.repeat(100))] = [];

    const result = await catchUp(payload({ person: long }));

    expect(result).toEqual({ result: 'none', searched: 'A'.repeat(100) });
    expect(jira.calls.map((call) => call.path)).toEqual([userSearchPath('A'.repeat(100))]);
  });

  it('logs one line per call with the result, the ticket count and the time, and no name or ID', async () => {
    const { catchUp, setPorchLight } = await load();
    await setPorchLight(AISHA, 'away', '2026-11-20');
    jira.answers[userSearchPath('Aisha Rahman')] = [user(AISHA, 'Aisha Rahman')];
    seedJira({ person: user(AISHA, 'Aisha Rahman'), openWork: AISHA_OPEN_WORK, activity: AISHA_ACTIVITY });
    jira.answers[userSearchPath('Aisha')] = [user(AISHA, 'Aisha Rahman'), user(AISHA_KARIM, 'Aisha Karim')];

    await catchUp(payload({ person: 'Aisha Rahman' }));
    await catchUp(payload({ person: 'Aisha' }));

    // The migrations log their own lines on the first call; keep only the action's.
    const lines = console.log.mock.calls.map((args) => args.join(' ')).filter((line) => line.startsWith('porchlight.rovo'));
    expect(lines).toHaveLength(2);
    // Six distinct keys: PAY-142, PAY-147, OPS-31, PAY-160, PAY-151 and PAY-139.
    expect(lines[0]).toMatch(/^porchlight\.rovo\.catchUp result=found tickets=6 ms=\d+$/);
    expect(lines[1]).toMatch(/^porchlight\.rovo\.catchUp result=several ms=\d+$/);
    for (const line of lines) {
      expect(line).not.toMatch(/Aisha|Daniel|712020/);
    }
  });
});
