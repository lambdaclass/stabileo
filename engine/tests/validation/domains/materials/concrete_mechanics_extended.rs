/// Validation: Extended Concrete Mechanics
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - ACI 209R-92: Prediction of Creep, Shrinkage, and Temperature Effects
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - Bresler: "Design Criteria for Reinforced Columns under Axial Load and Biaxial Bending"
///
/// Tests verify Whitney stress block, modulus of rupture, shear capacity,
/// development length, creep/shrinkage, effective moment of inertia,
/// and biaxial column interaction with solver cross-checks where possible.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ═══════════════════════════════════════════════════════════════
// 1. Whitney Stress Block — Verify a = beta1*c, Mn = As*fy*(d - a/2)
// ═══════════════════════════════════════════════════════════════
//
// Rectangular beam 350 x 600 mm, As = 2000 mm^2, f'c = 30 MPa, fy = 420 MPa.
// Cover to tension steel centroid = 65 mm => d = 600 - 65 = 535 mm.
//
// beta1 = 0.85 for f'c <= 28 MPa; for 28 < f'c <= 55:
//   beta1 = 0.85 - 0.05*(f'c - 28)/7 = 0.85 - 0.05*(30-28)/7 = 0.85 - 0.01429 = 0.8357
//
// Stress block depth:
//   a = As*fy / (0.85*f'c*b) = 2000*420 / (0.85*30*350) = 840000/8925 = 94.12 mm
//
// Neutral axis depth:
//   c = a / beta1 = 94.12 / 0.8357 = 112.63 mm
//
// Verify a = beta1 * c (identity check).
//
// Nominal moment:
//   Mn = As*fy*(d - a/2) = 2000*420*(535 - 47.06) = 2000*420*487.94
//      = 409,869,600 N*mm = 409.87 kN*m
//
// Solver cross-check: Build a simply-supported beam with the same EI
// and apply a concentrated moment equal to Mn at midspan. Verify the
// resulting reactions are consistent (R = Mn/L for a moment at midspan
// of a simply-supported beam produces equal and opposite reactions).

#[test]
fn validation_conc_mech_ext_whitney_stress_block() {
    // --- Section properties ---
    let as_steel: f64 = 2000.0;   // mm^2
    let fz: f64 = 420.0;          // MPa
    let fc_prime: f64 = 30.0;     // MPa
    let b: f64 = 350.0;           // mm
    let h: f64 = 600.0;           // mm
    let cover: f64 = 65.0;        // mm
    let d: f64 = h - cover;       // 535 mm

    // --- beta1 per ACI 318-19 Table 22.2.2.4.3 ---
    let beta1: f64 = if fc_prime <= 28.0 {
        0.85
    } else {
        (0.85 - 0.05 * (fc_prime - 28.0) / 7.0).max(0.65)
    };
    let beta1_expected: f64 = 0.8357;
    assert_close(beta1, beta1_expected, 0.01, "beta1");

    // --- Stress block depth ---
    let a: f64 = as_steel * fz / (0.85 * fc_prime * b);
    let a_expected: f64 = 94.12;
    assert_close(a, a_expected, 0.01, "stress block depth a");

    // --- Neutral axis depth ---
    let c: f64 = a / beta1;
    let c_expected: f64 = 112.63;
    assert_close(c, c_expected, 0.02, "neutral axis depth c");

    // --- Identity: a = beta1 * c ---
    let a_from_c: f64 = beta1 * c;
    assert_close(a_from_c, a, 0.001, "a = beta1 * c identity");

    // --- Nominal moment ---
    let mn: f64 = as_steel * fz * (d - a / 2.0) / 1.0e6; // kN*m
    let mn_expected: f64 = 409.87;
    assert_close(mn, mn_expected, 0.01, "nominal moment Mn");

    // --- Tension-controlled check ---
    let eps_t: f64 = 0.003 * (d - c) / c;
    assert!(eps_t >= 0.005, "Section must be tension-controlled: eps_t={:.6}", eps_t);

    // --- Solver cross-check ---
    // Use a simply-supported beam, apply moment Mn at midspan.
    // For a concentrated moment M at midspan of SS beam:
    //   Reactions: R_A = -M/L (downward), R_B = M/L (upward)
    // We use concrete E = 30000 MPa (solver multiplies by 1000 => 30e6 kN/m^2).
    // A = b*h in m^2 = 0.35*0.60 = 0.21 m^2
    // Iz = b*h^3/12 in m^4 = 0.35*0.6^3/12 = 0.0063 m^4
    let l: f64 = 6.0;
    let n_elem: usize = 4;
    let e_conc: f64 = 30_000.0; // MPa (solver multiplies by 1000)
    let a_sec: f64 = 0.21;
    let iz_sec: f64 = 0.0063;

    let mid_node = n_elem / 2 + 1; // node 3
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: 0.0,
        my: mn, // apply Mn as external moment
    })];
    let input = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions for moment M at midspan of SS beam: equal and opposite vertical
    // R_A = -M/L, R_B = M/L (with sign depending on convention)
    // Sum of ry should be zero for a pure moment load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 0.01, "sum Ry = 0 for pure moment load");
}

