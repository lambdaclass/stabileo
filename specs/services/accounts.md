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
- Optional consents (`usage_analytics`, `model_research`) start granted when the account is created: the sign-up asks only for the terms, and only `false` (or the string `"false"`) records one refused. The browser sends `usage_analytics: false` when the person had already declined usage sharing there. Both are turned off from the profile

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `accounts` | `email` (unique, lowercased), `password_hash`, `name`, `company`, `job_title`, `country` (ISO 3166-1 alpha-2), `locale` (`es`/`en`/`pt`/`de`/`fr`/`tr`/`hu`, the app's `OFFERED_LOCALES`), `email_verified_at`, `last_sign_in_at`, `is_active`, `google_subject` (unique, nullable; an account with it has no password) | The account itself. `email`, `password_hash`, `google_subject`, `email_verified_at` and `is_active` never change through the profile endpoint |
