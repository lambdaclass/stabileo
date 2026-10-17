# Security audit — October 2026

Scope: AI backend (`backend/`), feedback function (`functions/api/`), web app
importers and project loading (`web/`), engine WASM boundary (`engine/`),
deployment (`nginx.conf`, `Dockerfile`, `docker-compose.yml`), CI
(`.github/workflows/`) and dependencies. Threat model:
[THREAT_MODEL.md](THREAT_MODEL.md).

Severity reflects impact on the assets in the threat model, with **results
integrity** weighted as highly as confidentiality. Open items are described
at the level of class and mitigation only.

## Findings

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Feedback | Captcha verification could be skipped, so issues could be filed unattended | High | Fixed |
| 2 | Web — integrity | Detailing assemblies loaded from a file or stored session could be treated as current without a re-solve | High | Fixed |
| 3 | Engine | Curved-beam segment counts from the model were unbounded (memory exhaustion) | High | Fixed |
| 4 | Engine — integrity | Ids generated during curved-beam expansion could overflow and collide with existing ids | High | Fixed |
| 5 | Dependencies | RustSec advisories in the backend TLS/HTTP stack (rustls, rustls-webpki, h2, quinn-proto) and others | High | Fixed |
| 6 | Dependencies | npm advisories in shipped packages, including the spreadsheet parser used on user files | High | Fixed |
| 7 | Backend | No rate or concurrency limit on the paid AI routes | Medium | Fixed (mitigation, see 26) |
| 8 | Backend | One provider's API key travelled in the URL, which can reach error logs | Medium | Fixed |
| 9 | Backend | LLM tool-call parameters could request arbitrarily large generated models | Medium | Fixed |
| 10 | Backend | Model-derived names and the locale were interpolated into system prompts unsanitised | Medium | Fixed |
| 11 | Backend | No explicit request-body, text-field, history or list limits | Medium | Fixed |
| 12 | Web | Share-link decompression had no output bound | Medium | Fixed |
| 13 | Web | Multi-tab session files and the stored workspace skipped the project-file validation | Medium | Fixed |
| 14 | Engine | Moving-load step, influence-line points and time-history steps were unbounded | Medium | Fixed |
| 15 | CI | Actions referenced by mutable tags; an unpinned installer piped to `sh`; default token permissions | Medium | Fixed |
| 16 | Docker | Unpinned base images, build without `--locked`, API published on all interfaces, healthcheck that could never pass | Medium | Fixed |
| 17 | Backend | Bearer token compared in variable time; empty or placeholder key accepted at startup | Low | Fixed |
| 18 | Backend — integrity | Legacy-format AI snapshots skipped `validate_snapshot`; non-finite load values accepted from tool calls | Low | Fixed |
| 19 | Feedback | Unbounded fields; user text could mention users, cross-link issues or attach arbitrary links | Low | Fixed |
| 20 | Web | Excel import had no file/zip-directory limits; a sheet name could reach an object prototype | Low | Fixed |
| 21 | Web | A `message` listener did not check the sender's origin | Low | Fixed |
| 22 | Backend | Provider error bodies logged in full | Low | Fixed |
| 23 | Backend / nginx | No security response headers | Low | Fixed |
| 24 | Engine | Section arc segments and design/beam station counts unbounded | Low | Fixed |
| 25 | Supply chain | No dependency policy, advisory CI job or update automation | Info | Fixed |
| 26 | Backend | The backend's shared bearer token is not an authentication boundary for public web builds | High | Open — mitigated by 7, 9, 11 |
| 27 | Web | No enforced Content-Security-Policy (GitHub Pages cannot set headers; nginx ships it report-only) | Medium | Open |
| 28 | Engine / web | A panic in WASM aborts the instance; recovery of the worker after a trap is not verified | Medium | Open |
| 29 | Dependencies (dev only) | Advisories in test tooling that need a major upgrade (vitest 4); low-severity math renderer advisory | Medium | Open |
| 30 | Engine | Iteration/increment counts of nonlinear solvers have no shared upper bound (CPU only) | Low | Open |
| 31 | Engine | Not every analysis entry point is confirmed to run the full input validation | Low | Open |
| 32 | Web | IFC/DXF imports have no file-size limit; the Excel pre-check relies on declared zip sizes | Low | Open |
| 33 | Web | Third-party captcha script loaded without SRI (vendor does not support it) | Low | Open — CSP allow-list is the mitigation |
| 34 | Web | Detailing staleness counter is shared across tabs in one session | Info | Open |

## What changed

**Backend.** Router extracted to `backend/src/app.rs` so it can be tested over
HTTP (`backend/tests/http_security_tests.rs`). Constant-time token check and
startup key validation (`middleware/auth.rs`, `config.rs`). Per-client rate
limit and global concurrency cap (`middleware/rate_limit.rs`; configurable,
see `backend/.env.example`). Body limit, text/list/history/prompt-size limits
and prompt-safe labels (`capabilities/limits.rs`). Generator size caps and
finite-load checks (`capabilities/actions.rs`). Provider errors without URLs
and with truncated bodies (`error.rs`). Security headers on all responses.
`backend healthcheck` subcommand for container healthchecks.

**Feedback function.** Captcha mandatory; body, field and type validation;
mention/markup neutralisation; only app links attached. Tests in
`web/src/lib/__tests__/feedback-function.test.ts`.

**Web.** Loaded detailing stamps are marked unknown so assemblies show as
stale until re-solved; session/workspace loads go through the same validation
as project files; bounded inflate for share links; Excel limits; origin check.

**Engine.** Upper bounds and overflow checks on input-controlled sizes; tests
in `engine/tests/hostile_sizes.rs`. There is no `unsafe` code in `engine/src`.

**Supply chain.** Vulnerable crates updated; reqwest uses rustls only;
`deny.toml`; npm lockfile fixes, the spreadsheet library from the vendor's
patched release; `.github/workflows/supply-chain.yml` (cargo-deny,
cargo-audit, npm audit failing on high for production dependencies, lockfile
source check, daily); `.github/dependabot.yml` (cargo, npm, actions, docker);
all actions SHA-pinned with `contents: read` and no persisted checkout
credentials; images digest-pinned.

**Results integrity — checked and holding.** Solver results are never read
from project files, session files, share links or localStorage; they are only
set by the solver. AI-produced models are previewed and must be applied
explicitly by the user.

## Open items — guidance

- **26.** Do not set `VITE_AI_API_KEY` in a publicly served build unless the
  backend's rate limits are acceptable as the only spending control. A real
  boundary needs per-user sessions or a same-origin proxy that authenticates
  users.
- **27.** Run the app under the report-only policy in `nginx.conf`, fix
  violations (notably the prerender's inline script), then switch to the
  enforcing header. For GitHub Pages, a `<meta>` CSP is possible but cannot
  express `frame-ancestors`.
- **29.** Plan the vitest 4 upgrade; the supply-chain job reports dev-only
  advisories without failing.
