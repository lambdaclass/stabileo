# Dedaliano Engine

High-performance 2D/3D structural analysis engine in Rust, implementing the Direct Stiffness Method from scratch with no external linear algebra dependencies.

## Analysis Types

- **Linear static** (2D & 3D): direct stiffness method, sparse Cholesky solver
- **P-Delta** (2D): second-order geometric nonlinearity with iterative convergence
- **Corotational** (2D): large-displacement nonlinear analysis (Newton-Raphson)
- **Buckling** (2D & 3D): linearized eigenvalue buckling (Lanczos eigensolver)
- **Modal** (2D & 3D): natural frequencies and mode shapes via consistent mass matrix
- **Spectral** (2D & 3D): response spectrum analysis with SRSS/CQC combination
- **Time history** (2D): Newmark-beta and HHT-alpha direct integration
- **Moving loads** (2D): load envelope by stepping axle groups across the structure
- **Influence lines** (2D): Muller-Breslau virtual unit load method
- **Plastic collapse** (2D): incremental hinge formation to mechanism
- **Kinematic analysis** (2D & 3D): mechanism detection, degree of indeterminacy, rank check
- **Plate/shell** (3D): DKT triangular plate element with pressure loads

## Running Tests

```bash
cd engine && cargo test              # full suite (1834 tests)
cd engine && cargo test validation_  # validation tests only (1587 tests across 205 files)
cd engine && cargo test diff_fuzz    # differential fuzz tests (90 tests)
```

## Validation Test Suite

**1587 validation tests across 205 files**, verified against published analytical solutions, industry codes, and commercial software results. See [`tests/BENCHMARK_TRACKING.md`](tests/BENCHMARK_TRACKING.md) for detailed status of each benchmark.

### Industry Standards and Design Codes

| Standard | Files | Tests | What it covers |
|----------|-------|-------|----------------|
| **AISC 360-22** | `aisc_stability`, `effective_length`, `frame_classification`, `notional_loads`, `braced_frame(s)` | 46 | B1/B2 amplification, effective length K-factors, frame classification (sway/non-sway), notional loads 0.2-0.5% gravity, X/K/chevron bracing |
| **Eurocode 3** (EN 1993-1-1) | `eurocode3_buckling`, `code_provisions`, `deflection_limits`, `frame_classification` | 28 | alpha_cr elastic critical buckling, Horne's method, frame classification, deflection limits L/360 |
| **Eurocode 8** (EN 1998-1) | `biggs_extended`, `code_provisions`, `seismic_design`, `3d_spectral` | 26 | Design spectrum Type 1, 90% mass participation, modal combination, multi-directional 100%+30% |
| **ASCE 7-22** | `code_provisions`, `drift_verification`, `serviceability_checks`, `regulatory_features`, `wind_load_analysis`, `multi_story_lateral` | 47 | Base shear, inter-story drift H/400, wind profiles, story shear distribution, importance factor |
| **AASHTO HL-93** | `moving_loads`, `moving_load_bridges` | 16 | Single/multi-axle trucks, bridge influence lines, shear/moment envelopes, mesh convergence |
| **EN 1990/EN 1991** | `combinations`, `load_combination_envelope`, `thermal_effects`, `wind_load_analysis` | 32 | ULS factors 1.35DL+1.50LL+0.9W, thermal EN 1991-1-5, wind profiles, pattern loading |
| **GSA 2013 / EN 1991-1-7** | `progressive_collapse` | 6 | Member removal, alternate load paths, redundancy |
| **FEMA 356 / ATC-40** | `pushover` | 6 | Pushover curves, P-delta stiffness, N2 method |
| **IBC 2021** | `drift_verification`, `serviceability_checks` | 16 | Drift ratios, deflection limits, ponding |

### Commercial Software Cross-Validation

| Source | Files | Tests | What it covers |
|--------|-------|-------|----------------|
| **ANSYS VM** | `ansys_vm`, `ansys_vm_extended`, `ansys_vm_additional` | 33 | VM1-VM156: trusses, beams, thermal, torsion, space frames, stepped beams, P-delta |
| **SAP2000/CSI** | `sap2000` | 10 | Beam, continuous, portal, modal, leaning column, springs, P-delta |
| **Code_Aster SSLL** | `code_aster` | 9 | SSLL010-SSLL400: trusses, frames, buckling, variable section |
| **NAFEMS** | `nafems`, `nafems_extended` | 14 | FV1/2/12/13/31/32/41/51/52, LE5/10, T1/3, R0031: axial, vibration, stress, thermal, 3D |
| **MASTAN2** | `mastan2_frames` | 20 | Ziemian 22 benchmark frames: simple portals, multi-bay, braced, unbraced, irregular |

