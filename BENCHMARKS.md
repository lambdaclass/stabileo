# Benchmark Validation Test Tracking

> Master list of all industry-standard benchmarks and validation tests.
> Status: DONE = reproduces published benchmark with tight tolerance (<5%),
> CAPABILITY = solver feature exists with smoke/capability tests but benchmark not yet reproduced exactly,
> BLOCKED = needs new solver features.

Read next:
- current snapshot: [`CURRENT_STATUS.md`](/Users/unbalancedparen/projects/dedaliano/CURRENT_STATUS.md)
- next solver priorities: [`SOLVER_ROADMAP.md`](/Users/unbalancedparen/projects/dedaliano/SOLVER_ROADMAP.md)
- verification method: [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md)

---

This document is the `status and proof` document.
It should answer:
- what is implemented
- what is benchmarked or gated
- what is still unproven or immature

It should not be the main roadmap or the historical archive.

## Summary

The benchmark ledger below is curated. It is narrower than the full automated test inventory, because many validation, unit, integration, and regression tests are support checks rather than one benchmark row per test.

Current measured inventory:

- latest reported full-suite status: `5906` passing tests, `0` failures
- `25` integration test files (`182` integration test functions)
- dedicated property / differential fuzz coverage (`90` passing tests)
- explicit benchmark-gate suites for constraints, contact, shells, reduction, sparse / conditioning paths, and sparse 3D parity
- explicit CI gate stages for shell benchmarks, shell acceptance models, and constraint benchmarks
- the benchmark ledger below is curated and intentionally narrower than the full automated suite

### Fast Scan

| Area | Implemented | Benchmarked | Gated | Main Remaining Gap |
|---|---|---|---|---|
| Linear / second-order core | Yes | Yes | Partial | broader large-model and sparse-path proof |
| Dynamics (modal / spectrum / time history / harmonic) | Yes | Yes | Partial | more mixed shell/frame and nonlinear depth |
| Nonlinear frames / fiber / staged | Yes | Yes | Partial | harder mixed nonlinear workflows and convergence edge cases |
| Contact / SSI | Yes | Yes | Partial | tougher mixed cases and more long-tail reference coverage |
| Shells / plates | Yes | Yes | Yes | MITC4+MITC9+SHB8-ANS+curved-shell multi-family stack implemented and acceptance-covered; remaining work is shell-family guidance, workflow hardening, and shell-adjacent breadth |
| Constraints / reduction | Yes | Yes | Yes | chained-constraint maturity and broader solver-path consistency |
| Sparse / conditioning paths | Yes | Yes | Yes | sparse Cholesky measured: 22-89× factorization speedup over dense LU, 0 perturbations, fill 2.6-7.0× (grows with mesh size); sparse reuse is partly done in modal/buckling/harmonic/reduction, modal and buckling 3D now have sparse eigensolver paths; next blockers are deeper sparse eigensolver integration and runtime measurement on the newly sparse workflows |
| Design-check / postprocess stack | Yes | Yes | No | workflow/product packaging rather than core mechanics |

Use this table first.
Use the capability matrix and benchmark ledger below for detail.

## How to Read This File

This file answers four different questions, in this order:

1. `What exists today?`
   The current solver/design surface, current maturity level, and the biggest remaining gaps.
2. `How is it validated?`
   The testing methodology and the role of analytical checks, benchmarks, cross-validation, regressions, and acceptance models.
3. `What exact benchmarks are covered?`
   The full benchmark ledger by design code family, commercial cross-check source, textbook domain, and engineering specialty.
4. `What is not yet benchmark-complete?`
   Regression-only items, capability-only items, placeholders, and the detailed gap inventory.

Recommended reading order:

- `Solver Capability Matrix`
- `Priority and Parity Framework`
- `Validation Methodology`
- `Benchmark Ledger`
- `Regression and Capability-Only Tracking`
- `Detailed Gap Inventory`

This document is about solver capability, validation, and benchmark evidence.
It should not carry the repo’s full business narrative or become the primary product roadmap.

## Current Coverage Snapshot

### What We Have Today

At a high level, the current engine already has:

- broad 2D and 3D structural analysis coverage
- second-order, buckling, modal, spectrum, time history, and harmonic workflows
- nonlinear frame, fiber, contact, SSI, staged, prestress, imperfections, and creep/shrinkage support
- triangular plates plus MITC4, MITC9, SHB8-ANS, and curved-shell families
- constraint systems, reduction/substructuring, and broad postprocessing/design modules
- benchmark gates, acceptance models, integration tests, property/differential fuzz coverage, and a large validation surface

In short:

`the core solver surface is already broad and serious`

The rest of this document explains how proven each part of that surface is.

### What We Still Need

The main remaining needs are no longer basic feature categories. They are:

- shell-family hardening
  MITC4+MITC9+SHB8-ANS+curved-shell multi-family stack is implemented and acceptance-covered; remaining work is selection guidance, workflow hardening, and shell-adjacent breadth rather than missing core shell families
- performance and scale maturity
  sparse Cholesky runtime gains are now measured (22-89× factorization speedup, 22× end-to-end, 0 perturbations); sparse reuse is partly done into modal/buckling/harmonic/reduction, modal and buckling 3D now have sparse eigensolver paths, AMD currently wins on fill for larger shell meshes, and the remaining work is deeper sparse eigensolver integration, runtime measurement on the newly sparse workflows, and eigensolver cleanup
- verification depth
  more invariants, property-based testing, fuzzing, and acceptance-model discipline around the newest solver families
- long-tail nonlinear hardening
  especially mixed contact/nonlinear/staged/shell cases
- solver-path consistency
  dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows
- broader external-reference proof
  especially for contact, fiber 3D, SSI, creep/shrinkage, and advanced shell workflows

In short:

`what remains is mostly proof, hardening, scale, and endgame shell/nonlinear maturity`

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

## Validation Methodology

The benchmark suite is only one part of solver verification. A structural solver should be tested in layers:

1. `Unit tests`
   Element stiffness, fixed-end forces, transformations, mass matrices, geometric stiffness, damping terms, and postprocessing formulas.
2. `Analytical validation`
   Closed-form textbook cases for beams, frames, trusses, buckling, dynamics, thermal loads, Timoshenko beams, cables, staged/prestress sanity checks, and related structural mechanics problems.
3. `Reference benchmark validation`
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
10. `Benchmark gate testing`
   A compact set of must-pass suites for constraints, contact, shells, reduction, and sparse / conditioning paths.

### Notes on Differential Testing

Differential testing is still useful, but it should not depend on a deleted implementation.

The right long-term role for differential tests here is:

- compare multiple solver paths inside the current engine
- compare current results against locked fixture baselines
- compare against external published references or commercial/open-source cross-check models

In other words, the benchmark strategy should be framed around reproducibility and solver consistency, not around parity with a removed TypeScript solver.

For the broader verification strategy, including fuzzing and selective formal verification, see [`VERIFICATION.md`](/Users/unbalancedparen/projects/dedaliano/VERIFICATION.md).

---

## Current Solver State

### Solver Capability Matrix

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
| 2D material nonlinear | Good | `solver/material_nonlinear.rs`, benchmark/capability tests | Elastic-plastic capability exists, but the deepest spread-plasticity work now lives in the separate fiber solver |
| 3D material nonlinear | Good | `solver/material_nonlinear.rs`, `integration_material_nonlinear_3d.rs` | Real implementation exists, but still needs broader validation and tougher benchmark parity |
| Plastic collapse / hinge sequencing | Good | `solver/plastic.rs`, `validation_plastic_*`, `integration_plastic_3d.rs` | Not a full general nonlinear plasticity framework |
| Moving loads / influence workflows (2D/3D) | Good | `solver/moving_loads.rs`, `validation_moving_loads.rs`, `integration_moving_loads_3d.rs`, `postprocess/influence.rs` | Needs deeper bridge/special-vehicle benchmark coverage |
| Multi-case load solving / envelopes (2D/3D) | Good | `solver/load_cases.rs`, `postprocess/combinations.rs`, `validation_load_combination_envelope.rs` | Needs larger workflow coverage and richer product-facing load management |
| 2D frame / truss elements | Strong | `element/frame.rs`, `element/truss` behavior via linear solver/tests | Mostly shear deformation and nonlinear upgrades |
| 3D frame / truss elements | Strong | `element/frame.rs`, broad `validation_3d_*` coverage | More difficult mixed nonlinear / shell-coupled cases and warping hardening |
| Plate / shell triangles | Good | `element/plate.rs`, `validation_plates.rs`, `validation_scordelis_lo.rs`, recent drilling/nodal-stress/thermal upgrades | Higher fidelity shell behavior, convergence quality, and more benchmark depth |
| MITC4 quadrilateral shell element | Strong | `element/quad.rs` with Bathe-Dvorkin (1986) ANS shear tying plus EAS-7 membrane enhancement, integrated through standard input and assembly, nonlinear 3D stress recovery, full nodal stress tensor recovery, shell-quality diagnostics, and Jacobian/warping detection. Scordelis-Lo 84%, Navier plate 93%, buckling 102%, modal 99.9% of reference. | Extreme non-planar shell cases like the pinched hemisphere, Raasch hook, and twisted beam still expose formulation limits |
| MITC9 9-node quadrilateral shell element | Strong | `element/quad9.rs` with ANS shear tying (Bucalem & Bathe 1993), Hughes-Brezzi drilling stabilization, 3×3 Gauss quadrature, 54 DOFs. Full solver-stack integration: dense+sparse assembly, mass, geometric stiffness, buckling, stress recovery, all load types. Navier plate 2×2: 98%, Scordelis-Lo 2×2: 96%, spherical cap self-convergence 63%→92%→100%. 4 acceptance models (cantilever, mixed beam+slab, cylindrical tank, modal plate). | Curved/non-planar frontier remains weaker than SHB8-ANS; corotational extension |
| SHB8-ANS 8-node solid-shell element | Strong | `element/solid_shell.rs` with ANS anti-locking, full solver-stack integration, and strong gains on the curved/non-planar frontier. Hemisphere 16×16 improves to ~0.26 of reference, twisted beam improves into ~0.03–0.08 range, and flat-plate behavior remains credible. | Needs broader acceptance/workflow coverage, hardening, and performance maturity |
| Curved shell element | Strong | `element/curved_shell.rs` with direct curved-geometry formulation, consistent mass, geometric stiffness, pressure/self-weight/thermal/edge loading, stress recovery, and strong hemisphere performance. Hemisphere 8×8: ~0.94, 16×16: ~0.99, hemisphere-hole 16×16: ~1.00, Navier flat plate: ~0.93, Scordelis-Lo: ~0.82. | Twisted beam and Raasch hook remain weaker than ideal; family still needs broader workflow guidance and hardening |

