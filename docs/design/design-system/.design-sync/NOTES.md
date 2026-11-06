# design-sync notes

- 2026-11-02: first sync. This design system is CSS only (no React components, no package.json, no Storybook), so the normal converter was not used. The upload was built by hand into `.design-sync/ds-bundle/`: styles.css, tokens/, assets/icons.svg, guidelines/, index.html and street/index.html (each with a `@dsCard` first line added in the bundle copy), and README.md = conventions.md plus a file list.
- No `_ds_sync.json` anchor was written. Without components there is nothing for it to record, so the next sync re-uploads everything. That is fine at this size.
- Claude Design parses SVG as strict XML. `--` inside an XML comment is rejected (this hit `assets/icons.svg`). Keep token names out of SVG comments.
- When the Forge Custom UI has real React components, re-run /design-sync for a full component import into the same project (projectId in config.json).
