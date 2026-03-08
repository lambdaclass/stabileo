/// Validation: Weaver & Gere, "Matrix Analysis of Framed Structures" (3rd ed.)
///
/// Extended benchmarks covering stiffness method fundamentals,
/// continuous beams, portal frames (with and without sway),
/// grillage beams, multi-bay frames, and inclined members.
///
/// References:
///   - Weaver, W. & Gere, J.M., "Matrix Analysis of Framed Structures", 3rd Ed., 1990
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 7th Ed.
///   - Kassimali, A., "Matrix Analysis of Structures", 2nd Ed.
///
/// Tests:
///   1. Propped cantilever under UDL (stiffness method reactions)
///   2. Fixed-fixed beam with asymmetric point load
///   3. Two-span continuous beam with unequal spans
///   4. Portal frame with no sway (symmetric loading)
///   5. Portal frame with sway (lateral load)
///   6. Grid beam with torsional restraint (3D solver)
///   7. Two-bay frame with unequal bay widths
///   8. Frame with inclined member (gable frame)
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
#[allow(dead_code)]
const E_EFF: f64 = E * 1000.0; // MPa -> kN/m^2
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever with UDL
// ================================================================
//
// Weaver Ch.4: Fixed at A, roller at B. UDL w over full span L.
// Analytical reactions:
//   R_roller = 3wL/8, R_fixed = 5wL/8, M_fixed = wL^2/8
// L=6m, w=10 kN/m.

#[test]
fn validation_weaver_1_propped_cantilever_stiffness() {
    let length = 6.0;
    let w = 10.0; // kN/m (positive value; applied downward as negative)
    let q_load = -w; // downward
    let n = 16;

    let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    for i in 1..=(n as usize) {
        input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }

    let results = linear::solve_2d(&input).unwrap();

    // Analytical values
    let r_roller = 3.0 * w * length / 8.0;  // = 22.5 kN
    let r_fixed = 5.0 * w * length / 8.0;   // = 37.5 kN
    let m_fixed = w * length * length / 8.0; // = 45.0 kN-m

    // Roller is at end node (n+1), fixed is at node 1
    let r_end = results.reactions.iter().find(|r| r.node_id == (n + 1) as usize).unwrap();
    assert_close(r_end.ry, r_roller, 0.02, "Weaver 1: R_roller = 3wL/8");

    let r_start = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_start.ry, r_fixed, 0.02, "Weaver 1: R_fixed = 5wL/8");
    assert_close(r_start.mz.abs(), m_fixed, 0.02, "Weaver 1: M_fixed = wL^2/8");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = w * length;
    assert_close(sum_ry, total_load, 0.01, "Weaver 1: sum Ry = wL");
}

// ================================================================
// 2. Fixed-Fixed Beam with Asymmetric Point Load
// ================================================================
//
// Weaver Ch.4: Fixed-fixed beam, point load P at L/3 from A.
// M_A = 2*P*a*b^2 / L^2, M_B = 2*P*a^2*b / L^2
// (signs depend on convention; we check magnitudes)
// P=60kN, L=9m, a=3m, b=6m.

#[test]
fn validation_weaver_2_fixed_beam_asymmetric() {
    let length = 9.0;
    let p_val = 60.0;
    let a = 3.0;
    let _b = 6.0;
    let n = 18; // 18 elements, load at node a/L * n + 1 = 7

    // Node at a = 3m: element length = 9/18 = 0.5m, node at 3.0m is node 7
    let load_node = (a / length * n as f64) as usize + 1; // node 7

    let input = make_beam(
        n, length, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node,
            fx: 0.0,
            fy: -p_val,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Analytical fixed-end moments for point load at distance a from A:
    // M_A = P*a*b^2/L^2 (standard FEF formula, NOT the factor-of-2 version)
    // M_B = P*a^2*b/L^2
    let m_a_exact = p_val * a * _b * _b / (length * length); // = 60*3*36/81 = 80.0
    let m_b_exact = p_val * a * a * _b / (length * length);   // = 60*9*6/81 = 40.0

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == (n + 1) as usize).unwrap();

    assert_close(r_a.mz.abs(), m_a_exact, 0.03, "Weaver 2: M_A = Pab^2/L^2");
    assert_close(r_b.mz.abs(), m_b_exact, 0.03, "Weaver 2: M_B = Pa^2b/L^2");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_val, 0.01, "Weaver 2: sum Ry = P");

    // Reaction at A: R_A = P*b^2*(3a+b)/L^3
    let r_a_exact = p_val * _b * _b * (3.0 * a + _b) / (length.powi(3));
    assert_close(r_a.ry, r_a_exact, 0.03, "Weaver 2: R_A = Pb^2(3a+b)/L^3");
}

