use crate::types::*;
use std::collections::HashMap;

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
            let elem = current_input.elements.values()
                .find(|e| e.id == ef.element_id).unwrap();
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
        }

        if min_delta_lambda >= f64::INFINITY || min_delta_lambda <= 0.0 {
            break;
        }

        cumulative_factor += min_delta_lambda;

        // Update accumulated moments
        for ef in &results.element_forces {
            *accumulated_moments.entry((ef.element_id, "start".to_string())).or_insert(0.0) += min_delta_lambda * ef.m_start;
            *accumulated_moments.entry((ef.element_id, "end".to_string())).or_insert(0.0) += min_delta_lambda * ef.m_end;
        }

        // Scale results by delta_lambda
        let scaled_results = scale_results(&results, min_delta_lambda);

        // Record hinges
        let mut step_hinges = Vec::new();
        for (eid, end, _m_unit) in &new_hinges {
            let mp = mp_map.get(
                &current_input.elements.values().find(|e| e.id == *eid).unwrap().section_id
            ).copied().unwrap_or(0.0);

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
            if let Some(elem) = current_input.elements.values_mut().find(|e| e.id == *eid) {
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
            thermal_n_fef: ef.thermal_n_fef * factor,
            thermal_mz_fef: ef.thermal_mz_fef * factor,
        }).collect(),
    }
}
