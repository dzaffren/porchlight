# Porchlight design system

Porchlight's one design system. Every slice assembles from it; no slice has its own.

- **Base:** Atlassian design tokens (`--ds-*`), so it looks native in Jira and follows its light/dark switch.
- **One accent:** porch amber (`--pl-*`). Amber means captured and sourced. An unlit window is a gap. Red is an error only.
- **Direction:** "Lit window" (D6): a lit card is a warm, filled window with a soft glow.
- **Motion:** tier 1 everywhere, tier 2 for lighting up, one tier 3 piece budgeted in its slice.
- **Floors:** WCAG AA in light and dark, reduced motion honoured, keyboard reachable, desktop browsers.

Files: `tokens/tokens.css` (every token) · `styles.css` (primitives) · `index.html` (preview) · `guidelines/` (one card per foundation).

The reasons behind every token: `../system-brief.md`.
