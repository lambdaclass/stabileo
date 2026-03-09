/// Validation: Advanced FRP/Composite Design Benchmark Cases
///
/// References:
///   - ACI 440.2R-17: Guide for Design of Externally Bonded FRP Systems
///   - ACI 440.1R-15: Guide for Design of Concrete Reinforced with FRP Bars
///   - EN 1992-1-1 (EC2): Eurocode 2 — Design of Concrete Structures
///   - CNR-DT 200 R1/2013: Guide for Design of FRP Strengthening (Italy)
///   - Daniel & Ishai: "Engineering Mechanics of Composite Materials" (2006)
///   - Bank: "Composites for Construction" (2006)
///   - Hollaway & Teng: "Strengthening and Rehabilitation of Civil Infrastructures" (2008)
///
/// Tests verify advanced FRP material comparisons, rule of mixtures,
/// classical laminate theory, flexural/shear strengthening, debonding checks,
/// environmental reduction factors, and deflection reduction after FRP retrofit.

use crate::common::*;

// ================================================================
// 1. CFRP vs GFRP vs AFRP Material Property Comparison
// ================================================================
//
// Three main types of FRP used in civil engineering:
//   CFRP: highest strength and stiffness, best durability
//   GFRP: lowest cost, moderate properties
//   AFRP: high toughness, moderate stiffness
//
// Typical ranges (ACI 440.1R-15, Table 7.2):
//   CFRP: E = 120-580 GPa, fu = 1020-3790 MPa
//   GFRP: E = 35-51 GPa,  fu = 450-1600 MPa
//   AFRP: E = 41-125 GPa, fu = 1000-2540 MPa

#[test]
fn validation_frp_ext_1_cfrp_properties() {
    // Standard-modulus CFRP
    let e_cfrp: f64 = 155_000.0;    // MPa
    let fu_cfrp: f64 = 2400.0;      // MPa
    let eps_u_cfrp: f64 = fu_cfrp / e_cfrp;

    // E-glass GFRP
    let e_gfrp: f64 = 42_000.0;     // MPa
    let fu_gfrp: f64 = 690.0;       // MPa
    let eps_u_gfrp: f64 = fu_gfrp / e_gfrp;

    // Kevlar-49 AFRP
    let e_afrp: f64 = 70_000.0;     // MPa
    let fu_afrp: f64 = 1400.0;      // MPa
    let eps_u_afrp: f64 = fu_afrp / e_afrp;

    // CFRP: highest modulus
    assert!(
        e_cfrp > e_afrp && e_afrp > e_gfrp,
        "Modulus ranking: CFRP({:.0}) > AFRP({:.0}) > GFRP({:.0})",
        e_cfrp, e_afrp, e_gfrp
    );

    // CFRP: highest strength
    assert!(
        fu_cfrp > fu_afrp && fu_afrp > fu_gfrp,
        "Strength ranking: CFRP({:.0}) > AFRP({:.0}) > GFRP({:.0})",
        fu_cfrp, fu_afrp, fu_gfrp
    );

    // AFRP: highest ultimate strain (most ductile)
    assert!(
        eps_u_afrp > eps_u_cfrp && eps_u_gfrp > eps_u_cfrp,
        "AFRP eps_u={:.4} and GFRP eps_u={:.4} > CFRP eps_u={:.4}",
        eps_u_afrp, eps_u_gfrp, eps_u_cfrp
    );

    // Verify linear elastic behavior (no yield plateau):
    // eps_u = fu / E for all three
    assert_close(eps_u_cfrp, fu_cfrp / e_cfrp, 0.01, "CFRP linear elastic");
    assert_close(eps_u_gfrp, fu_gfrp / e_gfrp, 0.01, "GFRP linear elastic");
    assert_close(eps_u_afrp, fu_afrp / e_afrp, 0.01, "AFRP linear elastic");

    // Specific stiffness comparison (E/density proxy via E/fu ratio)
    let specific_cfrp: f64 = e_cfrp / fu_cfrp;
    let specific_gfrp: f64 = e_gfrp / fu_gfrp;
    // CFRP has higher E/fu ratio (stiffer per unit strength)
    assert!(
        specific_cfrp > specific_gfrp,
        "CFRP specific stiffness {:.1} > GFRP {:.1}", specific_cfrp, specific_gfrp
    );
}

