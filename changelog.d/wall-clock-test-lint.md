### Changed
#### A new engine test cannot time itself in the shared suite (2026-11-03)

Lint Engine now fails on an engine test that asserts on elapsed wall-clock time and would run in
the shared engine suite, where a busy CI machine makes such a test fail with nothing wrong. Such a
test must count the work instead, or be marked ignored and listed to run alone in Engine Gates.
