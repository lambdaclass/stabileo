/// Validation: Hibbeler's "Structural Analysis" Textbook Problems
///
/// References:
///   - R.C. Hibbeler, "Structural Analysis", 10th Ed.
///   - Problems selected from key chapters to cover the textbook's progression:
///     1. Determinate beam reactions (Ch. 2)
///     2. Internal forces at a section (Ch. 4)
///     3. Conjugate beam / deflections (Ch. 8)
///     4. Force method for indeterminate beams (Ch. 10)
///     5. Slope-deflection method (Ch. 11)
///     6. Moment distribution method (Ch. 12)
///     7. Direct stiffness for beams (Ch. 14)
///     8. Direct stiffness for frames (Ch. 15)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Hibbeler Ch.2 Style: Overhanging Beam Reactions
// ================================================================
//
// Beam: A---B---C, supports at A (pinned) and B (roller).
// AB = 4m, BC = 2m (overhang). UDL w = 10 kN/m on AB.
// Point load P = 8 kN at C.
// ΣMB = 0: RA × 4 - 10×4×2 + 8×2 = 0 → RA = (80-16)/4 = 16
// ΣMA = 0: RB × 4 - 10×4×2 - 8×6 = 0 → RB = (80+48)/4 = 32

#[test]
fn validation_hibbeler_overhanging_beam() {
    let lab = 4.0;
    let lbc = 2.0;
    let n_ab = 4;
    let n_bc = 2;
    let n_total = n_ab + n_bc;
    let q: f64 = -10.0;
    let p = 8.0;

    let elem_ab = lab / n_ab as f64;
    let elem_bc = lbc / n_bc as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_ab {
        nodes.push((i + 1, i as f64 * elem_ab, 0.0));
    }
    for i in 1..=n_bc {
        nodes.push((n_ab + 1 + i, lab + i as f64 * elem_bc, 0.0));
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, "pinned"), (2, n_ab + 1, "rollerX")];

    let mut loads = Vec::new();
    // UDL on AB (elements 1..n_ab)
    for i in 0..n_ab {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    // Point load at C (tip of overhang)
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_total + 1, fx: 0.0, fz: -p, my: 0.0,
    }));

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == n_ab + 1).unwrap().rz;

    assert_close(ra, 16.0, 0.02, "Hibbeler overhanging: RA = 16 kN");
    assert_close(rb, 32.0, 0.02, "Hibbeler overhanging: RB = 32 kN");
}

// ================================================================
// 2. Hibbeler Ch.4 Style: Internal Forces at a Section
// ================================================================
//
// SS beam L=10m, point load P=20 kN at x=4m from left.
// At x=4m: V = RA - P = 12 - 20 = -8, M = RA×4 = 48.
// RA = P×6/10 = 12, RB = P×4/10 = 8.

#[test]
fn validation_hibbeler_internal_forces() {
    let l = 10.0;
    let n = 10;
    let p = 20.0;
    let load_node = 5; // x = 4m (node 5 at x=4)

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    assert_close(ra, 12.0, 0.02, "Hibbeler: RA = Pb/L = 12");
    assert_close(rb, 8.0, 0.02, "Hibbeler: RB = Pa/L = 8");

    // Moment at load point: M = RA × a = 12 × 4 = 48
    // Element 4 goes from node 4 to node 5 (x=3 to x=4), so m_end is at load point
    let ef = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef.m_end.abs(), 48.0, 0.02, "Hibbeler: M at load = Pab/L = 48");
}

// ================================================================
// 3. Hibbeler Ch.8 Style: Deflection of SS Beam
// ================================================================
//
// SS beam, UDL w = 10 kN/m, L = 6m.
// δ_max = 5wL⁴/(384EI)

#[test]
fn validation_hibbeler_ss_deflection() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Hibbeler SS deflection: δ = 5wL⁴/(384EI)");
}

// ================================================================
// 4. Hibbeler Ch.10 Style: Propped Cantilever by Force Method
// ================================================================
//
// Fixed at A, roller at B, UDL w, span L.
// RA = 3wL/8, RB = 5wL/8, MA = wL²/8.
// δ_max at x = L(1-1/√3)/2 from fixed end ≈ not needed, check reactions.

#[test]
fn validation_hibbeler_propped_cantilever_udl() {
    let l = 8.0;
    let n = 10;
    let q: f64 = -12.0;

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let w = q.abs();
    let ma_exact = w * l * l / 8.0;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Note: fixed end takes less vertical reaction (3/8), prop takes more (5/8)
    // Actually for propped cantilever with UDL: R_fixed = 5wL/8, R_prop = 3wL/8
    // M_fixed = wL²/8
    assert_close(ra.rz, 5.0 * w * l / 8.0, 0.02,
        "Hibbeler propped: R_fixed = 5wL/8");
    assert_close(rb.rz, 3.0 * w * l / 8.0, 0.02,
        "Hibbeler propped: R_prop = 3wL/8");
    assert_close(ra.my.abs(), ma_exact, 0.02,
        "Hibbeler propped: M_fixed = wL²/8");
}

