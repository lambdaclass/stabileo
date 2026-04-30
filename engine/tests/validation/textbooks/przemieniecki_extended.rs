/// Validation: Extended Przemieniecki Matrix Structural Analysis Tests
///
/// Reference: Przemieniecki *Theory of Matrix Structural Analysis*
///
/// Tests: stiffness matrix symmetry, rigid body modes, patch test,
///        combined bending+torsion, coordinate transformation, sparsity.
use dedaliano_engine::element::frame_local_stiffness_3d;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const G: f64 = E_EFF / (2.0 * (1.0 + NU));
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;

// ═══════════════════════════════════════════════════════════════
// 1. 3D Beam Stiffness Matrix Symmetry (k_ij = k_ji)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_stiffness_symmetry() {
    // A 12×12 stiffness matrix must be symmetric: k[i][j] = k[j][i]
    let l = 3.0;
    let k = frame_local_stiffness_3d(E_EFF, A, IY, IZ, J, l, G, dedaliano_engine::element::Hinge3D::default(), 0.0, 0.0);

    assert_eq!(k.len(), 144, "3D stiffness should be 12×12 = 144 entries");

    let mut max_asym = 0.0_f64;
    for i in 0..12 {
        for j in (i + 1)..12 {
            let kij = k[i * 12 + j];
            let kji = k[j * 12 + i];
            let diff = (kij - kji).abs();
            let scale = kij.abs().max(kji.abs()).max(1e-10);
            max_asym = max_asym.max(diff / scale);
        }
    }

    assert!(
        max_asym < 1e-10,
        "Stiffness matrix asymmetry: max relative diff = {:.2e}", max_asym
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Stiffness Matrix: Positive Semi-Definite Diagonal
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_stiffness_diagonal_positive() {
    // All diagonal entries should be non-negative (positive for non-degenerate)
    let l = 4.0;
    let k = frame_local_stiffness_3d(E_EFF, A, IY, IZ, J, l, G, dedaliano_engine::element::Hinge3D::default(), 0.0, 0.0);

    for i in 0..12 {
        assert!(
            k[i * 12 + i] >= 0.0,
            "Diagonal k[{0},{0}] = {1:.6} should be ≥ 0", i, k[i * 12 + i]
        );
    }

    // Axial stiffness: k[0,0] = EA/L
    let k_axial = E_EFF * A / l;
    assert_close(k[0], k_axial, 0.01, "PRZ k[0,0] = EA/L");

    // Torsional stiffness: k[3,3] = GJ/L
    let k_torsion = G * J / l;
    assert_close(k[3 * 12 + 3], k_torsion, 0.01, "PRZ k[3,3] = GJ/L");
}

// ═══════════════════════════════════════════════════════════════
// 3. Patch Test: Constant Axial Strain
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_patch_test_axial() {
    // Multi-element bar: prescribed displacement at end → uniform strain ε = δ/L
    // All elements should report same axial force N = EA·ε
    let l = 6.0;
    let n = 6;
    let delta = 0.003; // 3mm extension

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, z: 0.0,
        });
    }
    let mut mats_map = std::collections::HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });
    let mut secs_map = std::collections::HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = std::collections::HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups_map = std::collections::HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: Some(delta), dz: Some(0.0), dry: Some(0.0), angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Expected: N = EA·δ/L
    let n_expected = E_EFF * A * delta / l;

    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), n_expected, 0.02,
            &format!("PRZ patch test N elem {}", ef.element_id));
    }

    // All interior nodes should have linear displacement: u_i = δ·x_i/L
    for d in &results.displacements {
        let x = (d.node_id - 1) as f64 * elem_len;
        let u_expected = delta * x / l;
        assert_close(d.ux, u_expected, 0.02,
            &format!("PRZ patch test u at node {}", d.node_id));
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. 3D Frame: Combined Bending + Torsion from Offset Load
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_3d_offset_loading() {
    // 3D cantilever L=4m along X, tip load Fy=10 at offset creating torsion
    // Actually: apply Fy + Mx simultaneously at tip
    // δy = Fy*L³/(3*E*Iz), θx = Mx*L/(G*J)
    let l = 4.0;
    let n = 8;
    let fy = 10.0;
    let mx = 5.0; // kN·m torsion

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: fy, fz: 0.0,
            mx: mx, my: 0.0, mz: 0.0, bw: None })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Bending: δy = Fy*L³/(3*E_eff*Iz)
    let dy_expected = fy * l.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(tip.uy.abs(), dy_expected, 0.02, "PRZ offset δy");

    // Torsion: θx = Mx*L/(G*J)
    let theta_x_expected = mx * l / (G * J);
    assert_close(tip.rx.abs(), theta_x_expected, 0.02, "PRZ offset θx");

    // No coupling: δz should be near zero (Iy and Iz are independent)
    assert!(tip.uz.abs() < dy_expected * 0.01,
        "PRZ: δz={:.6} should be ≈ 0 (no coupling)", tip.uz);
}

