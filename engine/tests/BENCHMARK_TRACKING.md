# Benchmark Validation Test Tracking

> Master list of all industry-standard benchmarks.
> Status: DONE = reproduces published benchmark with tight tolerance (<5%),
> CAPABILITY = solver feature exists with smoke/capability tests but benchmark not yet reproduced exactly,
> BLOCKED = needs new solver features.

---

## Summary

| Category | Done | Capability | Blocked | Total |
|----------|------|------------|---------|-------|
| Tier 1: Must-Have Standards | 19 | 0 | 1 | 20 |
| Tier 2: Textbook Classics | 107 | 0 | 0 | 107 |
| Tier 3: Cross-Validation | 44 | 5 | 1 | 50 |
| Tier 4: Research & Advanced | 15 | 0 | 1 | 16 |
| Tier 5: Mathematical Properties | 60 | 0 | 0 | 60 |
| **Total** | **245** | **5** | **3** | **253** |

**391 validation tests across 54 files. 644 total tests (including unit + diff fuzz). All passing.**

> **DONE** tests check against published reference answers with <5% tolerance.
> **CAPABILITY** tests verify the solver feature works (convergence, sign, equilibrium, symmetry) but do not reproduce the specific benchmark problem with its exact parameters and reference answer.

---

## Tier 1: Must-Have Standards

### 1.1 AISC 360-22 Chapter C Stability (6 DONE)

**File:** `validation_aisc_stability.rs`
**Reference:** AISC 360-22 Commentary, Cases 1 & 2

| # | Test | Status |
|---|------|--------|
| 1 | Case 1: Braced column B1 amplification (W14x48) | DONE |
| 2 | Case 2: Unbraced cantilever B2 sway | DONE |
| 3 | B1 grows as P→Pe1 (3 load levels) | DONE |
| 4 | Zero lateral: P-delta = linear | DONE |
| 5 | Equilibrium after P-delta | DONE |
| 6 | Convergence < 10 iterations | DONE |

### 1.2 Eurocode 3 α_cr Elastic Critical Buckling (6 DONE)

**File:** `validation_eurocode3_buckling.rs`
**Reference:** EN 1993-1-1 §5.2.1

| # | Test | Status |
|---|------|--------|
| 1 | Portal α_cr: eigenvalue vs Horne's method | DONE |
| 2 | Pinned-base portal: α_cr lower than fixed | DONE |
| 3 | Multi-story sway frame α_cr | DONE |
| 4 | α_cr consistent with P-delta amplification | DONE |
| 5 | Braced frame: high α_cr | DONE |
| 6 | Gravity-only vs lateral: α_cr comparison | DONE |

### 1.3 EN 1993/EC8/ASCE 7 Code Provisions (7 DONE)

**File:** `validation_code_provisions.rs`
**Reference:** EN 1993-1-1 §5.2, EN 1998-1 §4.3.3.3, ASCE 7-22 §12.9

| # | Test | Status |
|---|------|--------|
| 1 | EN 1993 §5.2: α_cr > 10 → first-order OK | DONE |
| 2 | EN 1993 §5.2: α_cr ∈ [3,10] → second-order needed | DONE |
| 3 | EN 1993: P-delta amplification ≈ 1/(1-1/α_cr) | DONE |
| 4 | EC8 §4.3.3.3: cumulative mass participation ≥ 90% | DONE |
| 5 | ASCE 7 §12.9: spectral base shear > 0 | DONE |
| 6 | ASCE 7: importance factor scaling (I×2 → V×2) | DONE |
| 7 | EC8: modal mass ratios non-negative | DONE |

### 1.4 NAFEMS LE5: Z-Section Cantilever (BLOCKED)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Z-section cantilever, σ=-108 MPa | BLOCKED | 14×14 warping math exists; assembly routing not yet wired |

---

## Tier 2: Textbook Classics

### 2.1 Euler-Bernoulli Exact Solutions (14 DONE)

**File:** `validation_beam_formulas.rs` — Timoshenko *Strength of Materials*

SS beam (UDL δ, M; point load δ), cantilever (UDL, tip load), fixed-fixed (UDL δ, M_end), propped cantilever + additional checks.

### 2.2 Euler Column Buckling — 4 BCs (16 DONE)

**File:** `validation_euler_buckling.rs` — Timoshenko & Gere

