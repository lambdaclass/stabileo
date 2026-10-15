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
| `/api/v1/admin` | `StabileoAuth.AdminRouter` | `stabileo_auth` |
| `/api/v1/health` | `StabileoWeb.Router` | `stabileo_web` |

## Where the engine fits

The solver stays in Rust (`engine/`) and runs in the browser as WASM. The backend never solves models: it owns identity, persistence and, as they arrive, billing and collaboration. The legacy Rust AI service (`ai-backend/`) is ported route by route into an Elixir app, then deleted.

## Authentication

- Password sign-up and login; Argon2 hashes
- Access token: HS256 JWT, 15 min, stateless (`StabileoAuth.Tokens`)
- Refresh token: JWT naming a `sessions` row; rotated on every refresh under a row lock (`StabileoAuth.Sessions.rotate_session/2`), revoked on logout and, for every other session, on password change
- `StabileoAuth.Plugs.Authenticate` assigns `current_account` and `current_session_id`; a disabled account is a 401
- Two apps: product (`app: "app"`) and admin site (`app: "admin"`). Tokens carry the app and each side rejects the other's. Admins are an email allowlist (`ADMIN_EMAILS`), re-checked on every request; admin refresh tokens live 4 hours. See `specs/services/admin.md`

## Concurrency invariants

Every new table answers in its PR: does any operation on it have a concurrency invariant?

- Uniqueness → unique (or partial unique) index + duplicate-insert regression test
- State on one row → `FOR UPDATE` row lock in a transaction + test
- State across rows → advisory lock keyed on the aggregate + test
- Neither → say so

| Table | Invariant |
|-------|-----------|
| `accounts` | One account per email: unique index on `email`, stored lowercased. Pinned by `account_test.exs` ("rejects a duplicate email regardless of case") |
| `sessions` | One rotation per refresh token: `rotate_session/2` locks the row and refuses a revoked one. The two-connection race is not reachable under the Ecto sandbox; pinned sequentially by `sessions_test.exs` ("a second rotation of the same session fails without minting another") |

## Configuration

- Environment variables are read only in `config/runtime.exs`, through `StabileoUtils.fetch_env!/2` and friends (Credo `NoRawEnv` enforces it)
- Production needs `DATABASE_URL`, `SECRET_KEY_BASE`, `JWT_SECRET`, `PHX_HOST`; optional `PORT`, `BIND_ADDRESS`, `POOL_SIZE`, `DATABASE_SSL`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `ADMIN_REFRESH_TOKEN_TTL`, `ADMIN_EMAILS` and `CORS_ALLOWED_ORIGINS` (both comma-separated)

## Not yet ported from scasaas

Brought in when a feature needs them, not before: organizations and roles/permissions (and with them the admin Roles, Organizations, Venues and Impersonate pages), idempotency keys, Oban (session pruning, background jobs), email (verification, password reset), Sentry/PromEx, the ops app, deploy (Ansible/Caddy).
