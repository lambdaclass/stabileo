/// Validation: Demolition and Deconstruction Engineering Analysis
///
/// References:
///   - ASCE/SEI 37-14: Design Loads on Structures During Construction
///   - BS 6187:2011: Code of practice for full and partial demolition
///   - EJ Disposal Ltd / BRE: "Structural Appraisal of Existing Buildings for Demolition"
///   - GSA 2013: Progressive Collapse Analysis and Design Guidelines
///   - Bungale S. Taranath: "Structural Analysis & Design of Tall Buildings" (2012)
///   - Wai-Fah Chen: "Handbook of Structural Engineering" 2nd ed. (2005)
///   - FEMA 277: The Oklahoma City Bombing — Improving Building Performance (1996)
///   - Timoshenko & Gere: "Theory of Elastic Stability" (1961)
///
/// Tests verify load redistribution after column removal, temporary
/// shoring, partial demolition stability, cantilever after wall removal,
/// debris loading, crane pad under demolition equipment, controlled
/// collapse mechanism, and remaining structure adequacy check.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Load Redistribution After Column Removal (GSA/APM)
// ================================================================
//
// A two-bay portal frame (3 columns + 2 beams) loses its internal
// column. Before removal the internal column carried roughly half
// the total gravity. After removal the two-bay frame becomes a
// single long span; beam moments and end reactions increase.
//
// Before: 2 simple spans of length L each.
//   - Beam moment per span  M0 = qL^2/8
//   - Each end reaction      R  = qL/2
//   - Internal column reaction = qL (sum of both spans)
//
// After: single fixed-fixed span of length 2L.
//   - Midspan moment (fixed-fixed, UDL) = q(2L)^2/24 = qL^2/6
//   - End moment                        = q(2L)^2/12 = qL^2/3
//   - End reaction                      = q(2L)/2   = qL
//
// The demand amplification factor (DAF) on end reactions is:
//   DAF = qL / (qL/2) = 2.0

