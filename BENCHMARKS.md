# Benchmark Validation Test Tracking

> Master list of all industry-standard benchmarks and validation tests.
> Status: DONE = reproduces published benchmark with tight tolerance (<5%),
> CAPABILITY = solver feature exists with smoke/capability tests but benchmark not yet reproduced exactly,
> BLOCKED = needs new solver features.

---

## Summary

| Category | Done | Capability | Blocked | Total |
|----------|------|------------|---------|-------|
| Industry Standards & Design Codes | 169 | 0 | 0 | 169 |
| Commercial Software Cross-Validation | 81 | 5 | 1 | 87 |
| Textbook Classics | 1050 | 0 | 0 | 1050 |
| Mathematical Properties & Numerical Methods | 115 | 0 | 0 | 115 |
| FEM Quality & Convergence | 30 | 0 | 0 | 30 |
| Fixed Bugs (regression) | 6 | 0 | 0 | 6 |
| Placeholders | 0 | 3 | 0 | 3 |
| **Total** | **1445** | **8** | **7** | **1460** |

The table above is the curated benchmark-status ledger. It is narrower than the full automated test inventory shown below, because many validation/unit/integration tests are support checks, regression tests, or formula verifications rather than one benchmark row per test.

**3030 validation test functions across 385 validation files. 3475 total registered tests across 423 Rust test files.**

Current measured inventory for this pass:

- `385` files matching `engine/tests/validation_*.rs`
- `3030` `#[test]` functions inside validation files
- `25` files matching `engine/tests/integration_*.rs`
- `3475` total registered tests from `cargo test -- --list`

### Recent Session Additions

All newly added modules and tests from this session are passing with zero failures.

#### Design Check Modules Implemented This Session

| Module | Code | Tests | Description |
|--------|------|-------|-------------|
| `connection_check` | AISC 360 | 8 integration tests | Bolt-group and weld-group elastic method checks |
| `foundation_check` | ACI 318 | 8 integration tests | Spread footings: bearing, overturning, sliding, and punching shear |
| `cfs_check` | AISI S100 | 8 integration tests | Cold-formed steel: compression, LTB, shear, and distortional buckling |
| `ec2_check` | EN 1992-1-1 | 8 integration tests | Eurocode 2 concrete: parabolic stress block and variable-strut shear |
| `cirsoc201_check` | CIRSOC 201-05 | 8 integration tests | Argentine concrete: Whitney block and ACI-style shear |
| `ec3_check` | EN 1993-1-1 | 8 integration tests | Eurocode 3 steel: buckling curves a-d, LTB, and interaction checks |
| `masonry_check` | TMS 402 | 8 integration tests | Masonry: axial with slenderness, flexure, and shear |

#### New Validation Files Added This Session

| File | Coverage |
|------|----------|
| `validation_fracture_mechanics.rs` | SIF, J-integral, Paris law, MTS, FAD |
| `validation_laminate_plate_theory.rs` | CLT, Tsai-Wu, rule of mixtures, laminate invariants |
| `validation_hydrodynamic_loading.rs` | Morison loading, wave theory, VIV-related formulas |
| `validation_plate_shell_buckling.rs` | Donnell, Von Karman, Winter, EC3-style shell buckling formulas |
| `validation_structural_damping_models.rs` | Rayleigh damping, half-power bandwidth, Eurocode 8 damping correction |
| `validation_thermal_stress_analysis.rs` | Restrained thermal stress, thermal buckling, bimetallic-strip behavior |
| `validation_finite_element_convergence.rs` | h-refinement, p-refinement, patch-style consistency, Richardson extrapolation |

#### Bug Fixes Included in This Session

- ACI 318 phi-factor unit-test threshold
- Fracture mechanics MTS initial guess and FAD test point
- Laminate plate theory invariant assertion and Halpin-Tsai bound

#### Current Postprocess Footprint

- `17` postprocess modules in `engine/src/postprocess/mod.rs`
- `82` unit tests and `25` integration test files across the postprocess/design-check surface

---

## Testing Layers

The benchmark suite is only one part of solver verification. A structural solver should be tested in layers:

1. `Unit tests`
   Element stiffness, fixed-end forces, transformations, mass matrices, geometric stiffness, damping terms, and postprocessing formulas.
2. `Analytical validation`
   Closed-form textbook cases for beams, frames, trusses, buckling, dynamics, thermal loads, Timoshenko beams, cables, staged/prestress sanity checks, and related structural mechanics problems.
3. `Published benchmark reproduction`
   ANSYS VM, NAFEMS, SAP2000 / Code_Aster cross-checks, textbook benchmark sets, shell benchmarks, and nonlinear benchmark problems.
4. `Differential / consistency testing`
   Dense vs sparse assembly, 2D vs equivalent 3D cases, small-load linear vs nonlinear consistency, and fixture-based regression comparison across solver paths.
5. `Property / invariant testing`
   Equilibrium, symmetry, reciprocal behavior, rigid-body modes, superposition where applicable, and physically meaningful scaling/invariance checks.
6. `Integration testing`
   Full workflows such as staged analysis, time history, moving loads, harmonic response, nonlinear 3D, shell thermal loading, and multi-case / envelope operations.
7. `Regression testing`
   Every bug should leave behind a permanent minimal reproducer.
8. `Performance and scale testing`
   Solve time, memory use, iteration counts, sparse vs dense crossover behavior, and large-model reliability.
9. `Real-model acceptance testing`
   Representative building, bridge, plate/shell, cable, prestress, and staged-construction models that look like actual engineering work, not only textbook cases.

### Notes on Differential Testing

Differential testing is still useful, but it should not depend on a deleted implementation.

The right long-term role for differential tests here is:

- compare multiple solver paths inside the current engine
- compare current results against locked fixture baselines
- compare against external published references or commercial/open-source cross-check models

In other words, the benchmark strategy should be framed around reproducibility and solver consistency, not around parity with a removed TypeScript solver.

---

## Solver Capability Matrix

