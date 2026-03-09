/// Validation: Span Length Ratio Effects on Continuous Beams and Frames
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 4-5 (Three-moment equation)
///   - Hibbeler, "Structural Analysis", 10th Ed. (Continuous beams)
///   - McCormac, "Structural Analysis" (Influence of span ratios)
///
/// Tests verify how span length ratios affect:
///   1. Interior support moments via three-moment equation
///   2. Short vs long span deflection comparison
///   3. Portal frame aspect ratio and lateral stiffness
///   4. Column height effect on frame lateral flexibility
///   5. Balanced vs unbalanced spans and interior moments
///   6. Reaction distribution asymmetry from unequal spans
///   7. Cantilever overhang length effect on midspan moment
///   8. Slenderness ratio and deflection scaling with Iz
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Equal Spans vs 2:1 Ratio -- Interior Moment
// ================================================================
//
// Two-span continuous beam with UDL on both spans.
// Three-moment equation for UDL on both spans, pinned ends (M_A=M_C=0):
//   2*M_B*(L1+L2) = -q*L1^3/4 - q*L2^3/4
//   M_B = -q*(L1^3 + L2^3) / (8*(L1+L2))
//
// Equal spans L1=L2=L: M_B = -q*2L^3/(8*2L) = -qL^2/8
// Unequal 2L,L: M_B = -q*(8L^3+L^3)/(8*3L) = -9qL^3/(24L) = -3qL^2/8

#[test]
fn validation_span_ratio_equal_vs_unequal_interior_moment() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 4;

    // --- Equal spans: L1=L2=L ---
    let n_total_eq = 2 * n_per_span;
    let loads_eq: Vec<SolverLoad> = (1..=n_total_eq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_eq = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads_eq);
    let res_eq = linear::solve_2d(&input_eq).unwrap();

    // Three-moment: M_B = -q*L^2/8  (magnitude)
    let expected_mb_eq = q * l * l / 8.0;
    let ef_eq = res_eq.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_eq.m_end.abs(), expected_mb_eq, 0.03, "equal spans M_B");

    // --- Unequal spans: L1=2L, L2=L ---
    let l1 = 2.0 * l;
    let l2 = l;
    let n_total_uneq = 2 * n_per_span;
    let loads_uneq: Vec<SolverLoad> = (1..=n_total_uneq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_uneq = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads_uneq);
    let res_uneq = linear::solve_2d(&input_uneq).unwrap();

    // Three-moment: M_B = -q*(L1^3 + L2^3) / (8*(L1+L2))
    let expected_mb_uneq = q * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let ef_uneq = res_uneq.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_uneq.m_end.abs(), expected_mb_uneq, 0.03, "unequal spans M_B");

    // The unequal case should have a larger interior moment
    assert!(
        ef_uneq.m_end.abs() > ef_eq.m_end.abs(),
        "2:1 ratio should produce larger interior moment: {:.2} vs {:.2}",
        ef_uneq.m_end.abs(), ef_eq.m_end.abs()
    );
}

// ================================================================
// 2. Short Span Gets Stiffer (Less Deflection)
// ================================================================
//
// 2-span beam L1=3, L2=9, UDL. The short span deflects less than
// the long span because stiffness scales as 1/L^3.

#[test]
fn validation_span_ratio_short_span_stiffer() {
    let l1 = 3.0;
    let l2 = 9.0;
    let q = 10.0;
    let n_per_span = 6;

    let n_total = 2 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find max deflection in short span (nodes 1 to n_per_span+1)
    let max_defl_short = results.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n_per_span + 1)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Find max deflection in long span (nodes n_per_span+1 to 2*n_per_span+1)
    let max_defl_long = results.displacements.iter()
        .filter(|d| d.node_id >= n_per_span + 1 && d.node_id <= 2 * n_per_span + 1)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_defl_short < max_defl_long,
        "Short span should deflect less: short={:.6e}, long={:.6e}",
        max_defl_short, max_defl_long
    );

    // The ratio should be very large since deflection scales roughly as L^4
    let ratio = max_defl_long / max_defl_short.max(1e-15);
    assert!(
        ratio > 5.0,
        "Long/short deflection ratio should be large (L2/L1=3): got {:.1}", ratio
    );
}

// ================================================================
// 3. Aspect Ratio Effect on Portal Frame
// ================================================================
//
// Portal h=4, w=6 vs h=4, w=12. A wider frame has a stiffer beam
// relative to columns, which changes the sway behavior.
// The wider beam is longer so it is more flexible, meaning the
// columns must resist more of the lateral load, leading to
// different sway.

