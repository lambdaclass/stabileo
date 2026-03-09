/// Validation: Load path behavior and structural redundancy concepts.
///
/// Tests verify that parallel load paths share load according to stiffness,
/// redundant supports redistribute forces, and added bracing/members change
/// structural response in physically meaningful ways.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// 1. Two parallel load paths share load equally
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_two_parallel_paths_equal_share() {
    // Two identical frame elements between the same two nodes.
    // Axial load at free end: each element carries half.
    // N1 = N2 = F/2 = 20 kN.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 1, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 40.0, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Each element carries 20 kN axial (half of 40 kN)
    assert_close(ef1.n_start.abs(), 20.0, 0.02, "path 1 axial force");
    assert_close(ef2.n_start.abs(), 20.0, 0.02, "path 2 axial force");

    // Both should carry the same force (symmetry)
    assert_close(ef1.n_start, ef2.n_start, 0.01, "equal load sharing");
}

// ═══════════════════════════════════════════════════════════════
// 2. Unequal stiffness: stiffer path carries more
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_unequal_stiffness_load_distribution() {
    // Two parallel frame elements between same nodes, different cross-sections.
    // Element 1: A=0.01 (section 1), Element 2: A=0.02 (section 2).
    // Total stiffness: k_tot = EA1/L + EA2/L. Force in proportion to stiffness.
    // F1/F2 = A1/A2 = 1/2. With F_total=40 kN: F1=40/3, F2=80/3.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.02, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 1, 2, 1, 2, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 40.0, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    let f1_expected = 40.0 / 3.0;  // ~13.33 kN
    let f2_expected = 80.0 / 3.0;  // ~26.67 kN

    assert_close(ef1.n_start.abs(), f1_expected, 0.02, "softer path force");
    assert_close(ef2.n_start.abs(), f2_expected, 0.02, "stiffer path force");

    // Stiffer path carries more
    assert!(
        ef2.n_start.abs() > ef1.n_start.abs(),
        "stiffer element should carry more: |N2|={:.2} > |N1|={:.2}",
        ef2.n_start.abs(), ef1.n_start.abs()
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Redundant support: 3 supports on 2-span continuous beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_redundant_support_continuous_beam() {
    // Two-span continuous beam: L1=L2=5m, UDL q=-10 kN/m.
    // 3 supports: pinned at 0, rollerX at 5m, rollerX at 10m.
    // This is statically indeterminate (1 redundant support).
    // Total load = q*L = 10*10 = 100 kN downward -> reactions sum to 100.
    // Interior reaction is nonzero and differs from simply-supported case.
    let q = -10.0;
    let n_per_span = 4;
    let mut loads = Vec::new();
    let total_elems = n_per_span * 2;
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[5.0, 5.0],
        n_per_span,
        E, A, IZ,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction should equal total load magnitude
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 100.0, 0.01, "total vertical reaction = wL");

    // Interior support (node 5) should carry nonzero reaction
    let r_interior = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert!(
        r_interior.ry.abs() > 10.0,
        "interior reaction should be significant: ry={:.2}", r_interior.ry
    );

    // For a 2-span continuous beam with equal spans and UDL, the exact
    // interior reaction is 5/4 * wL_span = 5/4 * 10 * 5 = 62.5 kN.
    // (Three-moment equation result.)
    assert_close(r_interior.ry, 62.5, 0.03, "interior reaction 5wL/4");

    // End reactions: each = 3/8 * wL_span = 3/8 * 50 = 18.75 kN
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == (n_per_span * 2 + 1))
        .unwrap();
    assert_close(r_left.ry, 18.75, 0.03, "left end reaction 3wL/8");
    assert_close(r_right.ry, 18.75, 0.03, "right end reaction 3wL/8");
}

