use crate::certify::exact::{q, qi, Q};
use crate::certify::plastic::{ElemLoad, PElem, PlasticModel, EXACT_MAX_ABS, EXACT_MIN_ABS};
use crate::types::{SolverInput, SolverLoad};
use num_traits::{One, Signed, Zero};
use std::collections::{BTreeMap, HashMap};

#[derive(Default)]
struct Change {
    intensity: Q,
    slope: Q,
    point: Q,
}

#[derive(Default)]
pub(super) struct AxialField {
    start_share: Q,
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
        let fraction = |x| -> Result<Q, String> {
            if x == 0.0 { return Ok(Q::zero()); }
            let dx = crate::certify::exact::to_f64(&e.dx);
            let dz = crate::certify::exact::to_f64(&e.dz);
            if x == (dx * dx + dz * dz).sqrt() { return Ok(Q::one()); }
            Ok(q(x).ok_or("non-finite axial load position")? / e.l.as_ref().ok_or("partial axial load on a member of irrational length")?)
        };
        let a = fraction(load.a.unwrap_or(0.0))?;
        let b = load.b.map(fraction).transpose()?.unwrap_or_else(Q::one);
        if a < Q::zero() || b < a || b > Q::one() { return Err(format!("element {}: axial span load outside the member", e.id)); }
        if a == b { continue; }
        let qa = q(load.q_i).ok_or("non-finite axial load")?;
        let qb = q(load.q_j).ok_or("non-finite axial load")?;
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

pub(super) fn peak(mut field: AxialField, e: &PElem, lambda: &Q, start: Q) -> Result<Q, String> {
    for load in &e.loads {
        if let ElemLoad::Point { ta, px, .. } = load {
            field.changes.entry(ta.clone()).or_default().point += px * e.l.as_ref().ok_or("point load on a member of irrational length")?;
        }
    }
    let mut n = start - lambda * field.start_share;
    let mut peak = n.abs();
    let (mut last, mut intensity, mut slope) = (Q::zero(), Q::zero(), Q::zero());
    for (t, change) in field.changes {
        let width = &t - &last;
        let integral = |d: &Q| lambda * d * (&intensity + &slope * d / qi(2));
        if !slope.is_zero() {
            let root = -&intensity / &slope;
            if root.is_positive() && root < width { peak = peak.max((&n + integral(&root)).abs()); }
        }
        n += integral(&width);
        peak = peak.max(n.abs());
        n += lambda * change.point;
        peak = peak.max(n.abs());
        intensity += &slope * width + change.intensity;
        slope += change.slope;
        last = t;
    }
    Ok(peak)
}
