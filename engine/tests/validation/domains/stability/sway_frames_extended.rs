/// Validation: Extended Sway Frame Behavior
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5-6
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 4
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 6
///
/// Tests verify:
///   1. Braced vs unbraced portal: braced (pinned diagonal) has much less sway
///   2. Portal frame lateral stiffness: k = 24EI/(h^3) for fixed-fixed columns with rigid beam
///   3. Two-story frame sway: inter-story drift increases with height
///   4. Portal frame sway with gravity only: symmetric gravity = zero sway
///   5. Asymmetric portal (different column heights): gravity causes sway
///   6. Portal frame: doubling lateral load doubles sway (linearity)
///   7. Portal frame: stiffer columns reduce sway proportionally
///   8. Multi-bay portal: adding bays increases lateral stiffness
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.02;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Braced vs Unbraced Portal: Pinned Diagonal Reduces Sway
// ================================================================
//
// A fixed-base portal frame under lateral load is compared to one
// with a single pinned diagonal brace (truss element: hinge_start
// and hinge_end true, IZ ~ 0). The braced frame should exhibit
// significantly less lateral sway because the diagonal converts
// the frame shear into axial force in the brace.
//
// Reference: Salmon et al., "Steel Structures", 5th Ed., Section 6.2.

#[test]
fn validation_sway_braced_vs_unbraced_portal() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Unbraced portal frame (fixed bases)
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();
    let d_unbraced: f64 = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced portal: add a single pinned diagonal brace (truss element)
    // from node 1 (0,0) to node 3 (w,h)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        // Diagonal brace: pinned both ends, negligible bending stiffness
        (4, "frame", 1, 3, 1, 2, true, true),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 1e-8)], // section 2: brace with negligible IZ
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();
    let d_braced: f64 = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced frame should have significantly less sway
    assert!(
        d_braced < d_unbraced * 0.3,
        "Braced sway ({:.6e}) should be < 30% of unbraced sway ({:.6e})",
        d_braced,
        d_unbraced
    );

    // Both should satisfy global equilibrium
    let sum_rx_u: f64 = res_unbraced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_u, -p, 0.02, "Unbraced: sum_rx = -P");
    let sum_rx_b: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_b, -p, 0.02, "Braced: sum_rx = -P");
}

// ================================================================
// 2. Portal Frame Lateral Stiffness: k = 24EI/h^3
// ================================================================
//
// For a fixed-base portal frame with two identical columns and an
// infinitely rigid beam, the lateral stiffness is k = 24EI/h^3
// (each column contributes 12EI/h^3). With a finite beam stiffness,
// the actual sway will be larger, but the formula provides a lower
// bound on stiffness (upper bound on sway as beam becomes rigid).
//
// We use a very stiff beam (100x column IZ) to approach the rigid
// beam limit, then verify the numerical result matches the formula.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 11.4.

#[test]
fn validation_sway_lateral_stiffness_24ei_h3() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p: f64 = 10.0;
    let e_eff: f64 = E * 1000.0; // solver multiplies E by 1000
    let iz_col: f64 = 1e-4;
    let iz_beam: f64 = 1.0; // very stiff beam (approximates rigid)

    // Portal frame with very stiff beam
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (section 1)
        (2, "frame", 2, 3, 1, 2, false, false), // beam (section 2, very stiff)
        (3, "frame", 3, 4, 1, 1, false, false), // right column (section 1)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Theoretical sway for rigid beam: delta = P*h^3 / (24*E*I)
    let delta_theory: f64 = p * h.powi(3) / (24.0 * e_eff * iz_col);

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let avg_sway: f64 = (d2.ux + d3.ux) / 2.0;

    // With a very stiff beam, the numerical sway should be close to theory
    assert_close(avg_sway, delta_theory, 0.10,
        "Lateral stiffness: sway matches 24EI/h^3 formula");

    // Both top nodes should sway nearly equally (rigid beam enforces compatibility)
    let sway_diff: f64 = (d2.ux - d3.ux).abs();
    assert!(
        sway_diff < avg_sway.abs() * 0.05,
        "Rigid beam: node 2 and node 3 sway should be nearly equal, diff={:.6e}",
        sway_diff
    );
}

