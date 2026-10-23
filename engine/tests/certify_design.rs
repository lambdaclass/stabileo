//! Certified load combinations / envelopes and certified design checks
//! (docs/verification/CERTIFY.md). Honesty is checked against double-double
//! reference solutions of the same reduced f64 systems.

mod certify_ref;

use certify_ref::*;
use dedaliano_engine::certify::combinations::{
    certify_multi_case_2d, certify_multi_case_3d, certify_multi_case_results_2d, CertifiedMultiCase2D,
    CertifiedMultiCase3D,
};
use dedaliano_engine::certify::Certificate;
use dedaliano_engine::solver::load_cases::*;
use dedaliano_engine::types::*;

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
}

fn meta_combinations(meta: &str, case_names: &[String]) -> Vec<CombinationDef> {
    let v: serde_json::Value = serde_json::from_str(&fixture(meta)).unwrap();
    v["combinations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| CombinationDef {
            name: c["name"].as_str().unwrap().to_string(),
            factors: c["factors"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| (case_names[f["caseId"].as_u64().unwrap() as usize - 1].clone(), f["factor"].as_f64().unwrap()))
                .collect(),
        })
        .collect()
}

fn building_2d() -> MultiCaseInput {
    let names: Vec<String> = (1..=3).map(|i| format!("case{i}")).collect();
    let inputs: Vec<SolverInput> = (1..=3)
        .map(|i| serde_json::from_str(&fixture(&format!("ex-building-3story-dlw-case{i}-input.json"))).unwrap())
        .collect();
    let mut solver = inputs[0].clone();
    solver.loads = vec![];
    let mut combinations = meta_combinations("ex-building-3story-dlw-meta.json", &names);
    // Negative factors (uplift / reversal) too.
    combinations.push(CombinationDef {
        name: "0.9D - 1.6W".into(),
        factors: [("case1".to_string(), 0.9), ("case3".to_string(), -1.6)].into_iter().collect(),
    });
    MultiCaseInput {
        solver,
        load_cases: names.iter().zip(&inputs).map(|(n, i)| LoadCase { name: n.clone(), loads: i.loads.clone() }).collect(),
        combinations,
    }
}

fn building_3d() -> MultiCaseInput3D {
    let names: Vec<String> = (1..=4).map(|i| format!("case{i}")).collect();
    let inputs: Vec<SolverInput3D> = (1..=4)
        .map(|i| serde_json::from_str(&fixture(&format!("ex-3d-building-case{i}-input.json"))).unwrap())
        .collect();
    let mut solver = inputs[0].clone();
    solver.loads = vec![];
    MultiCaseInput3D {
        solver,
        load_cases: names.iter().zip(&inputs).map(|(n, i)| LoadCase3D { name: n.clone(), loads: i.loads.clone() }).collect(),
        combinations: meta_combinations("ex-3d-building-meta.json", &names),
    }
}

/// Accurate ‖reported − Σ cᵢ u*ᵢ‖₂ over all DOFs, from per-case references.
/// Free DOFs use the double-double reference; restrained DOFs the cases' own
/// returned (prescribed) values.
fn combo_true_error(refs: &[(Reduced, Vec<f64>, Vec<f64>)], factors: &[(usize, f64)], reported: &[f64]) -> (f64, Vec<(f64, f64)>) {
    let r0 = &refs[0].0;
    let (nt, nf) = (r0.dof.n_total, r0.dof.n_free);
    let mut err2 = 0.0f64;
    let mut exact = Vec::with_capacity(nt);
    for g in 0..nt {
        let mut acc = Acc::default();
        for &(i, c) in factors {
            let (r, xh, xl) = &refs[i];
            if g < nf {
                acc.add_prod(c, xh[g]);
                acc.add_prod(c, xl[g]);
            } else {
                acc.add_prod(c, r.u_full[g]);
            }
        }
        let (h, l) = acc.hi_lo();
        exact.push((h, l));
        let (d, e) = two_sum(reported[g], -h);
        let di = d + (e - l);
        err2 += di * di;
    }
    (err2.sqrt(), exact)
}

