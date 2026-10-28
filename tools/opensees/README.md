# Differential testing against OpenSees

The result certificates (`engine/src/certify`) prove that the returned
displacements solve the *assembled* system. They cannot catch a wrong element
matrix, a wrong fixed-end force, a sign or axis convention error, or a dropped
term in reactions or member forces: a wrong model is certified too. This
harness solves the same model in [OpenSees](https://opensees.berkeley.edu/)
(an independent, widely used FE code) and compares displacements, reactions
and member end forces — and, beyond linear statics, buckling load factors,
natural frequencies and mode shapes, P-Delta solutions, time histories, and
plate/shell solutions (see [Other analyses](#other-analyses)).

## Setup and run

```sh
tools/opensees/run.sh                       # fixtures + ~2300 random models, every category
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
target/release/examples/solve_json job.json         # {"analysis": "buckling" | "modal" | "pdelta" | "timeHistory", ...}
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

stabileo's refusals and warnings are checked against OpenSees too:

| status | meaning |
|---|---|
| `refused` | stabileo refuses the model and OpenSees finds no unique answer either (κ > 1e12, or the converter rejects it for the same reason: a nodal moment on a rotation nothing stiffens, a rotational mechanism) |
| `false_reject` | stabileo refuses a model whose OpenSees stiffness is regular (κ < 1e10): flagged, exit 1 |
| `false_warning` | stabileo flags a model ill-conditioned whose OpenSees stiffness is well conditioned (κ < 1e8): flagged, exit 1 |
| `not_applicable` | buckling with no load factor on either side (no member in compression, or none whose compression reaches a free DOF); an OpenSees factor above 1e9 comes from axial forces of round-off size and counts as none |
| `stabileo_failed` | a refusal neither side decides (1e10 ≤ κ ≤ 1e12, or OpenSees failed for a reason other than a singular stiffness) |

The converter used to drop nodal moments silently in truss-only models
(no rotation DOFs, `ndf` 2 / 3), so both sides compared a model without
the moment; such a model is now `unsupported` ("nodal moment on a
rotation-free node"), and a `refused` when stabileo refuses it.

Modal and buckling jobs check the static probe's conditioning before the
eigen solve, so a mechanism is `ill_conditioned` whatever the eigen solver
then reports. `engine/tests/fuzz_models` (`--random2d/--random3d`) are
mostly mechanisms by design (they exercise these refusals); the rich
generators repair theirs (see `gen_models.py`, `stability.py`): in 90 % of
the models the hinges / releases that make a mechanism are dropped, the
other 10 % stay as drawn. `stability.py` counts mechanisms exactly from the
compatibility matrix (pure Python, independent of both programs); on the
first nightly's 1000 rich seeds it agreed with stabileo's flags on every
model.

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
| supports (2D types, several plain rigid ones on a node OR-ed; 3D flags OR-ed per node) | `fix` |
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
connectors, quad9 / solid / curved shells (plates and MITC4 quads: see below), curved beams, warping (`cw`), inclined
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

## Other analyses

```sh
compare.py --buckling2d N --buckling3d N --modal2d N --modal3d N \
           --pdelta2d N --pdelta3d N --th2d N --th3d N --plates N --shells N
```

Jobs come from `gen_models.job(kind, dim, seed)`: even seeds are building
frames (`frame_2d` / `frame_3d`: storeys and bays, skewed columns, truss
braces, rolled columns and explicit local-y vectors in 3D, fixed / pinned /
spring bases, gravity and lateral loads), odd seeds the rich random models,
stripped to what the analysis compares exactly. A job is
`{"analysis": kind, "model": ..., spec}`; a dumped mismatch reruns with
`compare.py dump.json`. The engine side is `solve_json` with the wrapper above.
Every count below is from one run of the nightly command (seed 7000).

| category | engine | OpenSees | compared | tolerance | models (ok / compared) |
|---|---|---|---|---|---|
| buckling | `solve_buckling_2d/3d` | K and K+Kg from `printA`, eigenproblem in numpy | first 4 load factors, MAC of separated modes, the linear solution | eig 1e-6·max(1, λk/λ1), 1−MAC 1e-6 | 557 / 557 |
| modal | `solve_modal_2d/3d` | `eigen -fullGenLapack` | first 3–6 ω, MAC | 1e-6·max(1, (ωk/ω1)²), 1−MAC 1e-6 | 482 / 482 |
| P-Delta | `solve_pdelta_2d/3d` | Newton on the geometric elements | displacements, reactions, end forces | as linear static | 584 / 584 |
| time history | `solve_time_history_2d/3d` | Newmark / HHT transient | every node's displacement history | 1e-6 of the largest | 400 / 400 |
| plates | linear static | ShellMITC4 / ShellDKGT | displacements, reactions, beam forces | as linear static | 300 / 300 |
| folded shells | linear static | ShellMITC4 | reaction resultant (displacements reported) | 1e-6 | 60 / 60 |

Measured agreement (worst model): load factors 5.7e-9, frequencies 2.9e-10,
1 − MAC 6.7e-16, P-Delta 1.2e-9, histories 4.1e-12, plates 3.4e-7, shell
reaction resultants 9.3e-9 (all within the condition-number-scaled tolerance;
the whole run takes ~2 min on 4 cores). The
remaining models are mechanisms, ill-conditioned, beyond buckling (P-Delta),
without compression (buckling) or unsupported, as in the static comparison.
The eigenvalue tolerance grows with λk/λ1 because both solvers get
μ = 1/λ with an absolute error ~ eps·κ·μ1; a mode shape is compared only when
its eigenvalue is 1e-3 (relative) away from its neighbours, where the vector
is determined to (eigenvalue error / gap).

### Buckling

OpenSees has no linear buckling command, so the eigenproblem
K·φ = λ·(−Kg)·φ is assembled from OpenSees and solved here: `printA` (with
`system FullGeneral`) forms the tangent at the current state, so it gives K at
u = 0 and K + Kg(N) after the linear load step; Kg is their difference, with
N the linear axial forces (also compared against the engine's). The elements
make the two Kg the same matrix, linear in N:

* frames: `ElasticTimoshenkoBeam ... -geomNonlinear` adds the consistent
  (cubic) geometric stiffness N·klgeo; Av = 1e12·A makes it the
  Euler–Bernoulli one the engine uses (φ ~ 1e-12);
* trusses: an `elasticBeamColumn` released at both ends on a `PDelta`
  transformation: the string stiffness N/L of the engine's truss Kg (`Truss`
  has none, `corotTruss` is not linear in N);
* the Wagner term of the engine's 3D frame Kg, P·r0²/L·[1, −1; −1, 1] on the
  member twist with r0² = (Iy + Iz)/A, which no OpenSees beam has: added to
  Kg in numpy (`_wagner`, P = EA·elongation/L), and in P-Delta as a parallel
  torsion-only `elasticBeamColumn` whose J = P·r0²/G is iterated to the fixed
  point. Without it every 3D buckling and P-Delta model with a compressed
  frame mismatched by 1e-5..1e-2 from 2026-10-18, when the engine added the
  term. Sections with a shear-centre offset are unsupported (the engine's
  bending–twist coupling is not built).

Not compared (unsupported): hinges/releases (the engine condenses Kg with the
elastic map of the released rotation; OpenSees would keep the rotation as an
extra eigen DOF — a different, finer discretisation), Timoshenko sections
(OpenSees' Kg is the shear-flexible one, the engine's Euler–Bernoulli),
member loads that need station nodes (they would split the member's Kg), and
settlements (OpenSees' linear step sees them through the already-geometric
elements). Eigenvalues of OpenSees below 1e-9 of the largest μ are the
round-off of Kg's null space, not modes.

### Modal

The engine's mass model, built in OpenSees: frames carry their mass on a
parallel zero-stiffness `elasticBeamColumn` (`-mass ρA -cMass`: the 420
consistent matrix, axial ρAL/6·[2 1; 1 2]; lumped ρAL/2 on the translations
when an end is hinged / released, as the engine), so a Timoshenko member's mass
is the Euler–Bernoulli one too; its `J` is Iy + Iz because the engine's
torsional inertia is the polar ρ·Ip·L/6·[2 1; 1 2] and OpenSees' uses Jx
(the polar moment is the right one). Trusses: `Truss -rho -cMass 1`.
`fullGenLapack` returns the infinite eigenvalues of massless DOFs as ~1e308
followed by zeros; only the ascending finite prefix is kept. Rigid-body modes
(a member hanging on hinges: OpenSees' ω1 < 1e-3·max ω) are reported as
mechanisms — an unloaded static probe does not see them, so the engine's
static diagnostics are taken under a unit load on every translation.

### P-Delta

The geometric elements of the buckling comparison, `Newton` with
`RelativeNormDispIncr 1e-11`: OpenSees solves (K + Kg(N(u)))·u = F with N from
the elongation, the fixed point the engine iterates to (1e-11; a model whose
round-off floor sits above that is rerun at 1e-8). Member end forces are
(K + Kg)·u − FEF on both sides. Models beyond buckling (the engine flags them
unstable, or neither side converges) are not compared. Same exclusions as
buckling, except settlements, which both sides apply exactly.

### Time history

Newmark average acceleration, or HHT with OpenSees' α = 1 + α_engine (the
engine's α ∈ [−1/3, 0]; both then have γ = ½ − α, β = (1 − α)²/4 and the same
equation), Rayleigh damping anchored like the engine's on the first two
modes (a0 = 2ξω1ω2/(ω1+ω2), a1 = 2ξ/(ω1+ω2)), ground motion
(`UniformExcitation` with a `Path` series) or a piecewise-linear nodal force
history (`Path -time -values -useLast`), from rest with zero load at t = 0 (the
engine starts from M·a0 = F0, OpenSees from a = 0). Generated breakpoints sit
on steps: HHT evaluates the load at t_n + α·Δt in OpenSees, a blend of the
step samples in the engine. OpenSees 3.8 quirks worked around:

* `Truss` and `zeroLength` skip Rayleigh damping unless given `-doRayleigh 1`
  (the engine's C = a0·M + a1·K includes them);
* the last step's time, accumulated in floating point, lands just past a
  `Path -dt` record, where the series is 0: one trailing sample is added;
* `ElasticBeam2d` and `ElasticTimoshenkoBeam2d` subtract their
  `UniformExcitation` inertia load twice (in `getResistingForce` and again in
  `getResistingForceIncInertia`), doubling a 2D earthquake: 2D ground-motion
  histories run on the plane frame embedded in 3D (y = 0, out-of-plane DOFs
  held; in-plane bending is the 3D member's My, ry(2D) = −ry(3D)).

### Plates and shells

Which pairs are the same formulation:

| engine | OpenSees | bending | membrane / drilling |
|---|---|---|---|
| `quads` (MITC4) | `ShellMITC4` | MITC4, same on parallelograms | EAS-7 vs bilinear + Hughes–Brezzi drilling: different |
| `plates` (DKT + CST) | `ShellDKGT` | DKT, same | CST vs GT9 with drilling: different |
| `quads` | `ShellDKGQ`, `ShellNLDKGQ` | DKQ (Kirchhoff) vs MITC4 (Mindlin): different | different |
| `quad9s`, `solidShells`, `curvedShells` | — | not compared | |

`--plates` (`gen_models.plate`): flat plates in z = 0 meshed with quads,
triangles or both, graded and skewed (quads stay parallelograms), each edge
free / simply supported / clamped, edge beams on grid lines (beam bending and
torsion coupled to the plate), nodal forces and moments and pressures (as the
engine's consistent nodal loads: ∫N·p dA along the normal of the diagonals'
cross product for quads, pA/3 for triangles). Every node's in-plane
translations and drilling rotation are held, so the membranes and drilling
terms, which differ, are not loaded: the comparison is exact (300/300,
worst 3.4e-7). On distorted (non-parallelogram) quads the two MITC4s differ by
1e-4..1e-1: OpenSees turns the tied covariant shear strains into Cartesian
ones with the constant angles of Dvorkin & Bathe (1984), the engine with J⁻¹
at each Gauss point; both pass the constant-curvature patch test on a
distorted mesh (checked), so this is a formulation difference, and the
generator keeps quads parallelograms.

`--shells` (`gen_models.shell`): angle, channel and Z cantilevers of flat
MITC4 panels, clamped, with tip forces and a pressure on one panel — membrane
and bending coupled at the folds. Here the membranes matter, and OpenSees'
bilinear membrane locks in in-plane bending: its lateral tip displacement is
5 % (coarse) to 70 % (4x refined) of the converged value, which the engine's
EAS-7 is within a few percent of from the coarsest mesh. So displacements are
only reported, and the check is the reaction resultant about the origin,
which equilibrium fixes for any formulation (a lost, doubled or misdirected
load, a wrong pressure normal or support).

### Findings (fixed; regression tests in `engine/tests/opensees_differential_regressions.rs`)

* 2D nodal moments on a node where every frame is hinged went into the
  artificial rotational spring and never reached the structure; the solver
  refused only when the rotation exceeded 100 rad, so a smaller moment
  (3 kN·m on a stiff bar) solved with zero reactions and `equilibriumOk`
  (#452, found triaging rich2d-744020). `validate_loads_2d` now refuses
  them by topology, as the 3D solver does.

* Buckling took each member's axial force as (N_start + N_end)/2; the
  geometric stiffness needs the mean of N along the member, which that is only
  for linear N. Axial point loads or partial axial loads on members gave a
  wrong load factor (3× on a spring-braced truss). Kg is now built at the
  linear displacements, N = EA·(δ/L − αΔT).
* P-Delta member end forces were recovered with the elastic K alone while
  displacements and reactions came from K + Kg: they balanced neither the
  joints nor the reactions (a free cantilever tip carried a moment).
* 2D buckling and P-Delta kept the consistent Kg on a hinged member's node
  rotation; the 3D Kg condensed it. A hinged portal now matches its 3D model.
* Ground motion loaded the free DOFs with M_ff·r_f, missing the mass coupled
  to the supports' translations (M_fr·r_r): half the load on a bar on two
  supports, up to ~50 % on frames.
* Small modal models (dense eigensolver) with a massless DOF — every hinged
  member is lumped — failed outright: M is only semi-definite.

Also observed, not changed: modal participation factors and effective masses
use M_ff·r_f (the same omission as the ground motion, in the reported mass
ratios); the 2D P-Delta and time-history paths share the sparse 2D assembly
with the known `_ex` issues (rotated springs, inclined rollers, springs on
restrained DOFs, orphan rotations), which the 2D generators avoid.