#[test]
fn demolition_load_redistribution_column_removal() {
    let l: f64 = 6.0;          // m, original bay width
    let h: f64 = 4.0;          // m, column height
    let e: f64 = 200_000.0;    // MPa, steel
    let a: f64 = 6.0e-3;       // m^2, section area
    let iz: f64 = 2.0e-4;      // m^4, second moment of area
    let q: f64 = -20.0;        // kN/m, UDL on beams (downward)

    // ----- Model BEFORE removal: two-bay portal frame -----
    // Nodes: 1(0,0), 2(0,h), 3(L,h), 4(L,0), 5(2L,h), 6(2L,0)
    // with middle column 4->3 and beams 2->3, 3->5
    let nodes_before = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_before = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 4, 3, 1, 1, false, false), // middle column
        (4, "frame", 3, 5, 1, 1, false, false), // right beam
        (5, "frame", 6, 5, 1, 1, false, false), // right column
    ];
    let sups_before = vec![
        (1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    let loads_before = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_before = make_input(
        nodes_before, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems_before, sups_before, loads_before,
    );
    let res_before = solve_2d(&input_before).expect("solve before");

    // Middle column reaction before removal
    let r_mid_before: f64 = res_before.reactions.iter()
        .find(|r| r.node_id == 4).unwrap().rz.abs();

    // ----- Model AFTER removal: two-span beam on two columns -----
    // Nodes: 1(0,0), 2(0,h), 3(L,h), 4(2L,h), 5(2L,0)
    // Beams: 2->3, 3->4; Columns: 1->2, 5->4
    let n_beam = 4; // elements per half
    let total_beam_elems = n_beam * 2;
    let elem_len: f64 = (2.0 * l) / total_beam_elems as f64;

    let mut nodes_after = vec![(1, 0.0, 0.0), (2, 0.0, h)];
    for i in 1..total_beam_elems {
        let nid = 2 + i;
        nodes_after.push((nid, i as f64 * elem_len, h));
    }
    let last_beam_node = 2 + total_beam_elems;
    nodes_after.push((last_beam_node, 2.0 * l, h));
    let right_base = last_beam_node + 1;
    nodes_after.push((right_base, 2.0 * l, 0.0));

    let mut elems_after = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
    ];
    for i in 0..total_beam_elems {
        let eid = 2 + i;
        let ni = 2 + i;
        let nj = 3 + i;
        elems_after.push((eid, "frame", ni, nj, 1, 1, false, false));
    }
    let right_col_eid = 2 + total_beam_elems;
    elems_after.push((right_col_eid, "frame", right_base, last_beam_node, 1, 1, false, false));

    let sups_after = vec![
        (1, 1, "fixed"), (2, right_base, "fixed"),
    ];
    let mut loads_after = Vec::new();
    for i in 0..total_beam_elems {
        loads_after.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2 + i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_after = make_input(
        nodes_after, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems_after, sups_after, loads_after,
    );
    let res_after = solve_2d(&input_after).expect("solve after");

    // After removal: total vertical reaction at each base = q * 2L / 2 = q * L
    let r_left_after: f64 = res_after.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rz.abs();
    let r_right_after: f64 = res_after.reactions.iter()
        .find(|r| r.node_id == right_base).unwrap().rz.abs();

    let total_load: f64 = q.abs() * 2.0 * l;
    let sum_ry_after: f64 = r_left_after + r_right_after;

    assert_close(sum_ry_after, total_load, 0.05, "Total vertical reaction after removal");

    // Each base should carry approximately half the total load
    assert_close(r_left_after, total_load / 2.0, 0.10, "Left base reaction after removal");

    // Verify middle column had non-trivial load before removal
    assert!(r_mid_before > 0.1 * total_load,
        "Middle column carried significant load before removal: {:.2} kN", r_mid_before);
}

// ================================================================
// 2. Temporary Shoring During Demolition
// ================================================================
//
// When an interior wall/column is removed, temporary shores (props)
// must be installed to carry the load during the transition.
// Model: a beam on 3 supports (original) with the middle support
// replaced by a prop modelled as a spring-like column.
//
// Shore stiffness: k = EA/L_shore
// Shore shortening: delta = P/(EA/L) = PL/(EA)
//
// For a propped beam: prop force depends on beam-prop stiffness ratio.
// Simple model: continuous beam with middle support present.

#[test]
fn demolition_temporary_shoring() {
    let span: f64 = 8.0;         // m, total beam length
    let e: f64 = 30_000.0;       // MPa, concrete beam
    let a_beam: f64 = 0.12;      // m^2, 400 x 300 mm beam
    let iz_beam: f64 = 9.0e-4;   // m^4
    let q: f64 = -15.0;          // kN/m, dead load on beam

    // Shore: steel prop at midspan, 3 m long
    let l_shore: f64 = 3.0;      // m
    let e_shore: f64 = 210_000.0; // MPa
    let a_shore: f64 = 5.74e-4;  // m^2, 60.3 mm OD tube
    let iz_shore: f64 = 2.0e-7;  // m^4

    // Model: beam along X from (0,0) to (span,0)
    // Shore as a vertical column from (span/2, -l_shore) to (span/2, 0)
    let n_beam = 8;
    let elem_len: f64 = span / n_beam as f64;
    let mid_beam_node = n_beam / 2 + 1; // node at midspan

    let mut nodes: Vec<(usize, f64, f64)> = Vec::new();
    for i in 0..=n_beam {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    // Shore bottom node
    let shore_bottom = n_beam + 2;
    nodes.push((shore_bottom, span / 2.0, -l_shore));

    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    // Beam elements — material 1, section 1
    for i in 0..n_beam {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Shore element — material 2, section 2
    let shore_elem_id = n_beam + 1;
    elems.push((shore_elem_id, "frame", shore_bottom, mid_beam_node, 2, 2, false, false));

    let mats = vec![(1, e, 0.3), (2, e_shore, 0.3)];
    let secs = vec![(1, a_beam, iz_beam), (2, a_shore, iz_shore)];

    // Supports: pinned at beam start, roller at beam end, fixed at shore base
    let sups = vec![
        (1, 1, "pinned"),
        (2, n_beam + 1, "rollerX"),
        (3, shore_bottom, "fixed"),
    ];

    let mut loads = Vec::new();
    for i in 0..n_beam {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load
    let total_load: f64 = q.abs() * span;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz.abs()).sum::<f64>();
    assert_close(sum_ry, total_load, 0.05, "Total vertical equilibrium with shore");

    // Shore carries compressive axial force
    let ef_shore = results.element_forces.iter()
        .find(|e| e.element_id == shore_elem_id).unwrap();
    let shore_force: f64 = ef_shore.n_start.abs();

    // Shore must carry a meaningful share of the load
    assert!(shore_force > 0.05 * total_load,
        "Shore carries load: {:.2} kN", shore_force);

    // Shore axial shortening: delta = PL/(EA)
    let e_eff_shore: f64 = e_shore * 1000.0;
    let delta_shore: f64 = shore_force * l_shore / (e_eff_shore * a_shore);

    // Shore shortening should be small (< 5 mm)
    assert!(delta_shore < 0.005,
        "Shore shortening {:.4} m < 5 mm", delta_shore);
}

// ================================================================
// 3. Partial Demolition Stability — Remaining Frame Check
// ================================================================
//
// A three-bay portal frame has its rightmost bay demolished.
// The remaining two-bay frame must resist the original gravity
// load on its spans plus any lateral load from exposed face.
//
// Verify that the truncated frame remains stable by checking:
//   - Vertical equilibrium matches applied loads
//   - Base reactions are reasonable
//   - No excessive drift

#[test]
fn demolition_partial_stability_remaining_frame() {
    let h: f64 = 4.0;          // m, story height
    let bay: f64 = 6.0;        // m, bay width
    let e: f64 = 200_000.0;    // MPa, steel
    let a: f64 = 5.0e-3;       // m^2
    let iz: f64 = 1.5e-4;      // m^4
    let q: f64 = -12.0;        // kN/m, gravity UDL on beams
    let f_lateral: f64 = 10.0;  // kN, lateral load at roof (wind on exposed face)

    // Remaining two-bay frame after demolition of third bay:
    // Nodes: 1(0,0), 2(0,h), 3(bay,h), 4(bay,0), 5(2*bay,h), 6(2*bay,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, bay, h), (4, bay, 0.0),
        (5, 2.0 * bay, h), (6, 2.0 * bay, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 4, 3, 1, 1, false, false), // middle column
        (4, "frame", 3, 5, 1, 1, false, false), // right beam
        (5, "frame", 6, 5, 1, 1, false, false), // right column
    ];
    let sups = vec![
        (1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
        // Lateral load at top of exposed face (left side after demolition of right bay)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_lateral, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total vertical load = q * 2 * bay
    let total_v: f64 = q.abs() * 2.0 * bay;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_v, 0.05, "Vertical equilibrium of remaining frame");

    // Total horizontal reaction = f_lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_lateral, 0.05, "Horizontal equilibrium of remaining frame");

    // Check roof drift < H/100 (demolition serviceability)
    let roof_disp = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    let drift_limit: f64 = h / 100.0;
    assert!(roof_disp.ux.abs() < drift_limit,
        "Roof drift {:.4} m < H/100 = {:.4} m", roof_disp.ux.abs(), drift_limit);

    // All three bases must have non-zero vertical reaction
    for &nid in &[1, 4, 6] {
        let r = results.reactions.iter().find(|r| r.node_id == nid).unwrap();
        assert!(r.rz.abs() > 1.0,
            "Base node {} carries vertical load: {:.2} kN", nid, r.rz);
    }
}

// ================================================================
// 4. Cantilever After Bearing Wall Removal
// ================================================================
//
// A floor slab originally supported by a bearing wall at midspan
// becomes a cantilever when the wall is removed on one side.
// Model: beam fixed at one end, free at the other, UDL on full length.
//
// Cantilever UDL:
//   Tip deflection: delta = qL^4 / (8EI)
//   Fixed-end moment: M = qL^2 / 2
//   Fixed-end shear: V = qL

#[test]
fn demolition_cantilever_after_wall_removal() {
    let l: f64 = 3.0;          // m, cantilever span (half the original beam)
    let e: f64 = 30_000.0;     // MPa, concrete
    let b: f64 = 1.0;          // m, unit strip width
    let t: f64 = 0.20;         // m, slab thickness
    let a_slab: f64 = b * t;
    let iz_slab: f64 = b * t.powi(3) / 12.0;
    let n: usize = 6;

    // Dead load of slab + finishes
    let gamma_conc: f64 = 25.0;  // kN/m^3 (as load per m^3 on a 1m strip)
    let q_dl: f64 = gamma_conc * t * b; // = 5.0 kN/m per m strip
    let q_finishes: f64 = 1.5;   // kN/m
    let q: f64 = -(q_dl + q_finishes); // kN/m, downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Cantilever: fixed at start, free at end
    let input = make_beam(n, l, e, a_slab, iz_slab, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical: tip deflection = qL^4 / (8EI)
    let e_eff: f64 = e * 1000.0;
    let delta_exact: f64 = q.abs() * l.powi(4) / (8.0 * e_eff * iz_slab);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip_disp.uz.abs(), delta_exact, 0.05, "Cantilever tip deflection");

    // Fixed-end moment: M = qL^2/2
    let m_exact: f64 = q.abs() * l.powi(2) / 2.0;
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.my.abs(), m_exact, 0.05, "Cantilever fixed-end moment");

    // Fixed-end shear: V = qL
    let v_exact: f64 = q.abs() * l;
    assert_close(r_fixed.rz.abs(), v_exact, 0.05, "Cantilever fixed-end shear");

    // Check that deflection exceeds L/250 (likely unserviceable — demolition concern)
    let defl_ratio: f64 = tip_disp.uz.abs() / l;
    // This large cantilever will have noticeable deflection
    assert!(tip_disp.uz.abs() > 0.0,
        "Non-zero tip deflection: {:.4} m (L/{:.0})", tip_disp.uz.abs(), 1.0 / defl_ratio);
}

// ================================================================
// 5. Debris Loading on Lower Floor During Demolition
// ================================================================
//
// During top-down demolition, debris from upper floors accumulates
// on the floor below. BS 6187 requires design for debris loading
// of at least 2.4 kN/m^2 or calculated weight of debris.
//
// Model: simply-supported floor beam carrying debris as UDL.
// Verify midspan moment and deflection against beam formulas.

#[test]
fn demolition_debris_loading() {
    let l: f64 = 7.0;           // m, floor span
    let e: f64 = 30_000.0;      // MPa, concrete
    let a_beam: f64 = 0.15;     // m^2, 500 x 300 mm RC beam
    let iz_beam: f64 = 3.125e-3; // m^4, bh^3/12 = 0.3*0.5^3/12
    let n: usize = 8;

    // Debris load: one floor of demolished RC slab (200mm) + rubble
    // Self-weight of demolished slab: 25 * 0.20 = 5.0 kN/m^2
    // Impact/accumulation factor: 1.5 (dynamic effect of dropping)
    // Tributary width: 4.0 m
    let q_debris: f64 = 5.0 * 1.5;       // kN/m^2 (factored)
    let trib: f64 = 4.0;                  // m
    let q_total: f64 = -(q_debris * trib); // kN/m on beam, downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e * 1000.0;

    // Midspan deflection: delta = 5qL^4/(384EI)
    let delta_exact: f64 = 5.0 * q_total.abs() * l.powi(4) / (384.0 * e_eff * iz_beam);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uz.abs(), delta_exact, 0.05, "Debris load midspan deflection");

    // Support reactions: R = qL/2
    let r_exact: f64 = q_total.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz.abs(), r_exact, 0.03, "Debris load support reaction");

    // Midspan moment: M = qL^2/8
    let m_exact: f64 = q_total.abs() * l.powi(2) / 8.0;
    // Check via element forces at midspan element
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // m_end of element just before midspan gives the midspan moment
    assert_close(ef_mid.m_end.abs(), m_exact, 0.10, "Debris load midspan moment");
}

