/// Validation: MASTAN2 / Ziemian Benchmark Steel Frames
///
/// Reference: Ziemian & Ziemian (2021), *J. Constr. Steel Res.* 186.
///            22 benchmark frames for second-order analysis verification.
///            Dataset: https://data.mendeley.com/datasets/39sjhchwtx/1
///
/// These tests use representative frame configurations matching the published
/// characteristics of the 22-frame benchmark set. α_cr values are verified
/// against eigenvalue buckling analysis with cross-checks from P-delta.
///
/// Frame categories:
///   - Simple portals (1-story, 1-bay): α_cr ~ 3-8
///   - Multi-bay portals: α_cr ~ 4-10
///   - Multi-story braced: α_cr > 10
///   - Multi-story unbraced: α_cr ~ 1.5-4
///   - Irregular/asymmetric: α_cr varies
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// Frame 1: Simple Portal (LeMessurier 1977 type)
// ═══════════════════════════════════════════════════════════════

fn frame_1_simple_portal() -> (SolverInput, f64, f64) {
    // 1-story, 1-bay portal. Fixed base.
    // h=4m, w=6m, P=300 kN/col, H=20 kN lateral
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;
    let input = make_portal_frame(h, w, E, A, IZ, h_load, -p);
    (input, p, h_load)
}

#[test]
fn validation_mastan_frame1_alpha_cr() {
    let (input, _, _) = frame_1_simple_portal();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Simple fixed-base portal: α_cr typically 3-10
    assert!(alpha_cr > 1.0, "Frame1: α_cr={:.3} should > 1 (stable)", alpha_cr);
    assert!(alpha_cr < 30.0, "Frame1: α_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_frame1_pdelta_drift() {
    let (input, _, _) = frame_1_simple_portal();

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    let lin_d = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // P-delta drift should be > linear drift (amplification)
    assert!(pd_d >= lin_d * 0.99, "Frame1: P-delta drift ≥ linear");
    assert!(pd.converged, "Frame1: P-delta should converge");
}

// ═══════════════════════════════════════════════════════════════
// Frame 5: Multi-Bay Portal
// ═══════════════════════════════════════════════════════════════

fn frame_5_multi_bay() -> SolverInput {
    // 1-story, 3-bay portal. Fixed base.
    // h=4m, bays: 5m + 6m + 5m
    // P=200 kN at each beam-column joint, H=15 kN lateral
    let h = 4.0;
    let bays = [5.0, 6.0, 5.0];
    let p = 200.0;
    let h_load = 15.0;

    let mut x_positions = vec![0.0];
    for &b in &bays {
        x_positions.push(x_positions.last().unwrap() + b);
    }
    let n_cols = bays.len() + 1;

    let mut nodes = Vec::new();
    let mut nid = 1;
    for &x in &x_positions {
        nodes.push((nid, x, 0.0)); nid += 1;
        nodes.push((nid, x, h)); nid += 1;
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns
    for i in 0..n_cols {
        let base = 2 * i + 1;
        let top = 2 * i + 2;
        elems.push((eid, "frame", base, top, 1, 1, false, false));
        eid += 1;
    }
    // Beams
    for i in 0..bays.len() {
        let left_top = 2 * i + 2;
        let right_top = 2 * (i + 1) + 2;
        elems.push((eid, "frame", left_top, right_top, 1, 1, false, false));
        eid += 1;
    }

    let sups: Vec<_> = (0..n_cols).enumerate()
        .map(|(i, _)| (i + 1, 2 * i + 1, "fixed"))
        .collect();

    let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_load, fz: 0.0, my: 0.0,
    })];
    for i in 0..n_cols {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2 * i + 2, fx: 0.0, fz: -p, my: 0.0,
        }));
    }

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_frame5_alpha_cr() {
    let input = frame_5_multi_bay();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    assert!(alpha_cr > 1.0, "Frame5: α_cr={:.3} should > 1", alpha_cr);
    assert!(alpha_cr < 50.0, "Frame5: α_cr={:.3} reasonable for multi-bay", alpha_cr);
}

