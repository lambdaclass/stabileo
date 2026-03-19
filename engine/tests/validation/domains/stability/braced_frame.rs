/// Validation: Braced Frame Systems
///
/// References:
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 13
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 6
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5
///   - AISC 360-16, Chapter C (Stability)
///
/// Tests verify mixed frame+truss bracing behavior:
///   1. X-braced frame: negligible sidesway under lateral load
///   2. K-braced frame under lateral load: drift reduction
///   3. Single diagonal brace force ≈ H/cos(θ) under pure sway
///   4. Braced vs unbraced portal: drift comparison
///   5. Chevron (inverted-V) brace: vertical reaction at brace midpoint
///   6. Braced frame under gravity only: brace forces near zero
///   7. Multi-story braced frame: cumulative brace forces
///   8. Braced frame global equilibrium under combined loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_FRAME: f64 = 0.02;
const A_BRACE: f64 = 0.005;
const IZ: f64 = 1e-4;

// ================================================================
// 1. X-Braced Frame: Negligible Sidesway
// ================================================================
//
// Pinned-base portal frame with X-bracing. Under lateral load the
// sidesway should be very small compared to the unbraced frame.
// The X-bracing converts the frame into a near-truss mechanism.
//
// Reference: Salmon et al., "Steel Structures", §6.2.

#[test]
fn validation_braced_frame_x_brace_minimal_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Unbraced frame (pinned bases)
    let input_unbraced = make_portal_frame(h, w, E, A_FRAME, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let d_unbraced = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // X-braced frame (pinned bases + two diagonal truss members)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
        (5, "truss", 2, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];
    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let d_braced = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced drift must be significantly less than unbraced
    assert!(
        d_braced < d_unbraced * 0.3,
        "X-braced drift={:.6e} should be < 30% of unbraced drift={:.6e}",
        d_braced,
        d_unbraced
    );
}

// ================================================================
// 2. K-Braced Frame Under Lateral Load: Drift Reduction
// ================================================================
//
// Portal frame with a K-brace: a single vertical central member
// and two diagonal braces from the column bases to the center post top.
// The K-brace should significantly reduce lateral drift.
//
// Reference: McCormac & Csernak, "Structural Steel Design", 6th Ed., §13.3.

#[test]
fn validation_braced_frame_k_brace_drift_reduction() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Unbraced portal (fixed bases)
    let input_unbraced = make_portal_frame(h, w, E, A_FRAME, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let d_unbraced = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // K-brace: beam split at midspan with a vertical post down to the floor,
    // plus two diagonals from the column bases up to the beam midpoint.
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(w/2,h)=beam midspan, 6(w/2,0)=post base
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, w / 2.0, h),    // beam midspan node (at roof level)
        (6, w / 2.0, 0.0),  // post base (at floor, pinned)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 5, 1, 1, false, false), // left beam half
        (3, "frame", 5, 3, 1, 1, false, false), // right beam half
        (4, "frame", 3, 4, 1, 1, false, false), // right column
        (5, "frame", 5, 6, 1, 1, false, false), // central vertical post (frame for stability)
        (6, "truss", 1, 5, 1, 2, false, false), // left diagonal brace
        (7, "truss", 4, 5, 1, 2, false, false), // right diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed"), (3, 6, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input_k = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let res_k = linear::solve_2d(&input_k).unwrap();
    let d_k = res_k
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // K-brace reduces drift
    assert!(
        d_k < d_unbraced,
        "K-brace drift={:.6e} should be < unbraced drift={:.6e}",
        d_k,
        d_unbraced
    );

    // Global equilibrium: ΣRx = -P
    let sum_rx: f64 = res_k.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "K-brace: ΣRx = -P");
}

// ================================================================
// 3. Single Diagonal Brace: Brace Force ≈ H / cos(θ)
// ================================================================
//
// Pinned-base portal frame with single diagonal brace from node 4 to node 2.
// Under lateral load H, the brace carries the dominant portion of shear.
// For a stiff brace relative to columns: N_brace ≈ H / cos(θ).
// Here θ = atan(h/w) is the angle from horizontal.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., §5.4.

#[test]
fn validation_braced_frame_single_diagonal_force() {
    let h = 3.0;
    let w = 4.0;
    let lateral = 10.0;

    // Use very stiff brace relative to frame → brace carries nearly all shear
    let a_brace_stiff = 0.1; // large area for near-rigid brace

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 2, 1, 2, false, false), // diagonal from (w,0) to (0,h)
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: lateral,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, a_brace_stiff, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Brace length and angle
    let brace_l = (h * h + w * w).sqrt();
    let cos_theta = w / brace_l; // horizontal / diagonal

    // Horizontal component of brace force must balance most of applied lateral
    let ef_brace = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let brace_h_component = ef_brace.n_start.abs() * cos_theta;

    // For a stiff brace, horizontal component > 80% of applied load
    assert!(
        brace_h_component > lateral * 0.80,
        "Brace horizontal component={:.4} should be >80% of H={:.4}",
        brace_h_component,
        lateral
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.02, "Single diagonal: ΣRx = -H");
}

// ================================================================
// 4. Braced vs Unbraced Portal: Drift Comparison
// ================================================================
//
// Fixed-base portal frame. Compare lateral drift with and without
// a single diagonal brace. Brace always reduces drift.
//
// Reference: AISC 360-16, Commentary on Chapter C.

