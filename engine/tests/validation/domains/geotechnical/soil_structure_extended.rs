/// Validation: Extended Soil-Structure Interaction
///
/// References:
///   - Hetenyi (1946): Beams on Elastic Foundation, University of Michigan Press
///   - Bowles, "Foundation Analysis and Design", 5th Ed., McGraw-Hill
///   - Das, "Principles of Foundation Engineering", 9th Ed.
///   - Terzaghi, "Theoretical Soil Mechanics"
///   - Poulos & Davis, "Elastic Solutions for Soil and Rock Mechanics"
///   - ACI 336.2R: "Suggested Analysis and Design Procedures for Combined Footings"
///   - Vesic (1961): "Bending of Beams Resting on Isotropic Elastic Solid", ASCE
///
/// Tests use the 2D linear solver with Winkler spring supports (ky field)
/// to verify soil-structure interaction behavior against closed-form solutions
/// and known parametric trends.
///
/// Tests:
///   1. Beam on Winkler springs — Hetenyi closed-form comparison
///   2. Mat foundation — distributed springs under rigid block
///   3. Pile group — vertical springs with pile cap beam
///   4. Lateral earth pressure — equivalent loads on retaining wall
///   5. Surcharge loading — additional pressure on foundation beam
///   6. Subgrade reaction modulus effect — ks variation on settlement
///   7. Foundation flexibility ratio — rigid vs flexible foundation
///   8. Spring-supported portal — base flexibility effect on sway
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::assert_close;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa; solver uses E * 1000.0 internally (kN/m^2)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

/// Create a beam on Winkler foundation: dense spring supports along length.
/// k_soil = foundation modulus (kN/m per m of beam length).
/// Each node gets ky = k_soil * tributary_length.
/// Node 1 also gets a very stiff axial restraint to prevent horizontal sliding.
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
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

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

    // Spring supports at every node with tributary weighting
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

