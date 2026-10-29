# Accounts

## Description

A person's identity in Stabileo: email + password credentials and a simple profile. One email, one account. Lives in `stabileo_auth`; schemas in `stabileo_repo`.

There is no tenancy yet. Every account sees only itself, so there are no organizations, venues, seats or roles. They come later and will hang off `accounts.id`.

## Features

- Sign-in is behind the runtime flag `user_login_enabled` (`system_settings`, toggled from the admin site, off by default). While off, `/register` and `/login` answer 403 `user_login_disabled`; existing sessions keep working (refresh, `/me`, profile) until they expire or an admin forces them out
- Self sign-up with email, password and name
- Password login, refresh-token rotation, logout
- Read and edit one's own profile
- Change password (revokes every other session)

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `accounts` | `email` (unique, lowercased), `password_hash`, `name`, `company`, `job_title`, `country` (ISO 3166-1 alpha-2), `locale` (`es`/`en`/`pt`/`de`/`fr`/`tr`, the app's `OFFERED_LOCALES`), `email_verified_at`, `last_sign_in_at`, `is_active` | The account itself. `email`, `password_hash`, `email_verified_at` and `is_active` never change through the profile endpoint |
| `sessions` | `account_id`, `expires_at`, `revoked_at`, `ip_address`, `user_agent` | Reaches its account through `account_id` |

## Endpoints

Prefix `/api/v1/auth`, router `StabileoAuth.Router`. Public routes run the `:api` pipeline; `/me` and `/password` add `:authenticated` (`StabileoAuth.Plugs.Authenticate`, `Authorization: Bearer <access_token>`).

| Method | Path | Auth | Success | Errors |
|--------|------|------|---------|--------|
| `GET` | `/config` | public | `200 {user_login_enabled: bool}` | — |
| `POST` | `/register` | public | `201 <session>` | 403 `user_login_disabled`, 422 `validation_error` (email taken, short password, …) |
| `POST` | `/login` | public | `200 <session>` | 403 `user_login_disabled`, 401 `invalid_credentials`, 403 `account_disabled` |
| `POST` | `/refresh` | public | `200 <session>` | 401 `refresh_failed` |
| `DELETE` | `/logout` | public | `200 {message}` | never fails |
| `GET` | `/me` | bearer | `200 {data: <account>}` | 401 |
| `PUT` | `/me` | bearer | `200 {data: <account>}` | 401, 422 `validation_error` |
| `PUT` | `/password` | bearer | `200 {message}` | 401, 401 `invalid_current_password`, 422 `validation_error` |

Bodies:

```jsonc
// POST /register
{ "email": "ada@example.com", "password": "at-least-8-chars", "name": "Ada", "locale": "es" }
// POST /login
{ "email": "ada@example.com", "password": "..." }
// POST /refresh, DELETE /logout
{ "refresh_token": "..." }
// PUT /me — any subset; email and password are ignored
{ "name": "Ada Lovelace", "company": "Analytical Engines", "job_title": "Structural engineer", "country": "AR", "locale": "en" }
// PUT /password
{ "current_password": "...", "password": "new-at-least-8-chars" }
```

`<session>`:

```json
{ "access_token": "...", "refresh_token": "...", "expires_in": 900, "account": <account> }
```

`<account>`:

```json
{ "id": "uuid", "email": "ada@example.com", "name": "Ada", "company": null, "job_title": null,
  "country": null, "locale": "es", "email_verified_at": null, "inserted_at": "2026-10-15T12:00:00Z" }
```

Errors follow `StabileoUtils.FallbackController`: `{"error": <code>, "message": <text>}`; changeset errors add `"details": {<field>: [<message>]}`.

## Permissions

None yet: an account reads and writes only itself, identified by the token's `sub`.

## Concurrency Invariants and Idempotency

- `accounts.email`: uniqueness. Unique index on `email` (stored lowercased); a concurrent duplicate sign-up gets 422 `email: has already been taken`, covered by a duplicate-insert test.
- `sessions`: state. Refresh rotation locks the session row (`FOR UPDATE`) so two concurrent refreshes of one token cannot both mint a session.

No controller is covered by `StabileoUtils.Plugs.Idempotency`: auth responses carry credentials and must never be stored for replay.

## Non-functional Requirements

- Passwords hashed with Argon2; 8–72 characters
- Access tokens: HS256 JWT, 15 min. Refresh tokens: JWT bound to a `sessions` row, 7 days, rotated on every refresh
- Login answers the same 401 for an unknown email and a wrong password, and runs a dummy hash for the unknown email so timing does not tell them apart

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `argon2_elixir` | Password hashing |
| `joken` | JWT signing and verification |

## Demo Data

Seeds create `demo@stabileo.com` / `stabileo-demo-password` (`StabileoRepo.DemoPassword`). Deterministic.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| `/register` or `/login` while `user_login_enabled` is off | 403 `user_login_disabled`, nothing written |
| Refresh while `user_login_enabled` is off | 200: existing sessions keep working |
| Register with valid data | 201, tokens, account with lowercased email; row in DB with Argon2 hash |
| Register with taken email (any case) | 422, `details.email` = `["has already been taken"]` |
| Register with short password / missing name / bad email | 422 with that field in `details` |
| Login right / wrong password / unknown email | 200 / 401 `invalid_credentials` / 401 `invalid_credentials` |
| Login on a disabled account | 403 `account_disabled` |
| Refresh | New token pair; the old refresh token then fails with 401, and so does the old access token |
| Logout | The refresh token and the access tokens of its session stop working |
| `GET /me` without / with bad / with good token | 401 / 401 / 200 with every account key |
| `PUT /me` with profile fields | 200, fields persisted; `email` in the body is ignored |
| `PUT /me` with invalid country or locale | 422 with the field in `details` |
| `PUT /password` with wrong current password | 401 `invalid_current_password` |
| `PUT /password` with right current password | 200, new password logs in, other sessions revoked (their access tokens too), current one kept |