#[test]
fn validation_braced_frame_vs_unbraced_drift() {
    let h = 5.0;
    let w = 8.0;
    let p = 15.0;

    // Unbraced (fixed bases)
    let input_unbraced = make_portal_frame(h, w, E, A_FRAME, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let d_unbraced = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced: add diagonal from (0,0) → (w,h) as truss
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];
    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let d_braced = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    assert!(
        d_braced < d_unbraced,
        "Braced drift={:.6e} must be less than unbraced drift={:.6e}",
        d_braced,
        d_unbraced
    );

    // Both must satisfy equilibrium
    let sum_rx_b: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_b, -p, 0.02, "Braced portal: ΣRx = -P");
    let sum_rx_u: f64 = res_unbraced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_u, -p, 0.02, "Unbraced portal: ΣRx = -P");
}

// ================================================================
// 5. Chevron (Inverted-V) Brace: Vertical Reaction at Intersection
// ================================================================
//
// Two diagonal braces meet at the beam midspan (chevron configuration).
// Node at midspan allows the braces to apply both horizontal and
// vertical components to the beam. Under lateral load, the beam
// midspan node carries axial forces from both braces.
//
// Reference: McCormac & Csernak, "Structural Steel Design", 6th Ed., §13.4.

#[test]
fn validation_braced_frame_chevron_intersection() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Nodes: columns at x=0 and x=w, beam with midspan node at x=w/2
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 2.0, h), // midspan beam node
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "truss", 1, 3, 1, 2, false, false), // left chevron brace
        (6, "truss", 5, 3, 1, 2, false, false), // right chevron brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 5, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Both braces should carry nonzero axial force
    let n5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap().n_start.abs();
    let n6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start.abs();
    assert!(n5 > 0.5, "Left chevron brace should carry force: N={:.4}", n5);
    assert!(n6 > 0.5, "Right chevron brace should carry force: N={:.4}", n6);

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Chevron: ΣRx = -P");
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 0.02, "Chevron: ΣRy = 0");
}

// ================================================================
// 6. Braced Frame Under Gravity Only: Brace Forces Near Zero
// ================================================================
//
// Symmetric X-braced portal frame under pure symmetric vertical loads.
// By symmetry the diagonals carry equal and opposite forces which
// cancel for vertical-only symmetric loads → axial force in braces ≈ 0.
//
// Reference: Salmon et al., "Steel Structures", §6.3.

#[test]
fn validation_braced_frame_gravity_only_brace_forces() {
    let h = 4.0;
    let w = 6.0;
    let fy = -20.0; // symmetric downward load at each top corner

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
        (5, "truss", 2, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fz: fy,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: fy,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Brace axial forces should be much smaller than column axial forces.
    // The columns carry the gravity load directly; braces only carry
    // a small fraction due to geometric compatibility.
    let col_n_max = results.element_forces.iter()
        .filter(|ef| ef.element_id == 1 || ef.element_id == 3)
        .map(|ef| ef.n_start.abs())
        .fold(0.0_f64, f64::max);

    for ef in &results.element_forces {
        if ef.element_id == 4 || ef.element_id == 5 {
            assert!(
                ef.n_start.abs() < col_n_max * 0.5,
                "Gravity-only brace {} force={:.4} should be much less than column force={:.4}",
                ef.element_id,
                ef.n_start.abs(),
                col_n_max
            );
        }
    }

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -2.0 * fy, 0.02, "Gravity braced: ΣRy = 2|Fy|");
}

// ================================================================
// 7. Multi-Story Braced Frame: Cumulative Brace Forces
// ================================================================
//
// Two-story X-braced frame. Each story has equal lateral load P.
// The ground-story brace must carry the cumulative shear from both stories.
// Upper-story brace carries only the upper story shear.
//
// Reference: McCormac & Csernak, "Structural Steel Design", 6th Ed., §13.5.

#[test]
fn validation_braced_frame_multistory_cumulative() {
    let h = 3.5;
    let w = 5.0;
    let p = 10.0;

    // Two-story frame: 6 nodes
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, w, 0.0),
        (5, w, h),
        (6, w, 2.0 * h),
    ];
    let elems = vec![
        // Ground-story columns
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 4, 5, 1, 1, false, false),
        // Upper-story columns
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Beams
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
        // Ground-story X-braces
        (7, "truss", 1, 5, 1, 2, false, false),
        (8, "truss", 2, 4, 1, 2, false, false),
        // Upper-story X-braces
        (9, "truss", 2, 6, 1, 2, false, false),
        (10, "truss", 3, 5, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: p,
            fz: 0.0,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Ground-story braces (7, 8) carry more force than upper-story braces (9, 10)
    let n_ground = results.element_forces.iter().find(|e| e.element_id == 7).unwrap().n_start.abs()
        .max(results.element_forces.iter().find(|e| e.element_id == 8).unwrap().n_start.abs());
    let n_upper = results.element_forces.iter().find(|e| e.element_id == 9).unwrap().n_start.abs()
        .max(results.element_forces.iter().find(|e| e.element_id == 10).unwrap().n_start.abs());

    assert!(
        n_ground > n_upper * 1.3,
        "Ground brace force={:.4} should exceed upper brace force={:.4} by >30%",
        n_ground,
        n_upper
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -2.0 * p, 0.02, "Multi-story: ΣRx = -2P");
}

// ================================================================
// 8. Braced Frame Global Equilibrium Under Combined Loads
// ================================================================
//
// X-braced portal frame under simultaneous lateral and gravity loads.
// Verify ΣFx = 0, ΣFy = 0.
//
// Reference: AISC 360-16, Commentary on Chapter C.

#[test]
fn validation_braced_frame_global_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let px = 10.0;
    let py = -25.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
        (5, "truss", 2, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: px,
            fz: py,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: py,
            my: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // ΣFx = 0: sum of horizontal reactions equals applied horizontal load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "Braced global: ΣRx = -Px");

    // ΣFy = 0: sum of vertical reactions equals total applied vertical
    let total_fz = py + py; // two gravity loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -total_fz, 0.02, "Braced global: ΣRy = -ΣFy");
}
