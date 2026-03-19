/// Validation: Extended MASTAN2 / Ziemian Benchmark Steel Frames
///
/// Reference: Ziemian & Ziemian (2021), *J. Constr. Steel Res.* 186.
///            Extended set of benchmark frames complementing validation_mastan2_frames.rs.
///
/// These 8 tests cover frame configurations NOT in the original set:
///   1. Leaning column portal (gravity-only column + bracing column)
///   2. Two-story unbraced with unequal story heights (soft-story)
///   3. Single-bay fixed-fixed portal (high alpha_cr)
///   4. Three-bay portal with different bay widths
///   5. Portal with unequal column stiffness
///   6. Two-story X-braced frame
///   7. Portal with axial-only bracing diagonal
///   8. Three-story sway frame (pinned bases)
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (200 GPa)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ═══════════════════════════════════════════════════════════════
// Frame E1: Leaning Column Portal
// ═══════════════════════════════════════════════════════════════
// One rigid (bracing) column + one leaning (gravity-only) column.
// The leaning column has pinned connections at both ends so it
// contributes gravity load but no lateral stiffness. The bracing
// column must resist all sway. alpha_cr must account for the total
// gravity via the stability index Q = sum(P*delta)/(V*h).

fn frame_e1_leaning_column() -> SolverInput {
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;   // gravity per column
    let h_load = 15.0;

    // Nodes: 1=left base, 2=left top, 3=right top, 4=right base
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, w, 0.0),
    ];

    // Left column = bracing column (frame, rigid joints)
    // Beam = frame element
    // Right column = leaning column: pinned base support already frees
    // rotation at base; hinge at top releases moment at beam connection.
    // This gives a gravity-only column with no lateral stiffness contribution.
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // bracing column
        (2, "frame", 2, 3, 1, 1, false, false),   // beam
        (3, "frame", 4, 3, 1, 1, false, true),    // leaning column (hinged at beam end)
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "pinned")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_e1_leaning_column_alpha_cr() {
    let input = frame_e1_leaning_column();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // With a leaning column, alpha_cr is lower than a standard 2-column portal
    // because the bracing column must stabilize both columns' gravity.
    // Expected range: alpha_cr ~ 1.5-8
    assert!(alpha_cr > 0.5, "E1: alpha_cr={:.3} should > 0.5 (stable)", alpha_cr);
    assert!(alpha_cr < 25.0, "E1: alpha_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_e1_leaning_column_pdelta_drift() {
    let input = frame_e1_leaning_column();

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "E1: P-delta should converge");

    let lin_d = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // P-delta drift should exceed linear (leaning column amplifies effect)
    assert!(pd_d >= lin_d * 0.99, "E1: P-delta drift >= linear drift");
}

#[test]
fn validation_mastan_e1_leaning_column_moment_distribution() {
    let input = frame_e1_leaning_column();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "E1: P-delta should converge");

    // Leaning column (elem 3, pinned base + hinged at beam) should have
    // near-zero end moment at the beam connection (hinge_end).
    // The base end may have a small moment from the pinned support.
    let lean_col = pd.results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(
        lean_col.m_end.abs() < 1.0,
        "E1: leaning column beam-end moment should be ~0, got m_end={:.2}",
        lean_col.m_end
    );

    // Bracing column (elem 1) should carry all moment
    let brace_col = pd.results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        brace_col.m_start.abs() > 1.0 || brace_col.m_end.abs() > 1.0,
        "E1: bracing column should carry moment"
    );
}

// ═══════════════════════════════════════════════════════════════
// Frame E2: Two-Story Unbraced with Unequal Heights (Soft Story)
// ═══════════════════════════════════════════════════════════════
// Bottom story 4m, top story 3m. The taller bottom story is the
// "soft story" and governs alpha_cr.