// ================================================================
// 3. Two-Story Frame Sway: Inter-Story Drift Increases with Height
// ================================================================
//
// A two-story frame with equal lateral loads at each level.
// The top story has larger total displacement than the first story.
// The cumulative drift at the roof exceeds the first-story drift.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Section 5.7.

#[test]
fn validation_sway_two_story_drift_increases_with_height() {
    let h = 3.5;
    let w = 6.0;
    let p = 10.0; // equal lateral load at each floor

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
    ];

    let elems = vec![
        // Ground story columns
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 4, 3, 1, 1, false, false),
        // Upper story columns
        (3, "frame", 2, 5, 1, 1, false, false),
        (4, "frame", 3, 6, 1, 1, false, false),
        // Beams
        (5, "frame", 2, 3, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];

    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Average sway at each level
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();

    let sway_level1: f64 = (d2.ux + d3.ux) / 2.0;
    let sway_level2: f64 = (d5.ux + d6.ux) / 2.0;

    // Top-level sway must exceed first-level sway (cumulative drift)
    assert!(
        sway_level2 > sway_level1,
        "Roof sway ({:.6e}) must exceed 1st floor sway ({:.6e})",
        sway_level2,
        sway_level1
    );

    // Both levels should sway in the direction of the applied load
    assert!(sway_level1 > 0.0, "Level 1 sway should be positive");
    assert!(sway_level2 > 0.0, "Level 2 sway should be positive");

    // Global equilibrium: total horizontal reactions = sum of lateral loads
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -2.0 * p, 0.02, "Two-story: sum_rx = -2P");
}

// ================================================================
// 4. Portal Frame Symmetric Gravity: Zero Sway
// ================================================================
//
// A symmetric portal frame (equal column heights, equal sections)
// under symmetric gravity loads should have zero lateral sway.
// The symmetric loading produces no net horizontal force, so the
// frame displaces vertically without sidesway.
//
// Reference: McGuire et al., "Matrix Structural Analysis", 2nd Ed., Section 4.5.

#[test]
fn validation_sway_symmetric_gravity_zero_sway() {
    let h = 4.0;
    let w = 6.0;
    let gravity = -20.0; // equal downward load at each top node

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Top nodes should have zero (or negligible) horizontal displacement
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    let sway_2: f64 = d2.ux.abs();
    let sway_3: f64 = d3.ux.abs();

    // Vertical displacement for scale reference
    let vert_2: f64 = d2.uy.abs();

    // Horizontal sway should be negligible compared to vertical deflection
    assert!(
        sway_2 < vert_2 * 0.01 || sway_2 < 1e-10,
        "Node 2 sway ({:.6e}) should be negligible vs vertical ({:.6e})",
        sway_2,
        vert_2
    );
    assert!(
        sway_3 < vert_2 * 0.01 || sway_3 < 1e-10,
        "Node 3 sway ({:.6e}) should be negligible vs vertical ({:.6e})",
        sway_3,
        vert_2
    );

    // Horizontal reactions should be zero (symmetric loading)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert!(
        sum_rx < 1e-6,
        "Sum of horizontal reactions should be zero for symmetric gravity: {:.6e}",
        sum_rx
    );
}

// ================================================================
// 5. Asymmetric Portal (Different Column Heights): Gravity Causes Sway
// ================================================================
//
// When column heights differ in a portal frame, even symmetric gravity
// loads cause lateral sway. The shorter column is stiffer (12EI/h^3),
// so the frame tilts toward the taller column under gravity.
//
// Here we build a portal with left column height h1=4m and right
// column height h2=6m. The beam connects the tops at an incline.
// Gravity loads at both top nodes should produce nonzero sway.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Section 5.9.

