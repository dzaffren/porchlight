# Porchlight · design system brief

**Status:** Approved · **Updated:** 2026-11-02 by /design-system

Porchlight's one design system. Every slice assembles from it; no slice has its own.

## Who and where (from the shape)

- **Users:** project teams of POs, devs and testers, from `docs/specs/knowledge-handover/shape.md`.
- **When:** someone is away, leaving or long gone, and a person needs to understand their work fast.
- **Where:** a desktop browser, inside Jira's frame, as a Custom UI global page (D2, D4). Jira switches light and dark.
- **Density:** medium. A few people's work at a time, with sources, not 200-row tables.

## Answers (2026-11-02)

| Question | Answer |
| --- | --- |
| Foundation | Atlassian design tokens as the base, plus Porchlight's own warm accent and signature visual (resolves shape O14) |
| Must feel | warm, precise, alive |
| Must never feel | surveillance, cold, cluttered, corporate, robotic, loud, gloomy, chaotic, generic |
| References | Linear (density and restraint with colour) · Stripe Docs (clarity, progressive disclosure, sources) · Things 3 (warmth and calm spacing) · three.js examples (the one signature moment) |
| Locked constraints | None. New product: no logo, colours or fonts exist yet |
| Motion ceiling | Tier 3: one signature piece |
| Floors | WCAG AA · **dark only** (D8, replaces "light and dark both designed") · desktop Chrome, Edge, Firefox, Safari · left-to-right only |

## Token trace

Each token comes from an answer. A token with no line here does not exist.

```
foundation: Atlassian base          → neutrals, text, surfaces, elevation, spacing, radius, type
                                      come from @atlaskit/tokens (exact values read at build);
                                      Porchlight follows Jira's light/dark switch automatically
"warm" + name "Porchlight"          → ONE accent: porch amber
                                      --pl-accent       text/interactive  (light #A1520A, dark #F5B544)
                                      --pl-glow         decorative light  (#F59E0B), never for text
                                      --pl-glow-soft    --pl-glow at 12–18% alpha, backgrounds only
"precise" + Stripe sources          → every claim carries a source chip: ticket key, PR, page or interview
                                      ticket keys and dates in the Atlassian code font, tabular figures
Linear restraint + "never loud"     → amber is the only accent; it MEANS "knowledge that is captured and sourced"
                                      status colours only from Atlassian semantic tokens, only for real status
"never gloomy / never surveillance" → a gap is an UNLIT element (neutral, dim), never red
                                      red (Atlassian danger) is for errors only
                                      no minute-by-minute activity feed of a person
Linear density, medium              → 14px body (Atlassian body), 8px spacing grid, list rows 36px
Things 3 warmth + calm              → cards breathe: inner padding space.200–space.300 (16–24px)
                                      the signature canvas area gets a warm surface tint (--pl-glow-soft);
                                      Jira-like chrome stays Atlassian-neutral so it looks native
Stripe progressive disclosure       → summary first, evidence one click away; never a wall of text
"alive" + motion ceiling tier 3     → tier 1 everywhere: --pl-dur-fast 140ms, --pl-dur-base 200ms,
                                      --pl-dur-slow 320ms, --pl-ease-out cubic-bezier(0.2, 0, 0, 1)
                                      tier 2 for "lighting up": captured items fade/scale in, staggered 40ms
                                      tier 3 for ONE signature piece only (three.js); its budget is written
                                      in the slice spec that uses it, never here
floors: AA, light + dark            → --pl-accent passes 4.5:1 on Atlassian surfaces in both themes
                                      (checked at pause B); glow never carries meaning alone
                                      prefers-reduced-motion: no movement, glow becomes a static fill
"never generic"                     → banned: the generated-UI tells in craft.md, emoji, more than one accent,
                                      gradient heroes, blur on surfaces
icons                               → Atlassian icons (@atlaskit/icon) for native chrome; no emoji
```

## What it commits to, in one line each

- Looks native in Jira, and is recognisably Porchlight by one thing: the amber light.
- Amber means "known and sourced". Unlit means "not captured yet". Red means "something broke".
- Every answer shows where it came from.
- Motion makes knowledge feel present; it never decorates.

## Pause B result

