use dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use dedaliano_engine::postprocess::combinations::CombinationFactor;
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
                let mut single = result.clone();
                single.element_forces = vec![roundtrip];
                for factor in [-2.0, 0.0, 2.0] {
                    let combined = dedaliano_engine::postprocess::combinations::combine_results_3d_refs(&[CombinationFactor { case_id: 1, factor }], &[(1, &single)]).unwrap().unwrap();
                    let force = &combined.element_forces[0];
                    for x in [0.0,1.5-1e-6,1.5+1e-6,3.0,6.0] {
                        let expected = factor*(start+q*x+if x>1.5 {couple} else {0.0});
                        assert!((evaluate_diagram_3d_at(force,"torsion",x/6.0)-expected).abs()<1e-8);
                    }
                }

            }
        }
}

#[test]
fn round4_concentrated_torque_keeps_station_jumps() { round4_check_torque(None); }

#[test]
fn round4_bending_density_torque_keeps_station_jumps() { round4_check_torque(Some(0.0)); }

#[test]
fn round4_torsional_density_torque_keeps_station_jumps() { round4_check_torque(Some(0.2)); }

#[test]
fn round5_torque_and_force_jumps_have_no_absolute_dead_zone() {
    use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
    for length in [1.0_f64, 6.0] {
        for a in [0.0, length / 4.0, length - 5e-11, length] {
            for p in [-1.0, 0.0, 1.0] {
                let spatial: ElementForces3D = serde_json::from_value(json!({
                    "elementId":1,"length":length,"nStart":0,"nEnd":-p,
                    "vyStart":0,"vyEnd":p,"vzStart":0,"vzEnd":p,
                    "myStart":0,"myEnd":0,"mzStart":0,"mzEnd":0,"mxStart":0,"mxEnd":p,
                    "qYI":0,"qYJ":0,"qZI":0,"qZJ":0,
                    "releaseMyStart":false,"releaseMyEnd":false,"releaseMzStart":false,"releaseMzEnd":false,"releaseTStart":false,"releaseTEnd":false,
                    "distributedLoadsX":[],"distributedLoadsY":[],"distributedLoadsZ":[],
                    "pointLoadsX":[{"a":a,"p":p}],"pointLoadsY":[{"a":a,"p":p}],"pointLoadsZ":[{"a":a,"p":p}],"pointTorques":[{"a":a,"p":p}],"memberMoments":[]
                })).unwrap();
                let plane: ElementForces = serde_json::from_value(json!({
                    "elementId":1,"length":length,"nStart":0,"nEnd":-p,"vStart":0,"vEnd":p,"mStart":0,"mEnd":p,
                    "qI":0,"qJ":0,"hingeStart":false,"hingeEnd":false,"distributedLoads":[],
                    "pointLoads":[{"a":a,"p":p,"px":p,"my":p}]
                })).unwrap();
                let at = a / length;
                let positions = dedaliano_engine::postprocess::diagrams_3d::diagram_positions_3d(&spatial, "torsion");
                assert!(positions.contains(&at));
                if at > 0.0 { assert!(positions.contains(&at.next_down())); }
                if at < 1.0 { assert!(positions.contains(&at.next_up())); }
                for t in [at.next_down().max(0.0), at, at.next_up().min(1.0), ((a + 5e-11) / length).min(1.0), 1.0] {
                    let jump = if t > at { p } else { 0.0 };
                    for (kind, expected) in [("torsion",jump),("shearY",jump),("shearZ",jump),("axial",-jump)] {
                        assert!((evaluate_diagram_3d_at(&spatial,kind,t)-expected).abs()<1e-12,"{kind} a={a} t={t}");
                    }
                    let arm = t * length - a;
                    for (kind, expected) in [("moment",jump*(1.0-arm)),("shear",jump),("axial",-jump)] {
                        assert!((compute_diagram_value_at(kind,t,&plane)-expected).abs()<1e-12,"{kind} a={a} t={t}");
                    }
                }
            }
        }
    }
}

