/// Validation: Extended Material Nonlinear Benchmarks
///
/// References:
///   - Chen & Sohal, "Plastic Design and Second-Order Analysis of Steel Frames"
///   - Neal, "Plastic Methods of Structural Analysis"
///   - EN 1993-1-1 §6.2.1: Cross-section resistance under N+M
///   - Massonnet & Save, "Plastic Analysis and Design of Beams and Frames"
///
/// Tests:
///   1. Cantilever UDL: collapse load w_c = 2Mp/L²
///   2. SS beam third-points: collapse λ = 6Mp/(PL)
///   3. Portal frame combined: sway + beam mechanism interaction
///   4. Incremental loading: load factor monotonically increases
///   5. Hardening effect: α > 0 gives higher capacity than α = 0
///   6. Cantilever moment: M_applied = Mp ⟹ utilization ≈ 1.0
///   7. Two-span continuous beam: collapse factor for UDL
///   8. Fixed cantilever UDL: w_c = 2Mp/L² (single hinge at support)
use dedaliano_engine::solver::material_nonlinear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const FY: f64 = 250.0;

#[allow(dead_code)]
const B: f64 = 0.15;
#[allow(dead_code)]
const H: f64 = 0.30;
const A_SEC: f64 = 0.045;       // b*h
const IZ_SEC: f64 = 3.375e-4;   // bh³/12
const ZP: f64 = 3.375e-3;       // bh²/4
const MP: f64 = 843.75;         // FY*1000 * ZP
const NP: f64 = 11_250.0;       // FY*1000 * A_SEC

fn make_nonlinear_input(
    solver: SolverInput,
    alpha: f64,
    n_increments: usize,
) -> NonlinearMaterialInput {
    let mut material_models = HashMap::new();
    material_models.insert("1".to_string(), MaterialModel {
        model_type: "elastic_perfectly_plastic".to_string(),
        fy: FY,
        alpha: Some(alpha),
    });

    let mut section_capacities = HashMap::new();
    section_capacities.insert("1".to_string(), SectionCapacity {
        np: NP,
        mp: MP,
        zp: Some(ZP),
    });

    NonlinearMaterialInput {
        solver,
        material_models,
        section_capacities,
        max_iter: 50,
        tolerance: 1e-4,
        n_increments,
    }
}

// ================================================================
// 1. Cantilever UDL: Collapse Load w_c = 2·Mp/L²
// ================================================================
//
// Source: Neal, "Plastic Methods"
// Cantilever under UDL. Single hinge at fixed end.
// w_c·L²/2 = Mp ⟹ w_c = 2Mp/L²

#[test]
fn validation_matnonlin_cantilever_udl_collapse() {
    let l = 4.0;
    let n = 8;

    let wc = 2.0 * MP / (l * l); // 105.47 kN/m

    // Below collapse: w = 0.4 × wc
    let w_below = 0.4 * wc;
    let mut loads_below = Vec::new();
    for i in 0..n {
        loads_below.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_below, q_j: -w_below, a: None, b: None,
        }));
    }
    let solver_below = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", None, loads_below);
    let input_below = make_nonlinear_input(solver_below, 0.01, 20);
    let res_below = material_nonlinear::solve_nonlinear_material_2d(&input_below).unwrap();

    assert!(res_below.converged, "Should converge below collapse");
    let max_util = res_below.element_status.iter()
        .map(|s| s.utilization).fold(0.0_f64, f64::max);
    assert!(max_util < 0.95, "Below wc: max utilization={:.3}", max_util);

    // Above collapse: w = 1.5 × wc
    let w_above = 1.5 * wc;
    let mut loads_above = Vec::new();
    for i in 0..n {
        loads_above.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_above, q_j: -w_above, a: None, b: None,
        }));
    }
    let solver_above = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", None, loads_above);
    let input_above = make_nonlinear_input(solver_above, 0.01, 20);
    let res_above = material_nonlinear::solve_nonlinear_material_2d(&input_above).unwrap();

    let yielded = res_above.element_status.iter()
        .filter(|s| s.utilization > 0.95).count();
    assert!(yielded >= 1, "Above wc: {} yielded, expected >= 1", yielded);
}

// ================================================================
// 2. SS Beam Third-Points: λ = 6·Mp/(P·L)
// ================================================================
//
// Source: Massonnet & Save
// SS beam with two point loads at L/3 and 2L/3.
// M_max = PL/3 at both load points.
// Collapse: M_max = Mp ⟹ P_c = 3Mp/L, but unit load: λ = 3Mp/L.
// (factor from each load): λ × M_unit = Mp

