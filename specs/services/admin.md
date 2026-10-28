# Admin

## Description

The internal admin site: Stabileo staff sign in separately from the product, manage accounts, flip runtime settings and keep the admin allowlist. Backend in `stabileo_auth` (`StabileoAuth.AdminRouter`); frontend is a second entry (`web/admin.html`) of the web app, built and served on its own.

There are no organizations, roles or permissions yet. An admin is an account whose email:

1. is at an allowed Google Workspace domain (`config :stabileo_auth, :admin_domains`, default `lambdaclass.com`, `ergodicgroup.com`), and
2. is on the admin allowlist (`admin_allowed_emails`, active row), which admins edit from the site.

Both are re-checked on every request. Sign-in is with Google (`StabileoAuth.GoogleOAuth`, Assent), which must also report the email verified and the Workspace domain (`hd`) as allowed. Password sign-in exists only where `config :stabileo_auth, :admin_password_login` is true (dev and test), for working without Google credentials.

Roles, organizations, venues, impersonation and password reset arrive with tenancy and email.

## Features

- Admin sign-in with Google, limited to the allowed domains and the allowlist; password sign-in in dev/test only
- Admin tokens separate from product tokens: product routes reject them and vice versa
- Accounts: list with search, status filter, sorting and pagination; detail with live session count; disable (revokes every session), enable, force logout
- Settings: turn product user sign-in (`user_login_enabled`) on and off, live, no redeploy. Off by default
- Allowlist: list, add and remove admin emails; only emails at allowed domains; an admin cannot remove themselves

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `system_settings` | `key` (unique), `value` (JSON map), `description` | Global. Written only through `StabileoRepo.SystemSettings` |
| `admin_allowed_emails` | `email` (unique, lowercased), `is_active`, `added_by_id` (account, nullable: release task or seed) | Global. Removing sets `is_active = false`; re-adding reactivates the row |

Also reads and writes `accounts.is_active`, `accounts.email_verified_at` and `sessions.revoked_at`.

## Endpoints

Prefix `/api/v1/admin`, router `StabileoAuth.AdminRouter`. `/auth/*` sign-in routes run `:api` (the Google ones also fetch the cookie session that carries OAuth state); everything else adds `:admin_authenticated` (`StabileoAuth.Plugs.Authenticate, app: "admin"`).

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| `GET` | `/auth/config` | `200 {password_login: bool, google_login: bool}` | — |
| `GET` | `/auth/google` | `302` to Google | `302` to `<admin>/oauth/callback?oauth_error=oauth_unavailable` when Google is not configured |
| `GET` | `/auth/google/callback` | `302` to `<admin>/oauth/callback?code=<one-time code>` | `302` to `<admin>/oauth/callback?oauth_error=<code>` (below) |
| `POST` | `/auth/oauth/exchange` | `200 <admin session>` | 401 `invalid_or_expired_code` |
| `POST` | `/auth/login` | `200 <admin session>` | 404 `not_found` when password sign-in is off; 401 `invalid_credentials` (also for a valid account that is not an admin) |
| `POST` | `/auth/refresh` | `200 <admin session>` | 401 `refresh_failed` |
| `DELETE` | `/auth/logout` | `200 {message}` | never fails |
| `GET` | `/auth/me` | `200 {data: <account>}` | 401 |
| `GET` | `/users` | `200 {data: [<admin account>], meta: {total, limit, offset}}` | 401 |
| `GET` | `/users/:id` | `200 {data: <admin account>}` | 401, 404 |
| `POST` | `/users/:id/disable` | `200 {data: <admin account>}` | 401, 404, 422 `cannot_disable_self` |
| `POST` | `/users/:id/enable` | `200 {data: <admin account>}` | 401, 404 |
| `POST` | `/users/:id/force-logout` | `200 {data: <admin account>, revoked: <count>}` | 401, 404 |
| `GET` | `/settings` | `200 {data: <settings>}` | 401 |
| `PUT` | `/settings` | `200 {data: <settings>}`; any subset of the three flags, recorded in the audit log | 401, 422 `validation_error` (a flag that is not a boolean, or no known flag) |
| `GET` | `/audit-log` | `200 {data: [<admin action>], meta}`; newest first, filters `action`, `admin_id`, `target_id` | 401 |
| `GET` | `/allowed-emails` | `200 {data: [<allowed email>], meta: {total, limit, offset}}` | 401 |
| `POST` | `/allowed-emails` | `201 {data: <allowed email>}` (also reactivates a removed one) | 401, 422 `validation_error` (`details.email`: bad format, domain not allowed, already allowed) |
| `DELETE` | `/allowed-emails/:id` | `200 {data: <allowed email>}` (`is_active: false`) | 401, 404, 422 `cannot_remove_self` |

`oauth_error` codes: `provider_error` (Google answered with an error or the user cancelled), `invalid_state`, `callback_failed`, `email_not_verified`, `domain_not_allowed` (email or `hd` outside the allowed domains), `email_not_allowed` (not on the allowlist), `account_disabled`, `oauth_unavailable`.

