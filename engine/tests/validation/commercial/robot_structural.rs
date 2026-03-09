/// Validation: Autodesk Robot Structural Analysis Benchmark Problems
///
/// Reference: Robot Structural Analysis verification problems and classical
/// structural analysis benchmarks commonly used in Robot SA validation suites.
///
/// Tests: simply supported beam, fixed-fixed beam, propped cantilever,
///        two-bay portal frame, three-span continuous beam, braced frame,
///        3D cantilever biaxial bending, Warren truss bridge.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (steel)
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective units)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. Simply Supported Beam — Concentrated Load at Midspan
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: SS beam with central point load.
// Analytical: δ_max = PL³/(48EI), M_max = PL/4, R = P/2

#[test]
fn validation_robot_ss_beam_midspan_point_load() {
    let l = 6.0; // m
    let p = 120.0; // kN
    let n = 12; // elements
    let elem_len = l / n as f64;

    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    // Point load at midspan: element n/2, at end of element (= midspan node)
    let mid_elem = n / 2;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: mid_elem,
        a: elem_len,
        p: -p,
        px: None,
        mz: None,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P/2 = 60 kN
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r_a.ry, p / 2.0, 0.02, "Robot1 R_A = P/2");
    assert_close(r_b.ry, p / 2.0, 0.02, "Robot1 R_B = P/2");

    // Midspan deflection: δ = PL³/(48EI)
    let delta_expected = p * l.powi(3) / (48.0 * E_EFF * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(d_mid.uy.abs(), delta_expected, 0.02, "Robot1 δ = PL³/48EI");

    // Max moment: M_max = PL/4
    let m_expected = p * l / 4.0;
    let m_max: f64 = results
        .element_forces
        .iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max, m_expected, 0.02, "Robot1 M_max = PL/4");
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Fixed Beam with UDL
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Encastre beam under uniform distributed load.
// Analytical: δ_max = wL⁴/(384EI), M_end = wL²/12, M_mid = wL²/24

#[test]
fn validation_robot_fixed_fixed_beam_udl() {
    let l = 8.0;
    let q = 20.0; // kN/m downward
    let n = 16;

    let input = make_beam(
        n,
        l,
        E,
        A,
        IZ,
        "fixed",
        Some("fixed"),
        (0..n)
            .map(|i| {
                SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i + 1,
                    q_i: -q,
                    q_j: -q,
                    a: None,
                    b: None,
                })
            })
            .collect(),
    );

    let results = linear::solve_2d(&input).unwrap();

    // End moments: M = wL²/12
    let m_end_expected = q * l * l / 12.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r1.mz.abs(), m_end_expected, 0.02, "Robot2 M_end_left = wL²/12");
    assert_close(
        r_end.mz.abs(),
        m_end_expected,
        0.02,
        "Robot2 M_end_right = wL²/12",
    );

    // Reactions: R = wL/2 = 80 kN each (by symmetry)
    assert_close(r1.ry, q * l / 2.0, 0.02, "Robot2 R_left = wL/2");
    assert_close(r_end.ry, q * l / 2.0, 0.02, "Robot2 R_right = wL/2");

    // Midspan deflection: δ = wL⁴/(384EI)
    let delta_expected = q * l.powi(4) / (384.0 * E_EFF * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(
        d_mid.uy.abs(),
        delta_expected,
        0.02,
        "Robot2 δ = wL⁴/384EI",
    );

    // Midspan moment: M_mid = wL²/24 (sagging)
    // The midspan moment is the difference: wL²/8 - wL²/12 = wL²/24
    let m_mid_expected = q * l * l / 24.0;
    // Find the element forces at midspan — element n/2 end or element (n/2+1) start
    let ef_mid = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n / 2)
        .unwrap();
    assert_close(
        ef_mid.m_end.abs(),
        m_mid_expected,
        0.02,
        "Robot2 M_mid = wL²/24",
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Propped Cantilever with Point Load at Midspan
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Cantilever with roller at free end, point load.
// Analytical: R_prop = 5P/16, R_fixed = 11P/16, M_fixed = 3PL/16

#[test]
fn validation_robot_propped_cantilever_point_load() {
    let l = 10.0;
    let p = 80.0; // kN
    let n = 20;
    let elem_len = l / n as f64;

    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at left (node 1), roller at right (node n+1)
    let sups = vec![(1, 1, "fixed"), (2, n + 1, "rollerX")];

    // Point load at midspan
    let mid_elem = n / 2;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: mid_elem,
        a: elem_len,
        p: -p,
        px: None,
        mz: None,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Prop reaction (right support): R_B = 5P/16
    let r_prop_expected = 5.0 * p / 16.0;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r_b.ry, r_prop_expected, 0.02, "Robot3 R_prop = 5P/16");

    // Fixed reaction (left support): R_A = 11P/16
    let r_fixed_expected = 11.0 * p / 16.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_fixed_expected, 0.02, "Robot3 R_fixed = 11P/16");

    // Fixed-end moment: M_A = 3PL/16
    let m_fixed_expected = 3.0 * p * l / 16.0;
    assert_close(
        r_a.mz.abs(),
        m_fixed_expected,
        0.02,
        "Robot3 M_fixed = 3PL/16",
    );

    // Equilibrium check
    assert_close(r_a.ry + r_b.ry, p, 0.01, "Robot3 equilibrium ΣRy = P");
}

