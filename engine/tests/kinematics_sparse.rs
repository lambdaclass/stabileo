use dedaliano_engine::solver::kinematic::{analyze_kinematics_3d, analyze_kinematics_3d_dense, analyze_kinematics_3d_sparse, KinematicResult};
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn held(node_id: usize, f: [bool; 6]) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: f[0], ry: f[1], rz: f[2], rrx: f[3], rry: f[4], rrz: f[5],
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

/// An n × n slab of MITC4 quads of 1 m at z = 3, with the supports `hold` gives each node (i, j).
fn slab(n: usize, hold: &dyn Fn(usize, usize) -> Option<[bool; 6]>) -> SolverInput3D {
    let mut input = SolverInput3D {
        solver_options: None, masses: Default::default(), nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(),
        elements: HashMap::new(), supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    };
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 30_000.0, nu: 0.2 });
    let node = |i: usize, j: usize| i * (n + 1) + j + 1;
    for i in 0..=n {
        for j in 0..=n {
            let id = node(i, j);
            input.nodes.insert(id.to_string(), SolverNode3D { id, x: i as f64, y: j as f64, z: 3.0 });
            if let Some(f) = hold(i, j) {
                input.supports.insert(id.to_string(), held(id, f));
            }
        }
    }
    let mut id = 1;
    for i in 0..n {
        for j in 0..n {
            input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: 0.2 });
            id += 1;
        }
    }
    input
}

fn free_dofs(input: &SolverInput3D) -> usize {
    6 * input.nodes.len() - input.supports.values().map(|s| [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz].iter().filter(|r| **r).count()).sum::<usize>()
}

fn verdict(r: &KinematicResult) -> (bool, &str, usize, i32) {
    (r.is_solvable, r.classification.as_str(), r.mechanism_modes, r.degree)
}

/// `input` with every DOF `r` names held too.
fn holding(input: &SolverInput3D, r: &KinematicResult) -> SolverInput3D {
    let mut out = input.clone();
    for d in &r.unconstrained_dofs {
        let key = d.node_id.to_string();
        let s = out.supports.entry(key).or_insert_with(|| held(d.node_id, [false; 6]));
        match d.dof.as_str() {
            "ux" => s.rx = true,
            "uy" => s.ry = true,
            "uz" => s.rz = true,
            "rx" => s.rrx = true,
            "ry" => s.rry = true,
            _ => s.rrz = true,
        }
    }
    out
}

const PINNED: [bool; 6] = [true, true, true, false, false, false];
const VERTICAL: [bool; 6] = [false, false, true, false, false, false];

#[test]
fn a_stable_slab_is_found_solvable_without_the_dense_elimination_and_as_the_dense_one_finds_it() {
    for n in [6, 12, 18] {
        let corners = move |i: usize, j: usize| ((i == 0 || i == n) && (j == 0 || j == n)).then_some(PINNED);
        let model = slab(n, &corners);
        let (dense, sparse, auto) = (analyze_kinematics_3d_dense(&model), analyze_kinematics_3d_sparse(&model), analyze_kinematics_3d(&model));
        assert!(dense.is_solvable && dense.mechanism_modes == 0, "n {n}: {}", dense.diagnosis);
        for other in [&sparse, &auto] {
            assert_eq!(verdict(other), verdict(&dense), "n {n}");
            assert_eq!(other.diagnosis, dense.diagnosis, "n {n}");
            assert!(other.unconstrained_dofs.is_empty() && other.mechanism_nodes.is_empty());
        }
    }
}

#[test]
fn a_mechanism_has_the_modes_it_has_and_holding_the_dofs_named_removes_it() {
    let cases: Vec<(&str, usize, Box<dyn Fn(usize, usize) -> Option<[bool; 6]>>, usize)> = vec![
        ("no supports", 8, Box::new(|_, _| None), 6),
        ("no supports", 18, Box::new(|_, _| None), 6),
        ("held vertically at three corners", 8, Box::new(|i, j| ((i == 0 && j == 0) || (i == 8 && j == 0) || (i == 0 && j == 8)).then_some(VERTICAL)), 3),
        ("held vertically at three corners", 18, Box::new(|i, j| ((i == 0 && j == 0) || (i == 18 && j == 0) || (i == 0 && j == 18)).then_some(VERTICAL)), 3),
        ("pinned at one corner", 18, Box::new(|i, j| (i == 0 && j == 0).then_some(PINNED)), 3),
        ("pinned along one edge", 18, Box::new(|i, _| (i == 0).then_some(PINNED)), 1),
    ];
    for (name, n, hold, modes) in cases {
        let model = slab(n, &*hold);
        let (dense, sparse, auto) = (analyze_kinematics_3d_dense(&model), analyze_kinematics_3d_sparse(&model), analyze_kinematics_3d(&model));
        assert_eq!(sparse.mechanism_modes, modes, "{name}, n {n}: {}", sparse.diagnosis);
        assert_eq!(sparse.unconstrained_dofs.len(), modes, "{name}, n {n}");
        assert!(!sparse.is_solvable && !sparse.mechanism_nodes.is_empty() && sparse.classification == "hypostatic");
        let fixed = analyze_kinematics_3d_sparse(&holding(&model, &sparse));
        assert!(fixed.is_solvable && fixed.mechanism_modes == 0, "{name}, n {n}: holding what is named leaves {}", fixed.diagnosis);
        // The dense elimination loses a mode of the larger free slab (five of its six).
        assert!(!dense.is_solvable && dense.mechanism_modes <= modes, "{name}, n {n}: {}", dense.diagnosis);
        if n <= 8 {
            assert_eq!(verdict(&dense), verdict(&sparse), "{name}, n {n}");
            let fixed = analyze_kinematics_3d_dense(&holding(&model, &sparse));
            assert!(fixed.is_solvable && fixed.mechanism_modes == 0, "{name}, n {n}: by the dense analysis, holding what is named leaves {}", fixed.diagnosis);
        }
        let large = free_dofs(&model) > 1500;
        let expected = if large { &sparse } else { &dense };
        assert_eq!(verdict(&auto), verdict(expected), "{name}, n {n}");
        let names = |r: &KinematicResult| r.unconstrained_dofs.iter().map(|d| (d.node_id, d.dof.clone())).collect::<Vec<_>>();
        assert_eq!(names(&auto), names(expected), "{name}, n {n}: a model of {} free DOFs is named by the {} analysis", free_dofs(&model), if large { "sparse" } else { "dense" });
        assert_eq!(auto.diagnosis, expected.diagnosis);
    }
}

