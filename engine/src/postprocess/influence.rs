use crate::types::*;
use crate::solver::linear::{solve_2d, solve_3d};
use crate::postprocess::diagrams::compute_diagram_value_at;
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use crate::element::compute_local_axes_3d;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLinePoint {
    pub x: f64,
    pub y: f64,
    pub element_id: usize,
    pub t: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLineResult {
    pub quantity: String,
    pub target_node_id: Option<usize>,
    pub target_element_id: Option<usize>,
    pub target_position: f64,
    pub points: Vec<InfluenceLinePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLineInput {
    pub solver: SolverInput,
    pub quantity: String,     // "Ry", "Rx", "Mz", "V", "M"
    #[serde(default)]
    pub target_node_id: Option<usize>,
    #[serde(default)]
    pub target_element_id: Option<usize>,
    #[serde(default = "default_target_position")]
    pub target_position: f64,
    #[serde(default = "default_n_points")]
    pub n_points_per_element: usize,
}

fn default_target_position() -> f64 { 0.5 }
fn default_n_points() -> usize { 20 }

// ==================== Influence Line Computation ====================

/// Compute influence line: move unit load P=1 (downward) across all elements.
pub fn compute_influence_line(input: &InfluenceLineInput) -> Result<InfluenceLineResult, String> {
    if input.solver.nodes.len() < 2 {
        return Err("Need at least 2 nodes".into());
    }
    if input.solver.elements.is_empty() {
        return Err("Need at least 1 element".into());
    }
    if input.solver.supports.is_empty() {
        return Err("Need at least 1 support".into());
    }

    // Build base input (no loads)
    let base = SolverInput {
        nodes: input.solver.nodes.clone(),
        materials: input.solver.materials.clone(),
        sections: input.solver.sections.clone(),
        elements: input.solver.elements.clone(),
        supports: input.solver.supports.clone(),
        loads: Vec::new(),
        constraints: vec![],
        connectors: HashMap::new(),
    };

    // Pre-compute node positions
    let node_pos: HashMap<usize, (f64, f64)> = input.solver.nodes.values()
        .map(|n| (n.id, (n.x, n.y)))
        .collect();

    let mut points = Vec::new();

    for elem in input.solver.elements.values() {
        let (nix, niy) = *node_pos.get(&elem.node_i).unwrap();
        let (njx, njy) = *node_pos.get(&elem.node_j).unwrap();
        let dx = njx - nix;
        let dy = njy - niy;
        let l = (dx * dx + dy * dy).sqrt();
        if l < 1e-6 { continue; }

        let cos_theta = dx / l;
        let sin_theta = dy / l;

        for k in 0..=input.n_points_per_element {
            let t = k as f64 / input.n_points_per_element as f64;
            let a = t * l;
            let wx = nix + t * dx;
            let wy = niy + t * dy;

            // Unit load P=1 downward → perpendicular component
            let p_perp = -cos_theta;
            let p_axial = -sin_theta;

            let mut loads: Vec<SolverLoad> = Vec::new();

            if p_perp.abs() > 1e-10 {
                loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: elem.id,
                    a,
                    p: p_perp,
                    px: None,
                    mz: None,
                }));
            }

            if p_axial.abs() > 1e-10 {
                let fi = p_axial * (1.0 - t);
                let fj = p_axial * t;
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id: elem.node_i,
                    fx: fi * cos_theta,
                    fy: fi * sin_theta,
                    mz: 0.0,
                }));
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id: elem.node_j,
                    fx: fj * cos_theta,
                    fy: fj * sin_theta,
                    mz: 0.0,
                }));
            }

            let trial_input = SolverInput {
                loads,
                ..base.clone()
            };

            let value = match solve_2d(&trial_input) {
                Ok(result) => {
                    extract_value(&input.quantity, input.target_node_id, input.target_element_id, input.target_position, &result)
                }
                Err(_) => 0.0,
            };

            points.push(InfluenceLinePoint {
                x: wx,
                y: wy,
                element_id: elem.id,
                t,
                value,
            });
        }
    }

    Ok(InfluenceLineResult {
        quantity: input.quantity.clone(),
        target_node_id: input.target_node_id,
        target_element_id: input.target_element_id,
        target_position: input.target_position,
        points,
    })
}

