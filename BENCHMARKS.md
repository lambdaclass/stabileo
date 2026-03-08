# Benchmark Validation Test Tracking

> Master list of all industry-standard benchmarks and validation tests.
> Status: DONE = reproduces published benchmark with tight tolerance (<5%),
> CAPABILITY = solver feature exists with smoke/capability tests but benchmark not yet reproduced exactly,
> BLOCKED = needs new solver features.

---

## Summary

| Category | Done | Capability | Blocked | Total |
|----------|------|------------|---------|-------|
| Industry Standards & Design Codes | 345 | 0 | 0 | 345 |
| Commercial Software Cross-Validation | 172 | 0 | 1 | 173 |
| Textbook Classics | 1688 | 0 | 0 | 1688 |
| Mathematical Properties & Numerical Methods | 179 | 0 | 0 | 179 |
| FEM Quality & Convergence | 54 | 0 | 0 | 54 |
| Engineering Practice & Specialized Structures | 616 | 0 | 0 | 616 |
| Fixed Bugs (regression) | 6 | 0 | 0 | 6 |
| Placeholders | 0 | 3 | 0 | 3 |
| **Total** | **3060** | **3** | **1** | **3064** |

The table above is the curated benchmark-status ledger. It is narrower than the full automated test inventory shown below, because many validation/unit/integration tests are support checks, regression tests, or formula verifications rather than one benchmark row per test.

**3121 validation test functions across 395 validation files. 3566 total registered tests across 451 Rust test files.**

Current measured inventory:

- `395` files matching `engine/tests/validation_*.rs`
- `3121` `#[test]` functions inside validation files
- `25` files matching `engine/tests/integration_*.rs` (181 integration test functions)
- `3566` total registered tests from `cargo test -- --list`

### Design Check Modules (17 postprocess modules, 82 unit tests + 25 integration test files)

| Module | Code | Tests | Description |
|--------|------|-------|-------------|
| `steel_check` | AISC 360-22 LRFD | 8 integration | Flexure (compact/LTB), shear, axial, combined H1-1 interaction |
| `rc_check` | ACI 318-19 USD | 8 integration | Rectangular/T-beam flexure, singly/doubly reinforced, shear |
| `ec2_check` | EN 1992-1-1 | 8 integration | Parabolic stress block, variable-strut shear, alpha_cc NA support |
| `cirsoc201_check` | CIRSOC 201-05 | 8 integration | Whitney block, ACI-style shear, phi transition zone |
| `ec3_check` | EN 1993-1-1 | 8 integration | Buckling curves a-d, LTB, shear, combined interaction |
| `timber_check` | NDS 2018 | 8 integration | Bending (CL/CV), compression (Cp), shear, combined |
| `cfs_check` | AISI S100 | 8 integration | Compression (local/distortional/global), LTB, shear |
| `masonry_check` | TMS 402 | 8 integration | Axial with slenderness, flexure, shear, combined interaction |
| `connection_check` | AISC 360 | 8 integration | Bolt-group and weld-group elastic method checks |
| `foundation_check` | ACI 318 | 8 integration | Spread footings: bearing, overturning, sliding, punching shear |
| `serviceability` | Multi-code | 8 integration | L/360, L/180, natural frequency, IBC/EC3/AS 4100 |
| `diagrams` | — | unit tests | Shear, moment, axial, deflection diagrams (2D) |
| `diagrams_3d` | — | unit tests | 3D element force diagrams |
| `combinations` | ASCE 7, EN 1990 | unit tests | Load combinations and envelopes |
| `influence` | — | unit tests | Influence lines and coefficients |
| `section_stress` | — | unit tests | Normal, shear, von Mises, Mohr stress |
| `section_stress_3d` | — | unit tests | 3D section stress recovery |

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

### AISC 360-22 (46 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_aisc_stability.rs` | 6 | AISC 360-22 Commentary Cases 1 & 2 | B1 braced, B2 sway amplification, convergence, equilibrium |
| `validation_effective_length.rs` | 8 | AISC Manual Commentary C2 | K=1.0/0.5/0.7/2.0, braced vs unbraced, stiffness ranking |
| `validation_frame_classification.rs` | 8 | AISC 360-22 Ch.C, EN 1993-1-1 §5.2 | Sway/non-sway, braced/unbraced, fixed vs pinned base |
| `validation_notional_loads.rs` | 8 | AISC 360-22 §C2, EC3 §5.3, CSA S16 §8.4 | Notional 0.2-0.5% gravity, proportionality, multi-story |
| `validation_braced_frame.rs` | 8 | AISC 360-16 Ch.C, McCormac 6th | X-brace, K-brace, chevron, diagonal force=H/cos(θ) |
| `validation_braced_frames.rs` | 8 | AISC 360-16 Ch.C, Salmon/Johnson 5th | Stiffness increase, sway reduction, multi-story drift |

### AISC 360 — Steel Design (40 tests across 5 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_lateral_torsional_buckling.rs` | 8 | EN 1993-1-1 §6.3.2, AISC 360-22 Ch.F | SS uniform moment, fixed-fixed, cantilever, length effects |
| `validation_structural_steel_design.rs` | 8 | AISC 360-22 | Compact flexure, LTB, shear capacity, web crippling |
| `validation_steel_connections.rs` | 8 | AISC 360-22 Ch.J | Bolt shear/bearing, eccentricity, weld strength, base plate |
| `validation_plate_girder_design.rs` | 8 | AISC 360-22 Ch.G | Web shear buckling, tension field, stiffeners, flange local buckling |
| `validation_steel_deck_design.rs` | 8 | AISC 360/SDI | Section properties, composite moment, diaphragm shear, ponding |

### AISC 360 — Connections & Composite (16 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_connection_design.rs` | 8 | AISC 360-22 Ch.J | Bolt/weld groups, prying, base plates, moment connections |
| `validation_composite_design.rs` | 8 | AISC 360-22 Ch.I, EC4 | Full/partial composite interaction, effective slab width |

