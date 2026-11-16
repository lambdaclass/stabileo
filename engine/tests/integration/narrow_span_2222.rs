use dedaliano_engine::{
    element::*,
    metamorphic::planes::{embed_2d, Plane},
    postprocess::{diagrams::compute_diagram_value_at, diagrams_3d::evaluate_diagram_3d_at},
    solver::{corotational, linear, pdelta},
    types::*,
};

fn witness() -> SolverInput {
    serde_json::from_str(include_str!("../fixtures/narrow-span-2222.json")).unwrap()
}

fn near(a: f64, b: f64) {
    assert!((a - b).abs() <= 1e-10 * b.abs().max(1.0), "{a} != {b}");
}

fn check(r: &AnalysisResults) {
    near(
        r.reactions.iter().find(|r| r.node_id == 1).unwrap().rz,
        27.0 / 32.0,
    );
    near(
        r.displacements.iter().find(|d| d.node_id == 2).unwrap().uz,
        -0.0005625,
    );
    if let Some(eq) = &r.equilibrium {
        near(eq.applied_force_sum[1], -1.0);
    }
    let ef = r.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let mut point=ef.clone(); point.distributed_loads.clear(); point.q_i=0.0; point.q_j=0.0;
    point.point_loads.push(PointLoadInfo{a:1.5,p:-1.0,px:None,my:None});
    assert_eq!(dedaliano_engine::postprocess::diagrams::diagram_positions_2d(ef,"shear"),dedaliano_engine::postprocess::diagrams::diagram_positions_2d(&point,"shear"));
    near(compute_diagram_value_at("shear", 0.9, ef), ef.v_start - 1.0);
    near(
        compute_diagram_value_at("moment", 0.9, ef),
        ef.m_start - ef.v_start * 2.7 + 1.2,
    );
}

#[test]
fn issue_2222_native_linear_entry_points() {
    let input = witness();
    check(&linear::solve_2d(&input).unwrap());
    check(
        &linear::solve_2d_typed(
            &serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap(),
        )
        .unwrap(),
    );
    check(
        &linear::prepare_static_2d(&input)
            .unwrap()
            .solve_loads(&input.loads)
            .unwrap(),
    );
    check(
        &linear::prepare_static_2d_dense_reference(&input)
            .unwrap()
            .solve_loads(&input.loads)
            .unwrap(),
    );
}

#[test]
fn issue_2222_native_nonlinear_entry_points() {
    let input = witness();
    check(
        &pdelta::solve_pdelta_2d(&input, 20, 1e-9)
            .unwrap()
            .linear_results,
    );
    let mut point = input.clone();
    point.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1,
        a: 1.5,
        p: -1.0,
        px: None,
        my: None,
    })];
    let reference = corotational::solve_corotational_2d(&point, 40, 1e-9, 1, false)
        .unwrap()
        .results;
    let result = corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false)
        .unwrap()
        .results;
    for (a, b) in result.displacements.iter().zip(reference.displacements) {
        near(a.uz, b.uz);
    }
}

#[test]
fn issue_2222_native_space_both_planes() {
    for plane in [Plane::XY, Plane::XZ] {
        let input = embed_2d(&witness(), plane).unwrap();
        let ref_input = embed_2d(
            &{
                let mut i = witness();
                i.loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: 1,
                    a: 1.5,
                    p: -1.0,
                    px: None,
                    my: None,
                })];
                i
            },
            plane,
        )
        .unwrap();
        let reference = linear::solve_3d(&ref_input).unwrap();
        for (index, r) in [
            linear::solve_3d(&input).unwrap(),
            linear::prepare_static_3d(&input)
                .unwrap()
                .solve_loads(&input.loads)
                .unwrap(),
            pdelta::solve_pdelta_3d(&input, 20, 1e-9)
                .unwrap()
                .linear_results,
            corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false)
                .unwrap()
                .results,
        ]
        .into_iter()
        .enumerate()
        {
            let reference = if index == 3 {
                corotational::solve_corotational_3d(&ref_input, 40, 1e-9, 1, false)
                    .unwrap()
                    .results
            } else {
                reference.clone()
            };
            for (a, b) in r.displacements.iter().zip(&reference.displacements) {
                near(a.uy, b.uy);
                near(a.uz, b.uz);
            }
            let f = &r.element_forces[0];
            let rf = &reference.element_forces[0];
            for kind in ["momentY", "momentZ", "shearY", "shearZ"] {
                let actual=dedaliano_engine::postprocess::diagrams_3d::diagram_positions_3d(f,kind);
                let expected=dedaliano_engine::postprocess::diagrams_3d::diagram_positions_3d(rf,kind);
                assert_eq!(actual.len(),expected.len());
                for (x,y) in actual.into_iter().zip(expected) { near(x,y); }
                near(
                    evaluate_diagram_3d_at(f, kind, 0.9),
                    evaluate_diagram_3d_at(rf, kind, 0.9),
                );
            }
            if let Some(eq) = &r.equilibrium {
                let total: f64 = eq.applied_force_sum[..3].iter().map(|x| x.abs()).sum();
                near(total, 1.0);
            }
        }
    }
}

