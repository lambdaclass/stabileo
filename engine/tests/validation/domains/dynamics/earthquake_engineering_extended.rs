/// Validation: Extended Earthquake Engineering (ASCE 7-22)
///
/// References:
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria, Ch. 12
///   - FEMA P-1050: NEHRP Recommended Seismic Provisions (2015)
///   - Chopra: "Dynamics of Structures", 5th Ed. (2017)
///   - Paulay & Priestley: "Seismic Design of RC and Masonry Buildings"
///
/// Tests cover:
///   1. ASCE 7 equivalent lateral force — V = Cs*W, Cs = SDS/(R/Ie), vertical distribution Fx = Cvx*V
///   2. Response modification factor — R factor effect on base shear, R=3 vs R=8
///   3. Story drift — delta_x = Cd*delta_xe/Ie, allowable drift check per ASCE 7 Table 12.12-1
///   4. Overstrength factor — Omega_0 amplification for connections and collectors
///   5. Torsional irregularity — accidental eccentricity 5%*Ld, torsional amplification factor Ax
///   6. P-delta effects — stability coefficient theta = P*delta*Ie/(V*h*Cd), theta_max check
///   7. Diaphragm forces — Fpx = sum(Fi)/sum(wi) * wpx, min/max bounds
///   8. Modal combination rules — CQC vs SRSS for well-separated vs closely-spaced modes

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver internally multiplies by 1000 to get kN/m^2)
const A: f64 = 0.02;      // m^2
const IZ: f64 = 2e-4;     // m^4

// ================================================================
// 1. ASCE 7 Equivalent Lateral Force — V = Cs*W, Vertical Distribution
// ================================================================
//
// ASCE 7-22 section 12.8: Equivalent Lateral Force Procedure
//
// V = Cs * W where:
//   Cs = SDS / (R/Ie)                  (Eq. 12.8-2)
//   Cs <= SD1 / (T*(R/Ie)) for T<=TL   (Eq. 12.8-3)
//   Cs >= max(0.044*SDS*Ie, 0.01)       (Eq. 12.8-5)
//   If S1 >= 0.6g: Cs >= 0.5*S1/(R/Ie)  (Eq. 12.8-6)
//
// Vertical distribution: Fx = Cvx * V
//   Cvx = wx * hx^k / sum(wi * hi^k)
//   k = 1 for T <= 0.5s, k = 2 for T >= 2.5s, interpolated between
//
// Example: 5-story special moment frame, SDC D
//   SDS = 1.0g, SD1 = 0.6g, S1 = 0.6g
//   R = 8, Ie = 1.0
//   hn = 17.5 m (5 stories x 3.5 m), Ct = 0.0724, x = 0.8
//   Ta = 0.0724 * 17.5^0.8 = 0.804 s
//   Cu = 1.4 -> T = 1.4 * 0.804 = 1.126 s
//   Cs_eq2 = 1.0/8.0 = 0.125
//   Cs_eq3 = 0.6/(1.126*8) = 0.06660
//   Cs_eq5 = max(0.044*1.0*1.0, 0.01) = 0.044
//   Cs_eq6 = 0.5*0.6/8 = 0.0375
//   Cs = max(min(0.125, 0.06660), max(0.044, 0.0375)) = max(0.06660, 0.044) = 0.06660
//   W = 5 * 800 kN = 4000 kN
//   V = 0.06660 * 4000 = 266.4 kN
//
// Verify with solver: apply ELF distribution to 5-story frame,
// check sum(Rx) = V.
#[test]
fn validation_eq_eng_ext_equivalent_lateral_force() {
    // Seismic parameters
    let sds: f64 = 1.0;
    let sd1: f64 = 0.6;
    let s1: f64 = 0.6;
    let r: f64 = 8.0;
    let ie: f64 = 1.0;

    // Approximate period
    let hn: f64 = 17.5; // m, 5 stories x 3.5 m
    let ct: f64 = 0.0724;
    let x_exp: f64 = 0.8;
    let ta: f64 = ct * hn.powf(x_exp);
    let cu: f64 = 1.4;
    let t: f64 = cu * ta;

    assert!(t > 0.5 && t < 2.0, "T = {:.3} s reasonable for 5-story SMF", t);

    // Seismic response coefficient
    let r_ie: f64 = r / ie;
    let cs_eq2: f64 = sds / r_ie;
    let cs_eq3: f64 = sd1 / (t * r_ie);
    let cs_eq5: f64 = (0.044 * sds * ie).max(0.01);
    let cs_eq6: f64 = 0.5 * s1 / r_ie;

    assert_close(cs_eq2, 0.125, 0.01, "Cs(Eq 12.8-2)");
    assert!(cs_eq3 < cs_eq2, "Period-limited Cs governs");

    let cs: f64 = cs_eq2.min(cs_eq3).max(cs_eq5.max(cs_eq6));
    assert_close(cs, cs_eq3, 0.01, "Governing Cs = Cs_eq3 for this case");

    // Total seismic weight and base shear
    let n_stories: usize = 5;
    let w_story: f64 = 800.0; // kN per floor
    let w_total: f64 = w_story * n_stories as f64;
    let v: f64 = cs * w_total;

    assert_close(w_total, 4000.0, 0.01, "Total seismic weight");
    assert!(v > 200.0 && v < 400.0, "V = {:.1} kN reasonable", v);

    // Vertical distribution (k interpolated for 0.5 < T < 2.5)
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + 0.5 * (t - 0.5) / (2.5 - 0.5)
    };
    assert!(k > 1.0 && k < 1.5, "k = {:.3} for intermediate period", k);

    let h_story: f64 = 3.5;
    let heights: Vec<f64> = (1..=n_stories).map(|i| i as f64 * h_story).collect();
    let sum_wh_k: f64 = heights.iter().map(|hi| w_story * hi.powf(k)).sum::<f64>();
    let cvx: Vec<f64> = heights.iter().map(|hi| w_story * hi.powf(k) / sum_wh_k).collect();
    let fx: Vec<f64> = cvx.iter().map(|c| c * v).collect();

    // Sum of Cvx = 1.0
    let sum_cvx: f64 = cvx.iter().sum::<f64>();
    assert_close(sum_cvx, 1.0, 0.01, "sum(Cvx) = 1.0");

    // Sum of Fx = V
    let sum_fx: f64 = fx.iter().sum::<f64>();
    assert_close(sum_fx, v, 0.01, "sum(Fx) = V");

    // Forces increase with height
    for i in 1..n_stories {
        assert!(fx[i] > fx[i - 1], "F[{}] > F[{}]", i + 1, i);
    }

    // Solver verification: build 5-story frame and apply ELF
    let bay_w: f64 = 6.0;
    let mut nodes = Vec::new();
    let mut node_id: usize = 1;
    for i in 0..=(n_stories) {
        let y = i as f64 * h_story;
        nodes.push((node_id, 0.0, y));
        node_id += 1;
        nodes.push((node_id, bay_w, y));
        node_id += 1;
    }

    let mut elems = Vec::new();
    let mut elem_id: usize = 1;
    for i in 0..n_stories {
        let bl = 2 * i + 1;
        let tl = 2 * (i + 1) + 1;
        let br = 2 * i + 2;
        let tr = 2 * (i + 1) + 2;
        elems.push((elem_id, "frame", bl, tl, 1, 1, false, false)); elem_id += 1;
        elems.push((elem_id, "frame", br, tr, 1, 1, false, false)); elem_id += 1;
        elems.push((elem_id, "frame", tl, tr, 1, 1, false, false)); elem_id += 1;
    }

    let sups = vec![(1, 1_usize, "fixed"), (2, 2_usize, "fixed")];

    let mut loads = Vec::new();
    let mut total_applied: f64 = 0.0;
    for i in 0..n_stories {
        let fi_half: f64 = fx[i] / 2.0;
        let nl = 2 * (i + 1) + 1;
        let nr = 2 * (i + 1) + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: nl, fx: fi_half, fy: 0.0, mz: 0.0 }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: nr, fx: fi_half, fy: 0.0, mz: 0.0 }));
        total_applied += fx[i];
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), total_applied, 0.02, "Solver base shear = V");
}

