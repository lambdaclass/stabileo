use crate::element::{distributed_load_terms, distributed_load_terms_at_distance};
use crate::types::DistributedLoadInfo;

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

    pub fn station_x(self, length: f64) -> f64 {
        match self.location {
            Location::Grid => self.t * length,
            Location::Boundary(x) => x,
            Location::Interior { start, end, u } => start + (end - start) * u,
        }
    }

    fn includes(self, t: f64) -> bool {
        t < self.t || (self.right && t == self.t)
    }
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

#[derive(Clone, Copy)]
pub(crate) struct PointAction {
    pub a: f64,
    pub jump: f64,
    pub slope: f64,
}

#[derive(Clone, Copy)]
pub(crate) enum Response {
    Force(f64),
    Moment(f64),
}

pub(crate) struct Curve<D, P> {
    pub length: f64,
    pub start: f64,
    pub change: f64,
    pub slope: f64,
    pub response: Response,
    pub distributed: D,
    pub points: P,
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

impl<D, P> Curve<D, P>
where
    D: Iterator<Item = DistributedLoadInfo> + Clone,
    P: Iterator<Item = PointAction> + Clone,
{
    pub fn checked_value(&self, cut: Cut) -> Result<f64, &'static str> {
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
        let mut value = self.start + self.slope * x + self.change * t;
        if offset != 0.0 {
            value += self.slope * offset + self.change * (offset / self.length);
        }
        for d in self.distributed.clone() {
            let (force, moment) = distributed_load_terms_at_distance(d.q_i, d.q_j, d.b - d.a, distance(d.a));
            value += match self.response {
                Response::Force(sign) => sign * force,
                Response::Moment(sign) => sign * moment,
            };
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
                    value += p.slope * dx;
                }
                value += p.jump;
            }
        }
        Ok(value)
    }

    fn action_distances(&self) -> impl Iterator<Item = f64> + '_ {
        self.distributed.clone().flat_map(|d| [d.a, d.b]).chain(self.points.clone().map(|p| p.a))
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
            let [x0, x1] = [segment[0], segment[1]];
            let [lo, hi] = [at(x0), at(x1)];
            let [linear, quadratic, cubic] = self.segment_change(x0, x1);
            for u in quadratic_roots(cubic, quadratic, linear)? {
                if u > 0.0 && u < 1.0 {
                    let t = lo + (hi - lo) * u;
                    if !(lo < t && t < hi) {
                        let base = self.checked_value(Cut::boundary(lo, x0, true))?;
                        let value = |x| base + x * (linear + x * (quadratic + x * cubic));
                        if value(u) != value(if t == lo { 0.0 } else { 1.0 }) {
                            return Err("interior member diagram extremum has no distinct normalized station");
                        }
                        continue;
                    }
                    cuts.push(Cut { t, right: false, location: Location::Interior { start: x0, end: x1, u } });
                }
            }
        }
        sort_cuts(&mut cuts)?;
        Ok(cuts)
    }

    pub fn diagram_cuts(&self, count: usize) -> Result<Vec<Cut>, &'static str> {
        let mut cuts = self.critical_cuts()?;
        cuts.extend(uniform_cuts(count));
        sort_cuts(&mut cuts)?;
        Ok(cuts)
    }

    pub fn interior_range(&self, end: f64) -> Result<(f64, f64), &'static str> {
        let end_jump = self.points.clone().filter(|p| p.a == self.length).map(|p| p.jump).sum::<f64>();
        let end_limit = end - end_jump;
        if !end_limit.is_finite() {
            return Err("non-finite moving load member diagram");
        }
        let critical = self.critical_cuts()?;
        let cuts = std::iter::once(Cut::boundary(0.0, 0.0, true))
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
        Ok((lo, hi))
    }

    fn segment_change(&self, x: f64, end: f64) -> [f64; 3] {
        let width = end - x;
        let mut linear = self.slope * width + self.change * (width / self.length);
        let mut quadratic = 0.0;
        let mut cubic = 0.0;
        for p in self.points.clone() {
            if p.slope != 0.0 && p.a <= x {
                linear += p.slope * width;
            }
        }
        for d in self.distributed.clone() {
            let sign = match self.response {
                Response::Force(sign) => sign,
                Response::Moment(sign) => {
                    linear += (sign * width) * distributed_load_terms(d.q_i, d.q_j, d.a, d.b, x).0;
                    sign
                }
            };
            if x < d.a || x >= d.b {
                continue;
            }
            let span = d.b - d.a;
            let u = (x - d.a) / span;
            let initial = (sign * width) * (d.q_i * (1.0 - u) + d.q_j * u);
            let fraction = width / span;
            let delta = (sign * width) * (d.q_j * fraction) - (sign * width) * (d.q_i * fraction);
            match self.response {
                Response::Force(_) => {
                    linear += initial;
                    quadratic += delta / 2.0;
                }
                Response::Moment(_) => {
                    quadratic += initial * (width / 2.0);
                    cubic += delta * (width / 6.0);
                }
            }
        }
        [linear, quadratic, cubic]
    }
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
    fn round3_shear_peak_uses_interval_local_coordinate() {
        let a = 1.5_f64;
        let ulp = f64::from_bits(a.to_bits() + 1) - a;
        for steps in [3, 6] {
            let curve = Curve {
                length: 3.0, start: 0.0, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: std::iter::once(DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: 1.0 / ulp, q_j: -1.0 / ulp,
                }),
                points: std::iter::empty(),
            };
            let peak = curve.diagram_cuts(21).unwrap().into_iter()
                .map(|cut| curve.checked_value(cut).unwrap()).fold(f64::NEG_INFINITY, f64::max);
            assert_eq!(peak, f64::from(steps) / 4.0);
        }
    }
}