#[test]
fn issue_2222_partial_width_class_and_normal_control() {
    for width in [0.0, 1e-15, 0.5e-12, 1e-12, 1.5e-12, 1e-10, 1e-8, 1e-6] {
        for start in [0.0, 1.5, 3.0 - width] {
            let end = start + width;
            for ratio in [1.0, 0.0, -1.0] {
                let span = end - start;
                let qi = if span == 0.0 { -7.0 } else { -1.0 / span };
                let qj = ratio * qi;
                let total = qi * span / 2.0 + qj * span / 2.0;
                let first = (qi * span / 2.0) * (start + span / 3.0)
                    + (qj * span / 2.0) * (start + 2.0 * span / 3.0);
                for phi in [0.0, 0.7] {
                    let f = fef_partial_distributed_2d(qi, qj, start, end, 3.0, phi);
                    near(f[1] + f[4], total);
                    near(f[2] + 3.0 * f[4] + f[5], first);
                    let f3 = fef_partial_distributed_3d(qi, qj, qi, qj, start, end, 3.0, phi, phi);
                    near(f3[1] + f3[7], total);
                    near(f3[2] + f3[8], total);
                    near(f3[5] + 3.0 * f3[7] + f3[11], first);
                    near(-f3[4] + 3.0 * f3[8] - f3[10], first);
                }
            }
        }
    }
    for (qi, qj) in [(-2.0, -2.0), (-2.0, -5.0), (-2.0, 2.0)] {
        let full = fef_distributed_2d(qi, qj, 3.0, 0.7);
        let partial = fef_partial_distributed_2d(qi, qj, 0.0, 3.0, 3.0, 0.7);
        for (a, b) in full.into_iter().zip(partial) {
            near(a, b);
        }
    }
}

#[test]
fn issue_2222_recovered_diagrams_keep_narrow_resultants() {
    use dedaliano_engine::postprocess::diagrams::{recover_member, MemberRecoveryInput};
    for space in ["planar", "spatial"] {
        let a=1.5; let b=a+0.5e-12; let span=b-a; let q=6.0/span/span;
        let recovery: MemberRecoveryInput=serde_json::from_value(serde_json::json!({"space":space,"length":3.0,"ei":1000.0,"gas":1700.0,"vI":0.0,"rI":0.0,"vJ":0.0,"rJ":0.0,"positions":[0.5-1e-10,0.5+1e-10],"dist":[{"qI":-q,"qJ":q,"a":a,"b":b}]})).unwrap();
        let samples=recover_member(&recovery).unwrap();
        near(samples[1].v-samples[0].v,1.0/1700.0);
        let a = 1.5;
        let b = a + 0.5e-12;
        let q = -1.0 / (b - a);
        let base = serde_json::json!({"space":space,"length":3.0,"ei":1000.0,"gas":1700.0,"vI":0.0,"rI":0.0,"vJ":0.0,"rJ":0.0,"positions":[0.1,0.3,0.5,0.7,0.9]});
        let mut d = base.clone();
        d["dist"] = serde_json::json!([{"qI":q,"qJ":q,"a":a,"b":b}]);
        let mut p = base;
        p["points"] = serde_json::json!([{"a":a+(b-a)/2.0,"p":-1.0}]);
        let d: MemberRecoveryInput = serde_json::from_value(d).unwrap();
        let p: MemberRecoveryInput = serde_json::from_value(p).unwrap();
        for (x, y) in recover_member(&d)
            .unwrap()
            .into_iter()
            .zip(recover_member(&p).unwrap())
        {
            near(x.v, y.v);
            near(x.rotation, y.rotation);
        }
    }
    for width in [0.0, 1e-15, 0.5e-12, 1e-12, 1.5e-12, 1e-10, 1e-8, 1e-6] {
        for a in [0.0, 1.5, 3.0 - width] {
            let b = a + width;
            for ratio in [0.0, 1.0, -1.0] {
                let mut i = witness();
                let qi = if b == a || !(1.0 / (b - a)).is_finite() { -7.0 } else { -1.0 / (b - a) };
                let qj = qi * ratio;
                i.loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: 1,
                    q_i: qi,
                    q_j: qj,
                    a: Some(a),
                    b: Some(b),
                })];
                let r = linear::solve_2d(&i).unwrap();
                let f = &r.element_forces[0];
                let total = (qi * (b - a) / 2.0) + (qj * (b - a) / 2.0);
                let first=qi*(b-a)/2.0*(a+(b-a)/3.0)+qj*(b-a)/2.0*(a+2.0*(b-a)/3.0);
                let x=3.0*(1.0+1e-5);
                near(compute_diagram_value_at("moment",1.0+1e-5,f),f.m_start-f.v_start*x-total*x+first);
                near(
                    compute_diagram_value_at("shear", 1.0 + 1e-5, f),
                    f.v_start + total,
                );
                for plane in [Plane::XY, Plane::XZ] {
                    let r = linear::solve_3d(&embed_2d(&i, plane).unwrap()).unwrap();
                    let f = &r.element_forces[0];
                    let expected = if matches!(plane, Plane::XY) {
                        total
                    } else {
                        0.0
                    };
                    near(
                        evaluate_diagram_3d_at(f, "shearY", 1.0 + 1e-5),
                        f.vy_start + expected,
                    );
                    let moment=total*x-first;
                    near(evaluate_diagram_3d_at(f,"momentZ",1.0+1e-5),f.mz_start-f.vy_start*x-if matches!(plane,Plane::XY) {moment} else {0.0});
                    near(evaluate_diagram_3d_at(f,"momentY",1.0+1e-5),f.my_start+f.vz_start*x+if matches!(plane,Plane::XZ) {moment} else {0.0});
                    let expected_z = if matches!(plane, Plane::XZ) {
                        total
                    } else {
                        0.0
                    };
                    near(
                        evaluate_diagram_3d_at(f, "shearZ", 1.0 + 1e-5),
                        f.vz_start + expected_z,
                    );
                }
            }
        }
    }
}

