//! Experimental elastic trusses on the existing nonlinear controllers.
//!
//! Nodal dead loads and zero prescribed translations only. All inputs use ONE
//! consistent unit system (e.g. m, N, Pa, m²); no conversion from UI units occurs.
//! No automatic conversion of frame/shell models, material plasticity, member
//! flexural buckling, or stability certification of the returned path.

use super::discrete_problem::{self, norm, Assembly, Model};
use super::{IterationMethod, LoadStepping};
use crate::element::total_lagrangian_truss::TotalLagrangianTruss;
use crate::solver::stability::{DofKind, DofTag};

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

pub fn solve_load_control(model: &TrussModel, control: LoadControl) -> Result<TrussPath, String> {
    discrete_problem::controls(
        control.increments,
        control.max_iterations,
        control.tolerance,
    )?;
    let result = discrete_problem::load(PreparedTruss::new(model)?, control)?;
    Ok(TrussPath {
        completed: result.completed,
        iterations: result.iterations,
        last_equilibrium: result.last_equilibrium,
        steps: result.steps,
    })
}

pub fn solve_arc_length(model: &TrussModel, control: ArcControl) -> Result<TrussPath, String> {
    discrete_problem::controls(control.steps, control.max_iterations, control.tolerance)?;
    let result = discrete_problem::arc(PreparedTruss::new(model)?, control)?;
    Ok(TrussPath {
        completed: result.completed,
        iterations: result.iterations,
        last_equilibrium: result.last_equilibrium,
        steps: result.steps,
    })
}

struct PreparedTruss<'a> {
    model: &'a TrussModel,
    elements: Vec<TotalLagrangianTruss>,
    free: Vec<usize>,
    equation: Vec<Option<usize>>,
    reference: Vec<f64>,
}

impl<'a> PreparedTruss<'a> {
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
        Ok(Self {
            model,
            elements,
            free,
            equation,
            reference,
        })
    }
}

impl Model for PreparedTruss<'_> {
    type Equilibrium = TrussEquilibrium;
    fn reference(&self) -> &[f64] {
        &self.reference
    }
    fn tags(&self) -> Vec<DofTag> {
        self.free
            .iter()
            .map(|i| DofTag {
                node: i / 3,
                kind: DofKind::Translation,
            })
            .collect()
    }
    fn assemble(&self, state: &[f64], lambda: f64) -> Result<Assembly<TrussEquilibrium>, String> {
        if !lambda.is_finite() || state.iter().any(|u| !u.is_finite()) {
            return Err("Experimental truss trial state exceeds the finite range".into());
        }
        let n = self.model.positions.len();
        let nf = self.free.len();
        let mut u = vec![[0.0; 3]; n];
        for (&i, &value) in self.free.iter().zip(state) {
            u[i / 3][i % 3] = value;
        }
        let mut internal = vec![0.0; 3 * n];
        let mut tangent = vec![0.0; nf * nf];
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
                            tangent[row * nf + col] += response.tangent[i * 6 + j];
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
            .map(|f| lambda * f)
            .collect();
        let mut reactions = vec![[0.0; 3]; n];
        for i in 0..3 * n {
            if self.model.fixed[i / 3][i % 3] {
                reactions[i / 3][i % 3] = internal[i] - external[i];
            }
        }
        let residual: Vec<f64> = self
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
            norm(&residual) / scale
        };
        if internal
            .iter()
            .chain(&external)
            .chain(&tangent)
            .chain(&residual)
            .chain(reactions.iter().flatten())
            .chain([&energy, &scale, &measure])
            .any(|x| !x.is_finite())
        {
            return Err("Experimental truss assembly exceeds the finite range".into());
        }
        let equilibrium = TrussEquilibrium {
            load_factor: lambda,
            displacements: u,
            reactions,
            axial_forces,
            energy,
            relative_residual: measure,
        };
        Ok(Assembly {
            tangent,
            residual,
            measure,
            equilibrium,
        })
    }
}

#[cfg(test)]
mod tests;
