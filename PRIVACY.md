# Privacy fork: first removal slice

This fork starts from upstream release `6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`.
It is work in progress, not a certified privacy-preserving release.

## Removed

- CRM vendor telemetry package, PostHog dependencies, and collector constants.
- API telemetry module, boot timer, rollup route, and cron configuration.
- Agent telemetry hook and telemetry event callers.
- Landing-page analytics, capture handlers, and analytics-only location props.
- CI title generation through Anthropic. Titles now use local Git metadata.

The historical database schema and migrations remain unchanged.
Existing databases retain their old telemetry tables. No retained code writes telemetry events.
These tables contain historical data until a separate migration removes them.

## Not removed in this slice

- Eve framework tracing and provider routing.
- Vercel model catalog and image storage integrations.
- Perplexity, Context.dev, Slack, Microsoft, and other optional integrations.
- First-party visitor tracking.
- Framework-level diagnostic code inside dependencies.

Hermes is the required model provider for the lab deployment.
This slice does not configure Hermes or approve another model provider.
Do not enable model work until routing and failure behavior pass verification.

## Verification

The API integration suite checks that the removed rollup route returns HTTP 404.
The previous deployment returns HTTP 403, because the route exists there.
Browser verification checks the built app for requests outside its web and API origins.

SkillSpector findings and coverage are separate results.
A completed scan with findings is not a clean scan.
The stock CLI uses a 60-second shared workflow budget.
The external audit runner supplies a larger `WorkflowResourceBudget` through the same graph API.
The stock ledger also stops at 10,000 records, which prevents full repository coverage.
The audit runner can raise that in-memory record ceiling without changing detection rules.
It does not suppress findings or modify installed scanner files.

## Fork workflow

The lab tracks this work under Infra task 2079 in Vikunja.
The branch starts from the deployed release, not upstream development main.
Keep changes small and preserve the upstream license and migration history.
Do not upload lab credentials, machine configuration, or CRM data to this public fork.
