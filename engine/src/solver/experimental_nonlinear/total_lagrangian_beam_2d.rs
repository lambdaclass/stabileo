//! Experimental 2D beams using the same controller adapter as TL trusses.
//! Reference geometry may be a stress-free polygonal approximation of an initial
//! imperfection. Each element is initially straight. Nodal forces and couples are
//! dead loads; supports fix zero translations/rotation. No releases, follower
//! loads, distributed loads, plasticity, contact or stability certification.
//! Arc length uses [ux, uy, D*theta] and convergence uses [Fx, Fy, Mz/D], with
//! D the reference model diameter. Radii and load weight therefore have length
//! units; returned rotations and couples retain their physical units.

use super::discrete_problem::{self, norm, Assembly, Model};
pub use super::total_lagrangian::{ArcControl, LoadControl};
use crate::element::total_lagrangian_beam_2d::TotalLagrangianBeam2D;
use crate::solver::stability::{DofKind, DofTag};

#[derive(Debug, Clone)]
pub struct BeamMember2D {
    pub nodes: [usize; 2],
    pub young: f64,
    pub area: f64,
    pub inertia: f64,
    pub shear_rigidity: f64,
    pub half_depth: f64,
}

#[derive(Debug, Clone)]
pub struct BeamModel2D {
    pub positions: Vec<[f64; 2]>,
    /// ux, uy, theta at each node. Rotations are radians, counterclockwise positive.
    pub fixed: Vec<[bool; 3]>,
    /// Fx, Fy, Mz in ONE consistent unit system, e.g. N, N, N·m.
    pub loads: Vec<[f64; 3]>,
    pub members: Vec<BeamMember2D>,
}

#[derive(Debug, Clone)]
pub struct BeamEquilibrium2D {
    pub load_factor: f64,
    pub displacements: Vec<[f64; 3]>,
    /// Physical forces/couples at fixed DOFs; zero at free DOFs.
    pub reactions: Vec<[f64; 3]>,
    pub section_resultants: Vec<[f64; 3]>,
    pub section_strains: Vec<[f64; 3]>,
    pub energy: f64,
    pub relative_residual: f64,
}

#[derive(Debug, Clone)]
pub struct BeamPath2D {
    /// Requested steps completed. Equilibrium is NOT a stability verdict.
    pub completed: bool,
    pub iterations: usize,
    pub last_equilibrium: BeamEquilibrium2D,
    pub steps: Vec<BeamEquilibrium2D>,
}

pub fn solve_load_control(model: &BeamModel2D, control: LoadControl) -> Result<BeamPath2D, String> {
    discrete_problem::controls(
        control.increments,
        control.max_iterations,
        control.tolerance,
    )?;
    let result = discrete_problem::load(PreparedBeam::new(model)?, control)?;
    Ok(BeamPath2D {
        completed: result.completed,
        iterations: result.iterations,
        last_equilibrium: result.last_equilibrium,
        steps: result.steps,
    })
}

pub fn solve_arc_length(model: &BeamModel2D, control: ArcControl) -> Result<BeamPath2D, String> {
    discrete_problem::controls(control.steps, control.max_iterations, control.tolerance)?;
    let result = discrete_problem::arc(PreparedBeam::new(model)?, control)?;
    Ok(BeamPath2D {
        completed: result.completed,
        iterations: result.iterations,
        last_equilibrium: result.last_equilibrium,
        steps: result.steps,
    })
}

struct PreparedBeam<'a> {
    model: &'a BeamModel2D,
    elements: Vec<TotalLagrangianBeam2D>,
    free: Vec<usize>,
    equation: Vec<Option<usize>>,
    reference: Vec<f64>,
    /// q_theta = length*theta; f_theta = M/length. All solver DOFs have length units.
    length: f64,
}

