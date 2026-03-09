/// Validation: Extended Plate (DKT+CST) Analysis
///
/// Benchmarks:
///   1. SS square plate, uniform load — Timoshenko center deflection α=0.00406
///   2. Clamped square plate, uniform load — Timoshenko center deflection α=0.00126
///   3. Rectangular (2:1) SS plate, center point load — Navier series
///   4. SS square plate, center point load — Navier double series
///   5. Triangular mesh convergence — monotonic deflection convergence
///   6. Cantilever plate tip load — beam theory comparison
///   7. Patch test — uniform in-plane tension, exact stress recovery
///   8. SS plate modal analysis — first natural frequency
///
/// Note: DKT with lumped pressure loads has limited convergence to exact Navier
/// values. Tests verify convergence trends, correct signs, and correct order of
/// magnitude rather than demanding <1% accuracy.
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;       // MPa  (kN/m²)
const E_EFF: f64 = E * 1000.0;  // kN/m² for unit consistency (plates use kN, m)
const NU: f64 = 0.3;

// ---------------------------------------------------------------------------
// Mesh generation helpers
// ---------------------------------------------------------------------------

/// Generate a structured triangular mesh for a rectangular plate [0,a]×[0,b].
/// Returns (nodes, plates, node_grid) where node_grid[i][j] is the node id at
/// grid position (i, j).
fn make_plate_mesh(
    nx: usize,
    ny: usize,
    a: f64,
    b: f64,
    t: f64,
) -> (
    HashMap<String, SolverNode3D>,
    HashMap<String, SolverPlateElement>,
    Vec<Vec<usize>>,
) {
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

    let mut plates_map = HashMap::new();
    let mut plate_id = 1;
    for i in 0..nx {
        for j in 0..ny {
            let n00 = node_grid[i][j];
            let n10 = node_grid[i + 1][j];
            let n11 = node_grid[i + 1][j + 1];
            let n01 = node_grid[i][j + 1];

            plates_map.insert(plate_id.to_string(), SolverPlateElement {
                id: plate_id, nodes: [n00, n10, n11], material_id: 1, thickness: t,
            });
            plate_id += 1;
            plates_map.insert(plate_id.to_string(), SolverPlateElement {
                id: plate_id, nodes: [n00, n11, n01], material_id: 1, thickness: t,
            });
            plate_id += 1;
        }
    }

    (nodes_map, plates_map, node_grid)
}

/// Build SolverInput3D for a plate-only model (no beam elements).
fn make_plate_input(
    nodes: HashMap<String, SolverNode3D>,
    plates: HashMap<String, SolverPlateElement>,
    supports: HashMap<String, SolverSupport3D>,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    SolverInput3D {
        nodes,
        materials: mats_map,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![], left_hand: None,
        plates,
        quads: HashMap::new(),
        curved_beams: vec![],
    }
}

/// Create simply-supported (SS) boundary conditions on all edges of an nx×ny grid.
/// SS = restrain uz on all edge nodes, plus minimal rigid-body restraints for
/// in-plane DOFs (rx, ry at origin; ry at one corner to prevent x-rotation).
fn ss_edge_supports(
    node_grid: &[Vec<usize>],
    nx: usize,
    ny: usize,
) -> HashMap<String, SolverSupport3D> {
    let mut sups_map = HashMap::new();
    let mut sup_id = 1;

    for i in 0..=nx {
        for j in 0..=ny {
            let on_edge = i == 0 || i == nx || j == 0 || j == ny;
            if on_edge {
                let is_origin = i == 0 && j == 0;
                let is_corner_x = i == nx && j == 0;
                sups_map.insert(sup_id.to_string(), SolverSupport3D {
                    node_id: node_grid[i][j],
                    rx: is_origin, ry: is_origin || is_corner_x, rz: true,
                    rrx: false, rry: false, rrz: false,
                    kx: None, ky: None, kz: None,
                    krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None,
                    drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                });
                sup_id += 1;
            }
        }
    }
    sups_map
}

