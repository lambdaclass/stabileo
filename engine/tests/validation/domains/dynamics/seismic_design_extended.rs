/// Validation: Extended Seismic Design Methods (ASCE 7-22)
///
/// References:
///   - ASCE 7-22: "Minimum Design Loads and Associated Criteria", Ch. 12
///   - FEMA P-1050: "NEHRP Recommended Seismic Provisions"
///   - Chopra: "Dynamics of Structures", 5th Ed., Ch. 6-7
///   - Paulay & Priestley: "Seismic Design of RC and Masonry Buildings"
///
/// Tests cover:
///   1. ASCE 7-22 ELF base shear on a 3-story frame (solver verification)
///   2. Vertical distribution with period-dependent k exponent
///   3. Story drift check with Cd amplification factor
///   4. P-delta stability coefficient on portal frame
///   5. Torsional irregularity amplification factor Ax
///   6. Diaphragm force distribution and bounds
///   7. Redundancy factor rho = 1.3 penalty on multi-story frame
///   8. Dual system analysis: moment frame vs braced frame stiffness
use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.02;      // m^2
const IZ: f64 = 2e-4;     // m^4

/// Helper to build an N-story, single-bay moment frame.
/// Returns (SolverInput, node layout info).
/// Nodes: base-left=1, base-right=2, floor1-left=3, floor1-right=4, ...
/// Elements: left columns, right columns, beams in order.
fn build_multi_story_frame(
    n_stories: usize,
    h: f64,
    w: f64,
    e: f64,
    a: f64,
    iz: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes = Vec::new();
    let mut node_id = 1;
    for i in 0..=n_stories {
        let y = i as f64 * h;
        nodes.push((node_id, 0.0, y));
        node_id += 1;
        nodes.push((node_id, w, y));
        node_id += 1;
    }

    let mut elems = Vec::new();
    let mut elem_id = 1;
    for i in 0..n_stories {
        let bl = 2 * i + 1;
        let tl = 2 * (i + 1) + 1;
        let br = 2 * i + 2;
        let tr = 2 * (i + 1) + 2;
        // Left column
        elems.push((elem_id, "frame", bl, tl, 1, 1, false, false));
        elem_id += 1;
        // Right column
        elems.push((elem_id, "frame", br, tr, 1, 1, false, false));
        elem_id += 1;
        // Beam
        elems.push((elem_id, "frame", tl, tr, 1, 1, false, false));
        elem_id += 1;
    }

    let sups = vec![(1, 1_usize, "fixed"), (2, 2, "fixed")];

    make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    )
}