// ================================================================
// 3. Two-Span Continuous Beam with Unequal Spans
// ================================================================
//
// Weaver Ch.6: Continuous beam, L1=4m, L2=6m. UDL w=12 kN/m.
// Three-moment equation gives the interior support moment.
// M_B = -w*(L1^3 + L2^3) / (8*(L1 + L2))  (for equal EI, pinned ends)

#[test]
fn validation_weaver_3_two_span_unequal() {
    let l1 = 4.0;
    let l2 = 6.0;
    let w = 12.0;
    let q_load = -w; // downward
    let n_per_span = 16;

    let total_elems = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 1..=total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = w * (l1 + l2);
    assert_close(sum_ry, total_load, 0.01, "Weaver 3: sum Ry = w*(L1+L2)");

    // Three-moment equation for two spans with simple supports at ends:
    // 2*M_B*(L1+L2) = -w*L1^3/4 - w*L2^3/4
    // M_B = -w*(L1^3 + L2^3) / (8*(L1+L2))
    let m_b_exact = w * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    // m_b_exact = 12*(64+216)/(8*10) = 12*280/80 = 42.0

    // Interior support is at node n_per_span + 1
    let mid_node = n_per_span + 1;

    // The interior support moment can be inferred from the element forces
    // at the junction. Look at the last element of span 1 (element n_per_span).
    let ef_end_span1 = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    // m_end of last element in span 1 is the moment at interior support
    let m_b_computed = ef_end_span1.m_end.abs();
    assert_close(m_b_computed, m_b_exact, 0.03, "Weaver 3: interior moment M_B");

    // Interior support reaction should be largest
    let r_int = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == (2 * n_per_span + 1))
        .unwrap();
    assert!(
        r_int.ry > r_left.ry && r_int.ry > r_right.ry,
        "Weaver 3: interior reaction ({:.2}) should be largest (left={:.2}, right={:.2})",
        r_int.ry, r_left.ry, r_right.ry
    );
}

// ================================================================
// 4. Portal Frame — No Sway (Symmetric Loading)
// ================================================================
//
// Weaver Ch.7: Fixed-base portal frame, H=4m, L=6m.
// UDL on beam only (symmetric). No sway by symmetry.
// Joint equilibrium: column top moment = beam end moment at each corner.