fn factors_of(def: &CombinationDef, names: &[&str]) -> Vec<(usize, f64)> {
    def.factors.iter().map(|(n, &c)| (names.iter().position(|x| x == n).unwrap(), c)).collect()
}

fn check_2d_honest(input: &MultiCaseInput, out: &CertifiedMultiCase2D) -> f64 {
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let refs: Vec<(Reduced, Vec<f64>, Vec<f64>)> = input
        .load_cases
        .iter()
        .zip(&out.results.case_results)
        .map(|(lc, cr)| {
            let r = reduced_2d(&input.solver, &lc.loads, &cr.results);
            let (h, l) = reference_solution(&r);
            (r, h, l)
        })
        .collect();
    let dof = &refs[0].0.dof;
    let mut env_exact: Vec<f64> = vec![0.0; dof.n_total];
    let mut worst = 0.0f64;
    for ((def, cr), cc) in input.combinations.iter().zip(&out.results.combination_results).zip(&out.combinations) {
        assert!(cc.certified, "{}: {:?}", def.name, cc.reason);
        let rep = gather_2d(dof, &cr.results);
        let (err, exact) = combo_true_error(&refs, &factors_of(def, &names), &rep);
        let b = cc.disp_abs_bound.unwrap();
        assert!(err <= b, "{}: true error {err:e} > bound {b:e}", def.name);
        worst = worst.max(err / b);
        for (g, (h, _)) in exact.iter().enumerate() {
            env_exact[g] = env_exact[g].max(h.abs());
        }
        eprintln!("2D {}: bound {b:.2e} true error {err:.2e}", def.name);
    }
    // Envelope: |max_c |exact_c| − |reported envelope|| ≤ envelope bound, per DOF.
    assert!(out.envelope.certified, "{:?}", out.envelope.reason);
    let eb = out.envelope.disp_abs_bound.unwrap();
    let env_rep = gather_2d(dof, &out.results.envelope.max_abs_results);
    for g in 0..dof.n_total {
        let d = (env_rep[g].abs() - env_exact[g]).abs();
        assert!(d <= eb * (1.0 + 1e-12) + 1e-300, "envelope DOF {g}: {d:e} > {eb:e}");
    }
    worst
}

#[test]
fn certify_combinations_2d_building() {
    let input = building_2d();
    let out = certify_multi_case_2d(&input).unwrap();
    for c in &out.cases {
        assert!(c.certificate.is_certified(), "{}: {:?}", c.name, c.certificate);
        assert_eq!(c.force_bounds.len(), input.solver.elements.len());
    }
    check_2d_honest(&input, &out);
    // Bounds are tight (relative to the solution) and every member is covered.
    for cc in &out.combinations {
        assert_eq!(cc.force_bounds.len(), input.solver.elements.len());
        assert_eq!(cc.station_bounds.len(), input.solver.elements.len());
        let lengths: std::collections::HashMap<usize, f64> = out.results.combination_results[0]
            .results
            .element_forces
            .iter()
            .map(|f| (f.element_id, f.length))
            .collect();
        for (fb, sb) in cc.force_bounds.iter().zip(&cc.station_bounds) {
            // Station bounds (valid at every x) come from the stiffness rows the
            // diagram formula reads: no looser than ΔM + ΔV·L from the end forces.
            assert_eq!(fb.element_id, sb.element_id);
            assert!(sb.shear <= fb.v && sb.axial <= fb.n * (1.0 + 1e-12));
            assert!(sb.moment <= fb.m + fb.v * lengths[&fb.element_id]);
            assert!(sb.moment >= 0.5 * fb.m, "not vacuous");
        }
    }
    let env = &out.envelope;
    for cc in &out.combinations {
        assert!(cc.disp_abs_bound.unwrap() <= env.disp_abs_bound.unwrap());
    }
    // Same results as the uncertified entry point.
    let plain = solve_multi_case_2d(&input).unwrap();
    for (a, b) in plain.combination_results.iter().zip(&out.results.combination_results) {
        for (x, y) in a.results.displacements.iter().zip(&b.results.displacements) {
            assert_eq!((x.ux, x.uz, x.ry), (y.ux, y.uz, y.ry));
        }
    }
}