// ═══════════════════════════════════════════════════════════════
// 4. Adding a brace reduces sway (redundancy adds stiffness)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_brace_reduces_sway() {
    // Portal frame h=4, w=6, lateral H=10 kN at top-left.
    // Case 1: unbraced portal frame.
    // Case 2: add diagonal truss brace from node 1 to node 3.
    // Braced sway at top should be significantly less than unbraced.
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Case 1: unbraced portal
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    // Case 2: braced portal (add diagonal truss brace 1→3)
    let input_braced = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // beam
            (3, "frame", 3, 4, 1, 1, false, false), // right column
            (4, "truss", 1, 3, 1, 1, false, false), // diagonal brace
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results_braced = linear::solve_2d(&input_braced).unwrap();

    // Compare sway at node 2
    let sway_unbraced = results_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let sway_braced = results_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    assert!(sway_unbraced > 0.0, "unbraced sway should be positive");
    assert!(sway_braced > 0.0, "braced sway should be positive");
    assert!(
        sway_braced < sway_unbraced,
        "brace should reduce sway: braced={:.6} < unbraced={:.6}",
        sway_braced, sway_unbraced
    );

    // Brace should provide substantial stiffening (at least 50% reduction)
    let reduction = (sway_unbraced - sway_braced) / sway_unbraced;
    assert!(
        reduction > 0.5,
        "brace should reduce sway significantly: reduction={:.1}%",
        reduction * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Rectangular truss with diagonal (redundant member)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_truss_with_diagonal_equilibrium() {
    // Rectangular truss with diagonal brace.
    // Nodes: 1(0,0), 2(4,0), 3(4,3), 4(0,3).
    // Elements: 1→2 (bottom), 2→3 (right), 3→4 (top), 4→1 (left), 1→3 (diagonal).
    // Pinned at 1, rollerX at 2. Load fy=-20 at node 4 (top-left, not above any support).
    // The load at node 4 must travel through the truss to reach the supports.
    // Node 4 connects to element 3 (top, 3→4) and element 4 (left, 4→1).
    // The diagonal (1→3) provides the essential load path for stability.
    let a_truss = 0.001;
    let iz_truss = 0.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 3.0), (4, 0.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, iz_truss)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom
            (2, "truss", 2, 3, 1, 1, false, false), // right
            (3, "truss", 3, 4, 1, 1, false, false), // top
            (4, "truss", 4, 1, 1, 1, false, false), // left
            (5, "truss", 1, 3, 1, 1, false, false), // diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -20.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum_ry = 20 (upward to balance -20 downward)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 20.0, 0.01, "truss sum_ry = applied load");

    // sum_rx = 0 (no horizontal applied load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.5, "truss sum_rx should be ~0: got {:.4}", sum_rx);

    // Element 4 (left, 4→1) carries load directly from node 4 to node 1.
    // But node 4 is directly above node 1, so element 4 takes the full vertical load.
    // That means the vertical load goes straight down element 4.
    // However the pinned support at node 1 provides both rx and ry.
    // Moment about node 1: R2y * 4 + 0 - (-20) * 0 = 0 → R2y = 0.
    // So R1y = 20, R2y = 0. All vertical reaction at node 1.
    // The load goes through element 4 (left column) compression.

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, 20.0, 0.02, "left support carries full vertical load");
    assert!(r2.ry.abs() < 1.0, "right support vertical ~0: got {:.4}", r2.ry);

    // Left column element 4 (4→1) should carry the load
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(
        ef_left.n_start.abs() > 15.0,
        "left column must carry significant force: N={:.4}", ef_left.n_start
    );

    // The structure is stable (solved without error) — the diagonal prevents mechanism.
    // Verify the model produces valid displacements at all nodes.
    assert_eq!(results.displacements.len(), 4, "all 4 nodes have displacements");
}

// ═══════════════════════════════════════════════════════════════
// 6. Load redistribution with hinge at midspan
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_load_redistribution_with_hinge() {
    // Fixed-fixed beam L=8m, 4 elements, UDL q=-10 kN/m.
    // Case 1: no hinges → M_end = wL²/12 = 10*64/12 ≈ 53.33 kN·m.
    // Case 2: hinge at midspan → moment released there, supports take more.
    // The hinge changes the structural behavior from indeterminate to partially released.
    let l = 8.0;
    let q = -10.0;
    let n_elems = 4;
    let elem_len = l / n_elems as f64;

    // Case 1: no hinges (fixed-fixed)
    let nodes: Vec<_> = (0..=n_elems).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems_no_hinge: Vec<_> = (0..n_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mut loads = Vec::new();
    for i in 0..n_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input_no_hinge = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_no_hinge,
        vec![(1, 1, "fixed"), (2, n_elems + 1, "fixed")],
        loads.clone(),
    );
    let results_no_hinge = linear::solve_2d(&input_no_hinge).unwrap();

    // Case 2: hinge at midspan (between elements 2 and 3)
    let elems_with_hinge = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, true),  // hinge at end of elem 2
        (3, "frame", 3, 4, 1, 1, true, false),   // hinge at start of elem 3
        (4, "frame", 4, 5, 1, 1, false, false),
    ];

    let input_with_hinge = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_with_hinge,
        vec![(1, 1, "fixed"), (2, n_elems + 1, "fixed")],
        loads.clone(),
    );
    let results_with_hinge = linear::solve_2d(&input_with_hinge).unwrap();

    // Fixed-fixed beam: M_end = wL²/12 ≈ 53.33
    let r1_no_hinge = results_no_hinge.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_no_hinge.mz.abs(), 10.0 * 64.0 / 12.0, 0.03, "fixed-fixed end moment");

    // With hinge: support moment must change (hinge releases interior moment)
    let r1_with_hinge = results_with_hinge.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // The moment at the hinge location should be zero
    let ef2_hinge = results_with_hinge.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(
        ef2_hinge.m_end.abs() < 0.5,
        "moment at hinge should be ~0: got {:.4}", ef2_hinge.m_end
    );

    // Support moments should differ between the two cases
    let diff = (r1_with_hinge.mz.abs() - r1_no_hinge.mz.abs()).abs();
    assert!(
        diff > 1.0,
        "hinge should redistribute moments: no_hinge={:.2}, with_hinge={:.2}",
        r1_no_hinge.mz.abs(), r1_with_hinge.mz.abs()
    );

    // Total vertical reaction should be the same for both cases (= wL = 80 kN)
    let sum_ry_no_hinge: f64 = results_no_hinge.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_with_hinge: f64 = results_with_hinge.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_no_hinge, 80.0, 0.01, "no-hinge total Ry");
    assert_close(sum_ry_with_hinge, 80.0, 0.01, "with-hinge total Ry");
}