### Textbook References

| Source | Files | Tests | Topics |
|--------|-------|-------|--------|
| **Timoshenko** (Strength of Materials, Elastic Stability, Vibrations) | 25+ files | ~200 | Beams, buckling (4 BCs), thermal, torsion, plates, shear deformation, arches |
| **Chopra** (Dynamics of Structures 5th) | `chopra_dynamics`, `modal_frequencies`, `dynamic_mdof`, `dynamic_advanced`, `spectral_response`, `rsa_crosscheck` | 48 | Modal frequencies, time history, MDOF, RSA, Rayleigh damping, DAF |
| **Ghali/Neville** (Structural Analysis) | `continuous_beams`, `three_moment_equation`, `influence_lines`, `frames`, `kinematic`, `continuous_patterns` | 48 | Continuous beams, three-moment equation, influence lines, moment redistribution |
| **Przemieniecki** (Matrix Structural Analysis) | `3d_analysis`, `przemieniecki_extended`, `matrix_methods`, `matrix_condensation`, `stiffness_matrix` | 40 | 12x12 stiffness, geometric stiffness, condensation, coordinate transforms |
| **McGuire/Gallagher/Ziemian** (Matrix Structural Analysis 2nd) | `matrix_methods`, `mastan2_frames`, + 3D files | 35 | Assembly, P-delta, stability, 3D frames |
| **Kassimali** (Structural Analysis 6th) | `kassimali_extended`, `truss_methods`, `force_method`, + 10 files | 50 | Trusses, continuous beams, force method, portal/cantilever methods |
| **Hibbeler** (Structural Analysis 10th) | `hibbeler_problems`, `truss_method_of_joints`, + 15 files | 60 | Reactions, internal forces, deflections, moment distribution, direct stiffness |
| **Roark** (Formulas for Stress and Strain 9th) | `roark_formulas`, `3d_distributed_loads`, `3d_torsion_effects` | 24 | Table 8.1 cases, deflection formulas, torsion, rings |
| **Neal** (Plastic Methods) | `plastic_collapse`, `plastic_mechanisms`, `plastic_hinge_sequence`, `material_nonlinear_benchmarks` | 32 | Collapse loads, mechanism analysis, hinge sequences |
| **Weaver & Gere** (Matrix Analysis of Framed Structures) | `matrix_textbooks`, `transfer_matrix`, + 3D files | 24 | Matrix methods, transfer matrix, 3D analysis |
| **Hardy Cross (1930)** | `hardy_cross`, `moment_distribution` | 16 | Moment distribution, carryover, distribution factors |
| **Maxwell (1864) / Betti (1872) / Castigliano (1879)** | `reciprocal_theorem(s)`, `energy_methods`, `castigliano`, `fundamental_theorems`, `virtual_work` | 52 | Reciprocal theorems, strain energy, unit load method, virtual work |
| **Clapeyron (1857)** | `three_moment_equation` | 8 | Three-moment equation for continuous beams |
| **Muller-Breslau (1886)** | `muller_breslau` | 8 | Influence line construction via deflection reciprocity |
| **Hetenyi (1946)** | `winkler_foundation`, `foundation_interaction` | 12 | Beams on elastic foundation, Winkler model |
| **Clough & Penzien** (Dynamics of Structures 3rd) | `damping_frequency`, `modal_properties`, `dynamic_advanced` | 24 | Damping, modal analysis, numerical integration |
| **Bathe** (Finite Element Procedures) | `convergence`, `mesh_convergence`, `stiffness_properties`, `modal_properties` | 30 | h-convergence, Richardson extrapolation, eigenvalue bounds |
| **Scordelis & Lo (1964) / MacNeal & Harder (1985)** | `scordelis_lo`, `patch_tests` | 11 | Plate benchmarks, patch tests |
| **Chen & Lui** (Stability Design) | `stability_advanced`, `beam_column_interaction`, `pdelta_benchmarks` | 24 | P-delta, beam-column interaction, K-factors, initial imperfections |

### Coverage by Analysis Category

