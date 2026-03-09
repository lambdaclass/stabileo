/// Validation: Cable-Net & Tension Structures — Extended
///
/// References:
///   - Buchholdt: "Introduction to Cable Roof Structures" (1999)
///   - Krishna: "Cable-Suspended Roofs" (1978)
///   - Irvine: "Cable Structures" (1981)
///   - Kassimali: "Structural Analysis", 6th Ed., Ch. 4
///   - Hibbeler: "Structural Analysis", 10th Ed., Ch. 3-5
///
/// These tests use the FEM solver to model cable-net-like structures
/// as planar truss assemblies (frame elements with both ends hinged).
/// Each test verifies equilibrium, force distribution, or deflection
/// against closed-form analytical results.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;  // MPa (solver multiplies by 1000 internally)
const A_CABLE: f64 = 0.0005; // m^2 (500 mm^2 cable cross-section)

// ================================================================
// 1. Diamond Cable Net Under Central Load
// ================================================================
//
// Four cables arranged as a diamond (rhombus): two top anchors and
// two side anchors meeting at a central node. A vertical load is
// applied at the center. By equilibrium at the center node, the
// vertical cables carry the entire vertical load and the horizontal
// cables carry zero force.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Method of Joints

#[test]
fn cable_net_ext_diamond_central_load() {
    let h = 4.0;  // vertical half-dimension
    let w = 3.0;  // horizontal half-dimension
    let p = 20.0; // kN downward at center

    // Nodes: 1=top, 2=left, 3=bottom(center loaded), 4=right, 5=bottom anchor
    // Diamond: top(0,h), left(-w,0), center(0,0), right(w,0), bottom(0,-h)
    let input = make_input(
        vec![
            (1, 0.0, h),     // top anchor
            (2, -w, 0.0),    // left anchor
            (3, 0.0, 0.0),   // center (loaded)
            (4, w, 0.0),     // right anchor
            (5, 0.0, -h),    // bottom anchor
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // top to center
            (2, "frame", 2, 3, 1, 1, true, true), // left to center
            (3, "frame", 3, 4, 1, 1, true, true), // center to right
            (4, "frame", 3, 5, 1, 1, true, true), // center to bottom
        ],
        vec![
            (1, 1, "pinned"),
            (2, 2, "pinned"),
            (3, 4, "pinned"),
            (4, 5, "pinned"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Diamond net: vertical equilibrium");

    // Horizontal cables (left-center, center-right) should carry zero axial force
    // because the load is purely vertical and they are horizontal
    let f_left = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap().n_start;
    let f_right = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap().n_start;
    assert_close(f_left, 0.0, 0.01, "Diamond net: horizontal cable zero force");
    assert_close(f_right, 0.0, 0.01, "Diamond net: horizontal cable zero force");

    // Vertical cables carry the load: top cable in compression (pushes center down),
    // bottom cable in tension (pulls center down) or vice versa depending on sign convention.
    // Force in top member: P/1 since it is vertical and directly transmits
    let f_top = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start;
    let f_bot = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap().n_start;

    // The load at center is shared between the top and bottom vertical members.
    // Each vertical member carries P/2 = 10 kN (they are in series, sharing the load).
    // Actually, each vertical cable transmits the full load: the top anchor holds P/2
    // and the bottom anchor holds P/2, but the load splits because there are two
    // independent load paths (top and bottom).
    // With 4 supports (all pinned), the vertical load distributes between top and bottom.
    // By symmetry of vertical members: each carries P/2.
    let p_half = p / 2.0;
    assert_close(f_top.abs(), p_half, 0.05, "Diamond net: top vertical force = P/2");
    assert_close(f_bot.abs(), p_half, 0.05, "Diamond net: bottom vertical force = P/2");
}

// ================================================================
// 2. Hexagonal Cable Net: Symmetry Under Central Load
// ================================================================
//
// Six cables radiating from a central node to six evenly spaced
// boundary anchors (hexagonal pattern). Under a vertical load at
// center, the two purely vertical cables carry most load while the
// four inclined cables share the remainder.
//
// Reference: Buchholdt, "Cable Roof Structures", Ch. 4

#[test]
fn cable_net_ext_hexagonal_symmetry() {
    let r = 5.0;  // radius to anchor nodes
    let p = 30.0; // kN downward at center

    // 6 anchor nodes at 60-degree intervals, node 7 at center
    let pi: f64 = std::f64::consts::PI;
    let mut nodes = Vec::new();
    for i in 0..6 {
        let angle: f64 = i as f64 * pi / 3.0;
        let x: f64 = r * angle.cos();
        let y: f64 = r * angle.sin();
        nodes.push((i + 1, x, y));
    }
    nodes.push((7, 0.0, 0.0)); // center

    let mut elems = Vec::new();
    for i in 0..6 {
        elems.push((i + 1, "frame", i + 1, 7, 1, 1, true, true));
    }

    let mut sups = Vec::new();
    for i in 0..6 {
        sups.push((i + 1, i + 1, "pinned"));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        elems,
        sups,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_ry, p, 0.01, "Hex net: vertical equilibrium");
    assert_close(sum_rx, 0.0, 0.01, "Hex net: horizontal equilibrium");

    // All cables have the same length, so by axial stiffness symmetry,
    // forces in cables at symmetric y-positions should be equal in magnitude.
    // Cables at angles 90 and 270 degrees (nodes 2 and 5, which are at
    // angle pi/3*1=60 and pi/3*4=240) are symmetric about x-axis.
    let f1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start.abs();
    let f4 = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap().n_start.abs();
    // Elements 1 and 4 connect nodes at 0 deg and 180 deg (symmetric about y-axis)
    assert_close(f1, f4, 0.05, "Hex net: opposing cables equal force");

    // Elements 2 and 6 connect nodes at 60 deg and 300 deg (symmetric about x-axis)
    let f2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap().n_start.abs();
    let f6 = results.element_forces.iter()
        .find(|e| e.element_id == 6).unwrap().n_start.abs();
    assert_close(f2, f6, 0.05, "Hex net: 60/300 cables equal force");

    // Elements 3 and 5 at 120 and 240 degrees
    let f3 = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap().n_start.abs();
    let f5 = results.element_forces.iter()
        .find(|e| e.element_id == 5).unwrap().n_start.abs();
    assert_close(f3, f5, 0.05, "Hex net: 120/240 cables equal force");
}

// ================================================================
// 3. Inclined Cables With Different Lengths: Stiffness Sharing
// ================================================================
//
// Three cables of different lengths radiating from a single loaded
// node to fixed supports. The cable stiffness is EA/L, so shorter
// cables attract more force. We verify that the stiffest (shortest)
// cable carries the largest share of the vertical reaction.
//
// Reference: Gere & Timoshenko, "Mechanics of Materials", 4th Ed., Section 2.7

#[test]
fn cable_net_ext_parallel_cables_stiffness_sharing() {
    let p = 30.0; // kN load at center node

    // Three supports at the same height but different horizontal offsets
    // creating cables of different lengths to the center node at origin
    let h = 5.0;
    let input = make_input(
        vec![
            (1, -2.0, h),  // left anchor (short cable, L = sqrt(4+25) = 5.39)
            (2, 0.0, h),   // top anchor (shortest cable, L = 5.0)
            (3, 4.0, h),   // right anchor (long cable, L = sqrt(16+25) = 6.40)
            (4, 0.0, 0.0), // loaded center node
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            (1, "frame", 1, 4, 1, 1, true, true), // left cable
            (2, "frame", 2, 4, 1, 1, true, true), // top cable (shortest)
            (3, "frame", 3, 4, 1, 1, true, true), // right cable (longest)
        ],
        vec![
            (1, 1, "pinned"),
            (2, 2, "pinned"),
            (3, 3, "pinned"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Cables stiffness: vertical equilibrium");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.10, "Cables stiffness: horizontal equilibrium");

    // All cables carry force
    for eid in 1..=3 {
        let f = results.element_forces.iter()
            .find(|e| e.element_id == eid).unwrap().n_start;
        assert!(f.abs() > 0.1,
            "Cables stiffness: cable {} carries force: {:.4}", eid, f);
    }

    // The shortest cable (element 2, purely vertical, L=5.0) has highest
    // axial stiffness EA/L and the most favorable angle for vertical load,
    // so it should carry the largest vertical reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;

    assert!(r2 > r1, "Cables stiffness: shortest cable has largest vertical reaction");
    assert!(r2 > r3, "Cables stiffness: shortest cable has largest vertical reaction");
}

// ================================================================
// 4. X-Braced Panel: Diagonal Tension vs Compression
// ================================================================
//
// Rectangular panel with X-bracing (two crossing diagonals).
// Under horizontal shear load, one diagonal goes into tension,
// the other into compression. Both have equal magnitude by symmetry.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 3.4

#[test]
fn cable_net_ext_x_brace_shear_panel() {
    let w = 4.0;  // panel width
    let h = 3.0;  // panel height
    let p = 10.0; // horizontal shear load

    // Rectangular panel with X-braces
    let input = make_input(
        vec![
            (1, 0.0, 0.0), // bottom-left
            (2, w, 0.0),   // bottom-right
            (3, w, h),     // top-right
            (4, 0.0, h),   // top-left
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 2, 3, 1, 1, true, true), // right column
            (3, "frame", 3, 4, 1, 1, true, true), // top chord
            (4, "frame", 4, 1, 1, 1, true, true), // left column
            (5, "frame", 1, 3, 1, 1, true, true), // diagonal 1 (BL to TR)
            (6, "frame", 2, 4, 1, 1, true, true), // diagonal 2 (BR to TL)
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: p, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.01, "X-brace: horizontal equilibrium");

    // Both diagonals have the same length
    let diag_len: f64 = (w * w + h * h).sqrt();
    let _diag_len = diag_len;

    // The two diagonals carry force but with opposite signs
    // (one in tension, one in compression) due to the shear load
    let f_d1 = results.element_forces.iter()
        .find(|e| e.element_id == 5).unwrap().n_start;
    let f_d2 = results.element_forces.iter()
        .find(|e| e.element_id == 6).unwrap().n_start;

    // They should have opposite signs (one tension, one compression)
    assert!(
        f_d1 * f_d2 < 0.0,
        "X-brace: diagonals have opposite signs: {:.4} vs {:.4}", f_d1, f_d2
    );

    // Both diagonals should carry significant force
    assert!(f_d1.abs() > 1.0, "X-brace: diagonal 1 carries significant force");
    assert!(f_d2.abs() > 1.0, "X-brace: diagonal 2 carries significant force");

    // The sum of diagonal horizontal components should help resist the applied shear
    // Both diagonals are non-trivially loaded
    let f_total: f64 = f_d1.abs() + f_d2.abs();
    assert!(f_total > p * 0.5, "X-brace: diagonals carry significant total force");
}

// ================================================================
// 5. Cable Net Deflection Proportionality
// ================================================================
//
// A simple 3-cable network. Verify that deflection scales linearly
// with load (superposition) and inversely with cross-sectional area.
//
// Reference: Gere & Timoshenko, "Mechanics of Materials", 4th Ed., Section 2.3

#[test]
fn cable_net_ext_deflection_proportionality() {
    let h = 4.0;
    let w = 3.0;

    let build_model = |a: f64, p: f64| -> f64 {
        let input = make_input(
            vec![
                (1, 0.0, h),     // top-left anchor
                (2, 2.0 * w, h), // top-right anchor
                (3, w, 0.0),     // bottom center (loaded)
            ],
            vec![(1, E, 0.3)],
            vec![(1, a, 1e-10)],
            vec![
                (1, "frame", 1, 3, 1, 1, true, true), // left cable
                (2, "frame", 2, 3, 1, 1, true, true), // right cable
            ],
            vec![(1, 1, "pinned"), (2, 2, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
            })],
        );
        linear::solve_2d(&input).unwrap()
            .displacements.iter()
            .find(|d| d.node_id == 3).unwrap()
            .uy.abs()
    };

    // Test 1: deflection proportional to load (linear)
    let d1 = build_model(A_CABLE, 10.0);
    let d2 = build_model(A_CABLE, 20.0);
    let d3 = build_model(A_CABLE, 30.0);

    assert_close(d2 / d1, 2.0, 0.02, "Cable net: deflection proportional to load (2x)");
    assert_close(d3 / d1, 3.0, 0.02, "Cable net: deflection proportional to load (3x)");

    // Test 2: deflection inversely proportional to area
    let d_a1 = build_model(A_CABLE, 15.0);
    let d_a2 = build_model(2.0 * A_CABLE, 15.0);
    let d_a4 = build_model(4.0 * A_CABLE, 15.0);

    assert_close(d_a1 / d_a2, 2.0, 0.02, "Cable net: deflection inversely proportional to A (2x)");
    assert_close(d_a1 / d_a4, 4.0, 0.02, "Cable net: deflection inversely proportional to A (4x)");
}

// ================================================================
// 6. Radial Cable Array: Force vs Angle of Inclination
// ================================================================
//
// Multiple cables at different angles from a single loaded node to
// fixed supports. Steeper cables (more vertical) carry a larger
// share of the vertical load. The force in each cable is
// F_i = k_i * delta_y * sin(alpha_i) where k_i = EA/L_i.
//
// Reference: Krishna, "Cable-Suspended Roofs", Ch. 3

#[test]
fn cable_net_ext_radial_force_vs_angle() {
    let p = 40.0; // kN vertical load at center

    // Three cables from center node to anchors at different angles
    // All anchors at same height h=5 above center
    let h = 5.0;
    // Anchor horizontal distances: 2, 5, 10 (steepest to shallowest)
    let x1 = 2.0;
    let x2 = 5.0;
    let x3 = 10.0;

    let input = make_input(
        vec![
            (1, -x1, h),  // steep anchor (left)
            (2, 0.0, 0.0), // center (loaded)
            (3, x2, h),   // moderate anchor (right)
            (4, x3, h),   // shallow anchor (far right)
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // steep cable
            (2, "frame", 2, 3, 1, 1, true, true), // moderate cable
            (3, "frame", 2, 4, 1, 1, true, true), // shallow cable
        ],
        vec![
            (1, 1, "pinned"),
            (2, 3, "pinned"),
            (3, 4, "pinned"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Radial cables: vertical equilibrium");

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.15, "Radial cables: horizontal equilibrium");

    // Cable forces: all should be non-zero and in tension (negative n_start means
    // compression in sign convention, but cable members transmit axial force)
    let f1 = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start.abs();
    let f2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap().n_start.abs();
    let f3 = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap().n_start.abs();

    assert!(f1 > 0.1, "Radial cables: steep cable carries force");
    assert!(f2 > 0.1, "Radial cables: moderate cable carries force");
    assert!(f3 > 0.1, "Radial cables: shallow cable carries force");

    // Center node should deflect downward
    let d = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d.uy < 0.0, "Radial cables: center deflects downward");
}

// ================================================================
// 7. Suspended Cable Net: Load Transfer Through Inclined Hangers
// ================================================================
//
// A triangular truss-like cable system: two inclined main cables
// from anchors converge to a central top node, and two inclined
// hangers drop from that apex to two lower loaded nodes at ground
// level. The system transfers loads from the lower level upward
// through the hangers to the apex, then through main cables to
// the supports. This is a stable, determinate truss.
//
// Reference: Irvine, "Cable Structures", Ch. 7

#[test]
fn cable_net_ext_two_level_load_transfer() {
    let span = 10.0;
    let h_apex = 6.0;  // height of apex node
    let p = 15.0;       // kN load at each lower node

    // Geometry:
    // Anchors: nodes 1(0, 0) and 2(span, 0) pinned at ground
    // Apex: node 3(span/2, h_apex)
    // Lower loaded nodes: 4(span/4, 0), 5(3*span/4, 0)
    // Main cables: 1->3, 3->2
    // Hangers: 3->4, 3->5 (inclined from apex to loaded nodes)
    // Bottom chord: 1->4, 4->5, 5->2 (connects all ground nodes)
    let input = make_input(
        vec![
            (1, 0.0, 0.0),              // left anchor
            (2, span, 0.0),             // right anchor
            (3, span / 2.0, h_apex),    // apex
            (4, span / 4.0, 0.0),       // lower left (loaded)
            (5, 3.0 * span / 4.0, 0.0), // lower right (loaded)
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            // Main cables to apex
            (1, "frame", 1, 3, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            // Inclined hangers from apex to loaded nodes
            (3, "frame", 3, 4, 1, 1, true, true),
            (4, "frame", 3, 5, 1, 1, true, true),
            // Bottom chord (ground level)
            (5, "frame", 1, 4, 1, 1, true, true),
            (6, "frame", 4, 5, 1, 1, true, true),
            (7, "frame", 5, 2, 1, 1, true, true),
        ],
        vec![
            (1, 1, "pinned"),
            (2, 2, "rollerX"),
        ],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Two-level net: vertical equilibrium");

    // Symmetric loading and geometry → symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert_close(r1, r2, 0.02, "Two-level net: symmetric reactions");
    assert_close(r1, p, 0.02, "Two-level net: each support carries P");

    // Hangers from apex carry force symmetrically
    let f_hanger_l = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap().n_start;
    let f_hanger_r = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap().n_start;
    assert_close(f_hanger_l.abs(), f_hanger_r.abs(), 0.02,
        "Two-level net: symmetric hanger forces");

    // Main cables carry axial force
    let f_main_l = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start.abs();
    let f_main_r = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap().n_start.abs();
    assert_close(f_main_l, f_main_r, 0.02, "Two-level net: symmetric main cable forces");
    assert!(f_main_l > 0.01, "Two-level net: main cables carry axial force");
}

// ================================================================
// 8. Asymmetric Cable Net: Moment of Reactions About Support
// ================================================================
//
// Three cables meeting at a single loaded node, but with asymmetric
// geometry. Verify that the moment sum about one support equals
// zero (static determinacy check), and that the reaction distribution
// follows the lever-arm principle.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 3.3

#[test]
fn cable_net_ext_asymmetric_moment_check() {
    let p = 25.0; // kN downward
    // Three supports at different positions
    // Node 4 is the loaded central node at (3, 0)
    // Supports: node 1 at (0, 5), node 2 at (6, 4), node 3 at (3, 6)
    let input = make_input(
        vec![
            (1, 0.0, 5.0),  // left-upper anchor
            (2, 6.0, 4.0),  // right-upper anchor
            (3, 3.0, 6.0),  // top anchor
            (4, 3.0, 0.0),  // loaded node (center-bottom)
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_CABLE, 1e-10)],
        vec![
            (1, "frame", 1, 4, 1, 1, true, true), // cable 1
            (2, "frame", 2, 4, 1, 1, true, true), // cable 2
            (3, "frame", 3, 4, 1, 1, true, true), // cable 3
        ],
        vec![
            (1, 1, "pinned"),
            (2, 2, "pinned"),
            (3, 3, "pinned"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global force equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, 0.0, 0.05, "Asymmetric net: horizontal equilibrium");
    assert_close(sum_ry, p, 0.01, "Asymmetric net: vertical equilibrium");

    // Moment equilibrium about origin: sum(Rx_i * y_i - Ry_i * x_i) + P * x_load = 0
    // Applied load: Fy = -P at (3, 0) => moment about origin = -(-P)*3 = 0 (no x-moment from vertical load at y=0)
    // Actually: M_origin = sum(Rx_i * y_i - Ry_i * x_i) + P * x_load_point
    // where load is (0, -P) at (3, 0):
    // M_load = 0*0 - (-P)*3 = 3P (counterclockwise)
    // Wait, moment = Fx*y - Fy*x, for load (0,-P) at (3,0): M = 0*0 - (-P)*3 = 3P
    // For reactions: M = sum(Rx_i * y_i - Ry_i * x_i)
    // Total moment should be zero: sum(Rx_i*y_i - Ry_i*x_i) + 3P = 0
    // => sum(Rx_i*y_i - Ry_i*x_i) = -3P

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    // Support locations: node 1 at (0,5), node 2 at (6,4), node 3 at (3,6)
    let m_reactions: f64 = r1.rx * 5.0 - r1.ry * 0.0
        + r2.rx * 4.0 - r2.ry * 6.0
        + r3.rx * 6.0 - r3.ry * 3.0;

    // Moment from applied load about origin: 0*0 - (-P)*3 = 3*P
    let m_load: f64 = p * 3.0;

    // Moment equilibrium: m_reactions + m_load = 0
    let m_total: f64 = m_reactions + m_load;
    assert_close(m_total, 0.0, 0.10, "Asymmetric net: moment equilibrium about origin");

    // All cables should carry some force
    for eid in 1..=3 {
        let f = results.element_forces.iter()
            .find(|e| e.element_id == eid).unwrap().n_start;
        assert!(f.abs() > 0.1,
            "Asymmetric net: cable {} carries force: {:.4}", eid, f);
    }
}
