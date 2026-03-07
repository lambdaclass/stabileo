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

**1587 validation test functions across 205 files. 1834 total tests (including unit + diff fuzz). All passing (6 ignored known bugs).**

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

## Not Yet Covered

These are areas important to structural engineering practice that need implementation:

### Priority 1 — Can Test with Existing Solver

| Topic | Difficulty | Impact | Reference Codes |
|-------|-----------|--------|-----------------|
| Cross-section classification (EC3) | Easy | Steel design | EN 1993-1-1 §5.5, AISC 360 Table B4.1b |
| Lateral-torsional buckling (LTB) | Medium | Steel beam design | EN 1993-1-1 §6.3.2, AISC 360-22 Ch.F |
| Steel connections — bolt groups | Medium | Steel joints | AISC 360-22 Ch.J, EC3-1-8 |
| Steel connections — weld groups | Medium | Steel joints | AISC 360-22 Ch.J, EC3-1-8 |
| Serviceability — vibration | Medium | Floor design | AISC DG11, EC3-1-1 §7.2, SCI P354 |
| CIRSOC 102 wind loading | Medium | Argentine wind design | CIRSOC 102-2005, CIRSOC 102-2018 |
| Timber design | Medium | Timber structures | NDS 2024, EN 1995-1-1, CIRSOC 601 |
| Fatigue / S-N curves / Miner's rule | Medium | Steel bridges, connections | EC3-1-9, AISC 360-22 App.3, AASHTO |
| Foundation — spread footings | Medium | Foundation design | ACI 318-19 Ch.13, EC2-1-1, EC7 |
| Foundation — pile groups | Medium | Deep foundations | AASHTO LRFD, EC7 §7 |
| Seismic detailing | Medium | Ductile design | ACI 318-19 Ch.18, EC8-1 §5, CIRSOC 103 |
| Progressive collapse — full analysis | Medium | Robustness | GSA 2016, DoD UFC 4-023-03, EN 1991-1-7 |

### Priority 2 — Needs New Solver Features

| Topic | Difficulty | Impact | Reference Codes |
|-------|-----------|--------|-----------------|
| Timoshenko beam element (shear deformation) | Medium | Deep beams, short members | Timoshenko & Gere |
| Cable / catenary elements | Medium | Bridges, cable stays | EC3-1-11, ASCE 19 |
| Concrete sections (RC analysis) | Medium | Cracked section, MN interaction | ACI 318-19, EC2-1-1, CIRSOC 201 |
| RC design — reinforcement & crack control | Hard | Concrete structures | ACI 318-19 §24, EC2 §7.3, CIRSOC 201 |
| Composite sections (steel-concrete) | Hard | Composite construction | AISC 360-22 Ch.I, EC4, CIRSOC 301+201 |
| Prestressed / post-tensioned concrete | Hard | Bridge design | ACI 318-19 Ch.25, EC2 §5.10 |
| Creep & shrinkage (time-dependent) | Hard | Long-term concrete | ACI 209, EC2 §3.1.4, fib MC2010 |
| Fire resistance | Hard | Temperature-dependent properties | EC2-1-2, EC3-1-2, CIRSOC fire annex |
| Soil-structure interaction (p-y curves) | Medium | Foundation analysis | API RP 2A, AASHTO, EC7 |
| Dynamic time-history (earthquake records) | Medium | Performance-based design | ASCE 7 §16, EC8 §3.2.3, CIRSOC 103 |
| Dynamic wind / buffeting / vortex shedding | Hard | Tall buildings, bridges | CIRSOC 102, EC1-1-4, ASCE 7 Ch.26 |
| Plate / shell advanced elements | Hard | Complex structures | NAFEMS, Bathe |
| Construction staging | Hard | Sequential construction | AASHTO LRFD §5.12 |
| Fiber-based plasticity | Hard | Advanced nonlinear | OpenSees framework |
| Nonlinear material — concrete damage | Hard | Concrete cracking | Mazars, CDP, EC2 |
| Nonlinear material — steel hardening | Medium | Ductile analysis | EC3-1-5 Annex C |
