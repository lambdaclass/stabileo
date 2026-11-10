use crate::response::{Dim, Kind, Resp};
use dedaliano_engine::linalg::*;
use dedaliano_engine::metamorphic::compare::{compare_compliant, Flat, Report};
use dedaliano_engine::solver::{assembly, constraints::FreeConstraintSystem, dof::DofNumbering};
use num_rational::BigRational;
use num_traits::ToPrimitive;

pub fn gamma(operations: usize) -> f64 {
    let x = operations as f64 * f64::EPSILON;
    x / (1.0 - x)
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}

pub fn compare(
    got: &Resp,
    expected: &Resp,
    lchar: f64,
    rel: f64,
    floor: f64,
    compliance: [f64; 2],
) -> Result<Report, String> {
    compare_scaled(got, expected, expected, lchar, rel, floor, compliance)
}

pub fn compare_scaled(
    got: &Resp,
    expected: &Resp,
    scale_source: &Resp,
    lchar: f64,
    rel: f64,
    floor: f64,
    compliance: [f64; 2],
) -> Result<Report, String> {
    if got
        .0
        .iter()
        .chain(&expected.0)
        .any(|i| !(i.error >= 0.0 && i.error.is_finite()))
    {
        return Err("nonfinite or negative analysis error certificate".into());
    }
    let errors = |r: &Resp| {
        let mut r = r.clone();
        for i in &mut r.0 {
            i.v.fill(0.0);
            i.floor = i.error;
        }
        r.flat()
    };
    let error = Flat::abs_comb(1.0, &errors(got), 1.0, &errors(expected));
    let mut scale = scale_source.flat();
    for (s, e) in [
        (&mut scale.t, &error.t),
        (&mut scale.r, &error.r),
        (&mut scale.f, &error.f),
        (&mut scale.m, &error.m),
        (&mut scale.s, &error.s),
    ] {
        s.floor = s.floor.max(e.floor / rel);
    }
    for (s, e) in scale.x.scales.iter_mut().zip(&error.x.scales) {
        *s = s.max(e / rel);
    }
    compare_compliant(
        &got.flat(),
        &expected.flat(),
        &scale,
        lchar,
        rel,
        floor,
        compliance,
    )
}

pub fn projected_error(r: &Resp, node: usize, tag: &str, dir: &[f64]) -> f64 {
    r.0.iter()
        .find(|i| i.node == Some(node) && i.tag == tag)
        .map_or(0.0, |i| {
            let direction = dir.iter().map(|d| d * d).sum::<f64>().sqrt();
            if !(i.error >= 0.0 && i.error.is_finite() && direction.is_finite()) {
                return f64::INFINITY;
            }
            i.error * direction
        })
}

pub struct Inverse {
    pub n: usize,
    pub matrix: Vec<f64>,
    pub inverse: Vec<f64>,
    pub defect: f64,
    diagonal: Vec<f64>,
}

impl Inverse {
    pub fn new(matrix: Vec<f64>, n: usize) -> Result<Self, String> {
        if n == 0 || n > 160 {
            return Err("accuracy certificate requires a bounded nonempty matrix".into());
        }
        let diagonal: Vec<_> = (0..n).map(|i| matrix[i * n + i].abs().sqrt()).collect();
        if diagonal.iter().any(|d| !(*d > 0.0 && d.is_finite())) {
            return Err("accuracy matrix has no diagonal scale".into());
        }
        let scaled: Vec<_> = (0..n * n)
            .map(|k| matrix[k] / diagonal[k / n] / diagonal[k % n])
            .collect();
        let mut inverse = vec![0.0; n * n];
        for j in 0..n {
            let mut rhs = vec![0.0; n];
            rhs[j] = 1.0;
            let x = lu_solve(&mut scaled.clone(), &mut rhs, n).ok_or("singular accuracy matrix")?;
            for i in 0..n {
                inverse[i * n + j] = x[i];
            }
        }
        let mut defect: f64 = 0.0;
        for i in 0..n {
            let mut row = 0.0;
            for j in 0..n {
                let mut prod = 0.0;
                let mut mag = 0.0;
                for k in 0..n {
                    let v = inverse[i * n + k] * scaled[k * n + j];
                    prod += v;
                    mag += v.abs();
                }
                row += (prod - if i == j { 1.0 } else { 0.0 }).abs() + gamma(2 * n + 3) * mag;
            }
            defect = defect.max(row);
        }
        if !(defect < 1.0) {
            return Err("inverse defect cannot certify an error bound".into());
        }
        Ok(Self {
            n,
            matrix,
            inverse,
            defect,
            diagonal,
        })
    }

    pub fn absolute_solve(&self, rhs: &[f64]) -> Vec<f64> {
        let mut out: Vec<f64> = self
            .inverse
            .chunks(self.n)
            .map(|row| {
                row.iter()
                    .zip(rhs)
                    .zip(&self.diagonal)
                    .map(|((a, b), d)| a.abs() * b.abs() / d)
                    .sum::<f64>()
                    * (1.0 + gamma(3 * self.n + 4))
            })
            .collect();
        let tail = out.iter().copied().fold(0.0, f64::max) * self.defect / (1.0 - self.defect);
        out.iter_mut()
            .zip(&self.diagonal)
            .for_each(|(x, d)| *x = (*x + tail) / d);
        out
    }
}

fn static_system(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
    mut u: Vec<f64>,
) -> Result<(Inverse, Vec<f64>, Vec<f64>), String> {
    let nf = dof.n_free;
    for it in &asm.inclined_transforms_2d {
        let v = [u[it.dofs[0]], u[it.dofs[1]]];
        for i in 0..2 {
            u[it.dofs[i]] = dot(&it.r[i], &v);
        }
    }
    for it in &asm.inclined_transforms {
        let v = [u[it.dofs[0]], u[it.dofs[1]], u[it.dofs[2]]];
        for i in 0..3 {
            u[it.dofs[i]] = dot(&it.r[i], &v);
        }
    }
    let ids: Vec<_> = (0..nf).collect();
    let k = extract_submatrix(&asm.k, dof.n_total, &ids, &ids);
    let f: Vec<_> = (0..nf)
        .map(|i| {
            asm.f[i]
                - (nf..dof.n_total)
                    .map(|j| asm.k[i * dof.n_total + j] * u[j])
                    .sum::<f64>()
        })
        .collect();
    let (k, f, x, n) = match cs {
        Some(cs) => (
            cs.reduce_matrix(&k),
            cs.reduce_vector(&f),
            cs.map_reduced_to_physical().iter().map(|&i| u[i]).collect(),
            cs.n_free_indep,
        ),
        None => (k, f, u[..nf].to_vec(), nf),
    };
    Ok((Inverse::new(k, n)?, x, f))
}

fn static_errors(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
    u: Vec<f64>,
    cond: &dedaliano_engine::metamorphic::conditioning::Conditioning,
) -> Result<Vec<f64>, String> {
    if dof.n_free == 0 {
        return Ok(vec![0.0; dof.n_total]);
    }
    let (inverse, x, f) = static_system(dof, asm, cs, u)?;
    let residual = static_accuracy_residual(&inverse, &x, &f, cond)?;
    Ok(physical_rows(dof, asm, cs)
        .iter()
        .map(|row| inverse.functional_error(&residual, row))
        .collect())
}

