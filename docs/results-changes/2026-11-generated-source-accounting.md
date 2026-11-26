# Generated load sources and seismic brace crossings

## Verify generated load sources before solving

Prepared spatial analyses compare the force and moment measures of each original generated load and shell pressure with its descendant solver rows. Case factors and member splits carry source identity, and a split line load is checked at its original member stations. Two independently generated opposing loads can no longer conceal a missing delivery during expansion. The self-weight check starts with the density, section or shell thickness, direction and scope of each rule. It verifies each member or shell independently. For a factored spatial combination the corresponding solver rows are checked again after scaling. A discrepancy stops the analysis and names its source.

Opposite loads on a member can disappear in planar conversion while leaving both the case wrench and the member totals at zero. A pair of opposite shell pressures can also mask a changed moment when the case totals are compared. A sufficiently small self-weight can disappear at the existing planar component or spatial truss transfer cutoff. The new comparisons detect these losses individually.

A whole-slab definition also declares the load on its physical plate and the set of assigned cells. Each cell must receive that definition once. Separate definitions with opposite pressures can no longer hide two missing or repeated applications. Each cell's force and moment are integrated independently from its definition and compared with the actual solver rows. The cell assignment and wrench follow case inclusion and combination factors. Four equal strips with pressures of twice the specified value on the outside and zero on the inside preserve the full slab wrench, but now stop the solve. Planar self-weight provenance uses the same projected components as the solver when identifying weight lost below the conversion cutoff.

A reference gravity case can feed a notional case even when the gravity case is absent from the combination results. The same self-weight accounting now runs before that gravity is read. A 2 m truss with a section area of 1 m² and a density of `2⁻⁴⁰` kN/m³ should contribute `2⁻⁴⁰` kN at each end. The existing truss cutoff suppresses both end forces, so the analysis stops before deriving a zero notional action. The control at `2⁻³⁹` kN/m³ retains both end forces and generates the specified fraction at each end. A planar rule with a factor of zero is skipped before resolving its group or reading density.

Derived notional nodal loads are also checked at their authored nodes. For three equally spaced nodes with forces of 3 kN each, shifting the row forces by +1, −2 and +1 kN leaves both the resultant and its first moment unchanged. The per-action receipts reject that shift in the original case and in a case that includes it. The line-load applicability check compares opposing forces within each effective case. Mutually exclusive cases only contribute to that comparison if a composed case brings their loads together.

## Check assembled slab targets and nodal forces

Whole-slab accounting checks the actual shell family and cell for pressure rows, and the force delivered to every authored mesh node for nodal rows. Two horizontal slabs can have identical pressure wrenches even at different elevations. Routing a row to the upper slab therefore has to fail independently of the force and moment totals. The same cell receipt is checked after case inclusion and combination factoring.
For every plate or quad covered by a spatial self-weight rule, assembly validates the material density before multiplying by the rule's factor. It retains the corner load rows when their force is zero, so an applicable rule with zero density or factor still has a case result. This preserves the main branch's behavior in single, linear combination, P-Delta and active-set solves. Invalid density is refused even at a zero factor.

## Transfer connected X-brace inertia on the brace spans

At a four-way joint, the seismic mass model follows each pair of uniquely collinear member legs independently. The joint contributes no story elevation. Each run ends at a supported or evidenced floor station, and its inertia stays distributed over the portions of the brace assigned to the active story. A kinked or ambiguous crossing still blocks the plan.

The #2330 witness has two columns, one floor beam and two connected subdivided diagonals in a square 4 m by 4 m frame. Its width loads are zero, its material weight is 2 kN/m of member and its specified seismic coefficient is 1. The upper story force is `16 + 4√8` kN. The overturning moment about the model’s horizontal transverse axis is `64 + 12√8` kN·m. The two upper brace legs each carry a 2 kN/m line load. The previous planner refused this model at the crossing.

## Transfer inertia on a gable supported at both eaves

Two straight rafters meeting at the highest ridge of a frame establish a gable when their run ends are at the same elevation and each eave has a continuous vertical column to the supported datum. A straight subdivision of either column preserves this support path. A horizontal tie between the eaves also preserves it when each eave has exactly one qualifying downward column. The eaves establish the story and each rafter retains a distributed load. Independently evidenced ridge floors retain their separate story. Both column bases must restrain all three translations. The generator stops when only one base qualifies, including when the other support restrains rotations alone.

The #2332 witness has 2 m of horizontal run and 1 m of rise on each rafter. At 2 kN/m of member weight and a specified seismic coefficient of 1, the rafter inertia is `4√5` kN and its overturning moment about the model’s horizontal transverse axis is `10√5` kN·m. The generator now returns the same force and moment when the rafters are subdivided or the frame changes global orientation.

## Transfer gravity over a bounded gap in an attached roof run

Two rigid end ties can establish one vertical translation between an inclined rafter and the surrounding shells. The gravity planner clips the translated run against those shells. It assigns the complementary intervals to the rafter at the configured tributary width. The same intervals and exposure classifications are used when the run is subdivided. The gap trace is partitioned at cover boundaries and clearance changes. The planner stops when any sheltered and exposed intervals coexist and pressure depends on exposure. In explicit width mode the specified line load continues over the full member span. Partial attachments without independent end ties or with unresolved horizontal eccentricity still refuse. The regeneration notice uses the same paired-attachment and bounded-gap geometry as the planner. When several vertical translations are independently anchored at both ends, each trace must identify the same bounded gaps. The planner uses that shared partition once and continues to refuse conflicting traces.

In the #2295 model, the two shell regions cover 32 m² of horizontal projection. The unloaded part of the rafter runs from 4 m to 6 m of horizontal station, with a configured width of 3 m. At the fixture's uniform 1 kN/m² dead pressure the physical shell and rafter loads total `38√1.04` kN. The linear and P-Delta support reactions recover this total in the original and subdivided models. With a second pair of shells on the opposite side of the rafter and at a different elevation, the matching gap still contributes a single width load. The resulting total of `70√1.04` kN uses 64 m² of projected shell area and 6 m² of projected rafter tributary area.

## Preserve distributed loads in the member axes

Spatial analysis sends locally specified distributed components to the solver in their entered axes, including the displayed local Y sign convention. Global components are resolved onto the member axes once. A frame retains its line load, and a truss receives its statically equivalent end forces. This removes round-trip projection error that could produce unintended components or stop analysis on a skew frame. The skew-frame sweep now prepares all 30 of its original models and the modal stiffness-scaling check runs with its original expected values.

## Classify exposure over the full rafter gap

An offset rafter with a bounded gap carries the strip certified by the shell edges on both sides. The exposure check uses that strip's full plan footprint. A canopy can cover the rafter axis while leaving a portion of the strip exposed, and a canopy off the axis can also cover part of the strip. The planner refuses mixed exposure when the selected loads depend on exposure. Fully exposed and fully covered strips use their respective pressures. Regenerate affected automatic gravity loads.

## Verify surface-load delivery on the intended shell

The generated-source ledger checks pressure rows against the authored shell family and cell ID. For equivalent nodal rows it checks the force at every intended node. Identical horizontal shells at different heights have the same wrench under a vertical pressure. Alternating force errors at the four corners of a square can also preserve the wrench. Both errors now refuse before dispatch. The same receipt follows the surface load through case inclusion and combination factoring.
