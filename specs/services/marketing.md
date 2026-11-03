# Marketing

## Description

Measuring advertising: which ads and channels bring accounts, and whether those accounts use
Stabileo. Lives in `stabileo_marketing`; schemas in `stabileo_repo`. The ad reporting is a port of
Vertex's `VertexOrgs.Ads` with the fixes of its open PRs (unified attribution by impression, no
Google developer token, unique clicks, custom conversions, previews), shaped to Stabileo's one
product.

## Features

- Where each account came from (`signup_sources`): the browser keeps the visit in the first-party
  cookie `stb_visit` (UTM tags, `gclid`/`gbraid`/`wbraid`, `fbclid`, `network`, referring host,
  landing page, first visit) and sends it with `/google/register` as `source`, with `trigger`, what
  asked for the account (`gate.<action>`, `register.<place>`, `account_button`, `link`). Saved in the
  sign-up's transaction (`config :stabileo_auth, :after_sign_up`); a source that does not validate is
  left out and never costs the sign-up. Classified into `channel` (google, meta, search, social,
  referral, email, direct, other), `paid` (nil when only `fbclid` says Meta) and `placement`.
- Activity: the first analysis, save and export of each account (`account_milestones`) and the days
  it used the app (`account_active_days`), posted by the app to `/activity`.
