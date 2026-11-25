//! Optional local static stability of conservative, elastic beam equilibria.
//! The equilibrium solver is not changed. A positive tangent establishes a local
//! energy minimum of this discrete model, not member capacity or design approval.
//! Near zero, round-off and spectral residuals must leave the sign undetermined.

use super::super::discrete_problem::Problem;
use super::*;
use crate::linalg::jacobi_eigen;

mod critical;
pub use critical::{locate_first_loss, CriticalBracket, CriticalKind, Localization, Refinement};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Stable,
    Unstable,
    Undetermined,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    PositiveTangent,
    NegativeDirection,
    NearSingular,
    NotEquilibrated,
    NonFiniteSpectrum,
    AsymmetricTangent,
    UnverifiedSpectrum,
}

#[derive(Debug, Clone)]
pub struct Mode2D {
    /// Maximum nodal translation magnitude is one. Sign is arbitrary; test both
    /// signs when studying sensitivity to geometric imperfections.
    pub translations: Vec<[f64; 2]>,
    /// Rotation per unit translation amplitude (inverse length).
    pub rotations: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct TangentStability {
    pub verdict: Verdict,
    pub reason: Reason,
    /// Eigenvalues of K/||K||F in the work-conjugate [ux,uy,D*theta] coordinates.
    pub minimum: Option<f64>,
    /// Numerical spectral bound for the assembled matrix; excludes mesh,
    /// constitutive-model and equilibrium-approximation error.
    pub uncertainty: Option<f64>,
    pub second: Option<f64>,
    pub negative_modes: usize,
    pub mode: Option<Mode2D>,
    /// Absolute projection of the unit critical direction on the unit load.
    /// It is an indicator of a limit point vs bifurcation, not a proof of either.
    pub load_coupling: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct CheckedState {
    /// Recomputed from the supplied geometry, displacement and load factor.
    pub equilibrium: BeamEquilibrium2D,
    pub stability: TangentStability,
}

fn unknown(reason: Reason) -> TangentStability {
    TangentStability {
        verdict: Verdict::Undetermined,
        reason,
        minimum: None,
        uncertainty: None,
        second: None,
        negative_modes: 0,
        mode: None,
        load_coupling: None,
    }
}

fn tolerance(tol: f64) -> Result<(), String> {
    if !tol.is_finite() || tol <= 0.0 || tol > 1e-6 {
        return Err(
            "Stability diagnostics require a finite equilibrium tolerance in (0, 1e-6]".into(),
        );
    }
    Ok(())
}

fn prepare(model: &BeamModel2D) -> Result<PreparedBeam<'_>, String> {
    // Reuse the solver's admission, mechanism and conditioning guards.
    Ok(Problem::new(PreparedBeam::new(model)?)?.model)
}

fn coordinates(
    prepared: &PreparedBeam<'_>,
    displacements: &[[f64; 3]],
) -> Result<Vec<f64>, String> {
    if displacements.len() != prepared.model.positions.len()
        || displacements.iter().flatten().any(|v| !v.is_finite())
    {
        return Err(
            "Stability diagnostics require finite displacements for every model node".into(),
        );
    }
    for (i, u) in displacements.iter().enumerate() {
        for (j, &value) in u.iter().enumerate() {
            if prepared.model.fixed[i][j] && value != 0.0 {
                return Err("Stability state moves a fixed degree of freedom".into());
            }
        }
    }
    let q: Vec<_> = prepared
        .free
        .iter()
        .map(|&i| displacements[i / 3][i % 3] * prepared.weight(i))
        .collect();
    if q.iter().any(|v| !v.is_finite()) {
        return Err("Stability coordinate scaling exceeds the finite range".into());
    }
    Ok(q)
}

/// Does not trust a stored convergence flag or stored forces/reactions.
pub fn diagnose_state(
    model: &BeamModel2D,
    load_factor: f64,
    displacements: &[[f64; 3]],
    equilibrium_tolerance: f64,
) -> Result<CheckedState, String> {
    tolerance(equilibrium_tolerance)?;
    let prepared = prepare(model)?;
    let q = coordinates(&prepared, displacements)?;
    check(&prepared, &q, load_factor, equilibrium_tolerance)
}

/// Inspect accepted samples only; no claim about unsampled portions of a path.
pub fn diagnose_path(
    model: &BeamModel2D,
    path: &BeamPath2D,
    equilibrium_tolerance: f64,
) -> Result<Vec<CheckedState>, String> {
    tolerance(equilibrium_tolerance)?;
    if path.steps.len() > 1000 {
        return Err("Stability path exceeds the 1000-state budget".into());
    }
    let prepared = prepare(model)?;
    path.steps
        .iter()
        .map(|s| {
            let q = coordinates(&prepared, &s.displacements)?;
            check(&prepared, &q, s.load_factor, equilibrium_tolerance)
        })
        .collect()
}

fn check(
    prepared: &PreparedBeam<'_>,
    q: &[f64],
    lambda: f64,
    tol: f64,
) -> Result<CheckedState, String> {
    let at = prepared.assemble(q, lambda)?;
    let (mut stability, mode) = if at.measure < tol {
        spectrum(&at.tangent, q.len(), 64)
    } else {
        (unknown(Reason::NotEquilibrated), None)
    };
    if let Some(v) = mode {
        let reference_norm = norm(&prepared.reference);
        let coupling = v
            .iter()
            .zip(&prepared.reference)
            .map(|(v, f)| v * (f / reference_norm))
            .sum::<f64>()
            .abs();
        if coupling.is_finite() {
            stability.load_coupling = Some(coupling.min(1.0));
        }
        stability.mode = physical_mode(prepared, &v);
    }
    Ok(CheckedState {
        equilibrium: at.equilibrium,
        stability,
    })
}

fn physical_mode(prepared: &PreparedBeam<'_>, v: &[f64]) -> Option<Mode2D> {
    let mut mode = Mode2D {
        translations: vec![[0.0; 2]; prepared.model.positions.len()],
        rotations: vec![0.0; prepared.model.positions.len()],
    };
    for (&i, &value) in prepared.free.iter().zip(v) {
        if i % 3 == 2 {
            mode.rotations[i / 3] = value / prepared.length;
        } else {
            mode.translations[i / 3][i % 3] = value;
        }
    }
    let peak = mode
        .translations
        .iter()
        .map(|v| v[0].hypot(v[1]))
        .fold(0.0_f64, f64::max);
    if peak <= 1e-12 || !peak.is_finite() {
        return None;
    }
    for v in mode
        .translations
        .iter_mut()
        .flatten()
        .chain(&mut mode.rotations)
    {
        *v /= peak;
    }
    mode.translations
        .iter()
        .flatten()
        .chain(&mode.rotations)
        .all(|v| v.is_finite())
        .then_some(mode)
}

fn spectrum(k: &[f64], n: usize, sweeps: usize) -> (TangentStability, Option<Vec<f64>>) {
    let fail = |reason| (unknown(reason), None);
    if n == 0 || n > 240 || k.len() != n * n || k.iter().any(|v| !v.is_finite()) {
        return fail(Reason::NonFiniteSpectrum);
    }
    let max = k.iter().fold(0.0_f64, |a, v| a.max(v.abs()));
    if max == 0.0 {
        return fail(Reason::NearSingular);
    }
    let mut a: Vec<_> = k.iter().map(|v| v / max).collect();
    let length = norm(&a);
    for v in &mut a {
        *v /= length;
    }
    let mut asym = 0.0_f64;
    for i in 0..n {
        for j in 0..i {
            asym = asym.hypot(a[i * n + j] - a[j * n + i]);
            let average = 0.5 * a[i * n + j] + 0.5 * a[j * n + i];
            a[i * n + j] = average;
            a[j * n + i] = average;
        }
    }
    let rounding = 64.0 * n as f64 * f64::EPSILON;
    if asym > rounding {
        return fail(Reason::AsymmetricTangent);
    }
    let eigen = jacobi_eigen(&a, n, sweeps);
    if eigen.values.len() != n
        || eigen.vectors.len() != n * n
        || eigen
            .values
            .iter()
            .chain(&eigen.vectors)
            .any(|v| !v.is_finite())
    {
        return fail(Reason::NonFiniteSpectrum);
    }
    // Verify the entire basis, not only the first Ritz pair. A polar orthogonal
    // basis U of Q exists when ||Q'Q-I||<1. For delta<1/2 and |lambda|<=2,
    // a conservative bound on ||A-U diag(lambda) U'|| is 2||AQ-Qlambda||F + 4 delta.
    // Include dot-product rounding bounds in both norms and assembly asymmetry.
    let gamma = (n as f64 + 2.0) * f64::EPSILON / (1.0 - (n as f64 + 2.0) * f64::EPSILON);
    let (mut residual, mut orthogonal) = (0.0_f64, 0.0_f64);
    for i in 0..n {
        for j in 0..n {
            let (mut r, mut r_abs, mut o, mut o_abs) = (0.0, 0.0, 0.0, 0.0);
            for t in 0..n {
                let product = a[i * n + t] * eigen.vectors[t * n + j];
                r += product;
                r_abs += product.abs();
                let product = eigen.vectors[t * n + i] * eigen.vectors[t * n + j];
                o += product;
                o_abs += product.abs();
            }
            let target = eigen.vectors[i * n + j] * eigen.values[j];
            residual = residual.hypot((r - target).abs() + gamma * (r_abs + target.abs()));
            orthogonal = orthogonal
                .hypot((o - if i == j { 1.0 } else { 0.0 }).abs() + gamma * (o_abs + 1.0));
        }
    }
    let bound = 2.0 * residual + 4.0 * orthogonal + rounding + asym;
    if !bound.is_finite()
        || orthogonal >= 0.5
        || bound > 1e-7
        || eigen.values.iter().any(|v| v.abs() > 2.0)
    {
        return fail(Reason::UnverifiedSpectrum);
    }
    let minimum = eigen.values[0];
    let (verdict, reason) = if minimum > bound {
        (Verdict::Stable, Reason::PositiveTangent)
    } else if minimum < -bound {
        (Verdict::Unstable, Reason::NegativeDirection)
    } else {
        (Verdict::Undetermined, Reason::NearSingular)
    };
    let negative_modes = eigen.values.iter().filter(|&&v| v < -bound).count();
    (
        TangentStability {
            verdict,
            reason,
            minimum: Some(minimum),
            uncertainty: Some(bound),
            second: eigen.values.get(1).copied(),
            negative_modes,
            mode: None,
            load_coupling: None,
        },
        Some((0..n).map(|i| eigen.vectors[i * n]).collect()),
    )
}

#[derive(Debug, Clone)]
pub struct ImperfectModel2D {
    pub model: BeamModel2D,
    /// Actual coordinate changes after rounding, in physical length units.
    pub offsets: Vec<[f64; 2]>,
    pub requested_amplitude: f64,
}

/// Rebuild a stress-free polygonal reference geometry. `shape` may come from a
/// mode or be supplied explicitly; it is normalized by maximum nodal magnitude.
/// Rotations of the eigenvector are not imposed as support motions or prestress.
pub fn with_imperfection(
    model: &BeamModel2D,
    shape: &[[f64; 2]],
    amplitude: f64,
) -> Result<ImperfectModel2D, String> {
    let _ = prepare(model)?;
    if !amplitude.is_finite()
        || shape.len() != model.positions.len()
        || shape.iter().flatten().any(|v| !v.is_finite())
    {
        return Err(
            "Imperfection requires a finite amplitude and one finite vector per node".into(),
        );
    }
    let peak = shape
        .iter()
        .map(|v| v[0].hypot(v[1]))
        .fold(0.0_f64, f64::max);
    if !peak.is_finite() || peak <= 0.0 {
        return Err("Imperfection shape has no finite nonzero translation".into());
    }
    let mut imperfect = model.clone();
    let mut offsets = vec![[0.0; 2]; shape.len()];
    for i in 0..shape.len() {
        for j in 0..2 {
            if model.fixed[i][j] && shape[i][j] != 0.0 {
                return Err("Imperfection would move a restrained translation".into());
            }
            let shift = (shape[i][j] / peak) * amplitude;
            let position = model.positions[i][j] + shift;
            let actual = position - model.positions[i][j];
            if !position.is_finite()
                || !actual.is_finite()
                || (actual - shift).abs() > 1e-8 * amplitude.abs()
            {
                return Err(
                    "Imperfection amplitude cannot be represented accurately at these coordinates"
                        .into(),
                );
            }
            imperfect.positions[i][j] = position;
            offsets[i][j] = actual;
        }
    }
    let _ = prepare(&imperfect)?;
    Ok(ImperfectModel2D {
        model: imperfect,
        offsets,
        requested_amplitude: amplitude,
    })
}

#[cfg(test)]
mod tests;
