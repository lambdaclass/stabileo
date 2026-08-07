//! Shared parameter validation for dynamic-analysis entry points.

use crate::types::{SolverInput, SolverInput3D};
use std::collections::{HashMap, HashSet};

/// Material ids referenced by any 2D element — the only ids whose density
/// actually contributes mass to the assembled model.
pub(crate) fn referenced_material_ids_2d(input: &SolverInput) -> HashSet<usize> {
    input.elements.values().map(|e| e.material_id).collect()
}

/// Material ids referenced by any 3D element, including shell families
/// (plates/quads/quad9s/solid-shells/curved-shells), which carry mass too.
pub(crate) fn referenced_material_ids_3d(input: &SolverInput3D) -> HashSet<usize> {
    let mut ids: HashSet<usize> = input.elements.values().map(|e| e.material_id).collect();
    ids.extend(input.plates.values().map(|p| p.material_id));
    ids.extend(input.quads.values().map(|q| q.material_id));
    ids.extend(input.quad9s.values().map(|q| q.material_id));
    ids.extend(input.solid_shells.values().map(|s| s.material_id));
    ids.extend(input.curved_shells.values().map(|c| c.material_id));
    ids.extend(input.curved_beams.iter().map(|c| c.material_id));
    ids
}

/// Densities must be finite and >= 0 for every entry present (missing entries
/// for individual materials are legitimate — massless members are a valid
/// modeling choice and default to 0). At least one material that is actually
/// *referenced by an element in the model* must have a density > 0, otherwise
/// the assembled mass matrix is all-zero and dynamic analysis is meaningless
/// (mass assembly looks up `densities.get(&material_id.to_string())`, so a
/// density keyed to a material no element uses silently contributes nothing).
pub(crate) fn validate_densities(
    densities: &HashMap<String, f64>,
    referenced_material_ids: &HashSet<usize>,
) -> Result<(), String> {
    for (id, &rho) in densities {
        if !rho.is_finite() || rho < 0.0 {
            return Err(format!(
                "Density for material {}: must be finite and >= 0 (got {})", id, rho
            ));
        }
    }
    let any_positive = referenced_material_ids.iter().any(|id| {
        densities.get(&id.to_string()).copied().unwrap_or(0.0) > 0.0
    });
    if !any_positive {
        return Err(
            "No positive density on any material used by elements — dynamic analysis needs mass \
             (check density map keys match material ids)".to_string(),
        );
    }
    Ok(())
}

pub(crate) fn validate_time_params(time_step: f64, n_steps: usize) -> Result<(), String> {
    if !time_step.is_finite() || time_step <= 0.0 {
        return Err(format!("time_step must be finite and > 0 (got {})", time_step));
    }
    if n_steps == 0 {
        return Err("n_steps must be >= 1".to_string());
    }
    Ok(())
}