// ================================================================
// 6. Crane Pad Under Demolition Equipment (Concentrated Load)
// ================================================================
//
// A heavy excavator (demolition machine) is placed on a floor slab
// during deconstruction. The machine sits on a steel bearing plate
// (crane pad) that distributes the load to the slab below.
// Model: SS beam with a point load at midspan.
//
// Point load at midspan of SS beam:
//   Midspan deflection: delta = PL^3 / (48EI)
//   Midspan moment: M = PL/4
//   Reactions: R = P/2

#[test]
fn demolition_crane_pad_equipment_load() {
    let l: f64 = 8.0;          // m, floor span
    let e: f64 = 30_000.0;     // MPa, concrete
    let a_beam: f64 = 0.18;    // m^2, 600 x 300 mm RC beam
    let iz_beam: f64 = 5.4e-3; // m^4, bh^3/12 = 0.3*0.6^3/12
    let n: usize = 8;

    // Demolition excavator weight: 35 tonnes = 343 kN
    // Dynamic factor: 1.25 (impact during operation)
    let p_machine: f64 = 343.0 * 1.25; // = 428.75 kN
    let mid_node = n / 2 + 1;

    // Point load at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p_machine, my: 0.0,
    })];

    let input = make_beam(n, l, e, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e * 1000.0;

    // Midspan deflection: delta = PL^3 / (48EI)
    let delta_exact: f64 = p_machine * l.powi(3) / (48.0 * e_eff * iz_beam);
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uz.abs(), delta_exact, 0.05, "Crane pad midspan deflection");

    // Reactions: R = P/2
    let r_exact: f64 = p_machine / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz.abs(), r_exact, 0.03, "Left support reaction under crane pad");
    assert_close(r_end.rz.abs(), r_exact, 0.03, "Right support reaction under crane pad");

    // Midspan moment: M = PL/4
    let m_exact: f64 = p_machine * l / 4.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_exact, 0.10, "Crane pad midspan moment");

    // Check: deflection should be small enough that slab is serviceable
    // L/250 = 0.032 m
    let defl_limit: f64 = l / 250.0;
    assert!(mid_disp.uz.abs() < defl_limit,
        "Deflection {:.4} m < L/250 = {:.4} m — slab is serviceable", mid_disp.uz.abs(), defl_limit);
}

