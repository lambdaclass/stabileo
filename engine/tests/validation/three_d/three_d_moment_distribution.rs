/// Validation: Moment Distribution in 3D Frames
///
/// References:
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", Dover, 1985, Ch. 6, 10
///   - McGuire, W., Gallagher, R.H. & Ziemian, R.D., "Matrix Structural Analysis",
///     2nd Ed., Wiley, 2000, Ch. 5-6
///   - Weaver, W. & Gere, J.M., "Matrix Analysis of Framed Structures",
///     3rd Ed., Van Nostrand, 1990, Ch. 8
///   - Timoshenko, S.P. & Goodier, J.N., "Theory of Elasticity", 3rd Ed., McGraw-Hill, 1970
///   - Kassimali, A., "Structural Analysis", 6th Ed., Ch. 12 (moment distribution)
///
/// Tests verify moment distribution behavior in 3D frame configurations:
///   1. T-junction: collinear Mz distribution — shorter arms carry more moment by stiffness
///   2. Cross junction: four equal collinear arms share moment equally by symmetry
///   3. 3D cantilever: tip-to-root moment diagram (linear Mz variation)
///   4. T-junction under vertical load: reaction Fy shared among three arms
///   5. 3D continuous beam: carry-over — both fixed ends receive carry-over moments
///   6. Out-of-plane moment transfer: bending → torsion at L-corner
///   7. 3D portal frame: column moment distribution under lateral load
///   8. Torsion-bending coupling at L-junction under combined loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;

// ================================================================
// 1. T-Junction: Shorter Arm Carries More Moment
// ================================================================
//
// T-shaped frame: three arms all along X from a central junction.
// Arms: A (length L), B (length L, opposite direction), C (length 2L).
// An external Mz moment is applied at the junction.
// All far ends are fixed.
//
// Near-end stiffness: k = 4EI/L for fixed far end.
// Distribution factors: DF_A = k_A/(k_A+k_B+k_C), etc.
// k_A = k_B = 4EI/L, k_C = 4EI/(2L) = 2EI/L.
// ΣK = 4EI/L + 4EI/L + 2EI/L = 10EI/L.
// DF_A = 0.4, DF_B = 0.4, DF_C = 0.2.
// Arm C (longer) is less stiff → carries less moment.
//
// After distribution, each far end gets half the near-end moment (carry-over factor 0.5).
// Far-end Mz reactions: r_A = 0.4*Mz*0.5 = 0.2*Mz, r_B = 0.2*Mz, r_C = 0.2*Mz*0.5 = 0.1*Mz.
// Note: ΣMz_reactions = 0.2+0.2+0.1 = 0.5*Mz (only carry-over shows in reactions).
//
// Key check: arms A and B carry equal moment (symmetric), arm C carries less.
//
// Reference: Kassimali §12.2; McGuire et al. §5.4

#[test]
fn validation_3d_moment_dist_t_junction_stiffness_ratio() {
    let l = 4.0;
    let mz_applied = 12.0; // kN·m

    // Arms A and B (length L along ±X), arm C (length 2L along +Y)
    // All arms start at junction (4) at origin.
    // Arms A and B are collinear along X (±X, equal length) → equal stiffness.
    // Arm C is along +Y with length 2L → stiffness = 4EI/(2L) = half of A or B.
    // Mz about Z-axis distributes as bending to all arms (IZ is same for all).
    let nodes = vec![
        (1, -l, 0.0, 0.0),   // far end of arm A (length L, -X direction)
        (2,  l, 0.0, 0.0),   // far end of arm B (length L, +X direction)
        (3,  0.0, 2.0 * l, 0.0), // far end of arm C (length 2L, +Y direction)
        (4,  0.0, 0.0, 0.0), // junction
    ];
    let elems = vec![
        (1, "frame", 4, 1, 1, 1),  // arm A: junction → node1 (-X), length L
        (2, "frame", 4, 2, 1, 1),  // arm B: junction → node2 (+X), length L
        (3, "frame", 4, 3, 1, 1),  // arm C: junction → node3 (+Y), length 2L
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: mz_applied, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Junction node must rotate under applied Mz
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.rz.abs() > 1e-8,
        "Junction must rotate under applied Mz: rz={:.6e}", d4.rz);

    // Arms A and B are equal length → equal far-end reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.mz.abs(), r2.mz.abs(), 0.02,
        "Arms A and B (equal length): equal Mz reactions");

    // Arm C is longer (2L) → less stiff → smaller Mz reaction
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(r3.mz.abs() < r1.mz.abs(),
        "Arm C (2L) carries less moment than arm A (L): r3={:.4} < r1={:.4}",
        r3.mz.abs(), r1.mz.abs());

    // Stiffness ratio k_A/k_C = (4EI/L)/(4EI/2L) = 2.
    // After moment distribution: DF_A = 0.4, DF_C = 0.2 → ratio = 2.
    // Near-end: M_A = 0.4*Mz, M_C = 0.2*Mz → carry-over ratio: r1/r3 = 0.4/0.2 = 2
    let ratio = r1.mz.abs() / r3.mz.abs();
    assert_close(ratio, 2.0, 0.10,
        "Arm A / Arm C moment ratio = stiffness ratio = 2");

    // Global force equilibrium (no applied forces)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fx.abs() < 0.01, "ΣFx = 0: {:.4}", sum_fx);
    assert!(sum_fy.abs() < 0.01, "ΣFy = 0: {:.4}", sum_fy);
}

