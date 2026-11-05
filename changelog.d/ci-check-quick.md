### Added
#### `make check.quick` runs CI's first checks for what a branch changed, before it is pushed (2026-11-05)

It runs the changelog, pin and test-target checks, and, for the areas a branch touches, the engine's
clippy, the backend's format and credo, the CI-script tests and the web typecheck, then the unit and
engine tests related to the changed files. docs/WORKFLOW.md makes it the step before each push.
`make test-changed` now runs the AI backend's tests for `ai-backend/` changes, and points to
`make test.backend` for `backend/` changes instead of running the AI backend's tests for them.
