// Puts the design system's icon sprite into the page once, so every <use href="#lamp">
// finds its symbol. Vite reads the SVG file as text at build time (the ?raw import),
// so there is no runtime fetch and no copy of the file (decision D14).
//
// dangerouslySetInnerHTML is safe here: the content is our own file from the repo,
// fixed at build time. It never contains anything a person typed.
import sprite from '@ds/assets/icons.svg?raw';

export default function Sprite() {
  return <div className="pl-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />;
}
