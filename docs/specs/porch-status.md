# Porch status

**Version:** v1 · **Status:** Draft · **Type:** Feature · **Project type:** Web UI

**Shape doc:** docs/specs/knowledge-handover/shape.md
**Depends on:** catch-up-view

Each person can turn on their own porch light: Away until a date, or Leaving on a date. Everyone sees it on the team list and in the catch-up, and it turns into Left after the leaving date or when Jira deactivates the account. It tells a teammate whether to read someone's work or just ask them, which is what the porch light means (D9).

## Problem

catch-up-view shows a teammate's work, but not whether that teammate is here. Daniel cannot tell whether he should message Aisha or read her catch-up, so he still messages her on holiday. On the user's team someone is on leave about once a month, and each time costs at least half a day. The porch light is Porchlight's one signal for this, and today it means nothing.

## Slice test

| Check                         | Result |
| ----------------------------- | ------ |
| Cuts every layer it needs     | Yes. A status control and the porch light on the Team page, resolvers, a statuses table in Forge SQL, and Jira's account state read as the viewer. |
| One e2e test walks it         | Yes. Set Away until a date, see the porch light on your row and in your catch-up, set Here again. |
| Worth shipping alone          | Yes. Daniel sees that Aisha is away until 20 Nov and reads her catch-up instead of messaging her. |
| Fits (≤5 scenarios, ≤2 areas) | Yes. 5 scenarios, 2 areas: the status store and the porch light on screen. |

**Path:** full. The slice adds new stored data and changes two screens.

## User story

As a member of a project team, I want to leave my porch light on when I am away or leaving, so that my teammates read my work instead of messaging me.

## Flow

```mermaid
flowchart LR
    A((Aisha Rahman)) -- "Team → her porch light" --> S["Away until 20 Nov"]
    S -- "today to one year ahead?" --> V{valid date}
    V -- no --> E["'Pick today or a later date.'<br/>or 'Pick a date within a year.'"]
    V -- yes --> DB[(porch_statuses)]
    DB -- "everyone sees" --> T["Team list and catch-up:<br/>porch light on, 'Away until 20 Nov'"]
    D((Daniel Tan)) -- "opens Porchlight" --> T
    J["Jira, as the viewer:<br/>account active?"] -- "active: false" --> L["Left, porch light stays on"]
```

Aisha sets her own porch light to Away until 20 Nov. A date from today up to a year ahead is saved, and everyone then sees her porch light on. A Leaving date that has passed, or an account that Jira reports as deactivated, shows as Left.

## States

```mermaid
stateDiagram-v2
    [*] --> Here
    Here --> Away: person sets "away until {date}"
    Away --> Here: end of that date in the person's Jira time zone, or the person sets Here
    Away --> Away: person picks a new date
    Here --> Leaving: person sets "leaving on {date}"
    Leaving --> Here: person sets Here before the date
    Leaving --> Left: end of the leaving date, in the person's Jira time zone
    Here --> Left: Jira reports the account with active false
    Away --> Left: Jira reports the account with active false
    Leaving --> Left: Jira reports the account with active false
    Left --> [*]
```

A person moves between Here, Away and Leaving themselves. Away ends on its own at the end of its date. Left comes only from a passed leaving date or a deactivated account, and nobody can undo it.

| Status | Porch light | Text | How it is set | How it ends |
| --- | --- | --- | --- | --- |
| Here | Off | — | The default, or the person sets it | — |
| Away until {date} | On | "Away until 20 Nov" | The person | End of that date in their Jira time zone, or they set Here |
| Leaving on {date} | On | "Leaving on 31 Jan" | The person; everyone sees it from that moment | Becomes Left at the end of that date |
| Left | On, and stays on | "Left" | A passed leaving date, or Jira reports `active: false` | Never |

## Acceptance criteria

The site is `handover-demo.atlassian.net`, with a made-up team (shape O10). Today is 7 November 2026. Aisha Rahman, Daniel Tan, Ravi Kumar and Mei Ling Goh are on the team list.

