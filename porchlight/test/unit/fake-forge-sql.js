// A small in-memory stand-in for @forge/sql, used only by the unit tests.
//
// Forge SQL runs in Atlassian's cloud, so tests cannot reach it. This fake understands
// exactly the statements Porchlight sends, and behaves like the real database where it
// matters to us:
//   - the notes table must exist before you insert into it,
//   - client_key is unique, so a second insert with the same key changes nothing,
//   - the list comes back newest first, with a limit,
//   - team_members.account_id is unique, so INSERT IGNORE with the same person changes nothing,
//   - the team list comes back oldest first, with a limit,
//   - porch_statuses.account_id is the primary key, so a second save for a person replaces the first.
// Any statement it does not recognise throws, so a typo in a query fails a test loudly.
//
// The real MigrationRunner from @forge/sql runs on top of this fake, so the tests also
// prove our migration works with Forge's own runner, not a copy of it.
import { MigrationRunner } from '@forge/sql/out/migration.js';

/** Collapse whitespace so multi-line SQL in the source compares as one line. */
const oneLine = (query) => query.replace(/\s+/g, ' ').trim();

export const fake = {
  tables: new Set(),
  notes: [],
  team: [],
  porch: [],
  migrations: [],
  nextId: 1,
  // Every statement sent, with its parameters, so a test can check how SQL was built.
  statements: [],
  // Set to an Error to make the next statements fail, as if the database were down.
  failWith: null,
  // Forge SQL may return a DATE column as text ("2026-11-20") or as a JavaScript Date.
  // false returns text; a test sets true to get Date objects instead.
  datesAsObjects: false,
  // A fixed clock, so created_at values are predictable. Tests move it forward.
  now: new Date('2026-11-06T09:00:00Z'),

  reset() {
    this.tables = new Set();
    this.notes = [];
    this.team = [];
    this.porch = [];
    this.migrations = [];
    this.nextId = 1;
    this.statements = [];
    this.failWith = null;
    this.datesAsObjects = false;
    this.now = new Date('2026-11-06T09:00:00Z');
  },

  /** Advance the fake clock by some seconds. */
  tick(seconds = 60) {
    this.now = new Date(this.now.getTime() + seconds * 1000);
  },
};

/** Format a Date the way MySQL returns a DATETIME: "2026-11-06 09:00:00". */
const toDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

/** Fail like MySQL when a statement uses a table that no migration has created yet. */
function requireTable(name) {
  if (!fake.tables.has(name)) {
    throw new Error(`Table '${name}' doesn't exist`);
  }
}

/** A team row as the SELECTs return it: the three asked-for columns, without the id. */
const withoutId = ({ id, ...rest }) => ({ ...rest }); // eslint-disable-line no-unused-vars

/** A porch_statuses row as the SELECTs return it, with until_date as text or as a Date. */
const porchRow = ({ account_id, kind, until_date }) => ({
  account_id,
  kind,
  until_date: fake.datesAsObjects ? new Date(`${until_date}T00:00:00Z`) : until_date,
});

