/// Validation: Symmetry and Antisymmetry Properties
///
/// References:
///   - Kassimali, "Matrix Analysis of Structures", Ch. 6
///   - Ghali & Neville, "Structural Analysis", Ch. 9
///   - Bazant & Cedolin, "Stability of Structures", Ch. 2
///
/// Symmetry principles are fundamental to structural analysis:
///   - Symmetric structure + symmetric load → symmetric response
///   - Symmetric structure + antisymmetric load → antisymmetric response
///   - Any load = symmetric + antisymmetric components
///
/// Tests verify:
///   1. Symmetric beam: midspan slope = 0 under symmetric load
///   2. Antisymmetric load: midspan displacement = 0
///   3. Portal frame: symmetric gravity → equal column forces
///   4. Portal frame: antisymmetric lateral → equal but opposite moments
///   5. Two-span beam symmetry: equal midspan deflections
///   6. Decomposition: superposition of symmetric + antisymmetric
///   7. 3D beam: biaxial symmetry
///   8. Truss symmetry: equal member forces in symmetric members
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Symmetric Beam: Midspan Slope = 0
// ================================================================

#[test]
fn validation_symmetry_midspan_slope() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    // SS beam with UDL: symmetric → midspan slope = 0
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    assert!(d_mid.ry.abs() < 1e-10,
        "Symmetric UDL: θ_mid = 0: {:.6e}", d_mid.ry);
}

// ================================================================
// 2. Antisymmetric Load: Midspan δ = 0
// ================================================================

#[test]
fn validation_symmetry_antisymmetric_load() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;

    // SS beam with antisymmetric loads: +P at L/4, -P at 3L/4
    let n1 = n / 4 + 1;
    let n2 = 3 * n / 4 + 1;
    let mid = n / 2 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fz: p, my: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Antisymmetric → midspan displacement = 0
    assert!(d_mid.uz.abs() < 1e-10,
        "Antisymmetric: δ_mid = 0: {:.6e}", d_mid.uz);

    // But slope at midspan should be non-zero (max)
    assert!(d_mid.ry.abs() > 1e-10,
        "Antisymmetric: θ_mid ≠ 0: {:.6e}", d_mid.ry);
}

// ================================================================
// 3. Portal Frame: Symmetric Gravity → Equal Column Forces
// ================================================================

#[test]
fn validation_symmetry_portal_gravity() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // Symmetric frame with symmetric gravity at both top nodes
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Equal vertical reactions
    assert_close(r1.rz, r4.rz, 0.02,
        "Symmetric gravity: R1y = R4y");

    // Equal base moments (by magnitude)
    assert_close(r1.my.abs(), r4.my.abs(), 0.02,
        "Symmetric gravity: |M1| = |M4|");

    // No horizontal reaction under pure gravity (symmetric)
    assert!(r1.rx.abs() < 1e-8,
        "Symmetric gravity: Rx ≈ 0: {:.6e}", r1.rx);
}

// ================================================================
// 4. Portal Frame: Lateral → Antisymmetric Vertical Reactions
// ================================================================

#[test]
fn validation_symmetry_portal_lateral() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Vertical reactions are antisymmetric (equal magnitude, opposite sign)
    assert_close(r1.rz.abs(), r4.rz.abs(), 0.02,
        "Lateral: |R1y| = |R4y|");
    assert!(r1.rz * r4.rz < 0.0,
        "Lateral: R1y and R4y opposite: {:.4}, {:.4}", r1.rz, r4.rz);

    // Both columns carry horizontal shear in same direction
    assert_close(r1.rx, r4.rx, 0.05,
        "Lateral: similar column shear");
}

// ================================================================
// 5. Two-Span Symmetry: Equal Midspan Deflections
// ================================================================

#[test]
fn validation_symmetry_two_span() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection of span 1 vs span 2
    let mid1 = n / 2 + 1;
    let mid2 = n + n / 2 + 1;

    let d_mid1 = results.displacements.iter()
        .find(|d| d.node_id == mid1).unwrap().uz;
    let d_mid2 = results.displacements.iter()
        .find(|d| d.node_id == mid2).unwrap().uz;

    assert_close(d_mid1, d_mid2, 0.02,
        "Two-span symmetry: δ_mid1 = δ_mid2");

    // Interior support: δ = 0, θ = 0 (by symmetry)
    let d_int = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_int.uz.abs() < 1e-10, "Interior: δ = 0");
    assert!(d_int.ry.abs() < 1e-10, "Interior: θ = 0 (by symmetry)");
}

// ================================================================
// 6. Decomposition: Symmetric + Antisymmetric = Original
// ================================================================

#[test]
fn validation_symmetry_decomposition() {
    let l = 8.0;
    let n = 16;
    let p1 = 12.0; // load at L/4
    let p2 = 8.0;  // load at 3L/4

    let n1 = n / 4 + 1;
    let n2 = 3 * n / 4 + 1;
    let mid = n / 2 + 1;

    // Original loading
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let d_orig = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Symmetric component: (P1+P2)/2 at both points
    let p_sym = (p1 + p2) / 2.0;
    let loads_s = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fz: -p_sym, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fz: -p_sym, my: 0.0 }),
    ];
    let input_s = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_s);
    let d_sym = linear::solve_2d(&input_s).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Antisymmetric component: (P1-P2)/2 at L/4, -(P1-P2)/2 at 3L/4
    let p_anti = (p1 - p2) / 2.0;
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fz: -p_anti, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fz: p_anti, my: 0.0 }),
    ];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let d_anti = linear::solve_2d(&input_a).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Superposition: d_orig = d_sym + d_anti
    assert_close(d_orig, d_sym + d_anti, 0.01,
        "Decomposition: original = symmetric + antisymmetric");

    // Antisymmetric at midspan should be ~0
    assert!(d_anti.abs() < 1e-10,
        "Antisymmetric: δ_mid ≈ 0: {:.6e}", d_anti);
}

// ================================================================
// 7. 3D Beam: Biaxial Symmetry
// ================================================================

#[test]
fn validation_symmetry_3d_biaxial() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    // Load in Y → deflection in Y only
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, 0.3, A, 2e-4, 1e-4, 3e-4,
        fixed.clone(), None, loads_y);
    let results_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = results_y.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // No Z deflection for Y load
    assert!(tip_y.uz.abs() < 1e-10,
        "Y-load: uz ≈ 0: {:.6e}", tip_y.uz);

    // Load in Z → deflection in Z only
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, 0.3, A, 2e-4, 1e-4, 3e-4,
        fixed, None, loads_z);
    let results_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = results_z.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // No Y deflection for Z load
    assert!(tip_z.uy.abs() < 1e-10,
        "Z-load: uy ≈ 0: {:.6e}", tip_z.uy);
}

// ================================================================
// 8. Truss Symmetry: Equal Member Forces
// ================================================================

#[test]
fn validation_symmetry_truss_forces() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // Symmetric triangular truss with load at apex
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, w / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric diagonals should have equal forces
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;

    assert_close(f1.abs(), f2.abs(), 0.02,
        "Truss symmetry: |F1| = |F2|");

    // Equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    assert_close(r1, r2, 0.02, "Truss symmetry: R1y = R2y");
    assert_close(r1 + r2, p, 0.02, "Truss symmetry: ΣRy = P");
}