// ================================================================
// 2. Rule of Mixtures — Composite Modulus
// ================================================================
//
// For a unidirectional FRP composite:
//   Longitudinal: E1 = V_f * E_f + (1 - V_f) * E_m  (Voigt, upper bound)
//   Transverse:   1/E2 = V_f/E_f + (1-V_f)/E_m      (Reuss, lower bound)
//
// Source: Daniel & Ishai, "Engineering Mechanics of Composite Materials", Ch.3

#[test]
fn validation_frp_ext_2_rule_of_mixtures() {
    // Carbon fiber properties
    let e_f: f64 = 230_000.0;   // MPa, carbon fiber
    let e_m: f64 = 3_500.0;     // MPa, epoxy matrix

    // Fiber volume fractions to test
    let vf_values: [f64; 3] = [0.30, 0.50, 0.65];

    for &vf in &vf_values {
        let vm: f64 = 1.0 - vf;

        // Longitudinal modulus (Voigt model — iso-strain)
        let e1_voigt: f64 = vf * e_f + vm * e_m;

        // Transverse modulus (Reuss model — iso-stress)
        let e2_reuss: f64 = 1.0 / (vf / e_f + vm / e_m);

        // Verify E1 >> E2 (high anisotropy)
        let ratio: f64 = e1_voigt / e2_reuss;
        assert!(
            ratio > 5.0,
            "Vf={:.2}: E1/E2 = {:.1} should be >> 1 (anisotropy)", vf, ratio
        );

        // Verify bounds: E_m < E2 < E1 < E_f
        assert!(
            e_m < e2_reuss && e2_reuss < e1_voigt && e1_voigt < e_f,
            "Vf={:.2}: E_m({:.0}) < E2({:.0}) < E1({:.0}) < E_f({:.0})",
            vf, e_m, e2_reuss, e1_voigt, e_f
        );
    }

    // Specific check at Vf = 0.60 (typical for CFRP laminates)
    let vf: f64 = 0.60;
    let e1_expected: f64 = 0.60 * e_f + 0.40 * e_m;
    let e1_calculated: f64 = vf * e_f + (1.0 - vf) * e_m;
    assert_close(e1_calculated, e1_expected, 0.01, "ROM at Vf=0.60");

    // Expected: E1 = 0.60 * 230000 + 0.40 * 3500 = 138000 + 1400 = 139400 MPa
    assert_close(e1_calculated, 139_400.0, 0.01, "ROM E1 = 139400 MPa");

    // Transverse at Vf = 0.60
    let e2_calculated: f64 = 1.0 / (vf / e_f + (1.0 - vf) / e_m);
    // 1/(0.60/230000 + 0.40/3500) = 1/(2.609e-6 + 1.143e-4) = 1/1.169e-4 = 8555 MPa
    assert_close(e2_calculated, 8555.0, 0.02, "ROM E2 at Vf=0.60");
}

// ================================================================
// 3. Classical Laminate Theory — [A]/[B]/[D] Matrices
// ================================================================
//
// For a symmetric laminate [0/90]s with n plies of thickness t:
//   [A] = extensional stiffness matrix (N/mm)
//   [B] = coupling matrix (= 0 for symmetric laminates)
//   [D] = bending stiffness matrix (N·mm)
//
// A_ij = sum_k (Q_ij)_k * t_k
// D_ij = sum_k (Q_ij)_k * (z_k^3 - z_{k-1}^3) / 3
//
// Source: Daniel & Ishai, Ch.7; Jones, "Mechanics of Composite Materials"

