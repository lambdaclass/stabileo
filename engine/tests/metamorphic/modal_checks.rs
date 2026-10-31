//! Modal invariants: mass orthogonality of the mode shapes and the effective
//! masses recomputed from the assembled mass matrix. The participation is
//! φᵀ(M·r)_f with r the rigid-body influence over EVERY DOF, supports included
//! (#434: the inertia the consistent mass couples to the moving supports), so
//! each mode's mass is (φᵀMι)²/(φᵀMφ), their sum is bounded by the total mass
//! ιᵀMι, and with every mode computed it equals (M·r)_fᵀ·M_ff⁻¹·(M·r)_f.
//!
//! Tolerance: the eigensolver stops at a relative residual τ = 1e-10
//! (linalg/lanczos.rs); an eigenvector's error is then ≲ τ / relgap, with
//! relgap its relative distance to the nearest other eigenvalue, so the
//! M-inner product of two computed modes can be off by 2τ/min(relgap) (plus
//! the conditioning round-off). Pairs closer than 1e-6 apart span a
//! numerically degenerate subspace and are skipped.

use crate::tally::Verdict;
use dedaliano_engine::metamorphic::conditioning::Conditioning;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::mass_matrix::{assemble_mass_matrix_2d, assemble_mass_matrix_3d};
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const TAU: f64 = 1e-10;

struct Modes {
    phi: Vec<Vec<f64>>,
    omega2: Vec<f64>,
    meff: Vec<Vec<f64>>, // per mode, per direction
}

fn check(m: &[f64], n: usize, nf: usize, modes: &Modes, dirs: &[Vec<f64>], all_modes: bool, cond: &Conditioning) -> Verdict {
    let mv = |a: &[f64], b: &[f64]| -> f64 {
        let mut s = 0.0;
        for i in 0..n {
            if a[i] == 0.0 {
                continue;
            }
            let row = &m[i * n..i * n + n];
            s += a[i] * row.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
        }
        s
    };
    let k = modes.phi.len();
    let mm: Vec<f64> = modes.phi.iter().map(|p| mv(p, p)).collect();
    let base = cond.rel();
    let mut worst: f64 = 0.0;
    for i in 0..k {
        let gap_i = (0..k).filter(|&j| j != i).map(|j| (modes.omega2[i] - modes.omega2[j]).abs() / modes.omega2[i].abs().max(1e-300)).fold(f64::INFINITY, f64::min);
        for j in (i + 1)..k {
            let gap_j = (0..k).filter(|&l| l != j).map(|l| (modes.omega2[j] - modes.omega2[l]).abs() / modes.omega2[j].abs().max(1e-300)).fold(f64::INFINITY, f64::min);
            let gap = gap_i.min(gap_j);
            if gap < 1e-6 && !crate::generated::strict() {
                continue;
            }
            let tol = if crate::generated::strict() { 100.0 * TAU } else { 2.0 * TAU / gap + base };
            let o = mv(&modes.phi[i], &modes.phi[j]).abs() / (mm[i] * mm[j]).sqrt();
            if !(o <= tol) {
                return Verdict::Fail(format!("modes {i} and {j} not M-orthogonal: φᵢᵀMφⱼ/√(mᵢmⱼ) = {o:.3e} > {tol:.3e}"));
            }
            worst = worst.max(o / tol);
        }
    }
    // Effective masses from M: (φᵀMι)²/(φᵀMφ), against the reported ones.
    let tol_m = 2.0 * TAU + base;
    for (d, iota) in dirs.iter().enumerate() {
        let free_mass = mv(iota, iota); // ιᵀMι, the total mass in this direction
        if free_mass <= 0.0 {
            continue;
        }
        let mut sum = 0.0;
        for i in 0..k {
            let l = mv(&modes.phi[i], iota);
            let me = l * l / mm[i];
            sum += me;
            let rep = modes.meff[i][d];
            if !((me - rep).abs() <= tol_m * free_mass) {
                return Verdict::Fail(format!("mode {i}: effective mass {rep:.10e} reported, {me:.10e} from M (direction {d})"));
            }
        }
        if !(sum <= free_mass * (1.0 + tol_m)) {
            return Verdict::Fail(format!("Σ effective mass {sum:.10e} exceeds the total mass {free_mass:.10e} (direction {d})"));
        }
        if all_modes {
            // (M·r)_fᵀ·M_ff⁻¹·(M·r)_f, by a dense solve (all_modes only for small models).
            let mr: Vec<f64> = (0..nf).map(|i| (0..n).map(|j| m[i * n + j] * iota[j]).sum()).collect();
            let mut a: Vec<f64> = (0..nf).flat_map(|i| (0..nf).map(move |j| (i, j))).map(|(i, j)| m[i * n + j]).collect();
            let mut x = mr.clone();
            for c in 0..nf {
                let piv = a[c * nf + c];
                if !(piv.abs() > 0.0) {
                    return Verdict::Unrepresentable("singular free mass block".into());
                }
                for r in (c + 1)..nf {
                    let f = a[r * nf + c] / piv;
                    if f != 0.0 {
                        for q in c..nf {
                            a[r * nf + q] -= f * a[c * nf + q];
                        }
                        x[r] -= f * x[c];
                    }
                }
            }
            for c in (0..nf).rev() {
                let mut v = x[c];
                for q in (c + 1)..nf {
                    v -= a[c * nf + q] * x[q];
                }
                x[c] = v / a[c * nf + c];
            }
            let target: f64 = mr.iter().zip(&x).map(|(u, v)| u * v).sum();
            if !((sum - target).abs() <= tol_m * k as f64 * free_mass) {
                return Verdict::Fail(format!("all {k} modes: Σ effective mass {sum:.10e} ≠ (M·r)ᵀM_ff⁻¹(M·r) = {target:.10e} (direction {d})"));
            }
        }
    }
    Verdict::Pass(worst)
}

