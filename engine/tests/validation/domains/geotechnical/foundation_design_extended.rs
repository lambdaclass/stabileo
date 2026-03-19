/// Validation: Extended Foundation Design
///
/// References:
///   - Bowles, "Foundation Analysis and Design", 5th Ed., McGraw-Hill
///   - Hetenyi (1946): "Beams on Elastic Foundation", University of Michigan Press
///   - Das, "Principles of Foundation Engineering", 9th Ed.
///   - ACI 336.2R: "Suggested Analysis and Design Procedures for Combined Footings"
///   - Terzaghi & Peck, "Soil Mechanics in Engineering Practice"
///   - Braja M. Das, "Principles of Geotechnical Engineering"
///
/// Tests model various foundation types as beams on Winkler springs or beams
/// with discrete supports, then verify against geotechnical engineering formulas.
///
/// Tests:
///   1. Spread footing: beam on Winkler springs, uniform pressure distribution
///   2. Combined footing: two columns on a single mat, verify pressure trapezoid
///   3. Strap footing: eccentric column connected to interior column
///   4. Pile cap with 3 piles: verify load distribution to piles
///   5. Retaining wall stem: cantilever under triangular earth pressure
///   6. Grade beam with concentrated loads: bending and deflection
///   7. Mat foundation: flexible mat under column loads, differential settlement
///   8. Deep beam foundation: short deep beam behavior with high shear
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::assert_close;
use std::collections::HashMap;

const E_CONCRETE: f64 = 25_000.0;

/// Create a beam on Winkler foundation with spring supports at every node.
/// k_soil is the foundation modulus in kN/m per m of beam length.
/// Each node gets ky = k_soil * tributary_length.
fn make_winkler_beam(
    n_elements: usize,
    length: f64,
    k_soil: f64,
    e: f64,
    a: f64,
    iz: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode {
            id,
            x: i as f64 * elem_len,
            z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.2 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n_elements {
        let id = i + 1;
        elems_map.insert(id.to_string(), SolverElement {
            id,
            elem_type: "frame".to_string(),
            node_i: i + 1,
            node_j: i + 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let trib = if i == 0 || i == n_nodes - 1 {
            elem_len / 2.0
        } else {
            elem_len
        };
        let ky_node = k_soil * trib;
        let kx = if i == 0 { Some(1e10) } else { None };

        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1,
            node_id: i + 1,
            support_type: "spring".to_string(),
            kx,
            ky: Some(ky_node),
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        });
    }

    SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), }
}

// ================================================================
// 1. Spread Footing: Beam on Winkler Springs, Uniform Pressure
// ================================================================
//
// A spread footing under a central column load is modeled as a beam
// on Winkler springs. For a rigid footing (high EI relative to spring
// stiffness), the settlement should be nearly uniform, meaning the
// soil pressure is approximately uniform: q = P / L.
//
// Reference: Bowles, Ch. 9; Das, Ch. 5

