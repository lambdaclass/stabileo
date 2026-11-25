//! Experimental elastic trusses on the existing nonlinear controllers.
//!
//! Nodal dead loads and zero prescribed translations only. All inputs use ONE
//! consistent unit system (e.g. m, N, Pa, m²); no conversion from UI units occurs.
//! No automatic conversion of frame/shell models, material plasticity, member
//! flexural buckling, or stability certification of the returned path.

use super::incremental::{self, IncrementalProblem, Linearization};
use super::{IterationMethod, LoadStepping};
use crate::element::total_lagrangian_truss::TotalLagrangianTruss;
use crate::linalg::CscMatrix;
use crate::solver::path_following::{self, ArcLengthProblem, PathProblem, PathResponseError};
use crate::solver::sparse_tangent::{solve_tangent_sparse, SparseSymbolicCache};
use crate::solver::stability::{self, DofKind, DofTag};

#[derive(Debug, Clone)]
pub struct TrussMember {
    /// Zero-based node indices, not model IDs.
    pub nodes: [usize; 2],
    pub young: f64,
    pub area: f64,
}

#[derive(Debug, Clone)]
pub struct TrussModel {
    pub positions: Vec<[f64; 3]>,
    pub fixed: Vec<[bool; 3]>,
    /// Reference forces in global axes; multiplied by the path's load factor.
    pub loads: Vec<[f64; 3]>,
    pub members: Vec<TrussMember>,
}

#[derive(Debug, Clone, Copy)]
pub struct LoadControl {
    pub increments: usize,
    pub max_iterations: usize,
    pub tolerance: f64,
    pub method: IterationMethod,
    pub stepping: LoadStepping,
}

#[derive(Debug, Clone, Copy)]
pub struct ArcControl {
    pub steps: usize,
    pub max_iterations: usize,
    pub tolerance: f64,
    /// Radii and load weight have displacement units: ds² = du·du + (w dλ)².
    pub initial_radius: f64,
    pub min_radius: f64,
    pub max_radius: f64,
    pub load_weight: f64,
}

#[derive(Debug, Clone)]
pub struct TrussEquilibrium {
    pub load_factor: f64,
    pub displacements: Vec<[f64; 3]>,
    /// Internal minus external forces at fixed DOFs; zero at free DOFs.
    pub reactions: Vec<[f64; 3]>,
    pub axial_forces: Vec<f64>,
    pub energy: f64,
    pub relative_residual: f64,
}

#[derive(Debug, Clone)]
pub struct TrussPath {
    /// All requested increments/steps completed; this is NOT a stability verdict.
    pub completed: bool,
    pub iterations: usize,
    pub last_equilibrium: TrussEquilibrium,
    /// Accepted states only. A rejected step never appears here.
    pub steps: Vec<TrussEquilibrium>,
}

fn controls(steps: usize, iterations: usize, tolerance: f64) -> Result<(), String> {
    if !(1..=1000).contains(&steps)
        || !(1..=1000).contains(&iterations)
        || !tolerance.is_finite()
        || tolerance <= 0.0
        || tolerance > 1e-3
    {
        return Err("Experimental truss controls require 1..1000 steps/iterations and a finite tolerance in (0, 1e-3]".into());
    }
    Ok(())
}

pub fn solve_load_control(model: &TrussModel, control: LoadControl) -> Result<TrussPath, String> {
    controls(
        control.increments,
        control.max_iterations,
        control.tolerance,
    )?;
    incremental::validate(control.method)?;
    let mut problem = TrussProblem::new(model)?;
    let outcome = incremental::solve_stepped(
        &mut problem,
        control.method,
        control.stepping,
        control.increments,
        control.tolerance,
        control.max_iterations,
    )?;
    problem.finish(outcome.converged, outcome.iterations, outcome.load_factor)
}

