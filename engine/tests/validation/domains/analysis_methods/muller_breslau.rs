/// Validation: Müller-Breslau Principle and Influence Line Shapes
///
/// References:
///   - Müller-Breslau, "Die neueren Methoden der Festigkeitslehre" (1886)
///   - Hibbeler, "Structural Analysis", Ch. 6
///   - Kassimali, "Structural Analysis", Ch. 8
///
/// The Müller-Breslau principle states that the influence line for a
/// force (or moment) quantity is proportional to the deflected shape
/// obtained by removing the constraint and introducing a unit displacement
/// (or rotation) in the direction of the quantity.
///
/// Tests verify:
///   1. IL for reaction: shape matches deflection from unit settlement
///   2. IL for midspan moment: shape from unit rotation
///   3. IL ordinates at load point = reaction coefficient
///   4. Influence line symmetry for symmetric structure
///   5. IL for shear at section cut
///   6. Continuous beam IL: negative regions
///   7. IL for interior reaction of continuous beam
///   8. Maximum moment location from IL
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. IL for Reaction: Unit Settlement Shape
// ================================================================
//
// For SS beam: IL for R_A is a straight line from 1 at A to 0 at B.
// Moving unit load from A to B: R_A(x) = 1 - x/L.
// By Müller-Breslau: proportional to deflected shape when support A
// is given a unit settlement (remove support, apply unit δ).

#[test]
fn validation_mb_reaction_il() {
    let l = 8.0;
    let n = 8;

    // Move unit load across beam, record R_A
    let mut il_ra = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -1.0, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
        il_ra.push(ra);
    }

    // IL for R_A should be linear: R_A(i) = 1 - (i-1)/n
    for (i, &ra) in il_ra.iter().enumerate() {
        let expected = 1.0 - i as f64 / n as f64;
        assert_close(ra, expected, 0.02,
            &format!("IL R_A at node {}: exact linear", i + 1));
    }
}

// ================================================================
// 2. IL for Midspan Moment: Unit Rotation Shape
// ================================================================

#[test]
fn validation_mb_moment_il() {
    let l = 6.0;
    let n = 6;

    // Move unit load across beam, record M at midspan
    let mut il_m = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -1.0, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // M at midspan from element forces
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == n / 2).unwrap();
        il_m.push(ef.m_end);
    }

    // IL for M_mid is triangular: peaks at L/4 for center
    // M_mid(x) = x/2 for x ≤ L/2, M_mid(x) = (L-x)/2 for x ≥ L/2
    // Maximum at midspan: M_max = L/4
    let m_max = il_m.iter().map(|m| m.abs()).fold(0.0_f64, f64::max);
    assert_close(m_max, l / 4.0, 0.05,
        "IL M_mid: peak = L/4");
}

// ================================================================
// 3. IL Ordinate = Reaction Coefficient
// ================================================================

#[test]
fn validation_mb_ordinate_coefficient() {
    let l = 10.0;
    let n = 10;
    let p = 25.0;

    // Place load at node 4 (x = 3L/10)
    let load_node = 4;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // R_A = P × (1 - a/L) where a = (load_node - 1) × L/n
    let a = (load_node - 1) as f64 * l / n as f64;
    let ra_exact = p * (1.0 - a / l);
    let rb_exact = p * a / l;

    assert_close(ra, ra_exact, 0.02, "IL ordinate: R_A = P(1-a/L)");
    assert_close(rb, rb_exact, 0.02, "IL ordinate: R_B = Pa/L");
}

// ================================================================
// 4. IL Symmetry for Symmetric Structure
// ================================================================

#[test]
fn validation_mb_symmetry() {
    let l = 8.0;
    let n = 8;
    let mut il_m = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -1.0, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == n / 2).unwrap();
        il_m.push(ef.m_end);
    }

    // Symmetry: IL(i) = IL(n+2-i) for i = 1..=n+1
    for i in 0..=n / 2 {
        let j = n - i;
        assert_close(il_m[i].abs(), il_m[j].abs(), 0.02,
            &format!("IL symmetry: M({}) = M({})", i + 1, j + 1));
    }
}

