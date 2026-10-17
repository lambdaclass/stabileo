# PyNite harness

[PyNite](https://github.com/JWock82/Pynite) (`pip install PyNiteFEA`, tested
with 3.2.0) is an independent pure-Python 3D frame program: Euler-Bernoulli
members with end releases by static condensation, closed-form fixed-end
reactions for point, partial and trapezoidal loads in all three local axes,
two-way support springs, prescribed displacements.

```sh
tools/differential/.venv/bin/pip install PyNiteFEA numpy scipy
cd tools/differential
.venv/bin/python run.py pynite --gen rich3d_eb 1000 --gen building_eb 300 --gen frame2d 300 -j 8
.venv/bin/python run.py pynite ../../engine/tests/fixtures/*-input.json
```

PyNite runs in a worker process per model (`common.model.run_isolated`): it
prints, keeps global state and holds the GIL.

## What is compared

Linear static, 3D and 2D (lifted into the XZ plane, `common.model.lift_2d`):
displacements, reactions, member end forces, for frames, trusses (members
with both bending ends and one torsion end released), member releases
(`releaseMy/Mz/T*`, 2D hinges), support springs, settlements, nodal loads,
full / partial / trapezoidal distributed loads (qX, qY, qZ) and point loads
(px, py, pz and couples).

The harness also computes PyNite's free stiffness condition number κ
(Jacobi-scaled) and the minimum Cholesky pivot ratio in stabileo's DOF order,
which the driver uses to cross-check stabileo's singularity diagnostics
(`silent_singular`, `false_reject`, `false_warning`).

The mapping (local axes via PyNite's member rotation angle, release names,
spring-over-restraint precedence, end-force signs) is documented in
`adapter.py`.

## Not compared (unsupported)

- Timoshenko sections (PyNite has no shear deformation); `rich3d_eb` and
  `building_eb` are the shared generators without shear areas.
- A node lying inside a member's span: PyNite's physical members split there
  and connect it, stabileo does not connect it.
- Partial rotational mechanisms (a node whose members' unreleased rotation
  axes and rotational restraints span 1 or 2 directions): a mechanism in
  both, nothing to compare. Nodes with no rotational stiffness at all (truss
  joints, all members hinged) get stabileo's artificial spring; their
  rotations are fixed in PyNite and not compared.
- P-Delta (`analyze_PDelta`): PyNite's K_G has axial (P/L on the axial DOFs)
  and torsional (P Ip/(A L)) terms stabileo does not have, and with releases
  it condenses K_G separately from K.
- Modal: PyNite has no mass matrix.
- Thermal loads, constraints, shells, warping, inclined supports.

## Results

Run of 2026-10-17 (PyNite 3.2.0, after the engine changes of this branch):
`rich3d_eb` 1000 + `building_eb` 300 + `frame2d` 300 random models (seeds
from 0) plus 2600 more (seeds from 5000), and the 114 engine fixtures:

| set | ok | ill-conditioned (both agree) | stabileo refused (mechanism) | unsupported |
|---|---|---|---|---|
| random, seeds 0.. (1600) | 1036 | 358 | 30 | 175 |
| random, seeds 5000.. (2600) | 1534 | 746 | 48 | 272 |
| fixtures (114) | 112 | 0 | 0 | 2 |

Max normalized error over compared models: 1.1e-9 (6e-11 on the first
set); no mismatch. Every model stabileo flagged or refused is singular in
PyNite too: the reference condition number is ≥ 5.5e15 where PyNite could
assemble it, the rest are partial rotational mechanisms. Compared models
have κ ≤ 1.3e6 (first set). The one `false_warning` found (rich3d_eb-557,
κ = 4.1e4) was the first version of the engine's rigid-body gate, fixed.
Two `false_reject` reports were harness artifacts (a torsion release at
one end leaves no torsional stiffness at either end; Jacobi scaling hid a
round-off diagonal in κ), fixed here.

The earlier run that found the silent mechanisms (before the pivot threshold
change, see `engine/tests/differential_regressions.rs`): 3 `silent_singular`
models in 300 `rich3d` (scaled κ 3.7e16–2.8e17, stabileo's smallest pivot
1.1e-14–1.5e-14 of its diagonal).

Fixture notes: `ex-3d-nave-industrial` has 20 nodes lying inside member
spans without being connected to them (e.g. node 18 on element 35); stabileo
gives no diagnostic for that. `ex-thermal` uses a thermal load.