**MITC4 vs MITC9 vs SHB8-ANS vs Curved-Shell Comparison**

| Benchmark | MITC4 | MITC9 | SHB8-ANS | Curved shell | Notes |
|-----------|-------|-------|-------|
| Navier plate (SS, uniform p) | 4×4: 93% | 2×2: 98%, 4×4: 95% | 81–84% | ~93% | MITC9 is strongest on efficient flat-shell accuracy; curved shell remains credible on flat behavior |
| Scordelis-Lo barrel vault | 6×6: 84% | 2×2: 96%, 6×6: 85% | — | ~82% | MITC9 is strongest here at low mesh density; curved shell is comparable and acceptable |
| Spherical cap R/t=100 | 4→8→16: 70→93→99% | 4→8→16: 63→92→100% | — | strong | MITC4, MITC9, and curved shell all perform well in the practical curved-shell zone |
| Hypar (neg. curvature) | 4→8→16→32: 15→42→76→100% | 4→8→16: 24→57→100% | — | — | MITC9 converges faster on this benchmark family |
| Twisted beam (MacNeal-Harder) | ~0.2% | ~0.1% | ~3–8% | ~1%+ | Curved shell improves materially over MITC4/MITC9; SHB8-ANS remains better on this frontier |
| Raasch hook (150° arc) | ~0.01% | ~0.01% | — | very low but nonzero | Frontier benchmark; keep as an aspirational tracker |
| Hemisphere | locked / tens× | locked / tens× | ~0.26 | ~0.94–1.00 | Curved shell is the strongest current family on the hemisphere class |
| Modal SS plate (f₁) | 8×8: 99.9% | 4×4: 95.8% | — | — | MITC4 and MITC9 are the clearest modal shell options today |
| Buckling (flat plate) | 8×8: 102% | — | — | — | MITC4 currently has the clearest flat-shell buckling benchmark line |

The comparison confirms: `MITC4`, `MITC9`, `SHB8-ANS`, and curved shells now form a real multi-family shell stack. `MITC9` converges faster on fewer elements for standard shell benchmarks, `SHB8-ANS` materially improves the non-planar frontier, and the curved-shell family closes the hemisphere-class gap. The remaining shell work is now selection guidance, workflow hardening, and shell-adjacent breadth rather than missing core shell families.

| Curved beams | Partial | `element/curved_beam.rs`, `validation_curved_beams.rs` | Current approach is segmented expansion, not native high-end formulation |
| Timoshenko beam / shear deformation | Good | `element/frame.rs`, shear-area fields in `types/input.rs`, `validation_timoshenko_solver.rs` | Needs broader production validation across all solver modes |
| Cable / catenary element | Good | `element/cable.rs`, `solver/cable.rs`, `integration_cable_solver.rs` | Needs broader bridge/cable-net/staged benchmark depth |
| Warping torsion / 7th DOF | Good | 14-DOF plumbing in `assembly.rs`, `element/frame.rs`, `element/fef.rs`, legacy placeholder tests still in `validation_warping_torsion.rs` | Needs benchmark hardening, cleanup of stale placeholder tests, and broader mixed-model validation |
| Thermal loads / settlements / springs | Strong | `validation_thermal_*`, `validation_prescribed_*`, `validation_spring_supports.rs` | More coupled / 3D edge cases |
| Winkler foundation solvers (2D/3D) | Good | `solver/winkler.rs`, `integration_winkler.rs`, `validation_foundation_interaction.rs` | Broader SSI families beyond Winkler and tougher benchmark parity |
| Nonlinear SSI beyond Winkler | Good | `solver/ssi.rs`, `solver/soil_curves.rs` | Needs broader workflow integration, benchmark depth, and stronger mixed-model coupling |
| Constraint technology | Good | `solver/constraints.rs`, constraint types in `types/input.rs`, base solver integration, reusable `FreeConstraintSystem` for reduced/expanded constrained solves, connector/eccentric coverage, and broader constraint-force output parity | Needs broader solver-family unification, chained-constraint maturity, and workflow hardening |
| Contact / gap / unilateral support behavior | Good | `solver/contact.rs`, benchmark-gate coverage, damping / augmented-Lagrangian / friction support | 2D and 3D support exist; the remaining gap is harder contact variants and hardening |
| Nonlinear solution controls | Good | `solver/line_search.rs`, `solver/adaptive_stepping.rs`, `solver/arc_length.rs` | Controls exist, but they still need broader integration, benchmark depth, and harder-path validation |
| Fiber / section-based beam-column elements | Good | `element/fiber_beam.rs`, `solver/fiber_nonlinear.rs` | 2D and 3D distributed plasticity exist; the remaining gap is benchmark depth and workflow hardening |
| Initial imperfections / residual stress | Good | `solver/imperfections.rs`, new input types in `types/input.rs` | Needs broader nonlinear integration and benchmark depth |
| Pressure loads on plates | Good | `SolverLoad3D::Pressure`, plate validation files | Better load vectors and shell-quality convergence |
| Plate thermal loads / stress recovery | Good | `element/plate.rs`, recent plate integration tests | More benchmark depth and smoothing/quality validation |
| Prestress / post-tension FE analysis | Good | `solver/prestress.rs`, `solver/staged.rs`, `integration_staged_analysis.rs`, `integration_staged_3d.rs` | Real PT depth now exists, but coupled long-term behavior and broader workflow coverage remain open |
| Construction staging | Good | `solver/staged.rs`, `integration_staged_analysis.rs`, `integration_staged_3d.rs` | 2D and 3D staged solvers exist; broader workflow depth and time-dependent coupling remain open |
| Creep / shrinkage / relaxation response | Good | `solver/creep_shrinkage.rs` | Needs broader staged/PT coupling and benchmark depth |
| Model reduction / substructuring | Good | `solver/reduction.rs`, reduction exports in `lib.rs`, 2D/3D Guyan and Craig-Bampton support, FCS integration | Needs workflow integration, larger-model benchmarks, and clearer production usage |
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

Today the engine is already competitive in the first program's linear and second-order core, and it now also has real entries in constraints, SSI, contact, path-following controls, fiber nonlinear analysis, quadrilateral shell formulation, imperfections, time-dependent response, and reduction/substructuring. The biggest remaining gaps are now hardening, workflow maturity, shell depth, scale, and public proof on the newest advanced features.

---

## Priority and Parity Framework

The sections below describe current capability and current gaps. This section answers a different question:

- If the current gap list were completed, what solver-layer capabilities would still matter to become truly world-class?
- What still separates Dedaliano from the strongest open-source solver projects?

### What Still Separates Dedaliano From The Strongest Open Solvers

Based on the current code, tests, and benchmark surface, the remaining differences are no longer about missing the basics. They are:

1. `Shell hardening`
   MITC4+EAS-7, MITC9, and SHB8-ANS are all implemented, benchmark-validated, and at least partially acceptance-covered. The remaining shell work is no longer “do we need another family?” but rather how to harden, benchmark, and guide the multi-family shell stack in production workflows.

2. `Long-tail nonlinear maturity`
   More years of hardened mixed nonlinear edge cases are still needed, especially around contact + nonlinear + staging and shell + nonlinear interaction.

3. `Performance / scale maturity`
   Sparse Cholesky runtime gains are now measured across all three shell families: 4.5× at 700 DOFs → 22× at 2600 DOFs → 77-89× at 5700 DOFs (factorization only), 22× end-to-end at 30×30 MITC4, 0 perturbations. Modal 3D now has a sparse eigensolver path with an `11.8×` measured speedup at 20×20 MITC4, and buckling 3D now has the same sparse eigensolver pattern in the common unconstrained case. Fill ratio grows from 2.6× to 7.0× with mesh size, and AMD is now measured to beat RCM on fill at larger shell meshes. Next steps are deeper sparse eigensolver integration, runtime measurement on the newly sparse workflows, and eigensolver cleanup.

4. `Full solver-path consistency`
   Dense vs sparse, constrained vs unconstrained, shell vs frame-shell mixed, and advanced nonlinear paths must keep converging to the same behavior.

5. `Benchmark moat expansion`
   Dedaliano is already strong here, but broader external-reference proof is also the most realistic path to becoming the best open structural solver.

This changes the strategic target:

- not `be broader than every open-source mechanics framework`
- but `be the strongest open structural solver with the deepest visible proof of correctness`

### Solver-First Priority Stack

This is the solver-core ordering to use when the goal is technical leadership rather than short-term product breadth.

#### Ranked Order

1. ~~`Measure real runtime gains`~~ — DONE (22-89× factorization speedup, 22× end-to-end)
2. `Broader sparse-path reuse`
3. `Fill-ratio investigation` (AMD ordering, grows 2.6-7.0× with mesh size)
4. `Verification hardening around the new sparse path`
5. `Long-tail nonlinear hardening`
6. `Product surfacing`
7. `Solver-path consistency`
8. `Constraint-system maturity`
9. `Advanced contact maturity`
10. `Shell-family workflow maturity`
11. `Reference benchmark expansion`
12. `Reduction, staged/PT coupling, and other second-tier depth`

#### Time-Bucketed View

##### 0-3 months

| Priority | Topic | Why now |
|----------|-------|---------|
| 1 | Performance and scale engineering | Sparse runtime gains measured (22-89× factorization, 22× end-to-end, 0 perturbations). Modal 3D now has a sparse eigensolver path (`11.8×` speedup at 20×20 MITC4), buckling 3D now follows the same sparse eigensolver pattern, and AMD is the measured fill winner at larger shell meshes. Next: deepen sparse eigensolver integration and clean up eigensolver debt. |
| 2 | Verification hardening | Expand invariants, property-based tests, fuzzing, benchmark gates, and acceptance models around the newest sparse, shell, and nonlinear solver paths. |
| 3 | Solver-path consistency | Dense vs sparse, constrained vs unconstrained, and mixed shell/frame workflows must keep converging to the same behavior. |
| 4 | Long-tail nonlinear hardening | The biggest remaining gap versus the deepest open solvers is robustness on hard nonlinear mixed workflows. |
| 5 | Shell-family hardening and guidance | The shell stack is broad enough; the next work is family selection guidance, layered/axisymmetric/nonlinear shell workflow depth, and broader workflow hardening. |
| 6 | Constraint-system maturity | Reusable constrained reductions now exist; the next step is consistent use across solver families plus the last remaining workflow gaps. |
| 7 | Advanced contact maturity | Basic and advanced contact are present; the next layer is harder convergence cases, richer contact laws, and broader benchmark depth. |
| 8 | Diagnostics, health checks, and explainability | Better warnings, pre-solve checks, conditioning/reporting, and solve visibility can make the solver materially more mature in practice. |

##### 3-6 months