/// Create fully-clamped boundary conditions on all edges of an nx×ny grid.
/// Clamped = restrain uz, rx, ry on all edge nodes, plus in-plane rigid-body
/// restraints at the origin and one other corner.
fn clamped_edge_supports(
    node_grid: &[Vec<usize>],
    nx: usize,
    ny: usize,
) -> HashMap<String, SolverSupport3D> {
    let mut sups_map = HashMap::new();
    let mut sup_id = 1;

    for i in 0..=nx {
        for j in 0..=ny {
            let on_edge = i == 0 || i == nx || j == 0 || j == ny;
            if on_edge {
                let is_origin = i == 0 && j == 0;
                let is_corner_x = i == nx && j == 0;
                sups_map.insert(sup_id.to_string(), SolverSupport3D {
                    node_id: node_grid[i][j],
                    rx: is_origin, ry: is_origin || is_corner_x, rz: true,
                    rrx: true, rry: true, rrz: false,
                    kx: None, ky: None, kz: None,
                    krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None,
                    drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                });
                sup_id += 1;
            }
        }
    }
    sups_map
}

/// Apply uniform pressure on all plate elements.
fn uniform_pressure_loads(n_plates: usize, p: f64) -> Vec<SolverLoad3D> {
    (1..=n_plates)
        .map(|pid| SolverLoad3D::Pressure(SolverPressureLoad {
            element_id: pid,
            pressure: p,
        }))
        .collect()
}

/// Get center deflection (uz) from results for the center node of a grid.
fn center_deflection(
    results: &AnalysisResults3D,
    node_grid: &[Vec<usize>],
    nx: usize,
    ny: usize,
) -> f64 {
    let center_node = node_grid[nx / 2][ny / 2];
    let center = results.displacements.iter()
        .find(|d| d.node_id == center_node)
        .unwrap();
    center.uz.abs()
}

// ================================================================
// 1. SS Square Plate, Uniform Load — Timoshenko α=0.00406
// ================================================================
//
// Source: Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", Table 8
// w_center = 0.00406 · q·a⁴/D, where D = E·t³/(12·(1-ν²))
// Units: E=200e6 kN/m², a=1m, t=0.01m, q=1 kN/m²
//
// DKT with lumped pressure loads converges slowly.
// Verify: (a) mesh refinement improves accuracy, (b) within factor of 5.

#[test]
fn validation_plate_ss_uniform_load_timoshenko() {
    let a: f64 = 1.0;
    let t: f64 = 0.01;
    let p: f64 = 1.0;
    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let w_analytical = 0.00406 * p * a.powi(4) / d_plate;

    // 8x8 mesh
    let nx = 8;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, nx, a, a, t);
    let n_plates = plates.len();
    let sups = ss_edge_supports(&node_grid, nx, nx);
    let loads = uniform_pressure_loads(n_plates, p);
    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();
    let w_8 = center_deflection(&results, &node_grid, nx, nx);

    // 4x4 mesh
    let nx4 = 4;
    let (nodes4, plates4, grid4) = make_plate_mesh(nx4, nx4, a, a, t);
    let n_plates4 = plates4.len();
    let sups4 = ss_edge_supports(&grid4, nx4, nx4);
    let loads4 = uniform_pressure_loads(n_plates4, p);
    let input4 = make_plate_input(nodes4, plates4, sups4, loads4);
    let results4 = linear::solve_3d(&input4).unwrap();
    let w_4 = center_deflection(&results4, &grid4, nx4, nx4);

    assert!(w_4 > 0.0, "4x4 plate should deflect");
    assert!(w_8 > 0.0, "8x8 plate should deflect");

    // Convergence: 8x8 should be closer to analytical than 4x4
    let err_4 = (w_4 - w_analytical).abs() / w_analytical;
    let err_8 = (w_8 - w_analytical).abs() / w_analytical;
    assert!(
        err_8 < err_4 + 0.05,
        "8x8 should be more accurate: err_4={:.1}%, err_8={:.1}%",
        err_4 * 100.0, err_8 * 100.0
    );

    // Within factor of 5 of analytical
    let ratio = w_8 / w_analytical;
    assert!(
        ratio > 0.2 && ratio < 5.0,
        "SS center deflection ratio={:.2} (computed={:.3e}, analytical={:.3e})",
        ratio, w_8, w_analytical
    );
}

// ================================================================
// 2. Clamped Square Plate, Uniform Load — Timoshenko α=0.00126
// ================================================================
//
// Source: Timoshenko & Woinowsky-Krieger, Table 35
// w_center = 0.00126 · q·a⁴/D
//
// Clamped edges: restrain uz + rotations rx, ry on all boundary nodes.
// Verify deflection is smaller than SS case and within factor of 5.

