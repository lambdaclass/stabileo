use crate::case::*;
use crate::oracle::Outcome;

pub const ROTATIONAL_SPRING_REPLACED: u32 = 1437;
pub const SINGULAR_PIVOT_CERTIFIED: u32 = 458;

pub fn classify(c: &Case, o: &Outcome) -> Option<u32> {
    let Outcome::Silent(v, u) = o else { return None };
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
