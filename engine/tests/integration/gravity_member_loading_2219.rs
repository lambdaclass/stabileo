use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use dedaliano_engine::solver::{linear, pdelta, corotational};
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
fn restrained_edge_beam_retains_distributed_torsion_linear_and_nonlinear() {
    let input = model(2.0);
    check(&linear::solve_3d(&input).unwrap(), 2.0);
    check(&pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results, 2.0);
}

#[test]
fn centered_member_load_keeps_its_bending_answer() {
    check(&linear::solve_3d(&model(0.0)).unwrap(), 0.0);
}

#[test]
fn quadratic_moments_reach_linear_pdelta_and_corotational_recovery() {
    let mut input = model(0.0);
    for (k,load) in input.loads.iter_mut().enumerate() {
        if let SolverLoad3D::Distributed(d) = load {
            d.q_zi = 0.0; d.q_zj = 0.0;
            let a = k as f64 * 3.0;
            d.moments = Some(serde_json::from_value(json!({"x":[a*a*0.001,(a+1.5).powi(2)*0.001,(a+3.0).powi(2)*0.001],"y":[0,0,0],"z":[0,0,0]})).unwrap());
        }
    }
    let results = [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results,corotational::solve_corotational_3d(&input,100,1e-10,4,false).unwrap().results];
    for result in &results {
        for ef in &result.element_forces {
            for t in [0.0,0.25,0.5,0.75,1.0] {
                let x = (ef.element_id-1) as f64 * 3.0+t*3.0;
                assert!((evaluate_diagram_3d_at(ef,"torsion",t)-0.001*(-18.0+x.powi(3)/3.0)).abs()<1e-10);
            }
        }
        let d = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!((d.rx-0.001*(18.0*3.0-3.0_f64.powi(4)/12.0)/(0.5e6*0.002)).abs()<1e-10);
    }
}

#[test]
fn distributed_moments_are_never_silently_accepted_by_plane_loads() {
    let good=json!({"type":"distributed","data":{"elementId":1,"qI":-1,"qJ":-1}});
    assert!(serde_json::from_value::<SolverLoad>(good.clone()).is_ok());
    let mut bad=good; bad["data"]["moments"]=json!({"x":[1,1,1],"y":[0,0,0],"z":[0,0,0]});
    assert!(serde_json::from_value::<SolverLoad>(bad.clone()).is_err());
    assert!(serde_json::from_value::<dedaliano_engine::types::units::TypedLoad>(bad).is_err());
}

#[test]
fn moment_support_and_span_boundaries_refuse_instead_of_dropping_loads() {
    for magnitude in [0.0,1e-30,1.0] {
        let input=model(magnitude);
        assert!(linear::solve_3d(&input).is_ok());
        let mut truss=input.clone();
        for e in truss.elements.values_mut() { e.elem_type="truss".into(); }
        for support in truss.supports.values_mut() { support.rrx=false;support.rry=false;support.rrz=false; }
        if magnitude != 0.0 { assert!(linear::solve_3d(&truss).unwrap_err().contains("distributed moments require a frame")); }
        let mut warped=input.clone();warped.sections.values_mut().next().unwrap().cw=Some(1e-6);
        if magnitude != 0.0 { assert!(linear::solve_3d(&warped).unwrap_err().contains("distributed moments require a frame without warping")); }
    }
    for (a,b,accepted) in [(0.0,3.0,true),(0.5,2.5,true),(1.0,1.0,false),(-1e-8,3.0,false),(0.0,3.0+1e-8,false)] {
        let mut input=model(1.0);
        if let SolverLoad3D::Distributed(d)=&mut input.loads[0] {d.a=Some(a);d.b=Some(b);}
        assert_eq!(linear::solve_3d(&input).is_ok(),accepted);
    }
    let input=model(1.0);
    let prepared=linear::prepare_static_3d(&input).unwrap();
    let mut loads=input.loads.clone();
    if let SolverLoad3D::Distributed(d)=&mut loads[0] {d.moments.as_mut().unwrap().x[1]=f64::NAN;}
    assert!(prepared.solve_loads(&loads).is_err());
}

