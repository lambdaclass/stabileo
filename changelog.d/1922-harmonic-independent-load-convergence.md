### Fixed

#### Independent loads cannot hide unconverged harmonic components (2026-11-10)

**BREAKING (results):** Dense and sparse harmonic direct solves now require residual convergence separately within each connected dynamic component. Large, exactly solved independent loads can no longer hide an inconsistent singular block. The existing tolerance and pivot cutoff are unchanged. See [the results-change write-up](../docs/results-changes/2026-11-harmonic-independent-load-convergence.md) and PR #1922.
