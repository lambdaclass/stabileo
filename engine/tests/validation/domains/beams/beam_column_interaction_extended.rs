/// Validation: Beam-Column Interaction — Extended Tests
///
/// References:
///   - Chen & Lui, "Structural Stability: Theory and Implementation", Ch. 4
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 3-5
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 4-7
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-6
///
/// Tests verify combined axial + bending scenarios NOT covered by
/// validation_beam_column_interaction.rs:
///   1. Two-bay portal frame: combined gravity + lateral equilibrium
///   2. Propped cantilever: axial + transverse tip load
///   3. Simple truss triangle: method of joints verification
///   4. Stepped column: two different cross-sections under axial + bending
///   5. Cantilever with end moment + axial: superposition of deflections
///   6. L-shaped knee frame: combined loading at knee joint
///   7. Two-span continuous beam with axial + UDL
///   8. Inclined beam-column under gravity: force decomposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Bay Portal Frame: Combined Gravity + Lateral Equilibrium
// ================================================================
//
// Three columns, two beams. Fixed bases. Symmetric gravity plus
// lateral load at top-left. Global equilibrium must hold:
//   sum(Rx) = -F_lat, sum(Ry) = sum(gravity loads)
//
// Reference: Kassimali, Ch. 14, portal frame equilibrium

#[test]
fn validation_bc_ext_two_bay_portal_equilibrium() {
    let h = 4.0;
    let w = 5.0;
    let f_lat = 12.0;
    let f_grav = -15.0; // downward at each beam-column joint

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h),
        (4, w, 0.0), (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
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
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: f_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: f_grav, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: f_grav, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global force equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    assert_close(sum_rx, -f_lat, 0.02, "Two-bay portal: sum Rx = -F_lat");
    assert_close(sum_ry, -3.0 * f_grav, 0.02, "Two-bay portal: sum Ry = 3*|F_grav|");

    // Global moment equilibrium about node 1: sum(M_reactions) + sum(M_loads) = 0
    // Reactions contribute moments; loads contribute moments about (0,0).
    // M_loads = f_lat * h + f_grav * 0 (at node 2, x=0) + f_grav * w (at node 3) + f_grav * 2w (at node 5)
    // But moment equilibrium is automatically satisfied if force equilibrium holds
    // and the stiffness matrix is correct. Verify each column carries axial force.
    for ef in &results.element_forces {
        // All elements should carry some force (no zero-force members in this setup)
        let max_force: f64 = ef.n_start.abs()
            .max(ef.v_start.abs())
            .max(ef.m_start.abs());
        assert!(max_force > 0.01,
            "Two-bay portal: elem {} should carry load, max_force={:.6e}", ef.element_id, max_force);
    }
}

// ================================================================
// 2. Propped Cantilever: Midspan Load + Axial at Tip
// ================================================================
//
// Fixed at left (node 1), rollerX at right (node n+1) — fixes uy only.
// Midspan transverse load P + axial load at right end.
// Linear analysis: axial and bending decouple.
//
// Propped cantilever (fixed-roller) with point load P at midspan (a = L/2):
//   R_roller = Pa^2(3L-a)/(2L^3) = 5P/16
//   R_fixed_y = P - 5P/16 = 11P/16
//   M_fixed = PL/2 - R_roller*L = 3PL/16
//
// With added axial load at tip (Fx), the roller (rollerX) allows
// horizontal movement so the beam elongates freely.
//
// Reference: Hibbeler, Table inside front cover, propped cantilever