#[test]
fn round5_solved_point_force_stations_match_the_cantilever_hand_solution() {
    use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
    for a in [1.5_f64, 3.0 - 5e-11] {
        let mut input = model(0.0);
        input.nodes.retain(|id,_| id != "3");
        input.elements.retain(|id,_| id == "1");
        input.supports.retain(|id,_| id == "1");
        input.loads = vec![serde_json::from_value(json!({"type":"pointOnElement","data":{"elementId":1,"a":a,"py":1e-6,"pz":1e-6}})).unwrap()];
        let plane: SolverInput = serde_json::from_value(json!({
            "nodes":{"1":{"id":1,"x":0,"z":0},"2":{"id":2,"x":3,"z":0}},
            "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1,"hingeStart":false,"hingeEnd":false}},
            "materials":input.materials,"sections":input.sections,
            "supports":{"1":{"id":1,"nodeId":1,"type":"fixed"}},
            "loads":[{"type":"pointOnElement","data":{"elementId":1,"a":a,"p":1e-6}}]
        })).unwrap();
        let deflection = 1e-6*a*a*(9.0-a)/(6.0*1000.0);
        for r in [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results,corotational::solve_corotational_3d(&input,100,1e-10,4,false).unwrap().results] {
            let ef = &r.element_forces[0];
            for x in [a-5e-11,a,(a+5e-11).min(3.0),3.0] {
                let expected = if x > a { 0.0 } else { -1e-6 };
                for kind in ["shearY","shearZ"] { assert!((evaluate_diagram_3d_at(ef,kind,x/3.0)-expected).abs()<1e-12); }
            }
            let d = r.displacements.iter().find(|d|d.node_id==2).unwrap();
            assert!((d.uz-deflection).abs()<1e-12);
        }
        for r in [linear::solve_2d(&plane).unwrap(),pdelta::solve_pdelta_2d(&plane,100,1e-10).unwrap().results] {
            let ef = &r.element_forces[0];
            for x in [a-5e-11,a,(a+5e-11).min(3.0),3.0] {
                let expected = if x > a { 0.0 } else { -1e-6 };
                assert!((compute_diagram_value_at("shear",x/3.0,ef)-expected).abs()<1e-12);
            }
            let d = r.displacements.iter().find(|d|d.node_id==2).unwrap();
            assert!((d.uz-deflection).abs()<1e-14);
        }
    }
}

#[test]
fn round7_density_boundaries_and_quadratic_extrema_reach_native_diagrams() {
    use dedaliano_engine::postprocess::diagrams_3d::compute_diagrams_3d;
    for axis in ["x", "y", "z"] { for sign in [1.0, -1.0] { for quadratic in [false, true] {
        let mut input = model(0.0);
        input.nodes.remove("3"); input.elements.remove("2"); input.supports.remove("3");
        input.nodes.get_mut("2").unwrap().x = 100.0;
        let (values, cancel) = if quadratic { ([3.0*sign/16.0,-sign/16.0,3.0*sign/16.0],-sign/48.0) } else { ([sign;3],-sign) };
        let moment = |v: [f64;3]| { let mut m=json!({"x":[0,0,0],"y":[0,0,0],"z":[0,0,0]}); m[axis]=json!(v); m };
        input.loads = serde_json::from_value(json!([
            {"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qYI":0,"qYJ":0,"qZI":0,"qZJ":0,"moments":moment(values)}},
            {"type":"distributed","data":{"elementId":1,"a":2,"b":3,"qYI":0,"qYJ":0,"qZI":0,"qZJ":0,"moments":moment([cancel;3])}}
        ])).unwrap();
        for result in [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results] {
            let d=compute_diagrams_3d(&result);
            let d=match axis {"x"=>&d.torsion[0],"y"=>&d.moment_y[0],_=>&d.moment_z[0]};
            let peak=if quadratic {1.0/48.0} else {1.0};
            assert!((d.max_value-if sign>0.0 {peak} else {0.0}).abs()<1e-10,"{} {} {}",axis,quadratic,d.max_value);
            assert!((d.min_value-if sign<0.0 {-peak} else {0.0}).abs()<1e-10);
            assert!((d.max_abs_value-sign*peak).abs()<1e-10);
            let xs=if quadratic {vec![1.0,1.25,1.75,2.0,3.0]} else {vec![1.0,2.0,3.0]};
            for x in xs { assert!(d.points.iter().any(|p|(p.t-x/100.0).abs()<1e-12)); }
        }
    } } }
}