// ================================================================
// 1. ASCE 7-22 ELF Base Shear — Solver Verification
// ================================================================
//
// Apply ELF forces to a 3-story steel moment frame and verify
// that the sum of horizontal base reactions equals the applied
// base shear V = Cs * W.
//
// Parameters:
//   SDS = 0.90g, SD1 = 0.45g, R = 8, Ie = 1.0
//   hn = 10.5 m (3 stories * 3.5 m)
//   Ta = 0.0724 * 10.5^0.8 = 0.534 s (steel MF)
//   Cu = 1.4 => T = 1.4 * 0.534 = 0.748 s
//   Cs = min(SDS/(R/Ie), SD1/(T*R/Ie)) = min(0.1125, 0.0752) = 0.0752
//   Cs_min = max(0.044*SDS*Ie, 0.01) = 0.0396
//   Cs = 0.0752 (governs)
//   W = 3 * 450 kN = 1350 kN
//   V = 0.0752 * 1350 = 101.5 kN
//
// Reference: ASCE 7-22 Sec. 12.8.1, Eq. 12.8-1 through 12.8-5
#[test]
fn seismic_design_ext_elf_base_shear_verification() {
    let sds: f64 = 0.90;
    let sd1: f64 = 0.45;
    let r: f64 = 8.0;
    let ie: f64 = 1.0;
    let n_stories: usize = 3;
    let h: f64 = 3.5;
    let w_bay: f64 = 6.0;
    let w_story: f64 = 450.0; // kN per floor

    // Approximate fundamental period (ASCE 7-22 Eq. 12.8-7)
    let hn: f64 = n_stories as f64 * h;
    let ct: f64 = 0.0724; // steel moment frame
    let x_exp: f64 = 0.8;
    let ta: f64 = ct * hn.powf(x_exp);
    let cu: f64 = 1.4;
    let t: f64 = cu * ta;

    // Seismic response coefficient
    let cs_eq2: f64 = sds / (r / ie);
    let cs_eq3: f64 = sd1 / (t * (r / ie));
    let cs_min: f64 = (0.044 * sds * ie).max(0.01);
    let cs: f64 = cs_eq2.min(cs_eq3).max(cs_min);

    // Base shear
    let w_total: f64 = w_story * n_stories as f64;
    let v_base: f64 = cs * w_total;

    // Vertical distribution (k = 1.0 for T near 0.5-0.75)
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + 0.5 * (t - 0.5)
    };

    let heights: Vec<f64> = (1..=n_stories).map(|i| i as f64 * h).collect();
    let sum_wh_k: f64 = heights.iter().map(|&hi| w_story * hi.powf(k)).sum::<f64>();

    // Build loads: apply half to each side of the bay
    let mut loads = Vec::new();
    let mut total_applied: f64 = 0.0;
    for i in 0..n_stories {
        let cvx: f64 = w_story * heights[i].powf(k) / sum_wh_k;
        let fi: f64 = cvx * v_base;
        let fi_half: f64 = fi / 2.0;
        total_applied += fi;
        let nl = 2 * (i + 1) + 1;
        let nr = 2 * (i + 1) + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nl, fx: fi_half, fz: 0.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nr, fx: fi_half, fz: 0.0, my: 0.0,
        }));
    }

    // Verify force distribution sums to V
    assert_close(total_applied, v_base, 0.01, "Sum of Fx = V_base");

    let input = build_multi_story_frame(n_stories, h, w_bay, E, A, IZ, loads);
    let results = solve_2d(&input).unwrap();

    // Sum of horizontal base reactions must equal total applied lateral force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), v_base, 0.02,
        "ELF base shear: sum(Rx) = V_base");

    // Verify V is in a reasonable range for a 3-story building
    assert!(v_base > 30.0 && v_base < 300.0,
        "V = {:.1} kN reasonable for 3-story frame", v_base);
}