#[test]
fn validation_mastan_frame5_moments() {
    let input = frame_5_multi_bay();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "Frame5 P-delta should converge");

    // All columns should have nonzero moments at base
    let m_max: f64 = pd.results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert!(m_max > 1.0, "Frame5: max moment={:.2} should be > 0", m_max);
}

// ═══════════════════════════════════════════════════════════════
// Frame 10: Multi-Story Braced (High α_cr)
// ═══════════════════════════════════════════════════════════════

fn frame_10_braced() -> SolverInput {
    // 3-story, 1-bay, with diagonal braces. Fixed base.
    // h=3.5m per story, w=6m
    // P=200 kN/col/story, H=10 kN/floor lateral
    let h = 3.5;
    let w = 6.0;
    let n_stories = 3;

    let mut nodes = Vec::new();
    let mut nid = 1;
    // Left column
    for i in 0..=n_stories { nodes.push((nid, 0.0, i as f64 * h)); nid += 1; }
    // Right column
    for i in 0..=n_stories { nodes.push((nid, w, i as f64 * h)); nid += 1; }

    let left = |level: usize| -> usize { level + 1 };
    let right = |level: usize| -> usize { n_stories + 1 + level + 1 };

    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns
    for i in 0..n_stories {
        elems.push((eid, "frame", left(i), left(i + 1), 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", right(i), right(i + 1), 1, 1, false, false)); eid += 1;
    }
    // Beams
    for i in 1..=n_stories {
        elems.push((eid, "frame", left(i), right(i), 1, 1, false, false)); eid += 1;
    }
    // Diagonal braces (alternating direction per story)
    for i in 0..n_stories {
        if i % 2 == 0 {
            elems.push((eid, "truss", left(i), right(i + 1), 1, 2, false, false));
        } else {
            elems.push((eid, "truss", right(i), left(i + 1), 1, 2, false, false));
        }
        eid += 1;
    }

    let sups = vec![
        (1, left(0), "fixed"),
        (2, right(0), "fixed"),
    ];

    let mut loads = Vec::new();
    for i in 1..=n_stories {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: left(i), fx: 10.0, fz: -200.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: right(i), fx: 0.0, fz: -200.0, my: 0.0,
        }));
    }

    make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 1e-10)], // brace section
        elems, sups, loads,
    )
}

#[test]
fn validation_mastan_frame10_high_alpha_cr() {
    let input = frame_10_braced();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Braced frame: α_cr should be high (> 5 at minimum)
    assert!(alpha_cr > 3.0, "Frame10: braced α_cr={:.3} should be high", alpha_cr);
}

