# Include transverse truss actions in conditional member balance (2026-11-12)

Issue #1969. Registry entry `truss-member-load-balance`.

The conditional recovered-member balance check removed all member loads from the
nonmember remainder. Frame end forces already include their fixed-end actions,
but truss recovery reports only axial forces. Consequently the transverse part
of a truss member load disappeared from the balance equation. A valid solution
could be refused even though its statically equivalent nodal model solved.

`TransverseMemberActions` now supplies the same equivalent transverse end actions
to assembly and balance in both dimensions. Its shared span transfer retains
rectangle and triangle contributions separately, including a zero-total-force
couple. Its point transfer retains endpoint lever arms and the 2D applied-moment
couple. The recovered end force vector is completed by subtracting these
transverse actions for axial members. Recovered axial forces already contain
axial point, axial distributed and thermal fixed-end actions, so those forces
are retained without adding the load a second time. Frames retain their recovered
shears and moments. The 3D decision uses `MemberKinematics3D`, as assembly does.

The exact 2D model and nodal control were copied from
`triage/nightly-2026-11-12` at `07078445c`; the 3D controls were generated with
`embed_2d(..., Plane::XZ)`. The engine parent is also origin/main
`6db1f14d8ca5b375f50c4b68824a250e3896fd0d`. Before the fix, the exact member-load
models refuse, while both nodal controls return finite answers, natively and
through the public WASM exports. No silent wrong engineering result is
established by these witnesses; no advisory is added.

The reproducer commit retains ignored failing tests before the implementation.
Native coverage includes the exact witness, typed and prepared calls, the dense
reference, constrained dense and sparse paths, and P-Delta initialization.
Unit coverage forces the conditional check on distributed and combined axial /
transverse point loads in 2D and the XZ, XY and YZ embeddings. Axial distributed,
thermal and frame controls still balance. Deliberately altered recovered axial
forces still refuse. Existing checks exercise both sides of the unchanged
conditional accuracy limit and ensure restrained loads, moments and constraint
elimination cannot conceal a force imbalance. Public WASM tests exercise 2D and
3D linear, constrained and P-Delta calls, distributed and point truss/frame
loads, nodal controls, and the retained constraint-rounding refusal.

Only solve success changes for the false-refusal witnesses. No accuracy tolerance,
conditioning or anisotropy limit, baseline or existing assertion is relaxed.
No full suite or results-snapshot regeneration is performed for this targeted fix.

Final tests replayed against the parent engine sources produce 14 passing / 4
failing conditional-balance unit tests, 3 passing / 5 failing native integration
tests, and 8 passing / 10 failing public WASM tests. Each failure is the retained
missing-truss-action refusal. The fixed engine passes all 18, 8 and 18 tests,
respectively. The span-transfer tests also cover both sides of its unchanged
short-span cutoff, zero loads, zero-total-force couples, and endpoint point loads.

The #1992 review also verifies the newly reachable #1901 linear solutions against
an independent 60/100-digit strain-energy assembly in 2D and all three 3D planes.
The original 2D P-Delta replay still rejects its explicitly unconverged iterate;
its old conditioning-refusal expectation was stale. Converged 3D nonlinear
solutions agree with the independent reference. #1901's closure stays valid.
See [the reference and replay evidence](../verification/candidate-1901-after-truss-balance.md).
The review changes no engine results or limits and needs no additional registry
entry beyond `truss-member-load-balance`.

After merging main `581495d9c`, main's physical nonlinear convergence check
supersedes the preceding pre-merge convergence measurements for #1901. Every
loaded #1901 orientation now returns explicit P-Delta nonconvergence; independent
Decimal residual evaluation confirms the last iterates do not satisfy the
requested equilibrium tolerance. Original and embedded linear reference checks
remain passing. The verification note documents the audit and exact unloaded
controls. This test correction adds no engine change beyond main's existing
`nonlinear-physical-convergence` and associated registry entries.
