# Gravity diagram coordinates

PR #2219 round 10 corrects two diagram defects introduced on the unmerged
member-loading branch. Neither is assigned a new advisory.

On a unit cantilever, a quadratic torque density over [a,b] with a=0.5,
b=next_up(a), h=b-a and ordinates [1/h,-1/(2h),1/h] has zero integral and
interior torque extrema ±sqrt(3)/18. There is no representable global station
strictly inside that support. The previous support check accepted it, and
global-coordinate sampling lost both extrema.

The shared MemberMomentSpan invariant now refuses canonical supports narrower
than 1e-10 of member length, using the relative geometry limit requested in
#2223. The existing endpoint rounding checks remain. Linear, prepared, P–Delta
and corotational solvers all pass through this check. Supported extrema are
found and evaluated in a local interval parameter; their values travel with
the rounded display stations instead of being recomputed through those stations.
Native and WASM regressions cover every moment axis, the review's one-ULP
support, both sides of the relative limit and the exact limit, and supported
quadratic extrema against their integrated polynomial. Existing plane refusal,
member force, moment, torsion and displacement controls remain enabled.

A 10 m variable member with a piece over [5,10], zero starting shear, a -1
uniform load and a +10 point load at 7.5 m formerly reported a maximum of 7.25.
Both floating-point neighbors of the local jump station mapped to parent t=0.75,
where evaluation excludes the load. The shared parent-station mapper now creates
neighbors after mapping, and verifies that the evaluator's inverse coordinate
map places them strictly on opposite sides. The diagram retains the 7.5 peak.
Tests cover both shear axes and torsion, both signs, ABS/SRSS wrappers and
correct unloaded/uniformly loaded pieces. They test the jump sampling of those
wrappers; they do not close the separate combined-extrema issue #2252.

Rerun affected analyses, diagrams, combinations and checks. The registry entry
applies to frames with member loads. No generator or physical tributary partition
changes in this round. Complete-fixture carrier coverage/remeshing #2254 and
the suspension-bridge mirrored first-moment comparison #2255 remain deferred,
with their existing known-wrong-result skips unchanged.

The certificate gap tests now exercise tightness on an explicit coarse station
grid and coverage on the displayed stations. The same gap implementation serves
both; all tightness thresholds and coverage assertions are unchanged. Adding
actual extrema to the display made the previous tightness fixture's missed-peak
ratio zero. Recheck tests now specify their historical results-version fixture
and also test gravity changes landing at one shared version, as CI's merge does.
The exact notice identities, order and regeneration boundaries remain asserted.

The new refusal also applies to the nonzero ULP-width moment fringes emitted by
four rotated notched-carrier fixtures. Those exact generated loads now assert a
clear refusal in linear and P–Delta WASM. Every shear, bending, torsion and tip
displacement assertion still runs for each rotation/mirror/subdivision, with an
independently specified supported hand profile in these four cases. No fragment
is discarded, widened or converted into a nodal load by production code.
Canonicalizing those geometric fringes is left outside this diagram repair;
they cannot be silently accepted under the required support limit.
