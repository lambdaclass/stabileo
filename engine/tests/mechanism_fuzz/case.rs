use dedaliano_engine::types::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type Dof = (usize, usize);
pub type Vector = BTreeMap<Dof, f64>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "dim", content = "input")]
pub enum Model {
    #[serde(rename = "2d")]
    D2(SolverInput),
    #[serde(rename = "3d")]
    D3(SolverInput3D),
}

/// A model with a zero-energy basis known by construction: every element, spring, connector and
/// support of the model does no work under each mode, so a load doing work on one has no
/// equilibrium. `exact` lists displacements the model fixes in closed form.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub name: String,
    pub family: String,
    pub model: Model,
    pub modes: Vec<Vec<(usize, usize, f64)>>,
    #[serde(default)]
    pub exact: Vec<(usize, usize, f64)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub known_issue: Option<u32>,
}

impl Case {
    pub fn mode_vectors(&self) -> Vec<Vector> {
        self.modes.iter().map(|m| m.iter().map(|&(n, d, v)| ((n, d), v)).collect()).collect()
    }

    pub fn loads(&self) -> Vector {
        let mut p = Vector::new();
        let mut add = |n: usize, d: usize, v: f64| *p.entry((n, d)).or_insert(0.0) += v;
        match &self.model {
            Model::D2(s) => {
                for l in &s.loads {
                    if let SolverLoad::Nodal(l) = l {
                        add(l.node_id, 0, l.fx);
                        add(l.node_id, 1, l.fz);
                        add(l.node_id, 2, l.my);
                    }
                }
            }
            Model::D3(s) => {
                for l in &s.loads {
                    if let SolverLoad3D::Nodal(l) = l {
                        for (d, v) in [l.fx, l.fy, l.fz, l.mx, l.my, l.mz].into_iter().enumerate() {
                            add(l.node_id, d, v);
                        }
                    }
                }
            }
        }
        p
    }

    pub fn node_ids(&self) -> Vec<usize> {
        let mut v: Vec<usize> = match &self.model {
            Model::D2(s) => s.nodes.values().map(|n| n.id).collect(),
            Model::D3(s) => s.nodes.values().map(|n| n.id).collect(),
        };
        v.sort_unstable();
        v
    }
}

pub fn dot(a: &Vector, b: &Vector) -> f64 {
    a.iter().map(|(k, x)| x * b.get(k).copied().unwrap_or(0.0)).sum()
}

pub fn norm(a: &Vector) -> f64 {
    dot(a, a).sqrt()
}

pub fn orthonormal(modes: &[Vector]) -> Vec<Vector> {
    let mut out: Vec<Vector> = Vec::new();
    for m in modes {
        let n0 = norm(m);
        if n0 == 0.0 {
            continue;
        }
        let mut v = m.clone();
        for q in &out {
            let c = dot(&v, q);
            for (k, x) in q {
                *v.entry(*k).or_insert(0.0) -= c * x;
            }
        }
        let n = norm(&v);
        if n > 1e-9 * n0 {
            v.values_mut().for_each(|x| *x /= n);
            out.push(v);
        }
    }
    out
}

pub fn displacements_2d(r: &AnalysisResults) -> Vector {
    r.displacements.iter().flat_map(|d| [((d.node_id, 0), d.ux), ((d.node_id, 1), d.uz), ((d.node_id, 2), d.ry)]).collect()
}

pub fn displacements_3d(r: &AnalysisResults3D) -> Vector {
    r.displacements
        .iter()
        .flat_map(|d| [((d.node_id, 0), d.ux), ((d.node_id, 1), d.uy), ((d.node_id, 2), d.uz), ((d.node_id, 3), d.rx), ((d.node_id, 4), d.ry), ((d.node_id, 5), d.rz)])
        .collect()
}
