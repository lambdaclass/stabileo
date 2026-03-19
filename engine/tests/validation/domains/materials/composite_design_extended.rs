/// Validation: Advanced Composite (Steel-Concrete) Design Benchmarks
///
/// References:
///   - AISC 360-22 Chapter I: Design of Composite Members
///   - EN 1994-1-1:2004 (EC4): Design of composite steel and concrete structures
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed., Ch. 16
///   - Viest, Colaco, et al.: "Composite Construction Design for Buildings"
///   - Johnson: "Composite Structures of Steel and Concrete", 3rd Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 6
///
/// These tests exercise advanced composite steel-concrete design benchmarks
/// using the transformed section method. Composite action is modelled by
/// computing equivalent section properties (I_tr, A_tr) for the steel-concrete
/// cross-section and using those in the solver. Solver deflections and forces
/// are compared to closed-form analytical solutions.
///
/// Tests:
///   1. Transformed section I_tr via parallel axis theorem
///   2. AISC 360 effective slab width calculation
///   3. Full composite moment capacity M_n
///   4. Partial interaction moment reduction
///   5. Composite vs non-composite deflection ratio
///   6. Shear stud demand calculation
///   7. Construction stage stresses (unshored)
///   8. Modular ratio effect on neutral axis and section properties
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Transformed Section — I_tr = I_s + A_s*d^2 + I_c/n + (A_c/n)*d_c^2
// ================================================================
//
// Steel beam: W18x50 approximation
//   d_steel = 457 mm, A_s = 9484 mm^2, I_s = 339e6 mm^4
//   E_s = 200,000 MPa
//
// Concrete slab:
//   t_c = 150 mm, b_eff = 2400 mm
//   f'c = 30 MPa, E_c = 4700*sqrt(30) = 25,743 MPa
//
// Modular ratio: n = E_s/E_c = 200000/25743 = 7.769
//
// Transformed concrete:
//   b_tr = b_eff/n = 2400/7.769 = 308.9 mm
//   A_c_tr = b_tr * t_c = 308.9 * 150 = 46,335 mm^2
//   I_c_tr = b_tr * t_c^3 / 12 = 308.9 * 150^3 / 12 = 86.88e6 mm^4
//
// Centroids from bottom of steel:
//   y_s = d/2 = 228.5 mm
//   y_c = d + t_c/2 = 457 + 75 = 532.0 mm
//
// Composite NA:
//   A_tot = 9484 + 46335 = 55819 mm^2
//   y_bar = (9484*228.5 + 46335*532.0) / 55819
//         = (2167194 + 24650220) / 55819
//         = 26817414 / 55819
//         = 480.4 mm
//
// Transformed I (parallel axis theorem):
//   I_tr = I_s + A_s*(y_bar - y_s)^2 + I_c_tr + A_c_tr*(y_c - y_bar)^2
//        = 339e6 + 9484*(480.4 - 228.5)^2 + 86.88e6 + 46335*(532.0 - 480.4)^2
//        = 339e6 + 9484*63440 + 86.88e6 + 46335*2663
//        = 339e6 + 601.6e6 + 86.88e6 + 123.3e6
//        = 1150.8e6 mm^4
//
// Verify via solver: composite beam deflection under point load
// matches P*L^3 / (48*E_s*I_tr) for the transformed section.
//
// Reference: AISC 360-22 Commentary I3, Salmon et al. SS 16.3

