# Differential testing against independent frame programs

The result certificates (`engine/src/certify`) prove that stabileo's
displacements solve the system it assembled. They cannot see a wrong element
matrix, fixed-end force, axis or sign convention, a dropped reaction term, or
a singular stiffness solved without a warning: a wrong model is certified
too. These harnesses solve the same model in independent programs and compare
displacements, reactions, member end forces, frequencies and mode shapes.

| program | harness | analyses | install |
|---|---|---|---|
| [Frame3DD](frame3dd/README.md) | `frame3dd/` | static 2D/3D, modal, P-Delta | `frame3dd/build.sh` (source, patched for double precision) |
| [PyNite](pynite/README.md) | `pynite/` | static 2D/3D (releases, trusses, springs) | `pip install PyNiteFEA` |
| [MYSTRAN](mystran/README.md) | `mystran/` | static 2D/3D (releases, trusses, springs, Timoshenko), modal (lumped mass) | `mystran/build.sh` (source, gfortran + CMake, 17-digit F06) |
| [Kratos](kratos/README.md) | `kratos/` | static 2D/3D (releases about any axis, trusses, springs, Timoshenko) | `pip install KratosMultiphysics KratosStructuralMechanicsApplication KratosLinearSolversApplication` |
| [CalculiX](calculix/README.md) | `calculix/` | static 2D/3D displacements (native U1 beam, Euler-Bernoulli, J = Iy + Iz) | `calculix/setup.sh` (nix, 17-digit output) |

All five build and run on macOS arm64 and Linux. OpenSees has its own
harness in `tools/opensees/` (whose model conventions and comparison
`common/` reuses); Code_Aster is on its own branch.

## Run

```sh
cargo build --release --example diff_solve          # the stabileo side (engine/examples/diff_solve.rs)
python3 -m venv tools/differential/.venv
tools/differential/.venv/bin/pip install numpy scipy PyNiteFEA KratosMultiphysics \
    KratosStructuralMechanicsApplication KratosLinearSolversApplication openseespy
tools/differential/frame3dd/build.sh

cd tools/differential
.venv/bin/python run.py frame3dd --gen frame3d 300 --gen modal3d 100 --gen pdelta3d 100 -j 8
.venv/bin/python run.py pynite --gen rich3d_eb 1000 --gen frame2d 300 -j 8 --dump-dir out/pynite --shrink
.venv/bin/python run.py pynite ../../engine/tests/fixtures/*-input.json
```

`ci.sh` runs every available harness with the CI sizes (the nightly
`differential` workflow).

Inputs are model files (stabileo solver JSON, e.g. `engine/tests/fixtures/*-input.json`)
and generators (`--gen NAME N`, seeds `--seed-start..+N`, deterministic):
`rich3d` (tools/opensees/gen_models.py: trusses, releases, local-y vectors,
roll angles, Timoshenko sections, springs, settlements, partial/trapezoidal
and point loads), `frame2d`, `frame3d`, `building`, `modal3d`, `pdelta3d`
(`common/gen.py`) and per-program ones (`<program>/gen.py`). `--dump-dir`
writes every flagged model; `--shrink` also writes a delta-debugged minimal
model (`.min.json`) and, when the adapter can, its native input file. The
shrinker keeps a smaller model only if it still mismatches by at least half
the original error and its reference reactions and end forces are not all
below 1e-8 of the original's (`SHRINK_FLOOR`): otherwise it drifts to a
model whose "mismatch" is round-off against round-off.

Exit status: 0 nothing flagged, 1 a model flagged, 2 harness error.

## Statuses

| status | meaning |
|---|---|
| `ok` | agrees within tolerance |
| `mismatch` | disagrees: a stabileo bug, a translator bug or a reference bug, to triage |
| `known` | a mismatch fixed on an open PR not merged into this branch (`common/known.py`) |
| `silent_singular` | the reference's stiffness is singular (Jacobi-scaled κ > 1e14) and stabileo solved it without a warning |
| `false_reject` | stabileo refused a model whose reference stiffness is regular (κ < 1e10) |
| `false_warning` | stabileo flagged a model ill-conditioned whose reference stiffness is well conditioned (κ < 1e8) |
| `ill_conditioned` | stabileo warned (singular/indefinite, LU fallback, high residual), or the reference κ > 1e12: no unique answer to compare |
| `refused` | stabileo refused the model and the reference finds it singular too (κ > 1e12): a correct refusal |
| `stabileo_failed` | stabileo refused the model (and no reference says it is regular or singular) |
| `unstable` | P-Delta past the first buckling load |
| `unsupported` | the reference program cannot represent a feature of the model |
| `reference_failed`, `unloaded` | the reference program failed; the model has no load |

The last-but-one block is how the singularity checks are tested: a model is
never "compared" when one side says it has no unique answer, but the two
sides must agree on whether it does.

## Comparison

