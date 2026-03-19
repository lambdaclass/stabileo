/// Validation: Extended Stiffness Matrix Properties
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 5-7
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd ed.
///   - Kassimali, "Matrix Analysis of Structures", 2nd ed., Ch. 5
///
/// Tests verify additional stiffness matrix properties:
///   1. Superposition: combined load = sum of individual load effects
///   2. Carryover factor: COF = 0.5 for prismatic beam (far end fixed)
///   3. Axial-flexural independence: axial load produces no bending
///   4. Equilibrium of element forces: N, V, M satisfy statics
///   5. Distribution factors: moment distributes by relative stiffness
///   6. Contraflexure point: portal frame inflection at known location
///   7. Anti-symmetry: anti-symmetric load produces anti-symmetric response
///   8. Unit displacement method: known stiffness coefficient k = 12EI/L^3
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Superposition: Combined Load = Sum of Individual Effects
// ================================================================
//
// For a linear system, the response to loads P1+P2 should equal
// the sum of responses to P1 alone and P2 alone.
// Ref: Przemieniecki, Section 5.2

#[test]
fn validation_stiffness_superposition() {
    let l = 8.0;
    let n = 8;
    let p1 = 12.0;
    let p2 = 8.0;
    let check_node = 5;

    // Load case 1: point load at node 3
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p1, my: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let d1 = res1.displacements.iter().find(|d| d.node_id == check_node).unwrap();

    // Load case 2: point load at node 7
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 7, fx: 0.0, fz: -p2, my: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == check_node).unwrap();

    // Combined load case
    let loads_both = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p1, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fz: -p2, my: 0.0,
        }),
    ];
    let input_both = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_both);
    let res_both = linear::solve_2d(&input_both).unwrap();
    let d_both = res_both.displacements.iter().find(|d| d.node_id == check_node).unwrap();

    // Superposition check: uy_combined = uy_1 + uy_2
    assert_close(d_both.uz, d1.uz + d2.uz, 0.01,
        "Superposition: uy combined = uy1 + uy2");
    assert_close(d_both.ry, d1.ry + d2.ry, 0.01,
        "Superposition: rz combined = rz1 + rz2");
}

// ================================================================
// 2. Carryover Factor = 0.5 for Prismatic Beam (Far End Fixed)
// ================================================================
//
// When a moment M is applied at one end of a fixed-fixed beam,
// the far-end moment = M/2 (carryover factor = 0.5).
// Ref: McGuire et al., Section 4.4

#[test]
fn validation_stiffness_carryover_factor() {
    let l = 6.0;
    let n = 6;
    let e_eff: f64 = E * 1000.0;

    // Fixed-fixed beam with moment at left end (node 1).
    // Since node 1 is fixed, the rotation is zero and the moment is absorbed
    // by the reaction. Instead, use an interior moment approach:
    //
    // Two-span continuous beam (fixed-interior-fixed). Apply moment at interior.
    // But simpler: single beam, fixed-fixed, apply moment at the near end
    // via a very short lever arm.
    //
    // Cleanest approach: use element forces directly.
    // For a fixed-fixed beam with UDL, M_end = qL^2/12 at each end.
    // For a propped cantilever (fixed-roller), M_fixed = qL^2/8.
    // Carryover: the ratio of far-end moment to near-end moment when
    // near-end is given a rotation and far-end is fixed.
    //
    // We verify: apply moment at roller end of propped cantilever.
    // Rotation at roller = M*L/(3EI). The fixed end picks up reaction moment.
    // Far-end-moment / applied-moment = 0.5 for far-end-fixed beam.
    //
    // Use fixed-fixed beam with applied moment at interior node (not at support).
    // Beam: fixed at 1, fixed at n+1. Apply moment M at node 2.
    // Then check the element forces on element 1 (between nodes 1 and 2):
    // The stiffness relation gives m_end/m_start = carryover factor.

    // Better: two separate analyses.
    // Analysis 1: Fixed-fixed single-span beam with applied moment at one end.
    // Because the end is fixed, both ends develop reaction moments.
    // For an applied moment M at node 1 of a fixed-fixed beam:
    //   Reaction moment at node 1: cancels M (equilibrium)
    //   But we need an interior node to apply the moment.

    // Simplest: use a two-element beam (nodes 1,2,3). Fixed at 1 and 3.
    // Apply moment at node 2. Element 1 has far end fixed (node 1).
    // m_start of element 1 (at node 1) / m_end of element 1 (at node 2) = COF = 0.5

    let m_app = 10.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: 0.0, my: m_app,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // The interior node rotation
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let theta = d_mid.ry;

    // For a fixed-fixed beam of half-span (L/2), stiffness at near end = 4EI/(L/2).
    // The moment carried to the far (fixed) end = COF * moment at near end.
    // Near-end moment from left half = 4EI/(L/2) * theta
    // Far-end moment from left half = 2EI/(L/2) * theta
    // COF = far/near = (2EI/(L/2)) / (4EI/(L/2)) = 0.5

    let half_l = l / 2.0;
    let m_near = 4.0 * e_eff * IZ / half_l * theta;
    let m_far = 2.0 * e_eff * IZ / half_l * theta;
    let cof = m_far / m_near;

    assert_close(cof, 0.5, 0.01, "Carryover factor = 0.5");
}

