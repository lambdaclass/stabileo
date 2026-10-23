# Service Name

## Description

Brief description of what this service does and its purpose in the system.

## Features

- Feature 1
- Feature 2
- Feature 3

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `<table>` | Required fields, enums, soft-delete/archive columns | How it reaches its venue and organization, and which ids a tenant can never change |

## Endpoints

Path prefix and pipelines, then one row per route.

| Method | Path | Permission | Success | Errors |
|--------|------|------------|---------|--------|
| `GET` | `/<resource>` | `view_<resource>` | `200 {data, meta}` | 401, 403 |

- List params: pagination, sort fields and default, filters
- Which errors are 403, 404 or 422, and why

## Permissions

| Permission | Scope | Grants |
|------------|-------|--------|
| `view_<resource>` | `all` / `own` | What it lets a user read |
| `manage_<resource>` | `all` / `own` | What it lets a user write |

- What `own` means for each scoped resource, if any (see `docs/PERMISSIONS.md`)
- Which default role templates get the new keys, if any (see `docs/ADDING-PERMISSIONS.md`)

## Concurrency Invariants and Idempotency

For each new table: uniqueness (partial unique index + duplicate-insert test), balance/state (row or advisory lock + concurrent-writes test), or none, with the reason. See `docs/CONCURRENCY_INVARIANTS.md`.

Which controllers `StabileoUtils.Plugs.Idempotency` covers, and any authorization done inside an action that a replay does not re-run. See `docs/IDEMPOTENCY.md`.

## Non-functional Requirements

- Performance expectations
- Security requirements
- Scalability considerations
- Availability/uptime targets

## Dependencies

| Dependency | Purpose |
|------------|---------|
| Service/Library | Why it's needed |

## Demo Data

- Does a new demo tenant need data from this service?
- If yes, implement `StabileoAuth.DemoSeeder` (`seed_demo/1`) and add the module to `config :stabileo_auth, :demo_seeders`. Seeds are deterministic: no randomness.

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Happy path description | Expected outcome |
| Edge case description | Expected outcome |
| Error case description | Expected error handling |
| Permission denied / allowed | 403 without the permission, success with it |
| Cross-venue / cross-org access | Not found or empty |
