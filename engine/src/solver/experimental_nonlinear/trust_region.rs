use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};

const REJECT: f64 = 0.1;
const POOR: f64 = 0.25;
const GOOD: f64 = 0.75;
const SHRINK: f64 = 0.25;
const AT_THE_EDGE: f64 = 0.99;

/// Newton inside a trust region, by the dogleg: the step is Newton's when that is no longer
/// than the radius, and otherwise runs from the minimum along a second direction towards
/// Newton's step until it meets the radius. The second direction is the residual through the
/// tangent the increment factorized first.
///
/// A step is judged by the energy it released, taken as the mean work of the residual on it
/// before and after, against what the tangent predicted. One that released too little is
/// undone and shortened, which costs an assembly and no factorization. Where Newton's step is
/// not a descent the second direction is taken alone.
pub(crate) struct TrustRegion;

impl Iteration for TrustRegion {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut kept_radius: Option<f64> = None;
        let mut at = budget.linearize(problem)?;
        loop {
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            if !budget.has_remaining() {
                return Ok(false);
            }
            if at.forced {
                let step = problem.correction(false)?;
                problem.advance(&step);
                at = budget.linearize(problem)?;
                continue;
            }
            let residual = problem.residual();
            let kept = problem.lagged_solve(&residual);
            let factorized = kept.is_some();
            let descent = kept.map(|reduced| {
                let curved = problem.tangent_times(&reduced);
                let curvature = reduced.iter().zip(&curved).map(|(a, b)| a * b).sum::<f64>();
                let step = problem.expand(&reduced);
                Leg { work: problem.work(&step), curvature, step }
            });
            let newton = problem.correction(!factorized)?;
            let model = Model {
                newton_work: problem.work(&newton),
                newton,
                descent: descent.filter(|leg| leg.work.is_finite() && leg.work > 0.0 && leg.curvature.is_finite()),
            };
            let origin = problem.state();
            let mut radius = kept_radius.unwrap_or_else(|| length(&model.newton));
            at = loop {
                let dogleg = model.within(radius);
                problem.advance(&dogleg.step);
                let found = budget.linearize(problem)?;
                if found.measure < tolerance && !found.forced {
                    return Ok(true);
                }
                let released = 0.5 * (dogleg.work + problem.work(&dogleg.step));
                let long = length(&dogleg.step);
                match judged((released, dogleg.predicted), found.measure, long, radius) {
                    Some(next) => {
                        kept_radius = Some(next);
                        break found;
                    }
                    None => {
                        problem.set_state(&origin);
                        if !(budget.has_remaining() && long > 0.0) {
                            return Ok(false);
                        }
                        radius = SHRINK * long;
                    }
                }
            };
        }
    }
}

