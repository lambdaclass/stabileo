use dedaliano_engine::linalg::{
    numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky, CscMatrix,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Net {
    pub nodes: Vec<[f64; 3]>,
    pub fixed: Vec<bool>,
    pub edges: Vec<[usize; 2]>,
    pub densities: Vec<f64>,
    pub loads: Vec<[f64; 3]>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Form {
    pub nodes: Vec<[f64; 3]>,
    pub edges: Vec<[usize; 2]>,
    pub forces: Vec<f64>,
    pub residual: f64,
    pub q: f64,
    pub load: f64,
}

pub fn solve(net: &Net) -> Result<Form, String> {
    let n = net.nodes.len();
    if n == 0
        || n > 10000
        || net.edges.len() > 50000
        || net.fixed.len() != n
        || net.loads.len() != n
        || net.edges.len() != net.densities.len()
        || net.edges.is_empty()
        || net
            .nodes
            .iter()
            .chain(&net.loads)
            .flatten()
            .any(|x| !x.is_finite())
        || net.densities.iter().any(|q| !q.is_finite() || *q <= 0.)
        || net
            .edges
            .iter()
            .any(|e| e[0] >= n || e[1] >= n || e[0] == e[1])
    {
        return Err(
            "Expected a finite positive-density network with valid dimensions and edges".into(),
        );
    }
    let mut adjacency = vec![Vec::new(); n];
    for &[a, b] in &net.edges {
        adjacency[a].push(b);
        adjacency[b].push(a);
    }
    let mut anchored = net.fixed.clone();
    let mut pending: Vec<usize> = (0..n).filter(|&i| net.fixed[i]).collect();
    while let Some(i) = pending.pop() {
        for &j in &adjacency[i] {
            if !anchored[j] {
                anchored[j] = true;
                pending.push(j);
            }
        }
    }
    if anchored.iter().any(|a| !a) {
        return Err("Every component must reach a fixed node".into());
    }
    let free: Vec<usize> = (0..n).filter(|&i| !net.fixed[i]).collect();
    if free.is_empty() {
        return Err("At least one free node is required".into());
    }
    let mut index = vec![None; n];
    for (j, &i) in free.iter().enumerate() {
        index[i] = Some(j);
    }
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut values = Vec::new();
    let mut rhs: Vec<[f64; 3]> = free.iter().map(|&i| net.loads[i]).collect();
    for (&[a, b], &q) in net.edges.iter().zip(&net.densities) {
        for (i, j) in [(a, b), (b, a)] {
            if let Some(ii) = index[i] {
                rows.push(ii);
                cols.push(ii);
                values.push(q);
                if let Some(jj) = index[j] {
                    if ii >= jj {
                        rows.push(ii);
                        cols.push(jj);
                        values.push(-q);
                    }
                } else {
                    for d in 0..3 {
                        rhs[ii][d] += q * net.nodes[j][d];
                    }
                }
            }
        }
    }
    let matrix = CscMatrix::from_triplets(free.len(), &rows, &cols, &values);
    let symbolic = std::rc::Rc::new(symbolic_cholesky(&matrix));
    let factor = numeric_cholesky(&symbolic, &matrix).ok_or("Unanchored or singular network")?;
    let mut nodes = net.nodes.clone();
    for d in 0..3 {
        let b: Vec<f64> = rhs.iter().map(|p| p[d]).collect();
        let x = sparse_cholesky_solve(&factor, &b);
        for (&i, v) in free.iter().zip(x) {
            nodes[i][d] = v;
        }
    }
    let mut residual = net.loads.clone();
    let mut forces = Vec::new();
    for (&[a, b], &q) in net.edges.iter().zip(&net.densities) {
        let mut length2 = 0.;
        for d in 0..3 {
            let delta = nodes[b][d] - nodes[a][d];
            length2 += delta * delta;
            residual[a][d] += q * delta;
            residual[b][d] -= q * delta;
        }
        if length2 <= 1e-24 {
            return Err("Collapsed member".into());
        }
        forces.push(q * length2.sqrt());
    }
    let residual = free
        .iter()
        .flat_map(|&i| residual[i])
        .map(f64::abs)
        .fold(0., f64::max);
    if nodes
        .iter()
        .flatten()
        .chain(&forces)
        .any(|v| !v.is_finite())
        || !residual.is_finite()
    {
        return Err("Nonfinite solution".into());
    }
    Ok(Form {
        nodes,
        edges: net.edges.clone(),
        forces,
        residual,
        q: 0.,
        load: 0.,
    })
}

pub fn four_bar(q: f64, load: f64) -> Result<Form, String> {
    if !q.is_finite()
        || !load.is_finite()
        || !(0.5..=2.).contains(&q)
        || !(1.0..=8.).contains(&load)
    {
        return Err("q must be in [0.5, 2] kN/m and downward load in [1, 8] kN".into());
    }
    let net = Net {
        nodes: vec![
            [0., 0., 0.],
            [-2., -2., 0.],
            [2., -2., 0.],
            [2., 2., 0.],
            [-2., 2., 0.],
        ],
        fixed: vec![false, true, true, true, true],
        edges: vec![[0, 1], [0, 2], [0, 3], [0, 4]],
        densities: vec![q; 4],
        loads: vec![[0., 0., -load], [0.; 3], [0.; 3], [0.; 3], [0.; 3]],
    };
    let mut form = solve(&net)?;
    form.q = q;
    form.load = load;
    Ok(form)
}

pub fn engine_input(form: &Form) -> serde_json::Value {
    use serde_json::{json, Map};
    let nodes: Map<String, _> = form
        .nodes
        .iter()
        .enumerate()
        .map(|(i, p)| {
            (
                (i + 1).to_string(),
                json!({"id":i+1,"x":p[0],"y":p[1],"z":p[2]}),
            )
        })
        .collect();
    let elements: Map<String, _> = form.edges.iter().enumerate().map(|(i,e)| ((i+1).to_string(), json!({"id":i+1,"type":"truss","nodeI":e[0]+1,"nodeJ":e[1]+1,"materialId":1,"sectionId":1}))).collect();
    let supports: Map<String, _> = (2..=5)
        .map(|i| {
            (
                i.to_string(),
                json!({"nodeId":i,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}),
            )
        })
        .collect();
    json!({"nodes":nodes,"elements":elements,"supports":supports,
        "materials":{"1":{"id":1,"e":200000.,"nu":0.3}},
        "sections":{"1":{"id":1,"a":0.001,"iy":1e-8,"iz":1e-8,"j":1e-8}},
        "loads":[{"type":"nodal","data":{"nodeId":1,"fx":0.,"fy":0.,"fz":-form.load,"mx":0.,"my":0.,"mz":0.}}]})
}
