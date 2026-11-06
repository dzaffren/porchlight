# Porchlight: how to build with this design system

Porchlight is a Jira app that shows what each teammate knows and why. The visual idea is a street at night: knowledge that is captured is a **lit window** (warm amber), knowledge only one person holds is an **unlit window** (dark). This system is **CSS only**. There are no React components. Write plain HTML (or JSX with `className`) using the `pl-*` classes and the `--ds-*` / `--pl-*` tokens below.

## Setup

- Load `styles.css`. It imports `tokens/tokens.css`, so every token comes with it.
- **Dark only.** Never add a light theme. `body` is already set to `var(--ds-surface)` and `var(--ds-text)`.
- Icons are an SVG sprite at `assets/icons.svg`. Inline the sprite once in the page, then use `<svg class="pl-glyph"><use href="#lamp"/></svg>`. Icon ids: `lamp`, `window`, `house`, `ticket`, `pull-request`, `page`, `interview`, `handover`, `gap`. Add `pl-glyph--lit` to make the glowing part amber, `pl-glyph--sm` for inline size.

## Colour rules (these matter more than anything else)

- **Amber means captured and sourced.** Use `--pl-accent`, `--pl-glow`, `--pl-glow-soft`, `--pl-glow-halo` only for things that are captured, or for the one primary action.
- **Unlit means a gap.** Use `--pl-unlit` / `.pl-card--unlit` for knowledge not captured yet.
- **Red means an error. Nothing else.** `--ds-danger-*` only.
- **Status colours are for real ticket status only**: `.pl-lozenge--todo|progress|done|blocked`. Never as decoration.
- The porch light (`.pl-presence--away`, `.pl-tag--away`) means the person is **away or leaving**.

## Tokens (always `var(--name)`, never raw values)

| Family | Names |
| --- | --- |
| Surface | `--ds-surface`, `--ds-surface-sunken`, `--ds-surface-raised`, `--ds-surface-overlay` |
| Text | `--ds-text`, `--ds-text-strong`, `--ds-text-subtle`, `--ds-text-subtlest` |
| Border / focus | `--ds-border`, `--ds-border-bold`, `--ds-focus` |
| Space | `--ds-space-025` `050` `100` `150` `200` `300` `400` `600` |
| Radius | `--ds-radius-100`, `--ds-radius-200`, `--ds-radius-300`, `--ds-radius-round` |
| Type | `--ds-font-body`, `--ds-font-code`, `--ds-font-size-small|body|title|heading|display` with matching `--ds-line-*`, `--ds-weight-regular|medium|bold` |
| Motion | `--pl-dur-fast|base|slow|warm`, `--pl-ease-out`, `--pl-ease-warm`, `--pl-stagger` |

## Classes

| Piece | Classes |
| --- | --- |
| Page header | `.pl-page-header` with `h1` and `p` |
| Button | `.pl-btn` + `--primary` (amber, one per view), `--secondary`, `--subtle`; `.pl-spinner` inside for loading |
| Field | `.pl-field` > `.pl-field__label`, `.pl-input` / `.pl-textarea` / `.pl-select`, `.pl-field__help`; `.pl-field--error` |
| Knowledge card | `.pl-card` + `--lit` or `--unlit`; children `.pl-card__glow` (empty span, first), `.pl-card__head`, `.pl-card__title`, `.pl-card__body`, `.pl-card__sources` |
| Source chip | `.pl-chip` (a link to a ticket, PR, page or interview, with an icon) |
| List | `.pl-list` > `.pl-row`, `.pl-row__summary`; `.pl-list--stagger` to animate in |
| Status / meta | `.pl-lozenge--*`, `.pl-meta` (dates, counts), `.pl-key` (issue keys), `.pl-avatar` (`--lg`) |
| Person | `.pl-presence` > `.pl-presence__lamp`, `.pl-presence--away` |
| Side panel | `.pl-panel.is-open` > `.pl-panel__head` (`.pl-panel__who`, `.pl-panel__name`), `.pl-panel__body`, `.pl-panel__foot` |
| Feedback | `.pl-empty` (`__art`, `__title`), `.pl-message--error|info`, `.pl-toast` + `.pl-toast__lamp`, `.pl-skeleton` |

Read `styles.css` before styling anything new. The preview pages (`index.html`, `guidelines/*.html`) show every piece in use.

## Example

```html
<article class="pl-card pl-card--lit">
  <span class="pl-card__glow" aria-hidden="true"></span>
  <div class="pl-card__head">
    <p class="pl-card__title">Why the settlement file is checked twice</p>
    <span class="pl-meta">Captured 2 Nov</span>
  </div>
  <p class="pl-card__body">The bank sends a second file at 6pm that can correct the first.</p>
  <div class="pl-card__sources">
    <a class="pl-chip" href="#"><svg class="pl-glyph pl-glyph--sm" aria-hidden="true"><use href="#ticket"/></svg>PAY-131</a>
    <a class="pl-chip" href="#"><svg class="pl-glyph pl-glyph--sm" aria-hidden="true"><use href="#pull-request"/></svg>PR #322</a>
  </div>
</article>
```

For your own layout glue, use grid/flex with `gap: var(--ds-space-*)`. Respect `prefers-reduced-motion`; `styles.css` already turns its own animations off.

---

## Files

- `styles.css`: all primitives (imports `tokens/tokens.css`)
- `tokens/tokens.css`: every token
- `assets/icons.svg`: icon sprite
- `index.html`: preview of every primitive
- `street/index.html`: the street of windows, the one 3D piece
- `guidelines/`: one card per foundation (colours, type, spacing, motion, the light rule)
