/// Validation: Reciprocal Theorems (Maxwell, Betti)
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 9
///   - Hibbeler, "Structural Analysis", Ch. 10
///   - Timoshenko, "Strength of Materials", Ch. 11
///
/// Maxwell's reciprocal theorem: δ_ij = δ_ji
///   (deflection at i due to unit load at j = deflection at j due to unit load at i)
///
/// Betti's theorem: P₁·δ₁₂ = P₂·δ₂₁
///   (virtual work of system 1 through displacements of system 2 = vice versa)
///
/// Tests:
///   1. Maxwell: SS beam — δ_ij = δ_ji for two points
///   2. Maxwell: cantilever — δ_ij = δ_ji
///   3. Maxwell: frame — δ_ij = δ_ji
///   4. Betti: P₁δ₁₂ = P₂δ₂₁
///   5. Maxwell: continuous beam
///   6. Maxwell: rotation-deflection reciprocity (θ_ij = δ_ji/M)
///   7. Betti: distributed + point load
///   8. Maxwell: 3D beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Maxwell: SS Beam — δ_ij = δ_ji
// ================================================================

#[test]
fn validation_reciprocal_maxwell_ss() {
    let l = 10.0;
    let n = 20;
    let p = 1.0; // unit load

    let node_i = 5;  // L/4
    let node_j = 15; // 3L/4

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_i);
    let delta_ji = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_j);
    let delta_ij = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell SS: δ_ji = δ_ij");
}

// ================================================================
// 2. Maxwell: Cantilever — δ_ij = δ_ji
// ================================================================

#[test]
fn validation_reciprocal_maxwell_cantilever() {
    let l = 6.0;
    let n = 12;
    let p = 1.0;

    let node_i = 4;  // L/3
    let node_j = 10; // 5L/6

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_beam(n, l, E, A, IZ, "fixed", None, loads_i);
    let delta_ji = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_beam(n, l, E, A, IZ, "fixed", None, loads_j);
    let delta_ij = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell cantilever: δ_ji = δ_ij");
}

// ================================================================
// 3. Maxwell: Frame — δ_ij = δ_ji
// ================================================================

#[test]
fn validation_reciprocal_maxwell_frame() {
    let h = 4.0;
    let w = 6.0;

    // Lateral load at top-left (node 2), measure horizontal at top-right (node 3)
    let input_lat = make_portal_frame(h, w, E, A, IZ, 1.0, 0.0);
    let d3_lat = linear::solve_2d(&input_lat).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Lateral load at top-right (node 3), measure horizontal at top-left (node 2)
    // Need to build custom frame with load at node 3
    let mut nodes = std::collections::HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 0.0, y: h });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: w, y: h });
    nodes.insert("4".to_string(), SolverNode { id: 4, x: w, y: 0.0 });

    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = std::collections::HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(), node_i: 4, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 1.0, fy: 0.0, mz: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let d2_from3 = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert_close(d3_lat, d2_from3, 0.01,
        "Maxwell frame: δ_32(F@2) = δ_23(F@3)");
}

// ================================================================
// 4. Betti: P₁δ₁₂ = P₂δ₂₁
// ================================================================

#[test]
fn validation_reciprocal_betti() {
    let l = 8.0;
    let n = 16;
    let p1 = 10.0;
    let p2 = 25.0;

    let node_a = 5;
    let node_b = 13;

    // System 1: P1 at node_a
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let delta_b_from1 = res1.displacements.iter().find(|d| d.node_id == node_b).unwrap().uy;

    // System 2: P2 at node_b
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p2, mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let delta_a_from2 = res2.displacements.iter().find(|d| d.node_id == node_a).unwrap().uy;

    // Betti: P1 × δ_b(system 1) = P2 × δ_a(system 2)
    // Note: both deflections are negative (downward), forces are positive magnitudes
    let work1 = p2 * delta_b_from1; // P2 acts through displacement of system 1 at node_b
    let work2 = p1 * delta_a_from2; // P1 acts through displacement of system 2 at node_a

    assert_close(work1, work2, 0.01,
        "Betti: P2×δ_b(1) = P1×δ_a(2)");
}

