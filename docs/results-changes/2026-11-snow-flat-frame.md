# Flat snow frames follow connected roof runs

Review #2095 round 10 corrects a regression on the unmerged snow branch.
Regenerate affected snow loads, then rerun analyses, combinations and design
checks. Re-solving stored generated loads alone does not correct them.

A flat geometric roof with a gable slope override has no inferred sloped plane.
The branch derived its fallback frame from the longest individual member. On
the reproduced 16 by 4 m perimeter, subdividing both long beams into eight
members changed the longest member's orientation. The resulting width W changed
from 2 m to 8 m and crossed the windward-pressure boundary in CIRSOC 104-2005
section 6.1, as implemented by roofSnow. Model discretization changed the loads.

The shared surface model now supplies complete connected collinear runs of the
selected roof members. Flat frame selection uses their total extents. Both this
path and sloped-section inference use the same collinearity, elevation and
endpoint-connectivity checks. Gaps, offsets and elevation discontinuities beyond
the existing geometric matching limits remain separate. Unselected members
cannot change the selected roof's frame. Sloped planes retain their own frames.

Equal-length runs retain source order within floating-point roundoff. Width
projection uses the existing bounded snowCoordinate normalization at the rule's
windward-width boundary, exposed once by the rule module. This prevents an
exactly limiting rotated width from becoming slightly larger through arithmetic
roundoff. The rule's inequality, geometric matching limits and test tolerances
are unchanged. Widths on either side, including offsets of 1e-12 m in the
untranslated fixtures, retain their distinct answers.

The three primary public-interface witnesses fail on parent 6520b29b95 and pass
on local origin/main 013485aa2629a05672403919060cc1397f510fd1. The final class
replay on the parent has 138 failing and 39 passing public behavior tests; ten
new run-representation checks are excluded from that replay. After the fix all
187 tests pass. Coverage includes one, two, four and eight members per long
beam, four plan rotations, reflection, translation, reversed endpoints, selected
roofs, projected/width/panel allocation, nodal tributaries, full load planning,
width boundaries, gap/offset/elevation matching boundaries, ordinary flat-roof
controls and planar-section controls. Pressures are compared with roofSnow and
with the corresponding unsplit physical load distributions.

The scope is the member-dependent frame regression. Ridge inference for unequal
subdivision of opposite flat edges is inherited from main and remains a
follow-up under the review's main-comparison rule. The generator is shared before
linear/nonlinear and native/WASM solver selection; no solver code changes.
This entry is not a new safety advisory.
