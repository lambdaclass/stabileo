/// Validation: Wind Load Analysis on Frames
///
/// References:
///   - ASCE 7-22, Chapter 27 (Wind Loads on Buildings)
///   - Eurocode 1, Part 1-4 (Wind Actions)
///   - Taranath, "Wind and Earthquake Resistant Buildings", Ch. 3
///
/// Tests verify structural response to wind-type loading patterns:
///   1. Uniform wind pressure: base shear and overturning moment
///   2. Triangular wind profile (increasing with height)
///   3. Windward/leeward combined pressure
///   4. Multi-story uniform wind: story shear accumulation
///   5. Wind suction on roof beam
///   6. Portal frame wind: moment distribution
///   7. Drift check under service wind
///   8. Wind + gravity combination
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Uniform Wind Pressure: Base Shear and Overturning
// ================================================================

#[test]
fn validation_wind_uniform_base_shear() {
    let h = 4.0;
    let n = 8;
    let w_pressure = 5.0; // kN/m wind pressure on column height

    // Cantilever column with uniform horizontal distributed load
    // Represent wind as distributed load on column elements
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w_pressure, q_j: w_pressure, a: None, b: None,
        }))
        .collect();

    // Build vertical cantilever column
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        let y = i as f64 * h / n as f64;
        nodes.push((i + 1, 0.0, y));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Base shear = w × H (total wind force)
    assert_close(r.rx.abs(), w_pressure * h, 0.02,
        "Wind uniform: base shear = w×H");

    // Overturning moment = w×H²/2
    assert_close(r.my.abs(), w_pressure * h * h / 2.0, 0.02,
        "Wind uniform: M_base = wH²/2");
}

// ================================================================
// 2. Triangular Wind Profile (Increasing with Height)
// ================================================================

#[test]
fn validation_wind_triangular_profile() {
    let h = 6.0;
    let n = 12;
    let w_max = 10.0; // kN/m at top

    // Wind pressure increases linearly: 0 at base, w_max at top
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let y_i = (i - 1) as f64 / n as f64;
            let y_j = i as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: w_max * y_i, q_j: w_max * y_j,
                a: None, b: None,
            })
        })
        .collect();

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        let y = i as f64 * h / n as f64;
        nodes.push((i + 1, 0.0, y));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Total wind force = w_max × H / 2 (triangle area)
    assert_close(r.rx.abs(), w_max * h / 2.0, 0.02,
        "Wind triangular: base shear = wH/2");

    // Overturning moment = w_max × H² / 3 × (H/2) = w_max × H² / 6
    // Wait: for triangular load: M = ∫₀ᴴ w(y)×y dy = ∫₀ᴴ (w_max×y/H)×y dy = w_max×H²/3
    assert_close(r.my.abs(), w_max * h * h / 3.0, 0.02,
        "Wind triangular: M_base = wH²/3");
}

// ================================================================
// 3. Windward + Leeward Combined Pressure
// ================================================================

#[test]
fn validation_wind_windward_leeward() {
    let w = 8.0;
    let h = 4.0;
    let pw = 6.0;  // windward pressure (positive = pushing)
    let pl: f64 = -3.0; // leeward suction (negative = pulling)

    // Portal frame: wind on left column (push), suction on right column (pull)
    // Both act in the same direction of drift
    let n_col: usize = 4;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut eid: usize = 1;

    // Left column nodes
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, i as f64 * h / n_col as f64));
        if i > 0 {
            elems.push((eid, "frame", i, i + 1, 1, 1, false, false));
            eid += 1;
        }
    }
    // Right column nodes
    for i in 0..=n_col {
        let nid = n_col + 2 + i;
        nodes.push((nid, w, i as f64 * h / n_col as f64));
        if i > 0 {
            elems.push((eid, "frame", nid - 1, nid, 1, 1, false, false));
            eid += 1;
        }
    }
    // Beam
    let left_top = n_col + 1;
    let right_top = 2 * n_col + 2;
    elems.push((eid, "frame", left_top, right_top, 1, 1, false, false));

    // Wind loads
    let pl_abs: f64 = pl.abs();
    let mut loads = Vec::new();
    for i in 1..=n_col {
        // Windward (positive x on left column)
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: pw, q_j: pw, a: None, b: None,
        }));
    }
    for i in 1..=n_col {
        // Leeward suction on right column also acts in +x direction (same as wind)
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: n_col + i, q_i: pl_abs, q_j: pl_abs, a: None, b: None,
        }));
    }

    let sups = vec![(1, 1, "fixed"), (2, n_col + 2, "fixed")];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear = (pw + |pl|) × H
    let total_wind = (pw + pl_abs) * h;
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, total_wind, 0.05,
        "Wind W+L: base shear = (pw+pl)×H");
}

// ================================================================
// 4. Multi-Story: Story Shear Accumulation
// ================================================================

