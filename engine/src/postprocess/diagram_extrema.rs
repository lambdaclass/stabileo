use crate::element::distributed_load_terms_at_distance;
use crate::types::DistributedLoadInfo;
use std::collections::BTreeMap;

const ALIASED_CUTS: &str = "distinct member diagram cuts share a normalized station";

#[derive(Clone, Copy, Debug, PartialEq)]
enum Location {
    Grid,
    Boundary(f64),
    Interior { start: f64, end: f64, u: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Cut {
    pub t: f64,
    pub right: bool,
    location: Location,
}

impl Cut {
    pub fn left(t: f64) -> Self {
        Self::at(t, false)
    }

    pub fn at(t: f64, right: bool) -> Self {
        Self { t, right, location: Location::Grid }
    }

    fn boundary(t: f64, x: f64, right: bool) -> Self {
        Self { t, right, location: Location::Boundary(x) }
    }

    fn interior(length: f64, start: f64, end: f64, u: f64) -> Self {
        let lo = (start + 0.0) / length;
        let hi = (end + 0.0) / length;
        let t = lo + (hi - lo) * u;
        let t = if t == hi { hi - (hi - lo) * (1.0 - u) } else { t };
        Self { t, right: false, location: Location::Interior { start, end, u } }
    }

    pub fn in_member(mut self) -> Self {
        self.right = match self.t {
            0.0 => true,
            1.0 => false,
            _ => self.right,
        };
        self
    }

    pub fn station_x(self, length: f64) -> f64 {
        match self.location {
            Location::Grid => self.t * length,
            Location::Boundary(x) => x,
            Location::Interior { start, end, u } => start + (end - start) * u,
        }
    }

    fn aliased_boundary(self, length: f64) -> Option<(Self, f64)> {
        let Location::Interior { start, end, .. } = self.location else { return None };
        let lo = start / length;
        let hi = end / length;
        if self.t <= lo {
            Some((Self::boundary(lo, start, true), 0.0))
        } else if self.t >= hi {
            Some((Self::boundary(hi, end, false), 1.0))
        } else {
            None
        }
    }

    fn includes(self, t: f64) -> bool {
        t < self.t || (self.right && t == self.t)
    }
}

pub(crate) fn sort_member_cuts(cuts: &mut Vec<Cut>) -> Result<(), &'static str> {
    for cut in cuts.iter_mut() {
        *cut = cut.in_member();
    }
    sort_cuts(cuts)
}

pub(crate) fn sort_cuts(cuts: &mut Vec<Cut>) -> Result<(), &'static str> {
    cuts.sort_by(|a, b| a.t.total_cmp(&b.t).then(a.right.cmp(&b.right)));
    let mut merged = Vec::with_capacity(cuts.len());
    for station in cuts.chunk_by(|a, b| a.t == b.t) {
        let mut boundaries = station.iter().filter_map(|cut| match cut.location {
            Location::Boundary(x) => Some(x),
            _ => None,
        });
        if let Some(x) = boundaries.next() {
            if boundaries.any(|other| other != x) {
                return Err(ALIASED_CUTS);
            }
            if station.iter().any(|cut| cut.right && cut.location == Location::Boundary(x))
                && station.iter().any(|cut| match cut.location {
                    Location::Interior { start, end, u } => x - start != (end - start) * u,
                    _ => false,
                })
            {
                return Err(ALIASED_CUTS);
            }
        }
        for side in station.chunk_by(|a, b| a.right == b.right) {
            let first = merged.len();
            for cut in side.iter().filter(|cut| cut.location != Location::Grid) {
                if !merged[first..].contains(cut) {
                    merged.push(*cut);
                }
            }
            if merged.len() == first {
                merged.push(side[0]);
            }
        }
    }
    *cuts = merged;
    Ok(())
}

pub(crate) fn uniform_cuts(count: usize) -> impl Iterator<Item = Cut> {
    (0..count).map(move |i| Cut::left(i as f64 / (count - 1) as f64))
}

pub(crate) fn moving_face_force(interior: f64, local_force: f64, at_end: bool, axial: bool) -> Result<f64, &'static str> {
    let value = if at_end != axial { interior + local_force } else { interior - local_force };
    if value.is_finite() {
        Ok(value)
    } else {
        Err("non-finite moving load member diagram")
    }
}

