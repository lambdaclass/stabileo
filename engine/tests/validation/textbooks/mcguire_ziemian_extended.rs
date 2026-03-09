/// Validation: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis" (2nd ed.)
///
/// Extended benchmark tests covering:
///   1. 2-element cantilever beam: stiffness assembly + tip deflection PL^3/(3EI)
///   2. Geometric stiffness: P-delta amplification at P = 0.3*P_cr
///   3. Portal frame assembly: nodal displacements and element forces
///   4. Two-story P-delta frame: drift amplification at both floors
///   5. 3D L-frame (beam along X, column along Z): 3D displacements
///   6. 4-bar truss: member axial forces via FE with hinged members
///   7. Frame stability eigenvalue: critical load vs Euler formula
///   8. 2-span continuous beam: elastic moment distribution + equilibrium
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;
use std::f64::consts::PI;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// Effective E in Pa for manual formulas
const E_PA: f64 = E * 1e6; // 200e9 Pa

// ================================================================
// 1. 2-Element Cantilever: Assembly Verification + PL^3/(3EI)
// ================================================================
//
// Fixed-free cantilever of total length L, divided into 2 equal elements.
// Tip load P at free end.
//
// The assembled stiffness for the interior node has 3x3 DOFs.
// Tip deflection must match PL^3/(3EI).
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 4, Example 4.1

#[test]
fn validation_mcguire_1_assembly_2elem() {
    let l = 6.0; // total length (m)
    let p = -50.0; // kN downward tip load

    // 2-element cantilever: fixed at node 1, free at node 3, load at node 3
    let input = make_beam(
        2, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Tip displacement: PL^3 / (3EI)
    let ei = E_PA * IZ;
    let expected_uy = (p * 1e3) * l.powi(3) / (3.0 * ei); // p is in kN, convert to N
    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(tip.uy, expected_uy, 0.01, "Cantilever tip uy = PL^3/(3EI)");

    // Tip rotation: PL^2 / (2EI)
    let expected_rz = (p * 1e3) * l.powi(2) / (2.0 * ei);
    assert_close(tip.rz, expected_rz, 0.01, "Cantilever tip rz = PL^2/(2EI)");

    // Interior node (node 2) displacement: P*(L/2)^2*(3L - L/2) / (6EI)
    // For cantilever with load at tip, deflection at x = L/2:
    //   delta(x) = P*x^2*(3L - x)/(6EI)
    let x_mid = l / 2.0;
    let expected_mid = (p * 1e3) * x_mid.powi(2) * (3.0 * l - x_mid) / (6.0 * ei);
    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(mid.uy, expected_mid, 0.01, "Cantilever mid uy");

    // Verify fixed-end reactions: Ry = -P, |Mz| = |P|*L
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.ry, -p, 0.01, "Fixed-end Ry = -P");
    // The reaction moment at the fixed end resists the applied load.
    // For a downward tip load (P<0), the reaction moment is positive (counterclockwise).
    assert_close(r.mz.abs(), (p * l).abs(), 0.02, "Fixed-end |Mz| = |P*L|");
}

// ================================================================
// 2. Geometric Stiffness: P-Delta Amplification
// ================================================================
//
// Vertical column (height H) with axial load P = 0.3*P_cr and
// a small lateral load H at the top. Fixed base, free top.
//
// P_cr (fixed-free) = pi^2 * EI / (4*H^2)  (effective length = 2H)
//
// Theoretical amplification factor: 1/(1 - P/P_cr) = 1/(1-0.3) = 1.4286
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 10

#[test]
fn validation_mcguire_2_geometric_stiffness() {
    let h = 5.0; // column height
    let ei = E_PA * IZ;
    let p_cr = PI * PI * ei / (4.0 * h * h); // fixed-free Euler load

    let p_axial = 0.3 * p_cr; // axial load (N)
    let h_lateral = 10_000.0; // 10 kN lateral (N)

    // Build column using make_beam along X-axis (acts as a horizontal column
    // but the solver doesn't care about gravity direction).
    // Use multiple elements for geometric stiffness accuracy.
    let n_elem = 8;
    let elem_len = h / n_elem as f64;
    let n_nodes = n_elem + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Linear case: lateral load only
    let loads_linear = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes, fx: 0.0, fy: h_lateral / 1e3, mz: 0.0, // kN
    })];
    let input_linear = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems.clone(),
        sups.clone(),
        loads_linear,
    );

    // P-delta case: axial + lateral load
    let loads_pdelta = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes, fx: -p_axial / 1e3, fy: h_lateral / 1e3, mz: 0.0,
        }),
    ];
    let input_pdelta = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads_pdelta,
    );

    let lin = linear::solve_2d(&input_linear).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input_pdelta, 50, 1e-6).unwrap();
    assert!(pd.converged, "P-delta should converge at 0.3*P_cr");

    let lin_tip = lin.displacements.iter().find(|d| d.node_id == n_nodes).unwrap().uy.abs();
    let pd_tip = pd.results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap().uy.abs();

    let amplification = pd_tip / lin_tip;
    let expected_amp = 1.0 / (1.0 - 0.3); // 1.4286

    // P-delta is an approximate second-order method, so allow some tolerance
    // The amplification should be in the ballpark of 1/(1-P/Pcr)
    assert!(
        amplification > 1.15,
        "Amplification {:.4} should be > 1.15", amplification
    );
    assert!(
        amplification < 1.85,
        "Amplification {:.4} should be < 1.85 (expected ~{:.4})", amplification, expected_amp
    );
}