#[test]
fn round7_plane_span_extrema_reach_native_diagrams() {
    use dedaliano_engine::postprocess::diagrams::{compute_diagrams_2d,diagram_positions_2d};
    for sign in [1.0,-1.0] {
        let mut input=crate::common::make_input(
            vec![(1,0.0,0.0),(2,100.0,0.0)],vec![(1,1000.0,0.0)],vec![(1,0.1,0.001)],
            vec![(1,"frame",1,2,1,1,false,false)],vec![(1,1,"fixed")],vec![]);
        input.loads=serde_json::from_value(json!([{"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qI":sign,"qJ":-sign}}])).unwrap();
        for r in [linear::solve_2d(&input).unwrap(),pdelta::solve_pdelta_2d(&input,100,1e-10).unwrap().results] {
            let d=compute_diagrams_2d(&input,&r);
            let offset=r.element_forces[0].v_start;
            assert!((d.shear[0].max_value-offset-if sign>0.0 {0.25} else {0.0}).abs()<1e-10);
            assert!((d.shear[0].min_value-offset-if sign<0.0 {-0.25} else {0.0}).abs()<1e-10);
            assert!(diagram_positions_2d(&r.element_forces[0],"shear").iter().any(|t|(*t-0.015).abs()<1e-12));
        }
    }
}

fn round8_endpoint_model(a: f64, b: f64, axis: &str) -> SolverInput3D {
    let mut input = model(0.0);
    input.nodes.retain(|_, n| n.id != 3);
    input.nodes.values_mut().find(|n| n.id == 2).unwrap().x = 1.0;
    input.elements.retain(|_, e| e.id == 1);
    input.supports.retain(|_, s| s.node_id == 1);
    input.loads.truncate(1);
    if let SolverLoad3D::Distributed(d) = &mut input.loads[0] {
        d.q_zi = 0.0; d.q_zj = 0.0; d.a = Some(a); d.b = Some(b);
        let values = [if b > a { 1.0 / (b - a) } else { 1.0 }; 3];
        let m = d.moments.as_mut().unwrap();
        match axis { "x" => m.x = values, "y" => m.y = values, "z" => m.z = values, _ => unreachable!() }
    }
    input
}

#[test]
fn round8_endpoint_straddling_moment_densities_refuse_in_every_spatial_solve() {
    for axis in ["x", "y", "z"] {
        for (a, b) in [(-1e-14, 1e-14), (1.0 - 1e-14, 1.0 + 1e-14), (-1e-14, 0.0), (1.0, 1.0 + 1e-14), (0.5, 0.5), (0.5, 0.5_f64.next_up()), (0.0, 256.0 * f64::EPSILON), (1.0 - 256.0 * f64::EPSILON, 1.0)] {
            let input = round8_endpoint_model(a, b, axis);
            let mut unloaded = input.clone(); unloaded.loads.clear();
            let prepared = linear::prepare_static_3d(&unloaded).unwrap();
            for (entry, result) in [
                ("linear", linear::solve_3d(&input)),
                ("prepared", prepared.solve_loads(&input.loads)),
                ("pdelta", pdelta::solve_pdelta_3d(&input, 100, 1e-10).map(|r| r.results)),
                ("corotational", corotational::solve_corotational_3d(&input, 100, 1e-10, 4, false).map(|r| r.results)),
            ] {
                assert!(result.is_err(), "{entry} accepted axis={axis} [{a},{b}]: {result:?}");
                assert!(result.unwrap_err().contains("distributed moment span"));
            }
        }
    }
}

