/// Validation: Advanced Semi-Rigid Connection Benchmarks
///
/// References:
///   - Eurocode 3, EN 1993-1-8, Section 5 (Classification of Joints)
///   - Chen & Lui, "Stability Design of Steel Frames", Ch. 5
///   - Bjorhovde, Colson & Brozzetti, "Classification of Connections" (1990)
///   - Faella, Piluso & Rizzano, "Structural Steel Semi-Rigid Connections"
///
/// Semi-rigid connections are modeled via rotational springs (kz in 2D)
/// at support locations. A connection with stiffness ktheta produces
/// behavior between fully pinned (ktheta=0) and fully rigid (ktheta=inf).
///
/// Tests verify:
///   1. Rigid vs pinned: moment distribution comparison
///   2. Parametric spring stiffness effect on beam moment
///   3. EC3-1-8 classification: pinned, semi-rigid, rigid zones
///   4. Portal frame sway with semi-rigid base connections
///   5. Moment redistribution in continuous beam with semi-rigid end supports
///   6. Connection rotation = M/ktheta at beam support
///   7. Effective length factor changes with connection stiffness
///   8. Fixity factor = 1/(1 + 3EI/(ktheta*L))
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a beam with rotational springs at its ends for semi-rigid modeling.
/// kz_start: rotational spring stiffness at node 1 (None = no spring).
/// kz_end: rotational spring stiffness at end node (None = no spring).
/// Start gets "pinned" (ux,uy restrained, rz free + optional kz spring).
/// End gets "rollerX" (uy restrained, ux,rz free + optional kz spring).
fn make_semirigid_beam(
    n: usize,
    l: f64,
    kz_start: Option<f64>,
    kz_end: Option<f64>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes = HashMap::new();
    for i in 0..n_nodes {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, z: 0.0,
        });
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups = HashMap::new();

    // Start support: pinned + optional rotational spring
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: kz_start,
        dx: None, dz: None, dry: None, angle: None,
    });

    // End support: rollerX + optional rotational spring
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: kz_end,
        dx: None, dz: None, dry: None, angle: None,
    });

    SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() }
}

// ================================================================
// 1. Rigid vs Pinned Moment: Moment Distribution Comparison
// ================================================================
//
// A simply-supported beam with UDL has midspan moment = qL^2/8 and
// zero end moments (pinned). A fixed-fixed beam has end moments
// = qL^2/12 and midspan moment = qL^2/24.
// Compare these two limiting cases and verify that the solver
// reproduces the correct moment ratios.

#[test]
fn validation_sr_ext_1_rigid_vs_pinned_moment() {
    let l: f64 = 6.0;
    let n = 8;
    let q: f64 = -10.0;

    // Build UDL loads
    let loads_udl = |_n: usize| -> Vec<SolverLoad> {
        (1..=_n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        })).collect()
    };

    // Pinned-roller beam (simply supported)
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_udl(n));
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // Fixed-fixed beam
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_udl(n));
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // SS beam: end moments should be ~0
    let r_ss_1 = res_ss.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_ss_1.my.abs() < 0.1,
        "SS beam: end moment should be ~0: {:.6}", r_ss_1.my);

    // Fixed-fixed: end moment = qL^2/12
    let q_abs: f64 = q.abs();
    let m_ff_expected: f64 = q_abs * l.powi(2) / 12.0;
    let r_ff_1 = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_ff_1.my.abs(), m_ff_expected, 0.05,
        "Fixed-fixed: end moment = qL^2/12");

    // The midspan moment of FF beam should be less than SS beam
    let mid_elem = n / 2;
    let ef_ss_mid = res_ss.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    let ef_ff_mid = res_ff.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();

    assert!(ef_ff_mid.m_end.abs() < ef_ss_mid.m_end.abs(),
        "Fixed beam midspan moment < SS beam: {:.4} < {:.4}",
        ef_ff_mid.m_end.abs(), ef_ss_mid.m_end.abs());
}

// ================================================================
// 2. Spring Stiffness Effect: Parametric Study
// ================================================================
//
// Beam with rotational spring at one end under UDL.
// As ktheta increases from 0 to infinity, the end moment
// increases from 0 (pin) toward qL^2/8 (propped cantilever fixed end).
// For a propped cantilever with rotational spring at the "fixed" end:
//   M_end = (qL^2/8) * r/(r+3) where r = ktheta*L/(EI)

