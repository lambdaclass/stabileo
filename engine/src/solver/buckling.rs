use std::collections::HashMap;
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::geometric_stiffness::{build_kg_from_forces_2d, build_kg_from_forces_3d, add_plate_geometric_stiffness_3d, KgTriplets};
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

/// The matrices of the 2D linear buckling problem K·φ = λ·(−Kg)·φ: the linear
/// solution whose axial forces define Kg, the sparse free-DOF K, and −Kg.
/// Shared by `solve_buckling_2d` and the buckling certificate (public, hidden,
/// for the assembly-path oracle in tests/assembly_paths.rs).
#[doc(hidden)]
pub struct BucklingSystem2D {
    pub linear: AnalysisResults,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
}

#[doc(hidden)]
pub fn buckling_system_2d(input: &SolverInput) -> Result<BucklingSystem2D, String> {
    // 1. Linear solve to get axial forces
    let linear = super::linear::solve_2d(input)?;
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    // 2. Check for compression before assembling anything. There are no surface
    //    elements on the 2D path, so the axial forces answer this on their own —
    //    a frame in pure tension can bail here and skip both assemblies below.
    let has_compression = linear.element_forces.iter().any(|ef| {
        (ef.n_start + ef.n_end) / 2.0 < -1e-6
    });
    if !has_compression {
        return Err("No compressed elements — buckling not applicable".into());
    }

    // 3. Build geometric stiffness from linear axial forces (sparse free block;
    //    the eigensolver below is sparse, so a dense n×n Kg was pure waste).
    //    Negate it in place — we solve K·φ = λ·(-Kg)·φ for positive eigenvalues,
    //    and nothing reads the un-negated Kg.
    let neg_kg_csc = {
        let mut kg_csc = build_kg_from_forces_2d(input, &dof_num, &linear.element_forces).into_csc();
        for v in kg_csc.values.iter_mut() {
            *v = -*v;
        }
        kg_csc
    };

    // 4. Sparse stiffness of the free block
    let k_ff = assemble_sparse_2d(input, &dof_num).k_ff;
    Ok(BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc })
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

    let BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc } = buckling_system_2d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);

    // 5. Solve generalized eigenvalue: (-Kg)·φ = μ·K·φ  (K is SPD), sparse
    // shift-invert Lanczos in both branches; with constraints, K and -Kg are
    // reduced as sparse triple products first.
    let k_red;
    let kg_red;
    let (k_solve, kg_solve, ns): (&CscMatrix, &CscMatrix, usize) = if let Some(cs_ref) = cs.as_ref() {
        k_red = cs_ref.reduce_matrix_sparse(&k_ff);
        kg_red = cs_ref.reduce_matrix_sparse(&neg_kg_csc);
        (&k_red, &kg_red, cs_ref.n_free_indep)
    } else {
        (&k_ff, &neg_kg_csc, nf)
    };
    let result = lanczos_buckling_eigen_sparse(k_solve, kg_solve, num_modes)
        .ok_or_else(|| "Eigenvalue decomposition failed — stiffness matrix issue".to_string())?;

    let num_modes = num_modes.min(ns);
    let n_converged = result.values.len();
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
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();
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

/// The matrices of the 3D linear buckling problem (see `BucklingSystem2D`),
/// including surface-element geometric stiffness.
#[doc(hidden)]
pub struct BucklingSystem3D {
    pub linear: AnalysisResults3D,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
    /// Inclined supports: K and −Kg are in each one's (normal, tangent) frame.
    pub inclined_transforms: Vec<InclinedTransformData>,
}

