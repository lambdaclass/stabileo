use crate::case::*;
use crate::oracle::Outcome;

pub const SINGULAR_PIVOT_CERTIFIED: u32 = 458;

pub fn classify(c: &Case, o: &Outcome) -> Option<u32> {
    let Outcome::Silent(v, _) = o else { return None };
    let inclined = match &c.model {
        Model::D2(s) => s.supports.values().any(|x| x.support_type == "inclinedRoller"),
        Model::D3(s) => s.supports.values().any(|x| x.is_inclined == Some(true)),
    };
    let mechanism_only = v.iter().all(|x| x.starts_with("mode ") || x.starts_with("the response ") || x.starts_with("certified despite "));
    if inclined && c.exact.is_empty() && mechanism_only && v.iter().any(|x| x.starts_with("certified despite StiffnessNotPositiveDefinite")) {
        return Some(SINGULAR_PIVOT_CERTIFIED);
    }
    None
}
