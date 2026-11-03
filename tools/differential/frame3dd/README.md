# Frame3DD harness

[Frame3DD](https://frame3dd.sourceforge.net/) (20140514+) is an independent
C program for 3D frames: exact two-node Euler-Bernoulli / Timoshenko frame
elements, its own fixed-end forces for uniform and trapezoidal member loads,
subspace-iteration modal analysis with a consistent mass matrix, and a
geometric-stiffness (P-Delta) iteration.

```sh
tools/differential/frame3dd/build.sh     # -> tools/differential/.tools/frame3dd/{frame3dd,frame3dd-norot}
cd tools/differential
.venv/bin/python run.py frame3dd --gen frame3d 500 --gen building 300 --gen frame2d 300 \
    --gen modal3d 600 --gen pdelta3d 200 -j 8
.venv/bin/python run.py frame3dd ../../engine/tests/fixtures/*-input.json
```

`build.sh` downloads the pinned source zip (sha256-checked) and patches it
for use as a reference; the patches change precision, output and one modal
bug, never the element mechanics (details in the script):

- every `float` becomes `double` (Frame3DD stores sections, materials and
  loads in single precision: ~6e-8 input error);
- results are printed with 17 significant digits, without its small-value
  cut-offs;
- **Frame3DD bug** (main.c, modal): a restrained DOF was decoupled only from
  the higher-numbered DOFs, so it acted as a stiff spring carrying mass
  (0.5% low first frequency on a 4-member frame with a partially restrained
  node). The patch zeroes the whole row and column.

- **Frame3DD bug** (frame3dd.c, end forces with the geometric stiffness on):
  the end torque is −(G·J/L)·Δθ without K_G's torsional term T·J/(A·L), so it
  does not balance the solved (K + K_G)·u. The patch adds it (T is 0 without
  geometric stiffness, so static and modal output do not change).

A second binary, `frame3dd-norot`, also drops the rotary inertia of the
consistent mass and the torsional geometric-stiffness term N·J/(A·L); it is
used for modal. P-Delta uses the full binary: since #404 stabileo's K_G has
the Wagner term N·(Iy+Iz)/(A·L), Frame3DD's N·J/(A·L) for the J = Iy + Iz
that `pdelta3d` generates.

## What is compared

| analysis | models | quantities |
|---|---|---|
| static 3D | frames (Euler-Bernoulli and Timoshenko), roll angles / local-y vectors, settlements on restrained DOFs, nodal, uniform, partial / trapezoidal (qX, qY, qZ) and point loads | displacements, reactions, end forces |
| static 2D | lifted into the XZ plane (`common.model.lift_2d`) | same |
| modal | consistent mass, J = Iy + Iz so polar masses agree (`modal3d`) | frequencies, mode shapes (subspaces of clustered frequencies; purely rotational modes on all DOFs) |
| P-Delta | Euler-Bernoulli, J = Iy + Iz, nodal and full-length uniform loads (`pdelta3d`) | displacements, reactions, end forces |

The mapping (roll angle from stabileo's local axes, shear-area pairing,
end-force signs) is in `adapter.py`.

Not representable (unsupported): trusses, releases / hinges, springs,
settlements on free DOFs, thermal loads, constraints, shells, warping,
inclined supports. P-Delta additionally excludes interior member loads,
axial member loads and Timoshenko sections (Frame3DD's K_G is
shear-corrected and its N includes axial member loads).

## Workarounds for Frame3DD limitations

- **Point-load fixed-end forces** (frame3dd_io.c): the axial share is
  swapped (`Nx1 = P a/L` instead of `P b/L`) and the shear correction uses
  Ksz for y loads and Ksy for z loads. Interior point loads are therefore
  moved to nodes inserted on the member (`common.model.nodalize`), which is
  exact.
- **Subspace iteration convergence**: with the number of requested modes
  just above the modes compared, Frame3DD does not converge the highest ones
  and can skip a mode altogether (modal3d-268: asking for 6 modes misses the
  2.961 Hz mode 5; 12 modes give 2.9615 Hz; 20 give 2.96138213459 Hz, equal
  to stabileo's to 1e-12). The adapter asks for 20 more modes than compared
  (capped by the subspace size).

## Conditioning

Frame3DD prints no condition number. The adapter estimates it from an
independent assembly of the same model (`common/conditioning.py`): `kappa`
of the model stabileo solves and `kappa_solved` of the nodalized model
Frame3DD factors. Nodalizing can make the factored system much worse
conditioned than the model: frame3d-744293 has κ = 314, but a point load
1.9 mm from a Gauss station of a partial load gives a 1.9 mm sub-member and
κ = 1.7e11, at which Frame3DD's member force is off by 4e-5 (macOS) and
1.1e-4 (Linux) from a 100-digit solve, while stabileo agrees with it to
1e-14. The tolerance is widened to 100 ε κ with the larger of the two
(static only); the singularity statuses use `kappa`.

## Results

Run of 2026-10-17:

| set | ok | known | other |
|---|---|---|---|
| static: frame3d 500, building 300, frame2d 300 | 1100 | 0 | 0 |
| modal: modal3d 600 | 600 | 0 | 0 |
| P-Delta: pdelta3d 200 | 4 | 189 | 7 unstable (beyond the first buckling load) |
| engine fixtures (114) | 104 | 0 | 10 unsupported (trusses, hinges, springs, thermal) |

Max normalized errors: static displacements 2e-7 (P-Delta, iteration
tolerance) and ~1e-9 otherwise, reactions 5e-8, frequencies 1.7e-10, mode
shapes 2.5e-8.

`known`: P-Delta member end forces omit K_G·u (the end forces do not
balance the reactions, which do include K_G); displacements and reactions
agree. Fixed on #283 (`common/known.py`); remove the rule once it is merged.
