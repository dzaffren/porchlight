// A short message at the bottom of the page, such as "Note saved. The light's on."
import { useEffect } from 'react';

const SHOW_MS = 3200;

/**
 * @param {{ toast: { id: string, text: string } | null, onDone: () => void }} props
 *   A new `id` restarts the timer, so two saves in a row each get their full time.
 */
export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, onDone]);

  return (
    <div className="toast-slot" aria-live="polite">
      {toast && (
        <div className="pl-toast" role="status" key={toast.id}>
          <span className="pl-toast__lamp" aria-hidden="true" />
          {toast.text}
        </div>
      )}
    </div>
  );
}