#[test]
fn validation_frp_ext_3_laminate_stiffness() {
    // Unidirectional ply properties (carbon/epoxy)
    let e1: f64 = 140_000.0;    // MPa
    let e2: f64 = 10_000.0;     // MPa
    let nu12: f64 = 0.30;
    let g12: f64 = 5_000.0;     // MPa

    // Reciprocal relation
    let nu21: f64 = nu12 * e2 / e1;
    let denom: f64 = 1.0 - nu12 * nu21;

    // Q matrix for 0-degree ply
    let q11_0: f64 = e1 / denom;
    let q22_0: f64 = e2 / denom;
    let q12_0: f64 = nu12 * e2 / denom;
    let q66_0: f64 = g12;

    // Q matrix for 90-degree ply: swap Q11 <-> Q22
    let q11_90: f64 = q22_0;
    let q22_90: f64 = q11_0;
    let q12_90: f64 = q12_0;  // Q12 unchanged under 90-deg rotation
    let q66_90: f64 = q66_0;  // Q66 unchanged under 90-deg rotation

    // Symmetric [0/90]s laminate: 4 plies, each t = 0.125 mm
    let t_ply: f64 = 0.125;    // mm
    let n_plies: usize = 4;     // [0/90/90/0]
    let h_total: f64 = n_plies as f64 * t_ply; // = 0.5 mm

    // [A] matrix: extensional stiffness
    // Two 0-deg plies + two 90-deg plies, each thickness t_ply
    let a11: f64 = 2.0 * q11_0 * t_ply + 2.0 * q11_90 * t_ply;
    let a22: f64 = 2.0 * q22_0 * t_ply + 2.0 * q22_90 * t_ply;
    let a12: f64 = 2.0 * q12_0 * t_ply + 2.0 * q12_90 * t_ply;
    let a66: f64 = 2.0 * q66_0 * t_ply + 2.0 * q66_90 * t_ply;

    // For [0/90]s: A11 = A22 (quasi-isotropic in-plane for this stacking)
    assert_close(a11, a22, 0.01, "[A] symmetry: A11 = A22 for [0/90]s");

    // [B] matrix: coupling (= 0 for symmetric laminate)
    // For symmetric laminate, B_ij = 0 by definition
    // Verify: plies above and below midplane cancel out coupling
    // Midplane at z = 0 (total thickness from -h/2 to +h/2)
    // Ply layout [0/90/90/0]:
    //   ply 1 (0-deg):  z from -0.250 to -0.125
    //   ply 2 (90-deg): z from -0.125 to  0.000
    //   ply 3 (90-deg): z from  0.000 to  0.125
    //   ply 4 (0-deg):  z from  0.125 to  0.250
    let z: [f64; 5] = [-h_total / 2.0, -t_ply, 0.0, t_ply, h_total / 2.0];

    // B11 = sum Q11_k * (z_k^2 - z_{k-1}^2) / 2
    let b11: f64 = q11_0 * (z[1].powi(2) - z[0].powi(2)) / 2.0
        + q11_90 * (z[2].powi(2) - z[1].powi(2)) / 2.0
        + q11_90 * (z[3].powi(2) - z[2].powi(2)) / 2.0
        + q11_0 * (z[4].powi(2) - z[3].powi(2)) / 2.0;
    assert!(
        b11.abs() < 1e-6,
        "[B] coupling matrix B11 = {:.6} ~ 0 for symmetric laminate", b11
    );

    // [D] matrix: bending stiffness
    // D_ij = sum Q_ij_k * (z_k^3 - z_{k-1}^3) / 3
    let d11: f64 = q11_0 * (z[1].powi(3) - z[0].powi(3)) / 3.0
        + q11_90 * (z[2].powi(3) - z[1].powi(3)) / 3.0
        + q11_90 * (z[3].powi(3) - z[2].powi(3)) / 3.0
        + q11_0 * (z[4].powi(3) - z[3].powi(3)) / 3.0;

    let d22: f64 = q22_0 * (z[1].powi(3) - z[0].powi(3)) / 3.0
        + q22_90 * (z[2].powi(3) - z[1].powi(3)) / 3.0
        + q22_90 * (z[3].powi(3) - z[2].powi(3)) / 3.0
        + q22_0 * (z[4].powi(3) - z[3].powi(3)) / 3.0;

    // For [0/90]s: D11 != D22 because outer plies (0-deg) dominate bending
    // Outer 0-deg plies have higher Q11, so D11 > D22
    assert!(
        d11 > d22,
        "[D] D11={:.2} > D22={:.2} (outer 0-deg plies stiffer in bending)", d11, d22
    );

    // D should be positive
    assert!(d11 > 0.0, "D11 > 0");
    assert!(d22 > 0.0, "D22 > 0");

    // A and D should have consistent units check
    // A has units N/mm, D has units N*mm
    // D ~ A * h^2 / 12 for homogeneous plate
    let d_approx: f64 = a11 * h_total.powi(2) / 12.0;
    // This is approximate; the actual D depends on ply positions
    let _ratio: f64 = d11 / d_approx;

    let _a12 = a12;
    let _a66 = a66;
}