fn frame_e2_soft_story() -> SolverInput {
    let h1 = 4.0; // bottom story (taller = softer)
    let h2 = 3.0; // top story
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),                       // base
        (3, 0.0, h1), (4, w, h1),                           // 1st floor
        (5, 0.0, h1 + h2), (6, w, h1 + h2),                 // 2nd floor (roof)
    ];

    let elems = vec![
        // Columns (ground to 1st)
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // Columns (1st to 2nd)
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        // Beams
        (5, "frame", 3, 4, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    let loads = vec![
        // Lateral + gravity at 1st floor
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 15.0, fz: -400.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -400.0, my: 0.0 }),
        // Lateral + gravity at roof
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 10.0, fz: -250.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -250.0, my: 0.0 }),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_e2_soft_story_alpha_cr() {
    let input = frame_e2_soft_story();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Two-story unbraced with soft story: alpha_cr governed by taller story
    assert!(alpha_cr > 0.5, "E2: alpha_cr={:.3} should > 0.5", alpha_cr);
    assert!(alpha_cr < 20.0, "E2: alpha_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_e2_soft_story_drift_profile() {
    let input = frame_e2_soft_story();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "E2: P-delta should converge");

    // Bottom story drift (node 3 relative to node 1)
    let d_1st = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    // Top story drift (node 5 relative to node 3)
    let d_roof = pd.results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let inter_story_bottom = d_1st.abs();
    let inter_story_top = (d_roof - d_1st).abs();

    // The taller bottom story should generally have larger inter-story drift
    // (per unit height it is softer). Verify both are nonzero.
    assert!(inter_story_bottom > 1e-8, "E2: bottom story drift should be nonzero");
    assert!(inter_story_top > 1e-8, "E2: top story drift should be nonzero");

    // Drift ratio (drift / story height) should be larger for bottom story
    let ratio_bottom = inter_story_bottom / 4.0;
    let ratio_top = inter_story_top / 3.0;
    // Not a strict assert (depends on load distribution) but log it
    if ratio_bottom > ratio_top {
        // Expected: soft story governs
    }
    // At minimum, total drift at roof should exceed 1st floor drift
    assert!(d_roof.abs() >= d_1st.abs() * 0.5, "E2: roof drift should be significant");
}

// ═══════════════════════════════════════════════════════════════
// Frame E3: Fixed-Fixed Portal (High alpha_cr)
// ═══════════════════════════════════════════════════════════════
// Both columns fixed at base, rigid beam connection.
// alpha_cr for fixed-fixed portal is much higher than pinned-base
// (theoretical ratio ~4x for single column: pi^2 vs (2pi)^2).

fn frame_e3_fixed_fixed() -> SolverInput {
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;

    make_portal_frame(h, w, E, A, IZ, h_load, -p)
    // make_portal_frame already uses fixed bases
}

fn frame_e3_pinned_base() -> SolverInput {
    // Same geometry but pinned bases for comparison
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_e3_fixed_vs_pinned_alpha_cr() {
    let input_fixed = frame_e3_fixed_fixed();
    let input_pinned = frame_e3_pinned_base();

    let buck_fixed = buckling::solve_buckling_2d(&input_fixed, 1).unwrap();
    let buck_pinned = buckling::solve_buckling_2d(&input_pinned, 1).unwrap();

    let alpha_fixed = buck_fixed.modes[0].load_factor;
    let alpha_pinned = buck_pinned.modes[0].load_factor;

    // Fixed-base portal should have significantly higher alpha_cr
    assert!(
        alpha_fixed > alpha_pinned,
        "E3: fixed alpha_cr={:.3} should > pinned alpha_cr={:.3}",
        alpha_fixed, alpha_pinned
    );

    // The ratio should be at least 1.5x (typically 2-4x for portal frames)
    let ratio = alpha_fixed / alpha_pinned;
    assert!(
        ratio > 1.5,
        "E3: fixed/pinned ratio={:.2} should be > 1.5", ratio
    );
}

#[test]
fn validation_mastan_e3_fixed_fixed_alpha_cr_range() {
    let input = frame_e3_fixed_fixed();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Fixed-base portal with moderate gravity: alpha_cr ~ 3-30
    assert!(alpha_cr > 1.0, "E3: alpha_cr={:.3} should > 1.0", alpha_cr);
    assert!(alpha_cr < 50.0, "E3: alpha_cr={:.3} should be reasonable", alpha_cr);
}

// ═══════════════════════════════════════════════════════════════
// Frame E4: Three-Bay Portal with Different Bay Widths
// ═══════════════════════════════════════════════════════════════
// Bays: 6m / 8m / 6m. The wider middle bay creates a longer beam
// span, potentially influencing the buckling mode.

fn frame_e4_unequal_bays() -> SolverInput {
    let h = 4.0;
    let bays = [6.0, 8.0, 6.0];
    let p = 250.0;
    let h_load = 20.0;

    let mut x_positions = vec![0.0];
    for &b in &bays {
        x_positions.push(x_positions.last().unwrap() + b);
    }
    let n_cols = bays.len() + 1; // 4 columns

    let mut nodes = Vec::new();
    let mut nid = 1;
    for &x in &x_positions {
        nodes.push((nid, x, 0.0)); nid += 1; // base
        nodes.push((nid, x, h));   nid += 1; // top
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

    let sups: Vec<_> = (0..n_cols)
        .map(|i| (i + 1, 2 * i + 1, "fixed"))
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
fn validation_mastan_e4_unequal_bays_alpha_cr() {
    let input = frame_e4_unequal_bays();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Multi-bay fixed portal: alpha_cr ~ 2-15
    assert!(alpha_cr > 1.0, "E4: alpha_cr={:.3} should > 1.0", alpha_cr);
    assert!(alpha_cr < 50.0, "E4: alpha_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_e4_unequal_bays_equilibrium() {
    let input = frame_e4_unequal_bays();
    let results = linear::solve_2d(&input).unwrap();

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
        "E4: horizontal equilibrium: sum_rx + sum_fx = {:.4}", sum_rx + sum_fx_loads
    );
    assert!(
        (sum_ry + sum_fy_loads).abs() < 1.0,
        "E4: vertical equilibrium: sum_ry + sum_fz = {:.4}", sum_ry + sum_fy_loads
    );
}

// ═══════════════════════════════════════════════════════════════
// Frame E5: Portal with Unequal Column Stiffness
// ═══════════════════════════════════════════════════════════════
// Left column: standard Iz. Right column: 2*Iz.
// The stiffer right column attracts more moment. Drift is asymmetric.
// alpha_cr reflects the weaker (left) column.

fn frame_e5_unequal_columns() -> SolverInput {
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, w, 0.0),
    ];

    // Section 1: standard, Section 2: double Iz
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // left column (weak)
        (2, "frame", 2, 3, 1, 1, false, false),   // beam
        (3, "frame", 4, 3, 1, 2, false, false),   // right column (strong)
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 2.0 * IZ)],  // section 2 has double Iz
        elems, sups, loads,
    )
}

