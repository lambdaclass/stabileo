/// Regression tests for 3D thermal load bugs:
/// Bug 1: Thermal FEF sign convention — cantilever with ΔT>0 should expand (positive ux at free end)
/// Bug 2: Truss thermal FEF not assembled — 3D truss assembly skips load/FEF computation
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::solve_3d;
use std::collections::HashMap;

const E: f64 = 200_000.0;  // MPa (steel)
const NU: f64 = 0.3;
const A: f64 = 0.01;       // m²
const IY: f64 = 1e-4;      // m⁴
const IZ: f64 = 1e-4;      // m⁴
const J: f64 = 1.5e-4;     // m⁴
const L: f64 = 3.0;        // m
const ALPHA: f64 = 12e-6;  // /°C (hardcoded in solver)
const DT: f64 = 50.0;      // °C

fn make_3d_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize)>,
    sups: Vec<(usize, usize, bool, bool, bool, bool, bool, bool)>,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iy, iz, j) in secs {
        secs_map.insert(id.to_string(), SolverSection3D {
            id, name: None, a, iy, iz, j,
            cw: None, as_y: None, as_z: None,
        });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id, elem_type: t.to_string(),
            node_i: ni, node_j: nj,
            material_id: mi, section_id: si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None,
            roll_angle: None,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, rx, ry, rz, rrx, rry, rrz) in sups {
        sups_map.insert(id.to_string(), SolverSupport3D {
            node_id: nid,
            rx, ry, rz, rrx, rry, rrz,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
            rw: None, kw: None,
        });
    }
    SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(),
        quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_beams: vec![], curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    }
}

/// Bug 1: Cantilever beam (fixed at node 1, free at node 2) along X with ΔT=50°C.
/// Expected: free end expands in +x direction → ux = +α·ΔT·L = +0.0018 m.
#[test]
fn thermal_cantilever_positive_displacement() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        // Fixed at node 1, free at node 2
        vec![(1, 1, true, true, true, true, true, true)],
        vec![SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient_y: 0.0,
            dt_gradient_z: 0.0,
        })],
    );

    let result = solve_3d(&input).expect("solve should succeed");
    let tip = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let expected = ALPHA * DT * L; // +0.0018 m
    assert!(
        (tip.ux - expected).abs() < 1e-8,
        "Expected ux = +{expected} (positive expansion), got ux = {}",
        tip.ux
    );
}

/// Bug 1 (continued): Fixed-fixed beam with ΔT → compression (negative axial force).
#[test]
fn thermal_fixed_fixed_compressive_force() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "frame", 1, 2, 1, 1)],
        // Both ends fixed
        vec![
            (1, 1, true, true, true, true, true, true),
            (2, 2, true, true, true, true, true, true),
        ],
        vec![SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient_y: 0.0,
            dt_gradient_z: 0.0,
        })],
    );

    let result = solve_3d(&input).expect("solve should succeed");

    // Zero displacements
    for d in &result.displacements {
        assert!(d.ux.abs() < 1e-10, "Expected zero ux, got {}", d.ux);
    }

    // Internal force should be compressive (negative N)
    let forces = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let e_kn = E * 1000.0; // E in kN/m²
    let expected_n = -(e_kn * A * ALPHA * DT); // negative = compression
    assert!(
        (forces.n_start - expected_n).abs() < 1.0,
        "Expected compressive n_start ≈ {expected_n}, got {}",
        forces.n_start,
    );
}

/// Bug 2: 3D truss with thermal load — fixed-fixed truss should develop axial force.
#[test]
fn thermal_truss_3d_fixed_fixed_axial_force() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "truss", 1, 2, 1, 1)],
        // Both ends: restrain translations only (truss has no rotational DOFs)
        vec![
            (1, 1, true, true, true, false, false, false),
            (2, 2, true, true, true, false, false, false),
        ],
        vec![SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient_y: 0.0,
            dt_gradient_z: 0.0,
        })],
    );

    let result = solve_3d(&input).expect("solve should succeed");
    let forces = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();

    let e_kn = E * 1000.0;
    let expected_n = e_kn * A * ALPHA * DT; // magnitude

    assert!(
        forces.n_start.abs() > 1.0,
        "Truss thermal load should produce non-zero axial force, got n_start = {}",
        forces.n_start,
    );
    assert!(
        (forces.n_start.abs() - expected_n).abs() < 1.0,
        "Expected |n_start| ≈ {expected_n}, got {}",
        forces.n_start.abs(),
    );
}

/// Bug 2: 3D truss with thermal load — free-to-expand truss should displace.
#[test]
fn thermal_truss_3d_free_expansion() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![(1, "truss", 1, 2, 1, 1)],
        // Node 1: pin (all translations fixed), Node 2: free in X
        vec![
            (1, 1, true, true, true, false, false, false),
            (2, 2, false, true, true, false, false, false),
        ],
        vec![SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient_y: 0.0,
            dt_gradient_z: 0.0,
        })],
    );

    let result = solve_3d(&input).expect("solve should succeed");
    let tip = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let expected = ALPHA * DT * L;
    assert!(
        (tip.ux - expected).abs() < 1e-8,
        "Expected ux = +{expected} for truss free expansion, got ux = {}",
        tip.ux,
    );
}
