use crate::case::{Case2, Case3};
use dedaliano_engine::linalg::*;
use dedaliano_engine::solver::{
    assembly, constraints::FreeConstraintSystem, dof::DofNumbering, mass_matrix,
};

pub struct Accuracy {
    pub lambda: Vec<f64>,
    pub residual: f64,
    pub natural: f64,
}

fn nonnegative_form(form: f64) -> Result<f64, String> {
    if !form.is_finite() {
        return Err("nonfinite dynamic quadratic form".into());
    }
    Ok(form.max(0.0))
}

fn pencil(
    dof: &DofNumbering,
    asm: assembly::AssemblyResult,
    mass: Vec<f64>,
    cs: Option<FreeConstraintSystem>,
    translations: usize,
) -> Result<Pencil, String> {
    let nf = dof.n_free;
    if nf == 0 || nf > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("empty dynamic pencil".into());
    }
    let ids: Vec<_> = (0..nf).collect();
    let k = extract_submatrix(&asm.k, dof.n_total, &ids, &ids);
    let m = mass;
    let (k, m, f, n) = match &cs {
        Some(cs) => (
            cs.reduce_matrix(&k),
            cs.reduce_matrix(&m),
            cs.reduce_vector(&asm.f[..nf]),
            cs.n_free_indep,
        ),
        None => (k, m, asm.f[..nf].to_vec(), nf),
    };
    let mut factor = k.clone();
    if !cholesky_decompose(&mut factor, n) {
        return Err("no energy norm".into());
    }
    let solve = |rhs: &[f64]| back_solve(&factor, &forward_solve(&factor, rhs, n), n);
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
    let energy = nonnegative_form(dot(&f, &solve(&f)))?;
    let mut trace = 0.0;
    for (&(_, local), &i) in &dof.map {
        if i >= nf || local >= translations {
            continue;
        }
        let mut row = vec![0.0; nf];
        row[i] = 1.0;
        let row = cs.as_ref().map_or(row.clone(), |cs| cs.reduce_vector(&row));
        trace += nonnegative_form(dot(&row, &solve(&row)))?;
    }
    let natural = (energy * trace).sqrt();
    if !natural.is_finite() {
        return Err("nonfinite dynamic error bound".into());
    }
    Ok(Pencil {
        k,
        m,
        factor,
        n,
        natural,
    })
}

fn pencil_2d(c: &Case2) -> Result<Pencil, String> {
    let dof = DofNumbering::build_2d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("dynamic pencil exceeds the dense accuracy limit".into());
    }
    let asm = assembly::assemble_2d(&c.s, &dof);
    let mass = mass_matrix::assemble_mass_matrix_2d_sparse_inclined(
        &c.s,
        &dof,
        &c.dens,
        &asm.inclined_transforms_2d,
    )
    .to_dense_symmetric();
    let cs = FreeConstraintSystem::build_2d(&c.s, &dof)?;
    pencil(&dof, asm, mass, cs, 2)
}

fn pencil_3d(c: &Case3) -> Result<Pencil, String> {
    let s = dedaliano_engine::solver::linear::expand_curved_beams_3d(&c.s);
    let dof = DofNumbering::build_3d(&s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("dynamic pencil exceeds the dense accuracy limit".into());
    }
    let asm = assembly::assemble_3d(&s, &dof);
    let mass = mass_matrix::assemble_mass_matrix_3d_sparse_inclined(
        &s,
        &dof,
        &c.dens,
        &asm.inclined_transforms,
    )
    .to_dense_symmetric();
    let cs = FreeConstraintSystem::build_3d(&s, &dof)?;
    pencil(&dof, asm, mass, cs, 3)
}

struct Pencil {
    k: Vec<f64>,
    m: Vec<f64>,
    factor: Vec<f64>,
    n: usize,
    natural: f64,
}

fn single_mode_fallback(modes: &EigenResult) -> bool {
    let mut values = modes.values.clone();
    values.sort_by(f64::total_cmp);
    values
        .iter()
        .take(2)
        .filter(|l| l.is_finite() && **l > 1e-10)
        .count()
        == 1
}

