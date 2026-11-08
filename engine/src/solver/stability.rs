//! One stability and rank verdict for a free stiffness matrix, invariant under a change of
//! units, a rigid rotation or mirror of the model and a relabelling of its nodes
//! (docs/solver/stability.md).

use crate::linalg::sparse::CscMatrix;
use crate::linalg::sparse_chol::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky};
use crate::solver::dof::DofNumbering;
use crate::types::*;
use std::collections::BTreeMap;
use std::rc::Rc;

pub const LOCAL_FREE: f64 = 1e-12;
pub const KIND_FREE: f64 = 1e-12;
pub const RESOLVABLE: f64 = 1e12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum DofKind { Translation, Rotation, Warping }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DofTag { pub node: usize, pub kind: DofKind }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict { Stable, Mechanism, Singular }

#[derive(Debug, Clone)]
pub struct FreeDirection {
    pub node: usize,
    pub kind: DofKind,
    pub dofs: Vec<usize>,
    pub direction: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct Stability {
    pub verdict: Verdict,
    pub kappa: f64,
    pub anisotropy: f64,
    pub free: Vec<FreeDirection>,
    pub mode_nodes: Vec<usize>,
}

impl Stability {
    pub fn is_stable(&self) -> bool { self.verdict == Verdict::Stable }

    pub fn free_rotations(&self) -> impl Iterator<Item = &FreeDirection> {
        self.free.iter().filter(|f| f.kind != DofKind::Translation)
    }