// ================================================================
// 3. Portal Frame Assembly: Displacements and Element Forces
// ================================================================
//
// 3-member portal frame (2 columns + 1 beam). Fixed bases.
// Lateral load H at left knee. Verify:
//   - Sidesway displacement at top
//   - Global equilibrium
//   - Element end moments
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 5

#[test]
fn validation_mcguire_3_portal_assembly() {
    let h = 4.0; // column height
    let w = 6.0; // beam span
    let h_load = 30.0; // kN lateral at left knee

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Both top nodes should sway horizontally by approximately the same amount
    // (symmetric frame, anti-symmetric loading causes same direction sway)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert!(d2.ux.abs() > 1e-6, "Left knee should displace laterally");

    // For a fixed-base portal, both knees sway roughly the same
    let sway_diff = (d2.ux - d3.ux).abs();
    assert!(
        sway_diff < d2.ux.abs() * 0.15,
        "Portal top nodes should sway similarly: d2.ux={:.6e}, d3.ux={:.6e}",
        d2.ux, d3.ux
    );

    // Global horizontal equilibrium: sum of base reactions = applied lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.01, "Portal sum_rx = -H");

    // No vertical load => vertical reactions should be equal and opposite (couple)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.ry + r4.ry, 0.0, 0.01, "Portal sum_ry = 0 (no vertical load)");

    // Verify element forces: all elements should have nonzero moments
    for ef in &results.element_forces {
        let m_max = ef.m_start.abs().max(ef.m_end.abs());
        assert!(m_max > 0.1, "Element {} should have nonzero moments, max_M={:.4}", ef.element_id, m_max);
    }

    // Moment compatibility at joint 2 (left knee):
    // In the solver's convention, internal element forces at a shared node
    // satisfy compatibility: col1.m_end = beam.m_start (same sign, same magnitude).
    let col1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let moment_diff = (col1.m_end - beam.m_start).abs();
    assert!(
        moment_diff < 1.0,
        "Joint 2 moment compatibility: col_end={:.4}, beam_start={:.4}, diff={:.4}",
        col1.m_end, beam.m_start, moment_diff
    );
}

// ================================================================
// 4. Two-Story P-Delta Frame: Drift Amplification
// ================================================================
//
// Two-story, 1-bay frame with fixed bases.
// Gravity loads on each floor + lateral loads.
// Verify drift amplification at both floors from P-delta.
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 10, 14

