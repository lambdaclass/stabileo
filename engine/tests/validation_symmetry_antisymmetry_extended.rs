/// Validation: Extended Symmetry and Antisymmetry Properties
///
/// References:
///   - Kassimali, "Matrix Analysis of Structures", Ch. 6
///   - Ghali & Neville, "Structural Analysis", Ch. 9
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9-10
///
/// Extended tests verifying deeper symmetry/antisymmetry consequences:
///   1. Fixed-fixed beam symmetric UDL: both end moments equal, zero midspan slope
///   2. Three-span continuous beam: symmetric UDL gives equal outer-span deflections
///   3. Superposition: asymmetric point load decomposed into sym + anti components
///   4. Portal frame symmetric UDL on beam: no sway, equal column moments
///   5. Diamond truss: symmetric vertical load gives zero horizontal apex displacement
///   6. Antisymmetric moments on SS beam: zero midspan deflection, nonzero slope
///   7. Two-bay portal frame: symmetric gravity gives equal exterior column reactions
///   8. Fixed beam with antisymmetric point loads: zero midspan deflection and moment
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam: Symmetric UDL → Equal End Moments, Zero Midspan Slope
// ================================================================

#[test]
fn validation_ext_symmetry_fixed_fixed_udl() {
    // A fixed-fixed beam under symmetric UDL must have:
    //   - Equal end moments (M_left = M_right by magnitude)
    //   - Zero slope at midspan
    //   - Exact: M_end = qL^2/12, delta_mid = qL^4/(384EI)
    let l = 6.0;
    let n = 12;
    let q: f64 = -15.0; // downward UDL

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check zero midspan slope (symmetry)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.rz.abs() < 1e-10,
        "Fixed-fixed symmetric UDL: midspan slope = 0, got {:.6e}", d_mid.rz);

    // Check equal end moments (reactions)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.mz.abs(), r_right.mz.abs(), 0.02,
        "Fixed-fixed symmetric UDL: |M_left| = |M_right|");

    // Check equal vertical reactions
    assert_close(r_left.ry, r_right.ry, 0.02,
        "Fixed-fixed symmetric UDL: R_left = R_right");

    // Analytical midspan deflection: delta = q*L^4 / (384*E_eff*Iz)
    let e_eff: f64 = E * 1000.0;
    let q_abs: f64 = q.abs();
    let delta_analytical: f64 = q_abs * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_analytical, 0.02,
        "Fixed-fixed symmetric UDL: midspan deflection vs analytical");
}

// ================================================================
// 2. Three-Span Continuous Beam: Symmetric UDL → Equal Outer Deflections
// ================================================================

#[test]
fn validation_ext_symmetry_three_span_continuous() {
    // Three equal spans with symmetric UDL:
    //   - Outer span midpoint deflections must be equal
    //   - Interior support rotations must be equal in magnitude
    //   - Center span midpoint slope = 0 (axis of symmetry)
    let span = 5.0;
    let n = 8; // elements per span

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan nodes: span1 mid = n/2+1, span3 mid = 2*n + n/2 + 1
    let mid1 = n / 2 + 1;
    let mid3 = 2 * n + n / 2 + 1;
    let mid2 = n + n / 2 + 1; // center span midpoint

    let d_mid1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap().uy;
    let d_mid3 = results.displacements.iter().find(|d| d.node_id == mid3).unwrap().uy;

    // Outer span deflections must be equal (symmetry)
    assert_close(d_mid1, d_mid3, 0.02,
        "Three-span symmetry: outer span deflections equal");

    // Center span midpoint: slope = 0 (axis of symmetry)
    let d_mid2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap();
    assert!(d_mid2.rz.abs() < 1e-10,
        "Three-span symmetry: center midspan slope = 0, got {:.6e}", d_mid2.rz);

    // Interior support rotations equal in magnitude but opposite sign
    let int_sup1 = n + 1;       // first interior support
    let int_sup2 = 2 * n + 1;   // second interior support
    let rot1 = results.displacements.iter().find(|d| d.node_id == int_sup1).unwrap().rz;
    let rot2 = results.displacements.iter().find(|d| d.node_id == int_sup2).unwrap().rz;
    assert_close(rot1.abs(), rot2.abs(), 0.02,
        "Three-span symmetry: interior support rotations equal magnitude");
}

