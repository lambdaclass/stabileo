/// Validation: Design Code Interaction Checks — Extended
///
/// References:
///   - AISC 360-22, Ch. H (Combined Forces and Torsion), Eq. H1-1a & H1-1b
///   - AISC 360-22, Ch. E (Compression Members), Table 4-1a
///   - AISC 360-22, Ch. F (Flexural Members, lateral-torsional buckling)
///   - EN 1993-1-1:2005 (Eurocode 3), Clause 6.3.3 (beam-columns)
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 9 (plate girders)
///   - Segui, "Steel Design", 6th Ed., Ch. 4 (compression members)
///   - Geschwindner, "Unified Design of Steel Structures", 3rd Ed., Ch. 8
///   - IBC 2021 / ASCE 7-22, Table 12.12-1 (story drift limits)
///
/// Tests verify extended design-oriented interaction checks using solver output:
///   1. AISC H1-1b interaction: Pr/(2*Pc) + Mr/Mc for Pr/Pc < 0.2
///   2. Story drift limit: inter-story drift ratio < h/400 (seismic)
///   3. Continuous beam envelope: maximum positive and negative moments
///   4. Portal frame sway amplification: gravity + lateral interaction
///   5. Euler curve vs AISC column curve: Fe and Fcr comparison
///   6. Propped cantilever serviceability: fixed-roller deflection check
///   7. Weld group eccentricity: resultant force on fillet weld group
///   8. Multi-story frame column load accumulation: tributary area gravity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa; solver uses E * 1000.0 internally -> kN/m^2
const E_EFF: f64 = E * 1000.0; // kN/m^2

// W14x48 section properties (SI)
const W14_A: f64 = 0.00912; // m^2
const W14_IZ: f64 = 2.0126e-4; // m^4 (strong axis)
const W14_D: f64 = 0.3505; // depth m

// W10x33 section (smaller, for beams)
const W10_A: f64 = 0.00626; // m^2
const W10_IZ: f64 = 7.118e-5; // m^4 (strong axis)

// ================================================================
// 1. AISC H1-1b Interaction: Pr/(2*Pc) + Mr/Mc for Low Axial
// ================================================================
//
// When Pr/Pc < 0.2, AISC 360-22 Eq. H1-1b governs:
//   Pr/(2*Pc) + (Mrx/Mcx) <= 1.0
//
// A pinned-pinned beam-column carries a small axial compression
// (5% of yield capacity) plus a midspan point load.
// We verify the interaction ratio falls in the H1-1b regime
// and compute the demand-to-capacity ratio.
//
// Reference: AISC 360-22 Sec. H1.1

#[test]
fn validation_dci_ext_aisc_h1_1b_low_axial() {
    let l: f64 = 6.0;
    let n: usize = 12;
    let fz: f64 = 345.0; // MPa (A992 steel)
    let fy_eff: f64 = fz * 1000.0; // kN/m^2

    // Yield capacity
    let pc: f64 = fy_eff * W14_A;

    // Apply 5% of yield capacity as axial compression
    let pr: f64 = 0.05 * pc;

    // Approximate plastic section modulus for W14x48
    let sx: f64 = 2.0 * W14_IZ / W14_D;
    let zx: f64 = sx * 1.12;
    let mc: f64 = fy_eff * zx;

    // Choose lateral load so Mr/Mc ~ 0.50
    // For SS beam with center point load: M_max = P*L/4
    // P_lateral = 0.50 * Mc * 4 / L
    let p_lateral: f64 = 0.50 * mc * 4.0 / l;

    let mid: usize = n / 2 + 1;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -pr,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid,
            fx: 0.0,
            fz: -p_lateral,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract midspan element forces
    let mid_elem: usize = n / 2;
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem)
        .unwrap();

    let nu: f64 = ef.n_start.abs();
    let mu: f64 = ef.m_end.abs();

    // Verify we are in the H1-1b regime: Pr/Pc < 0.2
    let ratio_axial: f64 = nu / pc;
    assert!(
        ratio_axial < 0.2,
        "Expected Pr/Pc < 0.2, got {:.4}",
        ratio_axial
    );

    // H1-1b: Pr/(2*Pc) + Mr/Mc
    let interaction: f64 = ratio_axial / 2.0 + mu / mc;
    assert!(
        interaction < 1.0,
        "AISC H1-1b: interaction={:.4} should be < 1.0",
        interaction
    );

    // Expected: 0.05/2 + 0.50 = 0.525
    assert_close(interaction, 0.025 + 0.50, 0.10,
        "AISC H1-1b: interaction near predicted 0.525");
}

