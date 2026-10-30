use clarabel::{algebra::CscMatrix, solver::*};
use serde::{Deserialize, Serialize};

#[cfg(feature = "engine-check")]
pub mod engine;

#[derive(Clone, Serialize, Deserialize)]
pub struct Layout {
    pub volume: f64,
    pub nodes: Vec<[f64; 3]>,
    pub edges: Vec<[usize; 2]>,
    pub forces: Vec<[f64; 3]>,
    pub curves: Vec<Vec<[f64; 4]>>,
    pub primal_residual: f64,
    pub dual_residual: f64,
}

pub fn square() -> Result<Layout, String> {
    let plan: [[f64; 2]; 5] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0., 0.]];
    let edges: Vec<_> = (0..5)
        .flat_map(|i| (i + 1..5).map(move |j| [i, j]))
        .collect();
    let m = edges.len();
    let pg = 1.65;
    let mut rows = vec![vec![0.; 3 * m]; 3 + 4 * m];
    let mut b = vec![0.; rows.len()];
    b[2] = -1.;
    let mut cost = vec![0.; 3 * m];
    for (e, &[i, j]) in edges.iter().enumerate() {
        let dx = plan[j][0] - plan[i][0];
        let dy = plan[j][1] - plan[i][1];
        // Pin the SOCP coefficients across host libcs. A last-bit difference in
        // sin/cos changes the interior-point trajectory enough to exceed the
        // full frame-section regression tolerance after area is squared.
        let length = libm::hypot(dx, dy);
        let (sn, cs) = (libm::sin(pg * length), libm::cos(pg * length));
        let (s, a, z) = (3 * e, 3 * e + 1, 3 * e + 2);
        if j == 4 {
            rows[0][s] = dx / length;
            rows[1][s] = dy / length;
            rows[2][z] = 1.;
        }
        rows[3 + e][s] = -1.;
        let r = 3 + m + 3 * e;
        rows[r][s] = -2. * cs;
        rows[r][a] = -sn;
        rows[r][z] = -sn;
        rows[r + 1][a] = -sn;
        rows[r + 1][z] = sn;
        rows[r + 2][s] = -2.;
        cost[a] = 1. / pg;
        cost[z] = 1. / pg;
    }
    let mut colptr = vec![0];
    let mut rowval = Vec::new();
    let mut nzval = Vec::new();
    for c in 0..3 * m {
        for (r, row) in rows.iter().enumerate() {
            if row[c] != 0. {
                rowval.push(r);
                nzval.push(row[c]);
            }
        }
        colptr.push(nzval.len());
    }
    let a = CscMatrix::new(rows.len(), 3 * m, colptr, rowval, nzval);
    let p = CscMatrix::zeros((3 * m, 3 * m));
    let mut cones = vec![ZeroConeT(3), NonnegativeConeT(m)];
    cones.extend((0..m).map(|_| SecondOrderConeT(3)));
    let settings = DefaultSettingsBuilder::default()
        .verbose(false)
        .tol_gap_abs(1e-10)
        .tol_gap_rel(1e-10)
        .tol_feas(1e-10)
        .build()
        .map_err(|e| e.to_string())?;
    let mut solver =
        DefaultSolver::new(&p, &cost, &a, &b, &cones, settings).map_err(|e| e.to_string())?;
    solver.solve();
    if solver.solution.status != SolverStatus::Solved {
        return Err(format!("{:?}", solver.solution.status));
    }
    let solution = solver.solution;
    let height = (1. + pg * solution.z[2]).ln() / (2. * pg);
    let mut nodes: Vec<_> = plan.iter().map(|p| [p[0], p[1], 0.]).collect();
    nodes[4][2] = height;
    let forces: Vec<[f64; 3]> = solution
        .x
        .chunks_exact(3)
        .map(|v| [v[0], v[1], v[2]])
        .collect();
    let mut curves = Vec::new();
    for (&[i, j], &[s, qa, _]) in edges.iter().zip(&forces) {
        if s <= 1e-5 {
            continue;
        }
        let length = (plan[j][0] - plan[i][0]).hypot(plan[j][1] - plan[i][1]);
        let theta = (qa / s).atan();
        curves.push(
            (0..=32)
                .map(|k| {
                    let t = k as f64 / 32.;
                    let angle = theta - pg * length * t;
                    let z = nodes[i][2] + (angle.cos() / theta.cos()).ln() / pg;
                    [
                        plan[i][0] + t * (plan[j][0] - plan[i][0]),
                        plan[i][1] + t * (plan[j][1] - plan[i][1]),
                        z,
                        s / angle.cos(),
                    ]
                })
                .collect(),
        );
    }
    Ok(Layout {
        volume: solution.obj_val,
        nodes,
        edges,
        forces,
        curves,
        primal_residual: solution.r_prim,
        dual_residual: solution.r_dual,
    })
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub fn recompute() -> Result<String, wasm_bindgen::JsValue> {
    square()
        .and_then(|l| serde_json::to_string(&l).map_err(|e| e.to_string()))
        .map_err(|e| wasm_bindgen::JsValue::from_str(&e))
}