impl Pencil {
    fn eigen(&self) -> Result<EigenResult, String> {
        if self.n > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
            return Err("dynamic accuracy requires a bounded dense pencil".into());
        }
        lanczos_generalized_eigen(&self.k, &self.m, self.n, self.n, 0.0)
            .ok_or_else(|| "no finite spectrum".into())
    }

    fn spectrum(&self) -> Result<Accuracy, String> {
        self.spectrum_from(self.eigen()?)
    }

    fn spectrum_from(&self, eig: EigenResult) -> Result<Accuracy, String> {
        let Self {
            k,
            m,
            factor,
            n,
            natural,
        } = self;
        let (n, natural) = (*n, *natural);
        let solve = |rhs: &[f64]| back_solve(factor, &forward_solve(factor, rhs, n), n);
        let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
        let mut lambda: Vec<_> = eig
            .values
            .iter()
            .copied()
            .filter(|l| l.is_finite() && *l > 0.0)
            .collect();
        if lambda.len() != n || lambda.is_empty() {
            return Err("dynamic accuracy requires a positive finite spectrum".into());
        }
        let mut residual2 = 0.0;
        let mut normalized = Vec::new();
        let mut mass_images = Vec::new();
        for (j, &l) in lambda.iter().enumerate() {
            let phi: Vec<_> = (0..n).map(|i| eig.vectors[i * n + j]).collect();
            let mp = mat_vec(&m, &phi, n);
            let kp = mat_vec(&k, &phi, n);
            let mass = dot(&phi, &mp);
            if !(mass > 0.0) {
                return Err("nonpositive modal norm".into());
            }
            let r: Vec<_> = kp.iter().zip(&mp).map(|(k, m)| k - l * m).collect();
            residual2 += nonnegative_form(dot(&r, &solve(&r)))? / mass;
            normalized.push(phi.iter().map(|v| v / mass.sqrt()).collect::<Vec<_>>());
            mass_images.push(mp.iter().map(|v| v / mass.sqrt()).collect::<Vec<_>>());
        }
        lambda.sort_by(f64::total_cmp);
        let top = *lambda.last().unwrap();
        let mut defect2 = 0.0;
        for (i, phi) in normalized.iter().enumerate() {
            for (j, mp) in mass_images.iter().enumerate() {
                defect2 += (dot(phi, mp) - if i == j { 1.0 } else { 0.0 }).powi(2);
            }
        }
        let defect = defect2.sqrt();
        if !(defect < 1.0) {
            return Err("modal basis has no certified lower singular value".into());
        }
        let r2 = residual2 / (1.0 - defect);
        let residual = 0.5 * r2
            + (top * r2 + 0.25 * r2 * r2).sqrt()
            + 4.0 * (n as f64 + 24.0) * f64::EPSILON * top;
        if !residual.is_finite() {
            return Err("nonfinite eigen error bound".into());
        }
        Ok(Accuracy {
            lambda,
            residual,
            natural,
        })
    }

    fn harmonic(&self) -> Result<HarmonicAccuracy, String> {
        let n = self.n;
        if n > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
            return Err("dynamic accuracy requires a bounded dense pencil".into());
        }
        let inv = lower_triangular_inverse(&self.factor, n);
        let mut transpose = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                transpose[i * n + j] = inv[j * n + i];
            }
        }
        let h = mat_mul(&mat_mul(&inv, &self.m, n), &transpose, n);
        let eig = jacobi_eigen(&h, n, 200);
        let mut residual2 = 0.0;
        let mut defect2 = 0.0;
        for i in 0..n {
            for j in 0..n {
                let hv: f64 = (0..n).map(|k| h[i * n + k] * eig.vectors[k * n + j]).sum();
                residual2 += (hv - eig.vectors[i * n + j] * eig.values[j]).powi(2);
                let gram: f64 = (0..n)
                    .map(|k| eig.vectors[k * n + i] * eig.vectors[k * n + j])
                    .sum();
                defect2 += (gram - if i == j { 1.0 } else { 0.0 }).powi(2);
            }
        }
        let defect = defect2.sqrt();
        if !(defect < 1.0) {
            return Err("inverse pencil has no certified modal basis".into());
        }
        let norm = h.iter().map(|v| v * v).sum::<f64>().sqrt();
        let root = (1.0 - defect).sqrt();
        let top = eig.values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let residual = (residual2.sqrt() + 2.0 * top * defect / (1.0 + root)) / root
            + 4.0 * (n as f64 + 24.0) * f64::EPSILON * norm;
        if !residual.is_finite() || eig.values.iter().any(|m| !m.is_finite()) {
            return Err("nonfinite inverse pencil error".into());
        }
        let modes = self.eigen().ok();
        let single_mode_fallback = modes.as_ref().is_some_and(single_mode_fallback);
        let mut mu = eig.values;
        mu.sort_by(f64::total_cmp);
        Ok(HarmonicAccuracy {
            single_mode_fallback,
            mu,
            residual,
            natural: self.natural,
            forward: modes.and_then(|modes| self.spectrum_from(modes).ok()),
        })
    }
}