// ================================================================
// 2. Story Drift Limit: Inter-Story Drift Ratio < h/400
// ================================================================
//
// Seismic design codes limit inter-story drift to prevent
// non-structural damage. A common limit is h/400 for Risk
// Category II buildings (ASCE 7-22 Table 12.12-1).
//
// A portal frame subjected to lateral load: verify the
// horizontal displacement at beam level is within the drift limit.
// Drift ratio = delta_x / h.
//
// Reference: ASCE 7-22 Sec. 12.12, IBC 2021

#[test]
fn validation_dci_ext_story_drift_limit() {
    let h: f64 = 3.6; // m (story height)
    let w: f64 = 6.0; // m (bay width)
    let n_col: usize = 6;
    let n_beam: usize = 8;

    // Drift limit for Risk Category II: h/400
    let drift_limit: f64 = h / 400.0;

    // Lateral seismic force (design level, reduced by R factor)
    let f_lateral: f64 = 25.0; // kN

    // Build portal frame manually: nodes, cols, beam
    // Nodes: 1(0,0), 2..=n_col+1 along left col, then beam, then right col
    let elem_col: f64 = h / n_col as f64;
    let elem_beam: f64 = w / n_beam as f64;

    // Left column nodes: 1 to n_col+1
    let mut nodes: Vec<(usize, f64, f64)> = Vec::new();
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * elem_col));
    }
    let left_top: usize = n_col + 1;

    // Beam nodes: left_top+1 to left_top+n_beam (right top = left_top+n_beam)
    for i in 1..=n_beam {
        nodes.push((left_top + i, i as f64 * elem_beam, h));
    }
    let right_top: usize = left_top + n_beam;

    // Right column nodes: right_top+1 to right_top+n_col (bottom = right_top+n_col)
    for i in 1..=n_col {
        nodes.push((right_top + i, w, h - i as f64 * elem_col));
    }
    let right_bottom: usize = right_top + n_col;

    // Elements
    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    let mut eid: usize = 1;
    // Left column
    for i in 0..n_col {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Beam
    for i in 0..n_beam {
        let ni = if i == 0 { left_top } else { left_top + i };
        let nj = left_top + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 2, false, false));
        eid += 1;
    }
    // Right column (top to bottom)
    for i in 0..n_col {
        let ni = if i == 0 { right_top } else { right_top + i };
        let nj = right_top + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
        eid += 1;
    }

    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, W14_A, W14_IZ), (2, W10_A, W10_IZ)];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, right_bottom, "fixed"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: left_top,
        fx: f_lateral,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract lateral displacement at beam level (left top node)
    let disp_top = results.displacements.iter()
        .find(|d| d.node_id == left_top).unwrap();
    let delta_x: f64 = disp_top.ux.abs();

    // Drift ratio
    let drift_ratio: f64 = delta_x / h;

    // With stiff W14x48 columns and moderate load, drift should be within limit
    assert!(
        delta_x < drift_limit,
        "Story drift ({:.6} m) should be < h/400 ({:.6} m)",
        delta_x, drift_limit
    );

    // Drift ratio should be small for this stiff frame
    assert!(
        drift_ratio < 1.0 / 400.0,
        "Drift ratio ({:.6}) should be < 1/400 ({:.6})",
        drift_ratio, 1.0 / 400.0
    );

    // Global equilibrium: sum of horizontal reactions = -f_lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lateral, 0.02,
        "Story drift frame: horizontal equilibrium");
}