#[test]
fn validation_mcguire_4_pdelta_frame() {
    let h = 3.5; // story height
    let w = 6.0; // bay width
    let p_gravity = 400.0; // kN per column per floor
    let h_lat = 20.0; // kN lateral per floor

    // Nodes: 1,2 = base; 3,4 = first floor; 5,6 = second floor
    let nodes = vec![
        (1, 0.0, 0.0),     // left base
        (2, w, 0.0),       // right base
        (3, 0.0, h),       // left 1st floor
        (4, w, h),         // right 1st floor
        (5, 0.0, 2.0 * h), // left 2nd floor
        (6, w, 2.0 * h),   // right 2nd floor
    ];

    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col, story 1
        (2, "frame", 2, 4, 1, 1, false, false), // right col, story 1
        (3, "frame", 3, 4, 1, 1, false, false), // beam, 1st floor
        (4, "frame", 3, 5, 1, 1, false, false), // left col, story 2
        (5, "frame", 4, 6, 1, 1, false, false), // right col, story 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam, 2nd floor
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let loads = vec![
        // Lateral loads
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: h_lat, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h_lat, fy: 0.0, mz: 0.0 }),
        // Gravity loads at each floor on both columns
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p_gravity, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -p_gravity, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();

    assert!(pd.converged, "Two-story P-delta should converge");

    // First floor drift amplification
    let lin_d1 = lin.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let pd_d1 = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Second floor drift amplification
    let lin_d2 = lin.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let pd_d2 = pd.results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // P-delta drifts should exceed linear drifts (amplification > 1)
    if lin_d1.abs() > 1e-8 {
        let amp1 = pd_d1.abs() / lin_d1.abs();
        assert!(
            amp1 > 1.01,
            "1st floor amplification {:.4} should > 1.0", amp1
        );
    }
    if lin_d2.abs() > 1e-8 {
        let amp2 = pd_d2.abs() / lin_d2.abs();
        assert!(
            amp2 > 1.01,
            "2nd floor amplification {:.4} should > 1.0", amp2
        );
    }

    // Second floor drift should be larger than first floor drift
    assert!(
        pd_d2.abs() > pd_d1.abs(),
        "Roof drift {:.6e} should exceed 1st floor drift {:.6e}",
        pd_d2.abs(), pd_d1.abs()
    );

    // Vertical equilibrium: sum of vertical reactions = total gravity load
    let sum_ry: f64 = pd.results.reactions.iter().map(|r| r.ry).sum();
    let total_gravity = 4.0 * p_gravity; // 4 nodes with gravity loads
    assert!(
        (sum_ry - total_gravity).abs() < 5.0,
        "P-delta vertical equilibrium: sum_ry={:.4}, applied={:.4}",
        sum_ry, total_gravity
    );
}

// ================================================================
// 5. 3D Space L-Frame: Beam along X + Column along Z
// ================================================================
//
// Column: (0,0,0) to (0,0,H) along Z, fixed at base.
// Beam: (0,0,H) to (L,0,H) along X, free at tip.
// Point load at beam tip in Y-direction.
// Verify 3D deflections at tip and joint.
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 13

#[test]
fn validation_mcguire_5_3d_space_frame() {
    let h = 4.0; // column height along Z
    let beam_l = 5.0; // beam length along X
    let fy_tip = -15.0; // kN downward at beam tip
    let nu = 0.3;
    let iy = 1e-4;
    let iz = 1e-4;
    let j_val = 5e-5;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // column base (fixed)
        (2, 0.0, 0.0, h),   // column top / beam start
        (3, beam_l, 0.0, h), // beam tip (loaded)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column along Z
        (2, "frame", 2, 3, 1, 1), // beam along X
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed base
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3,
        fx: 0.0, fy: fy_tip, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, nu)],
        vec![(1, A, iy, iz, j_val)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Tip should deflect primarily in Y (direction of load)
    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(
        tip.uy.abs() > 1e-6,
        "Beam tip should deflect in Y, uy={:.6e}", tip.uy
    );
    assert!(
        tip.uy < 0.0,
        "Beam tip uy should be negative (downward), got {:.6e}", tip.uy
    );

    // Joint node 2 should also deflect (column flexibility)
    let joint = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        joint.uy.abs() > 1e-8,
        "Joint should deflect in Y due to column bending, uy={:.6e}", joint.uy
    );

    // Tip deflection should be greater than joint deflection (beam adds to column)
    assert!(
        tip.uy.abs() > joint.uy.abs(),
        "Tip deflection {:.6e} should exceed joint {:.6e}",
        tip.uy.abs(), joint.uy.abs()
    );

    // Global force equilibrium
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, -fy_tip, 0.02, "3D L-frame sum_fy = -applied");

    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fx.abs() < 0.1, "3D L-frame sum_fx ~ 0, got {:.4}", sum_fx);
    assert!(sum_fz.abs() < 0.1, "3D L-frame sum_fz ~ 0, got {:.4}", sum_fz);
}