This section is intentionally different from the benchmark tables below.

- The benchmark tables answer: "what published references do we reproduce?"
- This matrix answers: "what solver categories do we actually implement today, and how close are they to best-in-class?"

Status definitions used here:

- **Strong** = real implementation with broad validation coverage and practical confidence
- **Good** = real implementation with meaningful coverage, but still behind top-tier solvers in depth or robustness
- **Partial** = implemented in a limited or approximated form
- **Gap** = not yet implemented as a true solver capability

| Category | Current Status | Evidence in Code / Tests | Gap to Best-in-Class |
|----------|----------------|--------------------------|----------------------|
| 2D linear static | Strong | `solver/linear.rs`, broad beam/frame/truss validation files | Mostly hardening, scale, and regression depth |
| 3D linear static | Strong | `solver/linear.rs`, `validation_3d_*`, `validation_space_frame_geometry.rs` | More industrial edge cases and larger benchmark corpus |
| Load combinations / envelopes | Strong | `postprocess/combinations.rs`, `validation_combinations.rs`, `validation_load_combination_envelope.rs` | Mostly product/workflow polish |
| Diagrams / section forces / deformed shape | Strong | `postprocess/diagrams.rs`, `postprocess/diagrams_3d.rs`, `postprocess/section_stress*.rs` | Minor completeness and UX, not core formulation |
| 2D P-Delta | Strong | `solver/pdelta.rs`, `validation_pdelta_*`, AISC/EC stability tests | More nonlinear robustness and path-following |
| 3D P-Delta | Strong | `solver/pdelta.rs`, `validation_3d_pdelta.rs`, `validation_3d_buckling.rs` | More difficult nonlinear frame/shell coupling cases |
| 2D buckling | Strong | `solver/buckling.rs`, `validation_euler_buckling.rs`, `validation_column_buckling_modes.rs` | Post-buckling / imperfection workflows |
| 3D buckling | Strong | `solver/buckling.rs`, `validation_3d_buckling.rs` | More difficult frame / torsion / shell coupling cases |
| 2D modal | Strong | `solver/modal.rs`, `validation_modal_frequencies.rs`, `validation_modal_properties.rs` | Mainly larger mixed-element coverage |
| 3D modal | Strong | `solver/modal.rs`, `validation_3d_modal_dynamic.rs` | More plate/shell/mixed-model maturity |
| 2D response spectrum | Strong | `solver/spectral.rs`, `validation_spectral_response.rs`, `validation_rsa_crosscheck.rs` | Mainly code-specific workflows |
| 3D response spectrum | Strong | `solver/spectral.rs`, `validation_3d_spectral.rs` | More production-grade load-direction / combination workflows |
| 2D time history | Good | `solver/time_integration.rs`, `validation_time_history.rs`, `validation_dynamic_mdof.rs` | Stronger nonlinear coupling, more integrators/controls |
| 3D time history | Good | `solver/time_integration.rs`, `integration_time_history_3d.rs` | Needs broader benchmark depth and stronger nonlinear/damping coverage |
| Harmonic response (2D/3D) | Good | `solver/harmonic.rs`, `integration_harmonic.rs` | Needs broader benchmark depth, damping depth, and larger-model coverage |
| 2D geometric nonlinear (corotational) | Good | `solver/corotational.rs`, `validation_corotational*.rs` | Arc-length, limit points, stronger benchmark parity |
| 3D geometric nonlinear | Good | `solver/corotational.rs`, `integration_corotational_3d.rs` | Needs broader benchmark depth, stronger controls, tougher convergence cases |
| 2D material nonlinear | Partial | `solver/material_nonlinear.rs`, benchmark/capability tests | Present but still simplified relative to fiber/section-based nonlinear solvers |
| 3D material nonlinear | Partial | `solver/material_nonlinear.rs`, `integration_material_nonlinear_3d.rs` | New implementation; needs broad validation and tougher benchmark parity |
| Plastic collapse / hinge sequencing | Good | `solver/plastic.rs`, `validation_plastic_*`, `integration_plastic_3d.rs` | Not a full general nonlinear plasticity framework |
| Moving loads / influence workflows (2D/3D) | Good | `solver/moving_loads.rs`, `validation_moving_loads.rs`, `integration_moving_loads_3d.rs`, `postprocess/influence.rs` | Needs deeper bridge/special-vehicle benchmark coverage |
| Multi-case load solving / envelopes (2D/3D) | Good | `solver/load_cases.rs`, `postprocess/combinations.rs`, `validation_load_combination_envelope.rs` | Needs larger workflow coverage and richer product-facing load management |
| 2D frame / truss elements | Strong | `element/frame.rs`, `element/truss` behavior via linear solver/tests | Mostly shear deformation and nonlinear upgrades |
| 3D frame / truss elements | Strong | `element/frame.rs`, broad `validation_3d_*` coverage | Warping completion, nonlinear upgrades |
| Plate / shell triangles | Good | `element/plate.rs`, `validation_plates.rs`, `validation_scordelis_lo.rs`, recent drilling/nodal-stress/thermal upgrades | Higher fidelity shell behavior, convergence quality, more benchmark depth |
| Curved beams | Partial | `element/curved_beam.rs`, `validation_curved_beams.rs` | Current approach is segmented expansion, not native high-end formulation |
| Timoshenko beam / shear deformation | Good | `element/frame.rs`, shear-area fields in `types/input.rs`, `validation_timoshenko_solver.rs` | Needs broader production validation across all solver modes |
| Cable / catenary element | Good | `element/cable.rs`, `solver/cable.rs`, `integration_cable_solver.rs` | Needs broader bridge/cable-net/staged benchmark depth |
| Warping torsion / 7th DOF | Partial | 14-DOF plumbing in `assembly.rs`, `linear.rs`, placeholder tests in `validation_warping_torsion.rs` | Finish assembly, loads, supports, postprocessing, and validation |
| Thermal loads / settlements / springs | Strong | `validation_thermal_*`, `validation_prescribed_*`, `validation_spring_supports.rs` | More coupled / 3D edge cases |
| Winkler foundation solvers (2D/3D) | Good | `solver/winkler.rs`, `integration_winkler.rs`, `validation_foundation_interaction.rs` | Broader SSI families beyond Winkler and tougher benchmark parity |
| Pressure loads on plates | Good | `SolverLoad3D::Pressure`, plate validation files | Better load vectors and shell-quality convergence |
| Plate thermal loads / stress recovery | Good | `element/plate.rs`, recent plate integration tests | More benchmark depth and smoothing/quality validation |
| Prestress / post-tension FE analysis | Partial | `solver/prestress.rs`, `solver/staged.rs`, `integration_staged_analysis.rs`, `integration_staged_3d.rs` | Real prestress/staged support exists, but not yet a full general PT analysis framework |
| Construction staging | Good | `solver/staged.rs`, `integration_staged_analysis.rs`, `integration_staged_3d.rs` | 2D and 3D staged solvers exist; broader workflow depth and time-dependent coupling remain open |
| Creep / shrinkage / relaxation response | Gap | Formula-level tests exist, no coupled structural response solver | Time-dependent constitutive / load-history implementation |
| Kinematic / mechanism diagnostics | Strong | `solver/kinematic.rs`, `validation_kinematic.rs`, `validation_3d_kinematic.rs` | Better diagnostics/reporting, not major formulation gap |
| Section analysis / section properties | Good | `section/mod.rs`, `integration_section.rs`, `validation_section_stress.rs` | Needs richer section libraries and tighter integration with nonlinear/design workflows |