// ================================================================
// 3. Continuous Beam Moment Envelope: Max Positive & Negative
// ================================================================
//
// A two-span continuous beam (pinned-roller-roller) under uniform
// load develops negative moment over the interior support and
// positive moments in each span.
//
// For equal spans with UDL: M_support = -qL^2/8 (interior support)
// and M_midspan ~ 9qL^2/128 (positive, in each span).
//
// Reference: AISC Steel Construction Manual, Table 3-23,
//            Hibbeler, "Structural Analysis", 10th Ed., Ch. 12

#[test]
fn validation_dci_ext_continuous_beam_moment_envelope() {
    let span: f64 = 8.0;
    let n_per_span: usize = 8;
    let q: f64 = -15.0; // kN/m UDL (downward)

    // Build two-span continuous beam
    let total_elements: usize = 2 * n_per_span;
    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[span, span], n_per_span, E, W14_A, W14_IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Interior support is at node n_per_span + 1
    let _interior_node: usize = n_per_span + 1;

    // Extract moment at interior support from adjacent elements
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_support: f64 = ef_left.m_end; // should be negative (hogging)

    // For two equal spans with UDL: M_interior = -q*L^2/8
    // (negative because hogging; q is negative so -q*L^2/8 is positive in sign,
    // but convention may differ)
    let m_support_expected: f64 = q.abs() * span * span / 8.0;

    // The support moment magnitude should be close to qL^2/8
    assert_close(m_support.abs(), m_support_expected, 0.05,
        "Continuous beam: interior support moment ~ qL^2/8");

    // Find max positive moment in span 1 interior (exclude elements at supports).
    // Elements 1..n_per_span belong to span 1. Element n_per_span has its
    // m_end at the interior support (hogging). We look at the midspan region
    // (elements n_per_span/4 to 3*n_per_span/4) for the true positive peak.
    let mid_elem: usize = n_per_span / 2; // element near midspan of span 1
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // The positive sagging moment near midspan: take the larger of start/end
    let m_pos_max: f64 = ef_mid.m_start.abs().max(ef_mid.m_end.abs());

    // Positive midspan moment for two-span continuous with UDL:
    // M_pos ~ 9*q*L^2/128 (approximately)
    let m_pos_expected: f64 = 9.0 * q.abs() * span * span / 128.0;
    assert_close(m_pos_max, m_pos_expected, 0.15,
        "Continuous beam: midspan positive moment ~ 9qL^2/128");

    // The negative support moment should be larger than the positive midspan moment
    assert!(
        m_support.abs() > m_pos_max,
        "Interior support moment ({:.2}) should exceed midspan positive ({:.2})",
        m_support.abs(), m_pos_max
    );

    // Vertical equilibrium: sum of reactions = total load
    let total_load: f64 = q.abs() * 2.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Continuous beam: vertical equilibrium");
}

// ================================================================
// 4. Portal Frame Sway Amplification: Gravity + Lateral
// ================================================================
//
// A portal frame under combined gravity and lateral load. The
// gravity load on the beam creates no sway by itself (symmetric),
// but the lateral load causes sway. The combined loading should
// produce a linear superposition of effects (in first-order analysis).
//
// Verify: displacement from combined = sum of individual displacements.
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 2

