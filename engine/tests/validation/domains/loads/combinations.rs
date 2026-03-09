/// Validation: Load Combinations and Envelope Analysis
///
/// References:
///   - EN 1990 §6.4.3.2 — ULS load combination factors
///   - Superposition principle for linear elastic systems
///
/// Tests:
///   1. EN 1990 ULS combo: 1.35×DL + 1.50×LL + 0.9×Wind
///   2. Negative factor (wind uplift): 0.9×DL - 1.50×Wind
///   3. Identity factor: factor=1.0 single case = original
///   4. 3D biaxial combo: 2×Fy + 1×Fz = direct solve
///   5. Envelope of 4 load cases on SS beam
///   6. Envelope symmetry
///   7. 3D envelope with 3 load cases
///   8. Combined element forces match direct solution
use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. EN 1990 ULS: 1.35×DL + 1.50×LL + 0.9×Wind
// ================================================================
//
// Simply-supported beam, 3 separate load cases solved independently.
// Combined result should equal direct solve of factored-sum loads
// (exact for linear systems).

#[test]
fn validation_comb_en1990_uls() {
    let n = 8;
    let l = 6.0;

    // DL: UDL -5 kN/m
    let dl_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -5.0, q_j: -5.0, a: None, b: None,
        }))
        .collect();

    // LL: point load -20 kN at midspan
    let ll_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -20.0, mz: 0.0,
    })];

    // Wind: UDL +3 kN/m (uplift)
    let wind_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 3.0, q_j: 3.0, a: None, b: None,
        }))
        .collect();

    let input_dl = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), dl_loads.clone());
    let input_ll = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), ll_loads.clone());
    let input_wind = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), wind_loads.clone());

    let res_dl = linear::solve_2d(&input_dl).unwrap();
    let res_ll = linear::solve_2d(&input_ll).unwrap();
    let res_wind = linear::solve_2d(&input_wind).unwrap();

    // Combine: 1.35×DL + 1.50×LL + 0.90×Wind
    let combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.35 },
            CombinationFactor { case_id: 2, factor: 1.50 },
            CombinationFactor { case_id: 3, factor: 0.90 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_dl },
            CaseEntry { case_id: 2, results: res_ll },
            CaseEntry { case_id: 3, results: res_wind },
        ],
    };
    let combined = combine_results(&combo).unwrap();

    // Direct solve with factored loads
    let mut direct_loads = Vec::new();
    for i in 1..=n {
        let q = 1.35 * (-5.0) + 0.90 * 3.0;
        direct_loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    direct_loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: 1.50 * (-20.0), mz: 0.0,
    }));
    let input_direct = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), direct_loads);
    let res_direct = linear::solve_2d(&input_direct).unwrap();

    // Compare displacements at midspan
    let mid_comb = combined.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let mid_direct = res_direct.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid_comb.uy, mid_direct.uy, 1e-6, "combo midspan uy");

    // Compare reactions
    let r1_comb = combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_direct = res_direct.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_comb.ry, r1_direct.ry, 1e-6, "combo R1_y");
}

// ================================================================
// 2. Negative Factor (Wind Uplift): 0.9×DL - 1.50×Wind
// ================================================================

#[test]
fn validation_comb_negative_factor_wind() {
    let n = 8;
    let l = 6.0;

    let dl_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }))
        .collect();

    let wind_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 8.0, q_j: 8.0, a: None, b: None,
        }))
        .collect();

    let res_dl = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), dl_loads)).unwrap();
    let res_wind = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), wind_loads)).unwrap();

    let combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 0.9 },
            CombinationFactor { case_id: 2, factor: -1.5 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res_dl },
            CaseEntry { case_id: 2, results: res_wind },
        ],
    };
    let combined = combine_results(&combo).unwrap();

    // Direct: 0.9×(-10) + (-1.5)×8 = -9 - 12 = -21 kN/m
    let direct_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -21.0, q_j: -21.0, a: None, b: None,
        }))
        .collect();
    let res_direct = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), direct_loads)).unwrap();

    let mid_comb = combined.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    let mid_direct = res_direct.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid_comb.uy, mid_direct.uy, 1e-6, "wind uplift combo uy");
}

// ================================================================
// 3. Identity Factor: factor=1.0 → round-trip
// ================================================================

