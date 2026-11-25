# Stabileo Infrastructure Roadmap

> **Updated 2026-11-22.** Re-aligned to the live Elixir/Phoenix umbrella backend (`backend/`), Caddy edge (`infra/caddy/Caddyfile`), planned retirement of the legacy Rust/Axum AI service (`ai-backend/`), and Waves 1–3 of [`high_leverage_solver_and_product_plan.md`](../research/high_leverage_solver_and_product_plan.md). The prior October 2026 Axum-era snapshot is preserved verbatim in [`docs/archive/roadmap/INFRASTRUCTURE_AXUM_2026_10.md`](../archive/roadmap/INFRASTRUCTURE_AXUM_2026_10.md).

## Purpose

This is the infrastructure roadmap: backend services, edge hosting and headers, authentication, storage, certificate-signing and offline verification infrastructure, observability, reproducibility, desktop/native runtimes, and operational tooling. It is not the solver mechanics roadmap or the product UX roadmap.

See also:
- [`README.md`](README.md) — roadmap entry point
- [`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md) — soundness-first priorities and product backlog
- [`SOLVER_ROADMAP.md`](SOLVER_ROADMAP.md) — solver mechanics and high-leverage solver tracks
- [`AI_ROADMAP.md`](AI_ROADMAP.md) — AI capabilities, ecosystem-first MCP/Python track, and safety rules
- [`specs/backend.md`](../../specs/backend.md) and [`specs/services/`](../../specs/README.md) — Elixir/Phoenix umbrella architecture and service contracts (`accounts`, `admin`, `projects`, `insights`, `marketing`)
- [`research/high_leverage_solver_and_product_plan.md`](../research/high_leverage_solver_and_product_plan.md) — Waves 0–4 architecture plan
- [`research/ai_provider_architecture.md`](../research/ai_provider_architecture.md)
- [`research/open_source_vs_hosted_ai_boundary.md`](../research/open_source_vs_hosted_ai_boundary.md)

## Principles

1. **Browser-first Rust/WASM solver; backend owns identity, persistence, and trust services**
   The core solver runs locally in the browser as WASM (and locally in CLI / `stabileo-mcp` / PyO3 / Tauri). The backend never solves routine models: it owns accounts, cloud persistence, authenticated timestamped digest attestation + transparency logging, shared snapshots, billing, collaboration, and—later—opt-in batch/heavy server compute.

2. **Zero-upload privacy by default**
   NDA engineering models stay on the engineer's machine for core solving, ETABS/SAP2000 second-opinion audits, offline verification (`verify.stabileo.com`), and default local stdio `stabileo-mcp`. Hosted storage, remote MCP, and model sharing are explicit opt-in actions (private by default).

3. **Backend-controlled, provider-agnostic AI**
   Hosted AI features call Stabileo backend capability contracts, not vendor SDKs directly (outside any explicit BYO-key local mode).

4. **One contract, many runtimes**
   Browser WASM, Tauri desktop, local CLI / MCP / Python, and native/server batch workers share one versioned engine and artifact contract ([`#731`](https://github.com/lambdaclass/stabileo/issues/731)).

5. **Reproducibility before scale**
   Captured solver-run artifacts, provenance metadata, deterministic replay, and verifiable signatures matter before complex distributed orchestration.

6. **Operational simplicity first**
   Keep one Elixir/Phoenix umbrella + PostgreSQL + Caddy edge clean and observable before splitting services or adding premature platform layers.

## Current Infrastructure Surface (2026-11-22)

### Already in place

- **Web & edge hosting (`infra/caddy/Caddyfile`):**
  - Caddy serves static builds for `{$APP_DOMAIN}` (`live/frontends/app`) and the separate admin site `{$ADMIN_DOMAIN}` (`live/frontends/admin`), reverse-proxying `/api/*` to the Phoenix backend (`127.0.0.1:4100`, multi-instance `4100 + INST*10`).
  - Compression is already live: `encode zstd gzip` plus `file_server { precompressed br }` on static assets and fallback routes.
  - Cache discipline is live: immutable 1-year `Cache-Control` on `/assets/*` and `/research-wasm/builds/*`; `no-cache` on HTML and unhashed research manifests.
  - Security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `-Server`) and 8-locale routing (`en/es/pt/de/fr/tr/hu/zh`) are live.