#[test]
fn validation_span_ratio_portal_aspect_ratio() {
    let h = 4.0;
    let w1 = 6.0;
    let w2 = 12.0;
    let lateral = 20.0;

    let input_narrow = make_portal_frame(h, w1, E, A, IZ, lateral, 0.0);
    let input_wide = make_portal_frame(h, w2, E, A, IZ, lateral, 0.0);

    let res_narrow = linear::solve_2d(&input_narrow).unwrap();
    let res_wide = linear::solve_2d(&input_wide).unwrap();

    let sway_narrow = res_narrow.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let sway_wide = res_wide.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Both should sway in load direction
    assert!(sway_narrow > 0.0, "narrow frame should sway positively");
    assert!(sway_wide > 0.0, "wide frame should sway positively");

    // Wider beam is more flexible (longer), so the beam provides less
    // rotational restraint to the columns. The frame becomes more flexible
    // laterally, resulting in larger sway.
    assert!(
        sway_wide > sway_narrow,
        "Wider frame should sway more: wide={:.6e}, narrow={:.6e}",
        sway_wide, sway_narrow
    );

    // Verify equilibrium for both
    let sum_rx_narrow: f64 = res_narrow.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_wide: f64 = res_wide.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_narrow, -lateral, 0.02, "narrow portal equilibrium");
    assert_close(sum_rx_wide, -lateral, 0.02, "wide portal equilibrium");
}

// ================================================================
// 4. Column Height Effect on Lateral Flexibility
// ================================================================
//
// Portal w=6, h=3 vs h=6. Taller columns are more flexible
// (stiffness ~ 12EI/h^3), so taller frame sways more.

#[test]
fn validation_span_ratio_column_height_effect() {
    let w = 6.0;
    let h_short = 3.0;
    let h_tall = 6.0;
    let lateral = 20.0;

    let input_short = make_portal_frame(h_short, w, E, A, IZ, lateral, 0.0);
    let input_tall = make_portal_frame(h_tall, w, E, A, IZ, lateral, 0.0);

    let res_short = linear::solve_2d(&input_short).unwrap();
    let res_tall = linear::solve_2d(&input_tall).unwrap();

    let sway_short = res_short.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let sway_tall = res_tall.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Both should sway positively
    assert!(sway_short > 0.0, "short frame sway should be positive");
    assert!(sway_tall > 0.0, "tall frame sway should be positive");

    // Taller frame is more flexible laterally
    assert!(
        sway_tall > sway_short,
        "Taller frame should sway more: tall={:.6e}, short={:.6e}",
        sway_tall, sway_short
    );

    // Column stiffness ratio ~ (h_short/h_tall)^3 = (3/6)^3 = 1/8
    // So sway ratio should be approximately (h_tall/h_short)^3 = 8
    // (not exactly, because beam stiffness also plays a role)
    let sway_ratio = sway_tall / sway_short;
    assert!(
        sway_ratio > 3.0,
        "Sway ratio should be large (h ratio = 2): got {:.1}", sway_ratio
    );

    // Equilibrium
    let sum_rx_short: f64 = res_short.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_tall: f64 = res_tall.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_short, -lateral, 0.02, "short portal equilibrium");
    assert_close(sum_rx_tall, -lateral, 0.02, "tall portal equilibrium");
}

// ================================================================
// 5. Balanced Spans Reduce Interior Moments
// ================================================================
//
// 3-span beam: equal spans (L,L,L) vs unequal (L, 2L, L).
// With the center span much longer, the interior moments at
// supports B and C increase significantly.

#[test]
fn validation_span_ratio_balanced_vs_unbalanced_moments() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 4;

    // --- Equal spans: L, L, L ---
    let n_total_eq = 3 * n_per_span;
    let loads_eq: Vec<SolverLoad> = (1..=n_total_eq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_eq = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads_eq);
    let res_eq = linear::solve_2d(&input_eq).unwrap();

    // Interior support B is at node n_per_span+1, C at 2*n_per_span+1
    let ef_b_eq = res_eq.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let ef_c_eq = res_eq.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per_span).unwrap();
    let m_b_eq = ef_b_eq.m_end.abs();
    let m_c_eq = ef_c_eq.m_end.abs();

    // --- Unequal spans: L, 2L, L (center span double) ---
    let n_total_uneq = 3 * n_per_span;
    let loads_uneq: Vec<SolverLoad> = (1..=n_total_uneq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_uneq = make_continuous_beam(&[l, 2.0 * l, l], n_per_span, E, A, IZ, loads_uneq);
    let res_uneq = linear::solve_2d(&input_uneq).unwrap();

    let ef_b_uneq = res_uneq.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let ef_c_uneq = res_uneq.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per_span).unwrap();
    let m_b_uneq = ef_b_uneq.m_end.abs();
    let m_c_uneq = ef_c_uneq.m_end.abs();

    // Max interior moment in the unequal case should exceed the equal case
    let max_interior_eq = m_b_eq.max(m_c_eq);
    let max_interior_uneq = m_b_uneq.max(m_c_uneq);

    assert!(
        max_interior_uneq > max_interior_eq,
        "Unbalanced spans should have larger interior moments: unequal={:.2}, equal={:.2}",
        max_interior_uneq, max_interior_eq
    );

    // Equal spans: M_B = M_C by symmetry
    assert_close(m_b_eq, m_c_eq, 0.02, "equal 3-span symmetry M_B = M_C");
}

