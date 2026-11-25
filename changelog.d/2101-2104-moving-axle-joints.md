### BREAKING (results)

#### Resolve moving axles at path joints before recovering shear

Moving-load sweeps now classify joint axles in cumulative path coordinates and include the member-face limits where a sampled axle lands on a joint. For one axle on a simply supported span, the shear magnitude reaches the axle weight at a support face when the grid samples that support. The browser spatial envelope also includes axial face limits. The inclined-support and tip-spring envelopes in #2101 and #2104 are invariant under rotation and reflection. Indexed train positions retain axles at the path entrance and reversed members preserve coincident interior loads. See [the results change](../docs/results-changes/2026-11-moving-axle-joints.md).
