use crate::types::*;
use crate::solver::linear::{prepare_static_2d, prepare_static_3d};
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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

/// Most sampled points per element. Each point is one solve, and the count
/// comes from the caller.
pub const MAX_INFLUENCE_POINTS_PER_ELEMENT: usize = 1_000;

/// Refuse zero points per element (`k / 0` makes every ordinate NaN, returned
/// as `Ok`) and counts beyond `MAX_INFLUENCE_POINTS_PER_ELEMENT`.
fn check_n_points(n: usize) -> Result<(), String> {
    if n == 0 || n > MAX_INFLUENCE_POINTS_PER_ELEMENT {
        return Err(format!(
            "nPointsPerElement must be between 1 and {MAX_INFLUENCE_POINTS_PER_ELEMENT}, got {n}"
        ));
    }
    Ok(())
}

// ==================== Influence Line Computation ====================

/// Reaction and element-force quantities of the 2D influence line.
pub const IL_REACTIONS_2D: [&str; 5] = ["Rz", "Ry", "Rx", "My", "Mz"];
pub const IL_FORCES_2D: [&str; 2] = ["V", "M"];
/// Reaction and element-force quantities of the 3D influence line.
pub const IL_REACTIONS_3D: [&str; 6] = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"];
pub const IL_FORCES_3D: [&str; 6] = ["Vy", "Vz", "N", "My_diag", "Mz_diag", "T"];

/// Refuse an unknown quantity or a target it cannot be read at: these used to
/// give an influence line of zeros, silently.
#[allow(clippy::too_many_arguments)]
fn check_il_target(
    quantity: &str,
    reactions: &[&str],
    forces: &[&str],
    node: Option<usize>,
    element: Option<usize>,
    node_exists: impl Fn(usize) -> bool,
    node_supported: impl Fn(usize) -> bool,
    element_exists: impl Fn(usize) -> bool,
) -> Result<(), String> {
    if reactions.contains(&quantity) {
        let n = node.ok_or_else(|| format!("influence line of reaction '{quantity}' needs targetNodeId"))?;
        if !node_exists(n) {
            return Err(format!("influence line: target node {n} does not exist"));
        }
        if !node_supported(n) {
            return Err(format!("influence line: target node {n} has no support, so no reaction '{quantity}'"));
        }
        Ok(())
    } else if forces.contains(&quantity) {
        let e = element.ok_or_else(|| format!("influence line of '{quantity}' needs targetElementId"))?;
        if !element_exists(e) {
            return Err(format!("influence line: target element {e} does not exist"));
        }
        Ok(())
    } else {
        Err(format!(
            "unknown influence-line quantity '{quantity}'; accepted: {}, {}",
            reactions.join(", "),
            forces.join(", ")
        ))
    }
}

