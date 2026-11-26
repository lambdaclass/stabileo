use crate::case::*;
use crate::nullspace::nullspace;
use dedaliano_engine::metamorphic::Rng;
use serde_json::{json, Value};

/// The rotation sign of a 2D rigid-body motion: a rotation θ about the origin moves (x, z) by
/// θ·ROT·(z, −x). Fixed by `calibration::rigid_rotation_2d_does_no_work`.
pub const ROT: f64 = -1.0;

pub const FAMILIES: &[&str] = &["hinge", "connector", "supports", "skew-supports", "link", "near"];

struct B {
    nodes: Vec<(usize, f64, f64)>,
    elements: Vec<Value>,
    supports: Vec<Value>,
    loads: Vec<(usize, f64, f64, f64)>,
    connectors: Vec<Value>,
    constraints: Vec<Value>,
    body: Vec<usize>,
    restraints: Vec<(usize, [f64; 3])>,
    modes: Vec<Vector>,
    exact: Vec<(usize, usize, f64)>,
}

impl B {
    fn xz(&self, n: usize) -> (f64, f64) {
        self.nodes.iter().find(|m| m.0 == n).map(|m| (m.1, m.2)).unwrap()
    }

    fn node(&mut self, x: f64, z: f64) -> usize {
        let id = self.nodes.len() + 1;
        self.nodes.push((id, x, z));
        id
    }

    fn free_point(&self, rng: &mut Rng) -> (f64, f64) {
        loop {
            let p = (0.5 * rng.below(17) as f64, 0.5 * rng.below(13) as f64);
            if self.nodes.iter().all(|n| (n.1, n.2) != p) {
                return p;
            }
        }
    }

    fn element(&mut self, kind: &str, i: usize, j: usize, hinge_start: bool, hinge_end: bool, section: usize) {
        let id = self.elements.len() + 1;
        self.elements.push(json!({"id": id, "type": kind, "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": section, "hingeStart": hinge_start, "hingeEnd": hinge_end}));
    }

    fn support(&mut self, node: usize, v: Value, rows: &[[f64; 3]]) {
        let id = self.supports.len() + 1;
        let mut v = v;
        v["id"] = json!(id);
        v["nodeId"] = json!(node);
        self.supports.push(v);
        self.restraints.extend(rows.iter().map(|r| (node, *r)));
    }

    fn connected(&self, i: usize, j: usize) -> bool {
        self.elements.iter().any(|e| (e["nodeI"] == i && e["nodeJ"] == j) || (e["nodeI"] == j && e["nodeJ"] == i))
    }

    fn rigid(&self, n: usize, about: (f64, f64)) -> [f64; 3] {
        let (x, z) = self.xz(n);
        [ROT * (z - about.1), -ROT * (x - about.0), 1.0]
    }
}

fn magnitude(rng: &mut Rng) -> f64 {
    rng.below(21) as f64 - 10.0
}

fn body(rng: &mut Rng) -> B {
    let mut b = B { nodes: vec![], elements: vec![], supports: vec![], loads: vec![], connectors: vec![], constraints: vec![], body: vec![], restraints: vec![], modes: vec![], exact: vec![] };
    let nb = 2 + rng.below(4);
    for k in 0..nb {
        let (x, z) = b.free_point(rng);
        let id = b.node(x, z);
        b.body.push(id);
        if k > 0 {
            let parent = b.body[rng.below(k)];
            b.element("frame", parent, id, false, false, 1 + rng.below(2));
        }
    }
    for _ in 0..rng.below(2) {
        let (i, j) = (b.body[rng.below(nb)], b.body[rng.below(nb)]);
        if i != j && !b.connected(i, j) {
            b.element("frame", i, j, false, false, 1 + rng.below(2));
        }
    }
    b
}

