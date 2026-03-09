/// Validation: Moment-Resisting Connections vs Hinged Connections in Frames
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed. (moment distribution, joint equilibrium)
///   - Ghali/Neville, "Structural Analysis" (portal frames, hinge effects)
///   - Hibbeler, "Structural Analysis", 10th Ed. (fixed vs SS beam deflection ratios)
///
/// Tests verify:
///   1. Rigid portal sways less than pinned beam-column portal
///   2. Moment at hinge is zero
///   3. Rigid joints transfer moment between members
///   4. Joint equilibrium: sum of moments at rigid joint = 0
///   5. More hinges = more flexibility (monotonic sway increase)
///   6. Fixed-fixed vs simply-supported beam: deflection ratio = 5
///   7. T-junction joint equilibrium
///   8. Stiffer beam attracts more moment at T-junction
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Rigid Portal vs Pinned Beam-Column Joints
// ================================================================
//
// Case 1: Fully rigid portal (make_portal_frame).
// Case 2: Same geometry but hinges at all beam-column joints.
// Pinned joints reduce stiffness -> larger sway.

#[test]
fn validation_rigid_vs_pinned_beam_column_sway() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Case 1: Rigid portal
    let rigid_input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let rigid_results = linear::solve_2d(&rigid_input).unwrap();
    let sway_rigid = rigid_results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    // Case 2: Pinned beam-column joints
    let pinned_input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // col left: hinge at top
            (2, "frame", 2, 3, 1, 1, true, true),    // beam: hinged both ends
            (3, "frame", 3, 4, 1, 1, true, false),   // col right: hinge at top
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: lateral,
            fy: 0.0,
            mz: 0.0,
        })],
    );
    let pinned_results = linear::solve_2d(&pinned_input).unwrap();
    let sway_pinned = pinned_results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    assert!(
        sway_pinned > sway_rigid,
        "Pinned sway ({:.6e}) should exceed rigid sway ({:.6e})",
        sway_pinned, sway_rigid
    );
}

// ================================================================
// 2. Moment at Hinge Is Zero
// ================================================================
//
// The beam element (elem 2) in the pinned portal has hinge_start=true
// and hinge_end=true. Both end moments must be approximately zero.

#[test]
fn validation_moment_at_hinge_is_zero() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: lateral,
            fy: 0.0,
            mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef_beam = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    assert!(
        ef_beam.m_start.abs() < 1e-6,
        "Beam hinge m_start should be ~0: {:.8}",
        ef_beam.m_start
    );
    assert!(
        ef_beam.m_end.abs() < 1e-6,
        "Beam hinge m_end should be ~0: {:.8}",
        ef_beam.m_end
    );
}

// ================================================================
// 3. Rigid Joint Transfers Moment
// ================================================================
//
// Rigid portal with distributed gravity load on the beam.
// Moment is transferred from beam to columns at rigid joints,
// so both m_end of column and m_start of beam are nonzero.

#[test]
fn validation_rigid_joint_transfers_moment() {
    let h = 4.0;
    let w = 6.0;

    // Apply UDL on beam (element 2) to create bending that transfers to columns
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2,
            q_i: -20.0,
            q_j: -20.0,
            a: None,
            b: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Column 1->2: m_end (at joint node 2)
    let ef_col = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert!(
        ef_col.m_end.abs() > 1e-3,
        "Rigid joint: column m_end should be nonzero: {:.6}",
        ef_col.m_end
    );

    // Beam 2->3: m_start (at joint node 2)
    let ef_beam = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    assert!(
        ef_beam.m_start.abs() > 1e-3,
        "Rigid joint: beam m_start should be nonzero: {:.6}",
        ef_beam.m_start
    );
}

// ================================================================
// 4. Joint Equilibrium: Sum of Moments = 0
// ================================================================
//
// Rigid portal with lateral load. At joint node 2 (no external moment):
//   Element 1 (col 1->2) has its j-end at node 2.
//   Element 2 (beam 2->3) has its i-end at node 2.
//
// In the solver's sign convention:
//   m_start = f_local[2] (raw moment at i-end)
//   m_end   = -f_local[5] (negated raw moment at j-end)
//
// Joint equilibrium in terms of stored values:
//   -m_end(col) + m_start(beam) = 0  (no applied moment at node 2)
// i.e., m_end(col) = m_start(beam) (moment continuity at rigid joint).

#[test]
fn validation_joint_equilibrium_sum_moments_zero() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let ef_col = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef_beam = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    // At node 2: joint equilibrium requires moment continuity.
    // The j-end contributes -m_end to the joint; the i-end contributes +m_start.
    // With no applied moment: -m_end(col) + m_start(beam) = 0
    let moment_balance = -ef_col.m_end + ef_beam.m_start;
    assert!(
        moment_balance.abs() < 1e-6,
        "Joint equilibrium at node 2: -m_end_col + m_start_beam = {:.8}, expected ~0",
        moment_balance
    );

    // Also verify at node 3: beam j-end + col i-end
    let ef_col_r = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    let moment_balance_3 = -ef_beam.m_end + ef_col_r.m_start;
    assert!(
        moment_balance_3.abs() < 1e-6,
        "Joint equilibrium at node 3: -m_end_beam + m_start_col_r = {:.8}, expected ~0",
        moment_balance_3
    );
}

// ================================================================
// 5. Hinge Count vs Flexibility
// ================================================================
//
// Portal h=4, w=6, H=10.
// Case A: 0 hinges (fully rigid)
// Case B: hinge at beam start only
// Case C: hinges at both beam ends
// Sway: A < B < C