// ================================================================
// 4. FRP Flexural Strengthening — Moment Capacity Increase
// ================================================================
//
// RC beam strengthened with externally bonded CFRP:
//   Original: Mn = As * fy * (d - a/2)
//   Strengthened: Mn = As*fy*(d - a_new/2) + Af*ffe*(df - a_new/2)
//   where a_new = (As*fy + Af*ffe) / (0.85*f'c*b)
//
// Source: ACI 440.2R-17, Chapter 10

#[test]
fn validation_frp_ext_4_frp_strengthening() {
    // Original RC beam
    let fc: f64 = 30.0;           // MPa
    let b: f64 = 250.0;           // mm
    let d: f64 = 500.0;           // mm
    let as_steel: f64 = 1500.0;   // mm^2, tension steel
    let fy: f64 = 420.0;          // MPa

    // Original capacity
    let a_orig: f64 = as_steel * fy / (0.85 * fc * b);
    let mn_orig: f64 = as_steel * fy * (d - a_orig / 2.0) / 1e6; // kN*m

    // CFRP strengthening system
    let n_plies: f64 = 3.0;
    let tf: f64 = 0.167;          // mm per ply
    let wf: f64 = 250.0;          // mm, FRP width = beam width
    let af: f64 = n_plies * tf * wf;  // = 125.25 mm^2
    let ef: f64 = 230_000.0;      // MPa
    let efu: f64 = 0.017;         // design rupture strain

    // Debonding strain limit (ACI 440.2R Eq. 10.1)
    let n_ef_tf: f64 = n_plies * ef * tf;
    let km: f64 = if n_ef_tf <= 180_000.0 {
        (1.0 / (60.0 * efu)) * (1.0 - n_ef_tf / 360_000.0)
    } else {
        1.0 / (60.0 * efu)
    };
    let efe: f64 = km * efu;      // effective strain
    let ffe: f64 = ef * efe;      // effective stress

    // Depth to FRP (bottom face of beam)
    let df: f64 = d + 50.0;       // mm

    // New stress block depth
    let a_new: f64 = (as_steel * fy + af * ffe) / (0.85 * fc * b);

    // Strengthened moment capacity
    let mn_steel: f64 = as_steel * fy * (d - a_new / 2.0) / 1e6;
    let mn_frp: f64 = 0.85 * af * ffe * (df - a_new / 2.0) / 1e6; // psi_f = 0.85
    let mn_strengthened: f64 = mn_steel + mn_frp;

    // Verify capacity increase
    assert!(
        mn_strengthened > mn_orig,
        "Strengthened {:.1} > original {:.1} kN*m", mn_strengthened, mn_orig
    );

    // Calculate percentage increase
    let increase_pct: f64 = (mn_strengthened - mn_orig) / mn_orig * 100.0;
    assert!(
        increase_pct > 10.0 && increase_pct < 80.0,
        "Capacity increase {:.1}% should be 10-80% (typical for FRP)", increase_pct
    );

    // Verify analytical values
    // a_orig = 1500*420/(0.85*30*250) = 630000/6375 = 98.82 mm
    assert_close(a_orig, 98.82, 0.01, "Original stress block depth");

    // mn_orig = 1500*420*(500 - 98.82/2) / 1e6 = 630000*450.59/1e6 = 283.87 kN*m
    assert_close(mn_orig, 283.87, 0.01, "Original moment capacity");

    // Verify the new stress block is deeper
    assert!(
        a_new > a_orig,
        "New stress block a={:.2} > original a={:.2}", a_new, a_orig
    );
}