#[test]
fn torsion_release_retains_the_member_load_and_its_span_diagram() {
    let mut input=model(2.0);
    input.elements.values_mut().find(|e| e.id==2).unwrap().release_t_end=true;
    for r in [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results] {
        for ef in &r.element_forces { for t in [0.0,0.25,0.5,0.75,1.0] {
            let x=(ef.element_id-1) as f64*3.0+t*3.0;
            assert!((evaluate_diagram_3d_at(ef,"torsion",t)-2.0*(x-6.0)).abs()<1e-8);
        } }
        let middle=r.displacements.iter().find(|d| d.node_id==2).unwrap();
        assert!((middle.rx-2.0*(6.0*3.0-3.0*3.0/2.0)/(0.5e6*0.002)).abs()<1e-10);
    }
}

#[test]
fn transverse_member_moments_use_section_rotation_shapes_and_recovery() {
    for axis in ["y","z"] {
        let mut input=model(0.0);
        for l in &mut input.loads { if let SolverLoad3D::Distributed(d)=l {
            d.q_zi=0.0;d.q_zj=0.0;
            let m=d.moments.as_mut().unwrap();
            if axis=="y" {m.y=[2.0;3];} else {m.z=[2.0;3];}
        } }
        for r in [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results] {
            for ef in &r.element_forces { for t in [0.0,0.25,0.5,0.75,1.0] {
                let (shear,moment,expected)=if axis=="y" {("shearZ","momentY",-2.0)} else {("shearY","momentZ",2.0)};
                assert!((evaluate_diagram_3d_at(ef,shear,t)-expected).abs()<1e-8);
                assert!(evaluate_diagram_3d_at(ef,moment,t).abs()<1e-8);
            } }
            for d in r.displacements { assert!(d.ux.abs()+d.uy.abs()+d.uz.abs()+d.rx.abs()+d.ry.abs()+d.rz.abs()<1e-10); }
        }
    }
}

#[test]
#[ignore = "known wrong result: #2222"]
fn issue_2222_narrow_member_spans_keep_force_on_both_sides_of_the_old_span_cutoff() {
    for width in [0.5e-12,1.5e-12] {
        let mut spatial=model(0.0);
        spatial.loads.truncate(1);
        if let SolverLoad3D::Distributed(d)=&mut spatial.loads[0] {
            let a=1.5;let b=a+width;d.a=Some(a);d.b=Some(b);d.q_zi=-1.0/(b-a);d.q_zj=d.q_zi;d.moments=None;
        }
        let mut plane=serde_json::to_value(&spatial).unwrap();
        for n in plane["nodes"].as_object_mut().unwrap().values_mut() {n.as_object_mut().unwrap().remove("y");}
        plane["supports"]=json!({"1":{"id":1,"nodeId":1,"type":"fixed"},"3":{"id":3,"nodeId":3,"type":"fixed"}});
        let (a,b,q)=if let SolverLoad3D::Distributed(d)=&spatial.loads[0] {(d.a.unwrap(),d.b.unwrap(),d.q_zi)} else {unreachable!()};
        plane["loads"]=json!([{"type":"distributed","data":{"elementId":1,"a":a,"b":b,"qI":q,"qJ":q}}]);
        let plane: SolverInput=serde_json::from_value(plane).unwrap();
        for r in [linear::solve_3d(&spatial).unwrap(),pdelta::solve_pdelta_3d(&spatial,100,1e-10).unwrap().results] {
            assert!((r.reactions.iter().find(|r|r.node_id==1).unwrap().fz-0.84375).abs()<1e-8,"{r:?}");
            assert!((r.displacements.iter().find(|d|d.node_id==2).unwrap().uz+0.0005625).abs()<1e-10);
        }
        for r in [linear::solve_2d(&plane).unwrap(),pdelta::solve_pdelta_2d(&plane,100,1e-10).unwrap().results] {
            assert!((r.reactions.iter().find(|r|r.node_id==1).unwrap().rz-0.84375).abs()<1e-8);
            assert!((r.displacements.iter().find(|d|d.node_id==2).unwrap().uz+0.0005625).abs()<1e-10);
        }
    }
}

