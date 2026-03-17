# Dedaliano Infrastructure Roadmap

## Purpose

This is the infrastructure roadmap: backend services, deployment, runtime environments, auth, persistence, observability, reproducibility, and operational tooling. It is not the solver mechanics roadmap or the product UX roadmap.

See also:
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- [`research/ai_provider_architecture.md`](/Users/unbalancedparen/projects/dedaliano/research/ai_provider_architecture.md)
- [`research/open_source_vs_hosted_ai_boundary.md`](/Users/unbalancedparen/projects/dedaliano/research/open_source_vs_hosted_ai_boundary.md)

## Principles

1. `Backend-controlled, provider-agnostic AI`
   Frontend calls Dedaliano services, not vendor SDKs directly.

2. `One contract, many runtimes`
   Browser, Tauri desktop, native/server, and batch workflows should share stable contracts.

3. `Reproducibility before scale`
   Captured solver-run artifacts, deterministic metadata, and traceability matter before complex orchestration.

4. `Operational simplicity first`
   Ship a narrow service surface cleanly before building a platform.

5. `Product and solver dependencies stay explicit`
   Infrastructure exists to support solver trust and product workflows, not as a separate vanity stack.

## Where We Are

Already in place:
- browser-first main app
- Rust solver through WASM
- backend AI service (Rust/Axum) with 6 providers (Claude, OpenAI, DeepSeek, Mistral, Kimi, Gemini)
- provider-agnostic AI adapter layer with env-driven selection (`AI_PROVIDER`)
- authenticated `review-model` endpoint — verified end-to-end with Kimi and GPT-4o
- provider timeout guard (configurable via `PROVIDER_TIMEOUT_SECS`, default 90s)
- 19 contract tests (response parsing, malformed/refusal cases, stub provider integration)
- reusable solver-run artifact contract at the engine layer
- containerized local/proxy setup (`Dockerfile`, `docker-compose.yml`, `nginx.conf`)
- local developer bootstrap helpers (`Makefile`, `flake.nix` — verified working)

Not yet complete:
- frontend integration for AI capabilities
- additional AI capabilities beyond review-model
- persistent artifact capture/export/import flows
- replay/support workflows
- production observability and rate limiting
- native/server solve packaging
- batch execution and job orchestration
- multi-environment deployment discipline

The live near-term blockers are now:
- frontend integration for existing `review-model` capability (post-solve button + results panel)
- new AI capabilities: `explain-diagnostic`, `build-model`, `interpret-results`
- product-side solver-run artifact capture, storage, export/import, and replay flows
- backend observability, rate limiting, and startup validation
- a documented path from browser-only execution to native/server and batch execution without forking contracts

## ASAP Infrastructure Work

Before broadening the infrastructure into heavier deployment, batch, or team workflows, the following items should land because they shape every later stage:

1. `Capture solver-run artifacts in product flows` — STILL OPEN. The engine-level artifact contract exists; the app still needs solve-time capture, export/import, and replay wiring.
2. `Make backend failures diagnosable` — PARTIALLY DONE. Error mapping and a health route exist, but request IDs, structured logs, metrics, and clear provider-failure classification still need to be hardened.
3. `Fail fast on config/provider mistakes` — PARTIALLY DONE. Env-based config exists, but startup validation and clearer invalid-provider / missing-key behavior should be treated as a first-class operational requirement.
4. `Bound hosted AI risk` — NOT DONE. Rate limiting, timeout ceilings, retry policy, and cost controls should exist before broadening AI usage.
5. `Keep AI capability contracts clean` — PARTIALLY DONE. `review-model` is live; `explain-diagnostic` and `query-results` should ship as separate endpoints/capabilities, not prompt modes hidden behind one route.
6. `Keep runtime environments aligned` — NOT DONE. Browser, desktop, native/server, and batch execution still need an explicit parity and routing story.

## Near-Term Task List

These are the next concrete infrastructure tasks in execution order:

1. ~~Add provider timeout and retry policy.~~ DONE (timeout guard, configurable)
2. ~~Add backend contract tests for capability request/response schemas.~~ DONE (19 tests)
3. Add `explain-diagnostic` capability — takes a `DiagnosticCode` + context, returns plain-language explanation and fix steps. Smallest new capability.
4. Add `build-model` capability — takes a natural language description ("viga continua 3 tramos, IPE300, 10 kN/m"), returns model JSON (nodes, elements, materials, supports, loads). Frontend loads it like file import.
5. Add `interpret-results` capability — takes `ResultSummary` + user question ("is this deflection acceptable for L/300?"), returns assessment with code reference.
6. Frontend: wire `review-model` into post-solve UI (button + side panel showing findings with affected nodes highlighted).
7. Frontend: wire `explain-diagnostic` into diagnostic badges/tooltips.
8. Frontend: wire `build-model` into a chat/command input in the toolbar.
9. Add request IDs and structured request logging.
10. Add rate limiting and abuse controls.
11. Add startup validation for provider/config/API keys.
12. Capture solver-run artifacts on solve in the product.
13. Add artifact export/import and local persistence.
14. Add replay/support flow on top of captured artifacts.
15. Add `section-optimizer` capability — iterates steel profiles to find lightest section meeting deflection/stress constraints (needs solver-in-the-loop).
16. Add `suggest-loads` capability — suggests load combinations from code (CIRSOC) given building type and location.
17. Add `generate-report` capability — takes solver output, produces structured engineering report.
18. Define storage boundaries for local vs hosted artifacts.
19. Define explicit API/artifact versioning and compatibility policy.
20. Establish a named native/server solve path.
21. Add browser/native parity smoke coverage.
22. Define the worker/job model for long-running tasks.
23. Add batch execution with progress/cancellation semantics.
24. Add deployment promotion/rollback discipline across preview, staging, and production.

## Current Infra Surface

This is the concrete infrastructure surface that exists today and should be treated as the baseline:

- `backend/` service workspace with shared engine contracts
- environment-driven provider selection for AI capabilities
- authenticated API boundary
- health endpoint and basic request handling
- container/proxy files for local and deployment-shaped execution
- first engine-level replayable artifact contract

This baseline should stay simple and stable while the roadmap expands around it.

## Decision Log Rule

Important infrastructure choices should not live only in chat history or commits.

Create and maintain short ADR-style notes for decisions such as:
- job queue technology
- local vs hosted storage boundary
- solver-run artifact format
- auth/token model
- provider routing policy
- native/server runtime packaging

Rule:
- record the decision
- record the rejected alternatives
- record the migration cost if the decision changes later

## Cross-Cutting Requirements

These are not one-stage features. They need to shape every infrastructure stage from the start.

### Testing Strategy

- contract tests for backend request/response schemas
- mocked-provider tests for every AI adapter
- solver-run artifact round-trip and replay-verification tests
- deployment smoke tests for health/auth/basic capability paths
- browser/native/server parity smoke tests where the same contracts cross runtimes

### Privacy and Retention

- define exactly what a solver-run artifact stores
- define redaction rules for logs and artifacts
- ensure secrets and provider credentials never appear in logs, artifacts, or error bodies
- document artifact retention windows for local, hosted, and support workflows
- make export/import behavior explicit so users understand what they are sharing

### Versioning Policy

- version backend request/response contracts explicitly
- version solver-run artifacts explicitly
- define compatibility policy between frontend, backend, and engine contract versions
- treat breaking contract changes as intentional migrations, not casual refactors
- define rollback expectations when a new contract version is deployed and then reverted

### Security Baseline

- environment-specific CORS policy
- API key / token scope model
- rate limiting and abuse controls
- secret rotation expectations
- audit logging for hosted/team workflows
- fail-safe behavior when auth/config is missing or invalid

### Storage Decisions