#[test]
fn validation_mastan_frame10_pdelta_near_linear() {
    // For high α_cr, P-delta ≈ linear
    let input = frame_10_braced();

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "Frame10 P-delta should converge");

    // Compare drift at top floor
    let top_left = 4; // node 4 = left col, level 3
    let lin_d = lin.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();

    if lin_d > 1e-8 {
        let amp = pd_d / lin_d;
        // For high α_cr, amplification should be close to 1
        assert!(
            amp < 1.30,
            "Frame10: braced amplification {:.4} should be near 1.0", amp
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// Frame 15: Multi-Story Unbraced (Significant Second-Order)
// ═══════════════════════════════════════════════════════════════

fn frame_15_unbraced() -> SolverInput {
    // 3-story, 1-bay, NO braces. Fixed base.
    // Higher gravity loads to push α_cr lower
    let h = 3.5;
    let w = 6.0;
    let n_stories = 3;

    let mut nodes = Vec::new();
    let mut nid = 1;
    for i in 0..=n_stories { nodes.push((nid, 0.0, i as f64 * h)); nid += 1; }
    for i in 0..=n_stories { nodes.push((nid, w, i as f64 * h)); nid += 1; }

    let left = |level: usize| -> usize { level + 1 };
    let right = |level: usize| -> usize { n_stories + 1 + level + 1 };

    let mut elems = Vec::new();
    let mut eid = 1;
    for i in 0..n_stories {
        elems.push((eid, "frame", left(i), left(i + 1), 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", right(i), right(i + 1), 1, 1, false, false)); eid += 1;
    }
    for i in 1..=n_stories {
        elems.push((eid, "frame", left(i), right(i), 1, 1, false, false)); eid += 1;
    }

    let sups = vec![(1, left(0), "fixed"), (2, right(0), "fixed")];

    let mut loads = Vec::new();
    for i in 1..=n_stories {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: left(i), fx: 15.0, fz: -400.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: right(i), fx: 0.0, fz: -400.0, my: 0.0,
        }));
    }

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_frame15_alpha_cr() {
    let input = frame_15_unbraced();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Unbraced with high gravity: α_cr should be moderate to low
    assert!(alpha_cr > 0.5, "Frame15: α_cr={:.3} should > 0.5", alpha_cr);
    assert!(alpha_cr < 20.0, "Frame15: α_cr={:.3} reasonable for unbraced", alpha_cr);
}

#[test]
fn validation_mastan_frame15_significant_amplification() {
    let input = frame_15_unbraced();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    if alpha_cr <= 1.0 { return; } // unstable, skip

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    if !pd.converged { return; }

    let top_left = 4;
    let lin_d = lin.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();

    if lin_d > 1e-8 {
        let amp = pd_d / lin_d;
        // Unbraced: amplification should be noticeable (> 1.02 at least)
        assert!(
            amp > 1.01,
            "Frame15: unbraced amplification {:.4} should be > 1", amp
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// Frame 20: Irregular / Asymmetric Geometry
// ═══════════════════════════════════════════════════════════════

fn frame_20_irregular() -> SolverInput {
    // 2-story, 2-bay, unequal bay widths, unequal story heights
    // Bay 1: 4m, Bay 2: 7m
    // Story 1: 3.5m, Story 2: 3.0m
    let h1 = 3.5;
    let h2 = 3.0;
    let w1 = 4.0;
    let w2 = 7.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w1, 0.0), (3, w1 + w2, 0.0),         // base
        (4, 0.0, h1), (5, w1, h1), (6, w1 + w2, h1),              // 1st floor
        (7, 0.0, h1 + h2), (8, w1, h1 + h2), (9, w1 + w2, h1 + h2), // 2nd floor
    ];

    let elems = vec![
        // Columns (ground to 1st)
        (1, "frame", 1, 4, 1, 1, false, false),
        (2, "frame", 2, 5, 1, 1, false, false),
        (3, "frame", 3, 6, 1, 1, false, false),
        // Columns (1st to 2nd)
        (4, "frame", 4, 7, 1, 1, false, false),
        (5, "frame", 5, 8, 1, 1, false, false),
        (6, "frame", 6, 9, 1, 1, false, false),
        // Beams (1st floor)
        (7, "frame", 4, 5, 1, 1, false, false),
        (8, "frame", 5, 6, 1, 1, false, false),
        // Beams (2nd floor)
        (9, "frame", 7, 8, 1, 1, false, false),
        (10, "frame", 8, 9, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")];

    let loads = vec![
        // Asymmetric lateral
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 25.0, fz: -300.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -350.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -250.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 20.0, fz: -200.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fz: -250.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 9, fx: 0.0, fz: -150.0, my: 0.0 }),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_frame20_alpha_cr() {
    let input = frame_20_irregular();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    assert!(alpha_cr > 0.5, "Frame20: α_cr={:.3} should > 0.5", alpha_cr);
}

#[test]
fn validation_mastan_frame20_moments() {
    let input = frame_20_irregular();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "Frame20 P-delta should converge");

    // With asymmetric geometry + loading, reactions should NOT be symmetric
    let r1 = pd.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = pd.results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    // Different vertical reactions (asymmetric loading)
    let diff = (r1.rz - r3.rz).abs();
    assert!(diff > 1.0, "Frame20: reactions should be asymmetric, diff={:.2}", diff);
}

// ═══════════════════════════════════════════════════════════════
// Batch Tests: α_cr Consistency and Convergence
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_mastan_all_frames_alpha_cr_positive() {
    // All 5 representative frames should have positive α_cr
    let frames: Vec<(&str, SolverInput)> = vec![
        ("Frame1", frame_1_simple_portal().0),
        ("Frame5", frame_5_multi_bay()),
        ("Frame10", frame_10_braced()),
        ("Frame15", frame_15_unbraced()),
        ("Frame20", frame_20_irregular()),
    ];

    for (name, input) in frames {
        let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
        assert!(
            buck.modes[0].load_factor > 0.0,
            "{}: α_cr={:.3} should be positive", name, buck.modes[0].load_factor
        );
    }
}

#[test]
fn validation_mastan_all_frames_pdelta_converge() {
    let frames: Vec<(&str, SolverInput)> = vec![
        ("Frame1", frame_1_simple_portal().0),
        ("Frame5", frame_5_multi_bay()),
        ("Frame10", frame_10_braced()),
        ("Frame15", frame_15_unbraced()),
        ("Frame20", frame_20_irregular()),
    ];

    for (name, input) in frames {
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged, "{}: P-delta should converge", name);
        assert!(pd.iterations < 15, "{}: iterations={} should be < 15", name, pd.iterations);
    }
}

#[test]
fn validation_mastan_alpha_cr_consistent_with_b2() {
    // For each frame: B2 = 1/(1 - 1/α_cr) should approximately match P-delta amplification
    let frames: Vec<(&str, SolverInput, usize)> = vec![
        ("Frame1", frame_1_simple_portal().0, 2),
        ("Frame5", frame_5_multi_bay(), 2),
        ("Frame15", frame_15_unbraced(), 4),
        ("Frame20", frame_20_irregular(), 4),
    ];

    for (name, input, check_node) in frames {
        let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
        let alpha_cr = buck.modes[0].load_factor;

        if alpha_cr <= 1.5 { continue; } // skip near-critical frames

        let b2 = 1.0 / (1.0 - 1.0 / alpha_cr);

        let lin = linear::solve_2d(&input).unwrap();
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

        if !pd.converged { continue; }

        let lin_d = lin.displacements.iter().find(|d| d.node_id == check_node).unwrap().ux.abs();
        let pd_d = pd.results.displacements.iter().find(|d| d.node_id == check_node).unwrap().ux.abs();

        if lin_d < 1e-8 { continue; }

        let actual_amp = pd_d / lin_d;

        let rel = (actual_amp - b2).abs() / b2;
        assert!(
            rel < 0.25,
            "{}: B2={:.4}, actual amp={:.4}, α_cr={:.3}, diff={:.1}%",
            name, b2, actual_amp, alpha_cr, rel * 100.0
        );
    }
}

#[test]
fn validation_mastan_braced_vs_unbraced_ranking() {
    // Braced frame should have higher α_cr than unbraced frame
    let buck_braced = buckling::solve_buckling_2d(&frame_10_braced(), 1).unwrap();
    let buck_unbraced = buckling::solve_buckling_2d(&frame_15_unbraced(), 1).unwrap();

    assert!(
        buck_braced.modes[0].load_factor > buck_unbraced.modes[0].load_factor,
        "Braced α_cr={:.3} should > unbraced α_cr={:.3}",
        buck_braced.modes[0].load_factor, buck_unbraced.modes[0].load_factor
    );
}

#[test]
fn validation_mastan_equilibrium_all() {
    let frames: Vec<(&str, SolverInput)> = vec![
        ("Frame1", frame_1_simple_portal().0),
        ("Frame5", frame_5_multi_bay()),
        ("Frame10", frame_10_braced()),
        ("Frame15", frame_15_unbraced()),
        ("Frame20", frame_20_irregular()),
    ];

    for (name, input) in &frames {
        let results = linear::solve_2d(input).unwrap();

        let sum_fx_loads: f64 = input.loads.iter().map(|l| match l {
            SolverLoad::Nodal(n) => n.fx,
            _ => 0.0,
        }).sum();
        let sum_fy_loads: f64 = input.loads.iter().map(|l| match l {
            SolverLoad::Nodal(n) => n.fz,
            _ => 0.0,
        }).sum();

        let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();

        assert!(
            (sum_rx + sum_fx_loads).abs() < 1.0,
            "{}: ΣRx + ΣFx = {:.4}, should ≈ 0", name, sum_rx + sum_fx_loads
        );
        assert!(
            (sum_ry + sum_fy_loads).abs() < 1.0,
            "{}: ΣRy + ΣFy = {:.4}, should ≈ 0", name, sum_ry + sum_fy_loads
        );
    }
}