### Suggested Competition Scope

Trying to be "best in every category" is not a single roadmap. It is at least four separate solver programs:

1. **Building frame solver**
   Frame/truss, second-order, modal, spectrum, time history, nonlinear beam-column, staging, prestress, serviceability.
2. **Advanced nonlinear solver**
   3D corotational, material nonlinearity, path-following, post-buckling, robustness under difficult equilibrium paths.
3. **Shell / complex-structure solver**
   Better plate/shell elements, mixed beam-shell models, dynamic consistency, difficult mesh behavior.
4. **Specialized structure solver**
   Cables, cable nets, tensegrity, bridge staging, time-dependent effects, soil-structure interaction.

Today the engine is already competitive in the first program's linear and second-order core, and it has now entered the nonlinear, cable, staging, and improved plate/shell categories. It is still clearly behind top-tier solvers in advanced shells, lifecycle effects, warping completion, and the deepest nonlinear mechanics.

---

## World-Class Parity Tiers

The sections below describe current capability and current gaps. This section answers a different question:

- If the current gap list were completed, what solver-layer capabilities would still matter to become truly world-class?

### Solver-First Priority Stack

This is the solver-core ordering to use when the goal is technical leadership rather than short-term product breadth.

#### Must Do Before Claiming Top-Tier

| Priority | Topic | Why It Matters |
|----------|-------|----------------|
| 1 | Warping torsion completion | The 7th-DOF path is still not fully closed. Until this is finished, torsion capability claims should remain conservative |
| 2 | Nonlinear solution controls | Arc-length, displacement control, line search, adaptive stepping, and divergence recovery are required for serious nonlinear robustness |
| 3 | Constraint technology | MPCs, rigid links, diaphragms, eccentric connectivity, and connector elements are required for real structural models |
| 4 | Fiber / section-based beam-column elements | A major dividing line between basic member nonlinearity and elite nonlinear frame analysis |
| 5 | Initial imperfections / initial state modeling | Out-of-plumbness, residual stress, prestrain/preload, and initial stress fields are essential for realistic stability and nonlinear work |
| 6 | Shell upgrade | Better shell families, stronger distortion tolerance, and broader shell reliability are needed for top-tier shell capability |
| 7 | Performance / scale engineering | Large-model reliability, sparse performance, conditioning, and eigensolver robustness are part of solver quality, not just implementation detail |

#### Important For Parity

| Priority | Topic | Why It Matters |
|----------|-------|----------------|
| 8 | Contact / gap / compression-only / tension-only elements | Important for uplift, bearings, staged support behavior, and practical nonlinear modeling |
| 9 | More complete prestress / post-tension behavior | Important for PT concrete, bridges, and staged-construction workflows |
| 10 | Better soil-structure interaction | Beyond Winkler: p-y, t-z, q-z, nonlinear spring families, and stronger foundation coupling |
| 11 | Benchmark hardening on newest features | Especially 3D corotational, 3D material nonlinear, 3D time history, 3D staging, cable, and upgraded plate/shell behavior |

#### Later / Specialization

| Priority | Topic | Why It Matters |
|----------|-------|----------------|
| 12 | Creep / shrinkage / relaxation coupled response | Important, but narrower than the core solver-class gaps above |
| 13 | Lifecycle / degradation effects | Fire, fatigue, cyclic degradation, hysteretic damage, and related durability behavior |
| 14 | Specialized structure families | Cable nets, membranes, advanced bridge-specific nonlinear workflows, and related domain expansion |

### Tier 1 — Must-Have for World-Class Solver Status

| Topic | Why It Matters |
|-------|----------------|
| Nonlinear solution controls | Arc-length, displacement control, line search, adaptive stepping, and restart behavior are required for difficult nonlinear equilibrium paths and post-buckling robustness |
| Fiber / section-based beam-column elements | Distinguishes basic member nonlinearity from serious spread-plasticity analysis for steel and reinforced concrete frames |
| Constraint technology | MPCs, rigid links, diaphragms, tied DOFs, connector elements, and eccentric connectivity are essential for real building models |
| Initial imperfections and initial state modeling | Out-of-plumbness, residual stress, prestrain/preload, and initial stress fields are essential for realistic stability and nonlinear analysis |
| Robust shell technology | High-quality quads, thick shells, curved shells, mixed interpolation, and distortion tolerance are required to move beyond a good triangle-based shell core |
| Performance and scale | Large-model sparse performance, conditioning, eigensolver robustness, and server-scale solve paths are part of solver quality, not just infrastructure |

