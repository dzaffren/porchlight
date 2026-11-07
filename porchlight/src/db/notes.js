// Every SQL statement Porchlight runs against the notes table lives in this file.
//
// All of them are "parameterised": the SQL text is fixed, and the values go in through
// bindParams(). The database treats those values as plain data, so text a person typed
// (even text that looks like SQL) can never change what the query does.
import { sql } from '@forge/sql';
import { toIsoUtc } from './datetime.js';

// The list shows at most this many notes. Pagination is a later slice.
export const LIST_LIMIT = 100;

/**
 * Convert one database row into the shape the page uses.
 * BIGINT ids can come back as numbers or strings, so the id is always sent as a string.
 */
function toNote(row) {
  return {
    id: String(row.id),
    body: row.body,
    authorAccountId: row.author_account_id,
    createdAt: toIsoUtc(row.created_at),
  };
}

/**
 * Save a note, at most once per client key, and return the saved note.
 *
 * "ON DUPLICATE KEY UPDATE id = id" means: if a row with this client_key already
 * exists, change nothing. So a retried save (same key) never makes a second row.
 * The SELECT afterwards returns the row either way, new or already saved.
 *
 * @param {{ clientKey: string, body: string, authorAccountId: string }} note
 * @returns {Promise<{ id: string, body: string, authorAccountId: string, createdAt: string } | null>}
 *   null when the key belongs to another author's note.
 */
export async function insertNoteOnce({ clientKey, body, authorAccountId }) {
  await sql
    .prepare(
      `INSERT INTO notes (client_key, body, author_account_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
    )
    .bindParams(clientKey, body, authorAccountId)
    .execute();

  // Look the row up by key AND author, so nobody can read back a row by guessing a key.
  const result = await sql
    .prepare(
      `SELECT id, body, author_account_id, created_at FROM notes
       WHERE client_key = ? AND author_account_id = ?`,
    )
    .bindParams(clientKey, authorAccountId)
    .execute();

  return result.rows.length > 0 ? toNote(result.rows[0]) : null;
}

/**
 * The newest notes first, from every author.
 * Ties (two notes in the same second) are broken by id, so the later save comes first.
 *
 * @returns {Promise<Array<{ id: string, body: string, authorAccountId: string, createdAt: string }>>}
 */
export async function listNewestNotes() {
  // LIMIT is written into the SQL, not bound with "?": Forge SQL sends bound values as
  // text, and the database refuses text after LIMIT ("Incorrect arguments to LIMIT").
  // This is safe because LIST_LIMIT is a fixed number in this file, never user input.
  const result = await sql
    .prepare(
      `SELECT id, body, author_account_id, created_at FROM notes
       ORDER BY created_at DESC, id DESC LIMIT ${LIST_LIMIT}`,
    )
    .execute();

  return result.rows.map(toNote);
}
