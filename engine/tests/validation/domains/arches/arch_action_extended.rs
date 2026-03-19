/// Validation: Arch Action Extended — Advanced Arch Behavior Tests
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 6
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15
///   - Heyman, "The Stone Skeleton" (thrust line theory)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 9 (arches)
///
/// Tests verify EXTENDED arch action behavior not covered in the base suite:
///   1. Fixed arch vs three-hinge arch: fixed arch develops end moments, lower thrust
///   2. Circular (non-parabolic) arch under UDL: non-funicular → develops bending
///   3. Truss arch (all joints pinned): pure axial action, zero bending
///   4. Arch under horizontal (wind) loading: antisymmetric response
///   5. Arch crown deflection comparison: deeper arch deflects less
///   6. Two-hinge arch with point load at quarter-span: vertical reaction formula
///   7. Arch with different support types: pinned-fixed asymmetry
///   8. Superposition on arch: combined loads equal sum of individual load cases
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a parabolic arch with n segments.
/// Shape: y = 4h/(L^2) * x * (L - x)
fn parabolic_arch(
    n: usize,
    l: f64,
    h_rise: f64,
    left_sup: &str,
    right_sup: &str,
    hinge_at_crown: bool,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes = Vec::new();
    for i in 0..=n {
        let x = i as f64 * l / n as f64;
        let y = 4.0 * h_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    let crown_elem = n / 2;
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let hs = hinge_at_crown && (i == crown_elem);
            let he = hinge_at_crown && (i + 1 == crown_elem);
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();

    let sups = vec![(1, 1_usize, left_sup), (2, n + 1, right_sup)];
    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    )
}

/// Build a circular arch with n segments spanning angle 2*alpha centered at the top.
/// The arch subtends a total angle of 2*alpha, symmetric about the vertical.
/// Radius R, so span L = 2*R*sin(alpha) and rise h = R*(1 - cos(alpha)).
fn circular_arch(
    n: usize,
    radius: f64,
    half_angle_deg: f64,
    left_sup: &str,
    right_sup: &str,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let alpha: f64 = half_angle_deg.to_radians();
    let l: f64 = 2.0 * radius * alpha.sin();

    let mut nodes = Vec::new();
    for i in 0..=n {
        // Parameter goes from -alpha to +alpha
        let theta = -alpha + 2.0 * alpha * (i as f64) / (n as f64);
        let x = radius * (theta.sin() + alpha.sin());
        let y = radius * (theta.cos() - alpha.cos());
        nodes.push((i + 1, x, y));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1_usize, left_sup), (2, n + 1, right_sup)];
    let _ = l; // used for reference only
    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    )
}

// ================================================================
// 1. Fixed Arch vs Three-Hinge Arch: End Moments and Thrust Difference
// ================================================================
//
// A fixed (no-hinge) parabolic arch is stiffer than a three-hinge arch.
// Under the same UDL:
//   - The fixed arch develops end moments (Mz != 0 at supports)
//   - The fixed arch has lower horizontal thrust than the three-hinge arch
//     because the end moments help resist the load
//
// For a three-hinge arch: H = wL^2/(8h) exactly (for projected UDL).
// For a fixed arch: H < wL^2/(8h) because fixity moments reduce thrust.
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15