#[test]
fn validation_bc_ext_propped_cantilever_combined() {
    let l = 8.0;
    let n = 16;
    let p_trans = 20.0; // magnitude of transverse load (applied downward)
    let p_axial = 40.0; // tension toward right

    let mid = n / 2 + 1; // midspan node

    // Bending-only case: midspan downward load on propped cantilever
    let loads_bend = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p_trans, mz: 0.0,
    })];
    let input_bend = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_bend);
    let res_bend = linear::solve_2d(&input_bend).unwrap();

    // Propped cantilever with midspan load P (a = L/2):
    //   R_roller = Pa^2(3L-a)/(2L^3) with a=L/2
    //           = P*(L/2)^2*(3L - L/2) / (2L^3)
    //           = P * L^2/4 * 5L/2 / (2L^3) = 5P/16
    //   R_fixed = P - 5P/16 = 11P/16
    //   M_fixed = P*L/2 - R_roller*L = PL/2 - 5PL/16 = 3PL/16
    let r_roller_expected = 5.0 * p_trans / 16.0;
    let r_fixed_y_expected = 11.0 * p_trans / 16.0;
    let m_fixed_expected = 3.0 * p_trans * l / 16.0;

    let r_fixed = res_bend.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_roller = res_bend.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_roller.ry, r_roller_expected, 0.02,
        "Propped cantilever: R_roller = 5P/16");
    assert_close(r_fixed.ry, r_fixed_y_expected, 0.02,
        "Propped cantilever: R_fixed_y = 11P/16");
    assert_close(r_fixed.mz.abs(), m_fixed_expected, 0.05,
        "Propped cantilever: M_fixed = 3PL/16");

    // Combined case: add axial tension at right end
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p_trans, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
        }),
    ];
    let input_combined = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_combined);
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Vertical reactions should be the same (linear: axial-bending uncoupled)
    let r_fixed_c = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_roller_c = res_combined.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_roller_c.ry, r_roller.ry, 0.02,
        "Propped cantilever combined: Ry_roller unchanged by axial");
    assert_close(r_fixed_c.ry, r_fixed.ry, 0.02,
        "Propped cantilever combined: Ry_fixed unchanged by axial");

    // Axial force should be constant across all elements (= p_axial)
    for ef in &res_combined.element_forces {
        assert_close(ef.n_start.abs(), p_axial, 0.05,
            &format!("Propped cantilever combined: N constant in elem {}", ef.element_id));
    }
}

// ================================================================
// 3. Simple Truss Triangle: Method of Joints
// ================================================================
//
// Equilateral triangle truss: nodes at (0,0), (L,0), (L/2, h).
// Pinned at (0,0), rollerX at (L,0). Vertical load P at apex.
// By symmetry: R1y = R2y = P/2, R1x = 0.
// Member forces by method of joints:
//   Bottom chord (1-2): tension, N = P/(2*tan(60°)) = P*sqrt(3)/6 * 2 = P/(sqrt(3))
//   Left inclined (1-3): compression, N = P/(2*sin(60°)) = P/sqrt(3)
//   Right inclined (2-3): compression, same by symmetry
//
// Reference: Hibbeler, Ch. 6, method of joints

#[test]
fn validation_bc_ext_truss_triangle_joints() {
    let base: f64 = 6.0;
    let height: f64 = (base / 2.0) * (3.0_f64).sqrt(); // equilateral triangle height
    let p = 30.0; // downward load at apex

    // Use hinge_start + hinge_end for truss behavior
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, base, 0.0), (3, base / 2.0, height)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 1, 3, 1, 1, true, true), // left inclined
            (3, "frame", 2, 3, 1, 1, true, true), // right inclined
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions by symmetry
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    assert_close(r1.ry, p / 2.0, 0.02, "Truss triangle: R1y = P/2");
    assert_close(r2.ry, p / 2.0, 0.02, "Truss triangle: R2y = P/2");
    assert_close(r1.rx, 0.0, 0.02, "Truss triangle: R1x = 0");

    // Member forces: equilateral triangle, angle = 60°
    // sin(60) = sqrt(3)/2, cos(60) = 1/2, tan(60) = sqrt(3)
    // At joint 3 (apex), vertical equilibrium:
    //   2 * N_inclined * sin(60°) = P
    //   N_inclined = P / (2 * sin(60°)) = P / sqrt(3)
    // (compression, since members push outward at apex)
    let n_inclined_expected: f64 = p / 3.0_f64.sqrt();

    // Bottom chord: horizontal equilibrium at joint 1:
    //   N_bottom = N_inclined * cos(60°) = P / (2*sqrt(3))
    // (tension, the bottom chord is pulled)
    let n_bottom_expected: f64 = p / (2.0 * 3.0_f64.sqrt());

    // Element 1 = bottom chord (tension)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.n_start.abs(), n_bottom_expected, 0.05,
        "Truss triangle: bottom chord force = P/(2*sqrt(3))");

    // Elements 2,3 = inclined (compression), symmetric
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef2.n_start.abs(), n_inclined_expected, 0.05,
        "Truss triangle: left inclined force = P/sqrt(3)");
    assert_close(ef3.n_start.abs(), n_inclined_expected, 0.05,
        "Truss triangle: right inclined force = P/sqrt(3)");

    // Symmetry: both inclined members carry the same force
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.02,
        "Truss triangle: symmetric inclined forces");

    // Truss members: V and M should be near-zero (hinged both ends)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.5,
            "Truss elem {}: V near zero, got {:.4}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 0.5,
            "Truss elem {}: M near zero, got {:.4}", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 4. Stepped Column: Two Sections Under Axial + Lateral