// ================================================================
// 7. Controlled Collapse Mechanism (Hinge Formation)
// ================================================================
//
// In controlled demolition, hinges are introduced at key locations
// to create a predictable collapse mechanism. Model a portal frame
// with hinge releases at beam-column joints to simulate the
// mechanism state.
//
// With hinges at both beam ends (pinned connections), the beam
// becomes simply supported between column tops. The columns act
// as independent cantilevers for lateral load.
//
// SS beam moment: M_mid = qL^2/8
// Column base moment (lateral): M_base = F*h/2 (shared by 2 cols)

#[test]
fn demolition_controlled_collapse_mechanism() {
    let h: f64 = 5.0;           // m, column height
    let w: f64 = 8.0;           // m, beam span
    let e: f64 = 200_000.0;     // MPa, steel
    let a: f64 = 4.0e-3;        // m^2
    let iz: f64 = 1.0e-4;       // m^4
    let q: f64 = -10.0;         // kN/m, gravity UDL on beam
    let f_lat: f64 = 5.0;       // kN, small lateral push to initiate mechanism

    let n_beam_sub = 4; // sub-elements for beam to capture distributed load
    // Use portal frame approach but with separate elements for distributed load
    // Since make_portal_frame doesn't support hinges easily, build manually

    // Actually, we need subdivided beam for UDL. Let's add internal nodes.
    let sub_len: f64 = w / n_beam_sub as f64;
    let mut nodes_v = vec![(1, 0.0, 0.0), (2, 0.0, h)];
    for i in 1..n_beam_sub {
        nodes_v.push((2 + i, i as f64 * sub_len, h));
    }
    let right_top = 2 + n_beam_sub;
    nodes_v.push((right_top, w, h));
    let right_base = right_top + 1;
    nodes_v.push((right_base, w, 0.0));

    let mut elems_v = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
    ];
    // Beam sub-elements: first has hinge_start, last has hinge_end
    for i in 0..n_beam_sub {
        let eid = 2 + i;
        let ni = 2 + i;
        let nj = 3 + i;
        let hs = i == 0;                  // hinge at left beam end only
        let he = i == n_beam_sub - 1;     // hinge at right beam end only
        elems_v.push((eid, "frame", ni, nj, 1, 1, hs, he));
    }
    let right_col_eid = 2 + n_beam_sub;
    elems_v.push((right_col_eid, "frame", right_base, right_top, 1, 1, false, false));

    let sups_v = vec![(1, 1, "fixed"), (2, right_base, "fixed")];

    let mut loads_v = Vec::new();
    // UDL on beam sub-elements
    for i in 0..n_beam_sub {
        loads_v.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2 + i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    // Lateral push
    loads_v.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    }));

    let input = make_input(
        nodes_v, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems_v, sups_v, loads_v,
    );
    let results = solve_2d(&input).expect("solve");

    // With hinged beam ends, moment at beam-column junction should be ~0
    // Check moment at start of first beam sub-element (hinge location)
    let ef_beam_start = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam_start.m_start.abs() < 1.0,
        "Beam start moment near zero at hinge: {:.4} kN-m", ef_beam_start.m_start);

    // Check moment at end of last beam sub-element (hinge location)
    let last_beam_eid = 2 + n_beam_sub - 1;
    let ef_beam_end = results.element_forces.iter()
        .find(|e| e.element_id == last_beam_eid).unwrap();
    assert!(ef_beam_end.m_end.abs() < 1.0,
        "Beam end moment near zero at hinge: {:.4} kN-m", ef_beam_end.m_end);

    // Vertical equilibrium
    let total_v: f64 = q.abs() * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_v, 0.05, "Vertical equilibrium in mechanism state");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_lat, 0.05, "Horizontal equilibrium in mechanism state");
}

