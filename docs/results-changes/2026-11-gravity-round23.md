# Combined diagram extrema and reference coordinates

Spatial ABS diagrams now partition each polynomial load interval at every
component zero and evaluate stationary points of the signed sum on each piece.
SRSS diagrams evaluate stationary points of the sum of squared component
polynomials, whose derivative can have degree five. Component extrema alone
cannot locate these combination extrema. The two moments
`1-(t-0.21)^2` and `1-(t-0.66)^2` have an ABS maximum at `t=0.435`.
The tests derive the expected value from those functions rather than a snapshot.
A cubic SRSS witness checks a stationary point of the quintic derivative.

Single-member and combination diagrams share polynomial reconstruction and
root isolation. Root isolation partitions at derivative candidates, brackets
sign-changing roots and retains critical candidates for repeated roots.
Candidates are evaluated using the original diagram equations. Density
boundaries, variable-section boundaries and both sides of concentrated loads
remain explicit stations. Nested magnitude components are refused rather than assuming their expressions
are cubic polynomials.
Rerun affected ABS/SRSS combinations, diagrams and dependent checks.

Spatial corotational recovery retains the reference length from its linear
recovery template together with reference-coordinate load supports and
intensities. Elastic member actions no longer carry a competing length.
Recovered end actions still use natural deformations and the final local frame;
only the diagram coordinate length changes. A shortening member with uniform
torsion density now integrates the entire reference-coordinate load and agrees
with its recovered end torque. Native recovery tests cover shortening, zero
strain and extension, full and partial supports, and uniform and varying density.
Native and WASM solved tests cover linear, P–Delta and corotational entry points.
Rerun affected nonlinear analyses, diagrams and dependent checks.

Linear gravity profile accumulation retains each compensated nonzero endpoint
sum. The former magnitude-based cleanup erased the exactly representable
residual of `2^50 + (-2^50+1)`. Tests cover both signs, input orders and adjacent
residual magnitudes, exact cancellation and ordinary loads. Opposing signed profiles also require exact adjacency and collinearity for
coalescing, so residual steps cannot disappear in a magnitude-based merge.
The existing geometric roundoff coalescing remains for profiles of one sign. Regenerate affected floor and area
loads before rerunning analyses and checks; rerunning saved loads is insufficient.

Absent optional transverse components in legacy axial point-torque metadata
mean exactly zero, as opposed to a failed numeric evaluation. The fail-closed
allow list records that invariant; present non-finite values remain present.
The transverse recovery fixtures explicitly construct their nonzero moment
arrays after zero-moment normalization rather than unwrapping removed zeros.

No tolerance, assertion or baseline is relaxed. No advisory is added or numbered.
The handoff records the origin/main comparison for coordinator review.
