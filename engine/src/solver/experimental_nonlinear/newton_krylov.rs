use super::incremental::{
    Direction, IncrementalProblem, Iteration, IterationBudget, IterationError,
};

const FORCING: f64 = 1e-3;
const MAX_INNER: usize = 50;

/// Inexact Newton: the Newton equation of every iteration is solved by conjugate gradients on
/// the current tangent, preconditioned by the tangent the increment factorized first. The
/// tangent is applied, never factorized again, so an increment costs one factorization and
/// converges at close to Newton's rate.
///
/// The exact solve takes over for an iteration when there is no factor to precondition with,
/// when a correction is forced, and when conjugate gradients break down, which is what an
/// indefinite tangent does to them.
pub(crate) struct NewtonKrylov;

impl Iteration for NewtonKrylov {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        while budget.has_remaining() {
            let at = budget.linearize(problem)?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            let step = Direction::NewtonKrylov.step(problem, at.forced)?;
            problem.advance(&step);
        }
        Ok(false)
    }
}

impl Direction {
    /// The step this direction gives for the last linearization. A forced correction is the
    /// problem's own, whole.
    pub(crate) fn step<P: IncrementalProblem + ?Sized>(
        self,
        problem: &mut P,
        forced: bool,
    ) -> Result<Vec<f64>, String> {
        match self {
            Direction::Newton => problem.correction(false),
            Direction::ModifiedNewton => problem.correction(true),
            // The planar driver forces prescribed motion at the start of an increment,
            // after clearing its cached factor. This solves the current tangent exactly
            // and keeps that factor for the subsequent inexact corrections.
            Direction::NewtonKrylov if forced => problem.correction(true),
            Direction::NewtonKrylov => match inexact(problem) {
                Inexact::Step(step) => Ok(step),
                Inexact::NoFactor => problem.correction(true),
                Inexact::BrokeDown => problem.correction(false),
            },
        }
    }
}

pub(super) enum Inexact {
    Step(Vec<f64>),
    NoFactor,
    BrokeDown,
}

/// Preconditioned conjugate gradients on K·x = r from x = 0, until the residual of that
/// equation is `FORCING` of r.
pub(super) fn inexact<P: IncrementalProblem + ?Sized>(problem: &P) -> Inexact {
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let mut r = problem.residual();
    let Some(mut z) = problem.lagged_solve(&r) else {
        return Inexact::NoFactor;
    };
    let target = FORCING * dot(&r, &r).sqrt();
    let mut rz = dot(&r, &z);
    if !(rz.is_finite() && rz > 0.0) {
        return Inexact::BrokeDown;
    }
    let mut x = vec![0.0; r.len()];
    let mut p = z.clone();
    for _ in 0..MAX_INNER {
        let ap = problem.tangent_times(&p);
        let pap = dot(&p, &ap);
        if !(pap.is_finite() && pap > 0.0) {
            return Inexact::BrokeDown;
        }
        let alpha = rz / pap;
        for ((xi, ri), (pi, api)) in x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(&ap)) {
            *xi += alpha * pi;
            *ri -= alpha * api;
        }
        let remaining = dot(&r, &r).sqrt();
        if !remaining.is_finite() {
            return Inexact::BrokeDown;
        }
        if remaining <= target {
            return Inexact::Step(problem.expand(&x));
        }
        z = match problem.lagged_solve(&r) {
            Some(z) => z,
            None => return Inexact::BrokeDown,
        };
        let next = dot(&r, &z);
        if !(next.is_finite() && next > 0.0) {
            return Inexact::BrokeDown;
        }
        let beta = next / rz;
        rz = next;
        for (pi, zi) in p.iter_mut().zip(&z) {
            *pi = zi + beta * *pi;
        }
    }
    Inexact::BrokeDown
}