#[test]
fn certify_combinations_3d_building_sparse() {
    let input = building_3d();
    let out: CertifiedMultiCase3D = certify_multi_case_3d(&input).unwrap();
    let names: Vec<&str> = input.load_cases.iter().map(|c| c.name.as_str()).collect();
    let refs: Vec<(Reduced, Vec<f64>, Vec<f64>)> = input
        .load_cases
        .iter()
        .zip(&out.results.case_results)
        .map(|(lc, cr)| {
            let r = reduced_3d(&input.solver, &lc.loads, &cr.results);
            let (h, l) = reference_solution(&r);
            (r, h, l)
        })
        .collect();
    assert!(refs[0].0.n >= dedaliano_engine::solver::linear::SPARSE_THRESHOLD, "want the sparse path");
    for c in &out.cases {
        assert!(c.certificate.is_certified(), "{}: {:?}", c.name, c.certificate);
    }
    let dof = &refs[0].0.dof;
    for ((def, cr), cc) in input.combinations.iter().zip(&out.results.combination_results).zip(&out.combinations) {
        assert!(cc.certified, "{}: {:?}", def.name, cc.reason);
        let rep = gather_3d(dof, &cr.results);
        let (err, _) = combo_true_error(&refs, &factors_of(def, &names), &rep);
        let b = cc.disp_abs_bound.unwrap();
        assert!(err <= b, "{}: true error {err:e} > bound {b:e}", def.name);
        assert!(!cc.force_bounds.is_empty());
        eprintln!("3D {}: bound {b:.2e} true error {err:.2e}", def.name);
    }
    assert!(out.envelope.certified);
}

/// A case result that is wrong by δ must not be certified with a bound < δ,
/// and every combination using it must widen accordingly.
#[test]
fn tampered_case_widens_or_refuses() {
    let input = building_2d();
    let mut results = solve_multi_case_2d(&input).unwrap();
    let delta = 1e-4;
    // Corrupt one free displacement of case 3 (wind) but not the combinations:
    // then the combinations no longer equal Σ cᵢ (case i) either.
    results.case_results[2].results.displacements.iter_mut().find(|d| d.node_id == 4).unwrap().ux += delta;
    let out = certify_multi_case_results_2d(&input, results);
    match &out.cases[2].certificate {
        Certificate::Certified { abs_bound, .. } => assert!(*abs_bound >= 0.5 * delta, "{abs_bound:e}"),
        Certificate::Uncertified { .. } => {}
    }
    // Combinations with case 3 (factor ±1.6) see the tampered case in Σ|cᵢ|bᵢ
    // and the mismatch in the rounding term; the honest checker must cover it.
    check_2d_honest(&input, &out);
}

/// A combination result that is wrong (not the case results) is caught by the
/// rounding term: the bound must cover the discrepancy.
#[test]
fn tampered_combination_widens() {
    let input = building_2d();
    let mut results = solve_multi_case_2d(&input).unwrap();
    let delta = 3e-3;
    results.combination_results[1].results.displacements.iter_mut().find(|d| d.node_id == 5).unwrap().uz -= delta;
    results.combination_results[1].results.element_forces[0].m_start += 7.0;
    let out = certify_multi_case_results_2d(&input, results);
    let cc = &out.combinations[1];
    assert!(cc.disp_abs_bound.unwrap() >= delta);
    assert!(cc.force_bounds.iter().find(|f| f.element_id == out.results.combination_results[1].results.element_forces[0].element_id).unwrap().m >= 7.0);
    assert!(out.envelope.disp_abs_bound.unwrap() >= delta);
    check_2d_honest(&input, &out);
}

