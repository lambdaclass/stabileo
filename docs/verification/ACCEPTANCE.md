# Real-model acceptance suite

Layer 9 of [`VERIFICATION.md`](../VERIFICATION.md): building-like models from
**public benchmarks with published reference results**, solved by stabileo
and compared against those results. Every release must pass it.

- Test target: `engine/tests/acceptance.rs` (`cargo test --release --test gates acceptance:: -- --nocapture`
  prints the full comparison table).
- Cases: `engine/tests/acceptance/models/*.json`, one file per case: the model
  in stabileo's solver JSON, the analysis, the source of every reference
  value, the modelling notes, and a tolerance with its justification.
- Generators: `engine/tests/acceptance/generators/*.py` rebuild each case from
  the data transcribed out of the source (stdlib only). `--replay` reruns the
  source's own published model code with numpy, to show where each digit comes from.
- CI: in the `test` job of `.github/workflows/ci.yml`, on every PR. One step
  regenerates every case and fails if a model file differs from its
  generator's output. The `Acceptance suite gate` step then runs the suite,
  which takes well under a second.

## Rules

1. **Independent references only.** A reference value has to come from the
   source's authors (a paper, a benchmark report, a hand or textbook solution).
   A commercial program's own output doesn't count, and neither do numbers
   computed by stabileo or by the generators. `--replay` values are diagnostics; they are never test references.
2. **Tolerances follow the source's precision.** When a source prints a value
   to n digits, the tolerance is half a unit in the last printed digit. That
   is the widest interval the true value can occupy given what was printed.
3. **Never loosen a tolerance to hide a disagreement.** A mismatch is either a
   stabileo bug (fix the engine and add a regression test) or a modelling
   difference. A modelling difference must be justified from the source and
   recorded in the case's `modelling` notes and below.
4. Every model file must be listed in the `cases!` invocation in
   `acceptance.rs`. That one list generates both the inventory and one test
   per case. A guard test fails on any model file missing from it, and a
   self-check proves the guard catches an unwired model.

## Cases

| Case | Structure | Source | Quantities | Tolerance | Status |
|---|---|---|---|---|---|
| `sac_la_3story` | SAC LA 3-storey steel MRF (N-S frame), 2D, 4 bays, rigid floors, fixed bases | Ohtori et al. 2004, J. Eng. Mech. 130(4); model files `struct3.m`, `Bld_NLBM.m` (NEES doi:10.4231/D3Q52FC7T) | f1-f3 (Hz) | ±0.005 Hz (printed to 2 decimals) | pass (max 0.13%) |
| `sac_la_9story` | SAC LA 9-storey MRF incl. basement, pinned bases, spliced columns, pinned gravity bay | same, `struct9.m` | f1-f5 | ±0.0005 / ±0.005 Hz | pass (max 0.20%) |
| `sac_la_20story` | SAC LA 20-storey MRF, 2 basements, 6.1 m bays | same, `struct20.m` | f1-f10 | ±0.0005 / ±0.005 Hz | pass (max 0.15%) |
| `asce_shm_120dof_undamaged` | IASC-ASCE SHM Phase I 4-storey 2x2-bay braced steel frame, 3D, 116 members, rigid diaphragms | Johnson et al. 2004, J. Eng. Mech. 130(1), Table 1, Table 2 ("120DOF lumped mass"); `DataGen/cal_model.m` (NEES doi:10.4231/D3Q52FC7T) | f1-f12 (x, y, torsion) | ±0.005 Hz (printed to 2 decimals) | pass (max 0.024%) |
| `asce_shm_120dof_damage_i` | same, all 1st-storey braces without stiffness (mass kept) | same, Table 2 | f1-f12 | ±0.005 Hz | pass (max 0.035%) |
| `asce_shm_120dof_damage_ii` | same, 1st- and 3rd-storey braces without stiffness | same, Table 2 | f1-f12 | ±0.005 Hz | pass (max 0.098%) |
| `asce_shm_12dof_undamaged` | same frame, source's 12DOF model (floor nodes' uz, rx, ry fixed) | same, Table 2 ("12DOF lumped mass") | f1-f12 | ±0.005 Hz | pass (max 0.019%) |
| `asce_shm_12dof_damage_i` | 12DOF, damage (i) | same | f1-f12 | ±0.005 Hz | pass (max 0.012%) |
| `asce_shm_12dof_damage_ii` | 12DOF, damage (ii) | same | f1-f12 | ±0.005 Hz | pass (max 0.072%) |
| `asce_shm_12dof_storey_stiffness_undamaged` | 12DOF frame, static: roof Fx, Fy, Mz | same, Table 3 (storey stiffnesses x, y, θ) | floor-1 and roof ux, uy, rz = F·Σ1/K | propagated half unit of each printed K (~5e-5 rel) | pass (max 0.006%) |
| `asce_shm_12dof_storey_stiffness_damage_i` | same, damage (i) | same, Table 3 | same | same | pass (max 0.021%) |
| `bathe_wilson_10bay_9storey` | 10-bay, 9-storey plane frame (110 members), lumped member mass | Bathe & Wilson 1972, J. Eng. Mech. Div. 98(EM6); data and values as quoted in CSI SAP2000 Example 1-021 / ETABS | ω1²-ω3² | [printed, printed + 1 unit): the values are truncated to 6 significant figures | pass (< 1e-6 rel) |