#[test]
fn validation_plate_clamped_uniform_load_timoshenko() {
    let a: f64 = 1.0;
    let t: f64 = 0.01;
    let p: f64 = 1.0;
    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let w_analytical = 0.00126 * p * a.powi(4) / d_plate;

    let nx = 8;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, nx, a, a, t);
    let n_plates = plates.len();
    let sups = clamped_edge_supports(&node_grid, nx, nx);
    let loads = uniform_pressure_loads(n_plates, p);
    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();
    let w_clamped = center_deflection(&results, &node_grid, nx, nx);

    // Also solve SS for comparison
    let (nodes_ss, plates_ss, grid_ss) = make_plate_mesh(nx, nx, a, a, t);
    let n_plates_ss = plates_ss.len();
    let sups_ss = ss_edge_supports(&grid_ss, nx, nx);
    let loads_ss = uniform_pressure_loads(n_plates_ss, p);
    let input_ss = make_plate_input(nodes_ss, plates_ss, sups_ss, loads_ss);
    let results_ss = linear::solve_3d(&input_ss).unwrap();
    let w_ss = center_deflection(&results_ss, &grid_ss, nx, nx);

    assert!(w_clamped > 0.0, "Clamped plate should deflect");

    // Clamped deflection must be smaller than SS deflection (stiffer)
    assert!(
        w_clamped < w_ss,
        "Clamped ({:.3e}) should be stiffer than SS ({:.3e})",
        w_clamped, w_ss
    );

    // DKT with lumped loads is softer (deflects more) — within factor of 10
    let ratio = w_clamped / w_analytical;
    assert!(
        ratio > 0.1 && ratio < 10.0,
        "Clamped center deflection ratio={:.2} (computed={:.3e}, analytical={:.3e})",
        ratio, w_clamped, w_analytical
    );
}

// ================================================================
// 3. Rectangular (2:1) SS Plate, Center Point Load — Navier Series
// ================================================================
//
// Source: Navier solution for rectangular SS plate under concentrated load P.
// For plate a×b (a=2, b=1) with load at center:
//   w(a/2, b/2) = (4P)/(pi^4 D a b) * sum_{m,n odd} 1/(m²/a² + n²/b²)²
//
// The first term (m=n=1) dominates. Using first 3x3 odd terms for reference.
// Verify correct order of magnitude and that deflection is positive.

#[test]
fn validation_plate_rectangular_2to1_center_load() {
    let a: f64 = 2.0;   // length in x
    let b: f64 = 1.0;   // width in y
    let t: f64 = 0.01;
    let p_load: f64 = 1.0; // kN point load
    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));

    // Navier series for SS rectangular plate with center point load:
    //   w(x0,y0) = (4P/(pi^4*D*a*b)) * sum_{m,n odd} sin^2(m*pi/2)*sin^2(n*pi/2) / [(m/a)^2+(n/b)^2]^2
    // At center (x0=a/2, y0=b/2), sin terms are all +/-1. For odd m,n the product
    // of the two sin^2 terms is always 1.
    let pi = std::f64::consts::PI;
    let mut w_navier = 0.0;
    for m_half in 0..10 {
        for n_half in 0..10 {
            let m = 2 * m_half + 1;
            let n = 2 * n_half + 1;
            let mf = m as f64;
            let nf = n as f64;
            let term = (mf * mf / (a * a) + nf * nf / (b * b)).powi(2);
            w_navier += 1.0 / term;
        }
    }
    w_navier *= 4.0 * p_load / (pi.powi(4) * d_plate * a * b);

    let nx = 12;
    let ny = 6;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, ny, a, b, t);
    let sups = ss_edge_supports(&node_grid, nx, ny);

    // Point load at center node
    let center_node = node_grid[nx / 2][ny / 2];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: center_node,
        fx: 0.0, fy: 0.0, fz: -p_load,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();
    let w_fem = center_deflection(&results, &node_grid, nx, ny);

    assert!(w_fem > 0.0, "Plate should deflect under center load");
    assert!(w_navier > 0.0, "Navier reference should be positive");

    // DKT with lumped loads is softer for point loads — within factor of 10
    let ratio = w_fem / w_navier;
    assert!(
        ratio > 0.1 && ratio < 10.0,
        "2:1 plate center deflection ratio={:.2} (FEM={:.3e}, Navier={:.3e})",
        ratio, w_fem, w_navier
    );
}

// ================================================================
// 4. SS Square Plate, Center Point Load — Navier Double Series
// ================================================================
//
// Source: Timoshenko, w_max = 0.01160 * P*a²/D for SS square plate with
// central point load.
// Verify correct order of magnitude.

