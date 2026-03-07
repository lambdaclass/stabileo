/// Validation: Seismic Detailing and Capacity Design
///
/// References:
///   - ACI 318-19 Chapter 18: Earthquake-Resistant Structures
///   - EN 1998-1:2004 (EC8): Seismic design
///   - CIRSOC 103: Argentine seismic design standard
///   - Paulay & Priestley: "Seismic Design of Reinforced Concrete and Masonry Buildings"
///   - Priestley, Calvi, Kowalsky: "Displacement-Based Seismic Design of Structures"
///
/// Tests verify strong-column/weak-beam, confinement, capacity design rules.

mod helpers;

// ================================================================
// 1. ACI 318-19 §18.7.3.2: Strong-Column / Weak-Beam
// ================================================================
//
// At each beam-column joint the sum of nominal column moment capacities
// must exceed 6/5 of the sum of nominal beam moment capacities:
//
//   ΣMnc ≥ (6/5) × ΣMnb
//
// Two columns (Mnc = 400 kN·m each), two beams (Mnb = 300 kN·m each).
// Ratio = 800 / 600 = 1.333 ≥ 1.20  →  PASS.

#[test]
fn validation_aci318_strong_column_weak_beam() {
    let mnc_top = 400.0_f64;    // kN·m — column above joint
    let mnc_bot = 400.0_f64;    // kN·m — column below joint
    let mnb_left = 300.0_f64;   // kN·m — beam left of joint
    let mnb_right = 300.0_f64;  // kN·m — beam right of joint

    let sum_mnc = mnc_top + mnc_bot;           // 800 kN·m
    let sum_mnb = mnb_left + mnb_right;        // 600 kN·m
    let ratio = sum_mnc / sum_mnb;             // 1.333

    let expected_sum_mnc = 800.0;
    let expected_sum_mnb = 600.0;
    let expected_ratio = 800.0 / 600.0;        // 1.3333...
    let aci_min_ratio = 6.0 / 5.0;             // 1.20

    let tol = 0.02;
    assert!(
        (sum_mnc - expected_sum_mnc).abs() / expected_sum_mnc < tol,
        "ACI §18.7.3.2: ΣMnc={:.2}, expected {:.2}", sum_mnc, expected_sum_mnc
    );
    assert!(
        (sum_mnb - expected_sum_mnb).abs() / expected_sum_mnb < tol,
        "ACI §18.7.3.2: ΣMnb={:.2}, expected {:.2}", sum_mnb, expected_sum_mnb
    );
    assert!(
        (ratio - expected_ratio).abs() / expected_ratio < tol,
        "ACI §18.7.3.2: ratio={:.4}, expected {:.4}", ratio, expected_ratio
    );
    assert!(
        ratio >= aci_min_ratio,
        "ACI §18.7.3.2: SCWB ratio {:.3} must be >= {:.2}", ratio, aci_min_ratio
    );
}

// ================================================================
// 2. EC8 §5.4.2.2: Capacity Design Beam Shear
// ================================================================
//
// Design shear from capacity design of beams:
//   VEd = V_gravity + (M_Rd_left + M_Rd_right) / L_cl
//
// M_Rd = 250 kN·m at both ends, L_cl = 5.0 m, V_gravity = 80 kN.
// VEd = 80 + (250 + 250) / 5 = 80 + 100 = 180 kN.

#[test]
fn validation_ec8_capacity_design_beam() {
    let m_rd_left = 250.0_f64;   // kN·m — beam plastic moment (left end)
    let m_rd_right = 250.0_f64;  // kN·m — beam plastic moment (right end)
    let l_cl = 5.0_f64;          // m    — clear span
    let v_gravity = 80.0_f64;    // kN   — gravity shear from quasi-permanent loads

    let v_seismic = (m_rd_left + m_rd_right) / l_cl;  // 100 kN
    let v_ed = v_gravity + v_seismic;                  // 180 kN

    let expected_v_seismic = 100.0;
    let expected_v_ed = 180.0;

    let tol = 0.02;
    assert!(
        (v_seismic - expected_v_seismic).abs() / expected_v_seismic < tol,
        "EC8 §5.4.2.2: V_seismic={:.2}, expected {:.2}", v_seismic, expected_v_seismic
    );
    assert!(
        (v_ed - expected_v_ed).abs() / expected_v_ed < tol,
        "EC8 §5.4.2.2: VEd={:.2}, expected {:.2}", v_ed, expected_v_ed
    );
}

