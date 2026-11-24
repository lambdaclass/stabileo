import pathlib,re
root=pathlib.Path('.')
already=(root/'engine/tests/audit_capture.rs').exists()
wrappers=[
('solve_2d','linear','input: &SolverInput','input','AnalysisResults'),
('solve_3d','linear','input: &SolverInput3D','input','AnalysisResults3D'),
('solve_modal_2d','modal','input: &SolverInput, densities: &std::collections::HashMap<String, f64>, num_modes: usize','input, densities, num_modes','ModalResult'),
('solve_modal_3d','modal','input: &SolverInput3D, densities: &std::collections::HashMap<String, f64>, num_modes: usize','input, densities, num_modes','ModalResult3D'),
('solve_buckling_2d','buckling','input: &SolverInput, num_modes: usize','input, num_modes','BucklingResult'),
('solve_buckling_3d','buckling','input: &SolverInput3D, num_modes: usize','input, num_modes','BucklingResult3D'),
('solve_pdelta_2d','pdelta','input: &SolverInput, max_iter: usize, tolerance: f64','input, max_iter, tolerance','PDeltaResult'),
('solve_pdelta_3d','pdelta','input: &SolverInput3D, max_iter: usize, tolerance: f64','input, max_iter, tolerance','PDeltaResult3D'),
('solve_corotational_2d','corotational','input: &SolverInput, max_iter: usize, tolerance: f64, n_increments: usize, modified_nr: bool','input, max_iter, tolerance, n_increments, modified_nr','CorotationalResult'),
('solve_corotational_3d','corotational','input: &SolverInput3D, max_iter: usize, tolerance: f64, n_increments: usize, modified_nr: bool','input, max_iter, tolerance, n_increments, modified_nr','CorotationalResult3D'),
('solve_arc_length','arc_length','input: &ArcLengthInput','input','ArcLengthResult')]
wrappers += [('solve_contact_2d', 'contact', 'input: &dedaliano_engine::solver::contact::ContactInput', 'input', 'dedaliano_engine::solver::contact::ContactResult'), ('solve_contact_3d', 'contact', 'input: &dedaliano_engine::solver::contact::ContactInput3D', 'input', 'dedaliano_engine::solver::contact::ContactResult3D'), ('solve_creep_shrinkage_2d', 'creep_shrinkage', 'input: &dedaliano_engine::solver::creep_shrinkage::CreepShrinkageInput', 'input', 'dedaliano_engine::solver::creep_shrinkage::CreepShrinkageResult'), ('solve_fiber_nonlinear_2d', 'fiber_nonlinear', 'input: &dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput', 'input', 'dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearResult'), ('solve_fiber_nonlinear_3d', 'fiber_nonlinear', 'input: &dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearInput3D', 'input', 'dedaliano_engine::solver::fiber_nonlinear::FiberNonlinearResult3D'), ('solve_nonlinear_material_2d', 'material_nonlinear', 'input: &dedaliano_engine::types::NonlinearMaterialInput', 'input', 'dedaliano_engine::types::NonlinearMaterialResult'), ('solve_moving_loads_2d', 'moving_loads', 'input: &dedaliano_engine::types::MovingLoadInput', 'input', 'dedaliano_engine::solver::moving_loads::MovingLoadEnvelope'), ('solve_plastic_2d', 'plastic', 'input: &dedaliano_engine::types::PlasticInput', 'input', 'dedaliano_engine::solver::plastic::PlasticResult'), ('solve_plastic_3d', 'plastic', 'input: &dedaliano_engine::types::PlasticInput3D', 'input', 'dedaliano_engine::solver::plastic::PlasticResult3D'), ('solve_spectral_3d', 'spectral', 'input: &dedaliano_engine::types::SpectralInput3D', 'input', 'dedaliano_engine::solver::spectral::SpectralResult3D'), ('solve_ssi_2d', 'ssi', 'input: &dedaliano_engine::solver::ssi::SSIInput', 'input', 'dedaliano_engine::solver::ssi::SSIResult'), ('solve_time_history_3d', 'time_integration', 'input: &dedaliano_engine::types::TimeHistoryInput3D', 'input', 'dedaliano_engine::types::TimeHistoryResult3D'), ('solve_winkler_2d', 'winkler', 'input: &dedaliano_engine::solver::winkler::WinklerInput', 'input', 'dedaliano_engine::types::AnalysisResults')]
wrappers += [('guyan_reduce_2d', 'reduction', 'input: &dedaliano_engine::solver::reduction::GuyanInput', 'input', 'dedaliano_engine::solver::reduction::GuyanResult'), ('craig_bampton_2d', 'reduction', 'input: &dedaliano_engine::solver::reduction::CraigBamptonInput', 'input', 'dedaliano_engine::solver::reduction::CraigBamptonResult')]
helper='use dedaliano_engine::solver::{modal::{ModalResult,ModalResult3D},buckling::{BucklingResult,BucklingResult3D},pdelta::{PDeltaResult,PDeltaResult3D},arc_length::{ArcLengthInput,ArcLengthResult}};\nuse dedaliano_engine::types::*;\nuse std::hash::{Hash, Hasher};\n'
helper+='''
fn record<T: serde::Serialize>(kind: &str, input: serde_json::Value, result: &Result<T, String>) {
    fn engineering_result(value: &mut serde_json::Value) {
        match value {
            serde_json::Value::Object(fields) => {
                fields.retain(|key, _| !["timings", "elapsedMs", "elapsed", "solveTimeMs", "solverRunMeta"].contains(&key.as_str()));
                for child in fields.values_mut() { engineering_result(child); }
            }
            serde_json::Value::Array(items) => { for child in items { engineering_result(child); } }
            _ => {}
        }
    }
    if let Ok(out) = std::env::var("AUDIT_NATIVE_OUT") {
        std::fs::create_dir_all(&out).unwrap();
        let text = serde_json::to_string(&input).unwrap();
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        text.hash(&mut hash);
        let path = format!("{out}/{kind}-{:016x}.json", hash.finish());
        static CAPTURE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = CAPTURE_LOCK.lock().unwrap();
        let result = serde_json::to_value(result).unwrap();
        let mut tests = std::collections::BTreeSet::new();
        if std::path::Path::new(&path).exists() {
            let previous: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(previous["analysis"], kind);
            assert_eq!(previous["input"], input);
            let mut before = previous["result"].clone();
            let mut after = result.clone();
            engineering_result(&mut before);
            engineering_result(&mut after);
            assert_eq!(before, after);
            if let Some(names) = previous["tests"].as_array() {
                tests.extend(names.iter().map(|name| name.as_str().unwrap().to_owned()));
            }
            if let Some(name) = previous["test"].as_str() { tests.insert(name.to_owned()); }
        }
        tests.insert(std::thread::current().name().unwrap().to_owned());
        let test = tests.first().unwrap();
        std::fs::write(path, serde_json::to_vec(&serde_json::json!({"analysis":kind,"test":test,"tests":tests,"input":input,"result":result})).unwrap()).unwrap();
    }
}
'''
for name,module,signature,args,result in wrappers:
 helper+=f'#[track_caller]\npub fn {name}({signature}) -> Result<{result}, String> {{\nlet result = dedaliano_engine::solver::{module}::{name}({args});\nrecord("{name}", serde_json::json!([{args}]), &result);\nresult\n}}\n'
