/// Validation: Seismic Analysis & Design Checks
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 6-7
///   - Eurocode 8 (EN 1998-1): Seismic design
///   - ASCE 7-22: Seismic provisions
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///
/// Tests verify seismic analysis concepts:
///   1. Base shear from spectral analysis
///   2. Story force distribution (inverted triangle)
///   3. Effective modal mass participation
///   4. Frequency check for typical frames
///   5. Modal analysis ordering
///   6. Stiffer structure → higher frequency
///   7. Heavier structure → lower frequency
///   8. Modal superposition: total base shear
use dedaliano_engine::solver::{linear, modal};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.02;
const IZ: f64 = 2e-4;

// ================================================================
// 1. Base Shear Check: Total Reaction = Applied Lateral
// ================================================================
//
// Frame under equivalent static lateral forces (code-style).
// Total base shear = sum of applied lateral forces.

#[test]
fn validation_seismic_base_shear() {
    let h = 3.5;
    let w = 6.0;

    // Two-story frame: lateral forces at each floor
    let f1 = 5.0;  // first floor lateral
    let f2 = 10.0; // second floor lateral (higher = inverted triangle)

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: f2, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = sum of lateral forces
    let v_base = 2.0 * f1 + 2.0 * f2; // 30 kN total lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), v_base, 0.02,
        "Seismic base shear: V_base = ΣF_lateral");
}

// ================================================================
// 2. Inverted Triangle Force Distribution
// ================================================================
//
// For a regular building, seismic forces increase with height.
// Check that story shear at ground > story shear at upper floors.

#[test]
fn validation_seismic_inverted_triangle() {
    let h = 3.5;
    let w = 6.0;
    let n_stories = 3;

    let mut nodes = Vec::new();
    let mut node_id = 1;
    for i in 0..=n_stories {
        let y = i as f64 * h;
        nodes.push((node_id, 0.0, y));
        node_id += 1;
        nodes.push((node_id, w, y));
        node_id += 1;
    }

    let mut elems = Vec::new();
    let mut elem_id = 1;
    for i in 0..n_stories {
        // Left column
        let n_bot_l = 2 * i + 1;
        let n_top_l = 2 * (i + 1) + 1;
        elems.push((elem_id, "frame", n_bot_l, n_top_l, 1, 1, false, false));
        elem_id += 1;
        // Right column
        let n_bot_r = 2 * i + 2;
        let n_top_r = 2 * (i + 1) + 2;
        elems.push((elem_id, "frame", n_bot_r, n_top_r, 1, 1, false, false));
        elem_id += 1;
        // Beam
        elems.push((elem_id, "frame", n_top_l, n_top_r, 1, 1, false, false));
        elem_id += 1;
    }

    let sups = vec![(1, 1_usize, "fixed"), (2, 2, "fixed")];

    // Inverted triangle: F_i ∝ h_i
    let mut loads = Vec::new();
    let f_base = 5.0;
    for i in 1..=n_stories {
        let fi = f_base * i as f64;
        let n_l = 2 * i + 1;
        let n_r = 2 * i + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: n_l, fx: fi, fz: 0.0, my: 0.0 }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: n_r, fx: fi, fz: 0.0, my: 0.0 }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Story drift should increase toward the top (flexible upper stories)
    // But with uniform stiffness, sway increases with height
    let d_floor1 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d_floor2 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let d_floor3 = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;

    assert!(d_floor1.abs() < d_floor2.abs(),
        "Floor 1 < Floor 2 sway: {:.6e} < {:.6e}", d_floor1, d_floor2);
    assert!(d_floor2.abs() < d_floor3.abs(),
        "Floor 2 < Floor 3 sway: {:.6e} < {:.6e}", d_floor2, d_floor3);
}

// ================================================================
// 3. Natural Frequency: Single Portal Frame
// ================================================================
//
// First mode is sway mode. Frequency should be > 0 and reasonable.

#[test]
fn validation_seismic_portal_frequency() {
    let h = 4.0;
    let w = 6.0;
    let density = 7850.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    assert!(modal_res.modes.len() >= 1, "Should find at least 1 mode");
    let f1 = modal_res.modes[0].frequency;

    // First frequency for a steel frame of ~4m height: roughly 1-20 Hz
    assert!(f1 > 0.5 && f1 < 100.0,
        "Portal f1={:.4} Hz should be reasonable", f1);
}

// ================================================================
// 4. Modal Analysis Ordering
// ================================================================
//
// Frequencies must be in ascending order: f1 < f2 < f3.

#[test]
fn validation_seismic_modal_ordering() {
    let h = 4.0;
    let w = 6.0;
    let density = 7850.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 5).unwrap();

    for i in 1..modal_res.modes.len() {
        assert!(modal_res.modes[i].frequency >= modal_res.modes[i - 1].frequency,
            "Modes should be ascending: f{}={:.4} >= f{}={:.4}",
            i, modal_res.modes[i - 1].frequency, i + 1, modal_res.modes[i].frequency);
    }
}

