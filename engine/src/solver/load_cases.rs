use crate::types::*;
use crate::solver::linear::{prepare_static_2d, prepare_static_3d, solve_3d};
use crate::postprocess::combinations::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCase {
    pub name: String,
    pub loads: Vec<SolverLoad>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCase3D {
    pub name: String,
    pub loads: Vec<SolverLoad3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinationDef {
    pub name: String,
    /// Map from case name to factor, e.g. {"Dead": 1.2, "Live": 1.6}
    pub factors: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiCaseInput {
    pub solver: SolverInput,
    pub load_cases: Vec<LoadCase>,
    pub combinations: Vec<CombinationDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiCaseInput3D {
    pub solver: SolverInput3D,
    pub load_cases: Vec<LoadCase3D>,
    pub combinations: Vec<CombinationDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseResult {
    pub name: String,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseResult3D {
    pub name: String,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinedResult {
    pub name: String,
    pub results: AnalysisResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombinedResult3D {
    pub name: String,
    pub results: AnalysisResults3D,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiCaseResult {
    pub case_results: Vec<CaseResult>,
    pub combination_results: Vec<CombinedResult>,
    pub envelope: FullEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiCaseResult3D {
    pub case_results: Vec<CaseResult3D>,
    pub combination_results: Vec<CombinedResult3D>,
    pub envelope: FullEnvelope3D,
}

// ==================== 2D Multi-Case Solver ====================

pub fn solve_multi_case_2d(input: &MultiCaseInput) -> Result<MultiCaseResult, String> {
    if input.load_cases.is_empty() {
        return Err("No load cases defined".into());
    }
    if input.combinations.is_empty() {
        return Err("No combinations defined".into());
    }

    // Prepare the structure once (assembly + factorization of K).
    // Historical behavior: constraints and connectors are ignored in
    // multi-case 2D, and only the per-case load lists are used.
    let mut solver = input.solver.clone();
    solver.loads = vec![];
    solver.constraints = vec![];
    solver.connectors = HashMap::new();

    let prepared = prepare_static_2d(&solver)
        .map_err(|e| format!("Failed to solve case '{}': {}", input.load_cases[0].name, e))?;

    // Solve each load case with the shared factorization
    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let results = prepared.solve_loads(&lc.loads)
            .map_err(|e| format!("Failed to solve case '{}': {}", lc.name, e))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult {
            name: lc.name.clone(),
            results,
        });
    }

    // Generate combined results for each combination (borrowing case results)
    let case_refs: Vec<(usize, &AnalysisResults)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    let mut combo_names: Vec<String> = Vec::new();
    let mut all_combined_results: Vec<AnalysisResults> = Vec::new();

    for combo in &input.combinations {
        let mut combo_factors = Vec::new();
        for (case_name, &factor) in &combo.factors {
            if let Some(&idx) = case_map.get(case_name) {
                combo_factors.push(CombinationFactor {
                    case_id: idx,
                    factor,
                });
            }
        }

        if let Some(combined) = combine_results_refs(&combo_factors, &case_refs) {
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

    // Compute envelope from all combination results
    let envelope = compute_envelope(&all_combined_results)
        .ok_or_else(|| "Failed to compute envelope".to_string())?;

    let combination_results = combo_names
        .into_iter()
        .zip(all_combined_results)
        .map(|(name, results)| CombinedResult { name, results })
        .collect();

    Ok(MultiCaseResult {
        case_results,
        combination_results,
        envelope,
    })
}

// ==================== 3D Multi-Case Solver ====================

pub fn solve_multi_case_3d(input: &MultiCaseInput3D) -> Result<MultiCaseResult3D, String> {
    if input.load_cases.is_empty() {
        return Err("No load cases defined".into());
    }
    if input.combinations.is_empty() {
        return Err("No combinations defined".into());
    }

    // Constraints delegate to the constrained solver per case — keep the
    // legacy per-case path for that (rare) configuration.
    if !input.solver.constraints.is_empty() {
        return solve_multi_case_3d_per_case(input);
    }

    // Prepare the structure once (assembly + factorization of K).
    // Historical behavior: connectors are ignored in multi-case 3D, and only
    // the per-case load lists are used.
    let mut solver = input.solver.clone();
    solver.loads = vec![];
    solver.connectors = HashMap::new();

    let prepared = prepare_static_3d(&solver)
        .map_err(|e| format!("Failed to solve case '{}': {}", input.load_cases[0].name, e))?;

    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let results = prepared.solve_loads(&lc.loads)
            .map_err(|e| format!("Failed to solve case '{}': {}", lc.name, e))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult3D {
            name: lc.name.clone(),
            results,
        });
    }

    let case_refs: Vec<(usize, &AnalysisResults3D)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    let mut combo_names: Vec<String> = Vec::new();
    let mut all_combined_results: Vec<AnalysisResults3D> = Vec::new();

    for combo in &input.combinations {
        let mut combo_factors = Vec::new();
        for (case_name, &factor) in &combo.factors {
            if let Some(&idx) = case_map.get(case_name) {
                combo_factors.push(CombinationFactor {
                    case_id: idx,
                    factor,
                });
            }
        }

        if let Some(combined) = combine_results_3d_refs(&combo_factors, &case_refs) {
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

    let envelope = compute_envelope_3d(&all_combined_results)
        .ok_or_else(|| "Failed to compute envelope".to_string())?;

    let combination_results = combo_names
        .into_iter()
        .zip(all_combined_results)
        .map(|(name, results)| CombinedResult3D { name, results })
        .collect();

    Ok(MultiCaseResult3D {
        case_results,
        combination_results,
        envelope,
    })
}

/// Legacy per-case 3D multi-case path: one full `solve_3d` per load case.
/// Retained for models with constraints (which delegate to the constrained
/// solver per case load set).
fn solve_multi_case_3d_per_case(input: &MultiCaseInput3D) -> Result<MultiCaseResult3D, String> {
    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let case_input = SolverInput3D {
            nodes: input.solver.nodes.clone(),
            materials: input.solver.materials.clone(),
            sections: input.solver.sections.clone(),
            elements: input.solver.elements.clone(),
            supports: input.solver.supports.clone(),
            loads: lc.loads.clone(),
                        left_hand: input.solver.left_hand,
            plates: input.solver.plates.clone(),
            quads: input.solver.quads.clone(),
            quad9s: input.solver.quad9s.clone(),
            solid_shells: input.solver.solid_shells.clone(),
            curved_shells: input.solver.curved_shells.clone(),
            curved_beams: input.solver.curved_beams.clone(),
            constraints: input.solver.constraints.clone(),
            connectors: HashMap::new(),
        };

        let results = solve_3d(&case_input)
            .map_err(|e| format!("Failed to solve case '{}': {}", lc.name, e))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult3D {
            name: lc.name.clone(),
            results,
        });
    }

    let case_refs: Vec<(usize, &AnalysisResults3D)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    let mut combo_names: Vec<String> = Vec::new();
    let mut all_combined_results: Vec<AnalysisResults3D> = Vec::new();

    for combo in &input.combinations {
        let mut combo_factors = Vec::new();
        for (case_name, &factor) in &combo.factors {
            if let Some(&idx) = case_map.get(case_name) {
                combo_factors.push(CombinationFactor {
                    case_id: idx,
                    factor,
                });
            }
        }

        if let Some(combined) = combine_results_3d_refs(&combo_factors, &case_refs) {
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

    let envelope = compute_envelope_3d(&all_combined_results)
        .ok_or_else(|| "Failed to compute envelope".to_string())?;

    let combination_results = combo_names
        .into_iter()
        .zip(all_combined_results)
        .map(|(name, results)| CombinedResult3D { name, results })
        .collect();

    Ok(MultiCaseResult3D {
        case_results,
        combination_results,
        envelope,
    })
}