| Priority | Topic | Why now |
|----------|-------|---------|
| 9 | Reference benchmark expansion | Keep extending external-reference coverage as new solver paths and deeper shell/contact/fiber/SSI workflows land; this is the main moat against stronger mature open solvers. |
| 10 | Benchmark and acceptance-model expansion | Real-model acceptance cases should grow with the new solver surface and become a stronger release discipline layer. |
| 11 | Model reduction / substructuring workflow maturity | Core reduction now exists; the remaining work is workflow integration and larger-model benchmark depth. |
| 12 | Deeper prestress / staged time-dependent coupling | Prestress exists; long-term staged PT workflows still need more coupling depth. |
| 13 | Specialized shell depth beyond the current stack | Corotational extension, broader solid-shell hardening, and any future shell-family expansion beyond MITC4 / MITC9 / SHB8-ANS remain later work. |
| 14 | Deterministic behavior and numerical robustness policy | Convergence criteria, warnings, fallback behavior, and solver-path consistency should become standardized across the engine. |
| 15 | Golden acceptance-model suite | A small flagship public must-pass set should become part of the trust story. |
| 16 | Result explainability and solve progress | Engineers need clearer iteration/progress visibility, active-set/yield reporting, and balance diagnostics on hard models. |

##### 12 months+

| Priority | Topic | Why later |
|----------|-------|-----------|
| 17 | Fire / fatigue / specialized lifecycle domains | Important, but no longer core to claiming an elite mainstream structural solver |
| 18 | Membranes / cable nets / specialized tensile structures | Valuable for long-span specialty markets rather than mainstream parity |
| 19 | Bridge-specific advanced workflows | High-value specialization once the core solver is fully hardened |
| 20 | Broader domain expansion | Additional specialty areas should come after the mainstream structural core is clearly dominant |

#### Must Do Before Claiming Top-Tier

| Priority | Topic | Why It Matters |
|----------|-------|----------------|
| 1 | Performance / scale engineering | Sparse runtime gains measured (22-89× factorization, 22× end-to-end). Sparse reuse is partly done in modal/buckling/harmonic/reduction, modal and buckling 3D already have sparse eigensolver paths, and the next steps are deeper sparse eigensolver integration, runtime measurement on the newly sparse workflows, and eigensolver robustness. |
| 2 | Verification hardening on newest solver families | The remaining differentiator is now proof and hardening, not only additional categories. |
| 3 | Long-tail nonlinear maturity | Hard mixed workflows and difficult convergence behavior are where the deepest open solvers still have more years of hardened edge cases. |
| 4 | Solver-path consistency | Dense/sparse, constrained/unconstrained, and shell/mixed-model parity all matter for trust. |
| 5 | Shell-family hardening and workflow breadth | MITC4, MITC9, and SHB8-ANS now form a real production shell stack. The remaining work is guidance, layered/axisymmetric/nonlinear shell workflows, and frontier hardening rather than missing family breadth. |
| 6 | Advanced contact variants | Contact exists; the remaining step is richer contact behavior and harder convergence cases. |
| 7 | Deeper prestress / staged time-dependent coupling | Time-dependent response exists, but PT/staged coupling still needs more depth. |
| 8 | Model reduction / substructuring workflow maturity | Reduction exists; the remaining step is to make it a reliable large-model workflow tool. |
| 9 | Specialized domain expansion | Fire, fatigue, membranes, cable nets, and bridge-specific workflows come after the mainstream core is hardened. |

#### Important For Parity

| Priority | Topic | Why It Matters |
|----------|-------|----------------|
| 8 | Better soil-structure workflow integration | Beyond standalone SSI: stronger coupling into foundation, staged, and infrastructure workflows |
| 9 | Deeper staged / prestress / time-dependent coupling | The ingredients now exist separately; the remaining work is stronger combined workflows |
| 10 | Fire / fatigue / lifecycle domains | Important for specific markets after the mainstream solver is fully hardened |
| 11 | Bridge-specific advanced workflows | Important for infrastructure specialization rather than mainstream parity |
| 12 | Membranes / cable nets / specialized tensile structures | Important for specialty long-span markets, not mainstream parity |

### Difficulty Ladder

This is the approximate implementation difficulty ordering for the remaining solver-core gaps. It is intentionally different from the solver-first priority order above.

#### Low to Medium

| Topic | Status | Why |
|---|---|---|
| Staged truss/cable force handling | Completed | This was a contained staged/result-reconstruction cleanup, not a new solver family. |
| Warping torsion core implementation | Completed | The core 14-DOF implementation now exists; the remaining work is validation cleanup and hardening. |
| Full PT depth improvements | Completed | Prestress/PT depth has moved from clear gap to implemented-but-still-hardening. |
| Public API exposure for new solver families | Completed | The newest solver families are now being exposed through the main engine surface. |
| Legacy validation cleanup | Open | Some old placeholder files, especially warping, no longer match the code. |

#### Medium

| Topic | Status | Why |
|---|---|---|
| SSI beyond Winkler | Completed | `p-y`, `t-z`, and `q-z` support now exists; remaining work is hardening. |
| Constraint technology | Completed | MPCs, rigid links, diaphragms, and equal-DOF support now exist in the main solver flow. |
| MITC4 integration into the main model path | Completed | The quadrilateral shell element is wired into standard input and assembly with Bathe-Dvorkin ANS shear tying plus EAS-7 membrane enhancement. |
| Initial imperfections / initial state basics | Completed | Initial geometric imperfections and residual-stress inputs now exist; remaining work is hardening and benchmark depth. |

#### Medium to High

| Topic | Status | Why |
|---|---|---|
| Nonlinear solution controls | Completed | Line search, adaptive stepping, arc-length, and displacement control now exist; remaining work is broader hardening. |
| Contact / gap basics | Completed | Basic unilateral/contact capability now exists in 2D and 3D. |
| 3D contact maturity | Completed | 3D gap and uplift support now exist; remaining work is harder contact variants and hardening. |

#### High

| Topic | Status | Why |
|---|---|---|
| 3D fiber / section-based beam-column elements | Completed | 2D and 3D distributed plasticity now exist; remaining work is hardening and benchmark depth. |
| Time-dependent creep / shrinkage / relaxation response | Completed | Time-dependent structural response now exists; remaining work is broader staged/PT coupling and benchmark depth. |
| Model reduction / substructuring | Completed | Guyan and Craig-Bampton reduction now exist; remaining work is workflow integration and benchmark depth. |

#### Very High

| Topic | Status | Why |
|---|---|---|
| Advanced shell technology | Strong | MITC4 (ANS+EAS-7), MITC9 (ANS, 9-node quad), and SHB8-ANS solid-shell now form a multi-family shell stack. MITC9 outperforms MITC4 at lower mesh density on standard shell benchmarks, while SHB8-ANS materially improves the curved/non-planar frontier. Full solver-stack integration now spans dense+sparse assembly, mass, geometric stiffness, buckling, stress recovery, and shell-family benchmark gates. Remaining: shell-family workflow guidance, hardening, and deeper frontier acceptance coverage. |

---

## Benchmark Ledger

### Industry Standards & Design Codes

### AISC 360-22 (46 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_aisc_stability.rs` | 6 | AISC 360-22 Commentary Cases 1 & 2 | B1 braced, B2 sway amplification, convergence, equilibrium |
| `validation_effective_length.rs` | 8 | AISC Manual Commentary C2 | K=1.0/0.5/0.7/2.0, braced vs unbraced, stiffness ranking |
| `validation_frame_classification.rs` | 8 | AISC 360-22 Ch.C, EN 1993-1-1 §5.2 | Sway/non-sway, braced/unbraced, fixed vs pinned base |
| `validation_notional_loads.rs` | 8 | AISC 360-22 §C2, EC3 §5.3, CSA S16 §8.4 | Notional 0.2-0.5% gravity, proportionality, multi-story |
| `validation_braced_frame.rs` | 8 | AISC 360-16 Ch.C, McCormac 6th | X-brace, K-brace, chevron, diagonal force=H/cos(θ) |
| `validation_braced_frames.rs` | 8 | AISC 360-16 Ch.C, Salmon/Johnson 5th | Stiffness increase, sway reduction, multi-story drift |

### AISC 360 — Steel Design (48 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_lateral_torsional_buckling.rs` | 8 | EN 1993-1-1 §6.3.2, AISC 360-22 Ch.F | SS uniform moment, fixed-fixed, cantilever, length effects |
| `validation_structural_steel_design.rs` | 8 | AISC 360-22 | Compact flexure, LTB, shear capacity, web crippling |
| `validation_steel_connections.rs` | 8 | AISC 360-22 Ch.J | Bolt shear/bearing, eccentricity, weld strength, base plate |
| `validation_plate_girder_design.rs` | 8 | AISC 360-22 Ch.G | Web shear buckling, tension field, stiffeners, flange local buckling |
| `validation_steel_deck_design.rs` | 8 | AISC 360/SDI | Section properties, composite moment, diaphragm shear, ponding |
| `validation_design_code_interaction.rs` | 8 | AISC 360, ASCE 7, ACI 318 | H1-1 interaction, beam-column P-M, biaxial 3D, slenderness, shear-moment, bolt group, SCWB |

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

### ASCE 7-22 (79 tests across 9 files)

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
| `validation_seismic_extended.rs` | 8 | ASCE 7-22 §12.8, EC8 | ELF base shear, modal SRSS, drift limit, P-delta stability, period estimation, redundancy, torsional irregularity, vertical distribution |

### AASHTO HL-93 & Bridge Codes (48 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_moving_loads.rs` | 8 | Kassimali, AASHTO HL-93 | Single axle, 2-axle, HL-93 truck, continuous negative moment |
| `validation_moving_load_bridges.rs` | 7 | AASHTO LRFD 9th, EN 1991-2 LM1/LM2 | Axle spacing, shear envelope, mesh convergence |
| `validation_bridge_design.rs` | 8 | AASHTO LRFD, EN 1991-2 | HL-93, LM1, distribution factors, load combinations |
| `validation_bridge_engineering.rs` | 8 | AASHTO LRFD | Distribution factors, dynamic allowance, composite width, overhang |
| `validation_highway_bridge_loading.rs` | 8 | AASHTO HL-93, EC1 LM1/LM2 | Truck+lane, tandem+UDL, fatigue truck, multi-lane reduction |
| `validation_bridge_loads.rs` | 8 | AASHTO HL-93 | Truck, lane load, tandem, impact factor |