#[derive(Clone, Copy)]
pub(crate) struct PointAction {
    pub a: f64,
    pub jump: f64,
    pub slope: f64,
}

pub(crate) struct CoincidentAxle {
    pub station: f64,
    pub force: [f64; 3],
    pub moving_after: bool,
}

#[derive(Default)]
pub(crate) struct MovingForceCuts<'a> {
    pub faces: [f64; 2],
    pub coincident: &'a [CoincidentAxle],
    pub axis: usize,
}

#[derive(Clone, Copy)]
pub(crate) enum Response {
    Force(f64),
    Moment(f64),
}

pub(crate) struct Curve<P> {
    pub length: f64,
    pub start: f64,
    pub change: f64,
    pub slope: f64,
    pub response: Response,
    pub distributed: DiagramLoads,
    pub points: P,
}

#[derive(Default)]
struct DiagramSum {
    partials: Vec<f64>,
}

impl DiagramSum {
    fn add(&mut self, mut term: f64) {
        let mut kept = 0;
        for i in 0..self.partials.len() {
            let mut other = self.partials[i];
            if term.abs() < other.abs() {
                std::mem::swap(&mut term, &mut other);
            }
            let next = term + other;
            if !next.is_finite() {
                self.partials.clear();
                self.partials.push(next);
                return;
            }
            let residual = other - (next - term);
            if residual != 0.0 {
                self.partials[kept] = residual;
                kept += 1;
            }
            term = next;
        }
        self.partials.truncate(kept);
        if term != 0.0 {
            self.partials.push(term);
        }
    }

    fn value(&self) -> f64 {
        let mut terms = self.partials.iter().rev();
        let mut sum = terms.next().copied().unwrap_or_default();
        for &term in terms.by_ref() {
            let next = sum + term;
            let residual = term - (next - sum);
            sum = next;
            if residual != 0.0 {
                if terms.next().is_some_and(|low| low.is_sign_positive() == residual.is_sign_positive()) {
                    let twice = 2.0 * residual;
                    let adjusted = sum + twice;
                    if adjusted - sum == twice {
                        sum = adjusted;
                    }
                }
                break;
            }
        }
        sum
    }

    fn scaled(&self, scale: f64) -> Self {
        let mut product = Self::default();
        for &term in &self.partials {
            let high = term * scale;
            product.add(high);
            if high.is_finite() {
                product.add(term.mul_add(scale, -high));
            }
        }
        product
    }

    fn add_scaled(&mut self, other: &Self, scale: f64) {
        for &term in &other.partials {
            self.add(term * scale);
        }
    }
}

pub(crate) fn sum_diagram_terms(terms: [f64; 3]) -> f64 {
    let mut sum = DiagramSum::default();
    for term in terms {
        sum.add(term);
    }
    sum.value()
}

#[derive(Default)]
pub(crate) struct DiagramLoads(Vec<DistributedLoadInfo>);

impl FromIterator<DistributedLoadInfo> for DiagramLoads {
    fn from_iter<T: IntoIterator<Item = DistributedLoadInfo>>(loads: T) -> Self {
        let mut loads = loads.into_iter();
        let Some(first) = loads.next() else { return Self::default() };
        let Some(second) = loads.next() else { return Self(vec![first]) };
        let mut groups = BTreeMap::<_, Vec<DistributedLoadInfo>>::new();
        for load in [first, second].into_iter().chain(loads) {
            groups.entry(((load.a + 0.0).to_bits(), (load.b + 0.0).to_bits())).or_default().push(load);
        }
        let mut terms = Vec::new();
        for group in groups.into_values() {
            let opposes = |intensity: fn(&DistributedLoadInfo) -> f64| {
                group.iter().any(|load| intensity(load) < 0.0) && group.iter().any(|load| intensity(load) > 0.0)
            };
            if !(opposes(|load| load.q_i) || opposes(|load| load.q_j)) {
                terms.extend(group);
                continue;
            }
            let (mut left, mut right) = (DiagramSum::default(), DiagramSum::default());
            let (a, b) = (group[0].a, group[0].b);
            for load in group {
                left.add(load.q_i);
                right.add(load.q_j);
            }
            let count = left.partials.len().max(right.partials.len()).max(1);
            left.partials.resize(count, 0.0);
            right.partials.resize(count, 0.0);
            terms.extend(left.partials.into_iter().zip(right.partials).map(|(q_i, q_j)| {
                DistributedLoadInfo { a, b, q_i, q_j }
            }));
        }
        Self(terms)
    }
}

