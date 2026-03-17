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

## Current Status

Already in place:
- browser-first main app
- Rust solver through WASM
- first backend AI service foundation
- provider-agnostic AI adapter layer
- authenticated `review-model` endpoint
- reusable solver-run artifact contract at the engine layer

Not yet complete:
- persistent artifact capture/export/import flows
- replay/support workflows
- production observability and rate limiting
- native/server solve packaging
- batch execution and job orchestration
- multi-environment deployment discipline

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

Goal: turn one-off AI endpoints into a real capability layer.

**What:**
- separate capability endpoints:
  - `review-model`
  - `explain-diagnostic`
  - `query-results`
- provider-agnostic routing
- per-capability model selection
- test/provider stubs
- capability-level evals and traces

**Done when:**
- capabilities are distinct contracts, not prompt modes hidden behind one endpoint
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

1. finish `Stage 2` product-side flows for solver-run artifacts
2. harden `Stage 3` observability/rate-limit/timeout/config validation
3. keep `Stage 1` AI capability contracts clean while adding `explain-diagnostic`
4. only then broaden into desktop persistence and native/server solve packaging

## What This Unblocks

- reproducible bug reports
- support and reviewer replay workflows
- provider-agnostic AI services
- safer hosted/private product layers
- desktop and native/server parity
- future batch, optimization, and cloud comparison workflows