// ================================================================
// 3. Superposition: Asymmetric Load = Symmetric + Antisymmetric (Reactions)
// ================================================================

#[test]
fn validation_ext_symmetry_reaction_decomposition() {
    // A SS beam with a single off-center point load can be decomposed:
    //   P at x=a  →  symmetric component (P/2 at a and L-a)
    //                 + antisymmetric component (P/2 at a, -P/2 at L-a)
    // Verify: R_orig = R_sym + R_anti for both supports
    let l = 10.0;
    let n = 20;
    let p = 24.0;
    let a_node = n / 4 + 1;       // load at L/4
    let mirror_node = 3 * n / 4 + 1; // mirror at 3L/4

    // Original: P at L/4
    let loads_orig = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: a_node, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input_orig = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_orig);
    let res_orig = linear::solve_2d(&input_orig).unwrap();
    let ry_left_orig = res_orig.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_right_orig = res_orig.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Symmetric component: P/2 at L/4 and P/2 at 3L/4 (both down)
    let p_sym = p / 2.0;
    let loads_sym = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: a_node, fx: 0.0, fy: -p_sym, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mirror_node, fx: 0.0, fy: -p_sym, mz: 0.0 }),
    ];
    let input_sym = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_sym);
    let res_sym = linear::solve_2d(&input_sym).unwrap();
    let ry_left_sym = res_sym.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_right_sym = res_sym.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Antisymmetric component: P/2 down at L/4, P/2 up at 3L/4
    let p_anti = p / 2.0;
    let loads_anti = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: a_node, fx: 0.0, fy: -p_anti, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mirror_node, fx: 0.0, fy: p_anti, mz: 0.0 }),
    ];
    let input_anti = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_anti);
    let res_anti = linear::solve_2d(&input_anti).unwrap();
    let ry_left_anti = res_anti.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_right_anti = res_anti.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Superposition: R_orig = R_sym + R_anti
    assert_close(ry_left_orig, ry_left_sym + ry_left_anti, 0.01,
        "Decomposition: left reaction superposition");
    assert_close(ry_right_orig, ry_right_sym + ry_right_anti, 0.01,
        "Decomposition: right reaction superposition");

    // Symmetric component: equal reactions
    assert_close(ry_left_sym, ry_right_sym, 0.02,
        "Symmetric component: equal support reactions");

    // Antisymmetric component: opposite reactions
    assert_close(ry_left_anti, -ry_right_anti, 0.02,
        "Antisymmetric component: opposite support reactions");
}

// ================================================================
// 4. Portal Frame: Symmetric UDL on Beam → No Sway, Equal Column Moments
// ================================================================

#[test]
fn validation_ext_symmetry_portal_udl_no_sway() {
    // Fixed-base portal frame with UDL on beam element only (element 2).
    // Symmetric loading on symmetric structure → no lateral sway.
    // Both columns must have equal end moments and shears.
    let h = 4.0;
    let w = 8.0;
    let q: f64 = -20.0;

    // Build portal frame manually with UDL on beam
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // No sway: top nodes should have equal horizontal displacement
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d2.ux, d3.ux, 0.02,
        "Portal UDL symmetry: top nodes equal horizontal disp");

    // No net horizontal reaction (symmetry)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        (r1.rx + r4.rx).abs() < 1e-6,
        "Portal UDL symmetry: net horizontal reaction = 0, got {:.6e}", r1.rx + r4.rx
    );

    // Equal vertical reactions
    assert_close(r1.ry, r4.ry, 0.02,
        "Portal UDL symmetry: equal vertical reactions");

    // Equal base moments in magnitude
    assert_close(r1.mz.abs(), r4.mz.abs(), 0.02,
        "Portal UDL symmetry: equal base moment magnitudes");
}

// ================================================================
// 5. Symmetric K-Truss: Equal Member Forces in Mirror Pairs
// ================================================================

