### Changed
#### Engine wall-clock budgets report on pull requests instead of failing (2026-11-06)

Engine wall-clock budgets (the perf regression gates and the timed tests Engine Gates runs alone) now report an overrun on pull requests and in the merge queue instead of failing Engine Gates. Main and the nightly run still fail on one. Every performance budget goes through `wall_clock::budget`, and the wall-clock lint rejects a bare `assert!` on elapsed time, except in the fuzz watchdog test, whose timeout is the contract under test.