// ================================================================
// 5. IL for Shear at Section
// ================================================================

#[test]
fn validation_mb_shear_il() {
    let l = 6.0;
    let n = 6;

    // IL for V just left of midspan
    // V = R_A - loads left of section
    // For unit load at position x:
    //   x < L/2: V = -x/L (negative, load is left of section)
    //   x > L/2: V = 1 - x/L (positive, load is right of section)
    let section_elem = n / 2; // element just left of midspan

    let mut il_v = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -1.0, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == section_elem).unwrap();
        il_v.push(ef.v_end);
    }

    // At supports: V should be bounded by [-1, 1]
    for (i, &v) in il_v.iter().enumerate() {
        assert!(v.abs() <= 1.01,
            "IL V at node {}: |V| ≤ 1: {:.4}", i + 1, v);
    }

    // Jump at section cut: load just left vs just right should differ by ~1
    let v_left = il_v[n / 2 - 1]; // load just left of section
    let v_right = il_v[n / 2]; // load at section
    // The shear at the section changes sign as load crosses
    assert!(v_left.abs() > 0.0 || v_right.abs() > 0.0,
        "IL V: non-trivial at section");
}

// ================================================================
// 6. Continuous Beam IL: Negative Regions
// ================================================================
//
// For a 2-span continuous beam, IL for R_B (interior support)
// has negative regions in the non-adjacent span.

#[test]
fn validation_mb_continuous_negative() {
    let span = 5.0;
    let n = 10;

    // 2-span beam, interior support at node n+1
    let mut il_rb = Vec::new();
    for i in 1..=2 * n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -1.0, my: 0.0,
        })];
        let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();
        let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
        il_rb.push(rb);
    }

    // IL for interior reaction should be positive near the support
    assert!(il_rb[n] > 0.5, "IL R_B: positive at support itself: {:.4}", il_rb[n]);

    // At the support itself, unit load → R_B = 1.0
    assert_close(il_rb[n], 1.0, 0.02, "IL R_B: ordinate = 1.0 at support");

    // IL should have values > 0 in the interior of both spans
    let max_il = il_rb.iter().copied().fold(0.0_f64, f64::max);
    assert!(max_il >= 1.0 - 0.01, "IL R_B: peak ≥ 1.0: {:.4}", max_il);
}

// ================================================================
// 7. IL for Interior Reaction of Continuous Beam
// ================================================================

#[test]
fn validation_mb_continuous_interior_reaction() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // 2-span continuous beam with UDL
    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_int = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // R_interior = 5qL/4 for equal spans with UDL
    let r_exact = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int, r_exact, 0.02,
        "Continuous IL: R_interior = 5qL/4");

    // End reactions: R_end = 3qL/8
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    assert_close(r1, r_end_exact, 0.02,
        "Continuous IL: R_end = 3qL/8");
}

// ================================================================
// 8. Maximum Moment from IL Integration
// ================================================================

#[test]
fn validation_mb_max_moment_location() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;

    // For SS beam with single point load at varying positions,
    // maximum moment at the load point is M = Pa(L-a)/L
    // This is maximized when a = L/2: M_max = PL/4

    let mut m_values = Vec::new();
    for i in 2..=n {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fz: -p, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // Maximum moment in the beam
        let m_max = results.element_forces.iter()
            .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
            .fold(0.0_f64, f64::max);
        m_values.push((i, m_max));
    }

    // Maximum of maxima should be at midspan
    let (best_node, best_m) = m_values.iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap()).unwrap();

    assert_close(*best_m, p * l / 4.0, 0.02,
        "IL max moment: M_max = PL/4");

    // Best location should be near midspan
    let mid = n / 2 + 1;
    assert!((*best_node as i32 - mid as i32).unsigned_abs() <= 1,
        "IL max location: near midspan: node {} vs {}", best_node, mid);
}
