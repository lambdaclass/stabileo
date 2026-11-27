### BREAKING (results)

#### Preserve distributed loads in the member axes

Spatial analysis preserves entered local line-load components. This avoids spurious components and accounting refusals on skew frames. Whole-slab accounting checks each cell's force and moment from its definition. Analysis stops when a wall edge passes through a slab without a mesh joint. (#2586)

#### Validate supports and exposure for generated loads

Gable seismic generation requires effective translational restraints at both bases. An attached roof run with both sheltered and exposed gaps stops gravity planning when exposure changes the load assumptions, regardless of how the rafter is subdivided. Self-weight notices use the two planar components that determine whether analysis can apply the weight. (#2586)
