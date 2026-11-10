### Fixed
#### Results-pass inventory includes snapshot gate applicability checks (2026-11-10)

The harness architecture check now expects `applicability-context.test.ts` in the results pass because it checks snapshot gate behaviour against the results corpus. The exact file-list assertion remains enforced. No engine results or numerical tolerances change.