#[test]
fn validation_sr_ext_2_spring_stiffness_effect() {
    let l: f64 = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let q_abs: f64 = q.abs();
    let m_fixed_ref: f64 = q_abs * l.powi(2) / 8.0;

    let stiffnesses: Vec<f64> = vec![1e3, 1e4, 1e5, 1e6, 1e8];

    let mut prev_moment: f64 = 0.0;
    for &k_theta in &stiffnesses {
        let loads: Vec<SolverLoad> = (1..=n).map(|i| SolverLoad::Distributed(
            SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            })).collect();

        let input = make_semirigid_beam(n, l, Some(k_theta), None, loads);
        let results = linear::solve_2d(&input).unwrap();

        let ef1 = results.element_forces.iter()
            .find(|e| e.element_id == 1).unwrap();
        let m_spring: f64 = ef1.m_start.abs();

        // Moment should increase with stiffness (monotonically)
        assert!(m_spring >= prev_moment * 0.99,
            "k={:.0e}: M={:.4} should be >= prev M={:.4}", k_theta, m_spring, prev_moment);
        prev_moment = m_spring;

        // Analytical: M = M_fixed_ref * r/(r+3) where r = k_theta*L/(EI)
        let r: f64 = k_theta * l / (e_eff * IZ);
        let m_analytical: f64 = m_fixed_ref * r / (r + 3.0);

        assert_close(m_spring, m_analytical, 0.08,
            &format!("k={:.0e}: M_spring vs analytical", k_theta));
    }
}

// ================================================================
// 3. EC3-1-8 Classification: Pinned, Semi-Rigid, Rigid Zones
// ================================================================
//
// EC3-1-8 section 5.2.2 classifies joints by their initial stiffness:
//   - Nominally pinned: Sj,ini < 0.5 EI/L
//   - Semi-rigid: 0.5 EI/L <= Sj,ini < 25 EI/L (for braced frames)
//   - Rigid: Sj,ini >= 25 EI/L (for braced frames)
//
// Test that the structural response transitions correctly across zones.

#[test]
fn validation_sr_ext_3_ec3_classification() {
    let l: f64 = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let ei: f64 = e_eff * IZ;

    let loads_fn = || -> Vec<SolverLoad> {
        (1..=n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        })).collect()
    };

    // Pure SS beam (pinned reference)
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_fn());
    let res_ss = linear::solve_2d(&input_ss).unwrap();
    let mid_node = n / 2 + 1;
    let d_pinned: f64 = res_ss.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Nominally pinned zone: k = 0.1 * EI/L (well below boundary)
    let k_nom_pin: f64 = 0.1 * ei / l;
    let input_np = make_semirigid_beam(n, l, Some(k_nom_pin), Some(k_nom_pin), loads_fn());
    let res_np = linear::solve_2d(&input_np).unwrap();
    let d_nom_pin: f64 = res_np.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Semi-rigid zone: k = 5 * EI/L (between boundaries)
    let k_semi: f64 = 5.0 * ei / l;
    let input_sr = make_semirigid_beam(n, l, Some(k_semi), Some(k_semi), loads_fn());
    let res_sr = linear::solve_2d(&input_sr).unwrap();
    let d_semi: f64 = res_sr.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Rigid zone: k = 100 * EI/L (well above boundary)
    let k_rigid: f64 = 100.0 * ei / l;
    let input_rig = make_semirigid_beam(n, l, Some(k_rigid), Some(k_rigid), loads_fn());
    let res_rig = linear::solve_2d(&input_rig).unwrap();
    let d_rigid: f64 = res_rig.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Fixed-fixed reference
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_fn());
    let res_ff = linear::solve_2d(&input_ff).unwrap();
    let d_fixed: f64 = res_ff.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Nominally pinned should be close to pure SS
    let ratio_pin: f64 = d_nom_pin / d_pinned;
    assert!(ratio_pin > 0.85 && ratio_pin < 1.01,
        "Nominally pinned approx SS: ratio={:.4}", ratio_pin);

    // Semi-rigid should be between SS and fixed
    assert!(d_semi < d_pinned && d_semi > d_fixed,
        "Semi-rigid between SS and fixed: d_semi={:.6e}, d_ss={:.6e}, d_ff={:.6e}",
        d_semi, d_pinned, d_fixed);

    // Rigid should be close to fixed-fixed
    let ratio_rig: f64 = d_rigid / d_fixed;
    assert!(ratio_rig < 1.15,
        "Rigid zone approx fixed: ratio={:.4}", ratio_rig);

    // Monotonic decrease: d_pinned > d_nom_pin > d_semi > d_rigid
    assert!(d_pinned >= d_nom_pin,
        "d_pinned >= d_nom_pin: {:.6e} >= {:.6e}", d_pinned, d_nom_pin);
    assert!(d_nom_pin > d_semi,
        "d_nom_pin > d_semi: {:.6e} > {:.6e}", d_nom_pin, d_semi);
    assert!(d_semi > d_rigid,
        "d_semi > d_rigid: {:.6e} > {:.6e}", d_semi, d_rigid);
}

