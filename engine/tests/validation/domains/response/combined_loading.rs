/// Validation: Combined Loading Scenarios
///
/// References:
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 5 (force method)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 14 (combined effects)
///   - Eurocode 0 (EN 1990): Load combination principles
///
/// Tests verify correct superposition of multiple load types:
///   1. Thermal + mechanical on SS beam
///   2. Thermal + mechanical on fixed-fixed beam
///   3. UDL + point load on continuous beam
///   4. Axial + bending combined on column-beam
///   5. Multiple point loads: superposition check
///   6. Mixed distributed loads (triangular + uniform)
///   7. Eccentric axial load = axial + moment
///   8. Three-load combination: equilibrium
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Thermal + Mechanical: SS Beam
// ================================================================
//
// SS beam with UDL + uniform temperature rise.
// Temperature causes axial expansion but SS beam with rollerX can expand freely.
// Mechanical deflection is unchanged by temperature (SS beam).

#[test]
fn validation_combined_thermal_mechanical_ss() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let dt = 50.0; // uniform temperature rise

    // Build mechanical-only case
    let mut loads_mech = Vec::new();
    for i in 1..=n {
        loads_mech.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_mech = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_mech.clone());
    let res_mech = linear::solve_2d(&input_mech).unwrap();

    // Build combined case (mechanical + thermal)
    let mut loads_combined = loads_mech;
    for i in 1..=n {
        loads_combined.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }));
    }
    let input_combined = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_combined);
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Midspan deflection should be the same (SS beam, uniform temp = free expansion)
    let mid = n / 2 + 1;
    let d_mech = res_mech.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_combined = res_combined.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    let err = (d_mech - d_combined).abs() / d_mech.abs().max(1e-10);
    assert!(err < 0.02,
        "SS beam: thermal shouldn't affect uy: mech={:.6e}, combined={:.6e}",
        d_mech, d_combined);

    // But axial displacement should differ (thermal expansion)
    let ux_mech = res_mech.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    let ux_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    assert!((ux_combined - ux_mech).abs() > 1e-6,
        "SS beam: thermal should cause axial expansion: ux_diff={:.6e}",
        (ux_combined - ux_mech).abs());
}

// ================================================================
// 2. Thermal + Mechanical: Fixed-Fixed Beam
// ================================================================
//
// Fixed-fixed beam with UDL + uniform temperature rise.
// Temperature creates axial force because beam can't expand.
// N_thermal = α × ΔT × E × A.

#[test]
fn validation_combined_thermal_mechanical_fixed() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let dt = 50.0;

    // Mechanical only
    let mut loads_mech = Vec::new();
    for i in 1..=n {
        loads_mech.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_mech = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_mech.clone());
    let res_mech = linear::solve_2d(&input_mech).unwrap();

    // Combined
    let mut loads_combined = loads_mech;
    for i in 1..=n {
        loads_combined.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }));
    }
    let input_combined = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_combined);
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Vertical reactions should be the same (thermal doesn't affect bending for uniform temp)
    let ry_mech: f64 = res_mech.reactions.iter().map(|r| r.ry).sum();
    let ry_combined: f64 = res_combined.reactions.iter().map(|r| r.ry).sum();
    assert_close(ry_mech, ry_combined, 0.02,
        "Fixed beam: thermal doesn't affect Ry");

    // Horizontal reactions should differ (thermal creates axial restraint force)
    let rx_mech: f64 = res_mech.reactions.iter().map(|r| r.rx.abs()).sum();
    let rx_combined: f64 = res_combined.reactions.iter().map(|r| r.rx.abs()).sum();
    assert!(rx_combined > rx_mech,
        "Fixed beam: thermal creates Rx: mech={:.6}, combined={:.6}",
        rx_mech, rx_combined);
}

// ================================================================
// 3. UDL + Point Load on Continuous Beam
// ================================================================
//
// Two-span beam with UDL on span 1 and point load on span 2.
// Verify superposition: results = UDL_alone + point_alone.

#[test]
fn validation_combined_udl_point_continuous() {
    let l = 5.0;
    let n_per = 6;
    let q: f64 = -8.0;
    let p = 12.0;

    let build = |udl: bool, point: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if udl {
            for i in 1..=n_per {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i, q_i: q, q_j: q, a: None, b: None,
                }));
            }
        }
        if point {
            let mid_span2 = n_per + n_per / 2 + 1;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_span2, fx: 0.0, fy: -p, mz: 0.0,
            }));
        }
        let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_both = build(true, true);
    let res_udl = build(true, false);
    let res_point = build(false, true);

    // Superposition: reaction at node 1
    let r_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_udl = res_udl.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_point = res_point.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    let err = (r_both - (r_udl + r_point)).abs() / r_both.abs().max(0.1);
    assert!(err < 0.02,
        "Superposition: Ry_both={:.4}, sum={:.4}", r_both, r_udl + r_point);
}

// ================================================================
// 4. Axial + Bending: Column-Beam
// ================================================================
//
// Cantilever with simultaneous axial and transverse tip loads.
// N = P_axial, M = P_transverse × L. These are independent.