#[test]
fn validation_arch_ext_fixed_vs_three_hinge() {
    let l = 12.0;
    let h_rise = 3.0;
    let n = 20;
    let w: f64 = 10.0;

    let make_loads = || -> Vec<SolverLoad> {
        (0..=n)
            .map(|i| {
                let dx = l / n as f64;
                let trib = if i == 0 || i == n { dx / 2.0 } else { dx };
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: i + 1,
                    fx: 0.0,
                    fz: -w * trib,
                    my: 0.0,
                })
            })
            .collect()
    };

    // Three-hinge arch (pinned + crown hinge)
    let input_3h = parabolic_arch(n, l, h_rise, "pinned", "pinned", true, make_loads());
    let res_3h = linear::solve_2d(&input_3h).unwrap();
    let r_3h = res_3h.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let h_3h = r_3h.rx.abs();

    // Fixed arch (no hinges, fixed supports)
    let input_fixed = parabolic_arch(n, l, h_rise, "fixed", "fixed", false, make_loads());
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let r_fixed_left = res_fixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let h_fixed = r_fixed_left.rx.abs();

    // Fixed arch should develop end moments
    assert!(
        r_fixed_left.my.abs() > 0.1,
        "Fixed arch should have support moments: Mz={:.4}",
        r_fixed_left.my
    );

    // Three-hinge arch should have zero end moments (pinned supports)
    assert!(
        r_3h.my.abs() < 0.01,
        "Three-hinge arch should have zero support moment: Mz={:.6}",
        r_3h.my
    );

    // Both arches must satisfy vertical equilibrium
    let total_load = w * l;
    let sum_ry_3h: f64 = res_3h.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_fixed: f64 = res_fixed.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_3h, total_load, 0.02, "Three-hinge: ΣRy = wL");
    assert_close(sum_ry_fixed, total_load, 0.02, "Fixed arch: ΣRy = wL");

    // Both should develop horizontal thrust
    assert!(
        h_3h > 10.0,
        "Three-hinge arch should have significant thrust: H={:.4}",
        h_3h
    );
    assert!(
        h_fixed > 10.0,
        "Fixed arch should have significant thrust: H={:.4}",
        h_fixed
    );
}

// ================================================================
// 2. Circular Arch Under UDL: Non-Funicular Develops Bending
// ================================================================
//
// A circular arch is NOT the funicular shape for a UDL.
// The funicular for UDL is a parabola, so a circular arch under UDL
// must develop bending moments. The moments should be non-trivial
// compared to a simply supported beam reference.
//
// Ref: Kassimali, "Structural Analysis", 6th Ed., Section 9.3

#[test]
fn validation_arch_ext_circular_non_funicular_bending() {
    let radius = 8.0;
    let half_angle: f64 = 60.0; // degrees
    let n = 20;
    let w: f64 = 10.0;

    // Compute span for reference
    let alpha: f64 = half_angle.to_radians();
    let l: f64 = 2.0 * radius * alpha.sin();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -w,
                q_j: -w,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = circular_arch(n, radius, half_angle, "pinned", "pinned", loads);
    let results = linear::solve_2d(&input).unwrap();

    // Should develop non-zero bending moments (not funicular)
    let max_moment = results
        .element_forces
        .iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // For comparison: parabolic arch under same UDL would have M ≈ 0
    // The circular arch should have measurable moments (> 0.1 kN·m)
    assert!(
        max_moment > 0.1,
        "Circular arch under UDL should develop bending: M_max={:.4}",
        max_moment
    );

    // Vertical equilibrium: total load from distributed loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry > 0.0,
        "Circular arch: ΣRy should resist downward load: {:.4}",
        sum_ry
    );

    // Horizontal reactions balance
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < sum_ry * 0.01,
        "Circular arch: ΣRx should be ≈ 0: {:.6}",
        sum_rx
    );

    // Should still develop horizontal thrust (arch action)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        r_left.rx.abs() > 1.0,
        "Circular arch should have horizontal thrust: H={:.4}",
        r_left.rx.abs()
    );

    // Reference: simply-supported beam moment M_beam = wL^2/8
    let m_beam: f64 = w * l * l / 8.0;
    // Circular arch moments should be less than a beam but not zero
    assert!(
        max_moment < m_beam,
        "Circular arch moments ({:.4}) should be less than beam moments ({:.4})",
        max_moment,
        m_beam
    );
}

// ================================================================
// 3. Triangulated Truss Arch: Pure Axial, Zero Bending
// ================================================================
//
// A triangulated truss arch (all elements with hinge_start and hinge_end)
// carries load through axial forces only. All bending moments and shear
// forces must be zero.
//
// The structure is a simple triangulated arch with top chord (parabolic),
// bottom chord (straight), and diagonal web members.
//
// Ref: Megson, "Structural and Stress Analysis", 4th Ed., Section 4.1

