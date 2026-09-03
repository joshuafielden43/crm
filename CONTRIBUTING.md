# Contributing to the privacy fork

## Repository boundary

The only publishing repository is `joshuafielden43/crm`.
`origin` means `https://github.com/joshuafielden43/crm.git`.
`main` means a branch in that fork. It never means the vendor repository.
`upstream` is fetch-only. Hook setup assigns it a disabled push URL.
Never submit code, pull requests, or releases to `trycompai/crm`.

Run `bun install` from this fork to install the tracked hooks.
Run `gh repo set-default joshuafielden43/crm` for interactive GitHub CLI commands.
Automation always passes an explicit repository.

## Commit, push, watch

Every successful attached-branch commit starts a detached background publisher.
It pushes that exact commit to the same branch name on origin.
It never stages files, creates commits, force-pushes, deletes branches, or merges branches.
Detached HEAD cannot select a publishing branch and does not publish.
Each commit captures its branch before another checkout or commit changes HEAD.
The background worker and its push guard load from an immutable snapshot of that commit.

The pre-push hook validates both the remote argument and destination URL.
It checks every effective origin fetch and push URL.
Only one canonical HTTPS fork URL passes. Rewrites and multiple destinations fail closed.
HTTP redirects are disabled and checked against the effective URL-specific Git configuration.
The old `CRM_SKIP_HOOKS` flag cannot bypass the guard.
Tags, deletions, and non-fast-forward updates are refused.

CI runs on every branch push. Automatic PR creation is removed.
The publisher watches the explicit fork and exact pushed SHA, not the later HEAD.
A newer published descendant can cover an older queued commit; its SHA is recorded explicitly.
Every observed workflow must succeed, including the CI workflow.
Failures, missing runs, and coverage limits produce failed receipts, never green status.

The publisher records logs and JSON receipts under the Git common directory's `publish/` folder.
Use `bun run publish:status` to read receipts.
Use `bun run publish:retry` to retry the current branch and commit after fixing a failure.
A successful commit is not proof of a successful push or CI run.
After each commit, agents inspect the receipt and wait for a terminal result before claiming completion.
Background hooks do not send messages to other agents or wake inactive conversations.

Git has no post-push hook. Explicit manual pushes still require the caller's ci-watch skill.
The post-commit publisher runs its own SHA-pinned watcher automatically.
New clones need hook setup. CI does not install local publishing hooks.
Hook protection prevents ordinary mistakes; it is not a security boundary against deliberate bypass.
`--no-verify`, replacing hooks, changing Git configuration, or separate API credentials can bypass local safeguards.

## Verification

Run these before committing:

```sh
bun run test:hooks
bun run check-types
bun run lint
bun run lint:slop
bun run test
```

The pre-push hook only checks routing and safe ref updates.
Database tests run in CI against the immutable pushed commit, not a changing background worktree.
Local API tests require a disposable `TEST_DATABASE_URL` ending in `_test`.
Never run tests against the deployed CRM database.
Tests run serially because packages share database fixtures.
Never delete rows that a test does not own.

The hook suite uses a temporary Git repository and simulated transports.
Its Git transport policy forbids real network access.
It checks destination rejection, history protection, automatic publishing, and complete CI conclusions.

## Lint policy

Warnings fail local lint and CI.
Remove unused imports instead of suppressing them.
The default barrel rules stay enabled except for these exact public boundaries:

- Auth and database package entry points preserve supported imports.
- Database fields and image helpers preserve their exported facade.
- Mail-provider constants and agent task helpers share one authoritative definition.
- The app PostCSS entry point forwards the shared UI configuration.

The database entry point forwards generated Prisma enums and types.
The fields entry point forwards its shared shape contract.
These two files explicitly permit wildcard re-exports.
Reduced-motion overrides retain `!important` to disable more specific animated states.
Only `packages/ui/src/styles/reduced-motion.css` permits that accessibility override.
No application-wide lint rule is disabled.

## Engineering rules

Read `AGENTS.md` and the relevant area documentation before changes.
Keep privacy changes small. Preserve the upstream license and migration history.
Use Conventional Commit subjects. Track lab work in Vikunja, not the upstream Median workspace.
No coauthor trailers. No customer data, credentials, or private machine configuration in this public repository.
Releases and deployment remain separate from publishing a development branch.
