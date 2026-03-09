/// Validation: Extended Composite Beam/Frame Structures
///
/// References:
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed., Ch. 16
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 6 (Composite beams)
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 16
///   - Viest, Fountain & Singleton, "Composite Construction in Steel and Concrete", ASCE
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed.
///
/// These tests exercise composite structural behaviour using the transformed-section
/// method, multi-material models, and equivalent stiffness approaches. Composite
/// action is modelled by computing equivalent section properties (EI, EA) for
/// steel-concrete sections or by building multi-element models with different
/// material properties on each element.
///
/// Tests:
///   1. Transformed section — steel-concrete composite beam, equivalent I, deflection check
///   2. Full vs partial composite — stiffness comparison
///   3. Composite beam deflection — Ec/Es transformed method
///   4. Steel beam with concrete slab — effective width calculation
///   5. Composite column — axial capacity via transformed section
///   6. Two-material truss — steel and aluminum members, force distribution
///   7. Composite frame — mixed material columns/beams, drift comparison
///   8. Temperature effects in composite — differential thermal expansion
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Transformed Section — Steel-Concrete Composite Beam
// ================================================================
//
// A steel W-beam topped with a concrete slab is converted to an
// equivalent all-steel section using the modular ratio n = Es/Ec.
// The concrete slab width b is divided by n to get the equivalent
// steel width, and the composite neutral axis and moment of inertia
// are computed via the parallel axis theorem.
//
// We model a single SS beam with the composite EI and verify that
// the midspan deflection under a point load matches PL^3/(48 EI_tr).
//
// Source: Salmon et al., "Steel Structures: Design and Behavior", §16.3.
#[test]
fn validation_composite_extended_transformed_section_deflection() {
    let l: f64 = 10.0; // span (m)
    let n_elem = 10;
    let p: f64 = 50.0; // midspan point load (kN)
    let mid = n_elem / 2 + 1;

    // Steel beam: W410x67 approximation
    let e_steel = 200_000.0; // MPa (solver input)
    let a_steel = 8.55e-3; // m^2
    let iz_steel = 2.45e-4; // m^4

    // Concrete slab: 150mm thick, 2000mm wide
    let e_conc: f64 = 25_000.0; // MPa
    let _t_slab: f64 = 0.15; // m
    let _b_slab: f64 = 2.0; // m

    // Modular ratio
    let n_ratio = e_steel / e_conc; // 8.0

    // Transformed concrete area (as equivalent steel)
    let a_conc_tr = (_b_slab / n_ratio) * _t_slab; // equivalent steel area
    // Concrete centroid relative to steel beam bottom
    // Assume steel beam depth ~400mm, slab sits on top
    let d_steel = 0.40; // approximate steel beam depth
    let y_steel = d_steel / 2.0; // steel centroid from bottom
    let y_conc = d_steel + _t_slab / 2.0; // concrete centroid from bottom

    // Composite centroid (from bottom)
    let a_total = a_steel + a_conc_tr;
    let y_bar = (a_steel * y_steel + a_conc_tr * y_conc) / a_total;

    // Composite I by parallel axis theorem
    let iz_conc_tr = (_b_slab / n_ratio) * _t_slab.powi(3) / 12.0;
    let iz_composite = iz_steel + a_steel * (y_bar - y_steel).powi(2)
        + iz_conc_tr + a_conc_tr * (y_conc - y_bar).powi(2);

    // Use composite E = E_steel and the composite I
    // The solver internally multiplies E by 1000 to get kN/m^2
    let e_eff = e_steel * 1000.0; // kN/m^2

    // Exact midspan deflection: delta = P * L^3 / (48 * E * I)
    let delta_exact = p * l.powi(3) / (48.0 * e_eff * iz_composite);

    // FEM model with composite section properties
    let input = make_beam(
        n_elem, l, e_steel, a_total, iz_composite,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let delta_fem = res.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert_close(delta_fem, delta_exact, 0.02,
        "Transformed section composite beam midspan deflection");

    // Composite beam must deflect less than bare steel beam
    let delta_steel_only = p * l.powi(3) / (48.0 * e_eff * iz_steel);
    assert!(delta_fem < delta_steel_only,
        "Composite delta={:.6e} must be less than bare steel delta={:.6e}",
        delta_fem, delta_steel_only);
}

// ================================================================
// 2. Full vs Partial Composite — Stiffness Comparison
// ================================================================
//
// Full composite action means the concrete and steel act as a single
// section (no slip). Partial composite means some fraction of the
// shear connection is effective, so the composite EI is between
// the bare steel EI and the full composite EI:
//   EI_partial = EI_steel + eta * (EI_full_composite - EI_steel)
// where eta is the degree of composite action (0 < eta < 1).
//
// We verify: delta_full < delta_partial < delta_bare_steel.
//
// Source: McCormac & Csernak, "Structural Steel Design", 6th Ed., §16.8.
#[test]
fn validation_composite_extended_full_vs_partial() {
    let l: f64 = 8.0;
    let n_elem = 8;
    let p: f64 = 40.0;
    let mid = n_elem / 2 + 1;

    let e_steel: f64 = 200_000.0;
    let a_steel: f64 = 6.0e-3;
    let iz_steel: f64 = 1.5e-4;

    // Full composite section (steel + transformed concrete)
    let n_ratio: f64 = 8.0; // Es/Ec
    let b_slab: f64 = 1.5;
    let t_slab: f64 = 0.12;
    let d_steel: f64 = 0.35;

    let a_conc_tr = (b_slab / n_ratio) * t_slab;
    let y_steel = d_steel / 2.0;
    let y_conc = d_steel + t_slab / 2.0;
    let a_total_full = a_steel + a_conc_tr;
    let y_bar = (a_steel * y_steel + a_conc_tr * y_conc) / a_total_full;

    let iz_conc_tr = (b_slab / n_ratio) * t_slab.powi(3) / 12.0;
    let iz_full = iz_steel + a_steel * (y_bar - y_steel).powi(2)
        + iz_conc_tr + a_conc_tr * (y_conc - y_bar).powi(2);

    // Partial composite: eta = 0.5
    let eta = 0.5;
    let iz_partial = iz_steel + eta * (iz_full - iz_steel);
    let a_partial = a_steel + eta * (a_total_full - a_steel);

    // Solve all three cases
    let load = |mid_node| {
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })]
    };

    let input_bare = make_beam(n_elem, l, e_steel, a_steel, iz_steel,
        "pinned", Some("rollerX"), load(mid));
    let input_partial = make_beam(n_elem, l, e_steel, a_partial, iz_partial,
        "pinned", Some("rollerX"), load(mid));
    let input_full = make_beam(n_elem, l, e_steel, a_total_full, iz_full,
        "pinned", Some("rollerX"), load(mid));

    let delta_bare = linear::solve_2d(&input_bare).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let delta_partial = linear::solve_2d(&input_partial).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let delta_full = linear::solve_2d(&input_full).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Full composite is stiffest
    assert!(delta_full < delta_partial,
        "Full composite delta={:.6e} must be < partial delta={:.6e}",
        delta_full, delta_partial);
    assert!(delta_partial < delta_bare,
        "Partial composite delta={:.6e} must be < bare steel delta={:.6e}",
        delta_partial, delta_bare);

    // Quantitative check: ratio matches EI ratio
    let e_eff = e_steel * 1000.0;
    let delta_full_exact = p * l.powi(3) / (48.0 * e_eff * iz_full);
    assert_close(delta_full, delta_full_exact, 0.02,
        "Full composite midspan deflection vs exact");
}

