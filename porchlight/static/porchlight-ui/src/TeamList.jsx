// The team list: one row per teammate, or the empty porch when there is nobody yet.
//
// Each row has two buttons: the person (opens their catch-up) and Remove. The row whose
// catch-up is open gets .pl-row.is-selected and aria-current, so the list shows where
// you are (decision D19).
//
// Under each name, on its own line, is the person's porch light (docs/specs/porch-status.md).
// It is read only: nobody gets a control for another person's lamp (decision D24).
//
// Security: names come from Jira. They are React text children, so they show as text.
import { formatDay, initials } from './format.js';
import Presence from './Presence.jsx';

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
 *   statusOf: (accountId: string) => { kind: string, untilDate?: string },
 *   selectedId: string | null,
 *   onPick: (member) => void,
 *   onRemove: (member) => void,
 * }} props
 *   statusOf: what the person's porch light shows right now, from effectiveStatus.
 */
export default function TeamList({ members, nameOf, statusOf, selectedId, onPick, onRemove }) {
  if (members.length === 0) {
    return <EmptyTeam />;
  }
  return (
    <ul className="pl-list" aria-label="Team">
      {members.map((member) => {
        const name = nameOf(member.accountId);
        const selected = member.accountId === selectedId;
        const status = statusOf(member.accountId);
        // The button's name stays "Catch up on Aisha Rahman". A lamp that is on is linked
        // as its description, so a screen reader also says "Away until 20 Nov".
        const statusId = `status-${member.accountId}`;
        return (
          <li
            key={member.accountId}
            className={selected ? 'pl-row team-row is-selected' : 'pl-row team-row'}
            aria-current={selected ? 'true' : undefined}
          >
            <button
              className="pick"
              type="button"
              aria-label={`Catch up on ${name}`}
              aria-describedby={status.kind === 'here' ? undefined : statusId}
              onClick={() => onPick(member)}
            >
              <span className="pl-avatar" aria-hidden="true">{initials(name)}</span>
              <span className="name-line">
                <strong>{name}</strong>
                <Presence status={status} id={statusId} />
              </span>
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