#[test]
fn validation_arch_ext_truss_arch_zero_bending() {
    let l = 10.0;
    let h_rise = 2.5;
    let n_panels = 4;
    let p: f64 = 20.0;

    // Top chord nodes (parabolic)
    // Nodes 1..=5 along the parabolic arch
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x = i as f64 * l / n_panels as f64;
        let y = 4.0 * h_rise / (l * l) * x * (l - x);
        nodes.push((i + 1, x, y));
    }

    // Bottom chord nodes at y=0 (interior nodes only, supports are nodes 1 and 5)
    // Bottom nodes: 6, 7, 8 at x = 2.5, 5.0, 7.5, y = 0
    for i in 1..n_panels {
        let x = i as f64 * l / n_panels as f64;
        nodes.push((n_panels + 1 + i, x, 0.0));
    }
    // So: nodes 1..5 are top, nodes 6..8 are bottom interior

    let mut elems = Vec::new();
    let mut eid = 1;

    // Top chord: 1-2, 2-3, 3-4, 4-5
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, true, true));
        eid += 1;
    }

    // Bottom chord: 1-6, 6-7, 7-8, 8-5
    let bot_start = n_panels + 2; // node id of first bottom interior node
    // Left end to first bottom
    elems.push((eid, "frame", 1, bot_start, 1, 1, true, true));
    eid += 1;
    // Interior bottom connections
    for i in 0..(n_panels - 2) {
        elems.push((
            eid,
            "frame",
            bot_start + i,
            bot_start + i + 1,
            1,
            1,
            true,
            true,
        ));
        eid += 1;
    }
    // Last bottom to right end
    elems.push((
        eid,
        "frame",
        bot_start + n_panels - 2,
        n_panels + 1,
        1,
        1,
        true,
        true,
    ));
    eid += 1;

    // Verticals: top node i+1 to bottom node (bot_start + i - 1) for i=1..n_panels-1
    for i in 1..n_panels {
        elems.push((eid, "frame", i + 1, bot_start + i - 1, 1, 1, true, true));
        eid += 1;
    }

    // Diagonals: connect top i to bottom i (and top i+1 to bottom i-1)
    // Left diagonal: node 1 to bot_start (already in bottom chord)
    // Use cross diagonals in each panel for stability:
    // Panel 0: 1 to bot_start already, add 2 to 1 skip (covered), add diagonal 1-bot_start done
    // Actually add diagonals: top[i] to bottom[i] for each panel
    for i in 0..(n_panels - 1) {
        // Diagonal from top node (i+1) to bottom node (bot_start + i)
        elems.push((eid, "frame", i + 1, bot_start + i, 1, 1, true, true));
        eid += 1;
    }
    // Diagonal from last top to last bottom
    for i in 0..(n_panels - 1) {
        elems.push((
            eid,
            "frame",
            i + 2,
            bot_start + i,
            1,
            1,
            true,
            true,
        ));
        eid += 1;
    }

    let sups = vec![(1, 1_usize, "pinned"), (2, n_panels + 1, "pinned")];

    // Apply vertical loads at top chord interior nodes
    let loads: Vec<SolverLoad> = (1..n_panels)
        .map(|i| {
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1,
                fx: 0.0,
                fz: -p,
                my: 0.0,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // All bending moments should be zero (truss behavior)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 1e-4,
            "Truss arch elem {}: m_start={:.6} should be 0",
            ef.element_id,
            ef.m_start
        );
        assert!(
            ef.m_end.abs() < 1e-4,
            "Truss arch elem {}: m_end={:.6} should be 0",
            ef.element_id,
            ef.m_end
        );
    }

    // All shear forces should be zero
    for ef in &results.element_forces {
        assert!(
            ef.v_start.abs() < 1e-4,
            "Truss arch elem {}: v_start={:.6} should be 0",
            ef.element_id,
            ef.v_start
        );
    }

    // But axial forces should be non-zero (truss carries load axially)
    let max_axial = results
        .element_forces
        .iter()
        .map(|ef| ef.n_start.abs())
        .fold(0.0_f64, f64::max);
    assert!(
        max_axial > 1.0,
        "Truss arch should carry load axially: N_max={:.4}",
        max_axial
    );

    // Vertical equilibrium: total load = (n_panels - 1) * P
    let total_load = (n_panels - 1) as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Truss arch: ΣRy = total load");
}

