# Gravity station jumps and member load edits

PR #2219 round 6 contains the remaining short-density endpoint path. Physical-region
allocation (SA-2026-079) and eccentric member loading (SA-2026-080) remain together.
This extends the [station and editing corrections](2026-11-gravity-round5.md).
No new advisory is assigned.

The old short-span conversion replaced trapezoidal forces and quadratic moment
densities with concentrated resultants. The point adapter then moved any such
resultant within `POINT_END_TOL = 1e-6` of a member end to its node. Equal global
resultants did not preserve the member's loading or its internal forces. The witness
uses a unit torque distributed on `[2-h, 2]`, with `h = 2 - (2 - 0.5e-9)` from the
represented fixture endpoints. It must remain a density, including after subdivision.

There is no longer any density-to-point conversion in `memberLoadSpans`, the shared
member splitter, or variable-member expansion. Intermediate geometry and load plans
retain their original density, support, frame and physical-span metadata. Projected
loads need no conversion for this intermediate representation; subdivision still
normalizes them against the original member axes before slicing.

The native-input boundary is the refusal point. All plane and spatial load builders check their final member-load arrays
through the same span invariant, including embedded plane loads. The existing native transverse-force integrator discards spans below `1e-12`,
so nonzero transverse forces on those spans are refused. Equality and both sides are tested.
Axial-only and moment-only native loading integrate every positive represented span
directly and stay distributed even below that transverse-force limit. A nonpositive or unrepresentable
support is refused. The localized message names the member and explains that the
step cannot be represented without moving its loading. No nodal force or couple is
substituted. The native issue_2222 witness remains ignored for #2223; this change
does not alter the raw Rust input contract or repair arbitrary existing point loads.

The containment tests check exact per-member densities through store splitting,
analysis subdivision and variable-member expansion, including plane forces,
projected inputs, sign-changing forces and quadratic moment densities. Actual WASM
linear and P–Delta cantilevers check torsion at stations within the short span and
tip twist through both evaluators, across rotations and subdivision. For uniform
unit total torque on `[a,b]`, with fixture `L=2`, `GJ=1000`, the hand solution is
`T(x)=-1+clamp((x-a)/(b-a),0,1)` and tip twist `(a+(b-a)/2)/1000`.
An ordinary eccentric floor retains independent per-carrier torsion checks; the
existing full shear, bending, torsion and deflection hand cases remain active.

The origin/main snow merge retains its physical roof runs and bounded pressure
profiles. Intersection parameters now use decimal arithmetic on the original
coordinates, avoiding cancellation that introduced an artificial endpoint interval.
The existing snow rotation and pressure assertions are unchanged. No engineering
limit, numerical tolerance, snapshot baseline or error assertion is loosened.

Regenerate affected gravity loading and recreate affected subdivisions from the
original loads. Rerun analyses, combinations, diagrams and design checks. Re-solving
saved, already concentrated loading cannot recover its original distributed support.
