### BREAKING (results)

#### Refuse unconnected wall and slab faces

Spatial analysis stops when the full wall–slab intersection lacks compatible mesh edges, including when the wall spans beyond both slab edges. The load audit also retains each generated action through case expansion and member subdivision, so cancelling actions cannot hide a missing source. (#2586)

#### Check exposure along attached rafters and follow supported gable columns

Panel gravity checks exposure across the uncovered rafter interval. It stops when a partially sheltered gap needs different roof and floor pressures. Explicit-width gravity retains the configured full span. The seismic planner follows vertical column segments to restrained gable bases, and regeneration notices identify the affected geometry. The Basic P-Delta action uses the same selected plane as the linear solve. (#2586)