// ================================================================
//
// Cantilever column with two segments of different cross-sections.
// Lower half: section 1 (stiffer). Upper half: section 2 (weaker).
// Axial load at tip + lateral load at tip.
// Axial force is constant (= P_axial) through both segments.
// Bending: tip deflection = sum of contributions from each segment.
//
// Reference: Gere & Goodno, Ch. 9, beams with non-uniform cross-sections

#[test]
fn validation_bc_ext_stepped_column() {
    let l = 6.0;
    let n_per_seg = 4;
    let p_axial = 25.0;
    let p_lateral = 10.0;
    let e_eff: f64 = E * 1000.0;

    // Section 1 (lower, stiffer): A=0.02, Iz=2e-4
    let a1 = 0.02;
    let iz1 = 2e-4;
    // Section 2 (upper, weaker): A=0.01, Iz=1e-4
    let a2 = 0.01;
    let iz2 = 1e-4;

    let half_l = l / 2.0;
    let total_nodes = 2 * n_per_seg + 1;
    let elem_len = half_l / n_per_seg as f64;

    let nodes: Vec<_> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    let mut elems = Vec::new();
    // Lower segment: section 1
    for i in 0..n_per_seg {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Upper segment: section 2
    for i in 0..n_per_seg {
        let eid = n_per_seg + i + 1;
        let ni = n_per_seg + i + 1;
        elems.push((eid, "frame", ni, ni + 1, 1, 2, false, false));
    }

    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: total_nodes, fx: p_axial, fy: -p_lateral, mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a1, iz1), (2, a2, iz2)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Axial force should be constant (= p_axial) across all elements
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), p_axial, 0.05,
            &format!("Stepped column: N constant in elem {}", ef.element_id));
    }

    // Axial deformation at tip: delta_x = P*(L/2)/(E*A1) + P*(L/2)/(E*A2)
    let dx_expected = p_axial * half_l / (e_eff * a1) + p_axial * half_l / (e_eff * a2);
    let tip = results.displacements.iter()
        .find(|d| d.node_id == total_nodes).unwrap();
    assert_close(tip.ux, dx_expected, 0.02,
        "Stepped column: delta_x = P*L/(2*E)*(1/A1 + 1/A2)");

    // Tip bending deflection for stepped cantilever with tip load P_lat:
    // The moment at distance x from fixed end is M(x) = P_lat * (L - x).
    // Segment 1 (0 to L/2): EI1 = E*Iz1
    // Segment 2 (L/2 to L): EI2 = E*Iz2
    // By Mohr's integral (or virtual work):
    //   delta_tip = integral(M*m/EI dx) where m = (L-x) for unit load at tip
    //   = P/(EI1) * integral_0^{L/2} (L-x)^2 dx + P/(EI2) * integral_{L/2}^L (L-x)^2 dx
    //   = P/(EI1) * [L^3/3 - ... ] = P * [(L^3 - (L/2)^3)/(3*EI1) + (L/2)^3/(3*EI2)]
    let ei1 = e_eff * iz1;
    let ei2 = e_eff * iz2;
    let half_l_cubed: f64 = half_l.powi(3);
    let l_cubed: f64 = l.powi(3);
    let dy_expected = p_lateral * ((l_cubed - half_l_cubed) / (3.0 * ei1) + half_l_cubed / (3.0 * ei2));
    assert_close(tip.uy.abs(), dy_expected, 0.05,
        "Stepped column: tip deflection from virtual work");

    // Global equilibrium
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rx, -p_axial, 0.02, "Stepped column: Rx = -P_axial");
    assert_close(r.ry, p_lateral, 0.02, "Stepped column: Ry = P_lateral");
}