// ================================================================
// 2. Vertical Distribution — Period-Dependent k Exponent
// ================================================================
//
// ASCE 7-22 Sec. 12.8.3:
//   Cvx = wx * hx^k / sum(wi * hi^k)
//   k = 1 for T <= 0.5 s, k = 2 for T >= 2.5 s, linear interp between.
//
// Test with T = 1.5 s (k = 1.5): forces concentrate more at the top
// compared to k = 1 (pure inverted triangle).
//
// 4-story building, equal story weights 300 kN, h_story = 3.5 m.
// Heights: 3.5, 7.0, 10.5, 14.0 m
//
// k = 1.0 + 0.5*(1.5-0.5) = 1.5
// sum(wi*hi^k) = 300*(3.5^1.5 + 7.0^1.5 + 10.5^1.5 + 14.0^1.5)
//              = 300*(6.547 + 18.520 + 34.034 + 52.383) = 300*111.485 = 33445.5
// Cv1 = 300*6.547/33445.5 = 0.0587
// Cv4 = 300*52.383/33445.5 = 0.4700
//
// Reference: ASCE 7-22 Eq. 12.8-12
#[test]
fn seismic_design_ext_vertical_distribution_k_exponent() {
    let t: f64 = 1.5; // s, fundamental period
    let n_stories = 4_usize;
    let h: f64 = 3.5;
    let w_story: f64 = 300.0; // kN per floor
    let v_base: f64 = 200.0; // kN, base shear

    // k exponent
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + 0.5 * (t - 0.5)
    };
    assert_close(k, 1.5, 0.001, "k for T=1.5s");

    // Heights and distribution
    let heights: Vec<f64> = (1..=n_stories).map(|i| i as f64 * h).collect();
    let sum_wh_k: f64 = heights.iter().map(|&hi| w_story * hi.powf(k)).sum::<f64>();

    let cvx: Vec<f64> = heights.iter()
        .map(|&hi| w_story * hi.powf(k) / sum_wh_k)
        .collect();

    // Verify sum = 1.0
    let sum_cv: f64 = cvx.iter().sum::<f64>();
    assert_close(sum_cv, 1.0, 1e-10, "sum(Cvx) = 1.0");

    // With k=1.5, top floor gets a larger share than with k=1.0
    // Compute k=1.0 distribution for comparison
    let sum_wh_1: f64 = heights.iter().map(|&hi| w_story * hi).sum::<f64>();
    let cv4_k1: f64 = w_story * heights[3] / sum_wh_1;

    // k=1.5 top floor share should exceed k=1.0 share
    assert!(cvx[3] > cv4_k1,
        "k=1.5 top floor Cv ({:.4}) > k=1.0 top floor Cv ({:.4})", cvx[3], cv4_k1);

    // Forces are monotonically increasing
    let fx: Vec<f64> = cvx.iter().map(|&c| c * v_base).collect();
    for i in 1..n_stories {
        assert!(fx[i] > fx[i - 1],
            "F[{}] ({:.2}) > F[{}] ({:.2})", i + 1, fx[i], i, fx[i - 1]);
    }

    // Apply forces to a 4-story frame and verify equilibrium
    let w_bay: f64 = 6.0;
    let mut loads = Vec::new();
    for i in 0..n_stories {
        let fi_half: f64 = fx[i] / 2.0;
        let nl = 2 * (i + 1) + 1;
        let nr = 2 * (i + 1) + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nl, fx: fi_half, fz: 0.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nr, fx: fi_half, fz: 0.0, my: 0.0,
        }));
    }

    let input = build_multi_story_frame(n_stories, h, w_bay, E, A, IZ, loads);
    let results = solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), v_base, 0.02,
        "Vertical distribution: sum(Rx) = V_base");

    // Displacements must increase with height
    let mut floor_ux = vec![0.0_f64; n_stories + 1];
    for i in 1..=n_stories {
        let target = 2 * i + 1;
        floor_ux[i] = results.displacements.iter()
            .find(|d| d.node_id == target).unwrap().ux;
    }
    for i in 1..n_stories {
        assert!(floor_ux[i + 1].abs() > floor_ux[i].abs(),
            "Floor {} drift ({:.6e}) > floor {} drift ({:.6e})",
            i + 1, floor_ux[i + 1].abs(), i, floor_ux[i].abs());
    }
}