- local persistence boundary: IndexedDB vs local filesystem vs desktop file export
- hosted persistence boundary: metadata store vs blob store
- artifact deduplication policy
- separation between OSS/local storage expectations and hosted/private storage layers

### Cost Controls

- per-capability timeout ceilings
- per-provider token/model ceilings
- model routing by quality/cost class
- fallback rules when the preferred provider fails or is too expensive
- hosted budget controls before broad AI rollout

### Operational Targets

- define latency targets per capability
- define acceptable provider failure behavior
- define replay success expectations for solver-run artifacts
- define basic availability targets before firms depend on hosted workflows

## Ownership and Operations

Infrastructure work should have explicit ownership, even in a small team.

At minimum, define who owns:
- deploys and rollback execution
- provider outage response
- artifact retention policy
- contract/schema migrations
- support replay flows
- production secret rotation

If ownership is shared, write down the handoff rules instead of assuming them.

## Production Readiness Checklist

Before calling a hosted infrastructure surface production-ready, it should have:

- health checks
- request IDs
- structured logs
- timeout and retry policy
- rate limiting
- startup config validation
- secret-management story
- replay/artifact round-trip verification
- rollback tested at least once
- basic backup/restore story for persisted hosted state

## Environment Matrix

Infrastructure should be designed explicitly for these environments:

- `local dev`
  Fast iteration, mocked providers where useful, low ceremony.

- `preview / PR`
  Smoke-test deployments for API, auth, and capability contract checks.

- `staging`
  Production-shaped config and routing with safe data boundaries.

- `production`
  Strict secrets, logging, alerting, retention, and rollback discipline.

- `desktop / local-only`
  Same contracts, different persistence/runtime assumptions.

- `private / on-prem` later
  Provider substitution, local persistence, and enterprise controls without forking contracts.

## What Infrastructure Must Not Do Yet

- do not split into premature microservices
- do not fork desktop into a separate product
- do not bake provider-specific logic into product-facing capability contracts
- do not add heavy workflow engines before real batch demand exists
- do not make hosted/private persistence a hidden requirement for core OSS contracts

## Stages

### Stage 1 — Service Foundations

Goal: establish a minimal but production-shaped backend surface.

**What:**
- backend workspace layout and shared contracts with `engine/`
- configuration via env
- auth middleware
- health endpoint
- provider abstraction for AI capabilities
- first capability endpoint (`review-model`)
- clean error mapping and HTTP boundaries

**Done when:**
- service boots locally with one command
- auth works consistently
- provider selection is env-driven
- one AI capability is live behind a stable request/response contract

### Stage 2 — Reproducibility and Supportability

Goal: make solver runs attachable, replayable, and debuggable across product and support workflows.

**What:**
- stable solver-run artifact contract
- build/version metadata in artifacts
- output fingerprints for replay verification
- artifact capture on solve
- export/import flow for bug reports
- support/reviewer replay flow
- request IDs and traceable logs

**Done when:**
- a user can attach a solver run to a bug report
- support can replay the same artifact deterministically
- backend logs can correlate request ID, provider, model, and artifact metadata

### Stage 3 — Trust and Observability

Goal: make backend and solver-powered workflows observable enough for real use.

**What:**
- structured request logging
- per-capability latency/error metrics
- provider failure classification
- rate limiting
- timeouts and retry policy by provider
- startup validation for config/provider/API keys
- audit-safe logging policy

**Done when:**
- failures are diagnosable without guessing
- provider outages degrade clearly
- abusive traffic is bounded
- config mistakes fail fast at startup

### Stage 4 — Local Persistence and Desktop Packaging

Goal: support offline-heavy and desktop-heavy workflows without forking the product.

**What:**
- IndexedDB/local artifact persistence
- artifact export/import from the UI
- Tauri desktop packaging
- local file integration
- shared contracts between browser and desktop
- native settings / update flow

**Done when:**
- a user can capture and reopen artifacts locally
- desktop uses the same product surface and contracts as web
- offline review/debug flows are practical