### GSA / UFC / FEMA / EN 1991-1-7 (44 tests across 6 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_progressive_collapse.rs` | 6 | GSA 2013, EN 1991-1-7, Starossek | Member removal, alternate paths, redundancy |
| `validation_progressive_collapse_full.rs` | 8 | UFC 4-023-03, EN 1991-1-7, GSA 2016 | Corner column removal, tie force, accidental combination, DCR |
| `validation_pushover.rs` | 6 | FEMA 356, ATC-40, EC8 Annex B | Pushover curves, P-delta stiffness, near-critical |
| `validation_performance_based_design.rs` | 8 | FEMA P-58, ASCE 41 | PBEE hazard curve, fragility function, acceptance criteria, EAL |
| `validation_progressive_collapse_extended.rs` | 8 | GSA 2013, UFC 4-023-03, EN 1991-1-7 | Column removal, catenary action, Vierendeel, alternate load path DCR, tie force, key element, two-column removal, redundancy |
| `validation_pushover_extended.rs` | 8 | FEMA 356, ATC-40, EC8 | Capacity curve, hinge sequence, push pattern comparison, target displacement, ductility ratio, hinge rotation, weak story, symmetric frame |

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

### NDS 2018 / Timber (32 tests across 4 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_timber_design.rs` | 8 | NDS 2018 | Bending, compression, tension, combined, adjustment factors |
| `validation_timber_connections.rs` | 8 | NDS 2018 | Dowel-type, withdrawal, group action, geometry factors |
| `validation_wood_design.rs` | 8 | NDS 2018 | Size factor, column stability, bearing, notched beam shear |
| `validation_timber_design_extended.rs` | 8 | NDS 2018 | Beam deflection, Cp factor, glulam, beam-column interaction, notch shear, continuous, truss, creep |

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

### Foundation & Geotechnical Codes (56 tests across 7 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_foundation_design.rs` | 8 | ACI 318-19, Meyerhof | Spread footings, combined footings, mat foundations |
| `validation_geotechnical_bearing_capacity.rs` | 8 | Meyerhof, Hansen, Vesic | Bearing capacity factors, correction factors, net allowable |
| `validation_geotechnical_engineering.rs` | 8 | Terzaghi, Meyerhof, Rankine | General bearing capacity, earth pressure coefficients |
| `validation_pile_foundations.rs` | 8 | EC7, API RP 2A | Alpha-method, beta-method, group efficiency, design resistance |
| `validation_retaining_walls.rs` | 8 | Rankine, Coulomb | Active/passive pressure, overturning stability |
| `validation_geotechnical_slopes.rs` | 8 | Fellenius, Bishop, Janbu | Infinite slope, Fellenius, Bishop simplified |
| `validation_foundation_design_extended.rs` | 8 | ACI 318, Hetenyi, Rankine | Spread footing, combined footing, strap footing, pile cap, retaining wall stem, grade beam, mat foundation, deep beam |

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

### Dynamic Wind Codes (16 tests across 2 files)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_dynamic_wind.rs` | 8 | EC1-1-4, ASCE 7 | Vortex shedding Strouhal, scruton number, gust factor, along-wind |
| `validation_wind_engineering_extended.rs` | 8 | ASCE 7, EC1-1-4 | Gust effect factor, vortex shedding, Cp distribution, dynamic amplification, load combination, shielding, drift |

### FRP / Composites (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_frp_composites.rs` | 8 | ACI 440, EC2 | FRP properties, laminate stiffness, FRP-RC flexure, strengthening |

### Precast Concrete (8 tests across 1 file)

| File | Tests | Reference | Topics |
|------|-------|-----------|--------|
| `validation_precast_concrete.rs` | 8 | PCI, ACI 318 | Hollow-core flexure, double-tee composite, corbel, bearing pad |

---

### Commercial Software Cross-Validation

### ANSYS Verification Manual (54 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_ansys_vm.rs` | 7 | VM1 (3-bar truss), VM2 (overhangs), VM4 (V-truss), VM10 (eccentric), VM12 (3D biaxial) |
| `validation_ansys_vm_extended.rs` | 18 | VM3 (stepped), VM5/6 (thermal), VM7 (gradient), VM8 (truss), VM9 (space truss), VM13 (portal), VM14 (cantilever), VM21 (tie rod), VM156 (P-delta) |
| `validation_ansys_vm_additional.rs` | 8 | VM11 (plate), VM15 (nonlinear), VM16 (Euler), VM17, VM20, VM25 (2-span), VM44 (ring) |
| `validation_ansys_vm_benchmarks.rs` | 8 | VM22 (axial+bending cantilever), VM23 (Winkler), VM26 (2-span partial UDL), VM27 (thermal gradient), VM30 (3D space truss), VM33 (3-bar truss), VM34 (thermal 2-bar), VM40 (large deflection) |
| `validation_ansys_vm_additional.rs` | 8 | VM29 (SS beam frequencies), VM31 (free-free beam), VM35 (tension stiffening), VM36 (cantilever buckling), VM37 (moving load), VM38 (symmetric loads), VM39 (partial UDL), VM41 (3D L-frame) |

### SAP2000 / CSI (26 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_sap2000.rs` | 10 | Simple beam, continuous, portal, 2-story modal, braced+leaning column, end releases, springs, prescribed displacement, P-delta, cantilever stiffness |
| `validation_sap2000_extended.rs` | 8 | Three-span continuous UDL, two-story two-bay frame, Warren truss, Gerber beam with hinge, 3D L-frame torsion, 3-story shear building modal, P-delta amplified portal, beam with settlement |
| `validation_sap2000_additional.rs` | 8 | Multi-story gravity+lateral, two-bay portal sway, pattern loading envelope, P-delta column, 3-story modal, 3D space frame torsion, Warren truss bridge, propped cantilever settlement |

### Code_Aster SSLL (25 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_code_aster.rs` | 9 | SSLL010 (lattice), SSLL012 (bar loads), SSLL014 (portal), SSLL100 (L-frame), SSLL102 (clamped beam), SSLL103 (Euler), SSLL105 (L-structure), SSLL110 (self-weight), SSLL400 (variable section) |
| `validation_code_aster_extended.rs` | 8 | SSLL101 (clamped-pinned UDL), SSLL104 (SS point load at L/3), SSLL106 (3-span continuous UDL), SSLL107 (propped cantilever midspan), SSLL108 (portal combined), SSLL111 (thermal 2-bar), SSLL112 (spring support), SSLL113 (fixed-fixed partial UDL) |
| `validation_code_aster_additional.rs` | 8 | SSLL101a (SS point load), SSLL101b (cantilever UDL), SSLL102a (3-span continuous), SSLL105a (portal sway), SSLL106a (truss), SSLL107a (Winkler), SSLL110a (thermal), SSLL116a (modal cantilever) |

### NAFEMS (30 DONE)

| File | Tests | Benchmarks |
|------|-------|------------|
| `validation_nafems.rs` | 6 | FV2 (axial), FV12 (cantilever vibration), FV32 (SS UDL), T3 (thermal), LE5 (Z-section 3D), FV52 (pin-jointed cross) |
| `validation_nafems_extended.rs` | 8 | FV1 (SS center), FV13 (SS vibration), FV31 (cantilever tip), FV51 (portal vibration), LE10 (3D bending+torsion), T1 (thermal gradient), FV41 (lumped mass), R0031 (3D truss) |
| `validation_nafems_benchmarks.rs` | 8 | LE1 (load distribution), FV22 (cantilever ~1.03 Hz), FV42 (SS beam 3 modes), FV72 (free-free beam), T2 (thermal expansion), R0001 (SS beam UDL), R0015 (3-bar truss), R0024 (portal lateral) |
| `validation_nafems_additional.rs` | 8 | LE1 (grid equilibrium), FV2 (SS beam frequencies), FV4 (cantilever modes), FV12 (free-free frequencies), FV32 (laminate vibration), T1 (thermal bar), LE10 (grillage bending), R0031 (3D beam) |

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

### Textbook Classics (~1688 tests)

### Beam Theory (19 files, ~142 tests)
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
- `validation_roark_extended.rs` (8) — Roark Cases 8a/8e/3a/3e/2d/1d/2c-partial, overhanging beam
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

### Continuous Beams (7 files, ~54 tests)
- `validation_continuous_beams.rs` (6) — 2-span, 3-span, Ghali/Neville
- `validation_three_moment_equation.rs` (8) — Clapeyron (1857)
- `validation_continuous_patterns.rs` (8) — ACI 318 §6.4, EC2 §5.1.3 checkerboard
- `validation_moment_redistribution.rs` (8) — Cross (1930), adding supports
- `validation_continuous_beam_analysis.rs` (8) — 3/4-span interior moments, reactions, symmetry
- `validation_continuous_beam_patterns.rs` (8) — Checkerboard patterns, moment envelope effects
- `validation_continuous_beam_extended.rs` (8) — Two/three/five-span, propped cantilever, pattern loading, unequal spans, settlement, overhang, symmetry

### Indeterminate Methods (24 files, ~189 tests)
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
- `validation_ghali_neville_extended.rs` (8) — Force method 2-span, propped cantilever, portal sway, stiffness modification, settlement
- `validation_weaver_gere_extended.rs` (8) — Propped cantilever stiffness, fixed asymmetric, 2-span, portal sway, grid beam, gable frame
- `validation_hibbeler_extended.rs` (8) — Conjugate beam, virtual work frame, three-moment, moment distribution, influence line, settlement
- `validation_mcguire_ziemian_extended.rs` (8) — Assembly, geometric stiffness, portal, P-delta frame, 3D space frame, truss, stability eigenvalue, moment redistribution

### Energy Methods (9 files, ~76 tests)
- `validation_fundamental_theorems.rs` (12) — Maxwell-Betti, Clapeyron, Castigliano
- `validation_energy_methods.rs` (8) — Castigliano (1879), Maxwell (1864), Betti (1872)
- `validation_castigliano.rs` (8) — δ=∂U/∂P
- `validation_reciprocal_theorem.rs` (8) + `validation_reciprocal_theorems.rs` (8)
- `validation_virtual_work.rs` (8) — δ=∫Mm/EI dx
- `validation_unit_load_deflections.rs` (8)
- `validation_superposition.rs` (8)
- `validation_energy_methods_extended.rs` (8) — Strain energy, Castigliano derivative, virtual work, Maxwell reciprocal, Betti's theorem, minimum potential energy, complementary energy, work-energy consistency

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

### Trusses (10 files, ~80 tests)
- `validation_trusses.rs` (6) — Equilateral, Warren, Pratt, indeterminate
- `validation_truss_methods.rs` (8) — Joints, sections, zero-force members
- `validation_truss_method_of_joints.rs` (8)
- `validation_truss_topology.rs` (8) — Warren, Pratt, Howe, K-truss
- `validation_truss_benchmarks.rs` (8) — Thermal, settlement, space truss
- `validation_cable_truss_structures.rs` (8) — V-shape, fan, deep vs shallow
- `validation_cable_truss_tension.rs` (8)
- `validation_3d_truss_structures.rs` (8) — Tetrahedral, tower, bridge
- `validation_truss_behavior_fundamental.rs` (8) — 3-bar triangle, axial bar, Warren 2-panel
- `validation_kassimali_trusses.rs` (8) — 3-bar, Warren 6-panel, Pratt, Howe, K-truss, compound Fink, thermal truss