#[test]
fn mismatched_inputs_refuse_and_constraints_certify() {
    let input = building_2d();
    // Results that do not belong to this input.
    let mut results = solve_multi_case_2d(&input).unwrap();
    results.case_results.swap(0, 1);
    let out = certify_multi_case_results_2d(&input, results);
    assert!(out.cases.iter().all(|c| !c.certificate.is_certified()));
    assert!(out.combinations.iter().all(|c| !c.certified && c.disp_abs_bound.is_none() && c.force_bounds.is_empty()));
    assert!(!out.envelope.certified);

    // Constraints: certified per case through the constrained path
    // (certify/constrained.rs), so combinations and the envelope certify too.
    let mut input = building_2d();
    let ids: Vec<usize> = {
        let mut v: Vec<usize> = input.solver.nodes.values().map(|n| n.id).collect();
        v.sort();
        v
    };
    input.solver.constraints = vec![serde_json::from_value(serde_json::json!({
        "type": "equalDOF", "masterNode": ids[ids.len() - 1], "slaveNode": ids[ids.len() - 2], "dofs": [0]
    }))
    .unwrap()];
    let out = certify_multi_case_2d(&input).unwrap();
    assert!(out.cases.iter().all(|c| c.certificate.is_certified()), "{:?}", out.cases.iter().map(|c| &c.certificate).collect::<Vec<_>>());
    assert!(out.combinations.iter().all(|c| c.certified && c.disp_abs_bound.is_some_and(|b| b.is_finite())));
    assert!(out.envelope.certified);
}

// ───────────────────────── certified design checks ─────────────────────────

use dedaliano_engine::certify::design::*;
use dedaliano_engine::postprocess::steel_check::{check_steel_members, ElementDesignForces, SteelCheckInput, SteelMemberData};

/// W310x97-like section in kN, m (fy, E in kN/m²).
fn w_member(id: usize, lb: f64) -> SteelMemberData {
    serde_json::from_value(serde_json::json!({
        "elementId": id, "fy": 345e3, "fu": 450e3, "ag": 1.23e-2, "aw": 3.08e-3,
        "lby": lb, "lbz": lb, "iy": 2.22e-4, "iz": 7.25e-5, "ry": 0.134, "rz": 0.0768,
        "zy": 1.59e-3, "zz": 7.23e-4, "sy": 1.44e-3, "sz": 4.77e-4, "j": 9.1e-7, "cw": 1.56e-6,
        "lb": lb, "cb": 1.0, "e": 200e6, "depth": 0.308,
        // bf = 305, tf = 15.4, h = 255, tw = 9.9 mm: no slender element (E7).
        "compressionElements": [
            { "kind": "rolledFlange", "b": 0.1525, "t": 0.0154, "count": 4.0 },
            { "kind": "web", "b": 0.255, "t": 0.0099 }
        ]
    }))
    .unwrap()
}

fn f64_unity(m: &SteelMemberData, f: &ElementDesignForces) -> f64 {
    check_steel_members(&SteelCheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0].unity_ratio
}

fn members_for(input: &MultiCaseInput) -> Vec<SteelMemberData> {
    let mut ids: Vec<usize> = input.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    ids.into_iter().map(|id| w_member(id, 3.5)).collect()
}