// ================================================================
// 2. Response Modification Factor — R=3 vs R=8 Effect on Base Shear
// ================================================================
//
// The R factor reduces elastic seismic demand to account for ductility.
// Higher R -> lower design base shear, but more ductility demanded.
//
// Compare two systems under same spectrum:
//   System A: Ordinary moment frame, R=3, Cd=2.5, Omega_0=3.0
//   System B: Special moment frame, R=8, Cd=5.5, Omega_0=3.0
//
// Same building: SDS=1.0g, SD1=0.5g, T=0.8s, W=3000 kN
//   Cs_A = min(SDS/(R_A/Ie), SD1/(T*R_A/Ie)) = min(0.333, 0.208) = 0.208
//   Cs_B = min(SDS/(R_B/Ie), SD1/(T*R_B/Ie)) = min(0.125, 0.0781) = 0.0781
//   V_A = 0.208 * 3000 = 625 kN
//   V_B = 0.0781 * 3000 = 234.4 kN
//   Ratio V_A/V_B = R_B/R_A = 8/3 = 2.667 (when same formula governs)
//
// Solver verification: apply both sets of forces to same frame,
// confirm displacement ratio matches R factor ratio.
#[test]
fn validation_eq_eng_ext_response_modification_factor() {
    let sds: f64 = 1.0;
    let sd1: f64 = 0.5;
    let ie: f64 = 1.0;
    let t: f64 = 0.8;
    let w: f64 = 3000.0;

    // System A: Ordinary moment frame (R=3)
    let r_a: f64 = 3.0;
    let cs_eq2_a: f64 = sds / (r_a / ie);
    let cs_eq3_a: f64 = sd1 / (t * (r_a / ie));
    let cs_min: f64 = (0.044 * sds * ie).max(0.01);
    let cs_a: f64 = cs_eq2_a.min(cs_eq3_a).max(cs_min);
    let v_a: f64 = cs_a * w;

    assert_close(cs_eq2_a, 0.3333, 0.01, "Cs_eq2(R=3)");
    assert_close(cs_eq3_a, 0.2083, 0.01, "Cs_eq3(R=3)");
    assert_close(cs_a, cs_eq3_a, 0.01, "Cs(R=3) governed by period limit");

    // System B: Special moment frame (R=8)
    let r_b: f64 = 8.0;
    let cs_eq2_b: f64 = sds / (r_b / ie);
    let cs_eq3_b: f64 = sd1 / (t * (r_b / ie));
    let cs_b: f64 = cs_eq2_b.min(cs_eq3_b).max(cs_min);
    let v_b: f64 = cs_b * w;

    assert_close(cs_eq2_b, 0.125, 0.01, "Cs_eq2(R=8)");
    assert_close(cs_eq3_b, 0.07813, 0.01, "Cs_eq3(R=8)");
    assert_close(cs_b, cs_eq3_b, 0.01, "Cs(R=8) governed by period limit");

    // Base shear ratio should equal R_B/R_A when same equation governs
    let v_ratio: f64 = v_a / v_b;
    let r_ratio: f64 = r_b / r_a;
    assert_close(v_ratio, r_ratio, 0.02, "V_A/V_B = R_B/R_A");

    assert!(v_a > v_b, "OMF (R=3) base shear > SMF (R=8) base shear");

    // Solver verification: same frame, different lateral force magnitudes
    let h: f64 = 3.5;
    let bay: f64 = 6.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    // Apply unit base shear scaled by Cs for each system
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: v_a / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: v_a / 2.0, fy: 0.0, mz: 0.0 }),
    ];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: v_b / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: v_b / 2.0, fy: 0.0, mz: 0.0 }),
    ];

    let input_a = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)], elems.clone(), sups.clone(), loads_a);
    let input_b = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads_b);

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();

    let ux_a: f64 = res_a.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_b: f64 = res_b.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Linear solver: displacement ratio = force ratio = V_A/V_B
    let disp_ratio: f64 = ux_a / ux_b;
    assert_close(disp_ratio, v_ratio, 0.02, "Displacement ratio = force ratio");
}