fn length(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

/// The radius after a step of length `long` taken inside `radius` released `released` where
/// `predicted` was expected; `None` when the step is to be undone, as one is that was not
/// predicted to release anything.
pub(super) fn judged((released, predicted): (f64, f64), measure: f64, long: f64, radius: f64) -> Option<f64> {
    let gain = released / predicted;
    if !(predicted > 0.0 && gain.is_finite() && measure.is_finite()) || gain < REJECT {
        return None;
    }
    Some(if gain < POOR {
        SHRINK * long
    } else if gain > GOOD && long >= AT_THE_EDGE * radius {
        2.0 * radius
    } else {
        radius
    })
}

pub(super) struct Leg {
    pub step: Vec<f64>,
    /// The work of the residual on `step`.
    pub work: f64,
    /// `step` through the tangent, times `step`.
    pub curvature: f64,
}

pub(super) struct Model {
    pub newton: Vec<f64>,
    pub newton_work: f64,
    /// A second direction the residual does positive work on.
    pub descent: Option<Leg>,
}

pub(super) struct Dogleg {
    pub step: Vec<f64>,
    /// The work of the residual on `step`.
    pub work: f64,
    /// The energy the tangent predicts `step` releases.
    pub predicted: f64,
}

impl Model {
    /// `along` of the descent leg plus `towards` of Newton's step.
    fn mixed(&self, along: f64, towards: f64) -> Dogleg {
        let (leg_work, curvature) = self.descent.as_ref().map_or((0.0, 0.0), |leg| (leg.work, leg.curvature));
        let step = match &self.descent {
            Some(leg) if along != 0.0 => self.newton.iter().zip(&leg.step).map(|(n, d)| towards * n + along * d).collect(),
            _ => self.newton.iter().map(|n| towards * n).collect(),
        };
        let work = along * leg_work + towards * self.newton_work;
        let quadratic = along * along * curvature + 2.0 * along * towards * leg_work + towards * towards * self.newton_work;
        Dogleg { step, work, predicted: work - 0.5 * quadratic }
    }

    pub(super) fn within(&self, radius: f64) -> Dogleg {
        let newton_long = length(&self.newton);
        let descends = self.newton_work.is_finite() && self.newton_work > 0.0;
        if descends && newton_long <= radius {
            return self.mixed(0.0, 1.0);
        }
        let Some(leg) = &self.descent else {
            let to_the_edge = radius / newton_long;
            return self.mixed(0.0, if descends { to_the_edge } else { -to_the_edge });
        };
        let leg_long = length(&leg.step);
        let to_the_edge = radius / leg_long;
        let lowest = if leg.curvature > 0.0 { leg.work / leg.curvature } else { f64::INFINITY };
        if lowest >= to_the_edge {
            return self.mixed(to_the_edge, 0.0);
        }
        if !descends {
            return self.mixed(lowest, 0.0);
        }
        let (mut span, mut reach, mut from) = (0.0, 0.0, 0.0);
        for (n, d) in self.newton.iter().zip(&leg.step) {
            let (start, way) = (lowest * d, n - lowest * d);
            span += way * way;
            reach += start * way;
            from += start * start;
        }
        let share = ((reach * reach + span * (radius * radius - from)).sqrt() - reach) / span;
        if !share.is_finite() {
            return self.mixed(lowest, 0.0);
        }
        let share = share.clamp(0.0, 1.0);
        self.mixed(lowest * (1.0 - share), share)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STIFF: [f64; 2] = [1.0, 100.0];
    const RESIDUAL: [f64; 2] = [1.0, 10.0];

    fn model(descent: bool) -> Model {
        Model {
            newton: vec![1.0, 0.1],
            newton_work: 2.0,
            descent: descent.then(|| Leg { step: RESIDUAL.to_vec(), work: 101.0, curvature: 10_001.0 }),
        }
    }

    fn checked(dogleg: &Dogleg, radius: f64) {
        let work: f64 = dogleg.step.iter().zip(RESIDUAL).map(|(s, r)| s * r).sum();
        let quadratic: f64 = dogleg.step.iter().zip(STIFF).map(|(s, k)| s * k * s).sum();
        assert!((dogleg.work - work).abs() <= 1e-12 * work.abs(), "{} vs {work}", dogleg.work);
        let predicted = work - 0.5 * quadratic;
        assert!((dogleg.predicted - predicted).abs() <= 1e-12, "{} vs {predicted}", dogleg.predicted);
        assert!(dogleg.predicted > 0.0);
        assert!(length(&dogleg.step) <= radius * (1.0 + 1e-12));
    }

    #[test]
    fn newtons_step_is_taken_whole_when_it_fits() {
        for descent in [false, true] {
            let dogleg = model(descent).within(1.01);
            assert_eq!(dogleg.step, vec![1.0, 0.1]);
            assert_eq!((dogleg.work, dogleg.predicted), (2.0, 1.0));
        }
    }

    #[test]
    fn a_step_that_does_not_fit_ends_on_the_radius_and_predicts_what_the_tangent_gives() {
        let mut last = 0.0;
        for radius in [0.001, 0.05, 0.1, 0.11, 0.3, 0.5, 0.9, 1.0] {
            let dogleg = model(true).within(radius);
            checked(&dogleg, radius);
            assert!((length(&dogleg.step) - radius).abs() <= 1e-12, "{radius}");
            assert!(dogleg.predicted > last, "{radius}");
            last = dogleg.predicted;
        }
        let short = model(true).within(0.05);
        assert!((short.step[1] / short.step[0] - 10.0).abs() < 1e-12);
        let bent = model(true).within(0.5);
        assert!(bent.step[1] / bent.step[0] < 1.0);
    }

    #[test]
    fn without_a_second_direction_newtons_step_is_shortened() {
        let dogleg = model(false).within(0.5);
        checked(&dogleg, 0.5);
        assert!((dogleg.step[1] / dogleg.step[0] - 0.1).abs() < 1e-12);
        assert!((length(&dogleg.step) - 0.5).abs() <= 1e-12);
    }

    #[test]
    fn without_a_second_direction_a_newton_step_that_climbs_is_taken_backwards() {
        let climbing = Model { newton_work: -2.0, ..model(false) };
        for radius in [0.5, 5.0] {
            let back = climbing.within(radius);
            assert!((back.step[0] + radius / length(&climbing.newton)).abs() < 1e-12);
            assert!((length(&back.step) - radius).abs() <= 1e-12);
            assert!(back.work > 0.0 && back.predicted > back.work);
        }
    }

    #[test]
    fn where_newtons_step_is_not_a_descent_the_second_direction_is_taken_alone() {
        for newton_work in [0.0, -2.0, f64::NAN] {
            let model = Model { newton_work, ..model(true) };
            let lowest = model.within(10.0);
            assert!((lowest.step[0] - 101.0 / 10_001.0).abs() < 1e-15);
            assert!((lowest.step[1] / lowest.step[0] - 10.0).abs() < 1e-12);
            let cut = model.within(0.01);
            assert!((length(&cut.step) - 0.01).abs() <= 1e-15);
        }
        let falling = Model { descent: Some(Leg { step: RESIDUAL.to_vec(), work: 101.0, curvature: -5.0 }), newton_work: -2.0, ..model(true) };
        let edge = falling.within(3.0);
        assert!((length(&edge.step) - 3.0).abs() <= 1e-12);
        assert!(edge.predicted > edge.work);
    }

    #[test]
    fn a_step_is_undone_grown_or_shortened_by_the_energy_it_released() {
        assert_eq!(judged((0.09, 1.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((-3.0, 1.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((f64::NAN, 1.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((f64::INFINITY, 1.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((1.0, 1.0), f64::NAN, 2.0, 2.0), None);
        assert_eq!(judged((0.1, 1.0), 1.0, 2.0, 2.0), Some(0.5));
        assert_eq!(judged((0.25, 1.0), 1.0, 2.0, 2.0), Some(2.0));
        assert_eq!(judged((0.75, 1.0), 1.0, 2.0, 2.0), Some(2.0));
        assert_eq!(judged((0.8, 1.0), 1.0, 2.0, 2.0), Some(4.0));
        assert_eq!(judged((0.8, 1.0), 1.0, 1.0, 2.0), Some(2.0));
        assert_eq!(judged((50.0, 1.0), 1.0, 2.0, 2.0), Some(4.0));
        assert_eq!(judged((1.0, 2.0), 1.0, 2.0, 2.0), Some(2.0));
        assert_eq!(judged((-1.0, -1.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((1.0, 0.0), 1.0, 2.0, 2.0), None);
        assert_eq!(judged((1.0, f64::NAN), 1.0, 2.0, 2.0), None);
    }
}
