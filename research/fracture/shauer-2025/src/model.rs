use serde::{Deserialize, Serialize};

use crate::mesh::Mesh;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Plane {
    Stress,
    Strain,
}

/// Consistent units are the caller's: the reference examples use kN and mm (E in kN/mm^2,
/// Gc in kN/mm, l0 in mm).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Material {
    pub e: f64,
    pub nu: f64,
    pub gc: f64,
    pub l0: f64,
    pub plane: Plane,
}

impl Material {
    pub fn d_matrix(&self) -> [[f64; 3]; 3] {
        let (e, nu) = (self.e, self.nu);
        match self.plane {
            Plane::Stress => {
                let f = e / (1.0 - nu * nu);
                [[f, f * nu, 0.0], [f * nu, f, 0.0], [0.0, 0.0, f * (1.0 - nu) / 2.0]]
            }
            Plane::Strain => {
                let f = e / ((1.0 + nu) * (1.0 - 2.0 * nu));
                [[f * (1.0 - nu), f * nu, 0.0], [f * nu, f * (1.0 - nu), 0.0], [0.0, 0.0, f * (1.0 - 2.0 * nu) / 2.0]]
            }
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        let ok = self.e.is_finite() && self.e > 0.0
            && self.nu.is_finite() && self.nu > -1.0 && self.nu < 0.5
            && self.gc.is_finite() && self.gc > 0.0
            && self.l0.is_finite() && self.l0 > 0.0;
        if ok { Ok(()) } else { Err("material: need E > 0, -1 < nu < 0.5, Gc > 0, l0 > 0".into()) }
    }
}

/// How damage is kept from decreasing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Irreversibility {
    /// What the reference code does: the damage problem is driven by the current psi+, so damage
    /// can decrease if the strain energy drops.
    None,
    /// Miehe's history field H = max over converged steps of psi+ at each Gauss point. Not in
    /// the reference; offered as a documented alternative.
    History,
}

/// A prescribed displacement component, scaled by the pseudo time.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Dirichlet {
    pub dof: usize,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Controls {
    pub dt: f64,
    pub total_time: f64,
    pub max_iterations: usize,
    /// Absolute 2-norm of the elasticity residual (with the current damage) at which the
    /// alternating scheme stops, as in the reference.
    pub tolerance: f64,
    pub irreversibility: Irreversibility,
}

#[derive(Debug, Clone)]
pub struct Problem {
    pub mesh: Mesh,
    pub material: Material,
    pub dirichlet: Vec<Dirichlet>,
    /// Reaction = sign * sum of internal forces at these dofs.
    pub reaction_dofs: Vec<usize>,
    pub reaction_sign: f64,
    /// Imposed displacement at pseudo time 1, for the force-displacement curve.
    pub reference_displacement: f64,
    pub controls: Controls,
    pub aligned: bool,
}