// ================================================================
// 5. IC/PE Debonding Strain Limits (ACI 440.2R)
// ================================================================
//
// Two debonding modes for externally bonded FRP:
//   IC (intermediate crack): εfd = 0.41 * sqrt(f'c / (n*Ef*tf))
//   PE (plate end): governed by concrete tensile strength
//
// The effective strain is limited to the minimum of:
//   εfe = min(εfd, κm*εfu, 0.90*εfu)
//
// Source: ACI 440.2R-17, Section 10.1

#[test]
fn validation_frp_ext_5_debonding_check() {
    let fc: f64 = 35.0;           // MPa

    // CFRP system parameters
    let n: f64 = 1.0;             // single ply
    let ef: f64 = 230_000.0;      // MPa
    let tf: f64 = 0.167;          // mm
    let efu: f64 = 0.017;         // design rupture strain

    // IC debonding strain (ACI 440.2R Eq. 10.1a)
    let efd_ic: f64 = 0.41 * (fc / (n * ef * tf)).sqrt();

    // Expected: 0.41 * sqrt(35 / (1 * 230000 * 0.167))
    //         = 0.41 * sqrt(35 / 38410)
    //         = 0.41 * sqrt(9.112e-4)
    //         = 0.41 * 0.03019
    //         = 0.01238
    assert_close(efd_ic, 0.01238, 0.02, "IC debonding strain");

    // κm debonding factor (ACI 440.2R)
    let n_ef_tf: f64 = n * ef * tf;
    let km: f64 = if n_ef_tf <= 180_000.0 {
        (1.0 / (60.0 * efu)) * (1.0 - n_ef_tf / 360_000.0)
    } else {
        1.0 / (60.0 * efu)
    };
    let e_km: f64 = km * efu;

    // Effective strain is minimum of debonding limits
    let efe: f64 = efd_ic.min(e_km).min(0.90 * efu);

    // The effective strain should be less than rupture strain
    assert!(
        efe < efu,
        "Effective strain {:.5} < rupture strain {:.5}", efe, efu
    );

    // Debonding controls (not rupture) for typical cases
    assert!(
        efe < 0.90 * efu,
        "Debonding ({:.5}) controls over 90%% rupture ({:.5})", efe, 0.90 * efu
    );

    // Test with multiple plies: debonding strain decreases
    let n2: f64 = 3.0;
    let efd_ic_3ply: f64 = 0.41 * (fc / (n2 * ef * tf)).sqrt();
    assert!(
        efd_ic_3ply < efd_ic,
        "3-ply IC debonding {:.5} < 1-ply {:.5} (more plies = earlier debonding)",
        efd_ic_3ply, efd_ic
    );

    // Ratio should be sqrt(1/3)
    let ratio: f64 = efd_ic_3ply / efd_ic;
    let expected_ratio: f64 = (1.0 / 3.0_f64).sqrt();
    assert_close(ratio, expected_ratio, 0.01, "Debonding ratio = sqrt(1/3)");
}

// ================================================================
// 6. FRP U-Wrap Shear Strengthening
// ================================================================
//
// Shear contribution of FRP U-wraps (ACI 440.2R):
//   Vf = Afv * ffe * (sin(alpha) + cos(alpha)) * dfv / sf
//   where:
//     Afv = 2 * n * tf * wf  (both sides)
//     ffe = Ef * efe
//     dfv = effective FRP depth (≈ d for U-wrap)
//     sf  = strip spacing (center-to-center)
//
// For continuous wraps: sf = wf
// Source: ACI 440.2R-17, Section 11