#[test]
fn validation_hinge_count_vs_flexibility() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: lateral,
        fy: 0.0,
        mz: 0.0,
    })];

    // Case A: 0 hinges (fully rigid)
    let input_a = make_input(
        nodes.clone(),
        mats.clone(),
        secs.clone(),
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        sups.clone(),
        loads.clone(),
    );
    let sway_a = linear::solve_2d(&input_a)
        .unwrap()
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    // Case B: hinge at beam start only
    let input_b = make_input(
        nodes.clone(),
        mats.clone(),
        secs.clone(),
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, true, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        sups.clone(),
        loads.clone(),
    );
    let sway_b = linear::solve_2d(&input_b)
        .unwrap()
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    // Case C: hinges at both beam ends
    let input_c = make_input(
        nodes.clone(),
        mats.clone(),
        secs.clone(),
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, false),
        ],
        sups.clone(),
        loads.clone(),
    );
    let sway_c = linear::solve_2d(&input_c)
        .unwrap()
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    assert!(
        sway_a < sway_b,
        "0 hinges sway ({:.6e}) should be less than 1 hinge sway ({:.6e})",
        sway_a, sway_b
    );
    assert!(
        sway_b < sway_c,
        "1 hinge sway ({:.6e}) should be less than 2 hinges sway ({:.6e})",
        sway_b, sway_c
    );
}

// ================================================================
// 6. Fixed-Fixed vs Simply-Supported Beam: Deflection Ratio
// ================================================================
//
// Beam L=8, 4 elements, UDL q=-10.
// Fixed-fixed midspan deflection: delta_FF = qL^4 / (384 EI)
// Simply-supported midspan deflection: delta_SS = 5 qL^4 / (384 EI)
// Ratio: delta_SS / delta_FF = 5.0

#[test]
fn validation_fixed_vs_ss_deflection_ratio() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;

    let mut dist_loads = Vec::new();
    for i in 0..n {
        dist_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    // Fixed-fixed beam
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), dist_loads.clone());
    let results_ff = linear::solve_2d(&input_ff).unwrap();

    // Simply-supported beam (pinned + rollerX)
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), dist_loads.clone());
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Midspan node is node 3 (nodes: 1,2,3,4,5 for 4 elements)
    let mid_node = n / 2 + 1;
    let delta_ff = results_ff
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy
        .abs();
    let delta_ss = results_ss
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy
        .abs();

    let ratio = delta_ss / delta_ff;
    assert_close(ratio, 5.0, 0.02, "SS/FF deflection ratio");
}

// ================================================================
// 7. T-Junction Joint Equilibrium
// ================================================================
//
// Nodes: 1(0,0), 2(0,4), 3(4,4), 4(-4,4).
// Elements: 1(1->2), 2(2->3), 3(2->4). All rigid.
// Fixed at 1, rollerX at 3 and 4. Load fy=-20 at node 2.
// Joint equilibrium at node 2:
//   m_end(elem 1) + m_start(elem 2) + m_start(elem 3) = 0

#[test]
fn validation_t_junction_joint_equilibrium() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, 4.0),
        (3, 4.0, 4.0),
        (4, -4.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 2, 4, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
        (3, 4, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -20.0,
        mz: 0.0,
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

    let ef1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    let ef3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();

    // At node 2: joint equilibrium (no external moment applied).
    // Element 1 has its j-end at node 2: contributes -m_end to joint.
    // Elements 2,3 have their i-ends at node 2: contribute +m_start each.
    // Equilibrium: -m_end(1) + m_start(2) + m_start(3) = 0
    let moment_sum = -ef1.m_end + ef2.m_start + ef3.m_start;
    assert!(
        moment_sum.abs() < 1e-6,
        "T-junction joint equilibrium: -m_end(1) + m_start(2) + m_start(3) = {:.8}, expected ~0",
        moment_sum
    );
}

// ================================================================
// 8. Moment Distribution: Stiff vs Flexible Connecting Beams
// ================================================================
//
// T-junction from test 7, but vary beam stiffness.
// Case A: both beams section 1 (Iz=1e-4).
// Case B: right beam (elem 2) section 2 (Iz=5e-4), left beam section 1.
// Stiffer beam attracts more moment.

#[test]
fn validation_moment_distribution_stiff_vs_flexible() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, 4.0),
        (3, 4.0, 4.0),
        (4, -4.0, 4.0),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
        (3, 4, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -20.0,
        mz: 0.0,
    })];

    // Case A: both beams Iz=1e-4
    let input_a = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 2, 4, 1, 1, false, false),
        ],
        sups.clone(),
        loads.clone(),
    );
    let results_a = linear::solve_2d(&input_a).unwrap();
    let m_start_2a = results_a
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap()
        .m_start;

    // Case B: right beam (elem 2) Iz=5e-4 (5x stiffer), left beam Iz=1e-4
    let iz_stiff = 5e-4;
    let input_b = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_stiff)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 2, false, false), // section 2 (stiffer)
            (3, "frame", 2, 4, 1, 1, false, false), // section 1
        ],
        sups.clone(),
        loads.clone(),
    );
    let results_b = linear::solve_2d(&input_b).unwrap();
    let m_start_2b = results_b
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap()
        .m_start;

    // Stiffer beam should attract more moment
    assert!(
        m_start_2b.abs() > m_start_2a.abs(),
        "Stiffer beam should attract more moment: |m_start_2B|={:.6} > |m_start_2A|={:.6}",
        m_start_2b.abs(),
        m_start_2a.abs()
    );
}