#[test]
fn round8_representable_moment_support_has_identical_assembly_and_recovery_endpoints() {
    let allowance = 64.0 * f64::EPSILON;
    for (a, b) in [(0.0, 1.0), (0.25, 0.75), (0.5, 0.5 + 1e-10), (-allowance, 0.5), (0.5, 1.0 + allowance), (0.0, 1e-10), (1.0 - 1e-9, 1.0)] {
        let input = round8_endpoint_model(a, b, "x");
        let mut unloaded = input.clone(); unloaded.loads.clear();
        let prepared = linear::prepare_static_3d(&unloaded).unwrap();
        for result in [linear::solve_3d(&input).unwrap(), prepared.solve_loads(&input.loads).unwrap(), pdelta::solve_pdelta_3d(&input, 100, 1e-10).unwrap().results, corotational::solve_corotational_3d(&input, 100, 1e-10, 4, false).unwrap().results] {
            let ef = &result.element_forces[0];
            let ca = a.max(0.0); let cb = b.min(1.0);
            let density = 1.0 / (b - a);
            let force = density * (cb - ca);
            assert_eq!(ef.member_moments[0].a, ca);
            assert_eq!(ef.member_moments[0].b, cb);
            assert!((ef.mx_start + force).abs() < 1e-10);
            for x in [0.0, ca, ca + (cb - ca) / 4.0, ca + (cb - ca) / 2.0, cb, 1.0] {
                let expected = -force + density * (x - ca).clamp(0.0, cb - ca);
                assert!((evaluate_diagram_3d_at(ef, "torsion", x) - expected).abs() < 1e-10, "[{a},{b}] x={x}");
                for kind in ["shearY", "shearZ", "momentY", "momentZ"] { assert!(evaluate_diagram_3d_at(ef, kind, x).abs() < 1e-10); }
            }
            let tip = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
            assert!((tip.rx - force * (ca + cb) / (2.0 * 1000.0)).abs() < 1e-10);
        }
    }
    for (a, b) in [(-allowance.next_up(), 0.5), (-allowance, 0.49), (0.51, 1.0 + allowance), (-allowance, 4.0 * allowance), (1.0 - 4.0 * allowance, 1.0 + allowance), (0.5, (1.0 + allowance).next_up()), (-allowance, allowance), (1.0 - allowance, 1.0 + allowance)] {
        assert!(linear::solve_3d(&round8_endpoint_model(a, b, "x")).is_err());
    }
}

#[test]
fn round10_subgeometry_quadratic_moment_support_refuses_every_spatial_entry() {
    for axis in ["x", "y", "z"] {
        for (length, a, b) in [(1.0, 0.5, 0.5_f64.next_up()), (1.0, 0.0, 1e-10_f64.next_down()), (1.0, 0.5, 0.5 + 5e-11), (10.0, 0.0, 5e-10), (100.0, 0.0, 5e-9)] {
            let mut input = round8_endpoint_model(a, b, axis);
            input.nodes.get_mut("2").unwrap().x = length;
            if let SolverLoad3D::Distributed(d) = &mut input.loads[0] {
                let v = [1.0 / (b-a), -0.5 / (b-a), 1.0 / (b-a)];
                let m = d.moments.as_mut().unwrap();
                match axis { "x" => m.x=v, "y" => m.y=v, _ => m.z=v }
            }
            let mut unloaded=input.clone(); unloaded.loads.clear();
            let prepared=linear::prepare_static_3d(&unloaded).unwrap();
            for result in [linear::solve_3d(&input), prepared.solve_loads(&input.loads), pdelta::solve_pdelta_3d(&input,100,1e-10).map(|r|r.results), corotational::solve_corotational_3d(&input,100,1e-10,4,false).map(|r|r.results)] {
                assert!(result.is_err(), "accepted {axis} [{a},{b}]");
                assert!(result.unwrap_err().contains("1e-10"));
            }
        }
    }
}

#[test]
fn round10_supported_quadratic_extrema_keep_local_parameter_values() {
    use dedaliano_engine::postprocess::diagrams_3d::compute_diagrams_3d;
    for axis in ["x", "y", "z"] {
        for (length,a,b) in [(1.0,0.0,1e-10_f64), (1.0,0.0,1e-10_f64.next_up()), (1.0,0.5,0.5+1e-10), (1.0,0.5,0.5+1e-8), (1.0,0.25,0.75), (10.0,0.0,1e-9), (100.0,0.0,1e-8)] {
            let mut input=round8_endpoint_model(a,b,axis);
            input.nodes.get_mut("2").unwrap().x = length;
            if let SolverLoad3D::Distributed(d)=&mut input.loads[0] {
                let v=[1.0/(b-a), -0.5/(b-a), 1.0/(b-a)];
                let m=d.moments.as_mut().unwrap();
                match axis {"x"=>m.x=v,"y"=>m.y=v,_=>m.z=v}
            }
            let mut unloaded=input.clone(); unloaded.loads.clear();
            let prepared=linear::prepare_static_3d(&unloaded).unwrap();
            for r in [linear::solve_3d(&input).unwrap(),prepared.solve_loads(&input.loads).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results,corotational::solve_corotational_3d(&input,100,1e-10,4,false).unwrap().results] {
                let ds=compute_diagrams_3d(&r);
                let d=match axis {"x"=>&ds.torsion[0],"y"=>&ds.moment_y[0],_=>&ds.moment_z[0]};
                let ef=&r.element_forces[0];
                let base=match axis {"x"=>ef.mx_start,"y"=>ef.my_start+ef.vz_start*a,_=>ef.mz_start-ef.vy_start*a};
                let peak=3.0_f64.sqrt()/18.0;
                assert!((d.max_value-base-peak).abs()<1e-14,"{axis} [{a},{b}] max {} base {base}",d.max_value);
                assert!((d.min_value-base+peak).abs()<1e-14,"{axis} [{a},{b}] min {} base {base}",d.min_value);
            }
        }
    }
}