#[test]
fn validation_weaver_4_frame_no_sway() {
    let h = 4.0;
    let span = 6.0;
    let w = 15.0;
    let q_load = -w;
    let n_col = 12;  // elements per column
    let n_beam = 16; // elements for beam

    // Build portal frame with multi-element members
    // Nodes: left column 1..n_col+1, beam n_col+1..n_col+n_beam+1, right column uses top-right..bottom-right
    // Simpler: use make_input directly

    let col_len = h / n_col as f64;
    let beam_len = span / n_beam as f64;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut node_id = 1_usize;
    let mut elem_id = 1_usize;

    // Left column: nodes from (0,0) to (0,h)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_len));
        node_id += 1;
    }
    let left_top = node_id - 1; // top of left column

    // Left column elements
    for i in 0..n_col {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
        elem_id += 1;
    }

    // Beam: from (0,h) to (span,h) — share node with left column top
    let beam_start_node = left_top;
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_len, h));
        node_id += 1;
    }
    let right_top = node_id - 1;

    // Beam elements
    let mut prev = beam_start_node;
    for i in 0..n_beam {
        let _next = if i == 0 { left_top + 1 } else { prev + 1 };
        let actual_next = beam_start_node + i + 1;
        elems.push((elem_id, "frame", prev, actual_next, 1, 1, false, false));
        prev = actual_next;
        elem_id += 1;
    }

    // Right column: from (span,h) to (span,0) — share top node with beam end
    let right_col_top = right_top;
    for i in 1..=n_col {
        nodes.push((node_id, span, h - i as f64 * col_len));
        node_id += 1;
    }
    let right_bottom = node_id - 1;

    // Right column elements
    prev = right_col_top;
    for i in 0..n_col {
        let next_node = right_col_top + i + 1;
        elems.push((elem_id, "frame", prev, next_node, 1, 1, false, false));
        prev = next_node;
        elem_id += 1;
    }

    // Supports: fixed at base of left column (node 1) and base of right column
    let sups = vec![(1, 1_usize, "fixed"), (2, right_bottom, "fixed")];

    // UDL on beam elements only
    let first_beam_elem = n_col + 1;
    let last_beam_elem = n_col + n_beam;
    let mut loads = Vec::new();
    for i in first_beam_elem..=last_beam_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: total load = w * span
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * span, 0.01, "Weaver 4: sum Ry = w*L");

    // Horizontal equilibrium: sum Rx should be ~0 for symmetric case
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.5,
        "Weaver 4: sum Rx ~ 0 for no-sway, got {:.4}", sum_rx
    );

    // By symmetry: left and right base reactions should be equal
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == right_bottom).unwrap();
    assert_close(r_left.ry, r_right.ry, 0.02, "Weaver 4: symmetric Ry at bases");

    // Joint equilibrium at left corner: column end moment should equal beam start moment
    // (internal forces in local coordinates: at a joint, they balance each other).
    let col_top_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == n_col).unwrap();
    let beam_start_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == (n_col + 1)).unwrap();

    // In the solver's local coordinate convention, the column end moment and
    // the beam start moment at a shared joint should be equal in magnitude.
    let col_top_moment = col_top_ef.m_end;
    let beam_start_moment = beam_start_ef.m_start;
    let scale = col_top_moment.abs().max(beam_start_moment.abs()).max(1.0);
    let joint_diff = (col_top_moment.abs() - beam_start_moment.abs()).abs();
    assert!(
        joint_diff / scale < 0.03,
        "Weaver 4: joint equilibrium at left corner: |col_m|={:.4}, |beam_m|={:.4}, diff={:.4}",
        col_top_moment.abs(), beam_start_moment.abs(), joint_diff
    );
}

// ================================================================
// 5. Portal Frame with Sway (Lateral Load)
// ================================================================
//
// Same portal as test 4, but with added lateral load H=25kN at beam level.
// Sway causes asymmetric column moments and lateral displacement.

