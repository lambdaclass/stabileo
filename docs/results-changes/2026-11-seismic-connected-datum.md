# Static seismic loads require a common elevation at connected supports

PR #2316. 2026-11-19.

The static planner follows members and shells from the participating seismic
mass to find the supports that define the datum. Unrelated supports do not
set the base elevation or introduce stories. When the connected supports
span different elevations, the planner reports a stepped base and blocks
static load generation.

In the regression model, a cantilever extends from 0 to 4 m, with uniform
member weight of 2 kN/m and a manual seismic coefficient of 1. Adding an
unused supported node at −5 m previously lowered the datum and doubled the
reported seismic weight and base shear from 4 to 8 kN. With the corrected
datum, both values are 4 kN and the resulting lateral load is 2 kN/m on
the upper 2 m of the member. A stepped frame or a stepped base connected
through a shell or plate now produces a refusal and no E case.

Regenerate affected E cases and repeat the analyses, combinations and design
checks that use them. A stepped-base refusal means the planner cannot
regenerate static seismic loads for that model.
