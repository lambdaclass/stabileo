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

fn pencil(
    dof: &DofNumbering,
    asm: assembly::AssemblyResult,
    mass: Vec<f64>,
    cs: Option<FreeConstraintSystem>,
    translations: usize,
) -> Result<Pencil, String> {
    let nf = dof.n_free;
    if nf == 0 {
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
    let energy = dot(&f, &solve(&f)).max(0.0);
    let mut trace = 0.0;
    for (&(_, local), &i) in &dof.map {
        if i >= nf || local >= translations {
            continue;
        }
        let mut row = vec![0.0; nf];
        row[i] = 1.0;
        let row = cs.as_ref().map_or(row.clone(), |cs| cs.reduce_vector(&row));
        trace += dot(&row, &solve(&row)).max(0.0);
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

impl Pencil {
    fn spectrum(&self) -> Result<Accuracy, String> {
        let Self {
            k,
            m,
            factor,
            n,
            natural,
        } = self;
        let (n, natural) = (*n, *natural);
        if n > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
            return Err("dynamic accuracy requires a bounded dense pencil".into());
        }
        let solve = |rhs: &[f64]| back_solve(factor, &forward_solve(factor, rhs, n), n);
        let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
        let eig = lanczos_generalized_eigen(&k, &m, n, n, 0.0).ok_or("no finite spectrum")?;
        let lambda: Vec<_> = eig
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
            residual2 += dot(&r, &solve(&r)).max(0.0) / mass;
            normalized.push(phi.iter().map(|v| v / mass.sqrt()).collect::<Vec<_>>());
            mass_images.push(mp.iter().map(|v| v / mass.sqrt()).collect::<Vec<_>>());
        }
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
        Ok(HarmonicAccuracy {
            mu: eig.values,
            residual,
            natural: self.natural,
            forward: self.spectrum().ok(),
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
    pub mu: Vec<f64>,
    pub residual: f64,
    pub natural: f64,
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
        let top = self.mu.last().copied().unwrap_or(0.0);
        let anchors: Vec<_> = self
            .mu
            .iter()
            .rev()
            .copied()
            .filter(|m| *m > self.residual)
            .take(2)
            .collect();
        let Some(&anchor) = anchors.last() else {
            return f64::INFINITY;
        };
        if self.mu.iter().any(|m| (m - 1e10).abs() <= self.residual) || top > 1e10 {
            return f64::INFINITY;
        }
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
        gain * perturbation / (1.0 - perturbation)
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
        let lo = self.lambda[0];
        let eta = self.residual / lo;
        if !(eta < 1.0)
            || self
                .lambda
                .iter()
                .any(|l| (l - 1e-10).abs() <= self.residual)
        {
            return f64::INFINITY;
        }
        let (a0, a1) = damping;
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
        if gain * perturbation >= 1.0 {
            return f64::INFINITY;
        }
        gain * gain * perturbation / (1.0 - gain * perturbation)
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
    accuracy.natural * (error + truncation) / rel
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
    let accuracy = pencil.harmonic().unwrap();
    let damping = dedaliano_engine::solver::damping::rayleigh_coefficients(1.0, 3.0, 0.05);
    for omega in [0.0, 1.0, 2.0] {
        assert!(accuracy.harmonic_error(omega, damping, 0.0).is_finite());
    }
}

#[test]
fn modal_energy_residual_bounds_a_manufactured_harmonic_error() {
    let accuracy = HarmonicAccuracy {
        forward: None,
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
        mu: vec![1.0],
        residual: 0.0,
        natural: 1.0,
    };
    assert!(!accuracy.harmonic_error(1.0, (0.0, 0.0), 0.0).is_finite());
    accuracy.mu = vec![1.0 / 1e-10];
    accuracy.residual = 1.0;
    assert!(!accuracy.harmonic_error(1.0, (0.1, 0.1), 0.0).is_finite());
}