// ================================================================
// 3. Composite Beam Deflection — Ec/Es Transformed Method
// ================================================================
//
// A simply-supported composite beam with UDL. The transformed section
// method uses n = Es/Ec to convert concrete to equivalent steel.
// For a UDL q on a SS beam: delta_max = 5qL^4 / (384 EI).
//
// We verify the FEM deflection matches the closed-form solution for
// the composite EI, and that deflection scales inversely with the
// modular ratio used.
//
// Source: Gere & Goodno, "Mechanics of Materials", 9th Ed., §6.7.
#[test]
fn validation_composite_extended_ec_es_transformed_udl() {
    let l: f64 = 12.0;
    let n_elem = 12;
    let q: f64 = -10.0; // kN/m (downward)
    let mid = n_elem / 2 + 1;

    let e_steel: f64 = 200_000.0;

    // Two different concrete grades
    let e_conc_normal: f64 = 25_000.0; // n = 8
    let e_conc_high: f64 = 40_000.0;   // n = 5

    let a_steel: f64 = 7.5e-3;
    let iz_steel: f64 = 2.0e-4;
    let b_slab: f64 = 1.8;
    let t_slab: f64 = 0.15;
    let d_steel: f64 = 0.40;

    // Helper: compute composite I for given Ec
    let compute_composite_iz = |e_c: f64| -> (f64, f64) {
        let n_r = e_steel / e_c;
        let a_c_tr = (b_slab / n_r) * t_slab;
        let y_s = d_steel / 2.0;
        let y_c = d_steel + t_slab / 2.0;
        let a_tot = a_steel + a_c_tr;
        let y_b = (a_steel * y_s + a_c_tr * y_c) / a_tot;
        let iz_c_tr = (b_slab / n_r) * t_slab.powi(3) / 12.0;
        let iz = iz_steel + a_steel * (y_b - y_s).powi(2)
            + iz_c_tr + a_c_tr * (y_c - y_b).powi(2);
        (a_tot, iz)
    };

    let (a_normal, iz_normal) = compute_composite_iz(e_conc_normal);
    let (a_high, iz_high) = compute_composite_iz(e_conc_high);

    let e_eff = e_steel * 1000.0;

    // Exact UDL midspan deflection: 5qL^4 / (384 EI)
    let delta_normal_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_normal);
    let delta_high_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_high);

    // FEM: normal concrete composite
    let input_normal = make_ss_beam_udl(n_elem, l, e_steel, a_normal, iz_normal, q);
    let res_normal = linear::solve_2d(&input_normal).unwrap();
    let delta_normal_fem = res_normal.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // FEM: high-strength concrete composite
    let input_high = make_ss_beam_udl(n_elem, l, e_steel, a_high, iz_high, q);
    let res_high = linear::solve_2d(&input_high).unwrap();
    let delta_high_fem = res_high.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    assert_close(delta_normal_fem, delta_normal_exact, 0.02,
        "Composite UDL deflection (normal concrete)");
    assert_close(delta_high_fem, delta_high_exact, 0.02,
        "Composite UDL deflection (high-strength concrete)");

    // Higher-strength concrete => stiffer composite => less deflection
    assert!(delta_high_fem < delta_normal_fem,
        "High-strength concrete delta={:.6e} must be < normal concrete delta={:.6e}",
        delta_high_fem, delta_normal_fem);

    // Deflection ratio should be close to inverse EI ratio
    let expected_ratio = iz_normal / iz_high; // < 1 means high is stiffer
    let actual_ratio = delta_high_fem / delta_normal_fem;
    let err = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.03,
        "Deflection ratio: actual={:.4}, expected EI_norm/EI_high={:.4}, err={:.1}%",
        actual_ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 4. Steel Beam with Concrete Slab — Effective Width
