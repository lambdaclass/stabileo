# Snow tributary intensities have an explicit approximation bound

PR #2197, round two, corrects an approximation introduced on the unmerged
#2172/#2176 branch. The affine member-load schema has endpoint intensities and
intervals only; it cannot carry an exact quadratic. The previous two-segment
reconstruction matched force and first moment while replacing the physical
midpoint. For q(x) = -p x(1-x/8) on [0,4], q(2) = -3p/2, whereas the old
reconstruction emitted -5p/3. Beam shear, moment and deflection therefore changed
although the resultant agreed. This approximation defect alone needs no new
advisory: it was introduced on the unmerged branch. The pre-existing main
wrong results remain covered by the coordinator-reserved #2176 and #2172 records.

The independent snapshot oracle also exposed duplicate allocation on this
branch: each overlapping tributary source was restricted against every strip
on its physical run. The hip case moved away from the physical value. Strip
normalization now retains a set of source identities. Overlapping or adjacent
strips representing the same affine depth join into one canonical profile, and
each original source emits only that profile restricted to its own extent.
Distinct overlapping tributaries remain additive exactly once. True changes
in source coverage are physical integration boundaries; adjacent mesh-fragment
endpoints cancel in the coverage event count. This preserves exact resultant
integration when an overlapping source starts or ends inside another strip. Source membership
is checked by the shared allocation path, so remeshing cannot create duplicate
contributions. This defect was also branch-only; no new advisory is added.

`boundedSnowIntensity` is the sole constructor used by physical-strip panel
integration, before restriction to mesh members. It receives the actual
one-sided endpoints and midpoint of each quadratic interval. For normalized
t in [0,1], write q(t) = q0 + (q1-q0)t + 4 delta t(1-t), where
 delta = qc - (q0+q1)/2. Let S be the maximum absolute sampled intensity over
the complete physical strip, including every geometric interval endpoint and
midpoint. The stated pointwise bound is epsilon S with epsilon = 0.0001
(0.01%). This is an absolute bound relative to the strip scale, not a relative
error claim at a zero of the physical load.

Choose n = max(1, ceil(sqrt(abs(delta)/(3 epsilon S)))). Each subcell has
quadratic deviation abs(delta)/n² or less. On a subcell, use its actual endpoints
and the corrected affine knot qM = (8 qc - q0 - q1)/6. The largest pointwise
error of these two affine halves is abs(delta_subcell)/3. This follows by
subtracting the affine reconstruction from 4 delta_subcell t(1-t) separately
on each half: the extreme error occurs at the midpoint. Thus the complete
profile satisfies the stated bound. Simpson integration of the quadratic and
exact integration of the two affine halves agree on force; symmetry of their
error gives zero first moment about the subcell midpoint. Force and first
moment about any origin agree, so both plan moments agree along the member.
Any stationary point is also a knot boundary, preventing spurious positive
loads at a physical zero. Non-finite or positive pressure profiles are refused.
Cancellation below 128 machine epsilons of S is treated as affine; its discarded
curvature is included in the reported absolute bound. Downstream segment coalescing checks intensity deviation from the candidate
combined affine field against geometry-conditioned, magnitude-scaled floating-point roundoff. The
old absolute intensity and slope caps remain additional conditions, so neither
is loosened; the added condition prevents flattening small quadratic loads.
Endpoint interpolation uses nonnegative affine weights and preserves exact
endpoint zeros. No engineering assertion, baseline rule or comparison tolerance
is loosened.

The generated derivation states the 0.01% limit, its complete-strip scale and
the largest absolute bound in kN/m, in all six locales. Affine and zero controls
retain their answer. Regressions cover the triangular strip, rotation, reversed
member orientation with the same physical wind direction, both plan moments,
zero intensity, stationary zeros, positive and non-finite refusals, and both
sides of the subdivision transition. Additive overlapping quadratic sources
retain force, moment and bounded intensity under rotations, one/three/seven
member subdivisions, and unit or 1e-12 pressure scaling. Independent polynomial integration solves
a simply supported 8 m Euler–Bernoulli member with EI = 1: reactions follow
static equilibrium, shear and moment follow load integrals, and deflection
follows two integrations of moment with zero end displacement. The exact
piecewise quadratic and emitted affine loads are integrated separately at
interior stations, including midspan. These tests fail with the parent load
constructor and pass with the bounded constructor.

Generation is common TypeScript before 2D/3D, linear/nonlinear and native/WASM
solver selection; no solver-specific load constructor is changed. The existing
projected, width and panel entry-point class regressions remain active. A solver
schema extension for exact polynomials was left out because it would require
all solver assembly, load recovery and serialization consumers to change; the
bounded representation fits their existing affine contract.

The deliberate snapshot procedure is `make snapshots-update` with the load
snapshot file selected, followed by `make test.web.results`. Only the three
cases named in the panel and crossing records are refreshed. The final hip
snapshot preserves all its physical load values; its sole addition is the
explicit bound derivation (relativePercent 0.01 and absolute 6.926244879e-17). Added or removed
intervals and array indices describe the changed representation; their numeric
IDs and stations do not admit a meaningful monotonic accuracy comparison.
Regenerate all affected generated area loads, then rerun analyses, combinations
and design checks. Re-solving stored loads alone does not regenerate them.

Before refresh, the independent hip oracle checks balanced, all four partial
patterns and all four wind directions against direct integration of the four
physical facet regions (z = 3 + min(x,8-x,y,12-y)/2). It samples each interval
formed by the old and new load endpoints and the original tributary endpoints,
including points close to both sides of the ends. Maximum intensity error falls
from 6.452487433250553e-10 to 1.3322676295501878e-15 kN/m; no sampled physical
intensity worsens outside the checked-in snapshot serialization precision.
On `snow-subdivided-override`, both wind directions on both transverse edges
improve from maximum error 0.7875000000075001 to 2.220446049250313e-16 kN/m.
The pressure exactly on the discontinuity is intentionally checked by one-sided
limits rather than assigned a unique value. On `snow-roof-rotation`, the only
two changed values are zero residues: -1.897985615e-27 becomes -1.885962388e-27,
and -2.000410155e-27 becomes -1.914640663e-27, both closer to physical zero.
Array indices, element IDs and interval stations are representation metadata;
no engineering monotonicity claim is made for their renumbering. No physical
quantity moving away from its oracle was accepted in the refreshed snapshots.