// ================================================================
// 2. Cross Junction: Four Equal Arms, Symmetric Mz Distribution
// ================================================================
//
// Four equal-length arms all along X, meeting at a central junction.
// Arms: two going to -X (lengths L), two going to +X (lengths L).
// External moment Mz at junction.
// By symmetry: all four arms carry equal Mz reactions.
// Each far-end reaction = Mz/4 × carry-over factor = Mz/8.
//
// Reference: Przemieniecki Ch. 10; Weaver & Gere §8.2

#[test]
fn validation_3d_moment_dist_cross_junction_equal_arms() {
    let l = 4.0;
    let mz_applied = 16.0;

    // Four arms: two at -L, -2L (going left), two at +L, +2L (going right)
    // All from junction at x=0. But to have 4 distinct arms, we need 4 far nodes.
    // Simple approach: 4 arms at +L, +L (same position?) — no.
    // Use arms at ±L and ±2L from junction.
    // Arms A,B: length L to ±x direction.
    // Arms C,D: length L but in ±z direction (so Mz distributes as bending in XZ beams).
    // Wait — arms along Z with Mz applied: Mz about Z axis, arm along Z → torsion again.
    //
    // Pure bending (Mz about Z) only works for arms in XY plane (along X or Y).
    // Arms along Y carry Mz as bending about Z? No: for a beam along Y, bending in XY plane
    // uses Iz (same as beam along X). So Mz acts as bending in the Y-arm too.
    //
    // Let's try: 4 arms along X and Y in the XY plane.
    // Arms A(→+X), B(→-X), C(→+Y), D(→-Y), each length L.
    // Mz at junction. Arms along X carry Mz as bending (Mz reactions).
    // Arms along Y also carry Mz as bending Mz about Z (bending in XY plane = uses Iz).
    // For a beam along Y: bending in the XY plane uses Iz. Yes, this is still Mz!
    // So all 4 arms carry Mz reactions. By symmetry: equal Mz at each far end.
    //
    // Key: the beam_axis Y vs X only matters for strong/weak axis distinction.
    // For Iz = IY = 1e-4 (equal), all 4 arms are equally stiff for Mz → equal distribution.
    let nodes = vec![
        (1,  l, 0.0, 0.0),   // arm A: +X
        (2, -l, 0.0, 0.0),   // arm B: -X
        (3, 0.0,  l, 0.0),   // arm C: +Y
        (4, 0.0, -l, 0.0),   // arm D: -Y
        (5, 0.0, 0.0, 0.0),  // junction
    ];
    let elems = vec![
        (1, "frame", 5, 1, 1, 1),
        (2, "frame", 5, 2, 1, 1),
        (3, "frame", 5, 3, 1, 1),
        (4, "frame", 5, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: mz_applied, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Junction must rotate
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(d5.rz.abs() > 1e-8, "Junction rotates: rz={:.6e}", d5.rz);

    // Arms A and B (both along X, same length) must carry equal Mz reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.mz.abs(), r2.mz.abs(), 0.02,
        "Arms A and B (symmetric along X): equal Mz reactions");

    // Arms C and D (both along Y, same length) must carry equal Mz reactions
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r3.mz.abs(), r4.mz.abs(), 0.02,
        "Arms C and D (symmetric along Y): equal Mz reactions");

    // With IZ = IY and equal lengths: all four arms are equally stiff for Mz
    // So r1 = r2 = r3 = r4 (equal Mz distribution)
    assert_close(r1.mz.abs(), r3.mz.abs(), 0.10,
        "All four equal arms: equal Mz distribution (IZ=IY, equal L)");

    // Global force equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fx.abs() < 0.01, "ΣFx = 0: {:.4}", sum_fx);
    assert!(sum_fy.abs() < 0.01, "ΣFy = 0: {:.4}", sum_fy);
}