fn add_load_ordinate(sum: &mut DiagramSum, load: &DistributedLoadInfo, distance: f64, response: Response, scale: f64) {
    let span = load.b - load.a;
    if load.q_i == load.q_j {
        let (force, moment) = distributed_load_terms_at_distance(load.q_i, load.q_j, span, distance);
        sum.add(scale * match response {
            Response::Force(sign) => sign * force,
            Response::Moment(sign) => sign * moment,
        });
        return;
    }
    let inside = distance.min(span);
    let mut force = DiagramSum::default();
    let mut moment = DiagramSum::default();
    for (q_i, q_j) in [(load.q_i, 0.0), (0.0, load.q_j)] {
        if q_i != 0.0 || q_j != 0.0 {
            let (f, m) = distributed_load_terms_at_distance(q_i, q_j, span, inside);
            force.add(f);
            moment.add(m);
        }
    }
    match response {
        Response::Force(sign) => sum.add_scaled(&force, sign * scale),
        Response::Moment(sign) => {
            sum.add_scaled(&moment, sign * scale);
            if distance > span {
                sum.add_scaled(&force, sign * scale * (distance - span));
            }
        }
    }
}

pub(crate) fn distributed_actions(
    length: f64,
    loads: &[DistributedLoadInfo],
    q_i: f64,
    q_j: f64,
) -> impl Iterator<Item = DistributedLoadInfo> + Clone + '_ {
    let legacy = (loads.is_empty() && (q_i != 0.0 || q_j != 0.0))
        .then_some(DistributedLoadInfo { a: 0.0, b: length, q_i, q_j });
    loads.iter().cloned().chain(legacy)
}