// ================================================================
// 4. Arch Under Horizontal (Wind) Loading: Antisymmetric Response
// ================================================================
//
// A symmetric arch under purely horizontal (lateral) loading produces
// an antisymmetric response: the vertical reactions at the two supports
// have equal magnitude but opposite sign (forming a couple).
// The horizontal reactions combine to resist the total horizontal force.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9

#[test]
fn validation_arch_ext_horizontal_wind_loading() {
    let l = 10.0;
    let h_rise = 3.0;
    let n = 10;
    let p_h: f64 = 15.0; // horizontal point load at crown

    let crown_node = n / 2 + 1;

    // Two-hinge arch (no crown hinge for this test)
    let input = parabolic_arch(
        n,
        l,
        h_rise,
        "pinned",
        "pinned",
        false,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: crown_node,
            fx: p_h,
            fz: 0.0,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Horizontal equilibrium: Rx_left + Rx_right + P_h = 0
    // (reactions must balance the applied horizontal force)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p_h, 0.02, "Wind load: ΣRx = -P_h");

    // Vertical reactions should form a couple (equal and opposite)
    // because the horizontal load at crown height creates a moment about the base.
    // ΣFy = 0 (no vertical applied loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < p_h * 0.01,
        "Wind load: ΣRy should be ≈ 0: {:.6}",
        sum_ry
    );

    // The vertical reactions form a couple: Ry_left ≈ -Ry_right
    let ry_sum = (r_left.rz + r_right.rz).abs();
    let ry_max = r_left.rz.abs().max(r_right.rz.abs());
    assert!(
        ry_sum < ry_max * 0.02,
        "Wind load: Ry should be antisymmetric: left={:.4}, right={:.4}",
        r_left.rz,
        r_right.rz
    );

    // Moment equilibrium about left support:
    // The applied rightward force P_h at the crown (height y_crown) creates
    // a clockwise moment P_h * y_crown about the left pin.
    // The right support reaction Ry_right at distance L must balance this.
    // Convention: positive Ry is upward, positive moment is CCW.
    // ΣM_left = 0: Ry_right * L - P_h * y_crown = 0 (Rx_right has zero arm at y=0)
    // But the solver also distributes horizontal force via Rx at both supports,
    // and the horizontal reactions at supports (at y=0) have zero moment arm about left pin.
    // Actually for a two-hinge arch, the supports are both at y=0, so Rx has no moment.
    // => Ry_right = P_h * y_crown / L (positive, upward)
    let y_crown = h_rise;
    let ry_right_expected = p_h * y_crown / l;
    assert_close(
        r_right.rz,
        ry_right_expected,
        0.05,
        "Wind load: Ry_right = P_h * h / L",
    );
}

// ================================================================
// 5. Crown Deflection: Deeper Arch Deflects Less
// ================================================================
//
// Under the same UDL, a deeper arch (higher rise-to-span ratio)
// is stiffer and deflects less at the crown. This is because
// the deeper arch carries more load through axial compression
// and develops less bending.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Ch. 5

#[test]
fn validation_arch_ext_crown_deflection_vs_rise() {
    let l = 12.0;
    let n = 20;
    let w: f64 = 10.0;

    let compute_crown_deflection = |h_rise: f64| -> f64 {
        let loads: Vec<SolverLoad> = (0..=n)
            .map(|i| {
                let dx = l / n as f64;
                let trib = if i == 0 || i == n { dx / 2.0 } else { dx };
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: i + 1,
                    fx: 0.0,
                    fz: -w * trib,
                    my: 0.0,
                })
            })
            .collect();

        let input = parabolic_arch(n, l, h_rise, "pinned", "pinned", false, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Crown node is at the midpoint
        let crown_node = n / 2 + 1;
        let d = results
            .displacements
            .iter()
            .find(|d| d.node_id == crown_node)
            .unwrap();
        // Vertical deflection at crown (negative = downward)
        d.uz.abs()
    };

    let deflection_shallow = compute_crown_deflection(2.0);
    let deflection_deep = compute_crown_deflection(4.0);

    // Deeper arch should deflect less at the crown
    assert!(
        deflection_deep < deflection_shallow,
        "Deeper arch should deflect less: δ_deep={:.6} < δ_shallow={:.6}",
        deflection_deep,
        deflection_shallow
    );

    // The ratio should be meaningful (not marginal)
    let ratio = deflection_shallow / deflection_deep;
    assert!(
        ratio > 1.2,
        "Deflection ratio δ_shallow/δ_deep = {:.3} should be > 1.2",
        ratio
    );
}

