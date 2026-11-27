//! Adapter from element assembly to the shared nonlinear controllers.
//! Models supply work-conjugate, consistently scaled DOFs and forces. This layer
//! owns iteration checkpoints, tangent solves and accepted equilibrium snapshots.
use super::incremental::{self, IncrementalProblem, Linearization};
use super::total_lagrangian::{ArcControl, LoadControl};
use crate::linalg::CscMatrix;
use crate::solver::path_following::{self, ArcLengthProblem, PathProblem, PathResponseError};
use crate::solver::sparse_tangent::{solve_tangent_sparse, SparseSymbolicCache};
use crate::solver::stability::{self, DofTag};

pub(super) struct Assembly<E> {
    pub tangent: Vec<f64>,
    pub residual: Vec<f64>,
    pub measure: f64,
    pub equilibrium: E,
}

pub(super) trait Model {
    type Equilibrium: Clone;
    fn reference(&self) -> &[f64];
    fn tags(&self) -> Vec<DofTag>;
    fn assemble(&self, u: &[f64], lambda: f64) -> Result<Assembly<Self::Equilibrium>, String>;
}

pub(super) struct Path<E> {
    pub completed: bool,
    pub iterations: usize,
    pub last_equilibrium: E,
    pub steps: Vec<E>,
}

pub(super) fn controls(steps: usize, iterations: usize, tolerance: f64) -> Result<(), String> {
    if !(1..=1000).contains(&steps)
        || !(1..=1000).contains(&iterations)
        || !tolerance.is_finite()
        || tolerance <= 0.0
        || tolerance > 1e-3
    {
        return Err("Experimental element controls require 1..1000 steps/iterations and a finite tolerance in (0, 1e-3]".into());
    }
    Ok(())
}

pub(super) fn load<M: Model>(
    model: M,
    control: LoadControl,
) -> Result<Path<M::Equilibrium>, String> {
    controls(
        control.increments,
        control.max_iterations,
        control.tolerance,
    )?;
    incremental::validate(control.method)?;
    let mut problem = Problem::new(model)?;
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

pub(super) fn arc<M: Model>(model: M, control: ArcControl) -> Result<Path<M::Equilibrium>, String> {
    controls(control.steps, control.max_iterations, control.tolerance)?;
    let mut problem = Problem::new(model)?;
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

pub(super) struct Problem<M: Model> {
    pub model: M,
    pub u: Vec<f64>,
    accepted: Vec<f64>,
    pub lambda: f64,
    load_weight: f64,
    lagged: Option<Vec<f64>>,
    pub at: Assembly<M::Equilibrium>,
    failure: Option<String>,
    cache: Option<SparseSymbolicCache>,
    steps: Vec<M::Equilibrium>,
}

pub(super) fn norm(values: &[f64]) -> f64 {
    values.iter().fold(0.0, |a, b| a.hypot(*b))
}

impl<M: Model> Problem<M> {
    pub fn new(model: M) -> Result<Self, String> {
        let n = model.reference().len();
        let magnitude = norm(model.reference());
        if n == 0 || n > 240 || !magnitude.is_finite() || magnitude <= 0.0 {
            return Err("Experimental element model requires 1..240 free DOFs and a finite nonzero free load".into());
        }
        let u = vec![0.0; n];
        let at = model.assemble(&u, 0.0)?;
        let initial = stability::analyze_dense(&at.tangent, n, &model.tags());
        if let Some(reason) = initial.refusal() {
            return Err(reason);
        }
        // This adapter does not introduce artificial pins for free rotations.
        if !initial.free.is_empty() {
            return Err("Experimental element model has an unresolved free DOF".into());
        }
        if initial.needs_accuracy_check() {
            return Err(initial.conditioning_refusal());
        }
        Ok(Self {
            model,
            u,
            accepted: vec![0.0; n],
            lambda: 0.0,
            load_weight: 1.0,
            lagged: None,
            at,
            failure: None,
            cache: None,
            steps: Vec::new(),
        })
    }

    pub fn assemble(&mut self) -> Result<(), String> {
        self.at = self.model.assemble(&self.u, self.lambda)?;
        Ok(())
    }

    pub fn solve(&mut self, rhs: &[f64], lagged: bool) -> Result<Vec<f64>, String> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        let k = if lagged {
            self.lagged.get_or_insert_with(|| self.at.tangent.clone())
        } else {
            &self.at.tangent
        };
        let scale = k.iter().fold(0.0_f64, |a, v| a.max(v.abs()));
        if !scale.is_finite() || scale <= 0.0 {
            return Err("Singular experimental element tangent".into());
        }
        let scaled: Vec<_> = k.iter().map(|v| v / scale).collect();
        let rhs: Vec<_> = rhs.iter().map(|v| v / scale).collect();
        if rhs.iter().any(|v| !v.is_finite()) {
            return Err("Element tangent RHS exceeds the finite range".into());
        }
        let n = rhs.len();
        let matrix = CscMatrix::from_dense_symmetric(&scaled, n);
        let step = solve_tangent_sparse(&matrix, &rhs, &mut self.cache)?;
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
                return Err("Experimental element tangent solve failed its residual check".into());
            }
        }
        Ok(step)
    }

    pub fn accept(&mut self) {
        self.accepted.copy_from_slice(&self.u);
        self.steps.push(self.at.equilibrium.clone());
    }

    fn finish(
        mut self,
        completed: bool,
        iterations: usize,
        lambda: f64,
    ) -> Result<Path<M::Equilibrium>, String> {
        self.lambda = lambda;
        self.assemble()?;
        Ok(Path {
            completed,
            iterations,
            last_equilibrium: self.at.equilibrium,
            steps: self.steps,
        })
    }
}

impl<M: Model> IncrementalProblem for Problem<M> {
    fn begin_increment(&mut self, load_factor: f64) {
        self.lambda = load_factor;
        self.lagged = None;
    }
    fn linearize(&mut self) -> Result<Linearization, String> {
        self.assemble()?;
        Ok(Linearization {
            measure: self.at.measure,
            forced: false,
        })
    }
    fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String> {
        self.solve(&self.at.residual.clone(), lag_tangent)
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
        self.at.residual.iter().zip(step).map(|(r, d)| r * d).sum()
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

impl<M: Model> PathProblem for Problem<M> {
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
            self.at.measure
        }
    }
    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), PathResponseError> {
        if let Some(error) = &self.failure {
            return Err(PathResponseError::InvalidState(error.clone()));
        }
        let residual = self
            .solve(&self.at.residual.clone(), false)
            .map_err(PathResponseError::Numerical)?;
        // Own the RHS while solve mutates the factorization cache in self.
        let reference_rhs = self.model.reference().to_vec();
        let reference = self
            .solve(&reference_rhs, false)
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

impl<M: Model> ArcLengthProblem for Problem<M> {
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
        let reference = self.model.reference().to_vec();
        self.solve(&reference, false)
    }
}