fn round11_zero_moments_match_absent_moments_in_entry(entry: usize) {
    for (a, b) in [(0.0, 5e-11), (0.0, 1e-10), (0.0, 2e-10), (0.25, 0.25+5e-11), (0.5, 0.5+1e-10), (1.0-2e-10, 1.0), (0.25, 0.75)] {
      let magnitude = if a == 0.0 || b-a > 1e-8 { 0.001_f64 } else { 1e-6 };
      for force in [magnitude, -magnitude] {
        let mut absent = round8_endpoint_model(a, b, "x");
        if let SolverLoad3D::Distributed(d) = &mut absent.loads[0] {
            d.moments = None;
            d.q_zi = -force / (b - a); d.q_zj = d.q_zi;
        }
        let mut zero = absent.clone();
        if let SolverLoad3D::Distributed(d) = &mut zero.loads[0] {
            d.moments = Some(MemberMoments { x: [0.0; 3], y: [-0.0; 3], z: [0.0; 3] });
        }
        let mut unloaded = absent.clone(); unloaded.loads.clear();
        let prepared = linear::prepare_static_3d(&unloaded).unwrap();
        let solve = |input: &SolverInput3D, entry| match entry {
            0 => linear::solve_3d(input),
            1 => prepared.solve_loads(&input.loads),
            2 => pdelta::solve_pdelta_3d(input, 100, 1e-10).map(|r| r.results),
            _ => corotational::solve_corotational_3d(input, 100, 1e-10, 4, false).map(|r| r.results),
        };
        {
            let expected = solve(&absent, entry).unwrap();
            let actual = solve(&zero, entry).unwrap();
            assert_eq!(serde_json::to_value(&actual).unwrap(), serde_json::to_value(&expected).unwrap(), "entry={entry} [{a},{b}]");
            let ef = &actual.element_forces[0];
            assert!(ef.member_moments.is_empty());
            let root_moment = -force * (a + (b-a)/2.0);
            let moment_tolerance = (root_moment.abs() * 1e-8).min(1e-10);
            assert!((evaluate_diagram_3d_at(ef, "shearZ", 0.0) - force).abs() < 1e-10, "entry={entry} a={a} b={b} ef={ef:?}");
            assert!((evaluate_diagram_3d_at(ef, "momentY", 0.0) - root_moment).abs() < moment_tolerance, "entry={entry} [{a},{b}] force={force} root moment");
            for x in [0.0, a, a + (b-a)/4.0, a+(b-a)/2.0, b, 1.0] {
                let width = b-a;
                let u = ((x-a)/width).clamp(0.0, 1.0);
                let shear = force * (1.0-u);
                let moment = if x <= a { root_moment + force*x }
                    else if x >= b { 0.0 }
                    else { -force*width*(1.0-u).powi(2)/2.0 };
                assert!((evaluate_diagram_3d_at(ef,"shearZ",x)-shear).abs()<1e-10, "entry={entry} [{a},{b}] force={force} x={x} shear={shear} actual={}",evaluate_diagram_3d_at(ef,"shearZ",x));
                assert!((evaluate_diagram_3d_at(ef,"momentY",x)-moment).abs()<moment_tolerance, "entry={entry} [{a},{b}] force={force} x={x}");
                assert!(evaluate_diagram_3d_at(ef,"torsion",x).abs()<1e-10);
            }
            let tip = actual.displacements.iter().find(|d|d.node_id==2).unwrap();
            let width = b-a;
            let mean_square = a*a + a*width + width*width/3.0;
            let mean_cube = a.powi(3) + 1.5*a*a*width + a*width*width + width.powi(3)/4.0;
            let deflection = -force*(3.0*mean_square-mean_cube)/(6.0*1000.0);
            assert!((tip.uz-deflection).abs() < (deflection.abs()*1e-8).min(1e-10), "entry={entry} [{a},{b}] force={force} displacement={} expected={deflection}",tip.uz);
            if let SolverLoad3D::Distributed(parsed) = serde_json::from_value::<SolverLoad3D>(serde_json::to_value(&zero.loads[0]).unwrap()).unwrap() {
                assert!(parsed.moments.is_none());
            } else { panic!("distributed load changed type"); }
        }
      }
    }
}