// ================================================================
// 6. 4-Bar Truss: Axial Forces via FE
// ================================================================
//
// Classic Warren-type truss (triangle):
//   Node 1 (0,0): pinned
//   Node 2 (4,0): rollerX (uy restrained, ux free)
//   Node 3 (2,3): free (loaded)
//
// 3 truss bars: 1-2 (bottom chord), 1-3 (left diagonal), 2-3 (right diagonal)
// Plus a horizontal bar 1-2 to make it a 4-bar truss with node 4:
//   Node 4 (6,0): rollerX
//   Bar 4: 2-4 (extension), Bar 3: 3-4
//
// Simpler approach: 4-node, 4-bar truss (classic textbook truss)
//   Node 1 (0,0): pinned
//   Node 2 (3,0): pinned
//   Node 3 (0,4): free (loaded)
//   Node 4 (3,4): free
//   Bars: 1-3, 3-4, 2-4, 1-4 (rectangle with one diagonal)
//
// For a simple stable configuration, use a 3-bar triangle truss:
//   Node 1 (0,0): pinned
//   Node 2 (6,0): rollerX
//   Node 3 (3,4): free, loaded downward
//   Bars: 1-3, 2-3, 1-2 (bottom chord - needed for stability with rollerX)
//
// Actually the simplest 4-bar: use two triangles sharing an edge.
//   Node 1 (0,0): pinned
//   Node 2 (4,0): pinned
//   Node 3 (2,3): free (loaded)
// Bars: 1-3, 2-3, plus add node 4:
//   Node 4 (2,-3): free
//   Bars: 1-4, 2-4
//
// With 2 pinned supports (4 reaction DOFs: ux1,uy1,ux2,uy2) and 4 bars,
// and 2 free nodes (4 free DOFs), this is statically determinate.
//
// By symmetry and method of joints at node 3:
//   Load P=-100 kN downward at node 3.
//   Bars 1-3 and 2-3 are symmetric (same length, mirror about x=2).
//   L_13 = L_23 = sqrt(4+9) = sqrt(13)
//   sin(alpha) = 3/sqrt(13), cos(alpha) = 2/sqrt(13)
//   At node 3: 2*F*sin(alpha) = -P => F = -P/(2*sin(alpha)) = 50/sin(alpha)
//   F = 50*sqrt(13)/3 (compression, since bars push up)
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 3

#[test]
fn validation_mcguire_6_truss_assembly() {
    let p = -100.0; // kN downward at node 3

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 2.0, 3.0),
        (4, 2.0, -3.0),
    ];

    // 4 truss bars: two triangles sharing the base line 1-2
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // bar 1-3
        (2, "truss", 2, 3, 1, 1, false, false), // bar 2-3
        (3, "truss", 1, 4, 1, 1, false, false), // bar 1-4
        (4, "truss", 2, 4, 1, 1, false, false), // bar 2-4
    ];

    // Two pinned supports: 4 reaction DOFs, 4 free DOFs, 4 bars => determinate
    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: sum_ry = -P = 100
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -p, 0.01, "Truss sum_ry = -P");

    // No horizontal load => sum_rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.5, "Truss sum_rx ~ 0, got {:.4}", sum_rx);

    // Bars carrying load at node 3 should have nonzero axial force
    let bar13 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let bar23 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        bar13.n_start.abs() > 0.01,
        "Bar 1-3 should carry axial force, n_start={:.6}", bar13.n_start
    );
    assert!(
        bar23.n_start.abs() > 0.01,
        "Bar 2-3 should carry axial force, n_start={:.6}", bar23.n_start
    );

    // Symmetry: bars 1-3 and 2-3 should carry equal axial force magnitude
    assert_close(
        bar13.n_start.abs(), bar23.n_start.abs(), 0.02,
        "Symmetric bars 1-3 and 2-3 should have equal axial force magnitude",
    );

    // Bars 1-4 and 2-4 should also be symmetric (no load at node 4)
    let bar14 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let bar24 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(
        bar14.n_start.abs(), bar24.n_start.abs(), 0.02,
        "Symmetric bars 1-4 and 2-4 should have equal axial force magnitude",
    );

    // Truss members should have zero bending moments (truss elements)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.5,
            "Truss bar {} should have ~zero m_start, got {:.6}",
            ef.element_id, ef.m_start
        );
        assert!(
            ef.m_end.abs() < 0.5,
            "Truss bar {} should have ~zero m_end, got {:.6}",
            ef.element_id, ef.m_end
        );
    }

    // Method of joints at node 3:
    // F_13 and F_23 have equal magnitude. The vertical component:
    //   2 * |F| * sin(alpha) = |P|, where sin(alpha) = 3/sqrt(13)
    //   |F| = |P| / (2 * 3/sqrt(13)) = 100 * sqrt(13) / 6 = 60.09 kN
    let l_bar = (4.0_f64 + 9.0_f64).sqrt(); // sqrt(13)
    let sin_alpha = 3.0 / l_bar;
    let expected_force = (p.abs()) / (2.0 * sin_alpha);
    assert_close(
        bar13.n_start.abs(), expected_force, 0.05,
        "Bar 1-3 axial force from method of joints",
    );
}

// ================================================================
// 7. Stability Eigenvalue: Critical Load vs Euler Formula
// ================================================================
//
// Single column, fixed-free (cantilever). Axial compressive load.
// Euler critical load: P_cr = pi^2 * EI / (2L)^2
//   where effective length = 2L for fixed-free.
//
// The eigenvalue alpha_cr from buckling analysis times the applied load
// should approximate P_cr.
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 9

