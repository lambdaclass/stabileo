# CalculiX harness

[CalculiX](http://www.calculix.de/) ccx 2.23 is an independent general FE
program (Fortran/C). Its B31/B32 beams and T3D2 trusses are expanded into 3D
solid elements internally, which is not stabileo's element, so the harness
uses ccx's native two-node 6-DOF beam **U1** (`e_c3d_u1.f`, Luo 2008), after
checking what it gets right against closed form.

```sh
tools/differential/calculix/setup.sh     # -> tools/differential/.tools/ccx-hp (nix)
cd tools/differential
.venv/bin/python run.py calculix $(cat calculix/ci-gens.txt) -j 6 --dump-dir out/calculix --shrink
.venv/bin/python run.py calculix ../../engine/tests/fixtures/*-input.json
```

`setup.sh` builds nixpkgs' `calculix-ccx` 2.23 (pinned nixpkgs revision)
with one output-only patch: `*NODE PRINT` writes 17 significant digits
instead of 7 (`printoutnode.f`, `e13.6` -> `e24.16`). `CCX_BIN` selects
another binary; the adapter otherwise uses `.tools/ccx-hp`, then
`.tools/ccx`. A stock ccx (7 digits, e.g. Debian/Ubuntu's `calculix-ccx`,
Homebrew) puts the comparison floor at ~5e-7 of each value, half the 1e-6
tolerance; with it random runs reached 7.9e-7 and the harness is not
meaningful at the default tolerance, so CI must use the nix build.

## U1 checked against closed form

Cantilever L = 2, E = 2e8, nu = 0.3, A = 0.01, I11 = 2e-5, I22 = 5e-5, tip
loads (10, 1, 2) and torque 3, Euler-Bernoulli limit (k = 1e12):

| | ccx U1 | closed form |
|---|---|---|
| ux = NL/EA | 1.000000e-5 | 1.0e-5 |
| uy = PL^3/3EI11 | 6.666667e-4 | 6.6667e-4 |
| uz = PL^3/3EI22 | 5.333333e-4 | 5.3333e-4 |
| rx = TL/(G(I11+I22)) | 1.114286e-3 | 1.1143e-3 |

So axial, both bending planes and torsion are exact, but torsion uses the
polar moment I11 + I22, not J. What is wrong (CalculiX bugs, read in
`e_c3d_u1.f` / `resultsmech_u1.f` and confirmed numerically):

- **Shear deformation**: with k = 5/6 and L = 0.5 (phi = 0.30) the tip
  deflection is 8.796e-6, *below* the Euler-Bernoulli 1.0417e-5; Timoshenko
  gives 1.1197e-5. The element's terms carry 1/(1 − phi)² where 1/(1 + phi)
  belongs. Timoshenko sections are unsupported; the Euler-Bernoulli limit
  is taken with phi = 1e-13.
- **Nodal forces** (`resultsmech_u1.f`): both ends' section forces are added
  to the nodes with the same sign (RF of the pulled cantilever is +10 at the
  clamp), the torque is scaled by k (3e12 printed for a torque of 3), and
  the shear force comes from a strain that cancels to round-off for large k.
  Reactions and end forces are therefore not compared: **displacements and
  rotations only**.
- **Prescribed displacements** go through the same nodal-force routine: a
  cantilever whose tip is prescribed uy = 1e-3 returns uz = 1.2e-3,
  ry = −1.2e-3, rz = 0 (correct: uz = 0, ry = 0, rz = 7.5e-4). Settlements
  are unsupported.
- **SPRING1** acts on translations only; on DOFs 4–6 it is silently ignored
  (a rotational base spring of 1e3 left the cantilever rotating rigidly).
  Rotational support springs are unsupported.
- ***EQUATION** terms on a DOF no element activates are silently dropped
  (that DOF behaves as fixed). The adapter makes sure every node with
  rotation equations or restraints is a U1 node (below).

## Mapping (details in `adapter.py`)

- U1 section direction 1 = stabileo's local y (passed exactly), I11 = iz,
  I22 = iy; models need j = iy + iz (`calculix/gen.py` generators; lifted 2D
  models have it).
- **Releases** (3D `releaseT/My/Mz*`, 2D hinges): the released end gets its
  own node tied to the joint by `*EQUATION` — translations, and the joint
  rotation along each unreleased local axis. This is exact condensation,
  so stabileo's releases are checked by an independent mechanism (not ccx
  condensing the element matrix). A joint whose frame ends are all released
  gets a soft stub U1 (E = 1e-20 of the largest) so its rotation DOFs exist;
  with 1e-14 the stub shifted a joint rotation by 1.2e-6 (rich3d_ccx-176,
  PyNite agreeing with stabileo to 3e-14).