### Eurocode 3 — EN 1993-1-1 (44 tests across 5 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_eurocode3_buckling.rs` | 6 | EN 1993-1-1 §5.2.1 | alpha_cr vs Horne, fixed vs pinned base, multi-story, braced |
| `validation_code_provisions.rs` | 7 | EN 1993-1-1 §5.2, EN 1998-1 §4.3.3.3, ASCE 7 §12.9 | alpha_cr thresholds, P-delta amplification, mass participation |
| `validation_deflection_limits.rs` | 8 | AISC Table 3-23, EC3 §7.2, Roark's | L/360, L/180, L/240, ranking |
| `validation_serviceability_checks.rs` | 8 | AISC 360-22 App.L, IBC 2021, EC3 §7, AS 4100 | Floor beam L/360, cantilever L/180, portal drift H/400 |
| `validation_cross_section_classification.rs` | 8 | EN 1993-1-1 Table 5.2, AISC 360-22 Table B4.1b | Class 1-4, compact/noncompact/slender |
| `validation_stainless_steel.rs` | 8 | EN 1993-1-4 | Ramberg-Osgood, property comparison, CSM capacity |

### Eurocode 8 — EN 1998-1 (42 tests across 5 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_biggs_extended.rs` | 4 | Biggs, Chopra, EC8 Type 1 | Design spectrum, shear building forces, overturning |
| `validation_seismic_design.rs` | 8 | Chopra 5th, EC8, ASCE 7 | Base shear, inverted triangle, effective mass, modal ordering |
| `validation_3d_spectral.rs` | 6 | Chopra 5th, ASCE 7 §12.9, EC8 §4.3.3.3 | 3D RSA, SRSS vs CQC, reduction factor, X vs Y direction |
| `validation_regulatory_features.rs` | 8 | ASCE 7 §12.8.6, EC8 §4.3.3.5 | Inter-story drift, multi-directional 100%+30%, superposition |
| `validation_seismic_detailing.rs` | 8 | ACI 318-19 Ch.18, EC8-1 §5 | Strong-column weak-beam, capacity design, confinement, behavior factor |
| `validation_seismic_isolation.rs` | 8 | ASCE 7 Ch.17, EC8 §10 | LRB bilinear, FPS bearing, HDR bearing, design displacement |

### ASCE 7-22 (71 tests across 8 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_drift_verification.rs` | 8 | ASCE 7 §12.8.6, AISC 360 App.7, IBC 2021 | Cantilever/fixed drift, inter-story, H³ dependence |
| `validation_wind_load_analysis.rs` | 8 | ASCE 7 Ch.27, EC1 Part 1-4, Taranath | Base shear, triangular profile, story shear, drift |
| `validation_multi_story_lateral.rs` | 8 | ASCE 7 §12.8.6, AISC 360 App.7, Taranath | Two-story shear, two-bay sharing, soft-story detection |
| `validation_load_combination_envelope.rs` | 8 | ASCE 7-22 Ch.2, AISC 360-22 Ch.B, EC0 | 1.2D+1.6L, Dead+Wind, pattern, factored superposition |
| `validation_combinations.rs` | 8 | EN 1990 §6.4.3.2 | ULS 1.35DL+1.50LL+0.9Wind, negative factor, 3D biaxial |
| `validation_seismic_design_asce7.rs` | 8 | ASCE 7-22 §12.8 | ELF method, vertical distribution, story drift, P-delta stability |
| `validation_wind_loading.rs` | 8 | ASCE 7-22 Ch.26 | Velocity pressure qz, Kz, gust effect factor, MWFRS |
| `validation_wind_engineering.rs` | 8 | EC1-1-4, ASCE 7 | Basic pressure, terrain roughness, along-wind gust, Strouhal |

### AASHTO HL-93 & Bridge Codes (48 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_moving_loads.rs` | 8 | Kassimali, AASHTO HL-93 | Single axle, 2-axle, HL-93 truck, continuous negative moment |
| `validation_moving_load_bridges.rs` | 7 | AASHTO LRFD 9th, EN 1991-2 LM1/LM2 | Axle spacing, shear envelope, mesh convergence |
| `validation_bridge_design.rs` | 8 | AASHTO LRFD, EN 1991-2 | HL-93, LM1, distribution factors, load combinations |
| `validation_bridge_engineering.rs` | 8 | AASHTO LRFD | Distribution factors, dynamic allowance, composite width, overhang |
| `validation_highway_bridge_loading.rs` | 8 | AASHTO HL-93, EC1 LM1/LM2 | Truck+lane, tandem+UDL, fatigue truck, multi-lane reduction |
| `validation_bridge_loads.rs` | 8 | AASHTO HL-93 | Truck, lane load, tandem, impact factor |

### GSA / UFC / FEMA / EN 1991-1-7 (28 tests across 4 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_progressive_collapse.rs` | 6 | GSA 2013, EN 1991-1-7, Starossek | Member removal, alternate paths, redundancy |
| `validation_progressive_collapse_full.rs` | 8 | UFC 4-023-03, EN 1991-1-7, GSA 2016 | Corner column removal, tie force, accidental combination, DCR |
| `validation_pushover.rs` | 6 | FEMA 356, ATC-40, EC8 Annex B | Pushover curves, P-delta stiffness, near-critical |
| `validation_performance_based_design.rs` | 8 | FEMA P-58, ASCE 41 | PBEE hazard curve, fragility function, acceptance criteria, EAL |

### ACI 318-19 / Concrete Design Codes (48 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_concrete_design.rs` | 8 | ACI 318-19, EC2 | Whitney block, parabolic-rectangular, beam design |
| `validation_reinforced_concrete_design.rs` | 8 | ACI 318-19 | Singly/doubly reinforced, T-beam, shear |
| `validation_concrete_detailing.rs` | 8 | ACI 318-19 | Development length, bar spacing, cover, crack width |
| `validation_reinforcement_detailing.rs` | 8 | ACI 318-19 §25 | Development length, lap splice, hook, bar spacing/cover |
| `validation_advanced_concrete.rs` | 8 | ACI 318-19, EC2 | Strut-and-tie, deep beam shear, torsion, PT load balancing |
| `validation_concrete_mechanics.rs` | 8 | ACI 318-19, EC2 | Whitney depth, nominal moment, balanced rho, dev. length |

