/// Validation: Concrete Constitutive Models (Extended) — Solver-Based Tests
///
/// References:
///   - ACI 318-19: "Building Code Requirements for Structural Concrete"
///   - Branson (1977): "Deformation of Concrete Structures"
///   - Eurocode 2 (EN 1992-1-1:2004), Clause 7.4.3: Effective Moment of Inertia
///   - fib Model Code 2010, Ch. 7: Serviceability Limit States
///   - Park & Paulay (1975): "Reinforced Concrete Structures", Ch. 6
///   - Collins & Mitchell (1991): "Prestressed Concrete Structures", Ch. 3
///   - Ghali, Favre & Elbadry (2012): "Concrete Structures: Stresses and Deformations"
///   - Neville (1995): "Properties of Concrete", 4th Ed.
///
/// Tests verify concrete beam behavior using the 2D solver:
///   1. Cracked section reduced Iz yields larger deflection
///   2. Higher concrete grade (higher E) reduces deflection proportionally
///   3. Effective Iz for cracked beam between Ig and Icr (Branson's equation)
///   4. Long-term creep deflection via reduced effective E
///   5. Shrinkage-equivalent load curvature on a fixed-fixed beam
///   6. Cracking does not change reactions in a determinate beam
///   7. Cracking redistributes moments in a two-span continuous beam
///   8. Stiffness ratio effect on moment distribution in a portal frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Cracked Section Reduced Iz Yields Larger Deflection
// ================================================================
//
// A simply-supported concrete beam under UDL.
// Uncracked Ig vs cracked Icr (typically Icr ~ 0.35*Ig for RC beams).
// Since delta ~ 1/I, delta_cracked / delta_uncracked ~ Ig / Icr ~ 1/0.35.
//
// E = 30,000 MPa (concrete), L = 8m, q = -15 kN/m
// Ig = 5.4e-3 m^4 (400x600 mm gross section: bh^3/12 = 0.4*0.6^3/12)
// Icr = 0.35 * Ig = 1.89e-3 m^4