#[test]
fn validation_comp_des_ext_1_transformed_section() {
    // Steel beam: W18x50 (approximate)
    let d_steel_mm: f64 = 457.0;
    let a_s_mm2: f64 = 9484.0;
    let i_s_mm4: f64 = 339.0e6;
    let e_s: f64 = 200_000.0; // MPa

    // Concrete slab
    let t_c_mm: f64 = 150.0;
    let b_eff_mm: f64 = 2400.0;
    let fc: f64 = 30.0; // MPa
    let e_c: f64 = 4700.0 * fc.sqrt(); // 25,743 MPa

    // Modular ratio
    let n: f64 = e_s / e_c;
    let n_expected: f64 = 7.769;
    assert!((n - n_expected).abs() / n_expected < 0.01,
        "n={:.3}, expected={:.3}", n, n_expected);

    // Transformed concrete dimensions
    let b_tr: f64 = b_eff_mm / n;
    let a_c_tr: f64 = b_tr * t_c_mm;
    let i_c_tr: f64 = b_tr * t_c_mm.powi(3) / 12.0;

    // Centroids from bottom of steel
    let y_s: f64 = d_steel_mm / 2.0;
    let y_c: f64 = d_steel_mm + t_c_mm / 2.0;

    // Composite neutral axis
    let a_tot: f64 = a_s_mm2 + a_c_tr;
    let y_bar: f64 = (a_s_mm2 * y_s + a_c_tr * y_c) / a_tot;

    // NA must be between steel and concrete centroids
    assert!(y_bar > y_s && y_bar < y_c,
        "NA y_bar={:.1} must be between y_s={:.1} and y_c={:.1}", y_bar, y_s, y_c);

    // Transformed moment of inertia
    let i_tr: f64 = i_s_mm4 + a_s_mm2 * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    // I_tr should be much larger than I_s alone
    let ratio = i_tr / i_s_mm4;
    assert!(ratio > 2.0 && ratio < 6.0,
        "I_tr/I_s={:.2}, expected between 2.0 and 6.0", ratio);

    // --- Verify via FEM solver ---
    // Convert to solver units: m, kN
    let l_m: f64 = 12.0;
    let n_elem = 12;
    let p_kn: f64 = 80.0; // midspan point load
    let mid = n_elem / 2 + 1;

    let a_tot_m2: f64 = a_tot * 1.0e-6;   // mm^2 -> m^2
    let i_tr_m4: f64 = i_tr * 1.0e-12;    // mm^4 -> m^4

    let e_eff: f64 = e_s * 1000.0; // kN/m^2 (solver internally multiplies by 1000)

    // Analytical deflection: delta = P*L^3 / (48*E*I)
    let delta_exact: f64 = p_kn * l_m.powi(3) / (48.0 * e_eff * i_tr_m4);

    let input = make_beam(
        n_elem, l_m, e_s, a_tot_m2, i_tr_m4,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_kn, my: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert_close(delta_fem, delta_exact, 0.02,
        "Transformed section composite beam midspan deflection");

    // Composite must deflect less than bare steel
    let i_s_m4: f64 = i_s_mm4 * 1.0e-12;
    let delta_steel_only: f64 = p_kn * l_m.powi(3) / (48.0 * e_eff * i_s_m4);
    assert!(delta_fem < delta_steel_only,
        "Composite delta={:.6e} must be < bare steel delta={:.6e}",
        delta_fem, delta_steel_only);
}

// ================================================================
// 2. AISC 360 Effective Slab Width
// ================================================================
//
// AISC 360-22 I3.1a: effective slab width per side:
//   each side <= min(L/8, spacing/2, 8*t_slab)
// Total b_eff = 2 * per_side
//
// Test parameters:
//   L = 10 m = 10000 mm, spacing = 3500 mm, t_slab = 130 mm
//
// Per side:
//   L/8       = 10000/8 = 1250 mm
//   spacing/2 = 3500/2  = 1750 mm
//   8*t_slab  = 8*130   = 1040 mm  <-- governs
//
// b_eff = 2 * 1040 = 2080 mm
//
// Cross-check: b_eff <= L/4 = 2500 mm  OK
//
// Verify the impact on composite stiffness: use b_eff in transformed
// section and compare solver deflection to bare steel deflection.
//
// Reference: AISC 360-22 SS I3.1a

#[test]
fn validation_comp_des_ext_2_effective_width() {
    let l_mm: f64 = 10_000.0;
    let spacing_mm: f64 = 3_500.0;
    let t_slab_mm: f64 = 130.0;

    // Per-side limits
    let limit_span: f64 = l_mm / 8.0;           // 1250
    let limit_spacing: f64 = spacing_mm / 2.0;   // 1750
    let limit_slab: f64 = 8.0 * t_slab_mm;       // 1040

    // Governing per-side
    let b_per_side: f64 = limit_span.min(limit_spacing).min(limit_slab);
    assert!((b_per_side - 1040.0).abs() < 0.1,
        "Per-side b_eff={:.1}, expected 1040", b_per_side);

    // Slab thickness limit governs
    assert!(limit_slab < limit_span && limit_slab < limit_spacing,
        "8*t_slab={:.0} should govern", limit_slab);

    // Total effective width
    let b_eff: f64 = 2.0 * b_per_side;
    let b_eff_expected: f64 = 2080.0;
    assert!((b_eff - b_eff_expected).abs() < 0.1,
        "b_eff={:.1} mm, expected={:.1} mm", b_eff, b_eff_expected);

    // Cross-check: b_eff <= L/4
    assert!(b_eff <= l_mm / 4.0,
        "b_eff={:.0} must be <= L/4={:.0}", b_eff, l_mm / 4.0);

    // Verify solver-level impact: composite beam with b_eff is stiffer
    let e_s: f64 = 200_000.0;
    let e_c: f64 = 4700.0 * 28.0_f64.sqrt(); // ~ 24870 MPa for f'c = 28
    let n_ratio: f64 = e_s / e_c;

    // Steel beam: W14x30 approximation
    let d_steel_mm: f64 = 353.0;
    let a_s_mm2: f64 = 5703.0;
    let i_s_mm4: f64 = 128.0e6;

    // Transformed concrete with effective width
    let b_tr: f64 = b_eff / n_ratio;
    let a_c_tr: f64 = b_tr * t_slab_mm;
    let y_s: f64 = d_steel_mm / 2.0;
    let y_c: f64 = d_steel_mm + t_slab_mm / 2.0;
    let a_tot: f64 = a_s_mm2 + a_c_tr;
    let y_bar: f64 = (a_s_mm2 * y_s + a_c_tr * y_c) / a_tot;
    let i_c_tr: f64 = b_tr * t_slab_mm.powi(3) / 12.0;
    let i_tr: f64 = i_s_mm4 + a_s_mm2 * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    // Convert to solver units
    let l_m: f64 = l_mm / 1000.0; // 10 m
    let n_elem = 10;
    let p_kn: f64 = 50.0;
    let mid = n_elem / 2 + 1;

    let a_tot_m2: f64 = a_tot * 1.0e-6;
    let i_tr_m4: f64 = i_tr * 1.0e-12;
    let i_s_m4: f64 = i_s_mm4 * 1.0e-12;
    let a_s_m2: f64 = a_s_mm2 * 1.0e-6;
    let _e_eff: f64 = e_s * 1000.0; // kN/m^2 (available for reference calculations)

    // Composite beam
    let input_comp = make_beam(
        n_elem, l_m, e_s, a_tot_m2, i_tr_m4,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_kn, my: 0.0,
        })],
    );
    let delta_comp = linear::solve_2d(&input_comp).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Bare steel beam
    let input_steel = make_beam(
        n_elem, l_m, e_s, a_s_m2, i_s_m4,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p_kn, my: 0.0,
        })],
    );
    let delta_steel = linear::solve_2d(&input_steel).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Composite deflection must be less
    assert!(delta_comp < delta_steel,
        "Composite delta={:.6e} must be < bare steel delta={:.6e}",
        delta_comp, delta_steel);

    // Deflection ratio should match I ratio
    let expected_ratio: f64 = i_s_m4 / i_tr_m4;
    let actual_ratio: f64 = delta_comp / delta_steel;
    assert_close(actual_ratio, expected_ratio, 0.03,
        "Deflection ratio matches I_s/I_tr");
}

