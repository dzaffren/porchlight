// Unit tests for the notes table migration: forward, backward, and "run it on the first call".
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

    expect(ran).toEqual(['v001_create_notes']);
    expect(fake.tables.has('notes')).toBe(true);
    expect(console.log).toHaveBeenCalledWith('porchlight.migrate v001_create_notes=done');
  });

  it('does nothing the second time, because Forge records what already ran', async () => {
    const { fake, runMigrations } = await load();
    await runMigrations();

    const ranAgain = await runMigrations();

    expect(ranAgain).toEqual([]);
    expect(fake.migrations.map((m) => m.name)).toEqual(['v001_create_notes']);
  });

  it('runs backward: the down step drops the table and forgets the migration, so forward works again', async () => {
    const { fake, runMigrations, rollbackV001, V001_UP, V001_DOWN } = await load();
    await runMigrations();

    await rollbackV001();
    expect(fake.tables.has('notes')).toBe(false);
    expect(fake.migrations).toEqual([]);

    // Forward again after the rollback: the table comes back.
    expect(await runMigrations()).toEqual(['v001_create_notes']);
    expect(fake.tables.has('notes')).toBe(true);

    // The down statement names the same table the up statement creates.
    expect(V001_UP).toMatch(/CREATE TABLE IF NOT EXISTS notes\b/);
    expect(V001_DOWN).toBe('DROP TABLE IF EXISTS notes');
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