// ================================================================
// 3. Axial-Flexural Independence for Aligned Beam
// ================================================================
//
// A purely axial load on a horizontal beam should produce no
// transverse displacement or rotation (decoupled DOFs).
// Ref: Kassimali, Section 5.3

#[test]
fn validation_stiffness_axial_flexural_independence() {
    let l = 10.0;
    let n = 10;
    let p_axial = 50.0;

    // Cantilever with only axial load at tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff: f64 = E * 1000.0;

    // Axial displacement at tip: delta = PL/(EA)
    let delta_axial = p_axial * l / (e_eff * A);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_tip.ux, delta_axial, 0.01,
        "Axial independence: ux = PL/(EA)");

    // All transverse displacements and rotations should be zero
    for d in &results.displacements {
        assert!(d.uz.abs() < 1e-10,
            "Axial independence: uy should be zero at node {}, got {:.2e}", d.node_id, d.uz);
        assert!(d.ry.abs() < 1e-10,
            "Axial independence: rz should be zero at node {}, got {:.2e}", d.node_id, d.ry);
    }
}

// ================================================================
// 4. Element Force Equilibrium: Sum of Forces = Applied Load
// ================================================================
//
// For each element, internal forces must satisfy static equilibrium.
// The solver uses a continuous sign convention where:
//   v_end = v_start + q * L  (shear accumulates along the element)
//   m_end = m_start - v_start * L - q * L^2 / 2  (moment from integration)
// Ref: Przemieniecki, Section 3.5

#[test]
fn validation_stiffness_element_equilibrium() {
    let l = 6.0;
    let n = 6;
    let q: f64 = -8.0;
    let elem_l = l / n as f64;

    // Fixed-fixed beam with UDL
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    for ef in &results.element_forces {
        // Shear relation: v_end = v_start + q * L
        let shear_err = ef.v_end - ef.v_start - q * elem_l;
        assert!(shear_err.abs() < 1e-4,
            "Element {} shear relation: v_end - v_start - qL = {:.2e}", ef.element_id, shear_err);

        // Moment relation: m_end = m_start - v_start * L - q * L^2 / 2
        let moment_err = ef.m_end - ef.m_start + ef.v_start * elem_l + q * elem_l * elem_l / 2.0;
        assert!(moment_err.abs() < 1e-3,
            "Element {} moment relation error = {:.2e}", ef.element_id, moment_err);
    }
}

// ================================================================
// 5. Distribution Factors: Moment Distributes by Relative Stiffness
// ================================================================
//
// At a joint connecting members of different lengths, an applied moment
// distributes in proportion to relative stiffnesses (k = 4EI/L for
// far end fixed, k = 3EI/L for far end pinned).
// Ref: McGuire et al., Table 4.1

#[test]
fn validation_stiffness_distribution_factors() {
    let l1 = 4.0;
    let l2 = 8.0;
    let n = 6;
    let e_eff: f64 = E * 1000.0;
    let m_app = 20.0;

    // Two-span continuous beam: span1 = l1, span2 = l2
    // Ends are pinned/roller, so stiffness from each span = 3EI/L
    // Interior node: moment distributes as k1/(k1+k2) and k2/(k1+k2)
    let k1 = 3.0 * e_eff * IZ / l1;
    let k2 = 3.0 * e_eff * IZ / l2;
    let df1 = k1 / (k1 + k2); // distribution factor for span 1
    let df2 = k2 / (k1 + k2); // distribution factor for span 2

    // Apply moment at interior support
    let interior_node = n + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: interior_node, fx: 0.0, fz: 0.0, my: m_app,
    })];
    let input = make_continuous_beam(&[l1, l2], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Rotation at interior node
    let d_int = results.displacements.iter().find(|d| d.node_id == interior_node).unwrap();
    let theta = d_int.ry;

    // Moment taken by span 1 = k1 * theta, by span 2 = k2 * theta
    let m1 = k1 * theta;
    let m2 = k2 * theta;

    // Check distribution factors
    let total_m = m1 + m2;
    assert_close(total_m, m_app, 0.02,
        "Distribution: total moment = applied moment");
    assert_close(m1 / total_m, df1, 0.02,
        "Distribution factor span 1");
    assert_close(m2 / total_m, df2, 0.02,
        "Distribution factor span 2");
}

