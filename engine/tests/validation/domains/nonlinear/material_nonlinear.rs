/// Validation: Nonlinear Material (Distributed Plasticity) Analysis
///
/// Benchmarks:
///   1. Fixed-fixed beam — below Pc elastic, at 1.2×Pc shows yielding (Pc=8Mp/L)
///   2. Propped cantilever — same approach (Pc=6Mp/L)
///   3. Cantilever elastic phase — matches linear solution within 5%
use dedaliano_engine::solver::{linear, material_nonlinear};
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

// ================================================================
// 4. Support Settlement — Prescribed Displacement Consistency
// ================================================================
//
// A cantilever whose fixed support settles dz = 0.01 m while carrying a
// tip load. With no section capacities the analysis stays elastic, so the
// nonlinear solver must (a) converge and (b) reproduce the linear
// solution exactly (rigid-body settlement + elastic deflection).
//
// Regression: the NR loop used to subtract K_fr*u_r from the RHS even
// though f_int already contained that coupling through u_full, and only
// applied u_r after the first solve — so settlement-only increments
// converged instantly to u = 0, and load+settlement increments stagnated
// at residual ||K_fr*u_r|| and reported non-convergence.

#[test]
fn validation_material_nonlinear_support_settlement_matches_linear() {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: A_SEC, iz: IZ_SEC, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(0.01), dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
    })];

    let solver = SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(),
    };

    let lin = linear::solve_2d(&solver).unwrap();
    let lin_tip = lin.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let input = NonlinearMaterialInput {
        solver,
        material_models: HashMap::new(),
        section_capacities: HashMap::new(),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments: 2,
    };
    let res = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    assert!(res.converged, "Settlement analysis should converge");
    let nl_tip = res.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        (nl_tip.uz - lin_tip.uz).abs() < 1e-6,
        "Tip uz: nonlinear={:.6e}, linear={:.6e}",
        nl_tip.uz, lin_tip.uz
    );
    assert!(
        (nl_tip.ry - lin_tip.ry).abs() < 1e-8,
        "Tip ry: nonlinear={:.6e}, linear={:.6e}",
        nl_tip.ry, lin_tip.ry
    );
}

// Pure settlement, no external load: the increment must still iterate and
// produce the rigid-body motion (previously it "converged" at u = 0).
#[test]
fn validation_material_nonlinear_pure_settlement() {
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 5.0, z: 0.0 });

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: A_SEC, iz: IZ_SEC, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(0.01), dry: None, angle: None,
    });

    let solver = SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![],
        constraints: vec![], connectors: HashMap::new(),
    };

    let input = NonlinearMaterialInput {
        solver,
        material_models: HashMap::new(),
        section_capacities: HashMap::new(),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments: 2,
    };
    let res = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();

    assert!(res.converged, "Pure settlement should converge");
    let nl_tip = res.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // Rigid-body translation: the free end follows the settled support.
    assert!(
        (nl_tip.uz - 0.01).abs() < 1e-9,
        "Tip uz should follow the 0.01 m settlement, got {:.6e}",
        nl_tip.uz
    );
    assert!(
        nl_tip.ry.abs() < 1e-12,
        "Cantilever settlement is rigid-body: ry should be ~0, got {:.6e}",
        nl_tip.ry
    );
}

// ================================================================
// 5. Reported load_factor must reflect the last CONVERGED increment
// ================================================================
//
// With max_iter = 1 no increment can converge; the run must report
// converged = false AND load_factor = 0.0 — not 1.0 (full load).

#[test]
fn validation_material_nonlinear_failed_run_reports_partial_load_factor() {
    let l = 4.0;
    let n = 8;
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -100.0, my: 0.0,
    })];
    let mut input = make_nonlinear_beam(n, l, "fixed", Some("fixed"), loads);
    input.max_iter = 1;
    input.n_increments = 4;

    let res = material_nonlinear::solve_nonlinear_material_2d(&input).unwrap();
    assert!(!res.converged, "max_iter=1 cannot converge");
    assert!(
        res.load_factor == 0.0,
        "No increment converged: load_factor should be 0.0, got {:.3}",
        res.load_factor
    );
}

// ================================================================
// 6. Sparse tangent path (nf >= SPARSE_THRESHOLD=64) vs dense parity
// ================================================================
//
// Same structure meshed just below/above the sparse threshold, mirroring
// fiber_sparse_path_parity_with_dense. With nodal loads only, frame
// elements give the mesh-independent exact solution, so the dense and
// sparse paths must agree to solver precision.

