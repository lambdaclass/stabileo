use dedaliano_engine::{boundary, solver::{linear, pdelta}, types::*};
use serde::Serialize;
use serde_json::{json, Value};
use std::{hint::black_box, time::Instant};

fn frame(stories: usize, bays: usize) -> SolverInput3D {
    let id = |level, col| level * (bays + 1) + col + 1;
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut loads = Vec::new();
    for level in 0..=stories {
        for col in 0..=bays {
            let n = id(level, col);
            nodes.insert(n.to_string(), json!({"id":n,"x":col as f64*6.0,"y":0.0,"z":level as f64*3.0}));
            if level == 0 {
                supports.insert(n.to_string(), json!({"nodeId":n,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}));
            } else {
                loads.push(json!({"type":"nodal","data":{"nodeId":n,"fx":if col==0 {10.0}else{0.0},"fy":0.0,"fz":-50.0,"mx":0.0,"my":0.0,"mz":0.0}}));
                for other in [Some(id(level-1,col)), (col > 0).then(|| id(level,col-1))].into_iter().flatten() {
                    let e = elements.len()+1;
                    elements.insert(e.to_string(), json!({"id":e,"type":"frame","nodeI":other,"nodeJ":n,"materialId":1,"sectionId":1}));
                }
            }
        }
    }
    serde_json::from_value(json!({"nodes":nodes,"elements":elements,"supports":supports,"loads":loads,
        "materials":{"1":{"id":1,"e":200000.0,"nu":0.3}},
        "sections":{"1":{"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00015}}})).unwrap()
}

fn without_timings(value: &mut Value) {
    match value {
        Value::Object(fields) => { fields.remove("timings"); for v in fields.values_mut() { without_timings(v); } },
        Value::Array(items) => { for v in items { without_timings(v); } },
        _ => {},
    }
}

fn measure<T: Serialize>(name: &str, operation: &str, rounds: usize, mut run: impl FnMut() -> Result<T, String>) -> Value {
    let mut times = Vec::new();
    let mut outcome = None;
    for round in 0..=rounds {
        let start = Instant::now();
        let result = black_box(run());
        let elapsed = start.elapsed().as_secs_f64()*1000.0;
        let result = result.and_then(|r| boundary::to_json(&r));
        let mut value = match result {
            Ok(text) => json!({"ok":serde_json::from_str::<Value>(&text).unwrap()}),
            Err(error) => json!({"error":error}),
        };
        without_timings(&mut value);
        if let Some(reference) = &outcome { assert_eq!(&value, reference, "{name}/{operation}"); }
        outcome = Some(value);
        if round > 0 { times.push(elapsed); }
    }
    json!({"model":name,"operation":operation,"milliseconds":times,"outcome":outcome})
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let rounds: usize = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(12);
    assert!(rounds > 0);
    let mut cases: Vec<_> = [(1,1),(5,3),(10,4),(15,6)].into_iter()
        .map(|(stories,bays)| (format!("frame-{stories}-{bays}"), frame(stories,bays))).collect();
    for (stories, bays) in [(10,4),(15,6)] {
        let mut input = frame(stories,bays);
        for load in &mut input.loads { if let SolverLoad3D::Nodal(l) = load { l.fz *= 0.01; } }
        cases.push((format!("stable-frame-{stories}-{bays}"), input));
    }
    for seed in 0..6 {
        let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/differential/pdelta3d-{seed}.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
        cases.push((format!("corpus-{seed}"), serde_json::from_str(&text).unwrap()));
    }
    cases.push(("quad".into(), serde_json::from_str(include_str!("../tests/fixtures/distorted-single-quad-combination.json")).unwrap()));
    let mut overflow = frame(1,1);
    if let SolverLoad3D::Nodal(load) = &mut overflow.loads[0] { load.fx = f64::MAX; }
    cases.push(("overflow".into(), overflow));
    let mut invalid = frame(1,1);
    invalid.materials.get_mut("1").unwrap().e = f64::INFINITY;
    cases.push(("nonfinite".into(), invalid));
    let mut output = Vec::new();
    for (name, input) in &cases {
        output.push(measure(name,"pdelta",rounds,|| pdelta::solve_pdelta_3d(black_box(input),20,1e-8)));
        output.push(measure(name,"linear",rounds,|| linear::solve_3d(black_box(input))));
        output.push(measure(name,"prepare",rounds,|| linear::prepare_static_3d(black_box(input)).map(|p| { black_box(p); true })));
    }
    let text = serde_json::to_string(&output).unwrap();
    if let Some(path) = args.get(1) { std::fs::write(path,text).unwrap(); } else { println!("{text}"); }
}
