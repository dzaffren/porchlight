// The catch-up pane: one teammate's work, read from Jira as the viewer.
import { useId } from 'react';
import { formatFullDate, initials } from './format.js';

/** Nobody picked yet. */
function PickSomeone({ titleId }) {
  return (
    <div className="pl-empty">
      <p className="pl-empty__title" id={titleId}>Pick a teammate</p>
      <p>See their open work, latest changes, blockers and next steps, straight from Jira.</p>
    </div>
  );
}

/** The picked person: avatar, name, and where the facts come from. */
function PersonHeader({ name, titleId }) {
  return (
    <div className="person">
      <span className="pl-avatar pl-avatar--lg" aria-hidden="true">{initials(name)}</span>
      <div className="person-text">
        <h2 id={titleId}>{name}</h2>
        <span className="pl-meta">From Jira, as you · {formatFullDate(new Date())} · Showing only tickets you can open.</span>
      </div>
    </div>
  );
}

/**
 * @param {{ person: { accountId: string, name: string } | null }} props
 *   TeamPage gives each person their own key, so this component starts fresh for each.
 */
export default function CatchUp({ person }) {
  const titleId = useId();
  return (
    <section className="pane" aria-live="polite" aria-labelledby={titleId}>
      {person ? <PersonHeader name={person.name} titleId={titleId} /> : <PickSomeone titleId={titleId} />}
    </section>
  );
}