#[test]
fn validation_combined_axial_bending() {
    let l = 5.0;
    let n = 8;
    let px = 50.0;  // axial
    let py = 10.0;  // transverse
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: px, fy: -py, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Axial force = px throughout
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), px, 0.02,
        "Combined: axial force = Px");

    // Fixed-end moment = py × L
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz.abs(), py * l, 0.02,
        "Combined: M_fixed = Py × L");

    // Tip deflection in Y: δ = PyL³/(3EI) (independent of axial)
    let delta_exact = py * l.powi(3) / (3.0 * e_eff * IZ);
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_tip.uy.abs(), delta_exact, 0.02,
        "Combined: δy = PyL³/(3EI)");

    // Tip axial displacement: δx = PxL/(EA)
    let dx_exact = px * l / (e_eff * A);
    assert_close(d_tip.ux.abs(), dx_exact, 0.02,
        "Combined: δx = PxL/(EA)");
}

// ================================================================
// 5. Multiple Point Loads: Superposition
// ================================================================
//
// SS beam with two point loads at 1/3 and 2/3 span.
// Verify reactions match separate analyses summed.

#[test]
fn validation_combined_multiple_point_loads() {
    let l = 9.0;
    let n = 9;
    let p1 = 10.0;
    let p2 = 15.0;

    let n1 = n / 3 + 1; // node at L/3
    let n2 = 2 * n / 3 + 1; // node at 2L/3

    let build = |load1: bool, load2: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if load1 {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: n1, fx: 0.0, fy: -p1, mz: 0.0,
            }));
        }
        if load2 {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: n2, fx: 0.0, fy: -p2, mz: 0.0,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_both = build(true, true);
    let res_1 = build(true, false);
    let res_2 = build(false, true);

    // Check midspan displacement superposition
    let mid = n / 2 + 1;
    let d_both = res_both.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_1 = res_1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_2 = res_2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    let err = (d_both - (d_1 + d_2)).abs() / d_both.abs().max(1e-10);
    assert!(err < 0.02,
        "Superposition midspan: both={:.6e}, sum={:.6e}", d_both, d_1 + d_2);
}

// ================================================================
// 6. Triangular + Uniform Distributed Load
// ================================================================
//
// Cantilever with uniform + triangular distributed loads on same element.
// Total deflection = δ_uniform + δ_triangular.

#[test]
fn validation_combined_triangular_uniform() {
    let l = 6.0;
    let n = 8;
    let q_u: f64 = -5.0;   // uniform portion
    let q_tri: f64 = -10.0; // triangular peak at free end

    // Build with both loads
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * l / n as f64;
        let x_j = (i + 1) as f64 * l / n as f64;
        // Uniform component
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_u, q_j: q_u, a: None, b: None,
        }));
        // Triangular component: increases from 0 at fixed end to q_tri at free end
        let qi = q_tri * x_i / l;
        let qj = q_tri * x_j / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q_u × L + q_tri × L / 2
    let total_load = q_u.abs() * l + q_tri.abs() * l / 2.0;
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.ry, total_load, 0.03,
        "Combined loads: Ry = wL + qL/2");

    // Tip should deflect downward
    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_tip.uy < 0.0,
        "Combined loads: tip deflects down: uy={:.6e}", d_tip.uy);
}

// ================================================================
// 7. Eccentric Axial Load = Axial + Moment
// ================================================================
//
// Axial load P applied with eccentricity e is equivalent to
// P at centroid + moment M = P × e.

#[test]
fn validation_combined_eccentric_load() {
    let l = 4.0;
    let n = 6;
    let p = 20.0;
    let ecc = 0.1; // eccentricity

    // Case 1: Eccentric = P axial + M at tip
    let input1 = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p, fy: 0.0, mz: p * ecc,
        })]);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: Same P + M applied separately
    let input2 = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fy: 0.0, mz: p * ecc,
            }),
        ]);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Results should be identical
    let d1 = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let d2 = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d1.ux, d2.ux, 0.01, "Eccentric: ux matches");
    assert_close(d1.uy, d2.uy, 0.01, "Eccentric: uy matches");
    assert_close(d1.rz, d2.rz, 0.01, "Eccentric: rz matches");
}

// ================================================================
// 8. Three-Load Combination: Equilibrium
// ================================================================
//
// Frame with simultaneous lateral, gravity, and distributed loads.
// All equilibrium equations must hold.

#[test]
fn validation_combined_three_load_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let px = 8.0;
    let py1 = -15.0;
    let py2 = -15.0;
    let q: f64 = -5.0;

    // Frame with lateral, gravity, and distributed loads
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fy: py1, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: py2, mz: 0.0 }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02,
        "Three-load: ΣRx = -Px");

    // ΣFy = 0: total vertical = py1 + py2 + q × w
    let total_fy = py1 + py2 + q * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_fy, 0.02,
        "Three-load: ΣRy = -(py1 + py2 + qw)");
}