// ================================================================
// 3. Story Drift Check — Cd Amplification (ASCE 7-22 Sec. 12.8.6)
// ================================================================
//
// Design story drift: Delta = Cd * delta_xe / Ie
// Allowable: Delta_allow = 0.020 * hsx (Risk Category II)
//
// Apply moderate lateral forces to a 3-story frame, compute elastic
// displacements from the solver, amplify by Cd, and verify that
// drift ratios remain within limits.
//
// Cd = 5.5 (steel SMF), Ie = 1.0, hsx = 3.5 m
// Delta_allow = 0.020 * 3.5 = 0.070 m
//
// Reference: ASCE 7-22 Table 12.12-1
#[test]
fn seismic_design_ext_story_drift_cd_amplification() {
    let n_stories = 3_usize;
    let h: f64 = 3.5;
    let w_bay: f64 = 6.0;
    let cd: f64 = 5.5;
    let ie: f64 = 1.0;

    // Moderate inverted-triangular lateral forces (small enough for elastic range)
    let f_base: f64 = 2.0; // kN increment per floor
    let mut loads = Vec::new();
    for i in 1..=n_stories {
        let fi: f64 = f_base * i as f64;
        let nl = 2 * i + 1;
        let nr = 2 * i + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nl, fx: fi, fz: 0.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nr, fx: fi, fz: 0.0, my: 0.0,
        }));
    }

    let input = build_multi_story_frame(n_stories, h, w_bay, E, A, IZ, loads);
    let results = solve_2d(&input).unwrap();

    // Extract floor displacements (left column nodes: 1, 3, 5, 7)
    let mut floor_ux = vec![0.0_f64; n_stories + 1]; // floor 0 = base = 0
    for i in 1..=n_stories {
        let target = 2 * i + 1;
        floor_ux[i] = results.displacements.iter()
            .find(|d| d.node_id == target).unwrap().ux;
    }

    // Allowable drift for Risk Category II
    let delta_allow: f64 = 0.020 * h;
    assert_close(delta_allow, 0.070, 0.001, "Delta_allow = 0.020 * hsx");

    // Check each story
    let mut max_dcr: f64 = 0.0;
    for i in 1..=n_stories {
        let delta_xe: f64 = (floor_ux[i] - floor_ux[i - 1]).abs();
        let delta_design: f64 = cd * delta_xe / ie;
        let drift_ratio: f64 = delta_design / h;
        let dcr: f64 = delta_design / delta_allow;

        assert!(drift_ratio < 0.020,
            "Story {}: drift ratio {:.5} < 0.020 (ASCE 7 limit)", i, drift_ratio);
        assert!(dcr < 1.0,
            "Story {}: DCR = {:.4} < 1.0 (OK)", i, dcr);

        if dcr > max_dcr {
            max_dcr = dcr;
        }
    }

    // Maximum DCR should be positive (we have real drift)
    assert!(max_dcr > 0.0, "Maximum DCR = {:.4} > 0 (real deformation)", max_dcr);

    // Verify that top floor displacement is non-zero and positive (sway direction)
    assert!(floor_ux[n_stories] > 0.0,
        "Top floor has positive lateral displacement: {:.6e}", floor_ux[n_stories]);
}

// ================================================================
// 4. P-Delta Stability Coefficient (ASCE 7-22 Sec. 12.8.7)
// ================================================================
//
// theta = Px * Delta * Ie / (Vx * hsx * Cd)
//
// Apply lateral + gravity loads to a portal frame. Compute theta
// from first-order elastic analysis and verify it is within limits.
//
// theta_max = 0.5 / (beta * Cd) <= 0.25
// If theta <= 0.10: P-delta effects need not be considered.
//
// Parameters:
//   Px = 400 kN (total gravity on story)
//   Vx = 40 kN (story shear)
//   hsx = 4.0 m
//   Cd = 5.5, Ie = 1.0
//
// Reference: ASCE 7-22 Eq. 12.8-16, 12.8-17
#[test]
fn seismic_design_ext_pdelta_stability_coefficient() {
    let h: f64 = 4.0;
    let w_bay: f64 = 6.0;
    let cd: f64 = 5.5;
    let ie: f64 = 1.0;

    let lateral: f64 = 40.0;  // kN total story shear
    let gravity_per_node: f64 = -200.0; // kN per column top (negative = downward)
    let px: f64 = -gravity_per_node * 2.0; // total vertical load at story

    let input = make_portal_frame(h, w_bay, E, A, IZ, lateral, gravity_per_node);
    let results = solve_2d(&input).unwrap();

    // Get elastic story drift
    let ux2: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux3: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Average lateral displacement at floor level
    let delta_xe: f64 = (ux2.abs() + ux3.abs()) / 2.0;

    // Amplified design drift
    let delta_design: f64 = cd * delta_xe / ie;

    // Stability coefficient using design-level drift
    let vx: f64 = lateral;
    let theta: f64 = px * delta_design * ie / (vx * h * cd);

    // theta should be positive
    assert!(theta > 0.0,
        "Stability coefficient theta = {:.6} > 0", theta);

    // Maximum allowable theta
    let beta: f64 = 1.0; // conservative
    let theta_max: f64 = (0.5 / (beta * cd)).min(0.25);
    assert_close(theta_max, 0.5 / 5.5, 0.001, "theta_max = 0.5/(beta*Cd)");

    assert!(theta < theta_max,
        "theta = {:.4} < theta_max = {:.4} (stable)", theta, theta_max);

    // P-delta amplification factor
    let amp: f64 = 1.0 / (1.0 - theta);
    assert!(amp > 1.0,
        "P-delta amplification = {:.4} > 1.0", amp);

    // Verify equilibrium: sum of horizontal reactions = lateral force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), lateral.abs(), 0.02,
        "Horizontal equilibrium: sum(Rx) = lateral load");
}

