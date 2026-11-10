# Backend Guidelines

The map of the Stabileo backend. The rules an implementer follows line by line are in `backend/CLAUDE.md`.

## Overview

An Elixir umbrella. One Phoenix endpoint (`StabileoWeb.Endpoint`) serves every app; `StabileoWeb.Router` forwards each path prefix to the router of the app that owns it.

```
backend/
├── apps/
│   ├── stabileo_repo/   # Ecto Repo, ALL schemas, ALL migrations, seeds, release tasks, migration safety check
│   ├── stabileo_utils/  # Controller macro, FallbackController, env helpers, VersionHeader, BuildInfo
│   ├── stabileo_auth/   # Accounts, sessions, tokens, profile
│   └── stabileo_web/    # Endpoint, main router, health
├── config/              # config.exs, dev/test/prod.exs, runtime.exs
└── rel/                 # Release VM args
```

| Prefix | Router | App |
|--------|--------|-----|
| `/api/v1/auth` | `StabileoAuth.Router` | `stabileo_auth` |
| `/api/v1/projects` | `StabileoProjects.Router` | `stabileo_projects` |
| `/api/v1/insights` | `StabileoInsights.Router` | `stabileo_insights` |
| `/api/v1/admin/projects` | `StabileoProjects.AdminRouter` | `stabileo_projects` |
| `/api/v1/admin/insights` | `StabileoInsights.AdminRouter` | `stabileo_insights` |
| `/api/v1/admin` | `StabileoAuth.AdminRouter` | `stabileo_auth` |
| `/api/v1/health` | `StabileoWeb.Router` | `stabileo_web` |

## Where the engine fits

The solver stays in Rust (`engine/`) and runs in the browser as WASM. The backend never solves models: it owns identity, persistence and, as they arrive, billing and collaboration. The legacy Rust AI service (`ai-backend/`) is ported route by route into an Elixir app, then deleted.

## Authentication

- Password sign-up and login; Argon2 hashes
- Access token: HS256 JWT, 15 min, stateless (`StabileoAuth.Tokens`)
- Refresh token: JWT naming a `sessions` row; rotated on every refresh under a row lock (`StabileoAuth.Sessions.rotate_session/2`), revoked on logout and, for every other session, on password change
- `StabileoAuth.Plugs.Authenticate` assigns `current_account` and `current_session_id`; a disabled account is a 401
- Two apps: product (`app: "app"`) and admin site (`app: "admin"`). Tokens carry the app and each side rejects the other's. An admin is an email at an allowed Google Workspace domain (`ADMIN_DOMAINS`, default `lambdaclass.com`, `ergodicgroup.com`) that is on the `admin_allowed_emails` allowlist, both re-checked on every request. Admins sign in with Google (verified email, allowed `hd`); password sign-in is dev/test only. Admin refresh tokens live 4 hours. See `specs/services/admin.md`
- Product sign-up and sign-in sit behind the runtime flag `user_login_enabled` (`StabileoRepo.Features`, `system_settings`), off by default and toggled from the admin site
- Sign-up needs `accept_terms: true`; the acceptance of the terms in force (`StabileoAuth.Consents.terms_version/0`) is written with the account. An account under older terms is told so in `consents.terms_current` and accepts again with `POST /consents`

## Concurrency invariants

Every new table answers in its PR: does any operation on it have a concurrency invariant?

- Uniqueness → unique (or partial unique) index + duplicate-insert regression test
- State on one row → `FOR UPDATE` row lock in a transaction + test
- State across rows → advisory lock keyed on the aggregate + test
- Neither → say so

| Table | Invariant |
|-------|-----------|
| `accounts` | One account per email: unique index on `email`, stored lowercased. Pinned by `account_test.exs` ("rejects a duplicate email regardless of case") |
| `system_settings` | One value per key: unique index on `key`; writes upsert on it |
| `admin_allowed_emails` | One row per email: unique index on `email`, stored lowercased; re-adding reactivates the row. Pinned by `admin_allowed_email_test.exs` ("rejects a duplicate email regardless of case") |
| `consents` | None: append-only; an account's current decision of a kind is its latest row, ordered by a microsecond `inserted_at` so two decisions in one second still order |
| `projects` | At most 100 active per account: `create` takes an advisory lock on the account before counting. Pinned sequentially by `projects_test.exs` |
| `usage_events` | None: append-only, never tied to an account |
| `feedback` | None: admins set the status, last write wins |
| `admin_actions` | None: append-only |
| `sessions` | One rotation per refresh token: `rotate_session/2` locks the row and refuses a revoked one. The two-connection race is not reachable under the Ecto sandbox; pinned sequentially by `sessions_test.exs` ("a second rotation of the same session fails without minting another") |

## Configuration

- Environment variables are read only in `config/runtime.exs`, through `StabileoUtils.fetch_env!/2` and friends (Credo `NoRawEnv` enforces it)
- Production needs `DATABASE_URL`, `SECRET_KEY_BASE`, `JWT_SECRET`, `PHX_HOST`, `API_URL` (the backend's public URL, for the Google callback) and `ADMIN_FRONTEND_URL`; Google admin sign-in needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Optional: `PORT`, `BIND_ADDRESS`, `POOL_SIZE`, `DATABASE_SSL`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `ADMIN_REFRESH_TOKEN_TTL`, and `ADMIN_DOMAINS`, `CORS_ALLOWED_ORIGINS` and `TRUSTED_PROXIES` (all comma-separated; CORS must include the admin site's origin; `TRUSTED_PROXIES` are the addresses of the proxies whose `X-Forwarded-For` the backend believes, none by default)
- Runtime switches admins flip live go in `system_settings` (`StabileoRepo.SystemSettings`, `StabileoRepo.Features`), not environment variables
- The first production admin: `bin/stabileo eval 'StabileoAuth.Release.allow_admin_email("you@lambdaclass.com")'`

## Not yet ported from scasaas

Brought in when a feature needs them, not before: organizations and roles/permissions (and with them the admin Roles, Organizations, Venues and Impersonate pages), idempotency keys, Oban (session pruning, background jobs), email (verification, password reset), Sentry/PromEx, the ops app, deploy (Ansible/Caddy).