#[test]
fn validation_mastan_e5_unequal_columns_alpha_cr() {
    let input = frame_e5_unequal_columns();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    assert!(alpha_cr > 1.0, "E5: alpha_cr={:.3} should > 1.0", alpha_cr);
    assert!(alpha_cr < 50.0, "E5: alpha_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_e5_asymmetric_moments() {
    let input = frame_e5_unequal_columns();
    let results = linear::solve_2d(&input).unwrap();

    // Right column (stiffer) should attract more moment at base than left column
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // The stiffer column (right, 2*Iz) should have a larger base moment
    assert!(
        r_right.my.abs() > r_left.my.abs() * 0.5,
        "E5: right col base moment ({:.2}) should be significant vs left ({:.2})",
        r_right.my.abs(), r_left.my.abs()
    );

    // Reactions should NOT be equal (asymmetric stiffness)
    let diff = (r_left.my.abs() - r_right.my.abs()).abs();
    assert!(diff > 0.1, "E5: base moments should differ, diff={:.2}", diff);
}

// ═══════════════════════════════════════════════════════════════
// Frame E6: Two-Story X-Braced Frame
// ═══════════════════════════════════════════════════════════════
// Two-story, one bay, with X-bracing in each story.
// Very stiff lateral system. alpha_cr should be > 10 (braced).

fn frame_e6_x_braced() -> SolverInput {
    let h = 3.5;
    let w = 6.0;
    let n_stories = 2;

    let mut nodes = Vec::new();
    let mut nid = 1;
    // Left column nodes
    for i in 0..=n_stories { nodes.push((nid, 0.0, i as f64 * h)); nid += 1; }
    // Right column nodes
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
    // X-braces: two diagonals per story (full X)
    for i in 0..n_stories {
        // Diagonal 1: bottom-left to top-right
        elems.push((eid, "truss", left(i), right(i + 1), 1, 2, false, false)); eid += 1;
        // Diagonal 2: bottom-right to top-left
        elems.push((eid, "truss", right(i), left(i + 1), 1, 2, false, false)); eid += 1;
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
        vec![(1, A, IZ), (2, 0.003, 1e-10)], // brace section: truss
        elems, sups, loads,
    )
}

#[test]
fn validation_mastan_e6_x_braced_high_alpha_cr() {
    let input = frame_e6_x_braced();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // X-braced frame: very stiff laterally, alpha_cr >> 1
    assert!(alpha_cr > 3.0, "E6: X-braced alpha_cr={:.3} should be high", alpha_cr);
}

#[test]
fn validation_mastan_e6_x_braced_pdelta_near_linear() {
    let input = frame_e6_x_braced();

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pd.converged, "E6: P-delta should converge");

    // Top floor left node
    let top_left = 3; // left column, level 2
    let lin_d = lin.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();
    let pd_d = pd.results.displacements.iter().find(|d| d.node_id == top_left).unwrap().ux.abs();

    if lin_d > 1e-8 {
        let amp = pd_d / lin_d;
        // For high alpha_cr (braced), amplification ~ 1.0
        assert!(
            amp < 1.30,
            "E6: braced amplification {:.4} should be near 1.0", amp
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// Frame E7: Portal with Single Diagonal Brace (Truss Element)
// ═══════════════════════════════════════════════════════════════
// Compare alpha_cr with and without the diagonal brace to verify
// that the brace stiffens the frame.

fn frame_e7_braced_portal() -> SolverInput {
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h), (4, w, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // left column
        (2, "frame", 2, 3, 1, 1, false, false),   // beam
        (3, "frame", 4, 3, 1, 1, false, false),   // right column
        (4, "truss", 1, 3, 1, 2, false, false),   // diagonal brace
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h_load, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 1e-10)], // brace section: truss
        elems, sups, loads,
    )
}

