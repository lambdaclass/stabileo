# Snow overrides preserve unbalanced sides and section runs

Review #2095 round 8 corrects two regressions on the unmerged snow branch.
Regenerate affected snow loads, then rerun analyses, combinations and design
checks. Re-solving stored generated loads alone does not correct them.

A flat geometric model can use the supported roofSlopeDeg override. Such a
model has no inferred sloped planes. The branch treated missing planes as a
zero gradient projection, assigning balanced pressure to both unbalanced cases.
The shared pressure allocator now explicitly distinguishes inferred surfaces
from the coordinate fallback. The fallback classifies member midpoints relative
to the geometric ridge and shares leeward and windward pressure at that ridge,
restoring main's existing 0.01 coordinate boundary. Every allocation path uses
that same pressure function, including panel strips and nodal tributaries.
Inferred surfaces retain their gradient-based side assignment.

When roof members are collinear in plan, they cannot establish a spatial plane.
The branch supplied only the current member to the connected-section traversal.
Consequently splitting a 10 m eave-to-ridge run in two changed its width to 5 m,
changing which unbalanced-pressure branch applied. The common surface model
now supplies all members on the same plan line and elevation gradient to that
traversal. It constructs one shared section with the full run's extent, reused
by every member. Gaps, height discontinuities and gradient changes keep sections
separate. The existing geometric tolerances and engineering limits are retained.

The initial public-interface replay has 17 checks: eight flat-override checks
on both sides of the width branch and nine section checks covering one, two and
three members per slope through projected, width and panel entry points.
On dc66a2378b, 14 fail and the three unsplit controls pass. The same tests all
pass on origin/main at 013485aa2629a05672403919060cc1397f510fd1. Expected pressures
come from the repository's roofSnow rule calculation, with explicit member
projection and tributary scaling. These witnesses establish branch regressions;
no safety advisory is added.

Additional coverage exercises rotation, reflection, translation, reversed member
endpoints, selected targets, nodal tributaries, complete load planning, ridge
sharing boundaries, unbalanced applicability limits and geometric matching
boundaries. Flat roofs without an override and unsplit sections retain their
answers. The generator is shared before analysis selection; no Rust solver,
native/WASM solver implementation or linear/nonlinear solver changes.