pub fn solve_arc_length(model: &TrussModel, control: ArcControl) -> Result<TrussPath, String> {
    controls(control.steps, control.max_iterations, control.tolerance)?;
    let mut problem = TrussProblem::new(model)?;
    problem.load_weight = control.load_weight;
    let outcome = path_following::solve_by_arc_length(
        &mut problem,
        &path_following::ArcLengthControl {
            max_steps: control.steps,
            max_iter: control.max_iterations,
            tolerance: control.tolerance,
            initial_ds: control.initial_radius,
            min_ds: control.min_radius,
            max_ds: control.max_radius,
            target_iter: 6,
        },
    )?;
    problem.finish(outcome.converged, outcome.iterations, outcome.load_factor)
}

struct TrussProblem<'a> {
    model: &'a TrussModel,
    elements: Vec<TotalLagrangianTruss>,
    free: Vec<usize>,
    equation: Vec<Option<usize>>,
    reference: Vec<f64>,
    u: Vec<f64>,
    accepted: Vec<f64>,
    lambda: f64,
    load_weight: f64,
    tangent: Vec<f64>,
    lagged: Option<Vec<f64>>,
    residual: Vec<f64>,
    equilibrium: TrussEquilibrium,
    failure: Option<String>,
    cache: Option<SparseSymbolicCache>,
    steps: Vec<TrussEquilibrium>,
}

fn norm(values: &[f64]) -> f64 {
    values.iter().fold(0.0, |a, b| a.hypot(*b))
}

impl<'a> TrussProblem<'a> {
    fn new(model: &'a TrussModel) -> Result<Self, String> {
        let n = model.positions.len();
        // Bound dense assembly and stored path memory in this first experiment.
        if n == 0
            || n > 256
            || model.fixed.len() != n
            || model.loads.len() != n
            || model.members.is_empty()
            || model.members.len() > 4096
        {
            return Err("Experimental truss needs 1..256 nodes, matching supports/loads and 1..4096 members".into());
        }
        if model
            .positions
            .iter()
            .chain(&model.loads)
            .flatten()
            .any(|v| !v.is_finite())
        {
            return Err("Experimental truss coordinates and loads must be finite".into());
        }
        let mut elements = Vec::with_capacity(model.members.len());
        for (index, member) in model.members.iter().enumerate() {
            let [a, b] = member.nodes;
            if a >= n || b >= n || a == b {
                return Err(format!("Truss member {index} has invalid node indices"));
            }
            elements.push(
                TotalLagrangianTruss::new(
                    [model.positions[a], model.positions[b]],
                    member.young,
                    member.area,
                )
                .map_err(|e| format!("Truss member {index}: {e}"))?,
            );
        }
        let free: Vec<_> = (0..3 * n).filter(|&i| !model.fixed[i / 3][i % 3]).collect();
        let nf = free.len();
        if nf == 0 || nf > 240 {
            return Err("Experimental truss requires 1..240 free translations".into());
        }
        let reference: Vec<_> = free.iter().map(|&i| model.loads[i / 3][i % 3]).collect();
        let load_norm = norm(&reference);
        if !load_norm.is_finite() || load_norm <= 0.0 {
            return Err(
                "Experimental truss requires a finite nonzero load on free translations".into(),
            );
        }
        let mut equation = vec![None; 3 * n];
        for (j, &i) in free.iter().enumerate() {
            equation[i] = Some(j);
        }
        let mut problem = Self {
            model,
            elements,
            free,
            equation,
            reference,
            u: vec![0.0; nf],
            accepted: vec![0.0; nf],
            lambda: 0.0,
            load_weight: 1.0,
            tangent: vec![0.0; nf * nf],
            lagged: None,
            residual: vec![0.0; nf],
            failure: None,
            cache: None,
            steps: Vec::new(),
            equilibrium: TrussEquilibrium {
                load_factor: 0.0,
                displacements: vec![[0.0; 3]; n],
                reactions: vec![[0.0; 3]; n],
                axial_forces: Vec::new(),
                energy: 0.0,
                relative_residual: 0.0,
            },
        };
        problem.assemble()?;
        let tags: Vec<_> = problem
            .free
            .iter()
            .map(|i| DofTag {
                node: i / 3,
                kind: DofKind::Translation,
            })
            .collect();
        let initial = stability::analyze_dense(&problem.tangent, nf, &tags);
        if let Some(reason) = initial.refusal() {
            return Err(reason);
        }
        if initial.needs_accuracy_check() {
            return Err(initial.conditioning_refusal());
        }
        Ok(problem)
    }

