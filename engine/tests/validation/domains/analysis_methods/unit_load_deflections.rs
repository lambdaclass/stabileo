/// Validation: Unit Load Method for Deflection Calculations
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 9 (Unit-Load Method)
///   - Kassimali, "Structural Analysis", Ch. 7
///   - Ghali & Neville, "Structural Analysis", Ch. 6
///
/// The unit load (virtual work) method gives:
///   δ = ∫ m·M/(EI) dx  for bending deflections
/// where m = moment from unit load, M = moment from real load.
///
/// We verify deflections match analytical formulas by comparing
/// FEM results to closed-form solutions.
///
/// Tests verify:
///   1. SS beam third-point load: δ at load point
///   2. SS beam quarter-point loads: midspan δ
///   3. Cantilever triangular load: tip δ
///   4. Two-span beam: midspan deflection
///   5. Truss joint deflection by unit load
///   6. Frame sway deflection
///   7. SS beam with overhang: tip deflection
///   8. Deflection reciprocity: Maxwell's theorem
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Third-Point Load
// ================================================================
//
// P at L/3 from left: δ_P = Pa²b²/(3EIL) where a=L/3, b=2L/3

#[test]
fn validation_unit_load_third_point() {
    let l = 9.0;
    let n = 18;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let a = l / 3.0;
    let b = 2.0 * l / 3.0;
    let load_node = (n as f64 / 3.0).round() as usize + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_load = results.displacements.iter()
        .find(|d| d.node_id == load_node).unwrap().uz.abs();

    // δ at load point = Pa²b²/(3EIL)
    let delta_exact = p * a * a * b * b / (3.0 * e_eff * IZ * l);
    assert_close(d_load, delta_exact, 0.02,
        "Third-point: δ = Pa²b²/(3EIL)");
}

// ================================================================
// 2. SS Beam Quarter-Point Loads (Four-Point Bending)
// ================================================================
//
// Two equal loads at L/4 and 3L/4:
// δ_mid = Pa(3L² - 4a²)/(24EI) where a = L/4

#[test]
fn validation_unit_load_quarter_points() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;
    let a = l / 4.0;

    let n1 = n / 4 + 1;
    let n2 = 3 * n / 4 + 1;
    let mid = n / 2 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // δ_mid = Pa(3L²-4a²)/(24EI) for each load, by superposition × 2
    // For symmetric loads at a and L-a, midspan deflection = Pa(3L²-4a²)/(24EI)
    // (this formula already accounts for both loads)
    let delta_exact = p * a * (3.0 * l * l - 4.0 * a * a) / (24.0 * e_eff * IZ);
    // But there are TWO loads, and the formula is for one load at 'a'.
    // For a single load at L/4: δ_mid = Pa(3L²-4a²)/(48EI)
    // With two symmetric loads: δ_mid = 2 × Pa(3L²-4a²)/(48EI) = Pa(3L²-4a²)/(24EI)
    assert_close(d_mid, delta_exact, 0.02,
        "Quarter-points: δ = Pa(3L²-4a²)/(24EI)");
}

// ================================================================
// 3. Cantilever Triangular Load: Tip Deflection
// ================================================================
//
// Triangular load: 0 at fixed end, q_max at free end
// δ_tip = q_max × L⁴ / (30EI)

#[test]
fn validation_unit_load_cantilever_triangular() {
    let l = 5.0;
    let n = 20;
    let q_max: f64 = -12.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let xi = (i - 1) as f64 / n as f64;
            let xj = i as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q_max * xi, q_j: q_max * xj,
                a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // δ = q_max × L⁴ / (30EI)
    let delta_exact = q_max.abs() * l.powi(4) / (30.0 * e_eff * IZ);
    assert_close(tip, delta_exact, 0.03,
        "Triangular cantilever: δ = qL⁴/(30EI)");
}

// ================================================================
// 4. Two-Span Continuous Beam: Midspan Deflection
// ================================================================
//
// Equal spans L with UDL q:
// δ_midspan ≈ qL⁴/(185EI) (approximate, from exact solution)

