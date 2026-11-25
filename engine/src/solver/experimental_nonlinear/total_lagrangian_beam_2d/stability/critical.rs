use super::*;
use crate::linalg::{lu_apply, lu_factor};

#[derive(Debug, Clone, Copy)]
pub struct Refinement {
    pub equilibrium_tolerance: f64,
    /// Distance in [q/D, lambda], not a load-factor error bound.
    pub interval_tolerance: f64,
    pub max_refinements: usize,
    pub max_corrector_iterations: usize,
}
impl Default for Refinement {
    fn default() -> Self {
        Self {
            equilibrium_tolerance: 1e-8,
            interval_tolerance: 1e-5,
            max_refinements: 32,
            max_corrector_iterations: 24,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Localization {
    Bracketed,
    SpectralUncertainty,
    CorrectionFailed,
    BudgetExhausted,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CriticalKind {
    LimitPointCandidate,
    BifurcationCandidate,
    Unresolved,
}

#[derive(Debug, Clone)]
pub struct CriticalBracket {
    /// These endpoints bracket a sign change along the sampled equilibrium branch.
    /// At a fold their load factors do NOT bound the peak load.
    pub stable: CheckedState,
    pub unstable: CheckedState,
    pub near_critical: CheckedState,
    pub resolution: Localization,
    pub kind: CriticalKind,
    pub interval_size: f64,
    pub refinements: usize,
    /// Present when localization stops because a corrector could not be verified.
    pub corrector_error: Option<String>,
}

/// Localize the first sampled stable-to-unstable transition. None means no
/// resolved sign change was sampled, not that the entire path is stable. No
/// automatic branch switch is attempted. Each new point is re-equilibrated on
/// the normal hyperplane of the bracket chord, including across a load fold.
pub fn locate_first_loss(
    model: &BeamModel2D,
    path: &BeamPath2D,
    options: Refinement,
) -> Result<Option<CriticalBracket>, String> {
    tolerance(options.equilibrium_tolerance)?;
    if !options.interval_tolerance.is_finite()
        || options.interval_tolerance <= 0.0
        || options.interval_tolerance > 0.01
        || !(1..=64).contains(&options.max_refinements)
        || !(1..=64).contains(&options.max_corrector_iterations)
        || path.steps.len() > 1000
    {
        return Err("Invalid stability refinement controls or state budget".into());
    }
    let prepared = prepare(model)?;
    let mut left = check(
        &prepared,
        &vec![0.0; prepared.free.len()],
        0.0,
        options.equilibrium_tolerance,
    )?;
    if left.stability.verdict != Verdict::Stable {
        return Err(
            "Initial tangent stability is not resolved for critical-point localization".into(),
        );
    }
    for point in &path.steps {
        let q = coordinates(&prepared, &point.displacements)?;
        let right = check(
            &prepared,
            &q,
            point.load_factor,
            options.equilibrium_tolerance,
        )?;
        if right.stability.reason == Reason::NotEquilibrated {
            return Err("Critical-point localization requires equilibrated path samples".into());
        }
        match right.stability.verdict {
            Verdict::Stable => left = right,
            Verdict::Unstable => return Ok(Some(refine(&prepared, left, right, options)?)),
            Verdict::Undetermined => {}
        }
    }
    Ok(None)
}

fn y(prepared: &PreparedBeam<'_>, point: &CheckedState) -> Result<Vec<f64>, String> {
    let mut y = coordinates(prepared, &point.equilibrium.displacements)?;
    for q in &mut y {
        *q /= prepared.length;
    }
    y.push(point.equilibrium.load_factor);
    if y.iter().any(|v| !v.is_finite()) {
        return Err("Critical-point coordinates exceed the finite range".into());
    }
    Ok(y)
}
fn distance(a: &[f64], b: &[f64]) -> f64 {
    norm(&a.iter().zip(b).map(|(a, b)| a - b).collect::<Vec<_>>())
}
fn better(best: &mut CheckedState, point: &CheckedState) {
    if let Some(value) = point.stability.minimum {
        if best
            .stability
            .minimum
            .is_none_or(|old| value.abs() < old.abs())
        {
            *best = point.clone();
        }
    }
}

fn refine(
    prepared: &PreparedBeam<'_>,
    mut left: CheckedState,
    mut right: CheckedState,
    options: Refinement,
) -> Result<CriticalBracket, String> {
    let mut best = left.clone();
    better(&mut best, &right);
    let mut resolution = Localization::BudgetExhausted;
    let mut refinements = 0;
    let mut corrector_error = None;
    for _ in 0..options.max_refinements {
        let before = distance(&y(prepared, &left)?, &y(prepared, &right)?);
        if !before.is_finite() || before <= 0.0 {
            return Err("Critical-point interval exceeds the finite nonzero range".into());
        }
        if before <= options.interval_tolerance {
            resolution = Localization::Bracketed;
            break;
        }
        let mid = match midpoint(prepared, &left, &right, options) {
            Ok(mid) => mid,
            Err(error) => {
                resolution = Localization::CorrectionFailed;
                corrector_error = Some(error);
                break;
            }
        };
        refinements += 1;
        better(&mut best, &mid);
        let mut quarter_error = None;
        match mid.stability.verdict {
            Verdict::Stable => left = mid,
            Verdict::Unstable => right = mid,
            Verdict::Undetermined => {
                // Never assign a sign to an unresolved eigenvalue. Try points on
                // either side and retain only endpoints with a verified sign.
                match midpoint(prepared, &left, &mid, options) {
                    Ok(p) => {
                        better(&mut best, &p);
                        if p.stability.verdict == Verdict::Stable {
                            left = p;
                        }
                    }
                    Err(error) => quarter_error = Some(error),
                }
                match midpoint(prepared, &mid, &right, options) {
                    Ok(p) => {
                        better(&mut best, &p);
                        if p.stability.verdict == Verdict::Unstable {
                            right = p;
                        }
                    }
                    Err(error) => quarter_error = Some(error),
                }
            }
        }
        let after = distance(&y(prepared, &left)?, &y(prepared, &right)?);
        if !after.is_finite() {
            return Err("Critical-point interval exceeds the finite range".into());
        }
        if after >= before {
            resolution = if quarter_error.is_some() {
                Localization::CorrectionFailed
            } else {
                Localization::SpectralUncertainty
            };
            corrector_error = quarter_error;
            break;
        }
    }
    let interval_size = distance(&y(prepared, &left)?, &y(prepared, &right)?);
    if interval_size <= options.interval_tolerance {
        resolution = Localization::Bracketed;
    }
    let kind = if resolution == Localization::Bracketed {
        kind(&best.stability)
    } else {
        CriticalKind::Unresolved
    };
    Ok(CriticalBracket {
        stable: left,
        unstable: right,
        near_critical: best,
        resolution,
        kind,
        interval_size,
        refinements,
        corrector_error,
    })
}

fn kind(s: &TangentStability) -> CriticalKind {
    let (Some(value), Some(bound), Some(second), Some(coupling)) =
        (s.minimum, s.uncertainty, s.second, s.load_coupling)
    else {
        return CriticalKind::Unresolved;
    };
    let gap = second - value;
    if value.abs() > 1e-6 || gap <= 100.0 * bound {
        return CriticalKind::Unresolved;
    }
    let direction_error = 2.0 * bound / gap;
    if coupling - direction_error > 1e-3 {
        CriticalKind::LimitPointCandidate
    } else if coupling + direction_error < 1e-4 {
        CriticalKind::BifurcationCandidate
    } else {
        CriticalKind::Unresolved
    }
}

fn midpoint(
    prepared: &PreparedBeam<'_>,
    left: &CheckedState,
    right: &CheckedState,
    options: Refinement,
) -> Result<CheckedState, String> {
    let a = y(prepared, left)?;
    let b = y(prepared, right)?;
    let span = distance(&a, &b);
    if !span.is_finite() || span <= 0.0 {
        return Err("Critical-point bracket has no finite extent".into());
    }
    let direction: Vec<_> = a.iter().zip(&b).map(|(a, b)| (b - a) / span).collect();
    let center: Vec<_> = a.iter().zip(&b).map(|(a, b)| 0.5 * a + 0.5 * b).collect();
    let n = prepared.free.len();
    let force = norm(&prepared.reference);
    let evaluate = |state: &[f64]| -> Result<(Assembly<BeamEquilibrium2D>, Vec<f64>, f64), String> {
        if state.iter().any(|v| !v.is_finite()) {
            return Err("Critical-point trial exceeds the finite range".into());
        }
        let q: Vec<_> = state[..n].iter().map(|u| u * prepared.length).collect();
        let at = prepared.assemble(&q, state[n])?;
        let plane = direction
            .iter()
            .zip(state.iter().zip(&center))
            .map(|(d, (v, c))| d * (v - c))
            .sum::<f64>();
        if !plane.is_finite() {
            return Err("Critical-point hyperplane exceeds the finite range".into());
        }
        Ok((at, q, plane))
    };
    let mut state = center.clone();
    for _ in 0..options.max_corrector_iterations {
        let (at, q, plane) = evaluate(&state)?;
        if at.measure < options.equilibrium_tolerance && plane.abs() < options.equilibrium_tolerance
        {
            if distance(&state, &center) > 0.75 * span {
                return Err("Critical-point corrector left the local bracket".into());
            }
            return check(prepared, &q, state[n], options.equilibrium_tolerance);
        }
        let size = n + 1;
        let mut matrix = vec![0.0; size * size];
        let mut rhs = vec![0.0; size];
        for i in 0..n {
            for j in 0..n {
                matrix[i * size + j] = (at.tangent[i * n + j] * prepared.length) / force;
            }
            matrix[i * size + n] = -prepared.reference[i] / force;
            rhs[i] = at.residual[i] / force;
        }
        matrix[n * size..].copy_from_slice(&direction);
        rhs[n] = -plane;
        let correction = solve_bordered(matrix, rhs, size)?;
        let merit = at.measure.hypot(plane);
        let mut accepted = None;
        for backtrack in 0..8 {
            let alpha = 0.5_f64.powi(backtrack);
            let trial: Vec<_> = state
                .iter()
                .zip(&correction)
                .map(|(u, d)| u + alpha * d)
                .collect();
            if distance(&trial, &center) > 0.75 * span {
                continue;
            }
            if let Ok((found, _, g)) = evaluate(&trial) {
                if found.measure.hypot(g) < merit {
                    accepted = Some(trial);
                    break;
                }
            }
        }
        state = accepted.ok_or("Critical-point corrector did not reduce the residual")?;
    }
    Err("Critical-point corrector exhausted its iteration budget".into())
}

fn solve_bordered(mut a: Vec<f64>, mut b: Vec<f64>, n: usize) -> Result<Vec<f64>, String> {
    if a.iter().chain(&b).any(|v| !v.is_finite()) {
        return Err("Critical-point system exceeds the finite range".into());
    }
    for i in 0..n {
        let scale = a[i * n..(i + 1) * n]
            .iter()
            .fold(0.0_f64, |a, v| a.max(v.abs()));
        if scale <= 0.0 {
            return Err("Singular critical-point system".into());
        }
        for v in &mut a[i * n..(i + 1) * n] {
            *v /= scale;
        }
        b[i] /= scale;
    }
    if b.iter().any(|v| !v.is_finite()) {
        return Err("Critical-point right-hand side exceeds the finite range".into());
    }
    let mut factored = a.clone();
    let piv = lu_factor(&mut factored, n).ok_or("Singular critical-point system")?;
    if factored.iter().any(|v| !v.is_finite()) {
        return Err("Critical-point factor exceeds the finite range".into());
    }
    let x = lu_apply(&factored, &piv, &b, n).ok_or("Nonfinite critical-point correction")?;
    for i in 0..n {
        let (mut sum, mut bound) = (0.0, b[i].abs());
        for j in 0..n {
            let p = a[i * n + j] * x[j];
            sum += p;
            bound += p.abs();
        }
        let error = (sum - b[i]).abs();
        if !sum.is_finite() || !bound.is_finite() || !error.is_finite() || error > 1e-10 * bound {
            return Err("Critical-point solve failed its residual check".into());
        }
    }
    Ok(x)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiple_or_unresolved_critical_directions_are_not_classified() {
        let mut s = unknown(Reason::NearSingular);
        s.minimum = Some(0.0);
        s.uncertainty = Some(1e-12);
        s.second = Some(1e-13);
        s.load_coupling = Some(1.0);
        assert_eq!(kind(&s), CriticalKind::Unresolved);
        s.second = Some(1e-2);
        s.load_coupling = Some(2e-4);
        assert_eq!(kind(&s), CriticalKind::Unresolved);
        s.second = None;
        assert_eq!(kind(&s), CriticalKind::Unresolved);
    }
    #[test]
    fn bordered_corrector_checks_finiteness_singularity_and_residual() {
        let x = solve_bordered(vec![2.0, 1.0, 1.0, -1.0], vec![4.0, -1.0], 2).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-14 && (x[1] - 2.0).abs() < 1e-14);
        assert!(solve_bordered(vec![0.0], vec![1.0], 1).is_err());
        assert!(solve_bordered(vec![f64::NAN], vec![1.0], 1).is_err());
        assert!(solve_bordered(vec![1.0], vec![f64::INFINITY], 1).is_err());
        assert!(solve_bordered(vec![1e-300], vec![f64::MAX], 1).is_err());
    }
}