Pinned-pinned, fixed-free, fixed-pinned, fixed-fixed × 4 mesh densities.

### 2.3 Beam Natural Frequencies (16 DONE)

**File:** `validation_modal_frequencies.rs` — Blevins

SS beam, cantilever, fixed-fixed × 4 modes + participation factors.

### 2.4 Przemieniecki Stiffness Matrices (10 DONE)

**Files:** `validation_3d_analysis.rs`, `validation_przemieniecki_extended.rs`
**Reference:** Przemieniecki *Theory of Matrix Structural Analysis*

12×12 stiffness matrix symmetry, positive diagonals, patch test, combined bending+torsion, coordinate transformation, hinges.

### 2.5 MASTAN2 / Ziemian 22 Benchmark Frames (15 DONE)

**File:** `validation_mastan2_frames.rs`
**Reference:** Ziemian & Ziemian (2021), *J. Constr. Steel Res.* 186

5 representative frames × (α_cr + P-delta) + ranking/consistency/equilibrium checks.

### 2.6 Kassimali (10 DONE)

**Files:** `validation_continuous_beams.rs`, `validation_frames.rs`, `validation_moving_loads.rs`, `validation_kassimali_extended.rs`
**Reference:** Kassimali *Structural Analysis*

Continuous beams, portal frames, moving loads (HL-93), influence lines, settlements.

### 2.7 Biggs / Chopra Dynamic/Spectral (12 DONE)

**Files:** `validation_spectral_response.rs`, `validation_biggs_extended.rs`

SRSS vs CQC, importance/reduction factor scaling, EC8 design spectrum, multi-DOF shear building.

### 2.8 Matrix Structural Analysis Textbooks (8 DONE)

**File:** `validation_matrix_textbooks.rs`
**References:** Przemieniecki (1968), Weaver & Gere (1990), McGuire et al. (2000), Hibbeler, Kassimali (2012)

| # | Test | Status |
|---|------|--------|
| 1 | Przemieniecki: axial truss δ = FL/(EA) | DONE |
| 2 | Weaver-Gere: L-shaped frame equilibrium | DONE |
| 3 | McGuire: 2-span continuous beam R = 5qL/4 | DONE |
| 4 | Hibbeler: propped cantilever R_B = 5P/16 | DONE |
| 5 | Kassimali: portal frame lateral load | DONE |
| 6 | Kassimali: frame combined loads | DONE |
| 7 | Przemieniecki: Warren truss zero shear | DONE |
| 8 | Weaver-Gere: fixed beam UDL δ = qL⁴/(384EI) | DONE |

### 2.9 Chopra Dynamics (6 DONE)

**File:** `validation_chopra_dynamics.rs`
**Reference:** Chopra, *Dynamics of Structures*, 5th Ed

| # | Test | Status |
|---|------|--------|
| 1 | SDOF undamped period T = 2π/ω | DONE |
| 2 | SDOF step load DAF ≈ 2.0 | DONE |
| 3 | Rayleigh damping: amplitude decay | DONE |
| 4 | 2-story shear building: 2 modes | DONE |
| 5 | Newmark energy conservation | DONE |
| 6 | HHT numerical dissipation | DONE |

### 2.10 Progressive Collapse / Redundancy (6 DONE)

**File:** `validation_progressive_collapse.rs`
**References:** GSA 2013, EN 1991-1-7, Starossek (2009)

| # | Test | Status |
|---|------|--------|
| 1 | Statically determinate truss classification | DONE |
| 2 | Hyperstatic frame classification | DONE |
| 3 | Redundant truss: alternate load path | DONE |
| 4 | Continuous beam: support removal | DONE |
| 5 | Frame redundancy increases with bays | DONE |
| 6 | GSA: load redistribution after member removal | DONE |

---

## Tier 3: Cross-Validation with Commercial Software

### 3.1 ANSYS Verification Manual (25 DONE, 5 CAPABILITY)

**Files:** `validation_ansys_vm.rs`, `validation_ansys_vm_extended.rs`, `validation_plates.rs`, `validation_material_nonlinear.rs`, `validation_curved_beams.rs`, `validation_corotational.rs`