pub fn of_2d(c: &Case2) -> Result<Accuracy, String> {
    pencil_2d(c)?.spectrum()
}

pub fn of_3d(c: &Case3) -> Result<Accuracy, String> {
    pencil_3d(c)?.spectrum()
}

pub fn harmonic_2d(c: &Case2) -> Result<HarmonicAccuracy, String> {
    pencil_2d(c)?.harmonic()
}

pub fn harmonic_3d(c: &Case3) -> Result<HarmonicAccuracy, String> {
    pencil_3d(c)?.harmonic()
}

pub struct HarmonicAccuracy {
    forward: Option<Accuracy>,
    single_mode_fallback: bool,
    pub mu: Vec<f64>,
    pub residual: f64,
    pub natural: f64,
}

fn finite_bound(bound: f64) -> f64 {
    if bound.is_finite() {
        bound
    } else {
        f64::INFINITY
    }
}

impl HarmonicAccuracy {
    fn gains(&self, omega: f64, damping: (f64, f64)) -> (f64, f64) {
        let (a0, a1) = damping;
        let d = 1.0f64.hypot(omega * a1);
        let closest = if omega == 0.0 {
            0.0
        } else {
            (1.0 - a0 * a1) / (omega * omega + a0 * a0)
        };
        let mut gain = 1.0 / d;
        let mut mass_gain = 0.0f64;
        for &m in &self.mu {
            let lo = (m - self.residual).max(0.0);
            let hi = (m + self.residual).max(lo);
            let t = closest.clamp(lo, hi);
            let distance = (1.0 - omega * omega * t).hypot(omega * (a1 + a0 * t));
            if !(distance > 0.0) {
                return (f64::INFINITY, f64::INFINITY);
            }
            gain = gain.max(1.0 / distance);
            mass_gain = mass_gain.max(hi / distance);
        }
        (gain, mass_gain)
    }

    pub fn harmonic_error(&self, omega: f64, damping: (f64, f64), assembly_error: f64) -> f64 {
        let (a0, a1) = damping;
        if !omega.is_finite()
            || !(a0 >= 0.0 && a1 >= 0.0)
            || !a0.is_finite()
            || !a1.is_finite()
            || !(assembly_error >= 0.0 && assembly_error.is_finite())
        {
            return f64::INFINITY;
        }
        if let Some(forward) = &self.forward {
            let error = forward.harmonic_error(omega, damping, assembly_error);
            if error.is_finite() {
                return error;
            }
        }
        let cutoff = 1.0 / 1e-10;
        if self
            .mu
            .iter()
            .any(|m| m - self.residual <= cutoff && m + self.residual >= cutoff)
        {
            return f64::INFINITY;
        }
        let mut anchors: Vec<_> = self
            .mu
            .iter()
            .copied()
            .filter(|m| *m > 0.0 && *m < cutoff)
            .collect();
        anchors.sort_by(|a, b| b.total_cmp(a));
        anchors.truncate(2);
        if (anchors.len() == 1 && !self.single_mode_fallback)
            || anchors.iter().any(|m| *m <= self.residual)
        {
            return f64::INFINITY;
        }
        let Some(&anchor) = anchors.last() else {
            return f64::INFINITY;
        };
        let eta = self.residual / anchor;
        if !(eta < 1.0) {
            return f64::INFINITY;
        }
        let root = (1.0 - eta).sqrt();
        let frequency_error = eta / (root * (1.0 + root));
        if !(frequency_error < 1.0) {
            return f64::INFINITY;
        }
        let damping_error = frequency_error / (1.0 - frequency_error);
        let d = 1.0f64.hypot(omega * a1);
        let z = omega.hypot(a0) * omega.abs();
        let (gain, mass_gain) = self.gains(omega, damping);
        let perturbation = assembly_error * (d * gain + z * mass_gain)
            + z * self.residual * gain
            + damping_error * omega.abs() * (a1 * gain + a0 * mass_gain);
        if !(perturbation < 1.0) {
            return f64::INFINITY;
        }
        finite_bound(gain * perturbation / (1.0 - perturbation))
    }
}

