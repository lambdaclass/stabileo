### Changed
#### `make test-changed` and a pre-push hook, for a faster local loop (2026-10-23)

`make test-changed` (scripts/test-changed.sh) runs only the tests the branch most likely affects,
against origin/main with uncommitted work included: `vitest related` on the changed web files,
the engine's library unit tests when engine/src changed, the integration targets whose own files
changed plus up to six named after a changed source file, and the backend tests when backend/
changed. It prints every command it runs and everything it skipped, and why; CI still runs it all.

`make hooks` points git at the versioned hooks in scripts/hooks. The pre-push hook runs the web
typecheck and the unit tests related to the pushed commits (usually 20 to 40 s, longer when a
widely imported module changed); `git push --no-verify` skips it.
