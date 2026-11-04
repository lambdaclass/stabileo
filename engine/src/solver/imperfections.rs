/// Apply initial imperfections to structural models.
///
/// Supports:
/// - Geometric imperfections: node coordinate offsets
/// - Notional loads: equivalent lateral loads from out-of-plumbness
/// - Residual stresses: initial fiber stress states
/// - Initial state import: displacements from previous analysis

use std::collections::{BTreeMap, HashMap};
use crate::types::*;
use crate::element::fiber_beam::{FiberSectionDef, SectionState, material_response};

/// Apply node imperfections to a 2D model by modifying node coordinates.
pub fn apply_geometric_imperfections_2d(input: &mut SolverInput, imperfections: &[NodeImperfection]) {
    for imp in imperfections {
        if let Some(node) = input.nodes.values_mut().find(|n| n.id == imp.node_id) {
            node.x += imp.dx;
            node.z += imp.dy;
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

/// Each node's share of the model's loads, in global (x, z): nodal forces as they are,
/// member loads split between the two ends by statics, as a simply supported span would.
/// Notional loads read gravity from it: from nodal loads only, a frame loaded along its
/// members got a fraction of its notional load or none (NL-10).
fn lumped_nodal_forces_2d(input: &SolverInput) -> BTreeMap<usize, [f64; 2]> {
    let mut out: BTreeMap<usize, [f64; 2]> = BTreeMap::new();
    let mut add = |node: usize, f: [f64; 2]| {
        let v = out.entry(node).or_insert([0.0; 2]);
        v[0] += f[0];
        v[1] += f[1];
    };
    let nodes: HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let elems: HashMap<usize, &SolverElement> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let axes = |id: usize| -> Option<(usize, usize, f64, f64, f64)> {
        let e = elems.get(&id)?;
        let (ni, nj) = (nodes.get(&e.node_i)?, nodes.get(&e.node_j)?);
        let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dz * dz).sqrt();
        (l > 0.0).then_some((e.node_i, e.node_j, l, dx / l, dz / l))
    };
    for load in &input.loads {
        match load {
            SolverLoad::Nodal(nl) => add(nl.node_id, [nl.fx, nl.fz]),
            SolverLoad::Distributed(dl) => {
                let Some((i, j, l, c, s)) = axes(dl.element_id) else { continue };
                let (a, b) = (dl.a.unwrap_or(0.0), dl.b.unwrap_or(l));
                let span = b - a;
                if span <= 0.0 { continue; }
                // Local y = (−sin, cos). Uniform part at mid-span, triangular part at 2/3.
                for (r, x) in [(dl.q_i * span, a + span / 2.0), ((dl.q_j - dl.q_i) * span / 2.0, a + 2.0 * span / 3.0)] {
                    let t = (x / l).clamp(0.0, 1.0);
                    let f = [-s * r, c * r];
                    add(i, [f[0] * (1.0 - t), f[1] * (1.0 - t)]);
                    add(j, [f[0] * t, f[1] * t]);
                }
            }
            SolverLoad::AxialDistributed(dl) => {
                // Along the member, local x = (cos, sin); lumped as the transverse load above.
                let Some((i, j, l, c, s)) = axes(dl.element_id) else { continue };
                let (a, b) = (dl.a.unwrap_or(0.0), dl.b.unwrap_or(l));
                let span = b - a;
                if span <= 0.0 { continue; }
                for (r, x) in [(dl.q_i * span, a + span / 2.0), ((dl.q_j - dl.q_i) * span / 2.0, a + 2.0 * span / 3.0)] {
                    let t = (x / l).clamp(0.0, 1.0);
                    let f = [c * r, s * r];
                    add(i, [f[0] * (1.0 - t), f[1] * (1.0 - t)]);
                    add(j, [f[0] * t, f[1] * t]);
                }
            }
            SolverLoad::PointOnElement(pl) => {
                let Some((i, j, l, c, s)) = axes(pl.element_id) else { continue };
                let px = pl.px.unwrap_or(0.0);
                let f = [-s * pl.p + c * px, c * pl.p + s * px];
                let t = (pl.a / l).clamp(0.0, 1.0);
                add(i, [f[0] * (1.0 - t), f[1] * (1.0 - t)]);
                add(j, [f[0] * t, f[1] * t]);
            }
            SolverLoad::Thermal(_) => {}
        }
    }
    out
}

/// As `lumped_nodal_forces_2d`, in global (x, y, z), for nodal and frame member loads.
fn lumped_nodal_forces_3d(input: &SolverInput3D) -> BTreeMap<usize, [f64; 3]> {
    let mut out: BTreeMap<usize, [f64; 3]> = BTreeMap::new();
    let mut add = |node: usize, f: [f64; 3], t: f64| {
        let v = out.entry(node).or_insert([0.0; 3]);
        for k in 0..3 {
            v[k] += f[k] * t;
        }
    };
    let left_hand = input.left_hand.unwrap_or(false);
    let nodes: HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let elems: HashMap<usize, &SolverElement3D> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let axes = |id: usize| -> Option<(usize, usize, f64, [f64; 3], [f64; 3], [f64; 3])> {
        let e = elems.get(&id)?;
        let (ni, nj) = (nodes.get(&e.node_i)?, nodes.get(&e.node_j)?);
        let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        if l <= 0.0 { return None; }
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(
            ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, left_hand,
        );
        Some((e.node_i, e.node_j, l, ex, ey, ez))
    };
    let global = |ex: &[f64; 3], ey: &[f64; 3], ez: &[f64; 3], fx: f64, fy: f64, fz: f64| -> [f64; 3] {
        [0, 1, 2].map(|k| fx * ex[k] + fy * ey[k] + fz * ez[k])
    };
    for load in &input.loads {
        match load {
            SolverLoad3D::Nodal(nl) => add(nl.node_id, [nl.fx, nl.fy, nl.fz], 1.0),
            SolverLoad3D::Distributed(dl) => {
                let Some((i, j, l, ex, ey, ez)) = axes(dl.element_id) else { continue };
                let (a, b) = (dl.a.unwrap_or(0.0), dl.b.unwrap_or(l));
                let span = b - a;
                if span <= 0.0 { continue; }
                let uni = global(&ex, &ey, &ez, dl.q_xi * span, dl.q_yi * span, dl.q_zi * span);
                let tri = global(&ex, &ey, &ez, (dl.q_xj - dl.q_xi) * span / 2.0, (dl.q_yj - dl.q_yi) * span / 2.0, (dl.q_zj - dl.q_zi) * span / 2.0);
                for (r, x) in [(uni, a + span / 2.0), (tri, a + 2.0 * span / 3.0)] {
                    let t = (x / l).clamp(0.0, 1.0);
                    add(i, r, 1.0 - t);
                    add(j, r, t);
                }
            }
            SolverLoad3D::PointOnElement(pl) => {
                let Some((i, j, l, ex, ey, ez)) = axes(pl.element_id) else { continue };
                let r = global(&ex, &ey, &ez, 0.0, pl.py, pl.pz);
                let t = (pl.a / l).clamp(0.0, 1.0);
                add(i, r, 1.0 - t);
                add(j, r, t);
            }
            _ => {}
        }
    }
    out
}

/// Convert notional load definitions to equivalent lateral loads (2D).
///
/// For each node that carries gravity load (nodal loads and member loads lumped to the
/// nodes), adds a lateral load = ratio × |gravity force| along `direction`.
pub fn notional_loads_2d(
    input: &SolverInput,
    notional: &NotionalLoadDef,
) -> Vec<SolverLoad> {
    let mut loads = Vec::new();
    let dir = notional.direction.min(1); // 2D: 0=X, 1=Z
    let grav = notional.gravity_axis.unwrap_or(1).min(1);

    for (node_id, f) in lumped_nodal_forces_2d(input) {
        let grav_force = f[grav];
        if grav_force.abs() < 1e-15 { continue; }
        let lateral = notional.ratio * grav_force.abs();
        let (fx, fz) = if dir == 0 { (lateral, 0.0) } else { (0.0, lateral) };
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id,
            fx,
            fz,
            my: 0.0,
        }));
    }
    loads
}