impl Accuracy {
    pub fn gap_error(&self, kept: usize) -> f64 {
        if kept >= self.lambda.len() {
            return 0.0;
        }
        if kept == 0 {
            return f64::INFINITY;
        }
        let gap = self.lambda[kept] - self.lambda[kept - 1] - 2.0 * self.residual;
        if gap > 0.0 {
            self.residual / gap
        } else {
            f64::INFINITY
        }
    }

    pub fn harmonic_error(&self, omega: f64, damping: (f64, f64), assembly_error: f64) -> f64 {
        let (a0, a1) = damping;
        if !omega.is_finite()
            || !(a0 >= 0.0 && a1 >= 0.0)
            || !a0.is_finite()
            || !a1.is_finite()
            || !(assembly_error >= 0.0 && assembly_error.is_finite())
        {
            return f64::INFINITY;
        }
        let omega = omega.abs();
        let mut lambda = self.lambda.clone();
        lambda.sort_by(f64::total_cmp);
        let Some(&lo) = lambda.first() else {
            return f64::INFINITY;
        };
        let eta = self.residual / lo;
        if !(eta < 1.0)
            || self
                .lambda
                .iter()
                .any(|l| (l - 1e-10).abs() <= self.residual)
        {
            return f64::INFINITY;
        }
        let gain = self
            .lambda
            .iter()
            .map(|l| 1.0 / (1.0 - omega * omega / l).hypot(omega * (a0 / l + a1)))
            .fold(1.0 / 1.0f64.hypot(omega * a1), f64::max);
        let frequency_error = eta / (1.0 + (1.0 - eta).sqrt());
        let damping_error = frequency_error / (1.0 - frequency_error);
        let perturbation = assembly_error * (1.0 + omega * omega / lo + omega * (a0 / lo + a1))
            + eta * 1.0f64.hypot(omega * a1)
            + damping_error * omega * (a0 / lo + a1);
        if !(gain * perturbation < 1.0) {
            return f64::INFINITY;
        }
        finite_bound(gain * gain * perturbation / (1.0 - gain * perturbation))
    }
}

pub fn harmonic_floor(
    accuracy: Option<&HarmonicAccuracy>,
    frequency: f64,
    damping: (f64, f64),
    assembly_error: f64,
    rel: f64,
    modal_residual: f64,
) -> f64 {
    let Some(accuracy) = accuracy else {
        return f64::INFINITY;
    };
    if !(modal_residual >= 0.0 && modal_residual < f64::MAX) {
        return f64::INFINITY;
    }
    let omega = 2.0 * std::f64::consts::PI * frequency;
    let error = accuracy.harmonic_error(omega, damping, assembly_error);
    let truncation = if modal_residual == 0.0 {
        0.0
    } else {
        accuracy.gains(omega, damping).0 * modal_residual
    };
    let estimate = error + truncation;
    if !estimate.is_finite() {
        return f64::INFINITY;
    }
    finite_bound(accuracy.natural * estimate / rel)
}

#[test]
fn singular_mass_has_a_finite_damped_harmonic_bound() {
    let pencil = Pencil {
        k: vec![1.0, 0.0, 0.0, 1.0],
        m: vec![1.0, 0.0, 0.0, 0.0],
        factor: vec![1.0, 0.0, 0.0, 1.0],
        n: 2,
        natural: 1.0,
    };
    assert!(pencil.spectrum().is_err());
    let mut accuracy = pencil.harmonic().unwrap();
    assert!(accuracy.single_mode_fallback);
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 3.0, 0.05);
    for omega in [0.0, 1.0, 2.0] {
        assert!(accuracy.harmonic_error(omega, damping, 0.0).is_finite());
    }
    accuracy.single_mode_fallback = false;
    assert_eq!(accuracy.harmonic_error(1.0, damping, 0.0), f64::INFINITY);
}

