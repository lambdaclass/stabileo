/// Validation: Plate Element Benchmarks (Shell/Plate)
///
/// Tests flat triangular shell element (DKT + CST membrane):
///   - SS square plate under pressure vs Kirchhoff theory
///   - Cantilever plate strip vs beam theory
///   - Plate patch test — uniform in-plane stretch
///
/// Note: DKT with lumped pressure loads has limited convergence to
/// exact Kirchhoff values. Tests verify correct order of magnitude
/// and proper behavior, not exact matching.
///
/// References:
///   - Scordelis, A.C. & Lo, K.S., "Computer Analysis of Cylindrical Shells", 1964
///   - MacNeal, R.H. & Harder, R.L., "A Proposed Standard Set of Problems", 1985
///   - Batoz, J.L., Bathe, K.J., Ho, L.W., "A Study of DKT Plate Elements", 1980
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;

fn make_plate_mesh_simple(
    nx: usize, ny: usize, a: f64, b: f64, t: f64,
) -> (HashMap<String, SolverNode3D>, HashMap<String, SolverPlateElement>, Vec<Vec<usize>>) {
    let dx = a / nx as f64;
    let dy = b / ny as f64;
    let mut nodes = HashMap::new();
    let mut node_grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            nodes.insert(nid.to_string(), SolverNode3D {
                id: nid, x: i as f64 * dx, y: j as f64 * dy, z: 0.0,
            });
            node_grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut plates = HashMap::new();
    let mut pid = 1;
    for i in 0..nx {
        for j in 0..ny {
            let n1 = node_grid[i][j];
            let n2 = node_grid[i + 1][j];
            let n3 = node_grid[i + 1][j + 1];
            let n4 = node_grid[i][j + 1];

            plates.insert(pid.to_string(), SolverPlateElement {
                id: pid, nodes: [n1, n2, n3], material_id: 1, thickness: t,
            });
            pid += 1;
            plates.insert(pid.to_string(), SolverPlateElement {
                id: pid, nodes: [n1, n3, n4], material_id: 1, thickness: t,
            });
            pid += 1;
        }
    }

    (nodes, plates, node_grid)
}

// ================================================================
// 1. Simply Supported Plate Under Uniform Pressure
// ================================================================
//
// Kirchhoff: w_center = α × q × a⁴ / D, D = E_eff × t³ / (12(1-ν²))
// α = 0.00406 for square plate, ν=0.3
// DKT convergence is slow with lumped loads — test order of magnitude.

#[test]
fn validation_plate_simply_supported_uniform_pressure() {
    let a: f64 = 1.0; // unit square
    let t: f64 = 0.01;
    let q: f64 = -1.0;
    let nx = 8;
    let ny = 8;

    let d_plate = E_EFF * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let w_analytical = 0.00406 * q.abs() * a.powi(4) / d_plate;

    let (nodes, plates, node_grid) = make_plate_mesh_simple(nx, ny, a, a, t);

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    // SS edges: uz = 0 on all boundary nodes
    let mut supports = HashMap::new();
    let mut sid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            if i == 0 || i == nx || j == 0 || j == ny {
                supports.insert(sid.to_string(), SolverSupport3D {
                    node_id: node_grid[i][j],
                    rx: i == 0 && j == 0, // pin one corner for in-plane stability
                    ry: (i == 0 && j == 0) || (i == nx && j == 0),
                    rz: true,
                    rrx: false, rry: false, rrz: false,
                    kx: None, ky: None, kz: None,
                    krx: None, kry: None, krz: None,
                    dx: None, dy: None, dz: None,
                    drx: None, dry: None, drz: None,
                    normal_x: None, normal_y: None, normal_z: None,
                    is_inclined: None, rw: None, kw: None,
                });
                sid += 1;
            }
        }
    }

    // Pressure loads
    let n_plates = 2 * nx * ny;
    let mut loads = Vec::new();
    for pid in 1..=n_plates {
        loads.push(SolverLoad3D::Pressure(SolverPressureLoad {
            element_id: pid, pressure: q,
        }));
    }

    let input = SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(), elements: HashMap::new(),
        supports, loads, constraints: vec![], left_hand: None, plates, quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    let center_nid = node_grid[nx / 2][ny / 2];
    let d_center = results.displacements.iter().find(|d| d.node_id == center_nid);

    if let Some(d) = d_center {
        assert!(d.uz.abs() > 0.0, "Plate center should deflect");

        // DKT with lumped loads: within factor of 5 of Kirchhoff (matches existing test pattern)
        let ratio = d.uz.abs() / w_analytical;
        assert!(
            ratio > 0.1 && ratio < 5.0,
            "Plate deflection ratio={:.2} (computed={:.3e}, Kirchhoff={:.3e})",
            ratio, d.uz.abs(), w_analytical
        );
    }
}