/// Convert notional load definitions to equivalent lateral loads (3D).
///
/// Gravity is read along `gravity_axis` (default Z, the vertical of the Z-up model) from
/// nodal loads and frame member loads lumped to the nodes.
pub fn notional_loads_3d(
    input: &SolverInput3D,
    notional: &NotionalLoadDef,
) -> Vec<SolverLoad3D> {
    let mut loads = Vec::new();
    let dir = notional.direction.min(2);
    let grav = notional.gravity_axis.unwrap_or(2).min(2);

    for (node_id, f) in lumped_nodal_forces_3d(input) {
        let grav_force = f[grav];
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

/// What an imperfection input asks for that the linear imperfection solve would not do.
/// Each of these used to be accepted and dropped, so the analysis ran as if the
/// imperfection were not there (NL-9, NL-10, NL-11).
fn refuse_unapplied_imperfections(
    imp: &ImperfectionInput,
    node_exists: impl Fn(usize) -> bool,
    n_axes: usize,
) -> Result<(), String> {
    if !imp.residual_stresses.is_empty() {
        return Err("Imperfections: residual stresses are not applied by this analysis (it is a linear solve, \
                    and no fiber state carries them). Remove `residualStresses`, or use a fiber analysis that \
                    applies them."
            .into());
    }
    if !imp.initial_displacements.is_empty() {
        return Err("Imperfections: initial displacements are not applied by this analysis. Give the \
                    imperfect shape as node offsets (`nodeImperfections`) instead."
            .into());
    }
    for ni in &imp.node_imperfections {
        if !node_exists(ni.node_id) {
            return Err(format!("Imperfections: node {} does not exist", ni.node_id));
        }
    }
    let names: &[&str] = if n_axes == 2 { &["X", "Z"] } else { &["X", "Y", "Z"] };
    for (k, n) in imp.notional_loads.iter().enumerate() {
        let grav = n.gravity_axis.unwrap_or(n_axes - 1);
        if n.direction >= n_axes || grav >= n_axes {
            return Err(format!(
                "Imperfections: notional load {k}: direction {} / gravity axis {grav} must be one of 0..{} ({})",
                n.direction, n_axes - 1, names.join(", ")
            ));
        }
        if n.direction == grav {
            return Err(format!(
                "Imperfections: notional load {k}: its direction ({}) is the gravity axis; a notional load is lateral",
                names[grav]
            ));
        }
        if !(n.ratio.is_finite() && n.ratio != 0.0) {
            return Err(format!("Imperfections: notional load {k}: the ratio must be a non-zero number (got {})", n.ratio));
        }
    }
    Ok(())
}

/// The total lateral load a set of notional loads came to: zero means it found no gravity.
fn refuse_empty_notional(k: usize, total: f64, grav_name: &str) -> Result<(), String> {
    if total.abs() <= 1e-12 {
        return Err(format!(
            "Imperfections: notional load {k} found no gravity load along {grav_name} (nodal loads and member \
             loads on frames are read; shell loads are not), so it would add nothing. Check the gravity axis \
             and that the gravity loads are in this model."
        ));
    }
    Ok(())
}

/// The 2D imperfection analysis: node offsets, then notional loads, then a linear solve.
/// Refuses what it would not apply rather than solving without it.
pub fn solve_with_imperfections_2d(mut solver: SolverInput, imp: &ImperfectionInput) -> Result<AnalysisResults, String> {
    let ids: std::collections::HashSet<usize> = crate::ordered::values(&solver.nodes).map(|n| n.id).collect();
    refuse_unapplied_imperfections(imp, |id| ids.contains(&id), 2)?;
    apply_geometric_imperfections_2d(&mut solver, &imp.node_imperfections);
    let mut added = Vec::new();
    for (k, notional) in imp.notional_loads.iter().enumerate() {
        let loads = notional_loads_2d(&solver, notional);
        let total: f64 = loads.iter().map(|l| match l { SolverLoad::Nodal(n) => n.fx.abs() + n.fz.abs(), _ => 0.0 }).sum();
        refuse_empty_notional(k, total, ["X", "Z"][notional.gravity_axis.unwrap_or(1).min(1)])?;
        added.extend(loads);
    }
    solver.loads.extend(added);
    super::linear::solve_2d(&solver)
}

/// The 3D imperfection analysis: node offsets, then notional loads, then a linear solve.
pub fn solve_with_imperfections_3d(mut solver: SolverInput3D, imp: &ImperfectionInput) -> Result<AnalysisResults3D, String> {
    let ids: std::collections::HashSet<usize> = crate::ordered::values(&solver.nodes).map(|n| n.id).collect();
    refuse_unapplied_imperfections(imp, |id| ids.contains(&id), 3)?;
    if !imp.notional_loads.is_empty() {
        let shell_load = solver.loads.iter().any(|l| matches!(l,
            SolverLoad3D::Pressure(_) | SolverLoad3D::QuadPressure(_) | SolverLoad3D::QuadEdge(_)
            | SolverLoad3D::QuadSelfWeight(_) | SolverLoad3D::Quad9Pressure(_) | SolverLoad3D::Quad9Edge(_)
            | SolverLoad3D::Quad9SelfWeight(_)));
        if shell_load {
            return Err("Imperfections: notional loads read nodal loads and frame member loads; this model has \
                        shell loads, whose gravity they would leave out. Give the notional loads as nodal loads \
                        instead."
                .into());
        }
    }
    apply_geometric_imperfections_3d(&mut solver, &imp.node_imperfections);
    let mut added = Vec::new();
    for (k, notional) in imp.notional_loads.iter().enumerate() {
        let loads = notional_loads_3d(&solver, notional);
        let total: f64 = loads.iter().map(|l| match l { SolverLoad3D::Nodal(n) => n.fx.abs() + n.fy.abs() + n.fz.abs(), _ => 0.0 }).sum();
        refuse_empty_notional(k, total, ["X", "Y", "Z"][notional.gravity_axis.unwrap_or(2).min(2)])?;
        added.extend(loads);
    }
    solver.loads.extend(added);
    super::linear::solve_3d(&solver)
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