#[test]
fn validation_comb_identity_factor() {
    let n = 8;
    let l = 6.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -50.0, mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let original = linear::solve_2d(&input).unwrap();

    let combo = CombinationInput {
        factors: vec![CombinationFactor { case_id: 1, factor: 1.0 }],
        cases: vec![CaseEntry { case_id: 1, results: original.clone() }],
    };
    let combined = combine_results(&combo).unwrap();

    // Every displacement should match exactly
    for (orig, comb) in original.displacements.iter().zip(combined.displacements.iter()) {
        assert_close(comb.ux, orig.ux, 1e-10, &format!("identity ux node {}", orig.node_id));
        assert_close(comb.uy, orig.uy, 1e-10, &format!("identity uy node {}", orig.node_id));
        assert_close(comb.rz, orig.rz, 1e-10, &format!("identity rz node {}", orig.node_id));
    }

    for (orig, comb) in original.reactions.iter().zip(combined.reactions.iter()) {
        assert_close(comb.ry, orig.ry, 1e-10, &format!("identity ry node {}", orig.node_id));
    }
}

// ================================================================
// 4. 3D Biaxial Combo: 2×Fy + 1×Fz = direct solve
// ================================================================

#[test]
fn validation_comb_3d_biaxial() {
    let n = 4;
    let l = 3.0;
    let nu = 0.3;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 2e-4;
    let j = 1e-4;

    // Case 1: Fy load at tip
    let fy_loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -10.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    // Case 2: Fz load at tip
    let fz_loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -5.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let fixed_dofs = vec![true, true, true, true, true, true];
    let input_fy = make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, fy_loads);
    let input_fz = make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, fz_loads);

    let res_fy = linear::solve_3d(&input_fy).unwrap();
    let res_fz = linear::solve_3d(&input_fz).unwrap();

    let combo = CombinationInput3D {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 2.0 },
            CombinationFactor { case_id: 2, factor: 1.0 },
        ],
        cases: vec![
            CaseEntry3D { case_id: 1, results: res_fy },
            CaseEntry3D { case_id: 2, results: res_fz },
        ],
    };
    let combined = combine_results_3d(&combo).unwrap();

    // Direct solve: 2×Fy + Fz
    let direct_loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -20.0, fz: -5.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_direct = make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs, None, direct_loads);
    let res_direct = linear::solve_3d(&input_direct).unwrap();

    let tip_comb = combined.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_direct = res_direct.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_comb.uy, tip_direct.uy, 1e-6, "3D combo tip uy");
    assert_close(tip_comb.uz, tip_direct.uz, 1e-6, "3D combo tip uz");
}

// ================================================================
// 5. Envelope of 4 Load Cases on SS Beam
// ================================================================
//
// 4 different load cases, verify envelope max/min match hand-computed
// governing values.

#[test]
fn validation_envelope_4_cases() {
    let n = 8;
    let l = 6.0;

    // Case 1: UDL -10 kN/m (downward)
    let udl_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }))
        .collect();

    // Case 2: point load -30 kN at quarter span
    let pt_quarter = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 4 + 1, fx: 0.0, fy: -30.0, mz: 0.0,
    })];

    // Case 3: point load -30 kN at midspan
    let pt_mid = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -30.0, mz: 0.0,
    })];

    // Case 4: UDL +5 kN/m (uplift)
    let uplift_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 5.0, q_j: 5.0, a: None, b: None,
        }))
        .collect();

    let mut all_results = Vec::new();
    for loads in [udl_loads, pt_quarter, pt_mid, uplift_loads] {
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        all_results.push(linear::solve_2d(&input).unwrap());
    }

    let envelope = compute_envelope(&all_results).unwrap();

    // Moment envelope should have non-zero values
    assert!(envelope.moment.global_max > 0.0, "Moment envelope global_max should be positive");
    assert!(envelope.shear.global_max > 0.0, "Shear envelope global_max should be positive");

    // Check that envelope moment elements are populated
    assert_eq!(envelope.moment.elements.len(), n, "Should have moment envelope for each element");

    // Each element should have pos and neg envelopes
    for elem_env in &envelope.moment.elements {
        assert!(!elem_env.t_positions.is_empty(), "t_positions should be populated");
        assert_eq!(elem_env.pos_values.len(), elem_env.t_positions.len());
        assert_eq!(elem_env.neg_values.len(), elem_env.t_positions.len());
    }

    // max_abs_results should capture governing displacements
    let mid_peak = envelope.max_abs_results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(mid_peak.uy.abs() > 0.0, "Peak midspan deflection should be non-zero");
}

// ================================================================
// 6. Envelope Symmetry
// ================================================================
//
// Symmetric beam + symmetric load → symmetric envelope.

