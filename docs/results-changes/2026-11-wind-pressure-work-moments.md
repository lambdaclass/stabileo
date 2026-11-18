# Wind pressure work moments and sign forces

PR: #2220. Date: 2026-11-16. This corrects defects on the unmerged wind branch.
No aerodynamic coefficient or engineering threshold changes.

The shared pressure integrator fitted an affine density to force and first
moment, then checked its residual at the same three Gauss points. A cubic
residual proportional to the third Legendre polynomial vanishes at those
points. For the unit interval and p(s) = s²(1.5 − s), it accepted q = −0.05
and qJ = 0.55. The physical pressure is nonnegative, and its third moment is
3/28; the replacement's third moment is 43/400, an excess of 1/2800.
Matching global resultants did not establish correct member loading or work.

Four-point Gauss integration now independently computes moments through degree
three, with whole-versus-split convergence for every moment. It integrates a
cubic times s³ exactly in exact arithmetic. The affine candidate's moments are
computed analytically and compared with all four physical moments. Coordinates
relative to each interval avoid cancellation in the affine fit. Quadrature
convergence retains the existing 1e-12 criterion and depth 24; both convergence
and replacement error budgets are apportioned by interval length. Replacement
acceptance is tightened to 1e-14 to satisfy the interior station regressions.
No existing assertion, tolerance or baseline is relaxed.

When the quadrature values and physical endpoints have a common sign, the
candidate endpoints must retain it. A force-preserving constrained affine
candidate handles a zero at the end of a curved pressure: simply subdividing
an unconstrained fit of s² would keep a negative endpoint at every depth. This
candidate must still pass all four independent moment checks. The first-moment
metadata describes the accepted member load, including that constrained fit.
A true affine pressure, including one crossing zero, remains affine. A field
that cannot meet the checks within the existing depth refuses explicitly.
This finite adaptive quadrature does not certify arbitrary discontinuous or
adversarial callback functions; known pressure boundaries must still be supplied.

The mechanical regression uses a six-carrier rectangular grid. Its x positions
are 0, z and 2; its y edges are ±(1.5 − z)/2 for 0 ≤ z ≤ 1. With pressure z,
each left carrier receives z²(1.5 − z)/8 per unit height, each middle carrier
receives z(1.5 − z)/4, and each right carrier receives
z(1.5 − z)(2 − z)/8. These follow directly from the midpoint tributary cells.
Tests compare all four integrated moments per member and require nonnegative
member intensities. Each left carrier is then treated as an isolated cantilever
with its physical arc length and transformed density q(s) = w(z) dz/ds.
The independent oracle uses V(s) = integral_s^L q(t) dt,
M(s) = integral_s^L q(t)(t − s) dt and tip displacement
[3L integral_0^L q(s)s² ds − integral_0^L q(s)s³ ds]/(6EI).
Station shear, bending, torsion and tip displacement are checked through field
and planner entry points, subdivisions, rotation, reflection, both signs,
2D/3D, linear/P-delta and WASM/native. This isolates load transfer from assembled
grid stiffness. Roof and other-structure callers use the same acceptance path;
their affine and zoned fields remain covered by the prior regression matrix.

For a solid sign, the derivation previously reported pressure times maximum
width times height even when the applied physical width varied with height.
It now integrates the very member field used for the applied cases. The
clearance-zero regression has width 6 − 2z over 0 ≤ z ≤ 2 and width 2 over
2 ≤ z ≤ 6: its area is 16, whereas the report used 36. The complete transverse
resultant assertion also includes distributed loads and is mutation-checked.

Regenerate stored W/Wa loads and rerun analyses, combinations and design checks.
Re-solving the old stored loads does not repair them. No new advisory is assigned.