| Category | Files | Tests | Key validations |
|----------|-------|-------|-----------------|
| **Beam theory** (deflections, rotations, elastic curve) | 15 | ~110 | SS/cantilever/fixed-fixed/propped, all load types, Roark table cases |
| **Internal forces** (V, M, N diagrams) | 14 | ~110 | dV/dx=-q, dM/dx=V, contraflexure, hinge M=0, load discontinuities |
| **Continuous beams** | 4 | ~30 | Three-moment equation, pattern loading, moment redistribution |
| **Indeterminate methods** | 14 | ~110 | Slope-deflection, moment distribution, force method, flexibility, matrix methods |
| **Energy methods** | 8 | ~64 | Castigliano, Maxwell-Betti, virtual work, superposition, unit load |
| **Classical methods** | 5 | ~40 | Conjugate beam, moment area, transfer matrix, portal/cantilever methods |
| **Frames** (portal, multi-story, braced, gable, Vierendeel) | 16 | ~130 | Sway, drift, joint rigidity, load path, multi-bay, arch action |
| **Trusses** | 8 | ~64 | Method of joints/sections, Warren/Pratt/Howe/K-truss, zero-force members, 3D space trusses |
| **3D analysis** (beams, frames, torsion, biaxial) | 24 | ~180 | Biaxial bending, torsion, space trusses, grillages, 3D equilibrium, inclined supports |
| **Influence lines & moving loads** | 4 | ~32 | Muller-Breslau, AASHTO HL-93, bridge envelopes |
| **Buckling & stability** | 16 | ~130 | Euler (4 BCs), P-delta, B1/B2, geometric stiffness, MASTAN2 frames, effective length |
| **Dynamic analysis** | 14 | ~100 | Modal frequencies, time history (Newmark/HHT), spectral response, SRSS/CQC, seismic design |
| **Plastic analysis** | 6 | ~42 | Collapse loads, mechanism formation, hinge sequences, pushover |
| **Corotational / large displacement** | 3 | ~13 | ANSYS VM14 elastica, snap-through, Williams toggle |
| **Plates & shells** | 3 | ~11 | DKT element, patch tests, pressure loads, Scordelis-Lo |
| **Thermal & settlement** | 6 | ~52 | Uniform/gradient thermal, prescribed displacements, settlement-induced moments |
| **Spring supports & foundations** | 3 | ~20 | Winkler foundation, spring stiffness, rotational springs |
| **Load combinations & serviceability** | 5 | ~40 | LRFD factors, EN 1990 ULS, envelopes, drift limits, deflection checks |
| **FEM quality** | 4 | ~30 | Patch tests (MacNeal-Harder, Argyris-Kelsey), h-convergence, rigid body modes |
| **Stress analysis** | 2 | ~16 | Navier, Jourawski, Mohr's circle, Von Mises, Tresca, 3D biaxial stress |
| **Structural classification** | 3 | ~19 | Mechanism detection, isostatic/hyperstatic, rigid body modes |
| **Deformation compatibility** | 6 | ~48 | Symmetry/antisymmetry, superposition, indeterminacy effects |
| **Wind & lateral** | 3 | ~24 | Uniform/triangular wind, story shear, overturning, drift |
| **Composite & special** | 3 | ~24 | Parallel beams, mixed materials, semi-rigid connections |

### Known Bugs (6 ignored tests)

| Bug | Tests | Impact |
|-----|-------|--------|
| 3D thermal loads dropped in assembly (`_ => {}` wildcard) | 2 | 3D thermal analysis produces zero displacement |
| 3D partial distributed loads ignore a/b parameters | 2 | Partial loads on 3D elements behave as full-span |
| Plate mass not assembled in mass_matrix.rs | 2 | Modal analysis of mixed plate+beam models incorrect |

### Incomplete Features

| Feature | Status | Reference |
|---------|--------|-----------|
| Warping torsion (7th DOF) | 14x14 math exists, assembly not wired | Vlasov, Trahair |
| 3D corotational | 2D only | Crisfield |
| Higher-order plate elements | DKT only, limited convergence | — |

### Not Yet Covered

These are areas important to structural engineering practice that the engine does not yet address:

| Topic | Notes |
|-------|-------|
| Timoshenko beam element (shear deformation) | Only Euler-Bernoulli; deep beams diverge |
| Cable/catenary elements | No geometric nonlinear cable element |
| Prestressed / post-tensioned concrete | Not modeled |
| Cracked concrete section analysis | Not modeled |
| Creep, shrinkage, time-dependent effects | Not modeled |
| Soil-structure interaction beyond Winkler | No p-y curves, pile groups |
| Dynamic wind / gust response | Wind is static lateral loads only |
| Fatigue / cumulative damage | Not modeled |
| Connection design (bolt/weld capacity) | Not modeled |
| Fire resistance analysis | No temperature-dependent material properties |
| Construction staging | No sequential construction analysis |
| Fiber-based cross-section plasticity | Only simplified plastic-hinge collapse |

## Differential Fuzz Tests

90 tests comparing the Rust engine output against the TypeScript reference solver across random seeds, validating:
- Displacements, reactions, element forces
- Internal force diagrams at 9 interior points per element
- Support for all element types, load patterns, and boundary conditions
