// The page's starting point. Vite bundles this file and everything it imports into dist/.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The one design system, straight from docs/design (decision D14). Vite bundles the
// CSS into a file in dist/, loaded by a <link> tag, so nothing is an inline style.
import '@ds/styles.css';
import './app.css';

import Sprite from './Sprite.jsx';
import NotesPage from './NotesPage.jsx';
import MotionSwitch from './MotionSwitch.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sprite />
    <NotesPage />
    <MotionSwitch />
  </StrictMode>,
);
