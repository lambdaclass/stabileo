# Dedaliano Engine

High-performance 2D/3D structural analysis engine in Rust, implementing the Direct Stiffness Method from scratch with no external linear algebra dependencies.

## Document scope

Read next:
- doc map: [`../DOCS.md`](/Users/unbalancedparen/projects/dedaliano/DOCS.md)
- current snapshot: [`../CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- detailed proof and benchmark status: [`../BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md)

This file is the engine-facing overview.

- For full benchmark status and solver gap tracking, see [`../BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).
- For repo-level solver priorities, see [`../SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md).
- For app and workflow priorities, see [`../PRODUCT_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/PRODUCT_ROADMAP.md).
- For business framing and market position, see [`../POSITIONING.md`](/Users/unbalancedparen/projects/dedaliano/POSITIONING.md).

This document should stay focused on the engine surface, analysis families, and engine-facing validation summary.

## Analysis Types

- **Linear static** (2D & 3D): direct stiffness method, sparse Cholesky solver
- **P-Delta** (2D & 3D): second-order geometric nonlinearity with iterative convergence
- **Corotational** (2D & 3D): large-displacement nonlinear analysis (Newton-Raphson)
- **Arc-length / displacement control**: Riks-style path following and displacement-controlled nonlinear solve
- **Buckling** (2D & 3D): linearized eigenvalue buckling (Lanczos eigensolver)
- **Modal** (2D & 3D): natural frequencies and mode shapes via consistent mass matrix
- **Spectral** (2D & 3D): response spectrum analysis with SRSS/CQC combination
- **Time history** (2D & 3D): Newmark-beta and HHT-alpha direct integration
- **Moving loads** (2D & 3D): load envelope by stepping axle groups across the structure
- **Influence lines** (2D & 3D): Muller-Breslau-style influence workflows and envelopes
- **Plastic collapse** (2D & 3D): incremental hinge formation to mechanism
- **Kinematic analysis** (2D & 3D): mechanism detection, degree of indeterminacy, rank check
- **Construction staging** (2D & 3D): phased activation, support changes, staged loads, prestress hooks
- **Harmonic response** (2D & 3D): frequency-response analysis with modal damping input
- **Winkler foundation** (2D & 3D): beams/frames on elastic foundation
- **Nonlinear SSI** (2D & 3D): `p-y`, `t-z`, and `q-z` spring-family soil interaction
- **Contact / gap** (2D & 3D): unilateral support/contact behavior, uplift, and gap elements
- **Constraints** (2D & 3D): rigid links, diaphragms, equal-DOF constraints, and general linear MPCs
- **Connector elements** (2D & 3D): spring connectors, semi-rigid joints, and eccentric connections with constraint force output
- **Imperfections / residual stress**: initial geometric imperfections and residual-stress-aware nonlinear workflows
- **Multi-case solve** (2D & 3D): case-by-case analysis, combinations, envelopes
- **Cable solver** (2D): tension-only cable/catenary-style solve with iterative update
- **Fiber nonlinear beam-columns** (2D & 3D): distributed plasticity / section-integration solvers
- **Creep / shrinkage**: time-dependent structural response with EC2-style models
- **Plate/shell** (3D): DKT/DKMT triangular plates and MITC4 quadrilateral shells with ANS shear tying, EAS-4 membrane softening, pressure, drilling stabilization, and thermal support
- **Model reduction / substructuring**: Guyan condensation and Craig-Bampton reduction for larger-model workflows
- **Section analysis**: polygon-based cross-section properties and section metrics

## Running Tests

```bash
cd engine && cargo nextest run         # default full-suite runner
cd engine && cargo test --test core    # core solver tests
cd engine && cargo test --test property # differential fuzz tests
cd engine && cargo test --test integration # integration tests
cd engine && cargo test --test validation  # validation crate
```

CI now runs `cargo nextest run --profile ci`, with engine-local nextest configuration and a Linux-only `mold` linker setup for faster test builds.
It also runs explicit gate steps for shell benchmarks, shell acceptance models, constraint benchmarks, and sparse 3D parity before the full suite.

## Validation Test Suite

Latest reported full-suite status: **6371 passing tests, 0 failures**.

The engine is backed by:

- a validation suite measured in the `6300+` range
- `25` integration test files
- dedicated property / differential fuzz coverage
- benchmark-gate suites for constraints, contact, shells, reduction, sparse / conditioning paths, and sparse 3D parity
- explicit CI gate stages for shell benchmarks, shell acceptance models, and constraint benchmarks

See [`../BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md) for detailed status of each benchmark family and current maturity.

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
| **ANSYS VM** | `ansys_vm`, `ansys_vm_extended`, `ansys_vm_additional`, `ansys_vm_benchmarks` | 41 | VM1-VM156 plus extended truss, beam, thermal, torsion, space-frame, stepped-beam, and P-delta cases |
| **SAP2000/CSI** | `sap2000`, `sap2000_extended` | 18 | Beam, continuous, portal, modal, leaning column, springs, P-delta, settlement, 3D frame extensions |
| **Code_Aster SSLL** | `code_aster`, `code_aster_extended` | 17 | SSLL truss, frame, buckling, variable-section, and extended reference cases |
| **NAFEMS** | `nafems`, `nafems_extended`, `nafems_benchmarks` | 22 | FV/LE/T/R benchmark coverage across axial, vibration, stress, thermal, and 3D cases |
| **MASTAN2** | `mastan2_frames`, `mastan2_extended` | 42 | Ziemian benchmark frames plus extended buckling and P-delta frame checks |
| **OpenSees** | `opensees_crosscheck` | 8 | Beam, portal, truss, cantilever, 2-span, 2-story, 3D truss, P-delta cross-checks |
| **Robot Structural** | `robot_structural` | 8 | Beam, portal, braced frame, biaxial 3D, Warren truss cross-checks |
| **STAAD.Pro** | `staad_pro` | 8 | Cantilever, UDL, continuous beam, truss, portal, Gerber, spring support cross-checks |
| **Strand7 / LUSAS** | `strand7_lusas` | 8 | Beam, thermal, truss, settlement, torsion, Euler buckling cross-checks |

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
| **Plates & shells** | 5 | ~25 | DKT element, patch tests, pressure loads, Scordelis-Lo, MITC4 quads, shell benchmark gates |
| **Thermal & settlement** | 6 | ~52 | Uniform/gradient thermal, prescribed displacements, settlement-induced moments |
| **Spring supports & foundations** | 3 | ~20 | Winkler foundation, spring stiffness, rotational springs |
| **Load combinations & serviceability** | 5 | ~40 | LRFD factors, EN 1990 ULS, envelopes, drift limits, deflection checks |
| **FEM quality** | 4 | ~30 | Patch tests (MacNeal-Harder, Argyris-Kelsey), h-convergence, rigid body modes |
| **Stress analysis** | 2 | ~16 | Navier, Jourawski, Mohr's circle, Von Mises, Tresca, 3D biaxial stress |
| **Structural classification** | 3 | ~19 | Mechanism detection, isostatic/hyperstatic, rigid body modes |
| **Deformation compatibility** | 6 | ~48 | Symmetry/antisymmetry, superposition, indeterminacy effects |
| **Wind & lateral** | 3 | ~24 | Uniform/triangular wind, story shear, overturning, drift |
| **Composite & special** | 3 | ~24 | Parallel beams, mixed materials, semi-rigid connections |