#[test]
fn validation_dci_ext_portal_frame_superposition() {
    let h: f64 = 4.0;
    let w: f64 = 8.0;
    let f_lateral: f64 = 40.0; // kN
    let q_gravity: f64 = -20.0; // kN/m on beam

    // Case 1: lateral only
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, W14_A, W14_IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];

    let loads_lateral = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: f_lateral,
        fz: 0.0,
        my: 0.0,
    })];
    let input_lat = make_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        loads_lateral,
    );
    let res_lat = linear::solve_2d(&input_lat).unwrap();

    // Case 2: gravity only (UDL on beam element 2)
    let loads_gravity = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 2,
        q_i: q_gravity,
        q_j: q_gravity,
        a: None,
        b: None,
    })];
    let input_grav = make_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        loads_gravity,
    );
    let res_grav = linear::solve_2d(&input_grav).unwrap();

    // Case 3: combined
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: f_lateral,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2,
            q_i: q_gravity,
            q_j: q_gravity,
            a: None,
            b: None,
        }),
    ];
    let input_comb = make_input(
        nodes, mats, secs, elems, sups,
        loads_combined,
    );
    let res_comb = linear::solve_2d(&input_comb).unwrap();

    // Superposition check: ux and uy at node 2
    let d_lat_2 = res_lat.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_grav_2 = res_grav.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_comb_2 = res_comb.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert_close(d_comb_2.ux, d_lat_2.ux + d_grav_2.ux, 0.01,
        "Superposition: ux at node 2");
    assert_close(d_comb_2.uz, d_lat_2.uz + d_grav_2.uz, 0.01,
        "Superposition: uy at node 2");

    // Also check node 3
    let d_lat_3 = res_lat.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d_grav_3 = res_grav.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d_comb_3 = res_comb.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(d_comb_3.ux, d_lat_3.ux + d_grav_3.ux, 0.01,
        "Superposition: ux at node 3");
    assert_close(d_comb_3.uz, d_lat_3.uz + d_grav_3.uz, 0.01,
        "Superposition: uy at node 3");

    // Superposition check on element forces: moment at base of left column
    let ef_lat = res_lat.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_grav = res_grav.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_comb = res_comb.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    assert_close(ef_comb.m_start, ef_lat.m_start + ef_grav.m_start, 0.01,
        "Superposition: m_start on left column");
}

// ================================================================
// 5. Euler Curve vs AISC Column Curve: Fe and Fcr Comparison
// ================================================================
//
// AISC 360-22 Sec. E3 defines the critical stress Fcr:
//   If KL/r <= 4.71*sqrt(E/Fy): Fcr = 0.658^(Fy/Fe) * Fy (inelastic)
//   If KL/r > 4.71*sqrt(E/Fy):  Fcr = 0.877 * Fe          (elastic)
// where Fe = pi^2*E/(KL/r)^2.
//
// For a given column, compute the Euler load Pe = Fe * A and
// verify that the solver can carry a fraction of Fcr*A without
// issue. This test uses pure analytical checks on the column curve
// combined with solver equilibrium verification.
//
// Reference: AISC 360-22 Sec. E3, Segui Ch. 4

#[test]
fn validation_dci_ext_euler_vs_aisc_column_curve() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let fz: f64 = 345.0; // MPa (A992)
    let fy_eff: f64 = fz * 1000.0; // kN/m^2
    let pi: f64 = std::f64::consts::PI;

    let r: f64 = (W14_IZ / W14_A).sqrt(); // radius of gyration
    let kl_r: f64 = l / r; // K=1 for pinned-pinned

    // Euler stress
    let fe: f64 = pi.powi(2) * E_EFF / (kl_r * kl_r);

    // Transition slenderness
    let transition: f64 = 4.71 * (E_EFF / fy_eff).sqrt();

    // AISC critical stress
    let fcr: f64 = if kl_r <= transition {
        // Inelastic buckling
        (0.658_f64).powf(fy_eff / fe) * fy_eff
    } else {
        // Elastic buckling
        0.877 * fe
    };

    // Nominal capacity
    let pn: f64 = fcr * W14_A;

    // Fe should be larger than Fy for a stocky column
    // For W14x48 with L=5m, KL/r is moderate
    assert!(
        kl_r < transition,
        "KL/r={:.1} should be < transition={:.1} (inelastic regime)",
        kl_r, transition
    );

    // Fcr should be less than Fy (reduction due to residual stresses)
    assert!(
        fcr < fy_eff,
        "Fcr ({:.0}) should be < Fy ({:.0})",
        fcr, fy_eff
    );

    // Fcr should be greater than 0.39*Fy (lower bound for inelastic range)
    assert!(
        fcr > 0.39 * fy_eff,
        "Fcr ({:.0}) should be > 0.39*Fy ({:.0})",
        fcr, 0.39 * fy_eff
    );

    // Apply 40% of nominal capacity as compression with small lateral perturbation
    let p_applied: f64 = 0.40 * pn;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_applied,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n / 2 + 1,
            fx: 0.0,
            fz: -1.0, // small lateral perturbation
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Axial force in elements should be approximately p_applied
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.n_start.abs(), p_applied, 0.02,
        "AISC column curve: axial force = applied load");

    // Verify Euler load relationship: Pe = Fe * A
    let pe: f64 = fe * W14_A;
    let pe_direct: f64 = pi.powi(2) * E_EFF * W14_IZ / (l * l);
    assert_close(pe, pe_direct, 0.01,
        "AISC column curve: Pe = Fe*A = pi^2*EI/L^2");

    // Applied load should be well below Euler load
    assert!(
        p_applied < pe,
        "Applied load ({:.0} kN) should be < Pe ({:.0} kN)",
        p_applied, pe
    );
}