// ================================================================
//
// In composite design the full slab width is not always effective
// in resisting bending. The effective width b_eff is limited by
// code rules (e.g., AISC: b_eff <= L/4, or <= beam spacing).
//
// We compare three cases: narrow effective width, medium, and full
// width. A wider effective width means more concrete contributes,
// giving a higher composite I and less deflection.
//
// Source: Viest et al., "Composite Construction in Steel and Concrete", ASCE.
#[test]
fn validation_composite_extended_effective_width() {
    let l: f64 = 10.0;
    let n_elem = 10;
    let p: f64 = 60.0;
    let mid = n_elem / 2 + 1;

    let e_steel: f64 = 200_000.0;
    let a_steel: f64 = 9.0e-3;
    let iz_steel: f64 = 3.0e-4;
    let t_slab: f64 = 0.15;
    let d_steel: f64 = 0.45;
    let n_ratio: f64 = 200_000.0 / 30_000.0; // n ~ 6.67

    // Three effective widths: narrow, medium, full
    let widths = [0.5, 1.5, 2.5]; // m

    let mut deltas = Vec::new();
    let mut iz_composites = Vec::new();

    for &b_eff in &widths {
        let a_c_tr = (b_eff / n_ratio) * t_slab;
        let y_s = d_steel / 2.0;
        let y_c = d_steel + t_slab / 2.0;
        let a_tot = a_steel + a_c_tr;
        let y_bar = (a_steel * y_s + a_c_tr * y_c) / a_tot;
        let iz_c_tr = (b_eff / n_ratio) * t_slab.powi(3) / 12.0;
        let iz_comp = iz_steel + a_steel * (y_bar - y_s).powi(2)
            + iz_c_tr + a_c_tr * (y_c - y_bar).powi(2);

        iz_composites.push(iz_comp);

        let input = make_beam(n_elem, l, e_steel, a_tot, iz_comp,
            "pinned", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
            })]);
        let res = linear::solve_2d(&input).unwrap();
        let delta = res.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();
        deltas.push(delta);
    }

    // Wider effective width => larger I => less deflection
    assert!(deltas[2] < deltas[1],
        "Full width delta={:.6e} must be < medium width delta={:.6e}",
        deltas[2], deltas[1]);
    assert!(deltas[1] < deltas[0],
        "Medium width delta={:.6e} must be < narrow width delta={:.6e}",
        deltas[1], deltas[0]);

    // Verify deflection is inversely proportional to EI
    let e_eff = e_steel * 1000.0;
    for i in 0..3 {
        let delta_exact = p * l.powi(3) / (48.0 * e_eff * iz_composites[i]);
        assert_close(deltas[i], delta_exact, 0.02,
            &format!("Effective width b_eff={:.1}m deflection", widths[i]));
    }

    // All composite cases must be stiffer than bare steel
    let delta_bare = p * l.powi(3) / (48.0 * e_eff * iz_steel);
    for (i, &delta) in deltas.iter().enumerate() {
        assert!(delta < delta_bare,
            "Composite (b_eff={:.1}m) delta={:.6e} must be < bare steel delta={:.6e}",
            widths[i], delta, delta_bare);
    }
}

