use crate::case::*;
use crate::nullspace::nullspace;
use dedaliano_engine::metamorphic::Rng;
use serde_json::{json, Value};

pub const FAMILIES: &[&str] = &["release", "skew-torsion", "connector", "supports", "skew-supports", "link", "diaphragm", "near"];

struct B {
    nodes: Vec<(usize, [f64; 3])>,
    elements: Vec<Value>,
    supports: Vec<Value>,
    loads: Vec<(usize, [f64; 6])>,
    connectors: Vec<Value>,
    constraints: Vec<Value>,
    body: Vec<usize>,
    restraints: Vec<(usize, [f64; 6])>,
    modes: Vec<Vector>,
    exact: Vec<(usize, usize, f64)>,
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn unit(k: usize) -> [f64; 6] {
    let mut v = [0.0; 6];
    v[k] = 1.0;
    v
}

impl B {
    fn at(&self, n: usize) -> [f64; 3] {
        self.nodes.iter().find(|m| m.0 == n).unwrap().1
    }

    fn node(&mut self, p: [f64; 3]) -> usize {
        let id = self.nodes.len() + 1;
        self.nodes.push((id, p));
        id
    }

    fn free_point(&self, rng: &mut Rng, z: Option<f64>) -> [f64; 3] {
        loop {
            let p = [0.5 * rng.below(13) as f64, 0.5 * rng.below(13) as f64, z.unwrap_or(0.5 * rng.below(9) as f64)];
            if self.nodes.iter().all(|n| n.1 != p) {
                return p;
            }
        }
    }

    fn frame(&mut self, i: usize, j: usize, release_i: [bool; 3], release_j: [bool; 3]) {
        let id = self.elements.len() + 1;
        let (a, b) = (self.at(i), self.at(j));
        let d = sub(b, a);
        let vertical = d[0] == 0.0 && d[1] == 0.0;
        let mut e = json!({"id": id, "type": "frame", "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1,
            "releaseMyStart": release_i[0], "releaseMzStart": release_i[1], "releaseTStart": release_i[2],
            "releaseMyEnd": release_j[0], "releaseMzEnd": release_j[1], "releaseTEnd": release_j[2]});
        if vertical {
            e["localYx"] = json!(1.0);
            e["localYy"] = json!(0.0);
            e["localYz"] = json!(0.0);
        }
        self.elements.push(e);
    }

    fn support(&mut self, node: usize, mut v: Value) {
        v["nodeId"] = json!(node);
        for k in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
            if v.get(k).is_none() {
                v[k] = json!(false);
            }
        }
        for (d, (flag, spring)) in [("rx", "kx"), ("ry", "ky"), ("rz", "kz"), ("rrx", "krx"), ("rry", "kry"), ("rrz", "krz")].into_iter().enumerate() {
            if v[flag] == true || v[spring].as_f64().is_some_and(|k| k > 0.0) {
                self.restraints.push((node, unit(d)));
            }
        }
        if v["isInclined"] == true {
            let n = [v["normalX"].as_f64().unwrap(), v["normalY"].as_f64().unwrap(), v["normalZ"].as_f64().unwrap()];
            let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            self.restraints.push((node, [n[0] / l, n[1] / l, n[2] / l, 0.0, 0.0, 0.0]));
        }
        self.supports.push(v);
    }

    fn rigid(&self, n: usize, about: [f64; 3], w: [f64; 3]) -> [f64; 6] {
        let u = cross(w, sub(self.at(n), about));
        [u[0], u[1], u[2], w[0], w[1], w[2]]
    }
}

fn magnitude(rng: &mut Rng) -> f64 {
    rng.below(21) as f64 - 10.0
}

fn body(rng: &mut Rng, floor: bool) -> B {
    let mut b = B { nodes: vec![], elements: vec![], supports: vec![], loads: vec![], connectors: vec![], constraints: vec![], body: vec![], restraints: vec![], modes: vec![], exact: vec![] };
    let nb = 2 + rng.below(4);
    let zf = 0.5 * (1 + rng.below(8)) as f64;
    for k in 0..nb {
        let p = b.free_point(rng, (floor && k > 0).then_some(zf));
        let id = b.node(p);
        b.body.push(id);
        if k > 0 {
            let parent = b.body[rng.below(k)];
            b.frame(parent, id, [false; 3], [false; 3]);
        }
    }
    b
}

