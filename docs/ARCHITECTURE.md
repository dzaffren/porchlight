# Codegeist 2026 · architecture

**Status:** Active · **Updated:** 2026-11-07 by /build porch-status

## Context

```mermaid
flowchart LR
    U((project team)) --> P[Knowledge handover Forge app] --> O[(handover views, answers with sources)]
```

## Components

```mermaid
flowchart TB
    subgraph Browser["Jira page, sandboxed frame (Custom UI)"]
        RS["porchlight/static/porchlight-ui<br/>React + Vite page<br/>App.jsx: route switch"]
        TP["Team page<br/>team list · add teammate · catch-up"]
        PL["MyPorchLight card · Presence lamp<br/>on the card, each row, the catch-up"]
        NP["Notes page"]
        CU["catchup.js<br/>four sections from Jira's answers"]
        DS["docs/design/design-system<br/>styles, tokens, icons"]
        LIB["porchlight/src/lib/porch.js<br/>date rules, shared with the resolver"]
        RS -- "/team" --> TP
        RS -- "/notes" --> NP
        TP --> CU
        TP --> PL
        PL --> LIB
        DS -. "imported at build" .-> RS
    end
    subgraph Forge["Forge (Atlassian cloud)"]
        RN["porchlight/src/resolvers/notes.js<br/>listNotes · saveNote"]
        RT["porchlight/src/resolvers/team.js<br/>listTeam · addTeammate · removeTeammate"]
        RP["porchlight/src/resolvers/porch.js<br/>listStatuses · setMyStatus"]
        M["porchlight/src/db/migrate.js<br/>migrations, hourly trigger"]
        SQL[("Forge SQL<br/>notes · team_members · porch_statuses")]
    end
    J["Jira REST, as the viewer<br/>myself · user/search · user/bulk · field<br/>search/jql · search/approximate-count<br/>issue/key/changelog · issue/key/comment"]
    CI["GitHub Actions<br/>lint, tests, deploy main"]
    NP -- "invoke" --> RN --> SQL
    TP -- "invoke" --> RT --> SQL
    TP -- "invoke" --> RP --> SQL
    RP -. "same date check" .-> LIB
    M --> SQL
    NP -- "requestJira" --> J
    TP -- "requestJira" --> J
    CI -. "forge deploy" .-> Forge
```

| Component | Folder | What it does |
| --------- | ------ | ------------ |
| Page | `porchlight/static/porchlight-ui/` | The Porchlight page in Jira. `main.jsx` renders `App.jsx`, which reads the route with `view.createHistory()` and shows Team or Notes, the two subpages in Jira's sidebar |
| Team page | `porchlight/static/porchlight-ui/src/` (`TeamPage.jsx`, `TeamList.jsx`, `AddTeammate.jsx`, `CatchUp.jsx`) | The team list, the Jira user search to add a teammate, and one teammate's catch-up |
| Porch light | `porchlight/static/porchlight-ui/src/` (`MyPorchLight.jsx`, `Presence.jsx`) | `MyPorchLight` is the "Your porch light" card at the top of the Team column, with the form to set your own status. `Presence` is the lamp and its text on the card, on each team row and in the catch-up header |
| Notes page | `porchlight/static/porchlight-ui/src/NotesPage.jsx` | Write a note, see every note with its author's name |
| Catch-up rules | `porchlight/static/porchlight-ui/src/catchup.js` | Plain functions that turn Jira's answers into open work, latest changes, blockers and next steps |
| Jira reads | `porchlight/static/porchlight-ui/src/api.js` | Calls Jira REST with `requestJira`, as the viewer: user search, names with each person's time zone and `active` flag, the Flagged field, `search/jql` and `search/approximate-count`, plus `issue/{key}/changelog` and `issue/{key}/comment` to top up a ticket whose history or comments the search clipped |
| Resolvers | `porchlight/src/resolvers/` | The only backend entry points. Notes: `listNotes`, `saveNote`. Team: `listTeam`, `addTeammate`, `removeTeammate`. Porch light: `listStatuses`, `setMyStatus`. The author, adder or status owner comes from Forge's context |
| Database | `porchlight/src/db/` | The `notes`, `team_members` and `porch_statuses` tables in Forge SQL, their reversible migrations, and the queries |
| Shared rules | `porchlight/src/lib/` | Rules that the page and the resolvers both run. `validate.js` has the note length rule. `porch.js` has the porch light date rules and works out what each lamp shows |
| Design system | `docs/design/design-system/` | The one set of tokens, styles and icons the page imports |
| E2E | `porchlight/e2e/` | The Playwright login, and three tests that walk the real Notes page, Team page and porch light on the dev site |
| CI | `.github/workflows/ci.yml` | Lint and tests on every push; deploy `main` to development |

## Porch light

```mermaid
flowchart LR
    DB[("porch_statuses<br/>one row per person:<br/>kind, until_date")] --> E["effectiveStatus<br/>porchlight/src/lib/porch.js"]
    J["Jira user/bulk, as the viewer<br/>timeZone · active"] --> E
    N["now"] --> E
    E --> S["Here · Away · Leaving · Left"]
```

Porchlight stores only what a person chose: Away until a date, or Leaving on a date. Here has no row. The page works out Here after Away, and Left, each time it reads the statuses (D26). It uses the stored date, the person's Jira time zone and Jira's `active` flag. Porchlight never stores the time zone or the `active` flag (D27).

| Table | Key | Columns | Written by |
| ----- | --- | ------- | ---------- |
| `porch_statuses` | `account_id`, from Forge's context | `kind` (away or leaving), `until_date`, `set_at` | `setMyStatus`, only for the signed-in person. Here deletes the row |
