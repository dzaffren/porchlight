// Unit tests for the one note rule shared by the page and the resolver.
// Scenarios 3 (empty note) and 4 (over 2,000 characters) in docs/specs/skeleton.md.
import { describe, it, expect } from 'vitest';
import { validateNoteBody, MAX_NOTE_LENGTH, noteLength } from '../../src/lib/validate.js';

describe('validateNoteBody', () => {
  it('accepts a normal note and returns it trimmed', () => {
    const result = validateNoteBody('  Payments retry 3 times because the bank API times out under load.  ');
    expect(result).toEqual({
      ok: true,
      body: 'Payments retry 3 times because the bank API times out under load.',
    });
  });

  it('rejects an empty note', () => {
    expect(validateNoteBody('')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects a note of only spaces and line breaks', () => {
    expect(validateNoteBody('   \n\t  ')).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects anything that is not text', () => {
    expect(validateNoteBody(undefined)).toEqual({ ok: false, error: 'empty' });
    expect(validateNoteBody(42)).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts exactly 2,000 characters', () => {
    const result = validateNoteBody('a'.repeat(MAX_NOTE_LENGTH));
    expect(result.ok).toBe(true);
  });

  it('rejects 2,001 characters and says how long the note is', () => {
    expect(validateNoteBody('a'.repeat(2001))).toEqual({ ok: false, error: 'too_long', length: 2001 });
  });

  it('counts an emoji as one character, the way a person sees it', () => {
    // U+1F3E0 (a house emoji) is two UTF-16 code units, so its .length is 2 in JavaScript.
    const house = '\u{1F3E0}';
    expect(house.length).toBe(2);
    expect(noteLength(house)).toBe(1);
    expect(validateNoteBody(house.repeat(2000)).ok).toBe(true);
  });
});
