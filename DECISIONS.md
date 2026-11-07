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

## D16 · 2026-11-07 · A team list kept in Porchlight

Why: the catch-up view, and later the street and porch-status, need a stable list of teammates that works on the judges' site with no setup; anyone who can open Porchlight adds or removes people from a Jira user search, and each entry shows who added it.
Rejected: Atlassian Teams (nobody has checked that a Forge app can read Teams as the viewer), a user search each time (nothing kept for the street or status), a Jira-admin-only list (a dead end for ordinary users of a demo team).
Source: docs/specs/catch-up-view.md
Status: active

## D17 · 2026-11-07 · The 3D street is its own slice, after handover-interview

Why: a lit window means captured knowledge (D7), and nothing is captured before handover-interview, so a street in catch-up-view would show only dark windows; the street stays the signature, and opening a house will open the catch-up panel built here.
Rejected: the street in catch-up-view with every window dark (flat in video moment 1, and about twice the slice), windows lit by recent Jira activity (goes against D7, and comes close to watching people).
Source: docs/specs/catch-up-view.md
Status: active

## D18 · 2026-11-07 · The catch-up panel reads only Jira, with fixed rules for each section

Why: every line must link to its source ticket (the shape's rule from the evidence), and the rules must work on any Jira site: blockers are flagged tickets or "is blocked by" links to unfinished tickets; next steps are To Do tickets by due date, then priority; latest changes are the person's own status moves and comments in the last 14 days, which covers a two-week leave.
Rejected: a status named "Blocked" (depends on each project's workflow), flagged only (misses blocking links), To Do in the active sprint only (misses Kanban and business projects), next steps the person types (empty until written; that is handover-interview's job), 7 days of changes (a two-week leave loses its first week), changes made by anyone (too much noise), the skeleton's notes in the panel (they have no ticket link).
Source: docs/specs/catch-up-view.md
Status: active

## D19 · 2026-11-07 · Catch-up view in two panes, with a selected-row look in the design system

Why: a ticket row needs room for the key, the title, the status and a date, and a person covering for a teammate switches between people often; two panes keep the list and the catch-up side by side, and `.pl-row.is-selected` shows whose catch-up is open, in neutral, because open is not captured.
Rejected: the team list with the street's 400px side panel over it (titles get cut off, and the panel must close to pick someone else), no selected look (the list does not show where you are).
Source: docs/specs/catch-up-view.md
Status: active

## D20 · 2026-11-07 · Move between Team and Notes through Jira's sidebar

Why: Jira already draws a menu for an app's subpages, so Porchlight > Team and Porchlight > Notes look native and need nothing new in the design system.
Rejected: tabs inside the page (a new design-system piece for two links), notes under the team on one long page (a long catch-up pushes the notes far down).
Source: docs/specs/catch-up-view.md
Status: active

## D21 · 2026-11-07 · Read tickets in the page as the viewer, never store them

Why: Jira's permissions must hide tickets the viewer cannot open (scenario 3), and `requestJira` from the page runs as the viewer with no extra code; storing tickets would copy data that goes stale and that some viewers must not see.
Rejected: reading through a resolver with `asUser()` (an extra hop and the `@forge/api` package for the same answer), caching tickets in Forge SQL (stale, and a permission leak between viewers).
Source: docs/specs/catch-up-view.md
Status: active

## D22 · 2026-11-07 · One open-work search feeds open work, blockers and next steps

Why: the 100 most recently updated open tickets, with their links and the Flagged field, hold everything three sections need, in one request; JQL for flags and link types depends on per-site field names.
Rejected: one JQL search per section (three requests per catch-up, and `issueLinkType` or `Flagged` clauses that differ between sites).
Source: docs/specs/catch-up-view.md
Status: active

## D23 · 2026-11-07 · Latest changes come from one search with each ticket's history and comments

Why: the /poc proved that `search/jql` with `expand: "changelog"` and the `comment` field returns status moves and comments with their authors and times, so a person's 14 days cost one request; a clipped ticket is detected by `total` and topped up on its own.
Rejected: one changelog and one comment request per ticket (up to 40 requests per catch-up for the same data).
Source: docs/specs/catch-up-view.md
Status: active

## D24 · 2026-11-07 · Only the person sets their porch light, and setting Leaving announces it

Why: a porch light is the person's own signal (D9), and the brief says Porchlight must never feel like surveillance; a resignation may be confidential, so the person picks the moment by choosing when to set Leaving, and the form warns that everyone will see it.
Rejected: anyone on the team sets anyone's status (open to misuse), a Jira admin can set it (a second path and a permission check), a hidden Leaving with a separate announce date (a hidden state that can leak), Leaving seen only by a team lead (needs a lead concept that pass-it-on owns).
Source: docs/specs/porch-status.md
Status: active

## D25 · 2026-11-07 · Your porch light is a card at the top of the Team column

Why: the person sets their own status (D24), so the control belongs beside the team list where they look for others; a card opens its form in place without moving the page, and the same lamp then shows on their row and catch-up.
Rejected: a compact control in the page header (its open form pushed the title down, and the off state was too small to read).
Source: docs/specs/porch-status.md
Status: active