// ================================================================
// 5. Composite Column — Axial Capacity via Transformed Section
// ================================================================
//
// A concrete-filled steel tube (CFT) column under axial load. The
// transformed section has total axial stiffness:
//   (EA)_composite = Es*As + Ec*Ac
// Using the transformed section with E_steel as reference:
//   A_transformed = As + Ac/n   where n = Es/Ec
//
// A cantilever column loaded axially should shorten by:
//   delta = P*L / (EA)_composite
//
// We verify the FEM tip displacement matches this formula.
//
// Source: McCormac & Csernak, "Structural Steel Design", 6th Ed., §16.12.
#[test]
fn validation_composite_extended_column_axial() {
    let l = 4.0; // column height (m)
    let n_elem = 8;
    let p_axial = 500.0; // kN (compression, applied as -fx on horizontal column)
    let tip = n_elem + 1;

    let e_steel = 200_000.0;
    let e_conc = 30_000.0;
    let n_ratio = e_steel / e_conc;

    // Steel tube: 300x300x10 HSS approximation
    let a_steel = 11.0e-3; // m^2
    // Concrete infill
    let a_conc = 0.28 * 0.28; // interior area, m^2

    // Transformed area (all equivalent steel)
    let a_transformed = a_steel + a_conc / n_ratio;

    // Use a small I to minimize bending effects (axially loaded column)
    let iz_small = 1.0e-6;

    let e_eff = e_steel * 1000.0; // kN/m^2

    // Exact axial shortening: delta = P*L / (E*A)
    let delta_exact = p_axial * l / (e_eff * a_transformed);

    // Model as horizontal beam (column along X), fixed at base, free at tip
    // Apply axial compression at tip (negative fx)
    let input = make_beam(
        n_elem, l, e_steel, a_transformed, iz_small,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: -p_axial, fy: 0.0, mz: 0.0,
        })],
    );
    let res = linear::solve_2d(&input).unwrap();
    let ux_tip = res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().ux.abs();

    assert_close(ux_tip, delta_exact, 0.02,
        "Composite column axial shortening");

    // Composite column should shorten less than bare steel column
    let delta_steel_only = p_axial * l / (e_eff * a_steel);
    assert!(ux_tip < delta_steel_only,
        "Composite shortening={:.6e} must be < bare steel shortening={:.6e}",
        ux_tip, delta_steel_only);

    // Verify the stiffness ratio: delta_composite/delta_steel = A_steel/A_transformed
    let expected_ratio = a_steel / a_transformed;
    let actual_ratio = ux_tip / delta_steel_only;
    let err = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Axial stiffness ratio: actual={:.4}, expected={:.4}, err={:.1}%",
        actual_ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 6. Two-Material Truss — Steel and Aluminum Members
