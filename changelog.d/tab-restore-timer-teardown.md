### Fixed
#### A restored session's deferred re-solve no longer fails unrelated unit tests (2026-11-04)

Opening a saved session that had results schedules a re-solve 50 ms later. Without a browser
window (the unit tests), that timer threw after its test had finished. On a slow CI runner this
failed a whole Web Unit shard even though every test had passed. The re-solve now does nothing when
there is no window.