// ================================================================
// 3. ACI 318-19 §18.7.5.3: Confinement Spacing
// ================================================================
//
// Maximum transverse reinforcement spacing in plastic hinge regions:
//   s ≤ min(b/4, 6·db_long, so)
//
// where:
//   so = 100 + (350 - hx) / 3  (mm), clamped to 100 ≤ so ≤ 150
//
// b = 400 mm, db = 25 mm, hx = 300 mm.
// b/4 = 100, 6·db = 150, so = 100 + (350 - 300)/3 = 116.67 mm.
// s_max = min(100, 150, 116.67) = 100 mm.

#[test]
fn validation_aci318_confinement_spacing() {
    let b = 400.0_f64;      // mm — column width
    let db_long = 25.0_f64; // mm — longitudinal bar diameter
    let hx = 300.0_f64;     // mm — max center-to-center spacing of crossties or hoops

    // Individual limits
    let limit_b4 = b / 4.0;                              // 100 mm
    let limit_6db = 6.0 * db_long;                        // 150 mm
    let so_raw = 100.0 + (350.0 - hx) / 3.0;             // 116.67 mm
    let so = so_raw.max(100.0).min(150.0);                // clamped: 116.67 mm

    let s_max = limit_b4.min(limit_6db).min(so);          // 100 mm

    let expected_b4 = 100.0;
    let expected_6db = 150.0;
    let expected_so_raw = 100.0 + 50.0 / 3.0;   // 116.667
    let expected_s_max = 100.0;

    let tol = 0.02;
    assert!(
        (limit_b4 - expected_b4).abs() / expected_b4 < tol,
        "ACI §18.7.5.3: b/4={:.2}, expected {:.2}", limit_b4, expected_b4
    );
    assert!(
        (limit_6db - expected_6db).abs() / expected_6db < tol,
        "ACI §18.7.5.3: 6·db={:.2}, expected {:.2}", limit_6db, expected_6db
    );
    assert!(
        (so - expected_so_raw).abs() / expected_so_raw < tol,
        "ACI §18.7.5.3: so={:.2}, expected {:.2}", so, expected_so_raw
    );
    assert!(
        (s_max - expected_s_max).abs() / expected_s_max < tol,
        "ACI §18.7.5.3: s_max={:.2}, expected {:.2}", s_max, expected_s_max
    );
}

// ================================================================
// 4. EC8 §5.2.2.2: Behaviour Factor for DCH Moment Frame
// ================================================================
//
// q = q0 × kw
// For DCH concrete moment-resisting frames:
//   q0 = 4.5 × (αu / α1)
//   kw = 1.0 (for frames, no wall reduction)
//
// For multi-story multi-bay frames: αu/α1 = 1.3.
// q = 4.5 × 1.3 × 1.0 = 5.85.

#[test]
fn validation_ec8_behavior_factor_frame() {
    let q0_base = 4.5_f64;      // DCH frame base value
    let alpha_ratio = 1.3_f64;  // αu/α1 for multi-story multi-bay frame
    let kw = 1.0_f64;           // wall factor (1.0 for pure frame)

    let q0 = q0_base * alpha_ratio;   // 5.85
    let q = q0 * kw;                  // 5.85

    let expected_q0 = 5.85;
    let expected_q = 5.85;

    let tol = 0.02;
    assert!(
        (q0 - expected_q0).abs() / expected_q0 < tol,
        "EC8 §5.2.2.2: q0={:.2}, expected {:.2}", q0, expected_q0
    );
    assert!(
        (q - expected_q).abs() / expected_q < tol,
        "EC8 §5.2.2.2: q={:.2}, expected {:.2}", q, expected_q
    );
}

// ================================================================
// 5. CIRSOC 103: Curvature Ductility Demand (High Ductility DES)
// ================================================================
//
// For high ductility demand (DES) and T ≥ Tc (equal displacement rule):
//   μ_φ ≥ 2·q - 1
//
// q = 4.0 → μ_φ ≥ 2×4 - 1 = 7.0.
// Verify curvature ductility demand calculation.

