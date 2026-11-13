use dedaliano_engine::{solver, types::*};
use serde_json::{json, Value};

fn numeric_bits(value: &Value) -> u64 {
    fn walk(value: &Value, hash: &mut u64) {
        match value {
            Value::Number(n) => for byte in n.as_f64().unwrap().to_bits().to_le_bytes() { *hash = (*hash ^ u64::from(byte)).wrapping_mul(1099511628211); },
            Value::Array(a) => for v in a { walk(v,hash); },
            Value::Object(o) => for (_,v) in o { walk(v,hash); },
            _ => (),
        }
    }
    let mut hash = 14695981039346656037;
    walk(value,&mut hash);
    hash
}

fn cases() -> Vec<Value> {
    serde_json::from_str(include_str!("../fixtures/prescribed-master-2008.json")).unwrap()
}

fn run(case: &Value, path: &str) -> Result<Value, String> {
    let model = case["model"].clone();
    let wrapper = json!({"solver":model,"foundationSprings":[],"materialModels":{},"sectionCapacities":{},"nIncrements":3,"tolerance":1e-10,"maxIter":50,"maxSteps":3,"initialDs":0.001,"minDs":1e-8,"maxDs":0.001});
    let value = if case["dim"] == 2 {
        let input: SolverInput = serde_json::from_value(model.clone()).unwrap();
        match path {
            "linear" => serde_json::to_value(solver::linear::solve_2d(&input)?),
            "staged" => serde_json::to_value(solver::staged::solve_staged_2d(&serde_json::from_value(model).unwrap())?),
            "winkler" => serde_json::to_value(solver::winkler::solve_winkler_2d(&serde_json::from_value(wrapper).unwrap())?),
            "contact" => serde_json::to_value(solver::contact::solve_contact_2d(&serde_json::from_value(wrapper).unwrap())?),
            "material" => serde_json::to_value(solver::material_nonlinear::solve_nonlinear_material_2d(&serde_json::from_value(wrapper).unwrap())?),
            "corotational" => serde_json::to_value(solver::corotational::solve_corotational_2d(&input,50,1e-10,3,false)?),
            "arc" => serde_json::to_value(solver::arc_length::solve_arc_length(&serde_json::from_value(wrapper).unwrap())?),
            "corotational_from" | "arc_from" => {
                let mut initial = input.clone();
                initial.loads.clear();
                for support in initial.supports.values_mut() { support.dx = None; support.dz = None; support.dry = None; }
                let displacements: Vec<Displacement> = initial.nodes.values().map(|n| Displacement { node_id:n.id, ux:0.0, uz:0.0, ry:0.0 }).collect();
                let start = solver::corotational::CorotationalStart2D { input:&initial, displacements:&displacements };
                if path == "corotational_from" {
                    serde_json::to_value(solver::corotational::solve_corotational_2d_from(&input,Some(&start),50,1e-10,3,false)?)
                } else {
                    serde_json::to_value(solver::arc_length::solve_arc_length_from(&serde_json::from_value(wrapper).unwrap(),Some(&start))?)
                }
            },
            "pdelta" => serde_json::to_value(solver::pdelta::solve_pdelta_2d(&input,50,1e-10)?),
            _ => unreachable!(),
        }
    } else {
        let input: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
        match path {
            "linear" => serde_json::to_value(solver::linear::solve_3d(&input)?),
            "staged" => serde_json::to_value(solver::staged::solve_staged_3d(&serde_json::from_value(model).unwrap())?),
            "winkler" => serde_json::to_value(solver::winkler::solve_winkler_3d(&serde_json::from_value(wrapper).unwrap())?),
            "contact" => serde_json::to_value(solver::contact::solve_contact_3d(&serde_json::from_value(wrapper).unwrap())?),
            "material" => serde_json::to_value(solver::material_nonlinear::solve_nonlinear_material_3d(&serde_json::from_value(wrapper).unwrap())?),
            "pdelta" => serde_json::to_value(solver::pdelta::solve_pdelta_3d(&input,50,1e-10)?),
            _ => unreachable!(),
        }
    };
    Ok(value.unwrap())
}