All 105 reference values in 12 cases pass. In every case stabileo agrees with
the replay of the benchmark's own model code to about 1e-5 relative or better.
What is left is the rounding in the printed reference values.

## Modelling differences and how they are handled

### No lumped nodal-mass input in stabileo (engine gap)

In stabileo, mass for modal and dynamic analysis comes only from element
density (`densities`: material id -> kg/m^3, consistent element mass). It has
no way to enter a lumped nodal mass or a rotary inertia. Every building
benchmark lumps its seismic mass at the nodes, so the suite carries those
masses on **mass-only stubs**:

- **Translational mass m at a node**: a 1 m truss with A = 1 m² and density 3m kg/m³ runs to a
  fixed auxiliary node. Its consistent truss mass puts exactly
  2/6·ρAL = m on the free node in every translation, and its stiffness
  (E = 1e-6 MPa, i.e. 1e-3 kN/m) is about 1e-8 of a storey stiffness.
- **Mass in the floor plane only** (SHM floor slabs): the stub's free node is
  a diaphragm slave with uz, rx and ry restrained. A panel of mass m and polar
  inertia m·(2L²)/12 becomes four points of m/4 at the centroid ± L/√12, which
  gives the same mass, first moment and polar inertia.
- **Rotary inertia J about a global axis** (SHM member torsional inertia):
  a 1 m frame along that axis with A = 1e-9 m², Iy + Iz = 1 m⁴ and density 3J.
  stabileo's consistent torsion mass ρ(Iy+Iz)L/6·[[2,1],[1,2]] puts J on the
  node. Its translational and bending-rotary masses scale with A, so they are
  about 1e-9 of J.

The emulation is exact, as the 1e-5 agreement with the replays shows. But it
is a workaround that real users cannot reasonably be asked to use. A
first-class nodal mass / rotary inertia input is tracked in
[issue #341](https://github.com/lambdaclass/stabileo/issues/341). Once it
lands, the stubs should be replaced by it.

### SAC benchmark (Ohtori et al. 2004)

- The source gives rotational masses of 1e-6·L²/210·m/2 ("rotational inertia
  is ignored"). They are omitted here. With and without them, the replay is
  identical to 6 digits.
- In the source, beams of type 3 (axial only) are stabileo `truss` elements,
  and beams of type 5 (pinned at end b) are frames with `hingeEnd`. The rigid
  floor is `equalDOF` on ux, as in the source's master/slave table.

### Bathe & Wilson frame (1972)

- The 1972 eigenvalues are those of member mass lumped half to each end
  node in both translations; the replay reproduces them to the printed
  digits that way. A consistent mass matrix, which is what stabileo's
  `densities` produce, gives ω3² = 16.79, which is 1.2% high. This is the
  same 0.6% frequency offset that independent programs report for mode 3
  when they use consistent mass. The case therefore lumps the mass on stubs,
  as the source does.
- The printed values are the exact eigenvalues truncated, not rounded
  (5.526956 is printed as 5.52695, 16.58787 as 16.5878). The tolerance band is
  [printed, printed + one unit in the last digit).

### SHM benchmark (Johnson et al. 2004)

- **Floor-beam orientation.** The archived `cal_model.m` orients the floor
  beams with k-nodes one storey down, which puts the S75x11 weak axis in
  vertical bending. With that orientation the replay comes out 4-12% below
  Table 2. The paper (p. 10) explains that an older version of the HKUST code
  "had a different orientation for the floor beams, resulting in slightly
  lower natural frequencies", and that Table 2 comes from the corrected code.
  With the strong axis in vertical bending (local y horizontal), the replay
  reproduces all 36 printed values, and so does stabileo. The case uses the
  corrected orientation.
- **Diaphragm slave rotation.** stabileo's 3D `diaphragm` constrains the
  slaves' ux and uy only. `cal_model.m` (like the SAP2000/ETABS diaphragm and
  OpenSees `rigidDiaphragm`) also ties each slave's rz to the floor rotation.
  For this model the difference is below 1e-5 in every frequency (replay
  "slave rz not tied"), so the case uses stabileo's own diaphragm unchanged.
  `--tie-rz` adds the ties as `equalDOF` constraints. See the findings below.

## Findings

- No disagreement between stabileo and a published reference so far: the
  three SAC frames and the three SHM configurations all agree to the
  precision printed in the sources.
- **Engine gap:** no lumped nodal mass or rotary inertia input (see above;
  [issue #341](https://github.com/lambdaclass/stabileo/issues/341)).
- **Semantic difference:** the 3D rigid diaphragm leaves slave rz free, while
  CSI and OpenSees constrain it. It is harmless for the SHM frame. In models
  where beams frame between diaphragm nodes it changes in-plane beam bending
  and column torsion, so it should be either documented in the user guide or
  aligned with the common definition.