### EN 1992-1-1 / Concrete Material (16 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_concrete_constitutive_models.rs` | 8 | EC2, Hognestad, Mander | Hognestad parabolic, Mander confined, Popovics, tension stiffening |
| `validation_concrete_durability.rs` | 8 | EC2, ACI 318 | Cover requirements, carbonation, chloride, freeze-thaw |

### CIRSOC 102 (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_cirsoc_wind.rs` | 8 | CIRSOC 102-2005 | Velocity pressure, exposure coefficients, design pressure |

### EN 1991-2 / Railway (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_railway_structures.rs` | 8 | EN 1991-2 LM71 | LM71 loading, dynamic amplification, track-bridge, braking |

### EC3-1-9 / Fatigue (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_fatigue.rs` | 8 | EC3-1-9, Miner | Detail category C71, CAFL, cutoff limit, Miner's rule |

### EC2-1-2 / EC3-1-2 / Fire Resistance (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_fire_resistance.rs` | 8 | EC2-1-2, EC3-1-2, ISO 834 | Fire curve, steel ky/ke reduction, beam fire capacity |

### NDS 2018 / Timber (24 tests across 3 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_timber_design.rs` | 8 | NDS 2018 | Bending, compression, tension, combined, adjustment factors |
| `validation_timber_connections.rs` | 8 | NDS 2018 | Dowel-type, withdrawal, group action, geometry factors |
| `validation_wood_design.rs` | 8 | NDS 2018 | Size factor, column stability, bearing, notched beam shear |

### AISI S100 / Cold-Formed Steel (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_cold_formed_steel.rs` | 8 | AISI S100-16 | Effective width, distortional, DSM, connection design |

### Aluminum Design (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_aluminum_design.rs` | 8 | AA ADM 2020, EC9 | 6061-T6, column buckling, HAZ reduction, beam LTB |

### TMS 402 / Masonry (16 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_masonry_design.rs` | 8 | TMS 402/ACI 530 | Axial, flexure, shear, interaction, slenderness |
| `validation_masonry_arches.rs` | 8 | TMS 402, Heyman | Arch thrust line, stability, MEXE method |

### Foundation & Geotechnical Codes (48 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_foundation_design.rs` | 8 | ACI 318-19, Meyerhof | Spread footings, combined footings, mat foundations |
| `validation_geotechnical_bearing_capacity.rs` | 8 | Meyerhof, Hansen, Vesic | Bearing capacity factors, correction factors, net allowable |
| `validation_geotechnical_engineering.rs` | 8 | Terzaghi, Meyerhof, Rankine | General bearing capacity, earth pressure coefficients |
| `validation_pile_foundations.rs` | 8 | EC7, API RP 2A | Alpha-method, beta-method, group efficiency, design resistance |
| `validation_retaining_walls.rs` | 8 | Rankine, Coulomb | Active/passive pressure, overturning stability |
| `validation_geotechnical_slopes.rs` | 8 | Fellenius, Bishop, Janbu | Infinite slope, Fellenius, Bishop simplified |

### Prestress & Post-Tension Codes (24 tests across 3 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_prestressed_concrete.rs` | 8 | ACI 318, AASHTO | Elastic shortening loss, long-term losses, flexural capacity |
| `validation_prestress_losses.rs` | 8 | ACI 318, PCI | Elastic shortening, friction, anchorage-set, creep losses |
| `validation_post_tensioning.rs` | 8 | ACI 318, PTI | Elastic shortening, friction loss, anchorage-set, long-term |

### Creep & Shrinkage Codes (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_creep_shrinkage.rs` | 8 | EC2, ACI 209 | EC2 creep coefficient, drying/autogenous shrinkage, effective modulus |

### Dynamic Wind Codes (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_dynamic_wind.rs` | 8 | EC1-1-4, ASCE 7 | Vortex shedding Strouhal, scruton number, gust factor, along-wind |

### FRP / Composites (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_frp_composites.rs` | 8 | ACI 440, EC2 | FRP properties, laminate stiffness, FRP-RC flexure, strengthening |

### Precast Concrete (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_precast_concrete.rs` | 8 | PCI, ACI 318 | Hollow-core flexure, double-tee composite, corbel, bearing pad |

---

## Commercial Software Cross-Validation

### ANSYS Verification Manual (46 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_ansys_vm.rs` | 7 | VM1 (3-bar truss), VM2 (overhangs), VM4 (V-truss), VM10 (eccentric), VM12 (3D biaxial) |
| `validation_ansys_vm_extended.rs` | 18 | VM3 (stepped), VM5/6 (thermal), VM7 (gradient), VM8 (truss), VM9 (space truss), VM13 (portal), VM14 (cantilever), VM21 (tie rod), VM156 (P-delta) |
| `validation_ansys_vm_additional.rs` | 8 | VM11 (plate), VM15 (nonlinear), VM16 (Euler), VM17, VM20, VM25 (2-span), VM44 (ring) |
| `validation_ansys_vm_benchmarks.rs` | 8 | VM22 (axial+bending cantilever), VM23 (Winkler), VM26 (2-span partial UDL), VM27 (thermal gradient), VM30 (3D space truss), VM33 (3-bar truss), VM34 (thermal 2-bar), VM40 (large deflection) |
| `validation_capability_upgrades.rs` | 5 | VM11 (cantilever triangular load <2%), VM14a (Mattiasson elastica corotational <10%), VM15 (plastic collapse Pc=8Mp/L), VM18 (quarter-circle 32 segments <5%), VM44 (Roark ring 64 segments <5%) |

### SAP2000 / CSI (18 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_sap2000.rs` | 10 | Simple beam, continuous, portal, 2-story modal, braced+leaning column, end releases, springs, prescribed displacement, P-delta, cantilever stiffness |
| `validation_sap2000_extended.rs` | 8 | Three-span continuous UDL, two-story two-bay frame, Warren truss, Gerber beam with hinge, 3D L-frame torsion, 3-story shear building modal, P-delta amplified portal, beam with settlement |