#[test]
fn validation_cirsoc103_ductility_demand() {
    let q = 4.0_f64;   // behaviour factor (ductility class DES)

    // Equal displacement rule (T ≥ Tc):
    //   μ_φ ≥ 2·q - 1
    let mu_phi_min = 2.0 * q - 1.0;   // 7.0

    let expected_mu_phi = 7.0;

    let tol = 0.02;
    assert!(
        (mu_phi_min - expected_mu_phi).abs() / expected_mu_phi < tol,
        "CIRSOC 103: μ_φ_min={:.2}, expected {:.2}", mu_phi_min, expected_mu_phi
    );

    // Also verify the short-period approximation (T < Tc):
    //   μ_φ ≥ 1 + 2·(q - 1)·Tc/T
    // For T/Tc = 0.5: μ_φ ≥ 1 + 2·(4-1)·2 = 13.0
    let t_over_tc = 0.5_f64;
    let mu_phi_short = 1.0 + 2.0 * (q - 1.0) / t_over_tc;   // 1 + 2×3×2 = 13.0

    let expected_mu_short = 13.0;
    assert!(
        (mu_phi_short - expected_mu_short).abs() / expected_mu_short < tol,
        "CIRSOC 103 (T<Tc): μ_φ={:.2}, expected {:.2}", mu_phi_short, expected_mu_short
    );
}

// ================================================================
// 6. ACI 318-19 §18.8.4.1: Beam-Column Joint Shear
// ================================================================
//
// Joint shear:
//   Vj = T_beam - V_col
// where:
//   T_beam = 1.25 × As × fy  (overstrength tension force in beam steel)
//
// As = 2000 mm², fy = 420 MPa.
// T_beam = 1.25 × 2000 × 420 / 1000 = 1050 kN.
// V_col = 200 kN.
// Vj = 1050 - 200 = 850 kN.
//
// Allowable joint shear (interior joint, normal weight concrete):
//   φ·Vn = φ × γ × √f'c × Aj
//   φ = 0.85, γ = 1.0 (interior joint per Table 18.8.4.1),
//   f'c = 35 MPa → √f'c = 5.916 MPa,
//   Aj = 400 × 400 = 160000 mm².
//   φ·Vn = 0.85 × 1.0 × 5.916 × 160000 / 1000 = 804.2 kN.
//
// Vj = 850 > φ·Vn = 804.2 → Joint shear EXCEEDS capacity (needs redesign).

#[test]
fn validation_aci318_joint_shear() {
    let as_steel = 2000.0_f64;   // mm² — beam tension reinforcement area
    let fy = 420.0_f64;          // MPa — yield strength
    let overstrength = 1.25_f64; // ACI overstrength factor
    let v_col = 200.0_f64;       // kN  — column shear at joint

    // Beam tension force with overstrength
    let t_beam = overstrength * as_steel * fy / 1000.0;   // 1050 kN

    // Joint shear demand
    let vj = t_beam - v_col;                               // 850 kN

    // Joint shear capacity (interior joint, normal weight concrete)
    let phi = 0.85_f64;
    let gamma = 1.0_f64;         // interior joint coefficient (ACI Table 18.8.4.1)
    let fc_prime = 35.0_f64;     // MPa
    let sqrt_fc = fc_prime.sqrt();   // 5.916 MPa
    let b_col = 400.0_f64;       // mm
    let h_col = 400.0_f64;       // mm
    let aj = b_col * h_col;      // 160000 mm²

    let phi_vn = phi * gamma * sqrt_fc * aj / 1000.0;     // 804.2 kN

    let expected_t_beam = 1050.0;
    let expected_vj = 850.0;
    let expected_phi_vn = 0.85 * 35.0_f64.sqrt() * 160000.0 / 1000.0;

    let tol = 0.02;
    assert!(
        (t_beam - expected_t_beam).abs() / expected_t_beam < tol,
        "ACI §18.8.4.1: T_beam={:.2}, expected {:.2}", t_beam, expected_t_beam
    );
    assert!(
        (vj - expected_vj).abs() / expected_vj < tol,
        "ACI §18.8.4.1: Vj={:.2}, expected {:.2}", vj, expected_vj
    );
    assert!(
        (phi_vn - expected_phi_vn).abs() / expected_phi_vn < tol,
        "ACI §18.8.4.1: φVn={:.2}, expected {:.2}", phi_vn, expected_phi_vn
    );

    // Joint shear exceeds capacity → needs redesign
    assert!(
        vj > phi_vn,
        "ACI §18.8.4.1: Vj={:.2} should exceed φVn={:.2} (joint overstressed)",
        vj, phi_vn
    );
}