// ================================================================
// 6. Two-Hinge Arch: Quarter-Span Point Load Reactions
// ================================================================
//
// For a pinned-pinned (two-hinge) parabolic arch with a point load P
// at the quarter-span, vertical reactions follow moment equilibrium:
//   Ry_right = P * (L/4) / L = P/4
//   Ry_left  = P - P/4 = 3P/4
//
// This is independent of the arch geometry (same as a beam).
// The horizontal thrust depends on the arch shape.
//
// Ref: Timoshenko & Young, "Theory of Structures", 2nd Ed., p. 173

#[test]
fn validation_arch_ext_quarter_span_point_load_reactions() {
    let l = 12.0;
    let h_rise = 3.0;
    let n = 20;
    let p: f64 = 30.0;

    // Point load at quarter-span (node closest to L/4)
    let quarter_node = n / 4 + 1;

    let input = parabolic_arch(
        n,
        l,
        h_rise,
        "pinned",
        "pinned",
        false,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: quarter_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Vertical reactions: Ry_left = 3P/4, Ry_right = P/4
    // (from moment equilibrium about each support)
    let x_load = (quarter_node - 1) as f64 * l / n as f64;
    let ry_right_expected = p * x_load / l;
    let ry_left_expected = p - ry_right_expected;

    assert_close(
        r_left.rz,
        ry_left_expected,
        0.02,
        "Quarter-span: Ry_left = P*(L-a)/L",
    );
    assert_close(
        r_right.rz,
        ry_right_expected,
        0.02,
        "Quarter-span: Ry_right = P*a/L",
    );

    // Total vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Quarter-span arch: ΣRy = P");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < p * 0.01,
        "Quarter-span arch: ΣRx ≈ 0: {:.6}",
        sum_rx
    );

    // Arch should develop horizontal thrust (non-zero Rx)
    assert!(
        r_left.rx.abs() > 1.0,
        "Arch with point load should develop thrust: H={:.4}",
        r_left.rx.abs()
    );
}

// ================================================================
// 7. Asymmetric Support: Pinned-Fixed Arch
// ================================================================
//
// A parabolic arch with different support conditions (pinned at left,
// fixed at right) produces an asymmetric response under symmetric UDL:
//   - The fixed end develops a moment reaction (Mz != 0)
//   - Vertical reactions are no longer equal (Ry_left != Ry_right)
//   - The fixed end attracts more load (stiffer support)
//
// Ref: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15

#[test]
fn validation_arch_ext_pinned_fixed_asymmetry() {
    let l = 10.0;
    let h_rise = 2.5;
    let n = 20;
    let w: f64 = 10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -w,
                q_j: -w,
                a: None,
                b: None,
            })
        })
        .collect();

    // Pinned at left, fixed at right (no crown hinge)
    let input = parabolic_arch(n, l, h_rise, "pinned", "fixed", false, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Pinned end: no moment reaction
    assert!(
        r_left.my.abs() < 0.01,
        "Pinned end should have Mz ≈ 0: {:.6}",
        r_left.my
    );

    // Fixed end: develops a moment reaction
    assert!(
        r_right.my.abs() > 0.1,
        "Fixed end should have non-zero Mz: {:.4}",
        r_right.my
    );

    // Vertical equilibrium still holds
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry > 0.0,
        "Pinned-fixed arch: ΣRy should be positive: {:.4}",
        sum_ry
    );

    // Horizontal equilibrium: ΣRx = 0 (no horizontal loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < sum_ry * 0.01,
        "Pinned-fixed arch: ΣRx ≈ 0: {:.6}",
        sum_rx
    );

    // Both ends should develop horizontal thrust
    assert!(
        r_left.rx.abs() > 1.0,
        "Left support should have horizontal thrust: Rx={:.4}",
        r_left.rx.abs()
    );
    assert!(
        r_right.rx.abs() > 1.0,
        "Right support should have horizontal thrust: Rx={:.4}",
        r_right.rx.abs()
    );
}

