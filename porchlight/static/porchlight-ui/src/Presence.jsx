// The porch light on screen: a small lamp and its words, from the design system's
// .pl-presence component.
//
//   lamp on  (Away, Leaving, Left) → read their work
//   lamp off (Here)                → just ask them (decision D9)
//
// Security: the words are built here from a fixed kind and a date. Nothing a person typed
// is ever shown (docs/specs/porch-status.md, "Security note for build").
import { formatCalendarDay } from './format.js';

/**
 * The words for a porch light that is on: "Away until 20 Nov", "Leaving on 31 Jan", "Left".
 * The toast after a save uses the same words, so the two never disagree.
 *
 * @param {{ kind: 'away' | 'leaving', untilDate: string } | { kind: 'left' }} status
 * @returns {string}
 */
export function statusText(status) {
  if (status.kind === 'away') return `Away until ${formatCalendarDay(status.untilDate)}`;
  if (status.kind === 'leaving') return `Leaving on ${formatCalendarDay(status.untilDate)}`;
  return 'Left';
}

/**
 * @param {{
 *   status: { kind: 'here' } | { kind: 'left' } | { kind: 'away' | 'leaving', untilDate: string },
 *   showHere?: boolean,
 * }} props
 *   status: what effectiveStatus in @lib/porch.js worked out for this person, right now.
 *   showHere: say "Here, porch light off" instead of showing nothing. Only the viewer's
 *   own card does this; a team row with nothing to say stays quiet.
 */
export default function Presence({ status, showHere = false }) {
  const on = status.kind !== 'here';
  if (!on && !showHere) {
    return null;
  }
  return (
    <span className={on ? 'pl-presence pl-presence--away' : 'pl-presence'}>
      <span className="pl-presence__lamp" aria-hidden="true" />
      {on ? statusText(status) : 'Here, porch light off'}
    </span>
  );
}