#[test]
fn modal_energy_residual_bounds_a_manufactured_harmonic_error() {
    let accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![0.0, 1.0],
        residual: 0.0,
        natural: 1.0,
    };
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 3.0, 0.05);
    let residual = 0.125;
    let error = residual / (damping.0 + damping.1);
    let bound = harmonic_floor(
        Some(&accuracy),
        1.0 / (2.0 * std::f64::consts::PI),
        damping,
        0.0,
        1.0,
        residual,
    );
    assert!(bound.is_finite() && bound >= error, "{bound:e} < {error:e}");
    assert_eq!(
        harmonic_floor(Some(&accuracy), 0.0, damping, 0.0, 1.0, residual),
        residual
    );
    assert!(!harmonic_floor(Some(&accuracy), 0.0, damping, 0.0, 1.0, f64::NAN).is_finite());
}

#[test]
fn undamped_resonance_and_uncertain_inverse_anchors_are_unbounded() {
    let mut accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    assert!(!accuracy.harmonic_error(1.0, (0.0, 0.0), 0.0).is_finite());
    accuracy.mu = vec![1.0 / 1e-10];
    accuracy.residual = 1.0;
    assert!(!accuracy.harmonic_error(1.0, (0.1, 0.1), 0.0).is_finite());
}

#[test]
fn zero_load_keeps_uncertifiable_harmonic_floors_infinite() {
    let accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1.0],
        residual: 0.0,
        natural: 0.0,
    };
    let frequency = 1.0 / (2.0 * std::f64::consts::PI);
    for (damping, modal_residual) in [((0.0, 0.0), 0.0), ((0.0, 1e-200), 1e200)] {
        let floor = harmonic_floor(
            Some(&accuracy),
            frequency,
            damping,
            0.0,
            1.0,
            modal_residual,
        );
        assert_eq!(
            floor,
            f64::INFINITY,
            "damping={damping:?}, residual={modal_residual:e}"
        );
        assert_eq!(0.0f64.max(floor), f64::INFINITY);
    }
    assert_eq!(
        harmonic_floor(Some(&accuracy), frequency, (0.0, 0.1), 0.0, 1.0, 0.0),
        0.0
    );
}

#[test]
fn singular_mass_excludes_resolved_subcutoff_modes_only_from_anchors() {
    let pencil = Pencil {
        k: vec![
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ],
        m: vec![
            0.0, 0.0, 0.0, 0.0, 0.0, 0.25, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 2e10,
        ],
        factor: vec![
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ],
        n: 4,
        natural: 1.0,
    };
    assert!(pencil.spectrum().is_err());
    let mut accuracy = pencil.harmonic().unwrap();
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 2.0, 0.05);
    for omega in [0.0, 0.5, 1.0, 2.0] {
        assert!(
            accuracy.harmonic_error(omega, damping, 0.0).is_finite(),
            "omega={omega}"
        );
    }
    let slow_resonance = (1.0 / accuracy.mu[3]).sqrt();
    assert_eq!(
        accuracy.harmonic_error(slow_resonance, (0.0, 0.0), 0.0),
        f64::INFINITY
    );
    accuracy.mu[3] = 1e10;
    assert_eq!(accuracy.harmonic_error(0.5, damping, 0.0), f64::INFINITY);
    accuracy.mu[3] = 1e10 + accuracy.residual;
    assert_eq!(accuracy.harmonic_error(0.5, damping, 0.0), f64::INFINITY);
    accuracy.mu[3] = 1e10 - accuracy.residual;
    assert_eq!(accuracy.harmonic_error(0.5, damping, 0.0), f64::INFINITY);
}

#[test]
fn round_two_uncertain_second_inverse_anchor_is_unbounded() {
    let mut accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1e-16, 1.0],
        residual: 2e-14,
        natural: 1.0,
    };
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 1e8, 0.05);
    assert_eq!(accuracy.harmonic_error(1.0, damping, 0.0), f64::INFINITY);
    accuracy.mu.reverse();
    assert_eq!(accuracy.harmonic_error(1.0, damping, 0.0), f64::INFINITY);
}

#[test]
fn round_two_inverse_anchor_budget_is_independent_of_eigenvalue_order() {
    let mut accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: false,
        mu: vec![0.0, 0.125, 0.5, 1.0],
        residual: 1e-4,
        natural: 1.0,
    };
    let damping =
        dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 2.0f64.sqrt(), 0.05);
    for omega in [0.5, 1.0, 2.0f64.sqrt()] {
        accuracy.mu = vec![0.0, 0.125, 0.5, 1.0];
        let expected = accuracy.harmonic_error(omega, damping, 1e-7);
        assert!(expected.is_finite() && expected > 0.0);
        for mu in [vec![0.0, 0.125, 1.0, 0.5], vec![1.0, 0.5, 0.125, 0.0]] {
            accuracy.mu = mu;
            assert_eq!(accuracy.harmonic_error(omega, damping, 1e-7), expected);
        }
    }
}