### Tier 2 — Important for Commercial Parity

| Topic | Why It Matters |
|-------|----------------|
| Contact / gap / compression-only / tension-only support elements | Needed for uplift, bearings, staged contact, and practical nonlinear support behavior |
| Advanced mass and damping modeling | Consistent/lumped mass options, eccentric mass, diaphragm mass, and robust damping choices are necessary for strong dynamics workflows |
| 3D time history | Required for complete dynamic and nonlinear seismic capability |
| 3D staged construction | Required for bridge, erection, and phased 3D structural workflows |
| Better soil-structure interaction | p-y, t-z, q-z, nonlinear spring families, and pile abstraction matter for foundation and infrastructure parity |
| More complete prestress / post-tension behavior | General tendon modeling, staged stressing, losses, and time-dependent coupling are needed for strong PT workflows |
| Model reduction / condensation / substructuring | Important for larger models and more sophisticated engineering workflows |
| Rigid end offsets / panel zones / joint modeling | Common in commercial building analysis and often decisive for practical model fidelity |

### Tier 3 — Specialized but High-Value

| Topic | Why It Matters |
|-------|----------------|
| Creep / shrinkage coupled response | Important for concrete, prestress, and long-term deformation prediction |
| Fire / temperature-dependent nonlinear response | Important for performance-based fire design and resilience workflows |
| Fatigue / cyclic degradation / hysteretic damage | Important for bridges, seismic assessment, and repeated-load problems |
| Cable-net / membrane / tensile-surface technology | Important for long-span and tensile structures beyond standard cable members |
| Bridge-specific staged and moving-load nonlinear workflows | Important for infrastructure parity rather than only building parity |
| Explicit instability / post-buckling tooling | Important for advanced research-grade and high-end nonlinear workflows |
| Probabilistic / sensitivity / reliability analysis | Important for risk-informed and optimization workflows |
| Fracture / damage mechanics | Important for advanced concrete and steel deterioration/failure studies |

### Recommended Order After Current Gap List

If the goal is "best solver" rather than "feature checklist completeness", the highest-leverage order after the current roadmap gaps is:

1. Nonlinear solution controls
2. Constraint technology
3. Fiber / section-based beam-column elements
4. Initial imperfections / initial state modeling
5. Shell upgrade
6. Performance / scale

This order improves solver class faster than expanding sideways into more specialized engineering modules.

---

## Industry Standards & Design Codes

### AISC 360-22 (46 tests across 5 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_aisc_stability.rs` | 6 | AISC 360-22 Commentary Cases 1 & 2 | B1 braced, B2 sway amplification, convergence, equilibrium |
| `validation_effective_length.rs` | 8 | AISC Manual Commentary C2 | K=1.0/0.5/0.7/2.0, braced vs unbraced, stiffness ranking |
| `validation_frame_classification.rs` | 8 | AISC 360-22 Ch.C, EN 1993-1-1 §5.2 | Sway/non-sway, braced/unbraced, fixed vs pinned base |
| `validation_notional_loads.rs` | 8 | AISC 360-22 §C2, EC3 §5.3, CSA S16 §8.4 | Notional 0.2-0.5% gravity, proportionality, multi-story |
| `validation_braced_frame.rs` | 8 | AISC 360-16 Ch.C, McCormac 6th | X-brace, K-brace, chevron, diagonal force=H/cos(θ) |
| `validation_braced_frames.rs` | 8 | AISC 360-16 Ch.C, Salmon/Johnson 5th | Stiffness increase, sway reduction, multi-story drift |

### Eurocode 3 — EN 1993-1-1 (28 tests across 4 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_eurocode3_buckling.rs` | 6 | EN 1993-1-1 §5.2.1 | alpha_cr vs Horne, fixed vs pinned base, multi-story, braced |
| `validation_code_provisions.rs` | 7 | EN 1993-1-1 §5.2, EN 1998-1 §4.3.3.3, ASCE 7 §12.9 | alpha_cr thresholds, P-delta amplification, mass participation |
| `validation_deflection_limits.rs` | 8 | AISC Table 3-23, EC3 §7.2, Roark's | L/360, L/180, L/240, ranking |
| `validation_serviceability_checks.rs` | 8 | AISC 360-22 App.L, IBC 2021, EC3 §7, AS 4100 | Floor beam L/360, cantilever L/180, portal drift H/400 |

### Eurocode 8 — EN 1998-1 (26 tests across 4 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_biggs_extended.rs` | 4 | Biggs, Chopra, EC8 Type 1 | Design spectrum, shear building forces, overturning |
| `validation_seismic_design.rs` | 8 | Chopra 5th, EC8, ASCE 7 | Base shear, inverted triangle, effective mass, modal ordering |
| `validation_3d_spectral.rs` | 6 | Chopra 5th, ASCE 7 §12.9, EC8 §4.3.3.3 | 3D RSA, SRSS vs CQC, reduction factor, X vs Y direction |
| `validation_regulatory_features.rs` | 8 | ASCE 7 §12.8.6, EC8 §4.3.3.5 | Inter-story drift, multi-directional 100%+30%, superposition |

### ASCE 7-22 (47 tests across 5 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_drift_verification.rs` | 8 | ASCE 7 §12.8.6, AISC 360 App.7, IBC 2021 | Cantilever/fixed drift, inter-story, H³ dependence |
| `validation_wind_load_analysis.rs` | 8 | ASCE 7 Ch.27, EC1 Part 1-4, Taranath | Base shear, triangular profile, story shear, drift |
| `validation_multi_story_lateral.rs` | 8 | ASCE 7 §12.8.6, AISC 360 App.7, Taranath | Two-story shear, two-bay sharing, soft-story detection |
| `validation_load_combination_envelope.rs` | 8 | ASCE 7-22 Ch.2, AISC 360-22 Ch.B, EC0 | 1.2D+1.6L, Dead+Wind, pattern, factored superposition |
| `validation_combinations.rs` | 8 | EN 1990 §6.4.3.2 | ULS 1.35DL+1.50LL+0.9Wind, negative factor, 3D biaxial |