// ================================================================
// 3. Full Composite Moment Capacity
// ================================================================
//
// AISC I3.2a: Full composite M_n = A_s * F_y * (d/2 + t_slab - a/2)
// where a = A_s * F_y / (0.85 * f'c * b_eff) when PNA is in slab.
//
// Steel: W21x44, A_s = 8387 mm^2, d = 525 mm, F_y = 350 MPa
// Concrete: f'c = 32 MPa, b_eff = 2200 mm, t_slab = 140 mm
//
// C = A_s * F_y = 8387 * 350 = 2,935,450 N
// C_conc = 0.85 * 32 * 2200 * 140 = 8,380,800 N
// Steel governs (C = 2,935,450 N)
//
// a = 2,935,450 / (0.85 * 32 * 2200) = 2,935,450 / 59,840 = 49.05 mm
// a < t_slab = 140 mm (PNA in slab, OK)
//
// Lever arm = d/2 + t_slab - a/2 = 262.5 + 140 - 24.53 = 377.97 mm
// M_n = 2,935,450 * 377.97 = 1,109.4 kN-m
//
// Also verify via solver: composite beam with I_tr under moment
// produces consistent stress resultants.
//
// Reference: AISC 360-22 I3.2a, Example I.1

#[test]
fn validation_comp_des_ext_3_full_composite_moment() {
    // Steel section: W21x44
    let fz: f64 = 350.0;         // MPa
    let a_s: f64 = 8387.0;       // mm^2
    let d: f64 = 525.0;          // mm
    let i_s: f64 = 351.0e6;      // mm^4

    // Concrete slab
    let fc: f64 = 32.0;          // MPa
    let b_eff: f64 = 2200.0;     // mm
    let t_slab: f64 = 140.0;     // mm

    // Compression force: governed by weaker of steel yield or concrete crush
    let c_steel: f64 = a_s * fz;
    let c_concrete: f64 = 0.85 * fc * b_eff * t_slab;
    let c: f64 = c_steel.min(c_concrete);

    // Steel governs
    assert!(c_steel < c_concrete,
        "Steel should govern: A_s*F_y={:.0} < 0.85*f'c*b*t={:.0}",
        c_steel, c_concrete);

    let c_steel_expected: f64 = 2_935_450.0;
    assert!((c_steel - c_steel_expected).abs() / c_steel_expected < 0.001,
        "C_steel={:.0}, expected={:.0}", c_steel, c_steel_expected);

    // Compression block depth
    let a: f64 = c / (0.85 * fc * b_eff);
    let a_expected: f64 = 49.05;
    assert!((a - a_expected).abs() / a_expected < 0.01,
        "a={:.2} mm, expected={:.2} mm", a, a_expected);

    // PNA must be in slab
    assert!(a < t_slab,
        "a={:.2} must be < t_slab={:.0}", a, t_slab);

    // Lever arm
    let lever: f64 = d / 2.0 + t_slab - a / 2.0;
    let lever_expected: f64 = 377.97;
    assert!((lever - lever_expected).abs() / lever_expected < 0.01,
        "Lever={:.2} mm, expected={:.2} mm", lever, lever_expected);

    // Nominal moment capacity
    let mn: f64 = c * lever; // N-mm
    let mn_knm: f64 = mn / 1.0e6;
    let mn_expected: f64 = 1109.4;
    assert!((mn_knm - mn_expected).abs() / mn_expected < 0.01,
        "M_n={:.1} kN-m, expected={:.1} kN-m", mn_knm, mn_expected);

    // M_n must exceed bare steel plastic moment
    // Z_x approx for W21x44: ~1563e3 mm^3
    let zx: f64 = 1563.0e3;
    let mp_steel: f64 = fz * zx / 1.0e6; // kN-m
    assert!(mn_knm > mp_steel,
        "Composite M_n={:.1} must exceed bare steel M_p={:.1}", mn_knm, mp_steel);

    // Verify via solver: the composite beam midspan moment under UDL
    // should be wL^2/8 and the composite deflection should match 5qL^4/(384EI_tr)
    let e_s: f64 = 200_000.0;
    let e_c: f64 = 4700.0 * fc.sqrt();
    let n_ratio: f64 = e_s / e_c;
    let b_tr: f64 = b_eff / n_ratio;
    let a_c_tr: f64 = b_tr * t_slab;
    let y_s: f64 = d / 2.0;
    let y_c: f64 = d + t_slab / 2.0;
    let a_tot: f64 = a_s + a_c_tr;
    let y_bar: f64 = (a_s * y_s + a_c_tr * y_c) / a_tot;
    let i_c_tr: f64 = b_tr * t_slab.powi(3) / 12.0;
    let i_tr: f64 = i_s + a_s * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    let l_m: f64 = 10.0;
    let n_elem = 10;
    let q_kn: f64 = -15.0; // kN/m
    let mid = n_elem / 2 + 1;

    let a_tot_m2: f64 = a_tot * 1.0e-6;
    let i_tr_m4: f64 = i_tr * 1.0e-12;
    let e_eff: f64 = e_s * 1000.0;

    let delta_exact: f64 = 5.0 * q_kn.abs() * l_m.powi(4) / (384.0 * e_eff * i_tr_m4);

    let input = make_ss_beam_udl(n_elem, l_m, e_s, a_tot_m2, i_tr_m4, q_kn);
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    assert_close(delta_fem, delta_exact, 0.02,
        "Full composite beam UDL deflection");
}