const FIXED: [&str; 6] = ["rx", "ry", "rz", "rrx", "rry", "rrz"];

fn fixed_root(b: &mut B) {
    let root = b.body[0];
    b.support(root, Value::Object(FIXED.iter().map(|k| (k.to_string(), json!(true))).collect()));
}

fn released(b: &mut B, rng: &mut Rng) -> usize {
    let p = b.free_point(rng, None);
    let p = b.node(p);
    let mut targets = b.body.clone();
    rng.shuffle(&mut targets);
    for &t in targets.iter().take(1 + rng.below(3.min(targets.len()))) {
        if rng.below(2) == 0 {
            b.frame(t, p, [false; 3], [true; 3]);
        } else {
            b.frame(p, t, [true; 3], [false; 3]);
        }
    }
    for d in 3..6 {
        b.modes.push([((p, d), 1.0)].into());
    }
    p
}

fn skew_torsion(b: &mut B, rng: &mut Rng) {
    let t = b.body[rng.below(b.body.len())];
    let a = b.at(t);
    let d = [1.0 + rng.below(3) as f64, 1.0 + rng.below(3) as f64, rng.below(3) as f64 - 1.0];
    let s = 0.5 * (1 + rng.below(3)) as f64;
    let p = b.node([a[0] + s * d[0], a[1] + s * d[1], a[2] + s * d[2]]);
    if b.nodes.iter().filter(|n| n.1 == b.at(p)).count() > 1 {
        b.nodes.pop();
        released(b, rng);
        return;
    }
    if rng.below(2) == 0 {
        b.frame(t, p, [false; 3], [false, false, true]);
    } else {
        b.frame(p, t, [false, false, true], [false; 3]);
    }
    let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
    b.modes.push([((p, 3), d[0] / l), ((p, 4), d[1] / l), ((p, 5), d[2] / l)].into());
    if rng.below(2) == 0 {
        b.loads.push((p, [0.0, 0.0, 0.0, magnitude(rng), magnitude(rng), magnitude(rng)]));
    }
}

fn connector(b: &mut B, rng: &mut Rng) {
    let p = released(b, rng);
    let q = b.node(b.at(p));
    let k = 10f64.powi(5 + rng.below(6) as i32);
    let km = if rng.below(2) == 0 { 0.0 } else { k };
    let id = b.connectors.len() + 1;
    b.connectors.push(json!({"id": id, "nodeI": p, "nodeJ": q, "kAxial": k, "kShear": k, "kShearZ": k, "kMoment": km, "kBendY": km, "kBendZ": km}));
    let n = b.modes.len();
    for d in 3..6 {
        if km > 0.0 {
            b.modes[n + d - 6].insert((q, d), 1.0);
        } else {
            b.modes.push([((q, d), 1.0)].into());
        }
    }
    b.loads.push((q, [magnitude(rng), magnitude(rng), magnitude(rng), 0.0, 0.0, if rng.below(2) == 0 { magnitude(rng) } else { 0.0 }]));
}

fn link(b: &mut B, rng: &mut Rng) {
    let p = released(b, rng);
    let s = b.free_point(rng, None);
    let s = b.node(s);
    let ties_rotation = rng.below(2) == 0;
    b.constraints.push(json!({"type": "rigidLink", "masterNode": p, "slaveNode": s, "dofs": if ties_rotation { vec![0, 1, 2, 3, 4, 5] } else { vec![] }}));
    let n = b.modes.len();
    for k in 0..3 {
        let mut w = [0.0; 3];
        w[k] = 1.0;
        let r = b.rigid(s, b.at(p), w);
        for d in 0..if ties_rotation { 6 } else { 3 } {
            if r[d] != 0.0 {
                b.modes[n - 3 + k].insert((s, d), r[d]);
            }
        }
    }
    if !ties_rotation {
        for d in 3..6 {
            b.modes.push([((s, d), 1.0)].into());
        }
    }
    b.loads.push((s, [magnitude(rng), magnitude(rng), magnitude(rng), 0.0, 0.0, 0.0]));
}

