// Database migrations for Porchlight's Forge SQL database.
//
// A migration is a saved database change, like "create the notes table". Forge's
// migrationRunner keeps a list of the ones that already ran (in a table called
// __migrations), so each one runs once per installation of the app.
//
// Two things run the migrations:
//  1. `migrate`, the handler for the hourly scheduled trigger in manifest.yml.
//  2. `ensureMigrated`, called by every resolver before it touches the database.
//     Without it, a note saved in the first hour after install would fail, because
//     the trigger may not have run yet (spec ledger O7).
import { sql, migrationRunner } from '@forge/sql';

const V001_NAME = 'v001_create_notes';
const V002_NAME = 'v002_create_team_members';

// Forward: create the notes table.
// - client_key is unique. The page sends a random key with each save, so a retried
//   save can never make a second row (decision D13).
// - created_at is set by the database, in UTC, so a browser cannot fake the time.
export const V001_UP = `
  CREATE TABLE IF NOT EXISTS notes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    client_key VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    author_account_id VARCHAR(128) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notes_client_key (client_key)
  )
`;

// Backward: remove the notes table. This deletes every note, so it never runs on
// its own. See rollbackV001 below.
export const V001_DOWN = 'DROP TABLE IF EXISTS notes';

// Forward: create the team list (spec catch-up-view, decision D16).
// - One row per person on the team. Names are never stored; the page asks Jira for them.
// - account_id is unique, so two people adding the same teammate make only one row.
// - added_by_account_id comes from Forge's context, never from the page.
// - added_at is set by the database, in UTC, like notes.created_at.
export const V002_UP = `
  CREATE TABLE IF NOT EXISTS team_members (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    account_id VARCHAR(128) NOT NULL,
    added_by_account_id VARCHAR(128) NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_team_account (account_id)
  )
`;

// Backward: remove the team list. The notes table is not touched. See rollbackV002 below.
export const V002_DOWN = 'DROP TABLE IF EXISTS team_members';

// Register the migrations with Forge's runner, in the order they must run.
// enqueue() only adds them to a list; nothing touches the database until run() is called.
migrationRunner.enqueue(V001_NAME, V001_UP).enqueue(V002_NAME, V002_UP);

/**
 * Run every migration that has not run yet on this installation.
 * Logs one proof line per migration, which `forge logs` shows after a deploy.
 *
 * @returns {Promise<string[]>} the names of the migrations that ran this time
 */
export async function runMigrations() {
  const ran = await migrationRunner.run();
  for (const name of ran) {
    console.log(`porchlight.migrate ${name}=done`);
  }
  return ran;
}

/**
 * Handler for the hourly scheduled trigger (manifest.yml › scheduledTrigger).
 * Forge calls this on its own; nobody invokes it from the page.
 */
export async function migrate() {
  await runMigrations();
}

// The migration run that is in progress or finished in this warm function.
// Forge reuses a function's process for a while between calls, so remembering this
// saves a database round trip on every request after the first.
let migrationRun = null;

/**
 * Make sure the tables exist before a resolver uses them.
 * Many calls at once share one run. If the run fails, the next call tries again.
 *
 * @returns {Promise<void>}
 */
export function ensureMigrated() {
  if (!migrationRun) {
    migrationRun = runMigrations().then(
      () => undefined,
      (error) => {
        migrationRun = null; // forget the failure, so the next call retries
        throw error;
      },
    );
  }
  return migrationRun;
}

/**
 * Reverse v001: drop the notes table and remove its record from __migrations,
 * so that running the migrations again recreates the table.
 *
 * Not wired to any trigger or resolver. It deletes all notes, so it runs only by
 * hand, on the development environment, when a broken release must be rolled back.
 */
export async function rollbackV001() {
  await sql.executeDDL(V001_DOWN);
  await sql.prepare('DELETE FROM __migrations WHERE name = ?').bindParams(V001_NAME).execute();
  migrationRun = null;
}

/**
 * Reverse v002: drop the team_members table and remove its record from __migrations,
 * so that running the migrations again recreates the table. Notes stay as they are.
 *
 * Like rollbackV001, it runs only by hand, on the development environment.
 * It deletes the whole team list.
 */
export async function rollbackV002() {
  await sql.executeDDL(V002_DOWN);
  await sql.prepare('DELETE FROM __migrations WHERE name = ?').bindParams(V002_NAME).execute();
  migrationRun = null;
}
