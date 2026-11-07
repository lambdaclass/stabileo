### Changed

#### The merge queue runs the `@slow` E2E specs (2026-11-06)

The merge queue (`merge_group`) now runs every `@slow` Playwright spec whenever the queued entry changes
anything that can reach the app, sharded across the 14 E2E runners by measured duration (#1519). A spec
counts as slow when it, or a helper it imports directly or transitively, carries the `@slow` tag. Only
these select nothing: docs, changelog fragments, the backend and AI backend, engine tests and benches,
script tests, web unit-test files and web script tests, the paper, admin, account and Tools pages.
Research-only paths select the research specs, and a changed spec file selects itself when it is slow.
A missing diff, a script error, or a spec list with any invalid or unmatched entry runs the full suite.