#[test]
fn issue_2222_nonfinite_resultants_are_refused() {
    let mut control = witness();
    control.loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 1,
        q_i: 7.0,
        q_j: -3.0,
        a: Some(1.5),
        b: Some(1.5),
    })];
    let zero = linear::solve_2d(&control).unwrap();
    for d in zero.displacements {
        assert_eq!(d.uz, 0.0);
    }
    for (a, b) in [
        (-f64::EPSILON, 1.5),
        (1.5, 1.5 - f64::EPSILON),
        (1.5, 3.0 + 4.0 * f64::EPSILON),
    ] {
        control.loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1,
            q_i: 1.0,
            q_j: 1.0,
            a: Some(a),
            b: Some(b),
        })];
        assert!(linear::solve_2d(&control).unwrap_err().contains("interval"));
        assert!(linear::solve_3d(&embed_2d(&control, Plane::XY).unwrap())
            .unwrap_err()
            .contains("interval"));
    }
    let mut i = witness();
    i.loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 1,
        q_i: f64::MAX,
        q_j: f64::MAX,
        a: Some(0.0),
        b: Some(3.0),
    })];
    assert!(linear::solve_2d(&i).unwrap_err().contains("resultant"));
    let mut base=witness(); base.loads.clear();
    assert!(linear::prepare_static_2d(&base).unwrap().solve_loads(&i.loads).unwrap_err().contains("resultant"));
    assert!(linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&i.loads).unwrap_err().contains("resultant"));
    assert!(pdelta::solve_pdelta_2d(&i,20,1e-9).unwrap_err().contains("resultant"));
    assert!(corotational::solve_corotational_2d(&i,40,1e-9,1,false).unwrap_err().contains("resultant"));
    let base3=embed_2d(&base,Plane::XY).unwrap(); let bad3=embed_2d(&i,Plane::XY).unwrap();
    assert!(linear::prepare_static_3d(&base3).unwrap().solve_loads(&bad3.loads).unwrap_err().contains("resultant"));
    assert!(pdelta::solve_pdelta_3d(&bad3,20,1e-9).unwrap_err().contains("resultant"));
    assert!(corotational::solve_corotational_3d(&bad3,40,1e-9,1,false).unwrap_err().contains("resultant"));
    assert!(linear::solve_3d(&embed_2d(&i, Plane::XY).unwrap())
        .unwrap_err()
        .contains("resultant"));
}