#[test]
fn round_two_forward_budget_uses_the_minimum_eigenvalue() {
    let mut accuracy = Accuracy {
        lambda: vec![1.0, 4.0, 9.0],
        residual: 1e-5,
        natural: 1.0,
    };
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 2.0, 0.05);
    let expected = accuracy.harmonic_error(1.0, damping, 1e-7);
    assert!(expected.is_finite() && expected > 0.0);
    accuracy.lambda = vec![4.0, 9.0, 1.0];
    assert_eq!(accuracy.harmonic_error(1.0, damping, 1e-7), expected);
}

#[test]
fn round_two_forward_budget_is_even_in_frequency() {
    let accuracy = Accuracy {
        lambda: vec![1.0, 4.0],
        residual: 1e-5,
        natural: 1.0,
    };
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 2.0, 0.05);
    let expected = accuracy.harmonic_error(1.0, damping, 1e-7);
    assert!(expected.is_finite() && expected > 0.0);
    assert_eq!(accuracy.harmonic_error(-1.0, damping, 1e-7), expected);
}

#[test]
fn round_two_inverse_cutoff_matches_the_solver_reciprocal() {
    let accuracy = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: false,
        mu: vec![1.0, 1.0 / 1e-10],
        residual: 0.0,
        natural: 1.0,
    };
    assert_eq!(accuracy.harmonic_error(0.5, (0.1, 0.1), 0.0), f64::INFINITY);
}

#[test]
fn round_two_harmonic_pencil_obeys_the_dense_size_limit() {
    let n = dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX + 1;
    let mut identity = vec![0.0; n * n];
    for i in 0..n {
        identity[i * n + i] = 1.0;
    }
    let pencil = Pencil {
        k: identity.clone(),
        m: identity.clone(),
        factor: identity,
        n,
        natural: 1.0,
    };
    assert!(pencil.spectrum().is_err());
    assert!(
        matches!(pencil.harmonic(), Err(e) if e == "dynamic accuracy requires a bounded dense pencil")
    );
}

