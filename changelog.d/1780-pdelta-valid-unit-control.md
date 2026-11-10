### Fixed

#### Keep the valid P-Delta unit-invariance failure tracked (2026-11-09)

The quick metamorphic tier correctly refuses the contradictory guided support in `fuzz_rich_2d/20772`. Removing only its conflicting X spring still reproduces #971 for both quick seeds, so expected failures now use that valid control with the original transform stream. #971 remains tracked; no tolerance or convergence criterion changed.