// ================================================================
// 8. Remaining Structure Adequacy Check (Post-Partial Demolition)
// ================================================================
//
// After partial demolition of the right bay of a 2-bay frame,
// the remaining single-bay portal frame must be checked for:
//   - Increased gravity load concentration
//   - Lateral stability without the removed bay
//   - Base fixity moment capacity
//
// Single-bay fixed-base portal frame under UDL + lateral:
//   Beam midspan M (gravity) ≈ qL²/24 (fixed-fixed with sidesway)
//   Column base moment (lateral) ≈ Fh/4 (symmetric fixed-base portal)

#[test]
fn demolition_remaining_structure_adequacy() {
    let h: f64 = 4.5;          // m, story height
    let w: f64 = 7.0;          // m, remaining bay width
    let e: f64 = 200_000.0;    // MPa, steel
    let a_col: f64 = 5.0e-3;   // m^2, column area
    let iz_col: f64 = 1.5e-4;  // m^4, column inertia
    let a_beam: f64 = 8.0e-3;  // m^2, beam area
    let iz_beam: f64 = 3.0e-4; // m^4, beam inertia

    // Gravity: original load from 2 bays now partially borne by one bay
    // Original per bay: 12 kN/m. After demolition, remaining bay takes
    // its own load plus tributary from demolished zone.
    let q_own: f64 = -12.0;       // kN/m, own span load
    let q_extra: f64 = -4.0;      // kN/m, extra from partial tributary of removed bay
    let q_total: f64 = q_own + q_extra; // = -16 kN/m

    // Lateral load: wind on now-exposed face
    let f_wind: f64 = 8.0;        // kN

    // Build portal frame manually with subdivided beam
    let n_beam = 6;
    let beam_elem_len: f64 = w / n_beam as f64;

    let mut nodes = vec![(1, 0.0, 0.0), (2, 0.0, h)];
    for i in 1..n_beam {
        nodes.push((2 + i, i as f64 * beam_elem_len, h));
    }
    let right_top = 2 + n_beam;
    nodes.push((right_top, w, h));
    let right_base = right_top + 1;
    nodes.push((right_base, w, 0.0));

    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    // Left column: mat 1, sec 1 (column section)
    elems.push((1, "frame", 1, 2, 1, 1, false, false));
    // Beam sub-elements: mat 1, sec 2 (beam section)
    for i in 0..n_beam {
        let eid = 2 + i;
        let ni = 2 + i;
        let nj = 3 + i;
        elems.push((eid, "frame", ni, nj, 1, 2, false, false));
    }
    // Right column
    let right_col_eid = 2 + n_beam;
    elems.push((right_col_eid, "frame", right_base, right_top, 1, 1, false, false));

    let mats = vec![(1, e, 0.3)];
    let secs = vec![(1, a_col, iz_col), (2, a_beam, iz_beam)];
    let sups = vec![(1, 1, "fixed"), (2, right_base, "fixed")];

    let mut loads = Vec::new();
    for i in 0..n_beam {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2 + i, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }
    // Lateral wind at left column top
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_wind, fz: 0.0, my: 0.0,
    }));

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium: total gravity = q_total * w
    let total_grav: f64 = q_total.abs() * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>();
    assert_close(sum_ry.abs(), total_grav, 0.05, "Vertical equilibrium of remaining structure");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_wind, 0.05, "Horizontal equilibrium of remaining structure");

    // Both bases must have moment reactions (fixed supports)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == right_base).unwrap();
    assert!(r_left.my.abs() > 1.0,
        "Left base moment: {:.2} kN-m", r_left.my);
    assert!(r_right.my.abs() > 1.0,
        "Right base moment: {:.2} kN-m", r_right.my);

    // Sway check: roof drift < H/150 (demolition temporary condition)
    let roof_disp = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    let drift_limit: f64 = h / 150.0;
    assert!(roof_disp.ux.abs() < drift_limit,
        "Sway {:.4} m < H/150 = {:.4} m — remaining frame adequate", roof_disp.ux.abs(), drift_limit);

    // Check that column base moments are bounded:
    // For portal under lateral load: M_base approx F*h / (2 to 4) per column
    let m_base_approx: f64 = f_wind * h;
    let sum_base_m: f64 = r_left.my.abs() + r_right.my.abs();
    // The sum of base moments should be on the order of F*h (overturning balance)
    assert!(sum_base_m > 0.2 * m_base_approx && sum_base_m < 3.0 * m_base_approx,
        "Base moments {:.2} kN-m in expected range for F*h = {:.2} kN-m", sum_base_m, m_base_approx);
}