// ================================================================
//
// A simple truss with mixed materials: steel diagonals and aluminum
// horizontals (or vice versa). Load distribution depends on axial
// stiffness EA/L of each member. Members with higher EA/L attract
// more force.
//
// We build a symmetric 3-node truss (triangle) with one steel member
// and two aluminum members. The force in each member should be
// proportional to its axial stiffness contribution.
//
// Source: Gere & Goodno, "Mechanics of Materials", 9th Ed., §2.5.
#[test]
fn validation_composite_extended_two_material_truss() {
    // Symmetric triangular truss: nodes at (0,0), (4,0), (2,2)
    // Pinned at nodes 1 and 2, load at node 3 downward.
    let p = 100.0; // kN downward at apex

    let e_steel = 200_000.0;
    let e_alum = 70_000.0;

    let a_member = 5.0e-3; // same cross-section area for all
    let iz_truss = 1.0e-10; // negligible bending stiffness for truss

    // Nodes
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 2.0, 2.0),
    ];

    // Elements: bottom chord (steel), left diagonal (aluminum), right diagonal (aluminum)
    // Material 1 = steel, Material 2 = aluminum
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom: steel
        (2, "truss", 1, 3, 2, 1, false, false), // left diag: aluminum
        (3, "truss", 2, 3, 2, 1, false, false), // right diag: aluminum
    ];

    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, e_steel, 0.3), (2, e_alum, 0.33)],
        vec![(1, a_member, iz_truss)],
        elems, sups, loads,
    );
    let res = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = res.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Two-material truss vertical equilibrium");

    // Symmetry: both supports carry equal vertical reaction
    let r1_y = res.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2_y = res.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    assert_close(r1_y, r2_y, 0.01, "Two-material truss symmetric reactions");
    assert_close(r1_y, p / 2.0, 0.01, "Two-material truss reaction = P/2");

    // Left and right diagonals should carry the same force (symmetry)
    let ef2 = res.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let ef3 = res.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.02,
        "Symmetric diagonal forces");

    // Now compare with all-steel version: apex displacement changes
    let input_all_steel = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)],
        vec![(1, e_steel, 0.3), (2, e_steel, 0.3)],
        vec![(1, a_member, iz_truss)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 2, 1, false, false),
            (3, "truss", 2, 3, 2, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let res_all_steel = linear::solve_2d(&input_all_steel).unwrap();

    let delta_mixed = res.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();
    let delta_all_steel = res_all_steel.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uy.abs();

    // Mixed (aluminum diagonals) should deflect more than all-steel
    assert!(delta_mixed > delta_all_steel,
        "Mixed truss delta={:.6e} must be > all-steel delta={:.6e}",
        delta_mixed, delta_all_steel);
}