### AASHTO HL-93 (16 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_moving_loads.rs` | 8 | Kassimali, AASHTO HL-93 | Single axle, 2-axle, HL-93 truck, continuous negative moment |
| `validation_moving_load_bridges.rs` | 7 | AASHTO LRFD 9th, EN 1991-2 LM1/LM2 | Axle spacing, shear envelope, mesh convergence |

### GSA / EN 1991-1-7 / FEMA (12 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_progressive_collapse.rs` | 6 | GSA 2013, EN 1991-1-7, Starossek | Member removal, alternate paths, redundancy |
| `validation_pushover.rs` | 6 | FEMA 356, ATC-40, EC8 Annex B | Pushover curves, P-delta stiffness, near-critical |

---

## Commercial Software Cross-Validation

### ANSYS Verification Manual (33 DONE, 5 CAPABILITY)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_ansys_vm.rs` | 7 | VM1 (3-bar truss), VM2 (overhangs), VM4 (V-truss), VM10 (eccentric), VM12 (3D biaxial) |
| `validation_ansys_vm_extended.rs` | 18 | VM3 (stepped), VM5/6 (thermal), VM7 (gradient), VM8 (truss), VM9 (space truss), VM13 (portal), VM14 (cantilever), VM21 (tie rod), VM156 (P-delta) |
| `validation_ansys_vm_additional.rs` | 8 | VM11 (plate), VM15 (nonlinear), VM16 (Euler), VM17, VM20, VM25 (2-span), VM44 (ring) |

**CAPABILITY** (not yet exact match): VM11 (plate mesh), VM14a (large deflection), VM15 (material nonlinear), VM18 (semicircular arch), VM44 (circular ring).

### SAP2000 / CSI (10 DONE)

**File:** `validation_sap2000.rs`
Simple beam, continuous, portal, 2-story modal, braced+leaning column, end releases, springs, prescribed displacement, P-delta, cantilever stiffness.

### Code_Aster SSLL (9 DONE)

**File:** `validation_code_aster.rs`
SSLL010 (lattice), SSLL012 (bar loads), SSLL014 (portal), SSLL100 (L-frame), SSLL102 (clamped beam), SSLL103 (Euler), SSLL105 (L-structure), SSLL110 (self-weight), SSLL400 (variable section).

### NAFEMS (14 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_nafems.rs` | 6 | FV2 (axial), FV12 (cantilever vibration), FV32 (SS UDL), T3 (thermal), LE5 (Z-section 3D), FV52 (pin-jointed cross) |
| `validation_nafems_extended.rs` | 8 | FV1 (SS center), FV13 (SS vibration), FV31 (cantilever tip), FV51 (portal vibration), LE10 (3D bending+torsion), T1 (thermal gradient), FV41 (lumped mass), R0031 (3D truss) |

### MASTAN2 / Ziemian 22 (20 DONE)

**File:** `validation_mastan2_frames.rs`
**Reference:** Ziemian & Ziemian (2021), *J. Constr. Steel Res.* 186

Simple portals (alpha_cr~3-8), multi-bay (alpha_cr~4-10), multi-story braced (alpha_cr>10), unbraced (alpha_cr~1.5-4). Each frame: alpha_cr from eigenvalue + P-delta drift amplification.

---

## Textbook Classics (~1050 tests)

### Beam Theory (15 files, ~110 tests)
- `validation_beam_formulas.rs` (14) — Timoshenko: SS, cantilever, fixed-fixed, propped cantilever
- `validation_beam_deflections.rs` (8) — Timoshenko & Gere, Gere & Goodno, Beer & Johnston
- `validation_beam_rotation.rs` (8) — End rotation formulas
- `validation_beam_fixed_end_forces.rs` (8) — AISC Table 3-23, Przemieniecki Table 4.3
- `validation_fixed_end_moments.rs` (8) — FEM formulas, carryover factor 0.5
- `validation_elastic_curve.rs` (8) — EI·y''=M(x) governing equation
- `validation_triangular_load.rs` (8) — Hibbeler, Ghali/Neville, Roark
- `validation_propped_cantilever.rs` (8) — Timoshenko & Gere, Roark 8th
- `validation_partial_loads.rs` (8) — Half-span, trapezoidal, convergence
- `validation_roark_formulas.rs` (8) — Roark's Table 8.1 Cases 1a/1e/2a/2e/3a/2c/1c
- `validation_stepped_beam.rs` (8) — Ghali/Neville, Pilkey, Roark
- `validation_nonprismatic_members.rs` (7) — Haunched, tapered, composite
- `validation_shear_deformation.rs` (8) — Timoshenko vs EB comparison
- `validation_span_to_depth_effects.rs` (8) — L/d ratio effects, section efficiency
- `validation_cantilever_variations.rs` (8) — Intermediate load, superposition, stiffness ratio

### Internal Forces (14 files, ~110 tests)
- `validation_internal_forces.rs` (8) — V=qL/2, M=qL²/8
- `validation_shear_force_diagrams.rs` (8) — dV/dx=-q, dM/dx=V
- `validation_moment_gradient.rs` (8) — Constant/linear shear → M shape
- `validation_element_local_forces.rs` (8) — f_local = k_local*T*u_elem - FEF
- `validation_equilibrium_path.rs` (8) — dV/dx=-q(x), dM/dx=V
- `validation_internal_releases.rs` (8) — Midspan hinge, Gerber beam
- `validation_point_on_element.rs` (8) — PointOnElement load type
- `validation_load_types.rs` (8) — Point, partial, trapezoidal, moment, axial
- `validation_point_of_contraflexure.rs` (8) — Fixed-fixed inflection points
- `validation_contraflexure.rs` (8) — Propped cantilever, portal
- `validation_reaction_checks.rs` (8) — SS/cantilever/propped/continuous/portal
- `validation_reaction_patterns.rs` (8) — Determinate, indeterminate, symmetric
- `validation_nodal_equilibrium.rs` (8) — ΣF=0 at every node
- `validation_load_path.rs` (8) — Direct/indirect path, truss flow