fn fixed_root(b: &mut B) {
    let root = b.body[0];
    b.support(root, json!({"type": "fixed"}), &[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);
}

fn hinge(b: &mut B, rng: &mut Rng) -> usize {
    let (x, z) = b.free_point(rng);
    let p = b.node(x, z);
    let mut targets = b.body.clone();
    rng.shuffle(&mut targets);
    for &t in targets.iter().take(1 + rng.below(3.min(targets.len()))) {
        if rng.below(2) == 0 {
            b.element("frame", t, p, false, true, 1 + rng.below(2));
        } else {
            b.element("frame", p, t, true, false, 1 + rng.below(2));
        }
    }
    b.modes.push([((p, 2), 1.0)].into());
    p
}

fn random_supports(b: &mut B, rng: &mut Rng) {
    let mut nodes = b.body.clone();
    rng.shuffle(&mut nodes);
    for &n in nodes.iter().take(1 + rng.below(3)) {
        let s = match rng.below(6) {
            0 => json!({"type": "pinned"}),
            1 => json!({"type": "rollerX"}),
            2 => json!({"type": "rollerZ"}),
            3 => json!({"type": "inclinedRoller", "angle": 0.25 * std::f64::consts::PI * rng.below(8) as f64 + 0.1 * rng.below(3) as f64}),
            4 => {
                let k = 10f64.powi(3 + rng.below(4) as i32);
                if rng.below(2) == 0 { json!({"type": "spring", "kx": k}) } else { json!({"type": "spring", "ky": k}) }
            }
            _ => json!({"type": "fixed"}),
        };
        let rows = rows_of(&s);
        b.support(n, s, &rows);
    }
}

fn rows_of(s: &Value) -> Vec<[f64; 3]> {
    match s["type"].as_str().unwrap() {
        "fixed" => vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        "pinned" => vec![[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        "rollerX" => vec![[0.0, 1.0, 0.0]],
        "rollerZ" => vec![[1.0, 0.0, 0.0]],
        "inclinedRoller" => {
            let t = s["angle"].as_f64().unwrap();
            vec![[t.sin(), t.cos(), 0.0]]
        }
        _ => [("kx", [1.0, 0.0, 0.0]), ("ky", [0.0, 1.0, 0.0]), ("kz", [0.0, 0.0, 1.0])].into_iter().filter(|(k, _)| s[*k].as_f64().is_some_and(|v| v > 0.0)).map(|x| x.1).collect(),
    }
}

fn skew_supports(b: &mut B, rng: &mut Rng) {
    let c = b.free_point(rng);
    let parallel = rng.below(3) == 0;
    let t0 = rng.range(0.0, std::f64::consts::PI);
    let mut nodes = b.body.clone();
    rng.shuffle(&mut nodes);
    for &n in nodes.iter().take(2 + rng.below(2)) {
        let (x, z) = b.xz(n);
        let t = if parallel { t0 } else { (c.0 - x).atan2(c.1 - z) };
        let s = json!({"type": "inclinedRoller", "angle": t});
        let rows = rows_of(&s);
        b.support(n, s, &rows);
    }
}

fn rigid_body_modes(b: &mut B) {
    let ids: Vec<usize> = b.nodes.iter().map(|n| n.0).collect();
    let basis = |b: &B, n: usize| -> [[f64; 3]; 3] {
        let r = b.rigid(n, (0.0, 0.0));
        [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], r]
    };
    let rows: Vec<Vec<f64>> = b.restraints.iter().map(|(n, w)| {
        let m = basis(b, *n);
        (0..3).map(|k| (0..3).map(|d| w[d] * m[k][d]).sum()).collect()
    }).collect();
    for c in nullspace(&rows, 3) {
        let mut v = Vector::new();
        for &n in &ids {
            let m = basis(b, n);
            for d in 0..3 {
                let x: f64 = (0..3).map(|k| c[k] * m[k][d]).sum();
                if x != 0.0 {
                    v.insert((n, d), x);
                }
            }
        }
        b.modes.push(v);
    }
}

fn connector(b: &mut B, rng: &mut Rng) {
    let p = hinge(b, rng);
    let (px, pz) = b.xz(p);
    let k = 10f64.powi(5 + rng.below(6) as i32);
    let km = if rng.below(2) == 0 { 0.0 } else { k };
    let zero_length = rng.below(3) != 0;
    let (q, ks) = if zero_length {
        (b.node(px, pz), k)
    } else {
        let (x, z) = b.free_point(rng);
        (b.node(x, z), 0.0)
    };
    let id = b.connectors.len() + 1;
    b.connectors.push(json!({"id": id, "nodeI": p, "nodeJ": q, "kAxial": k, "kShear": ks, "kMoment": km}));
    if km > 0.0 {
        b.modes.last_mut().unwrap().insert((q, 2), 1.0);
    } else {
        b.modes.push([((q, 2), 1.0)].into());
    }
    if !zero_length {
        let (x, z) = b.xz(q);
        let l = ((x - px).powi(2) + (z - pz).powi(2)).sqrt();
        b.modes.push([((q, 0), -(z - pz) / l), ((q, 1), (x - px) / l)].into());
    }
    b.loads.push((q, magnitude(rng), magnitude(rng), if rng.below(2) == 0 { magnitude(rng) } else { 0.0 }));
}

fn link(b: &mut B, rng: &mut Rng) {
    let p = hinge(b, rng);
    let (x, z) = b.free_point(rng);
    let s = b.node(x, z);
    let r = b.rigid(s, b.xz(p));
    let ties_rotation = rng.below(3) != 0;
    match rng.below(3) {
        0 if ties_rotation => b.constraints.push(json!({"type": "diaphragm", "masterNode": p, "slaveNodes": [s]})),
        _ if ties_rotation => b.constraints.push(json!({"type": "rigidLink", "masterNode": p, "slaveNode": s, "dofs": []})),
        _ => b.constraints.push(json!({"type": "rigidLink", "masterNode": p, "slaveNode": s, "dofs": [0, 1]})),
    }
    if rng.below(2) == 0 {
        b.element("truss", p, s, false, false, 1);
    }
    let m = b.modes.last_mut().unwrap();
    m.insert((s, 0), r[0]);
    m.insert((s, 1), r[1]);
    if ties_rotation {
        m.insert((s, 2), 1.0);
    } else {
        b.modes.push([((s, 2), 1.0)].into());
    }
    b.loads.push((s, magnitude(rng), magnitude(rng), 0.0));
}

fn near(b: &mut B, rng: &mut Rng) {
    let p = hinge(b, rng);
    b.modes.pop();
    let k = 10f64.powi(-(rng.below(16) as i32)) * if rng.below(2) == 0 { 1.0 } else { 3.0 };
    let m = 1.0 + rng.below(9) as f64;
    b.support(p, json!({"type": "spring", "kz": k}), &[[0.0, 0.0, 1.0]]);
    b.loads.push((p, 0.0, 0.0, m));
    b.exact.push((p, 2, m / k));
}

fn random_loads(b: &mut B, rng: &mut Rng, avoid_moment_at: &[usize]) {
    let ids: Vec<usize> = b.nodes.iter().map(|n| n.0).collect();
    if rng.below(3) == 0 {
        let (i, j) = (ids[rng.below(ids.len())], ids[rng.below(ids.len())]);
        let ((xi, zi), (xj, zj)) = (b.xz(i), b.xz(j));
        let l = ((xj - xi).powi(2) + (zj - zi).powi(2)).sqrt();
        if i != j && l > 0.0 {
            let f = magnitude(rng);
            b.loads.push((i, f * (xj - xi) / l, f * (zj - zi) / l, 0.0));
            b.loads.push((j, -f * (xj - xi) / l, -f * (zj - zi) / l, 0.0));
            return;
        }
    }
    for _ in 0..1 + rng.below(3) {
        let n = ids[rng.below(ids.len())];
        let m = if avoid_moment_at.contains(&n) || rng.below(3) != 0 { 0.0 } else { magnitude(rng) };
        b.loads.push((n, magnitude(rng), magnitude(rng), m));
    }
}

pub fn case(seed: u64) -> Case {
    let mut rng = Rng::new(seed ^ 0x2d2d);
    let family = FAMILIES[rng.below(FAMILIES.len())];
    let mut b = body(&mut rng);
    let mut hinged = vec![];
    match family {
        "supports" => random_supports(&mut b, &mut rng),
        "skew-supports" => skew_supports(&mut b, &mut rng),
        _ => fixed_root(&mut b),
    }
    match family {
        "hinge" => {
            for _ in 0..1 + rng.below(2) {
                hinged.push(hinge(&mut b, &mut rng));
            }
        }
        "connector" => connector(&mut b, &mut rng),
        "link" => link(&mut b, &mut rng),
        "near" => near(&mut b, &mut rng),
        _ => {
            if rng.below(3) == 0 {
                hinged.push(hinge(&mut b, &mut rng));
            }
        }
    }
    let quiet: Vec<usize> = if rng.below(2) == 0 { hinged.clone() } else { vec![] };
    let near_nodes: Vec<usize> = b.exact.iter().map(|e| e.0).collect();
    random_loads(&mut b, &mut rng, &[quiet, near_nodes].concat());
    rigid_body_modes(&mut b);
    build(format!("2d/{seed}"), family, b, &mut rng)
}

fn build(name: String, family: &str, mut b: B, rng: &mut Rng) -> Case {
    let scale = 10f64.powi(rng.below(7) as i32 - 3);
    for l in &mut b.loads {
        (l.1, l.2, l.3) = (l.1 * scale, l.2 * scale, l.3 * scale);
    }
    b.exact.iter_mut().for_each(|e| e.2 *= scale);
    let (a1, i1) = (10f64.powi(-2 - rng.below(2) as i32), 10f64.powi(-5 + rng.below(2) as i32));
    let input = json!({
        "nodes": b.nodes.iter().map(|n| (n.0.to_string(), json!({"id": n.0, "x": n.1, "z": n.2}))).collect::<serde_json::Map<_, _>>(),
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": a1, "iz": i1}, "2": {"id": 2, "a": 0.02, "iz": 2e-4}},
        "elements": b.elements.iter().map(|e| (e["id"].to_string(), e.clone())).collect::<serde_json::Map<_, _>>(),
        "supports": b.supports.iter().map(|s| (s["id"].to_string(), s.clone())).collect::<serde_json::Map<_, _>>(),
        "loads": b.loads.iter().map(|l| json!({"type": "nodal", "data": {"nodeId": l.0, "fx": l.1, "fz": l.2, "my": l.3}})).collect::<Vec<_>>(),
        "constraints": b.constraints,
        "connectors": b.connectors.iter().map(|c| (c["id"].to_string(), c.clone())).collect::<serde_json::Map<_, _>>(),
    });
    let s = serde_json::from_value(input).expect("generated 2D model parses");
    Case { name, family: family.into(), model: Model::D2(s), modes: b.modes.iter().map(|m| m.iter().filter(|e| *e.1 != 0.0).map(|(k, v)| (k.0, k.1, *v)).collect()).collect(), exact: b.exact, known_issue: None, must_hold: false }
}