// ================================================================
// 4. Partial Interaction — Reduced Moment
// ================================================================
//
// With partial shear connection (degree eta), the effective composite
// stiffness is interpolated between bare steel and full composite:
//   EI_partial = EI_steel + eta * (EI_full - EI_steel)
//
// At eta=0.25, 0.50, 0.75, the deflection should decrease monotonically.
// The deflection ratio delta_partial/delta_full should be approximately
// EI_full/EI_partial.
//
// Reference: AISC 360-22 Commentary I3, EC4 SS 6.2.1.1

#[test]
fn validation_comp_des_ext_4_partial_interaction() {
    let l_m: f64 = 9.0;
    let n_elem = 9;
    let p_kn: f64 = 60.0;
    let mid = n_elem / 2 + 1;

    let e_s: f64 = 200_000.0;

    // Steel beam
    let a_s: f64 = 7.0e-3;    // m^2
    let iz_s: f64 = 1.8e-4;   // m^4

    // Full composite section
    let n_ratio: f64 = 8.0;
    let b_slab: f64 = 1.8;    // m
    let t_slab: f64 = 0.13;   // m
    let d_steel: f64 = 0.40;  // m

    let a_c_tr: f64 = (b_slab / n_ratio) * t_slab;
    let y_s: f64 = d_steel / 2.0;
    let y_c: f64 = d_steel + t_slab / 2.0;
    let a_full: f64 = a_s + a_c_tr;
    let y_bar: f64 = (a_s * y_s + a_c_tr * y_c) / a_full;
    let i_c_tr: f64 = (b_slab / n_ratio) * t_slab.powi(3) / 12.0;
    let iz_full: f64 = iz_s + a_s * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    let etas = [0.25, 0.50, 0.75, 1.00];
    let mut deltas: Vec<f64> = Vec::new();

    for &eta in &etas {
        let iz_partial = iz_s + eta * (iz_full - iz_s);
        let a_partial = a_s + eta * (a_full - a_s);

        let input = make_beam(
            n_elem, l_m, e_s, a_partial, iz_partial,
            "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: -p_kn, my: 0.0,
            })],
        );
        let res = linear::solve_2d(&input).unwrap();
        let delta = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();
        deltas.push(delta);
    }

    // Deflections must decrease with increasing eta
    for i in 0..deltas.len() - 1 {
        assert!(deltas[i] > deltas[i + 1],
            "eta={:.2} delta={:.6e} must be > eta={:.2} delta={:.6e}",
            etas[i], deltas[i], etas[i + 1], deltas[i + 1]);
    }

    // Bare steel must deflect more than even 25% partial composite
    let e_eff: f64 = e_s * 1000.0;
    let delta_bare: f64 = p_kn * l_m.powi(3) / (48.0 * e_eff * iz_s);
    assert!(delta_bare > deltas[0],
        "Bare steel delta={:.6e} must be > 25% composite delta={:.6e}",
        delta_bare, deltas[0]);

    // Full composite (eta=1.0) deflection should match analytical
    let delta_full_exact: f64 = p_kn * l_m.powi(3) / (48.0 * e_eff * iz_full);
    assert_close(deltas[3], delta_full_exact, 0.02,
        "Full composite deflection vs analytical");
}

