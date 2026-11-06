// A small in-memory stand-in for @forge/sql, used only by the unit tests.
//
// Forge SQL runs in Atlassian's cloud, so tests cannot reach it. This fake understands
// exactly the statements Porchlight sends, and behaves like the real database where it
// matters to us:
//   - the notes table must exist before you insert into it,
//   - client_key is unique, so a second insert with the same key changes nothing,
//   - the list comes back newest first, with a limit.
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
  migrations: [],
  nextId: 1,
  // Every statement sent, with its parameters, so a test can check how SQL was built.
  statements: [],
  // Set to an Error to make the next statements fail, as if the database were down.
  failWith: null,
  // A fixed clock, so created_at values are predictable. Tests move it forward.
  now: new Date('2026-11-06T09:00:00Z'),

  reset() {
    this.tables = new Set();
    this.notes = [];
    this.migrations = [];
    this.nextId = 1;
    this.statements = [];
    this.failWith = null;
    this.now = new Date('2026-11-06T09:00:00Z');
  },

  /** Advance the fake clock by some seconds. */
  tick(seconds = 60) {
    this.now = new Date(this.now.getTime() + seconds * 1000);
  },
};

/** Format a Date the way MySQL returns a DATETIME: "2026-11-06 09:00:00". */
const toDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

function requireNotesTable() {
  if (!fake.tables.has('notes')) {
    throw new Error("Table 'notes' doesn't exist");
  }
}

/** Run one statement against the in-memory state. */
async function run(query, params = []) {
  fake.statements.push({ query, params });
  if (fake.failWith) {
    throw fake.failWith;
  }
  const q = oneLine(query);

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
    requireNotesTable();
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
    requireNotesTable();
    const [clientKey, authorAccountId] = params;
    const rows = fake.notes
      .filter((n) => n.client_key === clientKey && n.author_account_id === authorAccountId)
      .map(({ client_key, ...rest }) => ({ ...rest })); // eslint-disable-line no-unused-vars
    return { rows };
  }
  if (q.startsWith('SELECT id, body, author_account_id, created_at FROM notes ORDER BY created_at DESC, id DESC LIMIT ?')) {
    requireNotesTable();
    const [limit] = params;
    const rows = [...fake.notes]
      .sort((a, b) => (a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1))
      .slice(0, limit)
      .map(({ client_key, ...rest }) => ({ ...rest })); // eslint-disable-line no-unused-vars
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