/// Build a portal frame with spring supports at the bases instead of fixed.
/// Nodes: 1 (base-left), 2 (top-left), 3 (top-right), 4 (base-right).
/// Elements: 1 (col left 1->2), 2 (beam 2->3), 3 (col right 3->4).
fn make_portal_spring_base(
    h: f64,
    w: f64,
    e: f64,
    a: f64,
    iz: f64,
    ky_base: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes_map = HashMap::new();
    nodes_map.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes_map.insert("2".to_string(), SolverNode { id: 2, x: 0.0, z: h });
    nodes_map.insert("3".to_string(), SolverNode { id: 3, x: w, z: h });
    nodes_map.insert("4".to_string(), SolverNode { id: 4, x: w, z: 0.0 });

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elems_map = HashMap::new();
    elems_map.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elems_map.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(),
        node_i: 2, node_j: 3, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elems_map.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(),
        node_i: 3, node_j: 4, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    // Spring supports at both base nodes: vertical spring + stiff horizontal + stiff rotational
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "spring".to_string(),
        kx: Some(1e10), ky: Some(ky_base), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "spring".to_string(),
        kx: Some(1e10), ky: Some(ky_base), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

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
// 1. Beam on Winkler Springs -- Hetenyi Closed-Form Comparison
// ================================================================
//
// An "infinite" beam on elastic foundation with a concentrated midspan
// load P. Hetenyi gives the midspan deflection:
//   delta_0 = P * beta / (2 * k)
// where beta = (k / (4*EI))^(1/4).
//
// The midspan bending moment is:
//   M_0 = P / (4 * beta)
//
// We model a very long beam (beta*L = 5*pi) with dense springs and
// compare midspan deflection and moment to the closed-form values.
//
// Reference: Hetenyi (1946), Ch. 3
#[test]
fn validation_ssi_beam_winkler_hetenyi() {
    let e_eff = E * 1000.0; // kN/m^2
    let k_soil = 12_000.0;  // kN/m^2
    let ei = e_eff * IZ;

    let beta = (k_soil / (4.0 * ei)).powf(0.25);
    let l = 5.0 * std::f64::consts::PI / beta;
    let n = 100;

    let p = 80.0; // kN
    let mid_node = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_winkler_beam(n, l, k_soil, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // --- Hetenyi closed-form deflection ---
    let delta_hetenyi = p * beta / (2.0 * k_soil);

    let mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    let delta_computed = mid.uz.abs();

    let error_delta = (delta_computed - delta_hetenyi).abs() / delta_hetenyi;
    assert!(
        error_delta < 0.10,
        "Hetenyi deflection: computed={:.6e}, analytical={:.6e}, error={:.2}%",
        delta_computed, delta_hetenyi, error_delta * 100.0
    );

    // Deflection must be downward
    assert!(mid.uz < 0.0, "Deflection should be downward: uy={:.6e}", mid.uz);

    // --- Hetenyi closed-form moment ---
    let m_hetenyi = p / (4.0 * beta);

    // Extract moment from element forces at midspan.
    // The element ending at mid_node has m_end, the one starting has m_start.
    let mid_elem_id = n / 2; // element ending at mid_node
    let ef = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_elem_id)
        .unwrap();
    let m_computed = ef.m_end.abs();

    let error_m = (m_computed - m_hetenyi).abs() / m_hetenyi;
    assert!(
        error_m < 0.15,
        "Hetenyi moment: computed={:.4}, analytical={:.4}, error={:.2}%",
        m_computed, m_hetenyi, error_m * 100.0
    );

    // --- Verify characteristic length is reasonable ---
    let l_char = 1.0 / beta;
    assert!(l_char > 0.5 && l_char < 20.0,
        "Characteristic length L_c={:.2} m should be in reasonable range", l_char);
}

// ================================================================
// 2. Mat Foundation -- Distributed Springs Under Rigid Block
// ================================================================
//
// A mat (raft) foundation modeled as a beam on Winkler springs under
// uniform gravity loading. For a very stiff beam (rigid mat), all
// springs should compress nearly equally, giving uniform settlement:
//   delta = q * L / (k_soil * L) = q / k_soil
//
// where q is the UDL intensity (kN/m) and k_soil is the subgrade
// modulus (kN/m per m).
//
// We verify:
//   1. Nearly uniform settlement (rigid mat behavior)
//   2. Settlement magnitude matches q / k_soil
//   3. Total spring reaction equals total applied load
//
// Reference: ACI 336.2R; Bowles, Ch. 10
#[test]
fn validation_ssi_mat_foundation_rigid_block() {
    let k_soil = 20_000.0;  // kN/m^2 subgrade modulus
    let l = 6.0;            // m, mat length
    let n = 30;             // number of elements
    let iz_stiff = 0.1;     // m^4, very stiff section (thick mat)
    let a_mat = 0.5;        // m^2

    let q = -10.0; // kN/m, uniform downward load

    // Apply UDL on all elements
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_winkler_beam(n, l, k_soil, E, a_mat, iz_stiff, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected uniform settlement for rigid mat
    let q_abs = q.abs();
    let delta_expected = q_abs / k_soil; // m

    // Check midspan deflection
    let mid_node = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    let error_mid = (d_mid - delta_expected).abs() / delta_expected;
    assert!(
        error_mid < 0.15,
        "Mat settlement: mid={:.6e}, expected={:.6e}, error={:.2}%",
        d_mid, delta_expected, error_mid * 100.0
    );

    // Check uniformity: compare end vs midspan deflection
    let d_end = results
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap()
        .uz
        .abs();
    let uniformity = d_end / d_mid;
    assert!(
        uniformity > 0.70,
        "Rigid mat uniformity: end/mid={:.3} should be > 0.70",
        uniformity
    );

    // Check total reaction equals total applied load
    let total_load = q_abs * l;
    let total_reaction: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let equil_error = (total_reaction - total_load).abs() / total_load;
    assert!(
        equil_error < 0.01,
        "Equilibrium: total_reaction={:.3}, total_load={:.3}, error={:.4}%",
        total_reaction, total_load, equil_error * 100.0
    );
}

// ================================================================
// 3. Pile Group -- Vertical Springs with Pile Cap Beam
// ================================================================
//
// A pile cap beam supported by discrete piles modeled as point
// springs. Three piles at x = 0, L/2, L with spring stiffness
// k_pile = EA_pile / L_pile.
//
// Under a central point load P on the cap beam:
//   - Center pile carries more load (shorter influence path)
//   - Sum of pile reactions = P (vertical equilibrium)
//   - Settlement is largest at center
//
// Pile stiffness: k = E_pile * A_pile / L_pile
//   E_pile = 30 GPa (concrete), A_pile = pi/4 * 0.6^2 = 0.2827 m^2
//   L_pile = 15 m
//   k_pile = 30e6 * 0.2827 / 15 = 565,400 kN/m
//
// Reference: Poulos & Davis, Ch. 6; Bowles, Ch. 16
#[test]
fn validation_ssi_pile_group_cap_beam() {
    // Pile stiffness
    let e_pile = 30.0e6; // kN/m^2 (30 GPa concrete)
    let d_pile = 0.6;    // m, pile diameter
    let a_pile = std::f64::consts::PI / 4.0 * d_pile * d_pile;
    let l_pile = 15.0;   // m, pile length
    let k_pile = e_pile * a_pile / l_pile;

    // Cap beam parameters
    let l_cap = 4.0; // m, pile cap length
    let n = 20;
    let elem_len = l_cap / n as f64;
    let a_cap = 0.3;   // m^2
    let iz_cap = 0.01;  // m^4

    let p = 500.0; // kN, central load on pile cap

    // Build nodes
    let n_nodes = n + 1;
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
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: a_cap, iz: iz_cap, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
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

    // Pile springs at nodes 1 (x=0), midspan, and last (x=L)
    let mid_node = n / 2 + 1;
    let end_node = n + 1;

    let mut sups_map = HashMap::new();
    // Left pile
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "spring".to_string(),
        kx: Some(1e10), ky: Some(k_pile), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Center pile
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "spring".to_string(),
        kx: None, ky: Some(k_pile), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Right pile
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: end_node, support_type: "spring".to_string(),
        kx: None, ky: Some(k_pile), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    // Central load
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum of pile reactions = P
    let total_reaction: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_reaction, p, 0.01, "Pile group equilibrium: sum Ry = P");

    // Center pile should carry more load than edge piles
    let r_center = results
        .reactions
        .iter()
        .find(|r| r.node_id == mid_node)
        .unwrap()
        .rz;
    let r_left = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .rz;
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == end_node)
        .unwrap()
        .rz;

    assert!(
        r_center > r_left,
        "Center pile carries more: R_center={:.2} > R_left={:.2}",
        r_center, r_left
    );

    // Edge piles should carry equal load by symmetry
    let sym_error = (r_left - r_right).abs() / r_left.abs().max(1.0);
    assert!(
        sym_error < 0.01,
        "Symmetry: R_left={:.4}, R_right={:.4}, error={:.4}%",
        r_left, r_right, sym_error * 100.0
    );

    // Settlement should be largest at center
    let d_center = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz
        .abs();
    let d_edge = results
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap()
        .uz
        .abs();

    assert!(
        d_center > d_edge,
        "Center settles more: d_center={:.6e} > d_edge={:.6e}",
        d_center, d_edge
    );
}

