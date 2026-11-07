// Unit tests for the migrations (v001 notes, v002 team_members, v003 porch_statuses):
// forward, backward, and "run it on the first call".
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Swap the real @forge/sql for the in-memory fake in every module these tests load.
vi.mock('@forge/sql', () => import('./fake-forge-sql.js'));

// Each test loads fresh copies of the modules, because migrate.js remembers
// (in memory) that it already ran. Fresh modules = a freshly installed app.
async function load() {
  vi.resetModules();
  // Import the fake through the mocked name, so the test and src/ share one copy.
  const { fake } = await import('@forge/sql');
  fake.reset();
  const migrate = await import('../../src/db/migrate.js');
  return { fake, ...migrate };
}

describe('v001_create_notes', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates the notes table and logs the proof line once', async () => {
    const { fake, runMigrations } = await load();

    const ran = await runMigrations();

    expect(ran).toEqual(['v001_create_notes', 'v002_create_team_members', 'v003_create_porch_statuses']);
    expect(fake.tables.has('notes')).toBe(true);
    expect(console.log).toHaveBeenCalledWith('porchlight.migrate v001_create_notes=done');
  });

  it('does nothing the second time, because Forge records what already ran', async () => {
    const { fake, runMigrations } = await load();
    await runMigrations();

    const ranAgain = await runMigrations();

    expect(ranAgain).toEqual([]);
    expect(fake.migrations.map((m) => m.name)).toEqual([
      'v001_create_notes',
      'v002_create_team_members',
      'v003_create_porch_statuses',
    ]);
  });

  it('runs backward: the down step drops the table and forgets the migration, so forward works again', async () => {
    const { fake, runMigrations, rollbackV001, V001_UP, V001_DOWN } = await load();
    await runMigrations();

    await rollbackV001();
    expect(fake.tables.has('notes')).toBe(false);
    // Only v001's record is gone; v002 and v003 stay recorded as done.
    expect(fake.migrations.map((m) => m.name)).toEqual(['v002_create_team_members', 'v003_create_porch_statuses']);

    // Forward again after the rollback: the table comes back.
    expect(await runMigrations()).toEqual(['v001_create_notes']);
    expect(fake.tables.has('notes')).toBe(true);

    // The down statement names the same table the up statement creates.
    expect(V001_UP).toMatch(/CREATE TABLE IF NOT EXISTS notes\b/);
    expect(V001_DOWN).toBe('DROP TABLE IF EXISTS notes');
  });
});

describe('v002_create_team_members', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates the team_members table after the notes table, and logs the proof line', async () => {
    const { fake, runMigrations, V002_UP } = await load();

    await runMigrations();

    expect(fake.tables.has('team_members')).toBe(true);
    expect(console.log).toHaveBeenCalledWith('porchlight.migrate v002_create_team_members=done');
    // One row per person: the unique key is what makes a second add change nothing.
    expect(V002_UP).toMatch(/UNIQUE KEY uq_team_account \(account_id\)/);
  });

  it('runs forward, backward, then forward again, and never touches the notes', async () => {
    const { fake, runMigrations, rollbackV002, V002_DOWN } = await load();
    const { insertNoteOnce } = await import('../../src/db/notes.js');
    await runMigrations();
    await insertNoteOnce({
      clientKey: '6f1c2a4e-1b7d-4c3e-9a51-2f8e0d4b7c11',
      body: 'Payments retry 3 times.',
      authorAccountId: '712020:aisha-rahman',
    });
    const notesBefore = structuredClone(fake.notes);

    // Backward: only the team table and its record go.
    await rollbackV002();
    expect(fake.tables.has('team_members')).toBe(false);
    expect(fake.migrations.map((m) => m.name)).toEqual(['v001_create_notes', 'v003_create_porch_statuses']);
    expect(fake.tables.has('notes')).toBe(true);
    expect(fake.notes).toEqual(notesBefore);

    // Forward again: only v002 runs, and the table comes back.
    expect(await runMigrations()).toEqual(['v002_create_team_members']);
    expect(fake.tables.has('team_members')).toBe(true);
    expect(fake.notes).toEqual(notesBefore);

    expect(V002_DOWN).toBe('DROP TABLE IF EXISTS team_members');
  });
});

describe('v003_create_porch_statuses', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('creates the porch_statuses table after the team list, and logs the proof line', async () => {
    const { fake, runMigrations, V003_UP } = await load();

    await runMigrations();

    expect(fake.tables.has('porch_statuses')).toBe(true);
    expect(console.log).toHaveBeenCalledWith('porchlight.migrate v003_create_porch_statuses=done');
    // One row per person: the account ID is the primary key, so a second save replaces the first.
    expect(V003_UP).toMatch(/account_id VARCHAR\(128\) PRIMARY KEY/);
  });

  it('runs forward, backward, then forward again, and never touches the notes or the team', async () => {
    const { fake, runMigrations, rollbackV003, V003_DOWN } = await load();
    const { insertNoteOnce } = await import('../../src/db/notes.js');
    const { addMember } = await import('../../src/db/team.js');
    await runMigrations();
    await insertNoteOnce({
      clientKey: '6f1c2a4e-1b7d-4c3e-9a51-2f8e0d4b7c11',
      body: 'Payments retry 3 times.',
      authorAccountId: '712020:aisha-rahman',
    });
    await addMember({ accountId: '712020:aisha-rahman', addedByAccountId: '712020:daniel-tan' });
    const notesBefore = structuredClone(fake.notes);
    const teamBefore = structuredClone(fake.team);

    // Backward: only the porch_statuses table and its record go.
    await rollbackV003();
    expect(fake.tables.has('porch_statuses')).toBe(false);
    expect(fake.migrations.map((m) => m.name)).toEqual(['v001_create_notes', 'v002_create_team_members']);
    expect(fake.notes).toEqual(notesBefore);
    expect(fake.team).toEqual(teamBefore);

    // Forward again: only v003 runs, and the table comes back.
    expect(await runMigrations()).toEqual(['v003_create_porch_statuses']);
    expect(fake.tables.has('porch_statuses')).toBe(true);
    expect(fake.notes).toEqual(notesBefore);
    expect(fake.team).toEqual(teamBefore);

    expect(V003_DOWN).toBe('DROP TABLE IF EXISTS porch_statuses');
  });
});

describe('the migration handler for the hourly scheduled trigger', () => {
  it('runs the migrations', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fake, migrate } = await load();

    await migrate();

    expect(fake.tables.has('notes')).toBe(true);
  });
});

describe('ensureMigrated (the first resolver call)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('runs the migrations only once per warm function, however many calls arrive', async () => {
    const { fake, ensureMigrated } = await load();

    await Promise.all([ensureMigrated(), ensureMigrated(), ensureMigrated()]);
    await ensureMigrated();

    const creates = fake.statements.filter((s) => s.query.includes('CREATE TABLE IF NOT EXISTS notes'));
    expect(creates).toHaveLength(1);
  });

  it('tries again on the next call when the database was down', async () => {
    const { fake, ensureMigrated } = await load();
    fake.failWith = new Error('connection refused');

    await expect(ensureMigrated()).rejects.toThrow();

    fake.failWith = null;
    await ensureMigrated();
    expect(fake.tables.has('notes')).toBe(true);
  });
});
