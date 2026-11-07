// Every SQL statement Porchlight runs against the team_members table lives in this file.
//
// The team list is one shared list for the whole site (spec catch-up-view, decision D16).
// It stores only account IDs: the page asks Jira for names each time, so a renamed person
// shows their new name without any change here.
//
// Like notes.js, every value goes in through bindParams(), never inside the SQL text.
import { sql } from '@forge/sql';
import { toIsoUtc } from './datetime.js';

// The list shows at most this many people. A team is 5 to 50 people (spec non-functionals).
export const TEAM_LIMIT = 200;

// The three columns the page needs, in the order every SELECT below asks for them.
const MEMBER_COLUMNS = 'account_id, added_by_account_id, added_at';

/** Convert one database row into the shape the page uses. */
function toMember(row) {
  return {
    accountId: row.account_id,
    addedByAccountId: row.added_by_account_id,
    addedAt: toIsoUtc(row.added_at),
  };
}

/**
 * Look up one person on the team.
 *
 * @param {string} accountId
 * @returns {Promise<{ accountId: string, addedByAccountId: string, addedAt: string } | null>}
 */
async function findMember(accountId) {
  const result = await sql
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM team_members WHERE account_id = ?`)
    .bindParams(accountId)
    .execute();
  return result.rows.length > 0 ? toMember(result.rows[0]) : null;
}

/**
 * Everyone on the team, oldest first, so the list does not reorder as people are added.
 * Ties (two people added in the same second) are broken by id, so the earlier add comes first.
 *
 * @returns {Promise<Array<{ accountId: string, addedByAccountId: string, addedAt: string }>>}
 */
export async function listMembers() {
  // LIMIT is written into the SQL, not bound with "?": Forge SQL refuses a bound LIMIT
  // (see docs/learnings/forge.md). TEAM_LIMIT is a fixed number, never user input.
  const result = await sql
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM team_members ORDER BY added_at ASC, id ASC LIMIT ${TEAM_LIMIT}`)
    .execute();
  return result.rows.map(toMember);
}

/**
 * Put a person on the team, at most once.
 *
 * Three steps:
 *  1. SELECT: if the person is already there, return that row and write nothing.
 *  2. INSERT IGNORE: add the row. "IGNORE" means a clash on the unique account_id
 *     changes nothing instead of failing. That happens when two people add the same
 *     teammate at the same moment, and both pass step 1.
 *  3. SELECT again, to return the row as the database stored it (with its added_at).
 *
 * `added` is true only when this call's INSERT wrote the row (affectedRows is 1), so of
 * two adds at the same moment, exactly one answers "added".
 *
 * @param {{ accountId: string, addedByAccountId: string }} member
 * @returns {Promise<{ member: { accountId: string, addedByAccountId: string, addedAt: string }, added: boolean }>}
 */
export async function addMember({ accountId, addedByAccountId }) {
  const existing = await findMember(accountId);
  if (existing) {
    return { member: existing, added: false };
  }

  const insert = await sql
    .prepare('INSERT IGNORE INTO team_members (account_id, added_by_account_id) VALUES (?, ?)')
    .bindParams(accountId, addedByAccountId)
    .execute();

  const member = await findMember(accountId);
  if (!member) {
    // The row was inserted (or already there) a moment ago, so it must be found.
    throw new Error('The teammate was saved but could not be read back.');
  }
  return { member, added: insert.rows.affectedRows === 1 };
}

/**
 * Take a person off the team. Only the row in Porchlight's own table goes:
 * nothing in Jira changes, and the person can be added again later.
 * Taking off someone who is not on the list changes nothing, and is not an error.
 *
 * @param {string} accountId
 * @returns {Promise<void>}
 */
export async function removeMember(accountId) {
  await sql.prepare('DELETE FROM team_members WHERE account_id = ?').bindParams(accountId).execute();
}