// ================================================================
// 7. EC8 §5.4.3.2.2: Local Ductility — Column Confinement
// ================================================================
//
// Required mechanical volumetric ratio of confinement reinforcement:
//   ω_wd ≥ 30 × μ_φ × ν_d × ε_sy,d × (bc/bo) - 0.035
//
// ν_d = NEd / (Ac × fcd)
//     = 1500 / (400 × 400 × 23.33/1e3)
//     = 1500 / (160000 × 0.02333)
//     = 1500 / 3733.3
//     = 0.4018
//
// μ_φ = 13  (DCH, q ≈ 5.85 → μ_φ = 2×5.85 - 1 = 10.7, use 13 for T < Tc)
// ε_sy,d = fyd / Es = (500/1.15) / 200000 = 434.78 / 200000 = 0.002174
// bc/bo = 400/340 = 1.176  (bc = column width, bo = confined core width)
//
// ω_wd_min = 30 × 13 × 0.4018 × 0.002174 × 1.176 - 0.035
//          = 30 × 13 × 0.4018 × 0.002174 × 1.176 - 0.035
//          = 0.3999 - 0.035
//          ≈ 0.365

#[test]
fn validation_ec8_local_ductility_column() {
    // Material and geometric properties
    let n_ed = 1500.0_f64;       // kN   — design axial force
    let bc = 400.0_f64;          // mm   — column width (gross)
    let bo = 340.0_f64;          // mm   — confined core width (to centreline of hoops)
    let ac = bc * bc;            // mm²  — gross column area = 160000
    let fck = 35.0_f64;          // MPa  — characteristic concrete strength
    let gamma_c = 1.5_f64;       // partial safety factor for concrete
    let fcd = fck / gamma_c;     // MPa  — design concrete strength = 23.333
    let fyk = 500.0_f64;         // MPa  — characteristic yield strength of steel
    let gamma_s = 1.15_f64;      // partial safety factor for steel
    let fyd = fyk / gamma_s;     // MPa  — design yield strength = 434.78
    let es = 200_000.0_f64;      // MPa  — steel elastic modulus

    // Normalised axial force
    let nu_d = n_ed * 1000.0 / (ac * fcd);   // 1500000 / (160000 × 23.333) = 0.4018

    // Curvature ductility factor (DCH)
    let mu_phi = 13.0_f64;

    // Design yield strain
    let eps_sy_d = fyd / es;   // 0.002174

    // Geometric ratio
    let bc_over_bo = bc / bo;  // 1.176

    // Required mechanical volumetric ratio
    let omega_wd_min = 30.0 * mu_phi * nu_d * eps_sy_d * bc_over_bo - 0.035;

    // Expected intermediate values
    let expected_fcd = 35.0 / 1.5;
    let expected_nu_d = 1500.0e3 / (160000.0 * expected_fcd);
    let expected_fyd = 500.0 / 1.15;
    let expected_eps = expected_fyd / 200000.0;
    let expected_bc_bo = 400.0 / 340.0;
    let expected_omega = 30.0 * 13.0 * expected_nu_d * expected_eps * expected_bc_bo - 0.035;

    let tol = 0.02;
    assert!(
        (nu_d - expected_nu_d).abs() / expected_nu_d < tol,
        "EC8 §5.4.3.2.2: νd={:.4}, expected {:.4}", nu_d, expected_nu_d
    );
    assert!(
        (eps_sy_d - expected_eps).abs() / expected_eps < tol,
        "EC8 §5.4.3.2.2: εsy,d={:.6}, expected {:.6}", eps_sy_d, expected_eps
    );
    assert!(
        (omega_wd_min - expected_omega).abs() / expected_omega.abs() < tol,
        "EC8 §5.4.3.2.2: ωwd_min={:.4}, expected {:.4}", omega_wd_min, expected_omega
    );

    // Verify ωwd is positive (real confinement is needed)
    assert!(
        omega_wd_min > 0.0,
        "EC8 §5.4.3.2.2: ωwd_min={:.4} must be positive for this axial load level",
        omega_wd_min
    );
}