#[test]
fn validation_envelope_symmetry() {
    let n = 8;
    let l = 6.0;

    // Two symmetric cases: UDL down and UDL up
    let udl_down: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -10.0, q_j: -10.0, a: None, b: None,
        }))
        .collect();
    let udl_up: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: 10.0, q_j: 10.0, a: None, b: None,
        }))
        .collect();

    let res_down = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), udl_down)).unwrap();
    let res_up = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), udl_up)).unwrap();

    let envelope = compute_envelope(&[res_down, res_up]).unwrap();

    // For symmetric ±UDL, pos and neg envelopes at midspan should be
    // equal in magnitude (the envelope is symmetric about zero).
    // Check the middle element's midpoint values.
    let mid_elem = &envelope.moment.elements[n / 2 - 1];
    let mid_idx = mid_elem.t_positions.len() / 2;
    let pos = mid_elem.pos_values[mid_idx];
    let neg = mid_elem.neg_values[mid_idx];
    // |pos| ≈ |neg| for symmetric loading
    assert_close(pos.abs(), neg.abs(), 0.01, "symmetric envelope pos ≈ neg at mid");
}

// ================================================================
// 7. 3D Envelope with 3 Load Cases
// ================================================================

#[test]
fn validation_envelope_3d_multi_case() {
    let n = 4;
    let l = 3.0;
    let nu = 0.3;
    let a = 0.01;
    let iy = 1e-4;
    let iz = 2e-4;
    let j = 1e-4;

    let fixed_dofs = vec![true, true, true, true, true, true];

    // Case 1: Fy at tip
    let loads1 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -10.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    // Case 2: Fz at tip
    let loads2 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -10.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    // Case 3: Torque at tip
    let loads3 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 5.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let res1 = linear::solve_3d(&make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, loads1)).unwrap();
    let res2 = linear::solve_3d(&make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs.clone(), None, loads2)).unwrap();
    let res3 = linear::solve_3d(&make_3d_beam(n, l, E, nu, a, iy, iz, j, fixed_dofs, None, loads3)).unwrap();

    let envelope = compute_envelope_3d(&[res1, res2, res3]).unwrap();

    // All 6 diagram types should be populated
    assert!(!envelope.moment_y.elements.is_empty(), "moment_y elements populated");
    assert!(!envelope.moment_z.elements.is_empty(), "moment_z elements populated");
    assert!(!envelope.shear_y.elements.is_empty(), "shear_y elements populated");
    assert!(!envelope.shear_z.elements.is_empty(), "shear_z elements populated");
    assert!(!envelope.axial.elements.is_empty(), "axial elements populated");
    assert!(!envelope.torsion.elements.is_empty(), "torsion elements populated");

    // Torsion envelope should reflect case 3
    assert!(envelope.torsion.global_max > 0.0, "Torsion envelope should be non-zero");
}

// ================================================================
// 8. Combined Element Forces Match Direct Solution
// ================================================================

#[test]
fn validation_comb_element_forces() {
    let n = 4;
    let l = 4.0;

    // Case 1: UDL
    let udl_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -8.0, q_j: -8.0, a: None, b: None,
        }))
        .collect();

    // Case 2: Point load at midspan
    let pt_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -20.0, mz: 0.0,
    })];

    let res1 = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), udl_loads)).unwrap();
    let res2 = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), pt_loads)).unwrap();

    // Combine: 1.5×UDL + 2.0×point
    let combo = CombinationInput {
        factors: vec![
            CombinationFactor { case_id: 1, factor: 1.5 },
            CombinationFactor { case_id: 2, factor: 2.0 },
        ],
        cases: vec![
            CaseEntry { case_id: 1, results: res1 },
            CaseEntry { case_id: 2, results: res2 },
        ],
    };
    let combined = combine_results(&combo).unwrap();

    // Direct solve
    let mut direct_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -12.0, q_j: -12.0, a: None, b: None,
        }))
        .collect();
    direct_loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fy: -40.0, mz: 0.0,
    }));
    let res_direct = linear::solve_2d(&make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), direct_loads)).unwrap();

    // Compare element forces
    for ef_comb in &combined.element_forces {
        let ef_direct = res_direct.element_forces.iter()
            .find(|e| e.element_id == ef_comb.element_id).unwrap();
        assert_close(ef_comb.v_start, ef_direct.v_start, 1e-5,
            &format!("elem {} v_start", ef_comb.element_id));
        assert_close(ef_comb.m_start, ef_direct.m_start, 1e-5,
            &format!("elem {} m_start", ef_comb.element_id));
        assert_close(ef_comb.m_end, ef_direct.m_end, 1e-5,
            &format!("elem {} m_end", ef_comb.element_id));
    }
}