### 3D Analysis (34 files, ~260 tests)
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
- `validation_przemieniecki_3d.rs` (8) — Space truss, biaxial bending, L-frame torsion, grillage, inclined beam, 3D portal
- `validation_3d_frames_extended.rs` (8) — Cantilever torsion, biaxial bending, 6-bar space truss, right-angle frame, 3D portal lateral, inclined column
- `validation_3d_advanced_analysis.rs` (8) — Biaxial portal, space truss tower, grillage bridge deck, rigid diaphragm, torsional warping, eccentric loading, multi-story 3D frame, helical stair

### Buckling & Stability (23 files, ~186 tests)
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
- `validation_chen_lui_stability.rs` (8) — P-delta amplification, effective length, braced vs unbraced, leaning column, sway frames
- `validation_buckling_extended.rs` (8) — Pin-pin, fixed-free, fixed-pin, fixed-fixed columns, portal sway, multi-story, braced vs unbraced, variable section
- `validation_pdelta_extended.rs` (8) — Column amplification B2, two-story drift, leaning column, gravity compression, soft story, near-Pcr convergence, symmetry, braced vs unbraced

### Dynamic Analysis (24 files, ~180 tests)
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
- `validation_clough_penzien_dynamics.rs` (8) — Cantilever fundamental, SS beam 3 modes, portal sway, Newmark impulse, spectral
- `validation_dynamic_integration.rs` (8) — Free vibration period, step load DAF=2, damped decay, harmonic resonance, Newmark energy, HHT-alpha, multi-DOF modes
- `validation_modal_extended.rs` (8) — SS beam modes, cantilever 3 modes, portal sway, two-story shear, added mass, stiffness effect, orthogonality, Rayleigh quotient
- `validation_spectral_extended.rs` (8) — SDOF Sd, SRSS, CQC, participation factors, base shear distribution, design spectrum shape, interstory drift
- `validation_harmonic_extended.rs` (8) — SDOF resonance peak, far-from-resonance, damped peak reduction, frequency sweep, multi-DOF peaks, phase at resonance, half-power bandwidth, anti-resonance

### Plastic & Nonlinear (13 files, ~87 tests)
- `validation_plastic_collapse.rs` (8) — Neal: exact collapse loads
- `validation_plastic_mechanisms.rs` (8) — Mechanism types, EN 1993-1-1 §5.6
- `validation_plastic_hinge_sequence.rs` (8)
- `validation_material_nonlinear.rs` (3) + `validation_material_nonlinear_benchmarks.rs` (8)
- `validation_pushover.rs` (6) — FEMA 356, ATC-40
- `validation_corotational.rs` (4) + `validation_corotational_benchmarks.rs` (5) + `validation_advanced_corotational.rs` (4)
- `validation_corotational_extended.rs` (8) — Williams toggle, large rotation cantilever, Lee frame, arch snap-through, shallow arch, elastica, post-buckling, 2-bar truss
- `validation_plastic_analysis.rs` (8) — Plastic moment, upper/lower bound theorems, shape factors
- `validation_plastic_analysis_theorems.rs` (8) — SS Mp, fixed collapse, portal sway, combined mechanism
- `validation_neal_plastic_extended.rs` (8) — SS beam Pc=4Mp/L, fixed 16Mp/L², propped cantilever, portal combined, 2-span UDL, sway mechanism, upper/lower bound

### Thermal, Settlement, Springs, Foundation (12 files, ~92 tests)
- `validation_thermal_settlement.rs` (10) + `validation_thermal_effects.rs` (8)
- `validation_prescribed_displacements.rs` (8) + `validation_prescribed_settlement.rs` (8)
- `validation_settlement_effects.rs` (8) + `validation_support_settlement_effects.rs` (8)
- `validation_spring_supports.rs` (8)
- `validation_winkler_foundation.rs` (4) + `validation_foundation_interaction.rs` (8)
- `validation_thermal_settlement_extended.rs` (8) — Restrained bar, gradient cantilever, continuous thermal, portal thermal, settlement propped, double settlement, thermal truss, combined
- `validation_winkler_extended.rs` (8) — Hetenyi point load, semi-infinite decay, rigid beam, varying stiffness, modulus proportionality, stiffness ratio limits, moment load, superposition
- `validation_fire_resistance_extended.rs` (8) — Elevated temperature, thermal gradient restrained/free, fire compartment, EN 1993-1-2 kE, critical temperature, one-side bowing, column fire, superposition

### Influence Lines & Moving Loads (5 files, ~40 tests)
- `validation_influence_lines.rs` (8) + `validation_muller_breslau.rs` (8)
- `validation_moving_loads.rs` (8) + `validation_moving_load_bridges.rs` (7)
- `validation_moving_loads_extended.rs` (8) — SS single/two axles, continuous envelope, max shear position, IL reaction/moment, bridge two-lane, Müller-Breslau

### Stress Analysis (5 files, ~38 tests)
- `validation_section_stress.rs` (8) — Navier, Jourawski, Mohr, Von Mises, Tresca
- `validation_stress_3d.rs` (6) — 3D Navier, biaxial, torsion, Von Mises
- `validation_mohr_circle_stress.rs` (8) — 2D/3D stress transformation, principal stresses, yield
- `validation_connection_mechanics.rs` (8) — Connection force mechanics, elastic method
- `validation_stress_analysis_extended.rs` (8) — Normal/shear/combined stress, principal transformation, von Mises, stress diagram, biaxial 3D, stress reversal

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

### Cables (6 files, ~48 tests)
- `validation_cable_structures.rs` (8) — Catenary thrust, parabolic sag, cable length, concentrated load
- `validation_cable_suspension_analysis.rs` (8) — Catenary sag, parabolic profile, support tension
- `validation_cable_analysis_advanced.rs` (8) — Ernst equivalent modulus, Irvine parameter
- `validation_cable_net_structures.rs` (8) — Orthogonal net, spoke-wheel, pretension
- `validation_cable_stayed_bridges.rs` (8) — Fan arrangement, Ernst modulus, tower compression
- `validation_cable_extended.rs` (8) — Catenary sag, point load parabolic, cable net, prestressed, cable-stayed beam, multi-segment, temperature, vibration frequency

### Plates & Shells (5 files, ~27 tests + shell benchmark suite)
- `validation_curved_beams.rs` (5) — Quarter-circle, Roark ring, parabolic arch
- `validation_plates.rs` (4) + `validation_scordelis_lo.rs` (3) + `validation_pressure_loads.rs` (4)
- `validation_shell_theory.rs` (8) — Spherical vessel, cylindrical, conical, edge bending
- `validation_thin_shell_structures.rs` (8) — Dome membrane, cylindrical roof, hypar, buckling
- `validation_plates_extended.rs` (8) — Timoshenko SS/clamped plate, rectangular/center load, mesh convergence, cantilever strip, patch test, modal frequency
- `shell_benchmark.rs` (~56+ tests) — **MITC4**: Scordelis-Lo convergence, Navier plate convergence, quad patch test, pinched hemisphere, pinched cylinder, QuadPressure, cantilever plate, shell buckling (flat plate, convergence, cylinder, triangle), shell modal, thermal (free expansion, restrained, gradient bending, gradient convergence), self-weight Scordelis-Lo, edge loads (normal, tangential), mesh distortion (aspect ratio, skew, taper, random), warped element accuracy, mixed frame-shell building, beam-shell coupling, mixed stress recovery, spherical cap, hypar, hemisphere, R/t sweep. **MITC9**: patch test, Navier plate convergence, Scordelis-Lo convergence, pinched hemisphere, spherical cap, hypar, twisted beam (A+B), Raasch hook, hemisphere R/t sweep. **SHB8-ANS**: frontier-gate coverage on hemisphere and twisted-beam class problems plus family-comparison checks.

### Plates & Shell Convergence (1 file, ~8 tests)
- `validation_plate_convergence.rs` (8) — Navier series SS plate, clamped mesh refinement, point load convergence, aspect ratio, cantilever strip, patch test, modal frequency, von Mises stress

### Other Textbook (misc files, ~98 tests)
- `validation_guided_y.rs` (3) — GuidedY support type
- `validation_kinematic.rs` (6) + `validation_3d_kinematic.rs` (7) — Mechanism detection
- `validation_rigid_body_modes.rs` (8) — Insufficient restraints
- `validation_composite_action.rs` (8) + `validation_composite_structures.rs` (8) + `validation_semirigid_connections.rs` (8)
- `validation_composite_extended.rs` (8) — Transformed section, full vs partial composite, effective width, column axial, two-material truss, mixed frame drift, temperature
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

### Mathematical Properties & Numerical Methods (~179 tests)

### Matrix & Stiffness Properties (6 files, ~47 tests)
- `validation_stiffness_modification.rs` (8) — Internal hinge, midspan hinge, fixed-to-propped
- `validation_stiffness_properties.rs` (7) — Rigid-body zero eigenvalues: 2D frame, 2D truss, 3D
- `validation_cross_section_effects.rs` (8) — Doubling Iz halves deflection, EI effects on indeterminate
- `validation_span_ratio_effects.rs` (8) — Equal vs unequal span, portal aspect ratio
- `validation_load_path_redundancy.rs` (8) — Parallel paths, unequal stiffness, brace reduces sway
- `validation_matrix_stiffness_extended.rs` (8) — Element stiffness coefficients, assembly symmetry, BC comparison, condition number, FEF assembly, superposition, static condensation, positive-definiteness

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

### Structural Reliability (2 files, ~16 tests)
- `validation_structural_reliability.rs` (8) — FORM index, Monte Carlo, LRFD, Hasofer-Lind
- `validation_reliability_extended.rs` (8) — Reserve factor, load factor proportionality, partial safety factors, reliability index, limit state checks, ASCE 7 combos, resistance variability, redundancy

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

### FEM Quality & Convergence (~78 tests)

### Convergence (4 files, ~31 tests)
- `validation_convergence.rs` (7) — h-refinement: cantilever tip, SS reactions, end moment
- `validation_mesh_convergence.rs` (8) — Coarse vs fine, deflection convergence, midspan moment
- `validation_finite_element_convergence.rs` (8) — h/p-refinement, patch consistency, Richardson extrapolation
- `validation_bathe_convergence.rs` (8) — h-refinement, Richardson extrapolation, stiffness bound, eigenvalue bounds, patch tests, rigid body modes, condition number

### Patch Tests (1 file, ~8 tests)
- `validation_patch_tests.rs` (8) — Truss uniform-strain, frame axial, beam pure-bending, rigid-body

### Element Verification (2 files, ~15 tests)
- `validation_mixed_elements.rs` (8) — Mixed beam/truss/spring models
- `validation_stiffness_properties.rs` (7) — Rigid-body eigenvalues