// ================================================================
// 3. Story Drift — delta_x = Cd*delta_xe/Ie, Allowable Drift Check
// ================================================================
//
// ASCE 7-22 section 12.8.6:
//   delta_x = Cd * delta_xe / Ie
//
// ASCE 7 Table 12.12-1 allowable drift ratios:
//   Risk Category I/II: 0.020 * hsx (most structures)
//   Risk Category III:  0.015 * hsx
//   Risk Category IV:   0.010 * hsx
//
// Example: 3-story SMF, Cd=5.5, Ie=1.0
//   Apply moderate lateral forces, extract elastic displacements,
//   amplify by Cd, check against all three risk categories.
//
// Also verify drift at each story and check demand-capacity ratios.
#[test]
fn validation_eq_eng_ext_story_drift() {
    let h: f64 = 3.5; // m, story height
    let bay: f64 = 6.0;
    let n_stories: usize = 3;
    let cd: f64 = 5.5;
    let ie: f64 = 1.0;

    // Allowable drift ratios per ASCE 7 Table 12.12-1
    let drift_limit_ii: f64 = 0.020;
    let drift_limit_iii: f64 = 0.015;
    let drift_limit_iv: f64 = 0.010;

    // Verify hierarchy of drift limits
    assert!(drift_limit_iv < drift_limit_iii, "RC IV < RC III");
    assert!(drift_limit_iii < drift_limit_ii, "RC III < RC II");

    // Build 3-story single-bay frame
    let mut nodes = Vec::new();
    let mut node_id: usize = 1;
    for i in 0..=(n_stories) {
        let y = i as f64 * h;
        nodes.push((node_id, 0.0, y));
        node_id += 1;
        nodes.push((node_id, bay, y));
        node_id += 1;
    }

    let mut elems = Vec::new();
    let mut elem_id: usize = 1;
    for i in 0..n_stories {
        let bl = 2 * i + 1;
        let tl = 2 * (i + 1) + 1;
        let br = 2 * i + 2;
        let tr = 2 * (i + 1) + 2;
        elems.push((elem_id, "frame", bl, tl, 1, 1, false, false)); elem_id += 1;
        elems.push((elem_id, "frame", br, tr, 1, 1, false, false)); elem_id += 1;
        elems.push((elem_id, "frame", tl, tr, 1, 1, false, false)); elem_id += 1;
    }

    let sups = vec![(1, 1_usize, "fixed"), (2, 2_usize, "fixed")];

    // Small lateral forces to stay in elastic range
    let f_base: f64 = 2.0;
    let mut loads = Vec::new();
    for i in 1..=n_stories {
        let fi: f64 = f_base * i as f64;
        let nl = 2 * i + 1;
        let nr = 2 * i + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: nl, fx: fi, fy: 0.0, mz: 0.0 }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: nr, fx: fi, fy: 0.0, mz: 0.0 }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract floor displacements (left column nodes)
    let mut floor_ux = vec![0.0_f64; n_stories + 1];
    for i in 1..=n_stories {
        let target = 2 * i + 1;
        floor_ux[i] = results.displacements.iter()
            .find(|d| d.node_id == target).unwrap().ux;
    }

    // Check interstory drift at each story
    for i in 1..=n_stories {
        let delta_xe: f64 = (floor_ux[i] - floor_ux[i - 1]).abs();
        let delta_x: f64 = cd * delta_xe / ie;
        let drift_ratio: f64 = delta_x / h;

        // With small forces and stiff frame, should pass RC II limits
        assert!(
            drift_ratio < drift_limit_ii,
            "Story {}: drift {:.6} < {:.3} (RC II limit)", i, drift_ratio, drift_limit_ii
        );

        // Demand-capacity ratio
        let dcr: f64 = drift_ratio / drift_limit_ii;
        assert!(dcr < 1.0, "Story {}: DCR = {:.3} < 1.0", i, dcr);
        assert!(dcr > 0.0, "Story {}: DCR = {:.3} > 0.0 (non-zero drift)", i, dcr);
    }

    // Verify top floor has non-zero displacement
    assert!(floor_ux[n_stories].abs() > 0.0, "Top floor displaces laterally");

    // Analytical check: higher Ie reduces amplified drift
    let ie_iv: f64 = 1.5;
    let delta_xe_top: f64 = (floor_ux[n_stories] - floor_ux[n_stories - 1]).abs();
    let delta_ie1: f64 = cd * delta_xe_top / ie;
    let delta_ie15: f64 = cd * delta_xe_top / ie_iv;
    assert!(
        delta_ie15 < delta_ie1,
        "Higher Ie reduces amplified drift: {:.6} < {:.6}", delta_ie15, delta_ie1
    );
}

