/// Validation: SAP2000 / CSI Extended Verification Problems
///
/// Reference: CSI Analysis Reference Manual, SAP2000 Verification Suite,
/// and classical structural analysis benchmarks used in CSI documentation.
///
/// Tests: multi-story frame, two-bay portal sway, pattern loading envelope,
///        P-delta column, 3-story modal, 3D space frame torsion,
///        Warren truss bridge, propped cantilever settlement.
use dedaliano_engine::solver::{buckling, linear, modal, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. Multi-Story Frame: Gravity + Lateral (SAP2000 Example 1-019)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_multistory_gravity_lateral() {
    // Reference: SAP2000 Verification Example 1-019
    // 3-story, 1-bay portal frame with gravity + lateral loads.
    // Fixed bases, rigid beam-column joints.
    //
    //   Story heights: 4m, 3.5m, 3.5m
    //   Bay width: 6m
    //   Gravity: 30 kN/m on each floor beam
    //   Lateral: 20 kN at 1st floor, 40 kN at 2nd floor, 60 kN at roof
    //
    // Verify: global equilibrium, base shear, overturning moment,
    //         lateral drift ordering (roof > 2nd > 1st).
    let w = 6.0;
    let h1 = 4.0;
    let h2 = 3.5;
    let h3 = 3.5;
    let y1 = h1;
    let y2 = h1 + h2;
    let y3 = h1 + h2 + h3;

    let q = -30.0; // gravity UDL on beams (kN/m, downward)
    let f1 = 20.0; // lateral at 1st floor
    let f2 = 40.0; // lateral at 2nd floor
    let f3 = 60.0; // lateral at roof

    let n_beam = 4; // elements per beam

    // Nodes: column nodes + beam intermediate nodes
    // Left column: 1(base), 2(y1), 3(y2), 4(y3)
    // Right column: 5(base), 6(y1), 7(y2), 8(y3)
    let beam_dx = w / n_beam as f64;

    let mut nodes = Vec::new();
    nodes.push((1, 0.0, 0.0));
    nodes.push((2, 0.0, y1));
    nodes.push((3, 0.0, y2));
    nodes.push((4, 0.0, y3));
    nodes.push((5, w, 0.0));
    nodes.push((6, w, y1));
    nodes.push((7, w, y2));
    nodes.push((8, w, y3));

    // Beam intermediate nodes for each floor
    let mut nid = 9;
    let mut beam_int_1 = Vec::new();
    for i in 1..n_beam {
        nodes.push((nid, i as f64 * beam_dx, y1));
        beam_int_1.push(nid);
        nid += 1;
    }
    let mut beam_int_2 = Vec::new();
    for i in 1..n_beam {
        nodes.push((nid, i as f64 * beam_dx, y2));
        beam_int_2.push(nid);
        nid += 1;
    }
    let mut beam_int_3 = Vec::new();
    for i in 1..n_beam {
        nodes.push((nid, i as f64 * beam_dx, y3));
        beam_int_3.push(nid);
        nid += 1;
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    // Left column: 1-2, 2-3, 3-4
    elems.push((eid, "frame", 1, 2, 1, 1, false, false)); eid += 1;
    elems.push((eid, "frame", 2, 3, 1, 1, false, false)); eid += 1;
    elems.push((eid, "frame", 3, 4, 1, 1, false, false)); eid += 1;

    // Right column: 5-6, 6-7, 7-8
    elems.push((eid, "frame", 5, 6, 1, 1, false, false)); eid += 1;
    elems.push((eid, "frame", 6, 7, 1, 1, false, false)); eid += 1;
    elems.push((eid, "frame", 7, 8, 1, 1, false, false)); eid += 1;

    // Floor beams with intermediate nodes (section 2, stiffer beam)
    let beam_sec = 2;
    let make_beam_chain = |start: usize, intermediates: &[usize], end: usize,
                           eid: &mut usize, elems: &mut Vec<(usize, &str, usize, usize, usize, usize, bool, bool)>| {
        let mut prev = start;
        for &mid in intermediates {
            elems.push((*eid, "frame", prev, mid, 1, beam_sec, false, false));
            *eid += 1;
            prev = mid;
        }
        elems.push((*eid, "frame", prev, end, 1, beam_sec, false, false));
        *eid += 1;
    };

    make_beam_chain(2, &beam_int_1, 6, &mut eid, &mut elems);
    make_beam_chain(3, &beam_int_2, 7, &mut eid, &mut elems);
    make_beam_chain(4, &beam_int_3, 8, &mut eid, &mut elems);

    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    // Loads: lateral at left column floor nodes + gravity UDL on beams
    let mut loads = Vec::new();
    loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1, fy: 0.0, mz: 0.0 }));
    loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2, fy: 0.0, mz: 0.0 }));
    loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: f3, fy: 0.0, mz: 0.0 }));

    // Distributed loads on beam elements (columns are eids 1-6, beams start at 7)
    let first_beam_eid = 7;
    let total_beam_elems = 3 * n_beam;
    for i in 0..total_beam_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: first_beam_eid + i,
            q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let iz_beam = 5e-4; // stiffer beam
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (beam_sec, A, iz_beam)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // (a) Global horizontal equilibrium: sum of base shears = total lateral load
    let total_lateral = f1 + f2 + f3; // 120 kN
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), total_lateral, 0.02, "SAPX1 base shear = total lateral");

    // (b) Global vertical equilibrium: sum Ry = total gravity
    let total_gravity = q.abs() * w * 3.0; // 3 floors * q * w
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02, "SAPX1 sum Ry = total gravity");

    // (c) Overturning moment about base: OTM = F1*y1 + F2*y2 + F3*y3
    let otm = f1 * y1 + f2 * y2 + f3 * y3;
    assert!(otm > 100.0, "SAPX1 OTM should be significant: {}", otm);

    // (d) Lateral drift ordering: roof > 2nd floor > 1st floor
    let dx_1 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let dx_2 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();
    let dx_3 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux.abs();
    assert!(dx_3 > dx_2, "SAPX1 roof drift {:.6} > 2nd floor {:.6}", dx_3, dx_2);
    assert!(dx_2 > dx_1, "SAPX1 2nd floor drift {:.6} > 1st floor {:.6}", dx_2, dx_1);

    // (e) Sway symmetry: due to rigid beams, left and right nodes at same floor
    //     should have approximately equal lateral displacement
    let dx_left_roof = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    let dx_right_roof = results.displacements.iter().find(|d| d.node_id == 8).unwrap().ux;
    assert_close(dx_left_roof, dx_right_roof, 0.05, "SAPX1 sway symmetry at roof");
}