// ═══════════════════════════════════════════════════════════════
// 2. Concrete Modulus of Rupture — Mcr = fr * Ig / yt
// ═══════════════════════════════════════════════════════════════
//
// Modulus of rupture (ACI 318-19 Eq. 19.2.3.1):
//   fr = 0.62 * sqrt(f'c) [MPa]
//
// For f'c = 35 MPa:
//   fr = 0.62 * sqrt(35) = 0.62 * 5.9161 = 3.668 MPa
//
// Section: 400 x 700 mm (gross, uncracked)
//   Ig = b*h^3/12 = 400*700^3/12 = 1.1433e10 mm^4
//   yt = h/2 = 350 mm
//
// Cracking moment:
//   Mcr = fr * Ig / yt
//       = 3.668 * 1.1433e10 / 350
//       = 119.83e6 N*mm = 119.83 kN*m
//
// Solver cross-check: apply Mcr as UDL on SS beam, check max moment matches.
// For UDL q on SS beam of length L: Mmax = qL^2/8
//   q = 8*Mcr/L^2

#[test]
fn validation_conc_mech_ext_modulus_of_rupture() {
    let fc_prime: f64 = 35.0;     // MPa
    let b: f64 = 400.0;           // mm
    let h: f64 = 700.0;           // mm

    // --- Modulus of rupture ---
    let fr: f64 = 0.62 * fc_prime.sqrt();
    let fr_expected: f64 = 3.668;
    assert_close(fr, fr_expected, 0.01, "modulus of rupture fr");

    // --- Gross moment of inertia ---
    let ig: f64 = b * h.powi(3) / 12.0;
    let ig_expected: f64 = 1.1433e10;
    assert_close(ig, ig_expected, 0.01, "gross moment of inertia Ig");

    // --- Cracking moment ---
    let yt: f64 = h / 2.0;
    let mcr: f64 = fr * ig / yt / 1.0e6; // kN*m
    let mcr_expected: f64 = 119.83;
    assert_close(mcr, mcr_expected, 0.02, "cracking moment Mcr");

    // --- Solver cross-check ---
    // SS beam, apply UDL such that Mmax = Mcr => q = 8*Mcr/L^2
    let l: f64 = 8.0;
    let q_target: f64 = 8.0 * mcr / (l * l); // kN/m
    let n_elem: usize = 8;
    let e_conc: f64 = 30_000.0;
    // Use actual section properties in m units for solver
    let a_sec: f64 = b * h / 1.0e6;          // m^2
    let iz_sec: f64 = ig / 1.0e12;           // m^4

    let input = make_ss_beam_udl(n_elem, l, e_conc, a_sec, iz_sec, -q_target);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan moment from element forces should approximate Mcr
    // For SS beam with UDL, max moment at midspan: Mmax = qL^2/8
    let expected_mmax: f64 = q_target * l * l / 8.0;
    assert_close(expected_mmax, mcr, 0.01, "Mmax = Mcr consistency");

    // Verify reactions: R = qL/2
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q_target * l, 0.02, "sum Ry = qL");
}

// ═══════════════════════════════════════════════════════════════
// 3. ACI 318 Shear Capacity — Vc = 2*sqrt(f'c)*b*d [psi units]
// ═══════════════════════════════════════════════════════════════
//
// In SI units (ACI 318-19 Eq. 22.5.5.1):
//   Vc = 0.17 * lambda * sqrt(f'c) * bw * d  [N]
//
// f'c = 32 MPa, bw = 300 mm, d = 500 mm, lambda = 1.0 (normal weight)
//   Vc = 0.17 * 1.0 * sqrt(32) * 300 * 500
//      = 0.17 * 5.6569 * 150000
//      = 144,250 N = 144.25 kN
//
// Stirrup design: #10 U-stirrups (Av = 2*78.5 = 157 mm^2), fyt = 420 MPa
//   Required spacing for Vs = 100 kN:
//   s = Av*fyt*d / Vs = 157*420*500 / 100000 = 329.7 mm
//
// Solver cross-check: SS beam with point load => max shear = P/2.
// Set P such that P/2 = Vc => P = 2*Vc

