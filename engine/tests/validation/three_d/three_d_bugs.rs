/// Validation: Regression Tests for Fixed 3D Assembly Bugs
///
/// These tests document bugs that have been fixed and serve as regression tests.
///
/// Known bugs:
///   1. 3D thermal loads silently dropped in assembly (wildcard `_ => {}`)
///   2. 3D partial distributed loads ignore a/b parameters
///   3. Plate mass not included in 3D mass matrix assembly
use dedaliano_engine::solver::{linear, modal};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
#[allow(dead_code)]
const E_EFF: f64 = E * 1000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;
const DENSITY: f64 = 7_850.0;

// ================================================================
// BUG 1: 3D Thermal Loads Silently Dropped
// ================================================================
//
// SolverLoad3D::Thermal is defined in the type system but the 3D
// assembly (assemble_element_loads_3d) matches it with `_ => {}`
// and produces zero force vector contribution.
//
// Expected: Uniform temperature rise ΔT on a fixed-fixed beam
// produces axial force N = E·A·α·ΔT and zero displacement.
// On a cantilever, it produces tip displacement δ = α·ΔT·L.

#[test]

fn bug_3d_thermal_load_uniform_produces_displacement() {
    let n = 4;
    let l: f64 = 5.0;
    let dt = 50.0; // 50°C uniform temperature rise

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: i + 1,
            dt_uniform: dt,
            dt_gradient_y: 0.0,
            dt_gradient_z: 0.0,
        }));
    }

    // Cantilever: fixed at start, free at end
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        loads,
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // α = 12e-6 (hardcoded for steel in engine)
    // δ = α × ΔT × L = 12e-6 × 50 × 5 = 0.003 m = 3 mm
    let alpha = 12e-6;
    let delta_expected = alpha * dt * l;

    assert!(
        tip.ux.abs() > delta_expected * 0.5,
        "BUG: Thermal load should produce tip displacement δ={:.6} m, got ux={:.6e}",
        delta_expected, tip.ux
    );
}

#[test]

fn bug_3d_thermal_gradient_produces_bending() {
    let n = 4;
    let l: f64 = 5.0;
    let dt_grad = 20.0; // gradient across depth

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient_y: dt_grad,
            dt_gradient_z: 0.0,
        }));
    }

    // Simply supported beam
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, false, false],
        Some(vec![false, true, true, true, false, false]),
        loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Thermal gradient should produce bending → nonzero deflection
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    assert!(
        mid_d.uy.abs() > 1e-8,
        "BUG: Thermal gradient should produce bending, got uy={:.6e}",
        mid_d.uy
    );
}

// ================================================================
// BUG 2: 3D Partial Distributed Loads Ignore a/b Parameters
// ================================================================
//
// SolverDistributedLoad3D has `a: Option<f64>` and `b: Option<f64>`
// but fef_distributed_3d() is always called without them.
// Partial loads are treated as full-length loads.

#[test]

fn bug_3d_partial_distributed_load_differs_from_full() {
    let n = 1; // single element for clearest comparison
    let l: f64 = 6.0;
    let q = -10.0; // kN/m

    // Full load on entire element
    let loads_full = vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: 1,
        q_yi: q, q_yj: q,
        q_zi: 0.0, q_zj: 0.0,
        a: None, b: None,
    })];

    // Partial load on first half only
    let loads_partial = vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: 1,
        q_yi: q, q_yj: q,
        q_zi: 0.0, q_zj: 0.0,
        a: Some(0.0), b: Some(l / 2.0),
    })];

    let input_full = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        loads_full,
    );

    let input_partial = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        loads_partial,
    );

    let res_full = linear::solve_3d(&input_full).unwrap();
    let res_partial = linear::solve_3d(&input_partial).unwrap();

    let tip_full = res_full.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;
    let tip_partial = res_partial.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // Half the load should give roughly half the displacement
    // (not exactly, due to load position effects, but much less than full)
    let ratio = tip_partial.abs() / tip_full.abs();
    assert!(
        ratio < 0.9,
        "BUG: Partial load (a=0, b=L/2) should give less deflection than full: ratio={:.3}",
        ratio
    );
}

#[test]