#[test]
fn issue_2222_narrow_opposing_load_retains_its_finite_couple() {
    for a in [0.0, 1.5, 3.0-0.5e-12] {
        let b = a + 0.5e-12;
        let span = b - a;
        let q = 6.0 / span / span;
        for phi in [0.0, 0.7] {
            let f = fef_partial_distributed_2d(-q, q, a, b, 3.0, phi);
            let xi=(a+span/2.0)/3.0;
            let mu=1.0/(1.0+phi);
            let expected=[0.0,mu*(-6.0*xi+6.0*xi*xi-phi)/3.0,
                mu*(1.0-4.0*xi+3.0*xi*xi+phi*(0.5-xi)),0.0,
                mu*(6.0*xi-6.0*xi*xi+phi)/3.0,
                mu*(-2.0*xi+3.0*xi*xi-phi*(0.5-xi))];
            for (x, y) in f.into_iter().zip(expected) {
                near(x, y);
            }
            let f3=fef_partial_distributed_3d(-q,q,-q,q,a,b,3.0,phi,phi);
            let expected3=[0.0,expected[1],expected[1],0.0,-expected[2],expected[2],0.0,expected[4],expected[4],0.0,-expected[5],expected[5]];
            for (x,y) in f3.into_iter().zip(expected3) { near(x,y); }
        }
    }
}


fn endpoint_input(a: f64, b: f64) -> SolverInput {
    let mut input = witness();
    let q = -1.0 / (b - a);
    input.loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(b),
    })];
    input
}

#[test]
fn issue_2222_collapsed_endpoints_planar() {
    for (a, b) in [(3.0 - 5e-13, 3.0), (0.0, 5e-13)] {
        let input = endpoint_input(a, b);
        for result in [
            linear::solve_2d(&input).unwrap(),
            linear::solve_2d_typed(&serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap()).unwrap(),
            linear::prepare_static_2d(&input).unwrap().solve_loads(&input.loads).unwrap(),
            linear::prepare_static_2d_dense_reference(&input).unwrap().solve_loads(&input.loads).unwrap(),
            pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().linear_results,
            corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).unwrap().results,
        ] {
            let f = &result.element_forces[0];
            if b == 3.0 {
                let mut isolated = f.clone();
                isolated.length = b;
                isolated.v_start = 0.0;
                isolated.m_start = 0.0;
                endpoint_moment_near(-compute_diagram_value_at("moment", 1.0, &isolated), -(b - a) / 2.0);
            }
            for t in [0.0, 1.0, b / f.length] {
                let force = if t == 0.0 { 0.0 } else { -1.0 };
                let moment = if t == 0.0 { 0.0 } else { -t * f.length + a + (b - a) / 2.0 };
                near(compute_diagram_value_at("shear", t, f), f.v_start + force);
                near(compute_diagram_value_at("moment", t, f), f.m_start - f.v_start * t * f.length - moment);
            }
        }
    }
}

#[test]
fn issue_2222_collapsed_endpoints_spatial() {
    for (a, b) in [(3.0 - 5e-13, 3.0), (0.0, 5e-13)] {
        for plane in [Plane::XY, Plane::XZ] {
            let input = embed_2d(&endpoint_input(a, b), plane).unwrap();
            for result in [
                linear::solve_3d(&input).unwrap(),
                linear::prepare_static_3d(&input).unwrap().solve_loads(&input.loads).unwrap(),
                pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().linear_results,
                corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).unwrap().results,
            ] {
                let f = &result.element_forces[0];
                if b == 3.0 {
                    let mut isolated = f.clone();
                    isolated.length = b;
                    isolated.vy_start = 0.0;
                    isolated.vz_start = 0.0;
                    isolated.my_start = 0.0;
                    isolated.mz_start = 0.0;
                    let (loaded, unloaded, sign) = if matches!(plane, Plane::XY) { ("momentZ", "momentY", -1.0) } else { ("momentY", "momentZ", 1.0) };
                    endpoint_moment_near(sign * evaluate_diagram_3d_at(&isolated, loaded, 1.0), -(b - a) / 2.0);
                    assert_eq!(evaluate_diagram_3d_at(&isolated, unloaded, 1.0), 0.0);
                }
                for t in [0.0, 1.0, b / f.length] {
                    let force = if t == 0.0 { 0.0 } else { -1.0 };
                    let moment = if t == 0.0 { 0.0 } else { -t * f.length + a + (b - a) / 2.0 };
                    let (py, pz, my, mz) = if matches!(plane, Plane::XY) { (force, 0.0, 0.0, -moment) } else { (0.0, force, moment, 0.0) };
                    near(evaluate_diagram_3d_at(f, "shearY", t), f.vy_start + py);
                    near(evaluate_diagram_3d_at(f, "shearZ", t), f.vz_start + pz);
                    near(evaluate_diagram_3d_at(f, "momentZ", t), f.mz_start - f.vy_start * t * f.length + mz);
                    near(evaluate_diagram_3d_at(f, "momentY", t), f.my_start + f.vz_start * t * f.length + my);
                }
            }
        }
    }
}

