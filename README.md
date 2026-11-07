# Codegeist 2026

<!-- zuko:start — generated from OVERVIEW.md; edit that file, not this block -->

## What it does

A Forge app for Jira that captures what each person on a project team is working on, and why, so leave, handovers and "why was this built?" stop costing days.
Users: project teams of POs, devs and testers. Entry for Atlassian Codegeist 2026, Software Teams.

## Install and run

| Task    | Command                                                                                                                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install | `npm install && npm install --prefix static/porchlight-ui`                                                                                                                                     |
| run     | `npm run build:ui && forge deploy --non-interactive -e development`, then open Apps → Porchlight in Jira on dzaffren.atlassian.net. Porchlight has two pages in Jira's sidebar: Team and Notes |
| test    | `npm run test:all` (server and page unit tests)                                                                                                                                                |
| e2e     | `npm run e2e:login` once to save a login, then `npm run e2e` after each deploy. It runs the three e2e tests: Notes, Team with a catch-up, and the porch light                                  |
| lint    | `npm run lint && forge lint`                                                                                                                                                                   |
| logs    | `forge logs -e development --since 15m`                                                                                                                                                        |

## Features

- A Porchlight page in Jira where anyone saves a short note and sees every saved note, newest first. Deployed by CI and walked by one real e2e test.
- A shared team list and a catch-up panel: pick a teammate and see their open work, what they did in the last 14 days, what blocks them and what comes next, read from Jira as the viewer.
- Each person can turn on their own porch light: Away until a date, or Leaving on a date. Everyone sees it on the team list and in the catch-up, and it turns into Left after the leaving date or when Jira deactivates the account.

## Docs

- [Overview](OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](DECISIONS.md)
- [Changelog](CHANGELOG.md)

<!-- zuko:end -->