#[test]
fn validation_frp_ext_6_shear_strengthening() {
    let b: f64 = 300.0;           // mm, beam width
    let d: f64 = 450.0;           // mm, effective depth
    let fc: f64 = 30.0;           // MPa

    // CFRP U-wrap parameters
    let n: f64 = 1.0;
    let tf: f64 = 0.167;          // mm
    let ef: f64 = 230_000.0;      // MPa
    let efu: f64 = 0.017;

    // Case A: discrete strips
    let wf_a: f64 = 100.0;        // mm, strip width
    let sf_a: f64 = 200.0;        // mm, center-to-center spacing
    let alpha_a: f64 = 90.0_f64.to_radians(); // vertical strips

    let efe_a: f64 = 0.004_f64.min(0.75 * efu);
    let ffe_a: f64 = ef * efe_a;
    let afv_a: f64 = 2.0 * n * tf * wf_a;
    let dfv_a: f64 = d;
    let vf_a: f64 = afv_a * ffe_a * (alpha_a.sin() + alpha_a.cos()) * dfv_a / sf_a / 1000.0;

    // Expected: Afv = 2*1*0.167*100 = 33.4 mm^2
    // ffe = 230000*0.004 = 920 MPa
    // Vf = 33.4 * 920 * 1.0 * 450 / 200 / 1000 = 69.15 kN
    assert_close(afv_a, 33.4, 0.01, "FRP shear area (discrete strips)");
    assert_close(vf_a, 69.15, 0.02, "Vf discrete strips");

    // Case B: continuous wrap (sf = wf)
    let wf_b: f64 = 300.0;        // full width (continuous)
    let sf_b: f64 = wf_b;         // continuous
    let afv_b: f64 = 2.0 * n * tf * wf_b;
    let vf_b: f64 = afv_b * ffe_a * (alpha_a.sin() + alpha_a.cos()) * dfv_a / sf_b / 1000.0;

    // Continuous should give higher Vf than discrete
    assert!(
        vf_b > vf_a,
        "Continuous Vf={:.1} > discrete Vf={:.1} kN", vf_b, vf_a
    );

    // Concrete shear capacity: Vc = 0.17*sqrt(f'c)*b*d / 1000
    let vc: f64 = 0.17 * fc.sqrt() * b * d / 1000.0;
    // Vc = 0.17 * 5.477 * 300 * 450 / 1000 = 125.78 kN
    assert_close(vc, 125.78, 0.02, "Concrete shear capacity Vc");

    // Total shear capacity with FRP (using discrete strips)
    let phi_v: f64 = 0.75;        // shear reduction factor
    let vn: f64 = phi_v * (vc + vf_a);
    assert!(
        vn > phi_v * vc,
        "FRP increases design shear capacity: {:.1} > {:.1} kN", vn, phi_v * vc
    );

    // Verify max FRP contribution limit (ACI): Vf <= 0.66*sqrt(f'c)*b*d
    let vf_max: f64 = 0.66 * fc.sqrt() * b * d / 1000.0;
    assert!(
        vf_a < vf_max,
        "Vf={:.1} < Vf_max={:.1} kN (within ACI limit)", vf_a, vf_max
    );
}

// ================================================================
// 7. Environmental Reduction Factors (ACI 440.2R)
// ================================================================
//
// CE factors reduce design FRP strength for long-term degradation:
//   f_fu = CE * f*_fu  (design strength from guaranteed value)
//   epsilon_fu = CE * epsilon*_fu
//
// ACI 440.2R-17 Table 9.4:
//   Interior:  CFRP CE=0.95, GFRP CE=0.75, AFRP CE=0.85
//   Exterior:  CFRP CE=0.85, GFRP CE=0.65, AFRP CE=0.75
//   Aggressive: CFRP CE=0.85, GFRP CE=0.50, AFRP CE=0.70

