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

    fn interior(length: f64, start: f64, end: f64, u: f64) -> Self {
        let lo = (start + 0.0) / length;
        let hi = (end + 0.0) / length;
        Self { t: lo + (hi - lo) * u, right: false, location: Location::Interior { start, end, u } }
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

#[derive(Default)]
struct DiagramSum {
    sum: f64,
    correction: f64,
}

impl DiagramSum {
    fn add(&mut self, term: f64) {
        let next = self.sum + term;
        if next.is_finite() {
            self.correction += if self.sum.abs() >= term.abs() {
                (self.sum - next) + term
            } else {
                (term - next) + self.sum
            };
        }
        self.sum = next;
    }

    fn value(self) -> f64 {
        self.sum + self.correction
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
        let mut value = DiagramSum::default();
        value.add(self.start);
        value.add(self.slope * x);
        value.add(self.change * t);
        if offset != 0.0 {
            value.add(self.slope * offset);
            value.add(self.change * (offset / self.length));
        }
        for d in self.distributed.clone() {
            let (force, moment) = distributed_load_terms_at_distance(d.q_i, d.q_j, d.b - d.a, distance(d.a));
            value.add(match self.response {
                Response::Force(sign) => sign * force,
                Response::Moment(sign) => sign * moment,
            });
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
        Ok(value.value())
    }

    pub fn checked_station_value(&self, t: f64, right: bool) -> Result<f64, &'static str> {
        let value = self.checked_value(Cut::at(t, right))?;
        if !(0.0..=1.0).contains(&t) || self.distributed.clone().next().is_none() {
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
                let peak = self.checked_value(cut)?;
                if !(0.0 < actual && actual < 1.0 && peak.is_finite())
                    || peak + change_between(change, u, actual) != peak
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
        mut visit: impl FnMut(Cut, [f64; 3], f64) -> Result<(), &'static str>,
    ) -> Result<(), &'static str> {
        if x0 == x1 {
            return Ok(());
        }
        let lo = (x0 + 0.0) / self.length;
        let hi = (x1 + 0.0) / self.length;
        let change = self.segment_change(x0, x1);
        for u in interior_roots(change)? {
            let cut = Cut::interior(self.length, x0, x1, u);
            if at.is_some_and(|t| t != cut.t) {
                continue;
            }
            if lo < cut.t && cut.t < hi {
                visit(cut, change, u)?;
                continue;
            }
            let (boundary, v) = if cut.t == lo {
                (Cut::boundary(lo, x0, true), 0.0)
            } else {
                (Cut::boundary(hi, x1, false), 1.0)
            };
            let boundary_value = self.checked_value(boundary)?;
            let peak = boundary_value + change_between(change, v, u);
            if !peak.is_finite() || peak != boundary_value {
                return Err("interior member diagram extremum has no distinct normalized station");
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
        for d in self.distributed.clone() {
            let sign = match self.response {
                Response::Force(sign) => sign,
                Response::Moment(sign) => {
                    linear.add((sign * width) * distributed_load_terms(d.q_i, d.q_j, d.a, d.b, x).0);
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
                    linear.add(initial);
                    quadratic.add(delta / 2.0);
                }
                Response::Moment(_) => {
                    quadratic.add(initial * (width / 2.0));
                    cubic.add(delta * (width / 6.0));
                }
            }
        }
        [linear.value(), quadratic.value(), cubic.value()]
    }
}

fn change_between([linear, quadratic, cubic]: [f64; 3], from: f64, to: f64) -> f64 {
    (to - from) * (linear + quadratic * (to + from) + cubic * (to * to + to * from + from * from))
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
    fn round3_shear_peak_uses_interval_local_coordinate() {
        let a = 1.5_f64;
        let ulp = f64::from_bits(a.to_bits() + 1) - a;
        for steps in [2, 3, 6] {
            let curve = Curve {
                length: 3.0, start: 0.0, change: 0.0, slope: 0.0,
                response: Response::Force(1.0),
                distributed: std::iter::once(DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: 1.0 / ulp, q_j: -1.0 / ulp,
                }),
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
                distributed: std::iter::once(DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: 1.0 / ulp, q_j: -1.0 / ulp,
                }),
                points: std::iter::empty(),
            };
            assert_eq!(curve.checked_station_value(0.5, false).is_err(), steps == 2);
            assert_eq!(curve.checked_station_value(0.5, true).is_err(), steps == 2);
            assert_eq!(curve.checked_station_value(0.25, false), Ok(0.0));
        }
    }

    #[test]
    #[ignore = "known wrong result: #2437"]
    fn issue_2437_endpoint_terms_survive_cancellation() {
        let huge = 2.0_f64.powi(54);
        let loads = [(1.0, huge), (0.0, -huge), (0.0, -1.0)].map(|(q_i, q_j)| {
            DistributedLoadInfo { a: 0.0, b: 1.0, q_i, q_j }
        });
        let curve = Curve {
            length: 1.0, start: 0.0, change: 0.0, slope: 0.0,
            response: Response::Force(1.0),
            distributed: loads.into_iter(),
            points: std::iter::empty(),
        };
        let cuts = curve.critical_cuts().unwrap();
        assert_eq!(cuts.iter().map(|cut| cut.t).collect::<Vec<_>>(), [0.0, 0.5, 1.0]);
        assert_eq!(curve.interior_range(0.0), Ok((0.0, 0.25)));
        assert_eq!(curve.checked_station_value(0.5, false), Ok(0.25));
        assert_eq!(curve.checked_station_value(1.0, false), Ok(0.0));
    }

    #[test]
    #[ignore = "known wrong result: #2437"]
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
                distributed: std::iter::once(DistributedLoadInfo {
                    a, b: a + f64::from(steps) * ulp, q_i: q, q_j: -q,
                }),
                points: std::iter::once(PointAction { a: 1.0, jump: 1.0, slope: 0.0 }),
            };
            let at = a / curve.length;
            assert_eq!(curve.checked_station_value(at.next_down(), false), Ok(start));
            for right in [false, true] {
                assert_eq!(curve.checked_station_value(at, right), if aliases { Err(refusal) } else { Ok(start) });
            }
            if aliases {
                assert_eq!(curve.diagram_cuts(21), Err(refusal));
                assert_eq!(curve.interior_range(start), Err(refusal));
            } else {
                let expected = if steps == 2 { start } else { start + 8.0 };
                assert_eq!(curve.interior_range(start), Ok((start, expected)));
            }
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
            distributed: loads.into_iter(),
            points: std::iter::empty(),
        };
        let cuts = curve.critical_cuts().unwrap();
        assert_eq!(cuts.last().unwrap().t, 1.0);
        assert_eq!(cuts.iter().filter(|cut| cut.t == 1.0).count(), 1);
    }
}