#[test]
fn validation_spread_footing_uniform_pressure() {
    let l = 3.0;        // footing length (m)
    let n = 30;         // elements
    let b = 1.5;        // footing width (m)
    let h = 0.6;        // footing depth (m)
    let a_sec = b * h;  // cross-section area
    let iz = b * h * h * h / 12.0; // moment of inertia

    // Subgrade modulus for medium dense sand: ks ~ 30,000 kN/m^3
    // For beam width b: k_soil = ks * b (kN/m per m of beam length)
    let ks = 30_000.0;
    let k_soil = ks * b;

    let p = 500.0; // column load (kN)
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_winkler_beam(n, l, k_soil, E_CONCRETE, a_sec, iz, loads);
    let results = linear::solve_2d(&input).unwrap();

    // For a rigid footing, all springs deflect by approximately the same amount
    // Rigid body: delta = P / (k_soil * L)
    let e_eff = E_CONCRETE * 1000.0;
    let beta = (k_soil / (4.0 * e_eff * iz)).powf(0.25);
    let beta_l = beta * l;

    // With beta*L small (rigid footing), deflection should be nearly uniform
    // For a rigid beam on springs: delta_avg = P / (k_soil * L)
    let delta_rigid = p / (k_soil * l);

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == 1).unwrap();

    // Midspan deflects downward
    assert!(d_mid.uz < 0.0,
        "Spread footing: center deflects downward: {:.6e}", d_mid.uz);

    // For a somewhat rigid footing (beta*L < 1), the center and edge
    // deflections should be of similar magnitude
    if beta_l < 1.5 {
        let ratio = d_end.uz / d_mid.uz;
        assert!(ratio > 0.5,
            "Spread footing (rigid): edge/center ratio = {:.3} > 0.5", ratio);
    }

    // Total spring reaction should equal applied load
    let elem_len = l / n as f64;
    // Sum of ky * uy for each spring
    let mut reaction_sum = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_sum += ky_node * d.uz.abs();
    }
    assert_close(reaction_sum, p, 0.05,
        "Spread footing: total spring reaction = P");

    // Average deflection should be close to P/(k_soil * L) for rigid footing
    let avg_deflection = results.displacements.iter()
        .map(|d| d.uz.abs())
        .sum::<f64>() / (n + 1) as f64;
    assert_close(avg_deflection, delta_rigid, 0.25,
        "Spread footing: avg deflection ~ P/(k*L)");
}

// ================================================================
// 2. Combined Footing: Two Columns on a Single Mat
// ================================================================
//
// Two columns at positions x1 and x2 on a combined footing of length L.
// The resultant load passes through the centroid of the footing for
// uniform pressure. If loads are unequal, pressure is trapezoidal.
//
// P1 at x1, P2 at x2; total P = P1 + P2
// Centroid of loads: x_bar = (P1*x1 + P2*x2) / P
// For uniform pressure: footing centered on x_bar.
//
// We verify that the reaction distribution matches the loading.
//
// Reference: Bowles, Ch. 9; ACI 336.2R

#[test]
fn validation_combined_footing_pressure_trapezoid() {
    let l = 6.0;        // footing length
    let n = 30;
    let b = 1.2;        // width
    let h = 0.5;
    let a_sec = b * h;
    let iz = b * h * h * h / 12.0;
    let k_soil = 20_000.0 * b; // ks * b

    // Two column loads: P1 = 300 kN at x = 1.5 m, P2 = 200 kN at x = 4.5 m
    let p1 = 300.0;
    let p2 = 200.0;
    let x1 = 1.5;
    let x2 = 4.5;
    let elem_len = l / n as f64;
    let node_p1 = (x1 / elem_len).round() as usize + 1;
    let node_p2 = (x2 / elem_len).round() as usize + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_p1, fx: 0.0, fz: -p1, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_p2, fx: 0.0, fz: -p2, my: 0.0,
        }),
    ];

    let input = make_winkler_beam(n, l, k_soil, E_CONCRETE, a_sec, iz, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total spring reaction should equal total applied load
    let p_total = p1 + p2;
    let mut reaction_sum = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_sum += ky_node * d.uz.abs();
    }
    assert_close(reaction_sum, p_total, 0.05,
        "Combined footing: total reaction = P1 + P2");

    // Centroid of applied loads
    let x_bar = (p1 * x1 + p2 * x2) / p_total;

    // Centroid of spring reactions (weighted by spring forces)
    let mut reaction_moment = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let x = i as f64 * elem_len;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_moment += ky_node * d.uz.abs() * x;
    }
    let x_reaction = reaction_moment / reaction_sum;

    // The centroid of reactions should match the centroid of applied loads
    assert_close(x_reaction, x_bar, 0.05,
        "Combined footing: reaction centroid matches load centroid");

    // Since P1 > P2, deflection at P1 location should be >= deflection at P2
    let d_p1 = results.displacements.iter().find(|d| d.node_id == node_p1).unwrap();
    let d_p2 = results.displacements.iter().find(|d| d.node_id == node_p2).unwrap();
    assert!(d_p1.uz.abs() >= d_p2.uz.abs() * 0.9,
        "Combined footing: heavier column deflects more: {:.6e} vs {:.6e}",
        d_p1.uz.abs(), d_p2.uz.abs());
}