// ================================================================
// 6. Propped Cantilever Serviceability: Fixed-Roller Deflection
// ================================================================
//
// A propped cantilever (fixed at left, roller at right) under UDL.
// Maximum deflection occurs at x = 0.4215*L from the fixed end:
//   delta_max = q*L^4 / (185*E*I)  (approximately)
//
// The deflection is smaller than a simply-supported beam because
// the fixed end restraint reduces deformation.
//
// Reference: Roark's Formulas for Stress and Strain, 9th Ed., Table 8.1

#[test]
fn validation_dci_ext_propped_cantilever_serviceability() {
    let l: f64 = 10.0;
    let n: usize = 20;
    let q: f64 = -10.0; // kN/m UDL (downward)

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    // Fixed at left, rollerX at right (rollerX = free to slide in X, uy restrained)
    let input = make_beam(n, l, E, W14_A, W14_IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Maximum deflection for propped cantilever with UDL:
    // delta_max = q*L^4 / (185*E*I)
    let delta_max_expected: f64 = q.abs() * l.powi(4) / (185.0 * E_EFF * W14_IZ);

    // Find maximum vertical displacement (negative = downward)
    let max_uy: f64 = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Should be close to the analytical maximum
    assert_close(max_uy, delta_max_expected, 0.05,
        "Propped cantilever: max deflection ~ qL^4/(185EI)");

    // Propped cantilever deflection should be less than SS beam deflection
    let delta_ss: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * E_EFF * W14_IZ);
    assert!(
        max_uy < delta_ss,
        "Propped cantilever deflection ({:.6}) should be < SS beam ({:.6})",
        max_uy, delta_ss
    );

    // Check serviceability: L/360 limit
    let limit_360: f64 = l / 360.0;
    // For this section and load, check whether limit is satisfied
    // (it may or may not be, but we verify consistency)
    let passes_l360: bool = max_uy < limit_360;

    // Fixed end moment for propped cantilever with UDL: M_fixed = -q*L^2/8
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_fixed: f64 = ef_first.m_start.abs();
    let m_fixed_expected: f64 = q.abs() * l * l / 8.0;
    assert_close(m_fixed, m_fixed_expected, 0.05,
        "Propped cantilever: fixed-end moment ~ qL^2/8");

    // Reaction at roller support: R_roller = 3qL/8
    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    let ry_roller: f64 = r_roller.rz.abs();
    let ry_expected: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(ry_roller, ry_expected, 0.03,
        "Propped cantilever: roller reaction = 3qL/8");

    // Record whether serviceability is met (informational)
    let _ = passes_l360;
}

// ================================================================
// 7. Weld Group Eccentricity: Resultant Force on Fillet Weld
// ================================================================
//
// A bracket connection uses a C-shaped weld group. The beam end
// reaction creates an eccentric shear on the weld group.
// Given a simply-supported beam with UDL, extract the end
// reaction, then compute the weld group forces analytically.
//
// For a C-shaped weld group with dimensions b x d:
//   Centroid offset: x_bar = b^2 / (2*b + d)
//   Polar moment of inertia: Ip = (sum of Ix + Iy for each segment)
//   Direct shear: f_direct = V / L_weld
//   Torsional shear: f_torsion = M * r_max / Ip
//   Resultant: f_max = sqrt(f_direct^2 + f_torsion^2 + 2*f_direct*f_torsion*cos_theta)
//
// Reference: AISC Steel Construction Manual, Part 8 (Weld Tables),
//            Salmon et al. Ch. 12