#[test]
fn final_review_resonant_zero_perturbation_is_inconclusive_never_passes() {
    use crate::tally::Verdict;
    use dedaliano_engine::metamorphic::compare::{compare, Flat};

    let forward = Accuracy {
        lambda: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    let inverse = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    for bound in [
        forward.harmonic_error(1.0, (0.0, 0.0), 0.0),
        forward.harmonic_error(1.0, (0.0, 1e-200), 0.0),
        inverse.harmonic_error(1.0, (0.0, 0.0), 0.0),
    ] {
        let expected = Flat::scalar("H_re1", 1.0);
        for value in [1.0, 2.0] {
            let got = Flat::scalar("H_re1", value);
            let verdict = crate::checks2::judge(compare(&got, &expected, 1.0, bound), bound);
            assert!(!matches!(verdict, Verdict::Pass(_)), "{verdict:?}");
            assert!(matches!(verdict, Verdict::Inconclusive(_)), "{verdict:?}");
        }
        assert_eq!(bound, f64::INFINITY);
    }
}

#[test]
fn final_review_negative_rayleigh_coefficients_are_unbounded() {
    let forward = Accuracy {
        lambda: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    let mut inverse = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    for damping in [(-0.1, 0.1), (0.1, -0.1), (-0.1, -0.1)] {
        assert_eq!(forward.harmonic_error(0.5, damping, 0.0), f64::INFINITY);
        assert_eq!(inverse.harmonic_error(0.5, damping, 0.0), f64::INFINITY);
    }
    inverse.forward = Some(forward);
    assert_eq!(inverse.harmonic_error(0.5, (-0.1, 0.1), 0.0), f64::INFINITY);
}

#[test]
fn final_review_nonfinite_harmonic_inputs_are_unbounded() {
    let forward = Accuracy {
        lambda: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    let inverse = HarmonicAccuracy {
        forward: None,
        single_mode_fallback: true,
        mu: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for (omega, damping, assembly_error) in [
            (bad, (0.1, 0.1), 0.0),
            (0.5, (bad, 0.1), 0.0),
            (0.5, (0.1, bad), 0.0),
            (0.5, (0.1, 0.1), bad),
        ] {
            assert_eq!(
                forward.harmonic_error(omega, damping, assembly_error),
                f64::INFINITY
            );
            assert_eq!(
                inverse.harmonic_error(omega, damping, assembly_error),
                f64::INFINITY
            );
        }
    }
    assert_eq!(forward.harmonic_error(0.5, (0.1, 0.1), -0.1), f64::INFINITY);
    assert_eq!(inverse.harmonic_error(0.5, (0.1, 0.1), -0.1), f64::INFINITY);
}

#[test]
fn final_review_nonfinite_scaled_harmonic_floors_are_unbounded() {
    for (natural, rel, assembly_error) in [(0.0, 0.0, 0.0), (f64::MAX, f64::MIN_POSITIVE, 0.125)] {
        let accuracy = HarmonicAccuracy {
            forward: None,
            single_mode_fallback: true,
            mu: vec![1.0],
            residual: 0.0,
            natural,
        };
        assert_eq!(
            harmonic_floor(Some(&accuracy), 0.0, (0.1, 0.1), assembly_error, rel, 0.0),
            f64::INFINITY
        );
    }
}

#[test]
fn single_mode_fallback_uses_the_two_lowest_eigenvalues_in_any_order() {
    for (values, expected) in [
        ([5e-11, 1.0, 4.0], true),
        ([2e-11, 5e-11, 4.0], false),
        ([1.0, 4.0, 9.0], false),
    ] {
        for order in [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ] {
            let modes = EigenResult {
                values: order.map(|i| values[i]).to_vec(),
                vectors: Vec::new(),
            };
            assert_eq!(single_mode_fallback(&modes), expected, "{:?}", modes.values);
        }
    }
}

fn assert_nonfinite_form_comparison_rejected(result: Result<f64, String>) {
    use dedaliano_engine::metamorphic::compare::{compare_with_compliance, Flat};
    let comparison = result.and_then(|scale| {
        let mut response = Flat::default();
        response.t.vals = vec![0.0];
        response.t.labels = vec!["synthetic translation".into()];
        response.t.scales = vec![0.0];
        response.t.floor = scale;
        compare_with_compliance(&response, &response, 1.0, 1e-10, 0.0, [0.0, 0.0])
    });
    assert!(
        comparison.is_err(),
        "a nonfinite quadratic form passed comparison"
    );
}

#[test]
fn final_round_nan_load_energy_rejects_comparison() {
    let dof = DofNumbering {
        map: [((1, 0), 0)].into_iter().collect(),
        n_free: 1,
        n_total: 1,
        dofs_per_node: 1,
        node_order: vec![1],
    };
    let asm = assembly::AssemblyResult {
        k: vec![1.0],
        f: vec![f64::NAN],
        max_diag_k: 1.0,
        artificial_dofs: vec![],
        inclined_transforms: vec![],
        inclined_transforms_2d: vec![],
        diagnostics: vec![],
    };
    assert_nonfinite_form_comparison_rejected(
        pencil(&dof, asm, vec![1.0], None, 1).map(|p| p.natural),
    );
}

#[test]
fn final_round_nan_translation_compliance_rejects_comparison() {
    let row = [1.0];
    let factor = [f64::NAN];
    let solved = back_solve(&factor, &forward_solve(&factor, &row, 1), 1);
    let compliance = row.iter().zip(solved).map(|(a, b)| a * b).sum::<f64>();
    assert!(compliance.is_nan());
    assert_nonfinite_form_comparison_rejected(nonnegative_form(compliance));
}

#[test]
fn final_round_nan_modal_residual_rejects_comparison() {
    let pencil = Pencil {
        k: vec![f64::NAN],
        m: vec![1.0],
        factor: vec![1.0],
        n: 1,
        natural: 1.0,
    };
    let eig = EigenResult {
        values: vec![1.0],
        vectors: vec![1.0],
    };
    assert_nonfinite_form_comparison_rejected(pencil.spectrum_from(eig).map(|a| a.residual));
}

#[test]
#[ignore = "known wrong result: #1892"]
fn issue_1892_final_round_missing_harmonic_estimate_adds_no_allowance() {
    assert_eq!(harmonic_floor(None, 1.0, (0.1, 0.1), 1e-10, 1e-10, 0.0), 0.0);
}
