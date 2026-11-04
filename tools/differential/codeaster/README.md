# Differential testing against Code_Aster

The result certificates (`engine/src/certify`) prove that the returned
displacements solve the *assembled* system. They cannot catch a wrong element
matrix, fixed-end force, constraint equation or sign convention: a wrong model
gets certified too. This harness solves the same 3D linear static model in
[Code_Aster](https://code-aster.org) 18.1 (EDF's FE code, independent of
stabileo and of the OpenSees harness in `tools/opensees/`) and compares
displacements, reactions and member end forces.

It covers more of the input than the OpenSees harness: torsion releases,
connectors, every constraint type (rigid links, diaphragms, equalDOF,
linearMPC, eccentric connections), thermal loads and inclined supports.

## Setup

Code_Aster has no macOS build. conda-forge publishes `code-aster` for
linux-64 only. The official `simvia/code_aster` image is built for AVX2 and
dies with SIGILL under Rosetta. The conda-forge build targets baseline x86-64,
so it runs under Rosetta in an amd64 container (OrbStack or Docker Desktop on
Apple silicon) and natively on Linux.

```sh
tools/differential/codeaster/setup.sh            # build image stabileo-codeaster:18.1.10 (once, ~3 GB)
tools/differential/codeaster/setup.sh --native   # Linux: conda env in .work/conda (needs micromamba)
cargo build --release --example solve_json       # the stabileo side
```

## Run

```sh
cd tools/differential/codeaster
python3 run.py --fixtures -v                                 # the 3D engine fixtures and examples
python3 run.py --rich3d 300 --aster3d 300 --random3d 100 -j 4 --dump-dir .dumps
python3 run.py model.json --keep                             # one model; keeps the .comm job dirs
ASTER_PYTHON=.work/conda/bin/python python3 run.py ...       # native Code_Aster instead of docker
```

Inputs:

- `FILES`: any `SolverInput3D` JSON files.
- `--fixtures`: the 3D `engine/tests/fixtures/*-input.json` files, which
  include the example models (buildings, industrial hall, tower, grid slab,
  space truss and so on).
- `--random3d N`: `engine/tests/fuzz_models` (`solve_json --gen3d`), named
  `fuzz3d-N` (fixtures are prefixed `fixture-`; some are called random3d-N).
- `--rich3d N`: `tools/opensees/gen_models.rich_3d`.
- `--aster3d N`: `gen.py`, which is `rich_3d` plus the features listed above.

Every model is solved by stabileo first. Models that stabileo flags as
ill-conditioned are skipped; models it refuses are run in Code_Aster
anyway, to check the refusal (`refused` / `false_reject`). The rest are translated by `to_aster.py`
into a self-contained Code_Aster command file (the mesh is embedded) and run
in `-j` batches, one Code_Aster session per batch (`aster_batch.py`; start-up
costs about a second, a model a few tens of milliseconds). On a mismatch,
`--dump-dir` keeps the model JSON and its `.comm` file, and the `.comm` file
runs on its own under `run_aster`.

`--flagged` also runs the models that stabileo flags as ill-conditioned
(their statuses get a `flagged-` prefix). It checks that the warnings are not
false alarms: a `flagged-ok` result means stabileo warned about a model that
Code_Aster solves cleanly. On rich3d and aster3d seeds 0-299, every one of the
212 flagged models was singular in Code_Aster (70) or a rotational mechanism
by rank (142).

A Code_Aster exception leaks its MUMPS instance, and after 50 of them a
session refuses every further solve (FACTOR_60). Those jobs are rerun in fresh
sessions.

Statuses:

