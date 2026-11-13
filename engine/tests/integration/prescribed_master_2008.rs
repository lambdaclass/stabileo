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
            let mut legacy_shape = result.as_ref().unwrap().clone();
            if matches!(path,"pdelta"|"corotational"|"arc") {
                let snapshot = legacy_shape.get_mut("results").unwrap();
                let summary = snapshot.as_object_mut().unwrap().remove("equilibrium");
                if let Some(summary) = summary {
                assert_eq!(summary["residualOk"],true);
                assert_eq!(summary["equilibriumOk"],true);
                assert!(summary["relativeResidual"].as_f64().unwrap() <= 1e-10);
                } else { assert_ne!(path,"pdelta"); }
            }
            if path == "arc" {
                let factor = legacy_shape["finalLoadFactor"].as_f64().unwrap();
                let reactions = legacy_shape["results"]["reactions"].as_array_mut().unwrap();
                assert_eq!(reactions.len(),case["model"]["supports"].as_object().unwrap().len());
                for (load_key,reaction_key) in [("fx","rx"),("fz","rz")] {
                    let applied: f64 = case["model"]["loads"].as_array().unwrap().iter().map(|l|l["data"][load_key].as_f64().unwrap()*factor).sum();
                    let support: f64 = reactions.iter().map(|r|r[reaction_key].as_f64().unwrap()).sum();
                    assert!((applied+support).abs() <= 1e-11);
                }
                reactions.clear();
                let forces = legacy_shape["results"]["elementForces"].as_array_mut().unwrap();
                assert!(forces.windows(2).all(|w| w[0]["elementId"].as_u64().unwrap() < w[1]["elementId"].as_u64().unwrap()));
                forces.sort_by_key(|f|f["elementId"].as_u64().unwrap().to_string());
            }
            assert_eq!(numeric_bits(&legacy_shape).to_string(),baseline[format!("{path}:{index}")].as_str().unwrap(),"zero motion bits {path}:{index}");
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
        }
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}

#[test]
fn cable_refuses_each_support_dof() {
    let mut failures = Vec::new();
    for dim in [2,3] {
        let fields: &[&str] = if dim == 2 { &["dx","dz","dry"] } else { &["dx","dy","dz","drx","dry","drz"] };
        for rotation in [false,true] {
            let mut model = cases().into_iter().find(|c| c["dim"] == dim && c["fillers"] == 1 && c["rotation"] == rotation).unwrap()["model"].clone();
            for support in model["supports"].as_object_mut().unwrap().values_mut() {
                for field in fields { support.as_object_mut().unwrap().remove(*field); }
            }
            model["elements"]["3"] = model["elements"]["2"].clone();
            model["elements"]["3"]["id"] = json!(3);
            model["elements"]["3"]["type"] = json!("cable");
            model["loads"][0]["data"]["fx"] = json!(1.0);
            for pretensioned in [false,true] {
                let run = |model: &Value| -> Result<Value,String> {
                    if dim == 2 {
                        let input: SolverInput = serde_json::from_value(model.clone()).unwrap();
                        let result = if pretensioned { solver::cable::solve_cable_2d_pretensioned(&input,&Default::default(),&Default::default(),50,1e-10)? }
                            else { solver::cable::solve_cable_2d(&input,&Default::default(),50,1e-10)? };
                        Ok(json!({"converged":result.converged,"results":result.results}))
                    } else {
                        let input: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
                        let result = if pretensioned { solver::cable::solve_cable_3d_pretensioned(&input,&Default::default(),&Default::default(),50,1e-10)? }
                            else { solver::cable::solve_cable_3d(&input,&Default::default(),50,1e-10)? };
                        Ok(json!({"converged":result.converged,"results":result.results}))
                    }
                };
                let absent = run(&model).unwrap();
                assert_eq!(absent["converged"],true);
                assert!(absent["results"]["displacements"].as_array().unwrap().iter().any(|d| d["ux"].as_f64().unwrap() != 0.0));
                for field in fields {
                    for motion in [-0.0013,-1e-16,-f64::from_bits(1),-0.0,0.0,f64::from_bits(1),1e-16,0.0013] {
                        let mut prescribed = model.clone();
                        prescribed["supports"]["2"][field] = json!(motion);
                        let result = run(&prescribed);
                        if motion == 0.0 { assert_eq!(result,Ok(absent.clone()),"{dim}D {field} zero={motion} rotation={rotation} pretensioned={pretensioned}"); }
                        else if !result.as_ref().is_err_and(|e| e.contains("prescribed support displacements")) {
                            failures.push(format!("cable {dim}D {field} motion={motion} rotation={rotation} pretensioned={pretensioned}: {result:?}"));
                        }
                    }
                }
            }
        }
    }
    assert!(failures.is_empty(),"{}",failures.join("\n"));
}

