use std::collections::HashMap;
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::geometric_stiffness::{
    emit_geometric_stiffness_2d, emit_geometric_stiffness_3d, KgTriplets,
};
use super::constraints::FreeConstraintSystem;

/// Buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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
///
/// Each member's Kg takes its axial force from its elongation in the linear
/// solution, EA·(δ/L − αΔT) — the mean of N along the member, which is what
/// the geometric stiffness integrates (∫N·φ'ᵀφ' dx with N constant). The end
/// average (N_start + N_end)/2 used before is the mean only while N is linear,
/// so an axial point load or a partial axial load on a member gave the wrong
/// load factor (3× on a truss in `opensees_differential_regressions`). It is
/// also the force the P-Delta iteration uses.
/// Shared by `solve_buckling_2d` and the buckling certificate (public, hidden,
/// for the assembly-path oracle in tests/assembly_paths.rs). K and Kg are
/// in the inclined-roller frames of `inclined_transforms_2d` (φ too, until
/// rotated back with `reverse_inclined_transform_2d`).
#[doc(hidden)]
pub struct BucklingSystem2D {
    pub linear: AnalysisResults,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
    pub inclined_transforms_2d: Vec<InclinedTransformData2D>,
    /// Each element's mean axial force at the linear solution (what Kg is built from).
    pub mean_n: HashMap<usize, f64>,
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

    // Global-axes displacements of the linear solution (its results are
    // reported in global axes, also at inclined rollers).
    let mut u = vec![0.0; dof_num.n_total];
    for d in &linear.displacements {
        for (i, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                u[dof] = v;
            }
        }
    }

    // 2. Check for compression before assembling anything. There are no surface
    //    elements on the 2D path, so the axial forces answer this on their own —
    //    a frame in pure tension can bail here and skip both assemblies below.
    //    The mean force Kg is built from, not the end average: under an axial
    //    span load both end forces can be 0 with the member compressed.
    let mean_n = super::geometric_stiffness::mean_axial_forces_2d(input, &dof_num, &u);
    if !mean_n.values().any(|&n| n < -1e-6) {
        return Err("No compressed elements — buckling not applicable".into());
    }

    // 3. Sparse stiffness of the free block (the linear path's K: rotated
    //    springs, orphan-rotation guard, inclined-roller frames)
    let SparseAssemblyResult { k_ff, inclined_transforms_2d, .. } = assemble_sparse_2d(input, &dof_num);

    // 4. Build geometric stiffness at the linear solution (sparse free block;
    //    the eigensolver below is sparse, so a dense n×n Kg was pure waste), in
    //    the same inclined frames as K: collected over all DOFs when there are
    //    inclined rollers, then rotated and cut to the free block. Negate it in
    //    place — we solve K·φ = λ·(-Kg)·φ for positive eigenvalues, and nothing
    //    reads the un-negated Kg.
    let neg_kg_csc = {
        let mut kg = KgTriplets::new(if inclined_transforms_2d.is_empty() { nf } else { dof_num.n_total });
        emit_geometric_stiffness_2d(input, &dof_num, &u, &mut |i, j, v| if i >= j { kg.add(i, j, v) });
        if !inclined_transforms_2d.is_empty() {
            kg = kg.rotate_inclined(&inclined_transforms_2d, nf);
        }
        let mut kg_csc = kg.into_csc();
        for v in kg_csc.values.iter_mut() {
            *v = -*v;
        }
        kg_csc
    };
    Ok(BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms_2d, mean_n })
}

/// Solve 2D buckling analysis.
/// Solves K·φ = λ·(-Kg)·φ where Kg is from linear axial forces.
pub fn solve_buckling_2d(
    input: &SolverInput,
    num_modes: usize,
) -> Result<BucklingResult, String> {
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement> =
        crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let BucklingSystem2D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms_2d, mean_n } = buckling_system_2d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_2d(&input, &dof_num)?;

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
    let mut structured_diagnostics = linear.structured_diagnostics.clone();
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_2d(input, crate::known_issues::Analysis::Buckling));
    let (result, conditioning) = crate::known_issues::with_sparse_factor_conditioning(k_solve, |observe| {
        crate::linalg::lanczos::lanczos_buckling_eigen_sparse_observed(k_solve, kg_solve, num_modes, observe)
    });
    crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
    let result = result.ok_or_else(|| "Eigenvalue decomposition failed — stiffness matrix issue".to_string())?;

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
        u_mode[..nf].copy_from_slice(&phi_f[..nf]);
        // Back to global axes at inclined rollers before normalizing, so the
        // max-component scale is the same as an unrotated model's.
        for it in &inclined_transforms_2d {
            reverse_inclined_transform_2d(&mut u_mode, &it.dofs, &it.r);
        }
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for v in u_mode.iter_mut() {
                *v /= max_disp;
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
        let n_avg = mean_n.get(&ef.element_id).copied().unwrap_or((ef.n_start + ef.n_end) / 2.0);
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
        structured_diagnostics,
        modes,
        n_dof: nf,
        element_data,
    })
}