#[test]
fn validation_unit_load_two_span() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Maximum deflection occurs at midspan of each span
    let mid1 = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid1).unwrap().uz.abs();

    // For two-span equal, UDL: δ_max ≈ qL⁴/(185EI)
    // More precisely: M_int = qL²/8 for each span, but with continuity
    // M_support = -qL²/8, so δ_max ≈ 2qL⁴/(384EI) × correction
    // Exact: δ = qL⁴/(185EI) approximately
    let delta_approx = q.abs() * span.powi(4) / (185.0 * e_eff * IZ);
    assert!((d_mid - delta_approx).abs() / delta_approx < 0.15,
        "Two-span: δ ≈ qL⁴/(185EI): {:.6e} vs {:.6e}", d_mid, delta_approx);
}

// ================================================================
// 5. Truss Joint Deflection
// ================================================================
//
// Simple triangular truss: verify deflection at loaded joint

#[test]
fn validation_unit_load_truss_deflection() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;
    let a_truss = 0.001;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, w / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 0.0)],
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

    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz;

    // Joint deflection should be negative (downward) and non-zero
    assert!(d_top < 0.0, "Truss: apex deflects downward");

    // Verify non-trivial deflection exists
    assert!(d_top.abs() > 1e-6,
        "Truss: non-trivial deflection: {:.6e}", d_top.abs());
}

// ================================================================
// 6. Frame Sway Deflection
// ================================================================
//
// Portal frame under lateral load: verify sway is consistent
// with approximate formula δ ≈ FH³/(12EI_col) for rigid beam assumption

#[test]
fn validation_unit_load_frame_sway() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let e_eff = E * 1000.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // For portal frame with rigid beam (infinite beam stiffness):
    // δ = FH³/(24EI) (two fixed-free columns in parallel)
    // For finite beam stiffness, drift is larger
    let delta_rigid = f * h * h * h / (24.0 * e_eff * IZ);
    assert!(d_top > delta_rigid * 0.8,
        "Frame sway: δ ≥ rigid-beam estimate: {:.6e} vs {:.6e}", d_top, delta_rigid);
    assert!(d_top > 0.0, "Frame sway: positive drift");
}

// ================================================================
// 7. SS Beam with Overhang: Tip Deflection
// ================================================================

#[test]
fn validation_unit_load_overhang() {
    let l1 = 6.0;
    let l2 = 2.0;
    let n1: usize = 12;
    let n2: usize = 4;
    let n = n1 + n2;
    let p = 10.0;
    let e_eff = E * 1000.0;

    // Build overhang manually
    let mut nodes = std::collections::HashMap::new();
    for i in 0..=n {
        let x = if i <= n1 {
            i as f64 * l1 / n1 as f64
        } else {
            l1 + (i - n1) as f64 * l2 / n2 as f64
        };
        nodes.insert((i + 1).to_string(), SolverNode { id: i + 1, x, z: 0.0 });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        elems.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n1 + 1,
        support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_C = P×L2²(L1+L2)/(3EI)
    let delta_exact = p * l2 * l2 * (l1 + l2) / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.03,
        "Overhang: δ_C = PL2²(L1+L2)/(3EI)");
}

// ================================================================
// 8. Deflection Reciprocity (Maxwell's Theorem)
// ================================================================
//
// δ_AB = δ_BA: deflection at A due to load at B equals
// deflection at B due to load at A.

#[test]
fn validation_unit_load_reciprocity() {
    let l = 10.0;
    let n = 20;
    let p = 1.0; // unit load for reciprocity

    let node_a = n / 4 + 1; // L/4
    let node_b = 3 * n / 4 + 1; // 3L/4

    // Case 1: load at A, measure at B
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let d_ab = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == node_b).unwrap().uz;

    // Case 2: load at B, measure at A
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let d_ba = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == node_a).unwrap().uz;

    // Maxwell's theorem: δ_AB = δ_BA
    assert_close(d_ab, d_ba, 0.01,
        "Reciprocity: δ_AB = δ_BA");
}