#[test]
fn validation_sway_asymmetric_portal_gravity_sway() {
    let h1 = 4.0;
    let h2 = 6.0;
    let w = 6.0;
    let gravity = -20.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, w, h2),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (short)
        (2, "frame", 2, 3, 1, 1, false, false), // inclined beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column (tall)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fy: gravity,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fy: gravity,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Due to asymmetry, horizontal sway should be nonzero
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    let sway_2: f64 = d2.ux.abs();
    let sway_3: f64 = d3.ux.abs();

    // At least one node should have measurable horizontal displacement
    let max_sway: f64 = sway_2.max(sway_3);
    assert!(
        max_sway > 1e-8,
        "Asymmetric portal should sway under gravity: max_sway={:.6e}",
        max_sway
    );

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -2.0 * gravity, 0.02, "Asymmetric portal: sum_ry = -2G");
}

// ================================================================
// 6. Portal Frame Linearity: Doubling Lateral Load Doubles Sway
// ================================================================
//
// For a linear elastic solver, if the lateral load is doubled, the
// lateral sway at every node must also double. This verifies the
// linear superposition property of the stiffness method.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 2.3.

#[test]
fn validation_sway_doubling_load_doubles_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Case 1: load P
    let input1 = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: load 2P
    let input2 = make_portal_frame(h, w, E, A, IZ, 2.0 * p, 0.0);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Check all free nodes
    for node_id in [2_usize, 3] {
        let d1 = res1
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap();
        let d2 = res2
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .unwrap();

        // ux should double
        assert_close(
            d2.ux,
            2.0 * d1.ux,
            0.01,
            &format!("Node {}: ux should double", node_id),
        );

        // uy should double
        assert_close(
            d2.uy,
            2.0 * d1.uy,
            0.01,
            &format!("Node {}: uy should double", node_id),
        );

        // rz should double
        assert_close(
            d2.rz,
            2.0 * d1.rz,
            0.01,
            &format!("Node {}: rz should double", node_id),
        );
    }

    // Reactions should also double
    for node_id in [1_usize, 4] {
        let r1 = res1
            .reactions
            .iter()
            .find(|r| r.node_id == node_id)
            .unwrap();
        let r2 = res2
            .reactions
            .iter()
            .find(|r| r.node_id == node_id)
            .unwrap();

        assert_close(
            r2.rx,
            2.0 * r1.rx,
            0.01,
            &format!("Node {}: rx should double", node_id),
        );
        assert_close(
            r2.ry,
            2.0 * r1.ry,
            0.01,
            &format!("Node {}: ry should double", node_id),
        );
        assert_close(
            r2.mz,
            2.0 * r1.mz,
            0.01,
            &format!("Node {}: mz should double", node_id),
        );
    }
}

// ================================================================
// 7. Portal Frame: Stiffer Columns Reduce Sway Proportionally
// ================================================================
//
// For a fixed-base portal frame with a rigid beam, the lateral
// stiffness is k = 24EI/h^3. Doubling I should halve the sway.
// We compare two portal frames: one with IZ and one with 2*IZ.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 11.4.

#[test]
fn validation_sway_stiffer_columns_reduce_sway() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p: f64 = 10.0;
    let iz1: f64 = 1e-4;
    let iz2: f64 = 2e-4; // doubled column stiffness

    // Both cases use a very stiff beam to approximate rigid beam behavior
    let iz_beam: f64 = 1.0;

    let build_portal = |iz_col: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, 0.0, h),
            (3, w, h),
            (4, w, 0.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 2, false, false), // stiff beam
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, iz_col), (2, A, iz_beam)],
            elems,
            sups,
            loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        let d2 = results
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap();
        d2.ux
    };

    let sway1: f64 = build_portal(iz1);
    let sway2: f64 = build_portal(iz2);

    // Doubling IZ should approximately halve the sway (with rigid beam)
    let ratio: f64 = sway1 / sway2;

    // The ratio should be close to 2.0 (within 10% due to beam flexibility)
    assert!(
        ratio > 1.7 && ratio < 2.3,
        "Doubling IZ should halve sway: ratio={:.4} (expected ~2.0), sway1={:.6e}, sway2={:.6e}",
        ratio,
        sway1,
        sway2
    );
}

