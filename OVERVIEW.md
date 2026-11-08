# Codegeist 2026

**Status:** Active · **Updated:** 2026-11-08 by /ship ask-the-trail

A Forge app for Jira that captures what each person on a project team is working on, and why, so leave, handovers and "why was this built?" stop costing days.
Users: project teams of POs, devs and testers. Entry for Atlassian Codegeist 2026, Software Teams.

## Run it

All commands run in `porchlight/`.

| Task    | Command |
| ------- | ------- |
| install | `npm install && npm install --prefix static/porchlight-ui` |
| run     | `npm run build:ui && forge deploy --non-interactive -e development`, then open Apps → Porchlight in Jira on dzaffren.atlassian.net. Porchlight has two pages in Jira's sidebar: Team and Notes. The Porchlight agent is in Rovo Chat on the demo site one-atlas-jddo.atlassian.net |
| test    | `npm run test:all` (server and page unit tests) |
| e2e     | `npm run e2e:login` once per site to save a login (dzaffren by default; `PL_SITE=https://one-atlas-jddo.atlassian.net` for the demo site), then `npm run e2e` after each deploy. It runs four e2e tests: Notes, Team with a catch-up, and the porch light on dzaffren, and the Rovo agent on the demo site |
| lint    | `npm run lint && forge lint` |
| logs    | `forge logs -e development --since 15m` |

## Where things are

- `porchlight/` — the Forge app: `src/` resolvers, the Rovo action and database, `prompts/` the agent's prompt, `static/porchlight-ui/` the page, `e2e/` the Playwright tests
- `hello-forge/` — Forge starter app used to learn Forge; not the entry
- `docs/overview.html` — the one local overview page: recap, diagrams, evidence, shape and specs; serve from the `Codegeist/` folder with `python -m http.server 3000 -d docs`
- `docs/specs/` — shape and slice specs

## Slices

| Slice    | Status  | What it does | Page |
| -------- | ------- | ------------ | ---- |
| skeleton | Shipped | A Porchlight page in Jira where anyone saves a short note and sees every saved note, newest first. Deployed by CI and walked by one real e2e test. | `docs/overview.html` |
| catch-up-view | Shipped | A shared team list and a catch-up panel: pick a teammate and see their open work, what they did in the last 14 days, what blocks them and what comes next, read from Jira as the viewer. | `docs/overview.html` |
| porch-status | Shipped | Each person can turn on their own porch light: Away until a date, or Leaving on a date. Everyone sees it on the team list and in the catch-up, and it turns into Left after the leaving date or when Jira deactivates the account. | `docs/overview.html` |
| ask-the-trail | Shipped | A Porchlight agent in Rovo Chat: ask "catch me up on Aisha" or "what's blocking Aisha?" and it answers from the same Jira trail as the catch-up panel, read as you, with every ticket linked. | `docs/overview.html` |

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