Static and P-Delta results use the OpenSees harness's scale-aware comparison
(`tools/opensees/compare.py`): each group (translations, rotations, reaction
forces / moments, end forces / moments) is compared as
`|stabileo − reference| / scale`, with the scale the group's largest
magnitude floored by its companion group times the model size. The default
tolerance is 1e-6, widened to `100 ε κ` when the reference reports κ (both
programs lose about κ ε). Frame3DD does not expose its stiffness, so its
adapter reports κ from an independent numpy assembly of the same model
(`common/conditioning.py`, which reproduces PyNite's own κ to five digits):
`kappa` for the model stabileo solves (the singularity statuses) and
`kappa_solved` for the nodalized model Frame3DD factors (the tolerance uses
the larger; static only, since P-Delta factors K + K_G). Modal results compare frequencies (relative) and
mode shapes as subspaces of clustered (repeated) frequencies
(`common/results.py`).

A tolerance is never widened to make a disagreement go away: each one is a
stabileo bug (fixed in the engine, with a regression test in
`engine/tests/differential_regressions.rs`), a translator bug (fixed here),
or a documented modelling difference of the reference program (made
`unsupported`, or worked around exactly, e.g. `common.model.nodalize`).

## Layout

```
run.py              command line
common/driver.py    one comparison per model, statuses, shrinking, summary
common/model.py     stabileo model I/O, geometry, 2D -> 3D lifting, nodalizing, isolation
common/results.py   static and modal comparison
common/gen.py       random models
common/known.py     mismatches fixed on open PRs
<program>/adapter.py  translator: stabileo JSON -> native input -> results
```

An adapter provides `NAME`, `ANALYSES`, `available()`,
`unsupported(model, analysis)`, `run(model, analysis, densities=, n_modes=)`
and optionally `TOL`, `write_native` (see `common/driver.py`).

## Findings

Per-program details are in each README. Engine changes made on this branch
(each with a regression test in `engine/tests/differential_regressions.rs`):

- **Silent mechanisms** (PyNite, OpenSees): a member hinged at the tip of
  another and free at its other end spins freely; rounding left its Cholesky
  pivot at ~1e-14 of the diagonal, above the old 64 ε singularity threshold,
  so stabileo returned arbitrary displacements without a warning. The
  threshold is now 1e-10 (`engine/src/solver/definiteness.rs`), which cannot
  flag a regular model whose Jacobi-scaled condition number is below 1e10
  (interlacing argument in the module notes).
- **Rigid-body motions left free by the supports** are flagged exactly by a
  new pre-solve gate (`pre_solve_gates::check_rigid_body_restraint_3d`).
  Auditing the 1e-10 threshold on every model of the engine's test suite
  showed that no pivot threshold separates them from regular models: a plate
  free to turn in its plane had pivots of 1.3e-10 (3×3 mesh) to 3.4e-8
  (10×10) of the diagonal, a ring free to turn about its loaded diameter
  1.5e-14, while regular models with stiff springs reach 9e-9. The first
  version of the gate flagged one regular model (PyNite, two rotational
  restraints acting together through a released axis); fixed.
- **Modal analysis failed on small models with massless rotations**
  (MYSTRAN): members with a released rotation get a lumped mass, and the
  dense eigen path (n ≤ 80) Cholesky-factored M ("Eigenvalue decomposition
  failed"). It now factors K and drops the massless modes.

Reference-program bugs found and worked around (not stabileo's): Frame3DD
point-load fixed-end forces (swapped axial share, crossed shear correction),
its modal elimination of restrained DOFs and its unconverged subspace
iteration; CalculiX U1's inverted shear deformation, wrong reactions and
section forces, wrong prescribed displacements and ignored rotational
springs. Modelling differences documented: Kratos' beam mass has rotary
inertia, MYSTRAN's is lumped, CalculiX U1 torsion uses Iy + Iz.

**frame3d-744293** (issue #336, static, normalized error 2.4e-5 on macOS,
6.7e-5 on Linux against the fixed 1e-6): not a stabileo bug. The model is
well conditioned (κ = 314), but nodalizing its interior loads for Frame3DD
put a point load 1.9 mm from a Gauss station of a partial load on the same
4 m member, and the 1.9 mm sub-member makes the system Frame3DD factors
κ = 1.7e11. A 50- and 100-digit solve (mpmath) of that nodalized system
gives N = 92.7267325811942 for member 1; stabileo (original model) gives
92.726732581196, Frame3DD 92.73061 (macOS) / 92.73737 (Linux). Frame3DD loses
κ ε, as expected. With `kappa_solved` the tolerance is 100 ε κ = 3.8e-3 and
the model compares `ok`; its shrunk model (one unloaded bar, every result
~1e-15) is now rejected by the shrinker's floor.

Not a disagreement but worth knowing: `ex-3d-nave-industrial` has 20 nodes
lying inside member spans without being connected to them, and stabileo has
no diagnostic for that.