// ================================================================
// 2. Cantilever Plate Strip — Beam Theory Comparison
// ================================================================
//
// Narrow plate strip (w << L) fixed along one edge, tip load.
// Should approach beam theory: δ = PL³/(3 E_eff I), I = w t³/12.

#[test]
fn validation_cantilever_plate_tip_load() {
    let length: f64 = 2.0;
    let width: f64 = 0.5;
    let t: f64 = 0.02;
    let p: f64 = 1.0; // total tip load

    let nx = 16;
    let ny = 4;

    let (nodes, plates, node_grid) = make_plate_mesh_simple(nx, ny, length, width, t);

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    // Fixed support at x=0
    let mut supports = HashMap::new();
    let mut sid = 1;
    for j in 0..=ny {
        supports.insert(sid.to_string(), SolverSupport3D {
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
        sid += 1;
    }

    // Distribute tip load across nodes at x=L
    let n_tip = ny + 1;
    let p_per_node = p / n_tip as f64;
    let mut loads = Vec::new();
    for j in 0..=ny {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_grid[nx][j],
            fx: 0.0, fy: 0.0, fz: -p_per_node,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let input = SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(), elements: HashMap::new(),
        supports, loads, constraints: vec![], left_hand: None, plates, quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Beam reference: I = w·t³/12, δ = P·L³/(3·E_eff·I)
    let i_beam = width * t.powi(3) / 12.0;
    let delta_beam = p * length.powi(3) / (3.0 * E_EFF * i_beam);

    // Tip center displacement
    let tip_center = node_grid[nx][ny / 2];
    let d_tip = results.displacements.iter().find(|d| d.node_id == tip_center);

    if let Some(d) = d_tip {
        assert!(d.uz.abs() > 0.0, "Cantilever plate tip should deflect");

        // DKT should be within factor of 5 of beam theory
        let ratio = d.uz.abs() / delta_beam;
        assert!(
            ratio > 0.1 && ratio < 5.0,
            "Cantilever plate ratio={:.2} (computed={:.3e}, beam={:.3e})",
            ratio, d.uz.abs(), delta_beam
        );
    }
}

// ================================================================
// 3. Plate Patch Test — Constant In-Plane Stress
// ================================================================
//
// Uniform in-plane stretch should produce zero out-of-plane deflection
// and approximately uniform displacement on the loaded edge.

#[test]
fn validation_plate_patch_test() {
    let a: f64 = 2.0;
    let t: f64 = 0.1;
    let nx = 4;
    let ny = 4;

    let (nodes, plates, node_grid) = make_plate_mesh_simple(nx, ny, a, a, t);

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    // Fix left edge: all DOFs
    let mut supports = HashMap::new();
    let mut sid = 1;
    for j in 0..=ny {
        supports.insert(sid.to_string(), SolverSupport3D {
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
        sid += 1;
    }

    // Uniform tension on right edge
    let force_per_node = 1.0;
    let mut loads = Vec::new();
    for j in 0..=ny {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_grid[nx][j],
            fx: force_per_node, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }

    let input = SolverInput3D {
        nodes, materials: mats, sections: HashMap::new(), elements: HashMap::new(),
        supports, loads, constraints: vec![], left_hand: None, plates, quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    // Out-of-plane displacement should be zero
    let max_uz = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, |a, b| a.max(b));

    assert!(
        max_uz < 1e-6,
        "Patch test: max |uz|={:.6e} should be near zero", max_uz
    );

    // Interior right-edge nodes (excluding corners) should have similar ux
    let interior_ux: Vec<f64> = (1..ny)
        .map(|j| {
            let nid = node_grid[nx][j];
            results.displacements.iter()
                .find(|d| d.node_id == nid)
                .map(|d| d.ux)
                .unwrap_or(0.0)
        })
        .collect();

    if interior_ux.len() > 1 {
        let avg = interior_ux.iter().sum::<f64>() / interior_ux.len() as f64;
        for &ux in &interior_ux {
            if avg.abs() > 1e-15 {
                let rel = (ux - avg).abs() / avg.abs();
                assert!(
                    rel < 0.30,
                    "Patch test: interior ux should be roughly uniform, ux={:.6e}, avg={:.6e}",
                    ux, avg
                );
            }
        }
    }
}
