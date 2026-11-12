### Fixed

#### Retain replay gates when merging staged analysis changes

- Preserve the candidate replay coverage and frozen shell refusal checks from main alongside the staged analysis regressions and translation rank tests (PR #1943).
- Retain the test-only free-DOF tag adapter needed by main's frozen shell dense/sparse regression after the shared stability refactor.
