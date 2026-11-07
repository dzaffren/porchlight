// "Your porch light": the viewer's own card at the top of the Team column (decision D25).
// It is the only place a person changes their porch light, and only their own (D24).
//
//   card:  lamp + "Away until 20 Nov" (or "Here, porch light off") + Change
//   Change → a small form in place: Status (Here / Away until / Leaving on) + Date
//   Save  → check the date in the viewer's own day → onSave → the form closes
//   Left  → the card says "Left" and has no Change: Left is final
//
// Checks happen here first, so the person gets an answer without waiting on the network.
// The resolver checks again (src/resolvers/porch.js), because a browser can be tampered with.
import { useId, useState } from 'react';
import { MAX_DAYS_AHEAD, STATUS_DATE_MESSAGES, addDays, checkStatusDate, todayIn } from '@lib/porch.js';
import Presence from './Presence.jsx';
import { Glyph } from './Glyph.jsx';

/** The options in the Status select, in order: value → what the person reads. */
const KINDS = [
  ['here', 'Here'],
  ['away', 'Away until'],
  ['leaving', 'Leaving on'],
];

/** The help line under the fields, for each status. Leaving's tells them it is public (D24). */
const HELP = {
  here: 'Your porch light is off: teammates just ask you.',
  away: 'Your porch light turns off by itself after this date.',
  leaving: 'Everyone on the team will see this.',
};

/**
 * The words for a date the resolver or our own check refused. A browser's date input
 * gives either a real date or an empty value, so a "bad_date" here means no date was
 * picked; "Pick today or a later date." tells the person what to do.
 */
function dateMessage(error) {
  if (error === 'too_far') return STATUS_DATE_MESSAGES.too_far;
  if (error === 'past' || error === 'bad_date') return STATUS_DATE_MESSAGES.past;
  return null;
}

/** What the form starts with: the current choice, or Away with no date yet. */
function draftFrom(status) {
  if (status.kind === 'away' || status.kind === 'leaving') {
    return { kind: status.kind, date: status.untilDate };
  }
  return { kind: 'away', date: '' };
}

/**
 * The form that opens in place of the Change button.
 * @param {{ status, timeZone: string, onSave, onClose: () => void }} props
 */
function StatusForm({ status, timeZone, onSave, onClose }) {
  const kindId = useId();
  const dateId = useId();
  const helpId = useId();
  const [draft, setDraft] = useState(() => draftFrom(status));
  const [fieldError, setFieldError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // "Today" is the viewer's own day in their Jira time zone, so the browser's clock
  // setting does not matter (open item O4). The date input offers only today to a year on.
  const today = todayIn(timeZone, new Date());

  function update(change) {
    setDraft((previous) => ({ ...previous, ...change }));
    setFieldError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaveFailed(false);

    // Ask for "today" again: the form may have stayed open past midnight.
    const untilDate = draft.kind === 'here' ? null : draft.date;
    const check = checkStatusDate(draft.kind, untilDate, todayIn(timeZone, new Date()));
    if (!check.ok) {
      // Nothing is sent: the person sees why under the Date field.
      setFieldError(dateMessage(check.error));
      return;
    }

    setSaving(true);
    try {
      const result = await onSave({ kind: draft.kind, untilDate });
      if (result?.ok) {
        onClose();
        return;
      }
      // The server's own check disagreed with ours (its clock decides), or it refused.
      const message = dateMessage(result?.error);
      if (message) setFieldError(message);
      else setSaveFailed(true);
    } catch {
      // Database down, network gone, or Forge refused: the choice stays in the form.
      setSaveFailed(true);
    }
    setSaving(false);
  }

  const fieldClass = fieldError ? 'pl-field pl-field--error' : 'pl-field';
  return (
    <form className="mine-form" onSubmit={handleSubmit} noValidate>
      <div className="mine-fields">
        <div className="pl-field">
          <label className="pl-field__label" htmlFor={kindId}>Status</label>
          {/* The form replaces the Change button that had focus, so focus moves here. */}
          <select
            autoFocus
            className="pl-select"
            id={kindId}
            value={draft.kind}
            onChange={(event) => update({ kind: event.target.value })}
            aria-describedby={helpId}
          >
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {/* Here has no date, so its field is not shown at all. */}
        {draft.kind !== 'here' && (
          <div className={fieldClass}>
            <label className="pl-field__label" htmlFor={dateId}>Date</label>
            <input
              className="pl-input"
              type="date"
              id={dateId}
              value={draft.date}
              min={today}
              max={addDays(today, MAX_DAYS_AHEAD)}
              onChange={(event) => update({ date: event.target.value })}
              aria-describedby={helpId}
              aria-invalid={fieldError ? 'true' : 'false'}
            />
          </div>
        )}
      </div>
      <div className={fieldClass}>
        <span className="pl-field__help" id={helpId}>{fieldError ?? HELP[draft.kind]}</span>
      </div>

      {saveFailed && (
        <div className="pl-message pl-message--error" role="alert">
          <Glyph name="gap" />
          <p><strong>Couldn&apos;t save your porch light.</strong> Try again.</p>
        </div>
      )}

      <div className="mine-actions">
        <button className="pl-btn pl-btn--subtle" type="button" onClick={onClose}>Cancel</button>
        <button className="pl-btn pl-btn--primary" type="submit" disabled={saving}>
          {saving ? <span className="pl-spinner" aria-hidden="true" /> : <Glyph name="lamp" lit />}
          <span>Save</span>
        </button>
      </div>
    </form>
  );
}

/**
 * @param {{
 *   status: { kind: 'here' } | { kind: 'left' } | { kind: 'away' | 'leaving', untilDate: string },
 *   timeZone: string,
 *   onSave: (choice: { kind: string, untilDate: string | null }) => Promise<{ ok: boolean, error?: string }>,
 * }} props
 *   status: the viewer's own porch light right now, from effectiveStatus.
 *   timeZone: the viewer's Jira time zone; dates are checked in it before saving.
 *   onSave: resolves with the resolver's answer, or rejects when the save failed.
 */
export default function MyPorchLight({ status, timeZone, onSave }) {
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  // Left is final, so a person who has left gets no control and no form.
  const canChange = status.kind !== 'left';

  return (
    <section className="mine" aria-labelledby={titleId}>
      <div className="sec-head">
        <h2 id={titleId}>Your porch light</h2>
      </div>
      <div className="mine-now">
        <Presence status={status} showHere />
        {canChange && !editing && (
          <button className="pl-btn pl-btn--secondary" type="button" aria-expanded="false" onClick={() => setEditing(true)}>
            Change
          </button>
        )}
      </div>
      {canChange && editing && (
        <StatusForm status={status} timeZone={timeZone} onSave={onSave} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}