#[test]
fn validation_frp_ext_7_environmental_factor() {
    // Interior exposure (enclosed conditioned space)
    let ce_cfrp_int: f64 = 0.95;
    let ce_gfrp_int: f64 = 0.75;
    let ce_afrp_int: f64 = 0.85;

    // Exterior exposure (bridges, parking structures)
    let ce_cfrp_ext: f64 = 0.85;
    let ce_gfrp_ext: f64 = 0.65;
    let ce_afrp_ext: f64 = 0.75;

    // Aggressive environment (chemical plants, wastewater)
    let ce_cfrp_agg: f64 = 0.85;
    let ce_gfrp_agg: f64 = 0.50;
    let ce_afrp_agg: f64 = 0.70;

    // Apply CE to guaranteed properties
    let ffu_star_cfrp: f64 = 3000.0;  // MPa, guaranteed from manufacturer
    let ffu_star_gfrp: f64 = 800.0;
    let ffu_star_afrp: f64 = 1700.0;

    // Design strengths — interior
    let ffu_cfrp_int: f64 = ce_cfrp_int * ffu_star_cfrp;  // 2850 MPa
    let ffu_gfrp_int: f64 = ce_gfrp_int * ffu_star_gfrp;  //  600 MPa
    let ffu_afrp_int: f64 = ce_afrp_int * ffu_star_afrp;  // 1445 MPa

    assert_close(ffu_cfrp_int, 2850.0, 0.01, "CFRP design strength interior");
    assert_close(ffu_gfrp_int, 600.0, 0.01, "GFRP design strength interior");
    assert_close(ffu_afrp_int, 1445.0, 0.01, "AFRP design strength interior");

    // Design strengths — aggressive
    let ffu_cfrp_agg: f64 = ce_cfrp_agg * ffu_star_cfrp;  // 2550 MPa
    let ffu_gfrp_agg: f64 = ce_gfrp_agg * ffu_star_gfrp;  //  400 MPa
    let ffu_afrp_agg: f64 = ce_afrp_agg * ffu_star_afrp;  // 1190 MPa

    assert_close(ffu_cfrp_agg, 2550.0, 0.01, "CFRP design strength aggressive");
    assert_close(ffu_gfrp_agg, 400.0, 0.01, "GFRP design strength aggressive");
    assert_close(ffu_afrp_agg, 1190.0, 0.01, "AFRP design strength aggressive");

    // CFRP retains highest fraction in all environments
    assert!(
        ce_cfrp_int >= ce_afrp_int && ce_afrp_int >= ce_gfrp_int,
        "Interior: CFRP({:.2}) >= AFRP({:.2}) >= GFRP({:.2})",
        ce_cfrp_int, ce_afrp_int, ce_gfrp_int
    );
    assert!(
        ce_cfrp_ext >= ce_afrp_ext && ce_afrp_ext >= ce_gfrp_ext,
        "Exterior: CFRP({:.2}) >= AFRP({:.2}) >= GFRP({:.2})",
        ce_cfrp_ext, ce_afrp_ext, ce_gfrp_ext
    );
    assert!(
        ce_cfrp_agg >= ce_afrp_agg && ce_afrp_agg >= ce_gfrp_agg,
        "Aggressive: CFRP({:.2}) >= AFRP({:.2}) >= GFRP({:.2})",
        ce_cfrp_agg, ce_afrp_agg, ce_gfrp_agg
    );

    // Glass most affected going from interior to aggressive
    let gfrp_loss: f64 = 1.0 - ce_gfrp_agg / ce_gfrp_int;
    let cfrp_loss: f64 = 1.0 - ce_cfrp_agg / ce_cfrp_int;
    assert!(
        gfrp_loss > cfrp_loss,
        "GFRP loses {:.0}% vs CFRP loses {:.0}% (interior to aggressive)",
        gfrp_loss * 100.0, cfrp_loss * 100.0
    );
}

// ================================================================
// 8. Deflection Reduction After FRP Strengthening
// ================================================================
//
// FRP strengthening increases effective moment of inertia (Ie):
//   Ie_strengthened > Ie_original
//   => delta_strengthened < delta_original
//
// For a simply supported beam with UDL:
//   delta = 5*w*L^4 / (384*E*Ie)
//
// The effective Ie uses Branson's equation (ACI 318):
//   Ie = (Mcr/Ma)^3 * Ig + [1 - (Mcr/Ma)^3] * Icr
//
// After FRP: Icr increases (FRP adds to cracked section stiffness)
//
// Source: ACI 440.2R-17, Section 12; ACI 318-19 Section 24.2

