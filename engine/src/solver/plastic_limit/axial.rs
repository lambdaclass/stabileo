use crate::certify::exact::{q, qi, Q};
use crate::certify::plastic::{ElemLoad, PElem, PlasticModel, EXACT_MAX_ABS, EXACT_MIN_ABS};
use crate::types::{SolverInput, SolverLoad};
use num_traits::{One, Signed, Zero};
use std::collections::{BTreeMap, HashMap};

#[derive(Clone, Default)]
struct Change {
    intensity: Q,
    slope: Q,
    point: Q,
}

#[derive(Clone, Default)]
pub(super) struct AxialField {
    start_share: Q,
    envelope: Q,
    resultant_radius: Q,
    changes: BTreeMap<Q, Change>,
}

pub(super) fn assemble(input: &SolverInput, model: &mut PlasticModel) -> Result<HashMap<usize, AxialField>, String> {
    let mut fields = HashMap::<usize, AxialField>::new();
    let members: HashMap<_, _> = model.elems.iter().map(|e| (e.id, e)).collect();
    for load in &input.loads {
        let SolverLoad::AxialDistributed(load) = load else { continue };
        if load.q_i == 0.0 && load.q_j == 0.0 { continue; }
        crate::certify::finite::check_magnitudes(load, EXACT_MIN_ABS, EXACT_MAX_ABS)?;
        let e = members.get(&load.element_id).ok_or("axial span load on unknown element")?;
        let geometric_length = (crate::certify::exact::to_f64(&e.dx).powi(2) + crate::certify::exact::to_f64(&e.dz).powi(2)).sqrt();
        let start = load.a.unwrap_or(0.0);
        let end = load.b.unwrap_or(geometric_length);
        if !start.is_finite() || !end.is_finite() || start < 0.0 || end < start || end > geometric_length {
            return Err(format!("element {}: axial span load outside the member", e.id));
        }
        if (start != geometric_length && q(start).unwrap().pow(2) > e.l2)
            || (end != geometric_length && q(end).unwrap().pow(2) > e.l2)
        {
            return Err(format!("element {}: axial span load outside the member", e.id));
        }
        if start == end { continue; }
        let qa = q(load.q_i).ok_or("non-finite axial load")?;
        let qb = q(load.q_j).ok_or("non-finite axial load")?;
        let (a, b) = if start == 0.0 && end == geometric_length {
            (Q::zero(), Q::one())
        } else if let Some(length) = &e.l {
            let fraction = |x| if x == geometric_length { Q::one() } else { q(x).unwrap() / length };
            (fraction(start), fraction(end))
        } else {
            let mut lo = geometric_length;
            let mut hi = geometric_length;
            while q(lo).ok_or("unrepresentable member length")?.pow(2) > e.l2 { lo = lo.next_down(); }
            while q(hi).ok_or("unrepresentable member length")?.pow(2) < e.l2 { hi = hi.next_up(); }
            let (lo, hi) = (q(lo).unwrap(), q(hi).unwrap());
            let width = |length: &Q| {
                let b = if end == geometric_length { Q::one() } else { q(end).unwrap() / length };
                b - q(start).unwrap() / length
            };
            let mean = (&qa + &qb) / qi(2);
            let (left, right) = (width(&lo) * &mean, width(&hi) * mean);
            let centre = (&left + &right) / qi(2);
            model.nodal[e.ni][0] += &centre * &e.dx;
            model.nodal[e.ni][1] += &centre * &e.dz;
            let field = fields.entry(e.id).or_default();
            field.envelope += qa.abs().max(qb.abs()) * &e.l2;
            if !model.restrained[e.ni][0] || !model.restrained[e.ni][1] {
                field.resultant_radius += (left - right).abs() / qi(2);
            }
            continue;
        };
        let width = &b - &a;
        let total = &width * (&qa + &qb) / qi(2);
        let share_j = &a * &total + &width * &width * (&qa + qi(2) * &qb) / qi(6);
        let share_i = total - &share_j;
        for (node, share) in [(e.ni, &share_i), (e.nj, &share_j)] {
            model.nodal[node][0] += share * &e.dx;
            model.nodal[node][1] += share * &e.dz;
        }
        let field = fields.entry(e.id).or_default();
        field.start_share += share_i * &e.l2;
        let slope = (&qb - &qa) * &e.l2 / width;
        let start = field.changes.entry(a).or_default();
        start.intensity += qa * &e.l2;
        start.slope += &slope;
        let end = field.changes.entry(b).or_default();
        end.intensity -= qb * &e.l2;
        end.slope -= slope;
    }
    Ok(fields)
}