// ================================================================
// 4. Portal Frame Sway with Semi-Rigid Base Connections
// ================================================================
//
// Portal frame under lateral load with varying base fixity.
// Fixed bases give least sway, pinned bases give most sway,
// and rotational springs at the bases give intermediate sway.
// This models semi-rigid base plate connections per EC3-1-8.

#[test]
fn validation_sr_ext_4_portal_sway_semi_rigid() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let f: f64 = 10.0;
    let e_eff: f64 = E * 1000.0;

    let ei: f64 = e_eff * IZ;
    let k_semi: f64 = 10.0 * ei / h;  // semi-rigid base spring

    // Rigid portal (fixed bases)
    let input_rigid = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let res_rigid = linear::solve_2d(&input_rigid).unwrap();
    let sway_rigid: f64 = res_rigid.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Pinned base portal
    let input_pinned = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })],
    );
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();
    let sway_pinned: f64 = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Semi-rigid base portal: pinned bases + rotational springs
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 0.0, z: h });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: w, z: h });
    nodes.insert("4".to_string(), SolverNode { id: 4, x: w, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(), node_i: 3, node_j: 4,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    // Pinned bases with rotational springs (semi-rigid base plates)
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_semi),
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_semi),
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f, fz: 0.0, my: 0.0,
    })];

    let input_semi = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let res_semi = linear::solve_2d(&input_semi).unwrap();
    let sway_semi: f64 = res_semi.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Fixed base gives least sway
    assert!(sway_rigid < sway_pinned,
        "Fixed base sway < pinned base: {:.6e} < {:.6e}", sway_rigid, sway_pinned);

    // Semi-rigid should be between fixed and pinned
    assert!(sway_semi > sway_rigid,
        "Semi-rigid sway > fixed: {:.6e} > {:.6e}", sway_semi, sway_rigid);
    assert!(sway_semi < sway_pinned,
        "Semi-rigid sway < pinned: {:.6e} < {:.6e}", sway_semi, sway_pinned);

    // Equilibrium check
    let sum_rx: f64 = res_semi.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Semi-rigid portal: horizontal equilibrium");
}

// ================================================================
// 5. Moment Redistribution with Semi-Rigid End Supports
// ================================================================
//
// Single-span beam with UDL and rotational springs at both ends.
// As spring stiffness increases from 0 (SS) to infinity (fixed-fixed),
// the end moments increase and midspan moment decreases.
// Verify that the sum of midspan + end moments equals qL^2/8
// (parabolic moment from statics is conserved).

#[test]
fn validation_sr_ext_5_moment_redistribution() {
    let l: f64 = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let ei: f64 = e_eff * IZ;
    let q_abs: f64 = q.abs();
    let m_ss_mid: f64 = q_abs * l.powi(2) / 8.0;  // SS beam midspan moment

    let loads_fn = || -> Vec<SolverLoad> {
        (1..=n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        })).collect()
    };

    // Test several spring stiffnesses
    let stiffnesses: Vec<f64> = vec![0.5 * ei / l, 5.0 * ei / l, 50.0 * ei / l];

    for &k_theta in &stiffnesses {
        let input = make_semirigid_beam(n, l, Some(k_theta), Some(k_theta), loads_fn());
        let results = linear::solve_2d(&input).unwrap();

        // End moment at start
        let ef1 = results.element_forces.iter()
            .find(|e| e.element_id == 1).unwrap();
        let m_end: f64 = ef1.m_start.abs();

        // Midspan moment (from element at midspan)
        let mid_elem = n / 2;
        let ef_mid = results.element_forces.iter()
            .find(|e| e.element_id == mid_elem).unwrap();
        let m_mid: f64 = ef_mid.m_end.abs();

        // The static moment at midspan is qL^2/8. With end moments M_e,
        // the midspan moment = qL^2/8 - M_e (for symmetric loading and supports).
        // So m_mid + m_end should approximately equal qL^2/8.
        let m_total: f64 = m_mid + m_end;
        assert_close(m_total, m_ss_mid, 0.08,
            &format!("k={:.0e}: M_mid + M_end = qL^2/8", k_theta));

        // End moment should be positive (spring provides restraint)
        assert!(m_end > 0.1,
            "k={:.0e}: End moment should be > 0: {:.4}", k_theta, m_end);

        // Equilibrium
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert_close(sum_ry, q_abs * l, 0.02,
            &format!("k={:.0e}: vertical equilibrium", k_theta));
    }

    // Check that higher stiffness gives larger end moment
    let k_low: f64 = 1.0 * ei / l;
    let k_high: f64 = 50.0 * ei / l;
    let input_low = make_semirigid_beam(n, l, Some(k_low), Some(k_low), loads_fn());
    let input_high = make_semirigid_beam(n, l, Some(k_high), Some(k_high), loads_fn());
    let res_low = linear::solve_2d(&input_low).unwrap();
    let res_high = linear::solve_2d(&input_high).unwrap();
    let m_end_low: f64 = res_low.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().m_start.abs();
    let m_end_high: f64 = res_high.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().m_start.abs();
    assert!(m_end_high > m_end_low,
        "Higher k -> larger end moment: {:.4} > {:.4}", m_end_high, m_end_low);
}