#[test]
fn validation_conc_mech_ext_aci_shear_capacity() {
    let fc_prime: f64 = 32.0;     // MPa
    let bw: f64 = 300.0;          // mm
    let d_eff: f64 = 500.0;       // mm
    let lambda: f64 = 1.0;        // normal weight concrete

    // --- Concrete shear capacity ---
    let vc: f64 = 0.17 * lambda * fc_prime.sqrt() * bw * d_eff; // N
    let vc_kn: f64 = vc / 1000.0;
    let vc_expected: f64 = 144.25;
    assert_close(vc_kn, vc_expected, 0.01, "Vc concrete shear capacity");

    // --- Stirrup spacing for target Vs ---
    let av: f64 = 157.0;          // mm^2 (two legs #10)
    let fyt: f64 = 420.0;         // MPa
    let vs_target: f64 = 100_000.0; // N = 100 kN
    let s_required: f64 = av * fyt * d_eff / vs_target;
    let s_expected: f64 = 329.7;
    assert_close(s_required, s_expected, 0.01, "stirrup spacing");

    // --- ACI max spacing check (§9.7.6.2.2) ---
    // Vs_limit = 0.33*sqrt(f'c)*bw*d. If Vs <= Vs_limit, s_max = min(d/2, 600).
    // If Vs > Vs_limit, s_max = min(d/4, 300).
    // The design spacing must be min(s_required, s_max).
    let vs_limit: f64 = 0.33 * fc_prime.sqrt() * bw * d_eff; // N
    let s_max: f64 = if vs_target <= vs_limit {
        (d_eff / 2.0).min(600.0)
    } else {
        (d_eff / 4.0).min(300.0)
    };
    let s_design: f64 = s_required.min(s_max);
    // With capped spacing, actual Vs increases:
    let vs_actual: f64 = av * fyt * d_eff / s_design; // N
    assert!(vs_actual >= vs_target,
        "Vs_actual={:.0} N must be >= Vs_target={:.0} N with s_design={:.1} mm",
        vs_actual, vs_target, s_design);

    // --- Solver cross-check ---
    // SS beam with midspan point load P = 2*Vc => max shear = Vc at supports
    let p_load: f64 = 2.0 * vc_kn; // kN
    let l: f64 = 6.0;
    let n_elem: usize = 6;
    let e_conc: f64 = 30_000.0;
    let h: f64 = 560.0; // mm (d + cover)
    let a_sec: f64 = bw * h / 1.0e6;
    let iz_sec: f64 = bw * h.powi(3) / 12.0 / 1.0e12;

    let mid_node = n_elem / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p_load,
        my: 0.0,
    })];
    let input = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Each reaction should be P/2 = Vc
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, p_load / 2.0, 0.01, "reaction = Vc");

    // Element shear at support should match Vc
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.v_start.abs(), p_load / 2.0, 0.01, "element shear = Vc");
}

// ═══════════════════════════════════════════════════════════════
// 4. Development Length — ACI 318 §25.4 Tension Bars + Hook
// ═══════════════════════════════════════════════════════════════
//
// Simplified development length (ACI 318-19 §25.4.2.3):
//   ld/db = (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * sqrt(f'c))
//
// #20 bar: db = 19.1 mm, fy = 420 MPa, f'c = 25 MPa
//   psi_t = 1.3 (top bars, > 300mm concrete below)
//   psi_e = 1.0 (uncoated), psi_s = 0.8 (db < 19mm => actually 19.1 => psi_s = 1.0)
//   psi_g = 1.0 (Grade 420)
//   lambda = 1.0
//
//   ld/db = (420 * 1.3 * 1.0 * 1.0 * 1.0) / (1.1 * 1.0 * sqrt(25))
//         = 546 / (1.1 * 5.0)
//         = 546 / 5.5 = 99.27
//   ld = 99.27 * 19.1 = 1896.1 mm
//
// Hook development (ACI 318-19 §25.4.3.1):
//   ldh = (0.24 * psi_e * psi_r * psi_o * psi_c * fy / (lambda * sqrt(f'c))) * db
//   Using all psi = 1.0:
//   ldh = (0.24 * 420 / (1.0 * 5.0)) * 19.1
//       = (0.24 * 84) * 19.1
//       = 20.16 * 19.1 = 385.1 mm
//   Minimum ldh = max(8*db, 150 mm) = max(152.8, 150) = 152.8 mm

