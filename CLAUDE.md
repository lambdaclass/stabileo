# Stabileo

Structural analysis in the browser, plus the SaaS around it. Conventions follow
[lambdaclass/scasaas](https://github.com/lambdaclass/scasaas).

| Directory | What | Conventions |
|-----------|------|-------------|
| `engine/` | Rust solver, compiled to WASM for the web app | `cargo` |
| `web/` | Svelte 5 + TypeScript app | `web/CLAUDE.md` |
| `backend/` | Elixir/Phoenix umbrella: accounts, and the SaaS from here on | `backend/CLAUDE.md` |
| `ai-backend/` | Legacy Rust/Axum AI service. Its routes move to `backend/`, then it is deleted | — |
| `specs/` | Backend/service specs. Read before building a feature | `specs/README.md` |
| `research/` | Stabileo Research: experimental papers, isolated from the product | `research/CLAUDE.md` |

## Setup

```bash
make setup
```

Claims an instance for this checkout, starts PostgreSQL (port 5452, data in
`~/.local/share/stabileo`), fetches backend deps, creates, migrates and seeds the
dev database.

## Running the project

**Terminal 1 - Backend:** `make backend.run` (migrates, then starts Phoenix on 4100 + INST*10)

**Terminal 2 - Web:** `make web.run` (builds the WASM engine, starts Vite on 4000 + INST*10 pointed at this instance's backend)

**Terminal 3 - Admin site:** `make admin.run` (4001 + INST*10, the staff admin; no WASM build needed)

Account features in the web app are behind the build-time `accounts` flag (on in
dev, off in production builds until the backend is deployed) and, at runtime,
behind `user_login_enabled`, which starts off and is turned on from the admin
site's Settings page.

Every port shifts by `INST * 10` (web 4000, admin 4001, backend 4100 at INST=0),
and `web/vite.config.ts` and `backend/config/dev.exs` derive theirs from the same
`INST`; never hard-code one. `make ports` prints the map for this checkout and
`make services.stop` stops PostgreSQL.

## Demo Credentials

Seeds (`make db.setup`, `make db.reset`) create these accounts. Every one has the
password `stabileo-demo-password` (`StabileoRepo.DemoPassword`).

| Email | Name | Locale | Admin |
|-------|------|--------|-------|
| admin@stabileo.com | Stabileo Admin | es | yes (dev only: password sign-in, `stabileo.com` allowed in dev) |
| demo@stabileo.com | Demo Engineer | es | no |
| demo-en@stabileo.com | Demo Engineer (EN) | en | no |

# Preferences

- Do not add Co-Authored-By lines to commits or PRs
- **DETERMINISTIC SEEDS ALWAYS**: Seeds must produce identical data on every run. Never use `Enum.random()`, `:rand`, or any randomness in seeds.
- **ALWAYS USE `make` TARGETS**: every toolchain (Elixir, PostgreSQL, Rust + wasm-pack, Node) comes from the Nix flake, and every target runs inside it. Never run `mix`, `iex`, `cargo`, `wasm-pack` or `npm` directly; use the matching `make` target (`make test.backend`, `make wasm`, `make web.run`, `make db.gen.migration name=...`), or `make shell` for anything without one. Check the `Makefile`.

# Code comments

Write none. That is the default, not an ideal to approach.

The code says what it does; a comment restating it is noise, and then both have
to be read to trust either. When already editing a region, delete existing
comments that fail the test below — but no unrequested comment-removal sweeps
through files the change wasn't touching anyway.

Never write:

- anything that paraphrases the line below it, or that a reader gets from the
  name, signature, type, or control flow
- the history of a bug: what used to break, which run or PR it came from, why an
  earlier attempt failed. That goes in the commit message and the PR body
- a multi-line block explaining the reasoning behind the change. If the reasoning
  needs that much room, the code is wrong — name things better or restructure it
- section banners, decorative rules, `# ===== setup =====` dividers
- TODO/FIXME, unless asked for

The only test for keeping one: **without it, would the next person editing this
line introduce a bug?** If yes: one sentence, about the trap itself. Docstrings
and `@doc`/`@moduledoc`: same bar. Document behaviour and caveats a caller
can't see, never the signature.

If a comment seems genuinely needed, leave it out and raise it in the PR
description instead.

# Creating Features

Before implementing a backend service or CRUD feature, check `specs/`: write a
spec from `specs/services/TEMPLATE.md` (worked example: `specs/services/accounts.md`)
and follow it.

## Testing Requirements

**Every feature, bug fix, or refactor MUST include tests that cover the changes.**

| What you changed | Required tests |
|-----------------|----------------|
| New schema | Schema changeset tests (`stabileo_repo`): one per required field, validations, misspelled-key guard. Declare in the PR whether any operation has a **concurrency invariant**: uniqueness → unique index + duplicate-insert regression test; balance/state → row lock + test; neither → say so |
| New context function | Happy path with data verification, error paths with specific field assertions |
| New controller endpoint | Success + response shape, 422/404/403/401 with error body |
| New web store action | Vitest unit test: state transitions, API call args, error handling |
| New web page/feature | E2E test: at least one happy-path flow verifying real data outcomes |
| Bug fix | Regression test that would have caught the bug before the fix |

**Always verify data correctness — never just check status codes or `{:ok, _}`.**
See `backend/CLAUDE.md` → "Test Guidelines".

# CI

`.github/workflows/ci.yml` installs Nix, caches the Nix store, and runs `make`
targets only — the same commands you run locally. A `changes` job filters by
path, so engine, web, backend and AI-backend jobs run only when their files (or
`flake.*`, `Makefile`, `ci.yml`) change. Engine CI targets: `lint.engine`,
`test.engine.gates` (also checks the acceptance models against their generators),
`test.engine.metamorphic`, `test.engine.suite SHARD=i/2`. Web: `typecheck.web`,
`test.web.unit SHARD=i/2`, `test.web.build`, `test.web.determinism` (WASM
bit-identical in Node, Chromium, Firefox and WebKit), `e2e.web.smoke SHARD=i/5`. Backend:
`lint.backend`, `test.backend`, plus migration safety and immutability checks.
Dependabot opens security updates only.
