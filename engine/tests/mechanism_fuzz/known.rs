use crate::case::*;
use crate::oracle::Outcome;

pub const CONNECTOR_TIED_ROTATION: u32 = 1414;
pub const ROTATIONAL_SPRING_REPLACED: u32 = 1437;
pub const SINGULAR_PIVOT_CERTIFIED: u32 = 458;

fn holds(mode: &[(usize, usize, f64)], node: usize, dof: usize) -> bool {
    mode.iter().any(|e| e.0 == node && e.1 == dof && e.2 != 0.0)
}

pub fn classify(c: &Case, o: &Outcome) -> Option<u32> {
    let Outcome::Silent(v) = o else { return None };
    if let Model::D2(s) = &c.model {
        let tied = s.connectors.values().any(|k| k.k_moment > 0.0 && c.modes.iter().any(|m| holds(m, k.node_i, 2) && holds(m, k.node_j, 2)));
        if tied && c.exact.is_empty() && v.iter().all(|x| x.starts_with("mode ") || x.starts_with("the response ") || x.starts_with("certified despite ")) {
            return Some(CONNECTOR_TIED_ROTATION);
        }
    }
    if c.exact.is_empty() && v.iter().any(|x| x.starts_with("certified despite StiffnessNotPositiveDefinite")) {
        return Some(SINGULAR_PIVOT_CERTIFIED);
    }
    if matches!(c.model, Model::D2(_)) && c.modes.is_empty() && !c.exact.is_empty() && v.iter().all(|x| x.starts_with("node ")) {
        return Some(ROTATIONAL_SPRING_REPLACED);
    }
    None
}
