### Fixed

#### Compare zero ground-motion responses on their inertial load scale (2026-11-09)

The metamorphic harness includes mass times the prescribed ground acceleration in its independently computed action scale. Ground-motion responses that vanish through symmetry are compared using that load scale and the model stiffness, preserving the relative tolerance and the ordinary-response comparison. Replays cover the 13 published near-zero findings, with injected ordinary and near-zero errors that must still fail. No analysis results change.