// ================================================================
// 4. Lateral Earth Pressure -- Equivalent Loads on Retaining Wall
// ================================================================
//
// A cantilever retaining wall modeled as a vertical beam with active
// earth pressure applied as a triangular distributed load.
//
// Rankine active pressure:
//   Ka = (1 - sin(phi)) / (1 + sin(phi))
//   For phi = 30 deg: Ka = 1/3
//
// Triangular pressure on wall height H = 5 m:
//   p(z) = Ka * gamma * z
//   At base (z = H): p_max = Ka * gamma * H = (1/3) * 18 * 5 = 30 kN/m^2
//
// The wall is modeled as a vertical cantilever beam (fixed at base,
// free at top). The earth pressure is a triangular load varying
// from 0 at top to p_max at base.
//
// Closed-form results for triangular load on cantilever:
//   Reaction at base: R = Pa = 0.5 * Ka * gamma * H^2 = 75 kN/m
//   Base moment: M = Pa * H/3 = 75 * 5/3 = 125 kN*m
//
// Reference: Terzaghi; Das, Ch. 7
#[test]
fn validation_ssi_lateral_earth_pressure() {
    let phi_deg: f64 = 30.0;
    let gamma_soil: f64 = 18.0; // kN/m^3
    let h: f64 = 5.0;           // m, wall height

    let phi_rad = phi_deg * std::f64::consts::PI / 180.0;
    let ka = (1.0 - phi_rad.sin()) / (1.0 + phi_rad.sin());

    // Maximum pressure at base
    let p_max = ka * gamma_soil * h;

    // Total active force and its point of application
    let pa = 0.5 * ka * gamma_soil * h * h;
    let m_base = pa * h / 3.0;

    // Model as a vertical cantilever (along Y-axis).
    // The beam goes from node 1 at y=0 (top) to node n+1 at y=-H (base).
    // Earth pressure acts horizontally (fx direction), linearly from 0 at top
    // to p_max at base.
    //
    // In the 2D solver, a beam along the Y-axis has:
    //   - Distributed loads q_i, q_j in the transverse (local) direction
    //   - For a vertical beam: transverse = horizontal
    //
    // We model this as a horizontal beam and apply the triangular load
    // as transverse (fy), which is equivalent.
    let n = 20;
    let elem_len = h / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..=n {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode {
            id,
            x: i as f64 * elem_len,
            z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    let iz_wall = 0.001; // m^4
    let a_wall = 0.3;    // m^2
    secs_map.insert("1".to_string(), SolverSection {
        id: 1, a: a_wall, iz: iz_wall, as_y: None,
    });

    let mut elems_map = HashMap::new();
    for i in 0..n {
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

    // Fixed at base (node 1, x=0), free at top (node n+1, x=H)
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    // Triangular load: 0 at node 1 (base), p_max at node n+1 (top).
    // Wait -- we model base at x=0 with the maximum pressure,
    // and free end at x=H with zero pressure.
    // So the load goes from p_max at node 1 to 0 at node n+1.
    // Direction: downward fy (transverse to the beam).
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        // Linear pressure at positions (measured from base at x=0):
        //   p(x) = p_max * (1 - x/H)  (max at base, zero at top)
        let q_i = -p_max * (1.0 - x_i / h);
        let q_j = -p_max * (1.0 - x_j / h);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i,
            q_j,
            a: None,
            b: None,
        }));
    }

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Check total horizontal reaction at base
    // For a horizontal beam with transverse load, the reaction is in Y direction.
    let ry_base = results.reactions[0].rz;
    assert_close(ry_base.abs(), pa, 0.02,
        "Base reaction = total active force Pa");

    // Check base moment
    let mz_base = results.reactions[0].my;
    assert_close(mz_base.abs(), m_base, 0.05,
        "Base moment = Pa * H/3");

    // Free end should have zero moment
    let end_elem = results
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n)
        .unwrap();
    assert!(
        end_elem.m_end.abs() < 1.0,
        "Free end moment should be near zero: m_end={:.4}",
        end_elem.m_end
    );
}