The one-time code is a JWT (`type: "admin_oauth_code"`) valid for 60 seconds, naming the session it may open; the exchange issues the token pair for that session. Tokens never appear in a URL.

List params (`GET /users`, `GET /allowed-emails`):

| Param | Values | Default |
|-------|--------|---------|
| `limit` | 1..100 (clamped) | 50 |
| `offset` | ≥ 0 | 0 |
| `sort_by` | `/users`: `inserted_at`, `last_sign_in_at`, `email`, `name`. `/allowed-emails`: `email`, `inserted_at` | `inserted_at` |
| `sort_dir` | `asc`, `desc` | `desc` |
| `status` | `active`, `disabled`, `all` (`/allowed-emails` defaults to `active`) | `all` |
| `search` | case-insensitive substring of email (and name, for `/users`) | — |

Shapes:

- `<admin session>`: `{ "access_token", "refresh_token", "expires_in", "account": <account> }`, same as the product session (`specs/services/accounts.md`).
- `<admin account>`: `<account>` plus `{ "is_active", "last_sign_in_at", "active_sessions", "is_admin", "consents", "project_count" }`.
- `<settings>`: `{ "user_login_enabled": bool, "usage_telemetry_enabled": bool, "cloud_projects_enabled": bool, "save_requires_account": bool, "terms_version": string }`; `terms_version` is read-only, set in `StabileoAuth.Consents`.
- `<admin action>`: `{ "id", "action", "target_type", "target_id", "details", "admin": {"id", "email"} | null, "inserted_at" }`. Actions: `account.disable`, `account.enable`, `account.force_logout`, `settings.update`, `allowlist.add`, `allowlist.remove`, `feedback.status`.

Projects (`/api/v1/admin/projects`) and metrics and feedback (`/api/v1/admin/insights`) are their own routers: `specs/services/projects.md`, `specs/services/insights.md`.
- `<allowed email>`: `{ "id", "email", "is_active", "added_by": {"id", "email"} | null, "inserted_at", "updated_at" }`.

401 bodies from the admin pipeline: `missing_token`, `invalid_token` (bad, expired, or a product token), `not_admin` (the email left the allowlist or the allowed domains), `account_disabled`.

## Permissions

One gate: being an admin (allowed domain + active allowlist row), re-checked on every request, so removing an email takes effect on the next call.

## Concurrency Invariants and Idempotency

- `system_settings.key`: uniqueness (unique index); writes upsert on the key.
- `admin_allowed_emails.email`: uniqueness (unique index, stored lowercased); adding an existing email reactivates it with one upsert, so two concurrent adds leave one row. Pinned by a duplicate-insert test.
- Disable and force-logout revoke with one `UPDATE ... WHERE revoked_at IS NULL`.

None of these controllers is covered by idempotency: the auth ones carry credentials, and the rest are naturally idempotent.

## Non-functional Requirements

- Admin refresh tokens live 4 hours (product: 7 days)
- Tokens carry an `app` claim (`"admin"` / `"app"`); each side rejects the other's
- An admin cannot disable themselves or remove themselves from the allowlist
- Google sign-in requires `email_verified` and an allowed `hd`; vertex checks the email suffix only

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `assent` | Google OAuth (authorize URL, callback, userinfo) |

Configuration: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `API_URL` (builds the callback `<API_URL>/api/v1/admin/auth/google/callback`), `ADMIN_FRONTEND_URL`, optional `ADMIN_DOMAINS` (comma-separated). Without the Google credentials, `google_login` is false and the button is hidden.

## Demo Data

Seeds create `admin@stabileo.com` / `stabileo-demo-password` and allowlist it; dev config adds `stabileo.com` to the allowed domains so that seeded admin works with password sign-in. Production gets its first admin with `bin/stabileo eval 'StabileoAuth.Release.allow_admin_email("you@lambdaclass.com")'`. Tests use their own `admin@example.com`.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Google callback: verified, allowed `hd`, allowlisted | Redirect with a code; the exchange answers admin tokens; a new account is created verified if none existed |
| Google callback for an existing account nobody verified (a product sign-up) | The account becomes verified; its password is replaced and its sessions revoked, since whoever signed it up may not own the address |
| Google callback: not verified / `hd` or email domain not allowed / not allowlisted / disabled account | Redirect with the matching `oauth_error`, no session |
| Code reused, expired, or of another type | 401 `invalid_or_expired_code` |
| Password sign-in with `admin_password_login` off | 404 |
| Product sign-up with an allowlisted email | No admin access: password sign-in is dev-only, and Google sign-in needs the Workspace identity |
| Toggle `user_login_enabled` | `PUT /settings` persists; product `/register` and `/login` answer 403 `user_login_disabled` while off |
| Add allowlist email: outside the domains / bad format / already active | 422 with `details.email` |
| Add a removed email again | 201, same row reactivated |
| Remove self | 422 `cannot_remove_self` |
| Removed email's admin token | 401 `not_admin` on the next request |