// ================================================================
// 6. Span Ratio Determines Reaction Distribution
// ================================================================
//
// 2-span beam with UDL on both spans.
// Equal spans: R_A = R_C (symmetric).
// Unequal spans L1=4, L2=8: R_A != R_C.
// Three-moment equation gives the exact distribution.

#[test]
fn validation_span_ratio_reaction_distribution() {
    let q = 10.0;
    let n_per_span = 4;

    // --- Equal spans L1=L2=6 ---
    let l_eq = 6.0;
    let n_total_eq = 2 * n_per_span;
    let loads_eq: Vec<SolverLoad> = (1..=n_total_eq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_eq = make_continuous_beam(&[l_eq, l_eq], n_per_span, E, A, IZ, loads_eq);
    let res_eq = linear::solve_2d(&input_eq).unwrap();

    let r_a_eq = res_eq.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_c_eq = res_eq.reactions.iter()
        .find(|r| r.node_id == 2 * n_per_span + 1).unwrap().ry;

    // Symmetric: R_A = R_C
    assert_close(r_a_eq, r_c_eq, 0.02, "equal spans R_A = R_C");

    // R_A = R_C = 3qL/8
    assert_close(r_a_eq, 3.0 * q * l_eq / 8.0, 0.02, "equal spans R_A = 3qL/8");

    // --- Unequal spans L1=4, L2=8 ---
    let l1 = 4.0;
    let l2 = 8.0;
    let n_total_uneq = 2 * n_per_span;
    let loads_uneq: Vec<SolverLoad> = (1..=n_total_uneq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_uneq = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads_uneq);
    let res_uneq = linear::solve_2d(&input_uneq).unwrap();

    let r_a_uneq = res_uneq.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_c_uneq = res_uneq.reactions.iter()
        .find(|r| r.node_id == 2 * n_per_span + 1).unwrap().ry;

    // Asymmetric: R_A != R_C
    let asymmetry = (r_a_uneq - r_c_uneq).abs();
    assert!(
        asymmetry > 1.0,
        "Unequal spans should produce asymmetric reactions: R_A={:.2}, R_C={:.2}",
        r_a_uneq, r_c_uneq
    );

    // Three-moment equation: M_B = -q*(L1^3+L2^3)/(8*(L1+L2))  (hogging, negative)
    // For each span, taking moments about B:
    //   R_A * L1 = q*L1^2/2 - |M_B|  =>  R_A = q*L1/2 - |M_B|/L1
    //   R_C * L2 = q*L2^2/2 - |M_B|  =>  R_C = q*L2/2 - |M_B|/L2
    let m_b = q * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let expected_r_a = q * l1 / 2.0 - m_b / l1;
    let expected_r_c = q * l2 / 2.0 - m_b / l2;
    assert_close(r_a_uneq, expected_r_a, 0.03, "unequal R_A");
    assert_close(r_c_uneq, expected_r_c, 0.03, "unequal R_C");

    // Equilibrium: sum of reactions = total load
    let sum_ry: f64 = res_uneq.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * (l1 + l2), 0.02, "unequal spans equilibrium");
}

// ================================================================
// 7. Long Cantilever Overhang Effect
// ================================================================
//
// SS beam of span L=8 with cantilever overhang of length a.
// The overhang with UDL creates a negative moment at the interior
// support that reduces the midspan positive moment.
// Longer overhang => more reduction in midspan moment.
//
// Model: 3 nodes. Node 1 = left support (pinned), node 2 = right
// support (rollerX), node 3 = free end of overhang.