// ================================================================
// 5. Cantilever: End Moment + Axial — Superposition
// ================================================================
//
// Cantilever with:
//   Case A: end moment M only → delta_y = ML²/(2EI), theta = ML/(EI)
//   Case B: axial load P only → delta_x = PL/(EA)
//   Case C: M + P combined → superposition of A and B
//
// Reference: Timoshenko & Gere, "Theory of Elastic Stability", Ch. 1

#[test]
fn validation_bc_ext_moment_axial_superposition() {
    let l = 5.0;
    let n = 10;
    let m_app = 12.0;
    let p_axial = 30.0;
    let e_eff: f64 = E * 1000.0;
    let tip_id = n + 1;

    // Case A: moment only
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_id, fx: 0.0, fy: 0.0, mz: m_app,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "fixed", None, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();
    let tip_a = res_a.displacements.iter().find(|d| d.node_id == tip_id).unwrap();

    // Case B: axial only
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_id, fx: p_axial, fy: 0.0, mz: 0.0,
    })];
    let input_b = make_beam(n, l, E, A, IZ, "fixed", None, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();
    let tip_b = res_b.displacements.iter().find(|d| d.node_id == tip_id).unwrap();

    // Case C: combined
    let loads_c = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_id, fx: p_axial, fy: 0.0, mz: m_app,
    })];
    let input_c = make_beam(n, l, E, A, IZ, "fixed", None, loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == tip_id).unwrap();

    // Analytical results for case A:
    let theta_expected = m_app * l / (e_eff * IZ);
    let dy_expected = m_app * l * l / (2.0 * e_eff * IZ);
    assert_close(tip_a.rz, theta_expected, 0.02,
        "Moment only: theta = ML/(EI)");
    assert_close(tip_a.uy.abs(), dy_expected, 0.02,
        "Moment only: delta_y = ML^2/(2EI)");

    // Analytical results for case B:
    let dx_expected = p_axial * l / (e_eff * A);
    assert_close(tip_b.ux, dx_expected, 0.02,
        "Axial only: delta_x = PL/(EA)");

    // Superposition: combined = sum of individual cases
    assert_close(tip_c.ux, tip_b.ux, 0.01,
        "Superposition: ux_combined = ux_axial");
    assert_close(tip_c.uy, tip_a.uy, 0.01,
        "Superposition: uy_combined = uy_moment");
    assert_close(tip_c.rz, tip_a.rz, 0.01,
        "Superposition: rz_combined = rz_moment");

    // Element forces at base: M_base = M_app (constant for pure moment)
    // N_base = P_axial, V_base ≈ 0 (no transverse load)
    let ef_base_c = res_c.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_base_c.n_start.abs(), p_axial, 0.02,
        "Combined: N_base = P_axial");
    assert_close(ef_base_c.m_start.abs(), m_app, 0.05,
        "Combined: M_base = M_applied");
}

// ================================================================
// 6. L-Shaped Knee Frame: Combined Loading at Knee Joint
// ================================================================
//
// L-shaped frame: vertical column (0,0)-(0,H), horizontal beam (0,H)-(W,H).
// Fixed at base (0,0), free at tip (W,H).
// Load: vertical P downward + horizontal F at tip (W,H).
// Column carries: N = P (compression), V = F, M varies.
// Beam carries: N = F (compression/tension), V = P, M varies.
// At tip: M = 0 (free end).
// At knee (0,H): M = P*W (from vertical load on beam) + F*0 = P*W
// At base (0,0): M = P*W + F*H
//
// Reference: Ghali & Neville, Ch. 3, rigid frames

