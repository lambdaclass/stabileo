# Assignments

## Decisions that need approval

1. **Anyone signed in can create an assignment.** There is no teacher role yet. A student must be signed in to take one, because the attempt is tied to the account.
2. **Grading and the lock run in the browser, and the server trusts neither.** The solver is WASM in the browser, so the student's browser receives the exercise and could solve it with any tool. The server stores the answers and a `client_score` that is informational only. The teacher's view grades again from the stored answers and seed. This keeps homework and in-class exams honest enough. It is not proctoring.
3. **The lock fails open, and the server never blocks a model.** Locking Stabileo's tools during an attempt happens only in the browser. It lasts at most until `deadline_at`, and it is lifted on submit, at the deadline, on any error reaching the backend, and when the flag is off. Nothing on the server stops a user from opening or editing their own model.
4. **The server picks the seed.** A 32-bit unsigned seed from `:crypto.strong_rand_bytes/1`, fixed when the attempt starts, so a student cannot choose their variant. There is one attempt per student per assignment and no retake; the owner cannot reset one yet.
5. **The deadline is set when the attempt starts.** `deadline_at = min(started_at + duration_minutes, closes_at)`. Later edits to `duration_minutes` or `closes_at` do not move existing deadlines. Autosave and submit get 30 seconds of grace after `deadline_at` for the network.
6. **Past the deadline, the last autosave is the attempt.** A submit after the grace answers 409 `attempt_closed` and leaves the last autosave in place, and the attempt counts as closed from then on.
7. **Two reveal modes.** `on_submit`: results show once the attempt is closed (submitted, or past its deadline). `after_close`: results show once `closes_at` has passed, so `after_close` requires `closes_at`. `reveal_allowed` tells the app when to show the graded explanation; since grading is in the browser, it cannot hide what the student's browser can compute.
8. **Another account's assignment or attempt is a 404, never a 403**, as with projects, so ids do not leak. The only 403 is `assignments_disabled`.
9. **The owner sees each student's name, email, seed, answers and score.** The exam page shows the owner's name before the student starts, and the app says the owner will see their name and email. The owner may take their own assignment to try it; that attempt is listed with the rest.
10. **Deleting is a hard delete, cascading the attempts.** This departs from the soft-delete rule on purpose: the rows hold students' answers and personal data, and a soft delete would keep them until the purge.
11. **Retention: 365 days.** An assignment and its attempts are deleted 365 days after `closes_at`, or after `inserted_at` when there is no `closes_at`, even if it is still in use. `StabileoAssignments.Retention` runs the purge once a day in the release, like the usage-event retention.
12. **Size limits.** At most 100 assignments per account. Title 1 to 120 characters, `exercise` a JSON object of at most 256 KiB encoded, `answers` a JSON object of at most 64 KiB encoded, `duration_minutes` 1 to 600, `client_score` a number from 0 to 1 (the fraction the browser graded correct).
13. **Rate limits per account, not per address.** A class behind one university address would share an IP limit. 60 requests a minute per account on the owner routes and 60 on the exam routes, in memory per node (`StabileoUtils.Plugs.RateLimit` with `key: :account`).
14. **With the flag off, every endpoint answers 403 `assignments_disabled`**, the owner's reads and deletes included, as `cloud_projects_enabled` does. The data is kept, and the retention purge keeps running.
15. **Update is `PUT` with any subset**, as projects and `/me` are, not `PATCH`. The exercise can change only while nobody has started (409 `assignment_started`).
16. **The owner reads attempts from their own paginated endpoint**, `GET /assignments/:id/attempts`, not embedded in `GET /assignments/:id`. A page of 100 attempts is at most about 6.4 MB of answers.
17. **A disabled owner's exams are a 404 to students.** The rows are kept until the owner is enabled again or the purge runs.
18. **Accounts are never deleted today, only disabled.** The foreign keys cascade, so if an account row is ever deleted, its assignments, the attempts on them, and its own attempts go with it.
19. **Share codes:** 10 characters from a 32-symbol alphabet without `0`, `O`, `1` or `I` (50 random bits), read case-insensitively. A code cannot be rotated yet.
20. **`GET /api/v1/auth/config` adds `assignments_enabled`**, so the app knows whether to offer assignments.