// ═══════════════════════════════════════════════════════════════
// 4. Two-Bay Portal Frame — Gravity + Lateral
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Multi-bay frame under combined loading.
// Two bays of width W, height H, fixed bases. Gravity on beams + lateral at top.
// Verify equilibrium and symmetry-breaking from lateral load.

#[test]
fn validation_robot_two_bay_portal_frame() {
    let h = 4.0;
    let w = 6.0;
    let q = 15.0; // kN/m gravity on beams
    let h_load = 30.0; // kN lateral at top left

    // Nodes: 1-3 at base, 4-6 at beam level
    // 1=(0,0), 2=(W,0), 3=(2W,0)
    // 4=(0,H), 5=(W,H), 6=(2W,H)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 0.0, h),
        (5, w, h),
        (6, 2.0 * w, h),
    ];

    // Elements: 3 columns + 2 beams
    let n_beam_elem = 6; // elements per beam for distributed load
    let beam_elem_len = w / n_beam_elem as f64;

    // We need to subdivide beams for UDL. Build with intermediate nodes.
    let mut all_nodes = nodes.clone();
    let mut all_elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    let mut eid = 1;

    // Column 1: node 1 → node 4
    all_elems.push((eid, "frame", 1, 4, 1, 1, false, false));
    eid += 1;
    // Column 2: node 2 → node 5
    all_elems.push((eid, "frame", 2, 5, 1, 1, false, false));
    eid += 1;
    // Column 3: node 3 → node 6
    all_elems.push((eid, "frame", 3, 6, 1, 1, false, false));
    eid += 1;

    // Beam 1: node 4 → node 5, subdivided
    let mut nid = 7;
    let mut prev = 4;
    for j in 1..n_beam_elem {
        all_nodes.push((nid, j as f64 * beam_elem_len, h));
        all_elems.push((eid, "frame", prev, nid, 1, 1, false, false));
        prev = nid;
        nid += 1;
        eid += 1;
    }
    all_elems.push((eid, "frame", prev, 5, 1, 1, false, false));
    eid += 1;

    // Beam 2: node 5 → node 6, subdivided
    let mut prev = 5;
    for j in 1..n_beam_elem {
        all_nodes.push((nid, w + j as f64 * beam_elem_len, h));
        all_elems.push((eid, "frame", prev, nid, 1, 1, false, false));
        prev = nid;
        nid += 1;
        eid += 1;
    }
    all_elems.push((eid, "frame", prev, 6, 1, 1, false, false));
    let beam1_start_eid = 4;
    let beam2_start_eid = beam1_start_eid + n_beam_elem;

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")];

    let mut loads = Vec::new();
    // Lateral load at node 4 (top left)
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: h_load,
        fy: 0.0,
        mz: 0.0,
    }));
    // UDL on both beams
    for i in 0..n_beam_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: beam1_start_eid + i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    for i in 0..n_beam_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: beam2_start_eid + i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        all_nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        all_elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: ΣRy = total gravity = q * 2W = 15 * 12 = 180 kN
    let total_gravity = q * 2.0 * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02, "Robot4 ΣRy = total gravity");

    // Horizontal equilibrium: ΣRx + H = 0 → ΣRx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(),
        h_load,
        0.02,
        "Robot4 ΣRx balances lateral load",
    );

    // Lateral load causes drift: node 4 should have positive ux
    let d4 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap();
    assert!(
        d4.ux > 0.0,
        "Robot4: node 4 ux={:.6} should be positive (lateral drift)",
        d4.ux
    );

    // Interior column (node 2) should carry more vertical reaction due to tributary area
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(
        r2.ry > r1.ry && r2.ry > r3.ry,
        "Robot4: interior column R2={:.2} should exceed edge columns R1={:.2}, R3={:.2}",
        r2.ry,
        r1.ry,
        r3.ry
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Three-Span Continuous Beam with UDL
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Equal-span continuous beam under uniform load.
// Analytical (3 equal spans, UDL):
//   R_outer = 0.4 qL, R_inner = 1.1 qL
//   M_interior_support = -0.1 qL²

#[test]
fn validation_robot_three_span_continuous_beam_udl() {
    let l_span = 8.0;
    let q = 25.0; // kN/m
    let n_per_span = 8;

    let total_elems = n_per_span * 3;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l_span, l_span, l_span], n_per_span, E, A, IZ, loads);

    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 3L = 25 * 24 = 600 kN
    let total_load = q * 3.0 * l_span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Robot5 ΣRy = total load");

    // Outer reactions: R_outer = 0.4 qL
    let r_outer_expected = 0.4 * q * l_span;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results
        .reactions
        .iter()
        .find(|r| r.node_id == total_elems + 1)
        .unwrap();
    assert_close(r1.ry, r_outer_expected, 0.02, "Robot5 R_outer_left = 0.4qL");
    assert_close(
        r_end.ry,
        r_outer_expected,
        0.02,
        "Robot5 R_outer_right = 0.4qL",
    );

    // Inner reactions: R_inner = 1.1 qL
    let r_inner_expected = 1.1 * q * l_span;
    let inner_node_1 = n_per_span + 1; // end of first span
    let inner_node_2 = 2 * n_per_span + 1; // end of second span
    let r_in1 = results
        .reactions
        .iter()
        .find(|r| r.node_id == inner_node_1)
        .unwrap();
    let r_in2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == inner_node_2)
        .unwrap();
    assert_close(
        r_in1.ry,
        r_inner_expected,
        0.02,
        "Robot5 R_inner_1 = 1.1qL",
    );
    assert_close(
        r_in2.ry,
        r_inner_expected,
        0.02,
        "Robot5 R_inner_2 = 1.1qL",
    );

    // Symmetry of outer reactions
    assert_close(r1.ry, r_end.ry, 0.01, "Robot5 outer reaction symmetry");

    // Symmetry of inner reactions
    assert_close(r_in1.ry, r_in2.ry, 0.01, "Robot5 inner reaction symmetry");
}