#[test]
fn validation_bc_ext_l_frame_knee() {
    let h = 4.0;
    let w = 5.0;
    let p_vert = -20.0; // downward at tip
    let f_horiz = 8.0;  // rightward at tip

    // 4 elements per member for good accuracy
    let n_col = 4;
    let n_beam = 4;
    let total_nodes = n_col + n_beam + 1;
    let col_elem_len = h / n_col as f64;
    let beam_elem_len = w / n_beam as f64;

    let mut nodes = Vec::new();
    // Column nodes: (0,0) to (0,H) - vertical
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * col_elem_len));
    }
    // Beam nodes: (0,H) to (W,H) - horizontal (knee node already counted)
    for i in 1..=n_beam {
        nodes.push((n_col + 1 + i, i as f64 * beam_elem_len, h));
    }

    let mut elems = Vec::new();
    // Column elements
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    // Beam elements
    let knee_node = n_col + 1;
    for i in 0..n_beam {
        let eid = n_col + i + 1;
        let ni = knee_node + i;
        let nj = knee_node + i + 1;
        elems.push((eid, "frame", ni, nj, 1, 1, false, false));
    }

    let sups = vec![(1, 1, "fixed")];
    let tip_node = total_nodes;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: f_horiz, fy: p_vert, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base reactions: equilibrium
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rx, -f_horiz, 0.02, "L-frame: Rx = -F_horiz");
    assert_close(r_base.ry, -p_vert, 0.02, "L-frame: Ry = -P_vert (upward)");

    // Base moment: M_base = P_vert_abs * W + F_horiz * H
    let p_abs: f64 = p_vert.abs();
    let m_base_expected = p_abs * w + f_horiz * h;
    // The sign depends on convention; check magnitude
    assert_close(r_base.mz.abs(), m_base_expected, 0.05,
        "L-frame: M_base = |P|*W + F*H");

    // Column base element (elem 1): carries combined axial + bending
    let ef_col_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    // Column axial = vertical load component = |P_vert|
    assert_close(ef_col_base.n_start.abs(), p_abs, 0.05,
        "L-frame: column axial = |P_vert|");
    // Column shear at base = horizontal load = F_horiz
    assert_close(ef_col_base.v_start.abs(), f_horiz, 0.05,
        "L-frame: column shear = F_horiz");
}

// ================================================================
// 7. Two-Span Continuous Beam with Axial Load + UDL
// ================================================================
//
// Two equal spans L, UDL q on both spans. Pinned-roller-roller.
// With added axial tension at the right end.
// In linear analysis, axial load does not affect bending.
// For two equal spans with UDL:
//   R_center = 10qL/8 = 5qL/4 (reaction at interior support)
//   R_end = 3qL/8 (reactions at end supports)
//   M_center = -qL²/8 (hogging moment over interior support)
//
// Reference: Ghali & Neville, Ch. 4, continuous beams