// ================================================================
// 5. Surcharge Loading -- Additional Pressure on Foundation Beam
// ================================================================
//
// A foundation beam on Winkler springs subjected to two load cases:
//   Case A: Self-weight only (uniform q = 5 kN/m)
//   Case B: Self-weight + surcharge (uniform q = 5 + 15 = 20 kN/m)
//
// By superposition, the additional settlement from surcharge should
// equal the difference between case B and case A settlements.
// Also, delta_B / delta_A = q_B / q_A = 4.0 (linearity check).
//
// Reference: Bowles, Ch. 10; Vesic (1961)
#[test]
fn validation_ssi_surcharge_loading() {
    let k_soil = 15_000.0; // kN/m^2
    let l = 8.0;           // m
    let n = 40;
    let mid_node = n / 2 + 1;

    let q_self = -5.0;       // kN/m, self-weight
    let q_surcharge = -15.0;  // kN/m, surcharge
    let q_total = q_self + q_surcharge;

    // --- Case A: Self-weight only ---
    let mut loads_a = Vec::new();
    for i in 0..n {
        loads_a.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_self,
            q_j: q_self,
            a: None,
            b: None,
        }));
    }
    let input_a = make_winkler_beam(n, l, k_soil, E, A, IZ, loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();

    let d_mid_a = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz;

    // --- Case B: Self-weight + surcharge ---
    let mut loads_b = Vec::new();
    for i in 0..n {
        loads_b.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_total,
            q_j: q_total,
            a: None,
            b: None,
        }));
    }
    let input_b = make_winkler_beam(n, l, k_soil, E, A, IZ, loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();

    let d_mid_b = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz;

    // --- Case C: Surcharge only (for superposition check) ---
    let mut loads_c = Vec::new();
    for i in 0..n {
        loads_c.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_surcharge,
            q_j: q_surcharge,
            a: None,
            b: None,
        }));
    }
    let input_c = make_winkler_beam(n, l, k_soil, E, A, IZ, loads_c);
    let results_c = linear::solve_2d(&input_c).unwrap();

    let d_mid_c = results_c
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz;

    // Superposition: delta_A + delta_C = delta_B
    let d_super = d_mid_a + d_mid_c;
    let super_error = (d_super - d_mid_b).abs() / d_mid_b.abs().max(1e-10);
    assert!(
        super_error < 0.02,
        "Superposition: d_A+d_C={:.6e}, d_B={:.6e}, error={:.2}%",
        d_super, d_mid_b, super_error * 100.0
    );

    // Linearity: ratio of deflections should match ratio of loads
    let load_ratio = q_total / q_self; // = 4.0
    let defl_ratio = d_mid_b / d_mid_a;
    let ratio_error = (defl_ratio - load_ratio).abs() / load_ratio.abs();
    assert!(
        ratio_error < 0.02,
        "Linearity: defl_ratio={:.4}, load_ratio={:.4}, error={:.2}%",
        defl_ratio, load_ratio, ratio_error * 100.0
    );

    // Surcharge increases settlement (both should be negative / downward)
    assert!(
        d_mid_b < d_mid_a,
        "Surcharge increases settlement: d_B={:.6e} < d_A={:.6e}",
        d_mid_b, d_mid_a
    );
}

