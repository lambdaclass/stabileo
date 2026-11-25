# Generated load sources and seismic brace crossings

## Verify generated load sources before solving

Prepared spatial analyses compare the force and moment measures of each original generated load and shell pressure with its descendant solver rows. Case factors and member splits carry source identity, and a split line load is checked at its original member stations. Two independently generated opposing loads can no longer conceal a missing delivery during expansion. The self-weight check starts with the density, section or shell thickness, direction and scope of each rule. It verifies each member or shell independently. For a factored spatial combination the corresponding solver rows are checked again after scaling. A discrepancy stops the analysis and names its source.

Opposite loads on a member can disappear in planar conversion while leaving both the case wrench and the member totals at zero. A pair of opposite shell pressures can also mask a changed moment when the case totals are compared. A sufficiently small self-weight can disappear at the existing planar component or spatial truss transfer cutoff. The new comparisons detect these losses individually.

A whole-slab definition also declares the load on its physical plate and the set of assigned cells. Each cell must receive that definition once. Separate definitions with opposite pressures can no longer hide two missing or repeated applications. Each cell's force and moment are integrated independently from its definition and compared with the actual solver rows. The cell assignment and wrench follow case inclusion and combination factors. Four equal strips with pressures of twice the specified value on the outside and zero on the inside preserve the full slab wrench, but now stop the solve. Planar self-weight provenance uses the same projected components as the solver when identifying weight lost below the conversion cutoff.

## Transfer connected X-brace inertia on the brace spans

At a four-way joint, the seismic mass model follows each pair of uniquely collinear member legs independently. The joint contributes no story elevation. Each run ends at a supported or evidenced floor station, and its inertia stays distributed over the portions of the brace assigned to the active story. A kinked or ambiguous crossing still blocks the plan.

The #2330 witness has two columns, one floor beam and two connected subdivided diagonals in a square 4 m by 4 m frame. Its width loads are zero, its material weight is 2 kN/m of member and its specified seismic coefficient is 1. The upper story force is `16 + 4√8` kN. The overturning moment about the model’s horizontal transverse axis is `64 + 12√8` kN·m. The two upper brace legs each carry a 2 kN/m line load. The previous planner refused this model at the crossing.

## Transfer inertia on a gable supported at both eaves

Two straight rafters meeting at the highest ridge of a frame establish a gable when their run ends are at the same elevation and each eave has a continuous vertical column to the supported datum. A straight subdivision of either column preserves this support path. The eaves establish the story and each rafter retains a distributed load. Independently evidenced ridge floors retain their separate story. Both column bases must restrain all three translations. The generator stops when only one base qualifies, including when the other support restrains rotations alone.

The #2332 witness has 2 m of horizontal run and 1 m of rise on each rafter. At 2 kN/m of member weight and a specified seismic coefficient of 1, the rafter inertia is `4√5` kN and its overturning moment about the model’s horizontal transverse axis is `10√5` kN·m. The generator now returns the same force and moment when the rafters are subdivided or the frame changes global orientation.

## Transfer gravity over a bounded gap in an attached roof run

Two rigid end ties can establish one vertical translation between an inclined rafter and the surrounding shells. The gravity planner clips the translated run against those shells. It assigns the complementary intervals to the rafter at the configured tributary width. The same intervals and exposure classifications are used when the run is subdivided. The gap trace is partitioned at cover boundaries and clearance changes. The planner stops when any sheltered and exposed intervals coexist and pressure depends on exposure. In explicit width mode the specified line load continues over the full member span. Partial attachments without independent end ties or with unresolved horizontal eccentricity still refuse.

In the #2295 model, the two shell regions cover 32 m² of horizontal projection. The unloaded part of the rafter runs from 4 m to 6 m of horizontal station, with a configured width of 3 m. At the fixture's uniform 1 kN/m² dead pressure the physical shell and rafter loads total `38√1.04` kN. The linear and P-Delta support reactions recover this total in the original and subdivided models.

## Preserve distributed loads in the member axes

Spatial analysis sends locally specified distributed components to the solver in their entered axes, including the displayed local Y sign convention. Global components are resolved onto the member axes once. A frame retains its line load, and a truss receives its statically equivalent end forces. This removes round-trip projection error that could produce unintended components or stop analysis on a skew frame. The skew-frame sweep now prepares all 30 of its original models and the modal stiffness-scaling check runs with its original expected values.