// ================================================================
// 3. 3D Cantilever: Linear Moment Variation Root-to-Tip
// ================================================================
//
// 3D cantilever fixed at root (x=0), tip force Fy at x=L.
// Bending moment Mz varies linearly from M_root = Fy·L to M_tip = 0.
//
// The moment diagram in 3D should match the 2D cantilever formula.
//
// Reference: Przemieniecki §6.1; McGuire et al. §3.2

#[test]
fn validation_3d_moment_dist_cantilever_linear_moment() {
    let l = 5.0;
    let n = 10;
    let fy = 8.0; // kN downward
    let e_eff = E * 1000.0;
    let elem_len = l / n as f64;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed at root
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -fy, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Root moment should equal Fy * L
    let r_root = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_root_exact = fy * l;
    assert_close(r_root.mz.abs(), m_root_exact, 0.02,
        "Cantilever root Mz = Fy·L");

    // Root shear should equal Fy
    assert_close(r_root.fy.abs(), fy, 0.01, "Cantilever root Fy = applied load");

    // Tip displacement = Fy·L³/(3·E·Iz)
    let tip_disp = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_exact = fy * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip_disp.uy.abs(), delta_exact, 0.02,
        "Cantilever tip: δ = Fy·L³/(3EIz)");

    // Moment at element n/2: x_start = (n/2 - 1) * elem_len, M = Fy*(L - x_start)
    let mid_elem_id = n / 2;
    let x_start_mid = (mid_elem_id - 1) as f64 * elem_len;
    let m_at_mid_start = fy * (l - x_start_mid);
    let mid_elem = results.element_forces.iter().find(|e| e.element_id == mid_elem_id).unwrap();
    assert_close(mid_elem.mz_start.abs(), m_at_mid_start, 0.05,
        "Cantilever: element n/2 start Mz = Fy*(L - x_start)");

    // Moment diagram: decreasing from root (elem 1) to tip (elem n)
    let m_elem1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let m_elemn = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(m_elem1.mz_start.abs() > m_elemn.mz_start.abs(),
        "Moment decreases from root to tip: root={:.4}, tip={:.4}",
        m_elem1.mz_start.abs(), m_elemn.mz_start.abs());
}

// ================================================================
// 4. T-Junction Under Vertical Load: Fy Shared Among Three Arms
// ================================================================
//
// T-shaped 3D frame: two collinear arms along X (arm A at -X, arm B at +X),
// plus a third arm along Z (arm C). Central junction loaded with Fy.
// All far ends are fixed.
//
// Arms A and B (along X) carry Fy as bending; arm C (along Z) also carries
// Fy as bending (perpendicular load on the Z-arm). By symmetry of A and B:
// they share load equally. The arm C (along Z, same length) will carry
// the same share as each X-arm (equal stiffness for Fy loading in all arms).
//
// This tests 3D moment/force distribution at a rigid joint under vertical load.
//
// Reference: McGuire et al. §2.3 (nodal equilibrium); Przemieniecki §4.1

