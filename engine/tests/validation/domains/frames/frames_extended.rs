/// Validation: Extended portal/frame tests verified against analytical solutions.
///
/// References:
///   - Ghali/Neville, *Structural Analysis*, 7th Ed.
///   - Kassimali, *Structural Analysis*, 6th Ed.
///   - Hibbeler, *Structural Analysis*, 10th Ed.
///
/// Tests cover:
///   1. Two-bay portal frame equilibrium under gravity
///   2. Two-storey portal frame lateral stiffness
///   3. L-shaped frame with point load (cantilever corner)
///   4. Portal frame with asymmetric column heights
///   5. Fixed-fixed beam with point load at third-point
///   6. Propped cantilever with point load at midspan
///   7. Two-bay portal frame lateral load distribution
///   8. Portal frame combined lateral + gravity superposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Bay Portal Frame Under Gravity — Equilibrium Check
// ================================================================
//
// Two-bay portal: 3 columns, 2 beams. Fixed bases.
//   Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
//   Elements: col 1-2, beam 2-3, col 4-3 (middle), beam 3-5, col 6-5
//   UDL q on both beams → total load = 2*q*w
//   Equilibrium: ΣRy = 2*q*w

#[test]
fn validation_two_bay_portal_gravity_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let q = 15.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w, h), (4, w, 0.0),
            (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // left beam
            (3, "frame", 4, 3, 1, 1, false, false), // middle column
            (4, "frame", 3, 5, 1, 1, false, false), // right beam
            (5, "frame", 6, 5, 1, 1, false, false), // right column
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 4, q_i: -q, q_j: -q, a: None, b: None,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction must equal total applied gravity: 2*q*w
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * q * w, 0.01, "two-bay gravity SumRy");

    // Horizontal reactions must sum to zero (no lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.5, "two-bay gravity SumRx={:.4}, expected ~0", sum_rx);

    // Symmetric structure + symmetric load → outer base reactions equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();
    assert_close(r1.ry, r6.ry, 0.01, "two-bay symmetry Ry outer");
    assert_close(r1.mz.abs(), r6.mz.abs(), 0.01, "two-bay symmetry Mz outer");
}

// ================================================================
// 2. Two-Storey Portal Frame — Upper Storey More Flexible
// ================================================================
//
// Two-storey single-bay portal. Fixed bases. Lateral load at top.
//   Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0) — storey 1
//          5(0,2h), 6(w,2h) — storey 2
//   Lateral load H at node 5 (top-left)
//   The top storey sway should exceed the first-storey inter-storey drift.

#[test]
fn validation_two_storey_frame_sway() {
    let h = 3.5;
    let w = 6.0;
    let lateral = 30.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
            (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left col storey 1
            (2, "frame", 2, 3, 1, 1, false, false), // beam storey 1
            (3, "frame", 4, 3, 1, 1, false, false), // right col storey 1
            (4, "frame", 2, 5, 1, 1, false, false), // left col storey 2
            (5, "frame", 5, 6, 1, 1, false, false), // beam storey 2
            (6, "frame", 3, 6, 1, 1, false, false), // right col storey 2
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: SumRx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "two-storey SumRx");

    // Top-storey displacement should be positive (in load direction)
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(d5.ux > 0.0, "top storey sway should be positive");

    // First-storey displacement
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0, "first storey sway should be positive");

    // Top should sway more than first storey
    assert!(
        d5.ux > d2.ux,
        "top sway ({:.6}) should exceed 1st storey ({:.6})", d5.ux, d2.ux
    );

    // SumRy = 0 (no gravity load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.5, "two-storey SumRy={:.4}, expected ~0", sum_ry);
}

// ================================================================
// 3. L-Shaped Frame — Corner Point Load
// ================================================================
//
// L-frame: vertical column fixed at base + horizontal cantilever at top.
//   Nodes: 1(0,0) fixed, 2(0,h) corner, 3(w,h) free tip
//   Point load P downward at tip (node 3)
//   This is equivalent to a cantilever of length w with moment Ph at base
//   plus a column under axial load.
//   Equilibrium: Ry_base = P, Rx_base = 0, Mz_base = -P*w