    pub fn refusal(&self) -> Option<String> {
        let nodes = if self.mode_nodes.is_empty() { String::new() } else { format!(" at nodes {:?}", self.mode_nodes) };
        match self.verdict {
            Verdict::Stable => None,
            Verdict::Mechanism => Some(format!(
                "the structure is a mechanism{nodes}: a node can move freely in a direction no member, support or spring stiffens; add supports or members, or remove releases"
            )),
            Verdict::Singular => Some(format!(
                "the structure is a mechanism or so close to one that its stability cannot be decided in double precision{nodes} (scaled condition number {:.1e} times node anisotropy {:.1e} exceeds {RESOLVABLE:.0e}): results would change with units, orientation or numbering; add supports or members, remove releases, or reduce extreme stiffness contrasts",
                self.kappa, self.anisotropy
            )),
        }
    }
}

pub fn tags(dof_num: &DofNumbering, two_d: bool) -> Vec<DofTag> {
    let mut out = vec![DofTag { node: 0, kind: DofKind::Translation }; dof_num.n_total];
    for ((node, local), g) in dof_num.entries_by_dof() {
        let kind = match (two_d, local) {
            (true, 0 | 1) | (false, 0..=2) => DofKind::Translation,
            (false, 6) => DofKind::Warping,
            _ => DofKind::Rotation,
        };
        out[g] = DofTag { node, kind };
    }
    out
}

fn sym_eigen_small(a: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut m = a.to_vec();
    let mut v = vec![0.0; n * n];
    for i in 0..n { v[i * n + i] = 1.0; }
    for _ in 0..64 {
        let off: f64 = (0..n).flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j))).map(|(i, j)| m[i * n + j] * m[i * n + j]).sum();
        let diag: f64 = (0..n).map(|i| m[i * n + i] * m[i * n + i]).sum();
        if off <= (f64::EPSILON * f64::EPSILON) * diag * 1e-4 || off == 0.0 { break; }
        for p in 0..n {
            for q in (p + 1)..n {
                let apq = m[p * n + q];
                if apq == 0.0 { continue; }
                let theta = (m[q * n + q] - m[p * n + p]) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (mkp, mkq) = (m[k * n + p], m[k * n + q]);
                    m[k * n + p] = c * mkp - s * mkq;
                    m[k * n + q] = s * mkp + c * mkq;
                }
                for k in 0..n {
                    let (mpk, mqk) = (m[p * n + k], m[q * n + k]);
                    m[p * n + k] = c * mpk - s * mqk;
                    m[q * n + k] = s * mpk + c * mqk;
                }
                for k in 0..n {
                    let (vkp, vkq) = (v[k * n + p], v[k * n + q]);
                    v[k * n + p] = c * vkp - s * vkq;
                    v[k * n + q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| m[a * n + a].total_cmp(&m[b * n + b]));
    let values = order.iter().map(|&i| m[i * n + i]).collect();
    let mut vectors = vec![0.0; n * n];
    for (c, &i) in order.iter().enumerate() {
        for r in 0..n { vectors[r * n + c] = v[r * n + i]; }
    }
    (values, vectors)
}

struct Column { group: usize, w: Vec<f64> }

pub fn analyze_dense(k: &[f64], n: usize, tags: &[DofTag]) -> Stability {
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..n {
        for i in j..n {
            let v = 0.5 * (k[i * n + j] + k[j * n + i]);
            if v != 0.0 {
                rows.push(i);
                cols.push(j);
                vals.push(v);
            }
        }
    }
    analyze(&CscMatrix::from_triplets(n, &rows, &cols, &vals), tags)
}

pub fn analyze(k: &CscMatrix, tags: &[DofTag]) -> Stability {
    let n = k.n;
    let mut groups: BTreeMap<(usize, DofKind), Vec<usize>> = BTreeMap::new();
    for (i, t) in tags.iter().enumerate().take(n) {
        groups.entry((t.node, t.kind)).or_default().push(i);
    }
    let groups: Vec<((usize, DofKind), Vec<usize>)> = groups.into_iter().collect();
    let mut group_of = vec![(0usize, 0usize); n];
    for (g, (_, dofs)) in groups.iter().enumerate() {
        for (l, &d) in dofs.iter().enumerate() { group_of[d] = (g, l); }
    }
    let mut blocks: Vec<Vec<f64>> = groups.iter().map(|(_, d)| vec![0.0; d.len() * d.len()]).collect();
    for j in 0..n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let ((gi, li), (gj, lj)) = (group_of[i], group_of[j]);
            if gi != gj { continue; }
            let b = groups[gi].1.len();
            blocks[gi][li * b + lj] = k.values[p];
            blocks[gi][lj * b + li] = k.values[p];
        }
    }
    let eig: Vec<(Vec<f64>, Vec<f64>)> = blocks.iter().zip(&groups).map(|(b, (_, d))| sym_eigen_small(b, d.len())).collect();
    let mut kind_max: BTreeMap<DofKind, f64> = BTreeMap::new();
    for (((_, kind), _), (mu, _)) in groups.iter().zip(&eig) {
        let top = mu.last().copied().unwrap_or(0.0).max(0.0);
        let e = kind_max.entry(*kind).or_insert(0.0);
        *e = e.max(top);
    }
    let mut free = Vec::new();
    let mut columns: Vec<Column> = Vec::new();
    let mut anisotropy = 1.0f64;
    for (g, (((node, kind), dofs), (mu, vecs))) in groups.iter().zip(&eig).enumerate() {
        let b = dofs.len();
        let top = mu.last().copied().unwrap_or(0.0);
        let whole_free = top.is_nan() || top <= KIND_FREE * kind_max[kind];
        let mut lowest_kept = f64::INFINITY;
        for c in 0..b {
            let v: Vec<f64> = (0..b).map(|r| vecs[r * b + c]).collect();
            if whole_free || mu[c].is_nan() || mu[c] <= LOCAL_FREE * top {
                free.push(FreeDirection { node: *node, kind: *kind, dofs: dofs.clone(), direction: v });
            } else {
                lowest_kept = lowest_kept.min(mu[c]);
                let s = mu[c].sqrt();
                columns.push(Column { group: g, w: v.iter().map(|x| x / s).collect() });
            }
        }
        if lowest_kept.is_finite() { anisotropy = anisotropy.max(top / lowest_kept); }
    }
    let translation_free: Vec<usize> = free.iter().filter(|f| f.kind == DofKind::Translation).map(|f| f.node).collect();
    if !translation_free.is_empty() {
        let mut mode_nodes = translation_free;
        mode_nodes.sort_unstable();
        mode_nodes.dedup();
        return Stability { verdict: Verdict::Mechanism, kappa: f64::INFINITY, anisotropy, free, mode_nodes };
    }
    let m = columns.len();
    if m == 0 {
        return Stability { verdict: Verdict::Stable, kappa: 1.0, anisotropy, free, mode_nodes: Vec::new() };
    }
    let s = scaled(k, &groups, &group_of, &columns);
    let (kappa, mode) = spectrum(&s);
    let mode_nodes = mode.map(|x| mode_nodes(&x, &columns, &groups)).unwrap_or_default();
    let verdict = if kappa * anisotropy <= RESOLVABLE { Verdict::Stable } else { Verdict::Singular };
    Stability { verdict, kappa, anisotropy, free, mode_nodes: if verdict == Verdict::Stable { Vec::new() } else { mode_nodes } }
}

fn scaled(k: &CscMatrix, groups: &[((usize, DofKind), Vec<usize>)], group_of: &[(usize, usize)], columns: &[Column]) -> CscMatrix {
    let mut by_group: Vec<Vec<usize>> = vec![Vec::new(); groups.len()];
    for (c, col) in columns.iter().enumerate() { by_group[col.group].push(c); }
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    let mut place = |x: usize, y: usize, v: f64| {
        let ((gx, lx), (gy, ly)) = (group_of[x], group_of[y]);
        for &r in &by_group[gx] {
            for &c in &by_group[gy] {
                if r >= c {
                    rows.push(r);
                    cols.push(c);
                    vals.push(columns[r].w[lx] * v * columns[c].w[ly]);
                }
            }
        }
    };
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            let v = k.values[p];
            place(i, j, v);
            if i != j { place(j, i, v); }
        }
    }
    CscMatrix::from_triplets(columns.len(), &rows, &cols, &vals)
}

fn norm(x: &[f64]) -> f64 { x.iter().map(|a| a * a).sum::<f64>().sqrt() }

fn dot(a: &[f64], b: &[f64]) -> f64 { a.iter().zip(b).map(|(x, y)| x * y).sum() }