### Continuous Beams (4 files, ~30 tests)
- `validation_continuous_beams.rs` (6) — 2-span, 3-span, Ghali/Neville
- `validation_three_moment_equation.rs` (8) — Clapeyron (1857)
- `validation_continuous_patterns.rs` (8) — ACI 318 §6.4, EC2 §5.1.3 checkerboard
- `validation_moment_redistribution.rs` (8) — Cross (1930), adding supports

### Indeterminate Methods (14 files, ~110 tests)
- `validation_slope_deflection.rs` (8) + `validation_slope_deflection_method.rs` (8)
- `validation_moment_distribution.rs` (8) + `validation_hardy_cross.rs` (8)
- `validation_force_method.rs` (8) + `validation_flexibility_method.rs` (8)
- `validation_flexibility_stiffness_duality.rs` (8)
- `validation_matrix_methods.rs` (8) + `validation_matrix_textbooks.rs` (8)
- `validation_matrix_condensation.rs` (8)
- `validation_member_stiffness.rs` (8) + `validation_stiffness_matrix.rs` (8)
- `validation_stiffness_ratio_effects.rs` (8)

### Energy Methods (8 files, ~64 tests)
- `validation_fundamental_theorems.rs` (12) — Maxwell-Betti, Clapeyron, Castigliano
- `validation_energy_methods.rs` (8) — Castigliano (1879), Maxwell (1864), Betti (1872)
- `validation_castigliano.rs` (8) — δ=∂U/∂P
- `validation_reciprocal_theorem.rs` (8) + `validation_reciprocal_theorems.rs` (8)
- `validation_virtual_work.rs` (8) — δ=∫Mm/EI dx
- `validation_unit_load_deflections.rs` (8)
- `validation_superposition.rs` (8)

### Classical Methods (5 files, ~40 tests)
- `validation_conjugate_beam.rs` (8) — Mohr's theorems
- `validation_moment_area.rs` (8) — Mohr's theorems
- `validation_transfer_matrix.rs` (8) — Pestel & Leckie (1963)
- `validation_portal_cantilever_methods.rs` (8)
- `validation_approximate_methods.rs` (8) — Portal/cantilever methods

### Frames (16 files, ~130 tests)
- `validation_frames.rs` (7) — Portal, Gerber, settlement, spring
- `validation_frame_stiffness.rs` (8) — Sway stiffness, load sharing
- `validation_frame_deflection_patterns.rs` (8)
- `validation_frame_joint_rigidity.rs` (8) — Rigid vs hinge
- `validation_gable_frame.rs` (8) — Gable, A-frame, knee braces
- `validation_vierendeel_frame.rs` (8) + `validation_vierendeel_frames.rs` (8)
- `validation_multi_story_frames.rs` (8) + `validation_multi_story_frame.rs` (8)
- `validation_multi_bay_frames.rs` (8)
- `validation_arch_structures.rs` (8) + `validation_arch_action.rs` (8)
- `validation_grillage.rs` (8) — Hambly bridge deck
- `validation_combined_loading.rs` (8)

### Trusses (8 files, ~64 tests)
- `validation_trusses.rs` (6) — Equilateral, Warren, Pratt, indeterminate
- `validation_truss_methods.rs` (8) — Joints, sections, zero-force members
- `validation_truss_method_of_joints.rs` (8)
- `validation_truss_topology.rs` (8) — Warren, Pratt, Howe, K-truss
- `validation_truss_benchmarks.rs` (8) — Thermal, settlement, space truss
- `validation_cable_truss_structures.rs` (8) — V-shape, fan, deep vs shallow
- `validation_cable_truss_tension.rs` (8)
- `validation_3d_truss_structures.rs` (8) — Tetrahedral, tower, bridge

### 3D Analysis (24 files, ~180 tests)
- `validation_3d_analysis.rs` (10) — Biaxial, torsion, space truss, equilibrium
- `validation_3d_beam_bending.rs` (8) + `validation_3d_biaxial_bending.rs` (8)
- `validation_3d_cantilever_benchmarks.rs` (8) + `validation_3d_cantilever_loading.rs` (8)
- `validation_3d_continuous_beam.rs` (8)
- `validation_3d_distributed_loads.rs` (7) + `validation_3d_equilibrium.rs` (8) + `validation_3d_equilibrium_checks.rs` (8)
- `validation_3d_frame_analysis.rs` (8) + `validation_3d_frame_behavior.rs` (8) + `validation_3d_frame_benchmarks.rs` (8) + `validation_3d_frame_stability.rs` (8)
- `validation_3d_grid_structures.rs` (8)
- `validation_3d_moment_distribution.rs` (8) + `validation_3d_moment_relationships.rs` (8)
- `validation_3d_skew_beam.rs` (8)
- `validation_3d_space_truss.rs` (8)
- `validation_3d_supports.rs` (7) + `validation_3d_inclined_supports.rs` (4)
- `validation_3d_torsion_benchmarks.rs` (8) + `validation_3d_torsion_effects.rs` (8)
- `validation_space_frame_geometry.rs` (8)
- `validation_stress_3d.rs` (6)

### Buckling & Stability (16 files, ~130 tests)
- `validation_euler_buckling.rs` (16) — 4 BCs × 4 mesh densities
- `validation_timoshenko_stability.rs` (8)
- `validation_eurocode3_buckling.rs` (6) — alpha_cr
- `validation_aisc_stability.rs` (6) — B1/B2
- `validation_pdelta_stability.rs` (8) + `validation_pdelta_benchmarks.rs` (8)
- `validation_second_order_effects.rs` (8) — AISC 360-22 App.8
- `validation_stability_advanced.rs` (8) — Timoshenko exact, imperfections
- `validation_geometric_stiffness.rs` (8)
- `validation_mastan2_frames.rs` (20) — Ziemian 22 benchmark frames
- `validation_column_buckling_modes.rs` (8)
- `validation_effective_length.rs` (8) + `validation_notional_loads.rs` (8)
- `validation_3d_buckling.rs` (7) + `validation_3d_pdelta.rs` (7)
- `validation_beam_column_interaction.rs` (8)