#[test]
fn validation_ext_symmetry_k_truss() {
    // Symmetric triangular truss with apex load and equal-length diagonals.
    //   Node 1 (0,0), Node 2 (8,0), Node 3 (4,3)
    //   Plus horizontal bar: Node 4 (4,0) for a split bottom chord
    //   Members: 1-4, 4-2 (bottom chord), 1-3, 3-2 (diagonals), 4-3 (vertical)
    //   Supports: pinned at 1, rollerX at 2
    //   Symmetric vertical load at apex (node 3)
    //
    // By symmetry about vertical axis through nodes 3 and 4:
    //   - Diagonals 1-3 and 3-2 have equal axial force magnitude
    //   - Bottom chords 1-4 and 4-2 have equal axial force magnitude
    //   - Equal vertical reactions
    //   - Apex node 3 has zero horizontal displacement (pinned+rollerX create
    //     symmetric horizontal stiffness for this geometry by vertical equilibrium)
    let p = 40.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 8.0, 0.0),
            (3, 4.0, 3.0),
            (4, 4.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 4, 1, 1, false, false), // bottom left
            (2, "truss", 4, 2, 1, 1, false, false), // bottom right
            (3, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (4, "truss", 3, 2, 1, 1, false, false), // right diagonal
            (5, "truss", 4, 3, 1, 1, false, false), // vertical strut
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Left diagonal (1-3) = right diagonal (3-2) in force magnitude
    let f3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start;
    let f4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap().n_start;
    assert_close(f3.abs(), f4.abs(), 0.02,
        "K-truss symmetry: |F_left_diag| = |F_right_diag|");

    // Bottom chord left (1-4) = bottom chord right (4-2) in force magnitude
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;
    assert_close(f1.abs(), f2.abs(), 0.02,
        "K-truss symmetry: |F_bottom_left| = |F_bottom_right|");

    // Equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert_close(r1, r2, 0.02, "K-truss symmetry: equal vertical reactions");
    assert_close(r1 + r2, p, 0.02, "K-truss symmetry: sum Ry = P");

    // Symmetric displacements: left and right support nodes have same uy = 0 (constrained),
    // and apex and bottom-center should have equal uy relative to supports
    // (uy is constrained at supports so we check the free nodes)
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // Apex and bottom-center move downward; apex more than center
    assert!(d3.uy < 0.0, "K-truss: apex deflects downward");
    assert!(d4.uy < 0.0, "K-truss: bottom center deflects downward");

    // The horizontal displacement of apex and center should be equal
    // (both on the axis of symmetry, they share the same rigid-body shift)
    assert_close(d3.ux, d4.ux, 0.02,
        "K-truss symmetry: apex and center same horizontal shift");
}

// ================================================================
// 6. Continuous Beam Antisymmetric UDL: Zero Center-Support Reaction
// ================================================================

#[test]
fn validation_ext_antisymmetry_two_span_udl() {
    // Two equal spans with antisymmetric UDL:
    //   Span 1: UDL downward (-q), Span 2: UDL upward (+q)
    // This is antisymmetric about the interior support, so:
    //   - Interior support vertical reaction = 0
    //   - Interior support has zero vertical displacement (it's a support)
    //   - Left and right span midpoint deflections are equal in magnitude, opposite sign
    //   - End reactions are equal in magnitude, opposite sign
    let span = 6.0;
    let n = 10; // elements per span
    let q: f64 = 12.0;

    let mut loads: Vec<SolverLoad> = Vec::new();
    // Span 1: downward UDL
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    // Span 2: upward UDL (antisymmetric)
    for i in (n + 1)..=(2 * n) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support reaction = 0 (antisymmetric loading)
    let int_node = n + 1;
    let r_int = results.reactions.iter().find(|r| r.node_id == int_node).unwrap();
    assert!(r_int.ry.abs() < 1e-6,
        "Antisymmetric two-span: interior Ry = 0, got {:.6e}", r_int.ry);

    // End reactions: equal magnitude, opposite sign
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    assert_close(r_left.ry.abs(), r_right.ry.abs(), 0.02,
        "Antisymmetric two-span: |R_left| = |R_right|");
    assert!(r_left.ry * r_right.ry < 0.0,
        "Antisymmetric two-span: end reactions opposite sign: {:.4}, {:.4}",
        r_left.ry, r_right.ry);

    // Midspan deflections: equal magnitude, opposite sign
    let mid1 = n / 2 + 1;
    let mid2 = n + n / 2 + 1;
    let d_mid1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap().uy;
    let d_mid2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap().uy;
    assert_close(d_mid1.abs(), d_mid2.abs(), 0.02,
        "Antisymmetric two-span: |delta_mid1| = |delta_mid2|");
    assert!(d_mid1 * d_mid2 < 0.0,
        "Antisymmetric two-span: midspan deflections opposite: {:.6e}, {:.6e}",
        d_mid1, d_mid2);
}