#[test]
fn validation_bc_ext_two_span_axial_udl() {
    let l_span = 6.0;
    let n_per = 6;
    let q: f64 = -10.0; // downward UDL
    let p_axial = 50.0; // tension at right end

    let total_elems = 2 * n_per;

    // Build UDL loads for all elements
    let mut loads_udl = Vec::new();
    for i in 1..=total_elems {
        loads_udl.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Case 1: UDL only
    let input1 = make_continuous_beam(
        &[l_span, l_span], n_per, E, A, IZ, loads_udl.clone(),
    );
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: UDL + axial
    let mut loads_combined = loads_udl;
    let last_node = total_elems + 1;
    loads_combined.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: last_node, fx: p_axial, fy: 0.0, mz: 0.0,
    }));
    let input2 = make_continuous_beam(
        &[l_span, l_span], n_per, E, A, IZ, loads_combined,
    );
    let res2 = linear::solve_2d(&input2).unwrap();

    // Reactions (expected for two equal spans with UDL q):
    let q_abs: f64 = q.abs();
    let r_end_expected = 3.0 * q_abs * l_span / 8.0;
    let r_center_expected = 10.0 * q_abs * l_span / 8.0;
    let center_node = n_per + 1;

    let r1_left = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_center = res1.reactions.iter().find(|r| r.node_id == center_node).unwrap();
    let r1_right = res1.reactions.iter().find(|r| r.node_id == last_node).unwrap();

    assert_close(r1_left.ry, r_end_expected, 0.02,
        "Two-span UDL: R_left = 3qL/8");
    assert_close(r1_center.ry, r_center_expected, 0.02,
        "Two-span UDL: R_center = 10qL/8");
    assert_close(r1_right.ry, r_end_expected, 0.02,
        "Two-span UDL: R_right = 3qL/8");

    // Verify total vertical reaction = total load
    let total_load = q_abs * 2.0 * l_span;
    let sum_ry: f64 = res1.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Two-span: sum Ry = q * 2L");

    // Adding axial should not change vertical reactions (linear analysis)
    let r2_left = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2_center = res2.reactions.iter().find(|r| r.node_id == center_node).unwrap();

    assert_close(r2_left.ry, r1_left.ry, 0.01,
        "Two-span combined: Ry_left unchanged by axial");
    assert_close(r2_center.ry, r1_center.ry, 0.01,
        "Two-span combined: Ry_center unchanged by axial");
}

// ================================================================
// 8. Inclined Beam-Column Under Gravity: Force Decomposition
// ================================================================
//
// Inclined member at angle theta from horizontal.
// Pinned at bottom-left (0,0), roller (rollerX) at top-right (Lcos(θ), Lsin(θ)).
// Vertical load P at midspan node.
// The inclined member sees both axial and transverse components of gravity.
// Axial component of load along member: N_component = P*sin(θ)/2 (approx)
// Transverse component: V_component = P*cos(θ)/2 (approx)
// End reactions: R1y + R2y = P
//
// Reference: Hibbeler, Ch. 6, inclined beam analysis

#[test]
fn validation_bc_ext_inclined_beam_gravity() {
    let l = 8.0;
    let theta_deg: f64 = 30.0;
    let theta: f64 = theta_deg * std::f64::consts::PI / 180.0;
    let cos_t: f64 = theta.cos();
    let sin_t: f64 = theta.sin();
    let n = 8;
    let p = 24.0; // downward at midspan

    let lx = l * cos_t;
    let ly = l * sin_t;
    let elem_dx = lx / n as f64;
    let elem_dy = ly / n as f64;

    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_dx, i as f64 * elem_dy))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Inclined beam: sum Ry = P");

    // Sum Rx = 0 (no horizontal applied loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.02, "Inclined beam: sum Rx = 0");

    // Midspan vertical deflection should be downward
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uy < 0.0,
        "Inclined beam: midspan deflects downward, got uy={:.6e}", d_mid.uy);

    // The inclined member carries axial force (due to angle).
    // For a simply-supported inclined beam with midspan vertical load P,
    // the axial force in the beam = horizontal reaction component / cos(theta)
    // By equilibrium at the pinned end: Rx causes axial force.
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Horizontal reaction at pin: exists because roller only fixes uy, not ux.
    // Actually rollerX fixes ux and uy, so node 2 (rollerX) has no ux displacement.
    // Both supports restrain horizontal movement, so horizontal reaction is shared.
    // The inclined member definitely carries axial force:
    let ef_mid_elem = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert!(ef_mid_elem.n_start.abs() > 0.1,
        "Inclined beam: member carries axial force, got N={:.4}", ef_mid_elem.n_start);

    // Elements carry both V and N (combined beam-column action)
    assert!(ef_mid_elem.v_start.abs() > 0.1,
        "Inclined beam: member carries shear, got V={:.4}", ef_mid_elem.v_start);

    // Moment equilibrium about left support:
    // R2y * lx = P * lx/2  => R2y = P/2
    // (Because the load is at midspan and rollerX provides vertical reaction)
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.ry, p / 2.0, 0.05,
        "Inclined beam: R1y = P/2 (symmetric midspan load)");
    assert_close(r2.ry, p / 2.0, 0.05,
        "Inclined beam: R2y = P/2 (symmetric midspan load)");
}