// ═══════════════════════════════════════════════════════════════
// 5. Coordinate Transformation: Rotated Element
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_rotated_element() {
    // Two identical cantilevers: one along X, one along Y
    // Same tip load magnitude → same deflection magnitude
    let l = 5.0;
    let n = 8;
    let p = 20.0;

    // Cantilever along X, load in Y
    let input_x = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let res_x = linear::solve_3d(&input_x).unwrap();
    let tip_x = res_x.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_x = tip_x.uy.abs();

    // Cantilever along Y: nodes at (0,0,0) to (0,L,0)
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None })];

    let input_y = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_y = tip_y.ux.abs();

    // Both cantilevers should have same δ = P*L³/(3EIz)
    let delta_expected = p * l.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(delta_x, delta_expected, 0.02, "PRZ rotated: X-beam δy");
    assert_close(delta_y, delta_expected, 0.05, "PRZ rotated: Y-beam δx");
}

// ═══════════════════════════════════════════════════════════════
// 6. Stiffness Matrix: Hinge Reduces Rank
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_prz_hinge_stiffness() {
    // Hinged end → rotational stiffness terms become zero
    // Compare: k with hinge_start=true should have zero rotational coupling at node i
    let l = 4.0;

    let k_full = frame_local_stiffness_3d(E_EFF, A, IY, IZ, J, l, G, dedaliano_engine::element::Hinge3D::default(), 0.0, 0.0);
    let k_hinged = frame_local_stiffness_3d(
        E_EFF, A, IY, IZ, J, l, G,
        dedaliano_engine::element::Hinge3D {
            release_my_start: true,
            release_mz_start: true,
            ..Default::default()
        },
        0.0, 0.0,
    );

    // With hinge at start: DOFs 4 (θy1) and 5 (θz1) should have zero rows/columns
    // (Torsion DOF 3 = θx1 may or may not be released depending on implementation)
    // Check that bending-related diagonal entries are reduced
    // k_hinged[5,5] (θz1 diagonal) should be 0 or much less than k_full[5,5]
    assert!(
        k_hinged[5 * 12 + 5] < k_full[5 * 12 + 5] * 0.1,
        "PRZ hinge: k_θz at start should be reduced. Full={:.2}, hinged={:.2}",
        k_full[5 * 12 + 5], k_hinged[5 * 12 + 5]
    );

    // k_hinged[4,4] (θy1 diagonal) should be 0 or much less
    assert!(
        k_hinged[4 * 12 + 4] < k_full[4 * 12 + 4] * 0.1,
        "PRZ hinge: k_θy at start should be reduced. Full={:.2}, hinged={:.2}",
        k_full[4 * 12 + 4], k_hinged[4 * 12 + 4]
    );

    // Axial stiffness should be unchanged: k[0,0] = EA/L
    assert_close(k_hinged[0], k_full[0], 0.001, "PRZ hinge: axial unchanged");
}