// ================================================================
// 6. Connection Rotation = M/ktheta
// ================================================================
//
// For a beam with rotational spring at one end under UDL:
// The rotation at the spring = M_spring / k_theta.
// Verify this relationship from solver output.

#[test]
fn validation_sr_ext_6_connection_rotation() {
    let l: f64 = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let k_theta: f64 = 5e4;  // kN*m/rad

    // Beam: pinned with rotational spring at start, roller at end, UDL
    let loads: Vec<SolverLoad> = (1..=n).map(|i| SolverLoad::Distributed(
        SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        })).collect();

    let input = make_semirigid_beam(n, l, Some(k_theta), None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Get rotation at the spring node (node 1)
    let disp_1 = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let theta: f64 = disp_1.ry.abs();

    // Get moment at the spring from element forces
    let ef1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_spring: f64 = ef1.m_start.abs();

    // Verify moment is significant (UDL creates end moments with spring)
    assert!(m_spring > 1.0,
        "Spring moment should be significant: {:.4}", m_spring);

    // Connection rotation relationship: theta = M / k_theta
    let theta_expected: f64 = m_spring / k_theta;

    assert_close(theta, theta_expected, 0.05,
        "Connection rotation: theta = M/k_theta");

    // Equilibrium
    let q_abs: f64 = q.abs();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q_abs * l, 0.02, "Connection rotation: vertical equilibrium");
}

// ================================================================
// 7. Effective Length Factor Changes with Connection Stiffness
// ================================================================
//
// A column's lateral stiffness depends on the base connection rigidity.
// Fixed base: cantilever stiffness = 3EI/h^3
// Pinned base with beam: much more flexible
// Semi-rigid base (pinned + rotational spring): intermediate
//
// We test a cantilever column with varying base rotational spring
// stiffness under a lateral tip load.

#[test]
fn validation_sr_ext_7_effective_length() {
    let h: f64 = 4.0;
    let n = 4;
    let f: f64 = 1.0;  // unit lateral load at tip
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    let elem_len: f64 = h / n as f64;

    // Case 1: Fixed base cantilever
    // Build as vertical column along Y-axis: nodes at (0,0), (0,h/n), ..., (0,h)
    let input_fixed = make_input(
        (0..=n).map(|i| (i + 1, 0.0, i as f64 * elem_len)).collect(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect(),
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f, fz: 0.0, my: 0.0,
        })],
    );
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let sway_fixed: f64 = res_fixed.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux.abs();

    // Analytical: delta = F*h^3/(3EI) for fixed-base cantilever
    let delta_cantilever: f64 = f * h.powi(3) / (3.0 * ei);
    assert_close(sway_fixed, delta_cantilever, 0.05,
        "Fixed base cantilever: delta = Fh^3/(3EI)");

    // Case 2: Pinned base (no rotational restraint) - pure pin cannot resist lateral load
    // alone as a column, so we use a very soft spring as "pinned"
    let k_soft: f64 = 0.01 * ei / h;
    let mut nodes = HashMap::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: 0.0, z: i as f64 * elem_len,
        });
    }
    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups_soft = HashMap::new();
    sups_soft.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_soft),
        dx: None, dz: None, dry: None, angle: None,
    });
    let input_soft = SolverInput {
        nodes: nodes.clone(), materials: mats.clone(), sections: secs.clone(),
        elements: elems.clone(),
        supports: sups_soft,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f, fz: 0.0, my: 0.0,
        })], constraints: vec![],
        connectors: HashMap::new(), };
    let res_soft = linear::solve_2d(&input_soft).unwrap();
    let sway_soft: f64 = res_soft.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux.abs();

    // Case 3: Semi-rigid base (moderate rotational spring)
    let k_semi: f64 = 10.0 * ei / h;
    let mut sups_semi = HashMap::new();
    sups_semi.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_semi),
        dx: None, dz: None, dry: None, angle: None,
    });
    let input_semi = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups_semi,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f, fz: 0.0, my: 0.0,
        })], constraints: vec![],
        connectors: HashMap::new(), };
    let res_semi = linear::solve_2d(&input_semi).unwrap();
    let sway_semi: f64 = res_semi.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux.abs();

    // Fixed base gives least sway
    assert!(sway_fixed < sway_semi,
        "Fixed sway < semi-rigid: {:.6e} < {:.6e}", sway_fixed, sway_semi);

    // Semi-rigid gives less sway than soft spring
    assert!(sway_semi < sway_soft,
        "Semi-rigid sway < soft: {:.6e} < {:.6e}", sway_semi, sway_soft);

    // Effective stiffness ordering
    let k_eff_fixed: f64 = f / sway_fixed;
    let k_eff_semi: f64 = f / sway_semi;
    let k_eff_soft: f64 = f / sway_soft;

    assert!(k_eff_fixed > k_eff_semi && k_eff_semi > k_eff_soft,
        "Stiffness ordering: fixed({:.4}) > semi({:.4}) > soft({:.4})",
        k_eff_fixed, k_eff_semi, k_eff_soft);
}

