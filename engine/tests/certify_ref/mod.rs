//! Double-double reference solutions for certificate honesty tests.
//!
//! The reference solves the same reduced f64 system the certificate is about
//! (K_FF u = f_F − K_FR u_R, the same assembly), by iterative refinement with
//! double-double residuals and a double-double solution, accurate to ~κ·ε².
#![allow(dead_code)]

use dedaliano_engine::linalg::{lu_apply, lu_factor, CscMatrix};
use dedaliano_engine::solver::assembly::{
    assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_stiffness_2d, assemble_stiffness_3d,
    assemble_stiffness_sparse_3d,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{expand_curved_beams_3d, SPARSE_THRESHOLD};
use dedaliano_engine::solver::sparse_assembly::{assemble_load_vector_sparse_3d, assemble_stiffness_sparse_2d};
use dedaliano_engine::types::*;
use std::collections::HashMap;

pub fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let s = a + b;
    let bb = s - a;
    (s, (a - (s - bb)) + (b - bb))
}

pub fn two_prod(a: f64, b: f64) -> (f64, f64) {
    let p = a * b;
    (p, a.mul_add(b, -p))
}

/// Compensated accumulator (Ogita–Rump–Oishi Sum2/Dot2).
#[derive(Default, Clone, Copy)]
pub struct Acc {
    s: f64,
    c: f64,
}

impl Acc {
    pub fn add(&mut self, x: f64) {
        let (s, e) = two_sum(self.s, x);
        self.s = s;
        self.c += e;
    }
    pub fn add_prod(&mut self, a: f64, b: f64) {
        let (p, e) = two_prod(a, b);
        self.add(p);
        self.c += e;
    }
    pub fn hi_lo(self) -> (f64, f64) {
        two_sum(self.s, self.c)
    }
}

/// Reduced system plus the DOF numbering and the solver's full ũ.
pub struct Reduced {
    pub dof: DofNumbering,
    pub k: Vec<f64>,
    pub n: usize,
    pub f_hi: Vec<f64>,
    pub f_lo: Vec<f64>,
    /// Full ũ (free DOFs first, then restrained).
    pub u_full: Vec<f64>,
}

fn reduce(dof: DofNumbering, k_full: &[f64], f: &[f64], u_full: Vec<f64>) -> Reduced {
    let (n, nf) = (dof.n_total, dof.n_free);
    let mut k = vec![0.0; nf * nf];
    let (mut f_hi, mut f_lo) = (vec![0.0; nf], vec![0.0; nf]);
    for i in 0..nf {
        k[i * nf..(i + 1) * nf].copy_from_slice(&k_full[i * n..i * n + nf]);
        let mut acc = Acc::default();
        acc.add(f[i]);
        for j in nf..n {
            acc.add_prod(-k_full[i * n + j], u_full[j]);
        }
        (f_hi[i], f_lo[i]) = acc.hi_lo();
    }
    Reduced { dof, k, n: nf, f_hi, f_lo, u_full }
}

pub fn dense_from_lower(a: &CscMatrix) -> Vec<f64> {
    let n = a.n;
    let mut d = vec![0.0; n * n];
    for j in 0..n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[p];
            d[i * n + j] = a.values[p];
            d[j * n + i] = a.values[p];
        }
    }
    d
}

pub fn gather_2d(dof: &DofNumbering, res: &AnalysisResults) -> Vec<f64> {
    let d: HashMap<usize, &Displacement> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u[g] = [x.ux, x.uz, x.ry][l];
    }
    u
}

pub fn gather_3d(dof: &DofNumbering, res: &AnalysisResults3D) -> Vec<f64> {
    let d: HashMap<usize, &Displacement3D> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u[g] = [x.ux, x.uy, x.uz, x.rx, x.ry, x.rz, x.warping.unwrap_or(0.0)][l];
    }
    u
}

/// Reduced system for `input` with loads `loads` and the solver's results.
pub fn reduced_2d(input: &SolverInput, loads: &[SolverLoad], res: &AnalysisResults) -> Reduced {
    let dof = DofNumbering::build_2d(input);
    let (k, f) = if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_2d(input, &dof);
        let f = assemble_load_vector_2d(input, loads, &dof, &st.inclined_transforms_2d);
        (dense_from_lower(&st.k_full), f)
    } else {
        let st = assemble_stiffness_2d(input, &dof);
        let f = assemble_load_vector_2d(input, loads, &dof, &st.inclined_transforms_2d);
        (st.k, f)
    };
    let u = gather_2d(&dof, res);
    reduce(dof, &k, &f, u)
}

pub fn reduced_3d(input: &SolverInput3D, loads: &[SolverLoad3D], res: &AnalysisResults3D) -> Reduced {
    let input = &expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let (k, f) = if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_3d(input, &dof, true);
        let f = assemble_load_vector_sparse_3d(input, loads, &dof, &st.inclined_transforms);
        (dense_from_lower(st.k_full.as_ref().unwrap()), f)
    } else {
        let st = assemble_stiffness_3d(input, &dof);
        let f = assemble_load_vector_3d_dense(input, loads, &dof, &st.inclined_transforms);
        (st.k, f)
    };
    let u = gather_3d(&dof, res);
    reduce(dof, &k, &f, u)
}

/// Reference solution of the free DOFs as (hi, lo).
pub fn reference_solution(r: &Reduced) -> (Vec<f64>, Vec<f64>) {
    let n = r.n;
    let mut lu = r.k.clone();
    let piv = lu_factor(&mut lu, n).expect("reference LU");
    let mut xh = vec![0.0; n];
    let mut xl = vec![0.0; n];
    for _ in 0..30 {
        let mut res = vec![0.0; n];
        for i in 0..n {
            let mut acc = Acc::default();
            acc.add(r.f_hi[i]);
            acc.add(r.f_lo[i]);
            for j in 0..n {
                let kij = r.k[i * n + j];
                acc.add_prod(-kij, xh[j]);
                acc.add_prod(-kij, xl[j]);
            }
            res[i] = acc.hi_lo().0;
        }
        let d = lu_apply(&lu, &piv, &res, n).expect("reference solve");
        for i in 0..n {
            let (s, e) = two_sum(xh[i], d[i]);
            (xh[i], xl[i]) = two_sum(s, xl[i] + e);
        }
    }
    (xh, xl)
}