```gherkin
Scenario: Leave the porch light on while away
  Given Aisha Rahman's porch light is off
  When Aisha sets her porch light to "Away until 20 Nov 2026"
  Then her row on the team list shows the porch light on and "Away until 20 Nov"
  And Daniel Tan sees the same on her row and at the top of her catch-up
  And Daniel has no control to change Aisha's porch light

Scenario: Away ends by itself, or earlier when the person is back
  Given Aisha Rahman is "Away until 20 Nov 2026", and her Jira time zone is Asia/Kuala_Lumpur
  When it is 21 Nov 2026 00:00 in Kuala Lumpur
  Then her porch light is off and her row shows no status
  And if Aisha sets her porch light to Here on 18 Nov, it is off from that moment

Scenario: Leaving becomes Left after the leaving date
  Given Ravi Kumar sets his porch light to "Leaving on 31 Jan 2027"
  And the form told him "Everyone on the team will see this."
  When Daniel Tan opens Porchlight on 10 Nov 2026
  Then Ravi's row shows the porch light on and "Leaving on 31 Jan"
  And from 1 Feb 2027 in Ravi's time zone his row shows "Left", with the porch light on
  And nobody can change Ravi's porch light after that

Scenario: An account Jira deactivates shows as Left
  Given Mei Ling Goh's porch light is off
  And Jira reports her account with active false
  When Daniel Tan opens Porchlight
  Then Mei Ling's row shows "Left", with the porch light on
  And if Jira leaves her out of its answer instead, her row keeps her last status, never a wrong "Left"

Scenario: A date outside today to one year ahead is not saved
  Given Aisha Rahman is setting her porch light
  When she picks "Away until 2 Nov 2026"
  Then she sees "Pick today or a later date." and nothing is saved
  And when she picks "Leaving on 10 Dec 2027", she sees "Pick a date within a year." and nothing is saved
```

## Scope

**In:**

- One porch light per person, stored in Porchlight: Here, Away until a date, or Leaving on a date. Only the person can set their own (O1).
- Dates from today up to one year ahead, in the person's own day.
- Away ends at the end of its date in the person's Jira time zone. Leaving becomes Left at the end of its date.
- Left also when Jira reports the account with `active: false`. Left is final.
- A person can change Away or Leaving, or set Here, any time before Left.
- The porch light shows on each team-list row and at the top of the catch-up, with its text.
- "Everyone on the team will see this." on the form before saving Leaving (O2).

**Out:**

- The porch lamp on the 3D street and its name tags. → street (3c)
- Setting Away automatically from an out-of-office calendar. → away-from-calendar, a new slice (O7)
- A handover interview setting Leaving. → handover-interview
- A team lead setting someone's status, or seeing Leaving before others. → no slice; the person controls it (O1, O2)
- Notifications when someone's porch light changes. → no slice yet
- Inferring presence from Jira activity. → never (shape: "Never")

## Interface

Two changes to the Team page, both built from the design system.

```mermaid
flowchart LR
    C["Your porch light card<br/>(top of the Team column)<br/>lamp + 'Away until 20 Nov' + Change"] -- "Change" --> F["Form: Status (Here / Away until / Leaving on) + Date"]
    F -- "Leaving picked" --> W["'Everyone on the team will see this.'"]
    F -- "date before today / over a year" --> E["Field error under Date"]
    F -- "Save" --> T["Toast: 'Your porch light is on: Away until 20 Nov.'<br/>card, row and catch-up show the lamp"]
    F -- "Cancel" --> C
    R["Each team row: name, then the lamp + status text on its own line"] --- H["Catch-up header: the lamp + status under the name"]
```

Your own porch light is a card at the top of the Team column. Change opens a small form in place with a status and a date. Saving shows a toast, and the lamp lights on your card, your row and your catch-up header. Everyone else's lamp shows on their row and at the top of their catch-up, and nobody else gets a control.