#[test]
fn issue_2222_empty_reversed_and_one_sided_interval_terms() {
    for (a, b) in [(0.0, 0.0), (1.0, 0.0), (1.0, -1e300)] {
        assert_eq!(distributed_load_terms(-2.0, -2.0, a, b, 0.5), (0.0, 0.0));
    }
    let a = 1.5;
    let b = a + 5e-13;
    let q = -1.0 / (b - a);
    let (_, _, at) = narrow_distributed_load(q, q, a, b).unwrap();
    assert_eq!(distributed_load_terms(q, q, a, b, at).0, 0.0);
    assert_eq!(distributed_load_terms(q, q, a, b, at.next_down()).0, 0.0);
    assert_eq!(distributed_load_terms(q, q, a, b, at.next_up()).0, -1.0);
    assert_eq!(distributed_load_terms(-2.0, -2.0, 0.0, 3.0, 3.0), (-6.0, -9.0));
}

#[test]
fn issue_2222_recovery_skips_empty_and_reversed_intervals() {
    use dedaliano_engine::postprocess::diagrams::{recover_member, MemberRecoveryInput};
    for space in ["planar", "spatial"] {
        for gas in [None, Some(1700.0)] {
            for width in [-1.5e-12, -1e-12, -5e-13, -f64::EPSILON, 0.0, f64::EPSILON, 5e-13, 1e-12, 1.5e-12, 0.5] {
                let a = 1.5;
                let b = a + width;
                let q = if b == a { -7.0 } else { -1.0 / (b - a).abs() };
                let base = serde_json::json!({"space":space,"length":3.0,"ei":1000.0,"gas":gas,"vI":0.0,"rI":0.0,"vJ":0.0,"rJ":0.0,"positions":[0.0,0.1,0.3,0.7,0.9,1.0]});
                let mut loaded = base.clone();
                loaded["dist"] = serde_json::json!([{"qI":q,"qJ":q,"a":a,"b":b}]);
                let input: MemberRecoveryInput = serde_json::from_value(loaded).unwrap();
                let samples = recover_member(&input).unwrap();
                if b <= a {
                    let empty: MemberRecoveryInput = serde_json::from_value(base).unwrap();
                    for (actual, expected) in samples.iter().zip(recover_member(&empty).unwrap()) {
                        assert_eq!(actual.v, expected.v, "{space}: [{a}, {b}]");
                        assert_eq!(actual.rotation, expected.rotation, "{space}: [{a}, {b}]");
                    }
                    assert_eq!(distributed_load_terms(q, q, a, b, 3.0), (0.0, 0.0));
                } else {
                    assert!(samples.iter().any(|s| s.v.abs() > 1e-6));
                    assert!(samples.iter().any(|s| s.rotation.abs() > 1e-6));
                }
            }
        }
    }
}

fn endpoint_moment_near(actual: f64, expected: f64) {
    assert!((actual - expected).abs() <= 1e-12 * expected.abs(), "{actual} != {expected}");
}

#[test]
fn issue_2222_endpoint_moment_assertion_rejects_omission() {
    let a = 3.0 - 5e-13;
    let b = 3.0;
    let expected = -(b - a) / 2.0;
    assert!(std::panic::catch_unwind(|| endpoint_moment_near(0.0, expected)).is_err());
}

#[test]
fn issue_2222_isolated_endpoint_moment() {
    let a = 3.0 - 5e-13;
    let b = 3.0;
    let q = -1.0 / (b - a);
    endpoint_moment_near(distributed_load_terms(q, q, a, b, b).1, -(b - a) / 2.0);
}

fn bounded_interval_cases() -> Vec<(f64, f64, bool)> {
    vec![
        (-5e-13, 3.0, false), (0.0, 3.0 + 5e-13, false),
        (-f64::from_bits(1), 3.0, false), (0.0, 3.0_f64.next_up(), false),
        (-1e-12, 3.0, false), (0.0, 3.0 + 1e-12, false),
        (0.0, 3.0, true), (f64::from_bits(1), 3.0, true),
        (0.0, 3.0_f64.next_down(), true), (5e-13, 3.0 - 5e-13, true),
        (0.0, 0.0, true), (3.0, 3.0, true), (1.0, 2.0, true),
        (1.0, 1.0_f64.next_down(), false),
    ]
}

fn interval_result(result: Result<(), String>, valid: bool, entry: &str, a: f64, b: f64) {
    if valid {
        result.unwrap_or_else(|e| panic!("{entry} refused [{a}, {b}]: {e}"));
    } else {
        let error = result.expect_err(&format!("{entry} accepted [{a}, {b}]"));
        assert!(error.contains("invalid distributed load interval"), "{entry}: {error}");
    }
}