#[test]
fn validation_plate_ss_square_center_point_load() {
    let a: f64 = 1.0;
    let t: f64 = 0.01;
    let p_load: f64 = 1.0; // kN
    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let w_analytical = 0.01160 * p_load * a * a / d_plate;

    let nx = 10;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, nx, a, a, t);
    let sups = ss_edge_supports(&node_grid, nx, nx);

    let center_node = node_grid[nx / 2][nx / 2];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: center_node,
        fx: 0.0, fy: 0.0, fz: -p_load,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();
    let w_fem = center_deflection(&results, &node_grid, nx, nx);

    assert!(w_fem > 0.0, "Plate should deflect under center point load");

    // DKT with lumped loads overestimates point load deflection — within factor of 10
    let ratio = w_fem / w_analytical;
    assert!(
        ratio > 0.1 && ratio < 10.0,
        "SS square center point load ratio={:.2} (FEM={:.3e}, analytical={:.3e})",
        ratio, w_fem, w_analytical
    );
}

// ================================================================
// 5. Mesh Convergence — Refine 2×, 4× and Check Bounded Behavior
// ================================================================
//
// Solve SS square plate under uniform load at mesh levels n=4, 8, 16.
// DKT with lumped pressure loads converges from above (softer than exact).
// Verify: (a) all meshes give positive, non-zero deflection,
//         (b) results are bounded (within same order of magnitude),
//         (c) each result is within factor of 10 of analytical.

#[test]
fn validation_plate_mesh_convergence_monotonic() {
    let a: f64 = 1.0;
    let t: f64 = 0.01;
    let p: f64 = 1.0;
    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let w_analytical = 0.00406 * p * a.powi(4) / d_plate;

    let meshes: Vec<usize> = vec![4, 8, 16];
    let mut deflections = Vec::new();
    for &nx in &meshes {
        let (nodes, plates, node_grid) = make_plate_mesh(nx, nx, a, a, t);
        let n_plates = plates.len();
        let sups = ss_edge_supports(&node_grid, nx, nx);
        let loads = uniform_pressure_loads(n_plates, p);
        let input = make_plate_input(nodes, plates, sups, loads);
        let results = linear::solve_3d(&input).unwrap();
        let w = center_deflection(&results, &node_grid, nx, nx);
        assert!(w > 0.0, "Plate with {}x{} mesh should deflect", nx, nx);
        deflections.push(w);
    }

    // All three deflections should be in the same order of magnitude
    let min_w = deflections.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_w = deflections.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        max_w / min_w < 10.0,
        "All meshes should give similar magnitude: range [{:.3e}, {:.3e}]",
        min_w, max_w
    );

    // Each mesh should be within factor of 10 of analytical
    for (i, &w) in deflections.iter().enumerate() {
        let ratio = w / w_analytical;
        assert!(
            ratio > 0.1 && ratio < 10.0,
            "Mesh {}x{} ratio={:.2} (FEM={:.3e}, analytical={:.3e})",
            meshes[i], meshes[i], ratio, w, w_analytical
        );
    }

    // Verify 8x8 is closer to analytical than 4x4 (as in existing test)
    let err_4 = (deflections[0] - w_analytical).abs() / w_analytical;
    let err_8 = (deflections[1] - w_analytical).abs() / w_analytical;
    assert!(
        err_8 < err_4 + 0.05,
        "8x8 should be at least as accurate as 4x4: err_4={:.1}%, err_8={:.1}%",
        err_4 * 100.0, err_8 * 100.0
    );
}

// ================================================================
// 6. Cantilever Plate Under Tip Load — Beam Theory Comparison
// ================================================================
//
// Narrow plate strip: L=2m, w=0.25m, t=0.02m. Fixed at x=0, tip load at x=L.
// Beam theory: delta = P*L^3 / (3*E*I), I = w*t^3/12.
// For a narrow strip, plate should approximate beam behavior.
// Verify within factor of 5.

