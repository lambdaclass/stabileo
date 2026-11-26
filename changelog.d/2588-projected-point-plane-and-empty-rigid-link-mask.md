### Fixed

#### Honor projected point-load axes and empty rigid-link masks

Legacy Basic projects check projected point forces and moments before inferring a drawing plane. An explicitly empty rigid-link mask ties zero degrees of freedom in Basic, Pro, and the engine. An omitted mask in a saved project still ties translations. See the [drawing plane results change](../docs/results-changes/2026-11-legacy-planar-project-plane.md) and [empty rigid-link results change](../docs/results-changes/2026-11-empty-rigid-link-mask.md). (#2588)