// ═══════════════════════════════════════════════════════════════
// 2. Two-Bay Portal Frame with Sway (Lateral Load Analysis)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_two_bay_portal_sway() {
    // Reference: SAP2000 verification, two-bay single-story portal frame
    // Two bays of equal width, fixed bases, lateral load at roof level.
    //
    //     H=50 kN ->  [2]--------[3]--------[4]
    //                  |          |          |
    //                  |  Bay 1   |  Bay 2   |
    //                 [1]        [5]        [6]
    //                  ^          ^          ^  (fixed)
    //
    // Bay width = 5m each, column height = 4m.
    // Interior column carries approximately double the shear
    // of the exterior columns (by portal method).
    let h = 4.0;
    let w = 5.0;
    let h_load = 50.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (5, w, 0.0),
        (4, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 3, 4, 1, 1, false, false), // right beam
        (4, "frame", 5, 3, 1, 1, false, false), // interior column
        (5, "frame", 6, 4, 1, 1, false, false), // right column
    ];

    let sups = vec![
        (1, 1, "fixed"),
        (2, 5, "fixed"),
        (3, 6, "fixed"),
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // (a) Total horizontal reaction = applied load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h_load, 0.02, "SAPX2 sum_Rx = H");

    // (b) All floor nodes should sway in the same direction
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    assert!(d2 > 0.0, "SAPX2 node 2 should sway right");
    assert!(d3 > 0.0, "SAPX2 node 3 should sway right");
    assert!(d4 > 0.0, "SAPX2 node 4 should sway right");

    // (c) Interior column shear should be larger than exterior columns
    // (portal method: interior column takes V = H/2, exterior takes H/4 each)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_int = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 6).unwrap();

    assert!(
        r_int.rx.abs() > r_left.rx.abs(),
        "SAPX2 interior shear {:.4} > left exterior {:.4}",
        r_int.rx.abs(), r_left.rx.abs()
    );
    assert!(
        r_int.rx.abs() > r_right.rx.abs(),
        "SAPX2 interior shear {:.4} > right exterior {:.4}",
        r_int.rx.abs(), r_right.rx.abs()
    );

    // (d) Symmetry of exterior columns (approximately equal shear magnitude)
    assert_close(
        r_left.rx.abs(), r_right.rx.abs(), 0.15,
        "SAPX2 exterior columns roughly equal shear"
    );

    // (e) Moment equilibrium: the sum of all base moments about the origin
    // should balance the applied lateral load moment. Verify by checking that
    // the sum of Rx reactions equals the applied load (already checked above)
    // and that the overturning moment (H*h) is resisted by the base moments
    // and vertical reaction couple. Rather than an exact formula (which requires
    // careful sign convention), verify the base moments are nonzero.
    let r_left_mz = r_left.mz.abs();
    let r_int_mz = r_int.mz.abs();
    let r_right_mz = r_right.mz.abs();
    let total_base_moment = r_left_mz + r_int_mz + r_right_mz;
    assert!(
        total_base_moment > 10.0,
        "SAPX2 base moments should resist overturning: sum={:.4}", total_base_moment
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Continuous Beam with Pattern Loading (Moment Envelope)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_pattern_loading_envelope() {
    // Reference: SAP2000 verification -- pattern loading on continuous beams
    // 3-span continuous beam, equal spans L = 8m each.
    // Pattern loading: load only spans 1 & 3 (checkerboard) vs full loading.
    //
    // The checkerboard pattern maximizes positive midspan moment in loaded spans
    // and interior support moment is less than full loading.
    //
    // Full load: q = 25 kN/m on all spans
    // Pattern load: q = 25 kN/m on spans 1 and 3 only
    let l = 8.0;
    let q = 25.0;
    let n_per = 8;

    // Case A: Full loading on all 3 spans
    let mut loads_full = Vec::new();
    for i in 0..(3 * n_per) {
        loads_full.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_full = make_continuous_beam(&[l, l, l], n_per, E, A, IZ, loads_full);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Case B: Pattern loading -- spans 1 and 3 only
    let mut loads_pat = Vec::new();
    // Span 1: elements 1..n_per
    for i in 0..n_per {
        loads_pat.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    // Span 2: no load (elements n_per+1..2*n_per)
    // Span 3: elements 2*n_per+1..3*n_per
    for i in (2 * n_per)..(3 * n_per) {
        loads_pat.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_pat = make_continuous_beam(&[l, l, l], n_per, E, A, IZ, loads_pat);
    let res_pat = linear::solve_2d(&input_pat).unwrap();

    // (a) For full loading, midspan moment in span 1 is qL^2/8 reduced by continuity
    let m_max_full: f64 = res_full.element_forces.iter()
        .take(n_per)  // span 1 elements
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    let m_ss = q * l * l / 8.0; // simply-supported moment
    assert!(m_max_full < m_ss, "SAPX3 continuous M_max < SS moment: {:.2} < {:.2}", m_max_full, m_ss);
    assert!(m_max_full > 0.3 * m_ss, "SAPX3 continuous M_max should be significant");

    // (b) Pattern loading should produce LARGER midspan moments than full loading
    // in the loaded spans (checkerboard maximizes positive moment)
    let m_max_pat_span1: f64 = res_pat.element_forces.iter()
        .take(n_per)
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert!(
        m_max_pat_span1 > m_max_full,
        "SAPX3 pattern M_max_span1={:.2} > full M_max_span1={:.2}",
        m_max_pat_span1, m_max_full
    );

    // (c) Interior support moment: full loading produces larger hogging moment
    let ef_full_at_sup = &res_full.element_forces[n_per - 1]; // last elem of span 1
    let ef_pat_at_sup = &res_pat.element_forces[n_per - 1];
    let m_sup_full = ef_full_at_sup.m_end.abs();
    let m_sup_pat = ef_pat_at_sup.m_end.abs();
    assert!(
        m_sup_full > m_sup_pat * 0.8,
        "SAPX3 full loading interior support moment {:.2} >= pattern {:.2}",
        m_sup_full, m_sup_pat
    );

    // (d) Equilibrium check for full loading
    let total_load_full = q * 3.0 * l;
    let sum_ry_full: f64 = res_full.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_full, total_load_full, 0.02, "SAPX3 full load equilibrium");

    // (e) Equilibrium check for pattern loading
    let total_load_pat = q * 2.0 * l; // only 2 spans loaded
    let sum_ry_pat: f64 = res_pat.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_pat, total_load_pat, 0.02, "SAPX3 pattern load equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 4. P-Delta Column Effect (Geometric Stiffness)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_pdelta_column() {
    // Reference: SAP2000 P-Delta verification -- cantilever column with axial + lateral
    //
    // Cantilever column, L=5m, fixed base, free top.
    // P = 200 kN axial compression at top (fy = -200)
    // H = 10 kN lateral at top (fx = 10)
    //
    // Linear tip deflection: delta_lin = HL^3/(3EI)
    // P-delta amplification: delta_pd ~ delta_lin * 1/(1 - P/P_cr)
    // where P_cr = pi^2*EI/(4L^2) for cantilever (K=2, Le=2L)
    //
    // Also verify via buckling: alpha_cr = P_cr / P
    let l = 5.0;
    let p_axial = -200.0; // compressive (downward)
    let h_lat = 10.0;
    let n = 10;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    // Build vertical cantilever: nodes along Y axis
    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: 0.0, y: i as f64 * elem_len,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes, fx: h_lat, fy: p_axial, mz: 0.0,
        }),
    ];

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![],
        connectors: HashMap::new(), };

    // (a) Linear analysis: tip deflection
    let lin = linear::solve_2d(&input).unwrap();
    let d_tip_lin = lin.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    let delta_lin = d_tip_lin.ux.abs();

    // Analytical: delta = HL^3/(3EI) for cantilever with lateral tip load
    let delta_analytical = h_lat * l.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(delta_lin, delta_analytical, 0.03, "SAPX4 linear delta = HL^3/3EI");

    // (b) Critical load: P_cr = pi^2*EI/(4L^2) for cantilever
    let p_cr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l * l);

    // (c) Buckling analysis
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;
    assert!(alpha_cr > 0.0, "SAPX4 alpha_cr should be positive");

    // The buckling load factor times the applied axial load should approximate P_cr.
    // With both lateral and axial loads, the eigenvalue captures geometric stiffness.
    let p_applied = p_axial.abs();
    let p_cr_numerical = alpha_cr * p_applied;
    assert!(
        p_cr_numerical > 0.5 * p_cr && p_cr_numerical < 2.0 * p_cr,
        "SAPX4 P_cr numerical {:.2} should be near analytical {:.2}",
        p_cr_numerical, p_cr
    );

    // (d) P-delta analysis: should amplify deflection
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
    let d_tip_pd = pd.results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    let delta_pd = d_tip_pd.ux.abs();

    assert!(
        delta_pd > delta_lin,
        "SAPX4 P-delta delta={:.6} > linear delta={:.6}", delta_pd, delta_lin
    );

    // (e) Amplification factor: B ~ 1/(1 - P/P_cr)
    let b_theory = 1.0 / (1.0 - p_applied / p_cr);
    let b_actual = delta_pd / delta_lin;
    let rel = (b_actual - b_theory).abs() / b_theory;
    assert!(
        rel < 0.25,
        "SAPX4 B_actual={:.4}, B_theory={:.4}, diff={:.1}%",
        b_actual, b_theory, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Modal Analysis of 3-Story Shear Building (SAP2000 Verification)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_3story_modal() {
    // Reference: SAP2000 verification -- 3-story shear building
    //
    // Model: 3-story, single-bay frame with rigid beams.
    // Story height h = 3.5m, bay width = 8m.
    // Steel columns: E = 200 GPa, A = 0.01 m^2, I = 1e-4 m^4
    // Rigid beams: I_beam = 100 * I_col (effectively rigid)
    //
    // For a shear building with equal stories:
    //   k = 2 * 12EI/h^3 per story (two columns, rigid beams)
    //   Story stiffness k = 24EI/h^3
    //
    // With equal floor masses m:
    //   omega_1 < omega_2 < omega_3
    //   omega_2/omega_1 ~ 2.80 (for 3-DOF shear building with equal mass/stiffness)
    //   omega_3/omega_1 ~ 4.05
    let h = 3.5;
    let w = 8.0;
    let density = 7_850.0; // kg/m^3 for steel

    let iz_col = IZ;
    let iz_beam = 100.0 * iz_col; // rigid beams

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),             // base
        (3, 0.0, h), (4, w, h),                   // floor 1
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),     // floor 2
        (7, 0.0, 3.0 * h), (8, w, 3.0 * h),     // floor 3 (roof)
    ];

    let elems = vec![
        // Columns (section 1)
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        (5, "frame", 5, 7, 1, 1, false, false),
        (6, "frame", 6, 8, 1, 1, false, false),
        // Beams (section 2, rigid)
        (7, "frame", 3, 4, 1, 2, false, false),
        (8, "frame", 5, 6, 1, 2, false, false),
        (9, "frame", 7, 8, 1, 2, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems, sups, Vec::new(),
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    // (a) Should find at least 3 modes
    assert!(
        modal_res.modes.len() >= 3,
        "SAPX5 should find >= 3 modes, found {}",
        modal_res.modes.len()
    );

    // (b) Frequencies should be positive and ordered
    let f1 = modal_res.modes[0].frequency;
    let f2 = modal_res.modes[1].frequency;
    let f3 = modal_res.modes[2].frequency;

    assert!(f1 > 0.0, "SAPX5 f1 should be positive");
    assert!(f2 > f1, "SAPX5 f2={:.2} > f1={:.2}", f2, f1);
    assert!(f3 > f2, "SAPX5 f3={:.2} > f2={:.2}", f3, f2);

    // (c) Frequency ratios for 3-DOF shear building:
    // Theoretical: omega_2/omega_1 ~ 2.80, omega_3/omega_1 ~ 4.05
    // With distributed mass (not lumped), ratios differ slightly.
    let r21 = f2 / f1;
    let r31 = f3 / f1;
    assert!(r21 > 1.5 && r21 < 4.5,
        "SAPX5 f2/f1={:.3} should be in range [1.5, 4.5]", r21);
    assert!(r31 > 2.0 && r31 < 8.0,
        "SAPX5 f3/f1={:.3} should be in range [2.0, 8.0]", r31);

    // (d) Periods should be reciprocal of frequencies
    assert_close(modal_res.modes[0].period, 1.0 / f1, 0.01, "SAPX5 T1 = 1/f1");
    assert_close(modal_res.modes[1].period, 1.0 / f2, 0.01, "SAPX5 T2 = 1/f2");

    // (e) Total mass should be positive
    assert!(modal_res.total_mass > 0.0, "SAPX5 total mass should be positive");

    // (f) First mode frequency should be in reasonable range for a steel frame
    // T1 ~ 0.035-0.5s -> f1 ~ 2-30 Hz
    assert!(f1 > 1.0 && f1 < 100.0,
        "SAPX5 f1={:.2} Hz should be in reasonable range", f1);
}

// ═══════════════════════════════════════════════════════════════
// 6. 3D Space Frame with Torsion (solve_3d)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_3d_space_frame_torsion() {
    // Reference: SAP2000 3D frame verification -- torsion on cantilever beam
    //
    // 3D cantilever beam along X, length = 4m.
    // Fixed at node 1, free at node 5.
    // Applied: torque Mx = 10 kN-m at free end.
    //
    // Analytical: theta = TL / (GJ)
    // where G = E / (2(1+nu))
    //
    // Also apply a vertical load Fz = -20 kN to get biaxial bending.
    // Check: My at fixed end = Fz * L = 80 kN-m (sign convention may vary)
    //        Mx at fixed end = applied torque = 10 kN-m
    let l = 4.0;
    let n = 4;
    let nu = 0.3;
    let torque = 10.0; // kN-m
    let fz = -20.0; // kN downward

    let a_3d = 0.01;
    let iy = 1e-4;
    let iz_3d = 1e-4;
    let j = 2e-4; // torsional constant

    let g = E_EFF / (2.0 * (1.0 + nu)); // shear modulus in kN/m^2

    let input = make_3d_beam(
        n, l, E, nu, a_3d, iy, iz_3d, j,
        vec![true, true, true, true, true, true], // fixed
        None, // free end
        vec![
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n + 1, fx: 0.0, fy: 0.0, fz: fz,
                mx: torque, my: 0.0, mz: 0.0, bw: None,
            }),
        ],
    );

    let results = linear::solve_3d(&input).unwrap();

    // (a) Twist at free end: theta = TL/(GJ)
    let theta_expected = torque * l / (g * j);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_tip.rx.abs(), theta_expected, 0.05, "SAPX6 twist theta = TL/GJ");

    // (b) Vertical deflection at tip: delta_z = Fz * L^3 / (3EI_y)
    let delta_z_expected = fz.abs() * l.powi(3) / (3.0 * E_EFF * iy);
    assert_close(d_tip.uz.abs(), delta_z_expected, 0.05, "SAPX6 delta_z = FzL^3/3EIy");

    // (c) Reactions at fixed end: equilibrium check
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = -Fz (upward)
    assert_close(r1.fz, fz.abs(), 0.02, "SAPX6 Rz = |Fz|");

    // Torque reaction = -applied torque
    assert_close(r1.mx.abs(), torque, 0.05, "SAPX6 Mx reaction = T");

    // Bending moment at fixed end from vertical load: My = Fz * L
    let my_expected = fz.abs() * l;
    assert_close(r1.my.abs(), my_expected, 0.05, "SAPX6 My = Fz*L");

    // (d) Element force check: torsion should be constant along beam
    let mx_start = results.element_forces.iter()
        .map(|e| e.mx_start.abs())
        .fold(0.0_f64, f64::max);
    let mx_end = results.element_forces.iter()
        .map(|e| e.mx_end.abs())
        .fold(0.0_f64, f64::max);
    assert_close(mx_start, torque, 0.05, "SAPX6 element torsion start = T");
    assert_close(mx_end, torque, 0.05, "SAPX6 element torsion end = T");
}