### Numerical Properties (1 file, ~8 tests)
- `validation_numerical_methods_extended.rs` (8) — Symmetry, positive definiteness, superposition, mesh convergence, condition number, load scaling, sparse vs dense, energy consistency

---

### Engineering Practice & Specialized Structures (~624 tests)

### Geotechnical & Foundations (13 files, ~104 tests)
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
- `validation_soil_structure_extended.rs` (8) — Winkler-Hetenyi, mat foundation, pile group cap, lateral earth pressure, surcharge, subgrade modulus, flexibility ratio, spring-supported portal

### Maritime, Offshore & Hydraulics (4 files, ~32 tests)
- `validation_marine_offshore.rs` (8) — Airy wave, Morison equation, hydrostatic, API wave load
- `validation_coastal_structures.rs` (8) — Wave force, breakwater armor, overtopping, wave run-up
- `validation_hydraulic_engineering.rs` (8) — Manning, Bernoulli, weir discharge, Darcy-Weisbach
- `validation_flood_hydraulics.rs` (8) — Manning's, weir flow, culvert capacity, Yarnell backwater

### Bridge Engineering (3 files, ~24 tests)
- `validation_suspension_bridges.rs` (8) — Suspension cable forces, stiffening girder, hanger design
- `validation_catenary_cable.rs` (8) — Catenary cable analysis formulas
- `validation_bridge_engineering_extended.rs` (8) — HL-93 truck moment envelope, continuous 3-span pier moments, grillage distribution, natural frequency screening, IL pier reaction, composite transformed section, skew effect, temperature gradient

### Wind Engineering (1 file, ~8 tests)
- `validation_snow_ice_loading.rs` (8) — Ground-to-roof, EC flat roof, sloped reduction, drift

### Specialty Civil Structures (15 files, ~120 tests)
- `validation_blast_resistant_design.rs` (8) — Friedlander wave, scaled distance, SDOF, DLF
- `validation_chimney_stack_design.rs` (8) — Along-wind, vortex shedding, thermal gradient, shell stress
- `validation_crane_loading.rs` (8) — Static wheel loads, runway moment, lateral forces, biaxial
- `validation_construction_staging.rs` (8) — Formwork pressure, shore load, reshoring, temp bracing
- `validation_staged_construction.rs` (8) — Two-phase beam, support addition/removal, element activation, staged loading, self-weight, frame erection, equilibrium
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

### Extended Validation — Wave 7 (8 files, 64 tests)
- `validation_cable_structures_extended.rs` (8) — Catenary thrust, sag ratio, Ernst modulus, cable vibration, Irvine parameter, thermal sag, multi-span, pretension
- `validation_nonlinear_extended.rs` (8) — Williams toggle, large rotation cantilever, shallow arch, 2-bar truss, second-order moments, column large deflection, follower moment, multi-step
- `validation_3d_dynamic_extended.rs` (8) — Biaxial modes, torsional mode, 3D portal sway, space truss modal, spectral 3D, mass participation, orthogonality, Rayleigh quotient
- `validation_influence_lines_extended.rs` (8) — SS midspan moment IL, continuous reaction, shear at quarter, Müller-Breslau, moving load max, cantilever IL, propped cantilever, two-span
- `validation_seismic_isolation_extended.rs` (8) — LRB stiffness, FPS period, equivalent damping, ASCE 7 displacement, superstructure force, period shift, HDR modulus, isolation effectiveness
- `validation_staged_construction_extended.rs` (8) — Two-phase beam, support addition, element activation, sequential loading, element removal, frame erection, cumulative displacement, staged vs instantaneous
- `validation_composite_design_extended.rs` (8) — Transformed section, effective width, full composite moment, partial interaction, deflection comparison, shear stud demand, construction stage, modular ratio
- `validation_arch_analysis_extended.rs` (8) — Three-hinge parabolic, two-hinge circular, tied arch, buckling, asymmetric loading, convergence, funicular shape, thrust vs span

### Extended Validation — Wave 8 (8 files, 64 tests)
- `validation_time_history_extended.rs` (8) — Free vibration period, damped decay, step load DAF, harmonic resonance, impulse response, energy conservation, two-DOF beating, ground motion base shear
- `validation_prestress_extended.rs` (8) — Elastic shortening, friction loss, anchorage set, load balancing, cracking moment, ultimate moment, long-term losses, concordant tendon
- `validation_concrete_design_extended.rs` (8) — Doubly reinforced, T-beam width, stirrup spacing, development length, crack width EC2, Branson Ie, column interaction, two-way slab
- `validation_steel_design_extended.rs` (8) — Compact beam moment, LTB zones, AISC column curve, web shear buckling, H1-1 interaction, base plate, moment connection bolts, deflection serviceability
- `validation_creep_shrinkage_extended.rs` (8) — EC2 creep, ACI 209, drying shrinkage, autogenous, effective modulus, age-adjusted EMM, relaxation, long-term deflection
- `validation_cold_formed_extended.rs` (8) — Effective width, distortional buckling, DSM flexure, DSM compression, C-section properties, web crippling, screw connection, purlin design
- `validation_connection_extended.rs` (8) — Bolt shear, bearing, weld strength, prying, eccentric bolt group, base plate, moment end plate, gusset
- `validation_eurocode_extended.rs` (8) — EC3 column buckling curves, LTB chi_LT, EC2 parabolic-rectangular, EC8 design spectrum, EC3-1-5 effective width, EC2 creep Annex B, EN 1990 combinations, EC3-1-8 joint classification

### Extended Validation — Wave 9 (6 files, 48 tests)
- `validation_geotechnical_extended.rs` (8) — Meyerhof bearing capacity, consolidation settlement, Rankine/Coulomb earth pressure, pile capacity (alpha+beta), infinite slope stability, Coulomb active/passive, soil spring modulus, deep foundation settlement
- `validation_aluminum_extended.rs` (8) — 6061-T6 properties, ADM buckling constants, member compression (inelastic/elastic), LTB, welded HAZ, fatigue detail, deflection comparison, thermal expansion
- `validation_frp_extended.rs` (8) — CFRP/GFRP/AFRP properties, rule of mixtures, laminate stiffness CLT, FRP strengthening ACI 440.2R, debonding check, shear strengthening, environmental factors, deflection with FRP
- `validation_precast_extended.rs` (8) — PCI hollow-core flexure, double-tee composite, corbel design, bearing pad, shear key, erection bracing, connection ductility, camber prediction
- `validation_fatigue_extended.rs` (8) — EC3 S-N curves, Miner accumulation, stress range spectrum, CAFL threshold, AISC fatigue categories, weld toe hot-spot stress, thickness correction, remaining life
- `validation_semirigid_extended.rs` (8) — Rigid vs pinned moment, spring stiffness effect, EC3 classification, semi-rigid deflection, moment redistribution, connection rotation, effective length, fixity factor

### Extended Validation — Additional (3 files, 24 tests)
- `validation_masonry_extended.rs` (8) — TMS 402 flexural capacity, axial compression, shear capacity, P-M interaction, slenderness effects, grout contribution, reinforcement limits, wall lateral capacity
- `validation_serviceability_extended.rs` (8) — Floor beam L/360, cantilever L/180, portal drift H/400, vibration frequency, long-term deflection ACI, ponding check, interstory drift, camber requirement
- `validation_eurocode_extended.rs` — see wave 8 above (already listed)

### Extended Validation — Wave 10 (8 files, 64 tests)
- `validation_virtual_work_extended.rs` (8) — Unit load cantilever, SS beam UDL, frame lateral, truss bar, Maxwell reciprocal, Castigliano, superposition, real vs virtual work
- `validation_plastic_analysis_extended.rs` (8) — Shape factor, plastic moment, fixed beam collapse, portal sway, combined mechanism, propped cantilever, upper/lower bound, 2-span UDL
- `validation_dynamic_mdof_extended.rs` (8) — 2-DOF frequencies, SRSS vs CQC, Rayleigh damping, modal superposition, base shear distribution, effective modal mass, orthogonality, stiffness matrix
- `validation_impact_loading_extended.rs` (8) — Falling weight, sudden load DLF=2, vehicle collision, dropped object, impulse-momentum, rebound factor, energy absorption, progressive deformation
- `validation_shear_deformation_extended.rs` (8) — Timoshenko vs Euler-Bernoulli, L/d effect, shear area, cantilever deep beam, SS deep beam, fixed beam, aspect ratio, convergence
- `validation_column_buckling_extended.rs` (8) — Euler pin-pin, fixed-free K=2, fixed-pin K=0.7, fixed-fixed K=0.5, inelastic buckling, AISC column curve, eccentrically loaded, stepped column
- `validation_lateral_torsional_buckling_extended.rs` (8) — SS uniform moment, Cb modification, unbraced length, cantilever Cb, moment gradient, fixed-fixed, load height effect, compact vs noncompact
- `validation_soil_dynamics_extended.rs` (8) — Site amplification, liquefaction CRR, Rayleigh wave, Newmark sliding block, 1D response amplification, surface wave dispersion, soil impedance, damping ratio

### Extended Validation — Wave 11 (7 files, 56 tests)
- `validation_fracture_mechanics_extended.rs` (8) — Griffith energy, SIF, Paris law, J-integral, CTOD, BS 7910 FAD, transition temperature, leak-before-break
- `validation_performance_based_extended.rs` (8) — ASCE 41 target displacement, FEMA P-58 fragility, acceptance criteria, EAL, IDA scaling, pushover bilinear, damage state, risk category
- `validation_structural_optimization_extended.rs` (8) — FSD, minimum weight truss, SIMP penalty, compliance sensitivity, Lagrangian, shape optimization, topology, buckling constraint
- `validation_matrix_methods_extended.rs` (8) — Element stiffness, transformation, assembly, bandwidth, condition number, partitioning, eigenvalue, sparse structure
- `validation_retaining_walls_extended.rs` (8) — Gravity wall, cantilever, counterfort, sheet pile, Mononobe-Okabe, toe/heel moment, stem design, global stability
- `validation_plate_girder_extended.rs` (8) — Web shear buckling, flange proportioning, TFA, stiffener design, hybrid girder, fatigue detail, lateral bracing, deflection
- `validation_curved_beams_extended.rs` (8) — Winkler-Bach, ring load, arch thrust, Castigliano, circular arch tributary width, ring boundary conditions, parabolic arch, curvature effect

