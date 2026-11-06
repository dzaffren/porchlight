// Unit tests for the two resolvers the page calls: saveNote and listNotes.
// Scenarios 1, 3, 4 and 5 in docs/specs/skeleton.md, server side.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@forge/sql', () => import('./fake-forge-sql.js'));

const AISHA = '712020:aisha-rahman';
const DANIEL = '712020:daniel-tan';
const KEY_1 = '6f1c2a4e-1b7d-4c3e-9a51-2f8e0d4b7c11';
const KEY_2 = '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c62';

/** Build the request object Forge passes to a resolver: the page's payload plus a trusted context. */
const request = (accountId, payload = {}) => ({ payload, context: { accountId } });

async function load() {
  vi.resetModules();
  const { fake } = await import('@forge/sql');
  fake.reset();
  const resolvers = await import('../../src/resolvers/notes.js');
  return { fake, ...resolvers };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('saveNote', () => {
  it('saves a note and a teammate sees it in the list (scenario 1)', async () => {
    const { saveNote, listNotes } = await load();
    const text = 'Payments retry 3 times because the bank API times out under load.';

    const saved = await saveNote(request(AISHA, { body: text, clientKey: KEY_1 }));
    const daniel = await listNotes(request(DANIEL));

    expect(saved).toEqual({
      ok: true,
      note: { id: '1', body: text, authorAccountId: AISHA, createdAt: '2026-11-06T09:00:00.000Z' },
    });
    expect(daniel).toEqual({ ok: true, notes: [saved.note] });
  });

  it('works on a fresh install, before the hourly migration has run', async () => {
    const { fake, saveNote } = await load();
    expect(fake.tables.has('notes')).toBe(false);

    const saved = await saveNote(request(AISHA, { body: 'First note', clientKey: KEY_1 }));

    expect(saved.ok).toBe(true);
  });

  it('takes the author from Forge context, never from the payload', async () => {
    const { saveNote } = await load();

    const saved = await saveNote(request(AISHA, { body: 'Mine', clientKey: KEY_1, authorAccountId: DANIEL }));

    expect(saved.note.authorAccountId).toBe(AISHA);
  });

  it('stores the trimmed text', async () => {
    const { saveNote } = await load();

    const saved = await saveNote(request(AISHA, { body: '  Year-end batch job runs on 31 Dec at 23:00.\n', clientKey: KEY_1 }));

    expect(saved.note.body).toBe('Year-end batch job runs on 31 Dec at 23:00.');
  });

  it('passes the text as a parameter, never inside the SQL itself', async () => {
    const { fake, saveNote } = await load();
    const sneaky = "x'); DROP TABLE notes; --";

    await saveNote(request(AISHA, { body: sneaky, clientKey: KEY_1 }));

    const insert = fake.statements.find((s) => s.query.startsWith('INSERT INTO notes'));
    expect(insert.query).not.toContain(sneaky);
    expect(insert.params).toEqual([KEY_1, sneaky, AISHA]);
    expect(fake.tables.has('notes')).toBe(true);
  });

  it('logs the proof line with the new id', async () => {
    const { saveNote } = await load();

    await saveNote(request(AISHA, { body: 'Logged', clientKey: KEY_1 }));

    expect(console.log).toHaveBeenCalledWith('porchlight.note.saved id=1');
  });

  it('refuses an empty note and saves nothing (scenario 3)', async () => {
    const { fake, saveNote } = await load();

    const result = await saveNote(request(AISHA, { body: '    ', clientKey: KEY_1 }));

    expect(result).toEqual({ ok: false, error: 'empty' });
    expect(fake.notes).toHaveLength(0);
  });

  it('refuses 2,001 characters and saves nothing (scenario 4)', async () => {
    const { fake, saveNote } = await load();

    const result = await saveNote(request(AISHA, { body: 'a'.repeat(2001), clientKey: KEY_1 }));

    expect(result).toEqual({ ok: false, error: 'too_long', length: 2001 });
    expect(fake.notes).toHaveLength(0);
  });

  it('refuses a missing or malformed client key', async () => {
    const { fake, saveNote } = await load();

    expect(await saveNote(request(AISHA, { body: 'No key' }))).toEqual({ ok: false, error: 'bad_request' });
    expect(await saveNote(request(AISHA, { body: 'Bad key', clientKey: "1' OR '1'='1" }))).toEqual({ ok: false, error: 'bad_request' });
    expect(fake.notes).toHaveLength(0);
  });

  it('refuses a caller with no signed-in account', async () => {
    const { saveNote } = await load();

    await expect(saveNote(request(undefined, { body: 'Anon', clientKey: KEY_1 }))).rejects.toThrow(/signed-in/);
  });

  it('fails loudly when the database cannot be reached, so the page can say so (scenario 5)', async () => {
    const { fake, saveNote } = await load();
    fake.failWith = new Error('connection refused');

    await expect(saveNote(request(AISHA, { body: 'Year-end batch job runs on 31 Dec at 23:00.', clientKey: KEY_1 }))).rejects.toThrow();
  });

  it('lists the note once when a save is retried with the same key (scenario 5)', async () => {
    const { fake, saveNote, listNotes } = await load();
    const text = 'Year-end batch job runs on 31 Dec at 23:00.';

    // The first attempt reached the database, but imagine the reply was lost on the way back.
    const first = await saveNote(request(AISHA, { body: text, clientKey: KEY_1 }));
    const retry = await saveNote(request(AISHA, { body: text, clientKey: KEY_1 }));

    expect(retry).toEqual(first);
    expect(fake.notes).toHaveLength(1);
    expect((await listNotes(request(AISHA))).notes).toHaveLength(1);
  });

  it('keeps two genuinely identical notes when they have different keys', async () => {
    const { saveNote, listNotes } = await load();

    await saveNote(request(AISHA, { body: 'Same words', clientKey: KEY_1 }));
    await saveNote(request(AISHA, { body: 'Same words', clientKey: KEY_2 }));

    expect((await listNotes(request(AISHA))).notes).toHaveLength(2);
  });

  it("refuses to hand back someone else's note when their key is reused", async () => {
    const { saveNote } = await load();
    await saveNote(request(AISHA, { body: "Aisha's note", clientKey: KEY_1 }));

    await expect(saveNote(request(DANIEL, { body: "Daniel's note", clientKey: KEY_1 }))).rejects.toThrow(/client key/);
  });
});

describe('listNotes', () => {
  it('returns an empty list on a fresh install (scenario 2)', async () => {
    const { listNotes } = await load();

    expect(await listNotes(request(DANIEL))).toEqual({ ok: true, notes: [] });
  });

  it('returns notes newest first, from every author', async () => {
    const { fake, saveNote, listNotes } = await load();
    await saveNote(request(AISHA, { body: 'Older, by Aisha', clientKey: KEY_1 }));
    fake.tick(60);
    await saveNote(request(DANIEL, { body: 'Newer, by Daniel', clientKey: KEY_2 }));

    const { notes } = await listNotes(request(AISHA));

    expect(notes.map((n) => n.body)).toEqual(['Newer, by Daniel', 'Older, by Aisha']);
  });

  it('puts the later of two notes saved in the same second first', async () => {
    const { saveNote, listNotes } = await load();
    await saveNote(request(AISHA, { body: 'First', clientKey: KEY_1 }));
    await saveNote(request(AISHA, { body: 'Second', clientKey: KEY_2 }));

    const { notes } = await listNotes(request(AISHA));

    expect(notes.map((n) => n.body)).toEqual(['Second', 'First']);
  });

  it('asks the database for at most 100 notes', async () => {
    const { fake, listNotes } = await load();

    await listNotes(request(AISHA));

    const select = fake.statements.find((s) => s.query.includes('ORDER BY created_at DESC'));
    expect(select.params).toEqual([100]);
  });
});
