use crate::case::*;
use crate::oracle::Outcome;

pub const CONNECTOR_TIED_ROTATION: u32 = 1414;
pub const ROTATIONAL_SPRING_REPLACED: u32 = 1437;
pub const SINGULAR_PIVOT_CERTIFIED: u32 = 458;

fn holds(mode: &[(usize, usize, f64)], node: usize, dof: usize) -> bool {
    mode.iter().any(|e| e.0 == node && e.1 == dof && e.2 != 0.0)
}

pub fn classify(c: &Case, o: &Outcome) -> Option<u32> {
    let Outcome::Silent(v, u) = o else { return None };
    if let Model::D2(s) = &c.model {
        let tied: Vec<bool> = c.modes.iter().map(|m| s.connectors.values().any(|k| k.k_moment > 0.0 && holds(m, k.node_i, 2) && holds(m, k.node_j, 2))).collect();
        let modes = c.mode_vectors();
        let others: Vec<Vector> = modes.iter().zip(&tied).filter(|(_, t)| !**t).map(|(m, _)| m.clone()).collect();
        let along_others: f64 = orthonormal(&others).iter().map(|q| dot(q, u).powi(2)).sum::<f64>().sqrt();
        let only_tied = v.iter().all(|x| match x.strip_prefix("mode ").and_then(|r| r.split(':').next()).and_then(|k| k.parse::<usize>().ok()) {
            Some(k) => tied.get(k).copied().unwrap_or(false),
            None => x.starts_with("the response ") || x.starts_with("certified despite "),
        });
        if tied.contains(&true) && c.exact.is_empty() && only_tied && along_others <= 1e-6 * norm(u) {
            return Some(CONNECTOR_TIED_ROTATION);
        }
    }
    let inclined = match &c.model {
        Model::D2(s) => s.supports.values().any(|x| x.support_type == "inclinedRoller"),
        Model::D3(s) => s.supports.values().any(|x| x.is_inclined == Some(true)),
    };
    let mechanism_only = v.iter().all(|x| x.starts_with("mode ") || x.starts_with("the response ") || x.starts_with("certified despite "));
    if inclined && c.exact.is_empty() && mechanism_only && v.iter().any(|x| x.starts_with("certified despite StiffnessNotPositiveDefinite")) {
        return Some(SINGULAR_PIVOT_CERTIFIED);
    }
    if let (Model::D2(s), true) = (&c.model, c.modes.is_empty() && !c.exact.is_empty() && v.iter().all(|x| x.starts_with("node "))) {
        if c.exact.iter().all(|e| spring_replaced(s, e, u)) {
            return Some(ROTATIONAL_SPRING_REPLACED);
        }
    }
    None
}

fn spring_replaced(s: &dedaliano_engine::types::SolverInput, &(node, dof, exact): &(usize, usize, f64), u: &Vector) -> bool {
    let k: f64 = s.supports.values().filter(|x| x.node_id == node && x.support_type == "spring").filter_map(|x| x.kz).sum();
    let Some(&got) = u.get(&(node, dof)) else { return false };
    let moment = exact * k;
    dof == 2 && k > 0.0 && k <= 1e-6 && got.is_finite() && got != 0.0 && moment / got >= 1e3 * k
}
