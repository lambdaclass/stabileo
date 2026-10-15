# Admin

## Description

The internal admin site: Stabileo staff sign in separately from the product and manage accounts. Backend in `stabileo_auth` (`StabileoAuth.AdminRouter`); frontend is a second entry (`web/admin.html`) of the web app, built and served on its own.

There are no organizations, roles or permissions yet. An admin is an account whose email is in the admin allowlist (`config :stabileo_auth, :admin_emails`, `ADMIN_EMAILS` in production). Roles, organizations, venues, impersonation and password reset arrive with tenancy and email.

## Features

- Admin login, separate from product login: its own tokens, which product routes reject and vice versa
- List accounts with search, status filter, sorting and pagination
- Account detail, including how many sessions are live
- Disable an account (revokes every session), enable it
- Force logout (revokes every session, account stays enabled)

## Data Model

No new tables. Reads and writes `accounts.is_active` and `sessions.revoked_at`.

## Endpoints

Prefix `/api/v1/admin`, router `StabileoAuth.AdminRouter`. `/auth/login`, `/auth/refresh`, `/auth/logout` run `:api`; everything else adds `:admin_authenticated` (`StabileoAuth.Plugs.Authenticate, app: "admin"`).

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| `POST` | `/auth/login` | `200 <admin session>` | 401 `invalid_credentials` (also for a valid account that is not an admin) |
| `POST` | `/auth/refresh` | `200 <admin session>` | 401 `refresh_failed` |
| `DELETE` | `/auth/logout` | `200 {message}` | never fails |
| `GET` | `/auth/me` | `200 {data: <account>}` | 401 |
| `GET` | `/users` | `200 {data: [<admin account>], meta: {total, limit, offset}}` | 401 |
| `GET` | `/users/:id` | `200 {data: <admin account>}` | 401, 404 |
| `POST` | `/users/:id/disable` | `200 {data: <admin account>}` | 401, 404, 422 `cannot_disable_self` |
| `POST` | `/users/:id/enable` | `200 {data: <admin account>}` | 401, 404 |
| `POST` | `/users/:id/force-logout` | `200 {data: <admin account>, revoked: <count>}` | 401, 404 |

List params (`GET /users`):

| Param | Values | Default |
|-------|--------|---------|
| `limit` | 1..100 (clamped) | 50 |
| `offset` | ≥ 0 | 0 |
| `sort_by` | `inserted_at`, `last_sign_in_at`, `email`, `name` (anything else falls back to the default) | `inserted_at` |
| `sort_dir` | `asc`, `desc` | `desc` |
| `status` | `active`, `disabled`, `all` | `all` |
| `search` | case-insensitive substring of email or name | — |

`<admin session>`: `{ "access_token", "refresh_token", "expires_in", "account": <account> }` — same shape as the product session (`specs/services/accounts.md`).

`<admin account>`: `<account>` plus `{ "is_active": bool, "last_sign_in_at": iso | null, "active_sessions": int, "is_admin": bool }`.

401 bodies from the admin pipeline: `missing_token`, `invalid_token` (bad, expired, or a product token), `not_admin` (the email left the allowlist), `account_disabled`.

## Permissions

One gate: being an admin. The allowlist is re-checked on every request, so removing an email takes effect without waiting for its tokens to expire.

## Concurrency Invariants and Idempotency

No new tables. Disable and force-logout revoke with one `UPDATE ... WHERE revoked_at IS NULL`, so a concurrent login either lands before (and is revoked) or after (and is refused by the disabled check). None of these controllers is covered by idempotency: the admin auth ones carry credentials, and the account actions are naturally idempotent.

## Non-functional Requirements

- Admin refresh tokens live 4 hours (product: 7 days)
- Tokens carry an `app` claim (`"admin"` / `"app"`); each side rejects the other's
- An admin cannot disable themselves

## Dependencies

None beyond `stabileo_auth`.

## Demo Data

Seeds create `admin@stabileo.com` / `stabileo-demo-password`, listed in the dev allowlist. Tests use their own `admin@example.com`, so they never depend on seeded rows.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Admin login with an allowlisted account | 200, tokens whose `app` claim is `admin` |
| Admin login with a valid non-admin account | 401 `invalid_credentials` |
| Product token on an admin route / admin token on a product route | 401 `invalid_token` |
| Admin token after the email leaves the allowlist | 401 `not_admin` |
| List with search, status, sort, limit > 100, offset | Matching rows, clamped limit, correct `meta.total` |
| Detail of an unknown id / a malformed id | 404 |
| Disable | `is_active` false in DB, every session revoked, product login then 403 |
| Disable self | 422 `cannot_disable_self`, nothing changes |
| Enable | `is_active` true in DB, product login works again |
| Force logout | Every session revoked, `revoked` count returned, account still active |
