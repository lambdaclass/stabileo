### Fixed
#### Subprocess time limits run without competing engine tests (2026-11-09)

- Reserve all nextest test threads for engine subprocess-limit tests, including the
  issue #1760 plastic regression, so heavy tests cannot consume their wall-clock
  budgets. The 60 s deadline and memory limits are unchanged. Fixes #1870.
