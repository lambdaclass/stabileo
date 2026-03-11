use std::collections::HashMap;
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::geometric_stiffness::{build_kg_from_forces_2d, build_kg_from_forces_3d, add_plate_geometric_stiffness_3d};
use super::constraints::FreeConstraintSystem;

/// Buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult {
    pub modes: Vec<BucklingMode>,
    pub n_dof: usize,
    pub element_data: Vec<ElementBucklingData>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingMode {
    pub load_factor: f64,
    pub displacements: Vec<Displacement>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementBucklingData {
    pub element_id: usize,
    pub axial_force: f64,
    pub critical_force: f64,
    pub k_effective: f64,
    pub effective_length: f64,
    pub length: f64,
    pub slenderness: f64,
}

/// Solve 2D buckling analysis.
/// Solves K·φ = λ·(-Kg)·φ where Kg is from linear axial forces.
pub fn solve_buckling_2d(
    input: &SolverInput,
    num_modes: usize,
) -> Result<BucklingResult, String> {
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement> =
        input.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    // 1. Linear solve to get axial forces
    let linear = super::linear::solve_2d(input)?;
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    // 2. Build geometric stiffness from linear axial forces
    let kg_full = build_kg_from_forces_2d(input, &dof_num, &linear.element_forces);

    // 3. Extract free-DOF submatrices
    let free_idx: Vec<usize> = (0..nf).collect();
    let asm = assemble_2d(input, &dof_num);
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);

    // Negate Kg (we solve K·φ = λ·(-Kg)·φ for positive eigenvalues)
    let kg_ff_raw = extract_submatrix(&kg_full, n, &free_idx, &free_idx);
    let mut neg_kg_ff = vec![0.0; nf * nf];
    for i in 0..nf * nf {
        neg_kg_ff[i] = -kg_ff_raw[i];
    }

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let (k_solve, neg_kg_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&neg_kg_ff), cs.n_free_indep)
    } else {
        (k_ff, neg_kg_ff, nf)
    };

    // Check if any element is in compression
    let has_compression = linear.element_forces.iter().any(|ef| {
        (ef.n_start + ef.n_end) / 2.0 < -1e-6
    });
    if !has_compression {
        return Err("No compressed elements — buckling not applicable".into());
    }

    // 4. Solve generalized eigenvalue: (-Kg)·φ = μ·K·φ  (K is SPD)
    let result = solve_generalized_eigen(&neg_kg_solve, &k_solve, ns, 200)
        .ok_or_else(|| "Eigenvalue decomposition failed — stiffness matrix issue".to_string())?;

    let num_modes = num_modes.min(ns);
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 {
            let lambda = 1.0 / mu;
            mode_pairs.push((lambda, idx));
        }
    }
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * ns + idx]).collect();
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s)
        } else {
            phi_s
        };

        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = phi_f[i];
            max_disp = max_disp.max(phi_f[i].abs());
        }
        if max_disp > 1e-20 {
            for i in 0..nf {
                u_mode[i] /= max_disp;
            }
        }

        let displacements = super::linear::build_displacements_2d(&dof_num, &u_mode);
        modes.push(BucklingMode {
            load_factor: lambda,
            displacements,
        });
    }

    if modes.is_empty() {
        return Err("No positive buckling load factors found".into());
    }

    // 6. Per-element buckling data
    let lambda_cr = modes[0].load_factor;
    let mut element_data = Vec::new();
    for ef in &linear.element_forces {
        let n_avg = (ef.n_start + ef.n_end) / 2.0;
        if n_avg >= -1e-6 {
            continue; // Skip tension elements
        }
        let elem = elem_by_id[&ef.element_id];
        let sec = sec_by_id[&elem.section_id];
        let l = ef.length;
        let pcr = lambda_cr * n_avg.abs();
        let r = if sec.a > 1e-20 { (sec.iz / sec.a).sqrt() } else { 0.0 };
        let k_eff = if pcr > 1e-6 && r > 1e-12 {
            let le = std::f64::consts::PI
                * (mat_by_id[&elem.material_id].e * 1000.0 * sec.iz / pcr).sqrt();
            le / l
        } else {
            1.0
        };
        let le = k_eff * l;
        let slenderness = if r > 1e-12 { le / r } else { 0.0 };

        element_data.push(ElementBucklingData {
            element_id: ef.element_id,
            axial_force: n_avg,
            critical_force: pcr,
            k_effective: k_eff,
            effective_length: le,
            length: l,
            slenderness,
        });
    }

    Ok(BucklingResult {
        modes,
        n_dof: nf,
        element_data,
    })
}

