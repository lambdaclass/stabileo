//! Adapted from phasefield-jr-py, © 2025 Nathan Shauer (MIT).
//! See ../LICENSE-phasefield-jr-py for the complete upstream notice.
//!
//! Alternating (staggered) solution of the displacement and damage problems at each load step,
//! following the loop of the reference code: assemble elasticity with the current damage; after
//! the first pass, stop when the elasticity residual norm is below the tolerance; otherwise solve
//! for displacement, then for damage.

use std::rc::Rc;

use dedaliano_engine::linalg::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky, CscMatrix, SymbolicCholesky};
use serde::Serialize;

use crate::fe;
use crate::model::{Irreversibility, Problem};

/// A fixed sparsity pattern (lower triangle, CSC) with, for each element, the value slot of each
/// local (i, j) pair with global row >= global column.
struct Pattern {
    matrix: CscMatrix,
    slots: Vec<Vec<usize>>,
    symbolic: Rc<SymbolicCholesky>,
}

impl Pattern {
    fn new(n: usize, elements: &[[usize; 4]], per_node: usize) -> Pattern {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let dofs = |e: &[usize; 4]| -> Vec<usize> { e.iter().flat_map(|&a| (0..per_node).map(move |k| per_node * a + k)).collect() };
        for e in elements {
            let d = dofs(e);
            for &r in &d {
                for &c in &d {
                    if r >= c {
                        rows.push(r);
                        cols.push(c);
                    }
                }
            }
        }
        let vals = vec![1.0; rows.len()];
        let mut matrix = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let slots = elements
            .iter()
            .map(|e| {
                let d = dofs(e);
                let m = d.len();
                let mut s = vec![usize::MAX; m * m];
                for i in 0..m {
                    for j in 0..m {
                        let (r, c) = (d[i], d[j]);
                        if r >= c {
                            let lo = matrix.col_ptr[c];
                            let hi = matrix.col_ptr[c + 1];
                            let k = matrix.row_idx[lo..hi].binary_search(&r).expect("pattern entry");
                            s[i * m + j] = lo + k;
                        }
                    }
                }
                s
            })
            .collect();
        let symbolic = Rc::new(symbolic_cholesky(&matrix));
        matrix.values.iter_mut().for_each(|v| *v = 0.0);
        Pattern { matrix, slots, symbolic }
    }

    fn zero(&mut self) {
        self.matrix.values.iter_mut().for_each(|v| *v = 0.0);
    }

    fn add(&mut self, e: usize, local: &[f64]) {
        for (idx, &slot) in self.slots[e].iter().enumerate() {
            if slot != usize::MAX {
                self.matrix.values[slot] += local[idx];
            }
        }
    }

    fn solve(&self, rhs: &[f64]) -> Result<Vec<f64>, String> {
        let f = numeric_cholesky(&self.symbolic, &self.matrix).ok_or("matrix is not positive definite")?;
        Ok(sparse_cholesky_solve(&f, rhs))
    }
}