#[test]
fn validation_weaver_5_frame_with_sway() {
    let h = 4.0;
    let span = 6.0;
    let w = 15.0;
    let h_load = 25.0;
    let q_load = -w;
    let n_col = 12;
    let n_beam = 16;

    let col_len = h / n_col as f64;
    let beam_len = span / n_beam as f64;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut node_id = 1_usize;
    let mut elem_id = 1_usize;

    // Left column
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_len));
        node_id += 1;
    }
    let left_top = node_id - 1;

    for i in 0..n_col {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
        elem_id += 1;
    }

    // Beam
    let beam_start_node = left_top;
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_len, h));
        node_id += 1;
    }
    let right_top = node_id - 1;

    let mut prev = beam_start_node;
    for i in 0..n_beam {
        let actual_next = beam_start_node + i + 1;
        elems.push((elem_id, "frame", prev, actual_next, 1, 1, false, false));
        prev = actual_next;
        elem_id += 1;
    }

    // Right column
    let right_col_top = right_top;
    for i in 1..=n_col {
        nodes.push((node_id, span, h - i as f64 * col_len));
        node_id += 1;
    }
    let right_bottom = node_id - 1;

    prev = right_col_top;
    for i in 0..n_col {
        let next_node = right_col_top + i + 1;
        elems.push((elem_id, "frame", prev, next_node, 1, 1, false, false));
        prev = next_node;
        elem_id += 1;
    }

    let sups = vec![(1, 1_usize, "fixed"), (2, right_bottom, "fixed")];

    // UDL on beam + lateral load at left top
    let first_beam_elem = n_col + 1;
    let last_beam_elem = n_col + n_beam;
    let mut loads = Vec::new();
    for i in first_beam_elem..=last_beam_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: left_top,
        fx: h_load,
        fy: 0.0,
        mz: 0.0,
    }));

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum Rx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.02, "Weaver 5: sum Rx = -H");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * span, 0.01, "Weaver 5: sum Ry = w*L");

    // Sway: both beam-level nodes should have positive lateral displacement
    let d_left_top = results.displacements.iter()
        .find(|d| d.node_id == left_top).unwrap();
    let d_right_top = results.displacements.iter()
        .find(|d| d.node_id == right_top).unwrap();
    assert!(
        d_left_top.ux > 0.0,
        "Weaver 5: left top sways positive, ux={:.6e}", d_left_top.ux
    );
    assert!(
        d_right_top.ux > 0.0,
        "Weaver 5: right top sways positive, ux={:.6e}", d_right_top.ux
    );

    // Column base moments should differ (asymmetric due to sway)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == right_bottom).unwrap();
    assert!(
        (r_left.mz - r_right.mz).abs() > 0.1,
        "Weaver 5: base moments differ due to sway: left={:.4}, right={:.4}",
        r_left.mz, r_right.mz
    );
}

// ================================================================
// 6. Grid Beam with Torsional Restraint (3D Solver)
// ================================================================
//
// Weaver Ch.8: Single beam along X-axis with a perpendicular stub
// at midspan that provides torsional restraint. The stub acts like
// a torsional spring. Compare deflection with and without the stub
// to show torsional coupling affects bending response.

