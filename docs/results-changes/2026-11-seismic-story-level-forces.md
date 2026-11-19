# Static seismic forces act at story levels

PR #2316. 2026-11-19.

The static planner applies each calculated story force at the story elevation.
It distributes the force among the story nodes by tributary seismic mass.
The plan moment includes the physical mass centroid and the signed accidental
eccentricity. When a raked member's mass centroid is offset from the receiving
node in plan, the planner applies the corresponding vertical-axis moment at
that node.

Member and shell mass still contribute to the calculation. Straight member
subdivisions leave the physical carrier and its tributary shares intact.
A free mesh joint does not become a story attachment. The planner refuses a
story load when a member contributing to that story has no attachment at its
elevation. A model with participating mass below the common support datum is
refused before any seismic cases are generated.

In the 4 m cantilever fixture the 4 kN story force acts at the roof. The
base shear is 4 kN and the base moment is 16 kN·m. The previous branch
applied a signed line load over the upper 2 m and reached a section shear
of 16/3 kN within the band. The nodal action gives 4 kN throughout the
span below the roof. In the raked fixture, the 5 kN roof force and its
transfer moment give a plan moment of −11.25 kN·m about the base. The
previous band shifted the plan moment to −15 kN·m.

Regenerate affected E cases and repeat the analyses, combinations and design
checks that use them.