#[test]
fn issue_2222_near_full_bounds_planar() {
    for (a, b, valid) in bounded_interval_cases() {
        for axial in [false, true] {
            let mut input = witness();
            let load = SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(a), b: Some(b) };
            input.loads = vec![if axial { SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: load.element_id, q_i: load.q_i, q_j: load.q_j, a: load.a, b: load.b }) } else { SolverLoad::Distributed(load) }];
            let mut base = input.clone();
            base.loads.clear();
            let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
            let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput {
                solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5,
                max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false,
            };
            for (entry, result) in [
                ("linear", linear::solve_2d(&input).map(|_| ())),
                ("typed", linear::solve_2d_typed(&typed).map(|_| ())),
                ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("session", dedaliano_engine::load_session::LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads).map(|_| ())),
                ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|_| ())),
                ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|_| ())),
                ("fiber", dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_2d(&fiber).map(|_| ())),
            ] {
                interval_result(result, valid, entry, a, b);
            }
            if valid {
                let result = linear::solve_2d(&input).unwrap();
                let reaction: f64 = result.reactions.iter().map(|r| if axial { r.rx } else { r.rz }).sum();
                near(reaction, 2.0 * (b - a));
                if b > a { assert!(result.displacements.iter().any(|d| d.ux != 0.0 || d.uz != 0.0)); }
            }
        }
    }
}

#[test]
fn issue_2222_near_full_bounds_spatial() {
    for (a, b, valid) in bounded_interval_cases() {
        for plane in [Plane::XY, Plane::XZ] {
            for axial in [false, true] {
                let mut input = witness();
                let load = SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(a), b: Some(b) };
                input.loads = vec![if axial { SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: load.element_id, q_i: load.q_i, q_j: load.q_j, a: load.a, b: load.b }) } else { SolverLoad::Distributed(load) }];
                let input = embed_2d(&input, plane).unwrap();
                let mut base = input.clone();
                base.loads.clear();
                let fiber = dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput3D {
                    solver: input.clone(), fiber_sections: Default::default(), n_integration_points: 5,
                    max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false,
                };
                for (entry, result) in [
                    ("linear", linear::solve_3d(&input).map(|_| ())),
                    ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads).map(|_| ())),
                    ("session", dedaliano_engine::load_session::LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads).map(|_| ())),
                    ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|_| ())),
                    ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|_| ())),
                    ("fiber", dedaliano_engine::solver::fiber_nonlinear::solve_fiber_nonlinear_3d(&fiber).map(|_| ())),
                ] {
                    interval_result(result, valid, entry, a, b);
                }
                if valid {
                    let result = linear::solve_3d(&input).unwrap();
                    let reaction: f64 = result.reactions.iter().map(|r| if axial { r.fx } else if matches!(plane, Plane::XY) { r.fy } else { r.fz }).sum();
                    near(reaction, 2.0 * (b - a));
                    if b > a { assert!(result.displacements.iter().any(|d| d.ux != 0.0 || d.uy != 0.0 || d.uz != 0.0)); }
                }
            }
        }
    }
}


fn cancellation_input() -> SolverInput {
    let mut input = witness();
    input.loads = [(1, 1e16), (3, 1.0), (1, -1e16)].into_iter().map(|(node_id, fz)| {
        SolverLoad::Nodal(SolverNodalLoad { node_id, fx: 0.0, fz, my: 0.0 })
    }).collect();
    input
}

#[test]
fn issue_2222_cancelling_nodal_forces_planar() {
    use dedaliano_engine::{load_session::LoadSession2D, solver::fiber_nonlinear::*};
    for cancel in [true, false] {
        let mut input = cancellation_input();
        if !cancel { input.loads = vec![input.loads[1].clone()]; }
        let mut base = input.clone();
        base.loads.clear();
        let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
        let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(),
            n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
        for (entry, result) in [
            ("linear", linear::solve_2d(&input)),
            ("typed", linear::solve_2d_typed(&typed)),
            ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
            ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
            ("session", LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads)),
            ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.linear_results)),
            ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
            ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
        ] {
            let r = result.unwrap_or_else(|e| panic!("{entry}: {e}"));
            assert_eq!(r.reactions.iter().find(|r| r.node_id == 3).unwrap().rz, -1.0, "{entry}");
            if let Some(eq) = r.equilibrium {
                assert!(eq.equilibrium_ok, "{entry}: {eq:?}");
                assert_eq!(eq.applied_force_sum[1], 1.0, "{entry}");
            } else { assert_eq!(entry, "corotational"); }
        }
    }
}