- Conversions API: `CompleteRegistration` (event id = the account's id) on sign-up and `FirstSave`
  (`first_save-<account id>`) on the first save, queued with Oban only when the pixel id and the
  Conversions API token are saved, with the test event code when set. The browser pixel sends the
  same events with the same ids, so Meta counts each once. Email and account id go hashed (SHA-256).
- Settings (`marketing_configs`, one row under `key` "stabileo"): pixel id, Conversions API token,
  test event code, GTM container, Meta ad account and Marketing API token, Google Ads customer and
  manager ids, service account key. Secrets are encrypted (Cloak, `StabileoRepo.Vault`) and never
  returned: the admin sees `set` and a hint. Nothing falls back to the environment.
- Ad reporting: every saved account syncs from its API (Meta Graph v24, Google Ads v26
  `searchStream` with a service account), first back 180 days, then the last 7, at the interval in
  the `ads_sync` setting (30 min, 5 to 1440). Only accounts saved now are listed. Amounts are kept in
  the account's currency and shown in USD or ARS with the official selling rate of each day.
- The report puts what each platform attributes next to the accounts our database attributes to
  each campaign, ad set and ad by UTM (`utm_campaign` = campaign id or name, `utm_term` = ad set,
  `utm_content` = ad), with how many saved a project, and charges each goal (sign-ups, activations,
  clicks) only the spend of the campaigns that pursue it.
- Acquisition: per channel, trigger and campaign, the period's new accounts and how many solved,
  saved, exported and came back between days 1 and 7, from our database alone.

## Data Model

| Table | Fields | Notes |
|---|---|---|
| `signup_sources` | `account_id` (unique), `channel`, `paid`, `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `network`, `referrer` (host), `landing_path`, `first_seen_at`, `trigger`, `placement` | One per account, written once |
| `account_milestones` | `account_id`, `kind` (`first_analysis`, `first_save`, `first_export`), `occurred_at` | Unique per account and kind |
| `account_active_days` | `account_id`, `day` | Unique per account and day |
| `marketing_configs` | `key` (unique), the ids, the encrypted secrets | One row |
| `ad_accounts` | `channel` (meta, google), `external_id` (unique with channel), `name`, `currency`, `sync_status`, `last_synced_at`, `last_sync_error` | Created from the saved ids |
| `ad_entities` | campaign, ad set or ad: `level`, ids, `name`, `status`, `objective` (the platform's code), budgets, `creative`, `details` (`goal`) | Upserted by the sync |
| `ad_daily_metrics` | per day and entity: `spend`, `impressions`, `reach`, `clicks`, `signups`, `results`, `result_type`; nullable `unique_clicks`, `signup_clicks`, `activations` | A sync replaces the days it downloads; nil is "not measured" |
| `ad_daily_conversions` | per day, entity and conversion key | Same |
| `ad_daily_budgets` | per day and campaign, `estimated` | An estimated budget never replaces an exact one |
| `ad_fx_rates` | `date`, `usd_ars` | Official selling rate |
| `oban_jobs` | Oban | Queues `ad_conversions` and `ads` |

## Endpoints

| Method | Path | Auth | Answer |
|---|---|---|---|
| `GET` | `/api/v1/marketing/tracking` | public | `{meta_pixel_id, gtm_container_id}`, cacheable 5 min |
| `POST` | `/api/v1/marketing/activity` | account | `{milestones?: [kind] (≤3), attribution?, page?}` → `{recorded: [kind]}`; 422 for anything but a short list of names |
| `GET` / `PUT` | `/api/v1/admin/marketing/settings` | admin | the ids, `secrets: {field: {set, hint}}`, `sync_interval_minutes`; PUT takes any of them, a blank secret keeps the stored one and `null` clears it; 422 per field |
| `GET` | `/api/v1/admin/marketing/acquisition` | admin | `days` (1 to 366, 30) or `from`/`to` |
| `GET` | `/api/v1/admin/marketing/ads/overview` | admin | `days` or `from`/`to`, `channel` (all, meta, google), `display` (USD, ARS) |
| `POST` | `/api/v1/admin/marketing/ads/sync` | admin | 202 `{queued}` |
| `GET` | `/api/v1/admin/marketing/ads/connections` | admin | each saved account's check, step by step |

`/google/register` (accounts) also takes `source` and `attribution` (`{fbp, fbc}`); the admin's
`/users` rows carry `signup_source` and `milestones`, and `/users?channel=` filters by channel
(`unknown` for accounts without a source).

## Permissions

Tracking ids are public. Activity is the signed-in account's own. Everything under
`/admin/marketing` is for every admin; a settings change is recorded in the history with the names
of the fields changed, never their values.

## Concurrency Invariants and Idempotency

- `signup_sources.account_id`, `account_milestones (account_id, kind)` and
  `account_active_days (account_id, day)` are unique indexes; milestones and days are written with
  `ON CONFLICT DO NOTHING`, so `FirstSave` is queued only by the request that inserted the row.
- `marketing_configs.key` is unique; two first saves race into one row (the loser retries as an
  update).
- The sync replaces each downloaded day inside one transaction; `AdsSyncWorker` is unique per
  account while waiting or running, so the cron and "Sync now" collapse into one run.

## Non-functional Requirements

- Nothing is sent to Meta or Google without the ids saved; the browser loads no tracker for an
  automated browser, with the accounts feature off, inside the register page's editor frame, or
  without ids; a tracker's failure never breaks a sign-up.
- Meta and Google calls go through `StabileoMarketing.HttpClient` (`:httpc` with peer verification),
  replaceable in tests.
- `CLOAK_KEY` (optional) encrypts the secrets; without it the key derives from `SECRET_KEY_BASE`.

## Dependencies

`stabileo_auth` (sign-up hook, admin plug, audit), Oban, Cloak, Meta Marketing and Conversions APIs,
Google Ads API, argentinadatos.com for the exchange rate.

## Demo Data

None: the seeds create no ad accounts or sources.

## Test Scenarios

| Scenario | Expected |
|---|---|
| Sign-up from a Meta ad with pixel and token saved | Source row (meta, paid, campaign), one `CompleteRegistration` job with the account id, hashed email, fbp/fbc; no token in the args |
| Sign-up without pixel or token | Source row (direct), no job |
| A source that does not validate, a NUL in a cookie | The account is created; the field is cut or dropped |
| Activity twice with `first_save` | Recorded once, one `FirstSave` job, one active day |
| Settings with malformed ids | 422 naming each field, nothing saved |
| Meta insights | Unified attribution and impression time in every request; sign-ups once; custom conversions by their rule; nil without them |
| Google | Service account JWT, no developer token, `login-customer-id`; SIGNUP category counted |
| Sync twice | The second replaces the first; a failing source marks the account and keeps its rows |
| Overview | USD/ARS conversion, accounts and activated per campaign and ad by UTM, goal costs |