// ================================================================
// 3. Strap Footing: Eccentric Column Connected to Interior Column
// ================================================================
//
// A strap footing connects an eccentric exterior column (at the edge
// of a property line) to an interior column via a stiff strap beam.
// The strap beam transfers moment from the eccentric load to create
// a more uniform pressure under each footing pad.
//
// Model: beam on springs with two loaded zones connected by strap.
// Verify that the strap beam reduces the maximum edge pressure.
//
// Reference: Das, Ch. 6; Bowles, Ch. 9

#[test]
fn validation_strap_footing() {
    let l = 8.0;        // total length
    let n = 40;
    let b = 1.0;
    let h_strap: f64 = 0.4;  // strap beam depth
    let a_sec = b * h_strap;
    let iz = b * h_strap.powi(3) / 12.0;
    let k_soil = 15_000.0 * b;

    // Eccentric column P1 at x=0 (edge of property), interior P2 at x=6.0
    let p1 = 400.0;
    let p2 = 600.0;
    let elem_len = l / n as f64;
    let node_p1 = 1; // at left edge
    let node_p2 = (6.0 / elem_len).round() as usize + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_p1, fx: 0.0, fz: -p1, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_p2, fx: 0.0, fz: -p2, my: 0.0,
        }),
    ];

    let input = make_winkler_beam(n, l, k_soil, E_CONCRETE, a_sec, iz, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium
    let p_total = p1 + p2;
    let mut reaction_sum = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_sum += ky_node * d.uz.abs();
    }
    assert_close(reaction_sum, p_total, 0.05,
        "Strap footing: total reaction = P1 + P2");

    // The strap beam should produce bending; check that moments exist in the strap
    // region (between the two columns)
    let strap_elem = n / 4; // element in strap region
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == strap_elem).unwrap();
    assert!(ef.m_start.abs() > 0.0 || ef.m_end.abs() > 0.0,
        "Strap footing: strap beam carries moment");

    // Deflection at eccentric column (edge) vs interior column
    let d_p1 = results.displacements.iter().find(|d| d.node_id == node_p1).unwrap();
    let d_p2 = results.displacements.iter().find(|d| d.node_id == node_p2).unwrap();

    // Both should deflect downward
    assert!(d_p1.uz < 0.0, "Strap footing: edge column deflects down");
    assert!(d_p2.uz < 0.0, "Strap footing: interior column deflects down");
}

// ================================================================
// 4. Pile Cap with 3 Piles: Verify Load Distribution
// ================================================================
//
// A rigid pile cap supported on 3 piles (modeled as point springs)
// with a central load. For a symmetric arrangement, each pile carries P/3.
// For an eccentric load, the pile forces follow:
//   F_i = P/n + M*x_i / sum(x_i^2)
//
// Model: beam with 3 spring supports (piles) and a nodal load.
//
// Reference: Bowles, Ch. 16; Das, Ch. 11