#[test]
fn round11_zero_moments_match_absent_moments_linear() { round11_zero_moments_match_absent_moments_in_entry(0); }
#[test]
fn round11_zero_moments_match_absent_moments_prepared() { round11_zero_moments_match_absent_moments_in_entry(1); }
#[test]
fn round11_zero_moments_match_absent_moments_pdelta() { round11_zero_moments_match_absent_moments_in_entry(2); }
#[test]
fn round11_zero_moments_match_absent_moments_corotational() { round11_zero_moments_match_absent_moments_in_entry(3); }

#[test]
fn round12_envelopes_retain_member_density_extrema() {
    use dedaliano_engine::postprocess::diagrams_3d::compute_diagrams_3d;
    for axis in ["x", "y", "z"] { for sign in [1.0, -1.0] { for quadratic in [false, true] {
        let mut input = model(0.0);
        input.nodes.remove("3"); input.elements.remove("2"); input.supports.remove("3");
        input.nodes.get_mut("2").unwrap().x = 100.0;
        let (values, cancel) = if quadratic { ([3.0*sign/16.0,-sign/16.0,3.0*sign/16.0],-sign/48.0) } else { ([sign;3],-sign) };
        let moment = |v: [f64;3]| { let mut m=json!({"x":[0,0,0],"y":[0,0,0],"z":[0,0,0]}); m[axis]=json!(v); m };
        input.loads = serde_json::from_value(json!([
            {"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qYI":0,"qYJ":0,"qZI":0,"qZJ":0,"moments":moment(values)}},
            {"type":"distributed","data":{"elementId":1,"a":2,"b":3,"qYI":0,"qYJ":0,"qZI":0,"qZJ":0,"moments":moment([cancel;3])}}
        ])).unwrap();
        for result in [linear::solve_3d(&input).unwrap(),pdelta::solve_pdelta_3d(&input,100,1e-10).unwrap().results] {
            let envelope=dedaliano_engine::postprocess::combinations::compute_envelope_3d(&[result.clone()]).unwrap();
            let e=match axis {"x"=>&envelope.torsion,"y"=>&envelope.moment_y,_=>&envelope.moment_z};
            let e=&e.elements[0];
            let d=compute_diagrams_3d(&result);
            let d=match axis {"x"=>&d.torsion[0],"y"=>&d.moment_y[0],_=>&d.moment_z[0]};
            let peak=if quadratic {1.0/48.0} else {1.0};
            assert!((d.max_value-if sign>0.0 {peak} else {0.0}).abs()<1e-10,"{} {} {}",axis,quadratic,d.max_value);
            assert!((d.min_value-if sign<0.0 {-peak} else {0.0}).abs()<1e-10);
            assert!((d.max_abs_value-sign*peak).abs()<1e-10);
            let xs=if quadratic {vec![1.0,1.25,1.75,2.0,3.0]} else {vec![1.0,2.0,3.0]};
            for x in xs { assert!(d.points.iter().any(|p|(p.t-x/100.0).abs()<1e-12)); assert!(e.t_positions.iter().any(|t|(*t-x/100.0).abs()<1e-12)); }
            assert!((e.pos_values.iter().copied().fold(0.0,f64::max)-d.max_value).abs()<1e-10);
            assert!((e.neg_values.iter().copied().fold(0.0,f64::min)-d.min_value).abs()<1e-10);
        }
    } } }
}