#[test]
fn validation_3d_moment_dist_t_junction_vertical_load() {
    let l = 4.0;
    let fy = 12.0; // kN downward at junction

    // T-frame: junction at origin. Arms along -X, +X, and +Z (all same length L).
    let nodes = vec![
        (1, -l, 0.0, 0.0),  // arm A far end (-X)
        (2,  l, 0.0, 0.0),  // arm B far end (+X)
        (3,  0.0, 0.0, l),  // arm C far end (+Z)
        (4,  0.0, 0.0, 0.0), // junction
    ];
    let elems = vec![
        (1, "frame", 4, 1, 1, 1),  // arm A: -X
        (2, "frame", 4, 2, 1, 1),  // arm B: +X
        (3, "frame", 4, 3, 1, 1),  // arm C: +Z
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: -fy, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global Fy equilibrium: total reaction = applied Fy
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, fy, 0.01, "T-junction Fy: ΣFy = applied load");

    // Arms A and B (symmetric, same length along X): carry equal Fy reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.fy.abs(), r2.fy.abs(), 0.02,
        "Arms A and B (symmetric): equal Fy reactions");

    // All three arms carry some Fy (load distributes to all supports)
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(r1.fy.abs() > 0.05 * fy,
        "Arm A carries Fy: {:.4}", r1.fy);
    assert!(r2.fy.abs() > 0.05 * fy,
        "Arm B carries Fy: {:.4}", r2.fy);
    assert!(r3.fy.abs() > 0.05 * fy,
        "Arm C carries Fy: {:.4}", r3.fy);

    // Total must sum to applied load
    assert_close(r1.fy.abs() + r2.fy.abs() + r3.fy.abs(), fy, 0.05,
        "Total Fy reactions = applied load");

    // No applied horizontal forces → zero Fx, Fz
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fx.abs() < 0.01 * fy, "ΣFx ≈ 0: {:.4}", sum_fx);
    assert!(sum_fz.abs() < 0.01 * fy, "ΣFz ≈ 0: {:.4}", sum_fz);

    // Junction deflects downward
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.uy < -1e-8,
        "Junction deflects down: uy={:.6e}", d4.uy);
}

// ================================================================
// 5. 3D Continuous Beam: Both Fixed Ends Receive Carry-Over Moment
// ================================================================
//
// 3D beam along X-axis: three spans, fixed at both ends.
// Concentrated moment Mz at the first interior junction.
// The moment distributes into span 1 and span 2; carry-over transmits
// a fraction of each near-end moment to the fixed far ends.
//
// Both fixed end supports must develop non-zero Mz reactions.
// The left fixed end (closer to the applied moment) should carry more
// than the right fixed end (further away).
//
// Reference: Kassimali §12.4; Cross (1930) moment distribution method

#[test]
fn validation_3d_moment_dist_continuous_beam_carry_over() {
    let l = 5.0;
    let n = 5; // elements per span
    let junction = n + 1; // node at end of span 1

    // Three-span beam: nodes 1 to 3n+1 along X at spacing l/n
    let nodes: Vec<(usize, f64, f64, f64)> = (0..=(3 * n))
        .map(|i| (i + 1, i as f64 * l / n as f64, 0.0, 0.0))
        .collect();

    let elems: Vec<_> = (0..(3 * n))
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    // Fixed at both ends; intermediate junctions: vertical support only (rollerX equivalent)
    let sups = vec![
        (1,          vec![true, true, true, true, true, true]),   // left end: fully fixed
        (3 * n + 1,  vec![true, true, true, true, true, true]),   // right end: fully fixed
        (n + 1,      vec![false, true, true, false, false, false]), // first junction: ry,rz
        (2 * n + 1,  vec![false, true, true, false, false, false]), // second junction: ry,rz
    ];

    // Apply Mz at the first interior junction
    let mz_applied = 10.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: junction, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: mz_applied, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Both fixed ends must carry carry-over moment (Mz reactions)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();

    assert!(r_left.mz.abs() > mz_applied * 0.05,
        "Left fixed end carries carry-over moment: Mz={:.4}", r_left.mz);
    assert!(r_right.mz.abs() > mz_applied * 0.05,
        "Right fixed end carries carry-over moment: Mz={:.4}", r_right.mz);

    // Junction node should rotate (moment applied there)
    let d_junc = results.displacements.iter().find(|d| d.node_id == junction).unwrap();
    assert!(d_junc.rz.abs() > 1e-8,
        "Junction node rotates under applied Mz: rz={:.6e}", d_junc.rz);

    // Left end is adjacent to applied moment (span 1 only between left end and junction).
    // Right end is 2 spans away. Carry-over attenuates over distance:
    // left end gets carry-over from span 1; right end gets double carry-over through span 2 and 3.
    // Left should carry more moment than right.
    assert!(r_left.mz.abs() >= r_right.mz.abs(),
        "Left end ({:.4}) ≥ right end ({:.4}) moment (carry-over attenuates with distance)",
        r_left.mz.abs(), r_right.mz.abs());
}

