# Forge lessons

Learned while building the skeleton slice, 2026-11-06 to 2026-11-07.

- **Forge SQL refuses `LIMIT ?`.** Bound values arrive as text, and the database answers "ERROR 1210 (HY000): Incorrect arguments to LIMIT". Write a fixed limit into the SQL from a constant. Never put typed text there. The fake database in `porchlight/test/unit/fake-forge-sql.js` refuses `LIMIT ?` too.
- **The fake database only knows what we teach it.** The LIMIT bug passed 31 unit tests and failed on the first real request. Run the e2e test after every deploy that changes SQL.
- **`forge create` needs a real terminal the first time in a Developer Space.** It asks the user to accept the developer terms, which include billing for usage over the free allowance. The user runs it; pass `-s <space id>` from `forge developer-spaces list`.
- **Google refuses sign-in in a browser that Playwright launches**, and Atlassian sends a Google-linked account straight to Google. Start Chrome as a normal program with its own profile, let the person sign in, then attach over the DevTools port. Save Atlassian cookies only.
- **Playwright's `storageState()` breaks on an attached browser.** It visits each origin to read local storage. Use `context.cookies()` instead.
- **Custom UI blocks inline `style` attributes.** Move colours into classes; plain numbers such as `fill-opacity` can stay as SVG attributes. A `<use>` copy of a symbol only matches single-class selectors.
- **A deploy that adds a scope prints "Run forge install --upgrade".** A first install grants the scopes directly.
- **Forge's own packages carry audited advisories.** `@forge/sql` and `@forge/bridge` pull an old `glob` (through `@forge/manifest`), and `@forge/bridge` pulls `prosemirror-view` 1.41.5. npm's suggested fix is a breaking downgrade. Use `overrides` in `package.json` instead, and confirm with `npm audit` and a deploy.
- **Give CI secrets to one step, not the job.** Installs, install scripts and builds then never run beside the token. Pin the Forge CLI as a dev dependency and call it with `npx forge`.
- **`forge lint` needs a Forge login.** It reads only local files, but stops with "Not logged in" without credentials. In CI, give the lint step the token too.
- **A deploy that adds a scope needs `--approve MAJOR_VERSION_RULE`.** Forge CLI 15 stops with "1 approval requested", because a scope change makes a major version. Deploy again with the flag, then run `forge install --upgrade`. A CI deploy of the same manifest later needs no approval.
- **Jira's issue link API reads backwards.** To make PAY-2 "is blocked by" OPS-1, send `inwardIssue: OPS-1` and `outwardIssue: PAY-2` to `POST /rest/api/3/issueLink`. On PAY-2 the link then shows `inwardIssue: OPS-1` with `type.inward` = "is blocked by". Check the ticket page after creating a link.
- **A Kanban project's To Do status may be called "Backlog".** Use `status.statusCategory.key` (`new`, `indeterminate`, `done`) for rules, and show `status.name` only as text.
- **Custom UI subpages work.** `pages` on `jira:globalPage` shows Team and Notes in Jira's sidebar, the route is added to the URL, and `view.createHistory()` gives the page `/team` or `/notes`.
- **A relative link in Custom UI points at the frame's own host.** `href="/browse/PAY-1"` opens a dead page on middle-click or "Open in new tab". Build the href from `siteUrl` in `view.getContext()`, and keep `router.open` for a plain click.
- **A free developer site may have no Rovo Chat.** dzaffren.atlassian.net shows Rovo as available but has no Chat, so a Forge `rovo:agent` cannot run there. `forge site provision` makes one free demo site (90 days) with Rovo; `forge install --demo-site` installs on it. A `rovo:agent` with one `action` needs no extra scope and keeps Runs on Atlassian eligibility.
- **Re-running `forge site provision` is safe.** With a site already made, it prints the existing demo site and its expiry instead of making another.
- **Forge SQL accepts `INSERT ... ON DUPLICATE KEY UPDATE col = VALUES(col)`.** MySQL 8 marks `VALUES()` as deprecated, but TiDB under Forge SQL runs it. Proven by the porch-status e2e, 2026-11-07.
- **Forge's Node 24 runtime has full time-zone data.** `Intl.DateTimeFormat` with `timeZone: 'Asia/Kuala_Lumpur'` works in a resolver.
- **Two resolver calls on a cold start can both run the migrations.** `forge logs` showed `v003...=done` twice after one deploy. `CREATE TABLE IF NOT EXISTS` keeps it harmless; a migration that is not safe to repeat would not be.
- **A Rovo action runs as the person chatting.** `api.asUser().requestJira` in a `GET` action returned that person's account from `/rest/api/3/myself`, and the same ID is in `payload.context.accountId`. The context has `cloudId` but no site URL. Proven by /poc on the demo site, 2026-11-08.
- **The agent's model writes an action's inputs in its own words.** "Run the spike" arrived as "The user wants to run the spike." Treat every input as untrusted text.
- **Removing a scope is a major version too.** Deploy with `--approve MAJOR_VERSION_RULE`, then `forge install --upgrade` on each site that should drop the old version.
