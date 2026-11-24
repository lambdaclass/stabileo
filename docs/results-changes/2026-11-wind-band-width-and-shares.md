# Wind width at tower-to-mast transitions

PR: #2220. Date: 2026-11-16. These defects exist on the unmerged wind branch.

A single width mode was selected for an entire height field. Physical tower
legs below a single mast selected geometric width everywhere, so the mast's
zero geometric span refused with missingWidth even with a valid declared width.
Mode is now selected between changes in continuous carrier sets. Collinear
member subdivisions retain the same carrier extent, so a taper retains its
physical width through subdivision and through pressure boundaries. A separate
mast band uses its declared width. Missing or nonpositive declared widths still
refuse. The existing width threshold, quadrature checks, moment acceptance
criteria, depth limit and test timeout are unchanged.

The regression tower has width 2 − z/2 on heights 0 to 2 and declared mast
width 2 on heights 2 to 4. At unit pressure its force is 7 and its first height
moment is 44/3. Both field and complete planner entries, other-structure entry,
subdivision, rotation and reflection are covered. Each carrier is also isolated
as a cantilever with its actual arc length; independent affine integrals check
station forces and tip displacement through 2D/3D linear/P-delta WASM and native
solvers. This tests load transfer, not assembled tower stiffness.

Wall derivations previously assigned every equivalent nodal share the complete
wall interval and the pressure at its node, falsely labelling that pressure a
band mean. A dedicated derivation now identifies the node and its equivalent
share of integrated wall pressure. It does not claim a band mean.

Repeated geometry/tributary calculations are separated from pressure sampling.
Stationary carrier geometry and the torsional distribution geometry are prepared
once per band; physical pressure is evaluated once per station. Ordered
partition traversal replaces repeated linear searches. All four physical work
moments still pass the same independent acceptance path. Existing generated
native fixtures retain their numerical values. Expected tip rows are required
before comparing displacements in the mechanical regression matrix.

Regenerate W/Wa, then rerun analyses, combinations and design checks. Re-solving
stored loads does not regenerate them. No new advisory is assigned.