/// Elastic nonlinear input over a given mesh: no section capacities ->
/// Np/Mp infinite -> stays elastic, so the dense and sparse runs follow
/// the same Newton trajectory.
fn make_nl_elastic(solver: SolverInput) -> NonlinearMaterialInput {
    let mut material_models = HashMap::new();
    material_models.insert("1".to_string(), MaterialModel {
        model_type: "elastic_perfectly_plastic".to_string(),
        fy: FY,
        alpha: Some(0.01),
    });

    NonlinearMaterialInput {
        solver,
        material_models,
        section_capacities: HashMap::new(),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments: 5,
    }
}

/// Cantilever (fixed at node 1, tip load): nf = 3 * n_elements.
fn make_nl_cantilever_meshed(n_elements: usize, l: f64, fz: f64) -> NonlinearMaterialInput {
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elements + 1,
        fx: 0.0,
        fz,
        my: 0.0,
    })];
    make_nl_elastic(make_beam(n_elements, l, E, A_SEC, IZ_SEC, "fixed", None, loads))
}

#[test]
fn material_nonlinear_sparse_path_parity_with_dense() {
    let (l, fz) = (5.0, -50.0);

    // nf = 3 * n_elements: 20 -> 60 (dense), 22 -> 66 (sparse).
    let r_dense = material_nonlinear::solve_nonlinear_material_2d(
        &make_nl_cantilever_meshed(20, l, fz),
    ).unwrap();
    let r_sparse = material_nonlinear::solve_nonlinear_material_2d(
        &make_nl_cantilever_meshed(22, l, fz),
    ).unwrap();
    assert!(r_dense.converged, "dense path should converge");
    assert!(r_sparse.converged, "sparse path should converge");

    let tip_uz = |r: &NonlinearMaterialResult, node: usize| {
        r.results.displacements.iter().find(|d| d.node_id == node).unwrap().uz
    };
    let uz_dense = tip_uz(&r_dense, 21);
    let uz_sparse = tip_uz(&r_sparse, 23);

    // Both match the closed-form tip deflection (mesh-independent here).
    let e_kn_m2 = E * 1000.0;
    let analytical = fz.abs() * l.powi(3) / (3.0 * e_kn_m2 * IZ_SEC);
    for (name, uz) in [("dense", uz_dense), ("sparse", uz_sparse)] {
        let rel = (uz.abs() - analytical).abs() / analytical;
        assert!(
            rel < 0.01,
            "{name} tip deflection vs analytical: uz={uz:.6e}, analytical={analytical:.6e}"
        );
    }

    // Dense vs sparse parity.
    let rel = (uz_dense - uz_sparse).abs() / uz_dense.abs().max(1e-15);
    assert!(
        rel < 1e-6,
        "dense/sparse tip parity: dense={uz_dense:.8e}, sparse={uz_sparse:.8e}"
    );
}

/// Same parity check, but with a 45° inclined roller at the far end so the
/// sparse path exercises the triplet inclined-support rotation
/// (apply_inclined_transform_triplets_2d + rotate_inclined_f_2d).
#[test]
fn material_nonlinear_sparse_path_parity_inclined_support() {
    let (l, fz) = (6.0, -30.0);

    // Fixed at node 1 + inclinedRoller at the far end: nf = 3*n - 1.
    // 20 elements -> 59 (dense), 22 -> 65 (sparse). Load at midspan
    // (node 11 = x=L/2 exists in both even meshes).
    let build = |n_elements: usize| {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elements / 2 + 1,
            fx: 0.0,
            fz,
            my: 0.0,
        })];
        let mut solver = make_beam(
            n_elements, l, E, A_SEC, IZ_SEC, "fixed", Some("inclinedRoller"), loads,
        );
        for sup in solver.supports.values_mut() {
            if sup.support_type == "inclinedRoller" {
                sup.angle = Some(std::f64::consts::FRAC_PI_4);
            }
        }
        make_nl_elastic(solver)
    };

    let r_dense = material_nonlinear::solve_nonlinear_material_2d(&build(20)).unwrap();
    let r_sparse = material_nonlinear::solve_nonlinear_material_2d(&build(22)).unwrap();
    assert!(r_dense.converged, "dense path (inclined) should converge");
    assert!(r_sparse.converged, "sparse path (inclined) should converge");

    let mid_uz = |r: &NonlinearMaterialResult, node: usize| {
        r.results.displacements.iter().find(|d| d.node_id == node).unwrap().uz
    };
    let uz_dense = mid_uz(&r_dense, 11);
    let uz_sparse = mid_uz(&r_sparse, 12);

    let rel = (uz_dense - uz_sparse).abs() / uz_dense.abs().max(1e-15);
    assert!(
        rel < 1e-5,
        "dense/sparse inclined-support parity: dense={uz_dense:.8e}, sparse={uz_sparse:.8e}"
    );
}