| status | meaning |
|---|---|
| `ok` | agrees within tolerance |
| `mismatch` | disagrees: a stabileo bug or a translation error, to be triaged |
| `silent_singular` | Code_Aster finds the stiffness singular (a pivot lost more than 10 digits) where stabileo solved without a warning, and with the check off Code_Aster's solution disagrees with stabileo or cannot be computed |
| `near_singular` | Code_Aster's singularity check trips, but with the check off (`NPREC=-1`) its solution agrees with stabileo: an ill-conditioned model, not a mechanism |
| `ill_conditioned` | stabileo flags it (`stiffness_not_positive_definite`, `residual_high`, ...), or MUMPS cannot reach its residual check (FACTOR_57, also after a FACTOR_11 rerun with the check off) |
| `refused` | stabileo refuses the model and Code_Aster agrees there is no unique answer: its stiffness is singular (`FACTOR_11`/`FACTOR_42` at `NPREC=10`, or `FACTOR_57`), or the translator rejects the model for the same reason (a nodal moment on a rotation nothing stiffens, a rotational mechanism) |
| `false_reject` | stabileo refuses a model Code_Aster solves with its singularity check on: flagged |
| `stabileo_failed` | stabileo refuses a model the translator cannot express (undecided) |
| `unsupported` | uses a feature with no clean Code_Aster equivalent here (shells, warping, ...) |
| `aster_failed` | Code_Aster fails for another reason: a harness bug |

Exit status: 0 when all agree, 1 on `mismatch`, `silent_singular` or
`false_reject`, 2 on `aster_failed`.

## Comparison and tolerance

The comparison is the OpenSees harness's (`tools/opensees/compare.py`
`compare`). Each quantity group (translations, rotations, reaction forces and
moments, end forces and moments) is compared as `|stabileo - code_aster| /
scale`. The scale is the group's largest magnitude, with a floor from the
companion group times the model size. Thermal loads add a floor of
`EA·ε0` and `EI·κ0 / size`, because a statically determinate model under
temperature has no reactions to scale by. The tolerance is `1e-6`.
Code_Aster's assembled matrix is not exposed to the harness, so there is no
condition-number widening as in the OpenSees harness. Well-conditioned models
agree to about 1e-10, and the absurd stiffness contrasts of `random3d` (E up
to 3e8 MPa, I down to 1e-7 m⁴ over 80 m) agree to about 1e-7.

Not compared:

- reactions at nodes that take part in a constraint: Code_Aster's
  `REAC_NODA` there includes the constraint multipliers, while stabileo's
  reactions are support forces only;
- rotations and moment reactions of rotation-free nodes (truss-only joints,
  where stabileo adds a tiny artificial spring).

## Model mapping

Conventions were taken from the engine source and are documented again in
the `to_aster.py` docstring.

| stabileo | Code_Aster |
|---|---|
| `e` in MPa | `E = 1000 e` kN/m², ν as given (G = E/2(1+ν) on both sides) |
| local axes (`compute_local_axes_3d`: default reference, `localY*`, `rollAngle`) | ported; `ORIENTATION VECT_Y = ey` |
| `frame` without shear areas | `POU_D_E` (Euler-Bernoulli, exact stiffness) |
| `frame` with `asY`/`asZ` | `POU_D_T` (Timoshenko, exact); `AZ = A/asY`, `AY = A/asZ` (the engine pairs asY with Iy); a missing area is rigid |
| `truss` | `BARRE` |
| support springs | `DIS_TR`/`DIS_T` on a POI1 cell, `K_TR_D_N` in global axes |
| connectors | `DIS_TR` on a SEG2 cell in the connector axes of `element/connector.rs`: `K_TR_D_L` at zero length; `K_TR_L` (global, `to_aster.connector_matrix`) when finite: shear springs at mid-length on rigid arms |
| releases (My, Mz, T) | the released end on its own node, tied to the joint by `LIAISON_DDL` on the translations and on the kept local rotation components |
| supports, settlements | `DDL_IMPO`; inclined: `LIAISON_DDL` n·u = 0 |
| constraints | `LIAISON_DDL` rows written from the documented kinematics (`types/input.rs`, `constraints.rs`), not from the engine's transform |
| member loads | members split at load stations; distributed loads as `FORCE_POUTRE` N/VY/VZ (local); point loads as nodal forces at station nodes |
| thermal | `PRE_EPSI`: `EPX = α ΔTu`, `KY = α ΔTz / hz`, `KZ = α ΔTy / hy` (α = 12e-6, h = √(12 I/A) as in the engine) |
| a joint whose members all end on hinge nodes | a zero-stiffness `DIS_TR`/`DIS_T` cell so that the joint has DOFs for the ties |

