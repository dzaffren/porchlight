// Unit tests for the porch light resolvers the page calls: listStatuses and setMyStatus.
// Scenarios 1, 2, 3 and 5 in docs/specs/porch-status.md, server side. The date and time-zone
// rules themselves are tested in porch-lib.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@forge/sql', () => import('./fake-forge-sql.js'));

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const RAVI = '712020:ravi-kumar';

const KUALA_LUMPUR = 'Asia/Kuala_Lumpur';

/** Build the request object Forge passes to a resolver: the page's payload plus a trusted context. */
const request = (accountId, payload = {}) => ({ payload, context: { accountId } });

async function load() {
  vi.resetModules();
  const { fake } = await import('@forge/sql');
  fake.reset();
  const resolvers = await import('../../src/resolvers/porch.js');
  const db = await import('../../src/db/porch.js');
  return { fake, db, ...resolvers };
}

/** Set the server clock. Only Date is faked, so promises and timers run as normal. */
const setNow = (iso) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  // 7 November 2026, 10:00 in Kuala Lumpur: "today" in the spec's acceptance criteria.
  setNow('2026-11-07T02:00:00Z');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setMyStatus (scenario 1: leave the porch light on while away)', () => {
  it('saves Aisha as away until 20 Nov, and Daniel sees it in the list', async () => {
    const { setMyStatus, listStatuses } = await load();

    const saved = await setMyStatus(
      request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }),
    );
    const daniel = await listStatuses(request(DANIEL));

    expect(saved).toEqual({ ok: true, status: { kind: 'away', untilDate: '2026-11-20' } });
    expect(daniel).toEqual({
      ok: true,
      statuses: [{ accountId: AISHA, kind: 'away', untilDate: '2026-11-20' }],
    });
  });

  it('keys the row by Forge context and ignores an accountId in the payload', async () => {
    const { fake, setMyStatus } = await load();

    await setMyStatus(
      request(DANIEL, { accountId: AISHA, kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }),
    );

    expect(fake.porch.map((row) => row.account_id)).toEqual([DANIEL]);
  });

  it('keeps one row per person: a new date replaces the old one', async () => {
    const { fake, setMyStatus } = await load();
    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));

    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-27', timeZone: KUALA_LUMPUR }));

    expect(fake.porch).toHaveLength(1);
    expect(fake.porch[0]).toMatchObject({ account_id: AISHA, kind: 'away', until_date: '2026-11-27' });
  });

  it('works on a fresh install, before the hourly migration has run', async () => {
    const { fake, setMyStatus } = await load();
    expect(fake.tables.has('porch_statuses')).toBe(false);

    const saved = await setMyStatus(
      request(AISHA, { kind: 'leaving', untilDate: '2027-01-31', timeZone: KUALA_LUMPUR }),
    );

    expect(saved).toEqual({ ok: true, status: { kind: 'leaving', untilDate: '2027-01-31' } });
  });

  it('passes the account ID, kind and date as parameters, never inside the SQL itself', async () => {
    const { fake, setMyStatus } = await load();

    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));

    const porch = fake.statements.filter((s) => s.query.includes('porch_statuses') && !s.query.includes('CREATE TABLE'));
    expect(porch.length).toBeGreaterThan(0);
    for (const statement of porch) {
      expect(statement.query).not.toContain(AISHA);
      expect(statement.query).not.toContain('2026-11-20');
    }
    const upsert = porch.find((s) => s.query.includes('ON DUPLICATE KEY UPDATE'));
    expect(upsert.params).toEqual([AISHA, 'away', '2026-11-20']);
  });

  it('logs the proof line with the kind and who set it', async () => {
    const { setMyStatus } = await load();

    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));

    expect(console.log).toHaveBeenCalledWith(`porchlight.status.set kind=away by=${AISHA}`);
  });
});

describe('setMyStatus (scenario 2: back early, the porch light goes off)', () => {
  it('deletes Aisha\'s row when she sets Here on 18 Nov, so the list shows her as Here', async () => {
    const { fake, setMyStatus, listStatuses } = await load();
    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));
    setNow('2026-11-18T02:00:00Z');

    const saved = await setMyStatus(request(AISHA, { kind: 'here', timeZone: KUALA_LUMPUR }));

    expect(saved).toEqual({ ok: true, status: { kind: 'here' } });
    expect(fake.porch).toEqual([]);
    expect(await listStatuses(request(DANIEL))).toEqual({ ok: true, statuses: [] });
    expect(console.log).toHaveBeenCalledWith(`porchlight.status.set kind=here by=${AISHA}`);
  });

  it('ignores a date sent with Here, and answers ok when there was no row', async () => {
    const { fake, setMyStatus } = await load();

    const saved = await setMyStatus(request(AISHA, { kind: 'here', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));

    expect(saved).toEqual({ ok: true, status: { kind: 'here' } });
    expect(fake.statements.map((s) => s.query)).toContain('DELETE FROM porch_statuses WHERE account_id = ?');
  });

  it('deletes only the signed-in person\'s row', async () => {
    const { fake, setMyStatus } = await load();
    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));

    await setMyStatus(request(DANIEL, { accountId: AISHA, kind: 'here', timeZone: KUALA_LUMPUR }));

    expect(fake.porch.map((row) => row.account_id)).toEqual([AISHA]);
  });
});