// ================================================================
// 6. Out-of-Plane Moment Transfer: Bending to Torsion at L-Corner
// ================================================================
//
// An L-shaped beam in the XY plane.
// Arm 1 along X: node 1 (fixed) → node 2 (corner)
// Arm 2 along Y: node 2 (corner) → node 3 (free tip)
//
// A Z-direction force Fz at node 3 causes:
//   - Bending in arm 2 (My about the Y-axis)
//   - Torsion in arm 1 (Mx = Fz × L_arm2 at arm 1 root)
//
// Reference: Weaver & Gere §8.4 (space frame examples)

#[test]
fn validation_3d_moment_dist_out_of_plane_bending_to_torsion() {
    let l1 = 4.0; // arm 1 along X
    let l2 = 3.0; // arm 2 along Y
    let fz = -10.0; // Z-force at tip of arm 2
    let e_eff = E * 1000.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // fixed end of arm 1
        (2, l1,  0.0, 0.0),  // corner
        (3, l1,  l2,  0.0),  // free tip of arm 2
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),  // arm 1 along X
        (2, "frame", 2, 3, 1, 1),  // arm 2 along Y
    ];
    let sups = vec![(1, vec![true, true, true, true, true, true])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global Fz equilibrium
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, fz.abs(), 0.01, "L-corner: ΣFz = Fz");

    // The reaction at node 1 carries both bending and torsion
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Torsion in arm 1 = Fz × l2 (moment arm is l2 in Y direction)
    let mx_expected = fz.abs() * l2;
    assert_close(r1.mx.abs(), mx_expected, 0.05,
        "Arm 1 base torsion Mx = Fz*l2");

    // Vertical reaction = Fz
    assert_close(r1.fz.abs(), fz.abs(), 0.01, "Support carries all vertical load");

    // Corner node should rotate in torsion (arm 1 twists)
    let d_corner = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d_corner.rx.abs() > 1e-8,
        "Corner twists in X (torsion of arm 1): rx={:.6e}", d_corner.rx);

    // Tip displacement (Z) must be significant (arm 2 bends under Fz)
    let d_tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let delta_arm2_alone = fz.abs() * l2.powi(3) / (3.0 * e_eff * IY);
    assert!(d_tip.uz.abs() > delta_arm2_alone * 0.5,
        "Tip deflection ({:.6e}) significant (arm2 alone = {:.6e})",
        d_tip.uz.abs(), delta_arm2_alone);
}

// ================================================================
// 7. 3D Portal Frame: Column Moment Distribution Under Lateral Load
// ================================================================
//
// Fixed-base 3D portal frame in the XZ-plane:
//   Columns along Z, beam along X.
// Lateral load Fx at top of left column.
//
// For equal columns: lateral stiffness bounded between cantilever and fixed-fixed.
// Column bases develop significant moments about Y-axis (bending axis).
//
// Reference: Weaver & Gere §8.3 (portal frame analysis)