### Code_Aster SSLL (17 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_code_aster.rs` | 9 | SSLL010 (lattice), SSLL012 (bar loads), SSLL014 (portal), SSLL100 (L-frame), SSLL102 (clamped beam), SSLL103 (Euler), SSLL105 (L-structure), SSLL110 (self-weight), SSLL400 (variable section) |
| `validation_code_aster_extended.rs` | 8 | SSLL101 (clamped-pinned UDL), SSLL104 (SS point load at L/3), SSLL106 (3-span continuous UDL), SSLL107 (propped cantilever midspan), SSLL108 (portal combined), SSLL111 (thermal 2-bar), SSLL112 (spring support), SSLL113 (fixed-fixed partial UDL) |

### NAFEMS (22 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_nafems.rs` | 6 | FV2 (axial), FV12 (cantilever vibration), FV32 (SS UDL), T3 (thermal), LE5 (Z-section 3D), FV52 (pin-jointed cross) |
| `validation_nafems_extended.rs` | 8 | FV1 (SS center), FV13 (SS vibration), FV31 (cantilever tip), FV51 (portal vibration), LE10 (3D bending+torsion), T1 (thermal gradient), FV41 (lumped mass), R0031 (3D truss) |
| `validation_nafems_benchmarks.rs` | 8 | LE1 (load distribution), FV22 (cantilever ~1.03 Hz), FV42 (SS beam 3 modes), FV72 (free-free beam), T2 (thermal expansion), R0001 (SS beam UDL), R0015 (3-bar truss), R0024 (portal lateral) |

### MASTAN2 / Ziemian 22 (42 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_mastan2_frames.rs` | 20 | Simple portals (alpha_cr~3-8), multi-bay (alpha_cr~4-10), multi-story braced (alpha_cr>10), unbraced (alpha_cr~1.5-4). Each frame: alpha_cr from eigenvalue + P-delta drift amplification |
| `validation_mastan2_extended.rs` | 22 | 8 Ziemian-style benchmark frames (E1-E8): leaning column, unequal story heights, fixed vs pinned base, three-bay unequal widths, unequal column stiffness, X-braced, diagonal brace, three-story sway + 4 batch tests |

**Reference:** Ziemian & Ziemian (2021), *J. Constr. Steel Res.* 186

### OpenSees Cross-Check (8 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_opensees_crosscheck.rs` | 8 | SS beam point load, portal frame lateral, 3-bar truss, cantilever tip load, 2-span continuous, 2-story frame, 3D space truss, P-delta column |

### Robot Structural Cross-Check (8 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_robot_structural.rs` | 8 | SS beam midspan, fixed-fixed UDL, propped cantilever, 2-bay portal, 3-span continuous, braced frame diagonal, 3D cantilever biaxial, Warren truss bridge |

### STAAD.Pro Cross-Check (8 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_staad_pro.rs` | 8 | V1 cantilever, V2 SS UDL, V3 continuous beam, V4 plane truss, V5 space truss, V6 portal sway, V7 Gerber hinge, V8 spring support |

### Strand7 / LUSAS Cross-Check (8 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_strand7_lusas.rs` | 8 | BM1-4 (Strand7): SS beam, cantilever UDL, fixed-fixed thermal, Pratt truss. BM1-4 (LUSAS): 2-story lateral, settlement, 3D torsion, Euler buckling |

---

## Textbook Classics (~1688 tests)

### Beam Theory (18 files, ~134 tests)
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
- `validation_beam_on_three_supports.rs` (8) — Propped beam, 2-span reactions, interior-support moment
- `validation_overhanging_beam.rs` (8) — Tip load/UDL reactions, uplift detection
- `validation_rotation_slope_verification.rs` (8) — Analytic end-slope cross-checks

### Internal Forces (20 files, ~158 tests)
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
- `validation_axial_force_effects.rs` (8) — Pure tension/compression, proportionality
- `validation_distributed_load_patterns.rs` (8) — UDL, triangular, reversed, partial
- `validation_force_displacement.rs` (8) — Linear proportionality, doubling checks
- `validation_force_equilibrium_detailed.rs` (8) — Global ΣFv and ΣM verification
- `validation_joint_equilibrium_checks.rs` (8) — Per-node equilibrium
- `validation_load_reversal_symmetry.rs` (8) — Reversed load reverses response

### Continuous Beams (6 files, ~46 tests)
- `validation_continuous_beams.rs` (6) — 2-span, 3-span, Ghali/Neville
- `validation_three_moment_equation.rs` (8) — Clapeyron (1857)
- `validation_continuous_patterns.rs` (8) — ACI 318 §6.4, EC2 §5.1.3 checkerboard
- `validation_moment_redistribution.rs` (8) — Cross (1930), adding supports
- `validation_continuous_beam_analysis.rs` (8) — 3/4-span interior moments, reactions, symmetry
- `validation_continuous_beam_patterns.rs` (8) — Checkerboard patterns, moment envelope effects

### Indeterminate Methods (20 files, ~157 tests)
- `validation_slope_deflection.rs` (8) + `validation_slope_deflection_method.rs` (8)
- `validation_moment_distribution.rs` (8) + `validation_hardy_cross.rs` (8)
- `validation_force_method.rs` (8) + `validation_flexibility_method.rs` (8)
- `validation_flexibility_stiffness_duality.rs` (8)
- `validation_matrix_methods.rs` (8) + `validation_matrix_textbooks.rs` (8)
- `validation_matrix_condensation.rs` (8)
- `validation_member_stiffness.rs` (8) + `validation_stiffness_matrix.rs` (8)
- `validation_stiffness_ratio_effects.rs` (8)
- `validation_carry_over_factors.rs` (8) — CO=0.5, distribution factors, 4EI vs 3EI
- `validation_determinate_vs_indeterminate.rs` (8) — EI-independent vs EI-dependent reactions
- `validation_matrix_fundamentals.rs` (8) — 2×2 truss, beam condensation, transformation
- `validation_matrix_structural_analysis.rs` (8) — Axial/beam element stiffness, assembly
- `validation_stiffness_matrix_properties.rs` (8) — Symmetry, positive work, superposition
- `validation_kassimali_extended.rs` (6) — Propped cantilever, fixed partial UDL, continuous