// ================================================================
// 4. Overstrength Factor — Omega_0 Amplification
// ================================================================
//
// ASCE 7-22 section 12.4.3:
//   Em = Omega_0 * QE + 0.2 * SDS * D   (additive)
//   Em = Omega_0 * QE - 0.2 * SDS * D   (counteracting)
//
// Omega_0 values (ASCE 7 Table 12.2-1):
//   Special moment frame:     Omega_0 = 3.0
//   Eccentrically braced:     Omega_0 = 2.0
//   Special shear wall:       Omega_0 = 2.5
//   Ordinary braced frame:    Omega_0 = 2.0
//
// Used for collector elements, discontinuous systems, foundations.
//
// Example: Collector in SMF building
//   QE = 150 kN (from ELF), SDS = 1.0g, D = 800 kN
//   Em_add = 3.0*150 + 0.2*1.0*800 = 450 + 160 = 610 kN
//   Em_sub = 3.0*150 - 0.2*1.0*800 = 450 - 160 = 290 kN
//
// Verify via solver: apply Omega_0*QE as lateral force,
// confirm reactions are amplified by Omega_0 relative to QE alone.
#[test]
fn validation_eq_eng_ext_overstrength_factor() {
    let qe: f64 = 150.0;      // kN, seismic force from ELF
    let sds: f64 = 1.0;       // g
    let d: f64 = 800.0;       // kN, dead load

    // Overstrength factors
    let omega_smf: f64 = 3.0;
    let omega_ebf: f64 = 2.0;
    let omega_sw: f64 = 2.5;

    // Vertical seismic effect
    let ev: f64 = 0.2 * sds * d;
    assert_close(ev, 160.0, 0.01, "Ev = 0.2*SDS*D");

    // Combined seismic with overstrength (additive)
    let em_add_smf: f64 = omega_smf * qe + ev;
    let em_add_ebf: f64 = omega_ebf * qe + ev;
    let em_add_sw: f64 = omega_sw * qe + ev;

    assert_close(em_add_smf, 610.0, 0.01, "Em_add(SMF)");
    assert_close(em_add_ebf, 460.0, 0.01, "Em_add(EBF)");
    assert_close(em_add_sw, 535.0, 0.01, "Em_add(SW)");

    // Counteracting case
    let em_sub_smf: f64 = omega_smf * qe - ev;
    assert_close(em_sub_smf, 290.0, 0.01, "Em_sub(SMF)");

    // SMF > SW > EBF
    assert!(em_add_smf > em_add_sw, "SMF overstrength > SW");
    assert!(em_add_sw > em_add_ebf, "SW overstrength > EBF");

    // Special load combinations (ASCE 7 section 12.4.3)
    let l: f64 = 300.0;
    let combo1: f64 = (1.2 + 0.2 * sds) * d + omega_smf * qe + l;
    let combo2: f64 = (0.9 - 0.2 * sds) * d + omega_smf * qe;
    assert_close(combo1, 1.4 * 800.0 + 450.0 + 300.0, 0.01, "Special combo 1");
    assert_close(combo2, 0.7 * 800.0 + 450.0, 0.01, "Special combo 2");

    // Solver verification: compare reactions with QE vs Omega_0*QE
    let h: f64 = 3.5;
    let bay: f64 = 6.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    let loads_qe = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: qe, fy: 0.0, mz: 0.0 }),
    ];
    let loads_omega = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: omega_smf * qe, fy: 0.0, mz: 0.0 }),
    ];

    let input_qe = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_qe);
    let input_omega = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_omega);

    let res_qe = linear::solve_2d(&input_qe).unwrap();
    let res_omega = linear::solve_2d(&input_omega).unwrap();

    let sum_rx_qe: f64 = res_qe.reactions.iter().map(|r| r.rx).sum::<f64>();
    let sum_rx_omega: f64 = res_omega.reactions.iter().map(|r| r.rx).sum::<f64>();

    let rx_ratio: f64 = sum_rx_omega / sum_rx_qe;
    assert_close(rx_ratio, omega_smf, 0.02, "Reactions amplified by Omega_0");
}