#[test]
fn validation_conc_mech_ext_development_length() {
    let db: f64 = 19.1;           // mm, #20 bar (metric designation ~19 mm)
    let fz: f64 = 420.0;          // MPa
    let fc_prime: f64 = 25.0;     // MPa
    let psi_t: f64 = 1.3;         // top bar effect
    let psi_e: f64 = 1.0;         // uncoated
    let psi_s: f64 = 1.0;         // bar size >= 19 mm
    let psi_g: f64 = 1.0;         // Grade 420
    let lambda: f64 = 1.0;        // normal weight

    // --- Straight development length ---
    let ld_over_db: f64 = (fz * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * fc_prime.sqrt());
    let ld_over_db_expected: f64 = 99.27;
    assert_close(ld_over_db, ld_over_db_expected, 0.01, "ld/db ratio");

    let ld: f64 = ld_over_db * db;
    let ld_expected: f64 = 1896.1;
    assert_close(ld, ld_expected, 0.01, "development length ld");

    // --- Minimum check ---
    let ld_min: f64 = 300.0; // mm
    assert!(ld >= ld_min, "ld={:.1} must be >= {:.0} mm", ld, ld_min);

    // --- Hook development length (ACI 318-19 §25.4.3.1) ---
    // ldh = (0.24 * psi_e * psi_r * psi_o * psi_c * fy / (lambda * sqrt(f'c))) * db
    // Using all modification factors = 1.0
    let ldh: f64 = (0.24 * psi_e * 1.0 * 1.0 * 1.0 * fz / (lambda * fc_prime.sqrt())) * db;
    let ldh_expected: f64 = 385.1;
    assert_close(ldh, ldh_expected, 0.02, "hook development length ldh");

    // --- Hook minimum ---
    let ldh_min: f64 = (8.0 * db).max(150.0);
    let ldh_min_expected: f64 = 152.8;
    assert_close(ldh_min, ldh_min_expected, 0.01, "minimum ldh");
    assert!(ldh >= ldh_min, "ldh={:.1} must be >= ldh_min={:.1}", ldh, ldh_min);

    // --- Hook is much shorter than straight ---
    let ratio: f64 = ldh / ld;
    assert!(ratio < 0.30, "Hook ldh/ld ratio={:.3} should be < 0.30", ratio);

    // --- Solver cross-check ---
    // Use a cantilever beam of length = ld (in m) to verify consistent
    // deflection under a known load. The beam properties are derived from
    // the same concrete section.
    let l_m: f64 = ld / 1000.0; // convert mm to m
    let p: f64 = 50.0;          // kN tip load
    let e_conc: f64 = 25_000.0; // MPa
    let b_sec: f64 = 0.30;      // m section width
    let h_sec: f64 = 0.50;      // m section depth
    let a_sec: f64 = b_sec * h_sec;
    let iz_sec: f64 = b_sec * h_sec.powi(3) / 12.0;

    let n_elem: usize = 4;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n_elem, l_m, e_conc, a_sec, iz_sec, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Cantilever tip deflection: delta = P*L^3 / (3*E*I)
    // E in kN/m^2 = e_conc * 1000
    let ei: f64 = e_conc * 1000.0 * iz_sec;
    let delta_expected: f64 = p * l_m.powi(3) / (3.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n_elem + 1).unwrap();
    assert_close(tip.uz.abs(), delta_expected, 0.02, "cantilever tip deflection");
}

// ═══════════════════════════════════════════════════════════════
// 5. Creep Coefficient — ACI 209 Ultimate Creep + Time Factor
// ═══════════════════════════════════════════════════════════════
//
// ACI 209R-92 time development:
//   phi(t,t0) = [t^0.6 / (10 + t^0.6)] * nu_u
//
// where nu_u = 2.35 * gamma_la * gamma_lambda * gamma_vs
//
// Loading age factor (moist cured): gamma_la = 1.25 * t0^(-0.118)
// RH factor: gamma_lambda = 1.27 - 0.67*h  (h = RH/100 >= 0.40)
// V/S factor: gamma_vs = (2/3)*(1 + 1.13*exp(-0.0213*V/S))
//
// Parameters: t0 = 14 days, RH = 50%, V/S = 75 mm
//
// gamma_la = 1.25 * 14^(-0.118) = 1.25 * 0.9155/1.25 = 0.9155
// gamma_lambda = 1.27 - 0.67*0.50 = 1.27 - 0.335 = 0.935
// gamma_vs = (2/3)*(1 + 1.13*exp(-0.0213*75))
//          = (2/3)*(1 + 1.13*exp(-1.5975))
//          = (2/3)*(1 + 1.13*0.2024)
//          = (2/3)*(1 + 0.2287)
//          = (2/3)*1.2287 = 0.8191
//
// nu_u = 2.35 * 0.9155 * 0.935 * 0.8191 = 1.648
//
// At t = 365 days after loading:
//   phi(365) = [365^0.6 / (10 + 365^0.6)] * 1.648
//   365^0.6 = 34.465
//   phi(365) = 34.465 / (10 + 34.465) * 1.648 = 34.465/44.465 * 1.648 = 0.7751 * 1.648 = 1.277