impl<P> Curve<P>
where
    P: Iterator<Item = PointAction> + Clone,
{
    pub fn checked_value(&self, cut: Cut) -> Result<f64, &'static str> {
        let value = match (cut.location, cut.aliased_boundary(self.length)) {
            (Location::Interior { start, end, u }, Some((boundary, from))) => {
                let mut value = self.accumulate_cut(boundary)?;
                add_change(&mut value, &self.segment_change(start, end), from, u);
                value.value()
            }
            _ => self.accumulate_cut(cut)?.value(),
        };
        if value.is_finite() { Ok(value) } else { Err("non-finite member diagram ordinate") }
    }

    fn accumulate_cut(&self, cut: Cut) -> Result<DiagramSum, &'static str> {
        let (x, offset, t) = match cut.location {
            Location::Grid => {
                let mut hits = self.action_distances().filter(|a| a / self.length == cut.t);
                let exact = hits.next();
                if let Some(x) = exact {
                    if hits.any(|a| a != x) || (cut.t == 0.0 && x != 0.0) || (cut.t == 1.0 && x != self.length) {
                        return Err(ALIASED_CUTS);
                    }
                }
                (exact.unwrap_or(cut.t * self.length), 0.0, cut.t)
            }
            Location::Boundary(x) => (x, 0.0, cut.t),
            Location::Interior { start, end, u } => (start, (end - start) * u, start / self.length),
        };
        let distance = |a| (x - a) + offset;
        let mut value = DiagramSum::default();
        value.add(self.start);
        value.add(self.slope * x);
        value.add(self.change * t);
        if offset != 0.0 {
            value.add(self.slope * offset);
            value.add(self.change * (offset / self.length));
        }
        for d in &self.distributed.0 {
            add_load_ordinate(&mut value, d, distance(d.a), self.response, 1.0);
        }
        for p in self.points.clone() {
            let dx = distance(p.a);
            let point_t = p.a / self.length;
            let included = if cut.location == Location::Grid {
                cut.includes(point_t)
            } else {
                dx > 0.0 || (cut.right && dx == 0.0)
            };
            if included {
                if p.slope != 0.0 && (cut.location != Location::Grid || cut.t != point_t) {
                    value.add(p.slope * dx);
                }
                value.add(p.jump);
            }
        }
        Ok(value)
    }

    pub fn checked_station_value(&self, t: f64, right: bool) -> Result<f64, &'static str> {
        let value = self.checked_value(Cut::at(t, right))?;
        if !(0.0..=1.0).contains(&t) || self.distributed.0.is_empty() {
            return Ok(value);
        }
        let mut start = 0.0_f64;
        let mut end = self.length;
        let mut boundary = if t == 0.0 { Some(0.0) } else if t == 1.0 { Some(self.length) } else { None };
        for x in self.action_distances().filter(|x| (0.0..=self.length).contains(x)) {
            let station = x / self.length;
            if station < t {
                start = start.max(x);
            } else if station > t {
                end = end.min(x);
            } else {
                boundary = Some(x);
            }
        }
        let mut ordinate = None;
        let mut validate = |start, end| {
            self.visit_extrema(start, end, Some(t), |cut, change, u| {
                let actual = (t * self.length - start) / (end - start);
                let mut moved = self.accumulate_cut(cut)?;
                let peak = moved.value();
                add_change(&mut moved, change, u, actual);
                if !(0.0 < actual && actual < 1.0 && peak.is_finite())
                    || moved.value() != peak
                    || ordinate.is_some_and(|value| value != peak)
                {
                    return Err("member diagram extrema cannot be evaluated at the requested station");
                }
                ordinate = Some(peak);
                Ok(())
            })
        };
        if let Some(x) = boundary {
            validate(start, x)?;
            validate(x, end)?;
        } else {
            validate(start, end)?;
        }
        Ok(ordinate.unwrap_or(value))
    }

    fn action_distances(&self) -> impl Iterator<Item = f64> + '_ {
        self.distributed.0.iter().flat_map(|d| [d.a, d.b]).chain(self.points.clone().map(|p| p.a))
    }

    fn boundaries(&self) -> Result<Vec<f64>, &'static str> {
        if !(self.length > 0.0 && self.length.is_finite()) {
            return Err("invalid member diagram length");
        }
        let mut distances = vec![0.0, self.length];
        distances.extend(self.action_distances().filter(|x| (0.0..=self.length).contains(x)));
        distances.sort_by(f64::total_cmp);
        distances.dedup();
        if distances.windows(2).any(|w| w[0] / self.length == w[1] / self.length) {
            return Err(ALIASED_CUTS);
        }
        Ok(distances)
    }

    pub fn critical_cuts(&self) -> Result<Vec<Cut>, &'static str> {
        let at = |x: f64| (x + 0.0) / self.length;
        let boundaries = self.boundaries()?;
        let mut cuts = Vec::new();
        for &x in &boundaries {
            cuts.push(Cut::boundary(at(x), x, false));
        }
        cuts.extend(self.points.clone().filter(|p| p.jump != 0.0 && (0.0..self.length).contains(&p.a))
            .map(|p| Cut::boundary(at(p.a), p.a, true)));
        for segment in boundaries.windows(2) {
            self.visit_extrema(segment[0], segment[1], None, |cut, _, _| {
                cuts.push(cut);
                Ok(())
            })?;
        }
        sort_cuts(&mut cuts)?;
        Ok(cuts)
    }

    fn visit_extrema(
        &self,
        x0: f64,
        x1: f64,
        at: Option<f64>,
        mut visit: impl FnMut(Cut, &[DiagramSum; 3], f64) -> Result<(), &'static str>,
    ) -> Result<(), &'static str> {
        if x0 == x1 {
            return Ok(());
        }
        let change = self.segment_change(x0, x1);
        for u in interior_roots(change.each_ref().map(DiagramSum::value))? {
            let cut = Cut::interior(self.length, x0, x1, u);
            if at.is_some_and(|t| t != cut.t) {
                continue;
            }
            if let Some((boundary, _)) = cut.aliased_boundary(self.length) {
                let boundary_value = self.checked_value(boundary)?;
                let peak = self.checked_value(cut)?;
                if !peak.is_finite() || peak != boundary_value {
                    return Err("interior member diagram extremum has no distinct normalized station");
                }
            } else {
                visit(cut, &change, u)?;
            }
        }
        Ok(())
    }

    pub fn diagram_cuts(&self, count: usize) -> Result<Vec<Cut>, &'static str> {
        let mut cuts = self.critical_cuts()?;
        cuts.extend(uniform_cuts(count));
        sort_cuts(&mut cuts)?;
        Ok(cuts)
    }

    pub fn interior_range(&self, end: f64, limits: MovingForceCuts<'_>) -> Result<(f64, f64), &'static str> {
        let end_cut = Cut::boundary(1.0, self.length, false).in_member();
        let start_cut = Cut::boundary(0.0, 0.0, false).in_member();
        let end_limit = if self.points.clone().any(|p| p.a == self.length && p.jump != 0.0) {
            self.checked_value(end_cut)?
        } else {
            end
        };
        if !end_limit.is_finite() {
            return Err("non-finite moving load member diagram");
        }
        let critical = self.critical_cuts()?;
        let cuts = std::iter::once(start_cut)
            .chain(critical.into_iter().filter(|cut| cut.t > 0.0 && cut.t < 1.0));
        let mut lo = end_limit;
        let mut hi = end_limit;
        for cut in cuts {
            let value = self.checked_value(cut)?;
            if !value.is_finite() {
                return Err("non-finite moving load member diagram");
            }
            lo = lo.min(value);
            hi = hi.max(value);
        }
        if let Response::Force(sign) = self.response {
            let [start_load, end_load] = limits.faces;
            if start_load != 0.0 {
                let interior = self.checked_value(start_cut)?;
                let value = moving_face_force(interior, start_load, false, sign < 0.0)?;
                lo = lo.min(value);
                hi = hi.max(value);
            }
            if end_load != 0.0 {
                let value = moving_face_force(end_limit, end_load, true, sign < 0.0)?;
                lo = lo.min(value);
                hi = hi.max(value);
            }
            for axle in limits.coincident {
                let force = axle.force[limits.axis];
                if force == 0.0 {
                    continue;
                }
                let cut = Cut::boundary(axle.station / self.length, axle.station, axle.moving_after);
                let baseline = self.checked_value(cut)?;
                let value = moving_face_force(baseline, force, !axle.moving_after, sign < 0.0)?;
                lo = lo.min(value);
                hi = hi.max(value);
            }
        }
        Ok((lo, hi))
    }

    fn segment_change(&self, x: f64, end: f64) -> [DiagramSum; 3] {
        let width = end - x;
        let mut linear = DiagramSum::default();
        linear.add(self.slope * width);
        linear.add(self.change * (width / self.length));
        let mut quadratic = DiagramSum::default();
        let mut cubic = DiagramSum::default();
        for p in self.points.clone() {
            if p.slope != 0.0 && p.a <= x {
                linear.add(p.slope * width);
            }
        }
        for d in &self.distributed.0 {
            let sign = match self.response {
                Response::Force(sign) => sign,
                Response::Moment(sign) => {
                    add_load_ordinate(&mut linear, d, x - d.a, Response::Force(sign), width);
                    sign
                }
            };
            if x < d.a || x >= d.b {
                continue;
            }
            let span = d.b - d.a;
            let u = (x - d.a) / span;
            let (initial, gradient, integral, gradient_integral) = match self.response {
                Response::Force(_) => (&mut linear, &mut quadratic, 1.0, 0.5),
                Response::Moment(_) => (&mut quadratic, &mut cubic, width / 2.0, width / 6.0),
            };
            let signed_width = sign * width;
            if d.q_i == d.q_j {
                initial.add(signed_width * d.q_i * integral);
            } else {
                initial.add(signed_width * d.q_i * integral);
                initial.add(-signed_width * (d.q_i * u) * integral);
                initial.add(signed_width * (d.q_j * u) * integral);
                let fraction = width / span;
                gradient.add(signed_width * (d.q_j * fraction) * gradient_integral);
                gradient.add(-signed_width * (d.q_i * fraction) * gradient_integral);
            }
        }
        [linear, quadratic, cubic]
    }
}

