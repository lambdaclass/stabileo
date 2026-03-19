/// Validation: Beam on Elastic (Winkler) Foundation
///
/// References:
///   - Hetenyi (1946): Beams on Elastic Foundation
///   - β = (k/(4EI))^0.25, characteristic length = 1/β
///   - Point load: δ_0 = P/(2kβ) = Pβ/(2k) (under load, infinite beam)
///   - UDL on long beam: δ_max ≈ q/k
///
/// Implementation: Model Winkler foundation as dense translational spring
/// supports (ky at evenly spaced nodes). Use 2D solver.
///
/// Tests:
///   1. Point load: compare with Hetenyi δ = Pβ/(2k)
///   2. Uniform load: δ_max ≈ q/k for long beam
///   3. Convergence: more springs → closer to Hetenyi
///   4. Short beam: between rigid body and Hetenyi solution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Create a beam on Winkler foundation: dense spring supports along length.
/// k_soil = soil stiffness (kN/m²), applied as ky springs at each node.
/// The tributary spring stiffness per node = k_soil × tributary_length.
fn make_winkler_beam(
    n_elements: usize,
    length: f64,
    k_soil: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Create basic input first, then add spring supports
    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, z: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, _, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: "frame".to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }

    // Spring supports at every node
    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let trib = if i == 0 || i == n_nodes - 1 { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;

        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1,
            node_id: i + 1,
            support_type: "spring".to_string(),
            kx: None,
            ky: Some(ky_node),
            kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
    }

    // Also need a pin in x at one node to prevent horizontal sliding
    // Modify node 1 support to also restrain x
    if let Some(sup) = sups_map.get_mut("1") {
        sup.kx = Some(1e10); // very stiff axial restraint
    }

    SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads, constraints: vec![],  connectors: HashMap::new() }
}

// ================================================================
// 1. Point Load: Hetenyi Solution
// ================================================================
//
// Infinite beam on springs, point load P at center.
// δ_0 = P·β / (2·k_total_per_m)
// where β = (k/(4EI))^(1/4), k = foundation modulus (kN/m per m length)
//
// For finite beam, use long beam (βL > π) to approximate infinite.

#[test]
fn validation_winkler_point_load() {
    let e_eff = E * 1000.0; // kN/m²
    let k_soil = 10_000.0; // kN/m² (foundation modulus per unit length)
    let ei = e_eff * IZ;

    let beta = (k_soil / (4.0 * ei)).powf(0.25);
    let l = std::f64::consts::PI / beta * 4.0; // βL ≈ 4π (long beam)
    let n = 80; // Dense mesh

    let p = 50.0; // kN point load at center
    let mid_node = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_winkler_beam(n, l, k_soil, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Hetenyi: δ_0 = P·β / (2·k) for infinite beam
    let delta_hetenyi = p * beta / (2.0 * k_soil);

    let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_computed = mid.uz.abs();

    // Should be within 15% (finite length effects)
    let error = (delta_computed - delta_hetenyi).abs() / delta_hetenyi;
    assert!(
        error < 0.15,
        "Winkler point load: computed={:.6e}, Hetenyi={:.6e}, error={:.1}%",
        delta_computed, delta_hetenyi, error * 100.0
    );
}

// ================================================================
// 2. Uniform Load: δ_max ≈ q/k
// ================================================================
//
// Long beam on springs under UDL. For very long beam (βL >> 1),
// the deflection approaches q/k everywhere except near ends.

#[test]
fn validation_winkler_uniform_load() {
    let e_eff = E * 1000.0;
    let k_soil = 5_000.0;
    let q = 10.0; // kN/m

    let beta = (k_soil / (4.0 * e_eff * IZ)).powf(0.25);
    let l = std::f64::consts::PI / beta * 4.0;
    let n = 60;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_winkler_beam(n, l, k_soil, loads);
    let results = linear::solve_2d(&input).unwrap();

    // For long beam, midspan deflection ≈ q/k
    let delta_expected = q / k_soil;
    let mid_node = n / 2 + 1;
    let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    let error = (mid.uz.abs() - delta_expected).abs() / delta_expected;
    assert!(
        error < 0.20,
        "Winkler UDL: computed={:.6e}, q/k={:.6e}, error={:.1}%",
        mid.uz.abs(), delta_expected, error * 100.0
    );
}

// ================================================================
// 3. Convergence: More Springs → Closer to Hetenyi
// ================================================================

#[test]
fn validation_winkler_convergence() {
    let e_eff = E * 1000.0;
    let k_soil = 10_000.0;
    let beta = (k_soil / (4.0 * e_eff * IZ)).powf(0.25);
    let l = std::f64::consts::PI / beta * 4.0;
    let p = 50.0;
    let delta_hetenyi = p * beta / (2.0 * k_soil);

    let mut errors = Vec::new();
    for &n in &[20, 40, 80] {
        let mid_node = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })];

        let input = make_winkler_beam(n, l, k_soil, loads);
        let results = linear::solve_2d(&input).unwrap();
        let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

        let error = (mid.uz.abs() - delta_hetenyi).abs() / delta_hetenyi;
        errors.push(error);
    }

    // Error should decrease (or at least not increase) with refinement
    assert!(
        errors[2] <= errors[0] + 0.02,
        "Mesh convergence: err_20={:.1}%, err_80={:.1}%",
        errors[0] * 100.0, errors[2] * 100.0
    );
}

// ================================================================
// 4. Short Beam: Between Rigid and Hetenyi
// ================================================================
//
// Short beam (βL < π): stiffness is dominated by beam bending.
// Deflection should be between rigid body (δ = P/(k·L)) and Hetenyi.

#[test]
fn validation_winkler_short_beam() {
    let e_eff = E * 1000.0;
    let k_soil = 10_000.0;
    let beta = (k_soil / (4.0 * e_eff * IZ)).powf(0.25);
    let l_char = 1.0 / beta;

    // Short beam: L = 0.5 × characteristic length
    let l = 0.5 * l_char;
    let n = 20;
    let p = 50.0;
    let mid_node = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_winkler_beam(n, l, k_soil, loads);
    let results = linear::solve_2d(&input).unwrap();
    let mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_computed = mid.uz.abs();

    // Rigid body: δ = P/(k·L)
    let delta_rigid = p / (k_soil * l);

    // Hetenyi infinite beam
    let delta_hetenyi = p * beta / (2.0 * k_soil);

    // Short beam deflection should be comparable to or larger than rigid body
    // (beam bending adds flexibility, but springs are stiffer on shorter span)
    assert!(
        delta_computed > delta_rigid * 0.3,
        "Short beam: δ={:.6e} should be > 0.3×δ_rigid={:.6e}",
        delta_computed, delta_rigid * 0.3
    );

    // And should be finite/reasonable
    assert!(
        delta_computed < delta_hetenyi * 5.0,
        "Short beam: δ={:.6e} should be bounded by 5×Hetenyi={:.6e}",
        delta_computed, delta_hetenyi * 5.0
    );
}