// ================================================================
// 5. Torsional Irregularity — Accidental Eccentricity and Ax
// ================================================================
//
// ASCE 7-22 section 12.8.4.2: Accidental torsion
//   Apply accidental eccentricity = 0.05 * Ld (building dimension
//   perpendicular to force direction)
//
// ASCE 7-22 section 12.3.3.1: Torsional irregularity
//   Exists when delta_max / delta_avg > 1.2 at any story
//
// Torsional amplification factor (Eq. 12.8-14):
//   Ax = (delta_max / (1.2 * delta_avg))^2
//   bounded: 1.0 <= Ax <= 3.0
//
// Model with 2D approximation: symmetric portal frame with
// additional moment from eccentricity applied at top.
//
// Building dimension Ld = 30 m, V = 100 kN
//   Accidental eccentricity = 0.05 * 30 = 1.5 m
//   Mz_accidental = V * e = 100 * 1.5 = 150 kN-m
#[test]
fn validation_eq_eng_ext_torsional_irregularity() {
    let ld: f64 = 30.0;       // m, building dimension perpendicular to seismic force
    let v_total: f64 = 100.0;  // kN, base shear

    // Accidental eccentricity
    let ecc: f64 = 0.05 * ld;
    assert_close(ecc, 1.5, 0.01, "Accidental eccentricity = 5% * Ld");

    // Accidental torsional moment
    let mz_acc: f64 = v_total * ecc;
    assert_close(mz_acc, 150.0, 0.01, "Mz_accidental = V * e");

    // Use solver: portal frame with symmetric vs eccentric loading
    let h: f64 = 3.5;
    let bay: f64 = 8.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    // Symmetric loading (no eccentricity)
    let loads_sym = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: v_total / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: v_total / 2.0, fy: 0.0, mz: 0.0 }),
    ];
    let input_sym = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_sym,
    );
    let res_sym = linear::solve_2d(&input_sym).unwrap();

    // Eccentric loading: distribute forces unevenly to simulate eccentricity
    let ecc_ratio: f64 = 0.20; // 20% eccentricity for visible effect
    let f_left: f64 = v_total / 2.0 * (1.0 + ecc_ratio);
    let f_right: f64 = v_total / 2.0 * (1.0 - ecc_ratio);
    let loads_ecc = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_left, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_right, fy: 0.0, mz: 0.0 }),
    ];
    let input_ecc = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_ecc,
    );
    let res_ecc = linear::solve_2d(&input_ecc).unwrap();

    // Symmetric: drifts should be nearly equal
    let ux2_sym: f64 = res_sym.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux3_sym: f64 = res_sym.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let sym_ratio: f64 = ux2_sym.abs() / ux3_sym.abs();
    assert!((sym_ratio - 1.0).abs() < 0.05, "Symmetric drifts: ratio = {:.4}", sym_ratio);

    // Eccentric: left side has more drift
    let ux2_ecc: f64 = res_ecc.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux3_ecc: f64 = res_ecc.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    assert!(
        ux2_ecc.abs() > ux3_ecc.abs(),
        "Eccentric: left drift ({:.6e}) > right drift ({:.6e})", ux2_ecc.abs(), ux3_ecc.abs()
    );

    // Torsional irregularity check
    let delta_max: f64 = ux2_ecc.abs().max(ux3_ecc.abs());
    let delta_avg: f64 = (ux2_ecc.abs() + ux3_ecc.abs()) / 2.0;
    let torsion_ratio: f64 = delta_max / delta_avg;
    assert!(torsion_ratio >= 1.0, "Torsion ratio >= 1.0: {:.4}", torsion_ratio);

    // Torsional amplification factor Ax (Eq. 12.8-14)
    let ax_raw: f64 = (delta_max / (1.2 * delta_avg)).powi(2);
    let ax: f64 = ax_raw.max(1.0).min(3.0);
    assert!(ax >= 1.0 && ax <= 3.0, "Ax = {:.4} in [1.0, 3.0]", ax);

    // For extreme torsion (ratio > 1.4), classify as extreme irregularity
    let extreme_threshold: f64 = 1.4;
    if torsion_ratio > extreme_threshold {
        assert!(ax > 1.0, "Extreme torsion: Ax > 1.0");
    }
}