#[test]
fn validation_weaver_6_grid_beam() {
    let l = 8.0;
    let stub_l = 2.0;
    let p = 20.0;
    let n = 16;
    let nu = 0.3;
    let a_sec = 0.01;
    let iy = 8e-5;
    let iz = 1e-4;
    let j = 5e-5;

    let mid = n / 2 + 1; // midspan node of main beam

    // --- Case A: Plain beam (no stub) ---
    let loads_a = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_a = make_3d_beam(
        n, l, E, nu, a_sec, iy, iz, j,
        vec![true, true, true, true, true, true],        // fully fixed start
        Some(vec![false, true, true, false, false, false]), // roller (uy,uz restrained)
        loads_a,
    );
    let results_a = linear::solve_3d(&input_a).unwrap();
    let d_mid_a = results_a.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // --- Case B: Beam with perpendicular stub at midspan ---
    // Main beam along X, stub along Z from midspan node
    let elem_len = l / n as f64;
    let mut nodes_3d: Vec<(usize, f64, f64, f64)> = Vec::new();
    let n_nodes_main = n + 1;

    // Main beam nodes
    for i in 0..n_nodes_main {
        nodes_3d.push((i + 1, i as f64 * elem_len, 0.0, 0.0));
    }

    // Stub nodes (2 elements along Z from midspan)
    let stub_n = 4;
    let stub_elem_len = stub_l / stub_n as f64;
    let mid_x = (mid - 1) as f64 * elem_len;
    let stub_node_start = n_nodes_main + 1;
    for i in 1..=stub_n {
        nodes_3d.push((stub_node_start + i - 1, mid_x, 0.0, i as f64 * stub_elem_len));
    }

    let mut elems_3d: Vec<(usize, &str, usize, usize, usize, usize)> = Vec::new();
    let mut eid = 1;

    // Main beam elements
    for i in 0..n {
        elems_3d.push((eid, "frame", i + 1, i + 2, 1, 1));
        eid += 1;
    }

    // Stub elements: from midspan node to stub nodes
    let mut prev_stub = mid;
    for i in 0..stub_n {
        elems_3d.push((eid, "frame", prev_stub, stub_node_start + i, 1, 1));
        prev_stub = stub_node_start + i;
        eid += 1;
    }

    let stub_end = stub_node_start + stub_n - 1;

    // Supports: main beam simply supported, stub end fixed
    let sups_3d = vec![
        (1, vec![true, true, true, true, true, true]),         // main beam start: fully fixed
        (n_nodes_main, vec![false, true, true, false, false, false]), // main beam end: roller
        (stub_end, vec![true, true, true, true, true, true]),  // stub end: fixed
    ];

    let loads_b = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input_b = make_3d_input(
        nodes_3d,
        vec![(1, E, nu)],
        vec![(1, a_sec, iy, iz, j)],
        elems_3d,
        sups_3d,
        loads_b,
    );
    let results_b = linear::solve_3d(&input_b).unwrap();

    let d_mid_b = results_b.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // The stub provides additional restraint, so deflection should be less
    assert!(
        d_mid_b < d_mid_a,
        "Weaver 6: stub reduces deflection: with={:.6e}, without={:.6e}",
        d_mid_b, d_mid_a
    );

    // Vertical equilibrium for case B
    let sum_fy: f64 = results_b.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "Weaver 6: sum Fy = P");

    // Reference deflection for simply-supported beam with midspan load
    let e_eff = E * 1000.0;
    let d_exact_ss = p * l.powi(3) / (48.0 * e_eff * iz);
    // Our case A is fixed-roller, so deflection < SS. Just verify order of magnitude.
    assert!(
        d_mid_a > 0.0 && d_mid_a < d_exact_ss * 1.5,
        "Weaver 6: deflection in reasonable range: {:.6e} vs SS {:.6e}",
        d_mid_a, d_exact_ss
    );
}

// ================================================================
// 7. Two-Bay Frame with Unequal Bay Widths
// ================================================================
//
// Weaver Ch.7: Two-bay frame — 3 columns, 2 beams.
// Bay 1: width 4m, Bay 2: width 6m. Height 4m. Fixed bases.
// UDL on both beams. Interior column should carry more axial load.

