//! Adapted from phasefield-jr-py, © 2025 Nathan Shauer (MIT).
//! See ../LICENSE-phasefield-jr-py for the complete upstream notice.
//!
//! The three examples of the reference code, with its parameters as defaults.

use serde::{Deserialize, Serialize};

use crate::mesh::{self, NotchedSquare};
use crate::model::{Controls, Dirichlet, Irreversibility, Material, Plane, Problem};

/// Example 1: bar [0, 200] x [0, 20] pulled along x, plane stress. The imposed end displacement
/// at pseudo time 1 is the AT2 peak displacement 16/9 sigma_c L / E, with
/// sigma_c = sqrt(27 E Gc / (256 l0)).
pub fn bar(material: Material, controls: Controls) -> Problem {
    let (length, height) = (200.0, 20.0);
    let mesh = mesh::rectangle(100, 10, length, height);
    let sigma_c = (27.0 * material.e * material.gc / (256.0 * material.l0)).sqrt();
    let u_peak = 16.0 / 9.0 * sigma_c * length / material.e;
    let mut dirichlet = Vec::new();
    let mut reaction_dofs = Vec::new();
    for (i, &[x, _]) in mesh.nodes.iter().enumerate() {
        if x.abs() < 1e-8 {
            dirichlet.push(Dirichlet { dof: 2 * i, value: 0.0 });
            dirichlet.push(Dirichlet { dof: 2 * i + 1, value: 0.0 });
        } else if (x - length).abs() < 1e-8 {
            dirichlet.push(Dirichlet { dof: 2 * i, value: u_peak });
            reaction_dofs.push(2 * i);
        }
    }
    Problem { mesh, material, dirichlet, reaction_dofs, reaction_sign: 1.0, reference_displacement: u_peak, controls, aligned: true }
}

pub fn bar_reference() -> Problem {
    bar(
        Material { e: 30.0, nu: 0.2, gc: 1.2e-4, l0: 10.0, plane: Plane::Stress },
        Controls { dt: 0.02, total_time: 1.5, max_iterations: 600, tolerance: 1e-6, irreversibility: Irreversibility::None },
    )
}

/// Example 2: single-edge notched square under tension, plane strain. The bottom edge is fixed in
/// y (and its first node in x); the top edge moves up by `top_displacement` at pseudo time 1.
/// The reaction is the total vertical force on the bottom edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotchedPlate {
    pub material: Material,
    pub mesh: NotchedSquare,
    pub top_displacement: f64,
    pub controls: Controls,
}

impl NotchedPlate {
    pub fn reference() -> NotchedPlate {
        NotchedPlate {
            material: Material { e: 210.0, nu: 0.3, gc: 2.7e-3, l0: 0.0075, plane: Plane::Strain },
            mesh: NotchedSquare::REFERENCE,
            top_displacement: 0.01,
            controls: Controls { dt: 0.01, total_time: 0.8, max_iterations: 1000, tolerance: 1e-5, irreversibility: Irreversibility::None },
        }
    }

    pub fn problem(&self) -> Result<Problem, String> {
        self.mesh.validate()?;
        let mesh = self.mesh.build();
        let mut dirichlet = Vec::new();
        let mut reaction_dofs = Vec::new();
        let mut first = true;
        for (i, &[_, y]) in mesh.nodes.iter().enumerate() {
            if (y + 0.5).abs() < 1e-8 {
                if first {
                    dirichlet.push(Dirichlet { dof: 2 * i, value: 0.0 });
                    first = false;
                }
                dirichlet.push(Dirichlet { dof: 2 * i + 1, value: 0.0 });
                reaction_dofs.push(2 * i + 1);
            } else if (y - 0.5).abs() < 1e-8 {
                dirichlet.push(Dirichlet { dof: 2 * i + 1, value: self.top_displacement });
            }
        }
        Ok(Problem {
            mesh,
            material: self.material,
            dirichlet,
            reaction_dofs,
            reaction_sign: -1.0,
            reference_displacement: self.top_displacement,
            controls: self.controls.clone(),
            aligned: true,
        })
    }
}

/// Example 3: three-point bending of a notched beam, plane stress, supports at (+-4, 0), the
/// load imposed as a downward displacement of the top nodes with |x| <= 0.1.
pub fn three_point_bending_reference() -> Problem {
    let material = Material { e: 20.8, nu: 0.3, gc: 5.0e-4, l0: 0.03, plane: Plane::Stress };
    let controls = Controls { dt: 0.01, total_time: 1.0, max_iterations: 1000, tolerance: 1e-4, irreversibility: Irreversibility::None };
    let mesh = mesh::three_point_bending(14, 10);
    let height = 2.0;
    let imposed = -0.08;
    let mut dirichlet = Vec::new();
    let mut reaction_dofs = Vec::new();
    for (i, &[x, y]) in mesh.nodes.iter().enumerate() {
        if (x + 4.0).abs() < 1e-8 && y.abs() < 1e-8 {
            dirichlet.push(Dirichlet { dof: 2 * i, value: 0.0 });
            dirichlet.push(Dirichlet { dof: 2 * i + 1, value: 0.0 });
        }
        if (x - 4.0).abs() < 1e-8 && y.abs() < 1e-8 {
            dirichlet.push(Dirichlet { dof: 2 * i + 1, value: 0.0 });
        }
        if (y - height).abs() < 1e-8 && x.abs() < 0.1 + 1e-8 && x.abs() > -0.1 - 1e-8 {
            dirichlet.push(Dirichlet { dof: 2 * i + 1, value: imposed });
        }
        if ((x + 4.0).abs() < 1e-8 || (x - 4.0).abs() < 1e-8) && y.abs() < 1e-8 {
            reaction_dofs.push(2 * i + 1);
        }
    }
    Problem { mesh, material, dirichlet, reaction_dofs, reaction_sign: 1.0, reference_displacement: imposed.abs(), controls, aligned: true }
}
