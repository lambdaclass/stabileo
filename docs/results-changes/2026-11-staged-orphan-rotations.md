# Staged rotations retain physical stiffness after unit changes (2026-11-11)

Issue [#1846](https://github.com/lambdaclass/stabileo/issues/1846).
Results-change entry `staged-orphan-rotations`.

Staged 3D analysis added a second artificial rotational spring after ordinary
linear assembly. An end releasing either local My or Mz marked its entire node
as hinged. The staged code then compared each global rotational diagonal with
the largest diagonal anywhere in the model, including translational stiffness.
That comparison mixes units: changing length and force units could add a spring
to a rotation that already had physical stiffness. Both dense and sparse paths
contained this code. Staged 2D separately added a spring at every all-hinged node,
even when a real rotational support spring already held the rotation.

On main `85c002b3a378a076fe118d75fcb665b5099dba46`, the exact unit-transformed
#1846 input returns node 2 rx = 0.16535440385032843 from staged 3D, versus
35.590640526156434 from regular linear. The retained candidate replay independently
compared both original and transformed inputs with OpenSees and confirmed the
linear answer. Native and public WASM staged exports returned the wrong rotation
without final structured diagnostics. These observations come from
`candidate-replay/docs/verification/candidate-replay-2026-11-11.md` and its JSON
record (`staged_followups`), supplied for this task; the two exact inputs are now
retained in `engine/tests/fixtures/staged-orphan-1846.json`.

Both staged dimensions now assemble their active physical model through regular
linear assembly with legacy artificial rotational stiffness disabled. Regular
linear and staged solves use the same `prepare_free_stiffness` function: it reduces
constraints through the existing constrained stability path, classifies physical
stiffness in the existing node-local rotational subspaces, refuses unresolved
mechanisms and pins only unloaded free rotations. The shared pin load checks also
verify that the solved response does not load a pinned direction indirectly. This
handles a release rotated between global axes, as well as an axis-aligned zero
rotation. No stability threshold changes.

Only genuinely inactive, exactly unstiffened DOFs receive additional staged
treatment; active shell and constraint nodes are excluded from that step. Older
serial and parallel 2D triplet assemblers use the existing per-node rotational
check instead of hinge counts. Kinematic analysis uses the same physical
stiffness classification and pin projection instead of another orphan threshold.
Real rotational springs retain their response; unloaded orphan rotations remain
solvable and unsupported nodal moments remain refused. Extremely soft inactive
springs receive the regular solver's refusal instead of a false answer from an
artificial spring.

Re-run staged models with member releases, particularly models transformed
between units or with soft rotational springs. Rotations, displacements, forces,
reactions and demands derived from affected results can change. The re-check
registry conservatively selects models with hinges; it does not assume a saved
analysis stamp records staged construction separately.

The defect was introduced with staged 3D in `da31341f8` (2026-03-07). Source
inspection finds the same defect in releases v0.2.0, v0.3.0, v0.4.0, v0.5.0 and
desktop-v0.1.0-alpha.1 through alpha.3. Those historical binaries were not replayed
here; the numerical silent failure above is verified on main. The reserved [SA-2026-060 draft](../advisories/SA-2026-060-staged-orphan-rotations.md)
records the evidence; publication remains with the coordinator.

Targeted native tests compare staged and linear results for both exact inputs,
My-only, Mz-only, both-bending and all-rotation releases, unreleased controls,
unit scales, coordinate-axis rotations, oblique members, dense/sparse dispatch
boundaries, true orphans, real support springs and unsupported moments. They also
check legacy 2D assembly paths, kinematics and nonlinear consumers. The public
WASM test covers the same staged release family and nonlinear controls. No
existing tolerance, baseline or assertion was relaxed.