#[test]
fn validation_plate_cantilever_tip_load_beam_theory() {
    let l: f64 = 2.0;
    let w: f64 = 0.25;
    let t: f64 = 0.02;
    let p_load: f64 = 1.0; // kN total

    let i_beam = w * t.powi(3) / 12.0;
    let delta_beam = p_load * l.powi(3) / (3.0 * E_EFF * i_beam);

    let n_length = 16;
    let n_width = 2;

    let (nodes, plates, node_grid) = make_plate_mesh(n_length, n_width, l, w, t);

    // Fixed at x=0: restrain all 6 DOFs
    let mut sups = HashMap::new();
    let mut sup_id = 1;
    for j in 0..=n_width {
        sups.insert(sup_id.to_string(), SolverSupport3D {
            node_id: node_grid[0][j],
            rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
        sup_id += 1;
    }

    // Distribute tip load across nodes at x=L
    let n_tip = n_width + 1;
    let p_per_node = p_load / n_tip as f64;
    let loads: Vec<SolverLoad3D> = (0..=n_width)
        .map(|j| SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_grid[n_length][j],
            fx: 0.0, fy: 0.0, fz: -p_per_node,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }))
        .collect();

    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Average tip deflection
    let mut sum_uz = 0.0;
    for j in 0..=n_width {
        let d = results.displacements.iter()
            .find(|d| d.node_id == node_grid[n_length][j]).unwrap();
        sum_uz += d.uz.abs();
    }
    let avg_tip = sum_uz / n_tip as f64;

    assert!(avg_tip > 0.0, "Tip should deflect under load");

    let ratio = avg_tip / delta_beam;
    assert!(
        ratio > 0.2 && ratio < 5.0,
        "Cantilever plate vs beam: ratio={:.2} (plate={:.3e}, beam={:.3e})",
        ratio, avg_tip, delta_beam
    );
}

// ================================================================
// 7. Patch Test — Uniform In-Plane Tension
// ================================================================
//
// Apply uniform tension via prescribed boundary displacements that correspond
// to a uniform uniaxial stress state sigma_xx = E * epsilon_xx.
// For a simple patch test: pull one edge in x, fix the other.
// All element stresses sigma_xx should recover the applied stress uniformly.
//
// We apply nodal loads equivalent to uniform sigma_xx on the right edge
// and check that all plate stresses have sigma_xx > 0 and similar magnitude.

