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
                let qi = if b == a { -7.0 } else { -1.0 / (b - a) };
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
