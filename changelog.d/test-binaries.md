### Performance
#### The engine's tests build in 7 binaries instead of 104, and rebuild three times faster (2026-10-23)

Every top-level `engine/tests/*.rs` was its own test binary, and each one linked the whole
engine: building and linking 110 binaries was most of `cargo test` and of CI's `test` and
`suite` jobs. The files are now modules of seven binaries by area (`gates`, `certificates`,
`shells`, `derivations`, `solver`, `elements`, `robustness`; `engine/tests/<binary>/main.rs`),
next to the six that were already directories. The files did not move. Measured on an M-series
Mac at 4 jobs, with the dependencies already built: building the test binaries went from 99 s
to 48 s (CPU 336 s to 156 s), rebuilding them after an engine change from 35 s to 11 s, and
`cargo nextest list` from 82 s to 13 s.

The same 8425 tests run (8469 with the ignored ones), each once in CI: every gate step
selects its file's module (`--test gates -E 'test(/^sparse_shell_gates::/)'`) and the suite
excludes exactly those, checked test by test against the old filters. Test names now start
with their file (`sparse_shell_gates::craig_bampton_deterministic`), so a single file runs
with `cargo test --test gates sparse_shell_gates::`. Since the binaries are listed
(`autotests = false`), `scripts/check-test-targets.py` (CI lint) fails when a test file is in
no binary, where it would never run, or in two.
