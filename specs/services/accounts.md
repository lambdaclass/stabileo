# Accounts

## Description

A person's identity in Stabileo: a Google account and a simple profile. One email, one account. Email + password credentials remain in the code but are off (`:user_password_login`, env `USER_PASSWORD_LOGIN=1` turns them on). Lives in `stabileo_auth`; schemas in `stabileo_repo`.

There is no tenancy yet. Every account sees only itself, so there are no organizations, venues, seats or roles. They come later and will hang off `accounts.id`.

## Features

- Sign-in is behind the runtime flag `user_login_enabled` (`system_settings`, toggled from the admin site, off by default). While off, `/register` and `/login` answer 403 `user_login_disabled`; existing sessions keep working (refresh, `/me`, profile) until they expire or an admin forces them out
- Saving or exporting a model can require an account: runtime flag `save_requires_account`, off by default, read by the browser from `/config`. The browser applies it only while `user_login_enabled` is on and the config was read, so a closed sign-in or an unreachable server never keeps anyone from their file. Gated (`accountGate.guard` in `web/src/lib/store/account-gate.svelte.ts`): the project and session file (buttons and Ctrl+S), the share link, the model code and saved fragments, the Básico workbook, PRO's data export when it carries model tables, DXF, IFC, the solver input from Reproduce and exercise files and links. Open: results CSV, reports, view images and videos, office templates, the browser autosave and opening any file. After signing in, the action the user asked for runs
- Sign-up and sign-in with Google only: the browser opens `/google` in a popup; Google returns to `/google/callback` on the product's own host, which sends the popup to `/oauth-callback.html` with a one-time code (60 s). The page hands it to the app, which trades it at `/google/exchange`: a known person gets a session, someone new gets a sign-up token (15 min) and an account once `/google/register` carries `accept_terms: true`
- A person is found by Google's subject (`sub`), else by the email Google verified. An account found by email takes the subject; one nobody verified (opened with a password) becomes the Google owner's: its password and its sessions end. An email already tied to another subject is refused (`callback_failed`)
- Google must report the email verified (`email_not_verified` otherwise)
- Refresh-token rotation, logout
- Password sign-up, login and change answer 403 `password_login_disabled` unless `:user_password_login` is on
- Without a Google client in development, `StabileoAuth.DevGoogle` plays Google with a local page (`/google/dev`) that asks for an email and a name; it is selected only by `config/dev.exs` and answers 404 elsewhere
- Read and edit one's own profile
- Change password (revokes every other session)

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `accounts` | `email` (unique, lowercased), `password_hash`, `name`, `company`, `job_title`, `country` (ISO 3166-1 alpha-2), `locale` (`es`/`en`/`pt`/`de`/`fr`/`tr`, the app's `OFFERED_LOCALES`), `email_verified_at`, `last_sign_in_at`, `is_active`, `google_subject` (unique, nullable; an account with it has no password) | The account itself. `email`, `password_hash`, `google_subject`, `email_verified_at` and `is_active` never change through the profile endpoint |
| `sessions` | `account_id`, `expires_at`, `revoked_at`, `ip_address`, `user_agent` | Reaches its account through `account_id` |
| `consents` | `kind` (`terms`, `usage_analytics`, `model_research`), `version` (required for `terms`), `granted` (`terms` is always granted), `ip_address`, `user_agent`; append-only, microsecond `inserted_at` | Reaches its account through `account_id`; the current state of a kind is its latest row |

## Endpoints

Prefix `/api/v1/auth`, router `StabileoAuth.Router`. Public routes run the `:api` pipeline; `/me` and `/password` add `:authenticated` (`StabileoAuth.Plugs.Authenticate`, `Authorization: Bearer <access_token>`).

| Method | Path | Auth | Success | Errors |
|--------|------|------|---------|--------|
| `GET` | `/config` | public | `200 {user_login_enabled, terms_version, usage_telemetry_enabled, cloud_projects_enabled, save_requires_account, google_login, password_login}` | — |
| `GET` | `/google` | public, session cookie | `302` to Google | `302 /oauth-callback.html?error=oauth_unavailable` |
| `GET` | `/google/callback` | public, session cookie | `302 /oauth-callback.html?code=…` | `302 /oauth-callback.html?error=` `provider_error`, `invalid_state`, `email_not_verified`, `account_disabled`, `user_login_disabled`, `callback_failed` |
| `POST` | `/google/exchange` | public | `200 <session>` or `200 {signup_required: true, signup_token, email, name}` | 401 `invalid_or_expired_code` |
| `POST` | `/google/register` | public | `201 <session>` | 401 `invalid_or_expired_code`, 403 `user_login_disabled`, 422 `validation_error` (`accept_terms` not true, email or subject taken) |
| `POST` | `/register` | public | `201 <session>` | 403 `password_login_disabled`, 403 `user_login_disabled`, 422 `validation_error` (email taken, short password, `accept_terms` not true, …) |
| `POST` | `/login` | public | `200 <session>` | 403 `password_login_disabled`, 403 `user_login_disabled`, 401 `invalid_credentials`, 403 `account_disabled` |
| `POST` | `/refresh` | public | `200 <session>` | 401 `refresh_failed` |
| `DELETE` | `/logout` | public | `200 {message}` | never fails |
| `GET` | `/me` | bearer | `200 {data: <account>}` | 401 |
| `PUT` | `/me` | bearer | `200 {data: <account>}` | 401, 422 `validation_error` |
| `PUT` | `/password` | bearer | `200 {message}` | 401, 403 `password_login_disabled`, 401 `invalid_current_password`, 422 `validation_error` |
| `POST` | `/consents` | bearer | `201 {data: <account>}` | 401, 422 `validation_error` (`kind` unknown or missing, `granted` not a boolean) |

Bodies:

```jsonc
// POST /google/exchange
{ "code": "..." }
// POST /google/register: accept_terms must be true; usage_analytics, model_research and locale are optional
{ "signup_token": "...", "accept_terms": true, "usage_analytics": true, "locale": "es" }
// POST /register (only with password sign-in on): accept_terms must be true; usage_analytics and model_research are optional
{ "email": "ada@example.com", "password": "at-least-8-chars", "name": "Ada", "locale": "es", "accept_terms": true, "usage_analytics": true }
// POST /consents: terms records the version in force and ignores granted
{ "kind": "usage_analytics", "granted": false }
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

`<account>` in a session, `/me` and `/consents` also carries `consents`: `{ "terms": {"version", "accepted_at"} | null, "terms_current": bool, "usage_analytics": bool, "model_research": bool }`. The app asks an account whose `terms_current` is false to accept again before anything else.

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
| `/register`, `/login` or `PUT /password` with password sign-in off | 403 `password_login_disabled`, nothing written |
| Google callback for someone new | code → exchange answers `signup_required` with the email and name; nothing written until `/google/register` with `accept_terms: true` creates a verified account with `google_subject`, no password, and the consents |
| Google callback for a known subject, or a known email | code → exchange answers a session; the code works once; an unverified account found by email loses its password and sessions |
| Google callback with the email unverified, with sign-in off, without the state cookie | `error=email_not_verified` / `user_login_disabled` / `invalid_state` |
| Two accounts with the same `google_subject` | Unique index; the second insert fails with `google_subject` taken |
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