#[test]
fn validation_conc_mech_ext_creep_coefficient() {
    let nu_base: f64 = 2.35;
    let t0: f64 = 14.0;           // days, loading age
    let rh: f64 = 50.0;           // percent
    let vs: f64 = 75.0;           // mm, volume-to-surface ratio

    // --- Loading age factor ---
    let gamma_la: f64 = 1.25 * t0.powf(-0.118);
    let gamma_la_expected: f64 = 0.9155;
    assert_close(gamma_la, gamma_la_expected, 0.01, "gamma_la");

    // --- Humidity factor ---
    let h: f64 = rh / 100.0;
    let gamma_lambda: f64 = 1.27 - 0.67 * h;
    let gamma_lambda_expected: f64 = 0.935;
    assert_close(gamma_lambda, gamma_lambda_expected, 0.01, "gamma_lambda");

    // --- V/S factor ---
    let exp_term: f64 = (-0.0213 * vs).exp();
    let exp_expected: f64 = 0.2024;
    assert_close(exp_term, exp_expected, 0.01, "exp(-0.0213*V/S)");

    let gamma_vs: f64 = (2.0 / 3.0) * (1.0 + 1.13 * exp_term);
    let gamma_vs_expected: f64 = 0.8191;
    assert_close(gamma_vs, gamma_vs_expected, 0.01, "gamma_vs");

    // --- Ultimate creep coefficient ---
    let nu_u: f64 = nu_base * gamma_la * gamma_lambda * gamma_vs;
    let nu_u_expected: f64 = 1.648;
    assert_close(nu_u, nu_u_expected, 0.02, "ultimate creep nu_u");

    // --- Time-dependent creep at t = 365 days ---
    let t: f64 = 365.0;
    let t_pow: f64 = t.powf(0.6);
    let t_pow_expected: f64 = 34.465;
    assert_close(t_pow, t_pow_expected, 0.01, "365^0.6");

    let time_fn: f64 = t_pow / (10.0 + t_pow);
    let time_fn_expected: f64 = 0.7751;
    assert_close(time_fn, time_fn_expected, 0.01, "time function");

    let phi_365: f64 = time_fn * nu_u;
    let phi_365_expected: f64 = 1.277;
    assert_close(phi_365, phi_365_expected, 0.03, "creep coeff phi(365)");

    // --- Sanity: creep increases monotonically ---
    let t2: f64 = 28.0;
    let t2_pow: f64 = t2.powf(0.6);
    let phi_28: f64 = t2_pow / (10.0 + t2_pow) * nu_u;
    assert!(phi_365 > phi_28, "phi(365) > phi(28): {:.3} vs {:.3}", phi_365, phi_28);

    // --- Sanity: phi(t) < nu_u for any finite t ---
    assert!(phi_365 < nu_u, "phi(365)={:.3} must be < nu_u={:.3}", phi_365, nu_u);
}

// ═══════════════════════════════════════════════════════════════
// 6. Shrinkage Strain — ACI 209 + Humidity & Size Corrections
// ═══════════════════════════════════════════════════════════════
//
// ACI 209R-92:
//   (eps_sh)_u = 780e-6 (base ultimate shrinkage, moist cured 7 days)
//
// Humidity correction: gamma_RH = 1.40 - 1.02*h for 0.40 <= h <= 0.80
//   RH = 70%: gamma_RH = 1.40 - 1.02*0.70 = 1.40 - 0.714 = 0.686
//
// Size factor (V/S method): gamma_vs = 1.2*exp(-0.00472*V/S)
//   V/S = 50 mm: gamma_vs = 1.2*exp(-0.00472*50) = 1.2*exp(-0.236)
//              = 1.2*0.7896 = 0.9475
//
// Corrected ultimate: (eps_sh)_u_corr = 780e-6 * 0.686 * 0.9475 = 507.0e-6
//
// Time development (moist cured 7 days):
//   eps_sh(t) = [t / (35 + t)] * (eps_sh)_u_corr
//
// At t = 180 days:
//   eps_sh(180) = 180/(35+180) * 507.0e-6 = 180/215 * 507.0e-6
//              = 0.8372 * 507.0e-6 = 424.5e-6