fn add_change(value: &mut DiagramSum, [linear, quadratic, cubic]: &[DiagramSum; 3], from: f64, to: f64) {
    let step = to - from;
    let cubic_at_from = cubic.scaled(from);
    let mut derivative = DiagramSum::default();
    derivative.add_scaled(linear, 1.0);
    derivative.add_scaled(&quadratic.scaled(from), 2.0);
    derivative.add_scaled(&cubic_at_from.scaled(from).scaled(3.0), 1.0);
    let mut curvature = DiagramSum::default();
    curvature.add_scaled(quadratic, 1.0);
    curvature.add_scaled(&cubic_at_from.scaled(3.0), 1.0);
    curvature.add_scaled(&cubic.scaled(step), 1.0);
    value.add_scaled(&derivative.scaled(step), 1.0);
    value.add_scaled(&curvature.scaled(step).scaled(step), 1.0);
}

fn interior_roots([linear, quadratic, cubic]: [f64; 3]) -> Result<impl Iterator<Item = f64>, &'static str> {
    Ok(quadratic_roots(cubic, quadratic, linear)?.into_iter().filter(|&u| 0.0 < u && u < 1.0))
}

fn quadratic_roots(cubic: f64, quadratic: f64, linear: f64) -> Result<[f64; 2], &'static str> {
    if ![cubic, quadratic, linear].into_iter().all(f64::is_finite) {
        return Err("non-finite member diagram polynomial");
    }
    let scale = cubic.abs().max(quadratic.abs()).max(linear.abs());
    if scale == 0.0 {
        return Ok([f64::NAN; 2]);
    }
    let (a, b, c) = (3.0 * (cubic / scale), 2.0 * (quadratic / scale), linear / scale);
    if a == 0.0 {
        return Ok([-c / b, f64::NAN]);
    }
    let discriminant = b.mul_add(b, -4.0 * a * c);
    if discriminant == 0.0 {
        return Ok([-b / (2.0 * a), f64::NAN]);
    }
    let q = -0.5 * (b + discriminant.sqrt().copysign(b));
    Ok([q / a, c / q])
}