fn near(b: &mut B, rng: &mut Rng) {
    let p = released(b, rng);
    b.modes.truncate(b.modes.len() - 3);
    let k = 10f64.powi(-(rng.below(16) as i32));
    b.support(p, json!({"krx": k, "kry": k, "krz": k}));
    let m = [1.0 + rng.below(9) as f64, rng.below(9) as f64 - 4.0, 1.0 + rng.below(5) as f64];
    b.loads.push((p, [0.0, 0.0, 0.0, m[0], m[1], m[2]]));
    for d in 0..3 {
        b.exact.push((p, 3 + d, m[d] / k));
    }
}

fn random_supports(b: &mut B, rng: &mut Rng) {
    let mut nodes = b.body.clone();
    rng.shuffle(&mut nodes);
    for &n in nodes.iter().take(1 + rng.below(3)) {
        let mut v = json!({});
        match rng.below(4) {
            0 => {
                for k in FIXED {
                    if rng.below(2) == 0 {
                        v[k] = json!(true);
                    }
                }
            }
            1 => {
                for k in ["kx", "ky", "kz", "krx", "kry", "krz"] {
                    if rng.below(3) == 0 {
                        v[k] = json!(10f64.powi(3 + rng.below(4) as i32));
                    }
                }
            }
            2 => {
                v["isInclined"] = json!(true);
                v["normalX"] = json!(rng.below(3) as f64);
                v["normalY"] = json!(rng.below(3) as f64);
                v["normalZ"] = json!(1.0 + rng.below(2) as f64);
            }
            _ => {
                v["rx"] = json!(true);
                v["ry"] = json!(true);
                v["rz"] = json!(true);
            }
        }
        b.support(n, v);
    }
}

fn skew_supports(b: &mut B, rng: &mut Rng) {
    let c = b.free_point(rng, None);
    let mut nodes = b.body.clone();
    rng.shuffle(&mut nodes);
    for &n in nodes.iter().take(2 + rng.below(4)) {
        let d = sub(c, b.at(n));
        b.support(n, json!({"isInclined": true, "normalX": d[0], "normalY": d[1], "normalZ": d[2]}));
    }
}

fn diaphragm(b: &mut B, rng: &mut Rng) {
    let floor: Vec<usize> = b.body[1..].to_vec();
    if floor.len() >= 2 {
        b.constraints.push(json!({"type": "diaphragm", "masterNode": floor[0], "slaveNodes": floor[1..].to_vec(), "plane": "XY"}));
    }
    if rng.below(2) == 0 {
        random_supports(b, rng);
    }
}

fn rigid_body_modes(b: &mut B) {
    let ids: Vec<usize> = b.nodes.iter().map(|n| n.0).collect();
    let basis = |b: &B, n: usize| -> Vec<[f64; 6]> {
        let mut m: Vec<[f64; 6]> = (0..3).map(unit).collect();
        for k in 0..3 {
            let mut w = [0.0; 3];
            w[k] = 1.0;
            m.push(b.rigid(n, [0.0; 3], w));
        }
        m
    };
    let rows: Vec<Vec<f64>> = b.restraints.iter().map(|(n, w)| {
        let m = basis(b, *n);
        (0..6).map(|k| (0..6).map(|d| w[d] * m[k][d]).sum()).collect()
    }).collect();
    for c in nullspace(&rows, 6) {
        let mut v = Vector::new();
        for &n in &ids {
            let m = basis(b, n);
            for d in 0..6 {
                let x: f64 = (0..6).map(|k| c[k] * m[k][d]).sum();
                if x != 0.0 {
                    v.insert((n, d), x);
                }
            }
        }
        b.modes.push(v);
    }
}