#[test]
fn validation_pile_cap_3_piles() {
    let l = 4.0;        // pile cap length
    let n = 20;
    let b = 1.0;
    let h: f64 = 0.8;   // thick pile cap
    let a_sec = b * h;
    let iz = b * h.powi(3) / 12.0;
    let elem_len = l / n as f64;

    // 3 piles at x = 0, 2, 4 (equally spaced)
    let pile_nodes = vec![1, (2.0 / elem_len).round() as usize + 1, n + 1];
    let k_pile = 50_000.0; // axial stiffness of each pile (kN/m)

    // Central load P at midpoint
    let p = 900.0;
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];

    // Build input manually with spring supports only at pile locations
    let n_nodes = n + 1;
    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode {
            id, x: i as f64 * elem_len, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E_CONCRETE, nu: 0.2 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: a_sec, iz, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..n {
        let id = i + 1;
        elems_map.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    for (i, &nid) in pile_nodes.iter().enumerate() {
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: nid,
            support_type: "spring".to_string(),
            kx, ky: Some(k_pile), kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
    }

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Compute pile forces from deflections: F_pile = k_pile * |uy|
    let pile_forces: Vec<f64> = pile_nodes.iter().map(|&nid| {
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        k_pile * d.uz.abs()
    }).collect();

    // Total pile force should equal applied load
    let total_pile: f64 = pile_forces.iter().sum();
    assert_close(total_pile, p, 0.05,
        "Pile cap: sum of pile forces = P");

    // For symmetric loading (P at center), the center pile should carry more
    // and the two end piles should carry equal amounts
    assert_close(pile_forces[0], pile_forces[2], 0.05,
        "Pile cap: symmetric end piles carry equal load");

    // Each pile should carry a reasonable fraction of the load
    for (i, &f) in pile_forces.iter().enumerate() {
        assert!(f > 0.0, "Pile cap: pile {} carries positive load: {:.2}", i, f);
        assert!(f < p, "Pile cap: pile {} carries less than total: {:.2}", i, f);
    }
}

// ================================================================
// 5. Retaining Wall Stem: Cantilever Under Triangular Earth Pressure
// ================================================================
//
// A retaining wall stem modeled as a vertical cantilever (fixed at
// the base) under triangular lateral earth pressure.
//
// Active earth pressure: p(z) = Ka * gamma * z
// where Ka = coefficient of active earth pressure
//       gamma = soil unit weight
//       z = depth from top
//
// For a cantilever wall of height H:
//   Total force: Pa = 0.5 * Ka * gamma * H^2
//   Acting at H/3 from base
//   Base moment: M_base = Pa * H/3 = Ka * gamma * H^3 / 6
//   Base shear: V_base = Pa
//
// We model the stem as a horizontal cantilever (fixed at right,
// free at left) with a linearly varying load (zero at free end,
// maximum at fixed end), which is equivalent to the vertical wall.
//
// Reference: Das, Ch. 7; Bowles, Ch. 12

#[test]
fn validation_retaining_wall_stem() {
    let h: f64 = 5.0;   // wall height (m)
    let n = 20;
    let b = 1.0;        // unit width
    let t: f64 = 0.3;   // wall thickness
    let a_sec = b * t;
    let iz = b * t.powi(3) / 12.0;

    // Soil properties
    let ka = 0.333;     // Ka for phi = 30 degrees: (1-sin30)/(1+sin30) = 1/3
    let gamma = 18.0;   // kN/m^3

    // Maximum earth pressure at base: p_max = Ka * gamma * H
    let p_max = ka * gamma * h;

    // Model as a horizontal cantilever: fixed at node 1 (x=0, the base),
    // free at node n+1 (x=H, the top). Earth pressure is maximum at the base
    // and zero at the top: q(x) = p_max * (1 - x/H).

    let elem_len = h / n as f64;
    let loads: Vec<SolverLoad> = (0..n).map(|i| {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        let q_i = -p_max * (1.0 - x_i / h);
        let q_j = -p_max * (1.0 - x_j / h);
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        })
    }).collect();

    let input = crate::common::make_beam(n, h, E_CONCRETE, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base moment: M_base = Ka * gamma * H^3 / 6
    let m_base_exact = ka * gamma * h.powi(3) / 6.0;

    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.my.abs(), m_base_exact, 0.05,
        "Retaining wall: base moment = Ka*gamma*H^3/6");

    // Base shear: V_base = Pa = 0.5 * Ka * gamma * H^2
    let v_base_exact = 0.5 * ka * gamma * h * h;
    assert_close(r_base.rz.abs(), v_base_exact, 0.05,
        "Retaining wall: base shear = 0.5*Ka*gamma*H^2");
}

// ================================================================
// 6. Grade Beam with Concentrated Loads
// ================================================================
//
// A grade beam (foundation beam) on Winkler springs with two
// concentrated column loads. Verify bending moments and deflections
// against known beam on elastic foundation behavior.
//
// For a beam on springs with two symmetric point loads P at distance
// 'a' from each end, total load = 2P, and the beam settles more
// under the loads than at the ends or center.
//
// Reference: Hetenyi (1946), Ch. 4; Bowles, Ch. 9

