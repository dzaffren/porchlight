// Everything the page asks of Forge and Jira goes through this file.
// Keeping it in one place means the tests can swap it for test doubles, because
// @forge/bridge only works inside Jira's frame, not in a test runner.
import { invoke, requestJira } from '@forge/bridge';

/**
 * The newest notes from everyone, from the listNotes resolver.
 * @returns {Promise<Array<{ id: string, body: string, authorAccountId: string, createdAt: string }>>}
 */
export async function fetchNotes() {
  const result = await invoke('listNotes');
  if (!result?.ok) {
    throw new Error('listNotes did not return notes');
  }
  return result.notes;
}

/**
 * Save one note through the saveNote resolver.
 * Resolves to { ok: true, note } or { ok: false, error }; rejects when the save failed.
 */
export function saveNote({ body, clientKey }) {
  return invoke('saveNote', { body, clientKey });
}

/**
 * Who is looking at the page. requestJira runs as the viewer, so Jira's own
 * permissions apply (the read:jira-user scope in manifest.yml allows it).
 * @returns {Promise<{ accountId: string, displayName: string }>}
 */
export async function fetchMyself() {
  const response = await requestJira('/rest/api/3/myself');
  if (!response.ok) {
    throw new Error(`Jira /myself answered ${response.status}`);
  }
  const me = await response.json();
  return { accountId: me.accountId, displayName: me.displayName };
}

/**
 * Current display names for a list of account IDs, in one request.
 * Names are looked up each time rather than stored with the note, so a renamed
 * person shows their new name (decision D12).
 *
 * @param {string[]} accountIds - at most 100, the list limit
 * @returns {Promise<Record<string, string>>} accountId → display name
 */
export async function fetchDisplayNames(accountIds) {
  if (accountIds.length === 0) {
    return {};
  }
  const query = accountIds.map((id) => `accountId=${encodeURIComponent(id)}`).join('&');
  const response = await requestJira(`/rest/api/3/user/bulk?maxResults=100&${query}`);
  if (!response.ok) {
    throw new Error(`Jira /user/bulk answered ${response.status}`);
  }
  const page = await response.json();
  return Object.fromEntries(page.values.map((user) => [user.accountId, user.displayName]));
}