describe('setMyStatus (scenario 3: Leaving becomes Left after the leaving date)', () => {
  /** Ravi leaves on 31 Jan 2027; the test then moves the clock to the moment it asks about. */
  async function raviLeavingOn31Jan() {
    const loaded = await load();
    setNow('2026-11-10T02:00:00Z');
    await loaded.setMyStatus(request(RAVI, { kind: 'leaving', untilDate: '2027-01-31', timeZone: KUALA_LUMPUR }));
    return loaded;
  }

  it.each([
    ['set Here', { kind: 'here' }],
    ['set Away', { kind: 'away', untilDate: '2027-02-10' }],
    ['move the leaving date', { kind: 'leaving', untilDate: '2027-03-01' }],
  ])('refuses to %s from 1 Feb 2027 00:00 in his time zone, and nothing changes', async (_label, choice) => {
    const { fake, setMyStatus } = await raviLeavingOn31Jan();
    const before = structuredClone(fake.porch);
    // 1 Feb 2027 00:00 in Kuala Lumpur (UTC+8) is 31 Jan 16:00 UTC.
    setNow('2027-01-31T16:00:00Z');
    console.log.mockClear();
    const sentBefore = fake.statements.length;

    const answer = await setMyStatus(request(RAVI, { ...choice, timeZone: KUALA_LUMPUR }));

    expect(answer).toEqual({ ok: false, error: 'left' });
    expect(fake.porch).toEqual(before);
    const writes = fake.statements.slice(sentBefore).filter((s) => /^\s*(INSERT|DELETE)/.test(s.query));
    expect(writes).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('still lets him change it at 23:59 on 31 Jan in his time zone', async () => {
    const { setMyStatus } = await raviLeavingOn31Jan();
    setNow('2027-01-31T15:59:00Z');

    const answer = await setMyStatus(request(RAVI, { kind: 'here', timeZone: KUALA_LUMPUR }));

    expect(answer).toEqual({ ok: true, status: { kind: 'here' } });
  });

  it('lets Away that has ended be replaced: only Leaving turns into Left', async () => {
    const { setMyStatus } = await load();
    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));
    setNow('2026-11-21T02:00:00Z');

    const answer = await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-12-01', timeZone: KUALA_LUMPUR }));

    expect(answer).toEqual({ ok: true, status: { kind: 'away', untilDate: '2026-12-01' } });
  });
});

