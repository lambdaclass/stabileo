# Static seismic loads use the lowest support elevation

PR #2316. 2026-11-19.

The static seismic planner now excludes mass assigned at or below the lowest
support elevation. It uses the same support-relative story heights for the
static method's applicability, approximate period and force distribution.
The planner blocks generation when it cannot determine the support datum.

For a 4 m cantilever with uniform self-weight of 2 kN/m and a manual
coefficient of 1, the seismic weight and base shear are 4 kN at support
elevations of 0, +10 and −5 m. This change originally applied 2 kN/m
uniformly over the upper half in each model. The subsequent story
overturning correction reshapes that load while keeping the base shear.
The earlier planner used the global origin
as the base. At +10 m it reported 8 kN for both seismic weight and base shear.
At −5 m it generated no seismic action.

Regenerate affected E cases for models whose lowest support is away from
global elevation zero. Repeat the analyses, combinations and design checks
that use those loads.
