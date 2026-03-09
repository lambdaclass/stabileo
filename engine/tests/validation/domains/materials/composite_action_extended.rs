/// Validation: Extended Composite-Action Behaviour — Transformed Sections & Partial Interaction
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 6 (Composite beams)
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed., §16
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., §2.7
///   - Newmark, Siess & Viest, "Tests and Analysis of Composite Beams with Incomplete Interaction", 1951
///   - Johnson, "Composite Structures of Steel and Concrete", 3rd Ed.
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed.
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd Ed.
///   - Kassimali, "Matrix Analysis of Structures", 2nd Ed., Ch. 8
///
/// Tests:
///   1. Modular ratio: n-factor transformed section deflection check
///   2. Partial interaction via reduced EI: softer than full composite, stiffer than bare
///   3. Three-material composite beam: E-weighted stiffness superposition
///   4. Asymmetric stiffness Vierendeel: unequal chord forces from unequal EI
///   5. Cantilever composite: tip deflection scales with combined EI
///   6. UDL composite beam: 5qL^4/(384EI) formula for combined section
///   7. Stiffness proportionality: quadrupling EI quarters deflection
///   8. Composite frame lateral stiffness: stiffer beam reduces sway
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Modular Ratio Transformed Section
// ================================================================
//
// A composite beam made of two materials (steel E_s and concrete E_c)
// can be analysed using the transformed-section method. The modular
// ratio n = E_s / E_c converts the concrete width to an equivalent
// steel width. The resulting EI_transformed governs deflection.
//
// For a beam with only bending stiffness differences, we verify that
// solving with E_ref and I_transformed gives the same deflection as
// solving with E_actual and I_actual.
//
// Source: Gere & Goodno, §6.7; Salmon et al., §16.3.

