// The Porchlight page: header, note box, and the list of notes.
//
//   load:  listNotes + who am I  →  author names (one Jira request)  →  show the list
//   save:  Composer → saveNote   →  new note at the top, warming   →  toast
import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import Composer from './Composer.jsx';
import NoteList, { LoadingNotes } from './NoteList.jsx';
import Toast from './Toast.jsx';
import { Glyph } from './Glyph.jsx';

const unique = (values) => [...new Set(values)];

export default function NotesPage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [notes, setNotes] = useState([]);
  const [names, setNames] = useState({}); // accountId → display name
  const [me, setMe] = useState(null);
  const [freshId, setFreshId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Ignore answers that arrive after the page has gone away.
    let cancelled = false;

    async function load() {
      // Notes and "who am I" in parallel. A failed name lookup never hides the notes.
      const [notesResult, meResult] = await Promise.allSettled([api.fetchNotes(), api.fetchMyself()]);
      if (cancelled) return;

      const known = {};
      if (meResult.status === 'fulfilled') {
        setMe(meResult.value);
        known[meResult.value.accountId] = meResult.value.displayName;
      }
      if (notesResult.status === 'rejected') {
        setStatus('error');
        return;
      }

      const loaded = notesResult.value;
      const missing = unique(loaded.map((n) => n.authorAccountId)).filter((id) => !known[id]);
      try {
        Object.assign(known, await api.fetchDisplayNames(missing));
      } catch {
        // Names are a nicety. Without them, cards say "A teammate".
      }
      if (cancelled) return;

      setNames(known);
      setNotes(loaded);
      setStatus('ready');
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Called by the Composer. Returns the resolver's answer so the Composer can show
  // field errors; a thrown error (save failed) passes straight through to it.
  const handleSave = useCallback(async (body, clientKey) => {
    const result = await api.saveNote({ body, clientKey });
    if (result?.ok) {
      // Drop any copy of the same note first, so a retried save never lists it twice.
      setNotes((previous) => [result.note, ...previous.filter((n) => n.id !== result.note.id)]);
      setFreshId(result.note.id);
      setStatus('ready');
      setToast({ id: result.note.id, text: "Note saved. The light's on." });
    }
    return result;
  }, []);

  const count = notes.length;
  return (
    <>
      <main className="frame">
        <header className="pl-page-header">
          <div>
            <h1 className="title"><Glyph name="lamp" lit size="md" />Porchlight</h1>
            <p>Leave a note for the next person. Everyone on the team can read it.</p>
          </div>
        </header>

        <Composer authorName={me?.displayName ?? null} onSave={handleSave} />

        <section className="list" aria-labelledby="list-title">
          <div className="list__head">
            <h2 id="list-title">Notes</h2>
            {status === 'ready' && count > 0 && (
              <span className="pl-meta">{count} {count === 1 ? 'note' : 'notes'} · newest first</span>
            )}
          </div>
          <div className="list" aria-live="polite">
            {status === 'loading' && <LoadingNotes />}
            {status === 'error' && (
              <div className="pl-message pl-message--error" role="alert">
                <Glyph name="gap" />
                <p><strong>Couldn&apos;t load notes.</strong> Reload the page to try again.</p>
              </div>
            )}
            {status === 'ready' && <NoteList notes={notes} names={names} freshId={freshId} />}
          </div>
        </section>
      </main>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}
