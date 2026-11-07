// Every SQL statement Porchlight runs against the porch_statuses table lives in this file.
//
// A row is what one person chose for their porch light: "away until a date" or "leaving on a
// date" (spec porch-status, decision D26). Here is no row. Left and Here-after-Away are never
// stored; src/lib/porch.js works them out from the stored date when a status is read.
//
// Like notes.js and team.js, every value goes in through bindParams(), never inside the SQL text.
import { sql } from '@forge/sql';

// The list returns at most this many rows. A team is 5 to 50 people, so 500 is ten times the
// team list's own limit of 200 (spec non-functionals).
export const STATUS_LIMIT = 500;

// The three columns the page needs, in the order every SELECT below asks for them.
const STATUS_COLUMNS = 'account_id, kind, until_date';

// A DATE as text: "2026-11-20", maybe followed by a time ("2026-11-20 00:00:00").
const LEADING_ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

/**
 * Turn the DATE the database returns into "YYYY-MM-DD" text.
 *
 * Forge SQL is MySQL-compatible, and a MySQL client may hand a DATE back either as text or as a
 * JavaScript Date. A Date for a DATE column stands for midnight UTC of that day (Forge functions
 * run in UTC), so its first ten ISO characters are the day itself.
 *
 * @param {string|Date} value
 * @returns {string} "YYYY-MM-DD"
 * @throws {Error} for anything else, so a surprise from the database fails loudly
 */
function toIsoDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const match = LEADING_ISO_DATE.exec(String(value));
  if (!match) {
    throw new Error(`porch_statuses.until_date is not a date: ${value}`);
  }
  return match[1];
}

/** Convert one database row into the shape the page uses. */
function toStatus(row) {
  return {
    accountId: row.account_id,
    kind: row.kind,
    untilDate: toIsoDate(row.until_date),
  };
}

/**
 * Everyone's stored porch light choice, ordered by account ID so the answer is stable.
 *
 * @returns {Promise<Array<{ accountId: string, kind: 'away' | 'leaving', untilDate: string }>>}
 */
export async function listStatuses() {
  // LIMIT is written into the SQL, not bound with "?": Forge SQL refuses a bound LIMIT
  // (see docs/learnings/forge.md). STATUS_LIMIT is a fixed number, never user input.
  const result = await sql
    .prepare(`SELECT ${STATUS_COLUMNS} FROM porch_statuses ORDER BY account_id ASC LIMIT ${STATUS_LIMIT}`)
    .execute();
  return result.rows.map(toStatus);
}

/**
 * One person's stored porch light choice.
 *
 * @param {string} accountId
 * @returns {Promise<{ accountId: string, kind: 'away' | 'leaving', untilDate: string } | null>}
 *   null when the person is Here (no row).
 */
export async function getStatus(accountId) {
  const result = await sql
    .prepare(`SELECT ${STATUS_COLUMNS} FROM porch_statuses WHERE account_id = ?`)
    .bindParams(accountId)
    .execute();
  return result.rows.length > 0 ? toStatus(result.rows[0]) : null;
}

/**
 * Save a person's choice, replacing any choice they saved before.
 *
 * "ON DUPLICATE KEY UPDATE" means: if this person already has a row (account_id is the primary
 * key), change that row instead of failing. VALUES(kind) is the value this INSERT tried to write,
 * so the same three bound values serve both cases. set_at moves to now, because it records when
 * the person last set their porch light.
 *
 * @param {string} accountId - from Forge's context, never from the page
 * @param {'away' | 'leaving'} kind
 * @param {string} untilDate - "YYYY-MM-DD", already checked by checkStatusDate
 * @returns {Promise<void>}
 */
export async function upsertStatus(accountId, kind, untilDate) {
  await sql
    .prepare(
      `INSERT INTO porch_statuses (account_id, kind, until_date) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE kind = VALUES(kind), until_date = VALUES(until_date), set_at = CURRENT_TIMESTAMP`,
    )
    .bindParams(accountId, kind, untilDate)
    .execute();
}

/**
 * Remove a person's choice, which turns their porch light off (Here).
 * Deleting a row that is not there changes nothing, and is not an error.
 *
 * @param {string} accountId - from Forge's context, never from the page
 * @returns {Promise<void>}
 */
export async function deleteStatus(accountId) {
  await sql.prepare('DELETE FROM porch_statuses WHERE account_id = ?').bindParams(accountId).execute();
}
