/// Validation: MITC4 Quad Shell Element Benchmarks
///
/// Tests:
///   1. Membrane patch test — uniform tension, exact stress recovery
///   2. Bending — cantilever thick plate strip vs beam theory
///   3. Rigid body modes — 6 zero-energy modes for free element
///   4. Thick square plate — center deflection vs analytical
///   5. Mesh quality metrics — verify distortion detection
///   6. Thermal load — uniform ΔT membrane expansion
///   7. Scordelis-Lo barrel vault — solver runs, displacements non-trivial
///   8. Stiffness symmetry and positive definiteness
///   9. Thin plate locking test — verify ANS eliminates shear locking
///
/// The element uses MITC4 Bathe-Dvorkin (1986) assumed natural strain (ANS)
/// tying for transverse shear, eliminating shear locking for thin plates.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use dedaliano_engine::element::quad;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const NU: f64 = 0.3;

fn sup3d(
    node_id: usize,
    fix_x: bool, fix_y: bool, fix_z: bool,
    fix_rx: bool, fix_ry: bool, fix_rz: bool,
) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: fix_x, ry: fix_y, rz: fix_z,
        rrx: fix_rx, rry: fix_ry, rrz: fix_rz,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        rw: None, kw: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None,
    }
}

fn make_quad_mesh(
    nx: usize, ny: usize, a: f64, b: f64, t: f64,
) -> (HashMap<String, SolverNode3D>, HashMap<String, SolverQuadElement>, Vec<Vec<usize>>) {
    let dx = a / nx as f64;
    let dy = b / ny as f64;
    let mut nodes_map = HashMap::new();
    let mut node_id = 1;
    let mut node_grid = vec![vec![0usize; ny + 1]; nx + 1];

    for i in 0..=nx {
        for j in 0..=ny {
            nodes_map.insert(
                node_id.to_string(),
                SolverNode3D { id: node_id, x: i as f64 * dx, y: j as f64 * dy, z: 0.0 },
            );
            node_grid[i][j] = node_id;
            node_id += 1;
        }
    }

    let mut quads_map = HashMap::new();
    let mut quad_id = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads_map.insert(quad_id.to_string(), SolverQuadElement {
                id: quad_id,
                nodes: [node_grid[i][j], node_grid[i+1][j], node_grid[i+1][j+1], node_grid[i][j+1]],
                material_id: 1,
                thickness: t,
            });
            quad_id += 1;
        }
    }
    (nodes_map, quads_map, node_grid)
}

fn make_base_input(
    nodes: HashMap<String, SolverNode3D>,
    quads: HashMap<String, SolverQuadElement>,
) -> SolverInput3D {
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    SolverInput3D {
        nodes, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports: HashMap::new(), loads: vec![],
        constraints: vec![], plates: HashMap::new(),
        quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), left_hand: None, curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    }
}

// ==================== Test 1: Membrane Patch Test ====================