#[cfg(test)]
mod round3_tests {
    use super::*;

    #[test]
    fn issue_2437_interval_intensity_survives_overlapping_ramps() {
        let high = 2.0_f64.powi(54);
        let start = 1.0 / high;
        let loads = [
            DistributedLoadInfo { a: 0.0, b: 1.0, q_i: high, q_j: 0.0 },
            DistributedLoadInfo { a: 0.0, b: 1.0, q_i: 0.0, q_j: high },
            DistributedLoadInfo { a: 0.0, b: 1.0, q_i: -high, q_j: -high },
            DistributedLoadInfo { a: start, b: 1.0, q_i: 1.0, q_j: -1.0 },
        ];
        let curve = Curve {
            length: 1.0, start: 0.0, change: 0.0, slope: 0.0,
            response: Response::Force(1.0), distributed: loads.into_iter().collect(), points: std::iter::empty(),
        };
        assert_eq!(curve.interior_range(0.0, MovingForceCuts::default()), Ok((0.0, 0.25)));
        assert_eq!(curve.checked_station_value(0.5, false), Ok(0.25));
    }

    #[test]
    fn issue_2437_moving_range_uses_the_physical_j_left_cut() {
        let jump = 2.0_f64.powi(54);
        for (action, stored) in [(jump, jump), (-jump, 1.0 - jump), (0.0, 1.0)] {
            let curve = Curve {
                length: 1.0, start: 2.0, change: 0.0, slope: -1.0,
                response: Response::Force(1.0), distributed: DiagramLoads::default(),
                points: std::iter::once(PointAction { a: 1.0, jump: action, slope: 0.0 }),
            };
            assert_eq!(curve.interior_range(stored, MovingForceCuts::default()), Ok((1.0, 2.0)));
        }
        let curve = Curve {
            length: 1.0, start: 1.0, change: 0.0, slope: -1.0,
            response: Response::Force(1.0), distributed: DiagramLoads::default(),
            points: [jump, 1.0].into_iter().map(|jump| PointAction { a: 1.0, jump, slope: 0.0 }),
        };
        assert_eq!(curve.interior_range(jump, MovingForceCuts::default()), Ok((0.0, 1.0)));
    }

    #[test]
    fn issue_2437_transfer_preserves_the_small_change_near_j() {
        let high = 2.0_f64.powi(54);
        let u = 1.0 - 2.0_f64.powi(-53);
        let mut linear = DiagramSum::default();
        linear.add(2.0 * high - 4.0);
        let mut quadratic = DiagramSum::default();
        quadratic.add(-high);
        let change = [linear, quadratic, DiagramSum::default()];
        let mut ordinate = DiagramSum::default();
        ordinate.add(2.0);
        add_change(&mut ordinate, &change, 1.0, u);
        assert_eq!(ordinate.value(), 2.0);
        add_change(&mut ordinate, &change, u, 1.0);
        assert_eq!(ordinate.partials, [2.0]);
    }

