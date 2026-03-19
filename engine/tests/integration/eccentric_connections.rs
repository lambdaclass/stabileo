/// Integration tests for eccentric connection constraints.
///
/// Tests verify rigid-body kinematics transfer through eccentric offsets,
/// moment equilibrium from offset loads, and constraint force reporting.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// Material and section constants
const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ---------------------------------------------------------------------------
// 1. Eccentric beam-column offset: rigid body kinematics
// ---------------------------------------------------------------------------
//
// L-frame: column node 1 (0,0) pinned, node 2 (0,3) free.
//          beam   node 2 (0,3) -> node 3 (4,3).
//          node 3 is supported as a roller in X.
//
// An eccentric connection ties node 2 (master) to a slave node 4 at the same
// position, with an offset (offset_x=0, offset_y=0.3, offset_z=0).
// A horizontal load is applied at node 4 (the slave).
//
// Because the slave is rigidly offset from the master, we expect:
//   slave_ux = master_ux - offset_y * master_rz
//   slave_uy = master_uy + offset_x * master_rz  (offset_x = 0 here)

#[test]
fn eccentric_beam_column_offset_kinematics() {
    let offset_y = 0.3;
    let fx_load = 10.0; // kN

    // Nodes: 1 at base, 2 at column top, 3 at beam far end, 4 = slave at same location as 2
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, 3.0),
        (3, 4.0, 3.0),
        (4, 0.0, 3.0), // slave node at same position as master node 2
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
    ];
    let sups = vec![
        (1, 1, "fixed"),    // base is fixed
        (2, 3, "rollerX"),  // far end roller
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: fx_load, fz: 0.0, my: 0.0,
        }),
    ];

    let mut input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    // Add eccentric connection: master=2, slave=4, offset_y=0.3
    input.constraints.push(Constraint::EccentricConnection(EccentricConnectionConstraint {
        master_node: 2,
        slave_node: 4,
        offset_x: 0.0,
        offset_y: offset_y,
        offset_z: 0.0,
        releases: vec![],
    }));

    let results = linear::solve_2d(&input).unwrap();

    // Find displacements
    let d_master = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_slave = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // Rigid body kinematics check:
    //   slave_ux = master_ux - offset_y * master_rz
    let expected_slave_ux = d_master.ux - offset_y * d_master.ry;
    assert_close(d_slave.ux, expected_slave_ux, 1e-4, "slave_ux rigid body kinematics");

    //   slave_uy = master_uy + offset_x * master_rz (offset_x = 0)
    let expected_slave_uy = d_master.uz + 0.0 * d_master.ry;
    assert_close(d_slave.uz, expected_slave_uy, 1e-4, "slave_uy rigid body kinematics");

    // slave_rz = master_rz (rotation is shared)
    assert_close(d_slave.ry, d_master.ry, 1e-4, "slave_rz = master_rz");
}

// ---------------------------------------------------------------------------
// 2. Eccentric connection with load: moment transfer and equilibrium
// ---------------------------------------------------------------------------
//
// Simply-supported beam: node 1 (0,0) pinned, node 3 (6,0) roller.
// Midspan node 2 (3,0) is the master. Slave node 4 at same (3,0) with
// offset_y = 0.5 m. A vertical load P is applied at node 4.
//
// The offset creates an equivalent moment M = P * offset_x = 0 at the beam
// but because uy is also constrained, the load transfers downward plus any
// moment from ux coupling. We check equilibrium: sum of vertical reactions = P.

#[test]
fn eccentric_connection_load_equilibrium() {
    let offset_y = 0.5;
    let p_load = -20.0; // kN downward

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 3.0, 0.0), // slave at midspan
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: p_load, my: 0.0,
        }),
    ];

    let mut input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    input.constraints.push(Constraint::EccentricConnection(EccentricConnectionConstraint {
        master_node: 2,
        slave_node: 4,
        offset_x: 0.0,
        offset_y: offset_y,
        offset_z: 0.0,
        releases: vec![],
    }));

    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: sum of ry reactions must equal -p_load (balance the load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -p_load, 1e-3, "vertical equilibrium sum(Ry) = -P");

    // Global horizontal equilibrium: sum of rx reactions ~ 0 (no horizontal load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1e-6, "horizontal equilibrium sum(Rx) ~ 0, got {}", sum_rx);

    // Rigid body kinematics between master and slave
    let d_master = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_slave = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let expected_slave_ux = d_master.ux - offset_y * d_master.ry;
    assert_close(d_slave.ux, expected_slave_ux, 1e-4, "slave_ux kinematics with load");
}

// ---------------------------------------------------------------------------
// 3. Constraint forces are nonzero when eccentric connection is present
// ---------------------------------------------------------------------------
//
// Same L-frame setup as test 1. Verify that constraint_forces is populated.

#[test]
fn eccentric_connection_constraint_forces_nonzero() {
    let offset_y = 0.3;
    let fx_load = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, 3.0),
        (3, 4.0, 3.0),
        (4, 0.0, 3.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 3, "rollerX"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: fx_load, fz: 0.0, my: 0.0,
        }),
    ];

    let mut input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);

    input.constraints.push(Constraint::EccentricConnection(EccentricConnectionConstraint {
        master_node: 2,
        slave_node: 4,
        offset_x: 0.0,
        offset_y: offset_y,
        offset_z: 0.0,
        releases: vec![],
    }));

    let results = linear::solve_2d(&input).unwrap();

    // Constraint forces should be non-empty when constraints are present
    assert!(
        !results.constraint_forces.is_empty(),
        "constraint_forces should be non-empty for constrained problem"
    );

    // At least one constraint force should be nonzero
    let has_nonzero = results.constraint_forces.iter().any(|cf| cf.force.abs() > 1e-10);
    assert!(
        has_nonzero,
        "at least one constraint force should be nonzero"
    );
}