fn check(case: &Value, result: &Value, path: &str) -> Result<(), String> {
    if result.get("converged") == Some(&Value::Bool(false)) { return Err("unconverged".into()); }
    let motion = case["motion"].as_f64().unwrap();
    let mut snapshots = vec![result.get("results").or_else(|| result.get("finalResults")).unwrap_or(result)];
    if let Some(stages) = result["stages"].as_array() { snapshots.extend(stages.iter().map(|s| &s["results"])); }
    let factor = if path == "arc" { result["finalLoadFactor"].as_f64().unwrap() } else { 1.0 };
    if path == "arc" && motion != 0.0 && !(factor.is_finite() && factor > 0.0 && (factor*motion).abs() > 1000.0*1e-11) {
        return Err(format!("insufficient arc progress: load factor {factor}, motion {}",factor*motion));
    }
    for snapshot in snapshots {
        let slave = snapshot["displacements"].as_array().unwrap().iter().find(|d| d["nodeId"] == 1).unwrap();
        let key = if case["rotation"] == true { "ry" } else { "uz" };
        let expected = factor * motion;
        let actual = slave[key].as_f64().unwrap();
        if (actual-expected).abs() > 1e-11 { return Err(format!("{key}={actual}, expected {expected}")); }
        if matches!(path, "linear" | "staged" | "winkler" | "contact" | "material") && case["rotation"] == true && case["kind"] != "rigidLink" {
            let sign = if case["dim"] == 2 { 1.0 } else { -1.0 };
            let expected = sign * 3.0 / 2.0 * motion;
            let actual = slave["uz"].as_f64().unwrap();
            if (actual-expected).abs() > 1e-11 { return Err(format!("free uz={actual}, expected beam shear equilibrium uz=L*theta/2={expected}")); }
        }
        if case["rotation"] == true && case["kind"] == "rigidLink" {
            let sign = if case["dim"] == 2 { 1.0 } else { -1.0 };
            let expected = sign * 3.0 * motion * factor;
            let actual = slave["uz"].as_f64().unwrap();
            if (actual-expected).abs() > 1e-11 { return Err(format!("rigid uz={actual}, expected omega cross offset={expected}")); }
        }
    }
    Ok(())
}