#[test]
fn validation_matnonlin_ss_third_points() {
    let l = 6.0;
    let n = 6; // nodes at every 1.0m, so L/3=2.0m is at node 3, 2L/3=4.0m at node 5
    let pc = 3.0 * MP / l; // 421.875 kN per load point

    // Below collapse
    let p_below = 0.4 * pc;
    let loads_below = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p_below, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p_below, mz: 0.0 }),
    ];
    let solver_below = make_beam(n, l, E, A_SEC, IZ_SEC, "pinned", Some("rollerX"), loads_below);
    let input_below = make_nonlinear_input(solver_below, 0.01, 20);
    let res_below = material_nonlinear::solve_nonlinear_material_2d(&input_below).unwrap();
    assert!(res_below.converged, "Should converge below collapse");

    // Above collapse
    let p_above = 1.5 * pc;
    let loads_above = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p_above, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p_above, mz: 0.0 }),
    ];
    let solver_above = make_beam(n, l, E, A_SEC, IZ_SEC, "pinned", Some("rollerX"), loads_above);
    let input_above = make_nonlinear_input(solver_above, 0.01, 20);
    let res_above = material_nonlinear::solve_nonlinear_material_2d(&input_above).unwrap();

    let yielded = res_above.element_status.iter()
        .filter(|s| s.utilization > 0.90).count();
    assert!(yielded >= 1, "Above collapse: {} yielded elements", yielded);

    // Displacement above collapse should exceed linear proportional estimate
    let mid = n / 2 + 1;
    let disp_below = res_below.results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let disp_above = res_above.results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let linear_proj = disp_below * (p_above / p_below);
    assert!(
        disp_above > linear_proj * 0.8,
        "Above collapse disp={:.4e} should exceed linear projection={:.4e}",
        disp_above, linear_proj
    );
}

// ================================================================
// 3. Portal Frame Combined: Sway + Beam Mechanisms
// ================================================================
//
// Portal frame with lateral + gravity loads.
// Both sway and beam mechanisms can form.

#[test]
fn validation_matnonlin_portal_combined() {
    let h = 4.0;
    let w = 6.0;

    let solver = make_portal_frame(h, w, E, A_SEC, IZ_SEC, 50.0, -100.0);
    let input = make_nonlinear_input(solver, 0.01, 30);
    let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    // Should converge or show significant yielding
    let yielded = result.element_status.iter()
        .filter(|s| s.utilization > 0.90).count();

    // Portal should deflect laterally
    let d2 = result.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux.abs() > 1e-6, "Portal should have lateral drift, ux={:.6e}", d2.ux);

    // At least some yielding under combined loads
    if !result.converged {
        // Divergence implies collapse was reached
        assert!(yielded >= 1, "Non-converged portal should have yielded elements");
    }
}

// ================================================================
// 4. Incremental Loading: Load Factor Monotonically Increases
// ================================================================
//
// The load_factor at convergence should be ≥ 0 and at most 1.0.
// More increments should produce load_factor closer to 1.0 for elastic loads.

#[test]
fn validation_matnonlin_load_factor_monotonic() {
    let l = 4.0;
    let n = 4;
    let p = 100.0; // Well below Mp/L

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // Run with increasing increments
    let mut prev_lf = 0.0;
    for &n_inc in &[5, 10, 20] {
        let solver = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", None, loads.clone());
        let input = make_nonlinear_input(solver, 0.01, n_inc);
        let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

        assert!(result.load_factor >= prev_lf * 0.99,
            "Load factor should increase with increments: n_inc={}, lf={:.4}, prev={:.4}",
            n_inc, result.load_factor, prev_lf);
        prev_lf = result.load_factor;
    }

    // For elastic load, all increments should give full load factor ≈ 1.0
    assert!(prev_lf > 0.95, "Elastic load should achieve lf ≈ 1.0, got {:.4}", prev_lf);
}

// ================================================================
// 5. Hardening Effect: α > 0 Gives Higher Capacity
// ================================================================
//
// With strain hardening (α > 0), the effective moment capacity
// increases beyond Mp, allowing higher loads before divergence.

#[test]
fn validation_matnonlin_hardening_effect() {
    let l = 4.0;
    let n = 8;
    let pc = 8.0 * MP / l; // fixed-fixed collapse for point load

    // Load above elastic-perfectly-plastic collapse
    let p = 1.1 * pc;
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // EPP (α = 0.001, near zero)
    let solver_epp = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads.clone());
    let input_epp = make_nonlinear_input(solver_epp, 0.001, 30);
    let res_epp = material_nonlinear::solve_nonlinear_material_2d(&input_epp).unwrap();

    // With hardening (α = 0.05)
    let solver_hard = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", Some("fixed"), loads.clone());
    let input_hard = make_nonlinear_input(solver_hard, 0.05, 30);
    let res_hard = material_nonlinear::solve_nonlinear_material_2d(&input_hard).unwrap();

    // Hardening model should handle load better (higher load factor or smaller displacement)
    let disp_epp = res_epp.results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let disp_hard = res_hard.results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // With hardening, either better convergence or smaller displacement
    if res_hard.converged && res_epp.converged {
        assert!(
            disp_hard <= disp_epp * 1.1,
            "Hardening should reduce displacement: hard={:.4e}, epp={:.4e}",
            disp_hard, disp_epp
        );
    }
    // At minimum, hardening model should achieve at least as much load factor
    assert!(
        res_hard.load_factor >= res_epp.load_factor * 0.95,
        "Hardening lf={:.4} should be >= EPP lf={:.4}",
        res_hard.load_factor, res_epp.load_factor
    );
}

