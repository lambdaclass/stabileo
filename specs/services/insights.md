# Insights

## Description

What the team learns from the product: anonymous usage events, feedback sent by signed-in users, and the metrics the admin site shows. Usage events are never tied to an account and never carry model contents; the full list of what is sent is published at `/usage-data`.

Sharing is on by default and the user turns it off from a notice, Settings or the profile. Until the user answers the notice, the browser stores nothing: each event names only the visit (`install_id` is `v-<session id>`). After "Got it", the browser keeps a random `install_id` so distinct browsers can be counted. "Turn off" stops sending.

## Features

- Batch ingestion of usage events, validated event by event: a malformed event is dropped and counted, never stored
- A server-side switch, `usage_telemetry_enabled` (off by default): while off, batches are answered and nothing is stored, and the app stops asking for consent
- Feedback from signed-in users (bug, idea, question, other), optionally with a link to the open model
- Admin metrics over 1–365 days: accounts, sign-ups, consents, visits (distinct `session_id`), identified browsers (distinct `install_id` without the `v-` prefix), events and visits per day, what is used, cloud projects, unread feedback
- Admin feedback inbox with status (`new`, `read`, `done`)
- `StabileoInsights.Usage.prune/1` deletes events older than 395 days (13 months); there is no scheduler yet, so it runs from a release console

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `usage_events` | `install_id` and `session_id` (random ids made by the browser), `name` (`^[a-z][a-z0-9_.:-]{0,63}$`), `props` (≤ 20 scalar values, strings ≤ 120 chars), `app_version`, `app_mode`, `locale`, `occurred_at` (within 7 days back and 5 minutes ahead) | None: no account, no IP address |
| `feedback` | `kind`, `message` (≤ 4000), `contact_email`, `page`, `app_version`, `user_agent`, `model_link`, `status` | `account_id` from the session; set to null if the account is deleted |

## Endpoints

Product: `/api/v1/insights`.

| Method | Path | Permission | Success | Errors |
|--------|------|------------|---------|--------|
| `POST` | `/events` | anyone | `202 {accepted, rejected, enabled}` | 422 (empty or > 100 events, no `install_id`) |
| `POST` | `/feedback` | signed in | `201 {data: {id, status}}` | 401, 422 |

Admin: `/api/v1/admin/insights`, admin tokens only.

| Method | Path | Permission | Success | Errors |
|--------|------|------------|---------|--------|
| `GET` | `/summary?days=N` | admin | `200 {data}` | 401, 422 (`days` outside 1–365) |
| `GET` | `/feedback` | admin | `200 {data, meta}` | 401 |
| `PUT` | `/feedback/:id` | admin | `200 {data}`; recorded in the audit log | 401, 404, 422 |

- Feedback list params: `limit`/`offset`, `sort_by` (`inserted_at` default desc, `status`, `kind`), filters `status`, `kind`, `search` (message, contact email)

## Permissions

Usage ingestion is open, as it must be for anonymous browsers. Feedback needs a product session, so the open endpoint cannot fill the inbox.

## Concurrency Invariants and Idempotency

- `usage_events`: none; append-only, and a duplicated batch only duplicates counts
- `feedback`: none; the status is a last-write-wins field set by admins

## Non-functional Requirements

- No rate limiting yet: the batch size cap and the per-event validation bound what one request can store
- Events are inserted with one `insert_all` per batch

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `stabileo_auth` | Authentication plugs, the audit log, consent totals |
| `StabileoRepo.Features` | `usage_telemetry_enabled` |

## Demo Data

None.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Switch off | `202 {enabled: false}`, nothing stored |
| Mixed batch | Valid events stored with the batch's shared fields; nested props, bad names, long strings, old timestamps dropped and counted |
| Feedback without a session | 401, nothing stored |
| Feedback status change | Updated, and an `feedback.status` audit row |
| Summary | Counts match the rows: installs are distinct stable `install_id`, visits are distinct sessions, consents are each account's latest decision |
