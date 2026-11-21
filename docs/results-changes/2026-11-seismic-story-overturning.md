# Static seismic loads preserve story overturning

PR #2316. 2026-11-19.

The static planner assigns each story force to its elevation. Distributing
that force by mass alone could move it below the story and understate
overturning. Each inclined or vertical carrier now receives a signed affine
correction over its loaded band that preserves its force share and places its
line of action at the story elevation. The same fit spans collinear mesh
subdivisions. Horizontal members and flat surfaces already act at the story
elevation. The planner refuses generation when it cannot represent a story
action on its carriers.

In the 4 m cantilever fixture with a story force of 4 kN, the previous branch
applied 2 kN/m over the upper 2 m and returned a base moment of 12 kN·m.
The corrected load varies from −4 to 8 kN/m over that interval and returns
4 kN of base shear and 16 kN·m of base moment. A two-story fixture has 3 kN
per carrier at each of 2 m and 4 m, giving 18 kN·m at the base and 6 kN·m
of overturning about the first floor from the upper story.

Regenerate affected E cases and repeat the analyses, combinations and design
checks that use them. A current wind basis or solve stamp leaves the
regeneration notice active while unverified legacy E loads remain.
