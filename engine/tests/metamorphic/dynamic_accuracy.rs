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

fn build(
    dof: &DofNumbering,
    asm: assembly::AssemblyResult,
    mass: Vec<f64>,
    cs: Option<FreeConstraintSystem>,
    translations: usize,
) -> Result<Accuracy, String> {
    let nf = dof.n_free;
    if nf == 0 || nf > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("dynamic accuracy requires a bounded dense pencil".into());
    }
    let ids: Vec<_> = (0..nf).collect();
    let k = extract_submatrix(&asm.k, dof.n_total, &ids, &ids);
    let m = extract_submatrix(&mass, dof.n_total, &ids, &ids);
    let (k, m, f, n) = match &cs {
        Some(cs) => (
            cs.reduce_matrix(&k),
            cs.reduce_matrix(&m),
            cs.reduce_vector(&asm.f[..nf]),
            cs.n_free_indep,
        ),
        None => (k, m, asm.f[..nf].to_vec(), nf),
    };
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
    let mut factor = k.clone();
    if !cholesky_decompose(&mut factor, n) {
        return Err("no energy norm".into());
    }
    let solve = |rhs: &[f64]| back_solve(&factor, &forward_solve(&factor, rhs, n), n);
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a, b)| a * b).sum::<f64>();
    let mut residual2 = 0.0;
    let mut normalized = Vec::new();
    let mut mass_images = Vec::new();
    let count = lambda.len();
    for (j, &l) in lambda.iter().enumerate() {
        let phi: Vec<_> = (0..n).map(|i| eig.vectors[i * count + j]).collect();
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
    if !residual.is_finite() || !natural.is_finite() {
        return Err("nonfinite dynamic error bound".into());
    }
    Ok(Accuracy {
        lambda,
        residual,
        natural,
    })
}

pub fn of_2d(c: &Case2) -> Result<Accuracy, String> {
    let dof = DofNumbering::build_2d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("dynamic accuracy requires a bounded dense pencil".into());
    }
    let asm = assembly::assemble_2d(&c.s, &dof);
    let mass = mass_matrix::assemble_mass_matrix_2d_sparse_block(&c.s, &dof, &c.dens, dof.n_total)
        .to_dense_symmetric();
    if !asm.inclined_transforms_2d.is_empty() {
        return Err("dynamic mass is not in the support frame".into());
    }
    let cs = FreeConstraintSystem::build_2d(&c.s, &dof)?;
    build(&dof, asm, mass, cs, 2)
}

pub fn of_3d(c: &Case3) -> Result<Accuracy, String> {
    let s = dedaliano_engine::solver::linear::expand_curved_beams_3d(&c.s);
    let dof = DofNumbering::build_3d(&s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("dynamic accuracy requires a bounded dense pencil".into());
    }
    let asm = assembly::assemble_3d(&s, &dof);
    let mass = mass_matrix::assemble_mass_matrix_3d_sparse_block(&s, &dof, &c.dens, dof.n_total)
        .to_dense_symmetric();
    if !asm.inclined_transforms.is_empty() {
        return Err("dynamic mass is not in the support frame".into());
    }
    let cs = FreeConstraintSystem::build_3d(&s, &dof)?;
    build(&dof, asm, mass, cs, 3)
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
    accuracy: Option<&Accuracy>,
    frequency: f64,
    damping: (f64, f64),
    assembly_error: f64,
    rel: f64,
) -> f64 {
    let Some(accuracy) = accuracy else {
        return f64::INFINITY;
    };
    let error = accuracy.harmonic_error(
        2.0 * std::f64::consts::PI * frequency,
        damping,
        assembly_error,
    );
    if error > dedaliano_engine::metamorphic::conditioning::INCONCLUSIVE {
        return f64::INFINITY;
    }
    accuracy.natural * error / rel
}