#[test]
fn validation_3d_moment_dist_portal_frame_column_moments() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 1.0;
    let e_eff = E * 1000.0;

    // Frame in XZ-plane: columns along Z, beam along X
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // base left
        (2, 0.0, 0.0, h),    // top left
        (3, w, 0.0, h),      // top right
        (4, w, 0.0, 0.0),    // base right
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),  // left column
        (2, "frame", 2, 3, 1, 1),  // beam
        (3, "frame", 3, 4, 1, 1),  // right column
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: h_load, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global horizontal equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!((sum_fx + h_load).abs() < h_load * 0.01,
        "Portal lateral equilibrium ΣFx: sum={:.4}, H={:.4}", sum_fx, h_load);

    // Column base moments (My about portal bending axis)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Both column bases must develop significant moments
    assert!(r1.my.abs() > h_load * h * 0.1,
        "Left base develops My moment: {:.4}", r1.my);
    assert!(r4.my.abs() > h_load * h * 0.1,
        "Right base develops My moment: {:.4}", r4.my);

    // Lateral stiffness bounded between cantilever and fixed-fixed pairs
    let k_cantilever_pair = 2.0 * 3.0 * e_eff * IY / h.powi(3);
    let k_fixed_fixed_pair = 2.0 * 12.0 * e_eff * IY / h.powi(3);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let sway = d2.ux.abs();
    let k_actual = h_load / sway;

    assert!(k_actual > k_cantilever_pair * 0.9,
        "Portal stiffness ({:.4e}) > cantilever pair ({:.4e})",
        k_actual, k_cantilever_pair);
    assert!(k_actual < k_fixed_fixed_pair * 1.1,
        "Portal stiffness ({:.4e}) < fixed-fixed pair ({:.4e})",
        k_actual, k_fixed_fixed_pair);

    // Column moments are approximately equal (symmetric columns)
    let ratio = r1.my.abs() / r4.my.abs();
    assert!(ratio > 0.5 && ratio < 2.0,
        "Column base moments approximately equal: ratio={:.3}", ratio);
}

// ================================================================
// 8. Torsion-Bending Coupling at L-Junction Under Combined Loads
// ================================================================
//
// An L-shaped 3D frame: arm 1 along X (fixed at node 1), arm 2 along Z.
// Combined loading at tip of arm 2:
//   - Fy (vertical) → torsion Mx = Fy*L in arm 1
//   - Fz (out-of-plane) → bending My = Fz*L in arm 1
//
// Superposition: combined = sum of individual responses (linear analysis).
//
// Reference: Przemieniecki §6.3; McGuire et al. §5.5

#[test]
fn validation_3d_moment_dist_torsion_bending_coupling() {
    let l = 4.0;
    let fy = 8.0;  // kN
    let fz = 6.0;  // kN
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    // L-frame: arm 1 along X (fixed at node 1), arm 2 along Z (free tip at node 3)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // fixed end of arm 1
        (2, l, 0.0, 0.0),    // corner
        (3, l, 0.0, l),      // tip of arm 2 (along Z)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),  // arm 1 along X
        (2, "frame", 2, 3, 1, 1),  // arm 2 along Z
    ];
    let sups = vec![(1, vec![true, true, true, true, true, true])];

    // Case 1: Fy only at tip
    let input_fy = make_3d_input(
        nodes.clone(), vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems.clone(), sups.clone(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -fy, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_fy = linear::solve_3d(&input_fy).unwrap();

    // Case 2: Fz only at tip
    let input_fz = make_3d_input(
        nodes.clone(), vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems.clone(), sups.clone(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: 0.0, fz: -fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_fz = linear::solve_3d(&input_fz).unwrap();

    // Case 3: Combined Fy + Fz
    let input_comb = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -fy, fz: -fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_comb = linear::solve_3d(&input_comb).unwrap();

    // Superposition: combined tip displacement = sum of individual
    let tip_fy = res_fy.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let tip_fz = res_fz.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let tip_comb = res_comb.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(tip_comb.uy, tip_fy.uy + tip_fz.uy, 0.01,
        "Superposition: combined uy = uy_Fy + uy_Fz");
    assert_close(tip_comb.uz, tip_fy.uz + tip_fz.uz, 0.01,
        "Superposition: combined uz = uz_Fy + uz_Fz");

    // Fy at tip of arm 2 (along Z) creates torsion Mx = Fy*l in arm 1 along X
    let r1_fy = res_fy.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let mx_fy_expected = fy * l;
    assert_close(r1_fy.mx.abs(), mx_fy_expected, 0.05,
        "Fy load: torsion Mx = Fy*l at arm 1 root");

    // Fz at tip of arm 2 creates bending My = Fz*l in arm 1
    let r1_fz = res_fz.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let my_fz_expected = fz * l;
    assert_close(r1_fz.my.abs(), my_fz_expected, 0.05,
        "Fz load: bending My = Fz*l at arm 1 root");

    // Corner twist under Fy load: φ = T*l/(GJ) where T = Fy*l
    let corner_fy = res_fy.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let phi_exact = mx_fy_expected * l / (g * J);
    assert_close(corner_fy.rx.abs(), phi_exact, 0.10,
        "Corner X-rotation = torsion angle Fy*l²/(GJ)");
}
