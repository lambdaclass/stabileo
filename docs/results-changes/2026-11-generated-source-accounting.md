# Generated load sources and seismic brace crossings

## Verify generated load sources before solving

Prepared analyses now compare the force and moment of each materialized generated load and shell pressure with its own solver rows. The self-weight check starts with the density, section or shell thickness, direction and scope of each rule. It verifies each member or shell independently. For a factored spatial combination the corresponding solver rows are checked again after scaling. A discrepancy stops the analysis and names its source.

Opposite loads on a member can disappear in planar conversion while leaving both the case wrench and the member totals at zero. A pair of opposite shell pressures can also mask a changed moment when the case totals are compared. A sufficiently small self-weight can disappear at the existing planar component or spatial truss transfer cutoff. The new comparisons detect these losses individually.

A whole-slab definition also declares the load on its physical plate and the set of assigned cells. Each cell must receive that definition once. Separate definitions with opposite pressures can no longer hide two missing or repeated applications. The cell assignment and its wrench follow case inclusion and combination factors.

## Transfer connected X-brace inertia on the brace spans

At a four-way joint, the seismic mass model follows each pair of uniquely collinear member legs independently. The joint contributes no story elevation. Each run ends at a supported or evidenced floor station, and its inertia stays distributed over the portions of the brace assigned to the active story. A kinked or ambiguous crossing still blocks the plan.

The #2330 witness has two columns, one floor beam and two connected subdivided diagonals in a square 4 m by 4 m frame. Its width loads are zero, its material weight is 2 kN/m of member and its specified seismic coefficient is 1. The upper story force is `16 + 4√8` kN. The overturning moment about the model’s horizontal transverse axis is `64 + 12√8` kN·m. The two upper brace legs each carry a 2 kN/m line load. The previous planner refused this model at the crossing.

## Transfer inertia on a gable supported at both eaves

Two straight rafters meeting at the highest ridge of a frame establish a gable when their run ends are at the same elevation and each eave has its own vertical column to the supported datum. The eaves establish the story and each rafter retains a distributed load. Independently evidenced ridge floors retain their separate story. The generator still refuses a roof path that cannot establish both supports.

The #2332 witness has 2 m of horizontal run and 1 m of rise on each rafter. At 2 kN/m of member weight and a specified seismic coefficient of 1, the rafter inertia is `4√5` kN and its overturning moment about the model’s horizontal transverse axis is `10√5` kN·m. The generator now returns the same force and moment when the rafters are subdivided or the frame changes global orientation.
