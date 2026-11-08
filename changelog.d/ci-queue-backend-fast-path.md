### Changed
#### Backend-only and spec-only changes skip the engine and web jobs in CI and the merge queue (2026-11-08)

- A pull request or merge-queue entry that changes only `backend/` (with or without docs) runs the
  backend lint, tests and migration checks and skips the engine suite, WASM, site and E2E jobs,
  which nothing under `backend/` feeds. Backend mixed with any other area still runs everything.
- Markdown under `specs/` counts as docs, like `docs/` and `changelog.d/`.