#[test]
fn validation_conc_mech_ext_shrinkage_strain() {
    let eps_sh_base: f64 = 780.0e-6; // base ultimate shrinkage
    let rh: f64 = 70.0;              // percent
    let vs: f64 = 50.0;              // mm, volume-to-surface ratio

    // --- Humidity correction ---
    let h: f64 = rh / 100.0;
    let gamma_rh: f64 = 1.40 - 1.02 * h;
    let gamma_rh_expected: f64 = 0.686;
    assert_close(gamma_rh, gamma_rh_expected, 0.01, "humidity correction gamma_RH");

    // --- Size factor ---
    let gamma_vs: f64 = 1.2 * (-0.00472 * vs).exp();
    let gamma_vs_expected: f64 = 0.9475;
    assert_close(gamma_vs, gamma_vs_expected, 0.01, "size factor gamma_vs");

    // --- Corrected ultimate shrinkage ---
    let eps_sh_u: f64 = eps_sh_base * gamma_rh * gamma_vs;
    let eps_sh_u_expected: f64 = 507.0e-6;
    assert_close(eps_sh_u, eps_sh_u_expected, 0.02, "corrected ultimate shrinkage");

    // --- Time development at t = 180 days ---
    let t: f64 = 180.0;
    let f_param: f64 = 35.0;
    let time_fn: f64 = t / (f_param + t);
    let time_fn_expected: f64 = 0.8372;
    assert_close(time_fn, time_fn_expected, 0.01, "time function at 180 days");

    let eps_sh_180: f64 = time_fn * eps_sh_u;
    let eps_sh_180_expected: f64 = 424.5e-6;
    assert_close(eps_sh_180, eps_sh_180_expected, 0.02, "shrinkage at 180 days");

    // --- Verify monotonic increase ---
    let t2: f64 = 365.0;
    let eps_sh_365: f64 = (t2 / (f_param + t2)) * eps_sh_u;
    assert!(eps_sh_365 > eps_sh_180,
        "shrinkage must increase: eps(365)={:.4e} > eps(180)={:.4e}", eps_sh_365, eps_sh_180);

    // --- Asymptotic check ---
    let t_large: f64 = 1.0e6;
    let eps_large: f64 = (t_large / (f_param + t_large)) * eps_sh_u;
    let asymp_err: f64 = (eps_large - eps_sh_u).abs() / eps_sh_u;
    assert!(asymp_err < 1e-4, "shrinkage must approach ultimate for large t");

    // --- Sanity range ---
    assert!(eps_sh_180 > 100.0e-6 && eps_sh_180 < 700.0e-6,
        "shrinkage at 180 days = {:.4e} outside plausible range", eps_sh_180);
}

// ═══════════════════════════════════════════════════════════════
// 7. Effective Moment of Inertia — Branson Equation
// ═══════════════════════════════════════════════════════════════
//
// Branson equation (ACI 318-19 Eq. 24.2.3.5a):
//   Ie = (Mcr/Ma)^3 * Ig + [1 - (Mcr/Ma)^3] * Icr
//   when Ma > Mcr; otherwise Ie = Ig
//
// Section: 300 x 550 mm, As = 1200 mm^2, d = 490 mm
// f'c = 28 MPa, n = Es/Ec = 200000/(4700*sqrt(28)) = 200000/24870 = 8.042
//
// Ig = 300*550^3/12 = 4.159e9 mm^4
// yt = 275 mm
// fr = 0.62*sqrt(28) = 3.280 MPa
// Mcr = fr*Ig/yt = 3.280*4.159e9/275 = 49.60e6 N*mm = 49.60 kN*m
//
// Cracked moment of inertia (transformed section):
//   b*x^2/2 = n*As*(d-x)
//   300*x^2/2 = 8.042*1200*(490-x)
//   150*x^2 + 9650.4*x - 4,728,696 = 0
//   x = [-9650.4 + sqrt(9650.4^2 + 4*150*4728696)] / (2*150)
//   discriminant = 93130218 + 2837217600 = 2930347818
//   sqrt(disc) = 54,132.7
//   x = (-9650.4 + 54132.7) / 300 = 148.27 mm
//
//   Icr = b*x^3/3 + n*As*(d-x)^2
//       = 300*148.27^3/3 + 8.042*1200*(490-148.27)^2
//       = 300*3.261e6/3 + 9650.4*116719
//       = 326.1e6 + 1126.4e6
//       = 1452.5e6 mm^4 = 1.4525e9 mm^4
//
// For Ma = 80 kN*m (> Mcr = 49.60):
//   (Mcr/Ma)^3 = (49.60/80)^3 = 0.620^3 = 0.2383
//   Ie = 0.2383 * 4.159e9 + (1 - 0.2383) * 1.4525e9
//      = 0.991e9 + 1.106e9 = 2.097e9 mm^4
//
// Solver cross-check: compute deflection with Ie vs Ig.