/// End to end: multi-case solve → certified combinations → station demands →
/// certified AISC utilization. The enclosure contains the f64 utilization of
/// every demand point and is tight.
#[test]
fn certified_steel_utilization_end_to_end_2d() {
    let mc = building_2d();
    let members = members_for(&mc);
    let out = certify_steel_multi_case_2d(&SteelMultiCaseInput2D { multi_case: mc.clone(), members: members.clone(), stations: None })
        .unwrap();
    let demands = steel_demands_from_combinations_2d(&out.analysis, 21).unwrap();
    assert_eq!(demands.len(), mc.combinations.len() * members.len() * 21);
    for (m, r) in members.iter().zip(&out.steel) {
        assert!(r.certified, "{}: {:?}", m.element_id, r.reason);
        let f64_max = demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| f64_unity(m, &d.forces))
            .fold(0.0, f64::max);
        assert!(r.utilization_lower <= f64_max * (1.0 + 1e-12) && f64_max <= r.utilization_upper * (1.0 + 1e-12),
            "{}: {f64_max} ∉ [{}, {}]", m.element_id, r.utilization_lower, r.utilization_upper);
        assert!(r.utilization_upper - r.utilization_lower <= 1e-9 * (1.0 + f64_max), "{r:?}");
        assert_eq!(r.certified_ok, r.utilization_upper < 1.0);
        eprintln!("elem {}: U ∈ [{:.6}, {:.6}] ({}), ok={}", m.element_id, r.utilization_lower, r.utilization_upper, r.governing_check, r.certified_ok);
    }
}

#[test]
fn certified_steel_utilization_end_to_end_3d() {
    let mc = building_3d();
    let mut ids: Vec<usize> = mc.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    let members: Vec<SteelMemberData> = ids.iter().map(|&id| w_member(id, 3.0)).collect();
    let out = certify_steel_multi_case_3d(&SteelMultiCaseInput3D { multi_case: mc, members: members.clone(), stations: Some(11) })
        .unwrap();
    assert!(out.analysis.combinations.iter().all(|c| c.certified));
    let n_ok = out.steel.iter().filter(|r| r.certified).count();
    assert_eq!(n_ok, members.len(), "{:?}", out.steel.iter().find(|r| !r.certified));
    for r in &out.steel {
        assert!(r.utilization_upper - r.utilization_lower <= 1e-8 * (1.0 + r.utilization_upper), "{r:?}");
    }
}

/// Gravity-loaded 3D beam (load in −Z) bends in the local x–z plane (`momentY`)
/// and carries vertical web shear in `shearZ` (`shearY = 0`). A short beam whose
/// web shear `|Vz| / (φv·Vn) > 1` while flexure `|My| / (φb·Mny) < 1` must be
/// certified as failing on `"Shear G2"`, not passed with zero shear demand.
#[test]
fn certified_steel_multi_case_3d_gravity_web_shear_governs() {
    let solver: SolverInput3D = serde_json::from_value(serde_json::json!({
        "nodes": {
            "1": { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 },
            "2": { "id": 2, "x": 0.5, "y": 0.0, "z": 0.0 }
        },
        "materials": {
            "1": { "id": 1, "e": 200000.0, "nu": 0.3 }
        },
        "sections": {
            "1": { "id": 1, "a": 1.23e-2, "iy": 2.22e-4, "iz": 7.25e-5, "j": 9.1e-7 }
        },
        "elements": {
            "1": { "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "sectionId": 1, "materialId": 1 }
        },
        "supports": {
            "1": { "id": 1, "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true }
        },
        "loads": []
    }))
    .unwrap();
    let mc = MultiCaseInput3D {
        solver,
        load_cases: vec![LoadCase3D {
            name: "G".into(),
            loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: 0.0,
                fy: 0.0,
                fz: -750.0,
                mx: 0.0,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })],
        }],
        combinations: vec![CombinationDef {
            name: "1.0G".into(),
            factors: [("G".to_string(), 1.0)].into_iter().collect(),
        }],
    };
    let out = certify_steel_multi_case_3d(&SteelMultiCaseInput3D {
        multi_case: mc,
        members: vec![w_member(1, 0.5)],
        stations: Some(11),
    })
    .unwrap();
    for r in &out.steel {
        let exact_shear_ratio = 750.0 / (0.9 * 0.6 * 345e3 * 3.08e-3);
        assert!(r.certified, "{r:?}");
        assert!(!r.certified_ok && r.certified_fail, "must fail web shear: {r:?}");
        assert_eq!(r.governing_check, "Shear G2");
        assert!(
            r.utilization_lower <= exact_shear_ratio * (1.0 + 1e-12)
                && exact_shear_ratio <= r.utilization_upper * (1.0 + 1e-12),
            "exact {exact_shear_ratio} ∉ [{}, {}]",
            r.utilization_lower,
            r.utilization_upper
        );
    }
}

