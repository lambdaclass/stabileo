//! Reproducible end-to-end Newton-Krylov timings; results are included for exact comparisons.
//! Run via `make bench.engine.krylov-work REPEATS=7` (release, experimental feature only).
use dedaliano_engine::{
    solver::experimental_nonlinear::{
        solve_corotational_3d_profiled, solve_corotational_3d_stepped, IterationMethod,
        LoadStepping, NonlinearWork,
    },
    types::SolverInput3D,
};
use std::{hint::black_box, time::Instant};
fn building(bays: usize, stories: usize, push: f64) -> SolverInput3D {
    let id = |i: usize, j: usize, k: usize| 1 + i + (bays + 1) * (j + (bays + 1) * k);
    let (mut nodes, mut elements, mut supports, mut loads) = (
        serde_json::Map::new(),
        serde_json::Map::new(),
        serde_json::Map::new(),
        Vec::new(),
    );
    let mut member = |a: usize, b: usize, section: usize| {
        let e = elements.len() + 1;
        elements.insert(e.to_string(), serde_json::json!({"id": e, "type": "frame", "nodeI": a, "nodeJ": b, "materialId": 1, "sectionId": section}));
    };
    for k in 0..=stories {
        for j in 0..=bays {
            for i in 0..=bays {
                let n = id(i, j, k);
                nodes.insert(n.to_string(), serde_json::json!({"id": n, "x": 5.0 * i as f64, "y": 5.0 * j as f64, "z": 3.0 * k as f64}));
                if k == 0 {
                    supports.insert(n.to_string(), serde_json::json!({"nodeId": n, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}));
                    continue;
                }
                member(id(i, j, k - 1), n, 1);
                if i > 0 {
                    member(id(i - 1, j, k), n, 2);
                }
                if j > 0 {
                    member(id(i, j - 1, k), n, 2);
                }
                loads.push(serde_json::json!({"type": "nodal", "data": {"nodeId": n, "fx": push, "fy": 0.4 * push, "fz": -40.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}));
            }
        }
    }
    serde_json::from_value(serde_json::json!({
            "nodes": nodes, "elements": elements, "supports": supports, "loads": loads,
            "materials": {"1": {"id": 1, "e": 30000.0, "nu": 0.2}},
            "sections": {"1": {"id": 1, "a": 0.25, "iy": 5.2e-3, "iz": 5.2e-3, "j": 8.8e-3}, "2": {"id": 2, "a": 0.18, "iy": 5.4e-3, "iz": 1.35e-3, "j": 3.7e-3}}
        })).unwrap()
}

fn main() {
    let repeats: usize = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "7".into())
        .parse()
        .unwrap();
    assert!((1..=100).contains(&repeats));
    for (name, bays, stories, constrained, push) in [
        ("small-building", 2, 3, false, 20.0),
        ("building", 4, 6, false, 20.0),
        ("building-mpc", 4, 6, true, 20.0),
        ("large-building", 6, 10, false, 20.0),
        ("large-building-mpc", 6, 10, true, 20.0),
        ("large-drift", 4, 6, true, 200.0),
    ] {
        let mut input = building(bays, stories, push);
        if constrained {
            for k in 1..=stories {
                let master = 1 + (bays + 1) * (bays + 1) * k;
                for j in 1..=bays {
                    let slave = master + (bays + 1) * j;
                    input.constraints.push(serde_json::from_value(serde_json::json!({"type":"linearMPC", "terms":[
                        {"nodeId":master,"dof":0,"coefficient":1.0}, {"nodeId":slave,"dof":0,"coefficient":-1.0}
                    ]})).unwrap());
                }
            }
        }
        let run = || {
            solve_corotational_3d_stepped(
                black_box(&input),
                80,
                1e-8,
                4,
                IterationMethod::NewtonKrylov,
                LoadStepping::Equal,
            )
            .unwrap()
        };
        // One warm-up in both revisions. Profiling adds no extra solve between cases.
        let mut work = NonlinearWork::default();
        let expected = solve_corotational_3d_profiled(
            &input,
            80,
            1e-8,
            4,
            IterationMethod::NewtonKrylov,
            LoadStepping::Equal,
            &mut work,
        )
        .unwrap();
        assert!(expected.converged, "{name}");
        let mut ns = Vec::new();
        for _ in 0..repeats {
            let start = Instant::now();
            let result = run();
            ns.push(start.elapsed().as_nanos() as u64);
            assert_eq!(
                serde_json::to_value(&result).unwrap(),
                serde_json::to_value(&expected).unwrap()
            );
        }
        println!(
            "{}",
            serde_json::json!({"case":name,"nodes":input.nodes.len(),"samplesNs":ns,"result":expected,"work":work})
        );
    }
}
