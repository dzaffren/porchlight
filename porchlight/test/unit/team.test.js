// Unit tests for the three team resolvers the page calls: listTeam, addTeammate and
// removeTeammate. Scenarios 1 and 2 in docs/specs/catch-up-view.md, server side.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@forge/sql', () => import('./fake-forge-sql.js'));

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const MEI_LING = '712020:mei-ling-goh';
const RAVI = '712020:ravi-kumar';

/** Build the request object Forge passes to a resolver: the page's payload plus a trusted context. */
const request = (accountId, payload = {}) => ({ payload, context: { accountId } });

async function load() {
  vi.resetModules();
  const { fake } = await import('@forge/sql');
  fake.reset();
  const resolvers = await import('../../src/resolvers/team.js');
  return { fake, ...resolvers };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('addTeammate (scenario 1)', () => {
  it('adds Aisha, and a teammate sees her on the list with who added her', async () => {
    const { addTeammate, listTeam } = await load();
    await addTeammate(request(DANIEL, { accountId: DANIEL }));

    const added = await addTeammate(request(DANIEL, { accountId: AISHA }));
    const meiLing = await listTeam(request(MEI_LING));

    expect(added).toEqual({
      ok: true,
      member: { accountId: AISHA, addedByAccountId: DANIEL, addedAt: '2026-11-06T09:00:00.000Z' },
    });
    expect(meiLing.ok).toBe(true);
    expect(meiLing.members.map((m) => m.accountId)).toEqual([DANIEL, AISHA]);
    expect(meiLing.members[1]).toEqual(added.member);
  });

  it('works on a fresh install, before the hourly migration has run', async () => {
    const { fake, addTeammate } = await load();
    expect(fake.tables.has('team_members')).toBe(false);

    const added = await addTeammate(request(DANIEL, { accountId: AISHA }));

    expect(added.ok).toBe(true);
  });

  it('answers already_on_team with the original member when she is added again', async () => {
    const { fake, addTeammate } = await load();
    const first = await addTeammate(request(DANIEL, { accountId: AISHA }));
    fake.tick(60);

    const again = await addTeammate(request(MEI_LING, { accountId: AISHA }));

    expect(again).toEqual({ ok: false, error: 'already_on_team', member: first.member });
    expect(fake.team).toHaveLength(1);
  });

  it('adds her once when two people add her at the same moment', async () => {
    const { fake, addTeammate } = await load();

    const answers = await Promise.all([
      addTeammate(request(DANIEL, { accountId: AISHA })),
      addTeammate(request(MEI_LING, { accountId: AISHA })),
    ]);

    expect(answers.filter((a) => a.ok)).toHaveLength(1);
    expect(answers.filter((a) => a.error === 'already_on_team')).toHaveLength(1);
    expect(fake.team).toHaveLength(1);
  });

  it('takes the adder from Forge context, never from the payload', async () => {
    const { addTeammate } = await load();

    const added = await addTeammate(request(DANIEL, { accountId: AISHA, addedByAccountId: RAVI }));

    expect(added.member.addedByAccountId).toBe(DANIEL);
  });

  it('passes the account ID as a parameter, never inside the SQL itself', async () => {
    const { fake, addTeammate } = await load();

    await addTeammate(request(DANIEL, { accountId: AISHA }));

    const team = fake.statements.filter((s) => s.query.includes('team_members') && !s.query.includes('CREATE TABLE'));
    expect(team.length).toBeGreaterThan(0);
    for (const statement of team) {
      expect(statement.query).not.toContain(AISHA);
      expect(statement.query).not.toContain(DANIEL);
    }
    const insert = team.find((s) => s.query.includes('INSERT IGNORE'));
    expect(insert.params).toEqual([AISHA, DANIEL]);
  });

  it('logs the proof line with the adder', async () => {
    const { addTeammate } = await load();

    await addTeammate(request(DANIEL, { accountId: AISHA }));

    expect(console.log).toHaveBeenCalledWith(`porchlight.team.added by=${DANIEL}`);
  });

  it('logs nothing when she was already on the team', async () => {
    const { addTeammate } = await load();
    await addTeammate(request(DANIEL, { accountId: AISHA }));
    console.log.mockClear();

    await addTeammate(request(MEI_LING, { accountId: AISHA }));

    expect(console.log).not.toHaveBeenCalledWith(`porchlight.team.added by=${MEI_LING}`);
  });
});

// Account IDs the format check must refuse, before any SQL runs.
const BAD_ACCOUNT_IDS = [
  ['an empty string', ''],
  ['129 characters', 'a'.repeat(129)],
  ['SQL in the text', "x' OR 1=1"],
  ['a number', 712020],
  ['nothing at all', undefined],
];

describe('bad account IDs', () => {
  it.each(BAD_ACCOUNT_IDS)('addTeammate refuses %s and runs no SQL', async (_label, accountId) => {
    const { fake, addTeammate } = await load();

    const result = await addTeammate(request(DANIEL, { accountId }));

    expect(result).toEqual({ ok: false, error: 'bad_request' });
    expect(fake.statements).toEqual([]);
  });

  it.each(BAD_ACCOUNT_IDS)('removeTeammate refuses %s and runs no SQL', async (_label, accountId) => {
    const { fake, removeTeammate } = await load();

    const result = await removeTeammate(request(DANIEL, { accountId }));

    expect(result).toEqual({ ok: false, error: 'bad_request' });
    expect(fake.statements).toEqual([]);
  });

  it('accepts the longest allowed ID, 128 characters', async () => {
    const { addTeammate } = await load();

    const result = await addTeammate(request(DANIEL, { accountId: 'a'.repeat(128) }));

    expect(result.ok).toBe(true);
  });

  it('accepts an old-style ID without a colon', async () => {
    const { addTeammate } = await load();

    const result = await addTeammate(request(DANIEL, { accountId: '5b10ac8d82e05b22cc7d4ef5' }));

    expect(result.ok).toBe(true);
  });
});

describe('removeTeammate (scenario 2)', () => {
  it('takes Ravi off the list for everyone, and he can be added again later', async () => {
    const { fake, addTeammate, removeTeammate, listTeam } = await load();
    for (const accountId of [AISHA, DANIEL, RAVI]) {
      await addTeammate(request(DANIEL, { accountId }));
    }

    const before = fake.statements.length;
    const removed = await removeTeammate(request(DANIEL, { accountId: RAVI }));
    const sentByRemove = fake.statements.slice(before).map((s) => s.query);
    const meiLing = await listTeam(request(MEI_LING));

    expect(removed).toEqual({ ok: true });
    expect(meiLing.members.map((m) => m.accountId)).toEqual([AISHA, DANIEL]);

    // Taking Ravi off deletes one row in Porchlight's own table and nothing else.
    // The resolvers never call Jira, so Ravi's tickets stay as they are.
    expect(sentByRemove).toEqual(['DELETE FROM team_members WHERE account_id = ?']);

    fake.tick(60);
    const again = await addTeammate(request(DANIEL, { accountId: RAVI }));
    expect(again.ok).toBe(true);
    expect((await listTeam(request(MEI_LING))).members.map((m) => m.accountId)).toEqual([AISHA, DANIEL, RAVI]);
  });

  it('answers ok when the person was not on the list', async () => {
    const { removeTeammate } = await load();

    expect(await removeTeammate(request(DANIEL, { accountId: RAVI }))).toEqual({ ok: true });
  });

  it('passes the account ID as a parameter, never inside the SQL itself', async () => {
    const { fake, removeTeammate } = await load();

    await removeTeammate(request(DANIEL, { accountId: RAVI }));

    const remove = fake.statements.find((s) => s.query.startsWith('DELETE FROM team_members'));
    expect(remove.query).not.toContain(RAVI);
    expect(remove.params).toEqual([RAVI]);
  });

  it('logs the proof line with the remover', async () => {
    const { removeTeammate } = await load();

    await removeTeammate(request(DANIEL, { accountId: RAVI }));

    expect(console.log).toHaveBeenCalledWith(`porchlight.team.removed by=${DANIEL}`);
  });
});

describe('listTeam', () => {
  it('returns an empty list on a fresh install', async () => {
    const { listTeam } = await load();

    expect(await listTeam(request(DANIEL))).toEqual({ ok: true, members: [] });
  });

  it('returns members oldest first', async () => {
    const { fake, addTeammate, listTeam } = await load();
    await addTeammate(request(DANIEL, { accountId: RAVI }));
    fake.tick(60);
    await addTeammate(request(DANIEL, { accountId: AISHA }));
    fake.tick(60);
    await addTeammate(request(DANIEL, { accountId: MEI_LING }));

    const { members } = await listTeam(request(DANIEL));

    expect(members.map((m) => m.accountId)).toEqual([RAVI, AISHA, MEI_LING]);
    expect(members.map((m) => m.addedAt)).toEqual([
      '2026-11-06T09:00:00.000Z',
      '2026-11-06T09:01:00.000Z',
      '2026-11-06T09:02:00.000Z',
    ]);
  });

  it('puts the earlier of two people added in the same second first', async () => {
    const { addTeammate, listTeam } = await load();
    await addTeammate(request(DANIEL, { accountId: RAVI }));
    await addTeammate(request(DANIEL, { accountId: AISHA }));

    const { members } = await listTeam(request(DANIEL));

    expect(members.map((m) => m.accountId)).toEqual([RAVI, AISHA]);
  });

  it('asks the database for at most 200 people, with the limit written into the SQL', async () => {
    const { fake, listTeam } = await load();

    await listTeam(request(DANIEL));

    const select = fake.statements.find((s) => s.query.includes('ORDER BY added_at ASC'));
    expect(select.query).toMatch(/LIMIT 200$/);
    expect(select.params).toEqual([]);
  });
});

describe('every team resolver', () => {
  it.each([['listTeam'], ['addTeammate'], ['removeTeammate']])(
    '%s refuses a caller with no signed-in account',
    async (name) => {
      const resolvers = await load();

      await expect(resolvers[name](request(undefined, { accountId: AISHA }))).rejects.toThrow(/signed-in/);
    },
  );

  it.each([['listTeam'], ['addTeammate'], ['removeTeammate']])(
    '%s fails loudly when the database cannot be reached',
    async (name) => {
      const resolvers = await load();
      resolvers.fake.failWith = new Error('connection refused');

      await expect(resolvers[name](request(DANIEL, { accountId: AISHA }))).rejects.toThrow();
    },
  );
});