// ================================================================
// 5. Torsional Irregularity Amplification Factor Ax
// ================================================================
//
// ASCE 7-22 Sec. 12.8.4.3, Eq. 12.8-14:
//   Ax = (delta_max / (1.2 * delta_avg))^2
//   bounded: 1.0 <= Ax <= 3.0
//
// Torsional irregularity exists when delta_max > 1.2 * delta_avg
// at any story (ASCE 7-22 Table 12.3-1).
//
// Model: Apply asymmetric lateral forces to a portal frame to
// simulate torsional effect. Compare symmetric vs eccentric cases.
//
// Reference: ASCE 7-22 Sec. 12.3.3.1, Table 12.3-1
#[test]
fn seismic_design_ext_torsional_irregularity_amplification() {
    let h: f64 = 3.5;
    let w_bay: f64 = 8.0; // wider bay to amplify torsion effect

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w_bay, h), (4, w_bay, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let v_total: f64 = 30.0; // kN total lateral

    // Case 1: Symmetric loading (no torsion)
    let loads_sym = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: v_total / 2.0, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: v_total / 2.0, fz: 0.0, my: 0.0,
        }),
    ];
    let input_sym = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_sym,
    );
    let res_sym = solve_2d(&input_sym).unwrap();

    let ux2_sym: f64 = res_sym.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux3_sym: f64 = res_sym.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Symmetric: drifts should be approximately equal
    let sym_ratio: f64 = ux2_sym.abs() / ux3_sym.abs();
    assert!((sym_ratio - 1.0).abs() < 0.05,
        "Symmetric: ux_left/ux_right = {:.4} ~ 1.0", sym_ratio);

    // Case 2: Eccentric loading (25% eccentricity)
    let ecc: f64 = 0.25;
    let f_left: f64 = v_total / 2.0 * (1.0 + ecc);
    let f_right: f64 = v_total / 2.0 * (1.0 - ecc);

    let loads_ecc = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_left, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: f_right, fz: 0.0, my: 0.0,
        }),
    ];
    let input_ecc = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_ecc,
    );
    let res_ecc = solve_2d(&input_ecc).unwrap();

    let ux2_ecc: f64 = res_ecc.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux3_ecc: f64 = res_ecc.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Node 2 (left) received more force => larger displacement
    assert!(ux2_ecc.abs() > ux3_ecc.abs(),
        "Eccentric: left drift ({:.6e}) > right drift ({:.6e})",
        ux2_ecc.abs(), ux3_ecc.abs());

    // Torsional irregularity check (ASCE 7 Table 12.3-1)
    let delta_max: f64 = ux2_ecc.abs().max(ux3_ecc.abs());
    let delta_avg: f64 = (ux2_ecc.abs() + ux3_ecc.abs()) / 2.0;
    let torsion_ratio: f64 = delta_max / delta_avg;

    assert!(torsion_ratio >= 1.0,
        "Torsion ratio = {:.4} >= 1.0", torsion_ratio);

    // Amplification factor Ax (ASCE 7 Eq. 12.8-14)
    let ax_raw: f64 = (delta_max / (1.2 * delta_avg)).powi(2);
    let ax: f64 = ax_raw.max(1.0).min(3.0);

    assert!(ax >= 1.0 && ax <= 3.0,
        "Ax = {:.4} bounded in [1.0, 3.0]", ax);

    // If torsion_ratio > 1.2, it is torsionally irregular
    let is_irregular = torsion_ratio > 1.2;
    if is_irregular {
        // Ax should be > 1.0
        assert!(ax > 1.0,
            "Torsionally irregular: Ax = {:.4} > 1.0", ax);
    }

    // Total reaction must still equal total applied force
    let sum_rx_ecc: f64 = res_ecc.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx_ecc.abs(), v_total, 0.02,
        "Eccentric: equilibrium preserved");
}