fn start(m: usize) -> Vec<f64> {
    let x: Vec<f64> = (0..m).map(|i| 1.0 + ((i * 7919) % 101) as f64 / 101.0).collect();
    let nx = norm(&x);
    x.into_iter().map(|a| a / nx).collect()
}

fn spectrum(s: &CscMatrix) -> (f64, Option<Vec<f64>>) {
    let m = s.n;
    let mut x = start(m);
    let mut lmax = 0.0f64;
    for _ in 0..500 {
        let y = s.sym_mat_vec(&x);
        let est = dot(&x, &y);
        let ny = norm(&y);
        if !ny.is_finite() || ny <= 0.0 { break; }
        x = y.into_iter().map(|a| a / ny).collect();
        let done = (est - lmax).abs() <= 1e-9 * est.abs();
        lmax = est;
        if done { break; }
    }
    let sym = Rc::new(symbolic_cholesky(s));
    let Some(factor) = numeric_cholesky(&sym, s) else { return (f64::INFINITY, None) };
    let mut x = start(m);
    let mut lmin = f64::INFINITY;
    for _ in 0..500 {
        let y = sparse_cholesky_solve(&factor, &x);
        let ny = norm(&y);
        if !ny.is_finite() || ny <= 0.0 { return (f64::INFINITY, Some(x)); }
        let z: Vec<f64> = y.into_iter().map(|a| a / ny).collect();
        let est = dot(&z, &s.sym_mat_vec(&z));
        let done = (est - lmin).abs() <= 1e-9 * est.abs();
        lmin = est;
        x = z;
        if done { break; }
    }
    if lmin.is_nan() || lmin <= 0.0 { return (f64::INFINITY, Some(x)); }
    (lmax.max(lmin) / lmin, Some(x))
}

fn mode_nodes(x: &[f64], columns: &[Column], groups: &[((usize, DofKind), Vec<usize>)]) -> Vec<usize> {
    let mut by_node: BTreeMap<usize, f64> = BTreeMap::new();
    for (c, col) in columns.iter().enumerate() {
        *by_node.entry(groups[col.group].0 .0).or_insert(0.0) += x[c] * x[c];
    }
    let top = by_node.values().copied().fold(0.0f64, f64::max);
    by_node.into_iter().filter(|&(_, v)| v >= 0.01 * top).map(|(n, _)| n).collect()
}

fn without_springs(asm: &crate::solver::assembly::AssemblyResult) -> Vec<f64> {
    let n = (asm.k.len() as f64).sqrt().round() as usize;
    let mut k = asm.k.clone();
    for (d, s) in crate::solver::assembly::artificial_stiffness_entries(asm) {
        k[d * n + d] -= s;
    }
    k
}

fn reduced(k: &[f64], dof: &DofNumbering, tags: Vec<DofTag>, ct: Option<crate::solver::constraints::ConstraintTransform>) -> (Vec<f64>, usize, Vec<DofTag>) {
    let n = dof.n_total;
    let nf = dof.n_free;
    let (k, size, idx, tag_of): (Vec<f64>, usize, Vec<usize>, Vec<usize>) = match ct {
        None => (k.to_vec(), n, (0..nf).collect(), (0..nf).collect()),
        Some(ct) => {
            let idx: Vec<usize> = (0..ct.n_independent).filter(|&j| ct.independent_dofs[j] < nf).collect();
            let tag_of = idx.iter().map(|&j| ct.independent_dofs[j]).collect();
            (ct.c.reduce_dense(k), ct.n_independent, idx, tag_of)
        }
    };
    let m = idx.len();
    let mut out = vec![0.0; m * m];
    for (a, &i) in idx.iter().enumerate() {
        for (b, &j) in idx.iter().enumerate() { out[a * m + b] = k[i * size + j]; }
    }
    (out, m, tag_of.into_iter().map(|d| tags[d]).collect())
}

pub fn of_2d(input: &SolverInput) -> Result<Stability, String> {
    use crate::solver::constraints::{build_constraint_transform, inclined_dofs_2d};
    let dof = DofNumbering::build_2d(input);
    let asm = crate::solver::assembly::assemble_2d(input, &dof);
    let ct = if input.constraints.is_empty() { None } else {
        Some(build_constraint_transform(&input.constraints, &dof, Some(&input.nodes), None, &inclined_dofs_2d(input, &dof))?)
    };
    let (k, m, t) = reduced(&without_springs(&asm), &dof, tags(&dof, true), ct);
    Ok(analyze_dense(&k, m, &t))
}

pub fn of_3d(input: &SolverInput3D) -> Result<Stability, String> {
    use crate::solver::constraints::{build_constraint_transform, inclined_dofs_3d};
    let input = &crate::solver::linear::expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let asm = crate::solver::assembly::assemble_3d(input, &dof);
    let ct = if input.constraints.is_empty() { None } else {
        Some(build_constraint_transform(&input.constraints, &dof, None, Some(&input.nodes), &inclined_dofs_3d(input, &dof))?)
    };
    let (k, m, t) = reduced(&without_springs(&asm), &dof, tags(&dof, false), ct);
    Ok(analyze_dense(&k, m, &t))
}