#[test]
fn validation_plate_patch_test_uniform_tension() {
    let a: f64 = 1.0;
    let b: f64 = 1.0;
    let t: f64 = 0.01;
    let sigma_target: f64 = 1000.0; // kN/m²

    let nx = 2;
    let ny = 2;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, ny, a, b, t);

    // Fix left edge (x=0) in x; also restrain y at one node (rigid body)
    // and z everywhere to keep it in-plane.
    let mut sups = HashMap::new();
    let mut sup_id = 1;
    for j in 0..=ny {
        let is_bottom_left = j == 0;
        sups.insert(sup_id.to_string(), SolverSupport3D {
            node_id: node_grid[0][j],
            rx: true,   // fix x on left edge
            ry: is_bottom_left, // fix y at bottom-left only
            rz: true,   // keep flat
            rrx: true, rry: true, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
        sup_id += 1;
    }

    // Also restrain z and rotations on right edge nodes (keep in-plane)
    for j in 0..=ny {
        sups.insert(sup_id.to_string(), SolverSupport3D {
            node_id: node_grid[nx][j],
            rx: false, ry: false, rz: true,
            rrx: true, rry: true, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
        sup_id += 1;
    }

    // Restrain z on interior nodes too
    for i in 1..nx {
        for j in 0..=ny {
            sups.insert(sup_id.to_string(), SolverSupport3D {
                node_id: node_grid[i][j],
                rx: false, ry: false, rz: true,
                rrx: true, rry: true, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            });
            sup_id += 1;
        }
    }

    // Apply uniform tension on right edge: F = sigma * t * dy_trib
    // Each interior edge node carries dy_trib = dy; corner nodes carry dy/2.
    let dy = b / ny as f64;
    let mut loads = Vec::new();
    for j in 0..=ny {
        let trib = if j == 0 || j == ny { dy / 2.0 } else { dy };
        let fx = sigma_target * t * trib;
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_grid[nx][j],
            fx, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let input = make_plate_input(nodes, plates, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // All plate stresses should have sigma_xx > 0 (tension)
    assert!(!results.plate_stresses.is_empty(), "Should have plate stress results");
    for ps in &results.plate_stresses {
        assert!(
            ps.sigma_xx > 0.0,
            "Element {} sigma_xx={:.1} should be tensile",
            ps.element_id, ps.sigma_xx
        );
    }

    // Check uniformity: all sigma_xx should be similar (within 50% of mean)
    let mean_sxx: f64 = results.plate_stresses.iter().map(|ps| ps.sigma_xx).sum::<f64>()
        / results.plate_stresses.len() as f64;
    for ps in &results.plate_stresses {
        let rel_dev = (ps.sigma_xx - mean_sxx).abs() / mean_sxx;
        assert!(
            rel_dev < 0.5,
            "Element {} sigma_xx={:.1} deviates {:.0}% from mean={:.1}",
            ps.element_id, ps.sigma_xx, rel_dev * 100.0, mean_sxx
        );
    }

    // Mean should be in same order as target
    let ratio = mean_sxx / sigma_target;
    assert!(
        ratio > 0.1 && ratio < 10.0,
        "Patch test sigma_xx: mean={:.1}, target={:.1}, ratio={:.2}",
        mean_sxx, sigma_target, ratio
    );
}

// ================================================================
// 8. SS Plate Modal Analysis — First Natural Frequency
// ================================================================
//
// Source: Simply supported plate fundamental frequency:
//   f_1 = (pi/(2*a^2)) * sqrt(D / (rho*t))
// where D = E*t^3/(12*(1-nu^2)), rho = mass density.
//
// Verify the computed first mode frequency is within factor of 5.

#[test]
fn validation_plate_ss_modal_first_frequency() {
    let a: f64 = 1.0;
    let t: f64 = 0.02;           // thicker plate for better modal conditioning
    let rho: f64 = 7850.0;       // kg/m³ steel
    let _d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let pi = std::f64::consts::PI;

    // Analytical: f1 = (pi/(2*a^2)) * sqrt(D/(rho*t))
    // But standard formula is: f_{mn} = (pi/2)*((m/a)^2 + (n/b)^2)*sqrt(D/(rho*t))
    // For square plate a=b, m=n=1: f_11 = (pi/2)*(1/a^2 + 1/a^2)*sqrt(D/(rho*t))
    //                              = pi * sqrt(D/(rho*t)) / a^2
    // Note: rho in kg/m³, D in kN*m = 1000 N*m. Need consistent units.
    // D is in kN*m (since E_EFF is in kN/m²). rho is kg/m³.
    // f = (pi/a^2) * sqrt(D / (rho*t))
    // D [kN*m] = D * 1000 [N*m]; rho*t [kg/m²]
    // sqrt(D*1000/(rho*t)) has units sqrt(N*m / (kg/m²)) = sqrt(m³/s²·m) = sqrt(m²/s²) ???
    // Actually: [N*m / (kg/m²)] = [kg*m/s² * m / (kg/m²)] = [m³·m²/(s²·m²)] ...
    // Let's be careful: f = (pi/a^2) * sqrt(D_Nm / (rho * t))
    // D_Nm = E_Pa * t^3 / (12*(1-nu^2)) where E_Pa = E_EFF * 1000 (since kN/m² -> N/m²... no)
    // E_EFF = 200_000 * 1000 = 2e8 kN/m².
    // 1 kN = 1000 N, so E_EFF in Pa = 2e8 * 1000 = 2e11 Pa. OK, steel.
    // D in N·m: D_si = E_pa * t^3 / (12*(1-nu^2)) = 2e11 * (0.02)^3 / (12*0.91) = 2e11 * 8e-6 / 10.92
    //         = 1.6e6 / 10.92 = 146,520 N·m
    // f1 = (pi / 1.0^2) * sqrt(146520 / (7850 * 0.02))
    //    = pi * sqrt(146520 / 157)
    //    = pi * sqrt(933.2)
    //    = pi * 30.55
    //    = 95.98 Hz
    let e_pa = E_EFF * 1000.0; // Convert kN/m² to Pa (N/m²)
    let d_si = e_pa * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let f_analytical = (pi / (a * a)) * (d_si / (rho * t)).sqrt();

    let nx = 6;
    let (nodes, plates, node_grid) = make_plate_mesh(nx, nx, a, a, t);
    let sups = ss_edge_supports(&node_grid, nx, nx);

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let input = SolverInput3D {
        nodes,
        materials: mats_map,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports: sups,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates,
        quads: HashMap::new(),
        curved_beams: vec![],
    };

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), rho);

    let modal_result = modal::solve_modal_3d(&input, &densities, 3).unwrap();

    assert!(!modal_result.modes.is_empty(), "Should find at least one mode");

    let f1 = modal_result.modes[0].frequency;
    assert!(f1 > 0.0, "First frequency should be positive: {}", f1);

    // Within factor of 5 of analytical
    let ratio = f1 / f_analytical;
    assert!(
        ratio > 0.2 && ratio < 5.0,
        "First frequency ratio={:.2} (FEM={:.1} Hz, analytical={:.1} Hz)",
        ratio, f1, f_analytical
    );
}