- **Trusses**: U1 with every moment released at both ends and its spin held
  at one end — an exact axial bar.
- Translational springs -> SPRING1; restraints -> `*BOUNDARY`; nodal loads ->
  `*CLOAD`; every member load (point, partial, trapezoidal, uniform, axial,
  couples) -> nodes inserted on the member (`common.model.nodalize`), exact
  for the original nodes' displacements of the Euler-Bernoulli element.
  Distributed loads first become four point loads at well-spaced stations
  (0.2–0.8 L, shifted clear of point loads) with the same moments of order
  0–3, which is exact too: nodalize's three Gauss points per load put
  stations as close as 0.11 of the load's span, and ccx's solver loses
  digits on very short U1 pieces (12EI/L³). A 1.9 mm piece next to a point
  load on a 5.37 m member gave 1.2e-6 (building_ccx-25) while stabileo,
  PyNite and Frame3DD agreed to 1e-13 and each load alone agreed to 1e-13;
  with the moment-equivalent stations the same model agrees to 4e-13.
- Models whose loads all go straight into supports (displacements below
  1e-10 of P·L²/EA) are reported unsupported: without reactions both sides
  are round-off.
- A nodal moment at a node with no rotational stiffness (all members hinged
  there) is a local mechanism; stabileo refuses it ("Local mechanism
  detected"), so it is unsupported here.

Not compared: modal (U1's mass interpolates transverse translations
linearly, not with the cubic consistent mass), P-Delta (U1: "no second
order calculation"), Timoshenko sections, j ≠ iy + iz, settlements,
rotational springs, member loads on trusses, thermal loads, constraints,
shells, inclined supports.

## Results

Run of 2026-10-17 (ccx-hp), `ci-gens.txt` at seed starts 0 and 5000
(2000 random models) and the 114 engine fixtures:

| set | ok | ill-conditioned | stabileo refused | unsupported | max error (transl. / rot.) |
|---|---|---|---|---|---|
| rich3d_ccx 800 (releases, trusses, springs, every member load) | 416 | 333 | 36 | 15 | 3.4e-10 / 3.6e-10 |
| rich2d_ccx 400 (hinges, trusses, springs) | 291 | 72 | 26 | 11 | 6.4e-9 / 9.2e-9 |
| frame3d_ccx 400 | 395 | 0 | 0 | 5 | 5.3e-11 / 2.9e-10 |
| building_ccx 200 | 200 | 0 | 0 | 0 | 4.9e-12 / 1.2e-10 |
| frame2d_ccx 200 | 199 | 0 | 0 | 1 | 2.4e-10 / 4.1e-10 |
| engine fixtures 114 | 79 | 0 | 0 | 35 | 4.2e-13 / 4.7e-13 |

No mismatch. The largest errors follow the conditioning: rich2d_ccx-5163
(9.2e-9) has κ = 4.7e8 in PyNite, which differs from stabileo by 1.1e-8 on
it too. Unsupported: loads straight into supports (32 random, 8 fixtures),
fixtures with j ≠ iy + iz (25), a settlement, a thermal load.

Models stabileo refuses or flags are not compared (ccx gives no condition
number, and it does not detect mechanisms: on rich2d_ccx-5126, a pin-ended
member with a free end, which stabileo refuses and PyNite finds singular,
ccx returns finite displacements). Of the 62 refused random models, 32 are
partial rotational mechanisms, 19 apply a nodal moment where every member
is hinged (18 reported by stabileo as "Local mechanism detected", one as
singular), 7 make ccx's
displacements blow up (> 1e3 m) and 4 are the unloaded-mechanism case
above, all singular in PyNite too.
