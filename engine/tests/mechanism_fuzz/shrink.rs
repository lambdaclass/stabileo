use crate::case::*;
use dedaliano_engine::types::*;

fn constraint_nodes(c: &Constraint) -> Vec<usize> {
    serde_json::to_value(c)
        .ok()
        .map(|v| {
            let mut out = vec![];
            for k in ["masterNode", "slaveNode", "nodeId"] {
                if let Some(n) = v.get(k).and_then(|x| x.as_u64()) {
                    out.push(n as usize);
                }
            }
            for k in ["slaveNodes"] {
                if let Some(a) = v.get(k).and_then(|x| x.as_array()) {
                    out.extend(a.iter().filter_map(|x| x.as_u64()).map(|n| n as usize));
                }
            }
            if let Some(a) = v.get("terms").and_then(|x| x.as_array()) {
                out.extend(a.iter().filter_map(|t| t.get("nodeId").and_then(|x| x.as_u64())).map(|n| n as usize));
            }
            out
        })
        .unwrap_or_default()
}

fn load_node(l: &Model, k: usize) -> Option<usize> {
    match l {
        Model::D2(s) => match &s.loads[k] {
            SolverLoad::Nodal(n) => Some(n.node_id),
            _ => None,
        },
        Model::D3(s) => match &s.loads[k] {
            SolverLoad3D::Nodal(n) => Some(n.node_id),
            _ => None,
        },
    }
}

fn keys<T>(m: &std::collections::HashMap<String, T>) -> Vec<String> {
    let mut k: Vec<String> = m.keys().cloned().collect();
    k.sort_by_key(|x| (x.len(), x.clone()));
    k
}

fn candidates(c: &Case) -> Vec<Case> {
    let mut out = vec![];
    let n_loads = match &c.model {
        Model::D2(s) => s.loads.len(),
        Model::D3(s) => s.loads.len(),
    };
    for k in 0..n_loads {
        let mut t = c.clone();
        let node = load_node(&t.model, k);
        match &mut t.model {
            Model::D2(s) => {
                s.loads.remove(k);
            }
            Model::D3(s) => {
                s.loads.remove(k);
            }
        }
        t.exact.retain(|e| Some(e.0) != node);
        out.push(t);
    }
    let (connectors, constraints, supports, elements) = match &c.model {
        Model::D2(s) => (keys(&s.connectors), s.constraints.len(), keys(&s.supports), keys(&s.elements)),
        Model::D3(s) => (keys(&s.connectors), s.constraints.len(), keys(&s.supports), keys(&s.elements)),
    };
    for k in &connectors {
        let mut t = c.clone();
        match &mut t.model {
            Model::D2(s) => {
                s.connectors.remove(k);
            }
            Model::D3(s) => {
                s.connectors.remove(k);
            }
        }
        out.push(t);
    }
    for k in 0..constraints {
        let mut t = c.clone();
        match &mut t.model {
            Model::D2(s) => {
                s.constraints.remove(k);
            }
            Model::D3(s) => {
                s.constraints.remove(k);
            }
        }
        out.push(t);
    }
    for k in &supports {
        let mut t = c.clone();
        let node = match &mut t.model {
            Model::D2(s) => s.supports.remove(k).map(|x| x.node_id),
            Model::D3(s) => s.supports.remove(k).map(|x| x.node_id),
        };
        t.exact.retain(|e| Some(e.0) != node);
        out.push(t);
    }
    for k in &elements {
        let mut t = c.clone();
        match &mut t.model {
            Model::D2(s) => {
                s.elements.remove(k);
            }
            Model::D3(s) => {
                s.elements.remove(k);
            }
        }
        out.push(t);
    }
    for n in c.node_ids() {
        let mut t = c.clone();
        match &mut t.model {
            Model::D2(s) => {
                s.nodes.retain(|_, x| x.id != n);
                s.elements.retain(|_, e| e.node_i != n && e.node_j != n);
                s.connectors.retain(|_, e| e.node_i != n && e.node_j != n);
                s.constraints.retain(|x| !constraint_nodes(x).contains(&n));
                s.supports.retain(|_, x| x.node_id != n);
                s.loads.retain(|l| !matches!(l, SolverLoad::Nodal(x) if x.node_id == n));
            }
            Model::D3(s) => {
                s.nodes.retain(|_, x| x.id != n);
                s.elements.retain(|_, e| e.node_i != n && e.node_j != n);
                s.connectors.retain(|_, e| e.node_i != n && e.node_j != n);
                s.constraints.retain(|x| !constraint_nodes(x).contains(&n));
                s.supports.retain(|_, x| x.node_id != n);
                s.loads.retain(|l| !matches!(l, SolverLoad3D::Nodal(x) if x.node_id == n));
            }
        }
        for m in &mut t.modes {
            m.retain(|e| e.0 != n);
        }
        t.modes.retain(|m| !m.is_empty());
        t.exact.retain(|e| e.0 != n);
        out.push(t);
    }
    for n in c.node_ids() {
        let used = match &c.model {
            Model::D2(s) => s.elements.values().any(|e| e.node_i == n || e.node_j == n) || s.connectors.values().any(|e| e.node_i == n || e.node_j == n) || s.constraints.iter().any(|x| constraint_nodes(x).contains(&n)),
            Model::D3(s) => s.elements.values().any(|e| e.node_i == n || e.node_j == n) || s.connectors.values().any(|e| e.node_i == n || e.node_j == n) || s.constraints.iter().any(|x| constraint_nodes(x).contains(&n)),
        };
        if used {
            continue;
        }
        let mut t = c.clone();
        match &mut t.model {
            Model::D2(s) => {
                s.nodes.retain(|_, x| x.id != n);
                s.supports.retain(|_, x| x.node_id != n);
                s.loads.retain(|l| !matches!(l, SolverLoad::Nodal(x) if x.node_id == n));
            }
            Model::D3(s) => {
                s.nodes.retain(|_, x| x.id != n);
                s.supports.retain(|_, x| x.node_id != n);
                s.loads.retain(|l| !matches!(l, SolverLoad3D::Nodal(x) if x.node_id == n));
            }
        }
        for m in &mut t.modes {
            m.retain(|e| e.0 != n);
        }
        t.modes.retain(|m| !m.is_empty());
        t.exact.retain(|e| e.0 != n);
        out.push(t);
    }
    out
}

/// Greedily drop loads, connectors, constraints, supports, elements and nodes while
/// `still_fails` holds. Every mode stays zero-energy: a sub-model only loses stiffness.
pub fn minimise(case: &Case, still_fails: impl Fn(&Case) -> bool) -> Case {
    let mut best = case.clone();
    loop {
        let Some(next) = candidates(&best).into_iter().find(|t| still_fails(t)) else { return best };
        best = next;
    }
}