#[test]
fn validation_composite_modular_ratio_transformed_section() {
    let l: f64 = 8.0;
    let n_elem = 8;
    let p = 15.0;
    let mid = n_elem / 2 + 1;

    // Steel beam: E_s = 200 GPa, Iz = IZ
    let e_s = 200_000.0;
    // Concrete slab contribution: E_c = 25 GPa, Iz_c = 4*IZ
    let e_c = 25_000.0;
    let iz_c = 4.0 * IZ;

    // Modular ratio
    let n_ratio: f64 = e_s / e_c; // 8.0

    // Transformed moment of inertia (referred to steel):
    //   I_tr = I_steel + I_concrete / n = IZ + iz_c / n_ratio
    let iz_tr = IZ + iz_c / n_ratio;

    // Solve with the transformed section (E = E_steel, I = I_tr)
    let input_tr = make_beam(n_elem, l, e_s, A, iz_tr, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_tr = linear::solve_2d(&input_tr).unwrap();
    let delta_tr = res_tr.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Compute analytically: E_eff * I_tr should equal E_s * I_s + E_c * I_c
    // (since I_tr = I_s + I_c * E_c / E_s)
    let ei_composite = e_s * 1000.0 * IZ + e_c * 1000.0 * iz_c;
    let ei_transformed = e_s * 1000.0 * iz_tr;

    let err_ei = (ei_composite - ei_transformed).abs() / ei_composite;
    assert!(err_ei < 1e-10,
        "EI_composite={:.4e} vs EI_transformed={:.4e}, err={:.2e}",
        ei_composite, ei_transformed, err_ei);

    // Exact analytical deflection: delta = P * L^3 / (48 * EI_composite)
    let delta_exact = p * l.powi(3) / (48.0 * ei_composite);
    let err = (delta_tr - delta_exact).abs() / delta_exact;
    assert!(err < 0.02,
        "Modular ratio: delta_FEM={:.6e}, delta_exact={:.6e}, err={:.2}%",
        delta_tr, delta_exact, err * 100.0);
}

// ================================================================
// 2. Partial Interaction: Reduced EI Envelope
// ================================================================
//
// In a partially-composite beam, the effective EI lies between the
// bare steel EI and the fully-composite EI:
//     EI_bare < EI_partial < EI_full
// This means:
//     delta_full < delta_partial < delta_bare
//
// We model partial interaction by using an intermediate Iz value
// and verify the deflection ordering.
//
// Source: Newmark, Siess & Viest (1951); Johnson, Ch. 5.

#[test]
fn validation_composite_partial_interaction_envelope() {
    let l = 10.0;
    let n_elem = 10;
    let p = 30.0;
    let mid = n_elem / 2 + 1;

    let iz_bare = IZ;                          // bare steel
    let iz_full = 3.5 * IZ;                    // fully composite
    let iz_partial = iz_bare + 0.5 * (iz_full - iz_bare); // 50% interaction

    // Solve all three
    let solve = |iz: f64| -> f64 {
        let input = make_beam(n_elem, l, E, A, iz, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res = linear::solve_2d(&input).unwrap();
        res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs()
    };

    let delta_bare = solve(iz_bare);
    let delta_partial = solve(iz_partial);
    let delta_full = solve(iz_full);

    // Ordering: delta_full < delta_partial < delta_bare
    assert!(delta_full < delta_partial,
        "Full composite delta={:.6e} should be less than partial delta={:.6e}",
        delta_full, delta_partial);
    assert!(delta_partial < delta_bare,
        "Partial composite delta={:.6e} should be less than bare delta={:.6e}",
        delta_partial, delta_bare);

    // Quantitative check: deflection is inversely proportional to EI
    // delta_partial / delta_bare = iz_bare / iz_partial
    let expected_ratio = iz_bare / iz_partial;
    let actual_ratio = delta_partial / delta_bare;
    let err = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Partial interaction ratio: actual={:.6}, expected={:.6}, err={:.2}%",
        actual_ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 3. Three-Material Composite: EI Superposition
// ================================================================
//
// Three parallel beams of different E and Iz are connected at all
// nodes (full composite action). The effective EI_total = sum(E_i * Iz_i).
// A single beam with E_ref and Iz_eff = sum(E_i * Iz_i) / E_ref
// should give the same deflection.
//
// Source: McGuire et al., §2.7; Kassimali, Ch. 8.

#[test]
fn validation_composite_three_material_superposition() {
    let l: f64 = 6.0;
    let n_elem = 6;
    let p = 20.0;
    let mid = n_elem / 2 + 1;

    // Three components with different stiffnesses
    let e1 = 200_000.0; let iz1 = 1.0e-4;  // steel
    let e2 =  70_000.0; let iz2 = 3.0e-4;  // aluminum
    let e3 =  25_000.0; let iz3 = 8.0e-4;  // concrete

    // Total EI (using effective E in Pa: E * 1000)
    let ei_total = e1 * 1000.0 * iz1 + e2 * 1000.0 * iz2 + e3 * 1000.0 * iz3;

    // Equivalent single beam referred to steel
    let e_ref = e1;
    let iz_eff = ei_total / (e_ref * 1000.0);

    let input = make_beam(n_elem, l, e_ref, A, iz_eff, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Analytical: delta = P * L^3 / (48 * EI_total)
    let delta_exact = p * l.powi(3) / (48.0 * ei_total);
    let err = (delta_fem - delta_exact).abs() / delta_exact;
    assert!(err < 0.02,
        "Three-material: delta_FEM={:.6e}, delta_exact={:.6e}, err={:.2}%",
        delta_fem, delta_exact, err * 100.0);

    // Also verify this is stiffer than any single component alone
    for (e_i, iz_i, label) in [(e1, iz1, "steel"), (e2, iz2, "aluminum"), (e3, iz3, "concrete")] {
        let input_i = make_beam(n_elem, l, e_i, A, iz_i, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res_i = linear::solve_2d(&input_i).unwrap();
        let delta_i = res_i.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();
        assert!(delta_fem < delta_i,
            "Composite delta={:.6e} should be less than {} alone delta={:.6e}",
            delta_fem, label, delta_i);
    }
}

// ================================================================
// 4. Asymmetric Stiffness Vierendeel: Unequal Chord Forces
// ================================================================
//
// A Vierendeel frame with two horizontal chords of different EI
// separated by verticals. Under a symmetric midspan vertical load,
// vertical equilibrium still holds but the stiffer chord attracts
// a larger share of the bending moment (and hence larger end shears).
//
// The element end shears in the stiffer chord should be larger in
// magnitude than those in the weaker chord.
//
// Source: Roark & Young, §8; McGuire et al., §5.

#[test]
fn validation_composite_asymmetric_vierendeel_chord_forces() {
    let l = 8.0;
    let h = 1.5;
    let p = 25.0;

    // Lower chord (weaker): Iz = IZ
    // Upper chord (stiffer): Iz = 4*IZ
    let iz_lower = IZ;
    let iz_upper = 4.0 * IZ;

    // Nodes: lower chord: 1(0,0), 2(L/2,0), 3(L,0)
    //        upper chord: 4(0,h), 5(L/2,h), 6(L,h)
    let nodes = vec![
        (1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0),
        (4, 0.0, h),   (5, l / 2.0, h),   (6, l, h),
    ];
    // Elements: lower chord (section 1), upper chord (section 2), verticals (section 1)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // lower chord left
        (2, "frame", 2, 3, 1, 1, false, false), // lower chord right
        (3, "frame", 4, 5, 1, 2, false, false), // upper chord left
        (4, "frame", 5, 6, 1, 2, false, false), // upper chord right
        (5, "frame", 1, 4, 1, 1, false, false), // left vertical
        (6, "frame", 2, 5, 1, 1, false, false), // middle vertical
        (7, "frame", 3, 6, 1, 1, false, false), // right vertical
    ];

    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_lower), (2, A, iz_upper)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Verify global equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let err_eq = (sum_ry - p).abs() / p;
    assert!(err_eq < 0.01,
        "Vierendeel equilibrium: sum_Ry={:.4}, P={:.1}", sum_ry, p);

    // The upper chord elements (3,4) should carry larger shear than lower (1,2)
    // because they have 4x the flexural rigidity.
    let shear_upper_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 3).unwrap().v_start.abs();
    let shear_lower_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap().v_start.abs();

    assert!(shear_upper_left > shear_lower_left,
        "Stiffer upper chord shear={:.4} should exceed lower chord shear={:.4}",
        shear_upper_left, shear_lower_left);
}

// ================================================================
// 5. Cantilever Composite: Tip Deflection Scales with Combined EI
// ================================================================
//
// A cantilever beam under a tip load P has:
//     delta = P * L^3 / (3 * EI)
//
// For a composite section with EI_composite = EI_1 + EI_2,
// the cantilever tip deflection should be:
//     delta_composite = P * L^3 / (3 * (EI_1 + EI_2))
//
// We verify both the absolute deflection and the ratio between
// composite and individual beams.
//
// Source: Timoshenko & Goodier, §5; Gere & Goodno, §6.

#[test]
fn validation_composite_cantilever_tip_deflection() {
    let l: f64 = 5.0;
    let n_elem = 10;
    let p = 10.0;
    let tip = n_elem + 1;
    let e_eff = E * 1000.0;

    let iz1 = IZ;
    let iz2 = 2.5 * IZ;
    let iz_comp = iz1 + iz2;

    // Analytical tip deflection for cantilever: delta = P * L^3 / (3 * EI)
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * iz_comp);

    // FEM solution with composite section
    let input = make_beam(n_elem, l, E, A, iz_comp, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();

    let err = (delta_fem - delta_exact).abs() / delta_exact;
    assert!(err < 0.02,
        "Cantilever composite: delta_FEM={:.6e}, delta_exact={:.6e}, err={:.2}%",
        delta_fem, delta_exact, err * 100.0);

    // Verify ratio: delta_composite / delta_iz1_alone = iz1 / iz_comp
    let input_bare = make_beam(n_elem, l, E, A, iz1, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_bare = linear::solve_2d(&input_bare).unwrap();
    let delta_bare = res_bare.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();

    let expected_ratio = iz1 / iz_comp;
    let actual_ratio = delta_fem / delta_bare;
    let err_ratio = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err_ratio < 0.02,
        "Cantilever ratio: actual={:.6}, expected={:.6}, err={:.2}%",
        actual_ratio, expected_ratio, err_ratio * 100.0);
}

// ================================================================
// 6. UDL Composite Beam: 5qL^4 / (384 EI) Deflection Formula
// ================================================================
//
// A simply-supported beam under uniform distributed load q has:
//     delta_max = 5 * q * L^4 / (384 * EI)   (at midspan)
//
// For a composite beam with EI = EI_1 + EI_2, this formula should
// give the correct midspan deflection.
//
// Source: Gere & Goodno, §9.3; Roark & Young, Table 8.1.

#[test]
fn validation_composite_udl_deflection_formula() {
    let l: f64 = 10.0;
    let n_elem = 20; // fine mesh for UDL accuracy
    let q: f64 = -5.0;    // kN/m downward
    let mid = n_elem / 2 + 1;
    let e_eff = E * 1000.0;

    let iz1 = IZ;
    let iz2 = 1.5 * IZ;
    let iz_comp = iz1 + iz2;

    // Analytical midspan deflection for SS beam under UDL
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_comp);

    // Build UDL beam using make_ss_beam_udl helper
    let input = make_ss_beam_udl(n_elem, l, E, A, iz_comp, q);
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    let err = (delta_fem - delta_exact).abs() / delta_exact;
    assert!(err < 0.02,
        "UDL composite: delta_FEM={:.6e}, delta_exact={:.6e}, err={:.2}%",
        delta_fem, delta_exact, err * 100.0);

    // Compare to bare beam: composite must be stiffer
    let input_bare = make_ss_beam_udl(n_elem, l, E, A, iz1, q);
    let res_bare = linear::solve_2d(&input_bare).unwrap();
    let delta_bare = res_bare.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert!(delta_fem < delta_bare,
        "Composite delta={:.6e} should be less than bare delta={:.6e}",
        delta_fem, delta_bare);

    // Ratio check: delta_comp / delta_bare = iz1 / iz_comp
    let expected_ratio = iz1 / iz_comp;
    let actual_ratio = delta_fem / delta_bare;
    let err_ratio = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err_ratio < 0.02,
        "UDL ratio: actual={:.6}, expected={:.6}, err={:.2}%",
        actual_ratio, expected_ratio, err_ratio * 100.0);
}

