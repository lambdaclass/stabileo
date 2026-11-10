# Accounts

## Description

A person's identity in Stabileo: a Google account and a simple profile. One email, one account. There is no product password sign-in. Lives in `stabileo_auth`; schemas in `stabileo_repo`.

There is no tenancy yet. Every account sees only itself, so there are no organizations, venues, seats or roles. They come later and will hang off `accounts.id`.

## Features

- Sign-in is behind the runtime flag `user_login_enabled` (`system_settings`, toggled from the admin site, off by default). While off, Google sign-in and `/google/register` answer `user_login_disabled`; existing sessions keep working (refresh, `/me`, profile) until they expire or an admin forces them out
- Files in and out can require an account: runtime flag `save_requires_account`, off by default, read by the browser from `/config`. The browser applies it only while `user_login_enabled` is on, the config was read and Google sign-in is available (`google_login`). The gate sits in a few choke points (saving a file, file inputs, opening a project), so every save, import and export passes through it. It fails open: if the Google window cannot open, is blocked or fails, or the code exchange fails, the action goes ahead without an account. Only the person cancelling stops it. After signing in, the action the user asked for runs
- Sign-up and sign-in with Google only, through the product's own OAuth client (`GOOGLE_APP_CLIENT_ID`, `GOOGLE_APP_CLIENT_SECRET`; the admin site keeps `GOOGLE_CLIENT_ID`): the browser opens `/google?attempt=…` in a popup, where `attempt` is the SHA-256 (base64url) of a random verifier the app keeps for that sign-in; Google returns to `/google/callback` on the product's own host, which sends the popup to `/oauth-callback.html` with a one-time code (60 s) and the attempt. For a known person the callback opens a session that lives only as long as the code; the exchange rotates it into a full one and records the sign-in, so a code never traded leaves nothing behind. The page hands both to the app, which takes only its own attempt's answer and trades the code at `/google/exchange` with the verifier; a code from another attempt, tab or browser is refused: a known person gets a session, someone new gets a sign-up token (15 min) and an account once `/google/register` carries `accept_terms: true`
- A person is found by Google's subject (`sub`), else by email, and by email only when Google answers for that address: Gmail (`gmail.com`, `googlemail.com`) or a Workspace domain Google reports in `hd`. For any other address `email_verified` may be a check from years ago, so an existing account on it is refused (`email_in_use`) and stays as it was. An account found by email takes the subject; one nobody verified becomes the Google owner's: its password and its sessions end. A disabled account is refused before anything about it changes. An email already tied to another subject is refused (`callback_failed`)
- Google must report the email verified (`email_not_verified` otherwise)
- Refresh-token rotation, logout
- Without a Google client in development, `StabileoAuth.DevGoogle` plays Google with a local page (`/google/dev`) that asks for an email and a name; it is selected only by `config/dev.exs` and answers 404 elsewhere
- Read and edit one's own profile
- Optional consents (`usage_analytics`, `model_research`) are opt-in: granted only by the JSON boolean `true`; the sign-up shows them unchecked

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `accounts` | `email` (unique, lowercased), `password_hash`, `name`, `company`, `job_title`, `country` (ISO 3166-1 alpha-2), `locale` (`es`/`en`/`pt`/`de`/`fr`/`tr`, the app's `OFFERED_LOCALES`), `email_verified_at`, `last_sign_in_at`, `is_active`, `google_subject` (unique, nullable; an account with it has no password) | The account itself. `email`, `password_hash`, `google_subject`, `email_verified_at` and `is_active` never change through the profile endpoint |
| `sessions` | `account_id`, `expires_at`, `revoked_at`, `ip_address`, `user_agent` | Reaches its account through `account_id` |
| `consents` | `kind` (`terms`, `usage_analytics`, `model_research`), `version` (required for `terms`), `granted` (`terms` is always granted), `ip_address`, `user_agent`; append-only, microsecond `inserted_at` | Reaches its account through `account_id`; the current state of a kind is its latest row |

## Endpoints

Prefix `/api/v1/auth`, router `StabileoAuth.Router`. Public routes run the `:api` pipeline; `/me` and `/consents` add `:authenticated` (`StabileoAuth.Plugs.Authenticate`, `Authorization: Bearer <access_token>`).

| Method | Path | Auth | Success | Errors |
|--------|------|------|---------|--------|
| `GET` | `/config` | public | `200 {user_login_enabled, terms_version, usage_telemetry_enabled, cloud_projects_enabled, save_requires_account, google_login}` | — |
| `GET` | `/google?attempt=` | public, session cookie | `302` to Google | `302 /oauth-callback.html?error=` `invalid_state` (no well-formed attempt), `oauth_unavailable` |
| `GET` | `/google/callback` | public, session cookie | `302 /oauth-callback.html?code=…&attempt=…` | `302 /oauth-callback.html?error=…&attempt=…` `provider_error`, `invalid_state`, `email_not_verified`, `email_in_use`, `account_disabled`, `user_login_disabled`, `callback_failed` |
| `POST` | `/google/exchange` | public | `200 <session>` or `200 {signup_required: true, signup_token, email, name}` | 401 `invalid_or_expired_code` |
| `POST` | `/google/register` | public | `201 <session>` | 401 `invalid_or_expired_code`, 403 `user_login_disabled`, 422 `validation_error` (`accept_terms` not true, email or subject taken) |
| `POST` | `/refresh` | public | `200 <session>` | 401 `refresh_failed` |
| `DELETE` | `/logout` | public | `200 {message}` | never fails |
| `GET` | `/me` | bearer | `200 {data: <account>}` | 401 |
| `PUT` | `/me` | bearer | `200 {data: <account>}` | 401, 422 `validation_error` |
| `POST` | `/consents` | bearer | `201 {data: <account>}` | 401, 422 `validation_error` (`kind` unknown or missing, `granted` not a boolean) |

Bodies:

```jsonc
// POST /google/exchange
{ "code": "...", "verifier": "..." }
// POST /google/register: accept_terms must be true; usage_analytics and model_research are granted only when true; locale is optional
{ "signup_token": "...", "accept_terms": true, "usage_analytics": true, "model_research": false, "locale": "es" }
// POST /consents: terms records the version in force and ignores granted
{ "kind": "usage_analytics", "granted": false }
// POST /refresh, DELETE /logout
{ "refresh_token": "..." }
// PUT /me — any subset; email and password are ignored
{ "name": "Ada Lovelace", "company": "Analytical Engines", "job_title": "Structural engineer", "country": "AR", "locale": "en" }
```

`<session>`:

```json
{ "access_token": "...", "refresh_token": "...", "expires_in": 900, "account": <account> }
```

`<account>` in a session, `/me` and `/consents` also carries `consents`: `{ "terms": {"version", "accepted_at"} | null, "terms_current": bool, "usage_analytics": bool, "model_research": bool }`. The app asks an account whose `terms_current` is false to accept again before anything else. On every session and `/me` the browser takes the account's `usage_analytics`: a `false` turns sharing off in that browser, and a browser that had turned it off records `false` on the account, so a "no" from either side holds.

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

- Access tokens: HS256 JWT, 15 min. Refresh tokens: JWT bound to a `sessions` row, 7 days, rotated on every refresh

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `argon2_elixir` | Password hashing for the admin site's development sign-in |
| `joken` | JWT signing and verification |

## Demo Data

Seeds create `demo@stabileo.com` (`StabileoRepo.DemoPassword` keeps a password on it for the admin site's development sign-in). Deterministic.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Google sign-in while `user_login_enabled` is off | `error=user_login_disabled`, nothing written |
| `/register`, `/login` or `/password` | No such route |
| `/google/register` with only `accept_terms` | Both optional consents recorded refused; `"true"` as a string is refused too |
| Google callback for someone new | code → exchange answers `signup_required` with the email and name; nothing written until `/google/register` with `accept_terms: true` creates a verified account with `google_subject`, no password, and the consents |
| Google callback for a known subject, or a known email | code → exchange answers a session; the code works once; an unverified account found by email loses its password and sessions |
| A code never traded | Its session expires with the code (60 s) and no sign-in is recorded |
| A disabled account found by email | `error=account_disabled`; the account keeps its password, sessions and no subject |
| Google callback with the email unverified, with sign-in off, without the state cookie or the attempt | `error=email_not_verified` / `user_login_disabled` / `invalid_state` |
| A code traded with another attempt's verifier, or none | 401 `invalid_or_expired_code`; the code still trades with its own verifier |
| An existing account on an address Google does not answer for (no Gmail, no matching `hd`) | `error=email_in_use`; the account keeps its password, sessions and no subject |
| Two accounts with the same `google_subject` | Unique index; the second insert fails with `google_subject` taken |
| Refresh while `user_login_enabled` is off | 200: existing sessions keep working |
| Refresh | New token pair; the old refresh token then fails with 401, and so does the old access token |
| Logout | The refresh token and the access tokens of its session stop working |
| `GET /me` without / with bad / with good token | 401 / 401 / 200 with every account key |
| `PUT /me` with profile fields | 200, fields persisted; `email` in the body is ignored |
| `PUT /me` with invalid country or locale | 422 with the field in `details` |