#[doc(hidden)]
pub fn buckling_system_3d(input: &SolverInput3D) -> Result<BucklingSystem3D, String> {
    // Curved beams become segments first: `solve_3d` returns the segments' forces, which
    // the unexpanded model has no elements for (an index panic).
    let input = &super::linear::expand_curved_beams_3d(input);
    let linear = super::linear::solve_3d(input)?;
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let has_frame_compression = linear.element_forces.iter().any(|ef| {
        (ef.n_start + ef.n_end) / 2.0 < -1e-6
    });
    let has_surfaces = !input.quads.is_empty()
        || !input.plates.is_empty()
        || !input.quad9s.is_empty()
        || !input.solid_shells.is_empty()
        || !input.curved_shells.is_empty();

    // Bail before assembling anything. The full gate below also asks whether the
    // assembled -Kg has non-trivial entries, but that question only arises when
    // there are surfaces to assemble: with no compressed frame and no surface
    // elements at all, no amount of assembly can change the answer.
    if !has_frame_compression && !has_surfaces {
        return Err("No compressed elements — buckling not applicable".into());
    }

    // At an inclined support K is assembled in the support's frame, so Kg has to
    // be rotated with it (it used to be added in global axes, which made the
    // critical factor depend on how the model is oriented). The rotation mixes
    // the free tangential DOFs with the restrained normal one, so Kg is then
    // built over every DOF and cut to the free block after rotating.
    let sasm = assemble_sparse_3d(input, &dof_num, false);
    let inclined_transforms = sasm.inclined_transforms;
    let all_dofs = DofNumbering {
        map: dof_num.map.clone(),
        n_free: n,
        n_total: n,
        dofs_per_node: dof_num.dofs_per_node,
        node_order: dof_num.node_order.clone(),
    };
    let kg_num = if inclined_transforms.is_empty() { &dof_num } else { &all_dofs };

    let mut kg = build_kg_from_forces_3d(input, kg_num, &linear.element_forces);

    if has_surfaces {
        // Reconstruct the displacement vector from the linear results once, for
        // every surface family that needs it.
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
                input, kg_num, &u_full, &mut kg,
            );
        }
        if !input.quad9s.is_empty() {
            super::geometric_stiffness::add_quad9_geometric_stiffness_3d(
                input, kg_num, &u_full, &mut kg,
            );
        }
        if !input.solid_shells.is_empty() {
            super::geometric_stiffness::add_solid_shell_geometric_stiffness_3d(
                input, kg_num, &u_full, &mut kg,
            );
        }
        if !input.curved_shells.is_empty() {
            super::geometric_stiffness::add_curved_shell_geometric_stiffness_3d(
                input, kg_num, &u_full, &mut kg,
            );
        }
        // Plate (DKT triangle) geometric stiffness from membrane stress resultants,
        // off the same u_full.
        if !input.plates.is_empty() {
            add_plate_geometric_stiffness_3d(
                input, kg_num, &u_full, &mut kg,
            );
        }
    }

    let k_ff = sasm.k_ff;

    // Negate Kg (we solve K·φ = λ·(-Kg)·φ for positive eigenvalues), in place:
    // Kg is not read again, and on a large shell model its values vector is the
    // single biggest allocation in this function.
    let neg_kg_csc = {
        let mut kg_csc = kg.into_csc();
        if !inclined_transforms.is_empty() {
            let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
            for j in 0..n {
                for p in kg_csc.col_ptr[j]..kg_csc.col_ptr[j + 1] {
                    rows.push(kg_csc.row_idx[p]);
                    cols.push(j);
                    vals.push(kg_csc.values[p]);
                }
            }
            for it in &inclined_transforms {
                apply_inclined_transform_triplets_k(&mut rows, &mut cols, &mut vals, &it.dofs, &it.r);
            }
            let mut ff = KgTriplets::new(nf);
            for t in 0..rows.len() {
                ff.add(rows[t], cols[t], vals[t]);
            }
            kg_csc = ff.into_csc();
        }
        for v in kg_csc.values.iter_mut() {
            *v = -*v;
        }
        kg_csc
    };

    // The rest of the gate, now that -Kg exists: surfaces carry no axial force
    // to test, so the only way to know they contribute is to look at what they
    // assembled. `has_surfaces` spans every family including `curved_shells`,
    // whose Kg is built above like all the others — omitting it here turned away
    // a model made only of curved shells under pure compression, with a
    // populated -Kg, as "no compressed elements".
    let has_shell_kg = has_surfaces && neg_kg_csc.values.iter().any(|&v| v.abs() > 1e-15);
    if !has_frame_compression && !has_shell_kg {
        return Err("No compressed elements — buckling not applicable".into());
    }
    Ok(BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms })
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
    // Expanded as in `buckling_system_3d`, whose forces the element data reads.
    let input = &super::linear::expand_curved_beams_3d(input);
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        input.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    let BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms } = buckling_system_3d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);

    // Solve eigenproblem: (-Kg)*φ = μ*K*φ, then λ = 1/μ. Sparse shift-invert
    // Lanczos in both branches; with constraints, K and -Kg are reduced as
    // sparse triple products first.
    let k_red;
    let kg_red;
    let (k_solve, kg_solve, ns): (&CscMatrix, &CscMatrix, usize) = if let Some(cs_ref) = cs.as_ref() {
        k_red = cs_ref.reduce_matrix_sparse(&k_ff);
        kg_red = cs_ref.reduce_matrix_sparse(&neg_kg_csc);
        (&k_red, &kg_red, cs_ref.n_free_indep)
    } else {
        (&k_ff, &neg_kg_csc, nf)
    };
    let result = lanczos_buckling_eigen_sparse(k_solve, kg_solve, num_modes)
        .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;

    let num_modes = num_modes.min(ns);
    let n_converged = result.values.len();
    let mut mode_pairs: Vec<(f64, usize)> = Vec::new();
    for (idx, &mu) in result.values.iter().enumerate() {
        if mu > 1e-12 {
            mode_pairs.push((1.0 / mu, idx));
        }
    }
    mode_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

    let mut modes = Vec::new();
    for &(lambda, idx) in mode_pairs.iter().take(num_modes) {
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();
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
        // Back to global axes at inclined supports.
        for it in &inclined_transforms {
            reverse_inclined_transform(&mut u_mode, &it.dofs, &it.r);
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