// ================================================================
// 8. Capacity Design: Overstrength Shear Demand
// ================================================================
//
// Material overstrength factors used in capacity design:
//   ACI 318: 1.25 × fy for flexural overstrength
//   EC8: γ_Rd = 1.2 (DCM) or 1.3 (DCH)
//
// Verify that the design shear accounts for overstrength moment capacity.
// M_Rd = 250 kN·m, γ_Rd = 1.3 (DCH).
// M_ov = γ_Rd × M_Rd = 1.3 × 250 = 325 kN·m.
// For column shear from plastic hinges at both ends:
//   V_cap = 2 × M_ov / L = 2 × 325 / 5 = 130 kN.

#[test]
fn validation_capacity_design_overstrength() {
    let m_rd = 250.0_f64;            // kN·m — design moment resistance
    let l_clear = 5.0_f64;           // m    — clear column height

    // EC8 DCH overstrength factor
    let gamma_rd_dch = 1.3_f64;
    let m_ov_dch = gamma_rd_dch * m_rd;                // 325 kN·m
    let v_cap_dch = 2.0 * m_ov_dch / l_clear;         // 130 kN

    // EC8 DCM overstrength factor
    let gamma_rd_dcm = 1.2_f64;
    let m_ov_dcm = gamma_rd_dcm * m_rd;                // 300 kN·m
    let v_cap_dcm = 2.0 * m_ov_dcm / l_clear;         // 120 kN

    // ACI 318 overstrength (1.25 × fy → effectively 1.25 on M_n)
    let aci_overstrength = 1.25_f64;
    let m_ov_aci = aci_overstrength * m_rd;             // 312.5 kN·m
    let v_cap_aci = 2.0 * m_ov_aci / l_clear;          // 125 kN

    let expected_m_ov_dch = 325.0;
    let expected_v_cap_dch = 130.0;
    let expected_m_ov_dcm = 300.0;
    let expected_v_cap_dcm = 120.0;
    let expected_m_ov_aci = 312.5;
    let expected_v_cap_aci = 125.0;

    let tol = 0.02;

    // DCH checks
    assert!(
        (m_ov_dch - expected_m_ov_dch).abs() / expected_m_ov_dch < tol,
        "Capacity design DCH: M_ov={:.2}, expected {:.2}", m_ov_dch, expected_m_ov_dch
    );
    assert!(
        (v_cap_dch - expected_v_cap_dch).abs() / expected_v_cap_dch < tol,
        "Capacity design DCH: V_cap={:.2}, expected {:.2}", v_cap_dch, expected_v_cap_dch
    );

    // DCM checks
    assert!(
        (m_ov_dcm - expected_m_ov_dcm).abs() / expected_m_ov_dcm < tol,
        "Capacity design DCM: M_ov={:.2}, expected {:.2}", m_ov_dcm, expected_m_ov_dcm
    );
    assert!(
        (v_cap_dcm - expected_v_cap_dcm).abs() / expected_v_cap_dcm < tol,
        "Capacity design DCM: V_cap={:.2}, expected {:.2}", v_cap_dcm, expected_v_cap_dcm
    );

    // ACI checks
    assert!(
        (m_ov_aci - expected_m_ov_aci).abs() / expected_m_ov_aci < tol,
        "Capacity design ACI: M_ov={:.2}, expected {:.2}", m_ov_aci, expected_m_ov_aci
    );
    assert!(
        (v_cap_aci - expected_v_cap_aci).abs() / expected_v_cap_aci < tol,
        "Capacity design ACI: V_cap={:.2}, expected {:.2}", v_cap_aci, expected_v_cap_aci
    );

    // DCH should produce larger shear demand than DCM
    assert!(
        v_cap_dch > v_cap_dcm,
        "DCH shear ({:.2}) should exceed DCM shear ({:.2})", v_cap_dch, v_cap_dcm
    );
}
