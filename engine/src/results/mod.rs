mod displacement;
mod reaction;
mod internal;

pub use displacement::Displacement;
pub use reaction::Reaction;
pub use internal::ElementForces;

use serde::{Deserialize, Serialize};
use crate::model::Structure;

/// Complete analysis results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisResults {
    pub displacements: Vec<Displacement>,
    pub reactions: Vec<Reaction>,
    pub element_forces: Vec<ElementForces>,
}

impl AnalysisResults {
    pub fn new() -> Self {
        Self {
            displacements: Vec::new(),
            reactions: Vec::new(),
            element_forces: Vec::new(),
        }
    }

    /// Get displacement for a specific node
    pub fn get_displacement(&self, node_id: usize) -> Option<&Displacement> {
        self.displacements.iter().find(|d| d.node_id == node_id)
    }

    /// Get reaction at a specific node
    pub fn get_reaction(&self, node_id: usize) -> Option<&Reaction> {
        self.reactions.iter().find(|r| r.node_id == node_id)
    }

    /// Get forces for a specific element
    pub fn get_element_forces(&self, element_id: usize) -> Option<&ElementForces> {
        self.element_forces.iter().find(|f| f.element_id == element_id)
    }

    /// Maximum absolute displacement
    pub fn max_displacement(&self) -> f64 {
        self.displacements
            .iter()
            .map(|d| d.ux.abs().max(d.uy.abs()))
            .fold(0.0, f64::max)
    }

    /// Maximum absolute moment
    pub fn max_moment(&self) -> f64 {
        self.element_forces
            .iter()
            .map(|f| f.m_start.abs().max(f.m_end.abs()))
            .fold(0.0, f64::max)
    }

    /// Maximum absolute shear
    pub fn max_shear(&self) -> f64 {
        self.element_forces
            .iter()
            .map(|f| f.v_start.abs().max(f.v_end.abs()))
            .fold(0.0, f64::max)
    }

    /// Maximum absolute axial force
    pub fn max_axial(&self) -> f64 {
        self.element_forces
            .iter()
            .map(|f| f.n_start.abs().max(f.n_end.abs()))
            .fold(0.0, f64::max)
    }

    /// Verify global equilibrium
    pub fn verify_equilibrium(&self, structure: &Structure) -> Result<(), String> {
        let mut sum_fx = 0.0;
        let mut sum_fy = 0.0;
        let mut sum_mz = 0.0;

        // Sum of reactions (reactions oppose applied loads)
        for r in &self.reactions {
            sum_fx += r.rx;
            sum_fy += r.ry;
            // Moment about origin
            if let Some(node) = structure.get_node(r.node_id) {
                sum_mz += r.mz - r.rx * node.y + r.ry * node.x;
            }
        }

        // Sum of applied loads (should equal reactions for equilibrium)
        use crate::model::Load;
        for load in &structure.loads {
            match load {
                Load::Nodal(nodal) => {
                    sum_fx += nodal.fx;
                    sum_fy += nodal.fy;
                    if let Some(node) = structure.get_node(nodal.node_id) {
                        sum_mz += nodal.mz - nodal.fx * node.y + nodal.fy * node.x;
                    }
                }
                Load::Distributed(dist) => {
                    // For distributed loads, compute total load and centroid
                    if let Some(l) = structure.element_length(dist.element_id) {
                        let q_avg = (dist.q_start + dist.q_end) / 2.0;
                        let total_load = q_avg * l;

                        // Get element orientation and midpoint for moment calculation
                        if let Some(elem) = structure.get_element(dist.element_id) {
                            let (ni, nj) = elem.node_ids();
                            if let (Some(n1), Some(n2)) = (structure.get_node(ni), structure.get_node(nj)) {
                                let angle = n1.angle_to(n2);
                                let mid_x = (n1.x + n2.x) / 2.0;
                                let mid_y = (n1.y + n2.y) / 2.0;

                                // Load perpendicular to element (90° rotation)
                                // Positive q = load in local +y direction (perpendicular, to the left)
                                let fx = -total_load * angle.sin();
                                let fy = total_load * angle.cos();

                                sum_fx += fx;
                                sum_fy += fy;
                                sum_mz += -fx * mid_y + fy * mid_x;
                            }
                        }
                    }
                }
                Load::Point(point) => {
                    if let Some(elem) = structure.get_element(point.element_id) {
                        let (ni, _nj) = elem.node_ids();
                        if let Some(n1) = structure.get_node(ni) {
                            if let Some(angle) = structure.element_angle(point.element_id) {
                                // Load position
                                let px = n1.x + point.a * angle.cos();
                                let py = n1.y + point.a * angle.sin();

                                let fx = -point.p * angle.sin();
                                let fy = point.p * angle.cos();

                                sum_fx += fx;
                                sum_fy += fy;
                                sum_mz += point.m - fx * py + fy * px;
                            }
                        }
                    }
                }
            }
        }

        // For equilibrium: ΣF = 0 (reactions + applied loads = 0)
        // Check tolerance (relative to max reaction or 1.0 if all reactions are small)
        let max_reaction = self.reactions.iter()
            .map(|r| r.rx.abs().max(r.ry.abs()).max(r.mz.abs()))
            .fold(1.0, f64::max);

        let tol = max_reaction * 1e-4;

        if sum_fx.abs() > tol || sum_fy.abs() > tol || sum_mz.abs() > tol {
            return Err(format!(
                "Equilibrium check failed: ΣFx={:.6}, ΣFy={:.6}, ΣMz={:.6}",
                sum_fx, sum_fy, sum_mz
            ));
        }

        Ok(())
    }
}

impl Default for AnalysisResults {
    fn default() -> Self {
        Self::new()
    }
}
