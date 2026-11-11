### Fixed

#### Harmonic direct refinement refuses unconverged responses (2026-11-10)

**BREAKING (results):** Dense and sparse direct harmonic solves now require the final compensated load residual to meet the existing harmonic tolerance after refinement. Singular inconsistent systems that previously returned finite responses now refuse. Sweep regressions require every requested frequency and verify all-direct warning cleanup. The SA-2026-058 main replay now fails the reference assertions while retaining its printed values. See [the results-change write-up](../docs/results-changes/2026-11-harmonic-direct-residual-convergence.md) and PR #1922.