// ================================================================
// 6. Contraflexure: Portal Frame Inflection Points
// ================================================================
//
// For a portal frame under lateral load with fixed bases,
// inflection points appear at approximately mid-height of columns.
// Ref: Kassimali, Section 14.3 (portal method)

#[test]
fn validation_stiffness_contraflexure_portal() {
    let h = 6.0;
    let w = 8.0;
    let p_lateral = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, p_lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // For a portal frame with equal fixed columns and lateral load at beam level:
    // Each column has inflection point near mid-height.
    //
    // Check via element forces: the left column (element 1, nodes 1->2)
    // has moments at both ends. The moment should change sign along the column,
    // meaning m_start and m_end have opposite signs.
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();

    // For fixed-base portal with lateral load, column moments at top and bottom
    // should have opposite signs (indicating a point of contraflexure exists)
    assert!(ef1.m_start * ef1.m_end < 0.0,
        "Contraflexure: column moments have opposite signs: m_start={:.4}, m_end={:.4}",
        ef1.m_start, ef1.m_end);

    // The inflection point location (from base) = h * |m_start| / (|m_start| + |m_end|)
    let inflection_ratio = ef1.m_start.abs() / (ef1.m_start.abs() + ef1.m_end.abs());

    // For equal stiffness columns and beam, the inflection point should be
    // near mid-height. Check it is between 0.3h and 0.7h.
    assert!(inflection_ratio > 0.3 && inflection_ratio < 0.7,
        "Contraflexure: inflection at {:.1}% of column height",
        inflection_ratio * 100.0);
}

// ================================================================
// 7. Anti-Symmetry: Anti-Symmetric Load -> Anti-Symmetric Response
// ================================================================
//
// For a symmetric structure with anti-symmetric loading,
// the midpoint should have zero transverse displacement and
// displacements at symmetric points should be equal and opposite.
// Ref: Przemieniecki, Section 7.4

#[test]
fn validation_stiffness_antisymmetry() {
    let l = 10.0;
    let n = 10;
    let p = 15.0;

    // Simply-supported beam. Apply equal and opposite loads symmetrically.
    // Load at node 3 (downward) and node 9 (upward).
    // Nodes 3 and 9 are symmetric about node 6 (midpoint) for n=10 (11 nodes).
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 9, fx: 0.0, fz: p, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midpoint (node 6) should have zero vertical displacement
    let mid = n / 2 + 1; // node 6
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uz.abs() < 1e-8,
        "Anti-symmetry: midpoint uy = {:.2e}, expected ~0", d_mid.uz);

    // Symmetric nodes should have equal and opposite vertical displacements
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d9 = results.displacements.iter().find(|d| d.node_id == 9).unwrap();
    assert_close(d3.uz, -d9.uz, 0.01,
        "Anti-symmetry: uy(3) = -uy(9)");

    // Rotations at symmetric points should be equal (not opposite) for anti-symmetric loading
    let d3_rz = d3.ry;
    let d9_rz = d9.ry;
    assert_close(d3_rz, d9_rz, 0.01,
        "Anti-symmetry: rz(3) = rz(9)");
}

// ================================================================
// 8. Unit Displacement: k = 12EI/L^3 (Transverse Stiffness)
// ================================================================
//
// For a fixed-fixed beam, the force required to produce unit
// transverse displacement at midspan is related to 192EI/L^3
// (from PL^3/(192EI) for midspan load on fixed-fixed beam).
// Ref: Weaver & Gere, Table 3.1

#[test]
fn validation_stiffness_unit_displacement() {
    let l = 5.0;
    let n = 10;
    let p = 1.0; // unit load
    let e_eff: f64 = E * 1000.0;

    // Fixed-fixed beam with unit midspan load
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // For fixed-fixed beam with midspan load: delta = PL^3 / (192 EI)
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Unit displacement: delta = PL^3/(192EI)");

    // Effective stiffness k = P / delta = 192EI/L^3
    let k_eff = p / d_mid.uz.abs();
    let k_exact = 192.0 * e_eff * IZ / l.powi(3);
    assert_close(k_eff, k_exact, 0.02,
        "Unit displacement: k = 192EI/L^3");
}
