# Workflow lessons

Learned while building catch-up-view, 2026-11-07.

- **Agent worktrees start from `main`, not from the current branch.** Every chunk agent found its worktree at `main`. Commit the spec work first, then tell each agent to `git merge --ff-only <feature branch>` before it starts, and to stop if the spec commit is missing.
- **Integrate chunks with `git cherry-pick base..chunk-branch`, in chunk order.** It keeps history linear, with no merge commits that break the commit-subject rule.
- **Windows cannot delete deep `node_modules` paths in a worktree.** `git worktree remove` fails with "Filename too long". Unregister the worktree, then delete the folder with `Remove-Item -LiteralPath "\\?\C:\...\worktrees" -Recurse -Force`.
- **A long browser script can freeze the Jira tab.** Run Jira REST writes in small steps, and read the state back before retrying.

Learned while building porch-status, 2026-11-07.

- **Build the shared file before you split.** When two chunks import one module, build and commit it first, then start the chunks on top of it. Each chunk then codes against the real file, not a guess.
- **Put the exact accessible names in both briefs.** The page chunk and the e2e chunk ran in parallel and matched on the first run, because both briefs named the region, buttons and labels word for word.
- **Playwright runs spec files in parallel by default.** Specs that share one real site and one signed-in person need `workers: 1`.
- **At most 20 subagents run at once.** A large review with three verifiers per finding goes past that. Start the rest as slots free up, with the same prompts.
- **Do not edit code while verifiers read it.** A fix made mid-verification changes the lines a verifier is judging. Wait for every verdict, then fix.
- **Tell each verifier the repo root.** Agents start in `hello-forge/`, and the hook blocks `git -C`, `--git-dir` and `cd`, so verifiers cannot run `git diff`. They read the working tree; on a branch where the files are new, that is enough. (`--git-dir` was tried and blocked, 2026-11-08.)

Learned while building ask-the-trail, 2026-11-08.

- **The `!` prefix runs bash, not PowerShell.** Give the user `cd /c/...` and `VAR=value cmd`, never `$env:VAR` or backslash paths.
- **A chunk that writes an e2e test for a UI nobody has driven yet guesses the accessible names.** The Rovo test needed six real runs to fix them. Before the chunks run, record the real names from one manual pass, as the porch-status briefs did.