| Scenario | State in the preview |
| --- | --- |
| Leave the porch light on while away | Team with porch lights (Aisha's card, row and catch-up); Setting Away |
| Away ends by itself, or earlier | Change → Status Here → Save (lamp off, "Your porch light is off.") |
| Leaving becomes Left after the leaving date | Leaving warning; Ravi is leaving |
| An account Jira deactivates shows as Left | Mei Ling left |
| A date outside today to one year ahead | Past date; Over a year |

**Texts:** "Away until 20 Nov", "Leaving on 31 Jan", "Left"; on your own card when off, "Here, porch light off". Form help: Away "Your porch light turns off by itself after this date.", Leaving "Everyone on the team will see this.", Here "Your porch light is off: teammates just ask you." Toasts: "Your porch light is on: Away until 20 Nov." and "Your porch light is off."

**Motion tier:** 1 (approved 2026-11-07). The lamp switches at once, with a toast. Tier 2 (the lamp warming up over 600ms) was tried in the preview and dropped: on an 8px lamp it could not be seen.

**Components used:** `pl-presence`, `pl-presence--away`, `pl-presence__lamp`, `pl-field`, `pl-field__label`, `pl-select`, `pl-input` (date), `pl-field__help`, `pl-field--error`, `pl-btn--primary` (Save, with the lamp glyph), `pl-btn--secondary` (Change), `pl-btn--subtle` (Cancel), `pl-toast`, and the team list and catch-up pieces from catch-up-view. No new components.

**Preview:** `docs/design/porch-status/preview.html` (http://localhost:3000/design/porch-status/preview.html). The state bar is for review only. It also shows the rejected header placement and the rejected tier 2.

**Security note for build:** status text is built by Porchlight from a fixed kind and a date, never from typed text.

## Technical plan

_(added at pause 3)_

## Open items

| ID | What | Type | Raised at | Owner | Status | Answer |
| -- | ---- | ---- | --------- | ----- | ------ | ------ |
| O1 | Who may set a teammate's status: only the person, or a team lead too? (from shape O17) | question | shape | user | Resolved | Only the person sets their own porch light. A lead who wants someone marked away asks them. D24. 2026-11-07 |
| O2 | A resignation may be confidential before it is announced, and "Leaving" shows it to the whole team (from shape O20) | flag | shape | user | Resolved | Setting Leaving is announcing it: everyone sees it from the moment the person sets it, and the form says "Everyone on the team will see this." D24. 2026-11-07 |
| O3 | Can the app read whether a Jira account is deactivated (`active: false`), calling Jira as the viewer? (from shape O18) | unproven | shape | poc | Accepted risk | Research 2026-11-07: `GET /rest/api/3/user/bulk` returns `User` objects with `active`, needing only "Permission to access Jira" and `read:jira-user`; `/user/search` returns active users only; there is no Forge deactivation event (ECO-1492, Gathering Interest). Unproven: whether bulk still returns a deactivated account. Safe rule: show Left only on `active: false`; a missing person keeps their last status. Test on a real deactivated account before the demo. 2026-11-07 |
| O4 | When exactly does "Away until 20 Nov" end? | question | spec p1 | user | Resolved | At the end of that date in the person's own Jira time zone. Leaving becomes Left the same way. 2026-11-07 |
| O5 | Which dates may someone pick? | question | spec p1 | user | Resolved | Today up to one year ahead. Earlier: "Pick today or a later date." Later: "Pick a date within a year." 2026-11-07 |
| O6 | Can someone change their mind after setting Away or Leaving? | question | spec p1 | user | Resolved | Yes, until it becomes Left: switch to Here or pick a new date. Left is final. 2026-11-07 |
| O7 | Does Atlassian expose an out-of-office or working status a Forge app can read? (from shape O19) | unproven | shape | poc | Resolved | Research 2026-11-07: Jira REST has no such field, and the native feature is not built (ID-7594, Gathering Interest). Teamwork Graph has `ExternalCalendarEvent` with eventType `OUT_OF_OFFICE`, scope `read:graph:calendar-event:external`, read with `requestTeamworkGraph` as the viewer, but it is early access and needs an outside calendar connected. Not in this slice: the user chose a later slice, away-from-calendar, added to the shape. 2026-11-07 |
| O8 | Where does a person set their own porch light? | question | spec p2 | user | Resolved | A card at the top of the Team column, with a Change button that opens a small form in place. D25. 2026-11-07 |
| O9 | Motion tier | question | spec p2 | user | Resolved | Tier 1: the lamp switches at once, with a toast. Tier 2's warm-up was shown and could not be seen on an 8px lamp. 2026-11-07 |
| O10 | Pause 3 needs each person's time zone at read time. Does `/rest/api/3/user/bulk` return `timeZone` for other people, or can profile visibility hide it? | unproven | spec p3 | poc | Open | Checked 2026-11-07 for the viewer's own account: bulk returns `active: true` and `timeZone: Asia/Kuala_Lumpur`. Not yet checked for another person; ask at pause 3 (fallback: the viewer's time zone). |

_Never delete this section or its rows. See references/ledger.md._

## Decisions to record

Pause 1: recorded as D24 on 2026-11-07.

Pause 2: recorded as D25 on 2026-11-07.

## Glossary

- **Porch light** — Porchlight's presence signal: on means away or leaving, so read their work; off means here, so just ask them (D9)
- **Deactivated account** — an Atlassian account an admin has turned off; Jira reports it with `active: false`
- **Jira time zone** — the time zone each person sets in their Atlassian profile; Jira returns it as `timeZone`
- **Forge SQL** — a MySQL-compatible database that Atlassian hosts for each installation of the app
- **e2e** — end-to-end: one test that walks the whole slice as a user would
