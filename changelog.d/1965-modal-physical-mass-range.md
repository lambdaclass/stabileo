### BREAKING (results)

#### Preserve the physical mass range in modal analysis (#1965, 2026-11-12)

Modal analysis carries massive element rows through support rotations and MPCs, then statically condenses massless coordinates. Rank-deficient models can return their valid finite modes without a spurious inertial direction causing a refusal. The modal orthogonality check and its bounds are unchanged. Re-run affected modal analyses and dependent dynamic responses. See [the results-change evidence](../docs/results-changes/2026-11-modal-physical-mass-range.md).