- Amber values checked: `#A1520A` on white 5.6:1, on sunken 5.3:1; `#F5B544` on dark surface 8.9:1, on dark raised 8.3:1. All pass AA. Re-check against real `@atlaskit/tokens` values at build.
- Direction: **Lit window** (D6). A lit card is a warm, filled window with a soft glow; a gap is a dark window.

## Pause C additions (2026-11-02)

The user asked for animation, proper assets, illumination that ties back to the porch light, and 3D.

```
"3D" + earlier "whole project as a map"  → ONE tier-3 piece: the street of windows (catch-up-view's map)
                                           each house = a teammate · each window = one area of their work
                                           lit window = captured · dark window = gap · every porch light is on
"proper assets" + "precise"              → our own line-art icon set (24 grid, 1.5px stroke) and scenes
                                           (porch, doorway, street); lit parts take --pl-glow
"alive" but "never loud"                 → "warm up, then rest": dark → amber in 600ms, breathe ×3 (1s each),
                                           then rest; light then runs to each source chip, 120ms apart
```

### Tier 3 budget: the street of windows

| Budget line | Commitment |
| --- | --- |
| Size | three.js, its bloom post-processing and the scene ≤ 200 kB gzipped, bundled by Vite (the CDN import is for the local preview only) |
| Frame rate | 60 fps target on a 2020-class laptop with integrated graphics at 1080p; never below 30 fps. Pixel ratio capped at 2, one porch light per teammate |
| Narrow screens | The 2D SVG street (same layout). Porchlight is a desktop product (brief floors) |
| Reduced motion | No camera drift; captured windows are lit at once, with no warm-up or breathing |
| No WebGL | The 2D SVG street stays |
| Loading | Lazy-loaded after the list of work renders; until then the 2D street shows, then cross-fades |
| Unproven | WebGL and three.js inside Forge's Custom UI frame and its content security policy. Needs a /poc in catch-up-view |

## Files

- `docs/design/design-system/tokens/tokens.css` — every token
- `docs/design/design-system/styles.css` — the primitives and illumination
- `docs/design/design-system/assets/icons.svg` — the icon set
- `docs/design/design-system/street/index.html` — the tier-3 prototype
- `docs/design/design-system/index.html` — the preview of everything

## Pause C revision (2026-11-02)

The user's feedback: light mode felt off for a porch light; the street felt empty; clicking a house should zoom and centre it; the result should look like a product on the market.

```
"light mode feels off"            → dark only (D8). Inside a light Jira, Porchlight is a dark page on purpose:
                                    a window into the night. Tokens hold one set of values.
"the street feels empty"          → moon and stars, road and pavement, fences, trees, street lamps between houses,
                                    porches with steps, chimneys, framed windows, fireflies near the houses
"zoom and centre the clicked house" → a curved camera move (1.3–2.6s, longer for farther houses): it pans along
                                    the road, then turns in; between neighbours it arcs out over the road and back.
                                    Smootherstep easing, the look leads the move, a slight lens push (34° → 30°).
                                    House framed left of centre; the panel opens as the camera settles,
                                    side panel (new primitive) slides in with that person's work areas;
                                    Esc or "Back to street" flies out. Arrow keys + Enter, and the dock, do the same
"high value, market quality"      → bloom post-processing, film tone mapping (ACES), soft moon shadows, vignette,
                                    name tags over houses, a teammate dock with window meters
```

New primitives added to the system (not one-offs): side panel (`.pl-panel`), window meter (`.pl-meter`),
name tag (`.pl-tag`), large avatar, keyboard hint (`.pl-kbd`).

Demo link: `street/index.html?visit=0` opens a teammate's house directly.

## The porch light means presence (2026-11-02)

The user pointed out that the product is called Porchlight but the porch lights carried no meaning.

```
porch light ON   → this person is away or leaving; their lit windows are the knowledge they left for you
porch light OFF  → they're here; just ask them
```

This makes the tagline literal: *leave the light on for the next person.* It shows in three places, always together:
the 3D porch lamp (with a warm pool of light on the path), the name tag, and the dock and panel (`.pl-presence`).
Amber still means one thing: light left for you, whether a captured window or a porch lamp left on.

The scene was also brightened (lighter walls, trim, roofs and ground; more moon and sky light) so the houses read,
not only the windows.