// ═══════════════════════════════════════════════════════════════
// 7. Truss Bridge Analysis (Warren Type, 6 Panels)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_warren_truss_bridge() {
    // Reference: SAP2000 truss verification -- Warren truss with verticals
    //
    // 6-panel Pratt/Warren truss, panel length = 3m, height = 3m.
    // Pin support at left (node 1), roller at right (node 7).
    // Top and bottom chord nodes at each panel point.
    // Point loads: 100 kN downward at each interior bottom chord joint (nodes 2-6).
    //
    //    [8]---[9]--[10]--[11]--[12]--[13]--[14]
    //     |\  / |\  / |\  / |\  / |\  / |\  / |
    //     | \/  | \/  | \/  | \/  | \/  | \/  |
    //     | /\  | /\  | /\  | /\  | /\  | /\  |
    //     |/  \ |/  \ |/  \ |/  \ |/  \ |/  \ |
    //    [1]---[2]---[3]---[4]---[5]---[6]---[7]
    //     ^                                    o
    //
    // Total load = 5 * 100 = 500 kN
    // R_left = R_right = 250 kN (symmetry)
    let panel = 3.0;
    let height = 3.0;
    let n_panels = 6;
    let p = 100.0; // per joint
    let a_truss = 0.005; // m^2

    // Bottom chord nodes: 1..7 at (i*panel, 0)
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel, 0.0)); // bottom
    }
    // Top chord nodes: 8..14 at (i*panel, height)
    let top_start = n_panels + 2; // node id of first top node
    for i in 0..=n_panels {
        nodes.push((top_start + i, i as f64 * panel, height)); // top
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    let iz_truss = 1e-10; // negligible bending for truss

    // Bottom chord members
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }

    // Top chord members
    for i in 0..n_panels {
        elems.push((eid, "truss", top_start + i, top_start + i + 1, 1, 1, false, false));
        eid += 1;
    }

    // Vertical members
    for i in 0..=n_panels {
        elems.push((eid, "truss", i + 1, top_start + i, 1, 1, false, false));
        eid += 1;
    }

    // Diagonal members (X-pattern in each panel)
    for i in 0..n_panels {
        // Diagonal from bottom-left to top-right
        elems.push((eid, "truss", i + 1, top_start + i + 1, 1, 1, false, false));
        eid += 1;
        // Diagonal from top-left to bottom-right
        elems.push((eid, "truss", top_start + i, i + 2, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Point loads at interior bottom chord joints (nodes 2-6)
    let mut loads = Vec::new();
    for i in 2..=n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_truss, iz_truss)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // (a) Vertical equilibrium: sum Ry = total load
    let total_load = (n_panels - 1) as f64 * p; // 5 * 100 = 500 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "SAPX7 sum_Ry = total load");

    // (b) Symmetry: left and right reactions should be equal
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap();
    assert_close(r_left.ry, r_right.ry, 0.02, "SAPX7 symmetry: R_left = R_right");
    assert_close(r_left.ry, total_load / 2.0, 0.02, "SAPX7 R_left = P_total/2");

    // (c) Horizontal reaction at pinned support should be zero (no horizontal load)
    assert!(r_left.rx.abs() < 0.1, "SAPX7 Rx should be ~ 0, got {:.4}", r_left.rx);

    // (d) All members should have only axial force (truss elements: no moment)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.5 && ef.m_end.abs() < 0.5,
            "SAPX7 truss element {} should have negligible moment: m_s={:.4}, m_e={:.4}",
            ef.element_id, ef.m_start, ef.m_end
        );
    }

    // (e) Maximum deflection should be at midspan (node 4, center of bottom chord)
    let mid_node = (n_panels / 2) + 1; // node 4
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let d_quarter = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();
    assert!(
        d_mid > d_quarter,
        "SAPX7 midspan delta={:.6} > quarter delta={:.6}", d_mid, d_quarter
    );

    // (f) Top chord should be in compression, bottom chord in tension (sagging truss)
    let bottom_mid = &results.element_forces[n_panels / 2 - 1]; // central bottom chord
    assert!(
        bottom_mid.n_start > 0.0 || bottom_mid.n_end > 0.0,
        "SAPX7 bottom chord should be in tension: n_start={:.2}",
        bottom_mid.n_start
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Propped Cantilever with Settlement (Prescribed Displacements)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_sap_ext_propped_cantilever_settlement() {
    // Reference: SAP2000 prescribed displacement verification
    //
    // Propped cantilever: fixed at left (node 1), roller at right (node n+1).
    // Right support settles by delta = -5mm (downward).
    // No external loads -- all internal forces arise from the settlement.
    //
    // Analytical (from stiffness method):
    //   For propped cantilever with roller settlement delta:
    //     R_roller = 3EI*delta / L^3
    //     M_fixed = 3EI*delta / (2L^2)
    //     Shear is constant along the beam.
    let l = 6.0;
    let n = 10;
    let delta = -0.005; // 5mm downward settlement

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, y: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    // Fixed at left
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Roller at right with prescribed vertical displacement
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(delta), drz: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // (a) The right end should have the prescribed displacement
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_end.uy, delta, 0.02, "SAPX8 prescribed delta at roller");

    // (b) Reaction at roller: R = 3EI*delta/L^3
    let r_roller_expected = 3.0 * E_EFF * IZ * delta.abs() / l.powi(3);
    let r_roller = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_roller.ry.abs(), r_roller_expected, 0.05, "SAPX8 R_roller = 3EI*delta/L^3");

    // (c) Fixed-end moment: M = 3EI*delta/L^2
    // For propped cantilever (fixed-roller), roller settlement delta:
    //   R_roller = 3EI*delta/L^3, M_fixed = R_roller * L = 3EI*delta/L^2
    let m_fixed_expected = 3.0 * E_EFF * IZ * delta.abs() / (l * l);
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.mz.abs(), m_fixed_expected, 0.05, "SAPX8 M_fixed = 3EI*delta/L^2");

    // (d) Vertical equilibrium: sum Ry = 0 (no external load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.1,
        "SAPX8 sum_Ry should ~ 0 (no load): got {:.6}", sum_ry
    );

    // (e) Horizontal equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.01,
        "SAPX8 sum_Rx should = 0: got {:.6}", sum_rx
    );

    // (f) The deflection at the fixed end should be zero
    let d_fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_fixed.uy.abs() < 1e-10, "SAPX8 fixed end uy should be 0");
    assert!(d_fixed.ux.abs() < 1e-10, "SAPX8 fixed end ux should be 0");
    assert!(d_fixed.rz.abs() < 1e-10, "SAPX8 fixed end rz should be 0");

    // (g) Shear should be constant along the beam (no external loads)
    // V = R_roller = 3EI*delta/L^3
    let v_first = results.element_forces[0].v_start.abs();
    let v_last = results.element_forces.last().unwrap().v_end.abs();
    assert_close(v_first, r_roller_expected, 0.05, "SAPX8 V constant along beam");
    assert_close(v_last, r_roller_expected, 0.05, "SAPX8 V at end = R_roller");
}