    fn assemble(&mut self) -> Result<(), String> {
        if !self.lambda.is_finite() || self.u.iter().any(|u| !u.is_finite()) {
            return Err("Experimental truss trial state exceeds the finite range".into());
        }
        let n = self.model.positions.len();
        let nf = self.free.len();
        let mut u = vec![[0.0; 3]; n];
        for (&i, &value) in self.free.iter().zip(&self.u) {
            u[i / 3][i % 3] = value;
        }
        let mut internal = vec![0.0; 3 * n];
        self.tangent.fill(0.0);
        let mut energy = 0.0;
        let mut axial_forces = Vec::with_capacity(self.elements.len());
        for (index, (element, member)) in self.elements.iter().zip(&self.model.members).enumerate()
        {
            let [a, b] = member.nodes;
            let response = element
                .evaluate([u[a], u[b]])
                .map_err(|e| format!("Truss member {index}: {e}"))?;
            energy += response.energy;
            axial_forces.push(response.axial_force);
            for i in 0..6 {
                let gi = 3 * member.nodes[i / 3] + i % 3;
                internal[gi] += response.internal[i];
                if let Some(row) = self.equation[gi] {
                    for j in 0..6 {
                        if let Some(col) = self.equation[3 * member.nodes[j / 3] + j % 3] {
                            self.tangent[row * nf + col] += response.tangent[i * 6 + j];
                        }
                    }
                }
            }
        }
        let external: Vec<_> = self
            .model
            .loads
            .iter()
            .flatten()
            .map(|f| self.lambda * f)
            .collect();
        let mut reactions = vec![[0.0; 3]; n];
        for i in 0..3 * n {
            if self.model.fixed[i / 3][i % 3] {
                reactions[i / 3][i % 3] = internal[i] - external[i];
            }
        }
        self.residual = self
            .free
            .iter()
            .map(|&i| external[i] - internal[i])
            .collect();
        let applied: Vec<_> = self.free.iter().map(|&i| external[i]).collect();
        let resisting: Vec<_> = self.free.iter().map(|&i| internal[i]).collect();
        // Only free forces set the tolerance; a large reaction cannot hide an imbalance.
        let scale = norm(&applied).max(norm(&resisting));
        let measure = if scale == 0.0 {
            0.0
        } else {
            norm(&self.residual) / scale
        };
        if internal
            .iter()
            .chain(&external)
            .chain(&self.tangent)
            .chain(&self.residual)
            .chain(reactions.iter().flatten())
            .chain([&energy, &scale, &measure])
            .any(|x| !x.is_finite())
        {
            return Err("Experimental truss assembly exceeds the finite range".into());
        }
        self.equilibrium = TrussEquilibrium {
            load_factor: self.lambda,
            displacements: u,
            reactions,
            axial_forces,
            energy,
            relative_residual: measure,
        };
        Ok(())
    }

