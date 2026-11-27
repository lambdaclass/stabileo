### Fixed

#### Refuse unused staged tables and ambiguous legacy supports

Staged analysis refuses populated tables it cannot use. Older planar projects check saved supports even when the geometry and loads leave a single drawing-plane candidate. See the [staged input results change](../docs/results-changes/2026-11-staged-unconsumed-tables.md) and the [drawing plane results change](../docs/results-changes/2026-11-legacy-planar-project-plane.md). (#2588)
