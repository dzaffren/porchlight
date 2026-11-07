// The one rule for a note's text. Both sides use this file:
//  - the page (static/porchlight-ui) imports it to show errors before sending, and
//  - the saveNote resolver runs it again, because anything sent from a browser can be changed.
// Keeping one copy means the page and the server can never disagree about what is valid.

// The longest note we accept, in characters (scenario 4 in docs/specs/skeleton.md).
export const MAX_NOTE_LENGTH = 2000;

/**
 * Count characters the way a person sees them.
 * JavaScript's string.length counts UTF-16 code units, so one emoji can count as 2.
 * Array.from() splits a string into code points, which matches what the person typed.
 *
 * @param {string} text
 * @returns {number}
 */
export function noteLength(text) {
  return Array.from(text).length;
}

/**
 * Check a note before it is saved.
 *
 * Rule: trim spaces and line breaks from both ends, then the note must have
 * 1 to MAX_NOTE_LENGTH characters.
 *
 * @param {unknown} raw - whatever was typed (or sent). It is untrusted, so it may not even be a string.
 * @returns {{ ok: true, body: string }
 *         | { ok: false, error: 'empty' }
 *         | { ok: false, error: 'too_long', length: number }}
 *   On success, `body` is the trimmed text to store. On failure, `error` is a short code;
 *   the page turns it into the words the person sees.
 */
export function validateNoteBody(raw) {
  // Anything that is not text counts as "nothing written".
  if (typeof raw !== 'string') {
    return { ok: false, error: 'empty' };
  }

  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: 'empty' };
  }

  const length = noteLength(body);
  if (length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'too_long', length };
  }

  return { ok: true, body };
}