/// Fed a wrong combination result, the certified utilization still encloses
/// the utilization from the correct results (the bound widens; it never
/// under-bounds).
#[test]
fn certified_steel_covers_truth_under_tampering() {
    let mc = building_2d();
    let members = members_for(&mc);
    let honest = certify_multi_case_results_2d(&mc, solve_multi_case_2d(&mc).unwrap());
    let honest_demands = steel_demands_from_combinations_2d(&honest, 21).unwrap();

    let mut results = solve_multi_case_2d(&mc).unwrap();
    let ef = &mut results.combination_results[1].results.element_forces[0];
    let tampered_id = ef.element_id;
    ef.m_start += 40.0;
    ef.v_start -= 15.0;
    let tampered = certify_multi_case_results_2d(&mc, results);
    let demands = steel_demands_from_combinations_2d(&tampered, 21).unwrap();
    let res = certify_steel_members(&CertifiedSteelCheckInput { members: members.clone(), demands });
    for (m, r) in members.iter().zip(&res) {
        assert!(r.certified);
        let truth = honest_demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| f64_unity(m, &d.forces))
            .fold(0.0, f64::max);
        assert!(truth <= r.utilization_upper * (1.0 + 1e-12), "{}: truth {truth} > {}", m.element_id, r.utilization_upper);
        if m.element_id == tampered_id {
            assert!(r.utilization_upper - r.utilization_lower > 1e-3, "tampering must widen: {r:?}");
        }
    }

    // An uncertified combination: no member is certified.
    let mut bad = honest.clone();
    bad.combinations[0].certified = false;
    assert!(steel_demands_from_combinations_2d(&bad, 21).is_err());
    // A combination missing a member's bound: that member refuses.
    let mut bad = honest;
    let gone = bad.combinations[2].station_bounds.remove(0).element_id;
    let res = certify_steel_members(&CertifiedSteelCheckInput {
        members: members.clone(),
        demands: steel_demands_from_combinations_2d(&bad, 21).unwrap(),
    });
    for r in &res {
        assert_eq!(r.certified, r.element_id != gone, "{r:?}");
    }
}

/// EC3 end to end on the same certified station demands.
#[test]
fn certified_ec3_utilization_end_to_end_2d() {
    use dedaliano_engine::postprocess::ec3_check::{check_ec3_members, Ec3CheckInput, Ec3MemberData};
    let mc = building_2d();
    let analysis = certify_multi_case_2d(&mc).unwrap();
    let demands = ec3_demands(&steel_demands_from_combinations_2d(&analysis, 21).unwrap());
    let mut ids: Vec<usize> = mc.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    // IPE 300-like, kN and m.
    let members: Vec<Ec3MemberData> = ids
        .iter()
        .map(|&id| {
            serde_json::from_value(serde_json::json!({
                "elementId": id, "fy": 355e3, "e": 210e6, "a": 5.381e-3, "wplY": 6.28e-4, "welY": 5.57e-4,
                "wplZ": 1.25e-4, "welZ": 8.05e-5, "iy": 8.356e-5, "iz": 6.04e-6, "it": 2.01e-7, "iw": 1.26e-7,
                "lcrY": 3.5, "lcrZ": 3.5, "lb": 3.5, "bucklingCurveY": "a", "c1": 1.13, "av": 2.568e-3,
                "geometry": { "shape": "I", "h": 0.3, "b": 0.15, "tw": 0.0071, "tf": 0.0107, "r": 0.015 }
            }))
            .unwrap()
        })
        .collect();
    let res = certify_ec3_members(&CertifiedEc3CheckInput { members: members.clone(), demands: demands.clone() });
    for (m, r) in members.iter().zip(&res) {
        assert!(r.certified, "{}: {:?}", m.element_id, r.reason);
        let f64_max = demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| {
                let c = &check_ec3_members(&Ec3CheckInput { members: vec![m.clone()], forces: vec![d.forces.clone()] })[0];
                [c.compression_ratio, c.tension_ratio, c.flexure_ratio_y, c.flexure_ratio_z, c.shear_ratio, c.interaction_ratio]
                    .into_iter()
                    .fold(0.0, f64::max)
            })
            .fold(0.0, f64::max);
        assert!(r.utilization_lower <= f64_max * (1.0 + 1e-12) && f64_max <= r.utilization_upper * (1.0 + 1e-12),
            "{}: {f64_max} ∉ [{}, {}]", m.element_id, r.utilization_lower, r.utilization_upper);
        assert!(r.utilization_upper - r.utilization_lower <= 1e-9 * (1.0 + f64_max));
    }
}