### Dynamic Analysis (14 files, ~100 tests)
- `validation_modal_frequencies.rs` (16) — 4 BCs × (exact + convergence + higher + 3D)
- `validation_damping_frequency.rs` (8) — Chopra, Clough & Penzien
- `validation_modal_properties.rs` (8) — Orthogonality, Rayleigh, effective mass
- `validation_time_history.rs` (4) — Newmark, HHT
- `validation_chopra_dynamics.rs` (6) — SDOF, step load, Rayleigh damping
- `validation_dynamic_mdof.rs` (6) — 2-story, ground motion, base shear
- `validation_dynamic_advanced.rs` (8) — Impulse, resonance, DAF
- `validation_spectral_response.rs` (8) — SRSS vs CQC, importance, reduction
- `validation_rsa_crosscheck.rs` (4) — RSA vs time-history
- `validation_3d_spectral.rs` (6) + `validation_3d_modal_dynamic.rs` (8)
- `validation_seismic_design.rs` (8)
- `validation_biggs_extended.rs` (4)

### Plastic & Nonlinear (9 files, ~55 tests)
- `validation_plastic_collapse.rs` (8) — Neal: exact collapse loads
- `validation_plastic_mechanisms.rs` (8) — Mechanism types, EN 1993-1-1 §5.6
- `validation_plastic_hinge_sequence.rs` (8)
- `validation_material_nonlinear.rs` (3) + `validation_material_nonlinear_benchmarks.rs` (8)
- `validation_pushover.rs` (6) — FEMA 356, ATC-40
- `validation_corotational.rs` (4) + `validation_corotational_benchmarks.rs` (5) + `validation_advanced_corotational.rs` (4)

### Thermal, Settlement, Springs, Foundation (9 files, ~68 tests)
- `validation_thermal_settlement.rs` (10) + `validation_thermal_effects.rs` (8)
- `validation_prescribed_displacements.rs` (8) + `validation_prescribed_settlement.rs` (8)
- `validation_settlement_effects.rs` (8) + `validation_support_settlement_effects.rs` (8)
- `validation_spring_supports.rs` (8)
- `validation_winkler_foundation.rs` (4) + `validation_foundation_interaction.rs` (8)

### Influence Lines & Moving Loads (4 files, ~32 tests)
- `validation_influence_lines.rs` (8) + `validation_muller_breslau.rs` (8)
- `validation_moving_loads.rs` (8) + `validation_moving_load_bridges.rs` (7)

### Stress Analysis (2 files, ~16 tests)
- `validation_section_stress.rs` (8) — Navier, Jourawski, Mohr, Von Mises, Tresca
- `validation_stress_3d.rs` (6) — 3D Navier, biaxial, torsion, Von Mises

### Other Specialized (misc files)
- `validation_curved_beams.rs` (5) — Quarter-circle, Roark ring, parabolic arch
- `validation_plates.rs` (4) + `validation_scordelis_lo.rs` (3) + `validation_pressure_loads.rs` (4)
- `validation_guided_y.rs` (3) — GuidedY support type
- `validation_kinematic.rs` (6) + `validation_3d_kinematic.rs` (7) — Mechanism detection
- `validation_rigid_body_modes.rs` (8) — Insufficient restraints
- `validation_composite_action.rs` (8) + `validation_composite_structures.rs` (8) + `validation_semirigid_connections.rs` (8)
- `validation_combined_loading.rs` (8) + `validation_load_combination_effects.rs` (8)
- `validation_deformation_compatibility.rs` (8) + `validation_symmetry_antisymmetry.rs` (8)
- `validation_indeterminacy_effects.rs` (8)
- `validation_relative_displacement.rs` (8)
- `validation_hibbeler_problems.rs` (8)
- `validation_progressive_collapse.rs` (6)

---

## Fixed Bugs (6 regression tests)

**File:** `validation_3d_bugs.rs` — All bugs fixed, tests now pass without `#[ignore]`.

| # | Bug (Fixed) | Tests | Fix |
|---|-------------|-------|-----|
| 1 | 3D thermal loads dropped in assembly.rs | 2 | Added `SolverLoad3D::Thermal` match arm in all 3 assembly functions |
| 2 | 3D partial distributed loads ignore a/b | 2 | Added `fef_partial_distributed_3d()` and conditional dispatch |
| 3 | Plate mass not assembled in mass_matrix.rs | 2 | Added plate mass loop + rotational inertia in `plate_consistent_mass` |

## Incomplete Features (3 placeholder tests)

**File:** `validation_warping_torsion.rs`

| # | Feature | Status |
|---|---------|--------|
| 1 | Warping torsion cantilever (I-section) | 14x14 math exists, assembly not wired |
| 2 | Z-section torsion | Same |
| 3 | Mixed warping + non-warping model | Same |

## CAPABILITY Items (5 tests)

| Benchmark | File | What's Needed |
|-----------|------|---------------|
| VM11 SS plate | `validation_plates.rs` | Refine mesh to 8x8+, tight tolerance |
| VM14a large deflection | `validation_corotational.rs` | Match Mattiasson elastica reference |
| VM15 material nonlinear | `validation_material_nonlinear.rs` | Match exact VM15 problem |
| VM18 semicircular arch | `validation_curved_beams.rs` | Tight tolerance on delta_B |
| VM44 circular ring | `validation_curved_beams.rs` | Model full ring geometry |

---

## Roadmap Gaps

These are the largest gaps between the current engine and a top-tier structural solver. This section is split on purpose:

- `Solver-core gaps` are mechanics/formulation work that directly determine solver class.
- `Engineering/design gaps` are valuable, but they should not be confused with solver-core parity.

