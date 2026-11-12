# Candidate #1901 after truss member-load balance (#1992)

The #1901 record is `1901-body-0` in
`engine/tests/fixtures/candidate-replay.json`. Its archived conditioning refusal
was caused by the omitted transverse truss actions corrected in #1969. The
November 11 report records scaled condition `6.3e7` and node anisotropy `1.3e7`
for this witness. The neighboring `1.5e11` records are different witnesses.

On `c9ff38edf`, the candidate replay does **not** accept a 2D P-Delta answer.
Its error is `did not converge`, whereas the regression expects a conditioning
refusal. The raw native and WASM results both state `converged = false`,
`isStable = false`, and `iterations = 100`. The metamorphic adapter's existing
`converged_finite` gate rejects that iterate. The correction changes this stale
regression, without changing the engine or its convergence or accuracy limits.

## Independent reference

Run from the worktree root, inside `make shell`:

```sh
python3 docs/verification/candidate-1901-reference.py
```

The checked-in JSON is that command's output. The script reads the original
fixture directly, uses Python Decimal at 60 and 100 digits, and imports no engine
code or engine matrices. It assembles strain energy using polynomial integrals:
linear axial interpolation and cubic Hermite transverse interpolation for frames,
linear transverse interpolation for trusses. It integrates the loads against
those interpolation functions and imposes the fixture's rigid restraints.
Exactly zero, unloaded stiffness rows are omitted; no artificial spring is added.
The modulus conversion follows `ModulusMPa::to_kn_per_m2` in
`engine/src/types/units.rs`. Unsupported fixture features are asserted absent.

For P-Delta it assembles the second-order work integral from the transverse shape
derivatives, with the axial force obtained from the current axial extension, and
solves the resulting system by pivoted Gaussian elimination. Both precisions
converge in ten iterations with relative update below `1e-12`. The script asserts
agreement of the two precisions within `1e-45` relative with a unit scale floor.
This is a reference for the equations implemented by P-Delta, not a claim that
this large-displacement model is suitable for structural design.

The ordinary 2D native linear displacement error, normalized by the reference component
with a unit floor, is at most `3.614e-9`. The maximum for the XZ, XY and YZ
embeddings is `1.983e-9`. Their converged P-Delta displacement error is below
`6.035e-11`. The 2D last P-Delta iterate has error up to `1.200e-5`; it is
explicitly unconverged and is never asserted to be an answer.

The regression compares every displacement component against the independent
reference with `1e-8` relative tolerance and a unit floor, the existing #1969
regression comparison budget. It exercises native ordinary, typed 2D, prepared,
dense-reference 2D and load-session paths. Stored 3D inputs are checked against
`embed_2d` in every plane, and public WASM tests use those same inputs. A rigid rotation by 37 degrees supplies a converged 2D nonlinear positive
control; rotating its displacements back agrees with the independent nonlinear
reference within `1e-8`, as do the 3D embeddings. Linear
answers agree across 2D and all embeddings. Converged 3D nonlinear answers agree
with the independently assembled 2D nonlinear reference; native and WASM 2D
nonlinear calls retain their explicit nonconvergence.

## Closure and scope

#1901's closure stays valid: the exact 2D nonlinear replay still rejects its
unconverged iterate, and the newly reachable linear and converged 3D nonlinear
answers agree with the independent reference. The rigidly rotated 2D nonlinear
control also agrees with that reference and the 3D solutions. No accepted 2D
nonlinear answer is claimed for the unrotated input. Preserving the old conditioning refusal would incorrectly reject
verified linear solutions.

On the branch before this revision, all other 30 candidate replays pass and all
20 cause-C replays pass. The final candidate module has 31 passing tests, with
the stale #1901 test replaced by the reference and nonconvergence regression.
No other replay classification flips. No engine result changes in this revision;
the existing `truss-member-load-balance` results registry entry covers the
original #1969 change in solve success for member-loaded models.

Origin/main at `6db1f14d8` refuses this witness at the initial conditional balance
check, as recorded by the archived replay and confirmed by restoring its
conditional-balance implementation for the final reference regression. This
is a false refusal, not evidence of a silent wrong result on main or a release.
No advisory is added.
