// The Motion switch in the corner of the page.
//
// By default the page follows the computer's "reduce motion" setting. A viewer can
// choose full motion here; the design system's CSS reads data-motion="full" on <html>.
// The choice is remembered in this browser only.
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pl-motion';

function initialReduced() {
  // Storage can be blocked inside a sandboxed frame, so every read is guarded.
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return saved === 'reduced';
  } catch {
    // fall through to the system setting
  }
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default function MotionSwitch() {
  const [reduced, setReduced] = useState(initialReduced);

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [reduced]);

  function toggle() {
    const next = !reduced;
    setReduced(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'reduced' : 'full');
    } catch {
      // not remembered, which is fine
    }
  }

  return (
    <button className="pl-btn pl-btn--subtle pl-motion" type="button" aria-pressed={!reduced} onClick={toggle}>
      {reduced ? 'Motion: reduced' : 'Motion: full'}
    </button>
  );
}
