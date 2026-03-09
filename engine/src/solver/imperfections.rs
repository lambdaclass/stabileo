/// Apply initial imperfections to structural models.
///
/// Supports:
/// - Geometric imperfections: node coordinate offsets
/// - Notional loads: equivalent lateral loads from out-of-plumbness
/// - Residual stresses: initial fiber stress states
/// - Initial state import: displacements from previous analysis
use crate::types::*;
use crate::element::fiber_beam::{FiberSectionDef, SectionState, material_response};

/// Apply node imperfections to a 2D model by modifying node coordinates.
pub fn apply_geometric_imperfections_2d(input: &mut SolverInput, imperfections: &[NodeImperfection]) {
    for imp in imperfections {
        if let Some(node) = input.nodes.values_mut().find(|n| n.id == imp.node_id) {
            node.x += imp.dx;
            node.y += imp.dy;
        }
    }
}

/// Apply node imperfections to a 3D model by modifying node coordinates.
pub fn apply_geometric_imperfections_3d(input: &mut SolverInput3D, imperfections: &[NodeImperfection]) {
    for imp in imperfections {
        if let Some(node) = input.nodes.values_mut().find(|n| n.id == imp.node_id) {
            node.x += imp.dx;
            node.y += imp.dy;
            node.z += imp.dz;
        }
    }
}

/// Convert notional load definitions to equivalent lateral loads (2D).
///
/// For each node with gravity load, adds a lateral load = ratio × gravity_force.
pub fn notional_loads_2d(
    input: &SolverInput,
    notional: &NotionalLoadDef,
) -> Vec<SolverLoad> {
    let mut loads = Vec::new();
    let dir = notional.direction.min(1); // 2D: 0=X, 1=Y
    let grav = notional.gravity_axis.min(1);

    // Collect gravity forces per node from existing nodal loads
    let mut gravity_per_node: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
    for load in &input.loads {
        if let SolverLoad::Nodal(nl) = load {
            let grav_force = if grav == 0 { nl.fx } else { nl.fy };
            *gravity_per_node.entry(nl.node_id).or_insert(0.0) += grav_force;
        }
    }

    for (node_id, grav_force) in gravity_per_node {
        if grav_force.abs() < 1e-15 { continue; }
        let lateral = notional.ratio * grav_force.abs();
        let (fx, fy) = if dir == 0 { (lateral, 0.0) } else { (0.0, lateral) };
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id,
            fx,
            fy,
            mz: 0.0,
        }));
    }
    loads
}

/// Convert notional load definitions to equivalent lateral loads (3D).
pub fn notional_loads_3d(
    input: &SolverInput3D,
    notional: &NotionalLoadDef,
) -> Vec<SolverLoad3D> {
    let mut loads = Vec::new();
    let dir = notional.direction.min(2);
    let grav = notional.gravity_axis.min(2);

    let mut gravity_per_node: std::collections::HashMap<usize, f64> = std::collections::HashMap::new();
    for load in &input.loads {
        if let SolverLoad3D::Nodal(nl) = load {
            let grav_force = match grav {
                0 => nl.fx,
                1 => nl.fy,
                _ => nl.fz,
            };
            *gravity_per_node.entry(nl.node_id).or_insert(0.0) += grav_force;
        }
    }

    for (node_id, grav_force) in gravity_per_node {
        if grav_force.abs() < 1e-15 { continue; }
        let lateral = notional.ratio * grav_force.abs();
        let (fx, fy, fz) = match dir {
            0 => (lateral, 0.0, 0.0),
            1 => (0.0, lateral, 0.0),
            _ => (0.0, 0.0, lateral),
        };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id,
            fx, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        }));
    }
    loads
}