#[test]
fn validation_span_ratio_cantilever_overhang() {
    let l = 8.0;
    let q = 10.0;
    let overhang_short = 2.0;
    let overhang_long = 4.0;
    let n_main = 8;
    let n_oh_short = 2;
    let n_oh_long = 4;

    // --- Helper to build beam with overhang ---
    // Nodes along x: [0, ..., L, ..., L+a]
    // Supports: pinned at node 1, rollerX at node n_main+1
    let build_overhang = |a: f64, n_oh: usize| -> SolverInput {
        let n_total_elems = n_main + n_oh;
        let _n_total_nodes = n_total_elems + 1;
        let elem_len_main = l / n_main as f64;
        let elem_len_oh = a / n_oh as f64;

        let mut nodes = Vec::new();
        for i in 0..=n_main {
            nodes.push((i + 1, i as f64 * elem_len_main, 0.0));
        }
        for i in 1..=n_oh {
            nodes.push((n_main + 1 + i, l + i as f64 * elem_len_oh, 0.0));
        }

        let elems: Vec<_> = (0..n_total_elems)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let sups = vec![
            (1, 1, "pinned"),
            (2, n_main + 1, "rollerX"),
        ];

        let loads: Vec<SolverLoad> = (1..=n_total_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: -q, q_j: -q, a: None, b: None,
            }))
            .collect();

        make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
    };

    let res_short = linear::solve_2d(&build_overhang(overhang_short, n_oh_short)).unwrap();
    let res_long = linear::solve_2d(&build_overhang(overhang_long, n_oh_long)).unwrap();

    // Midspan is approximately at node n_main/2+1
    let mid_node = n_main / 2 + 1;

    // Compare midspan deflection: with a longer overhang, the negative moment
    // at the right support is larger, which lifts the midspan upward, reducing
    // downward deflection. So longer overhang => smaller midspan deflection.
    let defl_mid_short = res_short.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;
    let defl_mid_long = res_long.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy;

    // Both deflect downward (negative uy) at midspan
    // Longer overhang should reduce the downward deflection magnitude
    assert!(
        defl_mid_long.abs() < defl_mid_short.abs(),
        "Longer overhang should reduce midspan deflection: long={:.6e}, short={:.6e}",
        defl_mid_long.abs(), defl_mid_short.abs()
    );

    // Also verify via the hogging moment at the right support:
    // M_support = -q*a^2/2 (hogging from overhang cantilever action)
    // The element just before the right support is element n_main
    let ef_sup_short = res_short.element_forces.iter()
        .find(|ef| ef.element_id == n_main).unwrap();
    let ef_sup_long = res_long.element_forces.iter()
        .find(|ef| ef.element_id == n_main).unwrap();

    // Longer overhang => larger hogging moment at support
    assert!(
        ef_sup_long.m_end.abs() > ef_sup_short.m_end.abs(),
        "Longer overhang should produce larger support moment: long={:.2}, short={:.2}",
        ef_sup_long.m_end.abs(), ef_sup_short.m_end.abs()
    );

    // Verify equilibrium for both cases
    let sum_ry_short: f64 = res_short.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_short, q * (l + overhang_short), 0.02, "overhang short equilibrium");

    let sum_ry_long: f64 = res_long.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_long, q * (l + overhang_long), 0.02, "overhang long equilibrium");
}

// ================================================================
// 8. Slenderness Ratio and Deflection
// ================================================================
//
// Two simply-supported beams with the same load and span, but
// different Iz values (modeling different L/d ratios).
// Beam A: Iz = IZ (representing L/d ~ 10)
// Beam B: Iz = IZ/4 (representing L/d ~ 20, thinner section)
// Deflection = 5qL^4/(384EI), so deflection ratio should match
// the inverse ratio of Iz values (i.e., 4:1).

#[test]
fn validation_span_ratio_slenderness_deflection() {
    let l = 8.0;
    let q = 10.0;
    let n = 8;
    let e_eff = E * 1000.0;

    let iz_stiff = IZ;         // L/d ~ 10 (stocky)
    let iz_slender = IZ / 4.0; // L/d ~ 20 (slender)

    // --- Stiff beam ---
    let mut loads_a = Vec::new();
    for i in 0..n {
        loads_a.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_a = make_beam(n, l, E, A, iz_stiff, "pinned", Some("rollerX"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // --- Slender beam ---
    let mut loads_b = Vec::new();
    for i in 0..n {
        loads_b.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }
    let input_b = make_beam(n, l, E, A, iz_slender, "pinned", Some("rollerX"), loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    let mid = n / 2 + 1;
    let defl_stiff = res_a.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let defl_slender = res_b.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Slender beam should deflect more
    assert!(
        defl_slender > defl_stiff,
        "Slender beam should deflect more: slender={:.6e}, stiff={:.6e}",
        defl_slender, defl_stiff
    );

    // Deflection ratio should match inverse Iz ratio = iz_stiff/iz_slender = 4.0
    let defl_ratio = defl_slender / defl_stiff;
    assert_close(defl_ratio, iz_stiff / iz_slender, 0.03, "deflection ratio matches Iz ratio");

    // Verify against analytical formula: delta = 5qL^4/(384*E_eff*Iz)
    let delta_stiff_exact = 5.0 * q * l.powi(4) / (384.0 * e_eff * iz_stiff);
    let delta_slender_exact = 5.0 * q * l.powi(4) / (384.0 * e_eff * iz_slender);

    assert_close(defl_stiff, delta_stiff_exact, 0.05, "stiff beam analytical deflection");
    assert_close(defl_slender, delta_slender_exact, 0.05, "slender beam analytical deflection");
}