#[test]
fn issue_2222_cancelling_nodal_forces_spatial() {
    use dedaliano_engine::{load_session::LoadSession3D, solver::fiber_nonlinear::*};
    for plane in [Plane::XY, Plane::XZ] {
        for cancel in [true, false] {
            let mut planar = cancellation_input();
            if !cancel { planar.loads = vec![planar.loads[1].clone()]; }
            let input = embed_2d(&planar, plane).unwrap();
            let mut base = input.clone();
            base.loads.clear();
            let fiber = FiberNonlinearInput3D { solver: input.clone(), fiber_sections: Default::default(),
                n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
            for (entry, result) in [
                ("linear", linear::solve_3d(&input)),
                ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads)),
                ("session", LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads)),
                ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|r| r.linear_results)),
                ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
            ] {
                let r = result.unwrap_or_else(|e| panic!("{entry}: {e}"));
                let reaction = r.reactions.iter().find(|r| r.node_id == 3).unwrap();
                assert_eq!(if matches!(plane, Plane::XY) { reaction.fy } else { reaction.fz }, -1.0, "{entry}");
                if let Some(eq) = r.equilibrium {
                    assert!(eq.equilibrium_ok, "{entry}: {eq:?}");
                    assert_eq!(eq.applied_force_sum[if matches!(plane, Plane::XY) { 1 } else { 2 }], 1.0, "{entry}");
                } else { assert_eq!(entry, "corotational"); }
            }
        }
    }
}

fn refusal_cases_2222() -> Vec<(f64, f64, bool)> {
    let limit = 3.0e-10_f64;
    vec![
        (0.0, 0.0, false), (1.5, 1.5, false), (3.0, 3.0, false),
        (0.0, limit.next_down(), false), (0.0, limit, true), (0.0, limit.next_up(), true),
        (1.5, 1.5 + 5e-13, false), (1.5, 1.5_f64.next_up(), false), (3.0_f64.next_down(), 3.0, false),
        (0.0, f64::from_bits(1), false), (1.0, 2.0, true), (0.0, 3.0, true),
    ]
}