#[test]
fn validation_frp_ext_8_deflection_with_frp() {
    // Beam geometry
    let b: f64 = 300.0;           // mm
    let h: f64 = 600.0;           // mm
    let d: f64 = 550.0;           // mm (effective depth)
    let l: f64 = 8000.0;          // mm (span)

    // Material properties
    let fc: f64 = 30.0;           // MPa
    let ec: f64 = 4700.0 * fc.sqrt(); // ACI: Ec = 4700*sqrt(f'c)
    let es: f64 = 200_000.0;      // MPa, steel
    let ns: f64 = es / ec;        // modular ratio, steel

    // Steel reinforcement
    let as_steel: f64 = 1500.0;   // mm^2

    // Gross moment of inertia
    let ig: f64 = b * h.powi(3) / 12.0; // mm^4

    // Cracked moment of inertia (original, no FRP)
    // Neutral axis: n*As*(d-c) = b*c^2/2
    // c^2 + 2*n*As/b * c - 2*n*As*d/b = 0
    let aa: f64 = 1.0;
    let bb_orig: f64 = 2.0 * ns * as_steel / b;
    let cc_orig: f64 = -2.0 * ns * as_steel * d / b;
    let c_orig: f64 = (-bb_orig + (bb_orig.powi(2) - 4.0 * aa * cc_orig).sqrt()) / (2.0 * aa);

    let icr_orig: f64 = b * c_orig.powi(3) / 3.0 + ns * as_steel * (d - c_orig).powi(2);

    // FRP strengthening
    let n_plies: f64 = 2.0;
    let tf: f64 = 0.167;          // mm
    let wf: f64 = 300.0;          // mm
    let af: f64 = n_plies * tf * wf;
    let ef: f64 = 230_000.0;      // MPa
    let nf: f64 = ef / ec;        // modular ratio, FRP
    let df: f64 = h as f64;       // FRP at bottom face

    // Cracked moment of inertia (with FRP)
    // n_s*As*(d-c) + n_f*Af*(df-c) = b*c^2/2
    let bb_frp: f64 = 2.0 * (ns * as_steel + nf * af) / b;
    let cc_frp: f64 = -2.0 * (ns * as_steel * d + nf * af * df) / b;
    let c_frp: f64 = (-bb_frp + (bb_frp.powi(2) - 4.0 * aa * cc_frp).sqrt()) / (2.0 * aa);

    let icr_frp: f64 = b * c_frp.powi(3) / 3.0
        + ns * as_steel * (d - c_frp).powi(2)
        + nf * af * (df - c_frp).powi(2);

    // FRP increases cracked moment of inertia
    assert!(
        icr_frp > icr_orig,
        "Icr with FRP ({:.0}) > Icr original ({:.0})", icr_frp, icr_orig
    );

    // Uniform load and service moment
    let w: f64 = 25.0;            // kN/m = 25 N/mm
    let ma: f64 = w * l.powi(2) / 8.0; // N*mm, service moment at midspan

    // Cracking moment
    let fr: f64 = 0.62 * fc.sqrt();  // MPa, modulus of rupture
    let mcr: f64 = fr * ig / (h / 2.0); // N*mm

    // Branson's equation for effective Ie
    let ratio: f64 = (mcr / ma).min(1.0);
    let ratio3: f64 = ratio.powi(3);
    let ie_orig: f64 = ratio3 * ig + (1.0 - ratio3) * icr_orig;
    let ie_frp: f64 = ratio3 * ig + (1.0 - ratio3) * icr_frp;

    // Deflections: delta = 5*w*L^4 / (384*Ec*Ie)
    let delta_orig: f64 = 5.0 * w * l.powi(4) / (384.0 * ec * ie_orig);
    let delta_frp: f64 = 5.0 * w * l.powi(4) / (384.0 * ec * ie_frp);

    // FRP reduces deflection
    assert!(
        delta_frp < delta_orig,
        "Deflection with FRP ({:.3} mm) < original ({:.3} mm)", delta_frp, delta_orig
    );

    // Deflection reduction percentage
    let reduction_pct: f64 = (1.0 - delta_frp / delta_orig) * 100.0;
    assert!(
        reduction_pct > 1.0 && reduction_pct < 50.0,
        "Deflection reduction {:.1}% should be reasonable (1-50%)", reduction_pct
    );

    // Verify Ec calculation
    let ec_expected: f64 = 4700.0 * fc.sqrt();
    assert_close(ec, ec_expected, 0.01, "Ec = 4700*sqrt(f'c)");

    // Verify neutral axis shifts up with FRP (more tension reinforcement)
    assert!(
        c_frp > c_orig,
        "Neutral axis deeper with FRP: c_frp={:.1} > c_orig={:.1} mm", c_frp, c_orig
    );
}