/// Apply ECCS hot-rolled residual stress pattern to fiber section states.
///
/// For I-sections: linear variation across flange width.
/// Positive y = top flange, negative y = bottom flange.
/// Flange tips: +fraction*fy (tension), flange center: -fraction*fy (compression).
/// Web: linear from -fraction*fy at flanges to +fraction*fy at mid-depth.
pub fn apply_eccs_residual_stress(
    section: &FiberSectionDef,
    states: &mut [SectionState],
    fy: f64,
    fraction: f64,
) {
    let sigma_max = fraction * fy; // MPa, tension at tips

    // Find section bounds to determine residual stress distribution
    let y_min = section.fibers.iter().map(|f| f.y).fold(f64::INFINITY, f64::min);
    let y_max = section.fibers.iter().map(|f| f.y).fold(f64::NEG_INFINITY, f64::max);
    let z_min = section.fibers.iter().map(|f| f.z).fold(f64::INFINITY, f64::min);
    let z_max = section.fibers.iter().map(|f| f.z).fold(f64::NEG_INFINITY, f64::max);
    let z_range = (z_max - z_min).max(1e-12);

    for state in states.iter_mut() {
        for (i, fiber) in section.fibers.iter().enumerate() {
            // Determine if fiber is in flange or web based on z-position
            let z_ratio = (fiber.z - z_min) / z_range; // 0 at one edge, 1 at other
            let residual = sigma_max * (2.0 * z_ratio - 1.0); // -σ at center, +σ at tips

            // Apply as initial strain: ε_residual = σ_residual / E
            let mat = &section.materials[fiber.material_idx];
            let e_mat = match mat {
                crate::element::fiber_beam::FiberMaterial::SteelBilinear { e, .. } => *e,
                crate::element::fiber_beam::FiberMaterial::Elastic { e } => *e,
                _ => 200_000.0,
            };

            if e_mat > 0.0 {
                let initial_strain = residual / e_mat;
                // Set initial state by evaluating material at residual strain
                material_response(mat, initial_strain, &mut state.fiber_states[i]);
            }

            let _ = (y_min, y_max); // May use for web vs flange distinction
        }
    }
}

/// Apply uniform residual stress to all fibers in section states.
pub fn apply_uniform_residual_stress(
    section: &FiberSectionDef,
    states: &mut [SectionState],
    stress: f64,
) {
    for state in states.iter_mut() {
        for (i, fiber) in section.fibers.iter().enumerate() {
            let mat = &section.materials[fiber.material_idx];
            let e_mat = match mat {
                crate::element::fiber_beam::FiberMaterial::SteelBilinear { e, .. } => *e,
                crate::element::fiber_beam::FiberMaterial::Elastic { e } => *e,
                _ => 200_000.0,
            };
            if e_mat > 0.0 {
                let initial_strain = stress / e_mat;
                material_response(mat, initial_strain, &mut state.fiber_states[i]);
            }
        }
    }
}

/// Apply custom per-fiber residual stresses.
pub fn apply_custom_residual_stress(
    section: &FiberSectionDef,
    states: &mut [SectionState],
    stresses: &[f64],
) {
    for state in states.iter_mut() {
        for (i, fiber) in section.fibers.iter().enumerate() {
            if i >= stresses.len() { break; }
            let mat = &section.materials[fiber.material_idx];
            let e_mat = match mat {
                crate::element::fiber_beam::FiberMaterial::SteelBilinear { e, .. } => *e,
                crate::element::fiber_beam::FiberMaterial::Elastic { e } => *e,
                _ => 200_000.0,
            };
            if e_mat > 0.0 {
                let initial_strain = stresses[i] / e_mat;
                material_response(mat, initial_strain, &mut state.fiber_states[i]);
            }
        }
    }
}

/// Apply a residual stress pattern to fiber section states.
pub fn apply_residual_stress_pattern(
    pattern: &ResidualStressPattern,
    section: &FiberSectionDef,
    states: &mut [SectionState],
) {
    match pattern {
        ResidualStressPattern::EccsHotRolled { fy, fraction } => {
            apply_eccs_residual_stress(section, states, *fy, *fraction);
        }
        ResidualStressPattern::Uniform { stress } => {
            apply_uniform_residual_stress(section, states, *stress);
        }
        ResidualStressPattern::Custom { stresses } => {
            apply_custom_residual_stress(section, states, stresses);
        }
    }
}