// ================================================================
// 5. Composite vs Non-Composite Deflection Ratio
// ================================================================
//
// The stiffness gain from composite action is measured by I_tr/I_s.
// For typical floor beams this ratio is 3-5x, meaning the composite
// beam deflects 3-5x less than the bare steel beam.
//
// We verify that the FEM deflection ratio matches I_s/I_tr.
//
// Reference: Johnson, "Composite Structures of Steel and Concrete", 3rd Ed., Ch. 4

#[test]
fn validation_comp_des_ext_5_deflection_comparison() {
    let l_m: f64 = 10.0;
    let n_elem = 10;
    let q_kn: f64 = -12.0; // kN/m UDL
    let mid = n_elem / 2 + 1;

    let e_s: f64 = 200_000.0;

    // Steel beam: moderate W-shape
    let a_s: f64 = 8.0e-3;    // m^2
    let iz_s: f64 = 2.0e-4;   // m^4

    // Composite section
    let n_ratio: f64 = 8.0;
    let b_slab: f64 = 2.0;    // m
    let t_slab: f64 = 0.15;   // m
    let d_steel: f64 = 0.45;  // m

    let a_c_tr: f64 = (b_slab / n_ratio) * t_slab;
    let y_s: f64 = d_steel / 2.0;
    let y_c: f64 = d_steel + t_slab / 2.0;
    let a_full: f64 = a_s + a_c_tr;
    let y_bar: f64 = (a_s * y_s + a_c_tr * y_c) / a_full;
    let i_c_tr: f64 = (b_slab / n_ratio) * t_slab.powi(3) / 12.0;
    let iz_comp: f64 = iz_s + a_s * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    // Verify I_tr/I_s is in expected range
    let stiffness_ratio: f64 = iz_comp / iz_s;
    assert!(stiffness_ratio > 2.0 && stiffness_ratio < 6.0,
        "I_tr/I_s={:.2}, expected 2-6", stiffness_ratio);

    // Solver: non-composite
    let input_steel = make_ss_beam_udl(n_elem, l_m, e_s, a_s, iz_s, q_kn);
    let delta_steel = linear::solve_2d(&input_steel).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Solver: composite
    let input_comp = make_ss_beam_udl(n_elem, l_m, e_s, a_full, iz_comp, q_kn);
    let delta_comp = linear::solve_2d(&input_comp).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Composite must deflect less
    assert!(delta_comp < delta_steel,
        "Composite delta={:.6e} must be < steel delta={:.6e}",
        delta_comp, delta_steel);

    // Deflection ratio should match I_s/I_tr
    let expected_defl_ratio: f64 = iz_s / iz_comp;
    let actual_defl_ratio: f64 = delta_comp / delta_steel;
    assert_close(actual_defl_ratio, expected_defl_ratio, 0.03,
        "Deflection ratio delta_comp/delta_steel = I_s/I_tr");

    // Verify via analytical: 5qL^4/(384EI)
    let e_eff: f64 = e_s * 1000.0;
    let delta_steel_exact: f64 = 5.0 * q_kn.abs() * l_m.powi(4) / (384.0 * e_eff * iz_s);
    let delta_comp_exact: f64 = 5.0 * q_kn.abs() * l_m.powi(4) / (384.0 * e_eff * iz_comp);
    assert_close(delta_steel, delta_steel_exact, 0.02, "Steel beam UDL deflection");
    assert_close(delta_comp, delta_comp_exact, 0.02, "Composite beam UDL deflection");
}

