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
