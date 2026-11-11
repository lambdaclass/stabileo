### Fixed
#### Validate frozen one-way member forces (2026-11-11)

BREAKING (results): 2D and 3D contact analyses enforce the flip limit for tension-only
and compression-only members, retain freezing history across augmented-Lagrangian
passes and refuse incompatible final axial forces with `contact_state_invalid`.
The force limit uses the unchanged contact tolerance scaled by axial stiffness.
Gap-free negative controls, permitted-sign controls and scaled-tolerance and AL-history
controls cover #432 (PR #1921). See the [results-change write-up](../docs/results-changes/2026-11-frozen-one-way-members.md).