    #[test]
    fn issue_2437_station_transfer_uses_the_unrounded_peak() {
        let d = 2.0_f64.powi(-53);
        let high = 2.0_f64.powi(54);
        let station = 0.5 + 4.0 * d;
        for (numerator, transfers) in [(21.0, false), (22.0, true)] {
            let k = numerator / (128.0 * d);
            let curve = Curve {
                length: 1.0, start: high, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: [DistributedLoadInfo {
                    a: 0.5, b: 0.5 + 8.0 * d, q_i: 7.0 * k, q_j: -9.0 * k,
                }].into_iter().collect(),
                points: std::iter::empty(),
            };
            let cut = curve.critical_cuts().unwrap().into_iter().find(|cut| cut.t == station).unwrap();
            assert_eq!(curve.checked_value(cut), Ok(high + 4.0));
            assert_eq!(curve.checked_station_value(0.5, false), Ok(high));
            let requested = curve.checked_station_value(station, false);
            if transfers {
                assert_eq!(requested, Ok(high + 4.0));
            } else {
                assert_eq!(requested, Err("member diagram extrema cannot be evaluated at the requested station"));
            }
        }
    }

    #[test]
    fn issue_2437_small_terms_survive_nested_cancellation() {
        let high = 2.0_f64.powi(110);
        let medium = 2.0_f64.powi(54);
        let terms = [high, medium, 1.0, -medium, -high];
        let loads = terms.map(|q| DistributedLoadInfo { a: 0.0, b: 1.0, q_i: q, q_j: q });
        let curve = |jumps: [f64; 5]| Curve {
            length: 1.0, start: 0.0, change: 0.0, slope: 0.0,
            response: Response::Force(1.0),
            distributed: loads.clone().into_iter().collect(),
            points: jumps.into_iter().map(|jump| PointAction { a: 1.0, jump, slope: 0.0 }),
        };
        let without_jump = curve([0.0; 5]);
        assert_eq!(without_jump.checked_station_value(0.5, false), Ok(0.5));
        assert_eq!(without_jump.segment_change(0.0, 1.0).each_ref().map(DiagramSum::value), [1.0, 0.0, 0.0]);
        assert_eq!(without_jump.interior_range(1.0, MovingForceCuts::default()), Ok((0.0, 1.0)));
        assert_eq!(curve(terms).interior_range(2.0, MovingForceCuts::default()), Ok((0.0, 1.0)));
    }

