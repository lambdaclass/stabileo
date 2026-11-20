use crate::element::distributed_load_terms;
use crate::types::DistributedLoadInfo;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Cut {
    pub t: f64,
    pub right: bool,
}

impl Cut {
    pub fn left(t: f64) -> Self {
        Self { t, right: false }
    }

    pub fn right(t: f64) -> Self {
        Self { t, right: true }
    }

    fn includes(self, t: f64) -> bool {
        t < self.t || (self.right && t == self.t)
    }
}

pub(crate) fn sort_cuts(cuts: &mut Vec<Cut>) {
    cuts.sort_by(|a, b| a.t.total_cmp(&b.t).then(a.right.cmp(&b.right)));
    cuts.dedup();
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
    pub fn value(&self, cut: Cut) -> f64 {
        self.checked_value(cut).unwrap_or_else(|error| panic!("{error}"))
    }

    pub fn checked_value(&self, cut: Cut) -> Result<f64, &'static str> {
        let mut hits = self.action_distances().filter(|a| a / self.length == cut.t);
        let exact = hits.next();
        if let Some(x) = exact {
            if hits.any(|a| a != x) || (cut.t == 0.0 && x != 0.0) || (cut.t == 1.0 && x != self.length) {
                return Err("distinct member diagram cuts share a normalized station");
            }
        }
        let x = exact.unwrap_or(cut.t * self.length);
        let mut value = self.start + self.slope * x + self.change * cut.t;
        for d in self.distributed.clone() {
            let (force, moment) = distributed_load_terms(d.q_i, d.q_j, d.a, d.b, x);
            value += match self.response {
                Response::Force(sign) => sign * force,
                Response::Moment(sign) => sign * moment,
            };
        }
        for p in self.points.clone() {
            let t = p.a / self.length;
            if cut.includes(t) {
                if p.slope != 0.0 && cut.t != t {
                    value += p.slope * (x - p.a);
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
            return Err("distinct member diagram cuts share a normalized station");
        }
        Ok(distances)
    }

    pub fn critical_cuts(&self) -> Result<Vec<Cut>, &'static str> {
        let at = |x: f64| (x + 0.0) / self.length;
        let boundaries = self.boundaries()?;
        let mut cuts = Vec::new();
        for &t in &boundaries {
            cuts.push(Cut::left(at(t)));
        }
        cuts.extend(self.points.clone().filter(|p| p.jump != 0.0).map(|p| at(p.a))
            .filter(|t| (0.0..1.0).contains(t)).map(Cut::right));
        for segment in boundaries.windows(2) {
            let [x0, x1] = [segment[0], segment[1]];
            let [lo, hi] = [at(x0), at(x1)];
            let [linear, quadratic, cubic] = self.segment_change(x0, x1);
            for u in quadratic_roots(cubic, quadratic, linear)? {
                if u > 0.0 && u < 1.0 {
                    let t = lo + (hi - lo) * u;
                    if !(lo < t && t < hi) {
                        let base = self.value(Cut::right(lo));
                        let value = |x| base + x * (linear + x * (quadratic + x * cubic));
                        if value(u) != value(if t == lo { 0.0 } else { 1.0 }) {
                            return Err("interior member diagram extremum has no distinct normalized station");
                        }
                    }
                    cuts.push(Cut::left(t));
                }
            }
        }
        sort_cuts(&mut cuts);
        Ok(cuts)
    }

    pub fn diagram_cuts(&self, count: usize) -> Result<Vec<Cut>, &'static str> {
        let mut cuts = self.critical_cuts()?;
        cuts.extend(uniform_cuts(count));
        sort_cuts(&mut cuts);
        Ok(cuts)
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