/// Replace constrained rows and columns by the identity and move their known values to the
/// right-hand side, as the reference's applyBoundaryConditions does.
fn apply_dirichlet(m: &mut CscMatrix, rhs: &mut [f64], fixed: &[Option<f64>]) {
    for c in 0..m.n {
        for p in m.col_ptr[c]..m.col_ptr[c + 1] {
            let r = m.row_idx[p];
            let v = m.values[p];
            match (fixed[r], fixed[c]) {
                (None, Some(uc)) => rhs[r] -= v * uc,
                (Some(ur), None) => rhs[c] -= v * ur,
                _ => {}
            }
        }
    }
    for c in 0..m.n {
        for p in m.col_ptr[c]..m.col_ptr[c + 1] {
            let r = m.row_idx[p];
            if fixed[r].is_some() || fixed[c].is_some() {
                m.values[p] = if r == c { 1.0 } else { 0.0 };
            }
        }
        if let Some(u) = fixed[c] {
            rhs[c] = u;
        }
    }
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

#[derive(Debug, Clone, Serialize)]
pub struct StepResult {
    pub step: usize,
    pub pseudotime: f64,
    pub displacement: f64,
    pub reaction: f64,
    pub iterations: usize,
    pub converged: bool,
    pub residual: f64,
    pub damage_max: f64,
    pub damage_min: f64,
    pub elastic_energy: f64,
    pub fracture_energy: f64,
}

pub struct Solver {
    pub problem: Problem,
    pub u: Vec<f64>,
    pub d: Vec<f64>,
    history: Vec<[f64; 4]>,
    failed: bool,
    pub pseudotime: f64,
    pub step: usize,
    elastic: Pattern,
    damage: Pattern,
    coords: Vec<[[f64; 2]; 4]>,
}

impl Solver {
    pub fn new(problem: Problem) -> Result<Solver, String> {
        problem.material.validate()?;
        let c = &problem.controls;
        if !([c.dt, c.total_time, c.tolerance].iter().all(|v| v.is_finite() && *v > 0.0) && c.max_iterations > 0) {
            return Err("controls: need finite positive dt, total_time, tolerance, max_iterations > 0".into());
        }
        let n = problem.mesh.n_nodes();
        for bc in &problem.dirichlet {
            if bc.dof >= 2 * n {
                return Err(format!("Dirichlet dof {} out of range", bc.dof));
            }
        }
        let coords = problem
            .mesh
            .elements
            .iter()
            .map(|e| [problem.mesh.nodes[e[0]], problem.mesh.nodes[e[1]], problem.mesh.nodes[e[2]], problem.mesh.nodes[e[3]]])
            .collect::<Vec<_>>();
        let elastic = Pattern::new(2 * n, &problem.mesh.elements, 2);
        let damage = Pattern::new(n, &problem.mesh.elements, 1);
        let ne = problem.mesh.elements.len();
        Ok(Solver { u: vec![0.0; 2 * n], d: vec![0.0; n], history: vec![[0.0; 4]; ne], failed: false, pseudotime: 0.0, step: 0, elastic, damage, coords, problem })
    }

    fn element_u(&self, e: usize) -> [f64; 8] {
        let el = &self.problem.mesh.elements[e];
        let mut ue = [0.0; 8];
        for a in 0..4 {
            ue[2 * a] = self.u[2 * el[a]];
            ue[2 * a + 1] = self.u[2 * el[a] + 1];
        }
        ue
    }

    fn element_d(&self, e: usize) -> [f64; 4] {
        let el = &self.problem.mesh.elements[e];
        [self.d[el[0]], self.d[el[1]], self.d[el[2]], self.d[el[3]]]
    }

    fn psi_plus_qp(&self, e: usize) -> Result<[f64; 4], String> {
        let ue = self.element_u(e);
        let mut out = [0.0; 4];
        for (q, &(xi, eta, _)) in fe::GAUSS.iter().enumerate() {
            let (_, dn) = fe::shape(xi, eta);
            let (g, _) = fe::gradients(&self.coords[e], &dn, self.problem.aligned)?;
            out[q] = fe::psi_plus(&self.problem.material, &fe::strain(&g, &ue));
        }
        Ok(out)
    }

    fn assemble_elastic(&mut self) -> Result<(), String> {
        self.elastic.zero();
        for e in 0..self.coords.len() {
            let k = fe::elastic_stiffness(&self.problem.material, &self.coords[e], &self.element_d(e), self.problem.aligned)?;
            let flat: Vec<f64> = k.iter().flatten().copied().collect();
            self.elastic.add(e, &flat);
        }
        Ok(())
    }

    fn fixed(&self) -> Vec<Option<f64>> {
        let mut fixed = vec![None; self.u.len()];
        for bc in &self.problem.dirichlet {
            fixed[bc.dof] = Some(bc.value * self.pseudotime);
        }
        fixed
    }

    fn solve_damage(&mut self) -> Result<(), String> {
        self.damage.zero();
        let mut rhs = vec![0.0; self.d.len()];
        for e in 0..self.coords.len() {
            let mut h = self.psi_plus_qp(e)?;
            if self.problem.controls.irreversibility == Irreversibility::History {
                for q in 0..4 {
                    h[q] = h[q].max(self.history[e][q]);
                }
            }
            let (k, f) = fe::damage_system(&self.problem.material, &self.coords[e], &h, self.problem.aligned)?;
            let flat: Vec<f64> = k.iter().flatten().copied().collect();
            self.damage.add(e, &flat);
            let el = self.problem.mesh.elements[e];
            for a in 0..4 {
                rhs[el[a]] += f[a];
            }
        }
        self.d = self.damage.solve(&rhs)?;
        Ok(())
    }

    /// Internal force sign * sum (K(d) u) over the reaction dofs.
    pub fn reaction(&mut self) -> Result<f64, String> {
        self.assemble_elastic()?;
        let ku = self.elastic.matrix.sym_mat_vec(&self.u);
        Ok(self.problem.reaction_sign * self.problem.reaction_dofs.iter().map(|&i| ku[i]).sum::<f64>())
    }

    pub fn energies(&self) -> Result<(f64, f64), String> {
        let mat = &self.problem.material;
        let (mut elastic, mut fracture) = (0.0, 0.0);
        for e in 0..self.coords.len() {
            let ue = self.element_u(e);
            let de = self.element_d(e);
            for &(xi, eta, w) in fe::GAUSS.iter() {
                let (n, dn) = fe::shape(xi, eta);
                let (g, det) = fe::gradients(&self.coords[e], &dn, self.problem.aligned)?;
                let dq: f64 = (0..4).map(|a| n[a] * de[a]).sum();
                let gx: f64 = (0..4).map(|a| g[0][a] * de[a]).sum();
                let gy: f64 = (0..4).map(|a| g[1][a] * de[a]).sum();
                elastic += fe::degradation(dq) * fe::psi_total(mat, &fe::strain(&g, &ue)) * w * det;
                fracture += mat.gc * (dq * dq / (2.0 * mat.l0) + mat.l0 / 2.0 * (gx * gx + gy * gy)) * w * det;
            }
        }
        Ok((elastic, fracture))
    }

    /// Degraded stress and damage at the centre of element `e`.
    pub fn center_stress(&self, e: usize) -> Result<([f64; 3], f64), String> {
        let (n, dn) = fe::shape(0.0, 0.0);
        let (g, _) = fe::gradients(&self.coords[e], &dn, self.problem.aligned)?;
        let de = self.element_d(e);
        let d: f64 = (0..4).map(|a| n[a] * de[a]).sum();
        let s = fe::stress(&self.problem.material, &fe::strain(&g, &self.element_u(e)));
        let k = fe::degradation(d);
        Ok(([k * s[0], k * s[1], k * s[2]], d))
    }

    pub fn finished(&self) -> bool {
        self.failed || self.pseudotime + self.problem.controls.dt > self.problem.controls.total_time
    }

    /// Advance one load step. Returns None once the next pseudo time would exceed the total.
    pub fn advance(&mut self) -> Result<Option<StepResult>, String> {
        let next = self.pseudotime + self.problem.controls.dt;
        if self.failed || next > self.problem.controls.total_time {
            return Ok(None);
        }
        self.pseudotime = next;
        let max_it = self.problem.controls.max_iterations;
        let tol = self.problem.controls.tolerance;
        let mut iterations = max_it;
        let mut converged = false;
        let mut residual = f64::NAN;
        for it in 0..max_it {
            self.assemble_elastic()?;
            let fixed = self.fixed();
            let mut rhs = vec![0.0; self.u.len()];
            apply_dirichlet(&mut self.elastic.matrix, &mut rhs, &fixed);
            if it != 0 {
                let ku = self.elastic.matrix.sym_mat_vec(&self.u);
                let r: Vec<f64> = ku.iter().zip(&rhs).map(|(a, b)| a - b).collect();
                residual = norm(&r);
                if residual < tol {
                    iterations = it;
                    converged = true;
                    break;
                }
            }
            self.u = self.elastic.solve(&rhs)?;
            self.solve_damage()?;
        }
        if !converged {
            // The last solve changed u and d: report the residual of those returned fields.
            self.assemble_elastic()?;
            let mut rhs = vec![0.0; self.u.len()];
            let fixed = self.fixed();
            apply_dirichlet(&mut self.elastic.matrix, &mut rhs, &fixed);
            let ku = self.elastic.matrix.sym_mat_vec(&self.u);
            residual = norm(&ku.iter().zip(&rhs).map(|(a, b)| a - b).collect::<Vec<_>>());
        }
        converged = residual < tol;
        self.failed = !converged;
        if converged && self.problem.controls.irreversibility == Irreversibility::History {
            for e in 0..self.coords.len() {
                let p = self.psi_plus_qp(e)?;
                for q in 0..4 {
                    self.history[e][q] = self.history[e][q].max(p[q]);
                }
            }
        }
        let reaction = self.reaction()?;
        let (elastic_energy, fracture_energy) = self.energies()?;
        let result = StepResult {
            step: self.step,
            pseudotime: self.pseudotime,
            displacement: self.pseudotime * self.problem.reference_displacement,
            reaction,
            iterations,
            converged,
            residual,
            damage_max: self.d.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
            damage_min: self.d.iter().cloned().fold(f64::INFINITY, f64::min),
            elastic_energy,
            fracture_energy,
        };
        self.step += 1;
        Ok(Some(result))
    }

    pub fn run(&mut self, mut on_step: impl FnMut(&StepResult, &Solver)) -> Result<Vec<StepResult>, String> {
        let mut out = Vec::new();
        while let Some(s) = self.advance()? {
            on_step(&s, self);
            out.push(s);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::examples::bar_reference;

    #[test]
    fn negative_mixed_energy_cannot_lower_history_or_change_damage() {
        let mut problem = bar_reference();
        problem.material.e = 30.0;
        problem.material.nu = 0.2;
        problem.controls.irreversibility = Irreversibility::History;
        assert!((fe::psi_plus(&problem.material, &[0.001, -0.1, 0.0]) + 0.000296875).abs() < 1e-15);
        for initial in [0.0, 0.002] {
            let mut solver = Solver::new(problem.clone()).unwrap();
            solver.history.fill([initial; 4]);
            solver.solve_damage().unwrap();
            let baseline = solver.d.clone();
            for (i, [x, y]) in solver.problem.mesh.nodes.iter().enumerate() {
                solver.u[2 * i] = 0.001 * x;
                solver.u[2 * i + 1] = -0.1 * y;
            }
            for e in 0..solver.coords.len() {
                let p = solver.psi_plus_qp(e).unwrap();
                assert!(p.iter().all(|v| *v < 0.0));
            }
            solver.problem.dirichlet = solver.u.iter().enumerate().map(|(dof, &value)| crate::model::Dirichlet { dof, value }).collect();
            solver.problem.controls.dt = 1.0;
            solver.problem.controls.total_time = 2.0;
            assert!(solver.advance().unwrap().unwrap().converged);
            assert_eq!(solver.d, baseline);
            assert!(solver.history.iter().flatten().all(|h| *h == initial && *h >= 0.0));
        }
    }

    #[test]
    fn rejects_nonfinite_or_nonpositive_controls() {
        for value in [f64::INFINITY, f64::NEG_INFINITY, f64::NAN, 0.0, -1.0] {
            for control in 0..3 {
                let mut problem = bar_reference();
                match control {
                    0 => problem.controls.dt = value,
                    1 => problem.controls.total_time = value,
                    _ => problem.controls.tolerance = value,
                }
                assert!(Solver::new(problem).is_err(), "control {control}: {value}");
            }
        }
    }

    #[test]
    fn converges_on_final_permitted_iteration() {
        let mut unlimited = Solver::new(bar_reference()).unwrap();
        let expected = unlimited.advance().unwrap().unwrap();
        assert!(expected.converged);
        let mut problem = bar_reference();
        problem.controls.max_iterations = expected.iterations;
        let mut limited = Solver::new(problem).unwrap();
        let actual = limited.advance().unwrap().unwrap();
        assert!(actual.converged);
        assert_eq!(actual.iterations, expected.iterations);
        assert_eq!(actual.residual, expected.residual);
        assert_eq!(limited.u, unlimited.u);
        assert_eq!(limited.d, unlimited.d);
        assert!(limited.advance().unwrap().is_some());
    }

    #[test]
    fn failed_step_residual_describes_returned_fields() {
        for max_iterations in [1, 2] {
            let mut problem = bar_reference();
            problem.controls.max_iterations = max_iterations;
            problem.controls.tolerance = 1e-30;
            let mut solver = Solver::new(problem).unwrap();
            let step = solver.advance().unwrap().unwrap();
            assert!(!step.converged);
            assert!(step.residual.is_finite());
            solver.assemble_elastic().unwrap();
            let fixed = solver.fixed();
            let mut rhs = vec![0.0; solver.u.len()];
            apply_dirichlet(&mut solver.elastic.matrix, &mut rhs, &fixed);
            let ku = solver.elastic.matrix.sym_mat_vec(&solver.u);
            let expected = norm(&ku.iter().zip(&rhs).map(|(a, b)| a - b).collect::<Vec<_>>());
            assert_eq!(step.residual, expected);
        }
    }

    #[test]
    fn failed_step_does_not_commit_history_or_advance_on_unloading() {
        let mut problem = bar_reference();
        problem.controls.irreversibility = Irreversibility::History;
        problem.controls.max_iterations = 1;
        problem.controls.tolerance = 1e-30;
        let mut solver = Solver::new(problem).unwrap();
        let before = solver.history.clone();
        let step = solver.advance().unwrap().unwrap();
        assert!(!step.converged);
        assert!(solver.d.iter().any(|&v| v > 0.0));
        assert_eq!(solver.history, before);
        for bc in &mut solver.problem.dirichlet { bc.value = 0.0; }
        assert!(solver.finished());
        assert!(solver.advance().unwrap().is_none());
        // The rejected trial must not drive damage on unloading either.
        solver.u.fill(0.0);
        solver.solve_damage().unwrap();
        assert!(solver.d.iter().all(|v| v.abs() < 1e-12));
        assert_eq!(solver.history, before);
    }
}