fn random_loads(b: &mut B, rng: &mut Rng, avoid_moment_at: &[usize]) {
    let ids: Vec<usize> = b.nodes.iter().map(|n| n.0).collect();
    if rng.below(3) == 0 {
        let (i, j) = (ids[rng.below(ids.len())], ids[rng.below(ids.len())]);
        let d = sub(b.at(j), b.at(i));
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        if i != j && l > 0.0 {
            let f = magnitude(rng) / l;
            b.loads.push((i, [f * d[0], f * d[1], f * d[2], 0.0, 0.0, 0.0]));
            b.loads.push((j, [-f * d[0], -f * d[1], -f * d[2], 0.0, 0.0, 0.0]));
            return;
        }
    }
    for _ in 0..1 + rng.below(3) {
        let n = ids[rng.below(ids.len())];
        let moments = !avoid_moment_at.contains(&n) && rng.below(3) == 0;
        let mut l = [magnitude(rng), magnitude(rng), magnitude(rng), 0.0, 0.0, 0.0];
        if moments {
            for x in &mut l[3..] {
                *x = magnitude(rng);
            }
        }
        b.loads.push((n, l));
    }
}

pub fn case(seed: u64) -> Case {
    let mut rng = Rng::new(seed ^ 0x3d3d);
    let family = FAMILIES[rng.below(FAMILIES.len())];
    let mut b = body(&mut rng, family == "diaphragm");
    let mut quiet = vec![];
    match family {
        "supports" => random_supports(&mut b, &mut rng),
        "skew-supports" => skew_supports(&mut b, &mut rng),
        "diaphragm" => diaphragm(&mut b, &mut rng),
        _ => fixed_root(&mut b),
    }
    match family {
        "release" => {
            for _ in 0..1 + rng.below(2) {
                quiet.push(released(&mut b, &mut rng));
            }
        }
        "skew-torsion" => skew_torsion(&mut b, &mut rng),
        "connector" => connector(&mut b, &mut rng),
        "link" => link(&mut b, &mut rng),
        "near" => near(&mut b, &mut rng),
        _ => {}
    }
    if rng.below(2) == 0 {
        quiet.clear();
    }
    quiet.extend(b.exact.iter().map(|e| e.0));
    random_loads(&mut b, &mut rng, &quiet);
    rigid_body_modes(&mut b);
    build(format!("3d/{seed}"), family, b, &mut rng)
}

fn build(name: String, family: &str, mut b: B, rng: &mut Rng) -> Case {
    let scale = 10f64.powi(rng.below(7) as i32 - 3);
    for l in &mut b.loads {
        l.1.iter_mut().for_each(|x| *x *= scale);
    }
    b.exact.iter_mut().for_each(|e| e.2 *= scale);
    let input = json!({
        "nodes": b.nodes.iter().map(|n| (n.0.to_string(), json!({"id": n.0, "x": n.1[0], "y": n.1[1], "z": n.1[2]}))).collect::<serde_json::Map<_, _>>(),
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 3e-5}},
        "elements": b.elements.iter().map(|e| (e["id"].to_string(), e.clone())).collect::<serde_json::Map<_, _>>(),
        "supports": b.supports.iter().enumerate().map(|(k, s)| ((k + 1).to_string(), s.clone())).collect::<serde_json::Map<_, _>>(),
        "loads": b.loads.iter().map(|(n, l)| json!({"type": "nodal", "data": {"nodeId": n, "fx": l[0], "fy": l[1], "fz": l[2], "mx": l[3], "my": l[4], "mz": l[5]}})).collect::<Vec<_>>(),
        "constraints": b.constraints,
        "connectors": b.connectors.iter().map(|c| (c["id"].to_string(), c.clone())).collect::<serde_json::Map<_, _>>(),
    });
    let s = serde_json::from_value(input).expect("generated 3D model parses");
    Case { name, family: family.into(), model: Model::D3(s), modes: b.modes.iter().map(|m| m.iter().filter(|e| *e.1 != 0.0).map(|(k, v)| (k.0, k.1, *v)).collect()).collect(), exact: b.exact, known_issue: None }
}
