# Generated seismic actions follow physical mass

Issues #2208 and #2209. 2026-11-18.

Generated seismic forces were divided equally among the nodes at a level. Adding
a node could move the resultant and change the loading of the members. The modal
planner also averaged the sampled displacement at those nodes, so the same
displacement field could change its calculated participation on subdivision.

The static seismic planner now keeps the locations and weights of the physical mass
carriers. The shared wind member-load conversion emits global line loads over
the loaded part of each member. Flat modeled shells carry surface loads.
Accidental torsion on supported levels is distributed around the physical mass
centroid. Modal seismic load generation is unavailable pending the force
distribution redesign. [Issue #2319](https://github.com/lambdaclass/stabileo/issues/2319)

The preview identifies levels whose mass or load path it cannot establish. A
plan with an incomplete seismic action cannot be applied. Eccentric
member loading that requires a distributed couple remains unavailable because the
current member-load input cannot represent it.

Regenerate affected E loads and repeat analyses, load combinations and design
checks. Existing stored E loads need regeneration before they reflect the change.
