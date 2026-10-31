use crate::types::*;
use crate::solver::linear::{prepare_static_2d, prepare_static_3d, solve_2d, solve_3d};
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

/// Fail fast when a combination references a load case that does not exist.
/// An unknown case name used to be silently dropped from the combination,
/// producing a combined result (and envelope) missing that case's
/// contribution, presented as final.
///
/// Also fail fast on duplicate load case names: the case lookup map keeps
/// only the last case with a given name, so a combination factor would
/// silently drop the earlier case's contribution.
fn validate_combination_case_names<'a>(
    load_case_names: impl Iterator<Item = &'a str>,
    combinations: &[CombinationDef],
) -> Result<(), String> {
    let mut names: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for name in load_case_names {
        if !names.insert(name) {
            return Err(format!("Duplicate load case name '{}'", name));
        }
    }
    for combo in combinations {
        for case_name in combo.factors.keys() {
            if !names.contains(case_name.as_str()) {
                return Err(format!(
                    "Combination '{}' references unknown load case '{}'",
                    combo.name, case_name
                ));
            }
        }
    }
    Ok(())
}

// ==================== 2D Multi-Case Solver ====================

pub fn solve_multi_case_2d(input: &MultiCaseInput) -> Result<MultiCaseResult, String> {
    if input.load_cases.is_empty() {
        return Err("No load cases defined".into());
    }
    if input.combinations.is_empty() {
        return Err("No combinations defined".into());
    }
    validate_combination_case_names(
        input.load_cases.iter().map(|lc| lc.name.as_str()),
        &input.combinations,
    )?;

    // Constraints delegate to the constrained solver per case — keep the
    // legacy per-case path for that (rare) configuration, mirroring the 3D
    // multi-case entry point. Clearing them here would silently solve the
    // unconstrained structure and present the results as final.
    if !input.solver.constraints.is_empty() {
        return solve_multi_case_2d_per_case(input);
    }

    // Prepare the structure once (assembly + factorization of K).
    // Connectors are load-independent stiffness: they stay in the prepared
    // structure exactly as a single `solve_2d` would assemble them. Only the
    // per-case load lists replace the model's own load list.
    let mut solver = input.solver.clone();
    solver.loads = vec![];

    let prepared = prepare_static_2d(&solver)
        .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", input.load_cases[0].name)))?;
    let settlement_only = if has_settlement_2d(&solver) { Some(prepared.solve_loads(&[])?) } else { None };

    // Solve each load case with the shared factorization
    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let results = prepared.solve_loads(&lc.loads)
            .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", lc.name)))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult {
            name: lc.name.clone(),
            results,
        });
    }

    // Generate combined results for each combination (borrowing case results)
    let mut case_refs: Vec<(usize, &AnalysisResults)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    // Prescribed support displacements are part of the model, so every
    // case's solution carries them once; a combination Σ f_c·R_c then
    // carried them Σ f_c times (twice for 1.0·A + 1.0·B — found by the
    // metamorphic linear-agreement check). The settlement-only solution
    // R_0 enters each combination with 1 − Σ f_c, so it counts once.
    let settle_idx = case_refs.len();
    if let Some(r0) = settlement_only.as_ref() {
        case_refs.push((settle_idx, r0));
    }
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
        if settlement_only.is_some() {
            let sum: f64 = combo_factors.iter().map(|f| f.factor).sum();
            combo_factors.push(CombinationFactor { case_id: settle_idx, factor: 1.0 - sum });
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
    validate_combination_case_names(
        input.load_cases.iter().map(|lc| lc.name.as_str()),
        &input.combinations,
    )?;

    // Constraints delegate to the constrained solver per case — keep the
    // legacy per-case path for that (rare) configuration.
    if !input.solver.constraints.is_empty() {
        return solve_multi_case_3d_per_case(input);
    }

    // Prepare the structure once (assembly + factorization of K).
    // Connectors are load-independent stiffness: they stay in the prepared
    // structure exactly as a single `solve_3d` would assemble them. Only the
    // per-case load lists replace the model's own load list.
    let mut solver = input.solver.clone();
    solver.loads = vec![];

    let prepared = prepare_static_3d(&solver)
        .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", input.load_cases[0].name)))?;
    let settlement_only = if has_settlement_3d(&solver) { Some(prepared.solve_loads(&[])?) } else { None };

    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let results = prepared.solve_loads(&lc.loads)
            .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", lc.name)))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult3D {
            name: lc.name.clone(),
            results,
        });
    }

    let mut case_refs: Vec<(usize, &AnalysisResults3D)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    // Prescribed support displacements are part of the model, so every
    // case's solution carries them once; a combination Σ f_c·R_c then
    // carried them Σ f_c times (twice for 1.0·A + 1.0·B — found by the
    // metamorphic linear-agreement check). The settlement-only solution
    // R_0 enters each combination with 1 − Σ f_c, so it counts once.
    let settle_idx = case_refs.len();
    if let Some(r0) = settlement_only.as_ref() {
        case_refs.push((settle_idx, r0));
    }
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
        if settlement_only.is_some() {
            let sum: f64 = combo_factors.iter().map(|f| f.factor).sum();
            combo_factors.push(CombinationFactor { case_id: settle_idx, factor: 1.0 - sum });
        }

        if let Some(combined) = combine_results_3d_refs_unchecked(&combo_factors, &case_refs) {
            check_combined_containment(input, combo, &combo_factors, &case_refs, &combined)?;
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

    let envelope = compute_envelope_3d_checked(&all_combined_results)
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
    let settlement_only = if has_settlement_3d(&input.solver) {
        let mut s = input.solver.clone();
        s.loads = vec![];
        Some(solve_3d(&s)?)
    } else {
        None
    };
    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let case_input = SolverInput3D {
            solver_options: input.solver.solver_options.clone(), masses: input.solver.masses.clone(),
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
            connectors: input.solver.connectors.clone(),
        };

        let results = solve_3d(&case_input)
            .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", lc.name)))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult3D {
            name: lc.name.clone(),
            results,
        });
    }

    let mut case_refs: Vec<(usize, &AnalysisResults3D)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    // Prescribed support displacements are part of the model, so every
    // case's solution carries them once; a combination Σ f_c·R_c then
    // carried them Σ f_c times (twice for 1.0·A + 1.0·B — found by the
    // metamorphic linear-agreement check). The settlement-only solution
    // R_0 enters each combination with 1 − Σ f_c, so it counts once.
    let settle_idx = case_refs.len();
    if let Some(r0) = settlement_only.as_ref() {
        case_refs.push((settle_idx, r0));
    }
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
        if settlement_only.is_some() {
            let sum: f64 = combo_factors.iter().map(|f| f.factor).sum();
            combo_factors.push(CombinationFactor { case_id: settle_idx, factor: 1.0 - sum });
        }

        if let Some(combined) = combine_results_3d_refs_unchecked(&combo_factors, &case_refs) {
            check_combined_containment(input, combo, &combo_factors, &case_refs, &combined)?;
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

    let envelope = compute_envelope_3d_checked(&all_combined_results)
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

/// Legacy per-case 2D multi-case path: one full `solve_2d` per load case
/// (which auto-delegates to the constrained solver). Retained for models with
/// constraints, mirroring `solve_multi_case_3d_per_case`.
fn solve_multi_case_2d_per_case(input: &MultiCaseInput) -> Result<MultiCaseResult, String> {
    let settlement_only = if has_settlement_2d(&input.solver) {
        let mut s = input.solver.clone();
        s.loads = vec![];
        Some(solve_2d(&s)?)
    } else {
        None
    };
    let mut case_results = Vec::new();
    let mut case_map: HashMap<String, usize> = HashMap::new();

    for (idx, lc) in input.load_cases.iter().enumerate() {
        let case_input = SolverInput {
            solver_options: input.solver.solver_options.clone(), masses: input.solver.masses.clone(),
            nodes: input.solver.nodes.clone(),
            materials: input.solver.materials.clone(),
            sections: input.solver.sections.clone(),
            elements: input.solver.elements.clone(),
            supports: input.solver.supports.clone(),
            loads: lc.loads.clone(),
            constraints: input.solver.constraints.clone(),
            connectors: input.solver.connectors.clone(),
        };

        let results = solve_2d(&case_input)
            .map_err(|e| crate::known_issues::contextual_error(e, format!("Failed to solve case '{}'", lc.name)))?;

        case_map.insert(lc.name.clone(), idx);
        case_results.push(CaseResult {
            name: lc.name.clone(),
            results,
        });
    }

    let mut case_refs: Vec<(usize, &AnalysisResults)> = case_results
        .iter()
        .enumerate()
        .map(|(idx, cr)| (idx, &cr.results))
        .collect();
    // Prescribed support displacements are part of the model, so every
    // case's solution carries them once; a combination Σ f_c·R_c then
    // carried them Σ f_c times (twice for 1.0·A + 1.0·B — found by the
    // metamorphic linear-agreement check). The settlement-only solution
    // R_0 enters each combination with 1 − Σ f_c, so it counts once.
    let settle_idx = case_refs.len();
    if let Some(r0) = settlement_only.as_ref() {
        case_refs.push((settle_idx, r0));
    }
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
        if settlement_only.is_some() {
            let sum: f64 = combo_factors.iter().map(|f| f.factor).sum();
            combo_factors.push(CombinationFactor { case_id: settle_idx, factor: 1.0 - sum });
        }

        if let Some(combined) = combine_results_refs(&combo_factors, &case_refs) {
            all_combined_results.push(combined);
            combo_names.push(combo.name.clone());
        }
    }

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

fn has_settlement_2d(s: &SolverInput) -> bool {
    crate::ordered::values(&s.supports).any(|x| [x.dx, x.dz, x.dry].iter().any(|d| d.is_some_and(|v| v != 0.0)))
}

fn has_settlement_3d(s: &SolverInput3D) -> bool {
    crate::ordered::values(&s.supports).any(|x| [x.dx, x.dy, x.dz, x.drx, x.dry, x.drz].iter().any(|d| d.is_some_and(|v| v != 0.0)))
}

fn check_combined_containment(input: &MultiCaseInput3D, combo: &CombinationDef, factors: &[CombinationFactor], cases: &[(usize, &AnalysisResults3D)], result: &AnalysisResults3D) -> Result<(), String> {
    for (_, case) in cases.iter().filter(|(id, _)| factors.iter().any(|f| f.case_id == *id && f.factor != 0.0)) {
        crate::known_issues::refuse(&case.structured_diagnostics)?;
    }
    let mut thermal = Vec::new();
    for case in &input.load_cases {
        let factor = combo.factors.get(&case.name).copied().unwrap_or(0.0);
        for load in &case.loads {
            if let SolverLoad3D::QuadThermal(t) = load {
                let mut t = t.clone();
                t.dt_uniform *= factor;
                t.dt_gradient *= factor;
                thermal.push(SolverLoad3D::QuadThermal(t));
            }
        }
    }
    crate::known_issues::membrane_bending_3d(&input.solver, &thermal, result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cantilever() -> SolverInput3D {
        serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":1,"y":0,"z":0}},
            "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.00001}},
            "supports": {"1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
            "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":-1,"mx":0,"my":0,"mz":0}}]
        })).unwrap()
    }

    #[test]
    fn a_combination_refuses_a_contributing_case_that_carries_a_refusal() {
        let solver = cantilever();
        let clean = solve_3d(&solver).unwrap();
        let mut refused = clean.clone();
        refused.structured_diagnostics.push(crate::known_issues::diagnostic("BU-BOUND"));
        let input = MultiCaseInput3D { solver, load_cases: vec![], combinations: vec![] };
        let combo = CombinationDef { name: "C".into(), factors: HashMap::new() };
        let cases = [(0, &refused), (1, &clean)];
        let with = [CombinationFactor { case_id: 0, factor: 1.0 }, CombinationFactor { case_id: 1, factor: 1.0 }];
        let error = check_combined_containment(&input, &combo, &with, &cases, &clean).unwrap_err();
        assert!(error.contains("BU-BOUND"), "{error}");
        let without = [CombinationFactor { case_id: 0, factor: 0.0 }, CombinationFactor { case_id: 1, factor: 1.0 }];
        check_combined_containment(&input, &combo, &without, &cases, &clean).unwrap();
    }
}
