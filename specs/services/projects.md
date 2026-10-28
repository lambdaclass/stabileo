# Projects

## Description

Cloud copies of the projects users already save to disk: the same `.ded` document, stored gzipped per account, so a project opens from any computer with the account. The app (`lib/store/cloud-projects.svelte.ts`) gzips and base64-encodes the document; the backend checks it and stores the gzip. The backend never reads a project's structure, and the admin site sees metadata only.

## Features

- Save the open project, update it, or save it as a new one
- List, open, rename and delete (soft) the account's own projects
- A per-account limit of active projects, `cloud_projects_limit` in `system_settings` (1 to 100, 1 when unset), set from the admin site's Settings; lowering it deletes nothing. The app offers to replace a saved project with the open one at the limit; a compressed upload of at most 5 MB that inflates to at most 50 MB
- Admin listing of every account's projects, metadata only, with whether the owner allows research use
- Everything behind the runtime flag `cloud_projects_enabled`, off by default

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `projects` | `name` (1–200), `app_mode` (`basic`, `pro`), `content` (gzip), `content_bytes` (uncompressed size), `node_count`, `element_count`, `app_version`, `is_active` (soft delete) | `account_id`, set from the session, never from input; an account reads and writes only its own rows |

## Endpoints

Product: `/api/v1/projects`, behind `StabileoAuth.Plugs.Authenticate` (product tokens).

| Method | Path | Permission | Success | Errors |
|--------|------|------------|---------|--------|
| `GET` | `/` | owner | `200 {data, meta}`; `meta` adds `max_projects`, `max_compressed_bytes`, `max_bytes` | 401, 403 `cloud_projects_disabled` |
| `POST` | `/` | owner | `201 {data}` (metadata) | 401, 403, 409 `project_limit_reached`, 422 |
| `GET` | `/:id` | owner | `200 {data}` with `content` (gzip, base64) | 401, 403, 404 |
| `PUT` | `/:id` | owner | `200 {data}`; `name`, `content` or both | 401, 403, 404, 422 |
| `DELETE` | `/:id` | owner | `200 {data}`; sets `is_active` false | 401, 403, 404 |

Admin: `/api/v1/admin/projects`, behind `StabileoAuth.Plugs.Authenticate, app: "admin"`.

| Method | Path | Permission | Success | Errors |
|--------|------|------------|---------|--------|
| `GET` | `/` | admin | `200 {data, meta}`: metadata, `owner`, `research_consent`; never `content` | 401 |

- List params: `limit`/`offset`, `sort_by` (`updated_at` default desc, `inserted_at`, `name`, `content_bytes`), `search` (name; for admins also owner email), admin filters `account_id` and `app_mode`
- Another account's project is a 404, never a 403, so ids do not leak
- 422 on `content`: not base64, not gzip, not a JSON object, or over a size limit

## Permissions

None beyond ownership: a project belongs to the account that saved it. Admins list metadata through the admin router.

## Concurrency Invariants and Idempotency

`projects`: the per-account limit spans rows, so `create` takes a transaction-scoped advisory lock on `projects:<account_id>` before counting. Two saves at once cannot both pass the limit. The two-connection race is not reachable under the Ecto sandbox; the limit is pinned sequentially by `projects_test.exs` ("create refuses past the per-account limit").

No idempotency keys: saving twice creates two projects, as pressing Save twice on disk writes two files.

## Non-functional Requirements

- The app sends the document gzipped: a 7-storey building is a few hundred kB instead of several MB, and the request stays under `Plug.Parsers`' 8 MB default
- Inflation is bounded (`StabileoProjects.Content`), so a small upload cannot expand into a large one
- Content is stored in Postgres (`bytea`) for now; moving it to object storage is the infrastructure roadmap's hosted-storage step

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `stabileo_auth` | Authentication plugs, consents (research flag in the admin listing) |
| `StabileoRepo.Features` | `cloud_projects_enabled` |

## Demo Data

None: seeds create accounts only.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Save, update, save as new | One row, updated in place; then a second row |
| Content round trip | `GET /:id` answers the gzip that was sent |
| Another account's id | 404 for read, update and delete; row unchanged |
| Active project past `cloud_projects_limit` | 409 `project_limit_reached`; deleting one frees a slot, and updating one (the app's "replace") needs none |
| Flag off | 403 `cloud_projects_disabled` everywhere |
| Malformed or oversized content | 422 on `content`, nothing written |
| Admin listing | Metadata and owner, no `content`; product token is a 401 |
