# Partial snow remains member loading

PR #2197 corrects two regressions on its unmerged branch. The legacy
projection generator reduced the axial component of each pressure interval
to equal end-node forces. This loses the axial force distribution even under
full loading. For uniform pressure on the second half of an inclined member,
the consistent axial nodal shares would be one quarter and three quarters,
but those shares still cannot reproduce the member's axial force field.

The generator now emits the complete pressure as projected member loading,
using the same representation as the width and panel paths. The existing
member-load conversion resolves axial and transverse components without
moving them to nodes. Pressure centroids, partial extents and affine end
intensities remain available to assembly and member recovery. No new load
schema, solver approximation or end-force substitute is introduced.

The independent cantilever oracle uses synthetic unit pressure, EA=EI=1,
plan length 8 and rise 4. With L=sqrt(80), axial intensity is -8*4/L²;
transverse intensity is -8²/L². For a loaded interval [a,L], axial force at
station s is qx*(L-max(a,s)); tip axial displacement is qx*(L²-a²)/2.
Shear and bending follow direct integration of the transverse intensity;
tip deflection is the integral of qz*x²*(3L-x)/6. These are test inputs and
analytical identities, not code-prescribed engineering values. The test
injects a controlled pressure interval into the real roof-surface constructor
and uses the production member-frame conversion. It checks full, half,
near-empty and empty loading, rotations, mirroring and member subdivisions.
The original width-mode path is a correct-input control.

Roof ownership previously required one panel to contain the entire physical
run. It now uses the polygon union of panel footprints at the same elevation,
including concavities and holes. A complete run must stay in one component
and its eave must meet the footprint boundary at that elevation. Other
covering runs retain their interpolated local height. The two-panel witness
[0,4] × [-1,1] and [4,8] × [-1,1] at z=3 retains its own roof below
(0,0,3) → (8,0,7), independently of subdivisions and plan transforms.
That sparse model still explicitly refuses snow with an unresolved roof
plane; the coverage fix does not invent a plane from insufficient geometry.

An additional resolved roof supplies three parallel rafters on the same physical
plane. It retains non-refused snow with 1/2/4 adjoining panels, rotations,
mirroring and 1/2/3/8 subdivisions of the central carrier. Every central
member fragment receives the independently calculated uniform pressure;
its reconstructed axial force, shear, bending, axial displacement and tip
deflection agree with uniform-load cantilever hand integrals.

The shared remeshing oracle now compares per-carrier shear and moment at
stations and cantilever displacement/deflection integrals in addition to
pointwise member intensity and resultants. The ridge-crossing regression
also compares these responses with independent constant-pressure integrals.
These are analytical member checks, not separate nonlinear backend solves.
Generation and its projected load representation precede 2D/3D,
linear/nonlinear and native/WASM selection. Existing one-sided tributary
torsion assumptions are unchanged; this correction does not add distributed
torque support or claim general eccentric-load equivalence.

Regenerate affected generated area loads, then rerun analyses, combinations
and design checks. The `snow-member-loading` registry entry retains that
requirement after re-solving old generated snow. The parent replay and
before/after counts are recorded in the worktree handoff. No tolerance,
engineering expectation or historical result baseline is loosened.