#[test]
fn validation_l_frame_corner_load() {
    let h = 4.0;
    let w = 5.0;
    let p = 25.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // column
            (2, "frame", 2, 3, 1, 1, false, false), // horizontal cantilever arm
        ],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Single fixed support must carry all load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Ry = P (upward)
    assert_close(r1.ry, p, 0.01, "L-frame Ry");

    // Rx = 0 (no horizontal applied load, but column bending may cause small Rx)
    // Actually with frame elements the column bends, so Rx should be negligible vs P
    assert!(r1.rx.abs() < 1.0, "L-frame Rx={:.4}, expected ~0", r1.rx);

    // Base moment: Mz = P*w (counterclockwise to resist P*w clockwise at base)
    // Sign depends on convention; check magnitude
    assert_close(r1.mz.abs(), p * w, 0.02, "L-frame base moment Mz");

    // Tip should deflect downward
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3.uy < 0.0, "L-frame tip should deflect down, uy={:.6}", d3.uy);
}

// ================================================================
// 4. Portal Frame with Unequal Column Heights
// ================================================================
//
// Asymmetric portal: left column h1=5, right column h2=3, beam w=6.
//   Fixed bases, lateral load H at top-left.
//   Equilibrium: SumRx = -H. The shorter column is stiffer,
//   so it should attract a larger share of the shear.

#[test]
fn validation_portal_unequal_columns() {
    let h1 = 5.0;
    let h2 = 3.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),       // left base
            (2, 0.0, h1),        // left top
            (3, w, h2),          // right top (lower)
            (4, w, 0.0),         // right base
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // inclined beam
            (3, "frame", 4, 3, 1, 1, false, false), // right column (shorter)
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "unequal portal SumRx");

    // Shorter column (right) should attract more horizontal shear
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r4.rx.abs() > r1.rx.abs(),
        "shorter column shear ({:.4}) should exceed taller ({:.4})",
        r4.rx.abs(), r1.rx.abs()
    );

    // Both bases should have nonzero moments
    assert!(r1.mz.abs() > 1.0, "left base moment should be nonzero");
    assert!(r4.mz.abs() > 1.0, "right base moment should be nonzero");
}

// ================================================================
// 5. Fixed-Fixed Beam — Point Load at Third-Point
// ================================================================
//
// Fixed-fixed beam, length L, point load P at x = L/3.
//   Exact: R_A = P*b²(3a+b)/L³, M_A = P*a*b²/L²
//     where a = L/3, b = 2L/3
//   R_A = P*(4/9)*(1+2/3) = P*(4/9)*(5/3)*(1/L³)*... let's use the standard formula.
//   R_A = P*b²*(3a+b)/L³ = P*(2L/3)²*(L+2L/3)/L³ = P*4L²/9*(5L/3)/L³ = 20P/27
//   M_A = P*a*b²/L²     = P*(L/3)*(2L/3)²/L² = P*4L/27 → sign: -P*4L/27

#[test]
fn validation_fixed_fixed_third_point_load() {
    let l = 9.0;
    let n: usize = 9;
    let p = 27.0; // chosen to give nice numbers
    let e_eff: f64 = E * 1000.0;
    let _ei: f64 = e_eff * IZ;

    let a_dist: f64 = l / 3.0;
    let b_dist: f64 = 2.0 * l / 3.0;

    // Load at L/3 → node at position 3 (node 4, since node 1 is at x=0)
    let load_node = n / 3 + 1; // node 4

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // R_A = P*b^2*(3a+b)/L^3
    let r_a_exact: f64 = p * b_dist.powi(2) * (3.0 * a_dist + b_dist) / l.powi(3);
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_a_exact, 0.02, "fixed-fixed 1/3 R_A");

    // R_B = P - R_A
    let r_b_exact: f64 = p - r_a_exact;
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(rn.ry, r_b_exact, 0.02, "fixed-fixed 1/3 R_B");

    // M_A = P*a*b^2/L^2 (hogging at left support)
    let m_a_exact: f64 = p * a_dist * b_dist.powi(2) / l.powi(2);
    assert_close(r1.mz.abs(), m_a_exact, 0.03, "fixed-fixed 1/3 M_A");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "fixed-fixed 1/3 SumRy");
}

// ================================================================
// 6. Propped Cantilever — Point Load at Midspan
// ================================================================
//
// Fixed at A (node 1), roller at B (node n+1), length L.
// Point load P downward at midspan.
//   R_B = 5P/16, R_A = 11P/16
//   M_A = 3PL/16