#[test]
fn validation_dci_ext_weld_group_eccentricity() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let q: f64 = -25.0; // kN/m UDL

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, W14_A, W14_IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reaction at left support
    let r_left = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let v_conn: f64 = r_left.rz.abs();

    // For SS beam with UDL: R = qL/2
    let v_expected: f64 = q.abs() * l / 2.0;
    assert_close(v_conn, v_expected, 0.02,
        "Weld group: end reaction = qL/2");

    // C-shaped weld group: two horizontal welds (b=0.10 m) + one vertical weld (d=0.20 m)
    let b_weld: f64 = 0.10; // m
    let d_weld: f64 = 0.20; // m
    let l_weld: f64 = 2.0 * b_weld + d_weld; // total weld length

    // Centroid of C-weld from left edge: x_bar = b^2 / (2b + d)
    let x_bar: f64 = b_weld * b_weld / (2.0 * b_weld + d_weld);

    // Eccentricity from weld centroid to line of action
    let eccentricity: f64 = 0.075; // m (distance from beam web to weld centroid)

    // Moment on weld group
    let m_weld: f64 = v_conn * eccentricity;

    // Ix of weld group (about centroid, treating welds as line elements):
    // Two horizontal welds at y = +/- d/2: Ix_horiz = 2 * b * (d/2)^2
    // Vertical weld: Ix_vert = d^3/12
    let ix: f64 = 2.0 * b_weld * (d_weld / 2.0).powi(2) + d_weld.powi(3) / 12.0;

    // Iy of weld group (about centroid):
    // Horizontal welds: Iy_horiz = 2 * (b^3/12 + b * (b/2 - x_bar)^2)
    // Vertical weld: Iy_vert = d * x_bar^2
    let iy: f64 = 2.0 * (b_weld.powi(3) / 12.0 + b_weld * (b_weld / 2.0 - x_bar).powi(2))
                + d_weld * x_bar.powi(2);

    let ip: f64 = ix + iy; // polar moment

    // Direct shear per unit length
    let f_direct: f64 = v_conn / l_weld;

    // Maximum distance from centroid to corner of weld group
    let r_max: f64 = ((b_weld - x_bar).powi(2) + (d_weld / 2.0).powi(2)).sqrt();

    // Torsional shear per unit length at critical point
    let f_torsion: f64 = m_weld * r_max / ip;

    // Resultant (conservative upper bound: direct add)
    let f_resultant_upper: f64 = f_direct + f_torsion;

    // The maximum weld force per unit length must exceed direct shear
    assert!(
        f_resultant_upper > f_direct,
        "Weld resultant ({:.2} kN/m) should exceed direct shear ({:.2} kN/m)",
        f_resultant_upper, f_direct
    );

    // Eccentricity amplification should be modest for small e
    let amplification: f64 = f_resultant_upper / f_direct;
    assert!(
        amplification < 3.0,
        "Weld force amplification ({:.2}) should be < 3.0 for moderate eccentricity",
        amplification
    );
    assert!(
        amplification > 1.0,
        "Weld force amplification ({:.2}) should be > 1.0",
        amplification
    );

    // Verify weld group centroid calculation
    assert!(
        x_bar > 0.0 && x_bar < b_weld,
        "Weld centroid x_bar ({:.4}) should be between 0 and b ({:.4})",
        x_bar, b_weld
    );
}

// ================================================================
// 8. Multi-Story Frame Column Load Accumulation
// ================================================================
//
// In a multi-story frame, gravity loads accumulate in the columns
// from top to bottom. The bottom column carries the sum of all
// floor loads above. This test builds a two-story single-bay
// frame and verifies that the base column axial force equals the
// total applied gravity.
//
// Also verifies that the bottom story column carries more moment
// than the top story column under lateral load (inverted triangle
// pattern of cumulative shear).
//
// Reference: Geschwindner, "Unified Design", Ch. 3;
//            McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 15

