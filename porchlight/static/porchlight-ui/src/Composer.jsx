// The note box: type a note, see the character count, and save it.
//
// Checks happen here first, so the person gets an answer without waiting on the network.
// The resolver checks again (src/resolvers/notes.js), because a browser can be tampered with.
import { useRef, useState } from 'react';
import { MAX_NOTE_LENGTH, noteLength, validateNoteBody } from '@lib/validate.js';
import { formatNumber } from './format.js';
import { Glyph } from './Glyph.jsx';

const HELP_TEXT = 'Anyone on the team can read this.';

/** The words a person sees for each error code from validateNoteBody. */
function messageFor(check) {
  if (check.error === 'empty') return 'Write something first.';
  if (check.error === 'too_long') {
    return `Notes can be up to ${formatNumber(MAX_NOTE_LENGTH)} characters. This one is ${formatNumber(check.length)}.`;
  }
  return null;
}

/**
 * @param {{
 *   authorName: string | null,
 *   onSave: (body: string, clientKey: string) => Promise<{ ok: boolean, error?: string, length?: number }>
 * }} props
 *   onSave resolves with the resolver's answer, or rejects when the save failed.
 */
export default function Composer({ authorName, onSave }) {
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const boxRef = useRef(null);

  // The client key for the note in the box (decision D13). It is made on the first Save
  // and kept until a save works, so "Save" after a failure resends the SAME key and the
  // server can never store the note twice. Editing the text makes it a different note,
  // so it drops the key and the next Save gets a fresh one.
  const clientKey = useRef(null);

  function handleChange(event) {
    const value = event.target.value;
    setText(value);
    clientKey.current = null;

    // Warn as soon as the note is too long, and clear the warning once it fits again.
    const check = validateNoteBody(value);
    if (check.error === 'too_long') {
      setFieldError(messageFor(check));
    } else if (fieldError) {
      setFieldError(null);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setSaveFailed(false);

    const check = validateNoteBody(text);
    if (!check.ok) {
      setFieldError(messageFor(check));
      boxRef.current?.focus();
      return;
    }

    clientKey.current ??= crypto.randomUUID();
    setSaving(true);
    try {
      const result = await onSave(check.body, clientKey.current);
      if (result?.ok) {
        setText('');
        setFieldError(null);
        clientKey.current = null;
      } else if (messageFor(result ?? {})) {
        setFieldError(messageFor(result)); // the server's own check disagreed with ours
      } else {
        setSaveFailed(true);
      }
    } catch {
      // Database down, network gone, or Forge refused: the text stays in the box.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit} noValidate>
      <div className={fieldError ? 'pl-field pl-field--error' : 'pl-field'}>
        <label className="pl-field__label" htmlFor="note">Note for the next person</label>
        <textarea
          ref={boxRef}
          className="pl-textarea"
          id="note"
          value={text}
          onChange={handleChange}
          aria-describedby="note-help"
          aria-invalid={fieldError ? 'true' : 'false'}
          placeholder="What should the next person know?"
        />
        <span className="pl-field__help" id="note-help">
          <span>{fieldError ?? HELP_TEXT}</span>
          <span>{formatNumber(noteLength(text))} / {formatNumber(MAX_NOTE_LENGTH)}</span>
        </span>
      </div>

      {saveFailed && (
        <div className="pl-message pl-message--error" role="alert">
          <Glyph name="gap" />
          <p><strong>Couldn&apos;t save your note.</strong> Try again. Your text is still in the box.</p>
        </div>
      )}

      <div className="composer__foot">
        <span className="pl-meta">Saved as <strong>{authorName ?? 'you'}</strong></span>
        <button className="pl-btn pl-btn--primary" type="submit" disabled={saving}>
          {saving ? <span className="pl-spinner" aria-hidden="true" /> : <Glyph name="lamp" lit />}
          <span>{saving ? 'Saving' : 'Save note'}</span>
        </button>
      </div>
    </form>
  );
}