- **Primary SaaS backend (`backend/` — Elixir/Phoenix umbrella + PostgreSQL; see [`specs/backend.md`](../../specs/backend.md)):**
  - Single `StabileoWeb.Endpoint` routing to umbrella apps:
    - `stabileo_repo`: Ecto Repo, all schemas/migrations, runtime feature switches (`system_settings`), migration safety checks.
    - `stabileo_utils`: controller macros, `FallbackController`, `config/runtime.exs` env discipline (`StabileoUtils.fetch_env!/2`, enforced by Credo `NoRawEnv`), `VersionHeader`, `BuildInfo`, in-memory IP `RateLimit` plug.
    - `stabileo_auth`: Google OAuth sign-up/sign-in with PKCE-style attempt verifier, `app: "app"` vs `app: "admin"` JWT isolation (15-min HS256 access tokens, row-locked rotating refresh tokens), Google Workspace domain + `admin_allowed_emails` allowlist re-checked on every admin request, append-only `consents` and transactional `admin_actions` audit log (`specs/services/accounts.md`, `specs/services/admin.md`).
    - `stabileo_projects`: per-account cloud `.ded` saves stored gzipped in PostgreSQL `bytea` (5 MB compressed / 50 MB inflated ceiling, optimistic locking on `revision`, advisory-locked per-account limit; `specs/services/projects.md`).
    - `stabileo_insights`: anonymous rate-limited (`30 batches/min/IP`) usage event ingestion with 13-month daily retention (`StabileoInsights.Retention`), authenticated feedback inbox, admin metrics (`specs/services/insights.md`).
    - `stabileo_marketing`: consent-gated attribution (`signup_sources`, `account_milestones`, `account_active_days`) and Oban-backed Meta Conversions API delivery (`ad_conversions` queue with `Lifeline` rescue; `specs/services/marketing.md`).
  - All user-facing hosted features sit behind live runtime switches in `system_settings` (`user_login_enabled`, `usage_telemetry_enabled`, `cloud_projects_enabled`, `save_requires_account`, `cloud_projects_limit`), toggled from the admin site without redeploying.
- **Legacy AI service (`ai-backend/` — Rust/Axum, scheduled for migration and deletion):**
  - Provider-agnostic adapter layer (Claude, OpenAI, DeepSeek, Mistral, Kimi, Gemini), tool-calling contract, 90s provider timeout guard, 75 contract tests, and 4 capability endpoints (`review-model`, `explain-diagnostic`, `build-model`, `interpret-results`), with Review and Build wired in the frontend drawer.
  - **Migration rule (`CLAUDE.md`, `specs/backend.md`):** `ai-backend/` is legacy. Port AI capability routes into a dedicated Elixir app under `backend/apps/` so auth, rate limiting, runtime kill switches, secrets, and audit logging share the single Phoenix backend, then delete `ai-backend/`.