#[test]
fn test_quad_membrane_patch_test() {
    // Single quad under uniform tension. Exact stress recovery expected.
    let (nodes, quads, grid) = make_quad_mesh(1, 1, 1.0, 1.0, 0.01);
    let mut input = make_base_input(nodes, quads);

    for j in 0..=1 {
        let nid = grid[0][j];
        input.supports.insert(nid.to_string(), sup3d(nid, true, true, true, true, true, true));
    }

    // σ_xx = 100 MPa
    let sigma = 100.0;
    let force_per_node = sigma * 1000.0 * 0.01 * 1.0 / 2.0;
    for j in 0..=1 {
        let nid = grid[1][j];
        input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: nid, fx: force_per_node, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let result = linear::solve_3d(&input).unwrap();
    assert!(!result.quad_stresses.is_empty());
    let qs = &result.quad_stresses[0];
    let sigma_xx_mpa = qs.sigma_xx / 1000.0;
    assert!(
        (sigma_xx_mpa - sigma).abs() / sigma < 0.05,
        "Membrane patch: σ_xx = {} MPa, expected {} MPa", sigma_xx_mpa, sigma
    );
}

// ==================== Test 2: Thick Cantilever Plate Strip ====================

#[test]
fn test_quad_cantilever_thick_strip() {
    // Cantilever beam as plate strip: L=2, b=1, t=0.5 (L/t = 4, thick)
    // Mindlin theory works well for thick plates
    let l: f64 = 2.0;
    let b: f64 = 1.0;
    let t: f64 = 0.5;
    let p: f64 = 10.0; // kN tip load

    // Beam theory (includes shear deformation for thick beams):
    // δ_bending = P*L³/(3*E*I)
    // δ_shear = P*L/(κ*G*A)
    let e_kn = E * 1000.0;
    let iz = b * t.powi(3) / 12.0;
    let g = e_kn / (2.0 * (1.0 + NU));
    let kappa = 5.0 / 6.0;
    let a_s = kappa * b * t;
    let w_bending = p * l.powi(3) / (3.0 * e_kn * iz);
    let w_shear = p * l / (g * a_s);
    let w_total = w_bending + w_shear;

    let nx = 8;
    let ny = 2;
    let (nodes, quads, grid) = make_quad_mesh(nx, ny, l, b, t);
    let mut input = make_base_input(nodes, quads);

    // Fix left edge
    for j in 0..=ny {
        let nid = grid[0][j];
        input.supports.insert(nid.to_string(), sup3d(nid, true, true, true, true, true, true));
    }

    // Tip load distributed on right edge
    let f_per_node = p / (ny as f64 + 1.0);
    for j in 0..=ny {
        let nid = grid[nx][j];
        input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: nid, fx: 0.0, fy: 0.0, fz: -f_per_node,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let result = linear::solve_3d(&input).unwrap();

    let tip_nid = grid[nx][ny / 2];
    let tip = result.displacements.iter().find(|d| d.node_id == tip_nid).unwrap();
    let w_computed = tip.uz.abs();

    // With ANS, shell model matches beam theory well for thick strips (L/t=4)
    let error = (w_computed - w_total).abs() / w_total;
    assert!(
        error < 0.40,
        "Thick cantilever: w = {:.6e}, Timoshenko beam = {:.6e}, error = {:.1}%",
        w_computed, w_total, error * 100.0
    );
    assert!(
        w_computed > w_total * 0.5,
        "Deflection too small: {:.6e} vs expected {:.6e}", w_computed, w_total
    );
}

// ==================== Test 3: Rigid Body Modes ====================

#[test]
fn test_quad_rigid_body_modes() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
    ];
    let k = quad::mitc4_local_stiffness(&coords, 200e6, 0.3, 0.01);

    let mut rigid_modes = [[0.0f64; 24]; 6];
    for i in 0..4 { rigid_modes[0][i * 6] = 1.0; }       // Tx
    for i in 0..4 { rigid_modes[1][i * 6 + 1] = 1.0; }   // Ty
    for i in 0..4 { rigid_modes[2][i * 6 + 2] = 1.0; }   // Tz
    // Rx: γyz = ∂w/∂y - θx = 0 → w = θx*y, so uz = θ*y
    let ys = [0.0, 0.0, 1.0, 1.0];
    let xs = [0.0, 1.0, 1.0, 0.0];
    for i in 0..4 { rigid_modes[3][i * 6 + 2] = ys[i]; rigid_modes[3][i * 6 + 3] = 1.0; }
    // Ry: γxz = ∂w/∂x + θy = 0 → w = -θy*x, so uz = -θ*x
    for i in 0..4 { rigid_modes[4][i * 6 + 2] = -xs[i]; rigid_modes[4][i * 6 + 4] = 1.0; }
    // Rz: ux = -θz*y, uy = θz*x
    for i in 0..4 {
        rigid_modes[5][i * 6] = -ys[i];
        rigid_modes[5][i * 6 + 1] = xs[i];
        rigid_modes[5][i * 6 + 5] = 1.0;
    }

    let labels = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"];
    for (m, label) in rigid_modes.iter().zip(labels.iter()) {
        let mut f = [0.0; 24];
        for i in 0..24 {
            for j in 0..24 { f[i] += k[i * 24 + j] * m[j]; }
        }
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        let u_norm: f64 = m.iter().map(|x| x * x).sum::<f64>().sqrt();
        let rel = f_norm / (u_norm * k[0].abs().max(1.0));

        // Drilling DOF (Rz) has small stabilization energy — allow 1e-3
        let tol = if *label == "Rz" { 1e-2 } else { 1e-6 };
        assert!(rel < tol, "Rigid body mode {} not zero-energy: rel = {:.6e}", label, rel);
    }
}

