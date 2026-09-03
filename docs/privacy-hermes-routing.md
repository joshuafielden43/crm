# Hermes-only primary model routing

Tracking: Infra task 2086, under task 2079.
Base: `79a3f8644c7c6bbb869dba88e6fd242dbe106f40`.

## Scope

Replace the Vercel catalog and all three agents' primary model routing.
Require one explicit Hermes endpoint, key, model ID, and context-window size.
Preserve database history. Reject stored model choices outside the configured model.
Do not configure credentials, deploy the fork, or call a live model during this source change.

## Policy

The model chooser reads local configuration. It performs no catalog request.
The API exposes model metadata, not the endpoint or key.
All agents resolve direct provider objects before each model step.
The compiled fallback rejects requests. No vendor string remains in the authored model configuration.
Missing configuration, failed database reads, and unavailable run context return blocked selections.
An unset selection cannot expose an older session's stored vendor model.
Requests use only the exact configured Chat Completions endpoint.
Redirects fail, and a bounded timeout limits each request.
The operator owns the endpoint setting. This is not a firewall or a DNS integrity guarantee.

## Verification boundaries

The user approves the model chooser and agent request boundaries.
Tests use synthetic prompts, synthetic credentials, loopback HTTP fixtures, and a disposable database.
Verify generation, streamed tool calls, redirect rejection, invalid configuration, stale selections, and blocked fallbacks.
The lifecycle regression uses Eve 0.29.4's installed internal lifecycle boundary because no public test interface exposes it.
It seeds durable vendor session and turn references, then verifies blocked selections across two steps for all three agents.
The isolated process uses production model selection; Eve automatically substitutes mock models under `NODE_ENV=test`.
Database-backed runner tests verify configured, vendor, and missing run records without modifying existing data.
Run application tests, types, zero-warning lint, and build checks before publication.
The post-commit hook publishes to the fork and watches the exact commit's CI.
CI also builds the agent without model credentials to verify the blocked fallback compiles independently of provider discovery.

## Local result

The full application suite passes 1,116 tests against a disposable database.
The Git hook suite passes 10 tests.
Types, zero-warning lint, and anti-slop checks pass.
The production agent and browser builds pass.
Standards and requirements reviews report no remaining findings after fixture and lifecycle coverage fixes.

## Remaining work

Synthetic OpenAI-compatible fixtures do not prove the live Hermes service supports Eve's full model contract.
Live tool-call, streaming, and context-window compatibility remain part of deployment task 2082.
The optional Perplexity tool, Context.dev, Blob, and other outbound features remain separate removal work.
Eve tracing, framework dependencies, and built-in network tools require their own audit.
This change does not certify zero exfiltration or complete SkillSpector coverage.
