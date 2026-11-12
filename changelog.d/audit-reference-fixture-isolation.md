### Fixed

#### Isolate audit reference test evidence from runner arguments (2026-11-12)

Give the soundness audit reference collector test paired baseline and head fixtures and pass their temporary directory explicitly through a shared script executor. Test runner arguments can no longer redirect the collector to external captures. Keep empty reference endpoints as an explicit rejection test. Engine results and audit validation rules are unchanged. Fixes #1946.
