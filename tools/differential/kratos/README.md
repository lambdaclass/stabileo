# Kratos harness

[Kratos Multiphysics](https://github.com/KratosMultiphysics/Kratos)
(`pip install KratosMultiphysics==10.4.4 KratosStructuralMechanicsApplication==10.4.4
KratosLinearSolversApplication==10.4.4`; wheels for CPython 3.14 on macOS
arm64 and 3.12 on Linux) is an independent C++ FE framework. The harness
uses its `CrLinearBeamElement3D2N` (linear 3D beam: Euler-Bernoulli without
`AREA_EFFECTIVE_*`, exact two-node Timoshenko with them) and
`TrussLinearElement3D2N`.

```sh
cd tools/differential
.venv/bin/python run.py kratos --gen frame3d 300 --gen rich3d 400 --gen building 150 --gen frame2d 200 -j 4
.venv/bin/python run.py kratos ../../engine/tests/fixtures/*-input.json
```

Kratos runs in a worker process per model (`common.model.run_isolated`): it
prints a banner, registers applications globally and holds the GIL.

## What is compared

Linear static, 3D and 2D (lifted into the XZ plane): displacements,
reactions, member end forces, for frames (Euler-Bernoulli and Timoshenko),
trusses, member releases about any axis, support springs, settlements, and
every member load stabileo has (uniform, partial, trapezoidal, axial, point
loads and couples).

The mapping is documented in `adapter.py`. In short: `LOCAL_AXIS_2` =
stabileo's local y; `I22 = iy`, `I33 = iz`, `AREA_EFFECTIVE_Z = asY`,
`AREA_EFFECTIVE_Y = asZ` (stabileo pairs asY with Iy); springs are
`NodalConcentratedElement3D1N`. The structure is assembled from Kratos'
element matrices in the harness so that it can:

- **releases**: the beam has none. A released end gets its own node at the
  joint, its rotation the joint's plus one extra DOF per released local axis
  (exact for skew axes too);
- **member loads**: Kratos' beam line loads are not used. Every member load
  goes to nodes inserted on the member (`common.model.nodalize`, full-length
  uniform loads split in halves first): exact for the cubic end response of
  both element types, so end forces at the original ends are exact;
- **κ**: the Jacobi-scaled condition number of the free stiffness, for the
  driver's `silent_singular` / `false_reject` / `false_warning` checks.

Not compared: member loads on trusses (stabileo's hinged-beam treatment),
thermal loads, constraints, shells, warping, inclined supports.

**Modal is not compared**: the beam's consistent mass includes rotary
inertia (a Rayleigh beam: `M[ry,ry] = 4ρAL³/420 + 2ρI_yL/15`, checked on a
2 m member with Iy = 4e-5 and 4e-3), stabileo's Euler-Bernoulli mass does
not. On a two-member cantilever the bending frequencies come out 1.5e-4 to
1.1e-2 lower in Kratos while axial and torsional ones agree to 1e-14. This is
a modelling difference, not a bug on either side; Frame3DD (with rotary
inertia patched out) and MYSTRAN (lumped mass) compare modal results.

## Results

Run of 2026-10-17:

| set | ok | ill-conditioned (stabileo warned) | stabileo refused | unsupported |
|---|---|---|---|---|
| frame3d 300, rich3d 400, building 150, frame2d 200 | 832 | 157 | 22 | 39 (member load on a truss) |
| engine fixtures (114) | 113 | 0 | 0 | 1 (thermal) |

Max normalized error 1.2e-7 (reactions, on models whose κ widens the
tolerance; ~1e-10 on the fixtures). No mismatch, and no `silent_singular`,
`false_reject` or `false_warning`: of the 179 models stabileo warned about
or refused, Kratos' stiffness is singular for every one it could assemble
(κ ≥ 1.6e16, 51 models) or the model has a partial rotational mechanism
(103); 25 with member loads on trusses were not cross-checked.