    #[test]
    fn round3_shear_peak_uses_interval_local_coordinate() {
        let a = 1.5_f64;
        let ulp = f64::from_bits(a.to_bits() + 1) - a;
        for steps in [2, 3, 6] {
            let curve = Curve {
                length: 3.0, start: 0.0, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: [DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: 1.0 / ulp, q_j: -1.0 / ulp,
                }].into_iter().collect(),
                points: std::iter::empty(),
            };
            let cuts = curve.diagram_cuts(21);
            if steps == 2 {
                assert_eq!(cuts.unwrap_err(), "interior member diagram extremum has no distinct normalized station");
                continue;
            }
            let peak = cuts.unwrap().into_iter()
                .map(|cut| curve.checked_value(cut).unwrap()).fold(f64::NEG_INFINITY, f64::max);
            assert_eq!(peak, f64::from(steps) / 4.0);
        }
    }

    #[test]
    fn issue_2437_checked_station_validates_the_adjoining_interval() {
        let a = 1.5_f64;
        let ulp = f64::from_bits(a.to_bits() + 1) - a;
        for steps in [2, 8] {
            let curve = Curve {
                length: 3.0, start: 0.0, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: [DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: 1.0 / ulp, q_j: -1.0 / ulp,
                }].into_iter().collect(),
                points: std::iter::empty(),
            };
            assert_eq!(curve.checked_station_value(0.5, false).is_err(), steps == 2);
            assert_eq!(curve.checked_station_value(0.5, true).is_err(), steps == 2);
            assert_eq!(curve.checked_station_value(0.25, false), Ok(0.0));
        }
    }

    #[test]
    fn issue_2437_endpoint_terms_survive_cancellation() {
        let huge = 2.0_f64.powi(54);
        let loads = [(1.0, huge), (0.0, -huge), (0.0, -1.0)].map(|(q_i, q_j)| {
            DistributedLoadInfo { a: 0.0, b: 1.0, q_i, q_j }
        });
        let curve = Curve {
            length: 1.0, start: 0.0, change: 0.0, slope: 0.0,
            response: Response::Force(1.0),
            distributed: loads.into_iter().collect(),
            points: std::iter::empty(),
        };
        let cuts = curve.critical_cuts().unwrap();
        assert_eq!(cuts.iter().map(|cut| cut.t).collect::<Vec<_>>(), [0.0, 0.5, 1.0]);
        assert_eq!(curve.interior_range(0.0, MovingForceCuts::default()), Ok((0.0, 0.25)));
        assert_eq!(curve.checked_station_value(0.5, false), Ok(0.25));
        assert_eq!(curve.checked_station_value(1.0, false), Ok(0.0));
    }

    #[test]
    fn issue_2437_aliased_peak_compares_compensated_ordinates() {
        let a = 1.5_f64;
        let ulp = a.next_up() - a;
        let start = 2.0_f64.powi(54);
        let refusal = "interior member diagram extremum has no distinct normalized station";
        for (steps, scale, aliases) in [(2, 4.0, true), (2, 1.0, false), (8, 4.0, false)] {
            let q = scale / ulp;
            let curve = Curve {
                length: 3.0, start, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: [DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: q, q_j: -q,
                }].into_iter().collect(),
                points: std::iter::once(PointAction { a: 1.0, jump: 1.0, slope: 0.0 }),
            };
            let at = a / curve.length;
            assert_eq!(curve.checked_station_value(at.next_down(), false), Ok(start));
            for right in [false, true] {
                assert_eq!(curve.checked_station_value(at, right), if aliases { Err(refusal) } else { Ok(start) });
            }
            if aliases {
                assert_eq!(curve.diagram_cuts(21), Err(refusal));
                assert_eq!(curve.interior_range(start, MovingForceCuts::default()), Err(refusal));
            } else {
                let expected = if steps == 2 { start } else { start + 8.0 };
                assert_eq!(curve.interior_range(start, MovingForceCuts::default()), Ok((start, expected)));
            }
        }
    }

    #[test]
    fn issue_2437_cancelling_endpoints_share_the_moment_transport_distance() {
        let q = 2.0_f64.powi(1023);
        let curve = Curve {
            length: 8.0, start: 0.0, change: 0.0, slope: 0.0,
            response: Response::Moment(1.0),
            distributed: [DistributedLoadInfo {
                a: 0.0, b: 1.0, q_i: -q, q_j: q,
            }].into_iter().collect(),
            points: std::iter::empty(),
        };
        assert!(curve.critical_cuts().is_ok());
        for t in [0.125, 0.5, 1.0] {
            let value = curve.checked_station_value(t, false).unwrap();
            assert!((value / q + 1.0 / 6.0).abs() <= f64::EPSILON);
        }
    }

    #[test]
    fn issue_2250_rounded_terminal_shear_uses_interval_change() {
        let loads = [
            DistributedLoadInfo { a: 0.0, b: 2.25, q_i: 0.0, q_j: -5.625 },
            DistributedLoadInfo { a: 2.25, b: 4.5, q_i: -5.625, q_j: 0.0 },
            DistributedLoadInfo { a: 2.95286, b: 4.5, q_i: -3.86788, q_j: 4.440892099e-16 },
            DistributedLoadInfo { a: 0.0, b: 2.95286, q_i: 0.0, q_j: -3.86788 },
        ];
        let curve = Curve {
            length: 4.5,
            start: 9.675214761921413,
            change: 0.0,
            slope: 0.0,
            response: Response::Force(1.0),
            distributed: loads.into_iter().collect(),
            points: std::iter::empty(),
        };
        let cuts = curve.critical_cuts().unwrap();
        assert_eq!(cuts.last().unwrap().t, 1.0);
        assert_eq!(cuts.iter().filter(|cut| cut.t == 1.0).count(), 1);
    }
}