- **Engine, dev & CI foundation:**
  - Rust solver (`engine/`) compiled to WASM as the sole production solve path; reusable engine-level solver-run artifact contract.
  - Reproducible Nix + `Makefile` developer environment; self-hosted CI runner pools and merge-queue workflows (tracked in [`testing/ROADMAP.md`](../../testing/ROADMAP.md#ci-and-feedback-loop-2026-11-04)).

### Open infrastructure gaps

- **Edge & WASM delivery:** WASM binary slimming (`wasm-opt`, streaming compile, CI size gate [`#1072`](https://github.com/lambdaclass/stabileo/issues/1072)); CDN decision (Cloudflare proxy + HTML edge cache purge on deploy); COOP/COEP cross-origin isolation headers if/when WASM `SharedArrayBuffer` threads are enabled.
- **Wave 2 trust & sharing infrastructure:**
  - Isolated static origin for **`verify.stabileo.com`** (<150 KB offline `certcheck` WASM verifier + embedded timestamped advisory/revocation snapshots + unauthenticated public advisory/revocation JSON feed).
  - **Authenticated timestamped digest attestation & key management** in `backend/` (Ed25519 attestation binding signer identity, server timestamp, key ID, and canonicalized report/bundle SHA-256 digest into an append-only transparency log with zero model upload, plus key rotation and published JWKS/revocation feeds) alongside per-firm PKI.
  - **Object storage (S3 / Cloudflare R2)** replacing Postgres `bytea` for cloud projects (`specs/services/projects.md`) and immutable shared models (`stabileo.com/m/<id>`, `model_revisions`, `shares`, `forks`), plus DNS/origin setup for `snapshots.stabileo.com` ([`#777`](https://github.com/lambdaclass/stabileo/pull/777)).
  - **Opt-in remote `stabileo-mcp` tier** (scoped tokens, tenant isolation, quotas, explicit upload consent — behind the 100% local stdio default).
- **AI runtime migration & abuse hardening:** port `ai-backend/` into `backend/` with per-account/per-capability rate limits, token/cost ceilings, strict payload bounds, `build-model` output schema validation, request IDs, structured logs, and per-provider kill switches in `system_settings`.
- **Observability, operations & staging:** Sentry/PromEx metrics & alerting, staging-before-production promotion ([`#385`](https://github.com/lambdaclass/stabileo/issues/385)), Ansible/Caddy deploy & tested rollback playbooks, backup/restore drills for PostgreSQL and object storage.
- **Reproducibility & later runtimes:** product-side solver-run artifact capture/export/replay flows, Tauri desktop packaging ([`#728`](https://github.com/lambdaclass/stabileo/issues/728)), versioned native/server solve path ([`#731`](https://github.com/lambdaclass/stabileo/issues/731)), Oban/worker batch orchestration, and multi-tenant organizations/roles (`specs/backend.md` "Not yet ported from scasaas").

## Wave 1–3 Infrastructure Tracks

Aligned strictly behind Wave 0 soundness closure ([`PRODUCT_ROADMAP.md`](PRODUCT_ROADMAP.md#overall-order)):

### Wave 1 — WASM Delivery & Edge Readiness
- **WASM build & streaming pipeline (`#1072`):** determinism-gated `wasm-opt`, `WebAssembly.instantiateStreaming`, release-profile enforcement for app WASM (`#1466`), and CI WASM size gate.
- **Cross-Origin Isolation (conditional on WASM threads):** if `SharedArrayBuffer` / Web Worker threads are enabled for parallel WASM assembly/factorization, add `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` in `infra/caddy/Caddyfile` only after verifying compatibility with Google OAuth popups (`/google` -> `/oauth-callback.html`), embedded viewers, and `snapshots.stabileo.com`.
- **CDN & static caching:** resolve Cloudflare proxy / edge-HTML caching with automated purge on deploy; verify long-lived caching on static fonts and icons alongside `/assets/*`.

### Wave 2 — Verification Portal, Signing, Object Storage & Remote MCP
- **`verify.stabileo.com` (Offline Verification Portal — `#499`, `#346`):**
  - Static isolated origin serving the <150 KB `certcheck` WASM module, strict CSP (`default-src 'self'`, `connect-src` restricted to the public read-only advisory/revocation feed only when the user opts into an online freshness check), and embedded timestamped advisory + key-revocation snapshots.
  - **Zero-upload signing & attestation trust model:**
    - *Authoritative engineering proof (`certcheck`):* mathematical soundness and certified solver/design bounds are proved **solely** by `certcheck` WASM re-verifying the embedded proof bundle against the report's bound values — never by a signature alone.
    - *Tamper-evident authorship & timestamping (no blind signing oracle):* a server signing arbitrary client-supplied hashes would act as a signing oracle, so attestation is explicitly bound to signer identity, server timestamp, and an append-only transparency log:
      - *Per-firm / engineer PKI (self-sovereign):* firms sign the canonicalized report + bundle digest (excluding the embedded QR/signature placeholder region) with their own keys; zero data leaves the machine and `verify.stabileo.com` checks against the firm's public key.
      - *Authenticated timestamped digest attestation (zero-upload hosted option):* the browser canonicalizes the report + bundle (excluding the QR/signature placeholder region), computes its SHA-256 digest locally, and sends only the digest to an authenticated `backend/` endpoint. The server constructs and Ed25519-signs a canonical attestation statement binding `(account_or_firm_id, server_timestamp, key_id, canonical_digest)` — never unsigned loose metadata — and appends it to a verifiable transparency log. Re-signing a modified report produces a distinct logged entry under the signer's identity rather than silently overwriting the original; `verify.stabileo.com` displays the signer identity, timestamp, and transparency-log proof alongside the `certcheck` verdict.
    - *Revocation & advisory freshness:* offline verification checks signature validity and advisory/revocation status against the embedded timestamped snapshot and explicitly labels current status as `snapshot-dated (<date>)` until an optional online-only fetch refreshes the public advisory & key-revocation feeds.
- **Object Storage Migration (S3 / R2) for Cloud Projects & `stabileo.com/m/<id>`:**
  - Migrate `.ded` gzipped payloads out of PostgreSQL `projects.content` (`bytea`) to S3/R2 while keeping Postgres as the metadata, revision, permission, and concurrency-invariant store (`projects`, `model_revisions`, `shares`, `forks`).
  - Enforce content-type/gzip inflation caps before storage, private-by-default ACLs, hard deletion on share revocation, and XSS/untrusted-text sanitization for all shared model fields.
  - Provision DNS and isolated origin for `snapshots.stabileo.com` (`#777`).
- **Opt-in Remote `stabileo-mcp` Tier:**
  - Keep local stdio `stabileo-mcp` as the zero-upload default for NDA models.
  - For the opt-in authenticated remote MCP endpoint: issue revocable scoped API tokens (`stabileo_auth`), enforce per-account quotas and request limits, isolate tenant scratch state, log structured audit events without persisting model payloads unless explicitly saved, and require explicit client consent before uploading model data.

### Wave 3 — Heavy Compute, Batch Orchestration & Team Tenancy
- **Sandboxed native/server solve workers:** expose the same versioned engine interface (`#731`) for >100k-DOF solves, large SOCP/CBFEM/pushover sweeps, and public challenge grading inside resource-capped, network-isolated sandboxes (CPU/RAM/wall-clock limits, no access to backend secrets or other tenants).
- **Batch orchestration:** build on PostgreSQL + Oban (already running in `backend/` for `ad_conversions`) for durable queues, retries, cancellation, progress polling, and dead-letter handling before introducing any separate queue broker.
- **Firm tenancy & observability:** port organizations, roles/permissions, email (verification, advisories [`#727`](https://github.com/lambdaclass/stabileo/issues/727)), idempotency keys, and Sentry/PromEx instrumentation into `backend/` when firm workflows require them (`specs/backend.md`).

## Decision Log Rule

Important infrastructure choices should not live only in chat history or commits.

Create and maintain short ADR-style notes for decisions such as:
- object storage vendor and bucket/key layout (S3 vs R2)
- `verify.stabileo.com` signing key lifecycle and revocation publication
- job queue scaling beyond Oban
- local vs hosted storage boundary
- solver-run artifact format and versioning
- auth/token scoping model (product, admin, remote MCP)
- provider routing policy for migrated AI routes
- native/server runtime packaging and sandboxing

Rule:
- record the decision
- record the rejected alternatives
- record the migration cost if the decision changes later

## Cross-Cutting Requirements

These are not one-stage features. They shape every infrastructure stage from the start.

### Testing Strategy

- ExUnit controller, schema, and real-connection concurrency-invariant tests in `backend/` (advisory locks, row-locked token rotation, unique indices per `specs/backend.md`)
- contract tests for backend and AI request/response schemas, with mocked providers for every AI adapter
- solver-run artifact and signed proof-bundle round-trip + offline replay verification tests (`certcheck` WASM vs native)
- deployment smoke tests for health, auth, Caddy headers/routing, and basic capability paths
- browser/native/server parity smoke tests where the same engine contracts cross runtimes

### Privacy and Retention

- define exactly what a solver-run artifact and proof bundle store
- preserve zero-upload defaults for local solving, ETABS/SAP2000 audits, offline verification, and stdio MCP
- define redaction rules for logs, bug-report artifacts, and AI requests
- ensure secrets, tokens, and provider credentials never appear in logs, artifacts, Oban job args, or error bodies
- enforce documented retention windows (e.g., 13-month retention on `usage_events` via `StabileoInsights.Retention`; explicit retention for logs, artifacts, and deleted projects)
- make export/import and sharing visibility explicit so users always know what leaves their device

### Versioning Policy

- version backend API routes (`/api/v1/...`), engine interface contracts (`#731`), `.ded` project files (`#730`), and proof/artifact bundles explicitly
- define compatibility policy between frontend, backend, `verify.stabileo.com`, and engine contract versions
- treat breaking contract changes as intentional migrations, not casual refactors
- define rollback expectations when a new backend release or contract version is deployed and reverted

### Security Baseline

See the full [Abuse and Security](#abuse-and-security) section below for the detailed threat model, controls, and implementation priority.

- environment-specific CORS allowlist (`CORS_ALLOWED_ORIGINS`) and explicit `TRUSTED_PROXIES` for `X-Forwarded-For`
- strict separation of product (`app: "app"`), admin (`app: "admin"`), and scoped API/MCP tokens
- rate limiting and abuse controls on all unauthenticated and expensive routes
- secret rotation expectations and immediate revocation without redeploy
- transactional audit logging (`admin_actions`) for all administrative changes
- fail-safe startup behavior when required config or secrets are missing (`config/runtime.exs`)

### Storage Decisions

- local persistence boundary: IndexedDB / browser storage vs local filesystem / Tauri desktop file export
- hosted persistence boundary: PostgreSQL for metadata/permissions/revisions vs S3/R2 object storage for `.ded` blobs, artifacts, and shared snapshots
- content-hash deduplication policy for immutable revisions and research snapshots
- strict separation between OSS/local storage expectations and hosted/private storage layers

### Cost Controls

- per-capability timeout ceilings and token/input ceilings on migrated AI routes
- model routing by quality/cost class and explicit fallback rules when preferred providers fail or exceed budget
- hosted budget controls and per-account/per-tier quotas before broad AI or remote MCP rollout
- storage and egress budgets for cloud projects, shared models, and server compute

### Operational Targets

- define latency targets per endpoint and AI capability
- define acceptable provider failure behavior (graceful degradation; solver and editor never depend on backend or AI availability)
- define replay success expectations for solver-run artifacts and offline proof bundles
- define availability and RPO/RTO backup targets before firms depend on hosted workflows

## Abuse and Security

This is a first-class infrastructure concern, not a later-stage polish item. Hosted endpoints expose paid AI provider APIs, cloud storage, authentication, signing keys, and—later—remote MCP and compute workers. Attackers will attempt prompt injection, cost exhaustion via giant payloads or zip bombs, malicious model generation, XSS via shared model metadata, credential/token abuse, and key/signature forgery.

The practical rule: validate input, bound cost and inflation, limit rate, log safely, isolate origins, treat AI and user-model output as untrusted.

### 1. Strict Input Limits

- **Max request body size** — enforce at Caddy and `Plug.Parsers` (currently 8 MB default; tighten per-route for AI/JSON endpoints) before deserialization.
- **Compression inflation ceilings** — enforce bounded decompression (as `StabileoProjects.Content` already enforces 5 MB compressed / 50 MB inflated) on every compressed upload or artifact.
- **Max artifact, prompt, and model size** — bound `SolverRunArtifact` byte size, prompt/context lengths, and max nodes/elements/results accepted by AI or remote MCP routes. Reject early before calling any provider or worker.

### 2. Rate Limiting

- **Per IP** — flood protection on open endpoints (already live on `/api/v1/insights/events` and `/api/v1/marketing/activity` via `StabileoUtils.Plugs.RateLimit`; extend across auth, signing, and public share routes, and move beyond single-node in-memory ETS when running multiple nodes).
- **Per account / scoped API token** — primary rate-limit dimension for authenticated AI, cloud storage, signing, and remote MCP callers.
- **Per capability** — expensive routes (`build-model`, `review-model`, remote batch solves) carry much tighter rate and burst limits than cheap routes (`explain-diagnostic`, digest signing).
- **Backpressure signaling** — return `429 Too Many Requests` with `Retry-After` so clients back off cleanly.

### 3. Timeouts and Cost Ceilings

- **Provider timeout** — preserve configurable per-provider timeout (90s baseline from `ai-backend/`) when porting AI routes into `backend/`.
- **Token ceilings** — enforce both output `max_tokens` and pre-flight input-token ceilings per capability.
- **Per-request and per-account budget limits** — reject calls whose estimated token cost exceeds configured thresholds.
- **Provider fallback rules** — degrade cleanly to a cheaper model or clear error; never silently burn budget retrying an expensive failing provider.

### 4. Authentication and Signing Key Hardening

- **Separate token audiences** — preserve `app: "app"` vs `app: "admin"` isolation (`stabileo_auth`) and add distinct scopes for remote MCP / API tokens (retiring the legacy single `DEDALIANO_API_KEY` static bearer as `ai-backend/` is removed).
- **Separate dev/staging/prod secrets** — never share `SECRET_KEY_BASE`, `JWT_SECRET`, OAuth clients, AI keys, or Ed25519 signing keys across environments.
- **Key rotation and revocation** — rotate signing and API keys on a defined cadence; revoke compromised user sessions (`force-logout`), API tokens, or signing keys immediately without redeploying; publish key-revocation metadata for `verify.stabileo.com`.

### 5. Validation and Sanitization

- **Typed deserialization & schema rejection** — validate every payload against versioned schemas and reject unknown/unsupported versions explicitly.
- **Re-derive authoritative metadata** — never trust frontend-provided diagnostic codes, solver paths, or certification claims blindly; verify signatures and digests server-side or inside `certcheck`.
- **Untrusted model text** — escape/sanitize all user-supplied names, notes, and shared-model strings (`stabileo.com/m/<id>`) to prevent stored XSS.

### 6. Abuse-Aware Logging

- **Request IDs** — propagate `x-request-id` across Caddy, Phoenix logs, Oban jobs, and outbound provider calls.
- **Structured fields** — log request ID, endpoint/capability, provider/model, latency, token counts, payload size, error class, and HTTP status.
- **Never log secrets or raw model payloads** — redact authorization headers, tokens, OAuth codes, provider keys, and raw `.ded` / artifact bodies by default.
- **Detect abuse patterns** — alert on repeated 429s, OAuth/auth failure bursts, sudden token-spend spikes, or oversized upload attempts.

### 7. Safe AI Output Handling

- **Never execute AI output directly** — AI responses are data, not code (`eval()` / unvalidated execution forbidden).
- **Validate generated model JSON on both backend and frontend** — validate `build-model` and MCP edit outputs against the canonical model schema and run pre-solve sanity/mechanism checks before loading.
- **Advisory by design** — AI reviews and explanations are visibly advisory and never override certified solver bounds or containment refusals.
- **Escape AI text in UI rendering** — prevent XSS from HTML/script fragments in model responses.

### 8. CORS, CSP, and Origin Policy

- **Tight allowlist in production** — `CORS_ALLOWED_ORIGINS` on authenticated `backend/` APIs is restricted strictly to production app and admin origins (`stabileo.com` and admin domain); no wildcard `*` on authenticated APIs, and **`verify.stabileo.com` is kept out of the authenticated-API CORS allowlist** so untrusted dropped bundles never gain cross-origin access to authenticated endpoints.
- **Separate unauthenticated read-only feed** — serve the public advisory and key-revocation JSON snapshots from a dedicated unauthenticated static/read-only endpoint with its own read-only CORS policy for `verify.stabileo.com`'s optional online freshness check.
- **Origin isolation** — keep `verify.stabileo.com` and `snapshots.stabileo.com` on dedicated origins with strict CSP so untrusted user/historical bundles cannot share cookies or storage with the main app or admin site.
- **Review origin and proxy config on every deploy** — verify `CORS_ALLOWED_ORIGINS`, `TRUSTED_PROXIES`, and Caddy headers on every environment promotion.

### 9. Storage and Privacy Controls

- **Retention windows** — enforce documented deletion schedules (`usage_events` 13 months; defined TTLs for logs, temporary artifacts, revoked shares, and soft-deleted projects).
- **Export/import and sharing clarity** — make it unmistakable when data stays local vs uploads to Stabileo servers; default shared links to private.
- **Redaction for support artifacts** — strip or redact personal/project context before uploading bug-report artifacts.
- **Consent-gated telemetry & marketing** — keep `usage_telemetry_enabled` and advertising tracking strictly gated by user consent and runtime flags (`specs/services/insights.md`, `specs/services/marketing.md`).

### 10. Incident Handling

- **Abuse & outage detection** — automated alerts on token spikes, 5xx bursts, Oban dead letters, and health-check failures.
- **Runtime kill switches** — extend `system_settings` feature flags (`stabileo_auth` admin UI) to disable individual AI capabilities, providers, remote MCP, or cloud writes live without redeploying.
- **Immediate revocation** — tested runbooks to revoke user sessions, API tokens, or signing keys.
- **Graceful degradation** — if `backend/`, object storage, or AI providers go down, the browser WASM solver, local `.ded` save/open, and offline `verify.stabileo.com` continue working unaffected.
- **Post-incident review** — document root cause, impact, and permanent preventive guards after every security or operational incident.

### Threat Model Summary

| Attack | Mitigation |
|--------|------------|
| Prompt injection via crafted model/text | Input length limits, structured prompts with explicit boundaries, curated action/tool registry instead of raw model synthesis |
| Giant payloads / zip bombs / cost exhaustion | Caddy & `Plug.Parsers` body limits, bounded gzip inflation (`StabileoProjects.Content`), per-capability token ceilings, per-account rate limits |
| Malicious AI-generated model JSON | Strict schema validation backend + frontend, reject unknown fields, pre-solve sanity/mechanism gate before apply |
| Forged or silently edited `Memoria` / proof bundle | `certcheck` WASM re-verifies mathematical bounds directly from the embedded proof bundle; per-firm PKI or authenticated Ed25519 attestation binding `(signer_id, server_timestamp, key_id, canonical_digest)` + mandatory append-only transparency log detects post-issuance edits and re-signing |
| Stored XSS via shared model (`stabileo.com/m/<id>`) or AI text | Strict output escaping, CSP, isolated origins (`snapshots.stabileo.com`, `verify.stabileo.com`), URL validation (`model_link` allowlist) |
| Cross-app privilege escalation (product → admin) | Separate `app: "app"` / `app: "admin"` JWT claims, Google Workspace `hd` + `admin_allowed_emails` re-checked on every request |
| Multi-tenant data leak / ID enumeration | Owner-scoped queries returning 404 (never 403) on foreign IDs, tenant-isolated remote MCP/worker sandboxes, private-by-default shares |
| Repeated expensive API / AI calls | Per-IP, per-account, and per-capability rate limits returning `429` + `Retry-After`, runtime kill switches in `system_settings` |

### Hardening Priority

1. **Port `ai-backend/` routes into `backend/` (Elixir umbrella)** with strict per-route body limits, per-capability field bounds, and `system_settings` kill switches — eliminating the legacy single-key Axum surface.
2. **Request IDs and structured JSON logging** across Caddy and Phoenix (`backend/`), redacting secrets and raw payloads.
3. **Per-account & per-capability rate limiting** (moving beyond single-node in-memory IP buckets as traffic grows).
4. **AI output validation for `build-model`** on both backend and frontend before canvas import.
5. **Authenticated timestamped digest attestation, transparency log & key-revocation feeds** + isolated `verify.stabileo.com` static origin for Wave 2 (keeping `verify.stabileo.com` out of the authenticated-API CORS allowlist).
6. **Object storage (S3/R2) migration** for `stabileo_projects` and `stabileo.com/m/<id>` with inflation caps and revocation deletion.
7. **Staging environment + PromEx/Sentry alerting + tested deploy/rollback & DB backup restore** (`#385`).
8. **Scoped API tokens & tenant isolation** for opt-in remote `stabileo-mcp` and later server compute workers.

## Ownership and Operations

Infrastructure work should have explicit ownership, even in a small team.

At minimum, define who owns:
- deploys, staging promotion (`#385`), and rollback execution
- Caddy / TLS / DNS (`stabileo.com`, admin, `verify.stabileo.com`, `snapshots.stabileo.com`)
- PostgreSQL and object-storage backups and restore drills
- provider outage response and `system_settings` kill switches
- signing key rotation and revocation publication
- artifact and telemetry retention policies
- contract/schema migrations and support replay flows
- production secret rotation

If ownership is shared, write down the handoff rules instead of assuming them.

## Production Readiness Checklist

Before calling any hosted infrastructure surface production-ready, it should have:

- `/api/v1/health` checks and external uptime monitoring
- propagated request IDs and structured logs (secrets/payloads redacted)
- timeout, retry, and cost-ceiling policy for external providers
- per-IP, per-account, and per-capability rate limiting
- fail-fast startup config validation (`config/runtime.exs`)
- secret-management and rotation runbook (including signing keys)
- automated replay/artifact and offline `certcheck` round-trip verification
- staging promotion and rollback tested at least once (`#385`)
- verified backup and restore drill for PostgreSQL and object storage

## Environment Matrix

Infrastructure is designed explicitly for these environments:

- **`local dev`** — Nix + `Makefile`, `StabileoAuth.DevGoogle`, mocked AI providers, low ceremony.
- **`preview / PR`** — smoke-test builds for API, auth, Caddy routing, and contract checks.
- **`staging`** — production-shaped Elixir/Phoenix + PostgreSQL + Caddy + object storage with safe data boundaries (`#385`).
- **`production`** — strict secrets, CORS/origin isolation, structured logging, alerting, retention, backups, and rollback discipline.
- **`desktop / local-only` (Tauri, CLI, local stdio MCP)** — identical engine/artifact contracts, zero backend dependency for core engineering workflows.
- **`private / on-prem` (later)** — per-firm PKI signing, provider substitution, local persistence, and enterprise controls without forking contracts.

## What Infrastructure Must Not Do Yet

- do not split the Elixir umbrella into premature microservices
- do not fork Tauri desktop into a separate product or duplicate engine code
- do not bake provider-specific logic into product-facing AI capability contracts
- do not add separate queue/workflow platforms before PostgreSQL + Oban reaches real limits
- do not make hosted persistence, accounts, or remote MCP a hidden requirement for core OSS local solving or offline verification

## Stages

### Stage 1 — Core Backend & Edge Foundations

Goal: run a clean, production-shaped Elixir/Phoenix umbrella + PostgreSQL + Caddy edge supporting accounts, admin controls, cloud projects, insights, and marketing behind runtime switches.

Current status: **MOSTLY DONE.** `backend/` umbrella (`stabileo_auth`, `stabileo_projects`, `stabileo_insights`, `stabileo_marketing`, `stabileo_web`), `infra/caddy/Caddyfile` (zstd/gzip + precompressed br, immutable asset caching, 8 locales), Oban, and transactional admin audit logging are implemented and tested. Remaining: staging environment promotion (`#385`), PromEx/Sentry observability, and migrating/deleting legacy `ai-backend/`.

### Stage 2 — Reproducibility, Proof Bundles & Offline Verification (`verify.stabileo.com`)

Goal: make solver runs and certified reports reproducible, tamper-evident, and verifiable offline without uploading confidential models.

Current status: **IN PROGRESS.** Engine-level provenance, results-change registry (`testing/docs/PROVENANCE.md`), and certificate checkers exist. Remaining: product-side artifact capture/export/replay flows, <150 KB `certcheck` WASM hosted on `verify.stabileo.com`, authenticated timestamped Ed25519 digest attestation + append-only transparency log + key-revocation publication in `backend/` (plus per-firm PKI), and separate unauthenticated public advisory/revocation JSON feeds.

### Stage 3 — Security, Observability & Abuse Hardening

Goal: make hosted routes diagnosable, bounded against cost/payload abuse, and safe to roll out widely.

Current status: **PARTIALLY DONE.** `config/runtime.exs` fail-fast env checks, token separation, `StabileoProjects.Content` inflation bounds, `system_settings` switches, and basic IP rate limiting exist. Remaining: propagated request IDs, structured JSON logging, PromEx/Sentry metrics and alerts, distributed/per-account/per-capability rate limits, and AI route hardening during the `ai-backend/` → `backend/` port.

### Stage 4 — Object Storage, Shared Models & Desktop Packaging

Goal: scale persisted project/snapshot storage beyond Postgres `bytea` and support offline desktop workflows without forking contracts.

Current status: **EARLY.** Cloud projects currently store gzipped `.ded` in Postgres `bytea` (`specs/services/projects.md`); desktop plan exists (`#728`). Remaining: S3/R2 object storage migration, `stabileo.com/m/<id>` (`model_revisions`, `shares`, `forks`) with private-by-default permissions, `snapshots.stabileo.com` DNS (`#777`), IndexedDB/local artifact persistence, and signed Tauri desktop packaging.

### Stage 5 — Native / Server Solve Path & Ecosystem Runtime

Goal: share one versioned Rust engine contract (`#731`) across browser WASM, local CLI / stdio `stabileo-mcp` / PyO3, and sandboxed native server workers.

Current status: **NOT STARTED.** Remaining: versioned engine interface (`#731`), local stdio `stabileo-mcp` + `pip install stabileo` packaging, opt-in authenticated remote MCP tier (scoped tokens, quotas, tenant isolation), sandboxed native/server solve worker for >100k-DOF models, and browser/native parity smoke coverage.

### Stage 6 — Batch and Job Orchestration

Goal: enable long-running or multi-variant workloads (optimization sweeps, portfolio runs, public challenges) without keeping a browser tab open.

Current status: **FOUNDATION ONLY.** Oban runs in `backend/` for marketing conversions. Remaining: artifact-backed batch jobs, resource-capped worker pool, progress/cancellation APIs, idempotency keys, and dead-letter handling.

### Stage 7 — AI Service Runtime Migration & Governance

Goal: consolidate hosted AI capabilities inside `backend/`, keeping them safe, provider-agnostic, observable, and cost-bounded.

Current status: **IN MIGRATION.** Legacy `ai-backend/` (Rust/Axum) implements 4 capabilities (`review-model`, `explain-diagnostic`, `build-model`, `interpret-results`) with 75 tests and 90s timeout guards. Remaining: port capability routes into an Elixir app in `backend/`, delete `ai-backend/`, wire remaining Query/Explain tabs where needed, add per-capability budgets/evals/kill switches, and maintain strict input/output validation. Capability order lives in [`AI_ROADMAP.md`](AI_ROADMAP.md).

### Stage 8 — Firm and Team Infrastructure

Goal: support engineering office workflows, review records, and hosted/private enterprise value layers without distorting OSS contracts.

Current status: **NOT STARTED.** Remaining (per `specs/backend.md`): organizations, roles/permissions, team review records, office templates/standards storage, per-firm PKI signing, transactional email (verification, advisories `#727`), usage quotas/billing, and private/on-prem deployment packaging.

### Stage 9 — Deployment Discipline and Resilience

Goal: make releases, migrations, backups, and rollbacks repeatable and tested rather than manual.

Current status: **EARLY.** Caddyfile, Nix/Makefile, and Ecto migration safety checks exist. Remaining: staging environment promotion (`#385`), Ansible/Caddy deploy automation, CDN/edge cache purge rules, tested rollback playbooks, and scheduled PostgreSQL + object-storage backup/restore drills.

## Near-Term Priority

Ordered to align with Wave 0–2 product execution:

1. **Staging promotion, deploy/rollback playbook, and DB backup/restore drill (`#385`)** — operational safety baseline for production releases.
2. **WASM delivery hygiene (`#1072`, `#1466`)** — release profile for app WASM, determinism-gated `wasm-opt`, streaming compile, and CI size gate; resolve CDN / edge-cache purge policy.
3. **Request IDs, structured logs, and Sentry/PromEx observability** across Caddy and `backend/`.
4. **Port `ai-backend/` into `backend/` (Elixir umbrella) and delete `ai-backend/`** — with strict body/field limits, per-account/per-capability rate limits, token ceilings, `build-model` schema validation, and `system_settings` provider kill switches.
5. **Wave 2 `verify.stabileo.com` static origin + authenticated timestamped Ed25519 attestation, transparency log & separate unauthenticated advisory/revocation feeds (`#499`, `#346`)** — zero-upload proof-carrying `Memoria` verification.
6. **Object storage (S3/R2) migration** — move `.ded` blobs out of Postgres `bytea` for `stabileo_projects` and back `stabileo.com/m/<id>` immutable revisions + `snapshots.stabileo.com` DNS (`#777`).
7. **Product-side solver-run artifact capture, export/import, and support replay flows** (Stage 2).
8. **Conditional COOP/COEP header rollout** in `infra/caddy/Caddyfile` if WASM `SharedArrayBuffer` threads are adopted (after OAuth popup and embed audit).
9. **Scoped API tokens, quotas, and tenant isolation** for the opt-in remote `stabileo-mcp` tier (after local stdio `stabileo-mcp` + `#731`).
10. **Desktop persistence & signed Tauri packaging (`#728`)** on the shared web/WASM contracts.
11. **Sandboxed native/server solve workers, Oban batch jobs, and firm tenancy (organizations/roles/email `#727`)** for Wave 3.

## What This Unblocks

- zero-upload offline verification of signed calculation reports (`verify.stabileo.com`)
- scalable cloud projects and immutable shared models (`stabileo.com/m/<id>`)
- a single hardened Elixir/Phoenix backend with unified auth, kill switches, rate limits, and observability
- reproducible bug reports and deterministic support/reviewer replay
- safe opt-in remote MCP, desktop parity, and future batch/cloud compute workflows
