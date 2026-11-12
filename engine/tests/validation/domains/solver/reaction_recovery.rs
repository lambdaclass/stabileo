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
    assert!(factor.is_finite() && factor > 0.0);
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
    if kind == "pdelta"
        && (r["equilibrium"]["equilibriumOk"] == false || r["equilibrium"]["residualOk"] == false)
    {
        assert!(r["structuredDiagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == "result_quantity_unavailable"
                && d["phase"] == "reactions"
                && d["severity"] == "warning"));
        return;
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
        assert_equilibrium("staged", dim, &m, r, 1.0);
        assert!(!r["structuredDiagnostics"].as_array().is_some_and(|ds| ds
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
