use crate::case::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn input_2d(json: &str) -> SolverInput {
    serde_json::from_str(json).unwrap()
}

fn input_3d(json: &str) -> SolverInput3D {
    serde_json::from_str(json).unwrap()
}

fn rotation_2d(s: &SolverInput, about: (f64, f64)) -> Vector {
    s.nodes.values().flat_map(|n| [((n.id, 0), crate::gen2::ROT * (n.z - about.1)), ((n.id, 1), -crate::gen2::ROT * (n.x - about.0)), ((n.id, 2), 1.0)]).collect()
}

fn rotation_3d(s: &SolverInput3D, w: [f64; 3]) -> Vector {
    s.nodes
        .values()
        .flat_map(|n| {
            let r = [n.x, n.y, n.z];
            let u = [w[1] * r[2] - w[2] * r[1], w[2] * r[0] - w[0] * r[2], w[0] * r[1] - w[1] * r[0]];
            [((n.id, 0), u[0]), ((n.id, 1), u[1]), ((n.id, 2), u[2]), ((n.id, 3), w[0]), ((n.id, 4), w[1]), ((n.id, 5), w[2])]
        })
        .collect()
}

fn frame_2d(support: &str, loads: &str) -> SolverInput {
    input_2d(&format!(
        r#"{{"nodes": {{"1": {{"id":1,"x":1,"z":2}}, "2": {{"id":2,"x":4,"z":2}}, "3": {{"id":3,"x":4,"z":5}}}},
      "materials": {{"1": {{"id":1,"e":200000,"nu":0.3}}}},
      "sections": {{"1": {{"id":1,"a":0.01,"iz":0.0001}}}},
      "elements": {{"1": {{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
                    "2": {{"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}}}},
      "supports": {{"1": {{"id":1,"nodeId":1,{support}}}}},
      "loads": [{loads}]}}"#
    ))
}

#[test]
fn rigid_rotation_2d_does_no_work() {
    let s = frame_2d(r#""type":"fixed""#, r#"{"type":"nodal","data":{"nodeId":3,"fx":3,"fz":-7,"my":2}},{"type":"nodal","data":{"nodeId":2,"fx":-1,"fz":4,"my":-5}}"#);
    let r = solve_2d(&s).unwrap();
    let mut total = crate::case::Case { name: String::new(), family: String::new(), model: crate::case::Model::D2(s.clone()), modes: vec![], exact: vec![], known_issue: None }.loads();
    for x in &r.reactions {
        for (d, v) in [x.rx, x.rz, x.my].into_iter().enumerate() {
            *total.entry((x.node_id, d)).or_insert(0.0) += v;
        }
    }
    let w = dot(&rotation_2d(&s, (0.0, 0.0)), &total);
    assert!(w.abs() < 1e-9, "a rigid rotation does {w} of work on loads plus reactions");
}

#[test]
fn rigid_rotation_2d_is_how_the_displacements_turn() {
    let s = frame_2d(r#""type":"fixed","dry":0.001"#, "");
    let u = displacements_2d(&solve_2d(&s).unwrap());
    let mut phi = rotation_2d(&s, (1.0, 2.0));
    phi.values_mut().for_each(|x| *x *= 0.001);
    for (k, v) in &phi {
        assert!((u[k] - v).abs() < 1e-12, "{k:?}: {} vs {v}", u[k]);
    }
}

fn frame_3d(support: &str, loads: &str) -> SolverInput3D {
    input_3d(&format!(
        r#"{{"nodes": {{"1": {{"id":1,"x":1,"y":2,"z":0}}, "2": {{"id":2,"x":4,"y":2,"z":0}}, "3": {{"id":3,"x":4,"y":5,"z":1}}}},
      "materials": {{"1": {{"id":1,"e":200000,"nu":0.3}}}},
      "sections": {{"1": {{"id":1,"a":0.01,"iy":0.0001,"iz":0.00005,"j":0.00003}}}},
      "elements": {{"1": {{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
                    "2": {{"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1}}}},
      "supports": {{"1": {{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true{support}}}}},
      "loads": [{loads}]}}"#
    ))
}

#[test]
fn rigid_rotation_3d_does_no_work() {
    let s = frame_3d("", r#"{"type":"nodal","data":{"nodeId":3,"fx":3,"fy":1,"fz":-7,"mx":2,"my":-1,"mz":4}}"#);
    let r = solve_3d(&s).unwrap();
    let mut total = crate::case::Case { name: String::new(), family: String::new(), model: crate::case::Model::D3(s.clone()), modes: vec![], exact: vec![], known_issue: None }.loads();
    for x in &r.reactions {
        for (d, v) in [x.fx, x.fy, x.fz, x.mx, x.my, x.mz].into_iter().enumerate() {
            *total.entry((x.node_id, d)).or_insert(0.0) += v;
        }
    }
    for w in [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]] {
        let work = dot(&rotation_3d(&s, w), &total);
        assert!(work.abs() < 1e-9, "{w:?}: {work}");
    }
}

#[test]
fn rigid_rotation_3d_is_how_the_displacements_turn() {
    for (k, field) in ["drx", "dry", "drz"].into_iter().enumerate() {
        let s = frame_3d(&format!(r#","{field}":0.001"#), "");
        let u = displacements_3d(&solve_3d(&s).unwrap());
        let mut w = [0.0; 3];
        w[k] = 0.001;
        let mut phi = rotation_3d(&s, w);
        let origin = [(1, 0), (1, 1), (1, 2)].map(|d| phi[&d]);
        for n in s.nodes.values() {
            for d in 0..3 {
                *phi.get_mut(&(n.id, d)).unwrap() -= origin[d];
            }
        }
        for (key, v) in &phi {
            assert!((u[key] - v).abs() < 1e-12, "{field} {key:?}: {} vs {v}", u[key]);
        }
    }
}