// ================================================================
// 5. Maxwell: Continuous Beam
// ================================================================

#[test]
fn validation_reciprocal_maxwell_continuous() {
    let span = 6.0;
    let n = 12;
    let p = 1.0;

    let node_i = 4;       // mid first span
    let node_j = n + 10;  // mid second span

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_continuous_beam(&[span, span], n, E, A, IZ, loads_i);
    let delta_ji = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_continuous_beam(&[span, span], n, E, A, IZ, loads_j);
    let delta_ij = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell continuous: δ_ji = δ_ij");
}

// ================================================================
// 6. Maxwell: Rotation-Deflection Reciprocity
// ================================================================
//
// Apply unit moment at i, measure deflection at j.
// Apply unit force at j, measure rotation at i.
// θ_j(M@i) = δ_i(P@j) / M (for unit values: θ_j = δ_i)

#[test]
fn validation_reciprocal_rotation_deflection() {
    let l = 8.0;
    let n = 16;

    let node_i = 5;
    let node_j = 13;

    // Unit moment at i, measure rotation at j
    let loads_m = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: 0.0, mz: 1.0,
    })];
    let input_m = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_m);
    let delta_j_from_m = linear::solve_2d(&input_m).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Unit force at j, measure rotation at i
    let loads_f = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_f = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_f);
    let theta_i_from_f = linear::solve_2d(&input_f).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().rz;

    // Maxwell: deflection at j from unit M at i = rotation at i from unit P at j
    // (with appropriate sign convention)
    assert_close(delta_j_from_m.abs(), theta_i_from_f.abs(), 0.01,
        "Maxwell rotation-deflection: |δ_j(M@i)| = |θ_i(P@j)|");
}

// ================================================================
// 7. Betti: Distributed + Point Load
// ================================================================

#[test]
fn validation_reciprocal_betti_distributed() {
    let l = 6.0;
    let n = 12;
    let q = -5.0;
    let p = 10.0;
    let check_node = 7;

    // System 1: UDL
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_udl);
    let res1 = linear::solve_2d(&input1).unwrap();

    // System 2: Point load at check_node
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: check_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_pt);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Betti: Work of system 1 loads through system 2 displacements
    // = Work of system 2 loads through system 1 displacements
    // W12 = Σ q × dy_2 × dx (UDL through system 2 displacements)
    // W21 = P × dy_1(check_node)
    let w21 = p * res1.displacements.iter().find(|d| d.node_id == check_node).unwrap().uy.abs();

    // W12 = integral of q × uy_2(x) dx ≈ sum over nodes
    let dx = l / n as f64;
    let w12: f64 = res2.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n + 1)
        .map(|d| {
            let weight = if d.node_id == 1 || d.node_id == n + 1 { 0.5 } else { 1.0 };
            q.abs() * d.uy.abs() * dx * weight
        })
        .sum();

    assert_close(w12, w21, 0.02,
        "Betti distributed: W12 ≈ W21");
}

// ================================================================
// 8. Maxwell: 3D Beam
// ================================================================

#[test]
fn validation_reciprocal_maxwell_3d() {
    let l = 6.0;
    let n = 12;
    let p = 1.0;

    let node_i = 4;
    let node_j = 10;

    let fixed = vec![true, true, true, true, true, true];

    // Load in Y at i, measure uy at j
    let loads_i = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_i, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_i = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed.clone(), None, loads_i);
    let delta_ji = linear::solve_3d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load in Y at j, measure uy at i
    let loads_j = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_j, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_j = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed, None, loads_j);
    let delta_ij = linear::solve_3d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell 3D: δ_ji = δ_ij");
}