### Energy Methods (8 files, ~68 tests)
- `validation_fundamental_theorems.rs` (12) — Maxwell-Betti, Clapeyron, Castigliano
- `validation_energy_methods.rs` (8) — Castigliano (1879), Maxwell (1864), Betti (1872)
- `validation_castigliano.rs` (8) — δ=∂U/∂P
- `validation_reciprocal_theorem.rs` (8) + `validation_reciprocal_theorems.rs` (8)
- `validation_virtual_work.rs` (8) — δ=∫Mm/EI dx
- `validation_unit_load_deflections.rs` (8)
- `validation_superposition.rs` (8)

### Classical Methods (7 files, ~56 tests)
- `validation_conjugate_beam.rs` (8) — Mohr's theorems
- `validation_moment_area.rs` (8) — Mohr's theorems
- `validation_transfer_matrix.rs` (8) — Pestel & Leckie (1963)
- `validation_portal_cantilever_methods.rs` (8)
- `validation_approximate_methods.rs` (8) — Portal/cantilever methods
- `validation_approximate_analysis.rs` (8) — wL²/8, wL²/12 approximations
- `validation_portal_method_analysis.rs` (8) — Column shear, interior double shear, inflection

### Frames (22 files, ~178 tests)
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
- `validation_frame_behavior_classes.rs` (8) — Braced vs unbraced sway, symmetric gravity
- `validation_frame_drift_limits.rs` (8) — Drift proportionality, story drift
- `validation_gerber_beam.rs` (8) — Gerber/hinge beam, moment=0 at hinge
- `validation_moment_connection.rs` (8) — Rigid vs pinned sway, joint equilibrium
- `validation_sway_frames.rs` (8) — Portal stiffness, antisymmetric moments
- `validation_multi_story_behavior.rs` (8) — Two-story lateral, shear distribution

### Trusses (9 files, ~72 tests)
- `validation_trusses.rs` (6) — Equilateral, Warren, Pratt, indeterminate
- `validation_truss_methods.rs` (8) — Joints, sections, zero-force members
- `validation_truss_method_of_joints.rs` (8)
- `validation_truss_topology.rs` (8) — Warren, Pratt, Howe, K-truss
- `validation_truss_benchmarks.rs` (8) — Thermal, settlement, space truss
- `validation_cable_truss_structures.rs` (8) — V-shape, fan, deep vs shallow
- `validation_cable_truss_tension.rs` (8)
- `validation_3d_truss_structures.rs` (8) — Tetrahedral, tower, bridge
- `validation_truss_behavior_fundamental.rs` (8) — 3-bar triangle, axial bar, Warren 2-panel

### 3D Analysis (31 files, ~236 tests)
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
- `validation_3d_beam_bending_axes.rs` (8) — Strong/weak axis, biaxial superposition
- `validation_3d_cantilever_verification.rs` (8) — Tip-load deflection/rotation for all DOFs
- `validation_3d_frame_stiffness_properties.rs` (8) — Analytic stiffness: EA/L, 3EI/L³, GJ/L
- `validation_3d_moment_verification.rs` (8) — Biaxial moment diagrams, My and Mz cross-check
- `validation_3d_space_frame_basic.rs` (8) — L-frame, 3D portal, cantilevers along Y/Z
- `validation_3d_support_conditions.rs` (8) — Fixed/pinned/roller DOF constraints
- `validation_3d_torsion_basic.rs` (8) — Pure torsion: proportionality to length, 1/J

### Buckling & Stability (21 files, ~170 tests)
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
- `validation_buckling_theory.rs` (8) — Euler four BCs, tangent-modulus, AISC column curve
- `validation_column_curves.rs` (8) — Amplification factor, effective length
- `validation_nonlinear_geometry.rs` (8) — Euler critical, amplification, snap-through arch
- `validation_stability_design_methods.rs` (8) — DAM, stiffness reduction, ELM, B1/B2
- `validation_buckling_plate_shell.rs` (8) — Donnell, Von Karman, Winter, EC3 shell

### Dynamic Analysis (18 files, ~132 tests)
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
- `validation_dynamic_response.rs` (8) — SDOF free vibration, Duhamel, Newmark accuracy
- `validation_earthquake_response_spectra.rs` (8) — Harmonic excitation, Duhamel impulse, SRSS
- `validation_structural_dynamics.rs` (8) — Natural frequency, damped frequency, log decrement
- `validation_structural_dynamics_advanced.rs` (8) — 2-DOF frequencies, SRSS/CQC, Rayleigh coefficients

### Plastic & Nonlinear (11 files, ~71 tests)
- `validation_plastic_collapse.rs` (8) — Neal: exact collapse loads
- `validation_plastic_mechanisms.rs` (8) — Mechanism types, EN 1993-1-1 §5.6
- `validation_plastic_hinge_sequence.rs` (8)
- `validation_material_nonlinear.rs` (3) + `validation_material_nonlinear_benchmarks.rs` (8)
- `validation_pushover.rs` (6) — FEMA 356, ATC-40
- `validation_corotational.rs` (4) + `validation_corotational_benchmarks.rs` (5) + `validation_advanced_corotational.rs` (4)
- `validation_plastic_analysis.rs` (8) — Plastic moment, upper/lower bound theorems, shape factors
- `validation_plastic_analysis_theorems.rs` (8) — SS Mp, fixed collapse, portal sway, combined mechanism

### Thermal, Settlement, Springs, Foundation (9 files, ~68 tests)
- `validation_thermal_settlement.rs` (10) + `validation_thermal_effects.rs` (8)
- `validation_prescribed_displacements.rs` (8) + `validation_prescribed_settlement.rs` (8)
- `validation_settlement_effects.rs` (8) + `validation_support_settlement_effects.rs` (8)
- `validation_spring_supports.rs` (8)
- `validation_winkler_foundation.rs` (4) + `validation_foundation_interaction.rs` (8)

### Influence Lines & Moving Loads (4 files, ~32 tests)
- `validation_influence_lines.rs` (8) + `validation_muller_breslau.rs` (8)
- `validation_moving_loads.rs` (8) + `validation_moving_load_bridges.rs` (7)

