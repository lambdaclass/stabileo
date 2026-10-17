# Differential testing against OpenSees

The result certificates (`engine/src/certify`) prove that the returned
displacements solve the *assembled* system. They cannot catch a wrong element
matrix, a wrong fixed-end force, a sign or axis convention error, or a dropped
term in reactions or member forces: a wrong model is certified too. This
harness solves the same model in [OpenSees](https://opensees.berkeley.edu/)
(an independent, widely used FE code) and compares displacements, reactions
and member end forces.

## Setup and run

```sh
tools/opensees/run.sh                       # fixtures + 1200 random models
tools/opensees/run.sh --fixtures -v         # any compare.py arguments
tools/opensees/run.sh --rich3d 200 --seed-start 5000 --report /tmp/r.json
```

`run.sh` creates `tools/opensees/.venv` (gitignored; `pip install openseespy
numpy`; openseespy 3.8 has wheels for CPython 3.14 on macOS arm64 and for 3.12
on Linux) and builds the solver CLI `engine/examples/solve_json.rs`:

```sh
cargo build --release --example solve_json
target/release/examples/solve_json model.json       # AnalysisResults JSON (2D/3D auto)
target/release/examples/solve_json --gen3d 42       # fuzz_models::random_3d_model(42)
```

Inputs: any files given on the command line, `--fixtures`
(`engine/tests/fixtures/*-input.json`), `--random2d/--random3d N`
(`engine/tests/fuzz_models`, orphan nodes pruned) and `--rich2d/--rich3d N`
(`gen_models.py`: local-y vectors, roll angles, vertical members, releases,
Timoshenko sections, springs, settlements, partial/trapezoidal loads, point
loads with axial force and couples). Exit status 1 when any model mismatches.

## Comparison

Each quantity group (translations, rotations, reaction forces/moments, end
forces/moments) is compared as `|stabileo - opensees| / scale`, where the scale
is the largest magnitude in the group, floored by the companion group times the
model size (so an all-zero group such as the end moments of a pin-ended bar
does not compare round-off with round-off). The default tolerance `1e-6` is
widened to `100·eps·κ` where κ is the Jacobi-scaled condition number of the
free-DOF stiffness (from OpenSees' assembled matrix): both solvers lose about
κ·eps. Models with κ > 1e12, or that the engine flags as near-singular
(`cholesky_failed_lu_fallback`, `stiffness_not_positive_definite`, ...) are
reported as `ill_conditioned`, not compared. Well-conditioned models
(κ < 1e6) agree to ~1e-10.

## Model mapping

Conventions were taken from the engine source:

| stabileo | OpenSees |
|---|---|
| `e` in MPa, ×1000 → kN/m² (`assembly.rs`); G = E/(2(1+ν)) | same numbers |
| 2D nodes (x, z), DOFs (ux, uz, ry), ry counter-clockwise in the x–z view | `ndm 2`, y := z |
| 3D local axes `compute_local_axes_3d` (default ref, `localY*`, `rollAngle`) | `geomTransf Linear` with `vecxz = ez` (ported, so local y = ey) |
| `frame` | `elasticBeamColumn` |
| `asY` (2D) / `asY`,`asZ` (3D) | `ElasticTimoshenkoBeam`, Avz = asY, Avy = asZ (the engine pairs asY with Iy) |
| hinges / releases on Timoshenko members | the released end on its own node, `equalDOF` to the joint on every other DOF (3D: only when the local axes lie along global axes); its constraint force is added to the joint's reaction |
| `truss` | `Truss` + `Elastic` material |
| hinges / `releaseMy*`, `releaseMz*` | `-release` / `-releasey`, `-releasez` |
| supports (2D types; 3D flags OR-ed per node) | `fix` |
| springs (2D rotated by `angle`) | `zeroLength` to a fixed ground node |
| settlements `dx…drz` | `sp` |
| full-length uniform member load | `-beamUniform` |
| point loads, partial/trapezoidal loads (as 3 Gauss point loads, exact), 2D couples | nodal loads at nodes inserted along the member |
| member loads on trusses | lever rule to the end nodes (the engine does the same) |
| end forces `nStart = -f_Ix, vStart = f_Iy, …, nEnd = f_Jx, vEnd = -f_Jy, …` | `localForce` of the first / last sub-element |

Nodes without rotational stiffness (truss-only or all-hinged; the engine adds a
tiny artificial spring there) get their rotations fixed in OpenSees and are not
compared; a model loading such a rotation is skipped.

Not covered (reported as `unsupported`): thermal loads, constraints,
connectors, plates/shells/solid shells, curved beams, warping (`cw`), inclined
supports, left-handed axes, torsion releases, Timoshenko releases on members
whose local axes are skew to the global ones.

OpenSees 3.8 quirks the converter works around (do not "simplify" them away):
`ElasticBeam2d` ignores `-release` for the trapezoidal `-beamUniform` form;
`ElasticBeam3d` ignores `-releasey/-releasez` for `-beamPoint`;
`ElasticTimoshenkoBeam` accepts no `-beamPoint`; and openseespy keeps state
across `ops.wipe()` (a 3D truss model corrupts later 2D truss models), so every
OpenSees run happens in a fresh interpreter.

## Findings

Fixed (regression tests in `engine/tests/opensees_differential_regressions.rs`):

* Partial distributed loads: fixed-end forces were integrated with a 20-panel
  Simpson rule (exact to degree 3, the integrand is degree 4): ~1e-4 relative
  error in the consistent nodal loads. Now exact 3-point Gauss.
* 2D trusses with an axial point load (`px`) reported EAδ/L at both ends,
  ignoring the jump at the load (the 3D path was right).
* 2D rigid supports with an extra spring (e.g. `rollerX` + `kx`): the spring
  was assembled but its force was missing from the reaction.
* Timoshenko members (`asY`/`asZ`) used Euler–Bernoulli fixed-end forces:
  point loads, couples, partial and trapezoidal loads gave wrong
  displacements and end forces (13.6 % on a short cantilever; up to ~1e-2
  normalized error on the random models). The fixed-end forces now integrate
  the load against the exact Timoshenko shape functions (section-rotation
  shapes for couples; `engine/src/element/fef.rs`). For transverse forces
  this equals the Euler–Bernoulli ones `[V_i, M_i, V_j, M_j]` corrected with
  φ = 12EI/(G·As·L²) and the simply supported reactions
  `R_i = V_i − (M_i+M_j)/L`, `R_j = V_j + (M_i+M_j)/L`:
  `V_i' = (V_i + φR_i)/(1+φ)`, `V_j' = (V_j + φR_j)/(1+φ)`,
  `M_i' = (M_i + φ/2·(M_i−M_j))/(1+φ)`, `M_j' = (M_j − φ/2·(M_i−M_j))/(1+φ)`;
  unit tests check every load type, with every release combination, against
  a force-method solution of the shear-flexible beam.
