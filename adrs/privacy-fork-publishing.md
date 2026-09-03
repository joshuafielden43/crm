# ADR: fork-only publishing, tracked hooks, and commit-scoped CI

Date: 2026-09-03.
Status: accepted direction; implementation verification accompanies the commits.
Tracking: Infra Vikunja task 2085, under task 2079.

## Context

This repository is a privacy fork of `trycompai/crm`.
The user requires unambiguous fork-only publishing and automatic background publishing after each commit.
The user also requests an ordered record of Git changes and removed hook responsibilities.

At baseline `0817f40`, `.githooks/pre-push` already exists in Git.
It runs types, lint, anti-slop, and database tests against the current working directory.
Its `CRM_SKIP_HOOKS` flag bypasses the whole hook.
It does not enforce a destination.
The repository has no post-commit publisher or commit-pinned CI watcher.
The shared user-level `ci-watch` executable is outside this repository.
No shared or global hook is deleted by this decision.

Automatic PR creation fails under the fork's GitHub Actions permissions.
The old CI trigger does not cover development-branch pushes.
GitHub CLI infers an upstream repository for forks unless the caller pins its target.
These defaults conflict with the required publishing boundary.

## Decisions, in implementation order

1. **Name the only publishing destination.**
   `origin` means `https://github.com/joshuafielden43/crm.git`.
   `main` means a branch in that fork. It never names the vendor repository.
   Keep the current development branch; this decision does not merge or promote it.

2. **Generate local Git configuration from tracked code.**
   `scripts/install-hooks.mjs`, invoked by `bun install`, installs `.githooks`.
   It pins origin's push URL, default remote, and same-name branch behavior.
   It sets upstream's push URL to `disabled://upstream-read-only`.
   It disables HTTP redirects for publishing to the fork.
   CI skips local publishing-hook installation.
   Git configuration remains machine-local; the installer that produces it is versioned.

3. **Make pre-push a mandatory routing guard.**
   Keep the tracked `.githooks/pre-push` entry point.
   `scripts/push-guard.mjs` checks the remote, every effective URL, redirect policy, and proposed ref updates.
   Reject aliases, direct URL arguments, alternate destinations, multiple URLs, deletions, tags, and history rewrites.
   Remove the old bypass flag. It no longer disables the destination guard.

4. **Move database-dependent checks from pre-push to CI.**
   Remove the old four-command test loop from pre-push, not from the project.
   Keep the same checks as documented local commands and required CI steps.
   CI runs against the immutable pushed commit and a disposable test database.
   A background pre-push test would inspect a changing checkout and require live local database configuration.
   Therefore pre-push proves destination safety; CI proves the pushed code passes its checks.
   Publication is not deployment or approval for production.

5. **Track the post-commit publisher and watcher.**
   `.githooks/post-commit` queues the exact commit and attached branch.
   `scripts/publish.mjs` starts a detached worker and records local status.
   The worker's code comes from the committed Git objects, not a later checkout.
   Its immutable pre-push guard remains available across branch changes.
   The publisher never stages files or creates another commit.
   A detached HEAD has no destination branch and does not publish.
   A newer remote descendant can cover an older queued commit; the receipt names that descendant explicitly.

6. **Run CI directly on branch pushes.**
   Remove `.github/workflows/auto-pr.yml`.
   Enable `.github/workflows/ci.yml` for every branch push.
   Do not expand GitHub Actions permissions to make PR creation work.
   Remaining GitHub CLI automation pins the fork instead of inferring upstream.

7. **Make CI watching part of publishing.**
   `scripts/watch-ci.mjs` polls the explicit fork and immutable pushed SHA.
   Validate run records and publish receipts at their JSON boundaries.
   Require the CI workflow and success from every observed workflow.
   Missing runs, malformed receipts, failed workflows, and coverage limits never produce success.
   Store receipts and logs under the Git common directory's `publish/` folder.
   Agents inspect `bun run publish:status` before claiming completion.
   The hook does not wake inactive agents or create messages in other tasks.

8. **Resolve lint warnings without weakening the general policy.**
   Remove the two unused imports.
   Document exact public-facade exceptions for barrel warnings in `CONTRIBUTING.md`.
   Isolate reduced-motion CSS and retain its accessibility overrides.
   Fail lint and CI on every remaining warning.

## Ownership and reproducibility

Tracked: hook entry points, installer, guard, publisher, bootstrap, schemas, watcher, tests, CI workflow, and this ADR.
Generated locally: Git configuration, immutable worker snapshots, private logs, and status receipts.
External prerequisites: Git, Node, Bun, authenticated GitHub CLI, and installed project dependencies.
No dependency on a particular agent's home-directory watcher remains in automatic publishing.
The shared ci-watch skill still applies to explicit manual pushes.
Git has no post-push hook, so manual pushes do not trigger the post-commit publisher.

## Verification requirements

- Reject upstream and alternate destinations, including the old skip flag.
- Disable HTTP redirect following and test that policy with local HTTP fixtures.
- Reject malformed CI records and every failed sibling workflow.
- Commit, immediately change checkout, and still finish publishing the captured commit in isolated tests.
- Forbid real network transport in hook fixtures.
- Run types, lint, anti-slop, hook tests, application tests, and the production browser build.
- Perform one real commit, observe its automatic fork push, and verify its terminal hosted CI receipt.

## Consequences and limits

Every normal commit now starts publishing automatically. Uncommitted files stay local.
A failed push leaves the commit intact and reports failure. Retry with `bun run publish:retry` after repair.
Hooks do not follow a clone automatically; `bun install` installs them from tracked files.
Deliberate hook replacement, `--no-verify`, or separate API credentials bypass local protections.
Absolute prevention requires server-side credential restrictions, beyond this local-hook decision.
No upstream contribution, release promotion, application deployment, or broader shared-hook migration is authorized here.