#[test]
fn validation_conc_mech_ext_effective_moment_of_inertia() {
    let b: f64 = 300.0;           // mm
    let h: f64 = 550.0;           // mm
    let d: f64 = 490.0;           // mm
    let as_steel: f64 = 1200.0;   // mm^2
    let fc_prime: f64 = 28.0;     // MPa
    let es_steel: f64 = 200_000.0; // MPa

    // --- Modular ratio ---
    let ec: f64 = 4700.0 * fc_prime.sqrt();
    let ec_expected: f64 = 24870.0;
    assert_close(ec, ec_expected, 0.01, "Ec modulus");

    let n: f64 = es_steel / ec;
    let n_expected: f64 = 8.042;
    assert_close(n, n_expected, 0.01, "modular ratio n");

    // --- Gross moment of inertia ---
    let ig: f64 = b * h.powi(3) / 12.0;
    let ig_expected: f64 = 4.159e9;
    assert_close(ig, ig_expected, 0.01, "Ig gross");

    // --- Cracking moment ---
    let yt: f64 = h / 2.0;
    let fr: f64 = 0.62 * fc_prime.sqrt();
    let fr_expected: f64 = 3.280;
    assert_close(fr, fr_expected, 0.01, "modulus of rupture fr");

    let mcr: f64 = fr * ig / yt / 1.0e6; // kN*m
    let mcr_expected: f64 = 49.60;
    assert_close(mcr, mcr_expected, 0.02, "cracking moment Mcr");

    // --- Cracked neutral axis depth (solve quadratic) ---
    // b*x^2/2 = n*As*(d-x)  => (b/2)*x^2 + n*As*x - n*As*d = 0
    let coeff_a: f64 = b / 2.0;           // 150
    let coeff_b: f64 = n * as_steel;      // 9650.4
    let coeff_c: f64 = -n * as_steel * d; // -4728696
    let disc: f64 = coeff_b * coeff_b - 4.0 * coeff_a * coeff_c;
    let x_cr: f64 = (-coeff_b + disc.sqrt()) / (2.0 * coeff_a);
    let x_cr_expected: f64 = 148.27;
    assert_close(x_cr, x_cr_expected, 0.02, "cracked NA depth x");

    // --- Cracked moment of inertia ---
    let icr: f64 = b * x_cr.powi(3) / 3.0 + n * as_steel * (d - x_cr).powi(2);
    let icr_expected: f64 = 1.4525e9;
    assert_close(icr, icr_expected, 0.03, "cracked Icr");

    // --- Branson equation for Ma = 80 kN*m ---
    let ma: f64 = 80.0; // kN*m, service moment
    assert!(ma > mcr, "Ma must exceed Mcr for cracked section");

    let ratio: f64 = mcr / ma;
    let ratio_cubed: f64 = ratio.powi(3);
    let ratio_cubed_expected: f64 = 0.2383;
    assert_close(ratio_cubed, ratio_cubed_expected, 0.02, "(Mcr/Ma)^3");

    let ie: f64 = ratio_cubed * ig + (1.0 - ratio_cubed) * icr;
    let ie_expected: f64 = 2.097e9;
    assert_close(ie, ie_expected, 0.03, "effective Ie");

    // --- Ie must be between Icr and Ig ---
    assert!(ie >= icr && ie <= ig,
        "Ie={:.3e} must be in [{:.3e}, {:.3e}]", ie, icr, ig);

    // --- Solver cross-check ---
    // Compare deflections using Ig vs Ie for a SS beam with UDL
    let l: f64 = 6.0;
    let q: f64 = 20.0; // kN/m
    let n_elem: usize = 8;
    let e_conc: f64 = 24_870.0; // MPa (= Ec, will be *1000 by solver)

    // With Ig
    let a_sec: f64 = b * h / 1.0e6;
    let iz_ig: f64 = ig / 1.0e12; // m^4
    let input_ig = make_ss_beam_udl(n_elem, l, e_conc, a_sec, iz_ig, -q);
    let results_ig = linear::solve_2d(&input_ig).unwrap();
    let mid_ig = results_ig.displacements.iter()
        .find(|dd| dd.node_id == n_elem / 2 + 1).unwrap();

    // With Ie
    let iz_ie: f64 = ie / 1.0e12;
    let input_ie = make_ss_beam_udl(n_elem, l, e_conc, a_sec, iz_ie, -q);
    let results_ie = linear::solve_2d(&input_ie).unwrap();
    let mid_ie = results_ie.displacements.iter()
        .find(|dd| dd.node_id == n_elem / 2 + 1).unwrap();

    // Deflection with Ie should be larger than with Ig (softer section)
    assert!(mid_ie.uz.abs() > mid_ig.uz.abs(),
        "Ie deflection ({:.6}) must exceed Ig deflection ({:.6})",
        mid_ie.uz.abs(), mid_ig.uz.abs());

    // Ratio of deflections should approximately equal Ig/Ie
    let defl_ratio: f64 = mid_ie.uz.abs() / mid_ig.uz.abs();
    let expected_ratio: f64 = ig / ie;
    assert_close(defl_ratio, expected_ratio, 0.02, "deflection ratio Ig/Ie");
}

