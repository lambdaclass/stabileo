### Fixed

#### Require a saved plane for legacy guides and rigid links

Basic asks for a drawing plane before solving an ambiguous legacy project with a guided X support. Stored rigid links with an omitted or empty degree-of-freedom list receive the same saved-plane validation as a list of the default translations. See the [drawing plane results change](../docs/results-changes/2026-11-legacy-planar-project-plane.md) and the [XY constraint results change](../docs/results-changes/2026-11-xy-constraint-projection.md). (#2588)