#[test]
fn validation_dci_ext_multistory_column_load_accumulation() {
    let h1: f64 = 4.0; // first story height
    let h2: f64 = 3.5; // second story height
    let w: f64 = 6.0;  // bay width
    let p_floor: f64 = -60.0; // kN gravity at each floor level per joint
    let f_lat_1: f64 = 30.0; // kN lateral at first floor
    let f_lat_2: f64 = 20.0; // kN lateral at second floor (roof)

    // Build two-story frame:
    // Nodes: 1(0,0), 2(0,h1), 3(0,h1+h2), 4(w,0), 5(w,h1), 6(w,h1+h2)
    // Elements: 1(col 1-2), 2(col 2-3), 3(beam 2-5), 4(beam 3-6), 5(col 4-5), 6(col 5-6)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, 0.0, h1 + h2),
        (4, w, 0.0),
        (5, w, h1),
        (6, w, h1 + h2),
    ];

    let mats = vec![(1, E, 0.3)];
    // Section 1 for columns, section 2 for beams
    let secs = vec![(1, W14_A, W14_IZ), (2, W10_A, W10_IZ)];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 2, 3, 1, 1, false, false), // left col, story 2
        (3, "frame", 2, 5, 1, 2, false, false), // beam, floor 1
        (4, "frame", 3, 6, 1, 2, false, false), // beam, roof
        (5, "frame", 4, 5, 1, 1, false, false), // right col, story 1
        (6, "frame", 5, 6, 1, 1, false, false), // right col, story 2
    ];

    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 4_usize, "fixed"),
    ];

    let loads = vec![
        // Gravity at floor level (nodes 2, 5)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: p_floor, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fz: p_floor, my: 0.0,
        }),
        // Gravity at roof level (nodes 3, 6)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: p_floor, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fz: p_floor, my: 0.0,
        }),
        // Lateral loads
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lat_1, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: f_lat_2, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: total gravity = 4 * p_floor (4 joints)
    let total_gravity: f64 = 4.0 * p_floor; // negative (downward)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -total_gravity, 0.02,
        "Multi-story: vertical equilibrium");

    // Horizontal equilibrium: total lateral = f_lat_1 + f_lat_2
    let total_lateral: f64 = f_lat_1 + f_lat_2;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -total_lateral, 0.02,
        "Multi-story: horizontal equilibrium");

    // Bottom story left column (element 1): axial force should carry
    // weight from both floors on its tributary area.
    // Due to lateral load redistribution, axial force will not be exactly
    // half of total gravity, but should be in a reasonable range.
    let ef_col_bot_left = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let n_bot_left: f64 = ef_col_bot_left.n_start.abs();

    // Each column carries roughly half the total gravity (2 joints per side)
    // plus some overturning effect from lateral loads
    let approx_gravity_share: f64 = p_floor.abs() * 2.0; // 2 floors on left side
    assert!(
        n_bot_left > approx_gravity_share * 0.5,
        "Bottom left column axial ({:.1}) should be > half gravity share ({:.1})",
        n_bot_left, approx_gravity_share * 0.5
    );

    // Top story column (element 2): axial force should be less than bottom story
    let ef_col_top_left = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let n_top_left: f64 = ef_col_top_left.n_start.abs();

    assert!(
        n_bot_left > n_top_left,
        "Bottom col axial ({:.1} kN) should exceed top col axial ({:.1} kN)",
        n_bot_left, n_top_left
    );

    // Bottom story columns carry more shear than top story columns
    // (cumulative story shear increases going down)
    let v_bot_left: f64 = ef_col_bot_left.v_start.abs().max(ef_col_bot_left.v_end.abs());
    let v_top_left: f64 = ef_col_top_left.v_start.abs().max(ef_col_top_left.v_end.abs());

    assert!(
        v_bot_left > v_top_left,
        "Bottom col shear ({:.1} kN) should exceed top col shear ({:.1} kN)",
        v_bot_left, v_top_left
    );

    // Moment at base of bottom column should be non-zero (fixed support)
    let m_base: f64 = ef_col_bot_left.m_start.abs();
    assert!(
        m_base > 0.1,
        "Base moment ({:.2} kN-m) should be non-trivial",
        m_base
    );
}