describe('setMyStatus (scenario 5: a date outside today to one year ahead is not saved)', () => {
  it.each([
    ['Away until 2 Nov 2026', { kind: 'away', untilDate: '2026-11-02' }, 'past'],
    ['Leaving on 10 Dec 2027', { kind: 'leaving', untilDate: '2027-12-10' }, 'too_far'],
    ['Away until 8 Nov 2027, one day over a year', { kind: 'away', untilDate: '2027-11-08' }, 'too_far'],
  ])('refuses %s, saves nothing and runs no SQL', async (_label, choice, error) => {
    const { fake, setMyStatus } = await load();

    const answer = await setMyStatus(request(AISHA, { ...choice, timeZone: KUALA_LUMPUR }));

    expect(answer).toEqual({ ok: false, error });
    expect(fake.statements).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each([
    ['today', '2026-11-07'],
    ['exactly one year ahead', '2027-11-07'],
  ])('accepts %s', async (_label, untilDate) => {
    const { setMyStatus } = await load();

    const answer = await setMyStatus(request(AISHA, { kind: 'away', untilDate, timeZone: KUALA_LUMPUR }));

    expect(answer).toEqual({ ok: true, status: { kind: 'away', untilDate } });
  });

  it('checks "today" in the person\'s own time zone, not the server\'s', async () => {
    const { setMyStatus } = await load();
    // 6 Nov 17:00 UTC is already 7 Nov 01:00 in Kuala Lumpur, so 6 Nov has passed for Aisha.
    setNow('2026-11-06T17:00:00Z');

    const inKualaLumpur = await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-06', timeZone: KUALA_LUMPUR }));
    const inUtc = await setMyStatus(request(DANIEL, { kind: 'away', untilDate: '2026-11-06', timeZone: 'UTC' }));

    expect(inKualaLumpur).toEqual({ ok: false, error: 'past' });
    expect(inUtc.ok).toBe(true);
  });
});

describe('setMyStatus refuses a changed request with bad_request, before any SQL', () => {
  const GOOD = { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR };

  it.each([
    ['kind "left", which only the date or Jira can set', { kind: 'left' }],
    ['kind "AWAY"', { kind: 'AWAY' }],
    ['no kind', { kind: undefined }],
    ['a number as kind', { kind: 1 }],
    ['a date that is not a real day', { untilDate: '2026-02-30' }],
    ['a date in words', { untilDate: '20 Nov 2026' }],
    ['a date with a time', { untilDate: '2026-11-20T00:00:00Z' }],
    ['no date for Away', { untilDate: undefined }],
    ['a time zone Intl does not know', { timeZone: 'Mars/Olympus_Mons' }],
    ['an empty time zone', { timeZone: '' }],
    ['no time zone', { timeZone: undefined }],
    ['a number as time zone', { timeZone: 8 }],
  ])('refuses %s', async (_label, change) => {
    const { fake, setMyStatus } = await load();

    const answer = await setMyStatus(request(AISHA, { ...GOOD, ...change }));

    expect(answer).toEqual({ ok: false, error: 'bad_request' });
    expect(fake.statements).toEqual([]);
  });

  it('checks the time zone first: a bad zone with a past date is bad_request, not past', async () => {
    const { setMyStatus } = await load();

    const answer = await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-02', timeZone: 'Mars/Olympus_Mons' }));

    expect(answer).toEqual({ ok: false, error: 'bad_request' });
  });

  it('needs a known time zone for Here too', async () => {
    const { setMyStatus } = await load();

    const answer = await setMyStatus(request(AISHA, { kind: 'here' }));

    expect(answer).toEqual({ ok: false, error: 'bad_request' });
  });
});

describe('listStatuses', () => {
  it('returns an empty list on a fresh install', async () => {
    const { listStatuses } = await load();

    expect(await listStatuses(request(DANIEL))).toEqual({ ok: true, statuses: [] });
  });

  it('returns the raw stored rows, even a date that has passed: the page works out Here and Left', async () => {
    const { setMyStatus, listStatuses } = await load();
    await setMyStatus(request(RAVI, { kind: 'leaving', untilDate: '2026-11-08', timeZone: KUALA_LUMPUR }));
    setNow('2026-11-10T02:00:00Z');

    const { statuses } = await listStatuses(request(DANIEL));

    expect(statuses).toEqual([{ accountId: RAVI, kind: 'leaving', untilDate: '2026-11-08' }]);
  });

  it('asks the database for at most 500 rows, with the limit written into the SQL', async () => {
    const { fake, listStatuses } = await load();

    await listStatuses(request(DANIEL));

    const select = fake.statements.find((s) => s.query.includes('FROM porch_statuses'));
    expect(select.query).toMatch(/LIMIT 500$/);
    expect(select.params).toEqual([]);
  });
});

describe('the stored date (src/db/porch.js)', () => {
  // Forge SQL may hand a DATE column back as text or as a JavaScript Date. The page and the
  // date rules need "YYYY-MM-DD" text either way.
  it.each([
    ['as text', false],
    ['as a Date', true],
  ])('comes back as "YYYY-MM-DD" when the database returns it %s', async (_label, datesAsObjects) => {
    const { fake, db, setMyStatus } = await load();
    await setMyStatus(request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR }));
    fake.datesAsObjects = datesAsObjects;

    expect(await db.getStatus(AISHA)).toEqual({ accountId: AISHA, kind: 'away', untilDate: '2026-11-20' });
    expect(await db.listStatuses()).toEqual([{ accountId: AISHA, kind: 'away', untilDate: '2026-11-20' }]);
  });

  it('getStatus answers null for a person with no row', async () => {
    const { db, listStatuses } = await load();
    await listStatuses(request(DANIEL)); // creates the table

    expect(await db.getStatus(AISHA)).toBeNull();
  });
});

describe('every porch resolver', () => {
  it.each([['listStatuses'], ['setMyStatus']])('%s refuses a caller with no signed-in account', async (name) => {
    const resolvers = await load();

    await expect(
      resolvers[name](request(undefined, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR })),
    ).rejects.toThrow(/signed-in/);
  });

  it.each([['listStatuses'], ['setMyStatus']])('%s fails loudly when the database cannot be reached', async (name) => {
    const resolvers = await load();
    resolvers.fake.failWith = new Error('connection refused');

    await expect(
      resolvers[name](request(AISHA, { kind: 'away', untilDate: '2026-11-20', timeZone: KUALA_LUMPUR })),
    ).rejects.toThrow();
  });
});