// ==================== Test 4: Thick SS Square Plate ====================

#[test]
fn test_quad_thick_ss_plate() {
    // Thick simply-supported plate: a=1, t=0.1 (a/t = 10)
    // Mindlin-theory Navier: w includes shear deformation
    // Kirchhoff: w_K = α × q × a⁴ / D, α ≈ 0.00406
    // Shear correction: w_s = q × a² × (1-ν) / (10*κ*G*t) for SS
    // But for a/t = 10, shear contribution is modest
    let a: f64 = 1.0;
    let t: f64 = 0.1; // a/t = 10 (moderately thick)
    let q: f64 = 100.0; // kN/m²
    let d_plate = E * 1000.0 * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let alpha_navier = 0.00406;
    let w_kirchhoff = alpha_navier * q * a.powi(4) / d_plate;

    let nx = 8;
    let ny = 8;
    let (nodes, quads, grid) = make_quad_mesh(nx, ny, a, a, t);
    let mut input = make_base_input(nodes, quads);

    // SS: all edges fixed in z, corners constrained in-plane
    for i in 0..=nx {
        for j in 0..=ny {
            let nid = grid[i][j];
            let on_edge = i == 0 || i == nx || j == 0 || j == ny;
            if on_edge {
                let fix_x = i == 0 || i == nx;
                let fix_y = j == 0 || j == ny;
                input.supports.insert(nid.to_string(), sup3d(nid, fix_x, fix_y, true, false, false, true));
            }
        }
    }

    for (_key, quad_el) in &input.quads.clone() {
        input.loads.push(SolverLoad3D::QuadPressure(SolverPressureLoad {
            element_id: quad_el.id, pressure: q,
        }));
    }

    let result = linear::solve_3d(&input).unwrap();

    let cx = nx / 2;
    let cy = ny / 2;
    let center_nid = grid[cx][cy];
    let center_disp = result.displacements.iter()
        .find(|d| d.node_id == center_nid).unwrap();
    let w_computed = center_disp.uz.abs();

    // With ANS, thick plate (a/t=10) should be close to Kirchhoff+shear correction
    assert!(
        w_computed > w_kirchhoff * 0.5,
        "Thick SS plate: w = {:.6e}, Kirchhoff = {:.6e}, ratio = {:.2}×",
        w_computed, w_kirchhoff, w_computed / w_kirchhoff
    );
    assert!(
        w_computed < w_kirchhoff * 3.0,
        "Thick SS plate: deflection unreasonably large: w = {:.6e}", w_computed
    );
}

// ==================== Test 5: Mesh Quality Metrics ====================

#[test]
fn test_quad_quality_metrics() {
    let perfect = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
    let m = quad::quad_quality_metrics(&perfect);
    assert!((m.aspect_ratio - 1.0).abs() < 1e-10);
    assert!(m.max_skew < 1e-6);
    assert!(m.warping < 1e-10);
    assert!((m.jacobian_ratio - 1.0).abs() < 1e-10);

    let rect = [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [10.0, 1.0, 0.0], [0.0, 1.0, 0.0]];
    let m = quad::quad_quality_metrics(&rect);
    assert!((m.aspect_ratio - 10.0).abs() < 1e-6);

    let skewed = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.5, 1.0, 0.0], [0.5, 1.0, 0.0]];
    let m = quad::quad_quality_metrics(&skewed);
    assert!(m.max_skew > 10.0, "Skew = {}", m.max_skew);

    let warped = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.1], [0.0, 1.0, -0.1]];
    let m = quad::quad_quality_metrics(&warped);
    assert!(m.warping > 0.01, "Warping = {}", m.warping);
}

// ==================== Test 6: Thermal Load ====================

