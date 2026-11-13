use dedaliano_engine::{
    solver::{
        arc_length, cable, contact, corotational, fiber_nonlinear, linear, material_nonlinear,
        pdelta, reduction, ssi, staged, winkler,
    },
    types::*,
};
use serde_json::{json, Value};

fn model(dim: usize, tied: bool) -> Value {
    let mut m: Value = serde_json::from_str(if dim == 2 {
        include_str!("../../../fixtures/reaction-recovery-2d.json")
    } else {
        include_str!("../../../fixtures/reaction-recovery-3d.json")
    })
    .unwrap();
    if tied {
        m["nodes"]["2"] = json!({"id": 2, "x": 0.0, "z": 0.0});
        m["constraints"] = json!([{"type": "equalDOF", "masterNode": 0, "slaveNode": 2, "dofs": if dim == 2 { vec![0,1,2] } else { vec![0,1,2,3,4,5] }}]);
        m["loads"]
            .as_array_mut()
            .unwrap()
            .push(json!({"type": "nodal", "nodeId": 2, "fx": 3.0, "fz": -10.0, "my": 2.0}));
    }
    if tied {
        let l = m["loads"].as_array_mut().unwrap().last_mut().unwrap();
        l.as_object_mut().unwrap().remove("type");
        if dim == 3 {
            m["nodes"]["2"]["y"] = json!(0.0);
            let l = m["loads"].as_array_mut().unwrap().last_mut().unwrap();
            l["fy"] = json!(0.0);
            l["mx"] = json!(0.0);
            l["mz"] = json!(0.0);
        }
        let l = m["loads"].as_array_mut().unwrap().last_mut().unwrap();
        *l = json!({"type": "nodal", "data": l.clone()});
    }
    m
}

fn options(m: &Value) -> Value {
    json!({"solver": m, "maxIter": 40, "tolerance": 1e-9, "nIncrements": 2, "materialModels": {}, "sectionCapacities": {}, "fiberSections": {}, "soilSprings": [], "foundationSprings": [], "boundaryNodes": [1]})
}

