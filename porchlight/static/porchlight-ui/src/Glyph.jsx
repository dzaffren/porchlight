// One icon from the design system's sprite (docs/design/design-system/assets/icons.svg).
// <use href="#lamp"> points at a <symbol> that Sprite.jsx placed in the page once.

/**
 * @param {{ name: string, lit?: boolean, size?: 'sm' | 'md' }} props
 *   lit: the warm "captured" look, for the lantern on Save and in the header.
 */
export function Glyph({ name, lit = false, size = 'sm' }) {
  const classes = ['pl-glyph'];
  if (size === 'sm') classes.push('pl-glyph--sm');
  if (lit) classes.push('pl-glyph--lit');
  return (
    <svg className={classes.join(' ')} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