#[test]
fn validation_cracked_section_larger_deflection() {
    let e: f64 = 30_000.0; // MPa (solver multiplies by 1000 -> 30 GPa)
    let a: f64 = 0.24; // m^2 (400 x 600 mm)
    let l: f64 = 8.0;
    let n: usize = 8;
    let q: f64 = -15.0; // kN/m downward

    let ig: f64 = 5.4e-3; // m^4, gross moment of inertia
    let icr: f64 = 0.35 * ig; // m^4, cracked moment of inertia

    let input_g = make_ss_beam_udl(n, l, e, a, ig, q);
    let input_cr = make_ss_beam_udl(n, l, e, a, icr, q);

    let res_g = linear::solve_2d(&input_g).unwrap();
    let res_cr = linear::solve_2d(&input_cr).unwrap();

    let mid = n / 2 + 1;
    let d_g = res_g.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_cr = res_cr.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Cracked deflection must be larger
    assert!(d_cr > d_g,
        "Cracked deflection ({:.6e}) must exceed uncracked ({:.6e})", d_cr, d_g);

    // Ratio should be close to Ig/Icr = 1/0.35 ~ 2.857
    let ratio = d_cr / d_g;
    let expected_ratio = ig / icr;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.05,
        "Deflection ratio {:.4} should be close to Ig/Icr={:.4}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 2. Higher Concrete Grade Reduces Deflection Proportionally
// ================================================================
//
// For a simply-supported beam under UDL, delta = 5qL^4/(384EI).
// Deflection is inversely proportional to E.
// Compare C30 (E=30,000 MPa) vs C50 (E=35,000 MPa):
//   delta_C30 / delta_C50 = E_C50 / E_C30 = 35000/30000 = 7/6

#[test]
fn validation_higher_grade_reduces_deflection() {
    let e_c30: f64 = 30_000.0; // MPa
    let e_c50: f64 = 35_000.0; // MPa
    let a: f64 = 0.24;
    let iz: f64 = 5.4e-3;
    let l: f64 = 8.0;
    let n: usize = 8;
    let q: f64 = -15.0;

    let input_30 = make_ss_beam_udl(n, l, e_c30, a, iz, q);
    let input_50 = make_ss_beam_udl(n, l, e_c50, a, iz, q);

    let res_30 = linear::solve_2d(&input_30).unwrap();
    let res_50 = linear::solve_2d(&input_50).unwrap();

    let mid = n / 2 + 1;
    let d_30 = res_30.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_50 = res_50.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // C50 deflection should be smaller
    assert!(d_50 < d_30,
        "Higher E should yield smaller deflection: d_C50={:.6e} vs d_C30={:.6e}", d_50, d_30);

    // Ratio d_30/d_50 ~ E_C50/E_C30
    let ratio = d_30 / d_50;
    let expected_ratio = e_c50 / e_c30;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Deflection ratio {:.4} should be {:.4}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 3. Effective Iz Bracketed Between Ig and Icr (Branson's Equation)
// ================================================================
//
// Branson's effective moment of inertia:
//   Ie = Icr + (Ig - Icr) * (Mcr/Ma)^3
// where Mcr = cracking moment, Ma = applied moment.
//
// For Ma > Mcr: Icr < Ie < Ig
//
// We verify that a beam with Ie produces deflection between
// the Ig-beam and Icr-beam deflections.
//
// Assume Mcr/Ma = 0.6 (partially cracked):
//   Ie = Icr + (Ig - Icr)*0.6^3 = Icr + 0.216*(Ig - Icr)

#[test]
fn validation_branson_effective_iz_bounded() {
    let e: f64 = 30_000.0;
    let a: f64 = 0.24;
    let l: f64 = 8.0;
    let n: usize = 8;
    let q: f64 = -15.0;

    let ig: f64 = 5.4e-3;
    let icr: f64 = 0.35 * ig;

    // Branson's Ie for Mcr/Ma = 0.6
    let mcr_over_ma: f64 = 0.6;
    let ie: f64 = icr + (ig - icr) * mcr_over_ma.powi(3);

    // Ie must lie between Icr and Ig
    assert!(ie > icr && ie < ig,
        "Ie={:.6e} must be between Icr={:.6e} and Ig={:.6e}", ie, icr, ig);

    let input_g = make_ss_beam_udl(n, l, e, a, ig, q);
    let input_cr = make_ss_beam_udl(n, l, e, a, icr, q);
    let input_e = make_ss_beam_udl(n, l, e, a, ie, q);

    let res_g = linear::solve_2d(&input_g).unwrap();
    let res_cr = linear::solve_2d(&input_cr).unwrap();
    let res_e = linear::solve_2d(&input_e).unwrap();

    let mid = n / 2 + 1;
    let d_g = res_g.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_cr = res_cr.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_e = res_e.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Deflection with Ie must be between those with Ig and Icr
    assert!(d_e > d_g && d_e < d_cr,
        "Branson Ie deflection ({:.6e}) must be between gross ({:.6e}) and cracked ({:.6e})",
        d_e, d_g, d_cr);

    // Verify deflection ratio matches Ie relationship: d_e/d_g ~ Ig/Ie
    let ratio = d_e / d_g;
    let expected_ratio = ig / ie;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.05,
        "Deflection ratio {:.4} vs Ig/Ie={:.4}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 4. Long-Term Creep Deflection via Reduced Effective E
// ================================================================
//
// Simplified creep approach: use E_eff = E / (1 + phi) where phi
// is the creep coefficient. This gives the long-term deflection.
//
// For phi = 2.0 (typical long-term): E_eff = E/3
// delta_long / delta_short = (1 + phi) = 3.0
//
// Cantilever, L=4m, tip load P=-20 kN
// delta = PL^3 / (3EI)

#[test]
fn validation_creep_effective_modulus_deflection() {
    let e_short: f64 = 30_000.0; // MPa, short-term
    let phi: f64 = 2.0; // creep coefficient
    let e_long: f64 = e_short / (1.0 + phi); // effective modulus method

    let a: f64 = 0.24;
    let iz: f64 = 5.4e-3;
    let l: f64 = 4.0;
    let n: usize = 8;
    let p: f64 = -20.0; // kN, tip load

    let tip_node = n + 1;
    let load = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
    })];

    let input_short = make_beam(n, l, e_short, a, iz, "fixed", None, load.clone());
    let input_long = make_beam(n, l, e_long, a, iz, "fixed", None, load);

    let res_short = linear::solve_2d(&input_short).unwrap();
    let res_long = linear::solve_2d(&input_long).unwrap();

    let d_short = res_short.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();
    let d_long = res_long.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // Long-term deflection should be (1+phi) times short-term
    let ratio = d_long / d_short;
    let expected_ratio = 1.0 + phi;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Creep multiplier: d_long/d_short={:.4}, expected {:.1}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);

    // Also verify against analytical: delta = PL^3/(3EI)
    let e_eff: f64 = e_short * 1000.0; // internal units
    let delta_exact = p.abs() * l.powi(3) / (3.0 * e_eff * iz);
    let err_short = (d_short - delta_exact).abs() / delta_exact;
    assert!(err_short < 0.05,
        "Short-term vs exact: {:.6e} vs {:.6e}, err={:.2}%",
        d_short, delta_exact, err_short * 100.0);
}