fn bug_3d_partial_load_reactions_differ_from_full() {
    let n = 4;
    let l: f64 = 8.0;
    let q = -5.0;

    // Full UDL
    let mut loads_full = Vec::new();
    for i in 0..n {
        loads_full.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i + 1,
            q_yi: q, q_yj: q,
            q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        }));
    }

    // Partial load: only on first element, first half
    let loads_partial = vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: 1,
        q_yi: q, q_yj: q,
        q_zi: 0.0, q_zj: 0.0,
        a: Some(0.0), b: Some(l / (2.0 * n as f64)),
    })];

    let ss_start = vec![true, true, true, true, false, false];
    let ss_end = vec![false, true, true, true, false, false];

    let input_full = make_3d_beam(n, l, E, NU, A, IY, IZ, J, ss_start.clone(), Some(ss_end.clone()), loads_full);
    let input_partial = make_3d_beam(n, l, E, NU, A, IY, IZ, J, ss_start, Some(ss_end), loads_partial);

    let res_full = linear::solve_3d(&input_full).unwrap();
    let res_partial = linear::solve_3d(&input_partial).unwrap();

    let fy_full: f64 = res_full.reactions.iter().map(|r| r.fy).sum::<f64>().abs();
    let fy_partial: f64 = res_partial.reactions.iter().map(|r| r.fy).sum::<f64>().abs();

    // Partial load total reaction should be much smaller
    assert!(
        fy_partial < fy_full * 0.5,
        "BUG: Partial load reactions should be smaller: partial={:.4}, full={:.4}",
        fy_partial, fy_full
    );
}

// ================================================================
// BUG 3: Plate Mass Not Included in 3D Mass Matrix
// ================================================================
//
// assemble_mass_matrix_3d() only loops over input.elements (frames/trusses).
// input.plates (triangular DKT elements) are never assembled into mass matrix.
// plate_consistent_mass() exists but is never called.

#[test]

fn bug_3d_plate_mass_contributes_to_modal() {
    // Simple plate structure: 4 nodes, 2 triangular plates
    let t = 0.01; // plate thickness
    let side = 1.0;

    let mut nodes_map = HashMap::new();
    nodes_map.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes_map.insert("2".to_string(), SolverNode3D { id: 2, x: side, y: 0.0, z: 0.0 });
    nodes_map.insert("3".to_string(), SolverNode3D { id: 3, x: side, y: side, z: 0.0 });
    nodes_map.insert("4".to_string(), SolverNode3D { id: 4, x: 0.0, y: side, z: 0.0 });

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });

    let mut plates_map = HashMap::new();
    plates_map.insert("1".to_string(), SolverPlateElement {
        id: 1, nodes: [1, 2, 3], material_id: 1, thickness: t,
    });
    plates_map.insert("2".to_string(), SolverPlateElement {
        id: 2, nodes: [1, 3, 4], material_id: 1, thickness: t,
    });

    // Support 3 corners, leave node 3 free
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    sups_map.insert("2".to_string(), SolverSupport3D {
        node_id: 2,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });
    sups_map.insert("3".to_string(), SolverSupport3D {
        node_id: 4,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let input = SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: HashMap::new(),
        elements: HashMap::new(), // no frame elements
        supports: sups_map,
        loads: vec![],
        constraints: vec![], left_hand: None,
        plates: plates_map, quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 2).unwrap();

    // Plate area = 1.0 m², ρ = 7850 kg/m³, t = 0.01 m
    // Expected mass = ρ × A × t = 7850 × 1.0 × 0.01 = 78.5 kg
    // Engine uses ρA/1000 convention → total_mass ~ 0.0785
    let expected_mass = DENSITY * side * side * t / 1000.0;

    assert!(
        modal_res.total_mass > expected_mass * 0.5,
        "BUG: Plate mass not assembled — total_mass={:.6}, expected≈{:.6}",
        modal_res.total_mass, expected_mass
    );
}

#[test]

fn bug_3d_plate_mass_affects_frequencies() {
    // Frame beam + plate → adding plate should lower natural frequencies
    // (more mass → lower ω)
    let l: f64 = 4.0;
    let n = 4;

    // Beam-only model
    let input_beam = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_beam = modal::solve_modal_3d(&input_beam, &densities, 2).unwrap();

    // Same beam + plate attached alongside it
    let mut input_with_plate = input_beam.clone();
    input_with_plate.plates.insert("1".to_string(), SolverPlateElement {
        id: 1, nodes: [1, 2, 3], material_id: 1, thickness: 0.05,
    });

    // Add a third node off-axis for the plate
    input_with_plate.nodes.insert("100".to_string(), SolverNode3D {
        id: 100, x: l / (n as f64), y: 1.0, z: 0.0,
    });
    // Update plate to reference actual nodes
    input_with_plate.plates.insert("1".to_string(), SolverPlateElement {
        id: 1, nodes: [1, 2, 100], material_id: 1, thickness: 0.05,
    });
    // Pin the off-axis node
    input_with_plate.supports.insert("100".to_string(), SolverSupport3D {
        node_id: 100,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let modal_with_plate = modal::solve_modal_3d(&input_with_plate, &densities, 2).unwrap();

    // Adding a plate should increase total mass (plate adds both stiffness and mass,
    // so frequency direction depends on relative contributions — check mass instead)
    assert!(
        modal_with_plate.total_mass > modal_beam.total_mass * 1.01,
        "BUG: Adding plate should increase total mass: beam={:.6}, with_plate={:.6}",
        modal_beam.total_mass, modal_with_plate.total_mass
    );
}