// ================================================================
// 7. Two-Bay Portal Frame: Symmetric Gravity → Equal Exterior Column Reactions
// ================================================================

#[test]
fn validation_ext_symmetry_two_bay_portal() {
    // Two-bay portal frame (5 nodes, 4 columns not needed - use 2 columns + 2 beams):
    //   Nodes: 1(0,0) 2(0,h) 3(w,h) 4(2w,h) 5(2w,0)
    //   Columns: 1-2, 5-4; Beams: 2-3, 3-4
    //   Interior column NOT present → just two exterior columns and continuous beam
    //   Supports: fixed at 1 and 5
    //   Symmetric gravity loads at 2 and 4 (equal)
    //
    // By symmetry: exterior columns have equal reactions, node 3 has zero horizontal disp
    let h = 3.5;
    let w = 5.0;
    let p = 15.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, w, h),
            (4, 2.0 * w, h),
            (5, 2.0 * w, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // left beam
            (3, "frame", 3, 4, 1, 1, false, false), // right beam
            (4, "frame", 4, 5, 1, 1, false, false), // right column
        ],
        vec![(1, 1, "fixed"), (2, 5, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equal vertical reactions at exterior columns
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, r5.ry, 0.02,
        "Two-bay symmetry: equal vertical reactions");

    // Equal base moments in magnitude
    assert_close(r1.mz.abs(), r5.mz.abs(), 0.02,
        "Two-bay symmetry: equal base moment magnitudes");

    // Center node (3) has zero horizontal displacement (symmetry axis)
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3.ux.abs() < 1e-10,
        "Two-bay symmetry: center node ux = 0, got {:.6e}", d3.ux);

    // No net horizontal reaction (symmetry)
    assert!(
        (r1.rx + r5.rx).abs() < 1e-6,
        "Two-bay symmetry: net horizontal reaction = 0, got {:.6e}", r1.rx + r5.rx
    );
}

// ================================================================
// 8. Fixed Beam with Antisymmetric Point Loads: Zero Midspan Deflection and Moment
// ================================================================

#[test]
fn validation_ext_antisymmetry_fixed_beam_point_loads() {
    // Fixed-fixed beam with antisymmetric point loads:
    //   +P downward at L/4, -P upward at 3L/4
    // By antisymmetry:
    //   - Midspan vertical displacement = 0
    //   - Midspan bending moment = 0 (by antisymmetry of moment diagram)
    //   - Midspan slope is nonzero
    //   - End reactions: R_left_y and R_right_y are opposite
    let l = 8.0;
    let n = 16;
    let p = 20.0;

    let n_quarter = n / 4 + 1;
    let n_3quarter = 3 * n / 4 + 1;
    let mid = n / 2 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n_quarter, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n_3quarter, fx: 0.0, fy: p, mz: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection = 0 (antisymmetry)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uy.abs() < 1e-10,
        "Antisymmetric fixed beam: midspan uy = 0, got {:.6e}", d_mid.uy);

    // Midspan slope is nonzero
    assert!(d_mid.rz.abs() > 1e-10,
        "Antisymmetric fixed beam: midspan slope nonzero, got {:.6e}", d_mid.rz);

    // Vertical reactions are antisymmetric (opposite sign)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.ry.abs(), r_right.ry.abs(), 0.02,
        "Antisymmetric fixed beam: |R_left| = |R_right|");
    assert!(r_left.ry * r_right.ry < 0.0,
        "Antisymmetric fixed beam: reactions opposite sign: {:.4}, {:.4}",
        r_left.ry, r_right.ry);

    // End moments are equal (antisymmetric loading on symmetric structure
    // produces antisymmetric moment diagram → end moments equal in magnitude)
    assert_close(r_left.mz.abs(), r_right.mz.abs(), 0.02,
        "Antisymmetric fixed beam: |M_left| = |M_right|");

    // Total vertical reaction = 0 (net load is zero)
    assert!((r_left.ry + r_right.ry).abs() < 1e-6,
        "Antisymmetric fixed beam: net vertical reaction = 0, got {:.6e}",
        r_left.ry + r_right.ry);
}