fn static_accuracy_residual(
    inverse: &Inverse,
    x: &[f64],
    f: &[f64],
    cond: &dedaliano_engine::metamorphic::conditioning::Conditioning,
) -> Result<(Vec<f64>, Vec<f64>), String> {
    let n = inverse.n;
    let reference: Vec<_> = (0..n)
        .map(|i| (0..n).map(|j| inverse.inverse[i * n + j] * f[j] / inverse.diagonal[j]).sum::<f64>() / inverse.diagonal[i])
        .collect();
    let residual = inverse.residual(x, f);
    let reference_residual = inverse.residual(&reference, &f);
    let mut error = Vec::with_capacity(n);
    let mut reference_error = Vec::with_capacity(n);
    for j in 0..n {
        let mut row = vec![0.0; n];
        row[j] = 1.0;
        error.push(inverse.functional_error(&residual, &row) * inverse.diagonal[j]);
        reference_error.push(inverse.functional_error(&reference_residual, &row) * inverse.diagonal[j]);
    }
    let reference: Vec<_> = reference.iter().zip(&inverse.diagonal).map(|(v, d)| v * d).collect();
    let lower = (norm(&reference) * (1.0 - gamma(2 * n + 2))
        - norm(&reference_error) * (1.0 + gamma(2 * n + 2))).max(0.0);
    let limit = crate::checks2::rel_for("linear (PCG)", 1e-10, cond)
        .min(dedaliano_engine::metamorphic::conditioning::INCONCLUSIVE);
    let upper = norm(&error) * (1.0 + gamma(2 * n + 2));
    if !(upper.is_finite() && lower.is_finite() && upper <= limit * lower) {
        return Err("static result exceeds the independent accuracy ceiling".into());
    }
    Ok(residual)
}

fn attach_displacements(r: &mut Resp, dof: &DofNumbering, err: &[f64], translations: usize) {
    for i in &mut r.0 {
        let Some(node) = i.node else { continue };
        let locals = match (&i.kind, i.tag.as_str()) {
            (Kind::V2(Dim::LEN), "u") => 0..2,
            (Kind::P2(Dim::NONE), "ry") => 2..3,
            (Kind::V3(Dim::LEN), "u") => 0..3,
            (Kind::V3(Dim::NONE), "r") => translations..2 * translations,
            _ => continue,
        };
        i.error = locals
            .filter_map(|l| dof.map.get(&(node, l)))
            .map(|&j| err[j].powi(2))
            .sum::<f64>()
            .sqrt();
    }
}

pub fn pcg_2d(c: &crate::case::Case2, r: &mut Resp) -> Result<(), String> {
    let dof = DofNumbering::build_2d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let asm = assembly::assemble_2d(&c.s, &dof);
    let mut u = vec![0.0; dof.n_total];
    for i in &r.0 {
        let Some(node) = i.node else { continue };
        let offset = match i.tag.as_str() {
            "u" => 0,
            "ry" => 2,
            _ => continue,
        };
        for (l, &v) in i.v.iter().enumerate() {
            if let Some(&j) = dof.map.get(&(node, offset + l)) {
                u[j] = v;
            }
        }
    }
    let cs = FreeConstraintSystem::build_2d(&c.s, &dof)?;
    attach_displacements(r, &dof, &static_errors(&dof, &asm, cs.as_ref(), u, &dedaliano_engine::metamorphic::conditioning::of_2d(&c.s)?)?, 2);
    Ok(())
}

pub fn pcg_3d(c: &crate::case::Case3, r: &mut Resp) -> Result<(), String> {
    let dof = DofNumbering::build_3d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let asm = assembly::assemble_3d(&c.s, &dof);
    let mut u = vec![0.0; dof.n_total];
    for i in &r.0 {
        let Some(node) = i.node else { continue };
        let offset = match i.tag.as_str() {
            "u" => 0,
            "r" => 3,
            _ => continue,
        };
        for (l, &v) in i.v.iter().enumerate() {
            if let Some(&j) = dof.map.get(&(node, offset + l)) {
                u[j] = v;
            }
        }
    }
    let cs = FreeConstraintSystem::build_3d(&c.s, &dof)?;
    attach_displacements(r, &dof, &static_errors(&dof, &asm, cs.as_ref(), u, &dedaliano_engine::metamorphic::conditioning::of_3d(&c.s)?)?, 3);
    Ok(())
}

fn gather(r: &Resp, dof: &DofNumbering, translations: usize) -> Vec<f64> {
    let mut u = vec![0.0; dof.n_total];
    for i in &r.0 {
        let Some(node) = i.node else { continue };
        let offset = match i.tag.as_str() {
            "u" => 0,
            "ry" | "r" => translations,
            _ => continue,
        };
        for (l, &v) in i.v.iter().enumerate() {
            if let Some(&j) = dof.map.get(&(node, offset + l)) {
                u[j] = v;
            }
        }
    }
    u
}

fn transpose(a: &[f64], n: usize) -> Vec<f64> {
    (0..n * n).map(|k| a[(k % n) * n + k / n]).collect()
}

fn norm(a: &[f64]) -> f64 {
    a.iter().map(|v| v * v).sum::<f64>().sqrt()
}

fn abs(a: &[f64]) -> Vec<f64> {
    a.iter().map(|v| v.abs()).collect()
}