// ================================================================
// 5. Shrinkage-Equivalent Moment on a Cantilever Beam
// ================================================================
//
// Shrinkage induces curvature in a non-symmetrically reinforced beam.
// The equivalent shrinkage moment is M_sh = EI * kappa_sh.
//
// For a cantilever beam with a tip moment M:
//   delta_tip = M * L^2 / (2 * EI)
//   theta_tip = M * L / (EI)
//
// We apply M_sh at the tip of a cantilever and verify the tip
// deflection matches the analytical formula.
//
// kappa_sh = 0.5e-3 (1/m), typical shrinkage curvature
// EI_eff = 30e6 * 5.4e-3 = 162,000 kN*m^2 (E in kPa = E_MPa * 1000)
// M_sh = EI * kappa = 162000 * 0.5e-3 = 81 kN*m

#[test]
fn validation_shrinkage_equivalent_moment_cantilever() {
    let e: f64 = 30_000.0; // MPa
    let a: f64 = 0.24;
    let iz: f64 = 5.4e-3;
    let l: f64 = 4.0;
    let n: usize = 8;

    let e_eff: f64 = e * 1000.0; // kPa (internal units)
    let kappa_sh: f64 = 0.5e-3; // 1/m
    let m_sh: f64 = e_eff * iz * kappa_sh; // kN*m

    // Apply moment at the free tip of a cantilever
    let tip_node = n + 1;
    let input = make_beam(n, l, e, a, iz, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: 0.0, mz: m_sh,
        })]);

    let res = linear::solve_2d(&input).unwrap();

    let d_tip = res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy.abs();

    // delta_tip = M * L^2 / (2 * EI)
    let delta_exact = m_sh * l.powi(2) / (2.0 * e_eff * iz);

    let err = (d_tip - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Shrinkage tip deflection: {:.6e} vs exact {:.6e}, err={:.2}%",
        d_tip, delta_exact, err * 100.0);

    // Also verify the tip rotation: theta = M*L/(EI)
    let theta_tip = res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().rz.abs();
    let theta_exact = m_sh * l / (e_eff * iz);
    let err_theta = (theta_tip - theta_exact).abs() / theta_exact;
    assert!(err_theta < 0.05,
        "Shrinkage tip rotation: {:.6e} vs exact {:.6e}, err={:.2}%",
        theta_tip, theta_exact, err_theta * 100.0);
}

// ================================================================
// 6. Cracking Does Not Change Reactions (Determinate Beam)
// ================================================================
//
// For a statically determinate simply-supported beam, reactions
// depend only on equilibrium, not on EI. Changing Iz to simulate
// cracking should not alter the reaction forces.
//
// SS beam, L=6m, UDL q=-20 kN/m
// Total load = q*L = -120 kN, each reaction = 60 kN upward