### Solver-Core Gaps

| Topic | Difficulty | Current State | Why It Matters |
|-------|-----------|---------------|----------------|
| Warping torsion (7th DOF) completion | Medium | Partial | Needed for thin-walled open sections and serious torsion claims |
| Cable / catenary elements | Medium | Good | Implemented, but needs broader benchmark maturity and specialized behavior depth |
| 3D geometric nonlinear (corotational) | Hard | Good | Implemented, but needs stronger controls and benchmark breadth |
| 3D material nonlinear | Hard | Partial | Implemented, but still early relative to top-tier inelastic solvers |
| Prestress / post-tension FE behavior | Hard | Partial | 2D prestress/staged support exists, but not full PT solver depth |
| Construction staging | Hard | Partial | 2D and 3D implementations exist; broader workflow depth and prestress/time-dependent coupling remain open |
| Creep & shrinkage response | Hard | Gap | Essential for long-term concrete/PT behavior |
| Plate / shell advanced elements and load vectors | Hard | Good | Needed to move shells from "works" to "top-tier" |
| Fiber-based plasticity / section-level nonlinear response | Hard | Gap | Needed for advanced nonlinear building analysis |
| Nonlinear solution controls (arc-length, displacement control, stronger line search) | Hard | Partial | Required for robust post-buckling and difficult equilibrium paths |

### Engineering / Design Coverage and Gaps

These are important to structural engineering practice, but they are not the same as solver-core parity.

#### Current Implemented Coverage

| Topic | Current State | Evidence in Code / Tests | Remaining Gap |
|-------|---------------|--------------------------|---------------|
| Steel member checks | Good | `postprocess/steel_check.rs`, `integration_steel_check.rs`, `validation_cross_section_classification.rs` | Broader design-code depth and more connection/joint coupling |
| RC member checks | Good | `postprocess/rc_check.rs`, `integration_rc_check.rs`, `validation_reinforced_concrete_design.rs` | Cracked-section depth, detailing breadth, and time-dependent coupling |
| EC2 concrete checks | Good | `postprocess/ec2_check.rs`, `integration_ec2_check.rs`, `validation_concrete_design.rs`, `validation_concrete_detailing.rs` | Broader detailing, crack-control, and lifecycle coupling |
| CIRSOC 201 concrete checks | Good | `postprocess/cirsoc201_check.rs`, `integration_cirsoc201_check.rs`, `validation_concrete_design.rs` | Broader code breadth and workflow integration |
| EC3 steel checks | Good | `postprocess/ec3_check.rs`, `integration_ec3_check.rs`, `validation_eurocode3_buckling.rs`, `validation_cross_section_classification.rs` | Broader clause coverage and more design workflows |
| Timber design checks | Good | `postprocess/timber_check.rs`, `integration_timber_check.rs`, `validation_timber_design.rs`, `validation_timber_connections.rs` | Broader species/detailing/connectors coverage |
| Serviceability checks | Good | `postprocess/serviceability.rs`, `integration_serviceability.rs`, `validation_serviceability_checks.rs`, `validation_serviceability_vibration.rs` | Broader office workflows and more building-level checks |
| Connection checks | Good | `postprocess/connection_check.rs`, `integration_connection_check.rs`, `validation_connection_design.rs`, `validation_connection_mechanics.rs` | Broader joint families and detailing depth |
| Foundation checks | Good | `postprocess/foundation_check.rs`, `integration_foundation_check.rs`, `validation_foundation_design.rs`, `validation_foundation_interaction.rs` | Deeper SSI coupling and broader footing/pile workflows |
| Cold-formed steel checks | Good | `postprocess/cfs_check.rs`, `integration_cfs_check.rs`, `validation_cold_formed_steel.rs` | Broader AISI/EC3-1-3 clause coverage |
| Masonry checks | Good | `postprocess/masonry_check.rs`, `integration_masonry_check.rs`, `validation_masonry_design.rs`, `validation_masonry_arches.rs` | Broader masonry design workflows and code breadth |

#### Remaining Gaps — Can Test with Existing Solver

| Topic | Difficulty | Impact | Reference Codes |
|-------|-----------|--------|-----------------|
| Lateral-torsional buckling (LTB) | Medium | Steel beam design | EN 1993-1-1 §6.3.2, AISC 360-22 Ch.F |
| CIRSOC 102 wind loading | Medium | Argentine wind design | CIRSOC 102-2005, CIRSOC 102-2018 |
| Fatigue / S-N curves / Miner's rule | Medium | Steel bridges, connections | EC3-1-9, AISC 360-22 App.3, AASHTO |
| Seismic detailing | Medium | Ductile design | ACI 318-19 Ch.18, EC8-1 §5, CIRSOC 103 |
| Progressive collapse — full analysis | Medium | Robustness | GSA 2016, DoD UFC 4-023-03, EN 1991-1-7 |

#### Remaining Gaps — Needs New Solver Features

| Topic | Difficulty | Impact | Reference Codes |
|-------|-----------|--------|-----------------|
| RC design — reinforcement & crack control | Hard | Concrete structures | ACI 318-19 §24, EC2 §7.3, CIRSOC 201 |
| Composite sections (steel-concrete) | Hard | Composite construction | AISC 360-22 Ch.I, EC4, CIRSOC 301+201 |
| Fire resistance | Hard | Temperature-dependent properties | EC2-1-2, EC3-1-2, CIRSOC fire annex |
| Soil-structure interaction (p-y curves) | Medium | Foundation analysis | API RP 2A, AASHTO, EC7 |
| Dynamic wind / buffeting / vortex shedding | Hard | Tall buildings, bridges | CIRSOC 102, EC1-1-4, ASCE 7 Ch.26 |
| Nonlinear material — concrete damage | Hard | Concrete cracking | Mazars, CDP, EC2 |
| Nonlinear material — steel hardening | Medium | Ductile analysis | EC3-1-5 Annex C |