### Code_Aster behaviours the translation works around

- **`K_TR_D_L` on a SEG2 has no lever arm.** Its matrix is `[K, -K; -K, K]`,
  while the engine's finite connector (since 3aa56464) puts its shear
  springs at mid-length on rigid arms. A finite connector is therefore a
  full `K_TR_L` (fixed on #326). The 99 mismatches of the first nightly run
  (aster3d seeds 744000-744399, every one with a finite connector) were
  this; they reproduce identically under Rosetta (same 99 models, same
  statuses), so they were not a native-vs-emulated difference.

Each one was found by a disagreement and settled by a closed form or a
convergence study, never by widening the tolerance:

- **`FORCE_POUTRE` FX/FY/FZ are global components.** The local ones are
  N/VY/VZ. Members along the global X axis hid the difference.
- **One distributed-load charge only.** Beam post-processing refuses more than
  one distributed-load charge (CALCULEL2_92), and repeated `FORCE_POUTRE`
  occurrences on one cell overwrite each other. Each piece gets one formula
  per component that sums every load on it.
- **Timoshenko members under varying loads.** `POU_D_T` builds the equivalent
  nodal loads of a *varying* `FORCE_POUTRE` with Euler-Bernoulli functions:
  for a single fixed-fixed member under a triangular load it gives the EB end
  forces (6 / 14 kN, qL²/30, qL²/20), not the shear-flexible ones. stabileo's
  6.14 / 13.86 kN is unchanged when the member is split into 64 elements, and
  Code_Aster converges to it under the same subdivision (1e-2 at 1 element,
  3e-5 at 64). The varying part of such loads is therefore applied as three
  Gauss point loads per load, which is exact for the cubic end response of an
  exact element. Uniform loads stay as `FORCE_POUTRE`, which is exact for
  them.
- **Thermal loads.** Code_Aster's beam force fields (`EFGE_ELNO`,
  `SIEF_ELNO`) are the stiffness times the *total* strain: a freely expanding
  bar reports N = EA·α·ΔT. The member force is the stiffness times the
  elastic strain, so the post-processing subtracts `EA·EPX`, `EIy·KY` and
  `EIz·KZ`. `BARRE` ignores `PRE_EPSI` altogether (no thermal response), so a
  truss's thermal load goes in as its exact equivalent, EA·α·ΔT pulling the
  two ends apart.
- **Singularity threshold.** MUMPS declares a matrix singular when a pivot
  loses more than `NPREC` digits (8 by default). The load-station splits add
  short pieces (stiffness ratios up to (L/h)³) that cost regular models up to
  about 8 digits, while true mechanisms lose 11 or more, so `NPREC = 10`.
- `MAILLE=` no longer exists in 18.x: every loaded piece gets its own group.
- **Torsion released at both ends** leaves the member's twist as a rigid mode
  of its two hinge nodes, which stabileo condenses away. The release is kept
  at the start only, which gives the same zero torque.

## Findings

Engine bugs found by this harness, each fixed with a regression test in
`engine/tests/codeaster_regressions.rs`:

1. **Silent mechanisms.** A member hinged at a support with a free far end
   and no load on it (the mechanism is not excited) was solved with no
   warning: its Cholesky pivot was 1.6e-13 of its diagonal, above the old
   64·ε threshold. The threshold is now 1e-10, the same change the
   PyNite/OpenSees harness made on #294 (rich3d-33, -50, -172, -184).
2. **linearMPC on a restrained DOF.** The equation's dependent DOF was the
   term with the largest coefficient even when that DOF was restrained, so
   the support won and the equation was dropped: `u_3y = 1.76·rx_2` with
   `rx_2` fixed gave `u_3y ≠ 0` (aster3d-43). The dependent DOF is now the
   largest-coefficient term among the free DOFs.
3. **Constraints on inclined-support nodes.** Assembly rotates an
   inclined-support node's translations into the support frame, while
   constraint equations are written in global components, so the results
   broke the constraint with no warning (aster3d-16: a rigid link with its
   master on an inclined support). The linear static solvers now refuse such
   models with an explanatory error. Constraints on the rotations of such
   nodes are unaffected.