    fn solve(&mut self, rhs: &[f64], lagged: bool) -> Result<Vec<f64>, String> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        let k = if lagged {
            self.lagged.get_or_insert_with(|| self.tangent.clone())
        } else {
            &self.tangent
        };
        let scale = k.iter().fold(0.0_f64, |a, v| a.max(v.abs()));
        if !scale.is_finite() || scale <= 0.0 {
            return Err("Singular experimental truss tangent".into());
        }
        let scaled: Vec<_> = k.iter().map(|v| v / scale).collect();
        let rhs: Vec<_> = rhs.iter().map(|v| v / scale).collect();
        if rhs.iter().any(|v| !v.is_finite()) {
            return Err("Truss tangent RHS exceeds the finite range".into());
        }
        let n = rhs.len();
        let matrix = CscMatrix::from_dense_symmetric(&scaled, n);
        let step = solve_tangent_sparse(&matrix, &rhs, &mut self.cache)?;
        // Independent residual check also covers the indefinite LU fallback.
        for i in 0..n {
            let mut sum = 0.0;
            let mut bound = rhs[i].abs();
            for j in 0..n {
                let product = scaled[i * n + j] * step[j];
                sum += product;
                bound += product.abs();
            }
            let error = (sum - rhs[i]).abs();
            if !sum.is_finite()
                || !bound.is_finite()
                || !error.is_finite()
                || error > 1e-10 * bound
                || step.iter().any(|v| !v.is_finite())
            {
                return Err("Experimental truss tangent solve failed its residual check".into());
            }
        }
        Ok(step)
    }

    fn accept(&mut self) {
        self.accepted.copy_from_slice(&self.u);
        self.steps.push(self.equilibrium.clone());
    }

    fn finish(
        mut self,
        completed: bool,
        iterations: usize,
        lambda: f64,
    ) -> Result<TrussPath, String> {
        self.lambda = lambda;
        self.assemble()?;
        Ok(TrussPath {
            completed,
            iterations,
            last_equilibrium: self.equilibrium,
            steps: self.steps,
        })
    }
}

impl IncrementalProblem for TrussProblem<'_> {
    fn begin_increment(&mut self, load_factor: f64) {
        self.lambda = load_factor;
        self.lagged = None;
    }
    fn linearize(&mut self) -> Result<Linearization, String> {
        self.assemble()?;
        Ok(Linearization {
            measure: self.equilibrium.relative_residual,
            forced: false,
        })
    }
    fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String> {
        self.solve(&self.residual.clone(), lag_tangent)
    }
    fn advance(&mut self, step: &[f64]) {
        for (u, du) in self.u.iter_mut().zip(step) {
            *u += du;
        }
    }
    fn state(&self) -> Vec<f64> {
        self.u.clone()
    }
    fn work(&self, step: &[f64]) -> f64 {
        self.residual.iter().zip(step).map(|(r, d)| r * d).sum()
    }
    fn set_state(&mut self, state: &[f64]) {
        self.u.copy_from_slice(state);
    }
    fn commit(&mut self) -> Result<(), String> {
        self.accept();
        Ok(())
    }
    fn rollback(&mut self) {
        self.u.copy_from_slice(&self.accepted);
    }
}

impl PathProblem for TrussProblem<'_> {
    fn unknowns(&self) -> usize {
        self.u.len()
    }
    fn linearize_at(&mut self, load_factor: f64) {
        self.lambda = load_factor;
        self.failure = self.assemble().err();
    }
    fn measure(&mut self, _: f64) -> f64 {
        if self.failure.is_some() {
            f64::INFINITY
        } else {
            self.equilibrium.relative_residual
        }
    }
    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), PathResponseError> {
        if let Some(error) = &self.failure {
            return Err(PathResponseError::InvalidState(error.clone()));
        }
        let residual = self
            .solve(&self.residual.clone(), false)
            .map_err(PathResponseError::Numerical)?;
        let reference = self
            .solve(&self.reference.clone(), false)
            .map_err(PathResponseError::Numerical)?;
        Ok((residual, reference))
    }
    fn advance(&mut self, step: &[f64]) {
        IncrementalProblem::advance(self, step);
    }
    fn unknown(&self, index: usize) -> f64 {
        self.u[index]
    }
    fn record(&mut self, _: usize, _: f64, _: usize, _: bool) {
        self.accept();
    }
}

impl ArcLengthProblem for TrussProblem<'_> {
    fn load_weight(&self) -> f64 {
        self.load_weight
    }
    fn free_displacements(&self) -> &[f64] {
        &self.u
    }
    fn restore(&mut self, u: &[f64], lambda: f64) {
        self.u.copy_from_slice(u);
        self.lambda = lambda;
    }
    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        self.solve(&self.reference.clone(), false)
    }
}

#[cfg(test)]
mod tests;
