use crate::model::roorda;
use dedaliano_engine::solver::{
    arc_length::{solve_arc_length, ArcLengthInput},
    buckling::solve_buckling_2d,
};
use serde_json::json;
pub fn reproduce() -> serde_json::Value {
    let n = 10;
    let input = roorda(n, 0.001);
    let perfect = roorda(n, 0.);
    let buckling = solve_buckling_2d(&perfect, 1).unwrap();
    let mut frames = vec![json!({"lambda":0.,"theta":0.,"displacement":vec![0.;2*(2*n+1)]})];
    for steps in (4..=100).step_by(4) {
        let config:ArcLengthInput=serde_json::from_value(json!({"solver":input,"maxSteps":steps,"maxIter":40,"tolerance":1e-9,"initialDs":0.04,"minDs":1e-7,"maxDs":0.04,"targetIter":5})).unwrap();
        let run = solve_arc_length(&config).unwrap();
        assert!(run.converged && run.steps.iter().all(|s| s.converged));
        let mut displacement = vec![0.; 2 * (2 * n + 1)];
        let mut theta = 0.;
        for d in &run.results.displacements {
            displacement[2 * (d.node_id - 1)] = d.ux;
            displacement[2 * (d.node_id - 1) + 1] = d.uz;
            if d.node_id == n + 1 {
                theta = d.ry;
            }
        }
        frames.push(
            json!({"lambda":run.final_load_factor,"theta":theta,"displacement":displacement}),
        );
    }
    let mut nodes = vec![];
    for i in 0..=2 * n {
        let node = input.nodes.values().find(|p| p.id == i + 1).unwrap();
        nodes.extend([node.x, node.z]);
    }
    let cells: Vec<_> = (0..2 * n).flat_map(|i| [i, i + 1]).collect();
    let result = json!({"lambda":buckling.modes[0].load_factor,"model":input,"nodes":nodes,"cells":cells,"frames":frames,"koiter":null,"scope":"Production buckling and imperfect arc-length path only; no accepted Koiter coefficients or near-bifurcation comparison."});
    result
}