// ================================================================
// 6. Subgrade Reaction Modulus Effect -- ks Variation on Settlement
// ================================================================
//
// For a beam on Winkler foundation, increasing the subgrade modulus
// k_s reduces settlement. The analytical relationship for an infinite
// beam is: delta_0 ~ k^(-3/4) (since delta = P*beta/(2k) and
// beta ~ k^(1/4)).
//
// We test four values of ks and verify:
//   1. Monotonically decreasing settlement with increasing ks
//   2. Approximate k^(-3/4) scaling
//
// Reference: Hetenyi (1946); Vesic (1961)
#[test]
fn validation_ssi_subgrade_modulus_effect() {
    let p = 60.0; // kN
    let n = 80;
    let e_eff = E * 1000.0;

    let ks_values = [5_000.0, 10_000.0, 20_000.0, 40_000.0];
    let mut deflections = Vec::new();

    for &ks in &ks_values {
        let beta = (ks / (4.0 * e_eff * IZ)).powf(0.25);
        let l = 5.0 * std::f64::consts::PI / beta;
        let mid_node = n / 2 + 1;

        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })];

        let input = make_winkler_beam(n, l, ks, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();

        let d_mid = results
            .displacements
            .iter()
            .find(|d| d.node_id == mid_node)
            .unwrap()
            .uz
            .abs();
        deflections.push(d_mid);
    }

    // Monotonically decreasing settlement with increasing ks
    for i in 0..deflections.len() - 1 {
        assert!(
            deflections[i] > deflections[i + 1],
            "Stiffer soil -> less settlement: ks={}, d={:.6e} should be > ks={}, d={:.6e}",
            ks_values[i], deflections[i], ks_values[i + 1], deflections[i + 1]
        );
    }

    // Check approximate k^(-3/4) scaling between consecutive ks doubling
    // When k doubles: ratio should be 2^(3/4) ~ 1.68
    let expected_ratio = 2.0_f64.powf(0.75);
    for i in 0..deflections.len() - 1 {
        let ratio = deflections[i] / deflections[i + 1];
        let ratio_error = (ratio - expected_ratio).abs() / expected_ratio;
        assert!(
            ratio_error < 0.20,
            "k^(-3/4) scaling: ks_ratio={}, d_ratio={:.3}, expected={:.3}, error={:.1}%",
            ks_values[i + 1] / ks_values[i], ratio, expected_ratio, ratio_error * 100.0
        );
    }

    // Verify significant range: softest soil settlement should be at least
    // 4x the stiffest soil settlement (since ks ratio = 8, 8^(3/4) ~ 4.76)
    let overall_ratio = deflections[0] / deflections[3];
    assert!(
        overall_ratio > 3.0,
        "Overall settlement ratio: d(ks=5000)/d(ks=40000)={:.2} should be > 3.0",
        overall_ratio
    );
}