### Stage 5 — Native / Server Solve Path

Goal: establish a first maintained non-browser execution path for heavy or long-running work.

**What:**
- named native/server execution path
- shared input/output contracts with WASM/browser
- backend solve endpoint or worker path for long-running jobs
- runtime parity checks between browser and native/server
- documented solve routing rules

**Done when:**
- at least one native/server path is maintained and tested
- heavy models have a documented recommended runtime
- browser/native results match on representative workflows

### Stage 6 — Batch and Job Orchestration

Goal: enable workloads that are too large or too numerous for interactive-only execution.

**What:**
- job queue
- worker execution model
- artifact-backed batch runs
- retryable long-running jobs
- progress reporting
- cancellation
- scenario sweeps / comparison jobs
- idempotency and replay semantics
- dead-letter / failed-job handling

**Done when:**
- batch runs do not depend on a browser tab staying open
- long-running jobs are observable and cancellable
- product can request comparison/batch workflows through stable APIs

### Stage 7 — AI Capability Platform

Goal: turn one-off AI endpoints into a real capability layer with frontend integration.

**What:**
- separate capability endpoints, each with its own contract:
  - `review-model` — DONE. Consumes `SolverRunArtifact`, returns structured findings.
  - `explain-diagnostic` — takes `DiagnosticCode` + context, returns plain-language explanation and fix steps.
  - `build-model` — takes natural language description, returns model JSON (nodes, elements, materials, supports, loads).
  - `interpret-results` — takes `ResultSummary` + user question, returns assessment with code reference.
  - `section-optimizer` — iterates steel profiles to find lightest section meeting constraints (solver-in-the-loop, later).
  - `suggest-loads` — suggests load combinations from code (CIRSOC) given building type and location (later).
  - `generate-report` — takes solver output, produces structured engineering report (later).
- frontend integration for each capability:
  - post-solve "Revisar modelo" button + findings panel with node/element highlighting
  - diagnostic badge click → AI explanation tooltip/panel
  - toolbar chat/command input → natural language model builder
- provider-agnostic routing (6 providers already in place)
- per-capability model selection
- test/provider stubs (stub provider already working)
- capability-level evals and traces

**Done when:**
- capabilities are distinct contracts, not prompt modes hidden behind one endpoint
- frontend surfaces AI results inline (not a separate page)
- provider swaps do not change product-layer APIs
- eval/tracing exists per capability

### Stage 8 — Firm and Team Infrastructure

Goal: support office workflows, review flows, and hosted/private value layers.

**What:**
- artifact/history retention policies
- project-scoped review records
- office templates and standards storage
- permissions and tenancy
- admin controls
- usage tracking and quotas

**Done when:**
- teams can use shared workflows safely
- private/hosted features sit on explicit infrastructure boundaries
- enterprise controls do not distort the core product architecture

### Stage 9 — Deployment Discipline and Resilience

Goal: stop infrastructure quality from depending on luck and local setup.

**What:**
- environment matrix: local, preview, staging, production, desktop/local-only, and later private/on-prem
- environment promotion rules
- migration/version discipline
- secret management
- rollback playbooks
- deployment health gates
- backup/restore for persisted hosted state

**Done when:**
- deployments are repeatable
- rollbacks are predictable
- production changes are traceable and reversible

## Near-Term Priority

The next infrastructure sequence should be:

1. add `explain-diagnostic` and `build-model` backend capabilities (same pattern as `review-model`)
2. frontend integration: post-solve review button, diagnostic explanations, model builder input
3. finish `Stage 2` product-side flows for solver-run artifacts
4. harden `Stage 3` observability/rate-limit/config validation
5. add `interpret-results` capability
6. only then broaden into desktop persistence and native/server solve packaging

## What This Unblocks

- reproducible bug reports
- support and reviewer replay workflows
- provider-agnostic AI services
- safer hosted/private product layers
- desktop and native/server parity
- future batch, optimization, and cloud comparison workflows