// ================================================================
// 6. Diaphragm Force Distribution and Bounds
// ================================================================
//
// ASCE 7-22 Sec. 12.10.1.1:
//   Fpx = [sum(Fi, roof to x) / sum(wi, roof to x)] * wpx
//   Fpx_min = 0.2 * SDS * Ie * wpx
//   Fpx_max = 0.4 * SDS * Ie * wpx
//
// 4-story building with equal story weights.
// Apply computed Fpx as lateral forces and verify equilibrium.
//
// Parameters:
//   SDS = 1.0g, Ie = 1.0
//   W per floor = 350 kN
//   V = 140 kN (base shear)
//   Story forces (inverted triangle, k=1):
//     F1 = 14, F2 = 28, F3 = 42, F4 = 56 kN
//
// Reference: ASCE 7-22 Eq. 12.10-1 through 12.10-3
#[test]
fn seismic_design_ext_diaphragm_force_distribution() {
    let sds: f64 = 1.0;
    let ie: f64 = 1.0;
    let n_stories = 4_usize;
    let h: f64 = 3.5;
    let w_bay: f64 = 6.0;
    let w_floor: f64 = 350.0; // kN per floor
    let v_base: f64 = 140.0;  // kN

    // Story forces from inverted triangle (k=1)
    let heights: Vec<f64> = (1..=n_stories).map(|i| i as f64 * h).collect();
    let sum_wh: f64 = heights.iter().map(|&hi| w_floor * hi).sum::<f64>();
    let fx: Vec<f64> = heights.iter()
        .map(|&hi| w_floor * hi / sum_wh * v_base)
        .collect();

    // Verify sum = V
    let sum_fx: f64 = fx.iter().sum::<f64>();
    assert_close(sum_fx, v_base, 0.001, "sum(Fx) = V");

    // Diaphragm force bounds
    let fpx_min_factor: f64 = 0.2 * sds * ie;
    let fpx_max_factor: f64 = 0.4 * sds * ie;

    // Compute Fpx for each level (from top down)
    let mut fpx_values = vec![0.0_f64; n_stories];
    for level in (0..n_stories).rev() {
        // Sum forces and weights from roof down to this level
        let sum_f_above: f64 = fx[level..].iter().sum::<f64>();
        let sum_w_above: f64 = (level..n_stories).map(|_| w_floor).sum::<f64>();
        let fpx_raw: f64 = sum_f_above / sum_w_above * w_floor;
        let fpx: f64 = fpx_raw.max(fpx_min_factor * w_floor).min(fpx_max_factor * w_floor);
        fpx_values[level] = fpx;

        // Check bounds
        assert!(fpx >= fpx_min_factor * w_floor,
            "Level {}: Fpx ({:.1}) >= min ({:.1})", level + 1, fpx, fpx_min_factor * w_floor);
        assert!(fpx <= fpx_max_factor * w_floor,
            "Level {}: Fpx ({:.1}) <= max ({:.1})", level + 1, fpx, fpx_max_factor * w_floor);
    }

    // Roof diaphragm force should be largest (for equal weights, inverted triangle)
    assert!(fpx_values[n_stories - 1] >= fpx_values[0],
        "Roof Fpx ({:.1}) >= base Fpx ({:.1})",
        fpx_values[n_stories - 1], fpx_values[0]);

    // Apply diaphragm forces to a frame and verify equilibrium
    let mut loads = Vec::new();
    let total_fpx: f64 = fpx_values.iter().sum::<f64>();
    for i in 0..n_stories {
        let fi_half: f64 = fpx_values[i] / 2.0;
        let nl = 2 * (i + 1) + 1;
        let nr = 2 * (i + 1) + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nl, fx: fi_half, fz: 0.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nr, fx: fi_half, fz: 0.0, my: 0.0,
        }));
    }

    let input = build_multi_story_frame(n_stories, h, w_bay, E, A, IZ, loads);
    let results = solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), total_fpx, 0.02,
        "Diaphragm forces: sum(Rx) = sum(Fpx)");
}