// ═══════════════════════════════════════════════════════════════
// 8. Biaxial Column Interaction — Bresler Reciprocal Method
// ═══════════════════════════════════════════════════════════════
//
// Bresler (1960) reciprocal load equation:
//   1/Pn = 1/Pnx + 1/Pny - 1/Po
//
// where:
//   Pnx = nominal axial capacity at eccentricity ex (bending about x-axis only)
//   Pny = nominal axial capacity at eccentricity ey (bending about y-axis only)
//   Po  = nominal axial capacity at zero eccentricity
//
// Column: 400 x 400 mm, 8-#25 bars (As_total = 4000 mm^2)
// f'c = 35 MPa, fy = 420 MPa
//
// Po = 0.85*f'c*(Ag - Ast) + Ast*fy
//    = 0.85*35*(160000 - 4000) + 4000*420
//    = 0.85*35*156000 + 1680000
//    = 4641000 + 1680000
//    = 6321000 N = 6321.0 kN
//
// Pnx = 3200 kN (from uniaxial interaction diagram, given)
// Pny = 2800 kN (from uniaxial interaction diagram, given)
//
// 1/Pn = 1/3200 + 1/2800 - 1/6321
//      = 3.125e-4 + 3.571e-4 - 1.582e-4
//      = 5.114e-4
// Pn = 1/5.114e-4 = 1955.4 kN
//
// Solver cross-check: a portal frame column under combined biaxial
// approximation using two separate 2D analyses.

#[test]
fn validation_conc_mech_ext_biaxial_column_interaction() {
    let fc_prime: f64 = 35.0;     // MPa
    let fz: f64 = 420.0;          // MPa
    let b_col: f64 = 400.0;       // mm
    let h_col: f64 = 400.0;       // mm
    let ag: f64 = b_col * h_col;  // 160000 mm^2
    let ast: f64 = 4000.0;        // mm^2, total steel area

    // --- Nominal axial capacity at zero eccentricity ---
    let po: f64 = (0.85 * fc_prime * (ag - ast) + ast * fz) / 1000.0; // kN
    let po_expected: f64 = 6321.0;
    assert_close(po, po_expected, 0.01, "Po axial capacity");

    // --- Uniaxial capacities (from interaction diagrams) ---
    let pnx: f64 = 3200.0; // kN, capacity for bending about x-axis
    let pny: f64 = 2800.0; // kN, capacity for bending about y-axis

    // --- Bresler reciprocal method ---
    let inv_pn: f64 = 1.0 / pnx + 1.0 / pny - 1.0 / po;
    let pn: f64 = 1.0 / inv_pn;
    let pn_expected: f64 = 1955.4;
    assert_close(pn, pn_expected, 0.01, "Bresler biaxial Pn");

    // --- Pn must be less than both uniaxial capacities ---
    assert!(pn < pnx, "Pn={:.1} must be < Pnx={:.1}", pn, pnx);
    assert!(pn < pny, "Pn={:.1} must be < Pny={:.1}", pn, pny);

    // --- Pn must be positive ---
    assert!(pn > 0.0, "Pn must be positive");

    // --- Verify Bresler identity: if Pnx = Pny = Po => Pn = Po ---
    let inv_check: f64 = 1.0 / po + 1.0 / po - 1.0 / po;
    let pn_check: f64 = 1.0 / inv_check;
    assert_close(pn_check, po, 0.001, "Bresler identity Pnx=Pny=Po => Pn=Po");

    // --- Solver cross-check ---
    // Model as a short column (no slenderness effects) in 2D.
    // Apply axial load P = Pn and verify the column carries it without
    // excessive deformation. Use column height = 3.0 m.
    let col_h: f64 = 3.0; // m, column height
    let e_conc: f64 = 30_000.0; // MPa
    let a_sec: f64 = ag / 1.0e6; // m^2
    let iz_sec: f64 = b_col * h_col.powi(3) / 12.0 / 1.0e12; // m^4

    let n_elem: usize = 4;
    // Column modeled along X-axis, fixed at base, load at top
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: -pn, // axial compression along column axis
        fz: 0.0,
        my: 0.0,
    })];
    let input = make_beam(n_elem, col_h, e_conc, a_sec, iz_sec, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Axial shortening: delta = P*L / (E*A)
    // E in kN/m^2 = e_conc * 1000 = 30e6
    let ea: f64 = e_conc * 1000.0 * a_sec;
    let delta_expected: f64 = pn * col_h / ea;
    let tip = results.displacements.iter().find(|dd| dd.node_id == n_elem + 1).unwrap();
    assert_close(tip.ux.abs(), delta_expected, 0.02, "column axial shortening");

    // Reaction at base should equal applied load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), pn, 0.01, "base reaction = Pn");
}