/// 3D buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult3D {
    pub modes: Vec<BucklingMode3D>,
    pub n_dof: usize,
    pub element_data: Vec<ElementBucklingData3D>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingMode3D {
    pub load_factor: f64,
    pub displacements: Vec<Displacement3D>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementBucklingData3D {
    pub element_id: usize,
    pub axial_force: f64,
    pub critical_force: f64,
    pub k_effective: f64,
    pub effective_length: f64,
    pub length: f64,
    pub slenderness_y: f64,
    pub slenderness_z: f64,
}

/// Solve 3D buckling analysis.
pub fn solve_buckling_3d(
    input: &SolverInput3D,
    num_modes: usize,
) -> Result<BucklingResult3D, String> {
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        input.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    let linear = super::linear::solve_3d(input)?;
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let mut kg_full = build_kg_from_forces_3d(input, &dof_num, &linear.element_forces);

    // Add quad/solid-shell/curved-shell geometric stiffness from stress resultants
    if !input.quads.is_empty() || !input.quad9s.is_empty() || !input.solid_shells.is_empty() || !input.curved_shells.is_empty() {
        // Reconstruct displacement vector from linear results
        let mut u_full = vec![0.0; n];
        for d in &linear.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &v) in vals.iter().enumerate() {
                if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                    u_full[dof] = v;
                }
            }
        }
        if !input.quads.is_empty() {
            super::geometric_stiffness::add_quad_geometric_stiffness_3d(
                input, &dof_num, &u_full, &mut kg_full,
            );
        }
        if !input.quad9s.is_empty() {
            super::geometric_stiffness::add_quad9_geometric_stiffness_3d(
                input, &dof_num, &u_full, &mut kg_full,
            );
        }
        if !input.solid_shells.is_empty() {
            super::geometric_stiffness::add_solid_shell_geometric_stiffness_3d(
                input, &dof_num, &u_full, &mut kg_full,
            );
        }
        if !input.curved_shells.is_empty() {
            super::geometric_stiffness::add_curved_shell_geometric_stiffness_3d(
                input, &dof_num, &u_full, &mut kg_full,
            );
        }
    }

    // Add plate (DKT triangle) geometric stiffness from membrane stress resultants
    if !input.plates.is_empty() {
        let mut u_full = vec![0.0; n];
        for d in &linear.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &v) in vals.iter().enumerate() {
                if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                    u_full[dof] = v;
                }
            }
        }
        add_plate_geometric_stiffness_3d(
            input, &dof_num, &u_full, &mut kg_full,
        );
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let asm = assemble_3d(input, &dof_num);
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);

    let kg_ff_raw = extract_submatrix(&kg_full, n, &free_idx, &free_idx);
    let mut neg_kg_ff = vec![0.0; nf * nf];
    for i in 0..nf * nf { neg_kg_ff[i] = -kg_ff_raw[i]; }

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let (k_solve, neg_kg_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&neg_kg_ff), cs.n_free_indep)
    } else {
        (k_ff, neg_kg_ff, nf)
    };

    let has_frame_compression = linear.element_forces.iter().any(|ef| {
        (ef.n_start + ef.n_end) / 2.0 < -1e-6
    });
    // Also check if shell geometric stiffness has non-trivial entries
    let has_shell_kg = (!input.quads.is_empty() || !input.plates.is_empty() || !input.quad9s.is_empty() || !input.solid_shells.is_empty())
        && neg_kg_solve.iter().any(|&v| v.abs() > 1e-15);
    if !has_frame_compression && !has_shell_kg {
        return Err("No compressed elements — buckling not applicable".into());
    }

    let result = solve_generalized_eigen(&neg_kg_solve, &k_solve, ns, 200)
        .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;

    let num_modes = num_modes.min(ns);
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 {
            mode_pairs.push((1.0 / mu, idx));
        }
    }
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * ns + idx]).collect();
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s)
        } else {
            phi_s
        };

        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = phi_f[i];
            max_disp = max_disp.max(phi_f[i].abs());
        }
        if max_disp > 1e-20 {
            for i in 0..nf { u_mode[i] /= max_disp; }
        }
        let displacements = super::linear::build_displacements_3d(&dof_num, &u_mode);
        modes.push(BucklingMode3D { load_factor: lambda, displacements });
    }

    if modes.is_empty() {
        return Err("No positive buckling load factors found".into());
    }

    let lambda_cr = modes[0].load_factor;
    let mut element_data = Vec::new();
    for ef in &linear.element_forces {
        let n_avg = (ef.n_start + ef.n_end) / 2.0;
        if n_avg >= -1e-6 { continue; }
        let elem = elem_by_id[&ef.element_id];
        let sec = sec_by_id[&elem.section_id];
        let mat = mat_by_id[&elem.material_id];
        let l = ef.length;
        let pcr = lambda_cr * n_avg.abs();
        let e = mat.e * 1000.0;

        let ry = if sec.a > 1e-20 { (sec.iy / sec.a).sqrt() } else { 0.0 };
        let rz = if sec.a > 1e-20 { (sec.iz / sec.a).sqrt() } else { 0.0 };
        let k_eff = if pcr > 1e-6 {
            let le = std::f64::consts::PI * (e * sec.iy.min(sec.iz) / pcr).sqrt();
            le / l
        } else { 1.0 };
        let le = k_eff * l;
        let slenderness_y = if ry > 1e-12 { le / ry } else { 0.0 };
        let slenderness_z = if rz > 1e-12 { le / rz } else { 0.0 };

        element_data.push(ElementBucklingData3D {
            element_id: ef.element_id,
            axial_force: n_avg,
            critical_force: pcr,
            k_effective: k_eff,
            effective_length: le,
            length: l,
            slenderness_y,
            slenderness_z,
        });
    }

    Ok(BucklingResult3D { modes, n_dof: nf, element_data })
}