## Description

Homework and timed exams for Educational mode. A teacher writes a parametric Educational exercise and shares it as an assignment with a short code. A student opens the code with their account and starts an attempt. The server gives that attempt a seed, which picks the student's variant, and a deadline. While the attempt is open the app locks the rest of Stabileo's tools. At the end the app grades the answers and explains the results to the student.

The backend never solves or grades. It keeps the exercise as opaque JSON, the seed, the timing, and the answers the browser sends. Lives in `stabileo_assignments`; schemas in `stabileo_repo`.

## Features

- Create, list, read, update and delete one's own assignments; the list carries attempt counts
- Read the attempts on one's own assignment, paginated, with each student's name and email, seed, answers and client score
- Open an assignment by code: public facts only (title, owner's name, duration, window, reveal mode, whether I already started), never the exercise
- Start an attempt: create it, or return the one I already have, with the seed, the deadline, the server's clock and the exercise
- Autosave answers until the deadline plus 30 seconds; submit once, with the answers and the client score
- Read my attempt with `reveal_allowed`
- Daily purge of assignments 365 days after they close
- Everything behind the runtime flag `assignments_enabled` (`system_settings`, off by default), set from the admin site's Settings page

## Data Model

| Table | Columns that matter | Ownership |
|-------|---------------------|-----------|
| `assignments` | `title` (1–120), `exercise` (`jsonb` object, ≤ 256 KiB encoded), `duration_minutes` (1–600), `opens_at` (the creation time when not given), `closes_at` (nullable, after `opens_at`), `reveal` (`on_submit`, `after_close`; `after_close` needs `closes_at`), `code` (unique) | `account_id`, from the session, never from input. `code` is generated by the server and never changes |
| `assignment_attempts` | `seed` (`bigint`, 0 to 2³²−1), `started_at`, `deadline_at`, `answers` (`jsonb` object, ≤ 64 KiB encoded, `{}` at start), `client_score` (0–1, nullable), `submitted_at` (nullable) | `assignment_id` and `account_id`, from the route and the session. `seed`, `started_at` and `deadline_at` are set by the server at start and never change |

Both foreign keys of `assignment_attempts` and the one of `assignments` cascade on delete.

## Endpoints

Prefix `/api/v1`, bearer auth (`StabileoAuth.Plugs.Authenticate`, product tokens) on every route. Owner routes: router `StabileoAssignments.Router` at `/api/v1/assignments`. Student routes: router `StabileoAssignments.ExamRouter` at `/api/v1/exams`.

| Method | Path | Who | Rate limit | Max input | Success | Errors |
|--------|------|-----|------------|-----------|---------|--------|
| `GET` | `/assignments` | signed in; own rows only | 60/min per account | — | `200 {data: [<assignment>], meta}`; `meta` adds `max_assignments` | 401, 403 |
| `POST` | `/assignments` | signed in | same bucket | title 120, exercise 256 KiB | `201 {data: <assignment> + exercise}` | 401, 403, 409 `assignment_limit_reached`, 422 |
| `GET` | `/assignments/:id` | owner | same bucket | — | `200 {data: <assignment> + exercise}` | 401, 403, 404 |
| `PUT` | `/assignments/:id` | owner | same bucket | as `POST` | `200 {data: <assignment> + exercise}`; any subset of `title`, `exercise`, `duration_minutes`, `opens_at`, `closes_at`, `reveal` | 401, 403, 404, 409 `assignment_started` (exercise after a start), 422 |
| `DELETE` | `/assignments/:id` | owner | same bucket | — | `200 {data: <assignment>}`; the row and its attempts are gone | 401, 403, 404 |
| `GET` | `/assignments/:id/attempts` | owner | same bucket | — | `200 {data: [<owner attempt>], meta}` | 401, 403, 404 |
| `GET` | `/exams/:code` | signed in | 60/min per account | — | `200 {data: <exam>}` | 401, 403, 404 |
| `POST` | `/exams/:code/start` | signed in | same bucket | — | `200 {data: <attempt>}`, new or existing | 401, 403, 404, 409 `assignment_not_open`, 409 `assignment_closed` |
| `GET` | `/exams/attempts/:id` | the attempt's student | same bucket | — | `200 {data: <attempt>}` | 401, 403, 404 |
| `PUT` | `/exams/attempts/:id/answers` | the attempt's student | same bucket | answers 64 KiB | `200 {data: <attempt>}` | 401, 403, 404, 409 `attempt_closed`, 409 `attempt_submitted`, 422 |
| `POST` | `/exams/attempts/:id/submit` | the attempt's student | same bucket | answers 64 KiB | `200 {data: <attempt>}` | 401, 403, 404, 409 `attempt_closed`, 409 `attempt_submitted`, 422 |

All 429s are `{"error": "rate_limited"}` with `retry-after`. 403 is always `assignments_disabled`. 404 covers an unknown or malformed id or code, another account's assignment or attempt, and a disabled owner's exam.

- List params, `GET /assignments`: `limit`/`offset`, `sort_by` (`inserted_at` default desc, `updated_at`, `title`, `opens_at`, `closes_at`), `search` (title)
- List params, `GET /assignments/:id/attempts`: `limit`/`offset`, `sort_by` (`started_at` default asc, `submitted_at`, `client_score`), `search` (student name or email)
- 422 `validation_error` with the field in `details`: `title` blank or long; `exercise` or `answers` not a JSON object or too large; `duration_minutes` outside 1–600; `closes_at` not after `opens_at`; `reveal` unknown, or `after_close` without `closes_at`; `client_score` outside 0–1

### What each endpoint keeps and shows

| Endpoint | Writes | Kept until, deleted by | Rendered where |
|----------|--------|------------------------|----------------|
| `POST`/`PUT /assignments` | Title, exercise, window, reveal | The owner's delete, or the purge 365 days after closing | The title and the owner's name on the student's exam page; the exercise in the student's attempt. The app renders them as text, never as HTML |
| `DELETE /assignments/:id` | Deletes the assignment and its attempts | — | — |
| `POST /exams/:code/start` | An attempt: seed, start, deadline | With its assignment | Start and submit times in the owner's attempt list |
| `PUT .../answers`, `POST .../submit` | Answers, client score, submit time | With its assignment | The answers as text in the owner's attempt list and the student's results |
| Reads | Nothing | — | The student's name and email in the owner's attempt list |

The admin site shows nothing from these tables.

### Shapes

```jsonc
// <assignment>: owner
{ "id": "uuid", "code": "K7Q2M9XWPA", "title": "TP 3: vigas", "duration_minutes": 90,
  "opens_at": "2026-11-12T13:00:00Z", "closes_at": "2026-11-12T16:00:00Z", "reveal": "after_close",
  "attempt_count": 31, "submitted_count": 28, "inserted_at": "…", "updated_at": "…" }
// POST/PUT body; opens_at defaults to now on create
{ "title": "TP 3: vigas", "exercise": { … }, "duration_minutes": 90,
  "opens_at": "2026-11-12T13:00:00Z", "closes_at": "2026-11-12T16:00:00Z", "reveal": "after_close" }
// <owner attempt>
{ "id": "uuid", "student": { "id": "uuid", "name": "Ada", "email": "ada@example.com" },
  "seed": 3141592653, "started_at": "…", "deadline_at": "…", "submitted_at": "…" | null,
  "answers": { … }, "client_score": 0.75 | null }
// <exam>: what a student sees before starting
{ "code": "K7Q2M9XWPA", "title": "TP 3: vigas", "owner_name": "Prof. Pérez", "duration_minutes": 90,
  "opens_at": "…", "closes_at": "…" | null, "reveal": "after_close",
  "status": "upcoming" | "open" | "closed", "attempt": { "id", "started_at", "deadline_at", "submitted_at" } | null,
  "now": "…" }
// <attempt>: the student's own
{ "id": "uuid", "code": "K7Q2M9XWPA", "title": "TP 3: vigas", "seed": 3141592653,
  "started_at": "…", "deadline_at": "…", "submitted_at": "…" | null, "answers": { … }, "client_score": null,
  "closed": false, "reveal": "after_close", "closes_at": "…", "reveal_allowed": false,
  "exercise": { … }, "now": "…" }
// PUT .../answers
{ "answers": { … } }
// POST .../submit; answers optional (the last autosave stands)
{ "answers": { … }, "client_score": 0.75 }
```

`now` is the server's clock, so the app can count down without trusting the computer's. `closed` is `submitted_at` set or `now` past `deadline_at` plus the grace. `reveal_allowed` is `closed` for `on_submit`, and `now` past `closes_at` for `after_close`. `status` is `upcoming` before `opens_at`, `closed` after `closes_at`, else `open`.

## Permissions

None beyond ownership: an assignment belongs to the account that created it, an attempt to the account that started it. Knowing the code is what lets a signed-in account start.

## Concurrency Invariants and Idempotency

- `assignment_attempts`: uniqueness. Unique index on `(assignment_id, account_id)`; start inserts with `ON CONFLICT DO NOTHING` and reads the row back, so two starts at once return the same attempt and seed. `attempts_concurrency_test.exs` races eight starts on real connections and expects one row and one attempt id.
- `assignments.code`: uniqueness. Unique index; a colliding code is drawn again.
- `assignments`: at most 100 per account; `create` takes a transaction-scoped advisory lock on `assignments:<account_id>` before counting, as projects do.
- Answers and submit: last write wins before the submit; the submit is one `UPDATE … WHERE submitted_at IS NULL`, so a second submit, or an autosave racing it, cannot change a submitted attempt.

No idempotency keys: start is idempotent by the unique index, and the rest are last-write-wins or guarded by `submitted_at`.

## Non-functional Requirements

- The request body stays under `Plug.Parsers`' 8 MB default; the per-field limits above are what bounds storage
- Times are UTC to the second; the 30-second grace absorbs the network, not clock skew, which `now` handles
- `StabileoAssignments.Retention` purges once a day (first run 5 minutes after boot), in-process, as `StabileoInsights.Retention` does; there is no job queue yet

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `stabileo_auth` | Authentication plug |
| `StabileoRepo.Features` | `assignments_enabled` |
| `StabileoUtils.Plugs.RateLimit` | Per-account limits |

## Demo Data

None: seeds create accounts only.

## Pending

- The exam UI and the lock in the app
- A teacher role, and letting an owner reset or extend one student's attempt
- Rotating a share code
- Letting a student delete their own attempt before the purge

## Test Scenarios

| Scenario | Expected Result |
|----------|-----------------|
| Create, then read | Owner from the session, a 10-character code, `opens_at` now when not given; the exercise round-trips |
| Create the 101st assignment | 409 `assignment_limit_reached`, nothing written |
| Exercise over 256 KiB, not an object; `after_close` without `closes_at`; `closes_at` before `opens_at` | 422 on the field |
| Another account's assignment or attempt | 404 for every route; rows unchanged |
| Change the exercise after a start | 409 `assignment_started`; title and window still change |
| Delete | Assignment and attempts gone from the database |
| Exam info | No exercise; `attempt` null, then filled after start |
| Start before `opens_at` / after `closes_at` | 409 `assignment_not_open` / `assignment_closed` |
| Start twice, and eight starts at once | One row, the same id and seed every time |
| Deadline near `closes_at` | `deadline_at` is `closes_at` |
| Autosave before / after deadline plus 30 s | 200, stored / 409 `attempt_closed`, last autosave kept |
| Submit, then submit or autosave again | 200 with `submitted_at` / 409 `attempt_submitted` |
| `reveal_allowed` | `on_submit`: after submit or deadline. `after_close`: only after `closes_at` |
| Owner's attempt list | Student name and email, seed, answers, score; paginated, searchable |
| Flag off | 403 `assignments_disabled` everywhere |
| Disabled owner | Their exam is a 404 to students |
| Purge | Rows 365 days past closing (or creation without a close) gone, with their attempts; the rest kept |
| Account row deleted | Its assignments, their attempts, and its own attempts gone |
| More than 60 requests a minute from one account | 429 `rate_limited`; another account is unaffected |