// ================================================================
// 7. Redundancy Factor rho = 1.3 Penalty on Multi-Story Frame
// ================================================================
//
// ASCE 7-22 Sec. 12.3.4: rho = 1.3 for SDC D-F structures that
// do not meet redundancy conditions.
//
// Apply seismic forces to a 2-story frame with rho = 1.0 and
// rho = 1.3. The linear solver should give exactly 30% higher
// displacements, reactions, and element forces for rho = 1.3.
//
// E = rho * QE +/- 0.2 * SDS * D
//
// Reference: ASCE 7-22 Sec. 12.3.4, Eq. 12.4-3 through 12.4-5
#[test]
fn seismic_design_ext_redundancy_factor_penalty() {
    let n_stories = 2_usize;
    let h: f64 = 3.5;
    let w_bay: f64 = 6.0;

    // Baseline seismic forces (QE)
    let qe_forces = vec![8.0, 16.0]; // kN at floor 1 and 2

    let build_with_rho = |rho: f64| {
        let mut loads = Vec::new();
        for i in 0..n_stories {
            let fi: f64 = rho * qe_forces[i] / 2.0;
            let nl = 2 * (i + 1) + 1;
            let nr = 2 * (i + 1) + 2;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: nl, fx: fi, fz: 0.0, my: 0.0,
            }));
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: nr, fx: fi, fz: 0.0, my: 0.0,
            }));
        }
        build_multi_story_frame(n_stories, h, w_bay, E, A, IZ, loads)
    };

    // Case 1: rho = 1.0 (redundant)
    let input_1 = build_with_rho(1.0);
    let res_1 = solve_2d(&input_1).unwrap();

    // Case 2: rho = 1.3 (non-redundant)
    let input_13 = build_with_rho(1.3);
    let res_13 = solve_2d(&input_13).unwrap();

    // Top floor displacement (node at story 2, left column)
    let top_node = 2 * n_stories + 1;
    let ux_rho1: f64 = res_1.displacements.iter()
        .find(|d| d.node_id == top_node).unwrap().ux;
    let ux_rho13: f64 = res_13.displacements.iter()
        .find(|d| d.node_id == top_node).unwrap().ux;

    // Linear: displacement scales exactly by rho ratio
    let disp_ratio: f64 = ux_rho13 / ux_rho1;
    assert_close(disp_ratio, 1.3, 0.01,
        "Displacement scales by rho = 1.3");

    // Horizontal reactions scale by 1.3
    let sum_rx_1: f64 = res_1.reactions.iter().map(|r| r.rx).sum::<f64>();
    let sum_rx_13: f64 = res_13.reactions.iter().map(|r| r.rx).sum::<f64>();
    let rx_ratio: f64 = sum_rx_13 / sum_rx_1;
    assert_close(rx_ratio, 1.3, 0.01,
        "Reaction Rx scales by rho = 1.3");

    // Element forces (moments) also scale by 1.3
    // Compare base column moment (element 1)
    let ef1_rho1 = res_1.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let ef1_rho13 = res_13.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();

    let m_ratio: f64 = ef1_rho13.m_start / ef1_rho1.m_start;
    assert_close(m_ratio, 1.3, 0.01,
        "Base column moment scales by rho = 1.3");

    // Verify the 30% penalty
    let pct_increase: f64 = (rx_ratio - 1.0) * 100.0;
    assert_close(pct_increase, 30.0, 0.05,
        "Redundancy penalty = 30% increase");
}