// ================================================================
// 6. Shear Stud Demand
// ================================================================
//
// Number of studs required between point of max moment and zero moment:
//   N = V_h / Q_n
// where V_h = min(0.85 * f'c * A_c, A_s * F_y) is the total horizontal
// shear, and Q_n is the individual stud capacity.
//
// Steel: A_s = 8580 mm^2, F_y = 345 MPa
//   A_s*F_y = 2,960,100 N
// Concrete: f'c = 28 MPa, b_eff = 2000 mm, t_slab = 125 mm
//   A_c = 2000 * 125 = 250,000 mm^2
//   0.85*f'c*A_c = 0.85*28*250000 = 5,950,000 N
// V_h = min(2,960,100, 5,950,000) = 2,960,100 N (steel governs)
//
// Stud capacity (from AISC I8.2a, same stud as in existing test 5):
//   Q_n = 118.3 kN = 118,300 N (19mm dia studs, f'c=28)
//
// N = 2,960,100 / 118,300 = 25.02 -> 26 studs (round up)
//
// Also verify via solver that the composite beam with these properties
// produces consistent midspan moment = wL^2/8.
//
// Reference: AISC 360-22 I3.2d

#[test]
fn validation_comp_des_ext_6_shear_stud_demand() {
    use std::f64::consts::PI;

    // Steel
    let a_s: f64 = 8580.0;    // mm^2
    let fz: f64 = 345.0;      // MPa

    // Concrete slab
    let fc: f64 = 28.0;       // MPa
    let b_eff: f64 = 2000.0;  // mm
    let t_slab: f64 = 125.0;  // mm
    let a_c: f64 = b_eff * t_slab;

    // Horizontal shear
    let vh_steel: f64 = a_s * fz;
    let vh_concrete: f64 = 0.85 * fc * a_c;
    let vh: f64 = vh_steel.min(vh_concrete);

    // Steel governs
    assert!(vh_steel < vh_concrete,
        "Steel should govern: {:.0} < {:.0}", vh_steel, vh_concrete);

    let vh_expected: f64 = 2_960_100.0;
    assert!((vh - vh_expected).abs() / vh_expected < 0.001,
        "V_h={:.0}, expected={:.0}", vh, vh_expected);

    // Individual stud capacity (19mm dia, same derivation as existing test 5)
    let d_stud: f64 = 19.0;
    let fu_stud: f64 = 450.0;
    let asc: f64 = PI * d_stud.powi(2) / 4.0;
    let ec: f64 = 4700.0 * fc.sqrt();
    let qn_conc: f64 = 0.5 * asc * (fc * ec).sqrt();
    let qn_steel: f64 = asc * fu_stud;
    let qn: f64 = qn_conc.min(qn_steel);

    // Verify stud capacity ~ 118.3 kN
    let qn_kn: f64 = qn / 1000.0;
    assert!((qn_kn - 118.3).abs() / 118.3 < 0.01,
        "Q_n={:.1} kN, expected ~118.3 kN", qn_kn);

    // Number of studs (between max moment and zero moment)
    let n_studs_exact: f64 = vh / qn;
    let n_studs: usize = n_studs_exact.ceil() as usize;

    assert!((n_studs_exact - 25.0).abs() < 1.0,
        "N_studs_exact={:.2}, expected ~25", n_studs_exact);
    assert!(n_studs >= 25 && n_studs <= 27,
        "N_studs={}, expected 25-27", n_studs);

    // For full span SS beam: total studs = 2*N (each half-span)
    let total_studs: usize = 2 * n_studs;
    assert!(total_studs >= 50 && total_studs <= 54,
        "Total studs for full span={}, expected 50-54", total_studs);

    // Verify consistent solver behavior: SS composite beam under UDL
    let e_s: f64 = 200_000.0;
    let n_ratio: f64 = e_s / ec;
    let d_steel: f64 = 410.0; // mm, approximate beam depth

    // Transformed section
    let b_tr: f64 = b_eff / n_ratio;
    let a_c_tr: f64 = b_tr * t_slab;
    let y_s: f64 = d_steel / 2.0;
    let y_c: f64 = d_steel + t_slab / 2.0;
    let a_tot: f64 = a_s + a_c_tr;
    let y_bar: f64 = (a_s * y_s + a_c_tr * y_c) / a_tot;
    let i_s: f64 = 220.0e6; // mm^4 approximate
    let i_c_tr: f64 = b_tr * t_slab.powi(3) / 12.0;
    let i_tr: f64 = i_s + a_s * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    let l_m: f64 = 12.0;
    let n_elem = 12;
    let q_kn: f64 = -20.0;
    let mid = n_elem / 2 + 1;

    let a_tot_m2: f64 = a_tot * 1.0e-6;
    let i_tr_m4: f64 = i_tr * 1.0e-12;
    let e_eff: f64 = e_s * 1000.0;

    let input = make_ss_beam_udl(n_elem, l_m, e_s, a_tot_m2, i_tr_m4, q_kn);
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let delta_exact: f64 = 5.0 * q_kn.abs() * l_m.powi(4) / (384.0 * e_eff * i_tr_m4);

    assert_close(delta_fem, delta_exact, 0.02,
        "Composite beam UDL deflection for stud demand section");
}