// ================================================================
// 7. Composite Frame — Mixed Material Columns/Beams, Drift
// ================================================================
//
// A portal frame where columns are concrete (lower E) and the beam
// is steel (higher E). Under lateral load, the frame drift depends
// on the combined stiffness of all members. A frame with stiffer
// columns (higher E) will have less lateral drift.
//
// We compare three cases:
//   (a) All steel frame
//   (b) Concrete columns + steel beam (composite frame)
//   (c) All concrete frame
//
// Expected: drift_all_concrete > drift_composite > drift_all_steel
//
// Source: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §4.3.
#[test]
fn validation_composite_extended_mixed_material_frame_drift() {
    let h = 4.0;   // column height
    let w = 6.0;   // beam span
    let f_lateral = 30.0; // lateral load at beam level (kN)

    let e_steel = 200_000.0;
    let e_conc = 30_000.0;

    let a_col = 0.04;  // 200x200mm column
    let iz_col = 1.333e-4; // m^4
    let a_beam = 8.0e-3;
    let iz_beam = 2.0e-4;

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lateral, fy: 0.0, mz: 0.0,
    })];

    // (a) All steel
    let elems_steel = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let input_steel = make_input(
        nodes.clone(), vec![(1, e_steel, 0.3)],
        vec![(1, a_col, iz_col), (2, a_beam, iz_beam)],
        elems_steel, sups.clone(), loads.clone(),
    );
    let res_steel = linear::solve_2d(&input_steel).unwrap();
    let drift_steel = res_steel.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // (b) Composite: concrete columns (mat 2) + steel beam (mat 1)
    let elems_composite = vec![
        (1, "frame", 1, 2, 2, 1, false, false), // left column: concrete
        (2, "frame", 2, 3, 1, 2, false, false), // beam: steel
        (3, "frame", 3, 4, 2, 1, false, false), // right column: concrete
    ];
    let input_composite = make_input(
        nodes.clone(), vec![(1, e_steel, 0.3), (2, e_conc, 0.2)],
        vec![(1, a_col, iz_col), (2, a_beam, iz_beam)],
        elems_composite, sups.clone(), loads.clone(),
    );
    let res_composite = linear::solve_2d(&input_composite).unwrap();
    let drift_composite = res_composite.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // (c) All concrete
    let elems_conc = vec![
        (1, "frame", 1, 2, 2, 1, false, false),
        (2, "frame", 2, 3, 2, 2, false, false),
        (3, "frame", 3, 4, 2, 1, false, false),
    ];
    let input_conc = make_input(
        nodes.clone(), vec![(1, e_steel, 0.3), (2, e_conc, 0.2)],
        vec![(1, a_col, iz_col), (2, a_beam, iz_beam)],
        elems_conc, sups.clone(), loads.clone(),
    );
    let res_conc = linear::solve_2d(&input_conc).unwrap();
    let drift_conc = res_conc.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Ordering: all-concrete > composite > all-steel
    assert!(drift_conc > drift_composite,
        "All-concrete drift={:.6e} must be > composite drift={:.6e}",
        drift_conc, drift_composite);
    assert!(drift_composite > drift_steel,
        "Composite drift={:.6e} must be > all-steel drift={:.6e}",
        drift_composite, drift_steel);

    // Equilibrium check for each case
    for (label, res) in [
        ("all-steel", &res_steel),
        ("composite", &res_composite),
        ("all-concrete", &res_conc),
    ] {
        let sum_rx: f64 = res.reactions.iter().map(|r| r.rx).sum();
        assert_close(sum_rx.abs(), f_lateral, 0.01,
            &format!("{} frame horizontal equilibrium", label));
    }

    // Concrete is ~6.67x weaker, so all-concrete drift should be roughly
    // E_steel/E_conc times the all-steel drift (not exact due to beam/column
    // interaction, but should be in the right ballpark)
    let ratio = drift_conc / drift_steel;
    let e_ratio = e_steel / e_conc;
    // For a portal frame, drift scales roughly with 1/E, so ratio ~ e_ratio
    // Allow wider tolerance due to beam-column interaction effects
    assert!(ratio > e_ratio * 0.5 && ratio < e_ratio * 1.5,
        "Drift ratio={:.2}, expected near E_s/E_c={:.2}", ratio, e_ratio);
}

