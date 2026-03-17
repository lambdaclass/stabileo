# Dedaliano Infrastructure Roadmap

## Purpose

This is the infrastructure roadmap: backend services, deployment, runtime environments, auth, persistence, observability, reproducibility, and operational tooling. It is not the solver mechanics roadmap or the product UX roadmap.

See also:
- [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- [`PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md)
- [`AI_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/AI_ROADMAP.md)
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
- 4 AI capability endpoints — all authenticated, with timeout guards:
  - `review-model` — verified end-to-end with Kimi and GPT-4o
  - `explain-diagnostic` — diagnostic code explanation and fix steps
  - `build-model` — natural language to model JSON
  - `interpret-results` — result-question answering with code references
- provider timeout guard (configurable via `PROVIDER_TIMEOUT_SECS`, default 90s)
- 49 contract tests (response parsing, malformed/refusal cases, stub provider integration — across all 4 capabilities)
- reusable solver-run artifact contract at the engine layer
- containerized local/proxy setup (`Dockerfile`, `docker-compose.yml`, `nginx.conf`)
- local developer bootstrap helpers (`Makefile`, `flake.nix` — verified working)

Not yet complete:
- frontend integration for remaining AI capabilities (Explain, Query, Build tabs — placeholders exist)
- input validation and request size limits
- rate limiting and abuse controls
- AI output validation (generated model JSON must be validated before import)
- persistent artifact capture/export/import flows
- replay/support workflows
- production observability beyond basic tracing
- request IDs and structured logging
- startup config validation
- native/server solve packaging
- batch execution and job orchestration
- multi-environment deployment discipline

The live near-term blockers are now:
- abuse and security hardening for AI-facing routes — before any broader rollout
- frontend integration for remaining AI capabilities (Query, Explain, Build tabs)
- input validation, request size limits, and abuse controls for AI and artifact flows
- product-side solver-run artifact capture, storage, export/import, and replay flows
- backend observability, rate limiting, and startup validation
- a documented path from browser-only execution to native/server and batch execution without forking contracts

## ASAP Infrastructure Work

Before broadening the infrastructure into heavier deployment, batch, or team workflows, the following items should land because they shape every later stage:

1. `Treat abuse and security as a first-class concern` — NOT DONE. Add strict input limits, rate limiting, timeout/cost ceilings, auth hardening, validation/sanitization, abuse-aware logging, safe AI output handling, CORS discipline, storage/privacy controls, and incident response paths now, not later.
2. `Capture solver-run artifacts in product flows` — STILL OPEN. The engine-level artifact contract exists; the app still needs solve-time capture, export/import, and replay wiring.
3. `Make backend failures diagnosable` — PARTIALLY DONE. Error mapping and a health route exist, but request IDs, structured logs, metrics, and clear provider-failure classification still need to be hardened.
4. `Fail fast on config/provider mistakes` — PARTIALLY DONE. Env-based config exists, but startup validation and clearer invalid-provider / missing-key behavior should be treated as a first-class operational requirement.
5. `Bound hosted AI risk` — PARTIALLY DONE. Timeout guards exist, but rate limiting, retry policy, token ceilings, per-request budget limits, and fallback rules still need to be added.
6. `Keep AI capability contracts clean` — DONE. Four capabilities ship as separate endpoints with distinct contracts: `review-model`, `explain-diagnostic`, `build-model`, `interpret-results`.
7. `Keep runtime environments aligned` — NOT DONE. Browser, desktop, native/server, and batch execution still need an explicit parity and routing story.

## Near-Term Task List

These are the next concrete infrastructure tasks in execution order:

1. `Provider timeout guard` — DONE. Configurable timeout on all 4 capability endpoints.
2. `Capability contract tests` — DONE. 49 tests across all 4 capabilities (parsing, malformed, stub integration, serialization).
3. `Explain-diagnostic capability` — DONE. Backend endpoint with contract tests.
4. `Build-model capability` — DONE. Backend endpoint with model JSON validation and contract tests.
5. `Interpret-results capability` — DONE. Backend endpoint with contract tests.
6. `Input validation and request size limits` — NOT DONE. Max body size, max artifact size, max prompt/context length, max elements/nodes in AI requests. See Abuse and Security section.
7. `Rate limiting and abuse controls` — NOT DONE. Per-IP, per-key, per-capability. Stricter on expensive AI routes. See Abuse and Security section.
8. `AI output validation` — NOT DONE. Generated model JSON from `build-model` must be validated/sanitized before frontend import. AI text output is advisory only.
9. `Request IDs and structured request logging` — NOT DONE.
10. `Startup validation for provider/config/API keys` — NOT DONE.
11. `Review-model frontend integration` — DONE. Stabileo AI right-side drawer with Review tab, risk chip, finding cards with severity badges, zoom-to-issue, regenerate button.
12. `Query/Explain/Build frontend tabs` — NOT STARTED. Drawer tabs exist as placeholders, need wiring to backend endpoints.
13. `Solve-time artifact capture in product` — NOT STARTED.
14. `Artifact export/import and local persistence` — NOT STARTED.
15. `Replay/support flow on top of artifacts` — NOT STARTED.
16. `Storage boundary decision` — NOT STARTED. Define local vs hosted artifact storage explicitly.
17. `API/artifact versioning policy` — NOT STARTED. Define compatibility and migration rules.
18. `Named native/server solve path` — NOT STARTED.
19. `Browser/native parity smoke coverage` — NOT STARTED.
20. `Worker/job model for long-running tasks` — NOT STARTED.
21. `Batch execution with progress/cancellation` — NOT STARTED.
22. `Deployment promotion/rollback discipline` — NOT STARTED.

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

See the full [Abuse and Security](#abuse-and-security) section below for the detailed threat model, controls, and implementation priority.

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

## Abuse and Security

This is a first-class infrastructure concern, not a later-stage polish item. The backend exposes AI-powered endpoints that call paid provider APIs. Attackers will try prompt injection, cost exhaustion via giant payloads, malicious model generation, repeated expensive calls, and attempts to exfiltrate system prompts or internal data.

The practical rule: validate input, bound cost, limit rate, log safely, treat AI output as untrusted.

### 1. Strict Input Limits

- **Max request body size** — enforce at the HTTP layer (Axum/tower). Reject before deserialization.
- **Max artifact size** — `SolverRunArtifact` payloads for `review-model` should have an explicit byte ceiling.
- **Max prompt/context length** — `build-model` description, `interpret-results` question, `explain-diagnostic` context fields should be bounded.
- **Max elements/nodes/results in AI requests** — prevent sending a 50,000-element model to `review-model`. Define per-capability limits and reject early.

### 2. Rate Limiting

- **Per IP** — basic flood protection at the HTTP layer.
- **Per API key** — the real rate-limit dimension for authenticated callers.
- **Per capability** — `build-model` and `review-model` are expensive (high token count); `explain-diagnostic` is cheap. Rate limits should reflect cost.
- **Stricter on expensive routes** — AI review of a large model costs 10-100x more than a diagnostic explanation. Rate limits and burst allowances should differ accordingly.
- **Backpressure signaling** — return `429 Too Many Requests` with `Retry-After` header so clients can back off cleanly.

### 3. Timeouts and Cost Ceilings

- **Provider timeout** — DONE. Configurable via `PROVIDER_TIMEOUT_SECS`, default 90s.
- **Token ceilings** — set `max_tokens` per capability (already done in prompts). Also enforce a hard ceiling on input tokens by estimating before sending.
- **Per-request budget limits** — reject requests whose estimated token cost exceeds a configurable threshold.
- **Provider fallback rules** — define behavior when the preferred provider is down, slow, or over budget. Degrade to a cheaper model, return a clear error, or queue for retry — never silently burn money on retries to an expensive provider.

### 4. Authentication Hardening

- **Rotate keys** — define a rotation cadence. Current single `DEDALIANO_API_KEY` is a bootstrap mechanism, not a long-term auth model.
- **Separate dev/staging/prod keys** — never share credentials across environments.
- **Scoped tokens (later)** — move from one global bearer to per-user or per-team tokens with capability scopes.
- **Key revocation** — ability to revoke a compromised key immediately without redeploying.

### 5. Validation and Sanitization

- **Reject malformed/oversized artifacts** — deserialize into typed structs (already done), but also enforce size and structural limits before the AI call.
- **Reject unsupported schema versions** — when versioned contracts land, reject unknown or too-old versions explicitly.
- **Never trust frontend-provided metadata blindly** — model counts, solver paths, and diagnostic codes should be re-derived or validated, not taken at face value from the request.

### 6. Abuse-Aware Logging

- **Request IDs** — every request gets a UUID, propagated to provider calls and responses. NOT DONE yet.
- **Structured fields** — log provider, model, capability, latency, input/output tokens, error class, HTTP status.
- **Never log secrets** — API keys, bearer tokens, and provider credentials must never appear in logs, error bodies, or artifacts.
- **Never log full sensitive payloads by default** — log sizes and metadata, not full artifact JSON or AI responses. Enable verbose logging only in dev/debug modes.
- **Detect abuse patterns** — repeated 429s from one key, sudden token-count spikes, requests with suspiciously large payloads.

### 7. Safe AI Output Handling

- **Never let model output directly execute actions** — AI responses are data, not commands. No `eval()`, no direct code execution.
- **Generated model JSON must be validated before import** — `build-model` returns a `Value`; the frontend must validate it against the `ModelSnapshot` schema before loading. Malicious or malformed JSON from the AI should be caught and rejected.
- **Explanations and reviews are advisory, not authoritative** — the UI must make this clear. AI output should never override solver results or bypass safety checks.
- **Strip or escape AI output in UI rendering** — prevent XSS if AI returns HTML/script fragments in text fields.

### 8. CORS and Origin Policy

- **Tight allowlist in production** — only `stabileo.com`, `dedaliano.com`, and explicitly listed origins.
- **No wildcard convenience in hosted mode** — `Access-Control-Allow-Origin: *` is acceptable only in local dev, never in staging or production.
- **Review CORS config on every deployment** — treat origin policy as a security-critical config, not a convenience toggle.

### 9. Storage and Privacy Controls

- **Retention windows** — define how long artifacts, logs, and AI request/response records are kept in each environment.
- **Export/import clarity** — users must understand what data leaves the system when they export an artifact or share a bug report.
- **Redaction for hosted bug-report artifacts** — strip or redact sensitive fields (user-provided context, custom notes) before artifacts leave the user's control.
- **No ambient data collection** — do not send telemetry, model data, or usage metrics to third parties without explicit user consent.

### 10. Incident Handling

- **Detect abuse patterns** — automated alerts for token-count spikes, repeated failures, unusual request volumes.
- **Temporarily disable a provider/capability** — feature flags or config toggles to turn off a specific AI capability or provider without redeploying.
- **Revoke keys** — immediate key revocation path, documented and tested.
- **Degrade gracefully instead of going down** — if AI providers are unavailable, the solver, model editor, and all non-AI workflows must continue working. AI features show clear "unavailable" state, not broken UI.
- **Post-incident review** — document what happened, what was exploited, and what changed. Treat security incidents as learning events, not blame events.

### AI-Specific Threat Model

Assume attackers will attempt:

| Attack | Mitigation |
|--------|------------|
| Prompt injection (manipulate AI behavior via crafted input) | Input length limits, structured prompts with clear boundaries, never embed raw user input in system prompts without framing |
| Giant payloads for cost exhaustion | Request body size limits, per-capability token ceilings, rate limiting |
| Malicious model JSON generation | Validate `build-model` output against ModelSnapshot schema before import, reject unknown fields |
| Repeated expensive calls | Per-key and per-capability rate limits, backpressure via 429 |
| System prompt exfiltration | System prompts are not secret (they're in the codebase), but do not echo them in responses. AI responses are parsed into structured fields, not returned raw |
| Internal data exfiltration via AI | AI capabilities receive only the data explicitly passed in the request. No ambient access to other users' data, server state, or provider credentials |

### Implementation Priority

These should land roughly in this order:

1. **Request body size limit** — tower middleware, single line of config. Blocks the cheapest attack.
2. **Per-capability input field limits** — validate before calling the provider. Prevents cost exhaustion.
3. **Request IDs** — needed for all abuse detection and logging.
4. **Rate limiting** — per-key, per-capability. Use `tower-governor` or equivalent.
5. **AI output validation for `build-model`** — validate generated model JSON before frontend import.
6. **Structured logging** — provider/model/tokens/latency/error-class per request.
7. **Startup config validation** — fail fast on missing keys, invalid provider names.
8. **Scoped tokens and key rotation** — replace single global bearer.
9. **Provider disable toggles** — feature flags for incident response.
10. **Abuse pattern detection** — alerting on anomalous traffic.

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

Current status: MOSTLY DONE. Backend workspace, provider abstraction, auth, health, timeout guard, and first capability endpoint exist and are locally verified. Remaining work is startup validation, stronger structured logging, and broader capability/contract hardening.

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

Current status: PARTIALLY DONE. The engine-level artifact contract exists, but product capture/export/import/replay flows and request-linked support tooling do not.

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

Current status: EARLY. Basic health/error mapping exists, but request IDs, structured logs, metrics, rate limiting, retry policy, and startup validation are still missing.

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

Current status: NOT STARTED. Some local/container setup exists, but artifact persistence and desktop packaging are not yet integrated as user workflows.

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

Current status: NOT STARTED. The contracts point in this direction, but there is no named maintained path yet.

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

Current status: NOT STARTED.

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

### Stage 7 — AI Service Runtime

Goal: keep the AI service safe, observable, provider-agnostic, and product-ready as capabilities expand.

Current status: PARTIALLY DONE. The backend AI service is real and tested, but rollout controls, observability, request governance, and frontend/product integration are still incomplete.

**What:**
- separate capability endpoints with stable contracts
- provider-agnostic routing and model selection
- timeout guards, retry policy, and cost ceilings
- per-capability feature flags and rollout controls
- request IDs, structured logs, metrics, and traces
- provider outage handling and kill switches
- artifact-aware request validation and schema/version checks
- frontend/product wiring on top of the same stable APIs
- capability-level evals and traces

AI capability order, build-model scope, and capability-specific product behavior live in:
- [`AI_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/AI_ROADMAP.md)

**Done when:**
- capabilities remain distinct contracts, not prompt modes hidden behind one endpoint
- provider swaps do not change product-layer APIs
- rollout/kill-switch controls exist per capability and provider
- eval/tracing exists per capability
- the AI service can degrade safely under provider outages, abuse, or budget pressure

### Stage 8 — Firm and Team Infrastructure

Goal: support office workflows, review flows, and hosted/private value layers.

Current status: NOT STARTED.

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

Current status: EARLY. Local container/Nix/dev bootstrap exists, but promotion rules, migration/rollback discipline, and production-ready health gates are still open.

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

1. ~~add `explain-diagnostic`, `build-model`, `interpret-results` backend capabilities~~ — DONE. All 4 AI capabilities are live with 49 contract tests.
2. ~~frontend integration: review-model~~ — DONE. Stabileo AI drawer with Review tab, tested end-to-end with GPT-4o.
3. frontend integration: wire remaining drawer tabs (Query, Explain, Build) to existing backend endpoints
4. add input validation, request size limits, and per-capability field bounds — blocks cheapest attacks before broadening usage
5. add rate limiting (per-key, per-capability) and request IDs — required before any production traffic
6. add AI output validation for `build-model` — generated model JSON must be validated before frontend import
7. finish `Stage 2` product-side flows for solver-run artifacts
8. harden `Stage 3` observability/startup validation/structured logging
9. define storage boundary and API/artifact versioning policy
10. only then broaden into desktop persistence and native/server solve packaging

## What This Unblocks

- reproducible bug reports
- support and reviewer replay workflows
- provider-agnostic AI services
- safer hosted/private product layers
- desktop and native/server parity
- future batch, optimization, and cloud comparison workflows
