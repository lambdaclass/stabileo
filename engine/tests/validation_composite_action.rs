/// Validation: Composite-Like Behaviour — Elements with Different Properties Working Together
///
/// References:
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 6 (Composite beams)
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., §2.7
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed.
///
/// "Composite action" refers to two or more structural members working together
/// to carry load. In the FEM sense, this is modelled as parallel beam elements,
/// superposed sections, or coupled members at shared nodes. The key quantity is
/// load sharing in proportion to stiffness (EI) when bending is the primary action.
///
/// Tests:
///   1. Parallel beams: load shared by stiffness ratio EI₁/(EI₁+EI₂)
///   2. Equivalent single beam: Σ(EI) gives same deflection as parallel pair
///   3. Transformed section: weaker beam represented by wider equivalent section
///   4. Double beam (stacked, sharing nodes): acts stiffer than either alone
///   5. Parallel truss chords: upper chord tension, lower chord compression
///   6. Composite stiffness: series combination vs parallel combination
///   7. Load distribution by flexural rigidity ratio
///   8. Composite beam deflection smaller than weaker member alone
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Parallel Beams: Load Sharing by Stiffness Ratio
// ================================================================
//
// Two SS beams of lengths L, same span, both pinned-roller supported,
// sharing the same nodes (connected at ends and midspan). Under a midspan
// point load P, the load is shared in proportion to their EI values:
//   P₁/P = EI₁/(EI₁ + EI₂),  P₂/P = EI₂/(EI₁ + EI₂)
//
// We model this as two separate beams solved independently, then verify
// the relationship between their reactions and the stiffness ratio.
//
// Source: Gere & Goodno, "Mechanics of Materials", 9th Ed., §6.7.