// ================================================================
// 7. Stiffness Proportionality: Quadrupling EI Quarters Deflection
// ================================================================
//
// For a linearly elastic beam, deflection is exactly inversely
// proportional to EI. If we multiply EI by a factor k, the
// deflection is divided by k. We verify this for k = 2, 4, 8.
//
// Source: fundamental Euler-Bernoulli beam theory.

#[test]
fn validation_composite_stiffness_proportionality() {
    let l = 8.0;
    let n_elem = 8;
    let p = 20.0;
    let mid = n_elem / 2 + 1;

    // Baseline beam
    let input_base = make_beam(n_elem, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_base = linear::solve_2d(&input_base).unwrap();
    let delta_base = res_base.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Test k = 2, 4, 8 (simulate adding composite layers)
    for k in [2.0_f64, 4.0, 8.0] {
        let iz_scaled = k * IZ;
        let input = make_beam(n_elem, l, E, A, iz_scaled, "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res = linear::solve_2d(&input).unwrap();
        let delta_scaled = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();

        // delta_scaled = delta_base / k
        let expected = delta_base / k;
        let err = (delta_scaled - expected).abs() / expected;
        assert!(err < 0.02,
            "Proportionality k={}: delta_scaled={:.6e}, expected={:.6e}, err={:.2}%",
            k, delta_scaled, expected, err * 100.0);
    }
}

// ================================================================
// 8. Composite Frame Lateral Stiffness: Stiffer Beam Reduces Sway
// ================================================================
//
// In a portal frame, increasing the beam EI relative to the column
// EI increases the frame's lateral stiffness (reduces sway under
// lateral load). With stiffer beams the columns are better restrained
// at the top and behave more like fixed-fixed columns.
//
// We build three portal frames with progressively stiffer beams and
// verify that the top lateral displacement decreases monotonically.
//
// Source: McGuire et al., Ch. 5; Salmon et al., §14.

#[test]
fn validation_composite_frame_lateral_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let p_lateral = 15.0;

    let iz_col = IZ;

    // Three beam stiffnesses: 1x, 5x, 20x the column EI
    let iz_beams = [iz_col, 5.0 * iz_col, 20.0 * iz_col];

    let mut sways = Vec::new();

    for &iz_beam in &iz_beams {
        // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
        let nodes = vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 2, false, false), // beam
            (3, "frame", 4, 3, 1, 1, false, false), // right column
        ];
        let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_lateral, fy: 0.0, mz: 0.0,
        })];

        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, iz_col), (2, A, iz_beam)],
            elems,
            sups,
            loads,
        );
        let res = linear::solve_2d(&input).unwrap();

        // Get the lateral displacement at the top of the left column (node 2)
        let sway = res.displacements.iter()
            .find(|d| d.node_id == 2).unwrap().ux.abs();
        sways.push(sway);
    }

    // Sway should decrease monotonically as beam stiffness increases
    for i in 1..sways.len() {
        assert!(sways[i] < sways[i - 1],
            "Sway with iz_beam={:.4e} ({:.6e}) should be less than with iz_beam={:.4e} ({:.6e})",
            iz_beams[i], sways[i], iz_beams[i - 1], sways[i - 1]);
    }

    // The stiffest beam frame (20x) should produce significantly less sway
    // than the baseline (1x). The ratio won't be exactly 1/20 because columns
    // also contribute to flexibility, but it should be substantially reduced.
    let reduction = sways[2] / sways[0];
    assert!(reduction < 0.75,
        "Sway reduction with 20x beam stiffness: ratio={:.4}, expected < 0.75",
        reduction);

    // Verify equilibrium for the last (stiffest) frame
    let res_last = {
        let nodes = vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        ];
        let elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 2, false, false),
            (3, "frame", 4, 3, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_lateral, fy: 0.0, mz: 0.0,
        })];
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, iz_col), (2, A, 20.0 * iz_col)],
            elems,
            sups,
            loads,
        );
        linear::solve_2d(&input).unwrap()
    };
    let sum_rx: f64 = res_last.reactions.iter().map(|r| r.rx).sum();
    let err_eq = (sum_rx + p_lateral).abs() / p_lateral;
    assert!(err_eq < 0.01,
        "Frame equilibrium: sum_Rx={:.4}, -P={:.1}", sum_rx, -p_lateral);
}