pub(super) fn resultant_perturbations(model: &PlasticModel, fields: &HashMap<usize, AxialField>) -> Vec<(usize, Q, Q)> {
    let mut out: Vec<_> = model.elems.iter().filter_map(|e| {
        let radius = &fields.get(&e.id)?.resultant_radius;
        (!radius.is_zero()).then(|| (e.ni, radius * &e.dx, radius * &e.dz))
    }).collect();
    let dimension = qi(out.len() as i64);
    for (_, x, z) in &mut out {
        *x *= &dimension;
        *z *= &dimension;
    }
    out
}

fn extrema(mut field: AxialField, e: &PElem, lambda: &Q, start: Q) -> Result<(Q, Q), String> {
    for load in &e.loads {
        if let ElemLoad::Point { ta, px, .. } = load {
            field.changes.entry(ta.clone()).or_default().point += px * e.l.as_ref().ok_or("point load on a member of irrational length")?;
        }
    }
    let mut n = start - lambda * field.start_share;
    let (mut min, mut max) = (n.clone(), n.clone());
    let mut record = |value: &Q| {
        if value < &min { min = value.clone(); }
        if value > &max { max = value.clone(); }
    };
    let (mut last, mut intensity, mut slope) = (Q::zero(), Q::zero(), Q::zero());
    for (t, change) in field.changes {
        let width = &t - &last;
        let integral = |d: &Q| lambda * d * (&intensity + &slope * d / qi(2));
        if !slope.is_zero() {
            let root = -&intensity / &slope;
            if root.is_positive() && root < width { record(&(&n + integral(&root))); }
        }
        n += integral(&width);
        record(&n);
        n += lambda * change.point;
        record(&n);
        intensity += &slope * width + change.intensity;
        slope += change.slope;
        last = t;
    }
    Ok((min, max))
}

pub(super) fn peak(field: AxialField, e: &PElem, lambda: &Q, start: Q) -> Result<Q, String> {
    let envelope = lambda.abs() * &field.envelope;
    let (min, max) = extrema(field, e, lambda, start)?;
    Ok(min.abs().max(max.abs()) + envelope)
}

pub(super) fn restrained_spans(input: &SolverInput) -> bool {
    if !input.loads.iter().any(|l| matches!(l, SolverLoad::AxialDistributed(_)))
        || !input.loads.iter().all(|l| matches!(l, SolverLoad::AxialDistributed(_) | SolverLoad::Nodal(_)))
        || !input.elements.values().all(|e| e.elem_type == "truss")
        || !input.supports.values().all(|s| [s.kx, s.ky, s.kz, s.dx, s.dz, s.dry, s.angle].iter().all(|v| v.unwrap_or(0.0) == 0.0))
    {
        return false;
    }
    let fixed: std::collections::HashSet<_> = input.supports.values().filter(|s| matches!(s.support_type.as_str(), "fixed" | "pinned")).map(|s| s.node_id).collect();
    input.nodes.values().all(|n| fixed.contains(&n.id))
        && input.loads.iter().all(|l| !matches!(l, SolverLoad::Nodal(p) if p.my != 0.0))
}

pub(super) fn restrained_limit(model: &PlasticModel, fields: &HashMap<usize, AxialField>, np: &HashMap<usize, f64>) -> Result<(f64, f64), String> {
    use crate::certify::exact::{to_f64_down, to_f64_up};
    let mut limit: Option<Q> = None;
    for e in &model.elems {
        let (Some(field), Some(capacity)) = (fields.get(&e.id), np.get(&e.id)) else { continue };
        let capacity = q(*capacity).filter(|v| v.is_positive()).ok_or("invalid axial yield force")?;
        let length = e.l.as_ref().ok_or("irrational length in a restrained axial span")?;
        let (min, max) = extrema(field.clone(), e, &Q::one(), Q::zero())?;
        if min < max {
            let factor = qi(2) * capacity * length / (max - min);
            limit = Some(match limit { Some(v) => v.min(factor), None => factor });
        }
    }
    let limit = limit.ok_or("the restrained bars have no finite axial yield limit under these loads")?;
    Ok((to_f64_down(&limit).ok_or("axial limit out of range")?, to_f64_up(&limit).ok_or("axial limit out of range")?))
}