### Stress Analysis (4 files, ~30 tests)
- `validation_section_stress.rs` (8) — Navier, Jourawski, Mohr, Von Mises, Tresca
- `validation_stress_3d.rs` (6) — 3D Navier, biaxial, torsion, Von Mises
- `validation_mohr_circle_stress.rs` (8) — 2D/3D stress transformation, principal stresses, yield
- `validation_connection_mechanics.rs` (8) — Connection force mechanics, elastic method

### Elastic Curves & Deflections (4 files, ~32 tests)
- `validation_elastic_curve_shapes.rs` (8) — Parabolic (SS UDL), cubic (cantilever), quartic (fixed)
- `validation_boundary_condition_effects.rs` (8) — Fixed vs SS ratio, zero rotation/moment checks
- `validation_deflection_serviceability.rs` (8) — L/360 code check, required Iz, stiffness ratios
- `validation_element_stiffness_verification.rs` (8) — Single-element cantilever, E-proportionality

### Moment Diagrams & Shear Verification (4 files, ~32 tests)
- `validation_moment_diagram_shapes.rs` (8) — Triangular, parabolic, linear diagram shapes
- `validation_stress_resultants.rs` (8) — dM/dx=V, constant shear, dV/dx=-q
- `validation_shear_force_verification.rs` (8) — Shear diagram shapes and discontinuities
- `validation_reaction_force_patterns.rs` (8) — Reaction patterns under various loads

### Arch & Shell Theory (4 files, ~32 tests)
- `validation_arch_analysis_formulas.rs` (8) — Three-hinge parabolic, two-hinge circular, tied arch
- `validation_plate_bending.rs` (8) — Navier solution, bending rigidity, Levy, critical buckling
- `validation_plate_theory.rs` (8) — Kirchhoff-Navier, plate buckling, circular, natural frequency
- `validation_shell_membrane_theory.rs` (8) — Spherical vessel, cylindrical shell, conical, edge bending

### Cables (5 files, ~40 tests)
- `validation_cable_structures.rs` (8) — Catenary thrust, parabolic sag, cable length, concentrated load
- `validation_cable_suspension_analysis.rs` (8) — Catenary sag, parabolic profile, support tension
- `validation_cable_analysis_advanced.rs` (8) — Ernst equivalent modulus, Irvine parameter
- `validation_cable_net_structures.rs` (8) — Orthogonal net, spoke-wheel, pretension
- `validation_cable_stayed_bridges.rs` (8) — Fan arrangement, Ernst modulus, tower compression

### Plates & Shells (4 files, ~19 tests)
- `validation_curved_beams.rs` (5) — Quarter-circle, Roark ring, parabolic arch
- `validation_plates.rs` (4) + `validation_scordelis_lo.rs` (3) + `validation_pressure_loads.rs` (4)
- `validation_shell_theory.rs` (8) — Spherical vessel, cylindrical, conical, edge bending
- `validation_thin_shell_structures.rs` (8) — Dome membrane, cylindrical roof, hypar, buckling

### Other Textbook (misc files, ~98 tests)
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
- `validation_deformation_compatibility_checks.rs` (8) — Rotation/displacement continuity
- `validation_shear_lag.rs` (8) — Effective width, deflection increase, load sharing
- `validation_timoshenko_solver.rs` (8) — Timoshenko beam solver validation
- `validation_mixed_elements.rs` (8) — Mixed beam/truss/spring models

---

## Mathematical Properties & Numerical Methods (~179 tests)

### Matrix & Stiffness Properties (5 files, ~39 tests)
- `validation_stiffness_modification.rs` (8) — Internal hinge, midspan hinge, fixed-to-propped
- `validation_stiffness_properties.rs` (7) — Rigid-body zero eigenvalues: 2D frame, 2D truss, 3D
- `validation_cross_section_effects.rs` (8) — Doubling Iz halves deflection, EI effects on indeterminate
- `validation_span_ratio_effects.rs` (8) — Equal vs unequal span, portal aspect ratio
- `validation_load_path_redundancy.rs` (8) — Parallel paths, unequal stiffness, brace reduces sway

### Energy & Work Theorems (2 files, ~16 tests)
- `validation_work_energy_theorem.rs` (8) — Cantilever, Castigliano SS, UDL deflection
- `validation_przemieniecki_extended.rs` (6) — Stiffness symmetry, positive diagonal, patch test

### Fracture Mechanics (1 file, ~8 tests)
- `validation_fracture_mechanics.rs` (8) — SIF, J-integral, Paris law, MTS criterion, FAD (BS 7910)

### Laminate Plate Theory (1 file, ~8 tests)
- `validation_laminate_plate_theory.rs` (8) — CLT, Tsai-Wu, rule of mixtures, laminate invariants

### Hydrodynamic Loading (1 file, ~8 tests)
- `validation_hydrodynamic_loading.rs` (8) — Morison equation, wave theory, VIV formulas

### Structural Damping (1 file, ~8 tests)
- `validation_structural_damping_models.rs` (8) — Rayleigh damping, half-power bandwidth, EC8 correction

### Thermal Stress Theory (1 file, ~8 tests)
- `validation_thermal_stress_analysis.rs` (8) — Free expansion, restrained bar, bimetallic strip, buckling

### Structural Reliability (1 file, ~8 tests)
- `validation_structural_reliability.rs` (8) — FORM index, Monte Carlo, LRFD, Hasofer-Lind

### Structural Optimization (1 file, ~8 tests)
- `validation_structural_optimization.rs` (8) — FSD, Lagrangian, SIMP penalty, compliance sensitivity

### Numerical Methods (2 files, ~16 tests)
- `validation_numerical_methods.rs` (8) — Gauss quadrature, Hilbert condition, Cholesky, bandwidth
- `validation_impact_loading.rs` (8) — Falling weight, sudden load, vehicle collision, dropped object

