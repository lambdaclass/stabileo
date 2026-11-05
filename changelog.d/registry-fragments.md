### Changed
#### A results change is one file, numbered by main's merge order (2026-11-05)

Changes that move results are registered one per file in `web/src/lib/provenance/result-changes/`,
without a version number. Each merge to main that adds one takes the next results version, so two
pull requests that change results no longer conflict, and the merge queue can land them together.
The versions numbered by hand keep their entries and their meaning (`numbered.json`), and every saved project
gets the same re-check notices as before. A build now needs the git history back to this change,
and fails without it.
