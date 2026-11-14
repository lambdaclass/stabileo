# Snow loads use connected roof regions

Review #2095 corrects the shared roof-surface model introduced by #2082/#2093.
The correction is unmerged and unreleased. No new advisory is assigned here.

Surface inference uses the complete model. Selection filters load targets after
inference and leaves the reported pitch and width consistent with those loads.
A plane's member graph determines its footprint, including recesses. Separate
components remain separate. A connected three-sided roof may close its straight
ridge between terminal points at the same extreme elevation; unrelated parallel
members cannot establish a footprint. Unresolved spatial sources over receiving
panels refuse instead of silently omitting sliding. A planar section still
supports the explicit tributary-width extrusion calculation.

Tributary strips are partitioned at the surface boundaries they cross. Each part
uses that surface's pitch and width. A discontinuity in pressure produces separate
load pieces with their own one-sided end values. A ridge member loaded by width
shares the adjoining surfaces' pressures. Unbalanced intensities and partial-load
exemptions use those same local surfaces. Aggregate geometry remains available
for display and roof-axis pattern construction, not as the pressure of every face.

Sliding sources traverse shared edges at matching elevations through successive
upslope facets with the same plan ascent direction. They stop at a ridge or gap.
The retained two-pitch witness increases the contributing width from one facet's
1 m to the connected eave-to-ridge distance of 6 m. At the direct drift interface
with p_f = 1, its sliding surcharge increases from 0.0888888888888889 to
0.5333333333333334 in the member-500 unit-width witness. The sliding cutoff
remains the chapter 9 distance. Projected coordinates within floating-point
roundoff of a boundary are canonicalized to that boundary; the inequality and
engineering distance are unchanged.

The origin/main source at fb241aa04 (also v0.6.0) was replayed in this worktree.
It returns wrong numerical outputs for selection, asymmetric tributaries,
unbalanced snow, partial exemptions and disconnected sections. In the two-pitch
witness it omits the sliding surcharge completely. The flat recess control is
correct on main: convex-hull filling is a regression confined to this branch.
The detailed per-claim runtime evidence is retained in the coordinator handoff;
any advisory decision belongs to the coordinator.

The re-check entry requires snow AND generated loads, so non-snow projects and
manual snow controls receive no regeneration notice. Solving historical generated
loads again does not clear the notice; regenerate the loads first. The older two
snow entries now include their missing PR metadata. Registry validation rejects
missing or malformed PR lists before tests accept an entry for consumers.

Tests cover direct projected-width, width-layout, panel-layout, load-planner,
surface-query and drift/sliding interfaces. Whole load lists are compared under
rotation, translation and reflection for asymmetric, concave, disconnected and
two-pitch geometries. Existing low-slope, drift-depth, cap and planar-section
boundary assertions remain unchanged. Linear/nonlinear and native/WASM solvers
consume the same generated loads; there is no second native snow generator.

CIRSOC 104 provisions used here come exclusively from the repository extraction
at docs/codes/CIRSOC/markdown/cirsoc-104-2005: chapters 3, 4, 5, 6, 7 and 9 and
Figures 2 and 9. No engineering constants were taken from memory.