#[test]
fn validation_weaver_7_two_bay_frame() {
    let h = 4.0;
    let w1 = 4.0; // bay 1 width
    let w2 = 6.0; // bay 2 width
    let q_val = 10.0; // UDL intensity
    let q_load = -q_val;
    let n_col = 12;
    let n_beam1 = 12;
    let n_beam2 = 16;

    let col_len = h / n_col as f64;
    let beam1_len = w1 / n_beam1 as f64;
    let beam2_len = w2 / n_beam2 as f64;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut node_id = 1_usize;
    let mut elem_id = 1_usize;

    // Left column: (0,0) to (0,h)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_len));
        node_id += 1;
    }
    let left_top = node_id - 1;
    for i in 0..n_col {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
        elem_id += 1;
    }

    // Beam 1: (0,h) to (w1,h)
    let beam1_first_node = node_id;
    for i in 1..=n_beam1 {
        nodes.push((node_id, i as f64 * beam1_len, h));
        node_id += 1;
    }
    let center_top = node_id - 1; // top of center column / right end of beam1

    let mut prev = left_top;
    for i in 0..n_beam1 {
        let next = beam1_first_node + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Center column: (w1,h) to (w1,0) — share top with beam1 end
    let center_col_top = center_top;
    let center_col_first = node_id;
    for i in 1..=n_col {
        nodes.push((node_id, w1, h - i as f64 * col_len));
        node_id += 1;
    }
    let center_bottom = node_id - 1;

    prev = center_col_top;
    for i in 0..n_col {
        let next = center_col_first + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Beam 2: (w1,h) to (w1+w2,h) — share left end with center column top
    let beam2_first_node = node_id;
    for i in 1..=n_beam2 {
        nodes.push((node_id, w1 + i as f64 * beam2_len, h));
        node_id += 1;
    }
    let right_top = node_id - 1;

    prev = center_col_top;
    for i in 0..n_beam2 {
        let next = beam2_first_node + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Right column: (w1+w2,h) to (w1+w2,0)
    let right_col_top = right_top;
    let right_col_first = node_id;
    for i in 1..=n_col {
        nodes.push((node_id, w1 + w2, h - i as f64 * col_len));
        node_id += 1;
    }
    let right_bottom = node_id - 1;

    prev = right_col_top;
    for i in 0..n_col {
        let next = right_col_first + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Supports: fixed at three column bases
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, center_bottom, "fixed"),
        (3, right_bottom, "fixed"),
    ];

    // UDL on both beams
    let beam1_first_elem = n_col + 1;
    let beam1_last_elem = n_col + n_beam1;
    let beam2_first_elem = n_col + n_beam1 + n_col + 1;
    let beam2_last_elem = beam2_first_elem + n_beam2 - 1;

    let mut loads = Vec::new();
    for i in beam1_first_elem..=beam1_last_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }
    for i in beam2_first_elem..=beam2_last_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_load,
            q_j: q_load,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let total_load = q_val * (w1 + w2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Weaver 7: sum Ry = q*(w1+w2)");

    // Interior column carries more axial load than exterior columns
    // Axial load in center column = reaction at center base
    let r_center = results.reactions.iter()
        .find(|r| r.node_id == center_bottom).unwrap();
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == right_bottom).unwrap();

    assert!(
        r_center.ry > r_left.ry,
        "Weaver 7: center column carries more than left: center={:.4}, left={:.4}",
        r_center.ry, r_left.ry
    );
    assert!(
        r_center.ry > r_right.ry,
        "Weaver 7: center column carries more than right: center={:.4}, right={:.4}",
        r_center.ry, r_right.ry
    );

    // Horizontal equilibrium should be ~ 0 (no lateral loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.5,
        "Weaver 7: sum Rx ~ 0, got {:.4}", sum_rx
    );
}

// ================================================================
// 8. Frame with Inclined Member (Gable Frame)
// ================================================================
//
// Weaver Ch.7: Gable frame — two columns with inclined rafters
// meeting at the ridge. Symmetric vertical load at ridge.
//
//         5 (ridge)
//        / \
//       /   \
//      3     4
//      |     |
//      |     |
//      1     2
// (fixed)  (fixed)
//
// Columns: 1-3, 2-4 (height h=4m)
// Rafters: 3-5, 4-5 (span=8m total, ridge height = h + rise)