### Additional Properties (misc files, ~52 tests)
- `validation_serviceability_vibration.rs` (8) — Floor vibration, natural frequency, response factor
- `validation_footfall_vibration.rs` (8) — Walking harmonics, AISC DG11
- `validation_vibration_isolation.rs` (8) — Transmissibility, LRB, TMD Den Hartog, viscous damper
- `validation_structural_acoustics.rs` (8) — Mass law, STC rating, coincidence frequency
- `validation_structural_health_monitoring.rs` (8) — Frequency shift, mode shape curvature, strain gauge
- `validation_earthquake_engineering.rs` (8) — Design spectrum, ELF, vertical distribution, drift

---

## FEM Quality & Convergence (~54 tests)

### Convergence (3 files, ~23 tests)
- `validation_convergence.rs` (7) — h-refinement: cantilever tip, SS reactions, end moment
- `validation_mesh_convergence.rs` (8) — Coarse vs fine, deflection convergence, midspan moment
- `validation_finite_element_convergence.rs` (8) — h/p-refinement, patch consistency, Richardson extrapolation

### Patch Tests (1 file, ~8 tests)
- `validation_patch_tests.rs` (8) — Truss uniform-strain, frame axial, beam pure-bending, rigid-body

### Element Verification (2 files, ~15 tests)
- `validation_mixed_elements.rs` (8) — Mixed beam/truss/spring models
- `validation_stiffness_properties.rs` (7) — Rigid-body eigenvalues

---

## Engineering Practice & Specialized Structures (~616 tests)

### Geotechnical & Foundations (12 files, ~96 tests)
- `validation_soil_structure.rs` (8) — Winkler spring, beam on elastic foundation, Rankine
- `validation_soil_structure_interaction.rs` (8) — Winkler modulus, Vesic-Biot, mat stiffness, pile capacity
- `validation_deep_excavation.rs` (8) — Active/passive/apparent pressure, sheet pile design
- `validation_earth_retaining_advanced.rs` (8) — Anchored sheet pile, multi-propped, diaphragm wall
- `validation_liquefaction.rs` (8) — CSR, CRR from SPT/CPT, settlement
- `validation_rock_mechanics.rs` (8) — Hoek-Brown, RMR/GSI, Q-system, rock bolt
- `validation_ground_improvement.rs` (8) — Stone columns, soil nailing, jet grouting, compaction
- `validation_slope_stability.rs` (8) — Infinite slope, planar cohesive, Fellenius
- `validation_soil_dynamics.rs` (8) — Site amplification, liquefaction CRR, Newmark block, 1D response
- `validation_tunnel_lining.rs` (8) — Overburden, Curtis solution, convergence-confinement
- `validation_underpinning.rs` (8) — Mass concrete, micropile, jet grout, needle beam
- `validation_pavement_design.rs` (8) — Structural number, traffic design, rigid pavement, Boussinesq

### Maritime, Offshore & Hydraulics (4 files, ~32 tests)
- `validation_marine_offshore.rs` (8) — Airy wave, Morison equation, hydrostatic, API wave load
- `validation_coastal_structures.rs` (8) — Wave force, breakwater armor, overtopping, wave run-up
- `validation_hydraulic_engineering.rs` (8) — Manning, Bernoulli, weir discharge, Darcy-Weisbach
- `validation_flood_hydraulics.rs` (8) — Manning's, weir flow, culvert capacity, Yarnell backwater

### Bridge Engineering (2 files, ~16 tests)
- `validation_suspension_bridges.rs` (8) — Suspension cable forces, stiffening girder, hanger design
- `validation_catenary_cable.rs` (8) — Catenary cable analysis formulas

### Wind Engineering (1 file, ~8 tests)
- `validation_snow_ice_loading.rs` (8) — Ground-to-roof, EC flat roof, sloped reduction, drift

### Specialty Civil Structures (14 files, ~112 tests)
- `validation_blast_resistant_design.rs` (8) — Friedlander wave, scaled distance, SDOF, DLF
- `validation_chimney_stack_design.rs` (8) — Along-wind, vortex shedding, thermal gradient, shell stress
- `validation_crane_loading.rs` (8) — Static wheel loads, runway moment, lateral forces, biaxial
- `validation_construction_staging.rs` (8) — Formwork pressure, shore load, reshoring, temp bracing
- `validation_dam_engineering.rs` (8) — Gravity dam sliding/overturning/uplift, arch ring
- `validation_demolition_engineering.rs` (8) — Partial stability, blast sequence, debris, pre-weakening
- `validation_elevator_escalator.rs` (8) — Guide rail forces, rope tension, counterweight, machine room
- `validation_expansion_joints.rs` (8) — Thermal movement, shrinkage/creep, gap sizing
- `validation_nuclear_containment.rs` (8) — DBA pressure, hoop tension, dome membrane, liner strain
- `validation_power_transmission_towers.rs` (8) — Conductor sag/tension, wind, leg member, foundation
- `validation_scaffolding_falsework.rs` (8) — Leg capacity, platform loading, prop capacity, bracing
- `validation_scaffolding_formwork.rs` (8) — Tube axial, tie forces, concrete pressure, props
- `validation_silo_tank_design.rs` (8) — Janssen pressure, hydrostatic, wind buckling, sloshing
- `validation_storage_rack_design.rs` (8) — Beam capacity, upright buckling, frame stability

### Geosynthetics & Tunnels (2 files, ~16 tests)
- `validation_geosynthetics.rs` (8) — Geogrid, MSE internal stability, reinforced slope, geomembrane
- `validation_water_retaining.rs` (8) — Hydrostatic pressure, crack width, minimum reinforcement

### Concrete Durability & Rehabilitation (2 files, ~16 tests)
- `validation_progressive_rehabilitation.rs` (8) — Carbonation, corrosion, CFRP, section loss
- `validation_glass_design.rs` (8) + `validation_glass_structures.rs` (8) — Glass design formulas

### Steel Fiber & Stainless (2 files, ~16 tests)
- `validation_steel_fiber_concrete.rs` (8) — SFRC flexure and shear capacity
- `validation_tensile_structures.rs` (8) — Membrane stresses, form-finding