#[test]
fn validation_grade_beam_concentrated_loads() {
    let l = 10.0;       // beam length
    let n = 40;
    let b = 0.4;        // beam width
    let h: f64 = 0.6;   // beam depth
    let a_sec = b * h;
    let iz = b * h.powi(3) / 12.0;

    // Subgrade modulus for stiff clay
    let ks = 40_000.0;
    let k_soil = ks * b;

    // Two column loads symmetrically placed
    let p = 200.0;
    let elem_len = l / n as f64;
    let node_left = (2.5 / elem_len).round() as usize + 1;
    let node_right = (7.5 / elem_len).round() as usize + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_left, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_right, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];

    let input = make_winkler_beam(n, l, k_soil, E_CONCRETE, a_sec, iz, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium
    let p_total = 2.0 * p;
    let mut reaction_sum = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_sum += ky_node * d.uz.abs();
    }
    assert_close(reaction_sum, p_total, 0.05,
        "Grade beam: total spring reaction = 2P");

    // Symmetry: deflection at left load ~ deflection at right load
    let d_left = results.displacements.iter().find(|d| d.node_id == node_left).unwrap();
    let d_right = results.displacements.iter().find(|d| d.node_id == node_right).unwrap();
    assert_close(d_left.uz, d_right.uz, 0.05,
        "Grade beam: symmetric loads give symmetric deflections");

    // Bending moment should be non-zero under the loads
    // The maximum bending moment should occur near the load points
    let max_moment = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    assert!(max_moment > 0.0,
        "Grade beam: non-zero bending moment: {:.4}", max_moment);

    // Deflection at load points should be greater than at beam ends
    let d_end = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_left.uz.abs() > d_end.uz.abs(),
        "Grade beam: load point deflects more than end: {:.6e} > {:.6e}",
        d_left.uz.abs(), d_end.uz.abs());
}

// ================================================================
// 7. Mat Foundation: Flexible Mat Under Column Loads
// ================================================================
//
// A flexible mat foundation (long beam on springs) with multiple
// column loads. Differential settlement between loaded and unloaded
// areas is the key design concern.
//
// For a flexible mat (beta*L >> 1), the deflection under each column
// is localized and the differential settlement between loaded and
// unloaded zones is significant.
//
// Reference: Bowles, Ch. 10; ACI 336.2R

#[test]
fn validation_mat_foundation_differential_settlement() {
    let l = 20.0;       // mat length
    let n = 60;
    let b = 1.0;        // unit width strip
    let h: f64 = 0.4;   // thin mat (flexible)
    let a_sec = b * h;
    let iz = b * h.powi(3) / 12.0;

    // Soft soil with low subgrade modulus
    let ks = 10_000.0;
    let k_soil = ks * b;
    let elem_len = l / n as f64;

    // Three column loads at x = 3, 10, 17
    let p1 = 300.0;
    let p2 = 500.0;
    let p3 = 300.0;
    let node1 = (3.0 / elem_len).round() as usize + 1;
    let node2 = (10.0 / elem_len).round() as usize + 1;
    let node3 = (17.0 / elem_len).round() as usize + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node1, fx: 0.0, fz: -p1, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node2, fx: 0.0, fz: -p2, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node3, fx: 0.0, fz: -p3, my: 0.0,
        }),
    ];

    let input = make_winkler_beam(n, l, k_soil, E_CONCRETE, a_sec, iz, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium
    let p_total = p1 + p2 + p3;
    let mut reaction_sum = 0.0;
    for i in 0..(n + 1) {
        let nid = i + 1;
        let trib = if i == 0 || i == n { elem_len / 2.0 } else { elem_len };
        let ky_node = k_soil * trib;
        let d = results.displacements.iter().find(|d| d.node_id == nid).unwrap();
        reaction_sum += ky_node * d.uz.abs();
    }
    assert_close(reaction_sum, p_total, 0.05,
        "Mat foundation: total reaction = sum of loads");

    // Differential settlement: the center column (largest load) should
    // have the maximum deflection
    let d1 = results.displacements.iter().find(|d| d.node_id == node1).unwrap();
    let d2 = results.displacements.iter().find(|d| d.node_id == node2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == node3).unwrap();

    assert!(d2.uz.abs() > d1.uz.abs(),
        "Mat foundation: center column settles more than edge: {:.6e} > {:.6e}",
        d2.uz.abs(), d1.uz.abs());

    // Symmetric edge columns should have similar deflection
    assert_close(d1.uz, d3.uz, 0.05,
        "Mat foundation: symmetric columns settle equally");

    // Unloaded zone (midpoint between columns) should settle less than loaded
    let mid_unloaded = (6.5 / elem_len).round() as usize + 1;
    let d_unloaded = results.displacements.iter()
        .find(|d| d.node_id == mid_unloaded).unwrap();
    assert!(d_unloaded.uz.abs() < d1.uz.abs(),
        "Mat foundation: unloaded zone settles less: {:.6e} < {:.6e}",
        d_unloaded.uz.abs(), d1.uz.abs());

    // Differential settlement = max deflection - min deflection
    let max_settle = results.displacements.iter()
        .map(|d| d.uz.abs()).fold(0.0_f64, f64::max);
    let min_settle = results.displacements.iter()
        .map(|d| d.uz.abs()).fold(f64::INFINITY, f64::min);
    let diff_settle = max_settle - min_settle;
    assert!(diff_settle > 0.0,
        "Mat foundation: differential settlement > 0: {:.6e}", diff_settle);
}