#[test]
fn a_mechanism_is_diagnosed_in_a_model_too_large_for_the_dense_elimination() {
    let model = slab(40, &|i, _| (i == 0).then_some(PINNED));
    assert!(free_dofs(&model) > 9_000);
    let found = analyze_kinematics_3d(&model);
    assert_eq!((found.is_solvable, found.mechanism_modes), (false, 1), "{}", found.diagnosis);
    let fixed = analyze_kinematics_3d(&holding(&model, &found));
    assert!(fixed.is_solvable, "{}", fixed.diagnosis);
}

/// A beam of `n` frame members fixed at every fifth node, with a spring under its third, with two trusses side by side hung from its end
/// their far node held in every direction or in its rotations alone.
fn cantilever_with_a_hanging_truss(n: usize, tip_held: bool) -> SolverInput3D {
    let mut model = slab(1, &|_, _| None);
    model.nodes.clear();
    model.quads.clear();
    model.sections.insert("1".into(), serde_json::from_value(serde_json::json!({"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-4})).unwrap());
    let member = |id: usize, i: usize, j: usize, kind: &str| serde_json::from_value(serde_json::json!({
        "id": id, "nodeI": i, "nodeJ": j, "materialId": 1, "sectionId": 1, "type": kind
    })).unwrap();
    for i in 0..=n {
        model.nodes.insert((i + 1).to_string(), SolverNode3D { id: i + 1, x: i as f64, y: 0.0, z: 3.0 });
        if i > 0 { model.elements.insert(i.to_string(), member(i, i, i + 1, "frame")); }
    }
    let tip = n + 2;
    model.nodes.insert(tip.to_string(), SolverNode3D { id: tip, x: n as f64 + 1.0, y: 2.0, z: 0.0 });
    for id in [n + 1, n + 2] {
        model.elements.insert(id.to_string(), member(id, n + 1, tip, "truss"));
    }
    for i in (0..n).step_by(5) {
        model.supports.insert((i + 1).to_string(), held(i + 1, [true; 6]));
    }
    let mut spring = held(3, [false; 6]);
    spring.kz = Some(1.0e4);
    model.supports.insert("3".into(), spring);
    model.supports.insert(tip.to_string(), held(tip, if tip_held { [true; 6] } else { [false, false, false, true, true, true] }));
    model
}

#[test]
fn a_mechanism_proven_on_the_physical_springs_is_reported_as_the_dense_analysis_reports_it() {
    for n in [20, 300] {
        for tip_held in [false, true] {
            let model = cantilever_with_a_hanging_truss(n, tip_held);
            let (dense, sparse, auto) = (analyze_kinematics_3d_dense(&model), analyze_kinematics_3d_sparse(&model), analyze_kinematics_3d(&model));
            assert_eq!(dense.is_solvable, tip_held, "n {n}: {}", dense.diagnosis);
            if !tip_held {
                assert_eq!(dense.mechanism_nodes, vec![n + 2], "n {n}");
                assert!(dense.diagnosis.contains("reduced_stiffness_rank"), "n {n}: {}", dense.diagnosis);
            }
            for (name, other) in [("sparse", &sparse), ("auto", &auto)] {
                assert_eq!((verdict(other), other.kinematic_is_solvable), (verdict(&dense), dense.kinematic_is_solvable), "{name}, n {n}, tip held {tip_held}");
                assert_eq!(other.diagnosis, dense.diagnosis, "{name}, n {n}, tip held {tip_held}");
                assert_eq!(other.mechanism_nodes, dense.mechanism_nodes, "{name}, n {n}, tip held {tip_held}");
            }
        }
    }
}