fn run(kind: &str, dim: usize, m: &Value) -> (Value, f64) {
    let o = options(m);
    if kind == "arc" {
        let i = serde_json::from_value(json!({"solver": m, "maxSteps": 3, "maxIter": 40, "tolerance": 1e-9, "initialDs": 0.1, "minDs": 1e-8, "maxDs": 0.1, "targetIter": 5})).unwrap();
        let r = arc_length::solve_arc_length(&i).unwrap();
        assert!(r.converged);
        return (
            serde_json::to_value(r.results).unwrap(),
            r.final_load_factor,
        );
    }
    if kind == "displacement" {
        let i = serde_json::from_value(json!({"solver": m, "controlNode": m["loads"][0]["data"]["nodeId"], "controlDof": 1, "targetDisplacement": -0.005, "nSteps": 3, "maxIter": 40, "tolerance": 1e-9})).unwrap();
        let r = arc_length::solve_displacement_control(&i).unwrap();
        assert!(r.converged);
        return (
            serde_json::to_value(r.results).unwrap(),
            r.final_load_factor,
        );
    }
    let mut s = m.clone();
    s["stages"] = json!([{"name": "loaded", "elementsAdded": [1], "supportsAdded": [0], "loadIndices": (0..m["loads"].as_array().unwrap().len()).collect::<Vec<_>>()}]);
    let r = if dim == 2 {
        let input: SolverInput = serde_json::from_value(m.clone()).unwrap();
        match kind {
            "winkler" => serde_json::to_value(
                winkler::solve_winkler_2d(&serde_json::from_value(o).unwrap()).unwrap(),
            )
            .unwrap(),
            "guyan" => serde_json::to_value(
                reduction::guyan_reduce_2d(&serde_json::from_value(o).unwrap()).unwrap(),
            )
            .unwrap(),
            "linear" => serde_json::to_value(linear::solve_2d(&input).unwrap()).unwrap(),
            "corotational" => {
                let r = corotational::solve_corotational_2d(&input, 40, 1e-9, 2, false).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "material" => {
                let r = material_nonlinear::solve_nonlinear_material_2d(
                    &serde_json::from_value(o).unwrap(),
                )
                .unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "fiber" => {
                let r =
                    fiber_nonlinear::solve_fiber_nonlinear_2d(&serde_json::from_value(o).unwrap())
                        .unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "pdelta" => {
                let r = pdelta::solve_pdelta_2d(&input, 40, 1e-9).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "contact" => {
                let r = contact::solve_contact_2d(&serde_json::from_value(o).unwrap()).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "cable" => {
                let r = cable::solve_cable_2d(&input, &Default::default(), 40, 1e-9).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "ssi" => {
                let r = ssi::solve_ssi_2d(&serde_json::from_value(o).unwrap()).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "staged" => serde_json::to_value(
                staged::solve_staged_2d(&serde_json::from_value(s).unwrap())
                    .unwrap()
                    .final_results,
            )
            .unwrap(),
            _ => panic!("unknown analysis"),
        }
    } else {
        let input: SolverInput3D = serde_json::from_value(m.clone()).unwrap();
        match kind {
            "winkler" => serde_json::to_value(
                winkler::solve_winkler_3d(&serde_json::from_value(o).unwrap()).unwrap(),
            )
            .unwrap(),
            "guyan" => serde_json::to_value(
                reduction::guyan_reduce_3d(&serde_json::from_value(o).unwrap()).unwrap(),
            )
            .unwrap(),
            "linear" => serde_json::to_value(linear::solve_3d(&input).unwrap()).unwrap(),
            "corotational" => {
                let r = corotational::solve_corotational_3d(&input, 40, 1e-9, 2, false).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "material" => {
                let r = material_nonlinear::solve_nonlinear_material_3d(
                    &serde_json::from_value(o).unwrap(),
                )
                .unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "fiber" => {
                let r =
                    fiber_nonlinear::solve_fiber_nonlinear_3d(&serde_json::from_value(o).unwrap())
                        .unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "pdelta" => {
                let r = pdelta::solve_pdelta_3d(&input, 40, 1e-9).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "contact" => {
                let r = contact::solve_contact_3d(&serde_json::from_value(o).unwrap()).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "cable" => {
                let r = cable::solve_cable_3d(&input, &Default::default(), 40, 1e-9).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "ssi" => {
                let r = ssi::solve_ssi_3d(&serde_json::from_value(o).unwrap()).unwrap();
                assert!(r.converged);
                serde_json::to_value(r.results).unwrap()
            }
            "staged" => serde_json::to_value(
                staged::solve_staged_3d(&serde_json::from_value(s).unwrap())
                    .unwrap()
                    .final_results,
            )
            .unwrap(),
            _ => panic!("unknown analysis"),
        }
    };
    (r, 1.0)
}

fn num(v: &Value, k: &str) -> f64 {
    v[k].as_f64().unwrap()
}

fn equilibrium(kind: &str, dim: usize, tied: bool) {
    let mut m = model(dim, tied);
    if kind == "guyan" {
        m["nodes"]["3"] = m["nodes"]["1"].clone();
        m["nodes"]["3"]["id"] = json!(3);
        m["nodes"]["3"]["x"] = json!(1.5);
        m["elements"]["2"] = m["elements"]["1"].clone();
        m["elements"]["1"]["nodeJ"] = json!(3);
        m["elements"]["2"]["id"] = json!(2);
        m["elements"]["2"]["nodeI"] = json!(3);
    }
    if kind == "cable" {
        m["elements"]["1"]["type"] = json!("cable");
        m["loads"][0]["data"]["fx"] = json!(10.0);
        m["loads"][0]["data"]["fz"] = json!(0.0);
        if tied {
            m["loads"][1]["data"]["my"] = json!(0.0);
            m["constraints"][0]["dofs"] = if dim == 2 {
                json!([0, 1])
            } else {
                json!([0, 1, 2])
            };
        }
        m["supports"]["1"] = if dim == 2 {
            json!({"id": 1, "nodeId": 1, "type": "rollerX"})
        } else {
            json!({"nodeId": 1, "rx":false,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})
        };
    }
    if kind == "pdelta" && !tied {
        let (r, _) = run(kind, dim, &m);
        assert!(!r["structuredDiagnostics"].as_array().is_some_and(|ds| ds
            .iter()
            .any(|d| d["code"] == "result_quantity_unavailable")));
    }
    check_equilibrium(kind, dim, &m);
    if tied && kind != "cable" {
        m["nodes"]["2"]["x"] = json!(1.0);
        m["nodes"]["2"]["z"] = json!(1.0);
        m["constraints"][0]["type"] = json!("rigidLink");
        check_equilibrium(kind, dim, &m);
        if !["staged", "displacement"].contains(&kind) {
            m["supports"]["1"] = if dim == 2 {
                json!({"id":1,"nodeId":1,"type":"inclinedRoller","angle":30.0})
            } else {
                json!({"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"isInclined":true,"normalX":0.5,"normalY":0.0,"normalZ":30.0_f64.to_radians().cos()})
            };
            check_equilibrium(kind, dim, &m);
        }
    }
}

fn check_equilibrium(kind: &str, dim: usize, m: &Value) {
    let (r, factor) = run(kind, dim, &m);
    assert_equilibrium(kind, dim, m, &r, factor);
}

fn assert_equilibrium(kind: &str, dim: usize, m: &Value, r: &Value, factor: f64) {
    if dim == 2 && matches!(kind, "arc" | "displacement" | "corotational") {
        unloaded_member_equilibrium(m, r);
    }
    assert!(factor.is_finite() && factor > 0.0);
    if kind == "pdelta" && (r["equilibrium"]["equilibriumOk"] == false || r["equilibrium"]["residualOk"] == false) {
        assert!(r["reactions"].as_array().unwrap().is_empty());
        assert!(r["structuredDiagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == "reactions" && d["severity"] == "warning"));
        for i in 0..dim {
            let a = r["equilibrium"]["appliedForceSum"][i].as_f64().unwrap();
            let b = r["equilibrium"]["reactionForceSum"][i].as_f64().unwrap();
            assert!((a + b).abs() < 1e-6);
        }
        return;
    }
    assert_eq!(
        r["reactions"].as_array().unwrap().len(),
        m["supports"].as_object().unwrap().len(),
        "{kind} {dim}D reactions"
    );
    let mut balance = [0.0; 6];
    let large = matches!(kind, "arc" | "displacement" | "corotational" | "pdelta");
    let position = |id: usize| {
        let n = &m["nodes"][id.to_string()];
        let d = r["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["nodeId"] == id)
            .unwrap();
        [
            num(n, "x") + if large { num(d, "ux") } else { 0.0 },
            if dim == 3 {
                num(n, "y") + if large { num(d, "uy") } else { 0.0 }
            } else {
                0.0
            },
            num(n, "z") + if large { num(d, "uz") } else { 0.0 },
        ]
    };
    let mut add = |id: usize, f: [f64; 3], moment: [f64; 3]| {
        let p = position(id);
        for i in 0..3 {
            balance[i] += f[i];
            balance[i + 3] += moment[i];
        }
        balance[3] += p[1] * f[2] - p[2] * f[1];
        balance[4] += p[2] * f[0] - p[0] * f[2];
        balance[5] += p[0] * f[1] - p[1] * f[0];
    };
    for load in m["loads"].as_array().unwrap() {
        let l = &load["data"];
        let f = [
            num(l, "fx"),
            if dim == 3 { num(l, "fy") } else { 0.0 },
            num(l, "fz"),
        ]
        .map(|x| x * factor);
        let moment = if dim == 3 {
            [num(l, "mx"), num(l, "my"), num(l, "mz")]
        } else {
            [0.0, -num(l, "my"), 0.0]
        }
        .map(|x| x * factor);
        add(l["nodeId"].as_u64().unwrap() as usize, f, moment);
    }
    for a in r["reactions"].as_array().unwrap() {
        let (f, moment) = if dim == 3 {
            (
                [num(a, "fx"), num(a, "fy"), num(a, "fz")],
                [num(a, "mx"), num(a, "my"), num(a, "mz")],
            )
        } else {
            ([num(a, "rx"), 0.0, num(a, "rz")], [0.0, -num(a, "my"), 0.0])
        };
        add(a["nodeId"].as_u64().unwrap() as usize, f, moment);
    }
    for v in &balance[..3] {
        assert!(v.abs() < 1e-6, "{kind} {dim}D force balance: {balance:?}");
    }
    for (i, v) in balance.iter().enumerate() {
        assert!(
            v.abs() < 1e-6,
            "{kind} {dim}D: equilibrium component {i} = {v}; {r}"
        );
    }
}

macro_rules! recovery_test {
    ($name:ident, $kind:literal, $dim:literal) => {
        #[test]
        fn $name() {
            equilibrium($kind, $dim, true);
        }
    };
}
recovery_test!(issue_1949_arc_reactions, "arc", 2);
recovery_test!(issue_1949_displacement_reactions, "displacement", 2);
#[test]
fn linear_restrained_master_2d_is_already_correct() {
    equilibrium("linear", 2, true);
}
#[test]
fn linear_restrained_master_3d_is_already_correct() {
    equilibrium("linear", 3, true);
}
recovery_test!(issue_1949_corotational_2d, "corotational", 2);
recovery_test!(issue_1949_corotational_3d, "corotational", 3);
recovery_test!(issue_1949_material_2d, "material", 2);
recovery_test!(issue_1949_material_3d, "material", 3);

recovery_test!(issue_1949_pdelta_2d, "pdelta", 2);
recovery_test!(issue_1949_pdelta_3d, "pdelta", 3);
recovery_test!(issue_1949_contact_2d, "contact", 2);
recovery_test!(issue_1949_contact_3d, "contact", 3);
recovery_test!(issue_1949_cable_2d, "cable", 2);
recovery_test!(issue_1949_cable_3d, "cable", 3);
#[test]
fn ssi_restrained_master_2d_is_already_correct() {
    equilibrium("ssi", 2, true);
}
#[test]
fn ssi_restrained_master_3d_is_already_correct() {
    equilibrium("ssi", 3, true);
}
recovery_test!(issue_1949_staged_2d, "staged", 2);
recovery_test!(issue_1949_staged_3d, "staged", 3);

#[test]
fn supported_unconstrained_inputs_keep_their_answers() {
    for kind in [
        "linear",
        "corotational",
        "material",
        "fiber",
        "pdelta",
        "contact",
        "cable",
        "ssi",
        "staged",
        "winkler",
        "guyan",
    ] {
        for dim in [2, 3] {
            equilibrium(kind, dim, false);
        }
    }
}

#[test]
fn issue_1949_arc_unconstrained() {
    equilibrium("arc", 2, false);
}

#[test]
fn issue_1949_displacement_unconstrained() {
    equilibrium("displacement", 2, false);
}

#[test]
fn issue_1949_arc_inclined() {
    let mut m = model(2, false);
    m["supports"]["1"] = json!({"id": 1, "nodeId": 1, "type": "inclinedRoller", "angle": 30.0});
    check_equilibrium("arc", 2, &m);
}

#[test]
fn spatial_path_following_is_explicitly_unavailable() {
    let m = model(3, false);
    assert!(serde_json::from_value::<arc_length::ArcLengthInput>(json!({"solver":m})).is_err());
    assert!(
        serde_json::from_value::<arc_length::DisplacementControlInput>(
            json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-0.005})
        )
        .is_err()
    );
}

#[test]
fn fiber_constraints_remain_explicitly_refused() {
    for dim in [2, 3] {
        let o = options(&model(dim, true));
        let error = if dim == 2 {
            fiber_nonlinear::solve_fiber_nonlinear_2d(&serde_json::from_value(o).unwrap())
                .unwrap_err()
        } else {
            fiber_nonlinear::solve_fiber_nonlinear_3d(&serde_json::from_value(o).unwrap())
                .unwrap_err()
        };
        assert!(error.contains("constraints are not supported"), "{error}");
    }
}

#[test]
fn issue_1949_path_member_loads_use_final_factor() {
    for kind in ["arc", "displacement"] {
        let mut m = model(2, false);
        m["loads"]
            .as_array_mut()
            .unwrap()
            .push(json!({"type":"distributed","data":{"elementId":1,"qI":-10.0,"qJ":-10.0}}));
        let (r, factor) = run(kind, 2, &m);
        assert!((num(&r["elementForces"][0], "qI") + 10.0 * factor).abs() < 1e-9);
        assert!((num(&r["elementForces"][0], "qJ") + 10.0 * factor).abs() < 1e-9);
    }
}

#[test]
fn displacement_control_inclined_supports_are_explicitly_refused() {
    let mut m = model(2, false);
    m["supports"]["1"] = json!({"id":1,"nodeId":1,"type":"inclinedRoller","angle":30.0});
    let i = serde_json::from_value(
        json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-0.005}),
    )
    .unwrap();
    let e = arc_length::solve_displacement_control(&i).unwrap_err();
    assert!(e.contains("inclined"), "{e}");
}

fn exact_frozen_arch(fixture: &str) {
    let input: arc_length::ArcLengthInput = serde_json::from_str(fixture).unwrap();
    let r = arc_length::solve_arc_length(&input).unwrap();
    assert!(r.converged);
    assert_equilibrium(
        "arc",
        2,
        &serde_json::to_value(&input.solver).unwrap(),
        &serde_json::to_value(r.results).unwrap(),
        r.final_load_factor,
    );
}

#[test]
fn issue_1949_exact_frozen_0015ab84c3baa36f() {
    exact_frozen_arch(include_str!(
        "../../../fixtures/solve_arc_length-0015ab84c3baa36f.json"
    ));
}

#[test]
fn issue_1949_exact_frozen_022317310499426d() {
    exact_frozen_arch(include_str!(
        "../../../fixtures/solve_arc_length-022317310499426d.json"
    ));
}

#[test]
fn issue_1949_sparse_and_dense_path_reactions() {
    for elements in [21, 22] {
        let mut m = model(2, false);
        m["nodes"] = json!({});
        m["elements"] = json!({});
        for i in 0..=elements {
            m["nodes"][i.to_string()] = json!({"id":i,"x":3.0*i as f64/elements as f64,"z":0.0});
        }
        for i in 0..elements {
            m["elements"][(i + 1).to_string()] = json!({"id":i+1,"type":"frame","nodeI":i,"nodeJ":i+1,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false});
        }
        m["loads"][0]["data"]["nodeId"] = json!(elements);
        for kind in ["arc", "displacement"] {
            check_equilibrium(kind, 2, &m);
        }
    }
}

fn dynamic_availability(dim: usize) {
    for springs_only in [false, true] {
        let mut m = model(dim, false);
        if springs_only {
            m["elements"] = json!({});
            m["nodes"].as_object_mut().unwrap().remove("0");
            m["masses"] = json!({"nodal":[{"nodeId":1,"mass":1.0}]});
            m["supports"] = if dim == 2 {
                json!({"1":{"id":1,"nodeId":1,"type":"spring","kx":1000.0,"ky":1000.0,"kz":1000.0}})
            } else {
                json!({"1":{"nodeId":1,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":1000.0,"ky":1000.0,"kz":1000.0,"krx":1000.0,"kry":1000.0,"krz":1000.0}})
            };
        }
        for method in ["newmark", "hht"] {
            let o = json!({"solver":m,"densities":{"1":7850.0},"timeStep":0.01,"nSteps":3,"method":method,"alpha":if method == "hht" {Some(-0.1)} else {None}});
            let r = if dim == 2 {
                serde_json::to_value(
                    dedaliano_engine::solver::time_integration::solve_time_history_2d(
                        &serde_json::from_value(o).unwrap(),
                    )
                    .unwrap(),
                )
                .unwrap()
            } else {
                serde_json::to_value(
                    dedaliano_engine::solver::time_integration::solve_time_history_3d(
                        &serde_json::from_value(o).unwrap(),
                    )
                    .unwrap(),
                )
                .unwrap()
            };
            assert_eq!(r["timeSteps"].as_array().unwrap().len(), 4);
            assert_eq!(r["peakReactions"].as_array().unwrap().len(), 1);
            assert!(r["structuredDiagnostics"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["code"] == "result_quantity_unavailable"
                    && d["phase"] == "peakReactions"
                    && d["severity"] == "warning"));
        }
    }
}

#[test]
fn issue_1949_dynamic_reaction_availability_2d() {
    dynamic_availability(2);
}

#[test]
fn issue_1949_dynamic_reaction_availability_3d() {
    dynamic_availability(3);
}

fn tied_beam_model(dim: usize) -> Value {
    let mut m = model(dim, false);
    m["nodes"]["2"] = m["nodes"]["0"].clone();
    m["nodes"]["3"] = m["nodes"]["1"].clone();
    m["nodes"]["2"]["id"] = json!(2);
    m["nodes"]["3"]["id"] = json!(3);
    m["nodes"]["2"]["z"] = json!(2.0);
    m["nodes"]["3"]["z"] = json!(2.0);
    m["elements"]["2"] = m["elements"]["1"].clone();
    m["elements"]["2"]["id"] = json!(2);
    m["elements"]["2"]["nodeI"] = json!(2);
    m["elements"]["2"]["nodeJ"] = json!(3);
    m["supports"]["2"] = m["supports"]["0"].clone();
    m["supports"]["2"]["nodeId"] = json!(2);
    if dim == 2 {
        m["supports"]["2"]["id"] = json!(2);
    }
    m["constraints"] =
        json!([{"type":"equalDOF","masterNode":1,"slaveNode":3,"dofs":[if dim == 2 {1} else {2}]}]);
    m
}

fn nonlinear_constraint_force(dim: usize) {
    let m = tied_beam_model(dim);
    let (r, factor) = run("corotational", dim, &m);
    assert_equilibrium("corotational", dim, &m, &r, factor);
    let cf = r["constraintForces"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["nodeId"] == 3 && c["dof"] == "uz")
        .unwrap();
    let reaction = r["reactions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["nodeId"] == 2)
        .unwrap();
    assert!(
        (num(cf, "force") + num(reaction, if dim == 2 { "rz" } else { "fz" })).abs() < 1e-7,
        "{r}"
    );
}

#[test]
fn issue_1949_nonlinear_constraint_force_2d() {
    nonlinear_constraint_force(2);
}

#[test]
fn issue_1949_nonlinear_constraint_force_3d() {
    nonlinear_constraint_force(3);
}

fn staged_availability(dim: usize) {
    for loaded in [false, true] {
        let mut m = model(dim, false);
        m["stages"] = json!([{"name":"no stiffness","supportsAdded":[0],"loadIndices": if loaded {vec![0]} else {vec![]}}]);
        let outcome = if dim == 2 {
            staged::solve_staged_2d(&serde_json::from_value(m).unwrap())
                .map(|r| serde_json::to_value(r).unwrap())
        } else {
            staged::solve_staged_3d(&serde_json::from_value(m).unwrap())
                .map(|r| serde_json::to_value(r).unwrap())
        };
        let r = match outcome {
            Ok(r) => r,
            Err(e) => {
                assert!(e.contains("mechanism"), "{e}");
                continue;
            }
        };
        assert!(r["finalResults"]["structuredDiagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == "stageResults"));
    }
}

#[test]
fn issue_1949_staged_availability_2d() {
    staged_availability(2);
}

#[test]
fn staged_empty_3d_remains_explicitly_refused() {
    staged_availability(3);
}

#[test]
fn issue_1949_displacement_step_snapshots() {
    let m = model(2, false);
    let i = serde_json::from_value(
        json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-0.005,"nSteps":3}),
    )
    .unwrap();
    let r = arc_length::solve_displacement_control(&i).unwrap();
    assert!(r.converged);
    for step in &r.steps {
        assert!(step.converged);
        assert_eq!(step.displacements.len(), 2);
        assert!(
            (step
                .displacements
                .iter()
                .find(|d| d.node_id == 1)
                .unwrap()
                .uz
                - step.control_displacement)
                .abs()
                < 1e-12
        );
    }
    assert_eq!(
        serde_json::to_value(&r.steps.last().unwrap().displacements).unwrap(),
        serde_json::to_value(&r.results.displacements).unwrap()
    );
}

#[test]
fn issue_1949_winkler_2d() {
    equilibrium("winkler", 2, true);
}
#[test]
fn issue_1949_winkler_3d() {
    equilibrium("winkler", 3, true);
}
#[test]
fn issue_1949_guyan_2d() {
    equilibrium("guyan", 2, true);
}
#[test]
fn issue_1949_guyan_3d() {
    equilibrium("guyan", 3, true);
}

fn material_constraint_force(dim: usize) {
    let m = tied_beam_model(dim);
    let (elastic, _) = run("linear", dim, &m);
    let cap = num(&elastic["reactions"][0], "my").abs() / 2.0;
    let mut o = options(&m);
    o["materialModels"] = json!({"1":{"modelType":"bilinear","fy":200.0,"alpha":0.01}});
    o["sectionCapacities"] = if dim == 2 {
        json!({"1":{"np":2000000.0,"mp":cap}})
    } else {
        json!({"1":{"np":2000000.0,"mpy":cap,"mpz":cap}})
    };
    let r = if dim == 2 {
        let r =
            material_nonlinear::solve_nonlinear_material_2d(&serde_json::from_value(o).unwrap())
                .unwrap();
        assert!(r.converged);
        serde_json::to_value(r.results).unwrap()
    } else {
        let r =
            material_nonlinear::solve_nonlinear_material_3d(&serde_json::from_value(o).unwrap())
                .unwrap();
        assert!(r.converged);
        serde_json::to_value(r.results).unwrap()
    };
    assert_equilibrium("material", dim, &m, &r, 1.0);
    let at = |r: &Value| {
        r["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["nodeId"] == 1)
            .unwrap()["uz"]
            .as_f64()
            .unwrap()
            .abs()
    };
    assert!(at(&r) > 2.0 * at(&elastic));
    let cf = r["constraintForces"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["nodeId"] == 3 && c["dof"] == "uz")
        .unwrap();
    let reaction = r["reactions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["nodeId"] == 2)
        .unwrap();
    assert!(
        (num(cf, "force") + num(reaction, if dim == 2 { "rz" } else { "fz" })).abs() < 1e-7,
        "{r}"
    );
}

#[test]
fn issue_1949_material_constraint_force_2d() {
    material_constraint_force(2);
}
#[test]
fn issue_1949_material_constraint_force_3d() {
    material_constraint_force(3);
}

fn guyan_springs(dim: usize) {
    let mut m = model(dim, false);
    if dim == 2 {
        m["supports"]["0"] =
            json!({"id":0,"nodeId":0,"type":"spring","kx":1000.0,"ky":1000.0,"kz":1000.0});
    } else {
        for k in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
            m["supports"]["0"][k] = json!(false);
        }
        for k in ["kx", "ky", "kz", "krx", "kry", "krz"] {
            m["supports"]["0"][k] = json!(1000.0);
        }
    }
    check_equilibrium("guyan", dim, &m);
}

#[test]
fn guyan_springs_2d_keeps_the_correct_answer() {
    guyan_springs(2);
}
#[test]
fn issue_1949_guyan_springs_3d() {
    guyan_springs(3);
}

#[test]
fn arc_spatial_fields_are_refused_before_projection() {
    for y in [0.0, 1.0, -1.0] {
        let mut m = model(2, false);
        m["nodes"]["1"]["y"] = json!(y);
        let r = serde_json::from_value::<arc_length::ArcLengthInput>(json!({"solver":m}));
        assert!(
            r.is_err(),
            "spatial coordinates must not disappear from arc-length input"
        );
    }
}

#[test]
fn displacement_spatial_fields_are_refused_before_projection() {
    for y in [0.0, 1.0, -1.0] {
        let mut m = model(2, false);
        m["nodes"]["1"]["y"] = json!(y);
        let r = serde_json::from_value::<arc_length::DisplacementControlInput>(
            json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-0.005}),
        );
        assert!(
            r.is_err(),
            "spatial coordinates must not disappear from displacement-control input"
        );
    }
}

#[test]
fn issue_1949_arc_continuation_reactions() {
    let m = model(2, true);
    let solver: SolverInput = serde_json::from_value(m.clone()).unwrap();
    let initial = corotational::solve_corotational_2d(&solver, 40, 1e-9, 2, false).unwrap();
    assert!(initial.converged);
    let start = corotational::CorotationalStart2D {
        input: &solver,
        displacements: &initial.results.displacements,
    };
    let input = serde_json::from_value(json!({"solver":m,"maxSteps":3,"maxIter":40,"tolerance":1e-9,"initialDs":0.1,"minDs":1e-8,"maxDs":0.1,"targetIter":5})).unwrap();
    let r = arc_length::solve_arc_length_from(&input, Some(&start)).unwrap();
    assert!(r.converged);
    assert_equilibrium(
        "arc",
        2,
        &m,
        &serde_json::to_value(r.results).unwrap(),
        1.0 + r.final_load_factor,
    );
}

#[test]
fn issue_1949_corotational_continuation_reactions() {
    let m = model(2, true);
    let solver: SolverInput = serde_json::from_value(m.clone()).unwrap();
    let initial = corotational::solve_corotational_2d(&solver, 40, 1e-9, 2, false).unwrap();
    assert!(initial.converged);
    let start = corotational::CorotationalStart2D {
        input: &solver,
        displacements: &initial.results.displacements,
    };
    let r = corotational::solve_corotational_2d_from(&solver, Some(&start), 40, 1e-9, 2, false)
        .unwrap();
    assert!(r.converged);
    assert_equilibrium(
        "corotational",
        2,
        &m,
        &serde_json::to_value(r.results).unwrap(),
        1.0,
    );
}

fn staged_constraints_only(dim: usize) {
    for member_type in ["frame", "truss"] {
        let mut m = model(dim, false);
        let dofs = if member_type == "truss" {
            dim
        } else if dim == 2 {
            3
        } else {
            6
        };
        if member_type == "truss" {
            m["elements"]["1"]["type"] = json!("truss");
            m["loads"][0]["data"]["fx"] = json!(10.0);
            m["loads"][0]["data"]["fz"] = json!(0.0);
        }
        m["constraints"] = json!([{"type":"rigidLink","masterNode":0,"slaveNode":1,"dofs":(0..dofs).collect::<Vec<_>>()}]);
        m["stages"] = json!([{"name":"rigid link only","supportsAdded":[0],"loadIndices":[0]}]);
        let r = if dim == 2 {
            serde_json::to_value(
                staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
            )
            .unwrap()
        } else {
            serde_json::to_value(
                staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
            )
            .unwrap()
        };
        let r = &r["finalResults"];
        for field in ["reactions", "elementForces", "constraintForces", "plateStresses", "quadStresses", "quadNodalStresses"] {
            assert!(r[field].as_array().is_none_or(Vec::is_empty), "{r}");
        }
        assert!(r["structuredDiagnostics"].as_array().is_some_and(|ds| ds
            .iter()
            .any(|d| d["code"] == "result_quantity_unavailable")));
    }
}

#[test]
fn issue_1949_staged_constraints_only_2d() {
    staged_constraints_only(2);
}
#[test]
fn issue_1949_staged_constraints_only_3d() {
    staged_constraints_only(3);
}

fn staged_support_changes(dim: usize) {
    for remove in [false, true] {
        let mut m = model(dim, false);
        m["stages"] = if remove {
            json!([{"name":"supported","elementsAdded":[1],"supportsAdded":[0],"loadIndices":[0]},{"name":"released","supportsRemoved":[0]}])
        } else {
            json!([{"name":"not yet supported","elementsAdded":[1],"loadIndices":[0]}])
        };
        let error = if dim == 2 {
            staged::solve_staged_2d(&serde_json::from_value(m).unwrap()).unwrap_err()
        } else {
            staged::solve_staged_3d(&serde_json::from_value(m).unwrap()).unwrap_err()
        };
        let d: Value = serde_json::from_str(&error).unwrap();
        assert!(d["structuredDiagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == "result_quantity_unavailable"
                && d["phase"] == "reactions"
                && d["severity"] == "error"));
    }
}

#[test]
fn issue_1949_staged_support_changes_are_diagnosed_2d() {
    staged_support_changes(2);
}
#[test]
fn issue_1949_staged_support_changes_are_diagnosed_3d() {
    staged_support_changes(3);
}

fn guyan_member_forces(dim: usize) {
    for tied in [false, true] {
        let mut m = model(dim, tied);
        m["nodes"]["3"] = m["nodes"]["1"].clone();
        m["nodes"]["3"]["id"] = json!(3);
        m["nodes"]["3"]["x"] = json!(1.5);
        m["elements"]["2"] = m["elements"]["1"].clone();
        m["elements"]["1"]["nodeJ"] = json!(3);
        m["elements"]["2"]["id"] = json!(2);
        m["elements"]["2"]["nodeI"] = json!(3);
        let (reduced, _) = run("guyan", dim, &m);
        let (full, _) = run("linear", dim, &m);
        let actual = reduced["elementForces"].as_array().unwrap();
        let expected = full["elementForces"].as_array().unwrap();
        assert_eq!(actual.len(), m["elements"].as_object().unwrap().len());
        assert!(expected.iter().any(|f| f
            .as_object()
            .unwrap()
            .iter()
            .any(|(k, v)| k.ends_with("Start") && v.as_f64().is_some_and(|v| v.abs() > 1.0))));
        for (a, e) in actual.iter().zip(expected) {
            assert_eq!(a["elementId"], e["elementId"]);
            for (k, v) in e.as_object().unwrap() {
                if let Some(v) = v.as_f64() {
                    assert!((num(a, k) - v).abs() < 1e-9, "{dim}D {k}: {a} versus {e}");
                }
            }
        }
    }
}

#[test]
fn guyan_member_forces_2d_keeps_the_correct_answer() {
    guyan_member_forces(2);
}

#[test]
fn issue_1949_guyan_member_forces_3d() {
    guyan_member_forces(3);
}

fn settlement_only_model(dim: usize, segments: usize, motion: f64, tied: bool) -> Value {
    let mut m = model(dim, false);
    let node = m["nodes"]["0"].clone();
    let elem = m["elements"]["1"].clone();
    m["nodes"] = json!({});
    m["elements"] = json!({});
    m["loads"] = json!([]);
    m["supports"]["0"]["dx"] = json!(motion);
    m["supports"][segments.to_string()] = m["supports"]["0"].clone();
    m["supports"][segments.to_string()]["nodeId"] = json!(segments);
    m["supports"][segments.to_string()]["dx"] = json!(0.0);
    for i in 0..=segments {
        let key = i.to_string();
        m["nodes"][&key] = node.clone();
        m["nodes"][&key]["id"] = json!(i);
        m["nodes"][&key]["x"] = json!(3.0 * i as f64 / segments as f64);
        if dim == 2 {
            m["supports"][segments.to_string()]["id"] = json!(segments);
        }
        if i > 0 {
            m["elements"][&key] = elem.clone();
            m["elements"][&key]["id"] = json!(i);
            m["elements"][&key]["nodeI"] = json!(i - 1);
            m["elements"][&key]["nodeJ"] = json!(i);
        }
    }
    if tied {
        m["nodes"][(segments + 1).to_string()] = node;
        m["nodes"][(segments + 1).to_string()]["id"] = json!(segments + 1);
        m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":segments+1,"dofs":(0..if dim == 2 {3} else {6}).collect::<Vec<_>>()}]);
    }
    m
}

fn settlement_only_pdelta(dim: usize) {
    for segments in [22, 2] {
        for motion in [0.0, 0.0013, -0.0013] {
            for tied in [false, true] {
                let m = settlement_only_model(dim, segments, motion, tied);
                let (r, _) = run("pdelta", dim, &m);
                assert_eq!(
                    r["equilibrium"]["residualOk"], true,
                    "{dim}D {segments} {motion} {tied}: {r}"
                );
                assert_eq!(r["equilibrium"]["equilibriumOk"], true, "{r}");
                assert!(
                    !r["structuredDiagnostics"].as_array().is_some_and(|ds| ds
                        .iter()
                        .any(|d| d["code"] == "result_quantity_unavailable")),
                    "{r}"
                );
                let (linear, _) = run("linear", dim, &m);
                for d in r["displacements"].as_array().unwrap() {
                    let id = d["nodeId"].as_u64().unwrap() as usize;
                    let x = num(&m["nodes"][id.to_string()], "x");
                    assert!(
                        (num(d, "ux") - motion * (1.0 - x / 3.0)).abs() < 1e-12,
                        "{d}"
                    );
                }
                for a in r["reactions"].as_array().unwrap() {
                    let expected = if a["nodeId"] == 0 { 1.0 } else { -1.0 }
                        * 200000.0
                        * 1000.0
                        * 0.01
                        * motion
                        / 3.0;
                    assert!(
                        (num(a, if dim == 2 { "rx" } else { "fx" }) - expected).abs() < 1e-7,
                        "{a}"
                    );
                }
                assert_eq!(
                    r["reactions"].as_array().unwrap().len(),
                    linear["reactions"].as_array().unwrap().len()
                );
            }
        }
    }
}

#[test]
fn issue_1952_settlement_only_pdelta_2d() {
    settlement_only_pdelta(2);
}

#[test]
fn issue_1952_settlement_only_pdelta_3d() {
    settlement_only_pdelta(3);
}

fn fully_restrained_stages(dim: usize) {
    for inactive_member in [false, true] {
        for motion in [0.0, 0.0001] {
            let mut m = model(dim, false);
            if !inactive_member {
                m["elements"] = json!({});
            }
            m["supports"]["1"] = m["supports"]["0"].clone();
            m["supports"]["1"]["nodeId"] = json!(1);
            if dim == 2 {
                m["supports"]["1"]["id"] = json!(1);
            }
            m["supports"]["0"]["dx"] = json!(motion);
            m["loads"][0]["data"]["fx"] = json!(3.0);
            m["stages"] =
                json!([{"name":"restrained only","supportsAdded":[0,1],"loadIndices":[0]}]);
            let r = if dim == 2 {
                serde_json::to_value(
                    staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
                )
                .unwrap()
            } else {
                serde_json::to_value(
                    staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
                )
                .unwrap()
            };
            for r in [&r["finalResults"], &r["stages"][0]["results"]] {
                assert!(
                    !r["structuredDiagnostics"].as_array().is_some_and(|ds| ds
                        .iter()
                        .any(|d| d["code"] == "result_quantity_unavailable")),
                    "{r}"
                );
                assert_eq!(r["reactions"].as_array().unwrap().len(), 2);
                for a in r["reactions"].as_array().unwrap() {
                    let loaded = a["nodeId"] == 1;
                    assert_eq!(
                        num(a, if dim == 2 { "rx" } else { "fx" }),
                        if loaded { -3.0 } else { 0.0 }
                    );
                    assert_eq!(
                        num(a, if dim == 2 { "rz" } else { "fz" }),
                        if loaded { 10.0 } else { 0.0 }
                    );
                }
                for d in r["displacements"].as_array().unwrap() {
                    assert_eq!(num(d, "ux"), if d["nodeId"] == 0 { motion } else { 0.0 });
                }
            }
        }
    }
}

#[test]
fn issue_1952_fully_restrained_stages_2d() {
    fully_restrained_stages(2);
}

#[test]
fn issue_1952_fully_restrained_stages_3d() {
    fully_restrained_stages(3);
}

fn path_member_end_forces(kind: &str, continued: bool) {
    for segments in [1, 21, 22] {
        for loading in ["distributed", "pointOnElement", "both", "none"] {
            let mut m = model(2, false);
            m["nodes"] = json!({});
            m["elements"] = json!({});
            for i in 0..=segments {
                m["nodes"][i.to_string()] =
                    json!({"id":i,"x":3.0*i as f64/segments as f64,"z":0.0});
                if i > 0 {
                    m["elements"][i.to_string()] = json!({"id":i,"type":"frame","nodeI":i-1,"nodeJ":i,"materialId":1,"sectionId":1});
                }
            }
            m["loads"][0]["data"]["nodeId"] = json!(segments);
            for (id, x) in [(1000, 0.0), (1001, 3.0)] {
                m["nodes"][id.to_string()] = json!({"id":id,"x":x,"z":2.0});
                m["supports"][id.to_string()] = json!({"id":id,"nodeId":id,"type":"fixed"});
            }
            m["elements"]["1000"] = json!({"id":1000,"type":"frame","nodeI":1000,"nodeJ":1001,"materialId":1,"sectionId":1});
            let distributed = loading == "distributed" || loading == "both";
            let (qi, qj) = if distributed {
                (-10.0, -4.0)
            } else {
                (0.0, 0.0)
            };
            let p = if loading == "pointOnElement" || loading == "both" {
                -7.0
            } else {
                0.0
            };
            m["loads"]
                .as_array_mut()
                .unwrap()
                .push(json!({"type":"distributed","data":{"elementId":1000,"qI":qi,"qJ":qj}}));
            m["loads"]
                .as_array_mut()
                .unwrap()
                .push(json!({"type":"pointOnElement","data":{"elementId":1000,"a":1.0,"p":p}}));
            let (r, factor) = if continued {
                let solver: SolverInput = serde_json::from_value(m.clone()).unwrap();
                let initial =
                    corotational::solve_corotational_2d(&solver, 40, 1e-9, 2, false).unwrap();
                assert!(initial.converged);
                let start = corotational::CorotationalStart2D {
                    input: &solver,
                    displacements: &initial.results.displacements,
                };
                let input = serde_json::from_value(json!({"solver":m,"maxSteps":3,"maxIter":40,"tolerance":1e-9,"initialDs":0.1,"minDs":1e-8,"maxDs":0.1,"targetIter":5})).unwrap();
                let result = arc_length::solve_arc_length_from(&input, Some(&start)).unwrap();
                assert!(result.converged);
                (
                    serde_json::to_value(result.results).unwrap(),
                    1.0 + result.final_load_factor,
                )
            } else {
                run(kind, 2, &m)
            };
            assert!(factor.is_finite() && factor > 0.0);
            if kind != "linear" {
                assert!(
                    (factor - 1.0).abs() > if continued { 0.01 } else { 0.1 },
                    "{kind}: {factor}"
                );
            }
            let a = r["elementForces"]
                .as_array()
                .unwrap()
                .iter()
                .find(|f| f["elementId"] == 1000)
                .unwrap();
            let (l, t) = (3.0_f64, 1.0_f64 / 3.0);
            let equivalents = [
                l * (7.0 * qi + 3.0 * qj) / 20.0 + p * (1.0 - 3.0 * t * t + 2.0 * t * t * t),
                l * l * (3.0 * qi + 2.0 * qj) / 60.0 + p * l * (t - 2.0 * t * t + t * t * t),
                l * (3.0 * qi + 7.0 * qj) / 20.0 + p * (3.0 * t * t - 2.0 * t * t * t),
                -l * l * (2.0 * qi + 3.0 * qj) / 60.0 + p * l * (-t * t + t * t * t),
            ];
            for ((key, sign), expected) in [
                ("vStart", -1.0),
                ("mStart", -1.0),
                ("vEnd", 1.0),
                ("mEnd", 1.0),
            ]
            .into_iter()
            .zip(equivalents)
            {
                assert!((num(a,key)-sign*expected*factor).abs() < 1e-9, "{kind} {loading} segments={segments} continued={continued} {key}: {a}, factor={factor}, expected={}", sign*expected*factor);
            }
            for id in [1000, 1001] {
                let d = r["displacements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["nodeId"] == id)
                    .unwrap();
                assert_eq!(num(d, "ux"), 0.0);
                assert_eq!(num(d, "uz"), 0.0);
                assert_eq!(num(d, "ry"), 0.0);
            }
        }
    }
}

#[test]
fn issue_1952_path_member_end_forces_use_final_factor() {
    for kind in ["arc", "displacement", "linear"] {
        path_member_end_forces(kind, false);
    }
}

#[test]
fn issue_1952_continued_path_member_end_forces_include_start_loads() {
    path_member_end_forces("arc", true);
}

#[test]
fn issue_1952_stiffness_free_one_free_dof_remains_unavailable() {
    for dim in [2, 3] {
        let mut m = model(dim, false);
        m["nodes"].as_object_mut().unwrap().remove("1");
        m["elements"] = json!({});
        m["supports"]["0"] = if dim == 2 {
            json!({"id":0,"nodeId":0,"type":"rollerX"})
        } else {
            json!({"nodeId":0,"rx":false,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})
        };
        m["loads"][0]["data"]["nodeId"] = json!(0);
        m["loads"][0]["data"]["fx"] = json!(3.0);
        m["loads"][0]["data"]["fz"] = json!(0.0);
        m["stages"] = json!([{"name":"one free DOF","supportsAdded":[0],"loadIndices":[0]}]);
        let outcome = if dim == 2 {
            let solver: SolverInput = serde_json::from_value(m.clone()).unwrap();
            assert_eq!(
                dedaliano_engine::solver::dof::DofNumbering::build_2d(&solver).n_free,
                1
            );
            staged::solve_staged_2d(&serde_json::from_value(m).unwrap())
                .map(|r| serde_json::to_value(r.final_results).unwrap())
        } else {
            let solver: SolverInput3D = serde_json::from_value(m.clone()).unwrap();
            assert_eq!(
                dedaliano_engine::solver::dof::DofNumbering::build_3d(&solver).n_free,
                1
            );
            staged::solve_staged_3d(&serde_json::from_value(m).unwrap())
                .map(|r| serde_json::to_value(r.final_results).unwrap())
        };
        match outcome {
            Ok(r) => assert!(r["structuredDiagnostics"]
                .as_array()
                .unwrap()
                .iter()
                .any(
                    |d| d["code"] == "result_quantity_unavailable" && d["phase"] == "stageResults"
                )),
            Err(e) => assert!(e.contains("mechanism"), "{e}"),
        }
    }
}
fn staged_artificial_ties(dim: usize) {
    for segments in [0, 21, 22] {
        for motion in [0.0, 0.0013, -0.0013] {
            let mut m = settlement_only_model(dim, segments.max(1), motion, false);
            if segments == 0 {
                m["elements"] = json!({});
                m["supports"].as_object_mut().unwrap().remove("1");
                m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":1,"dofs":(0..if dim == 2 {3} else {6}).collect::<Vec<_>>()}]);
            } else {
                let id = segments + 1;
                m["nodes"][id.to_string()] = m["nodes"]["0"].clone();
                m["nodes"][id.to_string()]["id"] = json!(id);
                m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":id,"dofs":(0..if dim == 2 {3} else {6}).collect::<Vec<_>>()}]);
            }
            m["stages"] = json!([{"name":"settled master","elementsAdded":(1..=segments).collect::<Vec<_>>(),"supportsAdded":if segments == 0 {vec![0]} else {vec![0,segments]},"loadIndices":[]}]);
            let output = if dim == 2 {
                serde_json::to_value(
                    staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
                )
                .unwrap()
            } else {
                serde_json::to_value(
                    staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap()).unwrap(),
                )
                .unwrap()
            };
            for r in [&output["finalResults"], &output["stages"][0]["results"]] {
                let warned = r["structuredDiagnostics"].as_array().is_some_and(|ds| {
                    ds.iter().any(|d| {
                        d["code"] == "result_quantity_unavailable" && d["phase"] == "stageResults"
                    })
                });
                assert_eq!(
                    warned,
                    segments == 0,
                    "{dim}D segments={segments} motion={motion}: {r}"
                );
                for cf in r["constraintForces"]
                    .as_array()
                    .map(Vec::as_slice)
                    .unwrap_or(&[])
                {
                    assert_eq!(
                        num(cf, "force"),
                        0.0,
                        "{dim}D segments={segments} motion={motion}: {cf}"
                    );
                }
                if segments == 0 {
                    for a in r["reactions"].as_array().unwrap() {
                        for k in if dim == 2 {
                            vec!["rx", "rz", "my"]
                        } else {
                            vec!["fx", "fy", "fz", "mx", "my", "mz"]
                        } {
                            assert_eq!(num(a, k), 0.0, "{a}");
                        }
                    }
                }
            }
        }
    }
}

#[test]
fn issue_1952_r7_artificial_ties_2d() {
    staged_artificial_ties(2);
}

#[test]
fn issue_1952_r7_artificial_ties_3d() {
    staged_artificial_ties(3);
}

fn unloaded_member_equilibrium(m: &Value, r: &Value) {
    for f in r["elementForces"].as_array().unwrap() {
        let e = m["elements"]
            .as_object()
            .unwrap()
            .values()
            .find(|e| e["id"] == f["elementId"])
            .unwrap();
        if e["type"] != "frame"
            || m["loads"]
                .as_array()
                .unwrap()
                .iter()
                .any(|l| l["data"]["elementId"] == e["id"])
        {
            continue;
        }
        let position = |node: &Value| {
            let n = &m["nodes"][node.as_u64().unwrap().to_string()];
            let d = r["displacements"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["nodeId"] == *node)
                .unwrap();
            [num(n, "x") + num(d, "ux"), num(n, "z") + num(d, "uz")]
        };
        let a = position(&e["nodeI"]);
        let b = position(&e["nodeJ"]);
        let l = (b[0] - a[0]).hypot(b[1] - a[1]);
        assert!((num(f, "length") - l).abs() < 1e-12, "{f}");
        assert!((num(f, "vStart") - num(f, "vEnd")).abs() < 1e-9, "{f}");
        assert!(
            (num(f, "mEnd") - num(f, "mStart") + num(f, "vStart") * l).abs() < 1e-9,
            "{f}"
        );
    }
}

#[test]
fn issue_1952_r7_final_member_geometry() {
    for fixture in [
        include_str!("../../../fixtures/solve_arc_length-0015ab84c3baa36f.json"),
        include_str!("../../../fixtures/solve_arc_length-022317310499426d.json"),
    ] {
        let i: arc_length::ArcLengthInput = serde_json::from_str(fixture).unwrap();
        let r = arc_length::solve_arc_length(&i).unwrap();
        assert!(r.converged);
        unloaded_member_equilibrium(
            &serde_json::to_value(i.solver).unwrap(),
            &serde_json::to_value(r.results).unwrap(),
        );
    }
    for kind in ["arc", "displacement", "corotational"] {
        let m = model(2, false);
        let (r, _) = run(kind, 2, &m);
        unloaded_member_equilibrium(&m, &r);
    }
}

fn staged_disconnected_force(dim: usize) {
    for segments in [1, 21, 22] {
        let mut m = settlement_only_model(dim, segments, 0.0, false);
        m["supports"]
            .as_object_mut()
            .unwrap()
            .remove(&segments.to_string());
        let slave = segments + 1;
        m["nodes"][slave.to_string()] = m["nodes"][segments.to_string()].clone();
        m["nodes"][slave.to_string()]["id"] = json!(slave);
        m["constraints"] = json!([{"type":"equalDOF","masterNode":segments,"slaveNode":slave,"dofs":(0..if dim==2 {3} else {6}).collect::<Vec<_>>()}]);
        let mut load = model(dim, false)["loads"][0].clone();
        load["data"]["nodeId"] = json!(segments);
        m["loads"] = json!([load]);
        m["stages"] = json!([{"name":"loaded master","elementsAdded":(1..=segments).collect::<Vec<_>>(),"supportsAdded":[0],"loadIndices":[0]}]);
        let r = if dim == 2 {
            serde_json::to_value(
                staged::solve_staged_2d(&serde_json::from_value(m).unwrap()).unwrap(),
            )
            .unwrap()
        } else {
            serde_json::to_value(
                staged::solve_staged_3d(&serde_json::from_value(m).unwrap()).unwrap(),
            )
            .unwrap()
        };
        for r in [&r["finalResults"], &r["stages"][0]["results"]] {
            for cf in r["constraintForces"]
                .as_array()
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                assert_eq!(num(cf, "force"), 0.0, "{dim}D segments={segments}: {cf}");
            }
        }
    }
}

#[test]
fn issue_1952_r7_disconnected_force_2d() {
    staged_disconnected_force(2);
}

#[test]
fn issue_1952_r7_disconnected_force_3d() {
    staged_disconnected_force(3);
}

fn r8_released_slave_model(dim: usize, motion: f64) -> Value {
    let mut m = model(dim, false);
    m["nodes"]["2"] = m["nodes"]["0"].clone();
    m["nodes"]["2"]["id"] = json!(2);
    m["supports"]["2"] = m["supports"]["0"].clone();
    m["supports"]["2"]["id"] = json!(2);
    m["supports"]["2"]["nodeId"] = json!(2);
    m["supports"]["2"]["dry"] = json!(motion);
    m["elements"]["1"][if dim == 2 { "hingeEnd" } else { "releaseMyEnd" }] = json!(true);
    m["constraints"] =
        json!([{"type":"equalDOF","masterNode":2,"slaveNode":1,"dofs":[if dim == 2 {2} else {4}]}]);
    m
}

fn r8_released_slave(kind: &str, dim: usize) {
    let mut failures = Vec::new();
    for segments in if kind == "guyan" {
        vec![1]
    } else {
        vec![1, 21, 22]
    } {
        for motion in [0.0, 0.0013, -0.0013] {
            let mut m = r8_released_slave_model(dim, motion);
            if kind == "guyan" {
                m["nodes"]["3"] = m["nodes"]["1"].clone();
                m["nodes"]["3"]["id"] = json!(3);
                m["nodes"]["3"]["x"] = json!(1.5);
                m["elements"]["2"] = m["elements"]["1"].clone();
                m["elements"]["1"]["nodeJ"] = json!(3);
                m["elements"]["1"][if dim == 2 { "hingeEnd" } else { "releaseMyEnd" }] =
                    json!(false);
                m["elements"]["2"]["id"] = json!(2);
                m["elements"]["2"]["nodeI"] = json!(3);
            }
            if segments > 1 {
                let template = m["elements"]["1"].clone();
                m["elements"] = json!({});
                for i in 1..segments {
                    let id = 10 + i;
                    m["nodes"][id.to_string()] = m["nodes"]["1"].clone();
                    m["nodes"][id.to_string()]["id"] = json!(id);
                    m["nodes"][id.to_string()]["x"] = json!(3.0 * i as f64 / segments as f64);
                }
                for i in 0..segments {
                    let id = i + 1;
                    let mut e = template.clone();
                    e["id"] = json!(id);
                    e["nodeI"] = json!(if i == 0 { 0 } else { 10 + i });
                    e["nodeJ"] = json!(if i + 1 == segments { 1 } else { 11 + i });
                    e[if dim == 2 { "hingeEnd" } else { "releaseMyEnd" }] =
                        json!(i + 1 == segments);
                    m["elements"][id.to_string()] = e;
                }
            }
            let o = options(&m);
            let result = if dim == 2 {
                let input: SolverInput = serde_json::from_value(m.clone()).unwrap();
                match kind {
                "linear" => linear::solve_2d(&input).map(|r| json!(r)),
                "corotational" => corotational::solve_corotational_2d(&input,40,1e-9,2,false).map(|r| { assert!(r.converged); json!(r.results) }),
                "continued_corotational" | "continued_arc" => {
                    let mut base = input.clone();
                    base.supports.get_mut("2").unwrap().dry = Some(0.0);
                    let initial = corotational::solve_corotational_2d(&base,40,1e-9,2,false).unwrap();
                    assert!(initial.converged);
                    let start = corotational::CorotationalStart2D { input:&base, displacements:&initial.results.displacements };
                    if kind == "continued_corotational" {
                        corotational::solve_corotational_2d_from(&input,Some(&start),40,1e-9,2,false).map(|r| { assert!(r.converged); json!(r.results) })
                    } else {
                        let path = serde_json::from_value(json!({"solver":m,"maxSteps":3,"maxIter":40,"tolerance":1e-9,"initialDs":0.1,"minDs":1e-8,"maxDs":0.1,"targetIter":5})).unwrap();
                        arc_length::solve_arc_length_from(&path,Some(&start)).map(|r| { assert!(r.converged); json!(r.results) })
                    }
                }
                "material" => material_nonlinear::solve_nonlinear_material_2d(&serde_json::from_value(o).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "pdelta" => pdelta::solve_pdelta_2d(&input,40,1e-9).map(|r| { assert!(r.converged); json!(r.results) }),
                "contact" => contact::solve_contact_2d(&serde_json::from_value(o).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "guyan" => reduction::guyan_reduce_2d(&serde_json::from_value(o).unwrap()).map(|r| json!(r)),
                "arc" => arc_length::solve_arc_length(&serde_json::from_value(json!({"solver":m,"maxSteps":3,"maxIter":40,"tolerance":1e-9,"initialDs":0.1,"minDs":1e-8,"maxDs":0.1,"targetIter":5})).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "displacement" => arc_length::solve_displacement_control(&serde_json::from_value(json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-0.005,"nSteps":3,"maxIter":40,"tolerance":1e-9})).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "staged" => staged::solve_staged_2d(&serde_json::from_value({ let mut s=m.clone(); s["stages"]=json!([{"name":"released slave","elementsAdded":(1..=segments).collect::<Vec<_>>(),"supportsAdded":[0,2],"loadIndices":[0]}]); s }).unwrap()).map(|r| json!(r.final_results)),
                "time" => dedaliano_engine::solver::time_integration::solve_time_history_2d(&serde_json::from_value(json!({"solver":m,"densities":{"1":7850.0},"timeStep":0.01,"nSteps":3})).unwrap()).map(|r| json!({"reactions":r.peak_reactions,"structuredDiagnostics":r.structured_diagnostics})),
                _ => unreachable!(),
            }
            } else {
                let input: SolverInput3D = serde_json::from_value(m.clone()).unwrap();
                match kind {
                "linear" => linear::solve_3d(&input).map(|r| json!(r)),
                "corotational" => corotational::solve_corotational_3d(&input,40,1e-9,2,false).map(|r| { assert!(r.converged); json!(r.results) }),
                "material" => material_nonlinear::solve_nonlinear_material_3d(&serde_json::from_value(o).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "pdelta" => pdelta::solve_pdelta_3d(&input,40,1e-9).map(|r| { assert!(r.converged); json!(r.results) }),
                "contact" => contact::solve_contact_3d(&serde_json::from_value(o).unwrap()).map(|r| { assert!(r.converged); json!(r.results) }),
                "guyan" => reduction::guyan_reduce_3d(&serde_json::from_value(o).unwrap()).map(|r| json!(r)),
                "staged" => staged::solve_staged_3d(&serde_json::from_value({ let mut s=m.clone(); s["stages"]=json!([{"name":"released slave","elementsAdded":(1..=segments).collect::<Vec<_>>(),"supportsAdded":[0,2],"loadIndices":[0]}]); s }).unwrap()).map(|r| json!(r.final_results)),
                "time" => dedaliano_engine::solver::time_integration::solve_time_history_3d(&serde_json::from_value(json!({"solver":m,"densities":{"1":7850.0},"timeStep":0.01,"nSteps":3})).unwrap()).map(|r| json!({"reactions":r.peak_reactions,"structuredDiagnostics":r.structured_diagnostics})),
                _ => unreachable!(),
            }
            };
            match result {
                Ok(r) => {
                    let master = r["reactions"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|r| r["nodeId"] == 2)
                        .unwrap();
                    if num(master, "my") != 0.0 {
                        failures.push(format!("{kind} {dim}D motion={motion}: {r}"));
                    }
                    for cf in r["constraintForces"]
                        .as_array()
                        .map(Vec::as_slice)
                        .unwrap_or(&[])
                    {
                        if num(cf, "force") != 0.0 {
                            failures.push(format!("{kind} {dim}D motion={motion}: {cf}"));
                        }
                    }
                    if kind == "time" {
                        assert!(r["structuredDiagnostics"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|d| d["code"] == "result_quantity_unavailable"));
                    }
                }
                Err(e) => {
                    assert!(
                        motion != 0.0
                            && ["guyan", "time", "corotational", "displacement"].contains(&kind),
                        "{kind} {dim}D motion={motion}: {e}"
                    );
                    assert!(e.to_lowercase().contains("prescribed"), "{e}");
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

macro_rules! r8_slave_test {
    ($name:ident, $kind:literal, $dim:literal) => {
        #[test]
        fn $name() {
            r8_released_slave($kind, $dim);
        }
    };
}
r8_slave_test!(issue_1952_r8_corotational_2d, "corotational", 2);
r8_slave_test!(issue_1952_r8_corotational_3d, "corotational", 3);
r8_slave_test!(issue_1952_r8_material_2d, "material", 2);
r8_slave_test!(issue_1952_r8_material_3d, "material", 3);
r8_slave_test!(issue_1952_r8_pdelta_2d, "pdelta", 2);
r8_slave_test!(issue_1952_r8_pdelta_3d, "pdelta", 3);
r8_slave_test!(issue_1952_r8_contact_2d, "contact", 2);
r8_slave_test!(issue_1952_r8_contact_3d, "contact", 3);
r8_slave_test!(issue_1952_r8_guyan_2d, "guyan", 2);
r8_slave_test!(issue_1952_r8_guyan_3d, "guyan", 3);
r8_slave_test!(issue_1952_r8_staged_2d, "staged", 2);
r8_slave_test!(issue_1952_r8_staged_3d, "staged", 3);
r8_slave_test!(issue_1952_r8_time_2d, "time", 2);
r8_slave_test!(issue_1952_r8_time_3d, "time", 3);
r8_slave_test!(issue_1952_r8_linear_2d, "linear", 2);
r8_slave_test!(issue_1952_r8_linear_3d, "linear", 3);
r8_slave_test!(issue_1952_r8_arc, "arc", 2);
r8_slave_test!(issue_1952_r8_displacement, "displacement", 2);

r8_slave_test!(
    issue_1952_r8_continued_corotational,
    "continued_corotational",
    2
);
r8_slave_test!(issue_1952_r8_continued_arc, "continued_arc", 2);

fn loaded_chord_tip_equilibrium(dim: usize, kind: &str) {
    let mut m = model(dim, false);
    m["materials"]["1"]["e"] = json!(200.0);
    m["loads"] = if dim == 2 {
        json!([{"type":"distributed","data":{"elementId":1,"qI":-2.0,"qJ":-2.0}}])
    } else {
        json!([{"type":"distributed","data":{"elementId":1,"qYI":0.0,"qYJ":0.0,"qZI":-2.0,"qZJ":-2.0}}])
    };
    let (r, factor) = if kind == "continued_corotational" || kind == "continued_arc" {
        let solver: SolverInput = serde_json::from_value(m.clone()).unwrap();
        let base = corotational::solve_corotational_2d(&solver, 40, 1e-9, 2, false).unwrap();
        assert!(base.converged);
        let start = corotational::CorotationalStart2D {
            input: &solver,
            displacements: &base.results.displacements,
        };
        if kind == "continued_corotational" {
            let result =
                corotational::solve_corotational_2d_from(&solver, Some(&start), 40, 1e-9, 2, false)
                    .unwrap();
            assert!(result.converged);
            (serde_json::to_value(result.results).unwrap(), 1.0)
        } else {
            let input = serde_json::from_value(json!({"solver":m,"maxSteps":3,"maxIter":40,"tolerance":1e-9,"initialDs":0.1,"minDs":1e-8,"maxDs":0.1,"targetIter":5})).unwrap();
            let result = arc_length::solve_arc_length_from(&input, Some(&start)).unwrap();
            assert!(result.converged);
            (
                serde_json::to_value(result.results).unwrap(),
                1.0 + result.final_load_factor,
            )
        }
    } else if kind == "displacement" {
        let i = serde_json::from_value(json!({"solver":m,"controlNode":1,"controlDof":1,"targetDisplacement":-1.0,"nSteps":10,"maxIter":40,"tolerance":1e-9})).unwrap();
        let result = arc_length::solve_displacement_control(&i).unwrap();
        assert!(result.converged);
        (
            serde_json::to_value(result.results).unwrap(),
            result.final_load_factor,
        )
    } else {
        run(kind, dim, &m)
    };
    assert!(factor.is_finite() && factor > 0.0);
    let forces = r["elementForces"].as_array().unwrap();
    assert_eq!(forces.len(), 1);
    let f = &forces[0];
    let d = r["displacements"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["nodeId"] == 1)
        .unwrap();
    let x = 3.0 + d["ux"].as_f64().unwrap();
    let z = d["uz"].as_f64().unwrap();
    let length = x.hypot(z);
    assert!(z.abs() > 1e-4, "{kind} must rotate the loaded chord");
    assert!((f["length"].as_f64().unwrap() - length).abs() < 1e-9);
    let end_keys: &[&str] = if dim == 2 {
        &["nEnd", "vEnd", "mEnd"]
    } else {
        &["nEnd", "vyEnd", "vzEnd", "mxEnd", "myEnd", "mzEnd"]
    };
    for key in end_keys {
        assert!(
            f[key].as_f64().unwrap().abs() < 1e-6,
            "{kind} {dim}D free tip {key}: {f}"
        );
    }
    let reaction = r["reactions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["nodeId"] == 0)
        .unwrap();
    let (fx, fz) = if dim == 2 { ("rx", "rz") } else { ("fx", "fz") };
    let expected_n =
        -(x * reaction[fx].as_f64().unwrap() + z * reaction[fz].as_f64().unwrap()) / length;
    assert!(
        (f["nStart"].as_f64().unwrap() - expected_n).abs() < 1e-6,
        "{kind} {dim}D reaction reference: {f}"
    );
    let (v_start, v_end, m_start, m_end, sign) = if dim == 2 {
        ("vStart", "vEnd", "mStart", "mEnd", 1.0)
    } else {
        ("vzStart", "vzEnd", "myStart", "myEnd", -1.0)
    };
    let value = |key: &str| f[key].as_f64().unwrap();
    let expected_v =
        (-z * reaction[fx].as_f64().unwrap() + x * reaction[fz].as_f64().unwrap()) / length;
    assert!((value(v_start) - expected_v).abs() < 1e-6);
    assert!((value(m_start) - reaction["my"].as_f64().unwrap()).abs() < 1e-6);
    let q = -2.0 * factor;
    let transverse = q * 3.0 * x / length;
    assert!((value(v_end) - value(v_start) - transverse).abs() < 1e-6);
    assert!(
        (sign * (value(m_end) - value(m_start))
            + value(v_start) * length
            + transverse * length / 2.0)
            .abs()
            < 1e-6
    );
    assert!(
        (f["nEnd"].as_f64().unwrap() - f["nStart"].as_f64().unwrap() + q * 3.0 * z / length).abs()
            < 1e-6
    );
}

#[test]
fn issue_1952_r9_loaded_chord_native_2d() {
    for kind in ["corotational", "continued_corotational"] {
        loaded_chord_tip_equilibrium(2, kind);
    }
}

#[test]
fn issue_1952_r9_loaded_chord_arc() {
    for kind in ["arc", "continued_arc"] {
        loaded_chord_tip_equilibrium(2, kind);
    }
}

#[test]
fn issue_1952_r9_loaded_chord_displacement() {
    loaded_chord_tip_equilibrium(2, "displacement");
}

#[test]
fn issue_1952_r9_loaded_chord_native_3d() {
    loaded_chord_tip_equilibrium(3, "corotational");
}

fn r11_cases() -> Vec<Value> {
    serde_json::from_str(include_str!("../../../fixtures/reaction-recovery-r11.json")).unwrap()
}

fn r11_pad(m: &mut Value, dim: usize, count: usize) {
    let template = m["elements"]["1"].clone();
    for i in 0..count {
        let id = 100 + i;
        m["nodes"][id.to_string()] = json!({"id":id,"x":4.0+i as f64,"z":0.0});
        if dim == 3 { m["nodes"][id.to_string()]["y"] = json!(0.0); }
        m["elements"][id.to_string()] = template.clone();
        let e = &mut m["elements"][id.to_string()];
        e["id"] = json!(id);
        e["nodeI"] = json!(if i == 0 {0} else {id-1});
        e["nodeJ"] = json!(id);
        e[if dim == 2 {"hingeEnd"} else {"releaseMyEnd"}] = json!(false);
        m["stages"][0]["elementsAdded"].as_array_mut().unwrap().push(json!(id));
    }
    assert_eq!(m["nodes"].as_object().unwrap().len(), count+2);
    assert!(dim == 2 || dim == 3);
}

fn r11_staged_history(dim: usize, removed: bool) {
    for case in r11_cases().into_iter().filter(|c| c["kind"] == "staged" && c["dim"] == dim && c["name"].as_str().unwrap().ends_with(if removed {"removed"} else {"added"})) {
        for padding in [0, 8, 9, 10, 19, 20, 21, 22] {
        for sign in [-1.0, -1e-12, 0.0, 1e-12, 1.0] {
        for motion_only in [false, true] {
            let mut m = case["model"].clone();
            r11_pad(&mut m, dim, padding);
            if m["loads"][0]["type"] == "distributed" {
                m["loads"][0]["data"][if dim == 2 {"qI"} else {"qZI"}] = json!(-10.0 * sign);
                m["loads"][0]["data"][if dim == 2 {"qJ"} else {"qZJ"}] = json!(-10.0 * sign);
            } else { m["loads"][0]["data"]["fz"] = json!(-10.0 * sign); }
            let supports = m["supports"].as_object().unwrap().len();
            if motion_only {
                m["loads"] = json!([]);
                for stage in m["stages"].as_array_mut().unwrap() { stage["loadIndices"] = json!([]); }
                m["supports"]["0"]["dx"] = json!(0.0013 * sign);
            }
            let output = if dim == 2 {
                json!(staged::solve_staged_2d(&serde_json::from_value(m).unwrap()).unwrap())
            } else {
                json!(staged::solve_staged_3d(&serde_json::from_value(m).unwrap()).unwrap())
            };
            let unavailable = (case["unavailable"] == true || motion_only) && sign != 0.0;
            for r in [&output["stages"][1]["results"], &output["stages"][2]["results"], &output["finalResults"]] {
                let diagnostics = r["structuredDiagnostics"].as_array().map(Vec::as_slice).unwrap_or(&[]);
                if unavailable {
                    for phase in ["reactions", "elementForces", "constraintForces", "stageResults"] {
                        assert!(diagnostics.iter().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == phase && d["severity"] == "warning"), "{}: {phase}: {r}", case["name"]);
                    }
                    assert!(r["reactions"].as_array().unwrap().is_empty());
                    assert!(r["elementForces"].as_array().unwrap().is_empty());
                    assert!(r["constraintForces"].as_array().map_or(true, Vec::is_empty));
                } else {
                    assert!(!diagnostics.iter().any(|d| d["code"] == "result_quantity_unavailable"), "{r}");
                    assert_eq!(r["reactions"].as_array().unwrap().len(), supports);
                    assert_eq!(r["elementForces"].as_array().unwrap().len(), padding + if removed {1} else {2});
                    let reaction = r["reactions"][0][if dim == 2 {"rz"} else {"fz"}].as_f64().unwrap();
                    assert!((reaction - if motion_only {0.0} else {10.0 * sign}).abs() < 1e-9, "{r}");
                }
            }
            assert_eq!(output["stages"][0]["results"]["reactions"].as_array().unwrap().len(), supports);
        }
        }
        }
    }
}

macro_rules! r11_staged_test {
    ($name:ident, $dim:expr, $removed:expr) => {
        #[test]
        fn $name() { r11_staged_history($dim, $removed); }
    };
}
r11_staged_test!(issue_1952_r11_added_history_2d, 2, false);
r11_staged_test!(issue_1952_r11_added_history_3d, 3, false);
r11_staged_test!(issue_1996_r11_removed_history_2d, 2, true);
r11_staged_test!(issue_1996_r11_removed_history_3d, 3, true);

fn r11_pdelta_physical_residual(dim: usize) {
    let case = r11_cases().into_iter().find(|c| c["kind"] == "pdelta" && c["dim"] == dim).unwrap();
    for released in [false, true] {
        for sign in [-1.0, 0.0, 1.0] {
            let mut m = case["model"].clone();
            for e in m["elements"].as_object_mut().unwrap().values_mut() { e[if dim == 2 {"hingeEnd"} else {"releaseMyEnd"}] = json!(released); }
            for l in m["loads"].as_array_mut().unwrap() { l["data"]["my"] = json!(l["data"]["my"].as_f64().unwrap() * sign); }
            if released && sign != 0.0 {
                let linear_error = if dim == 2 { linear::solve_2d(&serde_json::from_value(m.clone()).unwrap()).unwrap_err() }
                    else { linear::solve_3d(&serde_json::from_value(m.clone()).unwrap()).unwrap_err() };
                assert!(linear_error.contains("Nodal moment"), "{linear_error}");
                let error = if dim == 2 { pdelta::solve_pdelta_2d(&serde_json::from_value(m).unwrap(), 40, 1e-9).unwrap_err() }
                    else { pdelta::solve_pdelta_3d(&serde_json::from_value(m).unwrap(), 40, 1e-9).unwrap_err() };
                assert!(error.contains("Nodal moment"), "{error}");
                continue;
            }
            let (r, _) = run("pdelta", dim, &m);
            assert_eq!(r["equilibrium"]["residualOk"], true, "{r}");
            assert_eq!(r["equilibrium"]["equilibriumOk"], true, "opposite couples have zero net wrench: {r}");
            let warned = r["structuredDiagnostics"].as_array().map_or(false, |d| d.iter().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == "reactions"));
            assert!(!warned, "{r}");
            {
                assert_eq!(r["elementForces"].as_array().unwrap().len(), 2);
                for f in r["elementForces"].as_array().unwrap() {
                    assert!((f[if dim == 2 {"mStart"} else {"myStart"}].as_f64().unwrap().abs() - 2.0 * sign.abs()).abs() < 1e-9);
                }
                let (control, _) = run("linear", dim, &m);
                assert_eq!(control["elementForces"].as_array().unwrap().len(), 2);
            }
        }
    }
}

#[test]
fn issue_1952_r11_pdelta_physical_residual_2d() { r11_pdelta_physical_residual(2); }
#[test]
fn issue_1952_r11_pdelta_physical_residual_3d() { r11_pdelta_physical_residual(3); }

fn r12_spring_answer(r: &Value, m: &Value, dim: usize, spring: f64, displacement: f64, load: f64) {
    let length = m["nodes"]["1"]["x"].as_f64().unwrap();
    let e = m["materials"]["1"]["e"].as_f64().unwrap();
    let inertia = m["sections"]["1"][if dim == 2 {"iz"} else {"iy"}].as_f64().unwrap();
    let beam = 2.0 * 3.0 * e * 1000.0 * inertia / length.powi(3);
    let tol = 1e-9 * load.abs().max(1e-12);
    let root = r["reactions"].as_array().unwrap().iter().find(|v| v["nodeId"] == 0).unwrap();
    let root_force = root[if dim == 2 {"rz"} else {"fz"}].as_f64().unwrap();
    assert!((root_force + beam * displacement).abs() < tol, "hand beam reaction: expected {} got {root_force}: {r}", -beam * displacement);
    let total: f64 = r["reactions"].as_array().unwrap().iter().map(|v| v[if dim == 2 {"rz"} else {"fz"}].as_f64().unwrap()).sum();
    assert!((total + load).abs() < tol, "hand total reaction: expected {} got {total}: {r}", -load);
    let force = &r["elementForces"][0];
    assert!((force[if dim == 2 {"vStart"} else {"vzStart"}].as_f64().unwrap().abs() - (beam * displacement / 2.0).abs()).abs() < tol, "hand member shear: {r}");
    assert!((force[if dim == 2 {"mStart"} else {"myStart"}].as_f64().unwrap().abs() - (beam * displacement * length / 2.0).abs()).abs() < tol * length, "hand member moment: {r}");
    assert!((total - root_force + spring).abs() < tol, "hand spring reaction: {r}");
    assert!((beam * displacement + spring - load).abs() < tol);
}

fn r12_spring_history(dim: usize, change: &str) {
    let cases: Vec<Value> = serde_json::from_str(include_str!("../../../fixtures/staged-springs-r12.json")).unwrap();
    let case = cases.into_iter().find(|c| c["dim"] == dim && c["change"] == change).unwrap();
    for spring_scale in [0.0, 1e-12, 1.0] {
    for padding in [0, 8, 9, 10, 19, 20, 21, 22] {
    for scale in [-1.0, -1e-12, 0.0, 1e-12, 1.0] {
    for load_before_change in [true, false] {
        let mut m = case["model"].clone();
        let slave = m["nodes"]["2"].clone();
        m["nodes"].as_object_mut().unwrap().remove("2");
        r11_pad(&mut m, dim, padding);
        m["nodes"]["2"] = slave;
        for id in ["1", "2"] {
            let key = if dim == 2 {"ky"} else {"kz"};
            m["supports"][id][key] = json!(m["supports"][id][key].as_f64().unwrap() * spring_scale);
        }
        let load = m["loads"][0]["data"]["fz"].as_f64().unwrap() * scale;
        m["loads"][0]["data"]["fz"] = json!(load);
        if !load_before_change {
            m["stages"][0]["loadIndices"] = json!([]);
            m["stages"][1]["loadIndices"] = json!([0]);
        }
        let output = if dim == 2 {
            json!(staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap()).unwrap())
        } else {
            json!(staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap()).unwrap())
        };
        let length = m["nodes"]["1"]["x"].as_f64().unwrap();
        let beam = 2.0 * 3.0 * 1000.0 * m["materials"]["1"]["e"].as_f64().unwrap() * m["sections"]["1"][if dim == 2 {"iz"} else {"iy"}].as_f64().unwrap() / length.powi(3);
        let weak = m["supports"]["1"][if dim == 2 {"ky"} else {"kz"}].as_f64().unwrap();
        let strong = m["supports"]["2"][if dim == 2 {"ky"} else {"kz"}].as_f64().unwrap();
        let before = if change == "added" {0.0} else {weak};
        let after = match change {"removed" => 0.0, "changed" => strong, _ => weak};
        let first_load = if load_before_change {load} else {0.0};
        r12_spring_answer(&output["stages"][0]["results"], &m, dim, before * first_load / (beam + before), first_load / (beam + before), first_load);
        let unavailable = change != "unchanged" && spring_scale != 0.0 && load_before_change && load != 0.0;
        let displacement = if !load_before_change {load / (beam + after)} else {
            match change {
                "added" => load / beam,
                "removed" => load / beam,
                "changed" => load / (beam + before) + before * load / ((beam + before) * (beam + after)),
                _ => load / (beam + after),
            }
        };
        for r in [&output["stages"][1]["results"], &output["stages"][2]["results"], &output["finalResults"]] {
            let diagnostics = r["structuredDiagnostics"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            if !r["reactions"].as_array().unwrap().is_empty() {
                r12_spring_answer(r, &m, dim, load - beam * displacement, displacement, load);
            }
            if unavailable {
                for phase in ["stageResults", "reactions", "elementForces", "constraintForces"] {
                    assert!(diagnostics.iter().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == phase && d["severity"] == "warning"), "{dim}D {change}: {phase}: {r}");
                }
                for field in ["reactions", "elementForces", "constraintForces", "plateStresses", "quadStresses", "quadNodalStresses"] {
                    assert!(r[field].as_array().map_or(true, Vec::is_empty), "{field}: {r}");
                }
            } else {
                assert!(!diagnostics.iter().any(|d| d["code"] == "result_quantity_unavailable"), "{r}");
                assert!(!r["reactions"].as_array().unwrap().is_empty());
                assert_eq!(r["elementForces"].as_array().unwrap().len(), padding + 2);
            }
        }
    }
    }
    }
    }
}

macro_rules! r12_spring_test {
    ($name:ident, $dim:expr, $change:expr) => {
        #[test]
        fn $name() { r12_spring_history($dim, $change); }
    };
}
r12_spring_test!(issue_1952_r12_spring_added_2d, 2, "added");
r12_spring_test!(issue_1952_r12_spring_added_3d, 3, "added");
r12_spring_test!(issue_1952_r12_spring_removed_2d, 2, "removed");
r12_spring_test!(issue_1952_r12_spring_removed_3d, 3, "removed");
r12_spring_test!(issue_1952_r12_spring_changed_2d, 2, "changed");
r12_spring_test!(issue_1952_r12_spring_changed_3d, 3, "changed");

#[test]
fn issue_1952_r12_springs_unchanged_2d() { r12_spring_history(2, "unchanged"); }
#[test]
fn issue_1952_r12_springs_unchanged_3d() { r12_spring_history(3, "unchanged"); }

fn r14_staged_physical(dim: usize) {
    let fixtures: Value =
        serde_json::from_str(include_str!("../../../fixtures/staged-physical-r14.json")).unwrap();
    let mut replay = Vec::new();
    for independent in [if dim == 2 { 2 } else { 5 }, 63, 64, 65] {
        for motion in [-0.0013, 0.0, 0.0013] {
            for mpc in [false, true] {
                let mut m = fixtures[dim.to_string()].clone();
                m["supports"]["2"]["dry"] = json!(motion);
                let rotation = if dim == 2 { 2 } else { 4 };
                if mpc {
                    m["constraints"] = json!([{"type":"linearMPC","terms":[{"nodeId":1,"dof":rotation,"coefficient":1.0},{"nodeId":2,"dof":rotation,"coefficient":-1.0}]}]);
                }
                let base = if dim == 2 { 2 } else { 5 };
                for i in 0..independent - base {
                    let id = 100 + i;
                    m["nodes"][id.to_string()] = if dim == 2 {
                        json!({"id":id,"x":4.0+i as f64,"z":0.0})
                    } else {
                        json!({"id":id,"x":4.0+i as f64,"y":0.0,"z":0.0})
                    };
                    let mut element = m["elements"]["1"].clone();
                    element["id"] = json!(id);
                    element["nodeJ"] = json!(id);
                    element[if dim == 2 { "hingeEnd" } else { "releaseMyEnd" }] = json!(false);
                    m["elements"][id.to_string()] = element;
                    m["supports"][id.to_string()] = if dim == 2 {
                        json!({"id":id,"nodeId":id,"type":"guidedX"})
                    } else {
                        json!({"nodeId":id,"rx":false,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true})
                    };
                    m["stages"][0]["elementsAdded"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!(id));
                    m["stages"][0]["supportsAdded"]
                        .as_array_mut()
                        .unwrap()
                        .push(json!(id));
                }
                let result = if dim == 2 {
                    let dof = dedaliano_engine::solver::dof::DofNumbering::build_2d(
                        &serde_json::from_value(m.clone()).unwrap(),
                    );
                    let cs = dedaliano_engine::solver::constraints::FreeConstraintSystem::build_2d(
                        &serde_json::from_value(m.clone()).unwrap(),
                        &dof,
                    )
                    .unwrap()
                    .unwrap();
                    assert_eq!(cs.n_free_indep, independent);
                    json!(
                        staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap())
                            .unwrap()
                    )
                } else {
                    let dof = dedaliano_engine::solver::dof::DofNumbering::build_3d(
                        &serde_json::from_value(m.clone()).unwrap(),
                    );
                    let cs = dedaliano_engine::solver::constraints::FreeConstraintSystem::build_3d(
                        &serde_json::from_value(m.clone()).unwrap(),
                        &dof,
                    )
                    .unwrap()
                    .unwrap();
                    assert_eq!(cs.n_free_indep, independent);
                    json!(
                        staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap())
                            .unwrap()
                    )
                };
                let load = num(&m["loads"][0]["data"], "fz");
                let length = num(&m["nodes"]["1"], "x");
                let ei = num(&m["materials"]["1"], "e")
                    * 1000.0
                    * num(&m["sections"]["1"], if dim == 2 { "iz" } else { "iy" });
                for r in result["stages"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|s| &s["results"])
                    .chain([&result["finalResults"]])
                {
                    assert!(r["elementForces"].as_array().unwrap().len() > 0);
                    assert!(!r["structuredDiagnostics"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|d| d["code"] == "result_quantity_unavailable"));
                    let root = r["reactions"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|r| r["nodeId"] == 0)
                        .unwrap();
                    assert!(
                        (num(root, if dim == 2 { "rz" } else { "fz" }) + load).abs() < 1e-9,
                        "{dim}D ns={independent}: {root}"
                    );
                    let expected = if dim == 2 {
                        -load * length
                    } else {
                        load * length
                    };
                    assert!(
                        (num(root, "my") - expected).abs() < 1e-9,
                        "{dim}D ns={independent}: {root}"
                    );
                    let master = r["reactions"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|r| r["nodeId"] == 2)
                        .unwrap();
                    for (key, value) in master.as_object().unwrap() {
                        if key != "nodeId" {
                            assert_eq!(
                                value.as_f64().unwrap(),
                                0.0,
                                "{dim}D ns={independent}: {master}"
                            );
                        }
                    }
                    for cf in r["constraintForces"].as_array().into_iter().flatten() {
                        assert_eq!(num(cf, "force"), 0.0, "{dim}D ns={independent}: {cf}");
                    }
                    let tip = r["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|d| d["nodeId"] == 1)
                        .unwrap();
                    assert!(
                        (num(tip, "uz") - load * length.powi(3) / (3.0 * ei)).abs() < 1e-9,
                        "{tip}"
                    );
                    let master_displacement = r["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|d| d["nodeId"] == 2)
                        .unwrap();
                    assert_eq!(num(master_displacement, "ry"), motion);
                }
                replay.push(json!({"dim":dim,"independent":independent,"motion":motion,"mpc":mpc,"model":m,"output":result}));
            }
        }
    }
    if let Ok(prefix) = std::env::var("STABILEO_R14_CASES") {
        std::fs::write(
            format!("{prefix}-{dim}.json"),
            serde_json::to_vec(&replay).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn issue_1952_r14_staged_physical_2d() {
    r14_staged_physical(2);
}

#[test]
fn issue_1952_r14_staged_physical_3d() {
    r14_staged_physical(3);
}

fn r17_public(dim: usize, kind: &str) {
    let mut replay = Vec::new();
    for sign in [-1.0, 0.0, 1.0] {
        for released in [false, true] {
          for empty_first in if kind == "staged" { vec![false, true] } else { vec![false] } {
            let mut m = model(dim, false);
            m["elements"]["1"][if dim == 2 {"hingeEnd"} else {"releaseMyEnd"}] = json!(released);
            m["loads"][0]["data"]["my"] = json!(sign * 2.0);
            if kind == "pdelta" { m["loads"][0]["data"]["fx"] = json!(sign * 3.0); }
            if kind == "staged" {
                m["stages"] = json!([{"name":"first stage","elementsAdded":[1],"supportsAdded":[0],"loadIndices":[0]}]);
            }
            if empty_first {
                m["constraints"] = json!([{"type":"equalDOF","masterNode":0,"slaveNode":1,"dofs":(0..if dim == 2 {3} else {6}).collect::<Vec<_>>()}]);
                m["stages"] = json!([{"name":"no physical stiffness","supportsAdded":[0]},{"name":"member activated","elementsAdded":[1],"loadIndices":[0]}]);
            }
            let outcome = if dim == 2 {
                let input: SolverInput = serde_json::from_value(m.clone()).unwrap();
                if kind == "staged" {
                    staged::solve_staged_2d(&serde_json::from_value(m.clone()).unwrap()).map(|r| json!(r))
                } else {
                    pdelta::solve_pdelta_2d(&input,40,1e-9).map(|r| json!(r))
                }
            } else {
                let input: SolverInput3D = serde_json::from_value(m.clone()).unwrap();
                if kind == "staged" {
                    staged::solve_staged_3d(&serde_json::from_value(m.clone()).unwrap()).map(|r| json!(r))
                } else {
                    pdelta::solve_pdelta_3d(&input,40,1e-9).map(|r| json!(r))
                }
            };
            match &outcome {
                Err(error) => {
                    assert!(released && sign != 0.0, "{error}");
                    assert!(error.contains("Nodal moment") || error.contains("free rotation"), "{error}");
                }
                Ok(output) => {
                    let results: Vec<_> = if kind == "staged" {
                        output["stages"].as_array().unwrap().iter().map(|s| &s["results"]).chain([&output["finalResults"]]).collect()
                    } else { vec![&output["results"]] };
                    for r in results {
                        let diagnostics: Vec<_> = r["structuredDiagnostics"].as_array().into_iter().flatten().filter(|d| d["code"] == "result_quantity_unavailable").collect();
                        if released && sign != 0.0 { assert!(!diagnostics.is_empty(), "{r}"); }
                        for d in &diagnostics {
                            let fields: Vec<_> = if d["phase"] == "stageResults" {
                                vec!["reactions","elementForces","constraintForces","plateStresses","quadStresses","quadNodalStresses"]
                            } else { vec![d["phase"].as_str().unwrap()] };
                            for field in fields { assert!(r[field].as_array().is_none_or(Vec::is_empty), "{kind} {dim}D {field}: {r}"); }
                        }
                        if diagnostics.is_empty() {
                            assert!(!r["reactions"].as_array().unwrap().is_empty());
                            assert!(!r["elementForces"].as_array().unwrap().is_empty());
                        }
                    }
                }
            }
            replay.push(json!({"dim":dim,"kind":kind,"model":m,"output":outcome.as_ref().ok(),"error":outcome.as_ref().err()}));
          }
        }
    }
    if let Ok(prefix) = std::env::var("STABILEO_R17_CASES") {
        std::fs::write(format!("{prefix}-{kind}-{dim}.json"), serde_json::to_vec(&replay).unwrap()).unwrap();
    }
}

#[test]
fn issue_1952_r17_staged_2d() { r17_public(2,"staged"); }
#[test]
fn issue_1952_r17_staged_3d() { r17_public(3,"staged"); }
#[test]
fn issue_1952_r17_pdelta_2d() { r17_public(2,"pdelta"); }
#[test]
fn issue_1952_r17_pdelta_3d() { r17_public(3,"pdelta"); }

fn r18_dynamic_withholding(dim: usize) {
    let mut replay = Vec::new();
    for method in ["newmark", "hht"] {
        for sign in [-1.0, 0.0, 1.0] {
            let mut m = model(dim, false);
            m["loads"][0]["data"]["fz"] = json!(sign * 10.0);
            let o = json!({"solver":m,"densities":{"1":7850.0},"timeStep":0.01,"nSteps":3,"method":method,"alpha":if method == "hht" {Some(-0.1)} else {None}});
            let outputs = if dim == 2 {
                let input = serde_json::from_value(o.clone()).unwrap();
                vec![json!(dedaliano_engine::solver::time_integration::solve_time_history_2d(&input).unwrap()), json!(dedaliano_engine::solver::time_integration::solve_time_history_2d_traced(&input).unwrap().0)]
            } else {
                let input = serde_json::from_value(o.clone()).unwrap();
                vec![json!(dedaliano_engine::solver::time_integration::solve_time_history_3d(&input).unwrap()), json!(dedaliano_engine::solver::time_integration::solve_time_history_3d_traced(&input).unwrap().0)]
            };
            assert_eq!(outputs[0], outputs[1]);
            for r in &outputs {
                assert_eq!(r["timeSteps"].as_array().unwrap().len(), 4);
                assert_eq!(r["peakDisplacements"].as_array().unwrap().len(), 2);
                assert!(r["peakReactions"].as_array().unwrap().is_empty(), "{dim}D {method}: {r}");
                assert!(r["structuredDiagnostics"].as_array().unwrap().iter().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == "peakReactions"));
                assert!(r["nodeHistories"].as_array().unwrap().iter().all(|h| h["uz"].as_array().unwrap().iter().all(|v| v.as_f64().unwrap().is_finite())));
            }
            replay.push(json!({"model":o,"output":outputs[0]}));
        }
    }
    if let Ok(prefix) = std::env::var("STABILEO_R18_CASES") {
        std::fs::write(format!("{prefix}-time-{dim}.json"), serde_json::to_vec(&replay).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r18_dynamic_withholding_2d() { r18_dynamic_withholding(2); }

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r18_dynamic_withholding_3d() { r18_dynamic_withholding(3); }

fn r18_pdelta_withholding(dim: usize) {
    let mut replay = Vec::new();
    for tied in [false, true] {
        for sign in [-1.0, 0.0, 1.0] {
            let mut m = model(dim, tied);
            m["loads"][0]["data"]["fx"] = json!(sign * 3.0);
            for iterations in [0, 40] {
                let solve = |tolerance| if dim == 2 {
                    pdelta::solve_pdelta_2d(&serde_json::from_value(m.clone()).unwrap(), iterations, tolerance).map(|r| json!(r))
                } else {
                    pdelta::solve_pdelta_3d(&serde_json::from_value(m.clone()).unwrap(), iterations, tolerance).map(|r| json!(r))
                };
                let initial = solve(1e-9).unwrap();
                let relative = initial["results"]["equilibrium"]["relativeResidual"].as_f64().unwrap();
                for tolerance in if iterations == 0 && sign != 0.0 { vec![1e-9, relative / 2.0, relative * 2.0] } else { vec![1e-9] } {
                    let output = solve(tolerance).unwrap();
                    let r = &output["results"];
                    let failed = relative > tolerance;
                    println!("r18 public {dim}D tied={tied} sign={sign} iterations={iterations} tolerance={tolerance}: {}", r["equilibrium"]);
                    for (field, key) in [("reactions", if dim == 2 {"rz"} else {"fz"}), ("elementForces", "nStart"), ("constraintForces", "force")] {
                        let rows: Vec<_> = r[field].as_array().into_iter().flatten().collect();
                        if field != "constraintForces" || tied { assert!(!rows.is_empty(), "{field}: {r}"); }
                        for row in rows { assert_eq!(row[key].is_null(), failed, "{field}: {r}"); }
                        let warned = r["structuredDiagnostics"].as_array().into_iter().flatten().any(|d| d["code"] == "result_quantity_unavailable" && d["phase"] == field);
                        assert_eq!(warned, failed, "{field}: {r}");
                    }
                    if !failed {
                        let linear = run("linear", dim, &m).0;
                        assert!(!linear["reactions"].as_array().unwrap().is_empty());
                        assert!(r["reactions"].as_array().unwrap().iter().all(|r| r[if dim == 2 {"rz"} else {"fz"}].as_f64().unwrap().is_finite()));
                    }
                    replay.push(json!({"model":m,"iterations":iterations,"tolerance":tolerance,"output":output}));
                }
            }
        }
    }
    if let Ok(prefix) = std::env::var("STABILEO_R18_CASES") {
        std::fs::write(format!("{prefix}-pdelta-{dim}.json"), serde_json::to_vec(&replay).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r18_pdelta_withholding_2d() { r18_pdelta_withholding(2); }

#[test]
#[ignore = "known wrong result: #1952"]
fn issue_1952_r18_pdelta_withholding_3d() { r18_pdelta_withholding(3); }
