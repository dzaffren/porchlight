# Codegeist 2026

**Status:** Active · **Updated:** 2026-11-07 by /ship skeleton

A Forge app for Jira that captures what each person on a project team is working on, and why, so leave, handovers and "why was this built?" stop costing days.
Users: project teams of POs, devs and testers. Entry for Atlassian Codegeist 2026, Software Teams.

## Run it

All commands run in `porchlight/`.

| Task    | Command |
| ------- | ------- |
| install | `npm install && npm install --prefix static/porchlight-ui` |
| run     | `npm run build:ui && forge deploy --non-interactive -e development`, then open Apps → Porchlight in Jira on dzaffren.atlassian.net |
| test    | `npm run test:all` (server and page unit tests) |
| e2e     | `npm run e2e:login` once to save a login, then `npm run e2e` after each deploy |
| lint    | `npm run lint && forge lint` |
| logs    | `forge logs -e development --since 15m` |

## Where things are

- `porchlight/` — the Forge app: `src/` resolvers and database, `static/porchlight-ui/` the page, `e2e/` the Playwright test
- `hello-forge/` — Forge starter app used to learn Forge; not the entry
- `docs/overview.html` — the one local overview page: recap, diagrams, evidence, shape and specs; serve from the `Codegeist/` folder with `python -m http.server 3000 -d docs`
- `docs/specs/` — shape and slice specs

## Slices

| Slice    | Status  | What it does | Page |
| -------- | ------- | ------------ | ---- |
| skeleton | Shipped | A Porchlight page in Jira where anyone saves a short note and sees every saved note, newest first. Deployed by CI and walked by one real e2e test. | `docs/overview.html` |

## More

README.md · docs/ARCHITECTURE.md · DECISIONS.md · CHANGELOG.md