// ================================================================
// 8. Dual System Analysis: MF vs Braced Frame Stiffness
// ================================================================
//
// ASCE 7-22 Sec. 12.2.5.1: In a dual system, the moment frame
// must be capable of resisting at least 25% of the prescribed
// seismic forces.
//
// Compare a moment frame, a braced frame (diagonal truss members),
// and verify:
//   - Braced frame is stiffer (smaller displacement)
//   - Both carry the applied lateral load (equilibrium)
//   - Moment frame displacement >= braced frame displacement
//
// The braced frame uses pinned diagonals (truss elements with
// hinge_start=true, hinge_end=true).
//
// Reference: ASCE 7-22 Sec. 12.2.5.1
#[test]
fn seismic_design_ext_dual_system_stiffness_comparison() {
    let h: f64 = 4.0;
    let w_bay: f64 = 6.0;
    let lateral: f64 = 50.0; // kN

    // Case 1: Pure moment frame (portal)
    let input_mf = make_portal_frame(h, w_bay, E, A, IZ, lateral, 0.0);
    let res_mf = solve_2d(&input_mf).unwrap();

    // Case 2: Braced frame (portal + single diagonal brace)
    // Add a diagonal from node 1 (0,0) to node 3 (w,h)
    let nodes_bf = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w_bay, h), (4, w_bay, 0.0),
    ];
    let a_brace: f64 = 0.005; // m^2, smaller brace area
    let elems_bf = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "frame", 1, 3, 1, 2, true, true),   // diagonal brace (truss)
    ];
    let sups_bf = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_bf = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fz: 0.0, my: 0.0,
        }),
    ];

    let input_bf = make_input(
        nodes_bf,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, a_brace, 1e-8)], // brace section: small I (truss)
        elems_bf,
        sups_bf,
        loads_bf,
    );
    let res_bf = solve_2d(&input_bf).unwrap();

    // Moment frame displacement at node 2
    let ux_mf: f64 = res_mf.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Braced frame displacement at node 2
    let ux_bf: f64 = res_bf.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Braced frame should be stiffer (less displacement)
    assert!(ux_bf.abs() < ux_mf.abs(),
        "Braced frame stiffer: |ux_bf| ({:.6e}) < |ux_mf| ({:.6e})",
        ux_bf.abs(), ux_mf.abs());

    // Stiffness ratio: K_bf / K_mf = ux_mf / ux_bf (same load)
    let stiffness_ratio: f64 = ux_mf.abs() / ux_bf.abs();
    assert!(stiffness_ratio > 1.0,
        "Braced frame stiffness ratio = {:.2} > 1.0", stiffness_ratio);

    // Both frames must satisfy equilibrium
    let sum_rx_mf: f64 = res_mf.reactions.iter().map(|r| r.rx).sum::<f64>();
    let sum_rx_bf: f64 = res_bf.reactions.iter().map(|r| r.rx).sum::<f64>();

    assert_close(sum_rx_mf.abs(), lateral, 0.02,
        "Moment frame equilibrium: sum(Rx) = F");
    assert_close(sum_rx_bf.abs(), lateral, 0.02,
        "Braced frame equilibrium: sum(Rx) = F");

    // Dual system requirement: MF must resist >= 25% of V.
    // In a dual system the MF backbone carries the remainder.
    // Here we just verify both systems independently carry 100% of load.
    // The moment frame's base shear equals the applied lateral.
    let mf_base_shear: f64 = sum_rx_mf.abs();
    assert!(mf_base_shear >= 0.25 * lateral,
        "MF base shear ({:.2}) >= 25% of V ({:.2})", mf_base_shear, 0.25 * lateral);

    // The diagonal brace (element 4) should carry significant axial force
    let ef_brace = res_bf.element_forces.iter()
        .find(|ef| ef.element_id == 4).unwrap();

    // Brace is a truss element: it should have non-trivial axial force
    // and near-zero moments (hinged at both ends)
    assert!(ef_brace.n_start.abs() > 1.0,
        "Diagonal brace carries axial force: N = {:.2} kN", ef_brace.n_start.abs());
    assert!(ef_brace.m_start.abs() < 1e-3,
        "Brace moment ~ 0 (truss): M_start = {:.6}", ef_brace.m_start);

    // Braced frame columns carry less bending moment than MF columns
    let ef_bf_col1 = res_bf.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let ef_mf_col1 = res_mf.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();

    assert!(ef_bf_col1.m_start.abs() < ef_mf_col1.m_start.abs(),
        "Braced frame column moment ({:.2}) < MF column moment ({:.2})",
        ef_bf_col1.m_start.abs(), ef_mf_col1.m_start.abs());
}