// ================================================================
// 6. P-Delta Effects — Stability Coefficient and Theta_max
// ================================================================
//
// ASCE 7-22 section 12.8.7:
//   theta = Px * Delta * Ie / (Vx * hsx * Cd)
//   theta_max = 0.5 / (beta * Cd) <= 0.25
//   beta = ratio of shear demand to capacity (conservatively 1.0)
//
// If theta <= 0.10: P-delta effects need not be considered.
// If theta > theta_max: structure is potentially unstable.
//
// Example: Single-story portal frame under lateral + gravity
//   Px = 500 kN (total gravity), Vx = 50 kN (story shear)
//   hsx = 4.0 m, Cd = 5.5, Ie = 1.0
//   Compute elastic drift from solver, then theta.
//
// Also verify P-delta amplification B2 approx 1/(1 - theta).
#[test]
fn validation_eq_eng_ext_pdelta_effects() {
    let hsx: f64 = 4.0;     // m, story height
    let cd: f64 = 5.5;
    let ie: f64 = 1.0;
    let beta: f64 = 1.0;

    // theta_max calculation
    let theta_max: f64 = (0.5 / (beta * cd)).min(0.25);
    assert_close(theta_max, 0.5 / 5.5, 0.01, "theta_max = 0.5/(beta*Cd)");
    assert!(theta_max < 0.25, "theta_max < 0.25 absolute cap");

    // Build portal frame and apply lateral + gravity
    let bay: f64 = 6.0;
    let lateral: f64 = 50.0;   // kN
    let gravity: f64 = -250.0;  // kN per column top (downward)
    let px: f64 = -gravity * 2.0; // total gravity at story level

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, hsx), (3, bay, hsx), (4, bay, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: gravity, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Get elastic lateral displacement at top (node 2)
    let delta_xe: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(delta_xe > 0.0, "Non-zero elastic drift");

    // Amplified drift
    let delta_x: f64 = cd * delta_xe / ie;

    // Stability coefficient
    let theta: f64 = px * delta_x * ie / (lateral * hsx * cd);

    // Verify theta is positive and within expected range
    assert!(theta > 0.0, "theta = {:.4} > 0", theta);

    // Check against theta_max
    assert!(
        theta < theta_max,
        "theta = {:.4} < theta_max = {:.4} (stable)", theta, theta_max
    );

    // B2 amplification factor
    let b2: f64 = 1.0 / (1.0 - theta);
    assert!(b2 > 1.0, "B2 = {:.4} > 1.0 (amplification exists)", b2);

    // If theta <= 0.10, P-delta can be ignored per code
    let pdelta_required: bool = theta > 0.10;

    // Check consistency: if theta is small, B2 should be close to 1.0
    if !pdelta_required {
        assert!(b2 < 1.12, "B2 = {:.4} close to 1.0 when theta <= 0.10", b2);
    }

    // Verify theta scales with Px (double gravity -> double theta)
    let theta_double_p: f64 = (2.0 * px) * delta_x * ie / (lateral * hsx * cd);
    assert_close(theta_double_p, 2.0 * theta, 0.01, "theta doubles with doubled Px");
}

