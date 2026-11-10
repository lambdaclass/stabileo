### Fixed

#### Load-independent numerical singularity refusal for harmonic direct solves (2026-11-10)

**BREAKING (results):** After factorization, dense and sparse harmonic direct solves now refuse a pivot smaller than 1e-12 times the scaled dynamic matrix infinity norm, independently of the load. Connected large loads can no longer hide numerical singularity. Per-component residual convergence, the absolute pivot cutoff and existing tolerances remain required. See [the results-change write-up](../docs/results-changes/2026-11-harmonic-load-independent-singularity.md) and PR #1922.
