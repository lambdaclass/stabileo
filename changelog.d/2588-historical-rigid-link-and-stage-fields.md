### Fixed

#### Preserve default rigid links and reject unknown 3D construction-stage fields

Saved and imported rigid links with an empty degree-of-freedom list keep their historical restraints. The 3D staged solver reports unknown fields in construction stages, including misspelled load selectors. See the [rigid-link compatibility write-up](../docs/results-changes/2026-11-empty-rigid-link-mask.md) and the [3D stage fields write-up](../docs/results-changes/2026-11-staged-unknown-fields.md). (#2588)