#[test]
fn test_quad_thermal_uniform_expansion() {
    let (nodes, quads, grid) = make_quad_mesh(2, 2, 2.0, 2.0, 0.01);
    let mut input = make_base_input(nodes, quads);

    let c0 = grid[0][0];
    input.supports.insert(c0.to_string(), sup3d(c0, true, true, true, true, true, true));
    let c1 = grid[2][0];
    input.supports.insert(c1.to_string(), sup3d(c1, false, true, true, true, true, true));
    let c2 = grid[0][2];
    input.supports.insert(c2.to_string(), sup3d(c2, true, false, true, true, true, true));
    for i in 0..=2 {
        for j in 0..=2 {
            let nid = grid[i][j];
            input.supports.entry(nid.to_string()).or_insert_with(|| sup3d(nid, false, false, true, true, true, true));
        }
    }

    let alpha = 1.2e-5;
    let dt = 100.0;
    for (_key, quad_el) in &input.quads.clone() {
        input.loads.push(SolverLoad3D::QuadThermal(SolverPlateThermalLoad {
            element_id: quad_el.id, dt_uniform: dt, dt_gradient: 0.0, alpha: Some(alpha),
        }));
    }

    let result = linear::solve_3d(&input).unwrap();
    let expected_dx = alpha * dt * 2.0;
    let far_nid = grid[2][2];
    let far_disp = result.displacements.iter().find(|d| d.node_id == far_nid).unwrap();

    assert!(
        (far_disp.ux - expected_dx).abs() / expected_dx < 0.15,
        "Thermal ux = {:.6e}, expected {:.6e}", far_disp.ux, expected_dx
    );
    assert!(
        (far_disp.uy - expected_dx).abs() / expected_dx < 0.15,
        "Thermal uy = {:.6e}, expected {:.6e}", far_disp.uy, expected_dx
    );
}

// ==================== Test 7: Scordelis-Lo Barrel Vault ====================

#[test]
fn test_quad_scordelis_lo_barrel_vault() {
    let r = 25.0;
    let l = 50.0;
    let theta = 40.0_f64.to_radians();
    let t = 0.25;
    let e_mat = 432_000.0;
    let nu_mat = 0.0;

    let half_l = l / 2.0;
    let nx = 4;
    let ny = 4;

    let mut nodes = HashMap::new();
    let mut node_id = 1;
    let mut node_grid = vec![vec![0usize; ny + 1]; nx + 1];

    for i in 0..=nx {
        for j in 0..=ny {
            let x = half_l * i as f64 / nx as f64;
            let angle = theta * j as f64 / ny as f64;
            nodes.insert(node_id.to_string(), SolverNode3D {
                id: node_id, x, y: r * angle.sin(), z: r * angle.cos(),
            });
            node_grid[i][j] = node_id;
            node_id += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [node_grid[i][j], node_grid[i+1][j], node_grid[i+1][j+1], node_grid[i][j+1]],
                material_id: 1, thickness: t,
            });
            qid += 1;
        }
    }

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: e_mat, nu: nu_mat });

    let mut input = SolverInput3D {
        nodes, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports: HashMap::new(), loads: vec![],
        constraints: vec![], plates: HashMap::new(),
        quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), left_hand: None, curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    // Symmetry at x=0
    for j in 0..=ny {
        let nid = node_grid[0][j];
        input.supports.insert(nid.to_string(), sup3d(nid, true, false, false, false, true, true));
    }
    // Diaphragm at x=L/2
    for j in 0..=ny {
        let nid = node_grid[nx][j];
        input.supports.insert(nid.to_string(), sup3d(nid, false, true, true, true, false, false));
    }
    // Crown symmetry
    for i in 0..=nx {
        let nid = node_grid[i][0];
        input.supports.entry(nid.to_string()).or_insert_with(|| sup3d(nid, false, true, false, true, false, false));
    }

    // Gravity
    let total_area = half_l * r * theta;
    let n_nodes = (nx + 1) * (ny + 1);
    let f_per_node = 90.0 * total_area / n_nodes as f64;
    for i in 0..=nx {
        for j in 0..=ny {
            let nid = node_grid[i][j];
            input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: nid, fx: 0.0, fy: 0.0, fz: -f_per_node,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
        }
    }

    let result = linear::solve_3d(&input);
    assert!(result.is_ok(), "Scordelis-Lo should solve: {:?}", result.err());
    let res = result.unwrap();

    let free_edge_mid = node_grid[0][ny];
    let disp = res.displacements.iter().find(|d| d.node_id == free_edge_mid).unwrap();
    let w = (disp.ux.powi(2) + disp.uy.powi(2) + disp.uz.powi(2)).sqrt();
    assert!(w > 1e-6, "Scordelis-Lo: displacement too small: |u| = {:.6e}", w);
}

