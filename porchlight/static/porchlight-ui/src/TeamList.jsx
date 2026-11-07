// The team list: one row per teammate, or the empty porch when there is nobody yet.
//
// Each row has two buttons: the person (opens their catch-up) and Remove. The row whose
// catch-up is open gets .pl-row.is-selected and aria-current, so the list shows where
// you are (decision D19).
//
// Security: names come from Jira. They are React text children, so they show as text.
import { formatDay, initials } from './format.js';

/** First visit: a house at night with its porch light on, waiting. */
function EmptyTeam() {
  return (
    <div className="pl-empty">
      <svg className="pl-empty__art" viewBox="0 0 320 200" aria-hidden="true">
        <use href="#porch-scene" />
      </svg>
      <p className="pl-empty__title">No one on the team yet</p>
      <p>Add the people you work with, so anyone can catch up on their work.</p>
    </div>
  );
}

/**
 * @param {{
 *   members: Array<{ accountId: string, addedByAccountId: string, addedAt: string }>,
 *   nameOf: (accountId: string) => string,
 *   selectedId: string | null,
 *   onPick: (member) => void,
 *   onRemove: (member) => void,
 * }} props
 */
export default function TeamList({ members, nameOf, selectedId, onPick, onRemove }) {
  if (members.length === 0) {
    return <EmptyTeam />;
  }
  return (
    <ul className="pl-list" aria-label="Team">
      {members.map((member) => {
        const name = nameOf(member.accountId);
        const selected = member.accountId === selectedId;
        return (
          <li
            key={member.accountId}
            className={selected ? 'pl-row team-row is-selected' : 'pl-row team-row'}
            aria-current={selected ? 'true' : undefined}
          >
            <button className="pick" type="button" aria-label={`Catch up on ${name}`} onClick={() => onPick(member)}>
              <span className="pl-avatar" aria-hidden="true">{initials(name)}</span>
              <strong>{name}</strong>
              <span className="pl-meta">Added by {nameOf(member.addedByAccountId)} · {formatDay(member.addedAt)}</span>
            </button>
            <button
              className="pl-btn pl-btn--subtle"
              type="button"
              aria-label={`Take ${name} off the team`}
              onClick={() => onRemove(member)}
            >
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}