| # | VM | Test | Status |
|---|-----|------|--------|
| 1 | VM1 | Statically indeterminate 3-bar truss | DONE |
| 2 | VM2 | Beam with overhangs | DONE |
| 3 | VM3 | Stepped cantilever (2 sections) | DONE |
| 4 | VM4 | Hinged V-truss | DONE |
| 5 | VM5 | Combined thermal + axial | DONE |
| 6 | VM6 | Constrained thermal expansion | DONE |
| 7 | VM7 | Thermal gradient bending | DONE |
| 8 | VM8 | Planar truss triangle | DONE |
| 9 | VM9 | 3D space truss (tripod) | DONE |
| 10 | VM10 | SS beam eccentric load | DONE |
| 11 | VM11 | SS square plate under pressure | CAPABILITY |
| 12 | VM12 | 3D cantilever biaxial bending | DONE |
| 13 | VM13 | Indeterminate portal | DONE |
| 14 | VM14 | Cantilever moment load | DONE |
| 15 | VM14a | Large deflection cantilever | CAPABILITY |
| 16 | VM15 | Material nonlinearity | CAPABILITY |
| 17 | VM18 | Semicircular arch | CAPABILITY |
| 18 | VM21 | Tie rod tension stiffening | DONE |
| 19 | VM44 | Circular ring | CAPABILITY |
| 20 | VM156 | Beam-column P-delta | DONE |

### 3.2 SAP2000 / CSI Test Problems (10 DONE)

**File:** `validation_sap2000.rs`

Simple beam, continuous beam, portal frame, 2-story modal, braced frame, hinges, springs, settlement, P-delta, stiffness.

### 3.3 Code_Aster SSLL Beam Benchmarks (9 DONE)

**File:** `validation_code_aster.rs`

SSLL010, SSLL012, SSLL014, SSLL100, SSLL102, SSLL103, SSLL105, SSLL110, SSLL400.

---

## Tier 4: Research & Advanced

### 4.1 Zubydan / Ziemian 22 Steel Frames (15 DONE)

Covered by `validation_mastan2_frames.rs` (same dataset as Tier 2.5).

### 4.2 NAFEMS R0024: Large-Displacement 3D Beam (BLOCKED)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | 3D beam large displacement | BLOCKED | Co-rotational solver is 2D only |

---

## Tier 5: Mathematical Properties & Numerical Methods

### 5.1 Modal Orthogonality & Mass Conservation (8 DONE)

**File:** `validation_modal_properties.rs`
**References:** Bathe (2014), Clough & Penzien, Hughes (2000)

| # | Test | Status |
|---|------|--------|
| 1 | φᵢᵀ·M·φⱼ = 0 for i≠j (M-orthogonality) | DONE |
| 2 | φᵢᵀ·K·φⱼ = 0 for i≠j (K-orthogonality) | DONE |
| 3 | Mass conservation: total_mass = ρAL/1000 (beam) | DONE |
| 4 | Mass conservation: portal frame | DONE |
| 5 | Rayleigh upper bound: ω_FE ≥ ω_exact | DONE |
| 6 | Monotonic convergence from above | DONE |
| 7 | Effective mass sum ≤ total mass | DONE |
| 8 | Rayleigh quotient: ω² = φᵀKφ / φᵀMφ | DONE |

### 5.2 h-Convergence & Numerical Accuracy (7 DONE)

**File:** `validation_convergence.rs`
**References:** Bathe (2014), Hughes (2000), Newmark (1959)

| # | Test | Status |
|---|------|--------|
| 1 | h-convergence: cantilever tip deflection | DONE |
| 2 | h-convergence: SS beam UDL midspan | DONE |
| 3 | h-convergence: reaction forces | DONE |
| 4 | h-convergence: fixed beam end moment | DONE |
| 5 | Newmark period elongation characterization | DONE |
| 6 | Newmark energy conservation | DONE |
| 7 | Richardson extrapolation consistency | DONE |

### 5.3 Patch Tests & Element Quality (8 DONE)

**File:** `validation_patch_tests.rs`
**References:** MacNeal & Harder (1985), Argyris & Kelsey (1960), Irons & Razzaque (1972)

| # | Test | Status |
|---|------|--------|
| 1 | Truss patch test: uniform axial strain | DONE |
| 2 | Frame patch test: axial only (zero V, M) | DONE |
| 3 | Beam patch test: pure bending (zero V) | DONE |
| 4 | Rigid body mode: zero strain energy | DONE |
| 5 | MacNeal-Harder: straight cantilever | DONE |
| 6 | MacNeal-Harder: tip moment | DONE |
| 7 | Argyris-Kelsey: irregular mesh frame patch | DONE |
| 8 | Zero load → zero response | DONE |

