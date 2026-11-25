### BREAKING (results)

#### Resolve moving axles at path joints before recovering shear

Moving-load sweeps now classify joint axles in cumulative path coordinates. This corrects spurious shear extrema on rotated or mirrored models, including the inclined-support and tip-spring cases in #2101 and #2104. Indexed train positions retain axles at the path entrance and reversed members preserve coincident interior loads. See [the results change](../docs/results-changes/2026-11-moving-axle-joints.md).