helper+='\n#[test]\nfn audit_replay_fixed_corpus() {\nlet Ok(source)=std::env::var("AUDIT_FIXED_FROM") else {return};\nlet target=std::env::var("AUDIT_FIXED_TO").unwrap();\nstd::fs::create_dir_all(&target).unwrap();\nlet mut paths:Vec<_>=std::fs::read_dir(source).unwrap().map(|p|p.unwrap().path()).filter(|p|p.extension().is_some_and(|x|x=="json")).collect();\npaths.sort();\nfor path in paths {\nlet mut v:serde_json::Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();\nlet input=v["input"].as_array().unwrap();\nlet result=match v["analysis"].as_str().unwrap() {\n'
for name,module,signature,args,result in wrappers:
    names=args.split(', ')
    call=', '.join(('&' if param in ['input','densities'] else '')+'serde_json::from_value(input['+str(index)+'].clone()).unwrap()' for index,param in enumerate(names))
    helper+='"'+name+'"=>serde_json::to_value(dedaliano_engine::solver::'+module+'::'+name+'('+call+')).unwrap(),\n'
helper+='_=>panic!("unknown analysis"),\n};\nv["result"]=result;\nstd::fs::write(std::path::Path::new(&target).join(path.file_name().unwrap()),serde_json::to_vec(&v).unwrap()).unwrap();\n}\n}\n'
(root/'engine/tests/audit_capture.rs').write_text(helper)
files=[]
for folder in [p.parent.name for p in (root/'engine/tests').glob('*/main.rs')]:
 p=root/f'engine/tests/{folder}/main.rs'
 s=p.read_text()
 if 'mod audit_capture;' not in s: s+='\n#[path = "../audit_capture.rs"]\nmod audit_capture;\n'
 p.write_text(s)
 files.extend((root/f'engine/tests/{folder}').rglob('*.rs'))
for p in (root/'engine/tests').rglob('*.rs'):
 if p.name=='audit_capture.rs' or p.name=='main.rs': continue
 if '/common/' in str(p):continue
 s=p.read_text()
 for name,module,*_ in wrappers:
  s=re.sub(r'(?<!fn )(?<![\w:])(?:(?:dedaliano_engine::)?solver::)?(?:'+module+r'::)?'+name+r'\s*\(', 'crate::audit_capture::'+name+'(',s)
 if s!=p.read_text():p.write_text(s)