fn buckling_errors(
    k: Vec<f64>,
    b: Vec<f64>,
    b_error: Vec<f64>,
    n: usize,
    rel: f64,
    r: &mut Resp,
) -> Result<(), String> {
    if n == 0 || n > 80 {
        return Err("buckling certificate requires a bounded pencil".into());
    }
    let mut l = k.clone();
    if !cholesky_decompose(&mut l, n) {
        return Err("buckling has no energy norm".into());
    }
    let inv = lower_triangular_inverse(&l, n);
    let it = transpose(&inv, n);
    let h = mat_mul(&mat_mul(&inv, &b, n), &it, n);
    let magnitude = mat_mul(&mat_mul(&abs(&inv), &abs(&b), n), &abs(&it), n);
    let factor_residual: Vec<_> = k
        .iter()
        .zip(mat_mul(&l_lower(&l, n), &transpose(&l_lower(&l, n), n), n))
        .map(|(k, p)| k - p)
        .collect();
    let factor_error = norm(&mat_mul(
        &mat_mul(&abs(&inv), &abs(&factor_residual), n),
        &abs(&it),
        n,
    ));
    let eta = factor_error + rel;
    if !(eta < 1.0) {
        return Err("buckling pencil perturbation is unbounded".into());
    }
    let force_error = mat_mul(&mat_mul(&abs(&inv), &b_error, n), &abs(&it), n);
    let eig = jacobi_eigen(&h, n, 200);
    let q = &eig.vectors;
    let qt = transpose(q, n);
    let gram = mat_mul(&qt, q, n);
    let defect = gram
        .iter()
        .enumerate()
        .map(|(i, v)| (v - if i / n == i % n { 1.0 } else { 0.0 }).powi(2))
        .sum::<f64>()
        .sqrt();
    if !(defect < 1.0) {
        return Err("buckling eigenbasis has no lower singular value".into());
    }
    let mut residual = mat_mul(&h, q, n);
    for i in 0..n {
        for j in 0..n {
            residual[i * n + j] -= q[i * n + j] * eig.values[j];
        }
    }
    let root = (1.0 - defect).sqrt();
    let basis_error = (norm(&residual) + 2.0 * norm(&h) * defect / (1.0 + root)) / root;
    let base = gamma(4 * n + 2) * norm(&magnitude) / (1.0 - eta) + basis_error;
    let projected = mat_mul(&mat_mul(&abs(&qt), &force_error, n), &abs(q), n);
    let projection_error = 2.0 * norm(&force_error) * defect / (root * (1.0 + root));
    let mut intervals: Vec<_> = (0..n)
        .map(|j| {
            let radius = base
                + projection_error
                + projected[j * n..(j + 1) * n].iter().sum::<f64>()
                    / ((1.0 - eta) * (1.0 - defect));
            (eig.values[j] - radius, eig.values[j] + radius)
        })
        .collect();
    loop {
        let mut changed = false;
        for i in 0..n {
            for j in i + 1..n {
                if intervals[i].0 <= intervals[j].1 && intervals[j].0 <= intervals[i].1 {
                    let union = (
                        intervals[i].0.min(intervals[j].0),
                        intervals[i].1.max(intervals[j].1),
                    );
                    if intervals[i] != union || intervals[j] != union {
                        changed = true;
                    }
                    intervals[i] = union;
                    intervals[j] = union;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut modes: Vec<_> = (0..n).collect();
    modes.sort_by(|&a, &b| eig.values[b].total_cmp(&eig.values[a]));
    for i in &mut r.0 {
        let Some(index) = i
            .tag
            .strip_prefix("lambda")
            .and_then(|v| v.parse::<usize>().ok())
        else {
            continue;
        };
        let j = *modes.get(index).ok_or("buckling mode index outside the pencil")?;
        let metric_error = eta * intervals[j].0.abs().max(intervals[j].1.abs()) / (1.0 - eta);
        let lo = intervals[j].0 - metric_error;
        let hi = intervals[j].1 + metric_error;
        if !(lo.is_finite() && hi.is_finite()) || (lo <= 0.0 && hi >= 0.0) {
            return Err("buckling eigenvalue crosses zero under its rounding budget".into());
        }
        let lambda = *i.v.first().ok_or("missing buckling factor")?;
        let reciprocal = 1.0 / lambda;
        if !(lambda.is_finite() && reciprocal.is_finite() && lo <= reciprocal && reciprocal <= hi) {
            return Err("buckling factor lies outside its matching certified interval".into());
        }
        i.error = ((1.0 / lo - 1.0 / hi).abs() * (1.0 + gamma(4))).next_up();
    }
    Ok(())
}

fn l_lower(l: &[f64], n: usize) -> Vec<f64> {
    (0..n * n)
        .map(|k| if k % n <= k / n { l[k] } else { 0.0 })
        .collect()
}

pub fn buckling_2d(c: &crate::case::Case2, r: &mut Resp) -> Result<(), String> {
    if DofNumbering::build_2d(&c.s).n_free
        > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX
    {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let s = dedaliano_engine::solver::buckling::buckling_system_2d(&c.s)?;
    let cs = FreeConstraintSystem::build_2d(&c.s, &s.dof_num)?;
    let (k, b, n) = reduced_pencil(
        s.k_ff.to_dense_symmetric(),
        s.neg_kg_csc.to_dense_symmetric(),
        s.dof_num.n_free,
        cs.as_ref(),
    );
    let asm = assembly::assemble_2d(&c.s, &s.dof_num);
    let linear = crate::response::static_2d(&s.linear);
    let terms = dedaliano_engine::solver::geometric_stiffness::geometric_stiffness_terms_2d(
        &c.s, &s.dof_num,
    );
    let cond = dedaliano_engine::metamorphic::conditioning::of_2d(&c.s)?;
    let action_error = cond.rel() * crate::checks2::load_floor_2d(&c.s, cond.lchar);
    let b_error = geometric_error(
        &s.dof_num,
        &asm,
        cs.as_ref(),
        &linear,
        &terms,
        &s.mean_n,
        2,
        &cond,
        action_error,
    )?;
    buckling_errors(k, b, b_error, n, cond.rel(), r)
}

pub fn buckling_3d(c: &crate::case::Case3, r: &mut Resp) -> Result<(), String> {
    if DofNumbering::build_3d(&c.s).n_free
        > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX
    {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let s = dedaliano_engine::solver::buckling::buckling_system_3d(&c.s)?;
    let cs = FreeConstraintSystem::build_3d(&c.s, &s.dof_num)?;
    let (k, b, n) = reduced_pencil(
        s.k_ff.to_dense_symmetric(),
        s.neg_kg_csc.to_dense_symmetric(),
        s.dof_num.n_free,
        cs.as_ref(),
    );
    let asm = assembly::assemble_3d(&c.s, &s.dof_num);
    let linear = crate::response::static_3d(&s.linear);
    let terms = dedaliano_engine::solver::geometric_stiffness::geometric_stiffness_terms_3d(
        &c.s, &s.dof_num,
    );
    let cond = dedaliano_engine::metamorphic::conditioning::of_3d(&c.s)?;
    let action_error = cond.rel() * crate::checks3::load_floor_3d(&c.s, cond.lchar);
    let b_error = geometric_error(
        &s.dof_num,
        &asm,
        cs.as_ref(),
        &linear,
        &terms,
        &s.mean_n,
        3,
        &cond,
        action_error,
    )?;
    buckling_errors(k, b, b_error, n, cond.rel(), r)
}

fn reduced_pencil(
    k: Vec<f64>,
    b: Vec<f64>,
    n: usize,
    cs: Option<&FreeConstraintSystem>,
) -> (Vec<f64>, Vec<f64>, usize) {
    match cs {
        Some(cs) => (cs.reduce_matrix(&k), cs.reduce_matrix(&b), cs.n_free_indep),
        None => (k, b, n),
    }
}

fn recovery_error(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
    r: &Resp,
    translations: usize,
    cond: &dedaliano_engine::metamorphic::conditioning::Conditioning,
) -> Result<[f64; 2], String> {
    if dof.dofs_per_node > 2 * translations {
        return Err("force recovery estimate does not cover warping DOFs".into());
    }
    let u = gather(r, dof, translations);
    let e = static_errors(dof, asm, cs, u.clone(), cond)?;
    let mut traces = [0.0; 2];
    let mut groups = std::collections::BTreeMap::<(usize, usize), [f64; 3]>::new();
    for (&(node, local), &j) in &dof.map {
        if local >= 2 * translations {
            continue;
        }
        let family = usize::from(local >= translations);
        let diag = asm.k[j * dof.n_total + j].abs();
        traces[family] += diag;
        let group = groups.entry((node, family)).or_default();
        group[0] += diag;
        group[1] += u[j] * u[j];
        group[2] += e[j] * e[j];
    }
    let mut magnitude = 0.0;
    let mut error = 0.0;
    for [diagonal, displacement, uncertainty] in groups.values() {
        magnitude += (diagonal * displacement).sqrt();
        error += (diagonal * uncertainty).sqrt();
    }
    let element_dofs: usize = if translations == 2 { 6 } else { 12 };
    let operations = 2 * element_dofs * element_dofs;
    Ok(traces.map(|t| t.sqrt() * (error + gamma(operations) * magnitude)))
}

pub fn moving_2d(
    c: &crate::case::Case2,
    env: &dedaliano_engine::solver::moving_loads::MovingLoadEnvelope,
    r: &mut Resp,
) -> Result<(), String> {
    use dedaliano_engine::solver::{linear, moving_loads};
    let dof = DofNumbering::build_2d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let cond = dedaliano_engine::metamorphic::conditioning::of_2d(&c.s)?;
    let span: f64 = env.path.iter().map(|p| p.length).sum();
    let mut bounds = [0.0f64; 2];
    let mut s = c.s.clone();
    let mut pos = 0.0;
    for _ in 0..env.num_positions {
        s.loads = moving_loads::moving_loads_at_position_2d(&c.s, &env.train, &env.path, pos, span);
        let raw = crate::response::static_2d(&linear::solve_2d(&s)?);
        let asm = assembly::assemble_2d(&s, &dof);
        let cs = FreeConstraintSystem::build_2d(&s, &dof)?;
        let mut e = recovery_error(&dof, &asm, cs.as_ref(), &raw, 2, &cond)?;
        let moment = raw
            .0
            .iter()
            .filter(|i| i.tag == "M")
            .flat_map(|i| &i.v)
            .fold(0.0f64, |s, v| s.max(v.abs()));
        let force = raw
            .0
            .iter()
            .filter(|i| i.tag == "V" || i.tag == "N")
            .flat_map(|i| &i.v)
            .fold(0.0f64, |s, v| s.max(v.abs()));
        let action = crate::checks2::load_floor_2d(&s, span);
        let arithmetic = gamma(2 * 6 * 6 + 32 * s.loads.len());
        e[1] += arithmetic * (moment + span * force + span * action);
        e[0] += arithmetic * (force + action);
        for j in 0..2 {
            bounds[j] = bounds[j].max(e[j]);
        }
        pos += c.p.step;
    }
    let weight: f64 = env.train.axles.iter().map(|a| a.weight.abs()).sum();
    for i in &mut r.0 {
        i.error = match i.tag.as_str() {
            "M" => bounds[1] + span * bounds[0] + gamma(2 * 6 * 6) * weight * span,
            "V" | "N" => bounds[0] + gamma(2 * 6 * 6) * weight,
            _ => continue,
        };
    }
    Ok(())
}

pub fn moving_3d(
    c: &crate::case::Case3,
    env: &dedaliano_engine::solver::moving_loads::MovingLoadEnvelope3D,
    r: &mut Resp,
) -> Result<(), String> {
    use dedaliano_engine::solver::{linear, moving_loads};
    let dof = DofNumbering::build_3d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let cond = dedaliano_engine::metamorphic::conditioning::of_3d(&c.s)?;
    let span: f64 = env.path.iter().map(|p| p.length).sum();
    let mut bounds = [0.0f64; 2];
    let mut s = c.s.clone();
    let mut pos = 0.0;
    for _ in 0..env.num_positions {
        s.loads =
            moving_loads::moving_loads_at_position_3d(&c.s, &env.train, "z", &env.path, pos, span);
        let raw = crate::response::static_3d(&linear::solve_3d(&s)?);
        let asm = assembly::assemble_3d(&s, &dof);
        let cs = FreeConstraintSystem::build_3d(&s, &dof)?;
        let mut e = recovery_error(&dof, &asm, cs.as_ref(), &raw, 3, &cond)?;
        let moment = raw
            .0
            .iter()
            .filter(|i| (i.tag == "M" || i.tag == "My" || i.tag == "Mz"))
            .flat_map(|i| &i.v)
            .fold(0.0f64, |s, v| s.max(v.abs()));
        let force = raw
            .0
            .iter()
            .filter(|i| i.tag == "V" || i.tag == "N")
            .flat_map(|i| &i.v)
            .fold(0.0f64, |s, v| s.max(v.abs()));
        let action = crate::checks3::load_floor_3d(&s, span);
        let arithmetic = gamma(2 * 12 * 12 + 32 * s.loads.len());
        e[1] += arithmetic * (moment + span * force + span * action);
        e[0] += arithmetic * (force + action);
        for j in 0..2 {
            bounds[j] = bounds[j].max(e[j]);
        }
        pos += c.p.step;
    }
    let weight: f64 = env.train.axles.iter().map(|a| a.weight.abs()).sum();
    for i in &mut r.0 {
        i.error = match i.tag.as_str() {
            "Mx" | "My" | "Mz" => bounds[1] + span * bounds[0] + gamma(2 * 12 * 12) * weight * span,
            "Vy" | "Vz" | "N" => bounds[0] + gamma(2 * 12 * 12) * weight,
            _ => continue,
        };
    }
    Ok(())
}

pub fn attach(r: &mut Resp, f: impl FnOnce(&mut Resp) -> Result<(), String>) {
    let mut certified = r.clone();
    if f(&mut certified).is_ok()
        && certified
            .0
            .iter()
            .all(|i| i.error >= 0.0 && i.error.is_finite())
    {
        *r = certified;
    }
}

fn physical_rows(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
) -> Vec<Vec<f64>> {
    let n = cs.map_or(dof.n_free, |c| c.n_free_indep);
    let mut rows = vec![vec![0.0; n]; dof.n_total];
    for j in 0..n {
        let mut unit = vec![0.0; n];
        unit[j] = 1.0;
        let free = cs.map_or(unit.clone(), |cs| cs.expand_solution(&unit));
        let mut full = [free, vec![0.0; dof.n_total - dof.n_free]].concat();
        for it in &asm.inclined_transforms_2d {
            assembly::reverse_inclined_transform_2d(&mut full, &it.dofs, &it.r);
        }
        for it in &asm.inclined_transforms {
            assembly::reverse_inclined_transform(&mut full, &it.dofs, &it.r);
        }
        for (row, v) in rows.iter_mut().zip(full) {
            row[j] = v;
        }
    }
    rows
}

fn certify_recurrence(
    trace: &dedaliano_engine::solver::time_integration::DynamicTrace,
    k: &[f64],
    m: &[f64],
    damping: &[f64],
    effective: &Inverse,
) -> Result<(), String> {
    let n = effective.n;
    let h = trace.dt * 0.5;
    for i in 0..n {
        let row = &m[i * n..(i + 1) * n];
        let (residual, evaluation) = dot_residual(row, &trace.a[0], trace.f[0][i]);
        let magnitude = trace.f[0][i].abs()
            + row.iter().zip(&trace.a[0]).map(|(a, b)| (a * b).abs()).sum::<f64>();
        let bound = gamma(3 * n + 8) * magnitude + evaluation;
        if !(residual.abs() <= bound && bound.is_finite()) {
            return Err("initial acceleration violates the assembled equilibrium".into());
        }
    }
    for t in 1..trace.u.len() {
        let (u, old_u, v, old_v, a, old_a) = (
            &trace.u[t], &trace.u[t - 1], &trace.v[t], &trace.v[t - 1],
            &trace.a[t], &trace.a[t - 1],
        );
        let mass_predictor: Vec<_> = (0..n)
            .map(|j| old_u[j] / (h * h) + 2.0 * old_v[j] / h + old_a[j])
            .collect();
        let damping_predictor: Vec<_> = (0..n).map(|j| old_u[j] / h + old_v[j]).collect();
        let solve_scale: f64 = (0..n)
            .map(|j| effective.matrix[j * n + j].sqrt() * u[j].abs())
            .sum();
        for i in 0..n {
            let expected_a = (u[i] - old_u[i]) / (h * h) - 2.0 * old_v[i] / h - old_a[i];
            let a_scale = (u[i].abs() + old_u[i].abs()) / (h * h)
                + 2.0 * old_v[i].abs() / h + old_a[i].abs() + a[i].abs();
            let expected_v = old_v[i] + h * (old_a[i] + a[i]);
            let v_scale = old_v[i].abs() + h * (old_a[i].abs() + a[i].abs()) + v[i].abs();
            if !((a[i] - expected_a).abs() <= gamma(12) * a_scale
                && (v[i] - expected_v).abs() <= gamma(8) * v_scale
                && a_scale.is_finite() && v_scale.is_finite()) {
                return Err("trajectory violates the Newmark state recurrence".into());
            }
            let mut coefficients = Vec::with_capacity(3 * n);
            let mut values = Vec::with_capacity(3 * n);
            coefficients.extend_from_slice(&effective.matrix[i * n..(i + 1) * n]);
            coefficients.extend(m[i * n..(i + 1) * n].iter().map(|a| -a));
            coefficients.extend(damping[i * n..(i + 1) * n].iter().map(|a| -a));
            values.extend_from_slice(u);
            values.extend_from_slice(&mass_predictor);
            values.extend_from_slice(&damping_predictor);
            let (residual, evaluation) = dot_residual(&coefficients, &values, trace.f[t][i]);
            let mut magnitude = trace.f[t][i].abs();
            for j in 0..n {
                let mass = (u[j].abs() + old_u[j].abs()) / (h * h)
                    + 2.0 * old_v[j].abs() / h + old_a[j].abs();
                let rate = (u[j].abs() + old_u[j].abs()) / h + old_v[j].abs();
                magnitude += k[i * n + j].abs() * u[j].abs() + m[i * n + j].abs() * mass
                    + (trace.a0 * m[i * n + j].abs() + trace.a1 * k[i * n + j].abs()) * rate;
            }
            let factorization = effective.matrix[i * n + i].sqrt() * solve_scale;
            let bound = gamma(12 * n + 32) * magnitude
                + gamma(3 * n + 2) * factorization + evaluation;
            if !(residual.abs() <= bound && bound.is_finite()) {
                return Err("trajectory violates the assembled Newmark equilibrium recurrence".into());
            }
        }
    }
    Ok(())
}

fn trajectory_error(
    trace: &dedaliano_engine::solver::time_integration::DynamicTrace,
    damping_error: f64,
) -> Result<(Vec<f64>, Vec<Vec<f64>>), String> {
    let n = trace.k.n;
    let steps = trace.u.len();
    if n == 0 || trace.m.n != n || steps < 2
        || !(trace.dt > 0.0 && trace.dt.is_finite())
        || !(trace.a0 >= 0.0 && trace.a0.is_finite() && trace.a1 >= 0.0 && trace.a1.is_finite())
        || !(damping_error >= 0.0 && damping_error.is_finite())
        || [&trace.u, &trace.v, &trace.a, &trace.f].iter().any(|history| {
            history.len() != steps || history.iter().any(|row| row.len() != n || row.iter().any(|v| !v.is_finite()))
        })
    {
        return Err("invalid discrete trajectory".into());
    }
    if trace.u[0].iter().chain(&trace.v[0]).any(|v| *v != 0.0)
        || trace.beta != 0.25
        || trace.gamma != 0.5
        || trace.alpha.is_some()
    {
        return Err(
            "trajectory certificate requires zero initial state and average acceleration".into(),
        );
    }
    let n = trace.k.n;
    let k = trace.k.to_dense_symmetric();
    let m = trace.m.to_dense_symmetric();
    let h = trace.dt * 0.5;
    let damping: Vec<_> = m
        .iter()
        .zip(&k)
        .map(|(m, k)| trace.a0 * m + trace.a1 * k)
        .collect();
    let effective: Vec<_> = k
        .iter()
        .zip(&m)
        .zip(&damping)
        .map(|((k, m), c)| k + m / (h * h) + c / h)
        .collect();
    let effective = Inverse::new(effective, n)?;
    certify_recurrence(trace, &k, &m, &damping, &effective)?;
    let mut energy = 0.0;
    let mut energies = vec![0.0];
    let mut displacements = Vec::new();
    for t in 1..trace.u.len() {
        let (u, old_u, v, old_v) = (&trace.u[t], &trace.u[t - 1], &trace.v[t], &trace.v[t - 1]);
        let du: Vec<_> = (0..n)
            .map(|i| {
                (u[i] - old_u[i] - h * (v[i] + old_v[i])).abs()
                    + gamma(6) * (u[i].abs() + old_u[i].abs() + h * (v[i].abs() + old_v[i].abs()))
            })
            .collect();
        let mut dp = vec![0.0; n];
        for i in 0..n {
            let mut defect = -h * (trace.f[t][i] + trace.f[t - 1][i]);
            let mut magnitude = h * (trace.f[t][i].abs() + trace.f[t - 1][i].abs());
            let mut damping = 0.0;
            let mut mass_rate = 0.0;
            let mut stiffness_rate = 0.0;
            for j in 0..n {
                let p = m[i * n + j] * (v[j] - old_v[j]);
                let q = h * k[i * n + j] * (u[j] + old_u[j]);
                let d = h * (trace.a0 * m[i * n + j] + trace.a1 * k[i * n + j]) * (v[j] + old_v[j]);
                defect += p + q + d;
                mass_rate += m[i * n + j] * (v[j] + old_v[j]);
                stiffness_rate += k[i * n + j] * (v[j] + old_v[j]);
                magnitude += m[i * n + j].abs() * (v[j].abs() + old_v[j].abs())
                    + h * k[i * n + j].abs() * (u[j].abs() + old_u[j].abs());
                let dm = h
                    * (trace.a0 * m[i * n + j].abs() + trace.a1 * k[i * n + j].abs())
                    * (v[j].abs() + old_v[j].abs());
                magnitude += dm;
                damping += dm;
            }
            let damping_action = h * (trace.a0 * mass_rate.abs() + trace.a1 * stiffness_rate.abs())
                + gamma(6 * n + 8) * damping;
            dp[i] = defect.abs() + gamma(14 * n + 4) * magnitude + damping_error * damping_action;
        }
        let m_du = mat_vec(&abs(&m), &du, n);
        let c_du = mat_vec(&abs(&damping), &du, n);
        let rhs: Vec<_> = (0..n)
            .map(|i| dp[i] / h + m_du[i] / (h * h) + c_du[i] / h)
            .collect();
        let u_error = effective.absolute_solve(&rhs);
        let effective_energy = dot(&rhs, &u_error).max(0.0).sqrt();
        let kinematic_energy = dot(&du, &mat_vec(&abs(&m), &du, n)).max(0.0).sqrt() / h;
        energy += effective_energy + kinematic_energy;
        energies.push(energy);
        displacements.push(du);
    }
    if !energy.is_finite() {
        return Err("nonfinite trajectory defect".into());
    }
    Ok((energies, displacements))
}

fn time_errors(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
    trace: &dedaliano_engine::solver::time_integration::DynamicTrace,
    eigen: &crate::dynamic_accuracy::HarmonicAccuracy,
    cond: &dedaliano_engine::metamorphic::conditioning::Conditioning,
    r: &mut Resp,
    translations: usize,
) -> Result<(), String> {
    let residual = eigen.residual + cond.rel() * eigen.mu.iter().copied().fold(0.0, f64::max);
    if eigen
        .mu
        .iter()
        .any(|m| *m - residual <= 1e10 && *m + residual >= 1e10)
    {
        return Err("damping anchor selection overlaps its cutoff".into());
    }
    let anchors: Vec<_> = eigen
        .mu
        .iter()
        .rev()
        .copied()
        .filter(|m| *m > residual && *m + residual < 1e10)
        .take(2)
        .collect();
    let anchor = *anchors.last().ok_or("no resolved damping anchor")?;
    let eta = residual / anchor;
    if !(eta < 1.0) {
        return Err("unbounded damping eigen uncertainty".into());
    }
    let root = (1.0 - eta).sqrt();
    let frequency = eta / (root * (1.0 + root));
    if !(frequency < 1.0) {
        return Err("unbounded damping coefficient uncertainty".into());
    }
    let damping_error = frequency / (1.0 - frequency);
    let (energies, defects) = trajectory_error(trace, damping_error)?;
    let energy = *energies.last().unwrap();
    let velocity_integral: f64 = energies
        .windows(2)
        .map(|e| 0.5 * trace.dt * (e[0] + e[1]))
        .sum();
    let rows = physical_rows(dof, asm, cs);
    let ki = Inverse::new(trace.k.to_dense_symmetric(), trace.k.n)?;
    let mass = trace.m.to_dense_symmetric();
    let mut mass_factor = mass.clone();
    let mi = if cholesky_decompose(&mut mass_factor, trace.m.n) {
        Inverse::new(mass, trace.m.n).ok()
    } else {
        None
    };
    for i in &mut r.0 {
        let Some(node) = i.node else { continue };
        let locals = if i.tag.starts_with("u_t") {
            0..translations
        } else if i.tag.starts_with("r_t") || i.tag.starts_with("ry_t") {
            translations..2 * translations
        } else {
            continue;
        };
        let mut bound2 = 0.0;
        for local in locals {
            let Some(&j) = dof.map.get(&(node, local)) else {
                continue;
            };
            let row = abs(&rows[j]);
            let static_bound = energy * dot(&row, &ki.absolute_solve(&row)).max(0.0).sqrt();
            let kinematic = defects.iter().map(|du| dot(&row, du)).sum::<f64>();
            let finite_time = mi.as_ref().map_or(f64::INFINITY, |mi| {
                kinematic + velocity_integral * dot(&row, &mi.absolute_solve(&row)).max(0.0).sqrt()
            });
            bound2 += static_bound.min(finite_time).powi(2);
        }
        i.error = bound2.max(0.0).sqrt();
    }
    Ok(())
}

pub fn time_2d(
    c: &crate::case::Case2,
    trace: &dedaliano_engine::solver::time_integration::DynamicTrace,
    r: &mut Resp,
) -> Result<(), String> {
    let dof = DofNumbering::build_2d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let asm = assembly::assemble_2d(&c.s, &dof);
    let cs = FreeConstraintSystem::build_2d(&c.s, &dof)?;
    time_errors(
        &dof,
        &asm,
        cs.as_ref(),
        trace,
        &crate::dynamic_accuracy::harmonic_2d(c)?,
        &dedaliano_engine::metamorphic::conditioning::of_2d(&c.s)?,
        r,
        2,
    )
}

pub fn time_3d(
    c: &crate::case::Case3,
    trace: &dedaliano_engine::solver::time_integration::DynamicTrace,
    r: &mut Resp,
) -> Result<(), String> {
    let dof = DofNumbering::build_3d(&c.s);
    if dof.n_free > dedaliano_engine::metamorphic::conditioning::DENSE_EIGEN_MAX {
        return Err("accuracy pencil exceeds the dense certificate limit".into());
    }
    let asm = assembly::assemble_3d(&c.s, &dof);
    let cs = FreeConstraintSystem::build_3d(&c.s, &dof)?;
    time_errors(
        &dof,
        &asm,
        cs.as_ref(),
        trace,
        &crate::dynamic_accuracy::harmonic_3d(c)?,
        &dedaliano_engine::metamorphic::conditioning::of_3d(&c.s)?,
        r,
        3,
    )
}

fn geometric_error(
    dof: &DofNumbering,
    asm: &assembly::AssemblyResult,
    cs: Option<&FreeConstraintSystem>,
    linear: &Resp,
    terms: &[dedaliano_engine::solver::geometric_stiffness::KgAffineTerm],
    mean_n: &std::collections::HashMap<usize, f64>,
    translations: usize,
    cond: &dedaliano_engine::metamorphic::conditioning::Conditioning,
    action_error: f64,
) -> Result<Vec<f64>, String> {
    let u = gather(linear, dof, translations);
    let (inverse, x, f) = static_system(dof, asm, cs, u.clone())?;
    let residual = static_accuracy_residual(&inverse, &x, &f, cond)?;
    let rows = physical_rows(dof, asm, cs);
    let n = rows[0].len();
    let mut functionals = vec![vec![0.0; n]; n * n];
    let mut rounding = vec![0.0; n * n];
    for term in terms {
        let elongation: BigRational = term
            .elongation
            .iter()
            .map(|&(j, c)| rational(c) * rational(u[j]))
            .sum();
        let axial = rational(term.e)
            * rational(term.a)
            * (elongation / rational(term.l) - rational(term.alpha) * rational(term.dt));
        let recovered = rational(*mean_n.get(&term.element_id).ok_or("missing axial force")?);
        let magnitude: f64 = term.elongation.iter().map(|&(j, c)| (c * u[j]).abs()).sum();
        let geometry = gamma(4 * (term.dofs.len() + 24)) * cond.geom * term.e * term.a / term.l
            * (magnitude + (term.l * term.alpha * term.dt).abs());
        let roundoff = upper_abs(&(recovered - axial)) + geometry + action_error;
        let mut elongation = vec![0.0; n];
        for &(j, c) in &term.elongation {
            for (a, &v) in elongation.iter_mut().zip(&rows[j]) {
                *a += c * v;
            }
        }
        let m = term.dofs.len();
        for a in 0..n {
            for b in 0..n {
                let mut entry = 0.0;
                let mut entry_magnitude = 0.0;
                for (i, &di) in term.dofs.iter().enumerate() {
                    for (j, &dj) in term.dofs.iter().enumerate() {
                        let value = rows[di][a] * term.g[i * m + j] * rows[dj][b];
                        entry += value;
                        entry_magnitude += value.abs();
                    }
                }
                let coefficient = term.e * term.a / term.l * entry;
                for (row, &e) in functionals[a * n + b].iter_mut().zip(&elongation) {
                    *row += coefficient * e;
                }
                rounding[a * n + b] += roundoff * entry_magnitude * (1.0 + gamma(4 * m * m));
            }
        }
    }
    Ok(functionals
        .iter()
        .zip(rounding)
        .map(|(row, roundoff)| inverse.functional_error(&residual, row) + roundoff)
        .collect())
}

impl Inverse {
    fn residual(&self, x: &[f64], f: &[f64]) -> (Vec<f64>, Vec<f64>) {
        let n = self.n;
        let mut residual = vec![0.0; n];
        let mut rounding = vec![0.0; n];
        for i in 0..n {
            let (r, e) = dot_residual(&self.matrix[i * n..(i + 1) * n], x, f[i]);
            residual[i] = r / self.diagonal[i];
            rounding[i] = (e + gamma(2) * r.abs()) / self.diagonal[i];
        }
        (residual, rounding)
    }

    fn functional_error(&self, (residual, rounding): &(Vec<f64>, Vec<f64>), row: &[f64]) -> f64 {
        let n = self.n;
        let mut dual = vec![0.0; n];
        for j in 0..n {
            dual[j] = (0..n)
                .map(|i| row[i] / self.diagonal[i] * self.inverse[i * n + j])
                .sum::<f64>()
                / self.diagonal[j];
        }
        let mut dual_residual = vec![0.0; n];
        for j in 0..n {
            let column: Vec<_> = (0..n).map(|i| self.matrix[i * n + j]).collect();
            let (r, e) = dot_residual(&column, &dual, row[j]);
            dual_residual[j] = (r.abs() + e).next_up();
        }
        let dual_error = self.absolute_solve(&dual_residual);
        let mut value = 0.0;
        let mut magnitude = 0.0;
        let mut propagated = 0.0;
        for j in 0..n {
            let r = residual[j] * self.diagonal[j];
            let e = rounding[j] * self.diagonal[j] + gamma(2) * r.abs();
            value += dual[j] * r;
            magnitude += (dual[j] * r).abs();
            propagated += dual[j].abs() * e + dual_error[j] * (r.abs() + e);
        }
        value.abs() + propagated + gamma(2 * n) * magnitude
    }
}

fn rational(v: f64) -> BigRational {
    BigRational::from_float(v).unwrap()
}

fn upper_abs(v: &BigRational) -> f64 {
    v.to_f64().map_or(f64::INFINITY, |x| {
        if x == 0.0 && *v == rational(0.0) {
            0.0
        } else {
            x.abs().next_up()
        }
    })
}

fn dot_residual(a: &[f64], x: &[f64], f: f64) -> (f64, f64) {
    let mut partials = Vec::new();
    let mut add = |mut x: f64| {
        let mut kept = 0;
        for j in 0..partials.len() {
            let mut y: f64 = partials[j];
            if x.abs() < y.abs() {
                std::mem::swap(&mut x, &mut y);
            }
            let hi = x + y;
            let lo = y - (hi - x);
            if lo != 0.0 {
                partials[kept] = lo;
                kept += 1;
            }
            x = hi;
        }
        partials.truncate(kept);
        partials.push(x);
    };
    add(-f);
    for (&a, &x) in a.iter().zip(x) {
        let product = a * x;
        add(product);
        add(a.mul_add(x, -product));
    }
    let value = partials.pop().unwrap_or(0.0);
    let mut error = 0.0f64;
    for v in partials {
        error = (error + v.abs()).next_up();
    }
    error = (error + a.len() as f64 * f64::from_bits(1)).next_up();
    (value, error)
}

#[test]
fn expanded_residual_encloses_exact_binary_arithmetic() {
    let mut rng = dedaliano_engine::metamorphic::Rng::new(2026110200131);
    for n in [1, 2, 9, 40, 80] {
        let a: Vec<_> = (0..n)
            .map(|_| rng.range(-1.0, 1.0) * 2.0f64.powi(rng.below(120) as i32 - 60))
            .collect();
        let x: Vec<_> = (0..n)
            .map(|_| rng.range(-1.0, 1.0) * 2.0f64.powi(rng.below(120) as i32 - 60))
            .collect();
        let f = dot(&a, &x);
        let exact: BigRational = a
            .iter()
            .zip(&x)
            .map(|(&a, &x)| rational(a) * rational(x))
            .sum::<BigRational>()
            - rational(f);
        let (r, error) = dot_residual(&a, &x, f);
        assert!((rational(r) - &exact) <= rational(error));
        assert!((&exact - rational(r)) <= rational(error));
    }
    let tiny = f64::from_bits(1);
    let (r, error) = dot_residual(&[tiny], &[0.5], 0.0);
    assert!(rational(error) >= rational(tiny) / rational(2.0) - rational(r));
}

#[test]
fn negative_buckling_reciprocal_crossing_has_no_allowance() {
    for factor in [-1.0, -2.0] {
        let mut r = Resp::default();
        r.scalar("lambda0", Dim::NONE, factor);
        assert!(buckling_errors(vec![1.0], vec![-1.0], vec![2.0], 1, 0.0, &mut r).is_err());
    }
}

#[test]
fn negative_buckling_factor_changes_fail_with_a_resolved_interval() {
    let mut expected = Resp::default();
    expected.scalar("lambda0", Dim::NONE, -1.0);
    buckling_errors(vec![1.0], vec![-1.0], vec![0.0], 1, 0.0, &mut expected).unwrap();
    for factor in [1.0, -2.0] {
        let mut got = expected.clone();
        got.0[0].v[0] = factor;
        assert!(buckling_errors(vec![1.0], vec![-1.0], vec![0.0], 1, 0.0, &mut got).is_err());
        assert!(compare(&got, &expected, 1.0, 1e-10, 0.0, [0.0; 2]).is_err());
    }
}

#[test]
fn negative_buckling_allowance_uses_the_absolute_reciprocal_radius() {
    let bound = |factor: f64| {
        let mut r = Resp::default();
        r.scalar("lambda0", Dim::NONE, factor);
        buckling_errors(vec![1.0], vec![factor], vec![0.25], 1, 0.0, &mut r).unwrap();
        r.0[0].error
    };
    assert_eq!(bound(-1.0).to_bits(), bound(1.0).to_bits());
}

#[test]
fn issue_1892_wrong_buckling_factor_cannot_buy_its_allowance() {
    let mut r = Resp::default();
    r.scalar("lambda0", Dim::NONE, 3.9);
    assert!(buckling_errors(vec![1.0], vec![1.0], vec![0.25], 1, 0.0, &mut r).is_err());
}

#[test]
fn issue_1892_buckling_modes_must_match_their_intervals() {
    let mut r = Resp::default();
    r.scalar("lambda0", Dim::NONE, 1.0);
    r.scalar("lambda1", Dim::NONE, 0.25);
    assert!(buckling_errors(vec![1.0, 0.0, 0.0, 1.0], vec![1.0, 0.0, 0.0, 4.0], vec![0.0; 4], 2, 0.0, &mut r).is_err());
}

#[test]
fn issue_1892_buckling_interval_crossing_is_independent_of_returned_factor() {
    let mut r = Resp::default();
    r.scalar("lambda0", Dim::NONE, 0.1);
    assert!(buckling_errors(vec![1.0], vec![1.0], vec![2.0], 1, 0.0, &mut r).is_err());
}

fn unit_trajectory(u: f64, v: f64) -> dedaliano_engine::solver::time_integration::DynamicTrace {
    dedaliano_engine::solver::time_integration::DynamicTrace {
        k: CscMatrix::from_dense_symmetric(&[1.0], 1),
        m: CscMatrix::from_dense_symmetric(&[1.0], 1),
        a0: 0.1, a1: 0.0, beta: 0.25, gamma: 0.5, alpha: None, dt: 1.0,
        f: vec![vec![1.0]; 2], u: vec![vec![0.0], vec![u]], v: vec![vec![0.0], vec![v]],
        a: vec![vec![1.0], vec![2.0 * v - 1.0]],
    }
}

#[test]
fn issue_1892_zero_trajectory_cannot_certify_a_missing_response() {
    for damping_error in [0.0, 1e-4] {
        assert!(trajectory_error(&unit_trajectory(0.0, 0.0), damping_error).is_err());
    }
}

#[test]
fn issue_1892_absent_zero_load_projection_has_zero_error() {
    assert_eq!(projected_error(&Resp::default(), 1, "u", &[1.0]), 0.0);
}

#[test]
fn unit_trajectory_with_the_trapezoidal_response_is_certified() {
    let displacement = 2.0 / (1.0 + 4.0 + 0.2);
    let (energies, _) = trajectory_error(&unit_trajectory(displacement, 2.0 * displacement), 0.0).unwrap();
    assert!(*energies.last().unwrap() < gamma(100));
}

#[test]
fn buckling_mode_intervals_follow_the_factor_order() {
    let mut r = Resp::default();
    r.scalar("lambda0", Dim::NONE, 0.25);
    r.scalar("lambda1", Dim::NONE, 1.0);
    buckling_errors(vec![1.0, 0.0, 0.0, 1.0], vec![1.0, 0.0, 0.0, 4.0], vec![0.0; 4], 2, 0.0, &mut r).unwrap();
    assert!(r.0.iter().all(|i| i.error.is_finite() && i.error >= 0.0));
}

fn unit_conditioning() -> dedaliano_engine::metamorphic::conditioning::Conditioning {
    dedaliano_engine::metamorphic::conditioning::Conditioning {
        n: 1, kappa: 1.0, geom: 1.0, lchar: 1.0, kmax: 1.0, kmax_r: 1.0, eig: 0.0,
    }
}

fn unit_static_system(translations: usize) -> (DofNumbering, assembly::AssemblyResult, Resp) {
    let dof = DofNumbering {
        map: [((1, 0), 0)].into(),
        n_free: 1,
        n_total: 1,
        dofs_per_node: 2 * translations,
        node_order: vec![1],
    };
    let asm = assembly::AssemblyResult {
        k: vec![1.0],
        f: vec![1.0],
        max_diag_k: 1.0,
        artificial_dofs: vec![],
        inclined_transforms: vec![],
        inclined_transforms_2d: vec![],
        diagnostics: vec![],
    };
    let mut r = Resp::default();
    r.push(Some(1), None, "u", if translations == 2 { Kind::V2(Dim::LEN) } else { Kind::V3(Dim::LEN) }, vec![2.0; translations]);
    (dof, asm, r)
}

#[test]
fn issue_1892_doubled_prestress_before_certification_is_rejected() {
    use dedaliano_engine::solver::geometric_stiffness::KgAffineTerm;
    for translations in [2, 3] {
        let (dof, asm, linear) = unit_static_system(translations);
        let terms = [KgAffineTerm {
            element_id: 1, dofs: vec![0], g: vec![1.0], elongation: vec![(0, 1.0)],
            e: 1.0, a: 1.0, l: 1.0, alpha: 0.0, dt: 0.0,
        }];
        let mean_n = [(1, 2.0)].into();
        let result = geometric_error(&dof, &asm, None, &linear, &terms, &mean_n, translations, &unit_conditioning(), 0.0);
        assert!(result.is_err(), "{translations}D doubled pre-stress certified: {result:?}");
    }
}

#[test]
fn issue_1892_wrong_moving_recovery_before_certification_is_rejected() {
    for translations in [2, 3] {
        let (dof, asm, r) = unit_static_system(translations);
        let result = recovery_error(&dof, &asm, None, &r, translations, &unit_conditioning());
        assert!(result.is_err(), "{translations}D doubled static response certified: {result:?}");
    }
}

#[test]
fn issue_1892_scaled_trajectory_above_comparison_tolerance_is_rejected() {
    let comparison_tolerance = 1e-10;
    let displacement = 2.0 / (1.0 + 4.0 + 0.2);
    for eps in [2e-10, 1e-8, 1e-6, 1e-4] {
        assert!(eps > comparison_tolerance);
        assert!(eps < dedaliano_engine::metamorphic::conditioning::INCONCLUSIVE);
        let scale = 1.0 + eps;
        let trace = unit_trajectory(displacement * scale, 2.0 * displacement * scale);
        for damping_error in [0.0, 1e-4] {
            let result = trajectory_error(&trace, damping_error);
            assert!(result.is_err(), "amplitude error {eps:e} certified with damping uncertainty {damping_error:e}: {result:?}");
        }
    }
}

#[test]
fn issue_1892_round_four_correct_recurrence_survives_damping_uncertainty() {
    let displacement = 2.0 / (1.0 + 4.0 + 0.2);
    let trace = unit_trajectory(displacement, 2.0 * displacement);
    for damping_error in [1e-8, 1e-6, 1e-4] {
        let result = trajectory_error(&trace, damping_error);
        assert!(result.is_ok(), "correct discrete response rejected: {result:?}");
    }
}