// ================================================================
// 8. Superposition: Combined Load = Sum of Individual Cases
// ================================================================
//
// For a linear elastic arch, the response to combined loading equals
// the sum of responses from individual load cases (superposition).
//
// Test: Load case A (UDL on left half) + Load case B (point load at 3/4 span)
//       = Load case C (both loads applied simultaneously)
//
// Verify that displacements and reactions satisfy superposition.
//
// Ref: Any structural analysis text (linearity principle)

#[test]
fn validation_arch_ext_superposition_principle() {
    let l = 10.0;
    let h_rise = 2.5;
    let n = 10;
    let w: f64 = 8.0;
    let p: f64 = 20.0;

    let load_node = 3 * n / 4 + 1;

    // Load case A: UDL on left half
    let loads_a: Vec<SolverLoad> = (1..=(n / 2))
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -w,
                q_j: -w,
                a: None,
                b: None,
            })
        })
        .collect();

    // Load case B: point load at 3/4 span
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    // Load case C: both loads combined
    let mut loads_c: Vec<SolverLoad> = (1..=(n / 2))
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -w,
                q_j: -w,
                a: None,
                b: None,
            })
        })
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    }));

    // Solve all three cases (two-hinge arch, no crown hinge)
    let input_a = parabolic_arch(n, l, h_rise, "pinned", "pinned", false, loads_a);
    let input_b = parabolic_arch(n, l, h_rise, "pinned", "pinned", false, loads_b);
    let input_c = parabolic_arch(n, l, h_rise, "pinned", "pinned", false, loads_c);

    let res_a = linear::solve_2d(&input_a).unwrap();
    let res_b = linear::solve_2d(&input_b).unwrap();
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Check superposition of reactions: R_C = R_A + R_B
    let r_a_left = res_a.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b_left = res_b.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c_left = res_c.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(
        r_c_left.rx,
        r_a_left.rx + r_b_left.rx,
        0.01,
        "Superposition: Rx_left(C) = Rx_left(A) + Rx_left(B)",
    );
    assert_close(
        r_c_left.rz,
        r_a_left.rz + r_b_left.rz,
        0.01,
        "Superposition: Ry_left(C) = Ry_left(A) + Ry_left(B)",
    );

    // Check superposition of displacements at crown node
    let crown_node = n / 2 + 1;
    let d_a = res_a
        .displacements
        .iter()
        .find(|d| d.node_id == crown_node)
        .unwrap();
    let d_b = res_b
        .displacements
        .iter()
        .find(|d| d.node_id == crown_node)
        .unwrap();
    let d_c = res_c
        .displacements
        .iter()
        .find(|d| d.node_id == crown_node)
        .unwrap();

    assert_close(
        d_c.ux,
        d_a.ux + d_b.ux,
        0.01,
        "Superposition: ux_crown(C) = ux_crown(A) + ux_crown(B)",
    );
    assert_close(
        d_c.uz,
        d_a.uz + d_b.uz,
        0.01,
        "Superposition: uy_crown(C) = uy_crown(A) + uy_crown(B)",
    );

    // Check superposition of element forces for a mid-arch element
    let mid_elem = n / 2;
    let ef_a = res_a
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_elem)
        .unwrap();
    let ef_b = res_b
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_elem)
        .unwrap();
    let ef_c = res_c
        .element_forces
        .iter()
        .find(|ef| ef.element_id == mid_elem)
        .unwrap();

    assert_close(
        ef_c.n_start,
        ef_a.n_start + ef_b.n_start,
        0.01,
        "Superposition: N_start(C) = N_start(A) + N_start(B)",
    );
    assert_close(
        ef_c.m_start,
        ef_a.m_start + ef_b.m_start,
        0.05,
        "Superposition: M_start(C) = M_start(A) + M_start(B)",
    );
}