// ================================================================
// 5. Stiffer Structure → Higher Frequency
// ================================================================
//
// Increasing section stiffness (IZ) should increase natural frequency.
// f ∝ √(EI), so doubling I → f increases by √2.

#[test]
fn validation_seismic_stiffness_frequency() {
    let h = 4.0;
    let w = 6.0;
    let density = 7850.0;

    let get_f1 = |iz: f64| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, iz)], elems, sups, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), density);
        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        modal_res.modes[0].frequency
    };

    let f_normal = get_f1(IZ);
    let f_stiff = get_f1(IZ * 4.0);

    // Stiffer should have higher frequency
    assert!(f_stiff > f_normal,
        "Stiffer → higher f: f_stiff={:.4} > f_normal={:.4}", f_stiff, f_normal);

    // Ratio should be roughly √4 = 2 (for a simple system)
    let ratio = f_stiff / f_normal;
    assert!(ratio > 1.5 && ratio < 3.0,
        "Stiffness ratio: {:.3}, expected ~2.0", ratio);
}

// ================================================================
// 6. Heavier Structure → Lower Frequency
// ================================================================
//
// Increasing mass (density) should decrease natural frequency.
// f ∝ 1/√(m), so doubling mass → f decreases by √2.

#[test]
fn validation_seismic_mass_frequency() {
    let h = 4.0;
    let w = 6.0;

    let get_f1 = |density: f64| -> f64 {
        let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), density);
        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        modal_res.modes[0].frequency
    };

    let f_light = get_f1(7850.0);
    let f_heavy = get_f1(7850.0 * 4.0);

    // Heavier should have lower frequency
    assert!(f_heavy < f_light,
        "Heavier → lower f: f_heavy={:.4} < f_light={:.4}", f_heavy, f_light);

    // Ratio should be roughly √4 = 2
    let ratio = f_light / f_heavy;
    assert!(ratio > 1.5 && ratio < 3.0,
        "Mass ratio: {:.3}, expected ~2.0", ratio);
}

// ================================================================
// 7. Multi-Story Frequencies: Decreasing Period
// ================================================================
//
// More stories → taller → more flexible → lower first frequency.

#[test]
fn validation_seismic_stories_frequency() {
    let h = 3.5;
    let w = 6.0;
    let density = 7850.0;

    let get_f1 = |n_stories: usize| -> f64 {
        let mut nodes = Vec::new();
        let mut node_id = 1;
        for i in 0..=n_stories {
            nodes.push((node_id, 0.0, i as f64 * h));
            node_id += 1;
            nodes.push((node_id, w, i as f64 * h));
            node_id += 1;
        }
        let mut elems = Vec::new();
        let mut elem_id = 1;
        for i in 0..n_stories {
            let bl = 2 * i + 1;
            let tl = 2 * (i + 1) + 1;
            let br = 2 * i + 2;
            let tr = 2 * (i + 1) + 2;
            elems.push((elem_id, "frame", bl, tl, 1, 1, false, false)); elem_id += 1;
            elems.push((elem_id, "frame", br, tr, 1, 1, false, false)); elem_id += 1;
            elems.push((elem_id, "frame", tl, tr, 1, 1, false, false)); elem_id += 1;
        }
        let sups = vec![(1, 1_usize, "fixed"), (2, 2, "fixed")];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), density);
        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        modal_res.modes[0].frequency
    };

    let f1_1story = get_f1(1);
    let f1_2story = get_f1(2);
    let f1_3story = get_f1(3);

    // More stories → lower frequency (taller = more flexible)
    assert!(f1_1story > f1_2story,
        "1 story > 2 story freq: {:.4} > {:.4}", f1_1story, f1_2story);
    assert!(f1_2story > f1_3story,
        "2 story > 3 story freq: {:.4} > {:.4}", f1_2story, f1_3story);
}

// ================================================================
// 8. Overturning Moment Check
// ================================================================
//
// Under lateral forces, the base moment = sum of (Fi × hi).
// Reactions must provide this overturning resistance.

#[test]
fn validation_seismic_overturning() {
    let h = 3.5;
    let w = 6.0;
    let f1 = 5.0;
    let f2 = 10.0;

    // Two-story frame
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Applied overturning moment about base: M = F1×h + F2×2h
    let m_applied = f1 * h + f2 * 2.0 * h;

    // Resisting moment from reactions: M1 + M4 + Ry4 × w + Rx_total × 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Full moment equilibrium about origin:
    // Applied moments (lateral forces × heights) + reaction moments + reaction forces × arms = 0
    // -F1×h - F2×2h + M1 + M4 + Ry4×w = 0
    let m_resisting = r1.my + r4.my + r4.rz * w;
    let err = (m_resisting - m_applied).abs() / m_applied;
    assert!(err < 0.02,
        "Overturning: M_resist={:.4}, M_applied={:.4}", m_resisting, m_applied);
}