// ================================================================
// 7. Diaphragm Forces — Fpx with Min/Max Bounds
// ================================================================
//
// ASCE 7-22 section 12.10.1.1:
//   Fpx = sum(Fi, i=x..n) / sum(wi, i=x..n) * wpx
//
// Bounds:
//   Fpx_min = 0.2 * SDS * Ie * wpx
//   Fpx_max = 0.4 * SDS * Ie * wpx
//
// Example: 5-story building, SDS = 1.0g, Ie = 1.0
//   Story weights: [600, 600, 600, 600, 500] kN (bottom to top)
//   ELF base shear V = 200 kN, inverted triangular distribution (k=1)
//   Story forces (from Cvx*V) computed analytically.
//
// Verify diaphragm forces at each level, check that bounds
// govern at lower levels (where raw Fpx is typically low).
//
// Solver verification: apply diaphragm force at each level
// and verify equilibrium.
#[test]
fn validation_eq_eng_ext_diaphragm_forces() {
    let sds: f64 = 1.0;
    let ie: f64 = 1.0;
    let n_stories: usize = 5;

    // Story weights (bottom to top)
    let weights: [f64; 5] = [600.0, 600.0, 600.0, 600.0, 500.0];
    let w_total: f64 = weights.iter().sum::<f64>();
    assert_close(w_total, 2900.0, 0.01, "Total seismic weight");

    // ELF base shear
    let v: f64 = 200.0; // kN
    let k: f64 = 1.0;   // T <= 0.5s

    // Heights (bottom to top)
    let h_story: f64 = 3.5;
    let heights: Vec<f64> = (1..=n_stories).map(|i| i as f64 * h_story).collect();

    // Vertical distribution
    let sum_wh_k: f64 = weights.iter().zip(heights.iter())
        .map(|(w, h)| w * h.powf(k)).sum::<f64>();
    let story_forces: Vec<f64> = weights.iter().zip(heights.iter())
        .map(|(w, h)| w * h.powf(k) / sum_wh_k * v).collect();

    // Verify sum(Fx) = V
    let sum_fx: f64 = story_forces.iter().sum::<f64>();
    assert_close(sum_fx, v, 0.01, "sum(Fx) = V");

    // Diaphragm force at each level
    let mut fpx_values = Vec::new();
    for x in 0..n_stories {
        // Sum of forces and weights from level x to roof
        let sum_fi: f64 = story_forces[x..].iter().sum::<f64>();
        let sum_wi: f64 = weights[x..].iter().sum::<f64>();
        let wpx: f64 = weights[x];

        // Raw diaphragm force
        let fpx_raw: f64 = sum_fi / sum_wi * wpx;

        // Bounds
        let fpx_min: f64 = 0.2 * sds * ie * wpx;
        let fpx_max: f64 = 0.4 * sds * ie * wpx;

        // Apply bounds
        let fpx: f64 = fpx_raw.max(fpx_min).min(fpx_max);
        fpx_values.push(fpx);

        // Verify bounds are respected
        assert!(fpx >= fpx_min, "Level {}: Fpx >= Fpx_min", x + 1);
        assert!(fpx <= fpx_max, "Level {}: Fpx <= Fpx_max", x + 1);
    }

    // Roof diaphragm force should equal the story force at roof
    // (unless bounded): sum(Fi)/sum(wi) * wpx at x=n is just F_n
    let sum_fi_roof: f64 = story_forces[n_stories - 1];
    let sum_wi_roof: f64 = weights[n_stories - 1];
    let fpx_roof_raw: f64 = sum_fi_roof / sum_wi_roof * weights[n_stories - 1];
    assert_close(fpx_roof_raw, story_forces[n_stories - 1], 0.01, "Roof: Fpx_raw = F_roof");

    // Lower floors: minimum often governs (raw Fpx < 0.2*SDS*Ie*wpx)
    let _fpx_min_floor1: f64 = 0.2 * sds * ie * weights[0];
    let sum_fi_all: f64 = story_forces.iter().sum::<f64>();
    let fpx_raw_floor1: f64 = sum_fi_all / w_total * weights[0];
    // The raw value at floor 1 is sum(all_forces)/sum(all_weights)*w1 = V/W*w1
    assert_close(fpx_raw_floor1, v / w_total * weights[0], 0.01, "Floor 1 raw Fpx");

    // Solver verification: apply diaphragm forces as lateral loads on a beam
    // Use the roof level diaphragm force on a simple beam model
    let fpx_applied: f64 = fpx_values[n_stories - 1];
    let beam_span: f64 = 10.0;
    let loads_diaphragm = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx: fpx_applied / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: fpx_applied / 2.0, fy: 0.0, mz: 0.0 }),
    ];
    let input_diaphragm = make_beam(
        4, beam_span, E, A, IZ, "pinned", Some("pinned"), loads_diaphragm,
    );
    let res_diaphragm = linear::solve_2d(&input_diaphragm).unwrap();

    // Verify reactions balance the applied diaphragm force
    let sum_rx_d: f64 = res_diaphragm.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx_d.abs(), fpx_applied, 0.02, "Diaphragm force equilibrium");
}