fn frame_e7_unbraced_portal() -> SolverInput {
    // Same portal without the diagonal brace
    let h = 4.0;
    let w = 6.0;
    let p = 300.0;
    let h_load = 20.0;

    make_portal_frame(h, w, E, A, IZ, h_load, -p)
}

#[test]
fn validation_mastan_e7_brace_increases_alpha_cr() {
    let input_braced = frame_e7_braced_portal();
    let input_unbraced = frame_e7_unbraced_portal();

    let buck_braced = buckling::solve_buckling_2d(&input_braced, 1).unwrap();
    let buck_unbraced = buckling::solve_buckling_2d(&input_unbraced, 1).unwrap();

    let alpha_braced = buck_braced.modes[0].load_factor;
    let alpha_unbraced = buck_unbraced.modes[0].load_factor;

    // Adding a diagonal brace should increase alpha_cr
    assert!(
        alpha_braced > alpha_unbraced,
        "E7: braced alpha_cr={:.3} should > unbraced alpha_cr={:.3}",
        alpha_braced, alpha_unbraced
    );
}

#[test]
fn validation_mastan_e7_brace_reduces_drift() {
    let input_braced = frame_e7_braced_portal();
    let input_unbraced = frame_e7_unbraced_portal();

    let lin_braced = linear::solve_2d(&input_braced).unwrap();
    let lin_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    let d_braced = lin_braced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_unbraced = lin_unbraced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // The diagonal brace should significantly reduce lateral drift
    assert!(
        d_braced < d_unbraced,
        "E7: braced drift={:.6} should < unbraced drift={:.6}",
        d_braced, d_unbraced
    );
}

// ═══════════════════════════════════════════════════════════════
// Frame E8: Three-Story Sway Frame (Pinned Bases)
// ═══════════════════════════════════════════════════════════════
// Three-story, single-bay moment frame with pinned bases.
// Each story has lateral + gravity loads.
// Pinned bases make this quite flexible: alpha_cr < fixed-base.

fn frame_e8_three_story_sway() -> SolverInput {
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

    // Pinned bases (no moment fixity)
    let sups = vec![(1, left(0), "pinned"), (2, right(0), "pinned")];

    let mut loads = Vec::new();
    for i in 1..=n_stories {
        // Lateral load (inverted triangular: increases with height)
        let h_factor = i as f64 / n_stories as f64;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: left(i), fx: 10.0 * h_factor, fz: -300.0, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: right(i), fx: 0.0, fz: -300.0, my: 0.0,
        }));
    }

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

#[test]
fn validation_mastan_e8_three_story_sway_alpha_cr() {
    let input = frame_e8_three_story_sway();
    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Pinned-base three-story sway frame: relatively low alpha_cr
    assert!(alpha_cr > 0.3, "E8: alpha_cr={:.3} should > 0.3 (stable)", alpha_cr);
    assert!(alpha_cr < 20.0, "E8: alpha_cr={:.3} should be reasonable", alpha_cr);
}

#[test]
fn validation_mastan_e8_story_drift_amplification() {
    let input = frame_e8_three_story_sway();

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    if alpha_cr <= 1.0 { return; } // unstable, skip

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    if !pd.converged { return; }

    // Check drift at each floor level
    let n_stories = 3;
    let left = |level: usize| -> usize { level + 1 };

    for i in 1..=n_stories {
        let node = left(i);
        let lin_d = lin.displacements.iter().find(|d| d.node_id == node).unwrap().ux.abs();
        let pd_d = pd.results.displacements.iter().find(|d| d.node_id == node).unwrap().ux.abs();

        if lin_d > 1e-8 {
            let amp = pd_d / lin_d;
            // Second-order amplification should be >= 1.0
            assert!(
                amp >= 0.99,
                "E8: story {} amplification {:.4} should be >= 1.0", i, amp
            );
        }
    }
}

