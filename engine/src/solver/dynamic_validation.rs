//! Shared parameter validation for dynamic-analysis entry points.

use crate::types::{SolverInput, SolverInput3D};
use std::collections::{HashMap, HashSet};

/// Material ids referenced by any 2D element — the only ids whose density
/// actually contributes mass to the assembled model.
pub(crate) fn referenced_material_ids_2d(input: &SolverInput) -> HashSet<usize> {
    crate::ordered::values(&input.elements).map(|e| e.material_id).collect()
}

/// Material ids referenced by any 3D element, including shell families
/// (plates/quads/quad9s/solid-shells/curved-shells), which carry mass too.
pub(crate) fn referenced_material_ids_3d(input: &SolverInput3D) -> HashSet<usize> {
    let mut ids: HashSet<usize> = crate::ordered::values(&input.elements).map(|e| e.material_id).collect();
    ids.extend(crate::ordered::values(&input.plates).map(|p| p.material_id));
    ids.extend(crate::ordered::values(&input.quads).map(|q| q.material_id));
    ids.extend(crate::ordered::values(&input.quad9s).map(|q| q.material_id));
    ids.extend(crate::ordered::values(&input.solid_shells).map(|s| s.material_id));
    ids.extend(crate::ordered::values(&input.curved_shells).map(|c| c.material_id));
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
/// `other_mass`: the model carries positive nodal, line or area mass, so it
/// has a mass matrix without any density.
fn validate_densities(
    densities: &HashMap<String, f64>,
    referenced_material_ids: &HashSet<usize>,
    other_mass: bool,
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
    if !any_positive && !other_mass {
        return Err(
            "No positive density on any material used by elements and no nodal, line or area \
             mass — dynamic analysis needs mass (check density map keys match material ids)".to_string(),
        );
    }
    Ok(())
}

fn check_mass_value(what: &str, v: f64) -> Result<(), String> {
    if !v.is_finite() || v < 0.0 {
        return Err(format!("{what}: must be finite and >= 0 (got {v})"));
    }
    Ok(())
}

/// Nodal and line masses of a 2D model: on existing nodes and members,
/// finite and non-negative. Returns whether any of them is positive.
fn validate_masses_2d(input: &SolverInput) -> Result<bool, String> {
    let nodes: HashSet<usize> = crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let elems: HashMap<usize, &crate::types::SolverElement> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let mut any = false;
    for nm in &input.masses.nodal {
        if !nodes.contains(&nm.node_id) {
            return Err(format!("Nodal mass on node {}, which does not exist", nm.node_id));
        }
        let what = format!("Nodal mass on node {}", nm.node_id);
        for v in [nm.mass, nm.mx(), nm.mz(), nm.rotary_inertia] {
            check_mass_value(&what, v)?;
        }
        any |= nm.mx() > 0.0 || nm.mz() > 0.0 || nm.rotary_inertia > 0.0;
    }
    for lm in &input.masses.line {
        if !elems.contains_key(&lm.element_id) {
            return Err(format!("Line mass on element {}, which does not exist", lm.element_id));
        }
        check_mass_value(&format!("Line mass on element {}", lm.element_id), lm.mass_per_length)?;
        any |= lm.mass_per_length > 0.0;
    }
    Ok(any)
}

/// Nodal, line and area masses of a 3D model (see `validate_masses_2d`).
/// An area mass names a plate, quad, quad9 or curved shell with a positive
/// thickness (it is spread over that thickness).
fn validate_masses_3d(input: &SolverInput3D) -> Result<bool, String> {
    let nodes: HashSet<usize> = crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let elems: HashSet<usize> = crate::ordered::values(&input.elements).map(|e| e.id).collect();
    let mut any = false;
    for nm in &input.masses.nodal {
        if !nodes.contains(&nm.node_id) {
            return Err(format!("Nodal mass on node {}, which does not exist", nm.node_id));
        }
        let what = format!("Nodal mass on node {}", nm.node_id);
        let t = nm.translational();
        for v in [nm.mass, t[0], t[1], t[2], nm.ixx, nm.iyy, nm.izz] {
            check_mass_value(&what, v)?;
        }
        any |= t.iter().chain([nm.ixx, nm.iyy, nm.izz].iter()).any(|&v| v > 0.0);
    }
    for lm in &input.masses.line {
        if !elems.contains(&lm.element_id) {
            return Err(format!(
                "Line mass on element {}, which is not a member (curved beams take their mass from density)",
                lm.element_id
            ));
        }
        check_mass_value(&format!("Line mass on element {}", lm.element_id), lm.mass_per_length)?;
        any |= lm.mass_per_length > 0.0;
    }
    // Thickness by id, one map per shell family, built once: a search per
    // area mass made this quadratic in the number of shells.
    let by_id = |it: &mut dyn Iterator<Item = (usize, f64)>| -> HashMap<usize, f64> { it.collect() };
    let (quads, plates, quad9s, curved) = if input.masses.area.is_empty() {
        Default::default()
    } else {
        (
            by_id(&mut crate::ordered::values(&input.quads).map(|q| (q.id, q.thickness))),
            by_id(&mut crate::ordered::values(&input.plates).map(|q| (q.id, q.thickness))),
            by_id(&mut crate::ordered::values(&input.quad9s).map(|q| (q.id, q.thickness))),
            by_id(&mut crate::ordered::values(&input.curved_shells).map(|q| (q.id, q.thickness))),
        )
    };
    for am in &input.masses.area {
        let thickness = match am.kind.as_str() {
            "quad" => quads.get(&am.element_id).copied(),
            "plate" => plates.get(&am.element_id).copied(),
            "quad9" => quad9s.get(&am.element_id).copied(),
            "curvedShell" => curved.get(&am.element_id).copied(),
            other => return Err(format!(
                "Area mass on element {}: unknown kind \"{other}\" (quad, plate, quad9 or curvedShell)",
                am.element_id
            )),
        };
        let Some(t) = thickness else {
            return Err(format!("Area mass on {} {}, which does not exist", am.kind, am.element_id));
        };
        if !(t > 0.0) {
            return Err(format!("Area mass on {} {}: the shell has no thickness to carry it", am.kind, am.element_id));
        }
        check_mass_value(&format!("Area mass on {} {}", am.kind, am.element_id), am.mass_per_area)?;
        any |= am.mass_per_area > 0.0;
    }
    Ok(any)
}

/// The nodal and line masses of a 2D model are well formed (see
/// `validate_masses_2d`), for an analysis that reads them but does not need
/// mass to be present (spectral with given modes, reduction).
pub(crate) fn validate_mass_input_2d(input: &SolverInput) -> Result<(), String> {
    validate_masses_2d(input).map(|_| ())
}

/// The nodal, line and area masses of a 3D model are well formed.
pub(crate) fn validate_mass_input_3d(input: &SolverInput3D) -> Result<(), String> {
    validate_masses_3d(input).map(|_| ())
}

/// The mass of a 2D model: densities (see `validate_densities`) and nodal and
/// line masses. Some mass must be positive.
pub(crate) fn validate_mass_2d(input: &SolverInput, densities: &HashMap<String, f64>) -> Result<(), String> {
    let other = validate_masses_2d(input)?;
    validate_densities(densities, &referenced_material_ids_2d(input), other)
}

/// The mass of a 3D model: densities and nodal, line and area masses.
pub(crate) fn validate_mass_3d(input: &SolverInput3D, densities: &HashMap<String, f64>) -> Result<(), String> {
    let other = validate_masses_3d(input)?;
    validate_densities(densities, &referenced_material_ids_3d(input), other)
}

pub(crate) fn validate_time_params(time_step: f64, n_steps: usize) -> Result<(), String> {
    if !time_step.is_finite() || time_step <= 0.0 {
        return Err(format!("time_step must be finite and > 0 (got {})", time_step));
    }
    if n_steps == 0 {
        return Err("n_steps must be >= 1".to_string());
    }
    if n_steps > MAX_TIME_STEPS {
        return Err(format!("n_steps must be <= {} (got {})", MAX_TIME_STEPS, n_steps));
    }
    Ok(())
}

/// Most time steps one time-history run may take. The count comes from the
/// model and sizes the stored response history (steps × DOFs).
pub const MAX_TIME_STEPS: usize = 200_000;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    /// A 3D model of `n` quads, each with an area mass.
    fn many_quads(n: usize) -> SolverInput3D {
        let mut input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {}, "materials": {}, "sections": {}, "elements": {}, "supports": {}, "loads": []
        })).unwrap();
        for k in 0..4 {
            input.nodes.insert(k.to_string(), SolverNode3D { id: k, x: k as f64, y: 0.0, z: 0.0 });
        }
        for id in 0..n {
            input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [0, 1, 2, 3], material_id: 1, thickness: 0.2 });
            input.masses.area.push(AreaMass { element_id: id, kind: "quad".into(), mass_per_area: 0.3 });
        }
        input
    }

    #[test]
    #[ignore = "wall clock: runs alone in Engine Gates (make test.engine.gates)"]
    fn area_mass_validation_is_linear_in_the_number_of_shells() {
        // 40 000 quads: a search per entry is 8·10⁸ map visits (seconds);
        // a lookup per entry is milliseconds. 1 s is far from both.
        let input = many_quads(40_000);
        let t = std::time::Instant::now();
        assert!(validate_masses_3d(&input).unwrap());
        let dt = t.elapsed();
        assert!(dt.as_secs_f64() < 1.0, "area-mass validation of 40 000 quads took {dt:?}");
    }
}
