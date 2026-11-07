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