// ================================================================
// 8. Deep Beam Foundation: Short Deep Beam with High Shear
// ================================================================
//
// A deep beam (span/depth < 4) has behavior dominated by shear
// rather than flexure. Euler-Bernoulli theory underestimates
// deflections for such beams.
//
// For a simply-supported deep beam with central point load:
// - Standard beam theory: delta = PL^3/(48EI)
// - The shear force distribution should show V = P/2 on each side
// - Moment at center: M = PL/4
//
// We verify that the beam model correctly computes the bending
// moment and shear distribution even for a deep beam geometry.
//
// Reference: Timoshenko, "Theory of Elasticity"; ACI 318, Ch. 23

#[test]
fn validation_deep_beam_foundation() {
    let l = 3.0;        // short span
    let h: f64 = 1.0;   // deep section (L/d = 3)
    let b = 0.5;        // width
    let n = 12;
    let a_sec = b * h;
    let iz = b * h.powi(3) / 12.0;

    let p = 1000.0;     // heavy load
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = crate::common::make_beam(n, l, E_CONCRETE, a_sec, iz,
        "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: each support carries P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.rz, p / 2.0, 0.02,
        "Deep beam: R_A = P/2");
    assert_close(r_b.rz, p / 2.0, 0.02,
        "Deep beam: R_B = P/2");

    // Midspan moment: M = P*L/4
    let m_exact = p * l / 4.0;

    // Get moment at midspan from element forces
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_exact, 0.05,
        "Deep beam: M_mid = PL/4");

    // Shear force should be P/2 in each half
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_left.v_start.abs(), p / 2.0, 0.05,
        "Deep beam: V_left = P/2");

    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_right.v_end.abs(), p / 2.0, 0.05,
        "Deep beam: V_right = P/2");

    // Euler-Bernoulli midspan deflection: delta = PL^3/(48*EI)
    let e_eff = E_CONCRETE * 1000.0; // solver internal units
    let ei = e_eff * iz;
    let delta_euler = p * l.powi(3) / (48.0 * ei);

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    // Euler-Bernoulli underestimates deep beam deflection but the solver
    // uses Euler-Bernoulli, so they should match
    assert_close(d_mid.uz.abs(), delta_euler, 0.05,
        "Deep beam: midspan deflection matches EB theory");

    // Verify the span/depth ratio is indeed "deep beam" territory
    let span_depth = l / h;
    assert!(span_depth <= 4.0,
        "Deep beam: L/d = {:.1} <= 4.0", span_depth);
}