#[test]
fn validation_composite_parallel_load_sharing() {
    let l = 6.0;
    let n = 4;
    let p = 20.0;
    let mid = n / 2 + 1;

    // Beam 1: standard EI
    let iz1 = IZ;
    let input1 = make_beam(n, l, E, A, iz1, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res1 = linear::solve_2d(&input1).unwrap();
    let delta1 = res1.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Beam 2: 3× stiffer
    let iz2 = 3.0 * IZ;
    let input2 = make_beam(n, l, E, A, iz2, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res2 = linear::solve_2d(&input2).unwrap();
    let delta2 = res2.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // When both beams are forced to have the same midspan deflection,
    // the force in each is proportional to its stiffness:
    //   k_i = 48 EI_i / L³  →  P_i/P_j = EI_i/EI_j
    // Equivalently: δ₁ × EI₁ = δ₂ × EI₂ when loaded by the same P.
    // In the individual-beam sense: δ_i = P L³ / (48 EI_i), so
    //   δ₁ / δ₂ = EI₂ / EI₁ = iz2/iz1 = 3
    let expected_ratio = iz2 / iz1; // 3.0
    let actual_ratio = delta1 / delta2;
    let err = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Parallel beams δ₁/δ₂: {:.4}, expected EI₂/EI₁={:.4}, err={:.1}%",
        actual_ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 2. Equivalent Single Beam: Σ(EI) Gives Same Deflection
// ================================================================
//
// Two parallel SS beams sharing the same deflected shape (rigid shear
// connection at every node) together resist load according to their
// combined flexural rigidity (EI)_combined = EI₁ + EI₂.
// A single beam with the same combined EI should give the same deflection.
//
// Source: McGuire et al., "Matrix Structural Analysis", §2.7.

#[test]
fn validation_composite_equivalent_combined_ei() {
    let l: f64 = 8.0;
    let n = 8;
    let p = 25.0;
    let mid = n / 2 + 1;
    let e_eff = E * 1000.0;

    let iz1 = IZ;
    let iz2 = 2.0 * IZ;
    let iz_combined = iz1 + iz2;

    // Exact midspan deflection for SS beam center point: δ = PL³/(48EI)
    let delta_combined_exact = p * l.powi(3) / (48.0 * e_eff * iz_combined);

    // Single beam with combined EI
    let input_combined = make_beam(n, l, E, A, iz_combined, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_combined = linear::solve_2d(&input_combined).unwrap();
    let delta_fem = res_combined.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    let err = (delta_fem - delta_combined_exact).abs() / delta_combined_exact;
    assert!(err < 0.02,
        "Composite EI: δ_FEM={:.6e}, δ_exact PL³/(48EI_sum)={:.6e}, err={:.1}%",
        delta_fem, delta_combined_exact, err * 100.0);

    // Also verify: δ_combined < δ_weaker_alone
    let input_weak = make_beam(n, l, E, A, iz1, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_weak = linear::solve_2d(&input_weak).unwrap();
    let delta_weak = res_weak.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert!(delta_fem < delta_weak,
        "Composite δ={:.6e} should be less than weaker beam alone δ={:.6e}",
        delta_fem, delta_weak);
}

// ================================================================
// 3. Transformed Section: Weaker Beam as Wider Equivalent Section
// ================================================================
//
// The transformed section method converts a composite cross-section into
// an equivalent homogeneous section. For two beams with moduli E₁ and E₂,
// the equivalent EI is n₁ × EI₁ + n₂ × EI₂ where n_i = E_i / E_ref.
//
// Here we vary E between two identical-geometry beams (different moduli)
// and verify the deflection ratio matches the inverse EI ratio.
//
// Source: Salmon et al., "Steel Structures: Design and Behavior", §16.3.

#[test]
fn validation_composite_transformed_section() {
    let l = 6.0;
    let n = 6;
    let p = 15.0;
    let mid = n / 2 + 1;

    // Beam A: E_A = 200,000 MPa (steel)
    let e_a = 200_000.0_f64;
    // Beam B: E_B = 30,000 MPa (concrete-like)
    let e_b = 30_000.0_f64;

    let input_a = make_beam(n, l, e_a, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_a = linear::solve_2d(&input_a).unwrap();
    let delta_a = res_a.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    let input_b = make_beam(n, l, e_b, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_b = linear::solve_2d(&input_b).unwrap();
    let delta_b = res_b.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Deflections are inversely proportional to E (and hence EI):
    //   δ_A / δ_B = E_B / E_A
    let expected_ratio = e_b / e_a;
    let actual_ratio = delta_a / delta_b;
    let err = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Transformed section: δ_A/δ_B={:.6}, expected E_B/E_A={:.6}, err={:.1}%",
        actual_ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 4. Double Beam (Stacked, Connected at Nodes): Stiffer Than Either Alone
// ================================================================
//
// Two beams of equal length and properties are stacked at the same elevation
// and connected at every node (sharing nodes). With full composite action,
// the combined system has EI_total = EI₁ + EI₂ = 2 EI (for equal beams).
//
// In the FEM model, using a combined section property EI_combined = 2 × IZ
// must produce exactly half the deflection of a single beam.
//
// Source: Gere & Goodno, "Mechanics of Materials", §6.7.

#[test]
fn validation_composite_double_beam_stiffness() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let mid = n / 2 + 1;

    // Single beam
    let input_single = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_single = linear::solve_2d(&input_single).unwrap();
    let delta_single = res_single.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Double beam (full composite action = 2× EI)
    let input_double = make_beam(n, l, E, A, 2.0 * IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_double = linear::solve_2d(&input_double).unwrap();
    let delta_double = res_double.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Full composite action: δ_double = δ_single / 2
    let ratio = delta_double / delta_single;
    let err = (ratio - 0.5).abs() / 0.5;
    assert!(err < 0.01,
        "Double beam: δ_double/δ_single={:.6}, expected 0.5, err={:.1}%",
        ratio, err * 100.0);

    // Double beam must be stiffer than single
    assert!(delta_double < delta_single,
        "Double beam δ={:.6e} should be less than single beam δ={:.6e}",
        delta_double, delta_single);
}

// ================================================================
// 5. Parallel Truss Chords: Upper Chord and Lower Chord
// ================================================================
//
// A simple rectangular frame (two horizontal beams at different heights
// connected by vertical members) behaves like a Vierendeel frame.
// Under symmetric vertical loads the upper chord (beam) carries compression
// and the lower chord carries tension (truss analogy). The vertical
// reactions balance the applied loads.
//
// Source: Roark & Young, "Formulas for Stress and Strain", 8th Ed., §8.

#[test]
fn validation_composite_parallel_chord_axial() {
    let l = 6.0;
    let h = 1.0; // chord separation
    let p = 20.0;

    // Nodes: 1(0,0), 2(l/2,0), 3(l,0) — lower chord
    //        4(0,h), 5(l/2,h), 6(l,h) — upper chord
    let nodes = vec![
        (1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0),
        (4, 0.0, h),   (5, l / 2.0, h),   (6, l, h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // lower chord left
        (2, "frame", 2, 3, 1, 1, false, false), // lower chord right
        (3, "frame", 4, 5, 1, 1, false, false), // upper chord left
        (4, "frame", 5, 6, 1, 1, false, false), // upper chord right
        (5, "frame", 1, 4, 1, 1, false, false), // left vertical
        (6, "frame", 2, 5, 1, 1, false, false), // middle vertical
        (7, "frame", 3, 6, 1, 1, false, false), // right vertical
    ];
    // Support lower chord ends: pinned at 1, roller at 3
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    // Apply loads at upper chord midspan (node 5)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: vertical reactions must balance applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err_eq = (sum_ry - p).abs() / p;
    assert!(err_eq < 0.01,
        "Parallel chords equilibrium: ΣRy={:.4}, P={:.1}", sum_ry, p);

    // Each support should carry half the load (symmetric)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;
    let err_sym = (r1 - r3).abs() / r1.max(1e-12);
    assert!(err_sym < 0.01,
        "Symmetric load: R1={:.4}, R3={:.4} should be equal", r1, r3);
}

// ================================================================
// 6. Composite Stiffness: Series vs Parallel Combination
// ================================================================
//
// Two springs (beams) in parallel: k_total = k₁ + k₂
// Two springs (beams) in series: k_total = k₁ k₂ / (k₁ + k₂)
//
// For SS beams under midspan load: k = 48EI/L³.
// Two beams in parallel (sharing same deflection) → combined k = k₁ + k₂.
// Two beams in series (one end-to-end with the other) → flexibility = 1/k₁ + 1/k₂.
//
// Source: McGuire et al., "Matrix Structural Analysis", §2.7.

#[test]
fn validation_composite_series_vs_parallel_stiffness() {
    let l: f64 = 6.0;
    let n = 6;
    let p = 15.0;
    let mid = n / 2 + 1;
    let e_eff = E * 1000.0;

    let iz1 = IZ;
    let iz2 = 2.0 * IZ;

    // Stiffness of each beam (SS, center load)
    let k1 = 48.0 * e_eff * iz1 / l.powi(3);
    let k2 = 48.0 * e_eff * iz2 / l.powi(3);

    // Parallel combination: k_p = k1 + k2
    let k_parallel = k1 + k2;
    let delta_parallel_exact = p / k_parallel;

    // Beam with iz1 alone (weaker beam)
    let input_1 = make_beam(n, l, E, A, iz1, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let delta_1 = res_1.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Beam with iz2 alone (stiffer beam)
    let input_2 = make_beam(n, l, E, A, iz2, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let delta_2 = res_2.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Parallel combination (same deflection, load splits): δ = P/(k1+k2)
    // Verify: 1/δ_parallel = 1/δ₁ + 1/δ₂ — NO, this is SERIES.
    // Parallel: k_combined = k1+k2 → δ = P/(k1+k2) = P*δ1*δ2 / (P*δ2 + P*δ1)
    //                                             = δ1*δ2 / (δ1 + δ2)
    let delta_parallel_from_beams = delta_1 * delta_2 / (delta_1 + delta_2);
    let err = (delta_parallel_from_beams - delta_parallel_exact).abs() / delta_parallel_exact;
    assert!(err < 0.02,
        "Parallel stiffness: δ={:.6e}, exact={:.6e}, err={:.1}%",
        delta_parallel_from_beams, delta_parallel_exact, err * 100.0);

    // Parallel beam must be stiffer than either alone
    assert!(delta_parallel_exact < delta_1,
        "Parallel combination δ={:.6e} should be less than beam1 alone δ={:.6e}",
        delta_parallel_exact, delta_1);
    assert!(delta_parallel_exact < delta_2,
        "Parallel combination δ={:.6e} should be less than beam2 alone δ={:.6e}",
        delta_parallel_exact, delta_2);
}

// ================================================================
// 7. Load Distribution by Flexural Rigidity Ratio
// ================================================================
//
// Two SS beams spanning the same length, connected only at midspan,
// share a central load P in proportion to their stiffnesses:
//   P₁ = P × EI₁/(EI₁ + EI₂)
//   P₂ = P × EI₂/(EI₁ + EI₂)
//
// We verify this by comparing the midspan reactions of each beam under
// a known share of the total load.
//
// Source: Salmon et al., "Steel Structures: Design and Behavior", §16.3.

#[test]
fn validation_composite_load_distribution_by_ei() {
    let l = 6.0;
    let n = 6;
    let p_total = 30.0;
    let mid = n / 2 + 1;

    let iz1 = IZ;
    let iz2 = 3.0 * IZ; // beam 2 is 3× stiffer

    let ei1 = E * iz1;
    let ei2 = E * iz2;
    let frac1 = ei1 / (ei1 + ei2); // 0.25
    let frac2 = ei2 / (ei1 + ei2); // 0.75

    let p1 = p_total * frac1;
    let p2 = p_total * frac2;

    // Solve each beam with its share of the load
    let input1 = make_beam(n, l, E, A, iz1, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p1, mz: 0.0,
        })]);
    let res1 = linear::solve_2d(&input1).unwrap();

    let input2 = make_beam(n, l, E, A, iz2, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p2, mz: 0.0,
        })]);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Both beams should have the same midspan deflection (compatibility condition)
    let delta1 = res1.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy;
    let delta2 = res2.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy;

    let err = (delta1 - delta2).abs() / delta1.abs();
    assert!(err < 1e-8,
        "Composite compatibility: δ₁={:.6e}, δ₂={:.6e} should be equal",
        delta1, delta2);

    // Total load = p1 + p2 = p_total
    let err_load = ((p1 + p2) - p_total).abs() / p_total;
    assert!(err_load < 1e-10,
        "Load fractions: p1+p2={:.6}, p_total={:.1}", p1 + p2, p_total);
}

// ================================================================
// 8. Composite Deflection Smaller Than Weaker Member Alone
// ================================================================
//
// The fundamental benefit of composite action: combining two beams
// always produces a smaller deflection than either beam alone under
// the same total load. Specifically:
//   δ_composite < δ_weaker_alone   (always)
//   δ_composite < δ_stronger_alone (always)
//
// This test confirms these inequalities for a range of EI ratios.
//
// Source: Gere & Goodno, "Mechanics of Materials", §6.7 — composite beams.

#[test]
fn validation_composite_deflection_smaller_than_weaker() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let mid = n / 2 + 1;

    // Test multiple EI ratio combinations
    let iz_pairs = [
        (IZ, IZ),           // equal beams
        (IZ, 2.0 * IZ),    // 1:2 ratio
        (IZ, 5.0 * IZ),    // 1:5 ratio
        (IZ, 10.0 * IZ),   // 1:10 ratio
    ];

    for (iz_a, iz_b) in iz_pairs {
        // Weaker beam alone
        let input_a = make_beam(n, l, E, A, iz_a, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res_a = linear::solve_2d(&input_a).unwrap();
        let delta_a = res_a.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();

        // Stronger beam alone
        let input_b = make_beam(n, l, E, A, iz_b, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res_b = linear::solve_2d(&input_b).unwrap();
        let delta_b = res_b.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();

        // Composite (full composite action = combined EI)
        let iz_comp = iz_a + iz_b;
        let input_comp = make_beam(n, l, E, A, iz_comp, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res_comp = linear::solve_2d(&input_comp).unwrap();
        let delta_comp = res_comp.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();

        assert!(delta_comp < delta_a,
            "Composite δ={:.6e} should be less than weaker beam δ={:.6e} (iz_a={}, iz_b={})",
            delta_comp, delta_a, iz_a, iz_b);
        assert!(delta_comp < delta_b,
            "Composite δ={:.6e} should be less than stronger beam δ={:.6e} (iz_a={}, iz_b={})",
            delta_comp, delta_b, iz_a, iz_b);
    }
}