fn check_arc_corrector_steps(
    input: &solver::arc_length::ArcLengthInput,
    result: &solver::arc_length::ArcLengthResult,
    rotation: bool,
    motion: f64,
    start_motion: f64,
    start_loads: &[f64],
) {
    assert!(result.converged);
    assert_eq!(result.steps.len(), input.max_steps);
    assert!(result.final_load_factor > 0.0);
    if motion != 0.0 {
        assert!(result.steps.iter().all(|s| s.iterations >= 3));
        assert!((result.final_load_factor * motion).abs() > 0.1);
    }
    let numbering = solver::dof::DofNumbering::build_2d(&input.solver);
    let constraints = solver::constraints::FreeConstraintSystem::build_2d(&input.solver, &numbering).unwrap().unwrap();
    let applied = solver::assembly::assemble_2d(&input.solver, &numbering).f;
    let mut secant_stiffness = Vec::new();
    for step in &result.steps {
        assert!(step.converged);
        let slave = step.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let master = step.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let (slave_motion, master_motion) = if rotation { (slave.ry, master.ry) } else { (slave.uz, master.uz) };
        assert!((master_motion - start_motion - step.load_factor * motion).abs() <= 1e-11);
        assert!((slave_motion - master_motion).abs() <= 1e-11, "step {}: slave {slave_motion}, master {master_motion}", step.step);
        let mut u = vec![0.0; numbering.n_total];
        for d in &step.displacements {
            for (local, value) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                u[numbering.global_dof(d.node_id, local).unwrap()] = value;
            }
        }
        let mut internal = vec![0.0; numbering.n_total];
        let mut tangent = vec![0.0; numbering.n_total * numbering.n_total];
        solver::corotational::assemble_corotational_public(&input.solver, &numbering, &u, &mut internal, &mut tangent);
        if motion != 0.0 && !rotation {
            secant_stiffness.push(internal[numbering.global_dof(1, 1).unwrap()] / slave_motion);
        }
        let residual: Vec<_> = (0..numbering.n_free).map(|i| start_loads[i] + step.load_factor * applied[i] - internal[i]).collect();
        for r in constraints.reduce_vector(&residual) {
            assert!(r.abs() <= 1e-7, "step {}: free residual {r}", step.step);
        }
    }
    if !secant_stiffness.is_empty() {
        let first = secant_stiffness[0];
        let last = *secant_stiffness.last().unwrap();
        assert!((last / first - 1.0).abs() > 1e-3, "path must change stiffness: {secant_stiffness:?}");
    }
}

#[test]
fn arc_corrector_preserves_motion_and_free_equilibrium() {
    let mut replay = Vec::new();
    for fillers in [1, 21] {
        for kind in ["equalDOF", "linearMPC"] {
            for rotation in [false, true] {
                let case = cases().into_iter().find(|c| c["dim"] == 2 && c["fillers"] == fillers && c["kind"] == kind && c["rotation"] == rotation && c["motion"] != 0.0).unwrap();
                for motion in [-1.0, 0.0, 1.0] {
                    let mut model = case["model"].clone();
                    model["supports"]["2"][if rotation { "dry" } else { "dz" }] = json!(motion);
                    model["loads"][0]["data"]["fx"] = json!(0.0);
                    model["loads"][0]["data"]["fz"] = json!(-1.0);
                    let input: solver::arc_length::ArcLengthInput = serde_json::from_value(json!({"solver":model,"maxSteps":4,"maxIter":50,"tolerance":1e-10,"initialDs":0.3,"minDs":1e-8,"maxDs":0.3})).unwrap();
                    let numbering = solver::dof::DofNumbering::build_2d(&input.solver);
                    let constraints = solver::constraints::FreeConstraintSystem::build_2d(&input.solver, &numbering).unwrap().unwrap();
                    assert_eq!(constraints.n_free_indep >= solver::linear::SPARSE_THRESHOLD, fillers == 21);
                    let result = solver::arc_length::solve_arc_length(&input).unwrap();
                    check_arc_corrector_steps(&input, &result, rotation, motion, 0.0, &vec![0.0; numbering.n_total]);
                    let snapshots: Vec<_> = result.steps.iter().map(|s| json!({"loadFactor":s.load_factor,"displacements":s.displacements})).collect();
                    replay.push(json!({"input":input,"rotation":rotation,"motion":motion,"snapshots":snapshots}));
                    let mut initial = input.solver.clone();
                    let start_motion = 0.1 * motion;
                    let support = initial.supports.get_mut("2").unwrap();
                    if rotation { support.dry = Some(start_motion); } else { support.dz = Some(start_motion); }
                    let solved = solver::corotational::solve_corotational_2d(&initial,50,1e-10,3,false).unwrap();
                    assert!(solved.converged);
                    let start = solver::corotational::CorotationalStart2D { input:&initial, displacements:&solved.results.displacements };
                    let result = solver::arc_length::solve_arc_length_from(&input,Some(&start)).unwrap();
                    let start_loads = solver::assembly::assemble_2d(&initial, &numbering).f;
                    check_arc_corrector_steps(&input, &result, rotation, motion, start_motion, &start_loads);
                    eprintln!("fillers={fillers} {kind} rotation={rotation} motion={motion}: continued iterations={:?}", result.steps.iter().map(|s| s.iterations).collect::<Vec<_>>());
                }
            }
        }
    }
    if let Ok(path) = std::env::var("ARC_CORRECTOR_2009_CASES") {
        std::fs::write(path,serde_json::to_string(&replay).unwrap()).unwrap();
    }
}