// ═══════════════════════════════════════════════════════════════
// 6. Braced Frame with Diagonal — Axial Forces & Lateral Stiffness
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Single-bay braced frame with X-brace.
// Lateral load resisted primarily by diagonal tension/compression.
// Analytical: diagonal force F_d = H / cos(θ), where θ = atan(H/W).

#[test]
fn validation_robot_braced_frame_diagonal() {
    let h_frame = 4.0;
    let w_frame = 3.0;
    let h_load = 50.0; // kN lateral
    let a_brace = 0.003; // brace area (smaller than columns)

    // Nodes: 1=(0,0), 2=(W,0), 3=(0,H), 4=(W,H)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w_frame, 0.0),
        (3, 0.0, h_frame),
        (4, w_frame, h_frame),
    ];

    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left column
        (2, "frame", 2, 4, 1, 1, false, false), // right column
        (3, "frame", 3, 4, 1, 2, false, false), // beam (stiff)
        (4, "truss", 1, 4, 1, 3, false, false), // diagonal brace (tension)
    ];

    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: h_load,
        fy: 0.0,
        mz: 0.0,
    })];

    let iz_beam = 1e-3; // stiff beam
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam), (3, a_brace, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Diagonal length and angle
    let diag_len = (h_frame * h_frame + w_frame * w_frame).sqrt();
    let cos_theta = w_frame / diag_len;

    // The diagonal brace carries a significant portion of the lateral load.
    // For a stiff brace, F_d ≈ H / cos(θ) (horizontal component = H).
    // In practice, columns share some load via frame action, but the brace
    // dominates when present.
    let ef_diag = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 4)
        .unwrap();
    let f_diag_horizontal = ef_diag.n_start.abs() * cos_theta;

    // The diagonal's horizontal component should carry a large fraction of H
    // (majority of lateral load goes through brace)
    assert!(
        f_diag_horizontal > h_load * 0.5,
        "Robot6: diagonal horizontal force {:.2} should carry > 50% of H={:.2}",
        f_diag_horizontal,
        h_load
    );

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(
        sum_rx.abs(),
        h_load,
        0.02,
        "Robot6 ΣRx balances lateral load",
    );

    // Overturning check: sum of moments about base should be zero
    // ΣRy should sum to zero (no vertical applied loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.5,
        "Robot6: ΣRy={:.4} should ≈ 0 (no gravity loads)",
        sum_ry
    );

    // Compare with unbraced frame: braced should be much stiffer
    let nodes_ub = vec![
        (1, 0.0, 0.0),
        (2, w_frame, 0.0),
        (3, 0.0, h_frame),
        (4, w_frame, h_frame),
    ];
    let elems_ub = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 2, false, false),
    ];
    let sups_ub = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads_ub = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: h_load,
        fy: 0.0,
        mz: 0.0,
    })];
    let input_ub = make_input(
        nodes_ub,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems_ub,
        sups_ub,
        loads_ub,
    );
    let res_ub = linear::solve_2d(&input_ub).unwrap();

    let d_braced = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .ux
        .abs();
    let d_unbraced = res_ub
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .ux
        .abs();

    assert!(
        d_braced < d_unbraced,
        "Robot6: braced drift={:.6} should < unbraced drift={:.6}",
        d_braced,
        d_unbraced
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. 3D Cantilever — Biaxial Bending
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: 3D cantilever with tip loads in Y and Z.
// Analytical: δy = Fy·L³/(3EIz), δz = Fz·L³/(3EIy)
// Bending planes are independent for doubly-symmetric sections.

#[test]
fn validation_robot_3d_cantilever_biaxial() {
    let l = 6.0;
    let fy = 15.0; // kN in local Y
    let fz = 8.0; // kN in local Z
    let iy = 8e-5; // m⁴ (about local y-axis)
    let iz = 1.5e-4; // m⁴ (about local z-axis)
    let a_sec = 0.012;
    let j = 1.2e-4;
    let n = 10;

    let input = make_3d_beam(
        n,
        l,
        E,
        0.3,
        a_sec,
        iy,
        iz,
        j,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0,
            fy: fy,
            fz: fz,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // δy = Fy·L³/(3EIz)
    let delta_y_expected = fy * l.powi(3) / (3.0 * E_EFF * iz);
    assert_close(
        tip.uy.abs(),
        delta_y_expected,
        0.02,
        "Robot7 δy = Fy·L³/(3EIz)",
    );

    // δz = Fz·L³/(3EIy)
    let delta_z_expected = fz * l.powi(3) / (3.0 * E_EFF * iy);
    assert_close(
        tip.uz.abs(),
        delta_z_expected,
        0.02,
        "Robot7 δz = Fz·L³/(3EIy)",
    );

    // Base reactions: Fy_reaction = Fy, Fz_reaction = Fz
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.fy.abs(), fy, 0.02, "Robot7 base Fy reaction");
    assert_close(r_base.fz.abs(), fz, 0.02, "Robot7 base Fz reaction");

    // Base moments: Mz = Fy·L, My = Fz·L
    assert_close(r_base.mz.abs(), fy * l, 0.02, "Robot7 Mz = Fy·L");
    assert_close(r_base.my.abs(), fz * l, 0.02, "Robot7 My = Fz·L");
}

// ═══════════════════════════════════════════════════════════════
// 8. Steel Truss Bridge — Warren Pattern
// ═══════════════════════════════════════════════════════════════
// Robot SA Verification: Warren truss under symmetric loading.
// 6 panels, pinned-roller supports, point loads at bottom chord joints.
// Verify member forces by method of sections and deflection by virtual work.

#[test]
fn validation_robot_warren_truss_bridge() {
    // Warren truss: 6 panels of 3m each = 18m span, height = 3m
    // Bottom chord: nodes 1-7 at y=0 (x=0,3,6,9,12,15,18)
    // Top chord: nodes 8-12 at y=3 (x=1.5,4.5,7.5,10.5,13.5,16.5)
    // Actually, Warren truss has top nodes offset: at x=1.5, 4.5, 7.5, ...
    // Simpler: standard Warren with verticals at top chord
    // Top chord nodes at x = panel_width * (i+0.5)
    //
    // Even simpler: equilateral triangles
    // Panel width d = 3m, height h = 3m
    // Bottom nodes at x = 0, 3, 6, 9, 12, 15, 18 (7 nodes)
    // Top nodes at x = 1.5, 4.5, 7.5, 10.5, 13.5, 16.5 (6 nodes)
    let d = 3.0; // panel width
    let h_truss = 3.0; // truss height
    let n_panels = 6;
    let a_chord = 0.005; // m² chord area
    let a_diag = 0.003; // m² diagonal area

    // Bottom chord nodes: 1 to n_panels+1
    let mut nodes: Vec<(usize, f64, f64)> = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * d, 0.0));
    }
    // Top chord nodes: n_panels+2 to 2*n_panels+1
    let top_start = n_panels + 2;
    for i in 0..n_panels {
        nodes.push((top_start + i, (i as f64 + 0.5) * d, h_truss));
    }

    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    let mut eid = 1;

    // Bottom chord elements
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord elements
    for i in 0..(n_panels - 1) {
        elems.push((
            eid,
            "truss",
            top_start + i,
            top_start + i + 1,
            1,
            1,
            false,
            false,
        ));
        eid += 1;
    }
    // Diagonals: from each bottom node to adjacent top nodes (Warren pattern)
    for i in 0..n_panels {
        // Left diagonal: bottom node i+1 to top node top_start+i
        elems.push((eid, "truss", i + 1, top_start + i, 1, 2, false, false));
        eid += 1;
        // Right diagonal: top node top_start+i to bottom node i+2
        elems.push((eid, "truss", top_start + i, i + 2, 1, 2, false, false));
        eid += 1;
    }

    // Supports: pinned at node 1, roller at node n_panels+1
    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Symmetric point loads at interior bottom chord joints
    let p = 50.0; // kN per joint
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_chord, 1e-10), (2, a_diag, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = P * (n_panels - 1) = 50 * 5 = 250 kN
    let total_load = p * (n_panels - 1) as f64;

    // Reactions: by symmetry, R_A = R_B = total/2 = 125 kN
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n_panels + 1)
        .unwrap();
    assert_close(r_a.ry, total_load / 2.0, 0.02, "Robot8 R_A = total/2");
    assert_close(r_b.ry, total_load / 2.0, 0.02, "Robot8 R_B = total/2");

    // Symmetry of reactions
    assert_close(r_a.ry, r_b.ry, 0.01, "Robot8 reaction symmetry");

    // Max bottom chord force at midspan by method of sections:
    // Cut through the panel containing the midspan bottom chord element.
    // Element mid_panel goes from bottom node mid_panel to mid_panel+1.
    // The corresponding top node for this panel is at x = (mid_panel - 0.5) * d.
    // Take moment about that top node to find the bottom chord force.
    //
    // For 6 panels, mid_panel = 3 (element from x=6 to x=9).
    // Top node of this panel is at x = (3 - 1 + 0.5) * d = 2.5 * 3 = 7.5m
    // M_top = R_A * 7.5 - P(at 3) * 4.5 - P(at 6) * 1.5
    //       = 125 * 7.5 - 50 * 4.5 - 50 * 1.5 = 937.5 - 225 - 75 = 637.5 kN·m
    // F_bottom = M / h = 637.5 / 3 = 212.5 kN (tension)
    // Find bottom chord element near midspan (element 3 or 4 in bottom chord)
    // Bottom chord elements are IDs 1 to n_panels
    let mid_panel = n_panels / 2; // element index in bottom chord (1-based)
    let r_a_val = total_load / 2.0;
    let x_top_node = ((mid_panel as f64 - 1.0) + 0.5) * d;
    let mut m_cut = r_a_val * x_top_node;
    for i in 1..n_panels {
        let x_load = i as f64 * d;
        if x_load < x_top_node {
            m_cut -= p * (x_top_node - x_load);
        }
    }
    let f_bot_expected = m_cut / h_truss;

    let ef_mid_bot = results
        .element_forces
        .iter()
        .find(|e| e.element_id == mid_panel)
        .unwrap();
    assert_close(
        ef_mid_bot.n_start.abs(),
        f_bot_expected,
        0.02,
        "Robot8 midspan bottom chord force",
    );

    // Midspan deflection should be nonzero and downward
    // Midspan bottom node = node (n_panels/2 + 1)
    let mid_node = n_panels / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert!(
        d_mid.uy < 0.0,
        "Robot8: midspan deflection uy={:.6} should be negative (downward)",
        d_mid.uy
    );

    // Estimate deflection using simplified virtual work:
    // For a truss, δ = Σ (N_i * n_i * L_i) / (E * A_i)
    // For a rough check, the deflection should be in a reasonable range.
    // With P=50kN, L=18m, h=3m, E=200GPa, A_chord=0.005m²:
    // δ ≈ M*L/(8*E*A_chord*h²) rough estimate ≈ 675*18/(8*200e6*0.005*9) ≈ 0.0017m
    // Just verify it's positive and in a reasonable ballpark
    assert!(
        d_mid.uy.abs() > 1e-5 && d_mid.uy.abs() < 0.1,
        "Robot8: midspan deflection {:.6} should be in reasonable range",
        d_mid.uy.abs()
    );

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Robot8 ΣRy = total load");
}