pub fn check_2d(s: &SolverInput, dens: &HashMap<String, f64>, cond: &Conditioning) -> Verdict {
    if s.supports.values().any(|x| x.support_type == "inclinedRoller") {
        return Verdict::Unrepresentable("mass matrix in inclined frames".into());
    }
    let dof = DofNumbering::build_2d(s);
    let (n, nf) = (dof.n_total, dof.n_free);
    if nf == 0 || n > 1500 {
        return Verdict::NotApplicable;
    }
    let all = nf <= 40 && s.constraints.is_empty();
    let want = if all { nf } else { nf.min(12) };
    let r = match modal::solve_modal_2d(s, dens, want) {
        Ok(r) => r,
        Err(e) => return Verdict::Refused(e),
    };
    let all = all && r.modes.len() == nf;
    let m = assemble_mass_matrix_2d(s, &dof, dens);
    let mut phi = Vec::new();
    for md in &r.modes {
        let mut v = vec![0.0; n];
        for d in &md.displacements {
            for (k, val) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                if let Some(i) = dof.global_dof(d.node_id, k) {
                    v[i] = val;
                }
            }
        }
        phi.push(v);
    }
    let dirs: Vec<Vec<f64>> = (0..2)
        .map(|k| {
            let mut v = vec![0.0; n];
            for nd in s.nodes.values() {
                // Every DOF, supports included (the support-coupled mass, #434).
                if let Some(i) = dof.global_dof(nd.id, k) {
                    v[i] = 1.0;
                }
            }
            v
        })
        .collect();
    let modes = Modes {
        phi,
        omega2: r.modes.iter().map(|m| m.omega * m.omega).collect(),
        meff: r.modes.iter().map(|m| vec![m.effective_mass_x, m.effective_mass_y]).collect(),
    };
    check(&m, n, nf, &modes, &dirs, all, cond)
}

pub fn check_3d(s: &SolverInput3D, dens: &HashMap<String, f64>, cond: &Conditioning) -> Verdict {
    if s.supports.values().any(|x| x.is_inclined.unwrap_or(false)) {
        return Verdict::Unrepresentable("mass matrix in inclined frames".into());
    }
    let s = &dedaliano_engine::solver::linear::expand_curved_beams_3d(s);
    let dof = DofNumbering::build_3d(s);
    let (n, nf) = (dof.n_total, dof.n_free);
    if nf == 0 || n > 1500 {
        return Verdict::NotApplicable;
    }
    let all = nf <= 40 && s.constraints.is_empty();
    let want = if all { nf } else { nf.min(12) };
    let r = match modal::solve_modal_3d(s, dens, want) {
        Ok(r) => r,
        Err(e) => return Verdict::Refused(e),
    };
    let all = all && r.modes.len() == nf;
    let m = assemble_mass_matrix_3d(s, &dof, dens);
    let mut phi = Vec::new();
    for md in &r.modes {
        let mut v = vec![0.0; n];
        for d in &md.displacements {
            for (k, val) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].into_iter().enumerate() {
                if let Some(i) = dof.global_dof(d.node_id, k) {
                    v[i] = val;
                }
            }
        }
        phi.push(v);
    }
    let dirs: Vec<Vec<f64>> = (0..3)
        .map(|k| {
            let mut v = vec![0.0; n];
            for nd in s.nodes.values() {
                // Every DOF, supports included (the support-coupled mass, #434).
                if let Some(i) = dof.global_dof(nd.id, k) {
                    v[i] = 1.0;
                }
            }
            v
        })
        .collect();
    let modes = Modes {
        phi,
        omega2: r.modes.iter().map(|m| m.omega * m.omega).collect(),
        meff: r.modes.iter().map(|m| vec![m.effective_mass_x, m.effective_mass_y, m.effective_mass_z]).collect(),
    };
    check(&m, n, nf, &modes, &dirs, all, cond)
}