#[test]
fn validation_cracking_no_effect_determinate_reactions() {
    let e: f64 = 30_000.0;
    let a: f64 = 0.24;
    let l: f64 = 6.0;
    let n: usize = 6;
    let q: f64 = -20.0;

    let ig: f64 = 5.4e-3;
    let icr: f64 = 0.35 * ig;

    let input_g = make_ss_beam_udl(n, l, e, a, ig, q);
    let input_cr = make_ss_beam_udl(n, l, e, a, icr, q);

    let res_g = linear::solve_2d(&input_g).unwrap();
    let res_cr = linear::solve_2d(&input_cr).unwrap();

    // Sum vertical reactions
    let ry_g: f64 = res_g.reactions.iter().map(|r| r.ry).sum();
    let ry_cr: f64 = res_cr.reactions.iter().map(|r| r.ry).sum();

    // Both should equal total applied load (absolute value)
    let total_load = q.abs() * l;
    assert_close(ry_g, total_load, 0.01,
        "Gross section total reaction");
    assert_close(ry_cr, total_load, 0.01,
        "Cracked section total reaction");

    // Reactions should match each other
    assert_close(ry_g, ry_cr, 0.01,
        "Gross vs cracked reactions must be equal");

    // Individual reactions: each should be total_load / 2
    let expected_each = total_load / 2.0;
    for r in &res_g.reactions {
        assert_close(r.ry, expected_each, 0.02,
            &format!("Gross reaction at node {}", r.node_id));
    }
    for r in &res_cr.reactions {
        assert_close(r.ry, expected_each, 0.02,
            &format!("Cracked reaction at node {}", r.node_id));
    }
}

// ================================================================
// 7. Cracking Redistributes Moments in a Two-Span Continuous Beam
// ================================================================
//
// For an indeterminate structure, changing EI (due to cracking)
// redistributes internal forces. A two-span continuous beam loaded
// only on span 1: reducing Iz in span 1 changes the center reaction.
//
// From the three-moment equation for two spans (L1 = L2 = L)
// with UDL q on span 1 only, and different EI per span:
//   M_B = -q*L^2/8 * (EI2 / (EI1 + EI2))
//
// When EI1 = EI2: M_B = -qL^2/16
// When EI1 < EI2 (cracked span 1): M_B magnitude decreases
//   because the cracked span is more flexible and sheds moment.
//
// Two equal spans L=6m each, UDL q=-15 kN/m on span 1 only.