/// The matrices of the 3D linear buckling problem (see `BucklingSystem2D`),
/// including surface-element geometric stiffness. K and Kg are in the
/// inclined-support frames of `inclined_transforms`.
#[doc(hidden)]
pub struct BucklingSystem3D {
    /// Preload state; affected solid-shell stresses are omitted (SH-GLOBAL-STRESS).
    pub linear: AnalysisResults3D,
    pub dof_num: DofNumbering,
    pub k_ff: CscMatrix,
    pub neg_kg_csc: CscMatrix,
    /// Inclined supports: K and −Kg are in each one's (normal, tangent) frame.
    pub inclined_transforms: Vec<InclinedTransformData>,
}

#[doc(hidden)]
pub fn buckling_system_3d(input: &SolverInput3D) -> Result<BucklingSystem3D, String> {
    super::feature_gates::refuse_3d(input, "Buckling analysis", &[super::feature_gates::Feature::ShellThermalNonQuad])?;
    // Curved beams become segments first: `solve_3d` returns the segments' forces, which
    // the unexpanded model has no elements for (an index panic).
    let expanded = (!input.curved_beams.is_empty()).then(|| super::linear::expand_curved_beams_3d(input));
    let input = expanded.as_ref().unwrap_or(input);
    let mut linear = super::linear::buckling_preload_3d(input)?;
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

    // K (the linear path's, rotated into the inclined-support frames) first:
    // Kg is collected over all DOFs when there are inclined supports and
    // rotated the same way once the surfaces are in.
    let SparseAssemblyResult3D { k_ff, inclined_transforms, .. } = assemble_sparse_3d(input, &dof_num, false);

    // The displacement vector of the linear solution, which every member and
    // surface family reads its prestress from.
    let mut u_full = vec![0.0; n];
    for d in &linear.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (i, &v) in vals.iter().enumerate() {
            if let Some(&dof) = dof_num.map.get(&(d.node_id, i)) {
                u_full[dof] = v;
            }
        }
    }
    let mut kg = KgTriplets::new(if inclined_transforms.is_empty() { nf } else { n });
    emit_geometric_stiffness_3d(input, &dof_num, &u_full, &mut |i, j, v| if i >= j { kg.add(i, j, v) });

    // `emit_geometric_stiffness_3d` includes every shell family's Kg (plates,
    // MITC4/9, solid and curved shells) off the same u_full since the feature
    // matrix PR made P-Delta use it; adding them here again doubled the shell
    // Kg and halved shell buckling factors.

    if !inclined_transforms.is_empty() {
        kg = kg.rotate_inclined(&inclined_transforms, nf);
    }

    // Negate Kg (we solve K·φ = λ·(-Kg)·φ for positive eigenvalues), in place:
    // Kg is not read again, and on a large shell model its values vector is the
    // single biggest allocation in this function.
    let neg_kg_csc = {
        let mut kg_csc = kg.into_csc();
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
    // The preload policy permits these shells for matrix assembly, but its public
    // result must not expose their known-invalid static stress recovery.
    let affected: std::collections::HashSet<_> = crate::known_issues::model_3d(input)
        .into_iter().filter(|d| d.phase.as_deref() == Some("SH-GLOBAL-STRESS"))
        .flat_map(|d| d.element_ids).collect();
    if !affected.is_empty() {
        let mut recovery_input = input.clone();
        recovery_input.solid_shells.retain(|_, s| !affected.contains(&s.id));
        linear.quad_stresses = super::linear::compute_quad_stresses(&recovery_input, &dof_num, &u_full, None);
    }
    Ok(BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms })
}

/// 3D buckling analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingResult3D {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
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
    // Curved beams are expanded into straight members, as every static path
    // does; left in place they were not part of the model at all.
    let expanded = (!input.curved_beams.is_empty()).then(|| super::linear::expand_curved_beams_3d(input));
    let input = expanded.as_ref().unwrap_or(input);
    // Build lookup maps for O(1) access by id
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let BucklingSystem3D { linear, dof_num, k_ff, neg_kg_csc, inclined_transforms } = buckling_system_3d(input)?;
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_3d(&input, &dof_num)?;

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
    let mut structured_diagnostics = linear.structured_diagnostics.clone();
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Buckling));
    let (result, conditioning) = crate::known_issues::with_sparse_factor_conditioning(k_solve, |observe| {
        crate::linalg::lanczos::lanczos_buckling_eigen_sparse_observed(k_solve, kg_solve, num_modes, observe)
    });
    crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
    let result = result.ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;

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

        // Back to global axes at inclined supports before normalizing (as 2D).
        let mut u_mode = to_global(&phi_f[..nf], n, &inclined_transforms);
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for v in u_mode.iter_mut() { *v /= max_disp; }
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

    Ok(BucklingResult3D { structured_diagnostics, modes, n_dof: nf, element_data })
}