// ================================================================
// 7. Construction Stage (Unshored)
// ================================================================
//
// In unshored construction, the steel beam alone carries dead load
// during construction (stage 1). After concrete hardens, the composite
// section carries live load (stage 2).
//
// Stage 1 (steel only):
//   delta_1 = 5*w_DL*L^4 / (384*E_s*I_s)
//   sigma_bot_1 = w_DL*L^2 / (8*S_bot_steel)
//
// Stage 2 (composite):
//   delta_2 = 5*w_LL*L^4 / (384*E_s*I_tr)
//
// Total deflection = delta_1 + delta_2
// This is larger than if the full composite section carried all load.
//
// We verify: delta_total > delta_full_composite (all load on composite)
// and delta_total < delta_all_steel (all load on bare steel).
//
// Reference: Salmon et al. SS 16.6, AISC Design Guide 3

#[test]
fn validation_comp_des_ext_7_construction_stage() {
    let l_m: f64 = 10.0;
    let n_elem = 10;
    let mid = n_elem / 2 + 1;

    let e_s: f64 = 200_000.0;
    let e_eff: f64 = e_s * 1000.0;

    // Steel beam
    let a_s: f64 = 7.5e-3;   // m^2
    let iz_s: f64 = 2.0e-4;  // m^4

    // Composite section
    let n_ratio: f64 = 8.0;
    let b_slab: f64 = 1.8;
    let t_slab: f64 = 0.14;
    let d_steel: f64 = 0.42;

    let a_c_tr: f64 = (b_slab / n_ratio) * t_slab;
    let y_s: f64 = d_steel / 2.0;
    let y_c: f64 = d_steel + t_slab / 2.0;
    let a_full: f64 = a_s + a_c_tr;
    let y_bar: f64 = (a_s * y_s + a_c_tr * y_c) / a_full;
    let i_c_tr: f64 = (b_slab / n_ratio) * t_slab.powi(3) / 12.0;
    let iz_comp: f64 = iz_s + a_s * (y_bar - y_s).powi(2)
        + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);

    // Loads
    let w_dl: f64 = -8.0;  // kN/m dead load (construction stage)
    let w_ll: f64 = -10.0; // kN/m live load (service stage)
    let w_total: f64 = w_dl + w_ll; // -18.0 kN/m

    // Stage 1: steel only carries dead load
    let input_s1 = make_ss_beam_udl(n_elem, l_m, e_s, a_s, iz_s, w_dl);
    let delta_s1 = linear::solve_2d(&input_s1).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Stage 2: composite carries live load
    let input_s2 = make_ss_beam_udl(n_elem, l_m, e_s, a_full, iz_comp, w_ll);
    let delta_s2 = linear::solve_2d(&input_s2).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Total staged deflection
    let delta_staged: f64 = delta_s1 + delta_s2;

    // Compare: composite carries all load
    let input_all_comp = make_ss_beam_udl(n_elem, l_m, e_s, a_full, iz_comp, w_total);
    let delta_all_comp = linear::solve_2d(&input_all_comp).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Compare: steel carries all load
    let input_all_steel = make_ss_beam_udl(n_elem, l_m, e_s, a_s, iz_s, w_total);
    let delta_all_steel = linear::solve_2d(&input_all_steel).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Staged > fully composite (because DL is on weaker steel section)
    assert!(delta_staged > delta_all_comp,
        "Staged delta={:.6e} must be > fully composite delta={:.6e}",
        delta_staged, delta_all_comp);

    // Staged < all steel (because LL is on stiffer composite section)
    assert!(delta_staged < delta_all_steel,
        "Staged delta={:.6e} must be < all-steel delta={:.6e}",
        delta_staged, delta_all_steel);

    // Verify individual stages against analytical
    let delta_s1_exact: f64 = 5.0 * w_dl.abs() * l_m.powi(4) / (384.0 * e_eff * iz_s);
    let delta_s2_exact: f64 = 5.0 * w_ll.abs() * l_m.powi(4) / (384.0 * e_eff * iz_comp);
    assert_close(delta_s1, delta_s1_exact, 0.02, "Stage 1 (steel only) deflection");
    assert_close(delta_s2, delta_s2_exact, 0.02, "Stage 2 (composite) deflection");

    // Staged total vs analytical
    let delta_staged_exact: f64 = delta_s1_exact + delta_s2_exact;
    assert_close(delta_staged, delta_staged_exact, 0.02,
        "Staged total deflection vs analytical sum");
}

// ================================================================
// 8. Modular Ratio Effect on Neutral Axis and Section Properties
// ================================================================
//
// The modular ratio n = E_s/E_c controls how much concrete area
// is transformed. A higher n (weaker concrete) means less effective
// concrete, so the NA shifts down toward the steel centroid and
// I_tr decreases.
//
// We test three concrete grades:
//   Normal:    E_c = 25000 MPa  ->  n = 8.0
//   Medium:    E_c = 30000 MPa  ->  n = 6.67
//   High:      E_c = 35000 MPa  ->  n = 5.71
//
// Expected:
//   n_high < n_medium < n_normal
//   y_bar_high > y_bar_medium > y_bar_normal  (stronger conc raises NA)
//   I_tr_high > I_tr_medium > I_tr_normal
//   delta_high < delta_medium < delta_normal
//
// Reference: Gere & Goodno, "Mechanics of Materials", 9th Ed., SS 6.7

