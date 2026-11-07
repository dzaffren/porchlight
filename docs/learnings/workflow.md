# Workflow lessons

Learned while building catch-up-view, 2026-11-07.

- **Agent worktrees start from `main`, not from the current branch.** Every chunk agent found its worktree at `main`. Commit the spec work first, then tell each agent to `git merge --ff-only <feature branch>` before it starts, and to stop if the spec commit is missing.
- **Integrate chunks with `git cherry-pick base..chunk-branch`, in chunk order.** It keeps history linear, with no merge commits that break the commit-subject rule.
- **Windows cannot delete deep `node_modules` paths in a worktree.** `git worktree remove` fails with "Filename too long". Unregister the worktree, then delete the folder with `Remove-Item -LiteralPath "\\?\C:\...\worktrees" -Recurse -Force`.
- **A long browser script can freeze the Jira tab.** Run Jira REST writes in small steps, and read the state back before retrying.