/// Compute influence line: move unit load P=1 (downward) across all elements.
///
/// The structure is prepared once (`prepare_static_2d`: assembly +
/// factorization) and each sampled point reuses the factorization with a
/// rebuilt unit-load vector.
///
/// Follow-up: a Müller-Breslau / adjoint formulation would need only one
/// triangular solve per target quantity with ordinates read from K⁻¹-columns
/// instead of one solve per sampled point. Note that for section-force
/// quantities ("V", "M") the imposed unit effect is a self-equilibrating
/// discontinuity set, not a nodal load, and the fixed-end contribution when
/// the moving load sits on the target element needs separate treatment.
pub fn compute_influence_line(input: &InfluenceLineInput) -> Result<InfluenceLineResult, String> {
    check_n_points(input.n_points_per_element)?;
    let s = &input.solver;
    check_il_target(
        &input.quantity,
        &IL_REACTIONS_2D,
        &IL_FORCES_2D,
        input.target_node_id,
        input.target_element_id,
        |n| crate::ordered::values(&s.nodes).any(|x| x.id == n),
        |n| crate::ordered::values(&s.supports).any(|x| x.node_id == n),
        |e| crate::ordered::values(&s.elements).any(|x| x.id == e),
    )?;
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
        solver_options: None, masses: Default::default(),
        nodes: input.solver.nodes.clone(),
        materials: input.solver.materials.clone(),
        sections: input.solver.sections.clone(),
        elements: input.solver.elements.clone(),
        // An influence ordinate is the response to the unit load alone.
        // Prescribed support displacements are actions, not structure: kept,
        // every ordinate carried the settlement's own (load-independent)
        // effect — found by the metamorphic unit-scaling check.
        supports: input.solver.supports.iter().map(|(k, s)| (k.clone(), SolverSupport { dx: None, dz: None, dry: None, ..s.clone() })).collect(),
        loads: Vec::new(),
        // Constraints and connectors are part of the structure. They were
        // left out, so an influence line was drawn for a different structure:
        // a beam propped by a connector, or tied by a constraint, without them.
        constraints: input.solver.constraints.clone(),
        connectors: input.solver.connectors.clone(),
    };

    // Prepare once. A prepare failure is the model's, and it is returned: it
    // used to be `.ok()`-ed into an influence line of zeros, handed back as
    // `Ok` — a structure the solver refused (E ≤ 0, a collapsed shell)
    // presented as one that nothing loads. Ordinary per-point failures still yield 0.0; diagnostic refusals propagate.
    // The prepared (factor-once) path has no constraint reduction: a model
    // with constraints is solved point by point through `solve_2d`, which has.
    let mut structured_diagnostics = Vec::new();
    let prepared = if base.constraints.is_empty() { Some(prepare_static_2d(&base)?) } else { None };
    let solve_at = |loads: &[SolverLoad]| -> Result<AnalysisResults, String> {
        match &prepared {
            Some(p) => p.solve_loads(loads),
            None => {
                let mut with_loads = base.clone();
                with_loads.loads = loads.to_vec();
                crate::solver::linear::solve_2d(&with_loads)
            }
        }
    };

    // Pre-compute node positions
    let node_pos: HashMap<usize, (f64, f64)> = crate::ordered::values(&input.solver.nodes)
        .map(|n| (n.id, (n.x, n.z)))
        .collect();

    let mut points = Vec::new();

    for elem in crate::ordered::values(&input.solver.elements) {
        // A missing node is a caller error, not a crash. `prepare` above
        // validates and would already have refused it; this used to `unwrap`
        // on the `None` — panicking, which in WASM takes the whole module down
        // with it — so it stays an error rather than an assumption.
        let (Some(&(nix, niy)), Some(&(njx, njy))) =
            (node_pos.get(&elem.node_i), node_pos.get(&elem.node_j))
        else {
            return Err(format!(
                "Element {} references a node that does not exist (nodes {} and {})",
                elem.id, elem.node_i, elem.node_j
            ));
        };
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

            let loads = influence_unit_loads_2d(elem, a, t, cos_theta, sin_theta);

            let value = match crate::known_issues::optional_solve(solve_at(&loads))? {
                Some(result) => {
                    crate::known_issues::attach(&mut structured_diagnostics, result.structured_diagnostics.clone());
                    extract_value(&input.quantity, input.target_node_id, input.target_element_id, input.target_position, &result)
                }
                None => 0.0,
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
        structured_diagnostics: { crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Linear)); structured_diagnostics },
        quantity: input.quantity.clone(),
        target_node_id: input.target_node_id,
        target_element_id: input.target_element_id,
        target_position: input.target_position,
        points,
    })
}

/// Unit-load set at position `a = t·l` on a 2D element: perpendicular point
/// load plus axial components as nodal loads at both element ends.
pub fn influence_unit_loads_2d(
    elem: &SolverElement,
    a: f64,
    t: f64,
    cos_theta: f64,
    sin_theta: f64,
) -> Vec<SolverLoad> {
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
            my: None,
        }));
    }

    if p_axial.abs() > 1e-10 {
        let fi = p_axial * (1.0 - t);
        let fj = p_axial * t;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: elem.node_i,
            fx: fi * cos_theta,
            fz: fi * sin_theta,
            my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: elem.node_j,
            fx: fj * cos_theta,
            fz: fj * sin_theta,
            my: 0.0,
        }));
    }

    loads
}