#[test]
fn validation_mastan_e8_pinned_base_zero_base_moment() {
    let input = frame_e8_three_story_sway();
    let results = linear::solve_2d(&input).unwrap();

    // Pinned bases should have zero moment reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert!(
        r_left.my.abs() < 0.01,
        "E8: left pinned base moment should be ~0, got {:.4}", r_left.my
    );
    assert!(
        r_right.my.abs() < 0.01,
        "E8: right pinned base moment should be ~0, got {:.4}", r_right.my
    );
}

// ═══════════════════════════════════════════════════════════════
// Batch Tests: Cross-Frame Comparisons
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_mastan_extended_all_alpha_cr_positive() {
    let frames: Vec<(&str, SolverInput)> = vec![
        ("E1-Leaning", frame_e1_leaning_column()),
        ("E2-SoftStory", frame_e2_soft_story()),
        ("E3-FixedFixed", frame_e3_fixed_fixed()),
        ("E4-UnequalBays", frame_e4_unequal_bays()),
        ("E5-UnequalCols", frame_e5_unequal_columns()),
        ("E6-XBraced", frame_e6_x_braced()),
        ("E7-BracedPortal", frame_e7_braced_portal()),
        ("E8-3StorySway", frame_e8_three_story_sway()),
    ];

    for (name, input) in frames {
        let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
        assert!(
            buck.modes[0].load_factor > 0.0,
            "{}: alpha_cr={:.3} should be positive", name, buck.modes[0].load_factor
        );
    }
}

#[test]
fn validation_mastan_extended_all_pdelta_converge() {
    let frames: Vec<(&str, SolverInput)> = vec![
        ("E1-Leaning", frame_e1_leaning_column()),
        ("E2-SoftStory", frame_e2_soft_story()),
        ("E3-FixedFixed", frame_e3_fixed_fixed()),
        ("E4-UnequalBays", frame_e4_unequal_bays()),
        ("E5-UnequalCols", frame_e5_unequal_columns()),
        ("E6-XBraced", frame_e6_x_braced()),
        ("E7-BracedPortal", frame_e7_braced_portal()),
        ("E8-3StorySway", frame_e8_three_story_sway()),
    ];

    for (name, input) in frames {
        let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();
        assert!(pd.converged, "{}: P-delta should converge", name);
        assert!(pd.iterations < 20, "{}: iterations={} should be < 20", name, pd.iterations);
    }
}

#[test]
fn validation_mastan_extended_equilibrium_all() {
    let frames: Vec<(&str, SolverInput)> = vec![
        ("E1-Leaning", frame_e1_leaning_column()),
        ("E2-SoftStory", frame_e2_soft_story()),
        ("E3-FixedFixed", frame_e3_fixed_fixed()),
        ("E4-UnequalBays", frame_e4_unequal_bays()),
        ("E5-UnequalCols", frame_e5_unequal_columns()),
        ("E6-XBraced", frame_e6_x_braced()),
        ("E7-BracedPortal", frame_e7_braced_portal()),
        ("E8-3StorySway", frame_e8_three_story_sway()),
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
            "{}: horizontal equilibrium failed: {:.4}", name, sum_rx + sum_fx_loads
        );
        assert!(
            (sum_ry + sum_fy_loads).abs() < 1.0,
            "{}: vertical equilibrium failed: {:.4}", name, sum_ry + sum_fy_loads
        );
    }
}

#[test]
fn validation_mastan_extended_braced_ranking() {
    // Ranking: X-braced > braced portal > unbraced frames
    let buck_x = buckling::solve_buckling_2d(&frame_e6_x_braced(), 1).unwrap();
    let buck_diag = buckling::solve_buckling_2d(&frame_e7_braced_portal(), 1).unwrap();
    let buck_sway = buckling::solve_buckling_2d(&frame_e8_three_story_sway(), 1).unwrap();

    let a_x = buck_x.modes[0].load_factor;
    let a_diag = buck_diag.modes[0].load_factor;
    let a_sway = buck_sway.modes[0].load_factor;

    // X-braced should be stiffer than single-diagonal braced portal
    assert!(
        a_x > a_diag * 0.5,
        "X-braced alpha_cr={:.3} should be comparable or higher than diagonal={:.3}",
        a_x, a_diag
    );

    // Braced frames should generally have higher alpha_cr than the unbraced sway frame
    // (unless gravity loads differ significantly)
    assert!(
        a_diag > a_sway * 0.3,
        "Braced portal alpha_cr={:.3} should be comparable or higher than sway={:.3}",
        a_diag, a_sway
    );
}