#[test]
fn validation_wind_multi_story_shear() {
    let w = 6.0;
    let h = 3.5;
    let f1 = 8.0;
    let f2 = 10.0;
    let f3 = 12.0;

    // 3-story portal with wind loads at each floor
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut sups = Vec::new();
    let mut eid = 1;

    // Build 3-story, single-bay frame
    nodes.push((1, 0.0, 0.0));
    nodes.push((2, w, 0.0));
    sups.push((1, 1, "fixed"));
    sups.push((2, 2, "fixed"));

    for story in 1..=3_usize {
        let y = story as f64 * h;
        let left = 2 * story + 1;
        let right = 2 * story + 2;
        nodes.push((left, 0.0, y));
        nodes.push((right, w, y));
        let bl = if story == 1 { 1 } else { 2 * (story - 1) + 1 };
        let br = if story == 1 { 2 } else { 2 * (story - 1) + 2 };
        elems.push((eid, "frame", bl, left, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", br, right, 1, 1, false, false)); eid += 1;
        elems.push((eid, "frame", left, right, 1, 1, false, false)); eid += 1;
    }

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f2, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: f3, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base shear = F1 + F2 + F3
    let base_shear: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(base_shear, f1 + f2 + f3, 0.02,
        "Wind multi-story: base shear = ΣFi");
}

// ================================================================
// 5. Wind Suction on Roof Beam
// ================================================================

#[test]
fn validation_wind_suction_roof() {
    let w = 8.0;
    let h = 4.0;
    let q_suction = 3.0; // upward suction on roof

    // Portal frame with upward load on beam (wind suction)
    let n_beam = 8;
    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    let mut eid = 1;

    // Left column
    nodes.push((1, 0.0, 0.0));
    nodes.push((2, 0.0, h));
    elems.push((eid, "frame", 1, 2, 1, 1, false, false)); eid += 1;

    // Beam nodes
    for i in 1..=n_beam {
        let x = i as f64 * w / (n_beam + 1) as f64;
        nodes.push((2 + i, x, h));
        if i == 1 {
            elems.push((eid, "frame", 2, 3, 1, 1, false, false)); eid += 1;
        } else {
            elems.push((eid, "frame", 1 + i, 2 + i, 1, 1, false, false)); eid += 1;
        }
    }

    // Right column
    let right_top = 2 + n_beam + 1;
    nodes.push((right_top, w, h));
    nodes.push((right_top + 1, w, 0.0));
    elems.push((eid, "frame", 2 + n_beam, right_top, 1, 1, false, false)); eid += 1;
    elems.push((eid, "frame", right_top + 1, right_top, 1, 1, false, false));

    // Upward distributed load on beam elements
    let mut loads = Vec::new();
    for i in 2..=(n_beam + 1) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_suction, q_j: q_suction, a: None, b: None,
        }));
    }

    let sups = vec![(1, 1, "fixed"), (2, right_top + 1, "fixed")];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total upward force = q × w (approximately)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let total_suction = q_suction * w * n_beam as f64 / (n_beam + 1) as f64;
    assert_close(sum_ry.abs(), total_suction, 0.10,
        "Wind suction: ΣRy ≈ q×w");

    // Reactions should be downward (negative) for upward suction
    assert!(sum_ry < 0.0, "Wind suction: reactions are downward");
}

// ================================================================
// 6. Portal Frame Wind: Moment Distribution
// ================================================================

#[test]
fn validation_wind_portal_moments() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // For portal under lateral load:
    // Column moments at base should be non-zero (fixed supports)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert!(r1.my.abs() > 0.0, "Wind portal: M1 ≠ 0");
    assert!(r4.my.abs() > 0.0, "Wind portal: M4 ≠ 0");

    // Global moment equilibrium about node 1 base
    let m_overturn = f * h;
    let m_resist = r1.my + r4.my + r4.rz * w;
    assert_close(m_resist.abs(), m_overturn, 0.05,
        "Wind portal: moment equilibrium");
}

// ================================================================
// 7. Drift Check Under Service Wind
// ================================================================

#[test]
fn validation_wind_drift_check() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Portal frame drift should increase with height, decrease with stiffness
    let input1 = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Double the height → much more drift
    let input2 = make_portal_frame(2.0 * h, w, E, A, IZ, f, 0.0);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(d2 > d1 * 2.0,
        "Wind drift: double height > 2× drift: {:.6e} > {:.6e}", d2, 2.0 * d1);

    // Drift ratio = δ/H, should be finite
    let drift_ratio = d1 / h;
    assert!(drift_ratio > 0.0 && drift_ratio < 1.0,
        "Wind drift ratio reasonable: {:.6e}", drift_ratio);
}

// ================================================================
// 8. Wind + Gravity Combination
// ================================================================

#[test]
fn validation_wind_gravity_combination() {
    let h = 4.0;
    let w = 6.0;
    let f_wind = 8.0;
    let f_grav = -15.0; // downward (negative y)

    // Portal frame with combined wind + gravity
    let input = make_portal_frame(h, w, E, A, IZ, f_wind, f_grav);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: ΣRx = -F_wind
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_wind, 0.02, "W+G: ΣRx = -F_wind");

    // Vertical equilibrium: ΣRy = -2×f_grav (reactions balance applied load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -2.0 * f_grav, 0.02, "W+G: ΣRy = -2×F_grav");

    // Combined drift should be same as wind-only drift
    // (gravity on vertical frame doesn't cause lateral drift without P-delta)
    let input_wind = make_portal_frame(h, w, E, A, IZ, f_wind, 0.0);
    let d_wind = linear::solve_2d(&input_wind).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_combined = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // In linear analysis (no P-delta), gravity shouldn't change lateral drift much
    assert_close(d_combined, d_wind, 0.10,
        "W+G: lateral drift ≈ wind-only drift");
}