/** Run one statement against the in-memory state. */
async function run(query, params = []) {
  fake.statements.push({ query, params });
  if (fake.failWith) {
    throw fake.failWith;
  }
  const q = oneLine(query);

  // Forge SQL sends bound values as text, and the database refuses text after LIMIT.
  // Learned from the first deploy: "ERROR 1210 (HY000): Incorrect arguments to LIMIT".
  if (/\bLIMIT \?/i.test(q)) {
    throw new Error('ERROR 1210 (HY000): Incorrect arguments to LIMIT');
  }

  // --- statements Forge's MigrationRunner sends ---
  if (q.startsWith('CREATE TABLE IF NOT EXISTS __migrations')) {
    fake.tables.add('__migrations');
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('SELECT id, name, migratedAt FROM __migrations')) {
    return { rows: fake.migrations.map((m) => ({ ...m })) };
  }
  if (q.startsWith('INSERT INTO __migrations (name) VALUES (?)')) {
    fake.migrations.push({ id: fake.migrations.length + 1, name: params[0], migratedAt: toDatetime(fake.now) });
    return { rows: { affectedRows: 1 } };
  }
  if (q.startsWith('DELETE FROM __migrations WHERE name = ?')) {
    fake.migrations = fake.migrations.filter((m) => m.name !== params[0]);
    return { rows: { affectedRows: 1 } };
  }

  // --- Porchlight's own statements ---
  if (q.startsWith('CREATE TABLE IF NOT EXISTS notes')) {
    if (!q.includes('UNIQUE KEY') || !q.includes('client_key')) {
      throw new Error('fake-forge-sql: the notes table must have a unique key on client_key');
    }
    fake.tables.add('notes');
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('DROP TABLE IF EXISTS notes')) {
    fake.tables.delete('notes');
    fake.notes = [];
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('INSERT INTO notes (client_key, body, author_account_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE')) {
    requireTable('notes');
    const [clientKey, body, authorAccountId] = params;
    const exists = fake.notes.some((n) => n.client_key === clientKey);
    if (!exists) {
      fake.notes.push({
        id: fake.nextId++,
        client_key: clientKey,
        body,
        author_account_id: authorAccountId,
        created_at: toDatetime(fake.now),
      });
    }
    return { rows: { affectedRows: exists ? 0 : 1, insertId: exists ? 0 : fake.nextId - 1 } };
  }
  if (q.startsWith('SELECT id, body, author_account_id, created_at FROM notes WHERE client_key = ? AND author_account_id = ?')) {
    requireTable('notes');
    const [clientKey, authorAccountId] = params;
    const rows = fake.notes
      .filter((n) => n.client_key === clientKey && n.author_account_id === authorAccountId)
      .map(({ client_key, ...rest }) => ({ ...rest })); // eslint-disable-line no-unused-vars
    return { rows };
  }
  const listQuery = q.match(/^SELECT id, body, author_account_id, created_at FROM notes ORDER BY created_at DESC, id DESC LIMIT (\d+)$/);
  if (listQuery) {
    requireTable('notes');
    const limit = Number(listQuery[1]);
    const rows = [...fake.notes]
      .sort((a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit)
      .map(({ client_key, ...rest }) => ({ ...rest })); // eslint-disable-line no-unused-vars
    return { rows };
  }

  // --- the team_members table (spec catch-up-view) ---
  if (q.startsWith('CREATE TABLE IF NOT EXISTS team_members')) {
    if (!q.includes('UNIQUE KEY uq_team_account (account_id)')) {
      throw new Error('fake-forge-sql: the team_members table must have a unique key on account_id');
    }
    fake.tables.add('team_members');
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('DROP TABLE IF EXISTS team_members')) {
    fake.tables.delete('team_members');
    fake.team = [];
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('SELECT account_id, added_by_account_id, added_at FROM team_members WHERE account_id = ?')) {
    requireTable('team_members');
    const rows = fake.team.filter((m) => m.account_id === params[0]).map(withoutId);
    return { rows };
  }
  if (q.startsWith('INSERT IGNORE INTO team_members (account_id, added_by_account_id) VALUES (?, ?)')) {
    requireTable('team_members');
    const [accountId, addedByAccountId] = params;
    // The unique key on account_id: a second insert for the same person changes nothing.
    if (fake.team.some((m) => m.account_id === accountId)) {
      return { rows: { affectedRows: 0, insertId: 0 } };
    }
    fake.team.push({
      id: fake.nextId++,
      account_id: accountId,
      added_by_account_id: addedByAccountId,
      added_at: toDatetime(fake.now),
    });
    return { rows: { affectedRows: 1, insertId: fake.nextId - 1 } };
  }
  if (q.startsWith('DELETE FROM team_members WHERE account_id = ?')) {
    requireTable('team_members');
    const before = fake.team.length;
    fake.team = fake.team.filter((m) => m.account_id !== params[0]);
    return { rows: { affectedRows: before - fake.team.length } };
  }
  const teamListQuery = q.match(
    /^SELECT account_id, added_by_account_id, added_at FROM team_members ORDER BY added_at ASC, id ASC LIMIT (\d+)$/,
  );
  if (teamListQuery) {
    requireTable('team_members');
    const limit = Number(teamListQuery[1]);
    const rows = [...fake.team]
      .sort((a, b) => (a.added_at === b.added_at ? a.id - b.id : a.added_at < b.added_at ? -1 : 1))
      .slice(0, limit)
      .map(withoutId);
    return { rows };
  }

  // --- the porch_statuses table (spec porch-status) ---
  if (q.startsWith('CREATE TABLE IF NOT EXISTS porch_statuses')) {
    if (!q.includes('account_id VARCHAR(128) PRIMARY KEY')) {
      throw new Error('fake-forge-sql: the porch_statuses table must have account_id as its primary key');
    }
    fake.tables.add('porch_statuses');
    return { rows: { affectedRows: 0 } };
  }
  if (q.startsWith('DROP TABLE IF EXISTS porch_statuses')) {
    fake.tables.delete('porch_statuses');
    fake.porch = [];
    return { rows: { affectedRows: 0 } };
  }
  if (
    q.startsWith(
      'INSERT INTO porch_statuses (account_id, kind, until_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ' +
        'kind = VALUES(kind), until_date = VALUES(until_date), set_at = CURRENT_TIMESTAMP',
    )
  ) {
    requireTable('porch_statuses');
    const [accountId, kind, untilDate] = params;
    // The primary key on account_id: a second save for the same person replaces the row.
    // MySQL counts an insert as 1 affected row and an update as 2.
    const existing = fake.porch.find((p) => p.account_id === accountId);
    if (existing) {
      Object.assign(existing, { kind, until_date: untilDate, set_at: toDatetime(fake.now) });
      return { rows: { affectedRows: 2 } };
    }
    fake.porch.push({ account_id: accountId, kind, until_date: untilDate, set_at: toDatetime(fake.now) });
    return { rows: { affectedRows: 1 } };
  }
  if (q.startsWith('SELECT account_id, kind, until_date FROM porch_statuses WHERE account_id = ?')) {
    requireTable('porch_statuses');
    return { rows: fake.porch.filter((p) => p.account_id === params[0]).map(porchRow) };
  }
  const porchListQuery = q.match(/^SELECT account_id, kind, until_date FROM porch_statuses ORDER BY account_id ASC LIMIT (\d+)$/);
  if (porchListQuery) {
    requireTable('porch_statuses');
    const limit = Number(porchListQuery[1]);
    const rows = [...fake.porch]
      .sort((a, b) => (a.account_id < b.account_id ? -1 : 1))
      .slice(0, limit)
      .map(porchRow);
    return { rows };
  }

  throw new Error(`fake-forge-sql does not understand: ${q}`);
}

/** The same shape as @forge/sql's `sql` client: prepare().bindParams().execute(), and executeDDL(). */
export const sql = {
  prepare(query) {
    let params = [];
    const statement = {
      bindParams(...args) {
        params = args;
        return statement;
      },
      execute() {
        return run(query, params);
      },
    };
    return statement;
  },
  executeDDL(query) {
    return run(query);
  },
};

export const migrationRunner = new MigrationRunner(sql);