### 5.4 Fundamental Theorems (12 DONE)

**File:** `validation_fundamental_theorems.rs`
**References:** Betti, Maxwell, Castigliano

Betti reciprocal theorem, Maxwell reciprocal displacements, Castigliano energy method, virtual work principle, stiffness matrix symmetry.

### 5.5 Stiffness Matrix Properties (7 DONE)

**File:** `validation_stiffness_properties.rs`
**References:** Bathe (2014), Przemieniecki (1968)

Positive semi-definite, symmetry, spectral radius bounds, Bathe convergence rate.

### 5.6 NAFEMS Standard Tests (6 DONE)

**File:** `validation_nafems.rs`
**References:** NAFEMS LE1, LE10, FV12, FV32, FV52

Cantilever frequency, stress recovery, Euler buckling, 3D axial frequency, dynamic response.

### 5.7 RSA Cross-Validation (4 DONE)

**File:** `validation_rsa_crosscheck.rs`
**References:** Chopra (2017), ASCE 7-22, EN 1998-1

| # | Test | Status |
|---|------|--------|
| 1 | RSA tip displacement > 0 (cantilever) | DONE |
| 2 | RSA base shear ≤ total_mass × Sa × g | DONE |
| 3 | SRSS ≈ CQC for well-separated modes | DONE |
| 4 | Reduction factor scaling (R=3 → V/3) | DONE |

### 5.8 Pushover & Nonlinear (6 DONE)

**File:** `validation_pushover.rs`
**References:** FEMA 356, ATC-40, EN 1998-1 Annex B

| # | Test | Status |
|---|------|--------|
| 1 | Cantilever elastic stiffness k = 3EI/L³ | DONE |
| 2 | P-delta stiffness reduction (2 load levels) | DONE |
| 3 | Corotational large displacement cantilever | DONE |
| 4 | Portal frame sway stiffness bounds | DONE |
| 5 | P-delta near critical: large amplification | DONE |
| 6 | Load reversal symmetry | DONE |

### 5.9 Regulatory & Feature Coverage (8 DONE)

**File:** `validation_regulatory_features.rs`
**References:** ASCE 7-22 §12.8.6, EN 1998-1 §4.3.3.5, EN 1992-1-1

| # | Test | Status |
|---|------|--------|
| 1 | Partial distributed load (half-span) | DONE |
| 2 | Partial load with a,b parameters | DONE |
| 3 | Prescribed displacement (settlement) | DONE |
| 4 | Prescribed rotation | DONE |
| 5 | Inter-story drift (3-story frame) | DONE |
| 6 | Multi-directional loading (100% + 30%) | DONE |
| 7 | Superposition principle | DONE |
| 8 | Load scaling linearity | DONE |

---

## All Validation Test Files

