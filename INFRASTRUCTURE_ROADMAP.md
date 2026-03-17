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
- artifact-backed batch runs
- retryable long-running jobs
- progress reporting
- cancellation
- scenario sweeps / comparison jobs

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
