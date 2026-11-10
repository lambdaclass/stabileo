### Fixed

#### Allow benchmark source parsing and PR metadata in message matching lint (2026-11-10)

Document the benchmark gate's Rust declaration search and pull request
`Tolerance-change reason:` field extraction as precise message matching lint
exceptions. Neither search reads an engine message. Lint Engine can pass without
changing the checker, benchmark assertions, tolerances or engine results.