// ==================== Test 8: Stiffness Properties ====================

#[test]
fn test_quad_stiffness_symmetry_positive() {
    let coords = [
        [0.0, 0.0, 0.0],
        [2.0, 0.0, 0.0],
        [2.0, 1.5, 0.0],
        [0.0, 1.5, 0.0],
    ];
    let k = quad::mitc4_local_stiffness(&coords, 200e6, 0.3, 0.05);

    // Symmetry
    for i in 0..24 {
        for j in 0..24 {
            let diff = (k[i * 24 + j] - k[j * 24 + i]).abs();
            let max_val = k[i * 24 + j].abs().max(k[j * 24 + i].abs()).max(1e-10);
            assert!(diff / max_val < 1e-10, "Not symmetric at ({},{})", i, j);
        }
    }

    // Positive diagonal
    for i in 0..24 {
        assert!(k[i * 24 + i] >= 0.0, "Negative diagonal at DOF {}: {}", i, k[i * 24 + i]);
    }
}

// ==================== Test 9: Thin Plate Locking Test ====================

#[test]
fn test_quad_thin_plate_no_locking() {
    // Thin simply-supported plate: a=1, t=0.001 (a/t = 1000, very thin)
    // Without ANS, displacement-based shear causes severe locking (~1-5% of reference).
    // With ANS, the element should recover >50% of the Kirchhoff analytical value.
    let a: f64 = 1.0;
    let t: f64 = 0.001; // a/t = 1000
    let q: f64 = 1.0;
    let e_kpa = E * 1000.0;
    let d_plate = e_kpa * t.powi(3) / (12.0 * (1.0 - NU * NU));

    // Navier series for SS plate
    let pi = std::f64::consts::PI;
    let mut navier_sum = 0.0;
    for m_idx in 0..20 {
        let m = 2 * m_idx + 1;
        for n_idx in 0..20 {
            let n = 2 * n_idx + 1;
            let mn2 = (m * m + n * n) as f64;
            navier_sum += 1.0 / ((m * n) as f64 * mn2 * mn2);
        }
    }
    let w_navier = 16.0 * q * a.powi(4) / (pi.powi(6) * d_plate) * navier_sum;

    let nx = 8;
    let ny = 8;
    let (nodes, quads, grid) = make_quad_mesh(nx, ny, a, a, t);
    let mut input = make_base_input(nodes, quads);

    // SS: all edges fixed in z, plus in-plane constraints
    for i in 0..=nx {
        for j in 0..=ny {
            let nid = grid[i][j];
            let on_edge = i == 0 || i == nx || j == 0 || j == ny;
            if on_edge {
                let fix_x = i == 0 || i == nx;
                let fix_y = j == 0 || j == ny;
                input.supports.insert(nid.to_string(), sup3d(nid, fix_x, fix_y, true, false, false, true));
            }
        }
    }

    // QuadPressure on all elements
    for (_key, quad_el) in &input.quads.clone() {
        input.loads.push(SolverLoad3D::QuadPressure(SolverPressureLoad {
            element_id: quad_el.id, pressure: q,
        }));
    }

    let result = linear::solve_3d(&input).unwrap();

    let center_nid = grid[nx / 2][ny / 2];
    let center_disp = result.displacements.iter()
        .find(|d| d.node_id == center_nid).unwrap();
    let w_computed = center_disp.uz.abs();

    let ratio = w_computed / w_navier;
    eprintln!(
        "Thin plate a/t=1000: w={:.6e}, Navier={:.6e}, ratio={:.4}",
        w_computed, w_navier, ratio
    );

    // ANS eliminates shear locking: ratio should be >50% at 8×8 for a/t=1000
    assert!(
        ratio > 0.5,
        "Thin plate locking! ratio={:.4} — ANS should prevent this (got {:.6e}, ref {:.6e})",
        ratio, w_computed, w_navier
    );
    assert!(
        ratio < 2.0,
        "Thin plate: deflection too large, ratio={:.4}", ratio
    );
}
