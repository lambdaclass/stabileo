# Backend

## Tech Stack

Elixir, Phoenix, Ecto, PostgreSQL, Joken (JWT), Argon2 (password hashing).

## Umbrella Structure

```
backend/apps/
├── stabileo_repo      # Shared Ecto Repo, ALL schemas, ALL migrations, seeds
├── stabileo_utils     # Controller macro, FallbackController, env helpers, shared plugs
├── stabileo_auth      # Accounts, sessions, tokens, profile, consents, admin audit log
├── stabileo_projects  # Cloud projects
├── stabileo_insights  # Anonymous usage, feedback, admin metrics
└── stabileo_web       # Endpoint and main router that forwards to domain routers
```

Schemas are centralized in `stabileo_repo`. Domain apps contain context modules (business logic), controllers, and routers. The main router in `stabileo_web` forwards requests to domain routers. A new domain is a new app with its own router and one `forward` line in `StabileoWeb.Router`.

## Rules

- **Controllers use `use StabileoUtils.Controller`**, never `use Phoenix.Controller` directly. It is the one place cross-cutting controller plugs are mounted; `StabileoUtils.ControllerConventionTest` fails the build otherwise.
- **Single shared repo**: All apps MUST use `StabileoRepo.Repo`. NEVER create app-specific repos.
- **Schemas go in `stabileo_repo`**: `apps/stabileo_repo/lib/stabileo_repo/schemas/` as `StabileoRepo.Schemas.<Name>` with `use StabileoRepo.Schema` and `import Ecto.Changeset`.
- **Migrations go in `stabileo_repo`**: ALWAYS generate with `make db.gen.migration name=<name>`. NEVER create migration files manually — the timestamp must come from the generator. Indexes go in their own migration, created `concurrently: true` with `@disable_ddl_transaction` and `@disable_migration_lock`. Check with `make migrations.check.file FILE=<path>`.
- **Environment variables** are read through `StabileoUtils.fetch_env!/2` / `fetch_env/2` / `fetch_env_integer/2` (see `config/runtime.exs`). The `NoRawEnv` Credo check (`.credo/checks/no_raw_env.ex`) rejects `System.get_env` in `lib/` and `config/runtime.exs`.
- **Use `Enum.map_join/3`**: NEVER use `Enum.map/2 |> Enum.join/2`.
- **Soft deletes**: Use `is_active` flag, not hard deletes.
- **Timestamps**: Always UTC (`timestamps(type: :utc_datetime)`, which `StabileoRepo.Schema` sets).
- **Controllers**: Only handle HTTP concerns, with `action_fallback(StabileoUtils.FallbackController)`. Business logic goes in context modules.
- **Context modules**: Use `with` for happy-path pipelines.
- **Foreign keys in migrations**: Use `references(:table, on_delete: :delete_all)`.
- **Tenancy**: there is none yet; an account reads and writes only itself. When organizations arrive, every query is scoped to the current organization — follow scasaas's `organization_id` rules then.

## Domain Mapping

| Domain | App | Handles | Prefix |
|--------|-----|---------|--------|
| Authentication | `stabileo_auth` | Accounts, sessions, profile | `/api/v1/auth` |
| Admin | `stabileo_auth` (`StabileoAuth.AdminRouter`) | Admin sign-in, account management, settings, audit log | `/api/v1/admin` |
| Projects | `stabileo_projects` | Cloud projects; admin listing | `/api/v1/projects`, `/api/v1/admin/projects` |
| Insights | `stabileo_insights` | Usage events, feedback; admin metrics and inbox | `/api/v1/insights`, `/api/v1/admin/insights` |
| Web | `stabileo_web` | Endpoint, health | `/api/v1/health` |
| Utilities | `stabileo_utils` | Shared plugs and helpers | — |

## API Conventions

- RESTful JSON API with versioned endpoints (`/api/v1/`)
- JWT Bearer token authentication
- **Kebab-case routes**: URL path segments use kebab-case (`/password-resets`). Route parameters (`:account_id`) stay snake_case.
- Errors through `StabileoUtils.FallbackController`: `{"error": <code>, "message": <text>}`; changeset errors are `422 {"error": "validation_error", "message": "Validation failed", "details": {<field>: [<message>]}}`.

- **Runtime settings** that admins flip live go in `system_settings` through `StabileoRepo.SystemSettings` / `StabileoRepo.Features`, not environment variables. `user_login_enabled` is the example: off by default, read on every sign-in.
- **Admin routes** sit behind `plug(StabileoAuth.Plugs.Authenticate, app: "admin")`; product routes behind the default `app: "app"`. Tokens carry `app`, and each side rejects the other's.

### List Endpoints

All list endpoints MUST support pagination, sorting, and filtering:

| Feature | Params | Details |
|---------|--------|---------|
| Pagination | `limit`, `offset` | Default: 50, max: 100 |
| Sorting | `sort_by`, `sort_dir` | `asc` or `desc` |
| Filtering | `status`, `search`, etc. | By status, name, email |

Response format: `{ "data": [...], "meta": { "total", "limit", "offset" } }`. Use `StabileoRepo.Listing.paginate/5`; `StabileoAuth.Admin.list_accounts/1` is the example.