// ================================================================
// 7. Foundation Flexibility Ratio -- Rigid vs Flexible Foundation
// ================================================================
//
// The foundation flexibility ratio (Vesic 1961):
//   K_f = (E_s * B) / (E_b * I_b)
// where E_s = soil modulus, B = beam width, E_b I_b = beam stiffness.
//
// When K_f is small (stiff beam on soft soil): rigid behavior,
//   nearly uniform settlement.
// When K_f is large (flexible beam on stiff soil): localized
//   deflection under load.
//
// We test two extreme cases and verify deflection distribution.
//
// Reference: Vesic (1961); Bowles, Ch. 10
#[test]
fn validation_ssi_foundation_flexibility_ratio() {
    let p = 50.0;  // kN, central load
    let l = 10.0;  // m, beam length
    let n = 40;
    let mid_node = n / 2 + 1;

    // --- Case A: Rigid foundation (very stiff beam, soft soil) ---
    let iz_rigid = 1.0;       // m^4, very large
    let k_soft = 1_000.0;     // kN/m^2, very soft

    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input_a = make_winkler_beam(n, l, k_soft, E, A, iz_rigid, loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();

    let d_mid_rigid = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz
        .abs();
    let d_end_rigid = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap()
        .uz
        .abs();

    let uniformity_rigid = d_end_rigid / d_mid_rigid;

    // --- Case B: Flexible foundation (flexible beam, stiff soil) ---
    let iz_flex = 1e-6;       // m^4, very small
    let k_stiff = 50_000.0;   // kN/m^2, very stiff

    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input_b = make_winkler_beam(n, l, k_stiff, E, A, iz_flex, loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();

    let d_mid_flex = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz
        .abs();
    let d_end_flex = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap()
        .uz
        .abs();

    let uniformity_flex = d_end_flex / d_mid_flex;

    // Rigid foundation has more uniform settlement
    assert!(
        uniformity_rigid > uniformity_flex,
        "Rigid more uniform: rigid_ratio={:.3} > flex_ratio={:.3}",
        uniformity_rigid, uniformity_flex
    );

    // Rigid case: end deflection should be a large fraction of mid
    assert!(
        uniformity_rigid > 0.50,
        "Rigid foundation: end/mid={:.3} should be > 0.50",
        uniformity_rigid
    );

    // Flexible case: deflection should be localized (end << mid)
    assert!(
        uniformity_flex < 0.30,
        "Flexible foundation: end/mid={:.3} should be < 0.30",
        uniformity_flex
    );

    // Also check quarter-point deflection for intermediate behavior
    let qtr_node = n / 4 + 1;
    let d_qtr_rigid = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == qtr_node)
        .unwrap()
        .uz
        .abs();
    let d_qtr_flex = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == qtr_node)
        .unwrap()
        .uz
        .abs();

    let qtr_ratio_rigid = d_qtr_rigid / d_mid_rigid;
    let qtr_ratio_flex = d_qtr_flex / d_mid_flex;

    assert!(
        qtr_ratio_rigid > qtr_ratio_flex,
        "Quarter-point: rigid ratio={:.3} > flex ratio={:.3}",
        qtr_ratio_rigid, qtr_ratio_flex
    );
}

