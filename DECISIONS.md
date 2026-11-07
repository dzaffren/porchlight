# Decisions

Append-only. A changed decision is a new entry that supersedes the old one; only an
old entry's Status line ever changes.

## D1 · 2026-11-01 · Enter Codegeist in Software Teams

Why: the handover problem hits any project team of POs, devs and testers; nothing about it is specific to one industry.
Rejected: Specialized Industries with an audit framing (the core need is not finance-specific, and 2025's winner there, Compliant Workflows, already owns governance).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D2 · 2026-11-01 · Custom UI for the visual views

Why: the user wants the views to be visually wow, and UI Kit cannot draw free shapes such as maps or graphs.
Rejected: UI Kit only (looks native and is faster, but limited to boxes, tables and charts).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D3 · 2026-11-01 · Capture context from Atlassian sources plus an interview

Why: the user's context lives in Teams, SharePoint and email, and a live pull needs Microsoft OAuth and admin consent on the judges' site.
Rejected: live pull from Teams, SharePoint or email (install risk for judges; needs a spike first).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D4 · 2026-11-01 · A Jira global page, not a project page

Why: one person's work spans several Jira projects, so a handover view per project would split it.
Rejected: Jira project page (one brain per project; the earlier project-brain idea).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D5 · 2026-11-01 · No calls outside Forge

Why: keeps the "Runs on Atlassian" badge, and judges install without any keys or outside accounts.
Rejected: calling an outside LLM API from the backend (needs keys and egress, and loses the badge).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D6 · 2026-11-02 · "Lit window" visual direction

Why: the user wanted Window's calm, warm filled cards with Lamplight's glow; a lit card reads as "someone left the light on" and a gap as a dark window, never an alarm.
Rejected: Lamplight alone (glow on a plain card felt more decorative than calm), Filament (a thin line reads too cool for "warm"), Window alone (without the glow it lacks "alive").
Source: docs/design/system-brief.md
Status: active

## D7 · 2026-11-02 · Street of windows as the one tier-3 piece, with line-art assets and "warm up, then rest"

Why: the user asked for 3D, proper assets and illumination tied to the porch light; a street where each house is a teammate and each window one area of their work makes lit = captured and dark = gap readable at a glance; clicking a house flies the camera in and opens that person's work, which is the map catch-up-view needs.
Rejected: a single 3D porch lamp (cheaper, but carries no information), both lamp and street (two tier-3 pieces breaks the one-signature rule), soft filled or 3D-rendered illustrations (drift from "precise", heavy to theme), always-breathing or cursor light (competes with reading; hides lit = captured).
Source: docs/design/system-brief.md
Status: active

## D8 · 2026-11-02 · Dark only

Why: the user found light mode felt off for a porch light; light only means something at night, so Porchlight is a deliberately dark page even inside a light-themed Jira.
Rejected: light and dark both designed (the brief's first floor; the light theme diluted the core metaphor), following Jira's theme switch (same problem in light Jira).
Source: docs/design/system-brief.md
Status: active

## D9 · 2026-11-02 · The porch light means "away or leaving"

Why: the product is named Porchlight, so its lamp must carry meaning; a porch light left on for someone who is away or leaving makes "leave the light on for the next person" literal, and tells a teammate whether to read the lit windows or just ask the person.
Rejected: porch lights on at every house (pretty, but meaningless), porch on = "here" (inverts the tagline; a lit porch reads as "someone left this on for you").
Source: docs/design/system-brief.md
Status: active

## D10 · 2026-11-02 · Houses grow with every area a person owns, with no cap

Why: a person who owns 20 areas becomes a 10-storey building, and that height is the message: their departure leaves a big hole in the team's knowledge.
Rejected: capping a house at about 4 storeys with "+N more" on the name tag (tidier, but hides exactly the risk the street exists to show).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D11 · 2026-11-02 · A handover passes every area to a teammate, with the team lead's approval

Why: a resignation or move must hand everything to the team, not only capture it; the leaver knows who fits each area, the receiver must agree to take it, and the team lead confirms the load is fair. Areas left without an owner on the leaving date stay on the leaver's house, marked "unowned", so nothing is lost silently.
Rejected: the team lead assigns every area (loses the leaver's judgement), teammates claim areas themselves (some areas stay unclaimed), unowned areas move to the lead automatically (hides the gap).
Source: docs/specs/knowledge-handover/shape.md
Status: active

## D12 · 2026-11-02 · Look up author names from Jira when listing notes

Why: a note must show "Aisha Rahman", and a name stored at save time goes stale when someone renames themselves or leaves.
Rejected: storing the display name in the notes table at save time (stale names; stores more personal data than needed).
Source: docs/specs/skeleton.md
Status: active

## D13 · 2026-11-02 · A client key makes every save safe to retry

Why: scenario 5 needs a retried save to list the note once, even when the first request reached the database but the reply was lost.
Rejected: only disabling the Save button while saving (does not cover a lost reply), checking for an identical body from the same author (blocks two genuinely identical notes).
Source: docs/specs/skeleton.md
Status: active

## D14 · 2026-11-02 · The page imports the design system from docs/design, never a copy

Why: one design system per product; a copy inside the app would drift from the one the drift check and previews use.
Rejected: copying tokens and styles into `static/porchlight-ui/` (two sources of truth), publishing the design system as an npm package (overkill for one app).
Source: docs/specs/skeleton.md
Status: active

## D15 · 2026-11-02 · Keep Forge's strict style policy; no inline styles anywhere

Why: Custom UI blocks inline `style` attributes by default, and the design system's sprite and porch scene used them; moving them into classes keeps the app's security policy strict.
Rejected: adding `permissions.content.styles: unsafe-inline` (loosens the policy for the whole app, and developers report it does not cover every case).
Source: docs/specs/skeleton.md
Status: active