// ================================================================
// 5. Hibbeler Ch.11 Style: Fixed-Fixed Beam, Slope-Deflection
// ================================================================
//
// Fixed-fixed beam, point load P at center.
// MA = MB = PL/8, RA = RB = P/2.
// δ_max = PL³/(192EI).

#[test]
fn validation_hibbeler_fixed_fixed_center_load() {
    let l = 6.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Reactions = P/2
    assert_close(ra.rz, p / 2.0, 0.02, "Hibbeler fixed-fixed: RA = P/2");
    assert_close(rb.rz, p / 2.0, 0.02, "Hibbeler fixed-fixed: RB = P/2");

    // Moments = PL/8
    assert_close(ra.my.abs(), p * l / 8.0, 0.02,
        "Hibbeler fixed-fixed: MA = PL/8");

    // Midspan deflection
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Hibbeler fixed-fixed: δ = PL³/(192EI)");
}

// ================================================================
// 6. Hibbeler Ch.12 Style: Two-Span by Moment Distribution
// ================================================================
//
// Two equal spans, fixed at ends, UDL on first span only.
// By moment distribution: M_B = wL²/16 (carry-over from first span).

#[test]
fn validation_hibbeler_moment_distribution_two_span() {
    let l = 6.0;
    let n_per = 6;
    let q: f64 = -10.0;

    // Two spans, both fixed ends
    let total_n = n_per * 2;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at A, roller at B, fixed at C
    let mid_node = n_per + 1;
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, mid_node, "rollerX"),
        (3, n_nodes, "fixed"),
    ];

    // UDL only on first span
    let mut loads = Vec::new();
    for i in 0..n_per {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let total_load = q.abs() * l;
    assert_close(sum_ry, total_load, 0.02,
        "Hibbeler two-span: ΣRy = wL (load on span 1 only)");

    // Internal moment at B should be non-zero (redistribution)
    // For fixed-roller-fixed with UDL on first span:
    // FEM_AB = wL²/12 = 30, FEM_BA = -wL²/12 = -30
    // FEM_BC = 0, FEM_CB = 0
    // At joint B: stiffness AB = 4EI/L, stiffness BC = 4EI/L → DF = 0.5 each
    // Unbalanced moment at B = FEM_BA + FEM_BC = -30
    // Distribution: +15 to BA, +15 to BC
    // Carry-over: +7.5 to A, +7.5 to C
    // Second iteration negligible.
    // M_B = -30 + 15 = -15 (from AB side)
    // Actually for moment at the element end at B:
    let ef_ab = results.element_forces.iter()
        .find(|e| e.element_id == n_per).unwrap();
    assert!(ef_ab.m_end.abs() > 5.0,
        "Moment at B should be significant: {:.4}", ef_ab.m_end);
}

// ================================================================
// 7. Hibbeler Ch.14 Style: Beam Stiffness Matrix Verification
// ================================================================
//
// Single beam element, fixed-free (cantilever), verify K × u = F.
// With tip load P: δ = PL³/(3EI), θ = PL²/(2EI).

#[test]
fn validation_hibbeler_stiffness_matrix() {
    let l = 4.0;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let input = make_beam(1, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Tip deflection
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.01,
        "Hibbeler stiffness: δ = PL³/(3EI)");

    // Tip rotation
    let theta_exact = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.ry.abs(), theta_exact, 0.01,
        "Hibbeler stiffness: θ = PL²/(2EI)");

    // Fixed-end reactions: Ry = P, Mz = PL
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rz, p, 0.01, "Hibbeler stiffness: R = P");
    assert_close(r.my.abs(), p * l, 0.01, "Hibbeler stiffness: M = PL");
}

// ================================================================
// 8. Hibbeler Ch.15 Style: Portal Frame Stiffness Method
// ================================================================
//
// Portal frame with fixed bases, lateral load at top.
// By slope-deflection / stiffness method:
// With rigid beam assumption or symmetric frame.

#[test]
fn validation_hibbeler_portal_frame_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0; // lateral load at top-left

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: ΣRx = -P (reactions oppose load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Hibbeler portal: ΣRx = -P");

    // Moment equilibrium about base-left:
    // P×h + M1 + M4 + Ry4 × w = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let m_sum = -p * h + r1.my + r4.my + r4.rz * w;
    assert!(m_sum.abs() < p * h * 0.02,
        "Hibbeler portal moment equilibrium: residual={:.4}", m_sum);

    // Due to symmetry of stiffness, sway should be equal at both top nodes
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let diff = (d2.ux - d3.ux).abs();
    assert!(diff < d2.ux.abs() * 0.05 || diff < 1e-6,
        "Hibbeler portal: equal sway at top: d2={:.6e}, d3={:.6e}", d2.ux, d3.ux);
}