// ================================================================
// 8. Fixity Factor = 1/(1 + 3EI/(ktheta*L))
// ================================================================
//
// The fixity factor gamma measures the degree of moment fixity:
//   gamma = 1/(1 + 3*EI/(k_theta*L))
//   gamma = 0 for a pin (k_theta = 0)
//   gamma = 1 for a rigid connection (k_theta = infinity)
//
// For a propped cantilever (one end with rotational spring, other roller)
// under UDL, the end moment at the spring end is:
//   M_end = (qL^2/8) * r/(r+3) where r = k_theta*L/(EI)
// This is equivalent to M_end = gamma * M_fixed where M_fixed = qL^2/8.
//
// We verify by comparing the ratio of end moments for different spring
// stiffnesses against the analytical fixity factor.

#[test]
fn validation_sr_ext_8_fixity_factor() {
    let l: f64 = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    let q_abs: f64 = q.abs();
    let m_fixed_ref: f64 = q_abs * l.powi(2) / 8.0;  // propped cantilever end moment

    let loads_fn = || -> Vec<SolverLoad> {
        (1..=n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        })).collect()
    };

    // Reference: propped cantilever (fixed-roller) end moment
    let input_fixed = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_fn());
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let m_fixed: f64 = res_fixed.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    // Verify propped cantilever end moment = qL^2/8
    assert_close(m_fixed, m_fixed_ref, 0.05,
        "Propped cantilever: M_fixed = qL^2/8");

    // Test fixity factors at different spring stiffnesses
    let test_cases: Vec<f64> = vec![1e3, 5e3, 1e4, 5e4, 1e5, 1e6, 1e8];

    for &k_theta in &test_cases {
        let input = make_semirigid_beam(n, l, Some(k_theta), None, loads_fn());
        let results = linear::solve_2d(&input).unwrap();

        let ef1 = results.element_forces.iter()
            .find(|e| e.element_id == 1).unwrap();
        let m_spring: f64 = ef1.m_start.abs();

        // Analytical fixity factor
        let gamma: f64 = 1.0 / (1.0 + 3.0 * ei / (k_theta * l));

        // Moment ratio should match the fixity factor
        let moment_ratio: f64 = m_spring / m_fixed.max(1e-12);

        assert!(gamma >= 0.0 && gamma <= 1.0,
            "k={:.0e}: gamma={:.6} should be in [0,1]", k_theta, gamma);
        assert!(moment_ratio >= 0.0 && moment_ratio <= 1.05,
            "k={:.0e}: M_ratio={:.6} should be in [0,1]", k_theta, moment_ratio);

        // The moment ratio should be close to the fixity factor
        let diff: f64 = (moment_ratio - gamma).abs();
        assert!(diff < 0.10,
            "k={:.0e}: fixity factor gamma={:.4}, moment_ratio={:.4}, diff={:.4}",
            k_theta, gamma, moment_ratio, diff);
    }

    // Verify extreme: very stiff spring -> gamma ~ 1 -> moment ~ m_fixed
    let k_very_stiff: f64 = 1e10;
    let input_stiff = make_semirigid_beam(n, l, Some(k_very_stiff), None, loads_fn());
    let res_stiff = linear::solve_2d(&input_stiff).unwrap();
    let ef1_stiff = res_stiff.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_stiff: f64 = ef1_stiff.m_start.abs();
    assert_close(m_stiff, m_fixed, 0.05, "Very stiff spring approx fixed end");
}