#[test]
fn round12_plane_envelope_retains_member_force_extrema() {
    use dedaliano_engine::postprocess::diagrams::{compute_diagrams_2d,diagram_positions_2d};
    for sign in [1.0,-1.0] {
        let mut input=crate::common::make_input(
            vec![(1,0.0,0.0),(2,100.0,0.0)],vec![(1,1000.0,0.0)],vec![(1,0.1,0.001)],
            vec![(1,"frame",1,2,1,1,false,false)],vec![(1,1,"fixed")],vec![]);
        input.loads=serde_json::from_value(json!([{"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qI":sign,"qJ":-sign}}])).unwrap();
        for r in [linear::solve_2d(&input).unwrap(),pdelta::solve_pdelta_2d(&input,100,1e-10).unwrap().results] {
            let envelope=dedaliano_engine::postprocess::combinations::compute_envelope(&[r.clone()]).unwrap();
            let e=&envelope.shear.elements[0];
            let d=compute_diagrams_2d(&input,&r);
            let offset=r.element_forces[0].v_start;
            assert!((e.pos_values.iter().copied().fold(0.0,f64::max)-d.shear[0].max_value.max(0.0)).abs()<1e-10);
            assert!((e.neg_values.iter().copied().fold(0.0,f64::min)-d.shear[0].min_value.min(0.0)).abs()<1e-10);
            assert!((d.shear[0].max_value-offset-if sign>0.0 {0.25} else {0.0}).abs()<1e-10);
            assert!((d.shear[0].min_value-offset-if sign<0.0 {-0.25} else {0.0}).abs()<1e-10);
            assert!(diagram_positions_2d(&r.element_forces[0],"shear").iter().any(|t|(*t-0.015).abs()<1e-12));
        }
    }
}


#[test]
fn plane_distributed_load_ids_reach_the_solver_and_preserve_strict_fields() {
    for id in [None, Some(0), Some(17)] {
        let mut load = json!({"type":"distributed","data":{"elementId":1,"qI":-1,"qJ":-2,"a":0.5,"b":1.5}});
        if let Some(id) = id { load["data"]["id"] = json!(id); }
        let raw: SolverLoad = serde_json::from_value(load.clone()).unwrap();
        let typed: dedaliano_engine::types::units::TypedLoad = serde_json::from_value(load.clone()).unwrap();
        let canonical_load = serde_json::to_value(raw).unwrap();
        assert_eq!(canonical_load, serde_json::to_value(typed).unwrap());
        let spatial = model(0.0);
        let value = json!({
            "nodes":{"1":{"id":1,"x":0,"z":0},"2":{"id":2,"x":3,"z":0}},
            "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "materials":spatial.materials,"sections":spatial.sections,
            "supports":{"1":{"id":1,"nodeId":1,"type":"fixed"}},"loads":[load.clone()]
        });
        let input: SolverInput = serde_json::from_value(value.clone()).unwrap();
        let mut canonical = value; canonical["loads"] = json!([canonical_load]);
        let control: SolverInput = serde_json::from_value(canonical).unwrap();
        for entry in 0..3 {
            let solve = |input: &SolverInput| match entry {
                0 => linear::solve_2d(input),
                1 => pdelta::solve_pdelta_2d(input, 100, 1e-10).map(|r| r.results),
                _ => corotational::solve_corotational_2d(input, 100, 1e-10, 4, false).map(|r| r.results),
            };
            let expected = solve(&control).unwrap();
            let actual = solve(&input).unwrap();
            assert!(actual.displacements.iter().any(|d| d.uz != 0.0));
            assert_eq!(serde_json::to_value(actual).unwrap(), serde_json::to_value(expected).unwrap());
        }
        for (field, value) in [("moments", json!({"x":[1,1,1],"y":[0,0,0],"z":[0,0,0]})), ("moments", Value::Null), ("qTypo", json!(1))] {
            let mut bad = load.clone(); bad["data"][field] = value;
            assert!(serde_json::from_value::<SolverLoad>(bad.clone()).is_err());
            assert!(serde_json::from_value::<dedaliano_engine::types::units::TypedLoad>(bad).is_err());
        }
    }
}