/// EC2 (Pa / N units) end to end: the kN model's demands are scaled by 1000
/// with the bounds widened for the scaling rounding.
#[test]
fn certified_ec2_utilization_end_to_end_2d() {
    use dedaliano_engine::postprocess::ec2_check::{check_ec2_members, Ec2CheckInput, Ec2MemberData};
    let mc = building_2d();
    let analysis = certify_multi_case_2d(&mc).unwrap();
    let demands = ec2_demands(&scale_demands(&steel_demands_from_combinations_2d(&analysis, 21).unwrap(), 1000.0));
    let mut ids: Vec<usize> = mc.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    let members: Vec<Ec2MemberData> = ids
        .iter()
        .map(|&id| {
            serde_json::from_value(serde_json::json!({
                "elementId": id, "fck": 30e6, "fyk": 500e6, "b": 0.3, "h": 0.6, "d": 0.55,
                "asTension": 1.5e-3, "asCompression": 4e-4, "dPrime": 0.05, "asw": 1.0e-4, "sStirrup": 0.15
            }))
            .unwrap()
        })
        .collect();
    let res = certify_ec2_members(&CertifiedEc2CheckInput { members: members.clone(), demands: demands.clone() });
    for (m, r) in members.iter().zip(&res) {
        assert!(r.certified, "{}: {:?}", m.element_id, r.reason);
        let f64_max = demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| {
                let c = &check_ec2_members(&Ec2CheckInput { members: vec![m.clone()], forces: vec![d.forces.clone()] })[0];
                c.flexure_ratio.max(c.shear_ratio)
            })
            .fold(0.0, f64::max);
        assert!(r.utilization_lower <= f64_max * (1.0 + 1e-12) && f64_max <= r.utilization_upper * (1.0 + 1e-12),
            "{}: {f64_max} ∉ [{}, {}]", m.element_id, r.utilization_lower, r.utilization_upper);
        assert!(r.utilization_upper - r.utilization_lower <= 1e-9 * (1.0 + f64_max));
        eprintln!("EC2 elem {}: U ∈ [{:.6}, {:.6}] {}", m.element_id, r.utilization_lower, r.utilization_upper, r.governing_check);
    }
}