### Current Engine Frontier

Phase 2 is complete — constraint unification, contact refinement, connector elements, eccentric connections, benchmark gate suites, performance architecture, shell benchmark hardening, shell diagnostics, and quad nodal stress recovery are all in place. The main remaining engine work is:

- shell release-gating and shell-driven fixes from the newest benchmark/acceptance suites
- real-model acceptance tests and full-workflow performance benchmarks
- deeper shell maturity (broader curved-shell families, hemisphere/membrane-locking limit decisions, folded plates)
- advanced contact variants (friction cycles, multi-gap mixed states)
- CI hardening and release-grade benchmark gates
- performance at scale and production solver polish

For the detailed gap inventory and benchmark status, use [`../BENCHMARKS.md`](/Users/unbalancedparen/projects/dedaliano/BENCHMARKS.md).

## Differential Fuzz Tests

90 tests comparing multiple solver paths and locked fixtures across random seeds, validating:
- Displacements, reactions, element forces
- Internal force diagrams at 9 interior points per element
- Support for all element types, load patterns, and boundary conditions

## Benchmark Gate Suites

Compact must-pass suites validating the newest solver families:

| Suite | File | Coverage |
|-------|------|----------|
| Constraints | `benchmarks/constraints_benchmark.rs` | Rigid links, diaphragms, equal-DOF, eccentric connections, constraint forces |
| Contact | `benchmarks/contact_benchmark.rs` | Gap elements, tension/compression-only, friction, augmented Lagrangian |
| Shells | `benchmarks/shell_benchmark.rs` | MITC4 quads, membrane/bending, thermal, mesh quality, mixed frame+shell, distortion robustness, pinched cylinder, self-weight, edge loads, warped elements |
| Reduction | `benchmarks/reduction_benchmark.rs` | Guyan condensation, Craig-Bampton, substructuring workflows |
| Sparse | `benchmarks/sparse_benchmark.rs` | Sparse assembly, sparse Cholesky, conditioning diagnostics |
| Sparse 3D Parity | `benchmarks/sparse_3d_parity.rs` | Dense-vs-sparse assembly/solve parity for shells, frames, prescribed displacements, inclined supports |
| Sparse 3D Benchmark | `benchmarks/sparse_3d_benchmark.rs` | Wall-clock and memory comparison, 11-22x memory reduction |
| Sparse 3D Drilling | `benchmarks/sparse_3d_drilling_regression.rs` | Drilling DOF regularization, Cholesky silent-failure regression |
