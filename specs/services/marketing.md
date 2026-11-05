# Marketing

## Description

Measuring advertising: which ads and channels bring accounts, and whether those accounts use
Stabileo. Lives in `stabileo_marketing`; schemas in `stabileo_repo`. Spend, clicks and the
platforms' own attribution stay in Meta Ads Manager and Google Ads; Stabileo keeps what only it
knows: the real accounts each campaign, ad set and ad brought, and what those accounts did.

## Features

- Advertising consent: the browser loads the Meta pixel and GTM, and writes the `stb_visit` cookie,
  only after the person accepts advertising cookies; the banner appears only when tracking ids are
  configured. Without consent nothing is stored on the device and nothing reaches Meta or Google.
- Where each account came from (`signup_sources`): the UTM tags, `gclid`/`gbraid`/`wbraid`,
  `fbclid`, `network`, referring host, landing page and first visit, sent with `/google/register`
  as `source`, with `trigger`, what asked for the account (`gate.<action>`, `register.<place>`,
  `account_button`, `link`). With consent they come from the `stb_visit` cookie (30 days); without
  it, from the page the sign-up happens on, kept in memory only. Saved in the sign-up's transaction
  (`config :stabileo_auth, :after_sign_up`); a source that does not validate is left out and never
  costs the sign-up. Classified into `channel` (google, meta, search, social, referral, email,
  direct, other), `paid` (nil when only `fbclid` says Meta) and `placement`.
- Activity: the first analysis, save and export of each account (`account_milestones`) and the days
  it used the app (`account_active_days`), posted by the app to `/activity`, recorded only while the
  account's `usage_analytics` consent is granted. A local file save happens in the browser alone, so
  `first_save` is what the signed-in browser reports, once per account.
- Conversions API: `CompleteRegistration` (event id = the account's id) on sign-up and `FirstSave`
  (`first_save-<account id>`) on the first save, queued with Oban only when `attribution` carries
  `consent: true` and the pixel id and token are configured, with the test event code when set. The
  pixel sends the same events with the same ids, so Meta counts each once. Email and account id go
  hashed (SHA-256), with the IP, user agent and `_fbp`/`_fbc`.
- Settings are deploy secrets: `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN` (secret),
  `META_CAPI_TEST_EVENT_CODE`, `GTM_CONTAINER_ID`. The admin site shows them read-only (the token
  only as set or not), with the URL parameters to paste into every ad.
- Acquisition, from our database alone: per channel, trigger and campaign, the period's new accounts
  and how many solved, saved, exported and came back between days 1 and 7; each campaign opens into
  its ad sets and ads by UTM (`utm_campaign`, `utm_term`, `utm_content`). Days are Buenos Aires days.

## Data Model

| Table | Fields | Notes |
|---|---|---|
| `signup_sources` | `account_id` (unique), `channel`, `paid`, `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `network`, `referrer` (host), `landing_path`, `first_seen_at`, `trigger`, `placement` | One per account, written once |
| `account_milestones` | `account_id`, `kind` (`first_analysis`, `first_save`, `first_export`), `occurred_at` | Unique per account and kind |
| `account_active_days` | `account_id`, `day` (Buenos Aires) | Unique per account and day |
| `oban_jobs` | Oban | Queue `ad_conversions`; `Lifeline` rescues jobs a deploy left executing |

## Endpoints

| Method | Path | Auth | Answer |
|---|---|---|---|
| `GET` | `/api/v1/marketing/tracking` | public | `{meta_pixel_id, gtm_container_id}`, cacheable 5 min |
| `POST` | `/api/v1/marketing/activity` | account | `{milestones?: [kind] (≤3), attribution?, page?}` → `{recorded: [kind]}`; 422 for anything but a short list of names; 429 past 30 a minute from one address |
| `GET` | `/api/v1/admin/marketing/settings` | admin | `{meta_pixel_id, gtm_container_id, meta_capi_access_token: bool, meta_capi_test_event_code}` |
| `GET` | `/api/v1/admin/marketing/acquisition` | admin | `days` (1 to 366, 30) or `from`/`to`; `campaigns[].ad_sets[].ads[]` |

`/google/register` (accounts) also takes `source` and `attribution` (`{consent, fbp, fbc}`); the
admin's `/users` rows carry `signup_source` and `milestones`, and `/users?channel=` filters by
channel (`unknown` for accounts without a source). Auth does not read marketing tables: both go
through `config :stabileo_auth, :admin_accounts, StabileoMarketing.AdminAccounts`.

## Permissions

Tracking ids are public. Activity is the signed-in account's own. Everything under
`/admin/marketing` is read-only and for every admin.

## Concurrency Invariants and Idempotency

- `signup_sources.account_id`, `account_milestones (account_id, kind)` and
  `account_active_days (account_id, day)` are unique indexes; milestones and days are written with
  `ON CONFLICT DO NOTHING`, so `FirstSave` is queued only by the request that inserted the row.

## Non-functional Requirements

- Nothing is sent to Meta or Google without consent and the ids; the browser loads no tracker for
  an automated browser, with the accounts feature off, inside the register page's editor frame, or
  without ids; a tracker's failure never breaks a sign-up. The pixel and GTM never receive the URL
  fragment, where a shared model lives.
- Conversions API calls go through `StabileoMarketing.HttpClient` (`:httpc` with peer
  verification), replaceable in tests. A 4xx other than 429 cancels the job; anything else retries.

## Dependencies

`stabileo_auth` (sign-up hook, admin plug, consents), Oban, Meta Conversions API.

## Demo Data

None: the seeds create no sources.

## Test Scenarios

| Scenario | Expected |
|---|---|
| Sign-up from a Meta ad with consent, pixel and token configured | Source row (meta, paid, campaign), one `CompleteRegistration` job with the account id, hashed email, fbp/fbc; no token in the args |
| Sign-up without advertising consent | Source row kept, no job |
| Sign-up without pixel or token | Source row (direct), no job |
| A source that does not validate, a NUL in a cookie | The account is created; the field is cut or dropped |
| Activity twice with `first_save`, with usage consent | Recorded once, one `FirstSave` job (with advertising consent), one active day |
| Activity from an account that does not share usage | Nothing recorded, no job |
| Acquisition | Campaigns open into ad sets and ads, with accounts and saves; days cut at 03:00 UTC |