/// CIRSOC 201 (Pa / N units) end to end, as EC2.
#[test]
fn certified_cirsoc201_utilization_end_to_end_2d() {
    use dedaliano_engine::postprocess::cirsoc201_check::{check_cirsoc201_members, Cirsoc201CheckInput, Cirsoc201MemberData};
    let mc = building_2d();
    let analysis = certify_multi_case_2d(&mc).unwrap();
    let demands = cirsoc201_demands(&scale_demands(&steel_demands_from_combinations_2d(&analysis, 21).unwrap(), 1000.0));
    let mut ids: Vec<usize> = mc.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    let members: Vec<Cirsoc201MemberData> = ids
        .iter()
        .map(|&id| {
            serde_json::from_value(serde_json::json!({
                "elementId": id, "fc": 25e6, "fy": 420e6, "b": 0.3, "h": 0.6, "d": 0.55,
                "asTension": 1.5e-3, "asCompression": 4e-4, "dPrime": 0.05, "av": 1.0e-4, "sStirrup": 0.15
            }))
            .unwrap()
        })
        .collect();
    let res = certify_cirsoc201_members(&CertifiedCirsoc201CheckInput { members: members.clone(), demands: demands.clone() });
    for (m, r) in members.iter().zip(&res) {
        assert!(r.certified, "{}: {:?}", m.element_id, r.reason);
        let f64_max = demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| {
                let c = &check_cirsoc201_members(&Cirsoc201CheckInput { members: vec![m.clone()], forces: vec![d.forces.clone()] })[0];
                // The certified check covers all four (flexure, ductility 9.3.3.1, shear, minimum
                // shear reinforcement), as the f64 check does since the merge of #298 and #301.
                assert!(!c.min_shear_reinforcement_missing, "{c:?}");
                c.flexure_ratio.max(c.ductility_ratio).max(c.shear_ratio)
            })
            .fold(0.0, f64::max);
        assert!(r.utilization_lower <= f64_max * (1.0 + 1e-12) && f64_max <= r.utilization_upper * (1.0 + 1e-12),
            "{}: {f64_max} ∉ [{}, {}]", m.element_id, r.utilization_lower, r.utilization_upper);
        assert!(r.utilization_upper - r.utilization_lower <= 1e-9 * (1.0 + f64_max));
    }
}

/// ACI 318 RC end to end, with the axial force of every station (P-M interaction).
#[test]
fn certified_aci_rc_utilization_end_to_end_2d() {
    use dedaliano_engine::postprocess::rc_check::{check_rc_members, RCCheckInput, RCMemberData};
    let mc = building_2d();
    let analysis = certify_multi_case_2d(&mc).unwrap();
    let demands = rc_demands(&scale_demands(&steel_demands_from_combinations_2d(&analysis, 21).unwrap(), 1000.0));
    let mut ids: Vec<usize> = mc.solver.elements.values().map(|e| e.id).collect();
    ids.sort();
    let members: Vec<RCMemberData> = ids
        .iter()
        .map(|&id| {
            serde_json::from_value(serde_json::json!({
                "elementId": id, "fc": 28e6, "fy": 420e6, "b": 0.4, "h": 0.6, "d": 0.55,
                "asTension": 2.0e-3, "asCompression": 1.0e-3, "dPrime": 0.05, "av": 1.5e-4, "sStirrup": 0.15
            }))
            .unwrap()
        })
        .collect();
    let res = certify_rc_members(&CertifiedRcCheckInput { members: members.clone(), demands: demands.clone() });
    for (m, r) in members.iter().zip(&res) {
        assert!(r.certified, "{}: {:?}", m.element_id, r.reason);
        let f64_max = demands
            .iter()
            .filter(|d| d.forces.element_id == m.element_id)
            .map(|d| {
                let c = &check_rc_members(&RCCheckInput { members: vec![m.clone()], forces: vec![d.forces.clone()] })[0];
                assert!(c.unevaluated.is_empty());
                c.unity_ratio
            })
            .fold(0.0, f64::max);
        assert!(r.utilization_lower <= f64_max * (1.0 + 1e-9) && f64_max <= r.utilization_upper * (1.0 + 1e-9),
            "{}: {f64_max} ∉ [{}, {}]", m.element_id, r.utilization_lower, r.utilization_upper);
        assert!(r.utilization_upper - r.utilization_lower <= 1e-6 * (1.0 + f64_max));
        eprintln!("ACI elem {}: U ∈ [{:.6}, {:.6}] {}", m.element_id, r.utilization_lower, r.utilization_upper, r.governing_check);
    }
}