fn matrix(path: &str, dim: i64, zero: bool) {
    let mut failures = Vec::new();
    let mut replay = Vec::new();
    for (index, case) in cases().iter().enumerate().filter(|(_,c)| c["dim"] == dim && (c["motion"] == 0.0) == zero) {
        let result = run(case,path);
        if matches!(path,"corotational" | "arc") {
            let from_path = format!("{path}_from");
            let continued = run(case,&from_path);
            if let Err(error) = continued.as_ref().map_err(Clone::clone).and_then(|r| check(case,r,path)) {
                failures.push(format!("case {index} {from_path}: {error}"));
            }
        }
        if zero {
            let baseline: Value = serde_json::from_str(include_str!("../fixtures/prescribed-master-2008-zero.json")).unwrap();
            assert_eq!(numeric_bits(result.as_ref().unwrap()).to_string(),baseline[format!("{path}:{index}")].as_str().unwrap(),"zero motion bits {path}:{index}");
        }
        let error = result.as_ref().map_err(Clone::clone).and_then(|r| check(case,r,path)).err();
        if let Some(error) = error { failures.push(format!("case {index} {path}: {error}")); }
        replay.push(json!({"index":index,"path":path,"result":result}));
    }
    if let Ok(dir) = std::env::var("REPLAY_2008") {
        std::fs::write(format!("{dir}/{path}-{dim}-{zero}.json"),serde_json::to_string_pretty(&replay).unwrap()).unwrap();
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}

macro_rules! regression {
    ($name:ident, $path:literal, $dim:literal) => {
        #[test]
        fn $name() { matrix($path,$dim,false); }
    };
}
regression!(staged_2d,"staged",2);
regression!(staged_3d,"staged",3);
regression!(winkler_2d,"winkler",2);
regression!(winkler_3d,"winkler",3);
regression!(contact_2d,"contact",2);
regression!(contact_3d,"contact",3);
regression!(material_2d,"material",2);
regression!(material_3d,"material",3);
regression!(corotational_2d,"corotational",2);
regression!(arc_2d,"arc",2);

#[test]
fn controls() {
    for dim in [2,3] {
        for path in ["linear","staged","winkler","contact","material","pdelta"] { matrix(path,dim,true); }
        matrix("linear",dim,false);
        matrix("pdelta",dim,false);
    }
    for path in ["corotational","arc"] { matrix(path,2,true); }
}

fn check_continuation(case: &Value, result: &Value) -> Result<(), String> {
    check(case,result,"corotational")?;
    let master = result["results"]["displacements"].as_array().unwrap().iter().find(|d| d["nodeId"] == 2).unwrap();
    let key = if case["rotation"] == true { "ry" } else { "uz" };
    let expected = case["motion"].as_f64().unwrap();
    let actual = master[key].as_f64().unwrap();
    if (actual-expected).abs() > 1e-11 { return Err(format!("master {key}={actual}, expected {expected}")); }
    Ok(())
}

#[test]
fn nonzero_corotational_continuation() {
    for case in cases().iter().filter(|c| c["dim"] == 2 && c["motion"] != 0.0) {
        let initial: SolverInput = serde_json::from_value(case["model"].clone()).unwrap();
        let solved = solver::corotational::solve_corotational_2d(&initial,50,1e-10,3,false).unwrap();
        assert!(solved.converged);
        check_continuation(case,&serde_json::to_value(&solved).unwrap()).unwrap();
        let start = solver::corotational::CorotationalStart2D { input:&initial, displacements:&solved.results.displacements };
        let motion = case["motion"].as_f64().unwrap();
        for target in [motion,2.0*motion,0.0,-motion] {
            let mut target_case = case.clone();
            target_case["motion"] = json!(target);
            target_case["model"]["supports"]["2"][if case["rotation"] == true { "dry" } else { "dz" }] = json!(target);
            let input: SolverInput = serde_json::from_value(target_case["model"].clone()).unwrap();
            for modified_nr in [false,true] {
                let result = solver::corotational::solve_corotational_2d_from(&input,Some(&start),50,1e-10,3,modified_nr).unwrap();
                assert!(result.converged);
                check_continuation(&target_case,&serde_json::to_value(result).unwrap())
                    .unwrap_or_else(|e| panic!("start {motion}, target {target}, modified NR {modified_nr}, case {case}: {e}"));
            }
        }
    }
}

#[test]
fn nonzero_arc_continuation() {
    for case in cases().iter().filter(|c| c["dim"] == 2 && c["motion"] != 0.0) {
        let initial: SolverInput = serde_json::from_value(case["model"].clone()).unwrap();
        let solved = solver::corotational::solve_corotational_2d(&initial,50,1e-10,3,false).unwrap();
        assert!(solved.converged);
        check_continuation(case,&serde_json::to_value(&solved).unwrap()).unwrap();
        let start = solver::corotational::CorotationalStart2D { input:&initial, displacements:&solved.results.displacements };
        let motion = case["motion"].as_f64().unwrap();
        for pattern in [motion,-motion] {
            let mut model = case["model"].clone();
            model["loads"] = json!([]);
            model["supports"]["2"][if case["rotation"] == true { "dry" } else { "dz" }] = json!(pattern);
            let input = serde_json::from_value(json!({"solver":model,"maxSteps":3,"maxIter":50,"tolerance":1e-10,"initialDs":4.0*motion.abs(),"minDs":1e-8,"maxDs":4.0*motion.abs()})).unwrap();
            let result = solver::arc_length::solve_arc_length_from(&input,Some(&start)).unwrap();
            assert!(result.converged);
            let change = result.final_load_factor * pattern;
            assert!(result.final_load_factor > 0.0 && change.abs() > 1000.0*1e-11,"no arc progress: {change}");
            let expected = motion + change;
            if pattern == -motion { assert!(expected*motion < 0.0,"arc did not reverse the initial motion"); }
            let mut expected_case = case.clone();
            expected_case["motion"] = json!(expected);
            check_continuation(&expected_case,&serde_json::to_value(result).unwrap())
                .unwrap_or_else(|e| panic!("start {motion}, pattern {pattern}, case {case}: {e}"));
        }
    }
}

#[test]
fn arc_rejects_zero_progress() {
    for case in cases().iter().filter(|c| c["dim"] == 2 && c["motion"] != 0.0) {
        let motion = case["motion"].as_f64().unwrap();
        for factor in [0.0,f64::MIN_POSITIVE,0.5*1000.0*1e-11/motion.abs(),-1.0] {
            let expected = motion*factor;
            let uz = if case["rotation"] == true {
                if case["kind"] == "rigidLink" { 3.0*expected } else { 0.0 }
            } else { expected };
            let result = json!({"converged":true,"finalLoadFactor":factor,"results":{"displacements":[{"nodeId":1,"uz":uz,"ry":if case["rotation"] == true { expected } else { 0.0 }}]}});
            assert!(check(case,&result,"arc").is_err(),"accepted insufficient progress {factor}: {case}");
        }
        let factor = 2.0*1000.0*1e-11/motion.abs();
        let mut boundary_case = case.clone();
        boundary_case["rotation"] = json!(false);
        let result = json!({"converged":true,"finalLoadFactor":factor,"results":{"displacements":[{"nodeId":1,"uz":motion*factor,"ry":0.0}]}});
        check(&boundary_case,&result,"arc").unwrap();
        boundary_case["motion"] = json!(0.0);
        let result = json!({"converged":true,"finalLoadFactor":0.0,"results":{"displacements":[{"nodeId":1,"uz":0.0,"ry":0.0}]}});
        check(&boundary_case,&result,"arc").unwrap();
    }
}

#[test]
fn unsupported_motion_is_refused() {
    let mut failures = Vec::new();
    for (dim,rotation) in [(2,false),(2,true),(3,false),(3,true)] {
        for motion in [-0.0013,-1e-16,f64::from_bits(1),0.0,1e-16,0.0013] {
            let mut case = cases().into_iter().find(|c| c["dim"] == dim && c["fillers"] == 1 && c["rotation"] == rotation).unwrap();
            case["model"]["supports"]["2"][if rotation { "dry" } else { "dz" }] = json!(motion);
            for method in ["newmark","hht"] {
                let wrapper = json!({"solver":case["model"],"densities":{"1":7850.0},"timeStep":0.001,"nSteps":2,"method":method,"alpha":if method == "hht" { Some(-0.1) } else { None }});
                for entry in ["solve","traced","certified"] {
                    let result = if dim == 2 {
                        let input = serde_json::from_value(wrapper.clone()).unwrap();
                        match entry {
                            "solve" => solver::time_integration::solve_time_history_2d(&input).map(|_| ()),
                            "traced" => solver::time_integration::solve_time_history_2d_traced(&input).map(|_| ()),
                            _ => dedaliano_engine::certify::dynamics::certify_time_history_2d(&input).map(|_| ()),
                        }
                    } else {
                        let input = serde_json::from_value(wrapper.clone()).unwrap();
                        match entry {
                            "solve" => solver::time_integration::solve_time_history_3d(&input).map(|_| ()),
                            "traced" => solver::time_integration::solve_time_history_3d_traced(&input).map(|_| ()),
                            _ => dedaliano_engine::certify::dynamics::certify_time_history_3d(&input).map(|_| ()),
                        }
                    };
                    if motion == 0.0 { assert!(result.is_ok(),"{result:?}"); }
                    else if !result.as_ref().is_err_and(|e| e.contains("prescribed support displacements")) { failures.push(format!("time history {entry} {method} {dim}D motion {motion}: {result:?}")); }
                }
            }
            case["model"]["elements"]["3"] = case["model"]["elements"]["2"].clone();
            case["model"]["elements"]["3"]["id"] = json!(3);
            case["model"]["elements"]["3"]["type"] = json!("cable");
            case["model"]["loads"][0]["data"]["fx"] = json!(1.0);
            for pretensioned in [false,true] {
                let result = if dim == 2 {
                    let input: SolverInput = serde_json::from_value(case["model"].clone()).unwrap();
                    if pretensioned { solver::cable::solve_cable_2d_pretensioned(&input,&Default::default(),&Default::default(),50,1e-10) }
                    else { solver::cable::solve_cable_2d(&input,&Default::default(),50,1e-10) }.map(|r| r.converged)
                } else {
                    let input: SolverInput3D = serde_json::from_value(case["model"].clone()).unwrap();
                    if pretensioned { solver::cable::solve_cable_3d_pretensioned(&input,&Default::default(),&Default::default(),50,1e-10) }
                    else { solver::cable::solve_cable_3d(&input,&Default::default(),50,1e-10) }.map(|r| r.converged)
                };
                if motion == 0.0 { assert_eq!(result,Ok(true)); }
                else if !result.as_ref().is_err_and(|e| e.contains("prescribed support displacements")) { failures.push(format!("cable {dim}D motion {motion}: {result:?}")); }
            }
        }
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}