## Elixir Gotchas

- **List access**: `list[index]` does NOT work. Use `Enum.at(list, index)`.
- **Rebinding in `if`/`case`**: Variables rebound inside `if`/`case`/`cond` are local to that branch. Assign the result to a variable instead: `x = if condition, do: new_val, else: old_val`.
- **No nested modules**: `defmodule A.B` inside `defmodule A` creates `A.A.B`. Always define modules at the top level.
- **No `changeset[:field]`**: Changesets are not maps. Use `Ecto.Changeset.get_field/2` or `get_change/2`.
- **No `String.to_atom/1` on user input**: Use `String.to_existing_atom/1` to prevent atom table exhaustion.
- **Predicate naming**: Functions returning booleans end with `?` (e.g., `active?/1`).

## Ecto Best Practices

- **Preload associations explicitly**: NEVER assume associations are loaded. Use `Repo.preload/2` or preload in the query.
- **Use `:string` for text columns**: Ecto's `:string` maps to `varchar`/`text`. There is no separate `:text` type.
- **Programmatic fields out of `cast`**: Fields set programmatically (e.g., `account_id`) use `put_change/3` or `force_change/3`, NOT `cast/3`.

## Test Guidelines

### Test Coverage Requirements

**Every backend change MUST include tests.** This is not optional — untested code is incomplete code.

| What you added | What to test |
|---------------|-------------|
| New schema | One test file in `apps/stabileo_repo/test/stabileo_repo/schemas/`: required fields (one per field), validations, misspelled-key guard for FK fields. Also answer the concurrency-invariant question (`specs/backend.md`) in the PR: unique index + regression test, row or advisory lock + test, or an explicit "none" |
| New context function | Happy path asserting returned data fields, error path asserting which field/reason failed |
| New controller endpoint | Success with response shape verification, 422 with error body, 404 with error body, 403 (permission deny + allow), 401 (unauthenticated) |
| New migration | Verify it works with `make test` (migrations run before tests). If it backfills data, verify the backfill logic with a test or seed |
| Bug fix | A regression test that fails without the fix and passes with it |

### Assertion Quality

- **NEVER `{:ok, _}` without verifying data.** Always bind the result and assert at least the key fields:
  ```elixir
  # BAD — passes even if all fields are wrong
  assert {:ok, _} = create_thing(attrs)

  # GOOD
  assert {:ok, thing} = create_thing(attrs)
  assert thing.name == "expected"
  assert thing.account_id == account.id
  ```

- **NEVER `{:error, _changeset}` without checking the error.** Always verify which field failed:
  ```elixir
  # BAD — passes even if the error is for a different reason
  assert {:error, _changeset} = create_thing(bad_attrs)

  # GOOD
  assert {:error, changeset} = create_thing(bad_attrs)
  assert %{name: ["can't be blank"]} = errors_on(changeset)
  ```

- **NEVER bare `json_response(conn, 422)`.** Always check the error body:
  ```elixir
  # BAD
  assert json_response(conn, 422)

  # GOOD
  body = json_response(conn, 422)
  assert body["error"] == "validation_error"
  ```

- **Verify DB state after mutations.** Don't trust the return value alone:
  ```elixir
  # After delete:
  assert Repo.get(Schema, id) == nil

  # After create — verify from DB, not just the return:
  saved = Repo.get!(Schema, thing.id)
  assert saved.status == "active"
  ```

### Schema Tests

- **Test every required field individually** (one test per field that asserts `errors_on`).
- **Add a misspelled-key guard test** for schemas with `account_id` or other FK fields that could be confused with similar names (e.g., `user_id`). This catches Ecto's silent `cast/3` key drops:
  ```elixir
  test "unknown key (user_id instead of account_id) is dropped by cast" do
    attrs = %{user_id: id, ...other_required_fields...}
    changeset = Schema.changeset(%Schema{}, attrs)
    refute changeset.valid?
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end
  ```

### Controller Tests

- **Test authorization.** Every protected endpoint needs both a "deny without permission" and an "allow with permission" test.
- **Test error responses.** Assert both the HTTP status AND the error body shape for 422, 404, and 403 responses.
- **Verify response shape.** At least one test per entity should check all expected keys are present in the response.

### Context Tests

- **Test error paths with specific assertions** (which field, which error message).
- **Verify delete operations** with `Repo.get(Schema, id) == nil`.

### Infrastructure

- **Use `start_supervised!/1`**: NEVER use raw `GenServer.start_link` in tests. `start_supervised!` ensures proper cleanup.
- **No `Process.sleep` in tests**: Use `assert_receive/3` with timeout or `eventually/1` helpers for async assertions.
- **Unique emails in async tests**: Use unique emails per test file to avoid deadlocks on the `accounts.email` unique index when tests run in parallel.

## Commands

All commands run via `make` from the project root (Nix wraps the toolchain):

```bash
make test.backend        # Run backend tests
make test.backend.file FILE=apps/stabileo_auth/test/...   # One test file or dir
make format.backend      # Format Elixir
make lint.backend        # Format check and credo
make migrations.check    # Production-safety check of pending migrations
make routes              # Print the routes
```