// ================================================================
// 6. Cantilever Moment: M = Mp → Utilization ≈ 1.0
// ================================================================
//
// Apply exactly Mp at the tip of a cantilever.
// The fixed end should reach utilization ≈ 1.0.

#[test]
fn validation_matnonlin_cantilever_exact_mp() {
    let l = 4.0;
    let n = 4;

    // Apply moment = Mp at tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: 0.0, mz: MP,
    })];

    let solver = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", None, loads);
    let input = make_nonlinear_input(solver, 0.01, 20);
    let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    // The first element at the fixed end should be near yielding
    let max_util = result.element_status.iter()
        .map(|s| s.utilization).fold(0.0_f64, f64::max);
    assert!(
        max_util > 0.85,
        "Applying Mp should yield utilization near 1.0, got {:.3}", max_util
    );
}

// ================================================================
// 7. Two-Span Continuous Beam UDL: λ = 11.66·Mp/(q·L²)
// ================================================================
//
// Source: Neal, "Plastic Methods"
// Symmetric two-span continuous beam under UDL.
// Collapse involves 2 hinges per span (4 total) plus intermediate support.

#[test]
fn validation_matnonlin_two_span_continuous_udl() {
    let l_span = 4.0;
    let n_per_span = 4;
    let n_total = 2 * n_per_span;

    // Build two-span beam
    let solver = make_continuous_beam(
        &[l_span, l_span], n_per_span, E, A_SEC, IZ_SEC,
        {
            let mut loads = Vec::new();
            for i in 0..n_total {
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: i + 1, q_i: -1.0, q_j: -1.0, a: None, b: None,
                }));
            }
            loads
        },
    );

    // Collapse load for symmetric two-span: w_c ≈ 11.66 Mp / L²
    let wc = 11.66 * MP / (l_span * l_span);

    // Below collapse: scale loads to 0.3 × wc
    let mut solver_below = solver.clone();
    let scale_below = 0.3 * wc;
    for load in solver_below.loads.iter_mut() {
        if let SolverLoad::Distributed(ref mut dl) = load {
            dl.q_i = -scale_below;
            dl.q_j = -scale_below;
        }
    }
    let input_below = make_nonlinear_input(solver_below, 0.01, 20);
    let res_below = material_nonlinear::solve_nonlinear_material_2d(&input_below).unwrap();
    assert!(res_below.converged, "Should converge below collapse");

    // Above collapse
    let scale_above = 1.5 * wc;
    let mut solver_above = solver.clone();
    for load in solver_above.loads.iter_mut() {
        if let SolverLoad::Distributed(ref mut dl) = load {
            dl.q_i = -scale_above;
            dl.q_j = -scale_above;
        }
    }
    let input_above = make_nonlinear_input(solver_above, 0.01, 30);
    let res_above = material_nonlinear::solve_nonlinear_material_2d(&input_above).unwrap();

    let yielded = res_above.element_status.iter()
        .filter(|s| s.utilization > 0.90).count();
    assert!(yielded >= 1, "Above collapse: {} yielded", yielded);
}

// ================================================================
// 8. Fixed Cantilever UDL: Exact Solution w_c = 2Mp/L²
// ================================================================
//
// Verify that for a fixed cantilever under UDL, the nonlinear solver
// shows yielding at the fixed end when w exceeds w_c.

#[test]
fn validation_matnonlin_fixed_cantilever_udl_yielding_pattern() {
    let l = 4.0;
    let n = 8;
    let wc = 2.0 * MP / (l * l);

    // At 1.2 × wc: should yield at the fixed end first
    let w = 1.2 * wc;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w, q_j: -w, a: None, b: None,
        }));
    }

    let solver = make_beam(n, l, E, A_SEC, IZ_SEC, "fixed", None, loads);
    let input = make_nonlinear_input(solver, 0.01, 20);
    let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    // Element 1 (at fixed end) should have highest utilization
    let elem1_util = result.element_status.iter()
        .find(|s| s.element_id == 1)
        .map(|s| s.utilization)
        .unwrap_or(0.0);

    let max_util = result.element_status.iter()
        .map(|s| s.utilization).fold(0.0_f64, f64::max);

    // Fixed-end element should be among the most utilized
    assert!(
        elem1_util > 0.8,
        "Fixed-end element should be highly utilized: {:.3}", elem1_util
    );
    assert!(
        elem1_util >= max_util * 0.8,
        "Fixed-end ({:.3}) should be near max utilization ({:.3})",
        elem1_util, max_util
    );
}