### Extended Validation — Wave 12 (8 files, 64 tests)
- `validation_earthquake_engineering_extended.rs` (8) — ASCE 7 ELF, response modification R, story drift, torsional irregularity, P-delta stability, CQC/SRSS, vertical distribution, period estimation
- `validation_stability_design_extended.rs` (8) — Euler four BCs, alignment chart, inelastic buckling, plate buckling, shell buckling, effective length eigenvalue, DAM, B1/B2 amplification
- `validation_concrete_mechanics_extended.rs` (8) — Whitney block, modulus of rupture, ACI shear Vc, Branson Ie, development length, balanced reinforcement, T-beam, cracking moment
- `validation_structural_dynamics_extended.rs` (8) — Rayleigh quotient, Dunkerley lower bound, DAF, logarithmic decrement, TMD Den Hartog, half-power bandwidth, beating frequency, base isolation
- `validation_structural_health_monitoring_extended.rs` (8) — Frequency change detection, MAC correlation, load rating, strain-displacement, stiffness degradation, damage index, natural frequency shift, mode shape curvature
- `validation_shell_theory_extended.rs` (8) — Cylindrical membrane, spherical vessel, dome hoop stress, conical shell, shell buckling, ring stiffener, edge bending, pressure vessel combined
- `validation_footfall_vibration_extended.rs` (8) — AISC DG11, SCI P354 response factor, Murray criterion, ISO 10137, walking frequency harmonics, resonance build-up, continuous vibration, footbridge
- `validation_reinforcement_detailing_extended.rs` (8) — ACI 318 development length, standard hooks, lap splice, crack control, bar spacing, cover requirements, bundled bars, Class B splice

### Extended Validation — Wave 13 (8 files, 64 tests)
- `validation_beam_column_extended.rs` (8) — AISC H1-1 interaction, moment amplification B1/B2, secant formula, EC3 interaction, biaxial bending, braced vs sway, slenderness effect, plastic interaction
- `validation_stainless_steel_extended.rs` (8) — Ramberg-Osgood, CSM strain, cold-formed properties, fire performance, duplex grades, proof stress, austenitic buckling, weld reduction
- `validation_vibration_isolation_extended.rs` (8) — Transmissibility curve, rubber bearing, TMD Den Hartog, machine foundation, viscous damper, base isolation period, multi-DOF isolation, frequency ratio effect
- `validation_wind_loading_extended.rs` (8) — ASCE 7 velocity pressure qz, Kz exposure, gust effect factor, MWFRS, vortex shedding, topographic Kzt, internal pressure, directional Kd
- `validation_foundation_engineering_extended.rs` (8) — Terzaghi bearing, Meyerhof shape/depth, pile skin friction, pile end bearing, settlement elastic, consolidation, lateral earth pressure, deep foundation group
- `validation_truss_methods_extended.rs` (8) — Warren truss, Pratt truss, Howe truss, virtual work deflection, influence line, space truss, K-truss, compound truss
- `validation_timber_connections_extended.rs` (8) — NDS bolt capacity, nail lateral, lag screw withdrawal, split ring, EC5 Johansen, group action, geometry factor, connection ductility
- `validation_moment_distribution_extended.rs` (8) — Two-span symmetric, three-span UDL, portal sway, settlement effect, non-prismatic member, non-sway unequal columns, multiple cycles, combined load

### Extended Validation — Wave 14 (8 files, 64 tests)
- `validation_grillage_extended.rs` (8) — Bridge deck grillage, torsional stiffness, load distribution, skew effect, edge stiffening, mesh convergence, concentrated load sharing, composite action
- `validation_elastic_curve_extended.rs` (8) — SS beam UDL quartic, cantilever cubic, fixed-fixed, propped cantilever, point load, overhanging beam, double integration, boundary conditions
- `validation_seismic_detailing_extended.rs` (8) — Strong-column weak-beam, capacity design, confinement reinforcement, SCBF brace, shear wall boundary, special moment frame, beam-column joint, drift capacity
- `validation_steel_deck_extended.rs` (8) — Section properties, composite slab strength, construction stage deflection, diaphragm shear, shear stud, partial composite, ponding check, ILB deflection
- `validation_geometric_stiffness_extended.rs` (8) — Geometric stiffness matrix entries, string stiffness, P-delta amplification B2, stability functions, effective length eigenvalue, tension stiffening, leaning column, notional load
- `validation_load_combination_extended.rs` (8) — ASCE 7 LRFD governing, ASD combinations, EN 1990 fundamental, pattern loading, envelope max/min, counteracting uplift, companion action factors, thermal combination
- `validation_slab_design_extended.rs` (8) — One-way ACI thickness, two-way direct design, punching shear, yield line, Hillerborg strip, flat plate reinforcement, waffle slab, post-tensioned
- `validation_stress_analysis_extended2.rs` (8) — Pressure vessel, stress concentration, Mohr's circle, combined bending-torsion, von Mises yield, Tresca yield, beam stress distribution, stress transformation

### Extended Validation — Wave 15 (8 files, 64 tests)
- `validation_slope_deflection_extended.rs` (8) — Fixed-end FEM, propped cantilever 3EI/L, two-span interior moment, portal sway shear, settlement 6EIΔ/L², carry-over factor, unequal distribution, symmetric no-sway
- `validation_approximate_methods_extended.rs` (8) — Portal method two-story, cantilever method axial, two-moment approximation, fixed beam wL²/12, portal knee moment, multi-bay sharing, inflection point, ACI gravity coefficients
- `validation_suspension_bridges_extended.rs` (8) — Parabolic cable H=wL²/(8f), cable-stayed bending reduction, stiffening girder hangers, cable tension T=H/cos(θ), hanger distribution, multi-span continuity, asymmetric load, stiffened vs unstiffened
- `validation_blast_resistant_extended.rs` (8) — Friedlander waveform, SDOF DLF=2, reflected pressure, triangular pulse DLF, impulse-to-static, column deformation, section resistance, scaled distance
- `validation_crane_loading_extended.rs` (8) — Wheel loads, 25% impact factor, 20% lateral, two-wheel critical, bracket eccentricity, fatigue stress range, multiple cranes, L/600 deflection
- `validation_vierendeel_extended.rs` (8) — Single-panel moment transfer, multi-panel gravity, double vs single chord, web opening, lateral sway, panel point loading, reversed curvature, stiffness ratio effect
- `validation_multi_story_extended.rs` (8) — Two-story story shear, three-story drift, soft story, two-bay interior column, gravity axial accumulation, drift ratio, portal method moments, base shear equilibrium
- `validation_gable_frame_extended.rs` (8) — Symmetric gravity, lateral load, ridge point load, unbalanced snow, rafter thrust, knee brace effect, pitch angle effect, fixed vs pinned base

### Extended Validation — Wave 16 (8 files, 64 tests)
- `validation_marine_offshore_extended.rs` (8) — Morison force, hydrostatic pressure, jacket structure, monopile lateral, wave-current combination, buoyancy, deck load path, environmental combination
- `validation_dam_engineering_extended.rs` (8) — Gravity sliding FOS, overturning stability, hydrostatic cantilever, uplift pressure, arch ring thrust, buttress sharing, spillway pier, Westergaard added mass
- `validation_tunnel_lining_extended.rs` (8) — Overburden pressure, Curtis solution, box culvert, ground reaction, segmental ring thrust, surcharge, rectangular tunnel, lining thickness
- `validation_chimney_stack_extended.rs` (8) — Along-wind triangular, vortex shedding, self-weight axial, combined loading, temperature gradient, tapered stepped, guy wire, P-delta amplification
- `validation_silo_tank_extended.rs` (8) — Janssen equation, hydrostatic wall, wind buckling, ring beam, hopper support ring, sloshing frequency, foundation ring, combined loading
- `validation_storage_rack_extended.rs` (8) — Upright column, pallet beam moment, frame sway, semi-rigid connector, down-aisle stability, cross-aisle bracing, base plate, progressive collapse
- `validation_glass_structures_extended.rs` (8) — Glass fin deflection, laminated effective thickness, column buckling, post-breakage, balustrade cantilever, thermal stress, facade wind, aspect ratio
- `validation_nuclear_containment_extended.rs` (8) — Internal pressure, DBA pressure, dome membrane, liner strain, thermal gradient, seismic cantilever, penetration reinforcement, combined loads

### Extended Validation — Wave 17 (8 files, 64 tests)
- `validation_advanced_concrete_extended.rs` (8) — Strut-and-tie, T-beam effective width, torsion cracking, post-tensioned load balancing, two-way slab moments, ACI coefficients, development length, modular ratio
- `validation_coastal_structures_extended.rs` (8) — Wave force vertical wall, breakwater armor Hudson, overtopping crest wall, wave runup Iribarren, seawall impact, jetty beam, rubble mound sliding, combined wave-current pier
- `validation_deep_excavation_extended.rs` (8) — Sheet pile cantilever, single-anchored wall, multi-propped wall, apparent earth pressure, bottom heave stability, strut load, waling beam, diaphragm wall
- `validation_snow_ice_loading_extended.rs` (8) — Ground-to-roof conversion, balanced flat roof, sloped roof reduction, drift surcharge, unbalanced gable frame, rain-on-snow, radial ice accretion, thermal contraction
- `validation_expansion_joints_extended.rs` (8) — Free thermal expansion, restrained thermal force, gap sizing, multi-span bridge, portal frame thermal, steel vs concrete differential, temperature gradient, bearing movement
- `validation_power_transmission_extended.rs` (8) — Conductor sag parabolic, wind on conductor, tower leg compression, cross-arm cantilever, wind on tower body, foundation overturning, broken wire, ice-wind combination
- `validation_rock_mechanics_extended.rs` (8) — Hoek-Brown failure, RMR classification, GSI modulus estimation, rock bolt capacity, Kirsch circular opening, in-situ stress, slope planar failure, Barton Q-system
- `validation_scaffolding_extended.rs` (8) — Tube axial capacity, ledger beam, standard buckling, tie force wind, bracing diagonal, formwork pressure Rodin, prop Euler buckling, platform combined loading

### Extended Validation — Wave 18 (8 files, 64 tests)
- `validation_geosynthetics_extended.rs` (8) — MSE wall reinforcement, geogrid slope, geomembrane liner, soil nail wall, bearing capacity improvement, separation filter, reinforced embankment, wraparound wall
- `validation_water_retaining_extended.rs` (8) — Hydrostatic cantilever, crack width control, minimum reinforcement, hoop tension, joint spacing, rectangular tank, water testing, combined earth-water
- `validation_steel_fiber_concrete_extended.rs` (8) — Flexural strength, volume fraction effect, residual strength, slab on grade, tunnel segment ductility, beam vs RC, fiber aspect ratio, hybrid fiber-rebar
- `validation_tensile_structures_extended.rs` (8) — Soap film biaxial, catenary vs parabolic, pretension stiffness, cable net point load, anticlastic saddle, wind uplift pretension, ring beam tension, fabric biaxial stress
- `validation_laminate_plate_extended.rs` (8) — Rule of mixtures, CLT ABD matrices, Tsai-Wu failure, symmetric B=0, crossply vs angleply, beam equivalent EI, thermal residual stress, effective modulus
- `validation_structural_acoustics_extended.rs` (8) — Mass law TL, STC rating, coincidence frequency, double wall, floor impact DG11, vibration isolation, modal density, radiation efficiency
- `validation_pavement_design_extended.rs` (8) — AASHTO structural number, traffic ESAL, PCA thickness, Boussinesq stress, Westergaard interior, CBR design, fatigue cracking, temperature curling
- `validation_fsi_extended.rs` (8) — Westergaard added mass, radiation damping, sloshing period, pipe whip, vortex-induced vibration, submerged frequency, water hammer, Chopra period lengthening

