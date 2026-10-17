# MYSTRAN harness

[MYSTRAN](https://github.com/MYSTRANsolver/MYSTRAN) is an independent
Nastran-compatible FE program (Fortran). The harness writes Nastran bulk data
(SOL 1 statics, SOL 3 modes) and reads the F06.

```sh
tools/differential/mystran/build.sh      # -> tools/differential/.tools/mystran/mystran
cd tools/differential
.venv/bin/python run.py mystran --gen frame3d 300 --gen rich3d 400 --gen building 150 --gen frame2d 200 \
    --gen modal3d_lumped 300 -j 4
.venv/bin/python run.py mystran ../../engine/tests/fixtures/*-input.json
```

`build.sh` clones a pinned MYSTRAN commit (and its pinned submodules) and
builds it with gfortran and CMake (`FC`, `CC`, `CMAKE`, `MAKE_JOBS`
override). One kind of patch, to output precision only: the F06 prints
displacements, eigenvectors, SPC forces, element nodal forces and the
eigenvalue table with 7 significant digits; the build prints them with 17
(`ES24.16E3`), so the comparison is not limited by printed digits. Builds on
macOS arm64 and Linux.

## Element pair and mapping

stabileo `frame` ↔ CBAR (BAR1.f90: the exact two-node Euler-Bernoulli
element, or the shear-flexible one with PBAR K1/K2, the same Timoshenko
element as stabileo's); `truss` ↔ CROD. Orientation vector v = stabileo's
local y, PBAR `I1 = iz`, `I2 = iy`, `K1 = asZ/A`, `K2 = asY/A`; releases are
CBAR pin flags (static condensation); springs are CELAS2 to a fully
restrained extra grid (MYSTRAN rejects a grounded CELAS2); settlements are
SPC enforced values; `PARAM AUTOSPC N`, so a mechanism makes MYSTRAN fail
instead of being restrained silently. Details in `adapter.py`.

MYSTRAN has no member loads (no PLOAD1): distributed loads become four point
loads at well-spaced stations with the same moments of order 0–3
(`common.model.moment_point_loads`, exact for the cubic end responses of both
elements, with or without releases), point loads go to nodes inserted where
they act (`common.model.nodalize`).

## Modal

MYSTRAN's BAR mass is lumped (ρAL/2 per end, no rotary inertia). stabileo
lumps the mass the same way only for members with a released rotation
(`engine/src/solver/mass_matrix.rs`), so modal results are compared on
`modal3d_lumped` (`gen.py`): the shared modal models with My released at one
end of every member, where the node keeps its stiffness about that axis from
another member or a rotational restraint. Settlements are dropped in modal
input (MYSTRAN rejects enforced displacements outside statics); when MYSTRAN's
Lanczos refuses the number of modes for a small problem (error 9776) the
adapter asks for fewer.

Not compared: member loads on trusses, P-Delta (MYSTRAN has no geometric
stiffness in statics), thermal loads, constraints, shells, warping, inclined
supports, rotated springs; modal models with a member without a release.

## Disagreements found and resolved

| finding | resolution |
|---|---|
| 45 of 140 models mismatched (up to 0.9 in rotations) | translator bug: full-length trapezoidal loads were split in halves without interpolating the intensity at midspan; fixed |
| every model with a spring failed in MYSTRAN | grounded CELAS2 rejected ("invalid component number 0"); springs go to a restrained extra grid |
| frequencies off by up to 4e-7, shapes exact to 1e-13 | the eigenvalue table was still printed with 7 digits (the positive-eigenvalue format had not been patched); patched, frequencies agree to 2e-12 |
| frame2d-175: end forces 6e-5 off; PyNite, Frame3DD, Kratos agree with stabileo to 1e-13 | Gauss points of two loads on one member fell 0.17 mm apart and MYSTRAN loses digits on such short CBARs; moment-equivalent stations instead (agrees to 6e-14) |
| **stabileo bug**: "Eigenvalue decomposition failed" on 8 of 100 small `modal3d_lumped` models | lumped mass leaves the rotations massless, and the dense eigen path of small models (n ≤ 80) Cholesky-factored M. Fixed in the engine (`solve_generalized_eigen_mass`: factor K, drop massless modes); regression `modal_with_massless_rotations_solves` |
| `modal3d_lumped` produced many mechanisms | generator: a torsion release removes the member's torsional stiffness at both ends; it now releases My where the node is braced |

## Results

Run of 2026-10-17:

| set | ok | ill-conditioned (stabileo warned) | stabileo refused | other |
|---|---|---|---|---|
| static: frame3d 300, rich3d 400, building 150, frame2d 200 | 832 | 135 | 19 | 64 unsupported (member load on a truss) |
| modal: modal3d_lumped 300 | 51 | 238 (mechanisms) | 8 (mechanisms) | 3 MYSTRAN refused (problem too small for its Lanczos) |
| engine fixtures (114) | 112 | 0 | 0 | 2 unsupported (unloaded, thermal) |

Max normalized error: static 1.6e-10, frequencies 1.4e-11, mode shapes
1.7e-9. No mismatch. MYSTRAN reports no condition number, so the
`false_reject` / `false_warning` cross-checks do not run here (PyNite and
Kratos cover them).
