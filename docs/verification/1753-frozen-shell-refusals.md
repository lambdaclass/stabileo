# Seven frozen shell refusals after #1753

All seven refusals are correct. Each frozen model has a physical rigid rotation in its plane, about its single in-plane pin. No false refusal or new engineering result was identified. The stability gate and benchmark expectations remain unchanged.

The evidence is the exact seven inputs from PR #1946, `docs/verification/soundness-regression-audit-2026-11-11/refusal-bisection.json`. Their inputs and pre-#1753 displacement vectors are preserved losslessly in [the fixture](../../engine/tests/fixtures/1753-frozen-shell-refusals.json). [The measurements](1753-frozen-shell-refusals.json) retain provenance, the source SHA-256, per-model decisions and original diagnostics. The original adjacent revisions were `cb671ed319d14ee4d4505a3c43fe233b9607cd27` and `77294fe006d716bf2e1900a85b3818906cf2fd33`.

## Physical null mode

Every frozen input restrains transverse displacement on its boundary and both in-plane translations at node 1. No second point restrains the in-plane turn. If the pin is at `(x0, y0)`, assign every node

```
ux = y0 - y
uy = x - x0
uz = rx = ry = 0
rz = 1
```

This is an infinitesimal rigid rotation, with nonzero physical translations away from the pin. It satisfies every restraint. The tests assemble the full physical stiffness, with artificial stiffness disabled, and verify

```
max(abs(K * mode)) / (max(abs(K)) * max(abs(mode))) < 1e-14
```

The check includes restrained rows. A separate check verifies that uniform drilling rotation with zero translations is not a null mode of this formulation. MITC4's Hughes–Brezzi term couples drilling rotation to membrane rotation: `theta_z - (dv/dx - du/dy)/2`. Eliminating the demonstrated mode as a drilling gauge would eliminate physical translations. The current loads do not excite this rigid motion, up to load-assembly rounding; that does not establish structural stability. Adding a nodal drilling moment still refuses.

## Restrained references, per model

Two controls keep every element, material and load unchanged. One adds the missing `uy` restraint at the other corner on the pin's horizontal edge, keeping every drilling rotation free. The other fixes `rz` at every node and adds no in-plane translational support. Both remove the rigid turn and solve.

The comparison covers all three physical translations and the two bending rotations at every node. The archived solution's arbitrary rigid turn is removed by subtracting the explicit mode above, using `uy` at the second corner to determine its amplitude. It is zero except for the uniform-plus-gradient thermal parity fixture. Drilling rotation is excluded from the displacement comparison. Errors below are maximum component errors divided by the largest absolute reference component. The unchanged `1e-6` displacement criterion is also used in `engine/tests/common/tolerance.rs`; no existing benchmark bound is changed.

All rows have the decision **physical mechanism; refusal is correct**. Model names abbreviate `solve_3d-<hash>.json`.

| Model | Nodes | Null residual | Archived max abs uz | Roller reference error | Drilling restrained error |
|---|---:|---:|---:|---:|---:|
| 02b13e348ce7e7ef | 121 | 3.301454e-16 | 0.0022140018550041627 | 2.545278e-12 | 2.196414e-12 |
| 1ec27e3af1804283 | 25 | 3.063896e-16 | 0.0021691355966952076 | 0 | 0 |
| 2ef13b8c4e82f579 | 25 | 3.063896e-16 | 0.0024712607368721907 | 1.796492e-13 | 1.796492e-13 |
| 5c0d30ad3f5e457a | 25 | 3.063896e-16 | 0.0012356303684360954 | 6.327092e-16 | 7.934977e-14 |
| afd76d209a97b31c | 256 | 2.747709e-16 | 0.0021967185745442991 | 1.219279e-12 | 9.627290e-13 |
| c01f6e21e2c0cc35 | 49 | 3.217234e-16 | 0.0023708189884047975 | 5.099794e-13 | 4.482818e-13 |
| c1578ad4f1ef88d3 | 25 | 3.063896e-16 | 0.00021691355966952077 | 0 | 0 |

The native pressure control's dense Cholesky and sparse result agree to `1.7439371770625973e-13` relative displacement error. Both matrix stability paths reject its original frozen model. WASM reproduces the per-model reference errors above and refuses all seven originals, their drilling-moment variants, P-delta and buckling calls. Modal returns no modes: the large-shell case reports `MODAL-MECHANISM`; the other six report `eigen_decomposition_failed`, which is a refusal to vouch for the eigensolve rather than a successful stability classification.

These are independent restraint controls permitted by the audit task, not a new published plate-accuracy oracle. The existing `SH-MITC4-CONVERGENCE` warning remains relevant to absolute shell accuracy.

## Existing fixtures and analysis coverage

The audit's statement that current fixtures restrain normal drilling rotations is inaccurate for these builders. They add the second corner's `uy` restraint and leave `rrz` false. This repair is already described under “Test models that were mechanisms” in [the #1753 results-change write-up](../results-changes/2026-11-linear-stability-refusals.md). None of the seven existing benchmark tests was changed to expect refusal.

The scope here is characterization of these seven static 3D inputs. There is no 2D shell input in `SolverInput`. No engine path or refusal threshold is changed, so no new results-change registry entry is required.

A separate WASM probe found that staged construction does **not** enforce the same static stability gate. A single stage activating all these quads and loads returns all seven with `SH-MITC4-CONVERGENCE` warnings, rather than refusing their physical mechanism. Its exact diagnostic observations are retained in the measurements JSON. This is a follow-up coverage gap, not evidence for accepting the static inputs as gauges. No claim is made here that every nonlinear entry point is protected by the static gate. No new silent wrong answer or advisory is asserted from these unexcited staged runs.

## Reproduction

Run `make test.engine.frozen-shell-refusals` for eight targeted native tests and the real WASM checks. The target builds the WASM engine and runs only this family. The existing seven benchmark tests also pass with their existing second restraints.

No current wrong-result reproducer exists for the requested false-refusal hypothesis: the evidence disproves it. Consequently there is no `known wrong result` ignore or production fix commit. The added characterization tests pass against unchanged production on `b91b94b73` (the task's `origin/main`), and the archived pre-#1753 successful outcomes fail their refusal condition. The historical revisions were not rebuilt during this investigation; their exact outcomes come from the supplied adjacent-revision audit evidence. This is evidence for retaining the gate, not a claim of a newly fixed defect.