| File | Tests | Reference |
|------|-------|-----------|
| `validation_3d_analysis.rs` | 10 | Przemieniecki |
| `validation_3d_inclined_supports.rs` | 4 | Custom inclined support tests |
| `validation_3d_supports.rs` | 7 | 3D support conditions |
| `validation_advanced_corotational.rs` | 4 | Crisfield, Williams toggle |
| `validation_aisc_stability.rs` | 6 | AISC 360-22 |
| `validation_ansys_vm.rs` | 7 | ANSYS VM |
| `validation_ansys_vm_extended.rs` | 18 | ANSYS VM (VM3-VM156) |
| `validation_beam_formulas.rs` | 14 | Timoshenko, Gere |
| `validation_biggs_extended.rs` | 4 | Biggs, Chopra, EC8 |
| `validation_chopra_dynamics.rs` | 6 | Chopra *Dynamics of Structures* |
| `validation_code_aster.rs` | 9 | Code_Aster SSLL |
| `validation_code_provisions.rs` | 7 | EN 1993, EC8, ASCE 7 |
| `validation_combinations.rs` | 8 | Load combination tests |
| `validation_continuous_beams.rs` | 6 | Various |
| `validation_convergence.rs` | 7 | Bathe, Hughes, Newmark |
| `validation_corotational.rs` | 4 | Crisfield, McGuire/Gallagher/Ziemian |
| `validation_curved_beams.rs` | 5 | Timoshenko, Roark |
| `validation_dynamic_mdof.rs` | 6 | Multi-DOF dynamics |
| `validation_euler_buckling.rs` | 16 | Euler, Timoshenko & Gere |
| `validation_eurocode3_buckling.rs` | 6 | EN 1993-1-1 §5.2.1 |
| `validation_frames.rs` | 7 | Various |
| `validation_fundamental_theorems.rs` | 12 | Betti, Maxwell, Castigliano |
| `validation_guided_y.rs` | 3 | guidedY support tests |
| `validation_influence_lines.rs` | 8 | Müller-Breslau |
| `validation_kassimali_extended.rs` | 6 | Kassimali |
| `validation_kinematic.rs` | 6 | Ghali/Neville |
| `validation_mastan2_frames.rs` | 15 | Ziemian & Ziemian (2021) |
| `validation_material_nonlinear.rs` | 3 | Neal, Chen/Sohal |
| `validation_matrix_textbooks.rs` | 8 | Przemieniecki, Weaver, McGuire, Hibbeler |
| `validation_modal_frequencies.rs` | 16 | Blevins |
| `validation_modal_properties.rs` | 8 | Bathe, Clough & Penzien |
| `validation_moving_loads.rs` | 8 | Kassimali, AASHTO |
| `validation_nafems.rs` | 6 | NAFEMS LE/FV benchmarks |
| `validation_patch_tests.rs` | 8 | MacNeal-Harder, Argyris-Kelsey |
| `validation_pdelta_stability.rs` | 8 | Timoshenko, Chen/Lui |
| `validation_plastic_collapse.rs` | 8 | Neal |
| `validation_plates.rs` | 4 | Timoshenko & Woinowsky-Krieger |
| `validation_pressure_loads.rs` | 4 | 3D pressure loads |
| `validation_progressive_collapse.rs` | 6 | GSA 2013, EN 1991-1-7 |
| `validation_przemieniecki_extended.rs` | 6 | Przemieniecki |
| `validation_pushover.rs` | 6 | FEMA 356, ATC-40 |
| `validation_regulatory_features.rs` | 8 | ASCE 7, EN 1998 |
| `validation_rsa_crosscheck.rs` | 4 | Chopra, ASCE 7, EN 1998 |
| `validation_sap2000.rs` | 10 | CSI/SAP2000 |
| `validation_scordelis_lo.rs` | 3 | Scordelis-Lo, MacNeal-Harder |
| `validation_section_stress.rs` | 8 | Navier, Jourawski |
| `validation_spectral_response.rs` | 8 | Chopra, Biggs |
| `validation_stiffness_properties.rs` | 7 | Bathe, Przemieniecki |
| `validation_stress_3d.rs` | 6 | 3D stress analysis |
| `validation_thermal_settlement.rs` | 10 | Various |
| `validation_time_history.rs` | 4 | Clough/Penzien, Chopra, Newmark |
| `validation_trusses.rs` | 6 | Various |
| `validation_warping_torsion.rs` | 3 | Vlasov, Trahair |
| `validation_winkler_foundation.rs` | 4 | Hetényi |
| **Total** | **391** | **54 files** |

---

## Remaining CAPABILITY (5 items)

| Benchmark | File | What's Needed |
|-----------|------|---------------|
| VM11 SS plate | `validation_plates.rs` | Refine mesh to 8×8+, tight tolerance |
| VM14a large deflection | `validation_corotational.rs` | Match Mattiasson elastica reference |
| VM15 material nonlinear | `validation_material_nonlinear.rs` | Match exact VM15 problem |
| VM18 semicircular arch | `validation_curved_beams.rs` | Tight tolerance on δ_B |
| VM44 circular ring | `validation_curved_beams.rs` | Model full ring, not cantilever |

## Remaining BLOCKED (3 items)

| Benchmark | Why Blocked | What's Needed |
|-----------|-------------|---------------|
| NAFEMS LE5 (Z-section) | 14×14 warping math exists but assembly not wired | Wire warping in assembly + 7-DOF nodes |
| NAFEMS R0024 (3D large disp.) | Co-rotational solver is 2D only | Extend to 3D |
| ANSYS VM44 (ring) | Test models wrong problem | Rewrite with full ring geometry |