// ================================================================
// 8. Temperature Effects in Composite — Differential Thermal Expansion
// ================================================================
//
// When steel and concrete in a composite beam have different
// temperatures (e.g., fire exposure or solar heating), the
// differential expansion induces internal forces. In the FEM model,
// thermal loads produce equivalent nodal forces via:
//   F_axial = E * A * alpha * dT_uniform
//   M_thermal = E * I * alpha * dT_gradient / h
//
// We compare the thermal response of two beams with different
// stiffnesses (representing different composite configurations)
// under the same thermal gradient. The stiffer beam develops
// larger internal forces.
//
// The solver uses alpha = 12e-6 (steel default) for thermal loads.
//
// Source: Roark & Young, "Formulas for Stress and Strain", 8th Ed., §15.
#[test]
fn validation_composite_extended_temperature_effects() {
    let l: f64 = 8.0;
    let n_elem = 8;

    let e_steel = 200_000.0;
    let alpha = 12e-6; // hardcoded in solver

    // Case A: bare steel section
    let a_a = 8.0e-3;
    let iz_a = 1.5e-4;

    // Case B: composite section (stiffer)
    let a_b = 12.0e-3;
    let iz_b = 4.0e-4;

    let dt_gradient = 30.0; // 30 deg C difference top-to-bottom

    // For a simply-supported beam with thermal gradient only:
    // The beam curves but is free to expand, so reactions are zero
    // (statically determinate). The midspan deflection is:
    //   delta = alpha * dT_gradient * L^2 / (8 * h)
    // where h = section height = sqrt(12 * I / A).
    //
    // However, for a fixed-fixed beam, the thermal gradient induces
    // moments: M = E * I * alpha * dT_gradient / h
    // We use fixed-fixed to check that the stiffer section develops
    // larger restraint moments.

    // Fixed-fixed beams with thermal gradient
    let make_thermal_beam = |a: f64, iz: f64| -> SolverInput {
        let mut loads = Vec::new();
        for i in 0..n_elem {
            loads.push(SolverLoad::Thermal(SolverThermalLoad {
                element_id: i + 1,
                dt_uniform: 0.0,
                dt_gradient,
            }));
        }
        make_beam(n_elem, l, e_steel, a, iz, "fixed", Some("fixed"), loads)
    };

    let res_a = linear::solve_2d(&make_thermal_beam(a_a, iz_a)).unwrap();
    let res_b = linear::solve_2d(&make_thermal_beam(a_b, iz_b)).unwrap();

    // Fixed-fixed beam with thermal gradient: end moment = E*I*alpha*dT/h
    let e_eff = e_steel * 1000.0;
    let h_a = (12.0 * iz_a / a_a).sqrt();
    let h_b = (12.0 * iz_b / a_b).sqrt();
    let m_exact_a = e_eff * iz_a * alpha * dt_gradient / h_a;
    let m_exact_b = e_eff * iz_b * alpha * dt_gradient / h_b;

    // Check reaction moments at fixed supports
    let m_react_a = res_a.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_react_b = res_b.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();

    assert_close(m_react_a, m_exact_a, 0.05,
        "Thermal moment case A (bare steel)");
    assert_close(m_react_b, m_exact_b, 0.05,
        "Thermal moment case B (composite section)");

    // Stiffer section develops larger thermal moment
    assert!(m_react_b > m_react_a,
        "Composite thermal moment={:.4} must be > bare steel moment={:.4}",
        m_react_b, m_react_a);

    // For a simply-supported beam, thermal gradient causes pure curvature
    // with no internal forces (statically determinate). Verify zero reactions.
    let make_ss_thermal = |a: f64, iz: f64| -> SolverInput {
        let mut loads = Vec::new();
        for i in 0..n_elem {
            loads.push(SolverLoad::Thermal(SolverThermalLoad {
                element_id: i + 1,
                dt_uniform: 0.0,
                dt_gradient,
            }));
        }
        make_beam(n_elem, l, e_steel, a, iz, "pinned", Some("rollerX"), loads)
    };

    let res_ss = linear::solve_2d(&make_ss_thermal(a_a, iz_a)).unwrap();
    let m_ss = res_ss.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    // Pinned support has no moment reaction
    assert!(m_ss < 1e-3,
        "SS beam thermal gradient should give ~zero moment reaction, got {:.6}", m_ss);

    // The SS beam should still deflect upward/downward due to curvature
    let mid = n_elem / 2 + 1;
    let delta_ss = res_ss.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let delta_ss_exact = alpha * dt_gradient * l.powi(2) / (8.0 * h_a);
    assert_close(delta_ss, delta_ss_exact, 0.05,
        "SS beam thermal deflection");
}
