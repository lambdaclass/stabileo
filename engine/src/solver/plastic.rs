use crate::types::*;
use std::collections::HashMap;

// ==================== 2D Plastic Types ====================

/// Plastic analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticResult {
    pub collapse_factor: f64,
    pub steps: Vec<PlasticStep>,
    pub hinges: Vec<PlasticHinge>,
    pub is_mechanism: bool,
    pub redundancy: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticStep {
    pub load_factor: f64,
    pub hinges_formed: Vec<PlasticHinge>,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticHinge {
    pub element_id: usize,
    pub end: String, // "start" or "end"
    pub moment: f64,
    pub load_factor: f64,
    pub step: usize,
}

// ==================== 3D Plastic Types ====================

/// 3D plastic (pushover) analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticResult3D {
    pub collapse_factor: f64,
    pub steps: Vec<PlasticStep3D>,
    pub hinges: Vec<PlasticHinge3D>,
    pub is_mechanism: bool,
    pub redundancy: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticStep3D {
    pub load_factor: f64,
    pub hinges_formed: Vec<PlasticHinge3D>,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlasticHinge3D {
    pub element_id: usize,
    pub end: String, // "start" or "end"
    pub moment_y: f64,
    pub moment_z: f64,
    pub interaction_ratio: f64,
    pub load_factor: f64,
    pub step: usize,
}

/// Solve 2D plastic analysis (event-to-event incremental method).
pub fn solve_plastic_2d(input: &PlasticInput) -> Result<PlasticResult, String> {
    let solver_input = &input.solver;
    let max_hinges = input.max_hinges.unwrap_or(20);

    // Compute plastic moments Mp for each section
    let mut mp_map: HashMap<usize, f64> = HashMap::new();
    for (sid, sec_data) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        if let Some(&mp) = input.mp_overrides.as_ref().and_then(|m| m.get(sid)) {
            mp_map.insert(sec_id, mp);
        } else {
            let fy = input.materials.get(&sec_data.material_id.to_string())
                .and_then(|m| m.fy)
                .unwrap_or(250.0); // Default: 250 MPa steel
            let mp = compute_plastic_moment(sec_data, fy);
            mp_map.insert(sec_id, mp);
        }
    }

    let mut current_input = solver_input.clone();
    let mut cumulative_factor = 0.0;
    let mut all_hinges: Vec<PlasticHinge> = Vec::new();
    let mut steps: Vec<PlasticStep> = Vec::new();
    let mut accumulated_moments: HashMap<(usize, String), f64> = HashMap::new();

    // Build O(1) lookup: element id -> HashMap key (stable across hinge mutations)
    let elem_id_to_key: HashMap<usize, String> = current_input.elements.iter()
        .map(|(k, e)| (e.id, k.clone()))
        .collect();

    for step in 0..max_hinges {
        // Solve under unit loads on current structure
        let results = match super::linear::solve_2d(&current_input) {
            Ok(r) => r,
            Err(_) => {
                // Structure is a mechanism
                break;
            }
        };

        // Find minimum load increment to next hinge
        let mut min_delta_lambda = f64::INFINITY;
        let mut new_hinges = Vec::new();

        for ef in &results.element_forces {
            let elem_key = &elem_id_to_key[&ef.element_id];
            let elem = current_input.elements.get(elem_key).unwrap();
            let mp = mp_map.get(&elem.section_id).copied().unwrap_or(f64::INFINITY);
            if mp >= f64::INFINITY { continue; }

            // Check start end
            if !elem.hinge_start {
                let m_acc = accumulated_moments.get(&(ef.element_id, "start".to_string())).copied().unwrap_or(0.0);
                let m_unit = ef.m_start;
                if m_unit.abs() > 1e-10 {
                    let delta = (mp - m_acc.abs()) / m_unit.abs();
                    if delta > 1e-10 && delta < min_delta_lambda {
                        min_delta_lambda = delta;
                        new_hinges.clear();
                        new_hinges.push((ef.element_id, "start".to_string(), m_unit));
                    } else if delta > 1e-10 && (delta - min_delta_lambda).abs() < 1e-10 {
                        new_hinges.push((ef.element_id, "start".to_string(), m_unit));
                    }
                }
            }

            // Check end end
            if !elem.hinge_end {
                let m_acc = accumulated_moments.get(&(ef.element_id, "end".to_string())).copied().unwrap_or(0.0);
                let m_unit = ef.m_end;
                if m_unit.abs() > 1e-10 {
                    let delta = (mp - m_acc.abs()) / m_unit.abs();
                    if delta > 1e-10 && delta < min_delta_lambda {
                        min_delta_lambda = delta;
                        new_hinges.clear();
                        new_hinges.push((ef.element_id, "end".to_string(), m_unit));
                    } else if delta > 1e-10 && (delta - min_delta_lambda).abs() < 1e-10 {
                        new_hinges.push((ef.element_id, "end".to_string(), m_unit));
                    }
                }
            }

            // Check maximum interior moment (critical for single-element spans
            // where the max moment is interior, e.g. SS beam with midspan load)
            {
                let n_samples = 20;
                let mut max_interior_m = 0.0f64;
                for i in 1..n_samples {
                    let t = i as f64 / n_samples as f64;
                    let m = crate::postprocess::diagrams::compute_diagram_value_at("moment", t, ef);
                    if m.abs() > max_interior_m.abs() {
                        max_interior_m = m;
                    }
                }
                let end_max = ef.m_start.abs().max(ef.m_end.abs());
                if max_interior_m.abs() > end_max + 1e-10 {
                    let m_acc = accumulated_moments
                        .get(&(ef.element_id, "span".to_string()))
                        .copied()
                        .unwrap_or(0.0);
                    let delta = (mp - m_acc.abs()) / max_interior_m.abs();
                    if delta > 1e-10 && delta < min_delta_lambda {
                        min_delta_lambda = delta;
                        new_hinges.clear();
                        let end_name = if !elem.hinge_start { "start" } else { "end" };
                        new_hinges.push((ef.element_id, end_name.to_string(), max_interior_m));
                    } else if delta > 1e-10 && (delta - min_delta_lambda).abs() < 1e-10 {
                        let end_name = if !elem.hinge_start { "start" } else { "end" };
                        new_hinges.push((ef.element_id, end_name.to_string(), max_interior_m));
                    }
                }
            }
        }

        if min_delta_lambda >= f64::INFINITY || min_delta_lambda <= 0.0 {
            break;
        }

        cumulative_factor += min_delta_lambda;

        // Update accumulated moments
        for ef in &results.element_forces {
            *accumulated_moments.entry((ef.element_id, "start".to_string())).or_insert(0.0) += min_delta_lambda * ef.m_start;
            *accumulated_moments.entry((ef.element_id, "end".to_string())).or_insert(0.0) += min_delta_lambda * ef.m_end;

            // Accumulate max interior moment
            let mut max_interior_m = 0.0f64;
            for i in 1..20 {
                let t = i as f64 / 20.0;
                let m = crate::postprocess::diagrams::compute_diagram_value_at("moment", t, ef);
                if m.abs() > max_interior_m.abs() {
                    max_interior_m = m;
                }
            }
            if max_interior_m.abs() > 1e-10 {
                *accumulated_moments.entry((ef.element_id, "span".to_string())).or_insert(0.0) += min_delta_lambda * max_interior_m;
            }
        }

        // Scale results by delta_lambda
        let scaled_results = scale_results(&results, min_delta_lambda);

        // Record hinges
        let mut step_hinges = Vec::new();
        for (eid, end, _m_unit) in &new_hinges {
            let elem_key = &elem_id_to_key[eid];
            let section_id = current_input.elements.get(elem_key).unwrap().section_id;
            let mp = mp_map.get(&section_id).copied().unwrap_or(0.0);

            let hinge = PlasticHinge {
                element_id: *eid,
                end: end.clone(),
                moment: mp,
                load_factor: cumulative_factor,
                step,
            };
            step_hinges.push(hinge.clone());
            all_hinges.push(hinge);
        }

        steps.push(PlasticStep {
            load_factor: cumulative_factor,
            hinges_formed: step_hinges,
            results: scaled_results,
        });

        // Insert hinges into structure for next iteration
        for (eid, end, _) in &new_hinges {
            let elem_key = &elem_id_to_key[eid];
            if let Some(elem) = current_input.elements.get_mut(elem_key) {
                if end == "start" {
                    elem.hinge_start = true;
                } else {
                    elem.hinge_end = true;
                }
            }
        }
    }

    // Check if mechanism formed (solver fails on next iteration)
    let is_mechanism = super::linear::solve_2d(&current_input).is_err();

    Ok(PlasticResult {
        collapse_factor: cumulative_factor,
        steps,
        hinges: all_hinges.clone(),
        is_mechanism,
        redundancy: all_hinges.len(),
    })
}

fn compute_plastic_moment(sec: &PlasticSectionData, fy: f64) -> f64 {
    // fy in MPa, dimensions in m
    // Mp = fy * Zp (kN·m)
    // For rectangular: Zp = b*h²/4
    // For generic: Zp ≈ 1.15 * Iz/(h/2) (approximate shape factor)
    if let (Some(b), Some(h)) = (sec.b, sec.h) {
        let zp = b * h * h / 4.0; // m³
        fy * 1000.0 * zp // MPa * 1000 = kN/m², * m³ = kN·m
    } else if sec.iz > 1e-20 {
        // Approximate: assume shape factor 1.15
        let h_approx = (12.0 * sec.iz / sec.a).sqrt(); // approximate height
        let s_elastic = sec.iz / (h_approx / 2.0);
        let zp = 1.15 * s_elastic;
        fy * 1000.0 * zp
    } else {
        f64::INFINITY
    }
}

fn scale_results(results: &AnalysisResults, factor: f64) -> AnalysisResults {
    AnalysisResults {
        displacements: results.displacements.iter().map(|d| Displacement {
            node_id: d.node_id,
            ux: d.ux * factor,
            uy: d.uy * factor,
            rz: d.rz * factor,
        }).collect(),
        reactions: results.reactions.iter().map(|r| Reaction {
            node_id: r.node_id,
            rx: r.rx * factor,
            ry: r.ry * factor,
            mz: r.mz * factor,
        }).collect(),
        element_forces: results.element_forces.iter().map(|ef| ElementForces {
            element_id: ef.element_id,
            n_start: ef.n_start * factor,
            n_end: ef.n_end * factor,
            v_start: ef.v_start * factor,
            v_end: ef.v_end * factor,
            m_start: ef.m_start * factor,
            m_end: ef.m_end * factor,
            length: ef.length,
            q_i: ef.q_i * factor,
            q_j: ef.q_j * factor,
            point_loads: ef.point_loads.clone(),
            distributed_loads: ef.distributed_loads.clone(),
            hinge_start: ef.hinge_start,
            hinge_end: ef.hinge_end,
        }).collect(),
        constraint_forces: results.constraint_forces.iter().map(|cf| ConstraintForce {
            node_id: cf.node_id,
            dof: cf.dof.clone(),
            force: cf.force * factor,
        }).collect(),
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None,
    }
}

// ==================== 3D Plastic (Pushover) Analysis ====================

/// Solve 3D plastic analysis (event-to-event incremental method).
///
/// Uses biaxial moment interaction (elliptical yield surface):
///   (My/Mp_y)² + (Mz/Mp_z)² = 1
///
/// At each step, finds the minimum load increment to form the next hinge,
/// inserts it, and resolves until a mechanism forms.
pub fn solve_plastic_3d(input: &PlasticInput3D) -> Result<PlasticResult3D, String> {
    let solver_input = &input.solver;
    let max_hinges = input.max_hinges.unwrap_or(30);

    // Compute plastic moments Mp_y and Mp_z for each section
    let mut mp_map: HashMap<usize, (f64, f64)> = HashMap::new();
    for (sid, sec_data) in &input.sections {
        let sec_id: usize = sid.parse().unwrap_or(0);
        if let Some(overrides) = input.mp_overrides.as_ref().and_then(|m| m.get(sid)) {
            mp_map.insert(sec_id, (overrides[0], overrides[1]));
        } else {
            let fy = input.materials.get(&sec_data.material_id.to_string())
                .and_then(|m| m.fy)
                .unwrap_or(250.0);
            let (mpy, mpz) = compute_plastic_moments_3d(sec_data, fy);
            mp_map.insert(sec_id, (mpy, mpz));
        }
    }

    let mut current_input = solver_input.clone();
    let mut cumulative_factor = 0.0;
    let mut all_hinges: Vec<PlasticHinge3D> = Vec::new();
    let mut steps: Vec<PlasticStep3D> = Vec::new();
    let mut acc_my: HashMap<(usize, String), f64> = HashMap::new();
    let mut acc_mz: HashMap<(usize, String), f64> = HashMap::new();

    // Build O(1) lookup: element id -> HashMap key (stable across hinge mutations)
    let elem_id_to_key: HashMap<usize, String> = current_input.elements.iter()
        .map(|(k, e)| (e.id, k.clone()))
        .collect();

    for step in 0..max_hinges {
        // Solve under unit loads on current structure
        let results = match super::linear::solve_3d(&current_input) {
            Ok(r) => r,
            Err(_) => break, // mechanism
        };

        // Find minimum load increment to next hinge using interaction criterion
        let mut min_delta = f64::INFINITY;
        let mut new_hinges: Vec<(usize, String, f64, f64)> = Vec::new();

        for ef in &results.element_forces {
            let elem_key = &elem_id_to_key[&ef.element_id];
            let elem = current_input.elements.get(elem_key).unwrap();
            let (mp_y, mp_z) = mp_map.get(&elem.section_id).copied()
                .unwrap_or((f64::INFINITY, f64::INFINITY));
            if mp_y >= f64::INFINITY || mp_z >= f64::INFINITY { continue; }

            // Check start end
            if !elem.hinge_start {
                let delta = compute_interaction_delta(
                    ef.my_start, ef.mz_start, mp_y, mp_z,
                    acc_my.get(&(ef.element_id, "start".to_string())).copied().unwrap_or(0.0),
                    acc_mz.get(&(ef.element_id, "start".to_string())).copied().unwrap_or(0.0),
                );
                if delta > 1e-10 {
                    if delta < min_delta - 1e-10 {
                        min_delta = delta;
                        new_hinges.clear();
                        new_hinges.push((ef.element_id, "start".to_string(), ef.my_start, ef.mz_start));
                    } else if (delta - min_delta).abs() < 1e-10 {
                        new_hinges.push((ef.element_id, "start".to_string(), ef.my_start, ef.mz_start));
                    }
                }
            }

            // Check end end
            if !elem.hinge_end {
                let delta = compute_interaction_delta(
                    ef.my_end, ef.mz_end, mp_y, mp_z,
                    acc_my.get(&(ef.element_id, "end".to_string())).copied().unwrap_or(0.0),
                    acc_mz.get(&(ef.element_id, "end".to_string())).copied().unwrap_or(0.0),
                );
                if delta > 1e-10 {
                    if delta < min_delta - 1e-10 {
                        min_delta = delta;
                        new_hinges.clear();
                        new_hinges.push((ef.element_id, "end".to_string(), ef.my_end, ef.mz_end));
                    } else if (delta - min_delta).abs() < 1e-10 {
                        new_hinges.push((ef.element_id, "end".to_string(), ef.my_end, ef.mz_end));
                    }
                }
            }
        }

        if min_delta >= f64::INFINITY || min_delta <= 0.0 {
            break;
        }

        cumulative_factor += min_delta;

        // Update accumulated moments
        for ef in &results.element_forces {
            *acc_my.entry((ef.element_id, "start".to_string())).or_insert(0.0) += min_delta * ef.my_start;
            *acc_mz.entry((ef.element_id, "start".to_string())).or_insert(0.0) += min_delta * ef.mz_start;
            *acc_my.entry((ef.element_id, "end".to_string())).or_insert(0.0) += min_delta * ef.my_end;
            *acc_mz.entry((ef.element_id, "end".to_string())).or_insert(0.0) += min_delta * ef.mz_end;
        }

        let scaled = scale_results_3d(&results, min_delta);

        let mut step_hinges = Vec::new();
        for (eid, end, _my, _mz) in &new_hinges {
            let elem_key = &elem_id_to_key[eid];
            let section_id = current_input.elements.get(elem_key).unwrap().section_id;
            let (mp_y, mp_z) = mp_map.get(&section_id).copied().unwrap_or((0.0, 0.0));
            let total_my = acc_my.get(&(*eid, end.clone())).copied().unwrap_or(0.0);
            let total_mz = acc_mz.get(&(*eid, end.clone())).copied().unwrap_or(0.0);
            let ratio = (total_my / mp_y).powi(2) + (total_mz / mp_z).powi(2);

            let hinge = PlasticHinge3D {
                element_id: *eid,
                end: end.clone(),
                moment_y: total_my,
                moment_z: total_mz,
                interaction_ratio: ratio.sqrt(),
                load_factor: cumulative_factor,
                step,
            };
            step_hinges.push(hinge.clone());
            all_hinges.push(hinge);
        }

        steps.push(PlasticStep3D {
            load_factor: cumulative_factor,
            hinges_formed: step_hinges,
            results: scaled,
        });

        // Insert hinges
        for (eid, end, _, _) in &new_hinges {
            let elem_key = &elem_id_to_key[eid];
            if let Some(elem) = current_input.elements.get_mut(elem_key) {
                if end == "start" {
                    elem.hinge_start = true;
                } else {
                    elem.hinge_end = true;
                }
            }
        }
    }

    let is_mechanism = super::linear::solve_3d(&current_input).is_err();

    Ok(PlasticResult3D {
        collapse_factor: cumulative_factor,
        steps,
        hinges: all_hinges.clone(),
        is_mechanism,
        redundancy: all_hinges.len(),
    })
}

/// Compute plastic moments about Y and Z axes.
fn compute_plastic_moments_3d(sec: &PlasticSectionData3D, fy: f64) -> (f64, f64) {
    let fy_kn = fy * 1000.0; // MPa → kN/m²

    let mp_y = if let (Some(b), Some(h)) = (sec.b, sec.h) {
        // Rectangular: Zp_y = b*h²/4
        fy_kn * b * h * h / 4.0
    } else if sec.iy > 1e-20 {
        let h_approx = (12.0 * sec.iy / sec.a).sqrt();
        let s_el = sec.iy / (h_approx / 2.0);
        fy_kn * 1.15 * s_el
    } else {
        f64::INFINITY
    };

    let mp_z = if let (Some(b), Some(d)) = (sec.b, sec.d) {
        // Rectangular: Zp_z = d*b²/4
        fy_kn * d * b * b / 4.0
    } else if let (Some(b), Some(h)) = (sec.b, sec.h) {
        // Assume d = b for square-ish sections
        fy_kn * h * b * b / 4.0
    } else if sec.iz > 1e-20 {
        let b_approx = (12.0 * sec.iz / sec.a).sqrt();
        let s_el = sec.iz / (b_approx / 2.0);
        fy_kn * 1.15 * s_el
    } else {
        f64::INFINITY
    };

    (mp_y, mp_z)
}

/// Compute load increment delta_lambda for biaxial interaction.
///
/// Interaction: ((my_acc + delta * my_unit) / mp_y)^2 + ((mz_acc + delta * mz_unit) / mp_z)^2 = 1
/// This is a quadratic in delta. We find the smallest positive root.
fn compute_interaction_delta(
    my_unit: f64, mz_unit: f64,
    mp_y: f64, mp_z: f64,
    my_acc: f64, mz_acc: f64,
) -> f64 {
    let a = (my_unit / mp_y).powi(2) + (mz_unit / mp_z).powi(2);
    let b = 2.0 * (my_acc * my_unit / (mp_y * mp_y) + mz_acc * mz_unit / (mp_z * mp_z));
    let c = (my_acc / mp_y).powi(2) + (mz_acc / mp_z).powi(2) - 1.0;

    if a < 1e-20 { return f64::INFINITY; }

    let disc = b * b - 4.0 * a * c;
    if disc < 0.0 { return f64::INFINITY; }

    let sqrt_disc = disc.sqrt();
    let d1 = (-b + sqrt_disc) / (2.0 * a);
    let d2 = (-b - sqrt_disc) / (2.0 * a);

    let mut min_pos = f64::INFINITY;
    if d1 > 1e-10 && d1 < min_pos { min_pos = d1; }
    if d2 > 1e-10 && d2 < min_pos { min_pos = d2; }
    min_pos
}

fn scale_results_3d(results: &AnalysisResults3D, factor: f64) -> AnalysisResults3D {
    AnalysisResults3D {
        displacements: results.displacements.iter().map(|d| Displacement3D {
            node_id: d.node_id,
            ux: d.ux * factor, uy: d.uy * factor, uz: d.uz * factor,
            rx: d.rx * factor, ry: d.ry * factor, rz: d.rz * factor,
            warping: d.warping.map(|w| w * factor),
        }).collect(),
        reactions: results.reactions.iter().map(|r| Reaction3D {
            node_id: r.node_id,
            fx: r.fx * factor, fy: r.fy * factor, fz: r.fz * factor,
            mx: r.mx * factor, my: r.my * factor, mz: r.mz * factor,
            bimoment: r.bimoment.map(|b| b * factor),
        }).collect(),
        element_forces: results.element_forces.iter().map(|ef| ElementForces3D {
            element_id: ef.element_id, length: ef.length,
            n_start: ef.n_start * factor, n_end: ef.n_end * factor,
            vy_start: ef.vy_start * factor, vy_end: ef.vy_end * factor,
            vz_start: ef.vz_start * factor, vz_end: ef.vz_end * factor,
            mx_start: ef.mx_start * factor, mx_end: ef.mx_end * factor,
            my_start: ef.my_start * factor, my_end: ef.my_end * factor,
            mz_start: ef.mz_start * factor, mz_end: ef.mz_end * factor,
            hinge_start: ef.hinge_start, hinge_end: ef.hinge_end,
            q_yi: ef.q_yi * factor, q_yj: ef.q_yj * factor,
            distributed_loads_y: ef.distributed_loads_y.clone(),
            point_loads_y: ef.point_loads_y.clone(),
            q_zi: ef.q_zi * factor, q_zj: ef.q_zj * factor,
            distributed_loads_z: ef.distributed_loads_z.clone(),
            point_loads_z: ef.point_loads_z.clone(),
            bimoment_start: ef.bimoment_start.map(|b| b * factor),
            bimoment_end: ef.bimoment_end.map(|b| b * factor),
        }).collect(),
        plate_stresses: results.plate_stresses.clone(),
        quad_stresses: vec![],
        quad_nodal_stresses: vec![],
        constraint_forces: results.constraint_forces.iter().map(|cf| ConstraintForce {
            node_id: cf.node_id,
            dof: cf.dof.clone(),
            force: cf.force * factor,
        }).collect(),
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        timings: None,
        result_summary: None,
    }
}