#[test]
fn validation_propped_cantilever_midpoint_load() {
    let l = 8.0;
    let n: usize = 8;
    let p = 32.0; // chosen for nice fractions with /16

    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // R_B (roller) = 5P/16
    let r_b_exact: f64 = 5.0 * p / 16.0;
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(rn.ry, r_b_exact, 0.02, "propped cant P/2 R_B");

    // R_A = 11P/16
    let r_a_exact: f64 = 11.0 * p / 16.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_a_exact, 0.02, "propped cant P/2 R_A");

    // M_A = 3PL/16 (fixed end moment)
    let m_a_exact: f64 = 3.0 * p * l / 16.0;
    assert_close(r1.mz.abs(), m_a_exact, 0.03, "propped cant P/2 M_A");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "propped cant P/2 SumRy");
}

// ================================================================
// 7. Two-Bay Portal — Lateral Load Distribution
// ================================================================
//
// Two-bay portal, fixed bases, lateral load H at top-left node.
//   Structure: 3 columns (equal), 2 beams (equal).
//   By portal method (approximate): interior column takes 2x shear of exterior.
//   Exact FEM result checked via equilibrium.

#[test]
fn validation_two_bay_portal_lateral_distribution() {
    let h = 4.0;
    let w = 5.0;
    let lateral = 30.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, w, h), (4, w, 0.0),
            (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // left beam
            (3, "frame", 4, 3, 1, 1, false, false), // middle column
            (4, "frame", 3, 5, 1, 1, false, false), // right beam
            (5, "frame", 6, 5, 1, 1, false, false), // right column
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: SumRx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "two-bay lateral SumRx");

    // SumRy should be ~0 (no gravity)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1.0, "two-bay lateral SumRy={:.4}, expected ~0", sum_ry);

    // Interior column (node 4) should carry more shear than each exterior column
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();
    assert!(
        r4.rx.abs() > r1.rx.abs(),
        "interior shear ({:.4}) should exceed left exterior ({:.4})",
        r4.rx.abs(), r1.rx.abs()
    );
    assert!(
        r4.rx.abs() > r6.rx.abs(),
        "interior shear ({:.4}) should exceed right exterior ({:.4})",
        r4.rx.abs(), r6.rx.abs()
    );

    // All three base moments should be nonzero
    assert!(r1.mz.abs() > 1.0, "left base moment nonzero");
    assert!(r4.mz.abs() > 1.0, "middle base moment nonzero");
    assert!(r6.mz.abs() > 1.0, "right base moment nonzero");
}

// ================================================================
// 8. Portal Frame — Superposition: Lateral + Gravity
// ================================================================
//
// Verify superposition: combined load result equals sum of individual results.
//   Fixed-base portal h=4, w=6.
//   Load case 1: lateral H=20 at top-left
//   Load case 2: gravity P=50 at each top node
//   Combined: both loads together.
//   Check: combined reactions ≈ sum of individual reactions (linear superposition).

#[test]
fn validation_portal_superposition() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let gravity = -50.0;

    // Load case 1: lateral only
    let input_lat = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_lat = linear::solve_2d(&input_lat).unwrap();

    // Load case 2: gravity only
    let input_grav = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let res_grav = linear::solve_2d(&input_grav).unwrap();

    // Combined: lateral + gravity
    let input_comb = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let res_comb = linear::solve_2d(&input_comb).unwrap();

    // Check superposition at node 1 (left base)
    let r1_lat = res_lat.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_grav = res_grav.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_comb = res_comb.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r1_comb.rx, r1_lat.rx + r1_grav.rx, 0.01, "superposition Rx node 1");
    assert_close(r1_comb.ry, r1_lat.ry + r1_grav.ry, 0.01, "superposition Ry node 1");
    assert_close(r1_comb.mz, r1_lat.mz + r1_grav.mz, 0.02, "superposition Mz node 1");

    // Check superposition at node 4 (right base)
    let r4_lat = res_lat.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r4_grav = res_grav.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r4_comb = res_comb.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r4_comb.rx, r4_lat.rx + r4_grav.rx, 0.01, "superposition Rx node 4");
    assert_close(r4_comb.ry, r4_lat.ry + r4_grav.ry, 0.01, "superposition Ry node 4");
    assert_close(r4_comb.mz, r4_lat.mz + r4_grav.mz, 0.02, "superposition Mz node 4");

    // Check superposition of displacements at node 2 (top-left)
    let d2_lat = res_lat.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_grav = res_grav.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_comb = res_comb.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert_close(d2_comb.ux, d2_lat.ux + d2_grav.ux, 0.01, "superposition ux node 2");
    assert_close(d2_comb.uy, d2_lat.uy + d2_grav.uy, 0.01, "superposition uy node 2");
}