#[test]
fn validation_mcguire_7_stability_eigenvalue() {
    let l = 5.0;
    let ei = E_PA * IZ;
    let p_euler = PI * PI * ei / (2.0_f64 * l).powi(2); // fixed-free Euler load

    // Apply a reference axial load (negative = compression in local x)
    let p_ref = p_euler / 5.0; // well below critical
    let p_ref_kn = p_ref / 1e3; // convert to kN

    // Use many elements for convergence of eigenvalue
    let input = make_column(
        10, l, E, A, IZ, "fixed", "free", -p_ref_kn,
    );

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Critical load = alpha_cr * P_ref
    // Should approximate P_euler
    let p_cr_computed = alpha_cr * p_ref;
    let ratio = p_cr_computed / p_euler;

    assert!(
        alpha_cr > 1.0,
        "alpha_cr={:.4} should be > 1 since P_ref < P_euler", alpha_cr
    );
    assert!(
        (ratio - 1.0).abs() < 0.10,
        "P_cr_computed/P_euler = {:.4}, should be ~1.0 (alpha_cr={:.4})",
        ratio, alpha_cr
    );
}

// ================================================================
// 8. 2-Span Continuous Beam: Elastic Moment Distribution
// ================================================================
//
// Two equal spans L, simply supported at ends, roller at middle.
// Uniform distributed load q on both spans.
//
// Classical result:
//   - Midspan support moment M_B = -qL^2/8 (for equal spans)
//     Actually for 2-span continuous beam with UDL:
//     M_B = -qL^2/8 (from three-moment equation for equal spans)
//   - End reactions: R_A = R_C = 3qL/8, R_B = 10qL/8 = 5qL/4
//
// Reference: McGuire, Gallagher & Ziemian, Ch. 5 & 6

#[test]
fn validation_mcguire_8_moment_redistribution() {
    let l = 8.0; // span length
    let q = -20.0; // kN/m downward (distributed)

    let n_per_span = 4;

    // Build 2-span continuous beam
    let mut dist_loads = Vec::new();
    let total_elems = 2 * n_per_span;
    for i in 0..total_elems {
        dist_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l, l], n_per_span, E, A, IZ, dist_loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Expected reactions for 2-span continuous beam with UDL:
    //   R_A = 3qL/8, R_B = 10qL/8, R_C = 3qL/8
    // Note: q is negative (downward), so reactions are positive (upward).
    let q_abs = q.abs();
    let r_a_expected = 3.0 * q_abs * l / 8.0;
    let r_b_expected = 10.0 * q_abs * l / 8.0;
    let r_c_expected = 3.0 * q_abs * l / 8.0;

    // Node IDs: 1 = left end, n_per_span+1 = middle support, 2*n_per_span+1 = right end
    let mid_node = n_per_span + 1;
    let right_node = 2 * n_per_span + 1;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let rc = results.reactions.iter().find(|r| r.node_id == right_node).unwrap();

    assert_close(ra.ry, r_a_expected, 0.02, "R_A = 3qL/8");
    assert_close(rb.ry, r_b_expected, 0.02, "R_B = 10qL/8");
    assert_close(rc.ry, r_c_expected, 0.02, "R_C = 3qL/8");

    // Global vertical equilibrium: R_A + R_B + R_C = 2*q*L (total load)
    let total_reaction = ra.ry + rb.ry + rc.ry;
    let total_load = 2.0 * q_abs * l;
    assert_close(total_reaction, total_load, 0.01, "Global vertical equilibrium");

    // Middle support moment: M_B = -qL^2/8
    // We check the element end moments at the interior support.
    // The moment at the interior support from the left span (element n_per_span)
    // should have m_end ≈ qL^2/8 in magnitude.
    let m_b_expected = q_abs * l * l / 8.0; // magnitude

    let left_span_end = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();
    let right_span_start = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span + 1)
        .unwrap();

    // The interior moment should be about qL^2/8 in magnitude
    assert_close(
        left_span_end.m_end.abs(), m_b_expected, 0.05,
        "Interior support moment magnitude ~ qL^2/8",
    );

    // Moment compatibility at interior support: the internal moments from both
    // sides of the support should be equal (same sign, same magnitude) since
    // the solver's element force convention gives consistent internal moments.
    assert!(
        (left_span_end.m_end - right_span_start.m_start).abs() < 2.0,
        "Moment compatibility at interior support: left_end={:.4}, right_start={:.4}",
        left_span_end.m_end, right_span_start.m_start
    );

    // Symmetry: end reactions should be equal (symmetric structure + loading)
    assert_close(ra.ry, rc.ry, 0.02, "Symmetric end reactions R_A = R_C");
}
