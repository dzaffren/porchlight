// The list of notes and its three other looks: loading, empty, and one note card.
//
// Security: every piece of text a person typed is rendered as a React text child
// ({note.body}). React sets it as plain text (like textContent), never as HTML,
// so a note containing <img onerror=...> just shows those characters.
import { useEffect, useState } from 'react';
import { formatWhen, initials } from './format.js';

// How long a newly saved note glows: warm up (600ms) plus three breaths, as in the
// design system's motion guideline. After this it rests like every other note.
const WARM_MS = 3600;

/** Three placeholder cards while the notes load. */
export function LoadingNotes() {
  const widths = ['line--70', 'line--90', 'line--55'];
  return (
    <>
      {widths.map((width) => (
        <div className="pl-card" aria-hidden="true" key={width}>
          <span className="pl-skeleton line--30" />
          <span className={`pl-skeleton ${width}`} />
        </div>
      ))}
      <span className="pl-meta" role="status">Loading notes…</span>
    </>
  );
}

/** First visit: a house at night with its porch light on, waiting. */
export function EmptyPorch() {
  return (
    <div className="pl-empty">
      <svg className="pl-empty__art" viewBox="0 0 320 200" aria-hidden="true">
        <use href="#porch-scene" />
      </svg>
      <p className="pl-empty__title">No notes yet</p>
      <p>Leave the first one for the next person.</p>
    </div>
  );
}

/**
 * One note: a lit card (captured, with its author as the source).
 * A note that was just saved warms up and breathes, then rests.
 */
export function NoteCard({ note, authorName, fresh }) {
  const [resting, setResting] = useState(!fresh);

  useEffect(() => {
    if (!fresh) return undefined;
    const timer = setTimeout(() => setResting(true), WARM_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  const state = resting ? 'pl-card--rest' : 'pl-card--lighting pl-warming';
  return (
    <article className={`pl-card pl-card--lit ${state}`}>
      <span className="pl-card__glow" aria-hidden="true" />
      <div className="pl-card__head">
        <span className="who">
          <span className="pl-avatar" aria-hidden="true">{initials(authorName)}</span>
          <h3 className="who__name">{authorName}</h3>
        </span>
        <time className="pl-meta" dateTime={note.createdAt}>{formatWhen(note.createdAt)}</time>
      </div>
      <p className="pl-card__body">{note.body}</p>
    </article>
  );
}

/**
 * @param {{ notes: Array, names: Record<string, string>, freshId: string | null }} props
 */
export default function NoteList({ notes, names, freshId }) {
  if (notes.length === 0) {
    return <EmptyPorch />;
  }
  return notes.map((note) => (
    <NoteCard
      key={note.id}
      note={note}
      authorName={names[note.authorAccountId] ?? 'A teammate'}
      fresh={note.id === freshId}
    />
  ));
}