### Miscellaneous Engineering Practice (misc files, ~296 tests)
- `validation_fluid_structure_interaction.rs` (8) — FSI formulas
- `validation_concrete_durability.rs` (8) — Cover, carbonation, chloride
- `validation_seismic_isolation.rs` (8) — LRB, FPS, HDR
- `validation_connection_design.rs` (8) + `validation_connection_mechanics.rs` (8) — Connections
- `validation_composite_design.rs` (8) — AISC/EC4 composite
- `validation_cold_formed_steel.rs` (8) — AISI S100 effective width, DSM
- `validation_frp_composites.rs` (8) — FRP material, FRP-RC flexure
- `validation_aluminum_design.rs` (8) — 6061-T6, HAZ, LTB
- `validation_precast_concrete.rs` (8) — Hollow-core, corbel, bearing pad
- `validation_seismic_detailing.rs` (8) — Strong-column weak-beam, capacity design
- `validation_fatigue.rs` (8) — EC3 S-N curves, Miner's rule
- `validation_fire_resistance.rs` (8) — ISO 834, steel reduction factors
- `validation_cirsoc_wind.rs` (8) — CIRSOC 102 velocity pressure
- `validation_railway_structures.rs` (8) — EN 1991-2 LM71
- `validation_bridge_design.rs` (8) + `validation_bridge_engineering.rs` (8) + `validation_bridge_loads.rs` (8) + `validation_highway_bridge_loading.rs` (8)
- `validation_pile_foundations.rs` (8) + `validation_retaining_walls.rs` (8)
- `validation_geotechnical_bearing_capacity.rs` (8) + `validation_geotechnical_engineering.rs` (8) + `validation_geotechnical_slopes.rs` (8)
- `validation_masonry_design.rs` (8) + `validation_masonry_arches.rs` (8)
- `validation_timber_design.rs` (8) + `validation_timber_connections.rs` (8) + `validation_wood_design.rs` (8)
- `validation_performance_based_design.rs` (8) — PBEE, fragility, ASCE 41
- `validation_progressive_collapse_full.rs` (8) — UFC, EN 1991 accidental

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
| Steel member checks (AISC 360) | Good | `postprocess/steel_check.rs`, `integration_steel_check.rs`, `validation_structural_steel_design.rs` | Broader design-code depth and more connection/joint coupling |
| RC member checks (ACI 318) | Good | `postprocess/rc_check.rs`, `integration_rc_check.rs`, `validation_reinforced_concrete_design.rs` | Cracked-section depth, detailing breadth, and time-dependent coupling |
| EC2 concrete checks | Good | `postprocess/ec2_check.rs`, `integration_ec2_check.rs`, `validation_concrete_design.rs`, `validation_concrete_detailing.rs` | Broader detailing, crack-control, and lifecycle coupling |
| CIRSOC 201 concrete checks | Good | `postprocess/cirsoc201_check.rs`, `integration_cirsoc201_check.rs`, `validation_concrete_design.rs` | Broader code breadth and workflow integration |
| EC3 steel checks | Good | `postprocess/ec3_check.rs`, `integration_ec3_check.rs`, `validation_eurocode3_buckling.rs`, `validation_cross_section_classification.rs` | Broader clause coverage and more design workflows |
| Timber design checks (NDS) | Good | `postprocess/timber_check.rs`, `integration_timber_check.rs`, `validation_timber_design.rs`, `validation_timber_connections.rs` | Broader species/detailing/connectors coverage |
| Serviceability checks | Good | `postprocess/serviceability.rs`, `integration_serviceability.rs`, `validation_serviceability_checks.rs`, `validation_serviceability_vibration.rs` | Broader office workflows and more building-level checks |
| Connection checks (AISC) | Good | `postprocess/connection_check.rs`, `integration_connection_check.rs`, `validation_connection_design.rs`, `validation_connection_mechanics.rs` | Broader joint families and detailing depth |
| Foundation checks (ACI 318) | Good | `postprocess/foundation_check.rs`, `integration_foundation_check.rs`, `validation_foundation_design.rs`, `validation_foundation_interaction.rs` | Deeper SSI coupling and broader footing/pile workflows |
| Cold-formed steel (AISI S100) | Good | `postprocess/cfs_check.rs`, `integration_cfs_check.rs`, `validation_cold_formed_steel.rs` | Broader AISI/EC3-1-3 clause coverage |
| Masonry checks (TMS 402) | Good | `postprocess/masonry_check.rs`, `integration_masonry_check.rs`, `validation_masonry_design.rs`, `validation_masonry_arches.rs` | Broader masonry design workflows and code breadth |
| LTB checks | Done | `validation_lateral_torsional_buckling.rs`, `validation_structural_steel_design.rs` | Integrated into steel/EC3 check modules |
| CIRSOC 102 wind | Done | `validation_cirsoc_wind.rs` | Formula-level checks complete |
| Fatigue / S-N / Miner | Done | `validation_fatigue.rs` | EC3-1-9 S-N curves and Miner accumulation |
| Seismic detailing | Done | `validation_seismic_detailing.rs` | ACI 318 Ch.18, EC8-1 §5 checks |
| Progressive collapse — full | Done | `validation_progressive_collapse.rs`, `validation_progressive_collapse_full.rs` | UFC and EN 1991-1-7 checks |

#### Remaining Gaps — Needs New Solver Features

| Topic | Difficulty | Impact | Reference Codes |
|-------|-----------|--------|-----------------|
| RC design — reinforcement & crack control | Hard | Concrete structures | ACI 318-19 §24, EC2 §7.3, CIRSOC 201 |
| Composite sections (steel-concrete) | Hard | Composite construction | AISC 360-22 Ch.I, EC4, CIRSOC 301+201 |
| Fire resistance — coupled thermal-structural | Hard | Temperature-dependent properties | EC2-1-2, EC3-1-2, CIRSOC fire annex |
| Soil-structure interaction (p-y curves) | Medium | Foundation analysis | API RP 2A, AASHTO, EC7 |
| Dynamic wind / buffeting / vortex shedding | Hard | Tall buildings, bridges | CIRSOC 102, EC1-1-4, ASCE 7 Ch.26 |
| Nonlinear material — concrete damage | Hard | Concrete cracking | Mazars, CDP, EC2 |
| Nonlinear material — steel hardening | Medium | Ductile analysis | EC3-1-5 Annex C |