// ═══════════════════════════════════════════════════════════════
// 7. Parallel cantilevers: shorter beam is stiffer (δ ∝ L³)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_cantilever_stiffness_vs_length() {
    // Two cantilever beams with same EI but different lengths.
    // Beam A: L=6m, P=-10 at tip. Beam B: L=3m, P=-10 at tip.
    // δ = PL³/(3EI). So δ_A/δ_B = (6/3)³ = 8.
    let p = -10.0;

    // Beam A: L=6m cantilever (fixed at left, free at right)
    let input_a = make_beam(
        4, 6.0, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results_a = linear::solve_2d(&input_a).unwrap();

    // Beam B: L=3m cantilever
    let input_b = make_beam(
        4, 3.0, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results_b = linear::solve_2d(&input_b).unwrap();

    // Tip deflections
    let tip_a = results_a.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;
    let tip_b = results_b.displacements.iter().find(|d| d.node_id == 5).unwrap().uy;

    // Both should deflect downward
    assert!(tip_a < 0.0, "beam A tip should deflect down");
    assert!(tip_b < 0.0, "beam B tip should deflect down");

    // Shorter beam is stiffer → smaller deflection
    assert!(
        tip_b.abs() < tip_a.abs(),
        "shorter beam should deflect less: |δ_B|={:.6} < |δ_A|={:.6}",
        tip_b.abs(), tip_a.abs()
    );

    // Ratio should be 8 (δ_A/δ_B = (L_A/L_B)³ = 8)
    let ratio = tip_a / tip_b;
    assert_close(ratio, 8.0, 0.02, "deflection ratio L^3");

    // Verify absolute values: δ = PL³/(3EI)
    // E = 200000 MPa = 200000 MN/m² = 200000 * 1000 kN/m².
    // EI = 200000 * 1000 * 1e-4 = 20000 kN·m².
    // δ = PL³/(3EI) = 10 * 216 / (3 * 20000) = 0.036 m.
    let ei_kn_m2 = E * 1000.0 * IZ; // MPa → kN/m², then * Iz
    let delta_a_exact = (p.abs() * 6.0_f64.powi(3)) / (3.0 * ei_kn_m2);
    assert_close(tip_a.abs(), delta_a_exact, 0.02, "beam A absolute deflection");
}

// ═══════════════════════════════════════════════════════════════
// 8. Global equilibrium with two columns of different stiffness
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_two_column_frame_equilibrium_and_shear_distribution() {
    // Frame with two columns of different stiffness connected by a beam.
    // Nodes: 1(0,0), 2(0,4), 3(6,4), 4(6,0).
    // Column 1→2: section 1 (Iz=1e-4). Column 4→3: section 2 (Iz=2e-4).
    // Beam 2→3: section 1. All fixed at base (1 and 4).
    // Lateral load H=20 kN at node 2.
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 2.0 * IZ)],  // section 2 has 2x stiffness
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column (softer)
            (2, "frame", 2, 3, 1, 1, false, false), // beam
            (3, "frame", 4, 3, 1, 2, false, false), // right column (stiffer)
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum_rx + H = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "horizontal equilibrium sum_rx = -H");

    // sum_ry = 0 (no vertical applied load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.5, "vertical equilibrium sum_ry ~0: got {:.4}", sum_ry);

    // Moment equilibrium about origin (node 1 at 0,0):
    // M = x*Fy - y*Fx for each force, plus moment reactions.
    // Node 1 (0,0): M1
    // Node 4 (6,0): 6*R4y - 0*R4x + M4 = 6*R4y + M4
    // Applied H=20 at node 2 (0,4): 0*0 - 4*H = -4*20 = -80
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let moment_about_origin = r1.mz + r4.mz + r4.ry * w - lateral * h;
    assert!(
        moment_about_origin.abs() < 1.0,
        "moment equilibrium about origin: {:.4}", moment_about_origin
    );

    // Stiffer column (element 3, node 4→3) should carry more shear than
    // softer column (element 1, node 1→2).
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Shear in columns (horizontal direction for vertical columns = v_start)
    let shear_left = ef_left.v_start.abs();
    let shear_right = ef_right.v_start.abs();

    assert!(
        shear_right > shear_left,
        "stiffer column should carry more shear: right={:.2} > left={:.2}",
        shear_right, shear_left
    );
}
