use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

fn model(moment: f64) -> SolverInput3D {
    let mut v: Value = serde_json::from_str(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap();
    v = v["2023"].clone();
    v["nodes"] = json!({"1":{"id":1,"x":0,"y":0,"z":0},"2":{"id":2,"x":3,"y":0,"z":0},"3":{"id":3,"x":6,"y":0,"z":0}});
    let mut e = v["elements"]["1"].clone();
    e["nodeI"] = json!(1); e["nodeJ"] = json!(2);
    for key in ["releaseMyStart","releaseMyEnd","releaseMzStart","releaseMzEnd","releaseTStart","releaseTEnd"] { e[key] = json!(false); }
    let mut f = e.clone(); f["id"] = json!(2); f["nodeI"] = json!(2); f["nodeJ"] = json!(3);
    v["elements"] = json!({"1":e,"2":f});
    v["materials"]["1"]["e"] = json!(1000); v["materials"]["1"]["nu"] = json!(0);
    for key in ["iy","iz"] { v["sections"]["1"][key] = json!(0.001); }
    v["sections"]["1"]["j"] = json!(0.002);
    v["sections"]["1"]["a"] = json!(0.1);
    for key in ["cw","asY","asZ"] { v["sections"]["1"].as_object_mut().unwrap().remove(key); }
    v["supports"] = json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},"3":{"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}});
    v["loads"] = json!([1,2].map(|id| json!({"type":"distributed","data":{"elementId":id,"qYI":0,"qYJ":0,"qZI":-1,"qZJ":-1,"moments":{"x":[moment,moment,moment],"y":[0,0,0],"z":[0,0,0]}}})));
    serde_json::from_value(v).unwrap()
}

fn check(result: &AnalysisResults3D, torque: f64) {
    for ef in &result.element_forces {
        let offset = if ef.element_id == 1 { 0.0 } else { 3.0 };
        for t in [0.0,0.25,0.5,0.75,1.0] {
            let x = offset + t * 3.0;
            assert!((evaluate_diagram_3d_at(ef,"torsion",t) - torque * (x - 3.0)).abs() < 1e-8);
            assert!((evaluate_diagram_3d_at(ef,"shearZ",t) - (3.0 - x)).abs() < 1e-8);
            assert!((evaluate_diagram_3d_at(ef,"momentY",t) - (-3.0 + 3.0*x - x*x/2.0)).abs() < 1e-8);
        }
    }
    let middle = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!((middle.uz + 6.0_f64.powi(4)/(384.0*1e6*0.001)).abs() < 1e-10);
    assert!((middle.rx - torque*3.0*3.0/(2.0*0.5e6*0.002)).abs() < 1e-10);
}

#[test]
#[ignore = "known wrong result: #2219"]
fn restrained_edge_beam_retains_distributed_torsion_linear_and_nonlinear() {
    let input = model(2.0);
    check(&linear::solve_3d(&input).unwrap(), 2.0);
    check(&pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results, 2.0);
}

#[test]
fn centered_member_load_keeps_its_bending_answer() {
    check(&linear::solve_3d(&model(0.0)).unwrap(), 0.0);
}
