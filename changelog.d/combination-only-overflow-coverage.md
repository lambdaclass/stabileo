### Added
#### Combination-only overflow regression coverage (2026-11-08)

Added 2D and 3D multi-case regressions for prepared and settlement-triggered per-case solves where every individual case returns finite results, but the combination overflows (#1761). The prepared regressions also verify the aggregate non-finite-result guard for an overflowing combined second-order ratio with finite displacements, reactions and member forces. Engine behavior is unchanged.
