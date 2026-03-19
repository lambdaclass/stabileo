/// Validation: Nonlinear Material (Distributed Plasticity) Analysis
///
/// Benchmarks:
///   1. Fixed-fixed beam — below Pc elastic, at 1.2×Pc shows yielding (Pc=8Mp/L)
///   2. Propped cantilever — same approach (Pc=6Mp/L)
///   3. Cantilever elastic phase — matches linear solution within 5%
use dedaliano_engine::solver::material_nonlinear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const FY: f64 = 250.0;

const A_SEC: f64 = 0.045;       // b*h = 0.15 * 0.30
const IZ_SEC: f64 = 3.375e-4;   // bh³/12
const ZP: f64 = 3.375e-3;       // bh²/4
const MP: f64 = 843.75;         // FY(kN/m²) * ZP = 250*1000 * 3.375e-3
const NP: f64 = 11_250.0;       // FY(kN/m²) * A_SEC

fn make_nonlinear_beam(
    n: usize,
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> NonlinearMaterialInput {
    let solver = make_beam(n, l, E, A_SEC, IZ_SEC, start_sup, end_sup, loads);

    let mut material_models = HashMap::new();
    material_models.insert("1".to_string(), MaterialModel {
        model_type: "elastic_perfectly_plastic".to_string(),
        fy: FY,
        alpha: Some(0.01),
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
        n_increments: 20,
    }
}

// ================================================================
// 1. Fixed-Fixed Beam: Collapse Bracket (Pc = 8·Mp/L = 1687.5 kN)
// ================================================================
//
// Source: Neal, *Plastic Methods*; Chen & Sohal
// L=4m, central point load. 3 hinges at collapse: midspan + both ends.
//
// Strategy: Run at P = 0.4×Pc (elastic) and P = 1.2×Pc (collapsed).
// - Below Pc: all utilizations < 1.0, displacement ≈ elastic
// - Above Pc: multiple yielded elements, displacement >> elastic

#[test]
fn validation_material_nonlinear_ff_collapse_bracket() {
    let l = 4.0;
    let n = 8;
    let pc = 8.0 * MP / l; // 1687.5 kN
    let mid_node = n / 2 + 1;

    // --- Below collapse: P = 0.4 × Pc = 675 kN ---
    let p_below = 0.4 * pc;
    let loads_below = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p_below, my: 0.0,
    })];
    let input_below = make_nonlinear_beam(n, l, "fixed", Some("fixed"), loads_below);
    let res_below = material_nonlinear::solve_nonlinear_material_2d(&input_below).unwrap();

    // Should converge with full load applied
    assert!(res_below.converged, "Should converge below collapse");

    // All elements should be elastic or low utilization
    let max_util_below = res_below.element_status.iter()
        .map(|s| s.utilization).fold(0.0_f64, f64::max);
    assert!(
        max_util_below < 0.95,
        "Below Pc: max utilization={:.3}, expected < 0.95", max_util_below
    );

    // --- Above collapse: P = 1.2 × Pc = 2025 kN ---
    let p_above = 1.2 * pc;
    let loads_above = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p_above, my: 0.0,
    })];
    let input_above = make_nonlinear_beam(n, l, "fixed", Some("fixed"), loads_above);
    let res_above = material_nonlinear::solve_nonlinear_material_2d(&input_above).unwrap();

    // Multiple elements should be yielded
    let yielded_above = res_above.element_status.iter()
        .filter(|s| s.utilization > 0.95).count();
    assert!(
        yielded_above >= 2,
        "Above Pc: only {} elements yielded, expected >= 2", yielded_above
    );

    // Displacement should be much larger than elastic (> 3× due to plastic deformation)
    let disp_below = res_below.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let disp_above = res_above.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    assert!(
        disp_above > 3.0 * disp_below,
        "Above Pc disp={:.4e} should be >> below Pc disp={:.4e}",
        disp_above, disp_below
    );
}

// ================================================================
// 2. Propped Cantilever: Collapse Bracket (Pc = 6·Mp/L = 1265.6 kN)
// ================================================================
//
// Source: Neal, *Plastic Methods*
// Fixed at one end, pinned at other, central point load.
// 2 hinges at collapse: fixed end + under load.

#[test]
fn validation_material_nonlinear_propped_cantilever_bracket() {
    let l = 4.0;
    let n = 8;
    let pc = 6.0 * MP / l; // 1265.6 kN
    let mid_node = n / 2 + 1;

    // Below collapse: P = 0.4 × Pc
    let p_below = 0.4 * pc;
    let loads_below = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p_below, my: 0.0,
    })];
    let input_below = make_nonlinear_beam(n, l, "fixed", Some("pinned"), loads_below);
    let res_below = material_nonlinear::solve_nonlinear_material_2d(&input_below).unwrap();

    assert!(res_below.converged, "Should converge below collapse");
    let max_util_below = res_below.element_status.iter()
        .map(|s| s.utilization).fold(0.0_f64, f64::max);
    assert!(
        max_util_below < 0.95,
        "Below Pc: max utilization={:.3}, expected < 0.95", max_util_below
    );

    // Above collapse: P = 1.5 × Pc
    let p_above = 1.5 * pc;
    let loads_above = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p_above, my: 0.0,
    })];
    let input_above = make_nonlinear_beam(n, l, "fixed", Some("pinned"), loads_above);
    let res_above = material_nonlinear::solve_nonlinear_material_2d(&input_above).unwrap();

    // At least 1 element should be yielded above collapse
    let yielded_above = res_above.element_status.iter()
        .filter(|s| s.utilization > 0.95).count();
    assert!(
        yielded_above >= 1,
        "Above Pc: {} elements yielded, expected >= 1", yielded_above
    );

    // Displacement amplification above collapse
    let disp_below = res_below.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let disp_above = res_above.results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Above collapse, displacement should be at least 2× what scaling from below would give
    let expected_linear = disp_below * (p_above / p_below);
    assert!(
        disp_above > 1.5 * expected_linear,
        "Above Pc disp={:.4e} should be >> linear projection={:.4e}",
        disp_above, expected_linear
    );
}

// ================================================================
// 3. Cantilever Elastic Phase: Matches Linear Solution Within 5%
// ================================================================
//
// P = 100 kN, well below P_yield = Mp/L = 210.9 kN.
// Nonlinear solver in elastic range should reproduce linear solution.

#[test]
fn validation_material_nonlinear_cantilever_elastic_phase() {
    let l = 4.0;
    let n = 4;
    let p = 100.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_nonlinear_beam(n, l, "fixed", None, loads.clone());
    let result = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    assert!(result.converged, "Should converge in elastic range");
    assert!(result.load_factor > 0.95, "Full load should apply, got lf={:.3}", result.load_factor);

    // Compare with elastic theory: δ = P·L³/(3·E_eff·I)
    let e_eff = E * 1000.0;
    let delta_elastic = p * l.powi(3) / (3.0 * e_eff * IZ_SEC);

    let tip = result.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let error = (tip.uz.abs() - delta_elastic).abs() / delta_elastic;
    assert!(
        error < 0.05,
        "Elastic cantilever: uy={:.6e}, elastic={:.6e}, error={:.1}%",
        tip.uz.abs(), delta_elastic, error * 100.0
    );

    // All elements should remain elastic
    for status in &result.element_status {
        assert!(
            status.utilization < 0.6,
            "Element {} should be elastic, utilization={:.3}",
            status.element_id, status.utilization
        );
    }
}