### Extended Validation — Wave 19 (8 files, 64 tests)
- `validation_elevator_escalator_extended.rs` (8) — Guide rail bending, overhead beam, pit ladder, counterweight, escalator truss, machine room beam, cab sling, buffer spring
- `validation_demolition_engineering_extended.rs` (8) — Partial removal stability, pre-weakening, debris loading, sequential column removal, floor collapse, impact force, temporary shoring, progressive mechanism
- `validation_flood_hydraulics_extended.rs` (8) — Manning's equation, weir flow, culvert capacity, levee crown wall, debris impact, flood barrier, floodgate, scour pile
- `validation_parking_structures_extended.rs` (8) — Post-tensioned slab, ramp slope, vehicle barrier, long span beam, drainage slope, punching shear, expansion joint, helical ramp
- `validation_sports_arena_extended.rs` (8) — Cable-stayed roof, precast terrace, cantilever grandstand, long span truss, stadium column, crowd dynamic, press box, retractable roof
- `validation_high_rise_buildings_extended.rs` (8) — Outrigger system, belt truss drift, tube structure, bundled tube, diagrid facade, core wall shear lag, mega column transfer, differential shortening
- `validation_industrial_structures_extended.rs` (8) — Equipment platform, grating panel, handrail post, conveyor support, monorail beam, stair access, pipe rack beam, equipment skid
- `validation_sign_pole_structures_extended.rs` (8) — Billboard wind, light pole combined, traffic signal, highway sign cantilever, flag pole, monopole tower, overhead gantry, antenna mast 3D

### Extended Validation — Wave 20 (7 files, 56 tests)
- `validation_crane_structures_extended.rs` (8) — Gantry leg portal, outrigger pad, bumper impact, jib cantilever, hook block, tower mast, girder fatigue, runway beam
- `validation_heritage_retrofit_extended.rs` (8) — Masonry arch assessment, timber floor diaphragm, FRP strengthening, steel jacketing, base isolation, tie rod tension, URM out-of-plane, historic truss
- `validation_solar_panel_extended.rs` (8) — Panel deflection, wind uplift cantilever, ground mount purlin, foundation pile, snow sliding, tracker torque, carport canopy, ballasted system
- `validation_cooling_tower_extended.rs` (8) — Hyperbolic shell meridional, mechanical draft frame, fill support beam, fan deck, column ring beam, wind loading shell, basin wall, drift eliminator
- `validation_piping_pressure_extended.rs` (8) — Barlow hoop stress, Lame thick wall, pressure vessel heads, span deflection, thermal expansion loop, support spring, nozzle reinforcement, elbow flexibility
- `validation_agricultural_structures_extended.rs` (8) — Grain bin hoop tension, barn rigid frame, greenhouse arch, feed bunker wall, manure lagoon, silo hopper, hay storage truss, equipment shed portal
- `validation_amusement_rides_extended.rs` (8) — Ferris wheel spoke, gondola cable, zip line tension, swing ride chain, carousel radial arm, water slide support, observation tower, roller coaster track

### Extended Validation — Wave 21 (8 files, 64 tests)
- `validation_glass_design_extended.rs` (8) — Annealed plate, tempered strength, laminated effective thickness, insulated unit pressure, balustrade line load, point load deflection, canopy wind, thermal stress
- `validation_progressive_collapse_extended2.rs` (8) — Column removal scenarios, catenary action, alternate load path, tie force method, key element design, dynamic amplification, membrane action, robustness index
- `validation_seismic_design_extended.rs` (8) — Base shear distribution, story drift amplification, vertical force distribution, redundancy factor, diaphragm force, overstrength factor, accidental torsion, P-delta stability
- `validation_timber_design_extended2.rs` (8) — Glulam deflection, CLT panel bending, plywood I-joist, Howe truss, column Euler buckling, notched beam shear, diaphragm deep beam, portal frame
- `validation_masonry_arches_extended.rs` (8) — Three-hinge arch thrust, semicircular self-weight, segmental arch, flat arch, pointed arch lateral, thrust line eccentricity, arch with backfill, collapse mechanism
- `validation_concrete_durability_extended.rs` (8) — Carbonation depth, chloride diffusion, cover requirements, crack width limits, corrosion rate, service life, exposure classification, durability index
- `validation_connection_design_extended.rs` (8) — Bolt shear, weld fillet, moment end plate, base plate, column splice, beam-column joint, brace connection, seated connection
- `validation_hydraulic_engineering_extended.rs` (8) — Open channel flow, weir discharge, pipe network, dam spillway, culvert sizing, stilling basin, floodgate design, hydraulic jump

### Extended Validation — Wave 22 (7 files, 56 tests)
- `validation_precast_concrete_extended.rs` (8) — Double-tee composite, hollow-core slab, spandrel beam torsion, column corbel, stair flight, wall panel, inverted-tee beam, connection hardware
- `validation_bridge_design_extended.rs` (8) — Girder flexure, pier column, abutment wall, bearing pad, deck slab, expansion joint, parapet barrier, composite section
- `validation_railway_structures_extended.rs` (8) — LM71 axle loading, sleeper beam, track slab, platform canopy, OHL mast, dynamic amplification, bridge deck acceleration, rail-structure interaction
- `validation_cable_stayed_extended2.rs` (8) — Fan cable arrangement, harp cable pattern, cable pretension, deck girder bending, cable sag Ernst modulus, tower design, backstay anchorage, asymmetric live load
- `validation_performance_based_extended2.rs` (8) — Pushover capacity, target displacement, acceptance criteria, fragility curves, loss estimation, retrofit evaluation, risk assessment, resilience metrics
- `validation_blast_impact_extended.rs` (8) — Blast pressure, dynamic response, fragment impact, progressive collapse, protective design, blast wall, vehicle barrier, ground shock
- `validation_catenary_cable_extended.rs` (8) — Parabolic sag horizontal thrust, catenary vs parabolic comparison, multi-span cable, concentrated load arbitrary, inclined cable, vibration frequency, Ernst equivalent modulus, temperature effects on sag

---

## Regression and Capability-Only Tracking

### Fixed Bugs (6 regression tests)

**File:** `validation_3d_bugs.rs` — All bugs fixed, tests now pass without `#[ignore]`.

| # | Bug (Fixed) | Tests | Fix |
|---|-------------|-------|-----|
| 1 | 3D thermal loads dropped in assembly.rs | 2 | Added `SolverLoad3D::Thermal` match arm in all 3 assembly functions |
| 2 | 3D partial distributed loads ignore a/b | 2 | Added `fef_partial_distributed_3d()` and conditional dispatch |
| 3 | Plate mass not assembled in mass_matrix.rs | 2 | Added plate mass loop + rotational inertia in `plate_consistent_mass` |

### Legacy Placeholder Tests (3 tests)

**File:** `validation_warping_torsion.rs`

| # | Feature | Status |
|---|---------|--------|
| 1 | Warping torsion cantilever (I-section) | Legacy placeholder text is stale relative to current code |
| 2 | Z-section torsion | Needs to be converted from placeholder wording to live benchmark coverage |
| 3 | Mixed warping + non-warping model | Needs to be converted from placeholder wording to live benchmark coverage |

### CAPABILITY Items (5 tests)

| Benchmark | File | What's Needed |
|-----------|------|---------------|
| VM11 SS plate | `validation_plates.rs` | Refine mesh to 8x8+, tight tolerance |
| VM14a large deflection | `validation_corotational.rs` | Match Mattiasson elastica reference |
| VM15 material nonlinear | `validation_material_nonlinear.rs` | Match exact VM15 problem |
| VM18 semicircular arch | `validation_curved_beams.rs` | Tight tolerance on delta_B |
| VM44 circular ring | `validation_curved_beams.rs` | Model full ring geometry |

---

## Detailed Gap Inventory

These are the largest gaps between the current engine and a top-tier structural solver. This section is split on purpose:

- `Solver-core gaps` are mechanics/formulation work that directly determine solver class.
- `Engineering/design gaps` are valuable, but they should not be confused with solver-core parity.

### Solver-Core Gaps

| Topic | Difficulty | Current State | Why It Matters |
|-------|-----------|---------------|----------------|
| Initial imperfections / residual-stress modeling hardening | Medium | Good | Core implementation exists; what remains is nonlinear integration depth and benchmark maturity |
| Warping torsion (7th DOF) hardening | Medium | Good | Core implementation exists; what remains is benchmark cleanup, mixed-model edge cases, and broader validation |
| Cable / catenary elements | Medium | Good | Implemented, but needs broader benchmark maturity and specialized behavior depth |
| 3D geometric nonlinear (corotational) | Hard | Good | Implemented, but needs stronger controls and benchmark breadth |
| 3D material nonlinear | Hard | Good | Implemented, but still needs harder benchmarks, broader workflow coverage, and tighter coupling to the newer fiber path |
| Constraint-system reuse across solver families | Medium | Good | Core constraint technology exists; the remaining work is broader reuse of the reduced/expanded constrained system across solver paths |
| Prestress / post-tension FE behavior | Hard | Good | Real PT depth exists now, but full time-dependent coupling and workflow breadth remain open |
| Construction staging | Hard | Good | 2D and 3D implementations exist; broader workflow depth and prestress/time-dependent coupling remain open |
| Creep & shrinkage response | Hard | Good | Core time-dependent response now exists; the remaining gap is broader staged/PT coupling and long-term benchmark depth |
| Plate / shell advanced elements and load vectors | Hard | Strong | Triangles, MITC4 (ANS+EAS-7), and MITC9 (9-node quad, ANS) form a multi-family shell stack with 15 benchmarks and 4 acceptance models. MITC9 outperforms MITC4 at lower mesh density (Navier 2×2: 98%, Scordelis-Lo 2×2: 96%). Remaining: curved/non-planar frontier (twisted beam, Raasch hook, hemisphere still locked), corotational extension |
| Advanced contact variants | Hard | Good | Contact exists, but richer contact laws and harder convergence cases remain open |
| Nonlinear solution controls and path-following hardening | Hard | Good | Controls now exist; what remains is hard-path validation and broader integration |
| Model reduction / substructuring | Medium | Good | Core capability exists; the remaining work is workflow integration, reduction choices, and larger-model validation |

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