// ================================================================
// 8. Multi-Bay Portal: Adding Bays Increases Lateral Stiffness
// ================================================================
//
// A single-bay portal frame has lateral stiffness ~ 24EI/h^3.
// Adding more bays (each with its own pair of columns) increases
// the total lateral stiffness since each column pair contributes.
// For N bays (N+1 columns), stiffness scales roughly as (N+1).
//
// We verify: 1-bay sway > 2-bay sway > 3-bay sway.
//
// Reference: McGuire et al., "Matrix Structural Analysis", 2nd Ed., Section 4.6.

#[test]
fn validation_sway_multi_bay_increases_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let build_multi_bay = |n_bays: usize| -> f64 {
        // Nodes: bottom row (1..n_bays+1) at y=0, top row at y=h
        let n_cols = n_bays + 1;
        let mut nodes = Vec::new();
        let mut elems = Vec::new();
        let mut sups = Vec::new();
        let mut elem_id = 1_usize;
        let mut sup_id = 1_usize;

        // Bottom nodes: 1..n_cols at (i*w, 0)
        // Top nodes: n_cols+1..2*n_cols at (i*w, h)
        for i in 0..n_cols {
            let bot_id = i + 1;
            let top_id = n_cols + i + 1;
            nodes.push((bot_id, i as f64 * w, 0.0));
            nodes.push((top_id, i as f64 * w, h));

            // Column: bot -> top
            elems.push((elem_id, "frame", bot_id, top_id, 1, 1, false, false));
            elem_id += 1;

            // Fixed support at base
            sups.push((sup_id, bot_id, "fixed"));
            sup_id += 1;
        }

        // Beams connecting top nodes
        for i in 0..n_bays {
            let left_top = n_cols + i + 1;
            let right_top = n_cols + i + 2;
            elems.push((elem_id, "frame", left_top, right_top, 1, 1, false, false));
            elem_id += 1;
        }

        // Lateral load at top-left node
        let top_left = n_cols + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_left,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];

        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Return sway at the loaded top node
        results
            .displacements
            .iter()
            .find(|d| d.node_id == top_left)
            .unwrap()
            .ux
            .abs()
    };

    let sway_1bay: f64 = build_multi_bay(1);
    let sway_2bay: f64 = build_multi_bay(2);
    let sway_3bay: f64 = build_multi_bay(3);

    // More bays = more columns = stiffer frame = less sway
    assert!(
        sway_2bay < sway_1bay,
        "2-bay sway ({:.6e}) should be less than 1-bay sway ({:.6e})",
        sway_2bay,
        sway_1bay
    );
    assert!(
        sway_3bay < sway_2bay,
        "3-bay sway ({:.6e}) should be less than 2-bay sway ({:.6e})",
        sway_3bay,
        sway_2bay
    );

    // The stiffness increase should be roughly proportional to column count:
    // 1-bay has 2 columns, 2-bay has 3 columns, so ratio ~ 3/2 = 1.5
    let ratio_1_2: f64 = sway_1bay / sway_2bay;
    assert!(
        ratio_1_2 > 1.2 && ratio_1_2 < 2.5,
        "1bay/2bay sway ratio={:.4}, expected roughly 1.5",
        ratio_1_2
    );

    // 2-bay has 3 columns, 3-bay has 4 columns, so ratio ~ 4/3 = 1.33
    let ratio_2_3: f64 = sway_2bay / sway_3bay;
    assert!(
        ratio_2_3 > 1.1 && ratio_2_3 < 2.0,
        "2bay/3bay sway ratio={:.4}, expected roughly 1.33",
        ratio_2_3
    );
}