pub fn extract_value(
    quantity: &str,
    target_node_id: Option<usize>,
    target_element_id: Option<usize>,
    target_position: f64,
    result: &AnalysisResults,
) -> f64 {
    match quantity {
        // The Z-up names belong here too. The inner match below already knows
        // both spellings and folds them onto `rz` and `my`, but this outer gate
        // was left listing only the pre-migration Y-up names — so a caller that
        // asked for the correct "Rz" or "My" fell through to the `_ => 0.0`
        // arm and got a flat, silent zero rather than an influence line. That
        // is exactly what `uiStore.ilQuantity`'s own default, 'Rz', would have
        // produced. Y-up stays accepted so saved models keep working.
        "Ry" | "Rz" | "Rx" | "Mz" | "My" => {
            if let Some(node_id) = target_node_id {
                if let Some(reaction) = result.reactions.iter().find(|r| r.node_id == node_id) {
                    match quantity {
                        "Ry" | "Rz" => reaction.rz,
                        "Rx" => reaction.rx,
                        "Mz" | "My" => reaction.my,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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
///
/// The structure is prepared once (`prepare_static_3d`: curved-beam expansion,
/// assembly, factorization) and each sampled point reuses the factorization
/// with a rebuilt unit-load vector. Same follow-up as the 2D variant: a
/// Müller-Breslau / adjoint formulation would need one solve per target
/// quantity instead of one per sampled point.
pub fn compute_influence_line_3d(input: &InfluenceLineInput3D) -> Result<InfluenceLineResult3D, String> {
    check_n_points(input.n_points_per_element)?;
    let s = &input.solver;
    check_il_target(
        &input.quantity,
        &IL_REACTIONS_3D,
        &IL_FORCES_3D,
        input.target_node_id,
        input.target_element_id,
        |n| crate::ordered::values(&s.nodes).any(|x| x.id == n),
        |n| crate::ordered::values(&s.supports).any(|x| x.node_id == n),
        |e| crate::ordered::values(&s.elements).any(|x| x.id == e),
    )?;
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
        None | Some("z") | Some("Z") => [0.0_f64, 0.0, -1.0], // default: gravity in -Z
        Some(g) => return Err(format!("Influence line: unknown gravityDirection '{g}'; expected \"z\" or \"y\"")),
    };

    let base = SolverInput3D {
        solver_options: None, masses: Default::default(),
        nodes: input.solver.nodes.clone(),
        materials: input.solver.materials.clone(),
        sections: input.solver.sections.clone(),
        elements: input.solver.elements.clone(),
        // Settlements stripped, as in 2D: ordinates are unit-load responses.
        supports: input
            .solver
            .supports
            .iter()
            .map(|(k, s)| (k.clone(), SolverSupport3D { dx: None, dy: None, dz: None, drx: None, dry: None, drz: None, ..s.clone() }))
            .collect(),
        loads: Vec::new(),
        constraints: input.solver.constraints.clone(),
        left_hand: input.solver.left_hand,
        plates: input.solver.plates.clone(),
        quads: input.solver.quads.clone(),
        quad9s: input.solver.quad9s.clone(),
        solid_shells: input.solver.solid_shells.clone(),
        curved_shells: input.solver.curved_shells.clone(),
        curved_beams: input.solver.curved_beams.clone(),
        connectors: input.solver.connectors.clone(),
    };

    // Prepare once. A prepare failure is the model's, and it is returned: it
    // used to be `.ok()`-ed into an influence line of zeros, handed back as
    // `Ok` — a structure the solver refused (E ≤ 0, a collapsed shell)
    // presented as one that nothing loads. Ordinary per-point failures still yield 0.0; diagnostic refusals propagate.
    // As in 2D: constraints are solved point by point through `solve_3d`.
    let mut structured_diagnostics = Vec::new();
    let prepared = if base.constraints.is_empty() { Some(prepare_static_3d(&base)?) } else { None };
    let solve_at = |loads: &[SolverLoad3D]| -> Result<AnalysisResults3D, String> {
        match &prepared {
            Some(p) => p.solve_loads(loads),
            None => {
                let mut with_loads = base.clone();
                with_loads.loads = loads.to_vec();
                crate::solver::linear::solve_3d(&with_loads)
            }
        }
    };

    let node_pos: HashMap<usize, (f64, f64, f64)> = crate::ordered::values(&input.solver.nodes)
        .map(|n| (n.id, (n.x, n.y, n.z)))
        .collect();

    let mut points = Vec::new();

    for elem in crate::ordered::values(&input.solver.elements) {
        if elem.elem_type != "frame" && elem.elem_type != "beam" {
            continue; // only traverse frame elements
        }

        // See the 2D path: a dangling reference returns an error rather than
        // panicking the module.
        let (Some(&(nix, niy, niz)), Some(&(njx, njy, njz))) =
            (node_pos.get(&elem.node_i), node_pos.get(&elem.node_j))
        else {
            return Err(format!(
                "Element {} references a node that does not exist (nodes {} and {})",
                elem.id, elem.node_i, elem.node_j
            ));
        };
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

            let loads = influence_unit_loads_3d(elem.id, a, g_local_y, g_local_z);

            let value = match crate::known_issues::optional_solve(solve_at(&loads))? {
                Some(result) => {
                    crate::known_issues::attach(&mut structured_diagnostics, result.structured_diagnostics.clone());
                    extract_value_3d(
                    &input.quantity,
                    input.target_node_id,
                    input.target_element_id,
                    input.target_position,
                    &result,
                ) },
                None => 0.0,
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
        structured_diagnostics: { crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Linear)); structured_diagnostics },
        quantity: input.quantity.clone(),
        target_node_id: input.target_node_id,
        target_element_id: input.target_element_id,
        target_position: input.target_position,
        points,
    })
}

/// Unit gravity load at position `a` on a 3D element, already projected into
/// local Y/Z components.
pub fn influence_unit_loads_3d(elem_id: usize, a: f64, g_local_y: f64, g_local_z: f64) -> Vec<SolverLoad3D> {
    let mut loads: Vec<SolverLoad3D> = Vec::new();
    if g_local_y.abs() > 1e-10 || g_local_z.abs() > 1e-10 {
        loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
            element_id: elem_id,
            a,
            py: g_local_y,
            pz: g_local_z,
        }));
    }
    loads
}

pub fn extract_value_3d(
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
