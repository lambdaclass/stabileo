# Merged nonlinear convergence and physical reaction recovery (2026-11-12)

PR #1952 merges main through `581495d9c9204004b4ed3a37788aa79ecf25952d`,
including PR #1940. Main's dimensional equilibrium metric, compensated residuals,
bounded refinement, incremental P-Delta corrections, soil-curve evaluation and
small-rotation chord arithmetic are retained. Physical-force recovery and the
staged-history containment from #1952 are retained as well.

P-Delta's iteration uses main's incremental correction. Its final certificate
uses the shared dimensional metric on the physical free residual carried by the
same `RecoveredForces` object that supplies reactions and constraint forces.
An artificial-stiffness residual cannot enter that certificate. SSI's physical
stiffness is assembled without stabilization and evaluated with main's compensated
residual and actual soil-curve evaluation. Both dimensions use this path. Fiber
recovery uses the new metric with physical forces. Spatial member fixed-end
actions use main's relative chord increment and nodal rotations in its revised
natural-rotation function.

The two frozen arc-length outputs were regenerated through the merged WASM
engine, using their exact existing inputs. The first has 118 changed scalars:
106 intermediate control displacements and 12 final displacement/member-force
scalars. The second has 26 changed intermediate control displacements and no
changed final result. Step counts, iteration counts, convergence flags and load
factors in both frozen arches are unchanged. These are floating-point changes
from main's chord arithmetic; the signed member moment/shear/length checks and
the global equilibrium checks retain their previous thresholds.

All 38 exact method/argument records in the existing SA-2026-061 replay were
rerun. Eight `after` records change: the first frozen arch, loaded displacement
control, corotational 2D/3D, P-Delta 2D/3D and SSI 2D/3D restrained-master cases.
Displacement control changes the final load factor and dependent loads, forces
and reactions at floating-point precision. Corotational outputs follow the
updated small-rotation arithmetic. P-Delta outputs follow the refined incremental
solve and dimensional physical-residual certificate. SSI outputs follow the
refined secant solve and compensated structural/actual-curve recovery. The SSI
vertical support sums now serialize as exactly 20 in both dimensions, from the
captured model's two applied vertical loads. The complete unchanged inputs and
original `before` results remain in the existing replay. No new advisory or
new claim about released results is made here.

[Every changed value](1952-main-merge-values.json) records its artifact, record,
full field path, exact old and new serialized value, and explanation. The audit
also records the merged main revision and WASM hash. It covers 144 frozen scalars
and 83 replay scalars (12 + 22 + 6 + 10 + 7 + 8 + 11 + 7 = 83).

The replay counts are computed from the audit and checked against the numeric
leaves of each record's `after` result at `startingHead` and `7211457e8`, the
merged recovery commit. They count this merge's changes, before later review
rounds updated the replay again.

| Replay record | Changed scalars |
| --- | ---: |
| `frozen-arch-0015ab84c3baa36f` | 12 |
| `displacement-member-loads` | 22 |
| `corotational-2d-restrained-master` | 6 |
| `pdelta-2d-restrained-master` | 10 |
| `ssi-2d-restrained-master` | 7 |
| `corotational-3d-restrained-master` | 8 |
| `pdelta-3d-restrained-master` | 11 |
| `ssi-3d-restrained-master` | 7 |
| **Total** | **83** |

No unlisted replay record changed in this merge. Existing web results
snapshots were compared against the merged engine and did not need regeneration.

The new `merged-path-convergence-state` registry entry covers the changed path
displacements and step history. Existing #1952 reaction/member entries retain
their narrow quantities. Main's released convergence and SSI registry entries
remain unchanged; they describe the effects imported from #1940. The separate
staged-history entry declares only its `stages` and `finalResults` collections,
so it cannot authorize a fabricated static reaction, member force or shell stress.

No convergence threshold, engineering tolerance, numeric assertion or historical
snapshot baseline was loosened. Staged histories that cannot be recovered still
return structured unavailability diagnostics, including the self-weight extension
case; valid first-stage forces and the retained displacement checks remain tested.

The snapshot applicability classifier also recognizes nonlinear history fields
outside `nonlinear.results`, such as `nonlinear.steps[i].controlDisplacement`.
These use the same nonlinear analysis qualification as final-state fields. The
registry audit regression tests every changed frozen field against the actual
registered declarations, plus static, P-Delta and missing-path negative cases.
Stage collection scope is tested through source JSON, exported quantities, the
snapshot classifier and the legacy judge, in both dimensional feature contexts.
Both registry failures were demonstrated against the signed reproducer parents.