fn round4_check_torque(density: Option<f64>) {
    use dedaliano_engine::postprocess::diagrams_3d::diagram_positions_3d;
        for couple in [-0.5, 0.5, 0.0] {
            let mut input = model(0.0);
            input.nodes.values_mut().find(|n| n.id==2).unwrap().x = 1.5;
            input.loads = vec![serde_json::from_value(json!({"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":0,"mx":couple,"my":0,"mz":0}})).unwrap()];
            if let Some(q) = density {
                for id in [1, 2] {
                    input.loads.push(serde_json::from_value(json!({"type":"distributed","data":{"elementId":id,"qYI":0,"qYJ":0,"qZI":0,"qZJ":0,"moments":{"x":[q,q,q],"y":[0.01,0.01,0.01],"z":[0,0,0]}}})).unwrap());
                }
            }
            for result in [linear::solve_3d(&input).unwrap(), pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results, corotational::solve_corotational_3d(&input,100,1e-10,4,false).unwrap().results] {
                let first = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();
                let last = result.element_forces.iter().find(|f| f.element_id == 2).unwrap();
                let q = density.unwrap_or(0.0);
                let start = -couple * (6.0-1.5)/6.0 - q*6.0/2.0;
                assert!((first.mx_start-start).abs()<1e-8);
                assert!((last.mx_end-(start+couple+q*6.0)).abs()<1e-8);
                let mut wire = serde_json::to_value(first).unwrap();
                wire["length"] = json!(6.0);
                wire["mxEnd"] = json!(last.mx_end);
                wire["pointTorques"] = json!([{"a":1.5,"p":couple}]);
                wire["memberMoments"] = density.map_or(json!([]), |q| json!([{"a":0,"b":6,"moments":{"x":[q,q,q],"y":[0.01,0.01,0.01],"z":[0,0,0]}}]));
                let recovered: ElementForces3D = serde_json::from_value(wire).unwrap();
                for x in [0.0, 1.5-1e-6, 1.5, 1.5+1e-6, 3.0, 6.0] {
                    let expected = start + q*x + if x>1.5 { couple } else { 0.0 };
                    assert!((evaluate_diagram_3d_at(&recovered,"torsion",x/6.0)-expected).abs()<1e-8, "density={density:?}, couple={couple}, x={x}");
                }
                if couple != 0.0 {
                    let positions = diagram_positions_3d(&recovered,"torsion");
                    assert!(positions.contains(&(1.5/6.0)));
                    assert!(positions.iter().any(|t| *t<0.25 && *t>0.24999));
                    assert!(positions.iter().any(|t| *t>0.25 && *t<0.25001));
                }
                let roundtrip: ElementForces3D = serde_json::from_str(&serde_json::to_string(&recovered).unwrap()).unwrap();
                assert!((evaluate_diagram_3d_at(&roundtrip,"torsion",0.5)-(start+q*3.0+couple)).abs()<1e-8);
            }
        }
}

#[test]
#[ignore = "known wrong result: #2219"]
fn round4_concentrated_torque_keeps_station_jumps() { round4_check_torque(None); }

#[test]
#[ignore = "known wrong result: #2219"]
fn round4_bending_density_torque_keeps_station_jumps() { round4_check_torque(Some(0.0)); }

#[test]
#[ignore = "known wrong result: #2219"]
fn round4_torsional_density_torque_keeps_station_jumps() { round4_check_torque(Some(0.2)); }