#[test]
fn validation_weaver_8_inclined_member() {
    let h = 4.0;       // column height
    let half_span = 4.0; // half of total span
    let rise = 2.0;    // ridge rise above column tops
    let p_ridge = 30.0; // vertical load at ridge
    let n_col = 12;
    let n_raft = 14;

    let col_len = h / n_col as f64;
    let ridge_x = half_span;
    let ridge_y = h + rise;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut node_id = 1_usize;
    let mut elem_id = 1_usize;

    // Left column: (0,0) to (0,h)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_len));
        node_id += 1;
    }
    let left_top = node_id - 1;
    for i in 0..n_col {
        elems.push((elem_id, "frame", i + 1, i + 2, 1, 1, false, false));
        elem_id += 1;
    }

    // Right column: (2*half_span, 0) to (2*half_span, h)
    let right_col_start = node_id;
    for i in 0..=n_col {
        nodes.push((node_id, 2.0 * half_span, i as f64 * col_len));
        node_id += 1;
    }
    let right_top = node_id - 1;
    for i in 0..n_col {
        elems.push((elem_id, "frame", right_col_start + i, right_col_start + i + 1, 1, 1, false, false));
        elem_id += 1;
    }

    // Left rafter: (0,h) to (half_span, h+rise)
    let dx_raft = ridge_x / n_raft as f64;
    let dy_raft = rise / n_raft as f64;
    let left_raft_first = node_id;
    for i in 1..=n_raft {
        nodes.push((node_id, i as f64 * dx_raft, h + i as f64 * dy_raft));
        node_id += 1;
    }
    let ridge_node = node_id - 1; // this is the ridge

    let mut prev = left_top;
    for i in 0..n_raft {
        let next = left_raft_first + i;
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Right rafter: (half_span, h+rise) to (2*half_span, h)
    // Goes from ridge to right column top
    let dx_raft_r = half_span / n_raft as f64;
    let dy_raft_r = rise / n_raft as f64;
    let right_raft_first = node_id;
    for i in 1..n_raft {
        nodes.push((
            node_id,
            ridge_x + i as f64 * dx_raft_r,
            ridge_y - i as f64 * dy_raft_r,
        ));
        node_id += 1;
    }
    // Last node of right rafter is right_top (shared)

    prev = ridge_node;
    for i in 0..n_raft {
        let next = if i < n_raft - 1 {
            right_raft_first + i
        } else {
            right_top
        };
        elems.push((elem_id, "frame", prev, next, 1, 1, false, false));
        prev = next;
        elem_id += 1;
    }

    // Supports: fixed at column bases
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, right_col_start, "fixed"),
    ];

    // Load at ridge
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: ridge_node,
        fx: 0.0,
        fy: -p_ridge,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_ridge, 0.01, "Weaver 8: sum Ry = P");

    // Symmetric structure + symmetric load => symmetric reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == right_col_start).unwrap();
    assert_close(r_left.ry, r_right.ry, 0.02, "Weaver 8: symmetric Ry");
    assert_close(r_left.mz.abs(), r_right.mz.abs(), 0.02, "Weaver 8: symmetric Mz");

    // By symmetry, each base carries P/2 vertically
    assert_close(r_left.ry, p_ridge / 2.0, 0.02, "Weaver 8: R_left = P/2");

    // Inclined rafters cause horizontal thrust: Rx should be non-zero and equal/opposite
    // For symmetric gable with vertical load, the horizontal reactions are equal and opposite
    assert_close(r_left.rx, -r_right.rx, 0.02, "Weaver 8: Rx equal and opposite");

    // The horizontal thrust exists due to the inclined members
    // H = P * half_span / (2 * rise) is not exact for a fixed-base gable frame
    // but the thrust should be non-negligible
    assert!(
        r_left.rx.abs() > 0.1,
        "Weaver 8: horizontal thrust exists: Rx_left={:.4}", r_left.rx
    );

    // Ridge deflects downward
    let d_ridge = results.displacements.iter()
        .find(|d| d.node_id == ridge_node).unwrap();
    assert!(
        d_ridge.uy < 0.0,
        "Weaver 8: ridge deflects down: uy={:.6e}", d_ridge.uy
    );

    // Moment at ridge: check that rafter end moments at ridge are equal by symmetry
    // Left rafter last element and right rafter first element meet at ridge
    let left_rafter_last = n_col + n_col + n_raft; // elem_id of last left rafter element
    let right_rafter_first = left_rafter_last + 1;
    let ef_lr = results.element_forces.iter()
        .find(|ef| ef.element_id == left_rafter_last).unwrap();
    let ef_rr = results.element_forces.iter()
        .find(|ef| ef.element_id == right_rafter_first).unwrap();
    // By symmetry, the magnitude of the moment at the ridge from each rafter should be equal
    let ridge_moment_diff = (ef_lr.m_end.abs() - ef_rr.m_start.abs()).abs();
    let ridge_scale = ef_lr.m_end.abs().max(ef_rr.m_start.abs()).max(1.0);
    assert!(
        ridge_moment_diff / ridge_scale < 0.03,
        "Weaver 8: ridge moment symmetry: |left_end|={:.4}, |right_start|={:.4}",
        ef_lr.m_end.abs(), ef_rr.m_start.abs()
    );
}