fn refusal_result_2222(result: Result<(), String>, valid: bool, entry: &str, a: f64, b: f64) {
    if valid {
        result.unwrap_or_else(|e| panic!("{entry}: [{a}, {b}]: {e}"));
    } else {
        let e = result.expect_err(&format!("{entry} accepted [{a}, {b}]"));
        assert!(e.contains("Element 1") && e.contains("interval") && e.contains("geometry limit"), "{entry}: {e}");
        assert!(e.contains(&format!("[{a}, {b}]")), "{entry}: {e}");
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_refuses_sublimit_planar_entry_points() {
    use dedaliano_engine::{load_session::LoadSession2D, solver::fiber_nonlinear::*};
    for (a, b, valid) in refusal_cases_2222() {
        for axial in [false, true] {
            for ratio in [0.0, 1.0, -1.0] {
                let mut input = witness();
                let q = if b == a || !(1.0 / (b - a)).is_finite() { -7.0 } else { -1.0 / (b - a) };
                input.loads = vec![if axial {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: q, q_j: q * ratio, a: Some(a), b: Some(b) })
                } else {
                    SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q * ratio, a: Some(a), b: Some(b) })
                }];
                let mut base = input.clone(); base.loads.clear();
                let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
                let fiber = FiberNonlinearInput { solver: input.clone(), fiber_sections: Default::default(),
                    n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_2d(&input)),
                    ("typed", linear::solve_2d_typed(&typed)),
                    ("prepared", linear::prepare_static_2d(&base).unwrap().solve_loads(&input.loads)),
                    ("dense", linear::prepare_static_2d_dense_reference(&base).unwrap().solve_loads(&input.loads)),
                    ("session", LoadSession2D::from_input(base).unwrap().solve_loads(&input.loads)),
                    ("pdelta", pdelta::solve_pdelta_2d(&input, 20, 1e-9).map(|r| r.linear_results)),
                    ("corotational", corotational::solve_corotational_2d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_2d(&fiber).map(|r| r.results)),
                ] {
                    if valid {
                        let r = result.as_ref().unwrap_or_else(|e| panic!("{entry}: {e}"));
                        near(r.reactions.iter().map(|r| if axial { r.rx } else { r.rz }).sum(), (1.0 + ratio) / 2.0);
                    }
                    refusal_result_2222(result.map(|_| ()), valid, entry, a, b);
                }
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_refuses_sublimit_spatial_entry_points() {
    use dedaliano_engine::{load_session::LoadSession3D, solver::fiber_nonlinear::*};
    for (a, b, valid) in refusal_cases_2222() {
        for plane in [Plane::XY, Plane::XZ] {
            for axial in [false, true] {
                let mut planar = witness();
                let q = if b == a || !(1.0 / (b - a)).is_finite() { -7.0 } else { -1.0 / (b - a) };
                planar.loads = vec![if axial {
                    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(b) })
                } else {
                    SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: Some(a), b: Some(b) })
                }];
                let input = embed_2d(&planar, plane).unwrap();
                let mut base = input.clone(); base.loads.clear();
                let fiber = FiberNonlinearInput3D { solver: input.clone(), fiber_sections: Default::default(),
                    n_integration_points: 5, max_iter: 40, tolerance: 1e-9, n_increments: 1, modified_nr: false };
                for (entry, result) in [
                    ("linear", linear::solve_3d(&input)),
                    ("prepared", linear::prepare_static_3d(&base).unwrap().solve_loads(&input.loads)),
                    ("session", LoadSession3D::from_input(base).unwrap().solve_loads(&input.loads)),
                    ("pdelta", pdelta::solve_pdelta_3d(&input, 20, 1e-9).map(|r| r.linear_results)),
                    ("corotational", corotational::solve_corotational_3d(&input, 40, 1e-9, 1, false).map(|r| r.results)),
                    ("fiber", solve_fiber_nonlinear_3d(&fiber).map(|r| r.results)),
                ] {
                    if valid {
                        let r = result.as_ref().unwrap_or_else(|e| panic!("{entry}: {e}"));
                        near(r.reactions.iter().map(|r| if axial { r.fx } else if matches!(plane, Plane::XY) { r.fy } else { r.fz }).sum(), 1.0);
                    }
                    refusal_result_2222(result.map(|_| ()), valid, entry, a, b);
                }
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_refuses_sublimit_recovery() {
    use dedaliano_engine::postprocess::diagrams::{recover_member, MemberRecoveryInput};
    for space in ["planar", "spatial"] {
        for (a, b, valid) in refusal_cases_2222() {
            let input: MemberRecoveryInput = serde_json::from_value(serde_json::json!({
                "space":space,"length":3.0,"ei":1000.0,"gas":1700.0,"vI":0.0,"rI":0.0,"vJ":0.0,"rJ":0.0,
                "positions":[0.0,0.25,0.75,1.0],"dist":[{"qI":-2.0,"qJ":-2.0,"a":a,"b":b}]
            })).unwrap();
            let r = recover_member(&input);
            if valid { assert!(r.unwrap().iter().any(|s| s.v != 0.0)); }
            else {
                let e = r.err().expect("recovery accepted a sublimit interval");
                assert!(e.contains("Member recovery") && e.contains("geometry limit") && e.contains(&format!("[{a}, {b}]")), "{e}");
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_refuses_sublimit_raw_load_kernels_and_diagrams() {
    use dedaliano_engine::{element::*, postprocess::{diagrams::*, diagrams_3d::*}};
    for length in [0.03, 3.0, 300.0] {
        let width = length * 1e-10_f64;
        assert!(std::panic::catch_unwind(|| fef_partial_distributed_2d(-2.0, -2.0, 0.0, width.next_down(), length, 0.7)).is_err());
        for b in [width, width.next_up()] {
            let q = -1.0 / b;
            let f = fef_partial_distributed_2d(q, q, 0.0, b, length, 0.7);
            assert!((f[1] + f[4] + 1.0).abs() < 1e-13);
        }
    }
    let mut input = witness();
    input.loads = vec![SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -2.0, q_j: -2.0, a: Some(1.0), b: Some(2.0) })];
    let base = linear::solve_2d(&input).unwrap();
    for (a, b, valid) in refusal_cases_2222() {
        for mode in 0..3 {
            let r = std::panic::catch_unwind(|| match mode {
                0 => { fef_partial_distributed_2d(-2.0, -2.0, a, b, 3.0, 0.7); }
                1 => { fef_partial_distributed_3d(-2.0, -2.0, -2.0, -2.0, a, b, 3.0, 0.7, 0.7); }
                _ => { axial_distributed_fef(-2.0, -2.0, a, b, 3.0); }
            });
            assert_eq!(r.is_ok(), valid, "kernel {mode}: [{a}, {b}]");
        }
        let mut ef = base.element_forces[0].clone();
        ef.distributed_loads = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
        assert_eq!(std::panic::catch_unwind(|| compute_diagram_value_at("shear", 0.9, &ef)).is_ok(), valid);
        assert_eq!(std::panic::catch_unwind(|| diagram_positions_2d(&ef, "shear")).is_ok(), valid);
        for plane in [Plane::XY, Plane::XZ] {
            let mut ef = linear::solve_3d(&embed_2d(&input, plane).unwrap()).unwrap().element_forces[0].clone();
            for loads in [&mut ef.distributed_loads_x, &mut ef.distributed_loads_y, &mut ef.distributed_loads_z] {
                *loads = vec![DistributedLoadInfo { q_i: -2.0, q_j: -2.0, a, b }];
            }
            assert_eq!(std::panic::catch_unwind(|| evaluate_diagram_3d_at(&ef, "shearY", 0.9)).is_ok(), valid);
            assert_eq!(std::panic::catch_unwind(|| diagram_positions_3d(&ef, "shearZ")).is_ok(), valid);
        }
    }
}