impl<'a> PreparedBeam<'a> {
    fn new(model: &'a BeamModel2D) -> Result<Self, String> {
        let n = model.positions.len();
        if n == 0
            || n > 256
            || model.fixed.len() != n
            || model.loads.len() != n
            || model.members.is_empty()
            || model.members.len() > 4096
        {
            return Err(
                "Experimental beam needs 1..256 nodes, matching supports/loads and 1..4096 members"
                    .into(),
            );
        }
        if model
            .positions
            .iter()
            .flatten()
            .chain(model.loads.iter().flatten())
            .any(|v| !v.is_finite())
        {
            return Err("Experimental beam coordinates and loads must be finite".into());
        }
        // Model diameter: unlike a radius from node zero, this scale does not
        // change when nodes are renumbered. The experimental model is size-capped.
        let mut length = 0.0_f64;
        for (i, a) in model.positions.iter().enumerate() {
            for b in &model.positions[..i] {
                length = length.max((a[0] - b[0]).hypot(a[1] - b[1]));
            }
        }
        if !length.is_finite() || length <= 0.0 {
            return Err("Experimental beam requires a finite nonzero model length".into());
        }
        let mut elements = Vec::with_capacity(model.members.len());
        let mut attached = vec![false; n];
        for (i, m) in model.members.iter().enumerate() {
            let [a, b] = m.nodes;
            if a >= n || b >= n || a == b {
                return Err(format!("Beam member {i} has invalid node indices"));
            }
            attached[a] = true;
            attached[b] = true;
            elements.push(
                TotalLagrangianBeam2D::new(
                    [model.positions[a], model.positions[b]],
                    m.young,
                    m.area,
                    m.inertia,
                    m.shear_rigidity,
                    m.half_depth,
                )
                .map_err(|e| format!("Beam member {i}: {e}"))?,
            );
        }
        if attached.iter().any(|a| !a) {
            return Err("Experimental beam model contains an unattached node".into());
        }
        let free: Vec<_> = (0..3 * n).filter(|&i| !model.fixed[i / 3][i % 3]).collect();
        let mut reference = Vec::with_capacity(free.len());
        for &i in &free {
            let f = model.loads[i / 3][i % 3];
            let scaled = if i % 3 == 2 { f / length } else { f };
            if !scaled.is_finite() || (f != 0.0 && scaled == 0.0) {
                return Err(
                    "Experimental beam load scaling exceeds the representable range".into(),
                );
            }
            reference.push(scaled);
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
            length,
        })
    }
    fn weight(&self, i: usize) -> f64 {
        if i % 3 == 2 {
            self.length
        } else {
            1.0
        }
    }
}

impl Model for PreparedBeam<'_> {
    type Equilibrium = BeamEquilibrium2D;
    fn reference(&self) -> &[f64] {
        &self.reference
    }
    fn tags(&self) -> Vec<DofTag> {
        self.free
            .iter()
            .map(|&i| DofTag {
                node: i / 3,
                kind: if i % 3 == 2 {
                    DofKind::Rotation
                } else {
                    DofKind::Translation
                },
            })
            .collect()
    }
    fn assemble(&self, state: &[f64], lambda: f64) -> Result<Assembly<BeamEquilibrium2D>, String> {
        if !lambda.is_finite() || state.iter().any(|v| !v.is_finite()) {
            return Err("Experimental beam trial state exceeds the finite range".into());
        }
        let n = self.model.positions.len();
        let nf = self.free.len();
        let mut u = vec![[0.0; 3]; n];
        for (&i, &value) in self.free.iter().zip(state) {
            u[i / 3][i % 3] = value / self.weight(i);
        }
        let mut internal = vec![0.0; 3 * n];
        let mut tangent = vec![0.0; nf * nf];
        let mut energy = 0.0;
        let mut section_resultants = Vec::with_capacity(self.elements.len());
        let mut section_strains = Vec::with_capacity(self.elements.len());
        for (index, (element, member)) in self.elements.iter().zip(&self.model.members).enumerate()
        {
            let response = element
                .evaluate([u[member.nodes[0]], u[member.nodes[1]]])
                .map_err(|e| format!("Beam member {index}: {e}"))?;
            energy += response.energy;
            section_resultants.push(response.resultants);
            section_strains.push(response.strains);
            for i in 0..6 {
                let gi = 3 * member.nodes[i / 3] + i % 3;
                internal[gi] += response.internal[i];
                if let Some(row) = self.equation[gi] {
                    for j in 0..6 {
                        let gj = 3 * member.nodes[j / 3] + j % 3;
                        if let Some(col) = self.equation[gj] {
                            tangent[row * nf + col] +=
                                (response.tangent[6 * i + j] / self.weight(gi)) / self.weight(gj);
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
        let applied: Vec<_> = self
            .free
            .iter()
            .map(|&i| external[i] / self.weight(i))
            .collect();
        let resisting: Vec<_> = self
            .free
            .iter()
            .map(|&i| internal[i] / self.weight(i))
            .collect();
        let residual: Vec<_> = applied.iter().zip(&resisting).map(|(e, i)| e - i).collect();
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
            .chain(&applied)
            .chain(&resisting)
            .chain(u.iter().flatten())
            .chain(reactions.iter().flatten())
            .chain([&energy, &scale, &measure])
            .any(|v| !v.is_finite())
        {
            return Err("Experimental beam assembly exceeds the finite range".into());
        }
        Ok(Assembly {
            tangent,
            residual,
            measure,
            equilibrium: BeamEquilibrium2D {
                load_factor: lambda,
                displacements: u,
                reactions,
                section_resultants,
                section_strains,
                energy,
                relative_residual: measure,
            },
        })
    }
}

#[cfg(test)]
mod tests;
