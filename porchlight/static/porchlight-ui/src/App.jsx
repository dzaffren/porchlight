// Picks the screen from the route (decision D20).
//
// manifest.yml gives the Porchlight global page two subpages, which Jira's sidebar shows
// as Porchlight > Team and Porchlight > Notes. Jira adds the subpage's route to the page
// address, and Forge's view.createHistory() lets the page read it and hear it change:
//
//   /notes        → NotesPage (the skeleton's page, unchanged)
//   /team, /, …   → TeamPage (the first page, and the answer for any unknown route)
import { useEffect, useState } from 'react';
import { view } from '@forge/bridge';
import NotesPage from './NotesPage.jsx';
import TeamPage from './TeamPage.jsx';

/** "/notes" and "/notes/" both mean the Notes page. */
const isNotes = (pathname) => pathname.replace(/\/+$/, '') === '/notes';

export default function App() {
  const [pathname, setPathname] = useState(null); // null until Forge says where we are

  useEffect(() => {
    let cancelled = false;
    let stopListening = () => {};

    view.createHistory().then(
      (history) => {
        if (cancelled) return;
        setPathname(history.location.pathname);
        // Called when the person picks the other subpage in Jira's sidebar.
        stopListening = history.listen(() => setPathname(history.location.pathname));
      },
      // Without a route (an older Forge, or no subpages yet), show the first page.
      () => { if (!cancelled) setPathname('/team'); },
    );

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  if (pathname === null) return null;
  return isNotes(pathname) ? <NotesPage /> : <TeamPage />;
}
