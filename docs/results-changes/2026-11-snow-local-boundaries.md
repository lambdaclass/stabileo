# Snow loads respect local positions and drift boundaries

Review #2095 round 7 corrects nodal snow pressure, drift load segmentation and
exterior-edge classification. This correction is unmerged and unreleased.
Regenerate affected snow loads, then rerun analyses, combinations and design
checks. Re-solving stored generated loads alone does not correct them.

Nodal tributaries previously selected a roof plane at the panel's vertex-average
centre. That point lies outside an L-shaped panel, in its recess. The pitched
nodal tributary then received flat-roof pressure. Panel pressure queries now
require an actual position, and nodal loads supply their tributary node's
position. The centre fallback is removed. In the concave regression, the parent
and local main both return fz = -0.75; the independently calculated roofSnow
pressure times the tributary area gives -0.4740351607867598. The corrected
result is -0.4740351607867601. Flat nodal controls retain their answer.

Surcharge loads previously interpolated between fixed quarter points, bridging
internal exemptions and band ends. Each band now supplies its applicability and
shape margins to one shared partitioner used by width and panel-strip allocation.
Partitions include roof/panel boundaries, applicability roots, drift-width
boundaries and sliding limits. The rule module owns the drift shape constants
used by both the calculation and its boundary margins. Quadratic roots cover
oblique intersections with the reciprocal-width branch. Tributary integration
splits before applying the existing eight-subinterval Simpson rule; longitudinal
segments use one-sided limits so a discontinuity cannot become a ramp across an
exempt interval. Quarter stations remain additional approximation stations
within applicable intervals. This is not a new general roof-skin integrator.

In the stepRoof regression the applicability cutoff is computed from the
repository's stepDrift inputs. At y = 0.3 the parent emits a width surcharge of
0.01125582175787739, although stepDrift says it does not apply. The correction
emits zero. Main also emits zero there, but wrongly emits zero at y = 0.2,
where the corrected generator gives 0.018848706373481523 for the direct inputs.
The parent gives 0.018848706373262008 at that valid station. Thus the reported
exemption leak is worse on the branch than main, while main has a separate
missing-drift result on the same model. Tests also inspect both sides of drift
width, sliding and adjacent-drift boundaries, including reversed carriers.

Exterior classification previously compared panel datum heights. A roof rising
from 2 to 4 next to a flat roof at 3 is higher at their shared edge, even though
its datum is lower. The common surface model now supplies piecewise local edge
height differences to classification and preflight. Edges split at surface and
panel boundaries. If height ordering reverses along a shared edge, the entire
snow request refuses with snow.refused.roofPlane before constructing any loads;
the direct surcharge entry point throws the same refusal. The numerical
exterior witness's spurious parapet contribution is 0.06847295000000042 on the
parent and 0.0684729500000004 on local main; the correction gives zero. Lower
neighbours and both sides of the existing edge-elevation tolerance are controls.

The CI low-step witness has crossing roof surfaces: its nominal upper roof is
below the receiving ridge along part of the shared edge. At rotation 0.37,
floating-point cancellation also made a perpendicular gradient look descending,
triggering the sliding-overlap refusal. A shared roundoff-bounded direction
predicate removes that spurious distinction, and crossing-order preflight
refuses the geometry at every tested rotation. The original exemption test now
uses parallel pitched roofs so the step height is positive along the whole
edge; separate tests require refusal for the original crossing geometry. The
geometric and engineering limits are unchanged.

This is one TypeScript generator shared before native/WASM and linear/nonlinear
solver selection. Direct generation, direct surcharge, planSnow and complete
load planning are exercised; no solver implementation changed. The registry
notice requires both snow and generated loads, including when stale loads have
been re-solved. Manual snow and generated non-snow controls do not receive it.

The local origin/main source reference used for comparison was
013485aa2629a05672403919060cc1397f510fd1. Main's silent nodal and exterior errors,
and its missing drift at the valid step station, are recorded for coordinator
follow-up. No new safety advisory is added. Three exact expected snow snapshots (step, rotated step and two-pitch) change
their segment lists and strip integrals; the other seven snow checks retain
their expected results. For the step eave strip at x = 0.5, 0.75 and 1, the
new regression independently integrates the capped triangular pressure:
q = gamma * (hc - x/8)^2 / (2*tan(slope)). It checks that the strip ends at
the width boundary before the exemption, so the formula applies. This validates
the changed strip endpoint intensities without using the new partitioner as
the expected result. Snapshot comparison rules, engineering tolerances and
numerical assertions are unchanged.