fn extract_value(
    quantity: &str,
    target_node_id: Option<usize>,
    target_element_id: Option<usize>,
    target_position: f64,
    result: &AnalysisResults,
) -> f64 {
    match quantity {
        "Ry" | "Rx" | "Mz" => {
            if let Some(node_id) = target_node_id {
                if let Some(reaction) = result.reactions.iter().find(|r| r.node_id == node_id) {
                    match quantity {
                        "Ry" => reaction.ry,
                        "Rx" => reaction.rx,
                        "Mz" => reaction.mz,
                        _ => 0.0,
                    }
                } else {
                    0.0
                }
            } else {
                0.0
            }
        }
        "V" | "M" => {
            if let Some(elem_id) = target_element_id {
                if let Some(forces) = result.element_forces.iter().find(|f| f.element_id == elem_id) {
                    let kind = if quantity == "V" { "shear" } else { "moment" };
                    compute_diagram_value_at(kind, target_position, forces)
                } else {
                    0.0
                }
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}

// ==================== 3D Influence Lines ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLinePoint3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub element_id: usize,
    pub t: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLineResult3D {
    pub quantity: String,
    pub target_node_id: Option<usize>,
    pub target_element_id: Option<usize>,
    pub target_position: f64,
    pub points: Vec<InfluenceLinePoint3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceLineInput3D {
    pub solver: SolverInput3D,
    /// Quantity to compute: "Fy", "Fz", "Fx", "Mx", "My", "Mz" (reactions),
    /// "Vy", "Vz", "N", "My_diag", "Mz_diag", "T" (element forces at target position)
    pub quantity: String,
    #[serde(default)]
    pub target_node_id: Option<usize>,
    #[serde(default)]
    pub target_element_id: Option<usize>,
    #[serde(default = "default_target_position")]
    pub target_position: f64,
    #[serde(default = "default_n_points")]
    pub n_points_per_element: usize,
    /// "z" (default) or "y" — direction of gravity for the unit load
    #[serde(default)]
    pub gravity_direction: Option<String>,
}

/// Compute 3D influence line: move unit gravity load P=1 across all frame elements.
pub fn compute_influence_line_3d(input: &InfluenceLineInput3D) -> Result<InfluenceLineResult3D, String> {
    if input.solver.nodes.len() < 2 {
        return Err("Need at least 2 nodes".into());
    }
    if input.solver.elements.is_empty() {
        return Err("Need at least 1 element".into());
    }
    if input.solver.supports.is_empty() {
        return Err("Need at least 1 support".into());
    }

    let gravity_dir = match input.gravity_direction.as_deref() {
        Some("y") | Some("Y") => [0.0_f64, -1.0, 0.0],
        _ => [0.0_f64, 0.0, -1.0], // default: gravity in -Z
    };

    let base = SolverInput3D {
        nodes: input.solver.nodes.clone(),
        materials: input.solver.materials.clone(),
        sections: input.solver.sections.clone(),
        elements: input.solver.elements.clone(),
        supports: input.solver.supports.clone(),
        loads: Vec::new(),
        constraints: vec![],
        left_hand: input.solver.left_hand,
        plates: input.solver.plates.clone(),
        quads: input.solver.quads.clone(),
        quad9s: input.solver.quad9s.clone(),
        solid_shells: input.solver.solid_shells.clone(),
        curved_shells: input.solver.curved_shells.clone(),
        curved_beams: input.solver.curved_beams.clone(),
        connectors: HashMap::new(),
    };

    let node_pos: HashMap<usize, (f64, f64, f64)> = input.solver.nodes.values()
        .map(|n| (n.id, (n.x, n.y, n.z)))
        .collect();

    let mut points = Vec::new();

    for elem in input.solver.elements.values() {
        if elem.elem_type != "frame" && elem.elem_type != "beam" {
            continue; // only traverse frame elements
        }

        let (nix, niy, niz) = *node_pos.get(&elem.node_i).unwrap();
        let (njx, njy, njz) = *node_pos.get(&elem.node_j).unwrap();
        let dx = njx - nix;
        let dy = njy - niy;
        let dz = njz - niz;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        if l < 1e-6 { continue; }

        // Compute local axes for this element to project gravity into local Y/Z
        let left_hand = input.solver.left_hand.unwrap_or(false);
        let (_ex, ey, ez) = compute_local_axes_3d(
            nix, niy, niz, njx, njy, njz,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, left_hand,
        );

        // Project unit gravity into local Y and Z components
        let g_local_y = gravity_dir[0] * ey[0] + gravity_dir[1] * ey[1] + gravity_dir[2] * ey[2];
        let g_local_z = gravity_dir[0] * ez[0] + gravity_dir[1] * ez[1] + gravity_dir[2] * ez[2];

        for k in 0..=input.n_points_per_element {
            let t = k as f64 / input.n_points_per_element as f64;
            let a = t * l;
            let wx = nix + t * dx;
            let wy = niy + t * dy;
            let wz = niz + t * dz;

            let mut loads: Vec<SolverLoad3D> = Vec::new();

            // Apply unit load as point-on-element in local Y/Z
            if g_local_y.abs() > 1e-10 || g_local_z.abs() > 1e-10 {
                loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: elem.id,
                    a,
                    py: g_local_y,
                    pz: g_local_z,
                }));
            }

            let trial_input = SolverInput3D {
                loads,
                ..base.clone()
            };

            let value = match solve_3d(&trial_input) {
                Ok(result) => extract_value_3d(
                    &input.quantity,
                    input.target_node_id,
                    input.target_element_id,
                    input.target_position,
                    &result,
                ),
                Err(_) => 0.0,
            };

            points.push(InfluenceLinePoint3D {
                x: wx,
                y: wy,
                z: wz,
                element_id: elem.id,
                t,
                value,
            });
        }
    }

    Ok(InfluenceLineResult3D {
        quantity: input.quantity.clone(),
        target_node_id: input.target_node_id,
        target_element_id: input.target_element_id,
        target_position: input.target_position,
        points,
    })
}

fn extract_value_3d(
    quantity: &str,
    target_node_id: Option<usize>,
    target_element_id: Option<usize>,
    target_position: f64,
    result: &AnalysisResults3D,
) -> f64 {
    match quantity {
        "Fx" | "Fy" | "Fz" | "Mx" | "My" | "Mz" => {
            if let Some(node_id) = target_node_id {
                if let Some(reaction) = result.reactions.iter().find(|r| r.node_id == node_id) {
                    match quantity {
                        "Fx" => reaction.fx,
                        "Fy" => reaction.fy,
                        "Fz" => reaction.fz,
                        "Mx" => reaction.mx,
                        "My" => reaction.my,
                        "Mz" => reaction.mz,
                        _ => 0.0,
                    }
                } else {
                    0.0
                }
            } else {
                0.0
            }
        }
        "Vy" | "Vz" | "N" | "My_diag" | "Mz_diag" | "T" => {
            if let Some(elem_id) = target_element_id {
                if let Some(forces) = result.element_forces.iter().find(|f| f.element_id == elem_id) {
                    let kind = match quantity {
                        "Vy" => "shearY",
                        "Vz" => "shearZ",
                        "N" => "axial",
                        "My_diag" => "momentY",
                        "Mz_diag" => "momentZ",
                        "T" => "torsion",
                        _ => return 0.0,
                    };
                    evaluate_diagram_3d_at(forces, kind, target_position)
                } else {
                    0.0
                }
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}