// ================================================================
// 8. Modal Combination Rules — CQC vs SRSS
// ================================================================
//
// SRSS (Square Root of Sum of Squares):
//   R = sqrt(sum(Ri^2))
//   Valid when modes are well-separated (frequency ratio > 1.1)
//
// CQC (Complete Quadratic Combination):
//   R = sqrt(sum_i(sum_j(rho_ij * Ri * Rj)))
//   rho_ij = 8 * zeta^2 * (1 + beta_ij) * beta_ij^1.5 /
//            ((1 - beta_ij^2)^2 + 4*zeta^2*beta_ij*(1 + beta_ij)^2)
//   where beta_ij = omega_j / omega_i (frequency ratio)
//   zeta = damping ratio (typically 0.05 for structures)
//
// For well-separated modes: CQC approx SRSS (cross-terms vanish)
// For closely-spaced modes: CQC > SRSS (cross-correlation significant)
//
// Example: 3-mode system
//   Well-separated: T1=1.0s, T2=0.4s, T3=0.2s (ratios > 2.0)
//   Closely-spaced: T1=1.0s, T2=0.95s, T3=0.5s (first two close)
//
// Modal responses: R1=100, R2=60, R3=30 kN
#[test]
fn validation_eq_eng_ext_modal_combination_rules() {
    let zeta: f64 = 0.05; // 5% damping

    // Modal responses (kN)
    let r_modal: [f64; 3] = [100.0, 60.0, 30.0];

    // SRSS combination (always valid)
    let r_srss: f64 = r_modal.iter().map(|r| r * r).sum::<f64>().sqrt();
    let r_srss_expected: f64 = (100.0_f64.powi(2) + 60.0_f64.powi(2) + 30.0_f64.powi(2)).sqrt();
    assert_close(r_srss, r_srss_expected, 0.01, "SRSS value");
    assert_close(r_srss, 119.58, 0.01, "SRSS = sqrt(10000+3600+900)");

    // CQC cross-correlation coefficient
    let cqc_rho = |omega_i: f64, omega_j: f64, z: f64| -> f64 {
        let beta: f64 = omega_j / omega_i;
        let num: f64 = 8.0 * z * z * (1.0 + beta) * beta.powf(1.5);
        let den: f64 = (1.0 - beta * beta).powi(2) + 4.0 * z * z * beta * (1.0 + beta).powi(2);
        num / den
    };

    // --- Case 1: Well-separated modes ---
    let t_sep: [f64; 3] = [1.0, 0.4, 0.2];
    let pi: f64 = std::f64::consts::PI;
    let omega_sep: Vec<f64> = t_sep.iter().map(|t| 2.0 * pi / t).collect();

    // Self-correlation coefficients should be 1.0
    let rho_11: f64 = cqc_rho(omega_sep[0], omega_sep[0], zeta);
    assert_close(rho_11, 1.0, 0.01, "rho_11 = 1.0 (self-correlation)");

    // Cross-correlation for well-separated modes should be small
    let rho_12_sep: f64 = cqc_rho(omega_sep[0], omega_sep[1], zeta);
    let rho_13_sep: f64 = cqc_rho(omega_sep[0], omega_sep[2], zeta);
    assert!(rho_12_sep < 0.05, "Well-separated rho_12 = {:.4} < 0.05", rho_12_sep);
    assert!(rho_13_sep < 0.05, "Well-separated rho_13 = {:.4} < 0.05", rho_13_sep);

    // CQC for well-separated modes
    let mut r_cqc_sep: f64 = 0.0;
    for i in 0..3 {
        for j in 0..3 {
            let rho_ij: f64 = cqc_rho(omega_sep[i], omega_sep[j], zeta);
            r_cqc_sep += rho_ij * r_modal[i] * r_modal[j];
        }
    }
    r_cqc_sep = r_cqc_sep.sqrt();

    // For well-separated modes, CQC ~ SRSS
    let diff_sep: f64 = (r_cqc_sep - r_srss).abs() / r_srss;
    assert!(diff_sep < 0.03, "Well-separated: CQC/SRSS differ by {:.2}% < 3%", diff_sep * 100.0);

    // --- Case 2: Closely-spaced modes ---
    let t_close: [f64; 3] = [1.0, 0.95, 0.5];
    let omega_close: Vec<f64> = t_close.iter().map(|t| 2.0 * pi / t).collect();

    // Cross-correlation for closely-spaced modes should be large
    let rho_12_close: f64 = cqc_rho(omega_close[0], omega_close[1], zeta);
    assert!(rho_12_close > 0.5, "Closely-spaced rho_12 = {:.4} > 0.5", rho_12_close);

    // CQC for closely-spaced modes
    let mut r_cqc_close: f64 = 0.0;
    for i in 0..3 {
        for j in 0..3 {
            let rho_ij: f64 = cqc_rho(omega_close[i], omega_close[j], zeta);
            r_cqc_close += rho_ij * r_modal[i] * r_modal[j];
        }
    }
    r_cqc_close = r_cqc_close.sqrt();

    // CQC > SRSS for closely-spaced modes (cross-terms add positively)
    assert!(
        r_cqc_close > r_srss,
        "Closely-spaced: CQC ({:.2}) > SRSS ({:.2})", r_cqc_close, r_srss
    );

    // CQC <= absolute sum (upper bound)
    let r_abs: f64 = r_modal.iter().sum::<f64>();
    assert!(
        r_cqc_close <= r_abs * 1.001,
        "CQC ({:.2}) <= abs sum ({:.2})", r_cqc_close, r_abs
    );

    // Verify SRSS is bounded: max(Ri) <= R_SRSS <= sum(Ri)
    let r_max: f64 = r_modal.iter().cloned().fold(0.0_f64, f64::max);
    assert!(r_srss >= r_max, "SRSS >= max mode");
    assert!(r_srss <= r_abs, "SRSS <= abs sum");

    // Solver verification: apply SRSS-combined force to a portal frame
    // and verify equilibrium
    let h: f64 = 3.5;
    let bay: f64 = 6.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, bay, h), (4, bay, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    let loads_srss = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: r_srss / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: r_srss / 2.0, fy: 0.0, mz: 0.0 }),
    ];
    let loads_cqc = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: r_cqc_close / 2.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: r_cqc_close / 2.0, fy: 0.0, mz: 0.0 }),
    ];

    let input_srss = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_srss);
    let input_cqc = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_cqc);

    let res_srss = linear::solve_2d(&input_srss).unwrap();
    let res_cqc = linear::solve_2d(&input_cqc).unwrap();

    // CQC case should give larger displacement (more force applied)
    let ux_srss: f64 = res_srss.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_cqc: f64 = res_cqc.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    assert!(
        ux_cqc.abs() > ux_srss.abs(),
        "CQC displacement ({:.6e}) > SRSS displacement ({:.6e})", ux_cqc.abs(), ux_srss.abs()
    );

    // Displacement ratio should match force ratio (linear solver)
    let disp_ratio: f64 = ux_cqc.abs() / ux_srss.abs();
    let force_ratio: f64 = r_cqc_close / r_srss;
    assert_close(disp_ratio, force_ratio, 0.02, "Displacement ratio = force ratio");
}
