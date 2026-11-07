// "Add a teammate": search Jira users by name, then Add one to the team.
//
//   type ≥ 2 letters → wait 250ms → searchUsers → results
//   Add → onAdd (TeamPage) → ok: clear the search · already_on_team: say so under the field
//
// Security: names come from Jira. They are React text children, so they show as text.
import { useEffect, useId, useState } from 'react';
import * as api from './api.js';
import { initials } from './format.js';

const HELP_TEXT = 'Search Jira by name. Everyone on the site sees this list.';
const SEARCH_FAILED = "Couldn't search Jira. Try again.";
const MIN_LETTERS = 2;
const DEBOUNCE_MS = 250;

/**
 * @param {{
 *   memberIds: Set<string>,
 *   onAdd: (person: { accountId: string, displayName: string }) => Promise<{ ok: boolean, error?: string }>
 * }} props
 *   onAdd resolves with the resolver's answer, or rejects when the call failed.
 */
export default function AddTeammate({ memberIds, onAdd }) {
  const [query, setQuery] = useState('');
  // The last search answer and the text it was for: { query, users } or { query, failed: true }.
  // Keeping the text means an answer for an old query is never shown for a new one.
  const [answer, setAnswer] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const ids = { input: useId(), help: useId(), results: useId() };

  const typed = query.trim();
  const searchable = typed.length >= MIN_LETTERS;

  // Search once the person stops typing for 250ms, so each letter is not a Jira request.
  useEffect(() => {
    if (!searchable) return undefined;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const users = await api.searchUsers(typed);
        if (current) setAnswer({ query: typed, users });
      } catch {
        if (current) setAnswer({ query: typed, failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [typed, searchable]);

  const shown = searchable && answer?.query === typed ? answer : null;
  const message = fieldError ?? (shown?.failed ? SEARCH_FAILED : null);

  function handleChange(event) {
    setQuery(event.target.value);
    setFieldError(null);
  }

  async function handleAdd(person) {
    setFieldError(null);
    setAddingId(person.accountId);
    try {
      const result = await onAdd(person);
      if (result?.ok) {
        setQuery('');
      } else if (result?.error === 'already_on_team') {
        // Someone else added them a moment ago. TeamPage has reloaded the list.
        setFieldError(`${person.displayName} is already on the team.`);
      } else {
        setFieldError(`Couldn't add ${person.displayName}. Try again.`);
      }
    } catch {
      setFieldError(`Couldn't add ${person.displayName}. Try again.`);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="stack">
      <div className={message ? 'pl-field pl-field--error' : 'pl-field'}>
        <label className="pl-field__label" htmlFor={ids.input}>Add a teammate</label>
        <input
          className="pl-input"
          id={ids.input}
          type="search"
          autoComplete="off"
          value={query}
          onChange={handleChange}
          aria-describedby={ids.help}
          aria-controls={ids.results}
          aria-invalid={message ? 'true' : 'false'}
        />
        <span className="pl-field__help" id={ids.help}>
          <span>{message ?? HELP_TEXT}</span>
        </span>
      </div>
      {shown && !shown.failed && (
        <ul className="pl-list" id={ids.results} aria-label="Jira users">
          {shown.users.length === 0 && (
            <li className="pl-row empty-row"><span>No Jira users match “{typed}”.</span></li>
          )}
          {shown.users.map((person) => (
            <li className="pl-row result-row" key={person.accountId}>
              <span className="pl-avatar" aria-hidden="true">{initials(person.displayName)}</span>
              <span>{person.displayName}</span>
              {memberIds.has(person.accountId) ? (
                <span className="pl-meta">On the team</span>
              ) : (
                <button
                  className="pl-btn pl-btn--secondary"
                  type="button"
                  aria-label={`Add ${person.displayName} to the team`}
                  disabled={addingId === person.accountId}
                  onClick={() => handleAdd(person)}
                >
                  Add
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