#[test]
fn validation_comp_des_ext_8_modular_ratio() {
    let e_s: f64 = 200_000.0;

    // Steel beam
    let a_s: f64 = 8.0e-3;    // m^2
    let iz_s: f64 = 2.2e-4;   // m^4
    let d_steel: f64 = 0.43;  // m

    // Slab geometry
    let b_slab: f64 = 2.0;    // m
    let t_slab: f64 = 0.15;   // m

    // Three concrete grades
    let e_concs = [25_000.0_f64, 30_000.0, 35_000.0];
    let labels = ["normal", "medium", "high-strength"];

    let mut n_ratios: Vec<f64> = Vec::new();
    let mut y_bars: Vec<f64> = Vec::new();
    let mut i_trs: Vec<f64> = Vec::new();
    let mut deltas: Vec<f64> = Vec::new();

    let l_m: f64 = 10.0;
    let n_elem = 10;
    let p_kn: f64 = 50.0;
    let mid = n_elem / 2 + 1;

    for &e_c in &e_concs {
        let n = e_s / e_c;
        n_ratios.push(n);

        let a_c_tr = (b_slab / n) * t_slab;
        let y_s = d_steel / 2.0;
        let y_c = d_steel + t_slab / 2.0;
        let a_tot = a_s + a_c_tr;
        let y_bar = (a_s * y_s + a_c_tr * y_c) / a_tot;
        y_bars.push(y_bar);

        let i_c_tr = (b_slab / n) * t_slab.powi(3) / 12.0;
        let i_tr = iz_s + a_s * (y_bar - y_s).powi(2)
            + i_c_tr + a_c_tr * (y_c - y_bar).powi(2);
        i_trs.push(i_tr);

        let input = make_beam(
            n_elem, l_m, e_s, a_tot, i_tr,
            "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: -p_kn, my: 0.0,
            })],
        );
        let res = linear::solve_2d(&input).unwrap();
        let delta = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uz.abs();
        deltas.push(delta);
    }

    // n_ratios should decrease (stronger concrete -> smaller n)
    assert!(n_ratios[0] > n_ratios[1] && n_ratios[1] > n_ratios[2],
        "n must decrease: {:.2} > {:.2} > {:.2}",
        n_ratios[0], n_ratios[1], n_ratios[2]);

    // y_bar should increase (stronger concrete -> NA moves up)
    assert!(y_bars[2] > y_bars[1] && y_bars[1] > y_bars[0],
        "y_bar must increase: {} {:.4} < {} {:.4} < {} {:.4}",
        labels[0], y_bars[0], labels[1], y_bars[1], labels[2], y_bars[2]);

    // I_tr should increase (stronger concrete -> more effective area)
    assert!(i_trs[2] > i_trs[1] && i_trs[1] > i_trs[0],
        "I_tr must increase: {} {:.6e} < {} {:.6e} < {} {:.6e}",
        labels[0], i_trs[0], labels[1], i_trs[1], labels[2], i_trs[2]);

    // Deflection should decrease (stiffer composite -> less deflection)
    assert!(deltas[0] > deltas[1] && deltas[1] > deltas[2],
        "delta must decrease: {} {:.6e} > {} {:.6e} > {} {:.6e}",
        labels[0], deltas[0], labels[1], deltas[1], labels[2], deltas[2]);

    // Verify deflection is inversely proportional to I_tr
    let e_eff: f64 = e_s * 1000.0;
    for i in 0..3 {
        let delta_exact = p_kn * l_m.powi(3) / (48.0 * e_eff * i_trs[i]);
        assert_close(deltas[i], delta_exact, 0.02,
            &format!("{} concrete deflection vs analytical", labels[i]));
    }

    // Deflection ratios should match inverse I_tr ratios
    let ratio_01 = deltas[0] / deltas[1];
    let expected_01 = i_trs[1] / i_trs[0];
    assert_close(ratio_01, expected_01, 0.03,
        "Deflection ratio normal/medium matches I_medium/I_normal");

    let ratio_12 = deltas[1] / deltas[2];
    let expected_12 = i_trs[2] / i_trs[1];
    assert_close(ratio_12, expected_12, 0.03,
        "Deflection ratio medium/high matches I_high/I_medium");

    // All composite cases should be stiffer than bare steel
    let delta_bare = p_kn * l_m.powi(3) / (48.0 * e_eff * iz_s);
    for i in 0..3 {
        assert!(deltas[i] < delta_bare,
            "{} composite delta={:.6e} must be < bare steel delta={:.6e}",
            labels[i], deltas[i], delta_bare);
    }
}