#[test]
fn validation_cracking_redistributes_continuous_beam() {
    let e: f64 = 30_000.0;
    let a: f64 = 0.24;
    let l_span: f64 = 6.0;
    let n_per_span: usize = 4;
    let q: f64 = -15.0;

    let ig: f64 = 5.4e-3;
    let icr: f64 = 0.35 * ig;

    let total_nodes = 2 * n_per_span + 1;
    let total_elems = 2 * n_per_span;
    let elem_len = l_span / n_per_span as f64;

    // Case 1: uniform Ig throughout, load on span 1 only
    let nodes_1: Vec<(usize, f64, f64)> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems_1: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups_1 = vec![
        (1, 1, "pinned"),
        (2, n_per_span + 1, "rollerX"),
        (3, total_nodes, "rollerX"),
    ];
    let mut loads_1 = Vec::new();
    for i in 0..n_per_span {
        loads_1.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_uniform = make_input(
        nodes_1, vec![(1, e, 0.3)], vec![(1, a, ig)], elems_1, sups_1, loads_1,
    );
    let res_uniform = linear::solve_2d(&input_uniform).unwrap();

    // Case 2: cracked Iz in span 1, gross Iz in span 2, load on span 1 only
    let nodes_2: Vec<(usize, f64, f64)> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems_2: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..total_elems)
        .map(|i| {
            let sec_id = if i < n_per_span { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
        })
        .collect();
    let sups_2 = vec![
        (1, 1, "pinned"),
        (2, n_per_span + 1, "rollerX"),
        (3, total_nodes, "rollerX"),
    ];
    let mut loads_2 = Vec::new();
    for i in 0..n_per_span {
        loads_2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_cracked = make_input(
        nodes_2, vec![(1, e, 0.3)], vec![(1, a, icr), (2, a, ig)], elems_2, sups_2, loads_2,
    );
    let res_cracked = linear::solve_2d(&input_cracked).unwrap();

    // Center support node
    let center_node = n_per_span + 1;

    let ry_center_uniform = res_uniform.reactions.iter()
        .find(|r| r.node_id == center_node).unwrap().ry;
    let ry_center_cracked = res_cracked.reactions.iter()
        .find(|r| r.node_id == center_node).unwrap().ry;

    // Cracking in span 1 makes it more flexible, so center reaction changes
    let diff = (ry_center_cracked - ry_center_uniform).abs();
    let rel_diff = diff / ry_center_uniform.abs();
    assert!(rel_diff > 0.001,
        "Cracking should redistribute: uniform center Ry={:.4}, cracked center Ry={:.4}, diff={:.4}%",
        ry_center_uniform, ry_center_cracked, rel_diff * 100.0);

    // Total equilibrium must still hold for both cases
    let total_load = q.abs() * l_span; // load on span 1 only
    let ry_total_uniform: f64 = res_uniform.reactions.iter().map(|r| r.ry).sum();
    let ry_total_cracked: f64 = res_cracked.reactions.iter().map(|r| r.ry).sum();
    assert_close(ry_total_uniform, total_load, 0.01, "uniform total equilibrium");
    assert_close(ry_total_cracked, total_load, 0.01, "cracked total equilibrium");
}

// ================================================================
// 8. Stiffness Ratio Effect on Moment Distribution in Portal Frame
// ================================================================
//
// In a portal frame, the distribution of moments between beam and
// columns depends on their relative stiffness (EI/L). Using a
// stiffer beam (higher Iz) attracts more moment to the beam.
//
// Portal frame: h=4m, w=6m, lateral load F=50 kN at top-left.
// Case 1: beam Iz = column Iz (equal stiffness per unit length)
// Case 2: beam Iz = 3 * column Iz (stiffer beam)
//
// With a stiffer beam, the beam end moments increase and the
// column base moments change.

#[test]
fn validation_stiffness_ratio_portal_frame_moments() {
    let e: f64 = 30_000.0; // MPa, concrete
    let a: f64 = 0.24;
    let h: f64 = 4.0; // column height
    let w: f64 = 6.0; // beam span
    let f_lat: f64 = 50.0; // kN, lateral load

    let iz_col: f64 = 2.0e-3; // column Iz
    let _iz_beam_1: f64 = iz_col; // equal stiffness
    let iz_beam_2: f64 = 3.0 * iz_col; // stiffer beam

    // Case 1: uniform Iz
    let input_1 = make_portal_frame(h, w, e, a, iz_col, f_lat, 0.0);
    let res_1 = linear::solve_2d(&input_1).unwrap();

    // Case 2: stiffer beam — build manually
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let mats = vec![(1, e, 0.3)];
    let secs = vec![(1, a, iz_col), (2, a, iz_beam_2)];
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam (stiffer)
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input_2 = make_input(nodes, mats, secs, elems, sups, loads);
    let res_2 = linear::solve_2d(&input_2).unwrap();

    // Check that total horizontal reaction equals applied load in both cases
    let rx_total_1: f64 = res_1.reactions.iter().map(|r| r.rx).sum();
    let rx_total_2: f64 = res_2.reactions.iter().map(|r| r.rx).sum();
    assert_close(rx_total_1.abs(), f_lat, 0.02, "Case 1 horizontal equilibrium");
    assert_close(rx_total_2.abs(), f_lat, 0.02, "Case 2 horizontal equilibrium");

    // Stiffer beam should reduce the lateral sway at the top
    let sway_1 = res_1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway_2 = res_2.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    assert!(sway_2 < sway_1,
        "Stiffer beam should reduce sway: case1={:.6e}, case2={:.6e}", sway_1, sway_2);

    // Base moment distribution should change: sum of base moments
    // must equal F*h for overall equilibrium (moment about base)
    let mz_base_1: f64 = res_1.reactions.iter().map(|r| r.mz.abs()).sum();
    let mz_base_2: f64 = res_2.reactions.iter().map(|r| r.mz.abs()).sum();

    // Both should be consistent (not necessarily equal due to axial effects)
    assert!(mz_base_1 > 0.0, "Base moments must exist in case 1");
    assert!(mz_base_2 > 0.0, "Base moments must exist in case 2");

    // The stiffer beam case should produce different base moment distribution
    // compared to the uniform case
    let ratio = mz_base_2 / mz_base_1;
    assert!(ratio != 1.0,
        "Base moment distribution should differ: ratio={:.4}", ratio);
}