// ================================================================
// 8. Spring-Supported Portal -- Base Flexibility Effect on Sway
// ================================================================
//
// A portal frame with spring supports at the base instead of fixed
// supports. Base flexibility (finite ky) allows vertical settlement
// which changes the moment distribution and increases sway.
//
// We compare three cases under lateral load H = 50 kN:
//   Case A: Fixed base (reference, using very stiff springs)
//   Case B: Moderately flexible springs (ky = 50,000 kN/m)
//   Case C: Soft springs (ky = 5,000 kN/m)
//
// Expected behavior:
//   1. Softer springs produce more lateral sway at beam level
//   2. Softer springs change the moment distribution in columns
//   3. Vertical equilibrium is maintained in all cases
//
// Reference: Bowles, Ch. 9; ACI 336.2R
#[test]
fn validation_ssi_spring_supported_portal() {
    let h_frame = 4.0;  // m, column height
    let w_frame = 6.0;  // m, bay width
    let a_frame = 0.02;  // m^2
    let iz_frame = 5e-4; // m^4

    let h_lateral = 50.0; // kN, lateral load at top-left

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_lateral, fz: 0.0, my: 0.0,
    })];

    // --- Case A: Effectively fixed base (very stiff springs) ---
    let input_a = make_portal_spring_base(
        h_frame, w_frame, E, a_frame, iz_frame,
        1e12, // very stiff springs ~ fixed
        loads.clone(),
    );
    let results_a = linear::solve_2d(&input_a).unwrap();

    let sway_a = results_a
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // --- Case B: Moderate spring stiffness ---
    let input_b = make_portal_spring_base(
        h_frame, w_frame, E, a_frame, iz_frame,
        50_000.0,
        loads.clone(),
    );
    let results_b = linear::solve_2d(&input_b).unwrap();

    let sway_b = results_b
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // --- Case C: Soft springs ---
    let input_c = make_portal_spring_base(
        h_frame, w_frame, E, a_frame, iz_frame,
        5_000.0,
        loads.clone(),
    );
    let results_c = linear::solve_2d(&input_c).unwrap();

    let sway_c = results_c
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Softer springs produce more sway
    assert!(
        sway_c > sway_b,
        "Soft springs more sway: sway_C={:.6e} > sway_B={:.6e}",
        sway_c, sway_b
    );
    assert!(
        sway_b > sway_a,
        "Moderate springs more sway than fixed: sway_B={:.6e} > sway_A={:.6e}",
        sway_b, sway_a
    );

    // Fixed base sway should be close to the "stiff spring" result
    // (since 1e12 approximates a fixed support)
    // The real check: sway_A should be much less than sway_C
    assert!(
        sway_c > 1.5 * sway_a,
        "Soft springs at least 50% more sway: sway_C/sway_A={:.2}",
        sway_c / sway_a
    );

    // Horizontal equilibrium in all cases
    for (label, results) in [("A", &results_a), ("B", &results_b), ("C", &results_c)] {
        let total_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
        let equil_error = (total_rx + h_lateral).abs() / h_lateral;
        assert!(
            equil_error < 0.01,
            "Case {}: horizontal equil error={:.4}%, sum_Rx={:.4}, H={:.4}",
            label, equil_error * 100.0, total_rx, h_lateral
        );
    }

    // Vertical equilibrium: no vertical load, so sum Ry should be ~0
    for (label, results) in [("A", &results_a), ("B", &results_b), ("C", &results_c)] {
        let total_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert!(
            total_ry.abs() < 1.0,
            "Case {}: vertical equil: sum_Ry={:.4} should be ~0",
            label, total_ry
        );
    }

    // Base settlement should increase with softer springs
    // With only lateral load, there should be differential settlement
    // (one side up, one side down) due to the overturning moment.
    let settle_right_c = results_c
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap()
        .uz;
    let settle_left_c = results_c
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap()
        .uz;

    // Under lateral load, one base goes up and the other goes down
    // (overturning effect), so they should have opposite signs or
    // at least different magnitudes
    let differential = (settle_left_c - settle_right_c).abs();
    assert!(
        differential > 1e-6,
        "Differential settlement from overturning: |d_left - d_right|={:.6e}",
        differential
    );
}
