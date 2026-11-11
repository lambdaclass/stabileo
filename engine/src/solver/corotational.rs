use crate::solver::support::{support_dofs_3d};
use crate::types::*;
use crate::linalg::*;
use crate::element::*;
use super::dof::DofNumbering;
use super::assembly;
use super::constraints::FreeConstraintSystem;
use super::linear::SPARSE_THRESHOLD;
use super::sparse_tangent::{
    cached_symbolic, solve_tangent_sparse_diagnosed, tangent_free_sparse_triplets, SparseSymbolicCache,
};

/// Resolve the local-Y reference ONCE from the INITIAL element geometry so the
/// initial and corotated (deformed) local frames share the same reference.
///
/// Without this, an element with no explicit local_y re-derives its reference
/// from the default convention at BOTH configs; as a near-vertical member tilts
/// across the default's vertical-singularity threshold during iteration, the
/// reference jumps branches, injecting a spurious rigid-body rotation that
/// breaks convergence. Anchoring the deformed frame to the initial reference
/// removes that discontinuity. Elements WITH an explicit local_y are unchanged
/// (they already used that fixed reference for both frames).
fn corot_local_y_ref(
    xi: f64, yi: f64, zi: f64, xj: f64, yj: f64, zj: f64,
    lyx: Option<f64>, lyy: Option<f64>, lyz: Option<f64>,
) -> (Option<f64>, Option<f64>, Option<f64>) {
    let (dx, dy, dz) = (xj - xi, yj - yi, zj - zi);
    let l = (dx * dx + dy * dy + dz * dz).sqrt();
    if l < 1e-15 {
        return (lyx, lyy, lyz);
    }
    /*
     * Anchor to the initial frame's own local y (before roll and handedness,
     * which `compute_local_axes_3d` applies again). An explicit local y nearly
     * parallel to the member was passed through as is, and the parallel-vector
     * fallback then picked its reference from each configuration separately:
     * the deformed frame turned against the initial one and the iteration
     * "converged" to 3.5 times the lateral deflection.
     */
    let (_, ey, _) = compute_local_axes_3d(xi, yi, zi, xj, yj, zj, lyx, lyy, lyz, None, false);
    (Some(ey[0]), Some(ey[1]), Some(ey[2]))
}

pub(crate) fn continuation_internal_2d(
    input: &SolverInput,
    dofs: &DofNumbering,
    u: &[f64],
    its: &[assembly::InclinedTransformData2D],
    artificial: &[(usize, f64)],
) -> Vec<f64> {
    let global = assembly::to_global(u, dofs.n_total, its);
    let mut internal = vec![0.0; dofs.n_total];
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut values = Vec::new();
    assemble_corotational_triplets_2d(input, dofs, &global, &mut internal, &mut rows, &mut cols, &mut values);
    add_spring_contributions(input, dofs, &global, &mut internal, artificial, &mut |_, _, _| {});
    for it in its {
        assembly::rotate_inclined_f_2d(&mut internal, &it.dofs, &it.r);
    }
    internal
}

pub(crate) fn chord_rotation(dx0: f64, dz0: f64, dux: f64, duz: f64) -> f64 {
    assembly::compensated_dot(&[dx0, -dz0], &[duz, dux]).atan2(
        assembly::compensated_dot(&[dx0, dz0, dx0, dz0], &[dx0, dz0, dux, duz]),
    )
}

/// Solve a 2D frame using co-rotational large displacement analysis.
///
/// This wraps the existing linear element formulations, rebuilding
/// transformations from deformed geometry at each Newton-Raphson iteration.
/// Uses incremental-iterative loading with Newton-Raphson inner loops.
pub fn solve_corotational_2d(
    input: &SolverInput,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    modified_nr: bool,
) -> Result<CorotationalResult, String> {
    solve_corotational_2d_from(input, None, max_iter, tolerance, n_increments, modified_nr)
}

/// A converged co-rotational state to continue from: the model it was solved
/// for (same nodes; its supports may differ) and its nodal displacements.
pub struct CorotationalStart2D<'a> {
    pub input: &'a SolverInput,
    pub displacements: &'a [Displacement],
}

/// Co-rotational analysis that continues from `start` instead of the
/// undeformed state. The external loads and the restrained DOFs ramp linearly
/// from the start model's to `input`'s, so every restrained DOF ends at the
/// value its support prescribes (zero when it prescribes none). Without a
/// start this is [`solve_corotational_2d`].
pub fn solve_corotational_2d_from(
    input: &SolverInput,
    start: Option<&CorotationalStart2D>,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    modified_nr: bool,
) -> Result<CorotationalResult, String> {
    // Degenerate parameters, rejected before any work. These arrive from the
    // public WASM entry point exactly as the caller sent them, and the UI's
    // `min` attribute constrains the spinner, not the value that is bound.
    // Without these the function reports `converged: true` for an analysis
    // that never ran: `n_increments = 0` makes `1..=0` an empty range, so the
    // load is never applied and the initial zero state is returned as the
    // answer. `arc_length::solve_arc_length_2d` already refuses its own
    // equivalents for the same reason.
    if n_increments == 0 {
        return Err("Number of load increments must be at least 1".into());
    }
    if max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err("Convergence tolerance must be finite and positive".into());
    }

    // The 3D entry point validates; this one did not, and went straight to
    // assembly — where ids are resolved by direct map indexing, so an element
    // naming a node that does not exist panicked instead of returning an
    // error. In WASM that ends the module, not the call.
    super::linear::validate_input_2d(input)?;
    // Temperature enters as fixed-end forces held in the global frame, so a
    // heated member that rotates is pushed by its own (fictitious) thermal
    // axial force: 12% on the tip rotation of a heated, bent cantilever.
    super::feature_gates::refuse_2d(input, "Corotational analysis", &[
        super::feature_gates::Feature::ThermalLoads,
    ])?;
    crate::element::connector::refuse_for_corotational_2d(input, "Corotational analysis")?;
    refuse_inclined_motion_2d(input, start.is_some())?;

    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Get the full external load vector from linear assembly (reference load)
    let asm = assembly::assemble_2d(input, &dof_num);
    let f_total = asm.f.clone();
    let art = assembly::artificial_stiffness_entries(&asm);

    let (mut u_full, f_base) = match start {
        Some(start) => start_state_2d(input, start, &dof_num)?,
        None => (vec![0.0; n], vec![0.0; n]),
    };
    let u_r_base: Vec<f64> = u_full[nf..].to_vec();
    let u_r_target = super::linear::prescribed_displacements_2d(input, &dof_num);
    let support_extent: Vec<_> = u_r_base.iter().zip(&u_r_target)
        .map(|(a,b)|a.abs()+b.abs()).collect();
    let metric = super::convergence::EquilibriumMetric::for_2d_with_state(
        input, &dof_num, cs.as_ref(), Some(&support_extent), &[],
    )?;

    let start_internal = if start.is_some() {
        continuation_internal_2d(input, &dof_num, &u_full, &asm.inclined_transforms_2d, &art)
    } else {
        vec![0.0; n]
    };

    let mut total_iterations = 0;
    let mut converged = true;
    // The state and load factor of the last converged increment.
    let mut u_converged = u_full.clone();
    let mut converged_factor = 0.0f64;

    // Sparse symbolic factorization cache (ns >= SPARSE_THRESHOLD only): the
    // tangent's sparsity pattern is constant within a solve call, so the
    // symbolic phase is computed once and only the numeric phase repeats
    // per Newton iteration.
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;
    let mut conditioning = None;

    // Incremental-iterative procedure
    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;

        let f_ext: Vec<f64> = (0..n).map(|i| f_base[i] + load_factor * (f_total[i] - f_base[i])).collect();
        let active_supports:Vec<_>=u_r_base.iter().zip(&u_r_target).map(|(base,target)|base+load_factor*(target-base)).collect();
        let mut support_step: Option<Vec<f64>> = Some(
            u_r_base.iter().zip(&u_r_target).enumerate()
                .map(|(i, (base, target))| base + load_factor * (target - base) - u_full[nf + i])
                .collect::<Vec<f64>>(),
        )
        .filter(|du| du.iter().any(|&v| v != 0.0));

        // Newton-Raphson inner loop
        let mut nr_converged = false;
        let mut cached_factor: Option<CachedTangentFactor> = None;
        for _iter in 0..max_iter {
            total_iterations += 1;

            // Compute internal forces and tangent stiffness from co-rotational formulation.
            // Below SPARSE_THRESHOLD the tangent is assembled dense (n×n); at
            // or above it, as lower-triangle COO triplets that feed the CSC
            // sparse solve directly — no O(n²) dense matrix is ever built.
            let mut f_int = vec![0.0; n];
            let sparse_tangent = ns >= SPARSE_THRESHOLD;
            let mut k_t: Vec<f64> = Vec::new();
            let mut trip_rows: Vec<usize> = Vec::new();
            let mut trip_cols: Vec<usize> = Vec::new();
            let mut trip_vals: Vec<f64> = Vec::new();

            // Elements need TRUE global nodal displacements to compute correct
            // co-rotational geometry — u_full stores inclined-support DOFs in
            // the rotated (tangent, normal) basis (same "mixed" convention
            // assemble_2d's solved system produces), so reverse that rotation
            // on a scratch copy before handing displacements to elements.
            let mut u_geom = u_full.clone();
            for it in &asm.inclined_transforms_2d {
                assembly::reverse_inclined_transform_2d(&mut u_geom, &it.dofs, &it.r);
            }

            if sparse_tangent {
                assemble_corotational_triplets_2d(
                    input, &dof_num, &u_geom, &mut f_int,
                    &mut trip_rows, &mut trip_cols, &mut trip_vals,
                );
                add_spring_contributions(
                    input, &dof_num, &u_geom, &mut f_int, &art,
                    &mut |gi, gj, v| {
                        if gi >= gj {
                            trip_rows.push(gi);
                            trip_cols.push(gj);
                            trip_vals.push(v);
                        }
                    },
                );
                // Triplet K rotation + f rotation == dense
                // apply_inclined_transform_2d (see comment below).
                for it in &asm.inclined_transforms_2d {
                    assembly::apply_inclined_transform_triplets_2d(
                        &mut trip_rows, &mut trip_cols, &mut trip_vals, &it.dofs, &it.r,
                    );
                    assembly::rotate_inclined_f_2d(&mut f_int, &it.dofs, &it.r);
                }
            } else {
                k_t = vec![0.0; n * n];
                assemble_corotational(input, &dof_num, &u_geom, &mut f_int, &mut k_t);
                add_spring_contributions(
                    input, &dof_num, &u_geom, &mut f_int, &art,
                    &mut |gi, gj, v| k_t[gi * n + gj] += v,
                );

                // Rotate K_T/f_int back into the rotated (tangent, normal) basis
                // at inclined-support DOFs so they stay consistent with f_ext
                // (already rotated by assemble_2d above) for the residual/solve
                // below — without this, the tangent-stiffness system enforces
                // "restrain literal global Z" instead of "restrain normal to
                // the incline," silently solving the wrong physical problem.
                for it in &asm.inclined_transforms_2d {
                    assembly::apply_inclined_transform_2d(&mut k_t, &mut f_int, n, &it.dofs, &it.r);
                }
            }

            // Residual R = F_ext - f_int
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Reduce residual and check convergence on independent DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let rel_error = metric.continuation_residual(&residual,&f_ext,&active_supports,&f_base,&start_internal,cs.as_ref());

            if rel_error < tolerance && support_step.is_none() {
                nr_converged = true;
                break;
            }

            // The supports' step enters the first iteration as the tangent
            // predictor's load −K_fr·Δu_r: moving only the support nodes
            // would crush the elements next to them.
            let mut r_f = r_f;
            if let Some(ref du_r) = support_step {
                if sparse_tangent {
                    for ((&i, &j), &v) in trip_rows.iter().zip(&trip_cols).zip(&trip_vals) {
                        if i >= nf && j < nf {
                            r_f[j] -= v * du_r[i - nf];
                        } else if j >= nf && i < nf {
                            r_f[i] -= v * du_r[j - nf];
                        }
                    }
                } else {
                    for i in 0..nf {
                        r_f[i] -= (0..n - nf).map(|r| k_t[i * n + nf + r] * du_r[r]).sum::<f64>();
                    }
                }
            }

            // Solve K_T * delta_u = R for free DOFs
            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if modified_nr {
                if let Some(ref factor) = cached_factor {
                    solve_with_cached_factor(factor, &r_s)
                } else if ns >= SPARSE_THRESHOLD {
                    // Sparse path: symbolic factorization is cached across
                    // iterations (pattern is constant); only the numeric
                    // phase runs here, and the resulting factor is reused
                    // for the rest of the increment.
                    let k_s_csc = tangent_free_sparse_triplets(
                        &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                    );
                    let sym = cached_symbolic(&mut sparse_sym_cache, &k_s_csc);
                    let factor = numeric_cholesky(sym, &k_s_csc);
                    if let Some(found) = crate::known_issues::sparse_factor_conditioning(&k_s_csc, factor.as_ref()) { conditioning = Some(found); }
                    match factor {
                        Some(num) => {
                            let result = sparse_cholesky_solve(&num, &r_s);
                            cached_factor = Some(CachedTangentFactor::Sparse(num));
                            result
                        }
                        None => {
                            // Sparse Cholesky failed — fall back to full NR for this increment
                            solve_tangent_sparse_diagnosed(&k_s_csc, &r_s, &mut sparse_sym_cache, &mut conditioning)?
                        }
                    }
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    let factor = try_cholesky_factor(&k_s, ns);
                    if let Some(found) = crate::known_issues::dense_factor_conditioning(&k_s, ns, factor.as_ref().map(|f| f.l.as_slice())) { conditioning = Some(found); }
                    match factor {
                        Some(factor) => {
                            let result = solve_with_cholesky_factor(&factor.l, &r_s, factor.n);
                            cached_factor = Some(CachedTangentFactor::Dense(factor));
                            result
                        }
                        None => {
                            // Cholesky failed — fall back to full NR for this increment
                            solve_free_dofs(&k_s, &r_s, ns, &mut conditioning)?
                        }
                    }
                }
            } else if ns >= SPARSE_THRESHOLD {
                let k_s_csc = tangent_free_sparse_triplets(
                    &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                );
                solve_tangent_sparse_diagnosed(&k_s_csc, &r_s, &mut sparse_sym_cache, &mut conditioning)?
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                solve_free_dofs(&k_s, &r_s, ns, &mut conditioning)?
            };

            let delta_u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            // Update displacements (free DOFs only)
            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
            if let Some(du_r) = support_step.take() {
                for (r, du) in du_r.iter().enumerate() {
                    u_full[nf + r] += du;
                }
            }
        }

        if !nr_converged {
            // Report the last converged increment, not the iterate given up on.
            converged = false;
            u_full.copy_from_slice(&u_converged);
            break;
        }
        u_converged.copy_from_slice(&u_full);
        converged_factor = load_factor;
    }

    // Find max displacement magnitude
    let max_displacement = compute_max_displacement(&dof_num, &u_full);

    // Results of the last converged state, under the loads it carries.
    let scaled;
    let at_state = if let Some(start) = start {
        scaled = blended_loads_2d(start.input, input, converged_factor);
        &scaled
    } else if converged_factor < 1.0 {
        scaled = scaled_loads_2d(input, converged_factor);
        &scaled
    } else {
        input
    };
    let mut results = build_final_results(at_state, &dof_num, &u_full, &cs)?;
    crate::known_issues::attach(&mut results.structured_diagnostics, conditioning.into_iter().collect());
    crate::known_issues::attach(&mut results.structured_diagnostics, crate::known_issues::for_2d(input, crate::known_issues::Analysis::Corotational));

    Ok(CorotationalResult {
        results,
        iterations: total_iterations,
        converged,
        load_increments: n_increments,
        load_factor: converged_factor,
        max_displacement,
    })
}

/// The model under `factor` times its loads: the state an unconverged solve
/// reports is the last converged increment, and its reactions and member
/// forces are those of the load that increment carries.
fn scaled_loads_2d(input: &SolverInput, factor: f64) -> SolverInput {
    let mut m = input.clone();
    for l in m.loads.iter_mut() {
        match l {
            SolverLoad::Nodal(n) => { n.fx *= factor; n.fz *= factor; n.my *= factor; }
            SolverLoad::Distributed(d) => { d.q_i *= factor; d.q_j *= factor; }
            SolverLoad::AxialDistributed(d) => { d.q_i *= factor; d.q_j *= factor; }
            SolverLoad::PointOnElement(p) => {
                p.p *= factor;
                p.px = p.px.map(|v| v * factor);
                p.my = p.my.map(|v| v * factor);
            }
            // Refused at the entry point.
            SolverLoad::Thermal(_) => {}
        }
    }
    m
}

fn blended_loads_2d(from: &SolverInput, to: &SolverInput, factor: f64) -> SolverInput {
    let mut m = scaled_loads_2d(to, factor);
    m.loads.extend(scaled_loads_2d(from, 1.0 - factor).loads);
    m
}

pub(crate) fn refuse_inclined_motion_2d(input: &SolverInput, from_start: bool) -> Result<(), String> {
    let mut inclined: Vec<&SolverSupport> = crate::ordered::values(&input.supports)
        .filter(|s| s.support_type == "inclinedRoller")
        .filter(|s| from_start || [s.dx, s.dz, s.dry].iter().any(|v| v.is_some_and(|x| x != 0.0)))
        .collect();
    inclined.sort_by_key(|s| s.id);
    match inclined.first() {
        Some(s) => Err(format!(
            "Corotational analysis does not support prescribed displacements or a start state on inclined supports (support {}, node {})",
            s.id, s.node_id
        )),
        None => Ok(()),
    }
}

pub(crate) fn start_state_2d(input: &SolverInput, start: &CorotationalStart2D, dof_num: &DofNumbering) -> Result<(Vec<f64>, Vec<f64>), String> {
    super::linear::validate_input_2d(start.input)?;
    refuse_inclined_motion_2d(start.input, true)?;
    let same_nodes = start.input.nodes.len() == input.nodes.len()
        && crate::ordered::values(&input.nodes).all(|n| {
            crate::ordered::values(&start.input.nodes).any(|m| m.id == n.id && m.x == n.x && m.z == n.z)
        });
    let start_dofs = DofNumbering::build_2d(start.input);
    if !same_nodes || start_dofs.dofs_per_node != dof_num.dofs_per_node {
        return Err("The start state belongs to a model with other nodes".into());
    }
    let mut u = vec![0.0; dof_num.n_total];
    for (&(node_id, local), &index) in &dof_num.map {
        let d = start
            .displacements
            .iter()
            .find(|d| d.node_id == node_id)
            .ok_or_else(|| format!("The start state has no displacement for node {node_id}"))?;
        u[index] = [d.ux, d.uz, d.ry][local];
    }
    let f_start = assembly::assemble_2d(start.input, &start_dofs).f;
    let mut f = vec![0.0; dof_num.n_total];
    for (key, &i) in &start_dofs.map {
        if let Some(&j) = dof_num.map.get(key) {
            f[j] = f_start[i];
        }
    }
    Ok((u, f))
}

/// 3D twin of [`scaled_loads_2d`] (shell, thermal and bimoment loads are
/// refused at the entry point).
fn scaled_loads_3d(input: &SolverInput3D, factor: f64) -> SolverInput3D {
    let mut m = input.clone();
    for l in m.loads.iter_mut() {
        match l {
            SolverLoad3D::Nodal(n) => {
                for v in [&mut n.fx, &mut n.fy, &mut n.fz, &mut n.mx, &mut n.my, &mut n.mz] {
                    *v *= factor;
                }
                n.bw = n.bw.map(|v| v * factor);
            }
            SolverLoad3D::Distributed(d) => {
                for v in [&mut d.q_xi, &mut d.q_xj, &mut d.q_yi, &mut d.q_yj, &mut d.q_zi, &mut d.q_zj] {
                    *v *= factor;
                }
            }
            SolverLoad3D::PointOnElement(p) => { p.py *= factor; p.pz *= factor; }
            _ => {}
        }
    }
    m
}

/// Public entry point for co-rotational assembly (used by arc-length solver).
pub fn assemble_corotational_public(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    assemble_corotational(input, dof_num, u_full, f_int, k_t);
}

/// G·As of a section with a shear area (kN), `None` for an Euler–Bernoulli one.
fn shear_rigidity_2d(mat: &SolverMaterial, sec: &SolverSection) -> Option<f64> {
    let e = mat.e * 1000.0;
    sec.as_y.filter(|&s| s > 0.0).map(|s| e / (2.0 * (1.0 + mat.nu)) * s)
}

/// Timoshenko shear parameter φ = 12EI/(G·As·L²), 0 without a shear area.
///
/// The co-rotational element is the linear element in a frame that follows
/// the chord, so it takes the same φ the linear solver does; it used to pass
/// 0, which solved a member with a shear area as Euler–Bernoulli (22% stiff
/// on a deep cantilever) while the linear solve of the same model did not.
fn timoshenko_phi(e: f64, iz: f64, g_as: Option<f64>, l: f64) -> f64 {
    g_as.map_or(0.0, |g_as| 12.0 * e * iz / (g_as * l * l))
}

/// Assemble co-rotational internal forces and tangent stiffness for all elements.
fn assemble_corotational(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let mut scatter = |gi: usize, gj: usize, v: f64| k_t[gi * n + gj] += v;
    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0; // MPa -> kN/m^2

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            assemble_truss_corotational(
                dof_num, elem, node_i, node_j, e, sec.a,
                u_full, f_int, &mut scatter,
            );
        } else {
            assemble_frame_corotational(
                dof_num, elem, node_i, node_j, e, sec.a, sec.iz, shear_rigidity_2d(mat, sec),
                u_full, f_int, &mut scatter,
            );
        }
    }
}

/// Triplet variant of `assemble_corotational` for the sparse large-model path
/// (ns >= SPARSE_THRESHOLD): identical co-rotational math, but the tangent is
/// accumulated as lower-triangle (gi >= gj) COO triplets instead of a dense
/// n×n matrix. `f_int` is accumulated over ALL n DOFs exactly as in the dense
/// path — reactions at restrained DOFs are computed from `f_int`, not from K.
#[allow(clippy::too_many_arguments)]
pub(crate) fn assemble_corotational_triplets_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    trip_rows: &mut Vec<usize>,
    trip_cols: &mut Vec<usize>,
    trip_vals: &mut Vec<f64>,
) {
    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    let mut scatter = |gi: usize, gj: usize, v: f64| {
        if gi >= gj {
            trip_rows.push(gi);
            trip_cols.push(gj);
            trip_vals.push(v);
        }
    };
    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0; // MPa -> kN/m^2

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            assemble_truss_corotational(
                dof_num, elem, node_i, node_j, e, sec.a,
                u_full, f_int, &mut scatter,
            );
        } else {
            assemble_frame_corotational(
                dof_num, elem, node_i, node_j, e, sec.a, sec.iz, shear_rigidity_2d(mat, sec),
                u_full, f_int, &mut scatter,
            );
        }
    }
}

/// Co-rotational treatment for a 2D truss element.
///
/// `scatter(gi, gj, v)` accumulates one tangent entry: dense `k_t[gi*n+gj]`
/// for the small-model path, lower-triangle triplets for the sparse path.
fn assemble_truss_corotational(
    dof_num: &DofNumbering,
    elem: &SolverElement,
    node_i: &SolverNode,
    node_j: &SolverNode,
    e: f64,
    a: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

    let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| u_full[d]).unwrap_or(0.0);
    let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| u_full[d]).unwrap_or(0.0);
    let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| u_full[d]).unwrap_or(0.0);
    let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| u_full[d]).unwrap_or(0.0);

    // Initial chord + relative displacement (see the 3D element).
    let dx_n = (node_j.x - node_i.x) + (u_xj - u_xi);
    let dy_n = (node_j.z - node_i.z) + (u_yj - u_yi);
    let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();
    let elong = elongation(&[dx0, dy0], &[u_xj - u_xi, u_yj - u_yi], l0, l_n);

    if l_n < 1e-15 {
        return;
    }

    let c = dx_n / l_n;
    let s = dy_n / l_n;

    let d_axial = elong;
    let axial_force = e * a / l0 * d_axial;

    // Internal force: f = N * r, where r = [-c, -s, c, s]
    let r = [-c, -s, c, s];

    let truss_dofs = [
        dof_num.global_dof(elem.node_i, 0).unwrap(),
        dof_num.global_dof(elem.node_i, 1).unwrap(),
        dof_num.global_dof(elem.node_j, 0).unwrap(),
        dof_num.global_dof(elem.node_j, 1).unwrap(),
    ];

    for i in 0..4 {
        f_int[truss_dofs[i]] += axial_force * r[i];
    }

    // Tangent: K = (EA/L0) * r*r^T + (N/L_n) * (z_mat - r*r^T)
    let ea_l0 = e * a / l0;
    let n_over_l = axial_force / l_n;

    for i in 0..4 {
        for j in 0..4 {
            let k_mat = ea_l0 * r[i] * r[j];
            // z_ij for the block-structured identity
            let sign_i = if i < 2 { -1.0 } else { 1.0 };
            let sign_j = if j < 2 { -1.0 } else { 1.0 };
            let delta = if i % 2 == j % 2 { 1.0 } else { 0.0 };
            let z_ij = sign_i * sign_j * delta;
            let k_geo = n_over_l * (z_ij - r[i] * r[j]);

            scatter(truss_dofs[i], truss_dofs[j], k_mat + k_geo);
        }
    }
}

/// Co-rotational treatment for a 2D frame element using the B-matrix formulation.
///
/// Natural deformations: d_n = [d_axial, theta_i_local, theta_j_local]
/// B matrix (3x6): maps 6 global element DOFs to 3 natural deformations.
/// Internal force: f_global = B^T * q, where q = K_nat * d_n.
/// Tangent: K_T = B^T * K_nat * B + K_geo (from Crisfield).
fn assemble_frame_corotational(
    dof_num: &DofNumbering,
    elem: &SolverElement,
    node_i: &SolverNode,
    node_j: &SolverNode,
    e: f64,
    a: f64,
    iz: f64,
    g_as: Option<f64>,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

    // Deformed geometry
    // Initial chord + relative displacement (see the 3D element).
    let dx_n = (node_j.x - node_i.x) + (u_elem[3] - u_elem[0]);
    let dy_n = (node_j.z - node_i.z) + (u_elem[4] - u_elem[1]);
    let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();
    let elong = elongation(&[dx0, dy0], &[u_elem[3] - u_elem[0], u_elem[4] - u_elem[1]], l0, l_n);

    if l_n < 1e-15 {
        return;
    }

    let c = dx_n / l_n;
    let s = dy_n / l_n;

    let beta = chord_rotation(dx0, dy0, u_elem[3] - u_elem[0], u_elem[4] - u_elem[1]);

    // Natural deformations. The deformational rotations are wrapped to
    // (−π, π] (`wrap_angle`): β is a difference of two atan2 values and jumps
    // by 2π where the chord crosses the branch cut, and the nodal rotations
    // are total angles that may exceed π.
    let d_axial = elong;
    let theta_i = wrap_angle(u_elem[2] - beta);
    let theta_j = wrap_angle(u_elem[5] - beta);

    // B matrix (3x6): derivative of natural deformations w.r.t. global DOFs
    // Row 0: d(d_axial)/d(u) = [-c, -s, 0, c, s, 0]
    // Row 1: d(theta_i)/d(u) = -d(beta)/d(u) + [0,0,1,0,0,0]
    //   d(beta)/d(u) = d(alpha_n)/d(u) = [s/l_n, -c/l_n, 0, -s/l_n, c/l_n, 0]
    // Row 2: d(theta_j)/d(u) = -d(beta)/d(u) + [0,0,0,0,0,1]
    let b: [[f64; 6]; 3] = [
        [-c, -s, 0.0, c, s, 0.0],
        [-s / l_n, c / l_n, 1.0, s / l_n, -c / l_n, 0.0],
        [-s / l_n, c / l_n, 0.0, s / l_n, -c / l_n, 1.0],
    ];

    // Natural stiffness K_nat (3x3) = P^T * K_local * P
    // where P maps natural to full local: d_local = P * d_natural
    // Natural deformations are the total elongation d_axial = l_n - l0 and the
    // corotated end rotations theta_i, theta_j. In the corotated local frame
    // node i is at the origin and node j carries the full elongation, so
    // d_local = [0, 0, theta_i, d_axial, 0, theta_j]. (Mapping d_axial as
    // [+d_axial at i, -d_axial at j] instead would make the local elongation
    // u_j - u_i = -2*d_axial and quadruple the effective axial stiffness.)
    let k_local = frame_local_stiffness_2d(e, a, iz, l0, elem.hinge_start, elem.hinge_end, timoshenko_phi(e, iz, g_as, l0));

    let p_mat: [[f64; 3]; 6] = [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0],
    ];

    let mut k_nat = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let mut val = 0.0;
            for r in 0..6 {
                for cc in 0..6 {
                    val += p_mat[r][i] * k_local[r * 6 + cc] * p_mat[cc][j];
                }
            }
            k_nat[i][j] = val;
        }
    }

    // Natural internal forces: q = K_nat * d_natural
    let d_natural = [d_axial, theta_i, theta_j];
    let mut q = [0.0; 3]; // [N, Mi, Mj]
    for i in 0..3 {
        for j in 0..3 {
            q[i] += k_nat[i][j] * d_natural[j];
        }
    }

    // Global internal forces: f_int = B^T * q
    let ndof = 6;
    for i in 0..ndof {
        let mut fi = 0.0;
        for k in 0..3 {
            fi += b[k][i] * q[k];
        }
        f_int[elem_dofs[i]] += fi;
    }

    // --- Tangent stiffness ---

    // Part 1: B^T * K_nat * B (6x6)
    let mut knb = [[0.0; 6]; 3];
    for i in 0..3 {
        for j in 0..ndof {
            let mut val = 0.0;
            for k in 0..3 {
                val += k_nat[i][k] * b[k][j];
            }
            knb[i][j] = val;
        }
    }
    let mut k_mat = [[0.0; 6]; 6];
    for i in 0..ndof {
        for j in 0..ndof {
            let mut val = 0.0;
            for k in 0..3 {
                val += b[k][i] * knb[k][j];
            }
            k_mat[i][j] = val;
        }
    }

    // Part 2: Geometric stiffness from derivative of B
    // Reference: Crisfield Vol 1 (17.33), also de Souza Neto et al.
    //
    // r = [-c, -s, 0, c, s, 0] (unit vector along element axis)
    // z = [s, -c, 0, -s, c, 0] (perpendicular)
    //
    // K_geo = (N/l_n) * z*z^T + ((Mi+Mj)/l_n^2) * (z*r^T + r*z^T)
    let nn = q[0]; // axial force
    let mi = q[1]; // moment at i
    let mj = q[2]; // moment at j

    let r_vec = [-c, -s, 0.0, c, s, 0.0];
    let z_vec = [s, -c, 0.0, -s, c, 0.0];

    let n_over_ln = nn / l_n;
    let m_sum_over_ln2 = (mi + mj) / (l_n * l_n);

    let mut k_geo = [[0.0; 6]; 6];
    for i in 0..ndof {
        for j in 0..ndof {
            k_geo[i][j] = n_over_ln * z_vec[i] * z_vec[j]
                + m_sum_over_ln2 * (z_vec[i] * r_vec[j] + r_vec[i] * z_vec[j]);
        }
    }

    // Assemble: K_mat + K_geo
    for i in 0..ndof {
        for j in 0..ndof {
            scatter(elem_dofs[i], elem_dofs[j], k_mat[i][j] + k_geo[i][j]);
        }
    }
}

/// An angle reduced to (−π, π]: the deformational end rotation θ − β of a
/// 2D co-rotational member (Crisfield vol. 1 §7.3 takes it as atan2 of its
/// sine and cosine for the same reason).
///
/// θ − β was used as is. β = atan2(chord) − atan2(initial chord) jumps by 2π
/// when the chord crosses the negative x axis, so a member drawn right to left
/// (α0 = π) whose chord turned counterclockwise by any amount got 2π of
/// "bending": a cantilever fixed at its right end and loaded downward did not
/// converge, and a member turned rigidly by more than π carried forces.
fn wrap_angle(a: f64) -> f64 {
    let two_pi = 2.0 * std::f64::consts::PI;
    let r = a - two_pi * (a / two_pi).round();
    if r <= -std::f64::consts::PI { r + two_pi } else { r }
}

/// Subtract fixed-end forces (FEF) from element loads in local coordinates.
fn subtract_element_fef(
    input: &SolverInput,
    elem: &SolverElement,
    l: f64,
    e: f64,
    nu: f64,
    _iz: f64,
    f_local: &mut [f64; 6],
    sec: &SolverSection,
) {
    // Timoshenko shear parameter for hinge FEF condensation, matching the
    // convention used by the linear 2D solver.
    let phi = if let Some(as_y) = sec.as_y {
        let g = e / (2.0 * (1.0 + nu));
        12.0 * e * sec.iz / (g * as_y * l * l)
    } else {
        0.0
    };

    for load in &input.loads {
        match load {
            SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                let a_dist = dl.a.unwrap_or(0.0);
                let b_dist = dl.b.unwrap_or(l);
                let is_full = (a_dist.abs() < 1e-12) && ((b_dist - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_2d(dl.q_i, dl.q_j, l, phi)
                } else {
                    fef_partial_distributed_2d(dl.q_i, dl.q_j, a_dist, b_dist, l, phi)
                };
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                let px = pl.px.unwrap_or(0.0);
                let mz = pl.my.unwrap_or(0.0);
                let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l, phi);
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = tl.alpha();
                let h = tl.depth(sec.a, sec.iz);
                let mut fef = fef_thermal_2d(
                    e, sec.a, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient, alpha, h,
                );
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                let fef = crate::element::fef_axial_distributed_2d(al.q_i, al.q_j, al.a.unwrap_or(0.0), al.b.unwrap_or(l), l);
                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            _ => {}
        }
    }
}

/// Add the stiffness and internal forces of everything that is not a member:
/// support springs, connectors (co-rotational, see `element::connector`) and
/// the linear assembler's artificial stiffness `art` on DOFs nothing else
/// holds (`assembly::artificial_stiffness_entries`). `scatter` receives every
/// entry, off-diagonal ones included (see the element assemblers for the
/// dense/triplet split). `u_full` holds true global displacements.
pub(crate) fn add_spring_contributions(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    art: &[(usize, f64)],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    // Shared with the linear assembler (angle, rotational springs on any support).
    for (i, j, k) in super::assembly::support_spring_entries_2d(input, dof_num) {
        scatter(i, j, k);
        f_int[i] += k * u_full[j];
    }
    for &(d, k) in art {
        scatter(d, d, k);
        f_int[d] += k * u_full[d];
    }
    crate::element::connector::corotational_connectors_2d(input, dof_num, u_full, f_int, scatter);
}

/// Solve the free-DOF system K_ff * x = r using dense Cholesky with LU fallback.
/// Cached Cholesky factor (L stored in-place in row-major dense format).
struct CachedCholeskyFactor {
    l: Vec<f64>,
    n: usize,
}

/// Try to compute a Cholesky factorization and return the cached factor.
fn try_cholesky_factor(k: &[f64], n: usize) -> Option<CachedCholeskyFactor> {
    let mut l = k.to_vec();
    if cholesky_decompose(&mut l, n) {
        Some(CachedCholeskyFactor { l, n })
    } else {
        None
    }
}

/// Solve using a previously factored Cholesky L (stored in-place).
fn solve_with_cholesky_factor(l: &[f64], r: &[f64], n: usize) -> Vec<f64> {
    let y = forward_solve(l, r, n);
    back_solve(l, &y, n)
}

/// Cached tangent factorization for the modified Newton-Raphson path:
/// dense Cholesky below `SPARSE_THRESHOLD`, sparse Cholesky (symbolic +
/// numeric, mirroring reduction.rs's `KiiFactorization`) above it.
enum CachedTangentFactor {
    Dense(CachedCholeskyFactor),
    Sparse(NumericCholesky),
}

/// Solve using a cached modified-NR tangent factorization.
fn solve_with_cached_factor(factor: &CachedTangentFactor, r_s: &[f64]) -> Vec<f64> {
    match factor {
        CachedTangentFactor::Dense(f) => solve_with_cholesky_factor(&f.l, r_s, f.n),
        CachedTangentFactor::Sparse(num) => sparse_cholesky_solve(num, r_s),
    }
}

// Sparse symbolic factorization cache and tangent solve helpers now live in
// `super::sparse_tangent` (shared with arc_length, contact and fiber_nonlinear),
// including `tangent_free_sparse_triplets` used by the sparse paths above.

fn solve_free_dofs(k_ff: &[f64], r_f: &[f64], nf: usize, conditioning: &mut Option<StructuredDiagnostic>) -> Result<Vec<f64>, String> {
    let mut k_work = k_ff.to_vec();
    let solved = cholesky_solve(&mut k_work, r_f, nf);
    if let Some(found) = crate::known_issues::dense_factor_conditioning(k_ff, nf, solved.as_ref().map(|_| k_work.as_slice())) { *conditioning = Some(found); }
    match solved {
        Some(u) => Ok(u),
        None => {
            let mut k_work = k_ff.to_vec();
            let mut r_work = r_f.to_vec();
            lu_solve(&mut k_work, &mut r_work, nf)
                .ok_or_else(|| {
                    "Singular tangent stiffness — structure may be a mechanism \
                     or load increment too large"
                        .to_string()
                })
        }
    }
}

/// Find the maximum displacement magnitude across all nodes.
fn compute_max_displacement(dof_num: &DofNumbering, u_full: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

/// Build final AnalysisResults from the converged displacement field.
fn build_final_results(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    cs: &Option<FreeConstraintSystem>,
) -> Result<AnalysisResults, String> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Reactions: co-rotational internal forces at restrained DOFs minus external loads
    let asm = assembly::assemble_2d(input, dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let nr = n - nf;
    let f_r: Vec<f64> = (nf..n).map(|i| asm.f[i]).collect();

    // Reverse the inclined-support rotation to get TRUE global displacements
    // — needed both for correct co-rotational element geometry (elements
    // must see real nodal x/z, not the rotated tangent/normal pair stored
    // at inclined-support DOFs) and for reporting displacements/reactions/
    // element forces in GLOBAL axes, mirroring linear::solve_2d.
    let mut u_geom = u_full.to_vec();
    for it in &asm.inclined_transforms_2d {
        assembly::reverse_inclined_transform_2d(&mut u_geom, &it.dofs, &it.r);
    }

    let displacements = super::linear::build_displacements_2d(dof_num, &u_geom);

    let mut f_int_corot = vec![0.0; n];
    // The dense k_dummy tangent is only consumed by the constraint-forces
    // path below; when no constraints are active, skip the O(n²) assembly
    // entirely and accumulate f_int via the triplet variants (f_int math is
    // identical — reactions come from f_int, never from k_dummy).
    let mut k_dummy = if cs.is_some() { vec![0.0; n * n] } else { Vec::new() };
    if cs.is_some() {
        assemble_corotational(input, dof_num, &u_geom, &mut f_int_corot, &mut k_dummy);
        add_spring_contributions(
            input, dof_num, &u_geom, &mut f_int_corot, &art,
            &mut |gi, gj, v| k_dummy[gi * n + gj] += v,
        );

        // Rotate back into the same rotated frame as asm.f before differencing —
        // mirrors the per-iteration treatment in solve_corotational_2d.
        for it in &asm.inclined_transforms_2d {
            assembly::apply_inclined_transform_2d(&mut k_dummy, &mut f_int_corot, n, &it.dofs, &it.r);
        }
    } else {
        let mut tr = Vec::new();
        let mut tc = Vec::new();
        let mut tv = Vec::new();
        assemble_corotational_triplets_2d(
            input, dof_num, &u_geom, &mut f_int_corot, &mut tr, &mut tc, &mut tv,
        );
        add_spring_contributions(
            input, dof_num, &u_geom, &mut f_int_corot, &art,
            &mut |d, _, v| {
                tr.push(d);
                tc.push(d);
                tv.push(v);
            },
        );
        for it in &asm.inclined_transforms_2d {
            assembly::rotate_inclined_f_2d(&mut f_int_corot, &it.dofs, &it.r);
        }
    }

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = f_int_corot[nf + i] - asm.f[nf + i];
    }

    let mut reactions = super::linear::build_reactions_2d_inclined(
        input, dof_num, &reactions_vec, &f_r, nf, &u_geom, &asm.inclined_transforms_2d,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = compute_corotational_forces(input, dof_num, &u_geom);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active. Uses the
    // pre-reversal u_full/k_dummy/asm.f — all three stay in the same
    // "mixed" (rotated-at-incline-DOFs) convention the free-DOF solve used,
    // same rationale as the constrained-path fix (constraints.rs).
    let constraint_forces = if let Some(ref fcs) = cs {
        let mut k_ff = vec![0.0; nf * nf];
        for i in 0..nf {
            for j in 0..nf {
                k_ff[i * nf + j] = k_dummy[i * n + j];
            }
        }
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        fcs.constraint_forces(&raw, dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None, solver_run_meta: None,
    })
}

/// Compute element internal forces using the co-rotational formulation.
pub fn compute_corotational_forces(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
) -> Vec<ElementForces> {
    let mut forces = Vec::new();

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.z - node_i.z;
            let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

            let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| u_full[d]).unwrap_or(0.0);

            // Initial chord + relative displacement (see the 3D element).
            let dx_n = (node_j.x - node_i.x) + (u_xj - u_xi);
            let dy_n = (node_j.z - node_i.z) + (u_yj - u_yi);
            let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();
            let elong = elongation(&[dx0, dy0], &[u_xj - u_xi, u_yj - u_yi], l0, l_n);

            let d_axial = elong;
            let n_axial = e * sec.a / l0 * d_axial;

            // Loads along the bar: their consistent end loads make N vary along it, as the linear
            // recovery has it (n_start = EAδ/L + f_i, n_end = EAδ/L − f_j), and the diagram reads
            // the span load itself. Without them a bar under an axial span load reported a
            // constant N, even in the small-displacement limit.
            let (mut f_i, mut f_j) = (0.0, 0.0);
            let mut axial_loads_info = Vec::new();
            let mut truss_point_loads = Vec::new();
            for load in &input.loads {
                match load {
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        let px = pl.px.unwrap_or(0.0);
                        if px != 0.0 {
                            f_i += px * (1.0 - pl.a / l0);
                            f_j += px * pl.a / l0;
                            truss_point_loads.push(PointLoadInfo { a: pl.a, p: 0.0, px: Some(px), my: None });
                        }
                    }
                    SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                        let (a, b) = (al.a.unwrap_or(0.0), al.b.unwrap_or(l0));
                        let [fa, fb] = crate::element::axial_distributed_fef(al.q_i, al.q_j, a, b, l0);
                        f_i += fa;
                        f_j += fb;
                        axial_loads_info.push(DistributedLoadInfo { q_i: al.q_i, q_j: al.q_j, a, b });
                    }
                    _ => {}
                }
            }

            forces.push(ElementForces {
                element_id: elem.id,
                n_start: n_axial + f_i,
                n_end: n_axial - f_j,
                v_start: 0.0,
                v_end: 0.0,
                m_start: 0.0,
                m_end: 0.0,
                length: l_n,
                q_i: 0.0,
                q_j: 0.0,
                point_loads: truss_point_loads,
                distributed_loads: Vec::new(), distributed_loads_x: axial_loads_info,
                hinge_start: false,
                hinge_end: false,
            });
        } else {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.z - node_i.z;
            let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

            // Initial chord + relative displacement (see the 3D element).
            let dx_n = (node_j.x - node_i.x) + (u_elem[3] - u_elem[0]);
            let dy_n = (node_j.z - node_i.z) + (u_elem[4] - u_elem[1]);
            let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();
            let elong = elongation(&[dx0, dy0], &[u_elem[3] - u_elem[0], u_elem[4] - u_elem[1]], l0, l_n);
            let beta = chord_rotation(dx0, dy0, u_elem[3] - u_elem[0], u_elem[4] - u_elem[1]);
            let d_axial = elong;
            let theta_i_local = wrap_angle(u_elem[2] - beta);
            let theta_j_local = wrap_angle(u_elem[5] - beta);

            // Co-rotational local deformation: node i at origin, node j displaced axially
            let d_local = [0.0, 0.0, theta_i_local, d_axial, 0.0, theta_j_local];

            let k_local = frame_local_stiffness_2d(
                e, sec.a, sec.iz, l0, elem.hinge_start, elem.hinge_end,
                timoshenko_phi(e, sec.iz, shear_rigidity_2d(mat, sec), l0),
            );

            // f_local = K_local * d_local
            let mut f_local = [0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_local[i] += k_local[i * 6 + j] * d_local[j];
                }
            }

            // Subtract FEF for output (element forces = K*u - FEF)
            subtract_element_fef(input, elem, l0, e, mat.nu, sec.iz, &mut f_local, sec);

            // Collect load metadata
            let (mut total_qi, mut total_qj) = (0.0, 0.0);
            let mut point_loads_info = Vec::new();
            let mut dist_loads_info = Vec::new();
            let mut axial_loads_info = Vec::new();

            for load in &input.loads {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a_dist = dl.a.unwrap_or(0.0);
                        let b_dist = dl.b.unwrap_or(l0);
                        let is_full = (a_dist.abs() < 1e-12) && ((b_dist - l0).abs() < 1e-12);
                        if is_full {
                            total_qi += dl.q_i;
                            total_qj += dl.q_j;
                        }
                        dist_loads_info.push(DistributedLoadInfo {
                            q_i: dl.q_i,
                            q_j: dl.q_j,
                            a: a_dist,
                            b: b_dist,
                        });
                    }
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        point_loads_info.push(PointLoadInfo {
                            a: pl.a,
                            p: pl.p,
                            px: pl.px,
                            my: pl.my,
                        });
                    }
                    SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                        axial_loads_info.push(DistributedLoadInfo {
                            q_i: al.q_i,
                            q_j: al.q_j,
                            a: al.a.unwrap_or(0.0),
                            b: al.b.unwrap_or(l0),
                        });
                    }
                    _ => {}
                }
            }

            // Sign convention: internal forces from member perspective
            forces.push(ElementForces {
                element_id: elem.id,
                n_start: -f_local[0],
                n_end: f_local[3],
                v_start: f_local[1],
                v_end: -f_local[4],
                m_start: f_local[2],
                m_end: -f_local[5],
                length: l_n,
                q_i: total_qi,
                q_j: total_qj,
                point_loads: point_loads_info,
                distributed_loads: dist_loads_info,
                distributed_loads_x: axial_loads_info,
                hinge_start: elem.hinge_start,
                hinge_end: elem.hinge_end,
            });
        }
    }

    forces
}

// ============================================================
// 3D Co-rotational Large Displacement Solver
// ============================================================

/// Solve a 3D frame using co-rotational large displacement analysis.
///
/// Extends the 2D formulation to 3D with:
/// - Full co-rotational treatment for trusses/cables (exact for any rotation)
/// - Updated Lagrangian with geometric stiffness for frame elements
/// - Incremental-iterative loading with Newton-Raphson inner loops
///
/// References:
///   - Crisfield, "Non-linear Finite Element Analysis of Solids and Structures" Vol 1&2
///   - Battini, "Co-rotational beam elements in instability problems" (2002)
///   - Przemieniecki, "Theory of Matrix Structural Analysis" (1968)
pub fn solve_corotational_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    modified_nr: bool,
) -> Result<CorotationalResult3D, String> {
    // Same degenerate parameters as the 2D entry point, refused for the same
    // reason: an empty `1..=0` increment range reports the untouched zero
    // state as a converged answer.
    if n_increments == 0 {
        return Err("Number of load increments must be at least 1".into());
    }
    if max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err("Convergence tolerance must be finite and positive".into());
    }

    // Input validation and pre-solve gates
    super::linear::validate_input_3d(input)?;
    let pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_3d(input);

    // Corotational 3D only handles frame elements — reject models with shells
    let has_shells = !input.plates.is_empty()
        || !input.quads.is_empty()
        || !input.quad9s.is_empty()
        || !input.solid_shells.is_empty()
        || !input.curved_shells.is_empty();
    if has_shells {
        return Err("Corotational 3D solver does not support shell elements. \
            Use the linear solver for models with plates, quads, or shells.".into());
    }
    // The co-rotational element carries the Wagner term of a doubly symmetric
    // section (internal torque and tangent) but not the shear-centre coupling of
    // a monosymmetric one: refused rather than missing its flexural-torsional
    // instability without a word.
    // Only the sections of frame members: the catalogue may hold unused ones, and a truss has
    // no flexural-torsional coupling to miss.
    let frame_sections: std::collections::HashSet<usize> =
        crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame").map(|e| e.section_id).collect();
    if let Some(sec) = crate::ordered::values(&input.sections).filter(|s| frame_sections.contains(&s.id)).find(|s| {
        s.shear_center_y.is_some_and(|v| v != 0.0) || s.shear_center_z.is_some_and(|v| v != 0.0)
    }) {
        return Err(format!(
            "Corotational 3D solver does not model a shear-centre offset (section {}): \
             flexural-torsional coupling is not included. Use linear buckling or P-Delta.",
            sec.id
        ));
    }

    // Expand curved beams before DOF numbering and assembly.
    // As in 2D: no prescribed-displacement term, and
    // temperature as fixed global forces.
    super::feature_gates::refuse_3d(input, "Corotational analysis", &[
        super::feature_gates::Feature::PrescribedDisplacements, super::feature_gates::Feature::ThermalLoads,
        // The 3D co-rotational element has no warping DOF.
        super::feature_gates::Feature::Warping,
    ])?;
    crate::element::connector::refuse_for_corotational_3d(input, "Corotational analysis")?;
    let input = &super::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let left_hand = input.left_hand.unwrap_or(false);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input, &dof_num)?;
    let metric = super::convergence::EquilibriumMetric::for_3d(input, &dof_num, cs.as_ref())?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Reference load vector from linear assembly
    let asm = assembly::assemble_3d(input, &dof_num);
    let f_total = asm.f.clone();

    let mut u_full = vec![0.0; n];
    let mut total_iterations = 0;
    let mut converged = true;
    // The state and load factor of the last converged increment.
    let mut u_converged = u_full.clone();
    let mut naturals = member_deformations_3d(input, &dof_num, &u_full, left_hand);
    let mut converged_factor = 0.0f64;

    // See solve_corotational_2d: sparse symbolic factorization cache for the
    // ns >= SPARSE_THRESHOLD path (pattern is constant within a solve call).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;
    let mut conditioning = None;

    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;
        let mut cached_factor: Option<CachedTangentFactor> = None;
        for _iter in 0..max_iter {
            total_iterations += 1;

            let mut f_int = vec![0.0; n];
            // See solve_corotational_2d: dense tangent below
            // SPARSE_THRESHOLD, lower-triangle triplets at or above it.
            let sparse_tangent = ns >= SPARSE_THRESHOLD;
            let mut k_t: Vec<f64> = Vec::new();
            let mut trip_rows: Vec<usize> = Vec::new();
            let mut trip_cols: Vec<usize> = Vec::new();
            let mut trip_vals: Vec<f64> = Vec::new();

            // See the 2D solver's identical comment: elements need TRUE
            // global nodal displacements; u_full keeps inclined-support
            // DOFs in the rotated (normal, tangent, tangent) basis.
            let mut u_geom = u_full.clone();
            for it in &asm.inclined_transforms {
                assembly::reverse_inclined_transform(&mut u_geom, &it.dofs, &it.r);
            }

            if sparse_tangent {
                assemble_corotational_triplets_3d(
                    input, &dof_num, &u_geom, &mut f_int,
                    &mut trip_rows, &mut trip_cols, &mut trip_vals,
                    left_hand,
                );
                add_spring_contributions_3d(
                    input, &dof_num, &u_geom, &mut f_int,
                    &mut |gi, gj, v| {
                        if gi >= gj {
                            trip_rows.push(gi);
                            trip_cols.push(gj);
                            trip_vals.push(v);
                        }
                    },
                );
                // Triplet K rotation + f rotation == dense
                // apply_inclined_transform (see comment below).
                for it in &asm.inclined_transforms {
                    assembly::apply_inclined_transform_triplets(
                        &mut trip_rows, &mut trip_cols, &mut trip_vals,
                        &mut f_int, &it.dofs, &it.r,
                    );
                }
            } else {
                k_t = vec![0.0; n * n];
                assemble_corotational_3d(input, &dof_num, &u_geom, &mut f_int, &mut k_t, left_hand);
                add_spring_contributions_3d(
                    input, &dof_num, &u_geom, &mut f_int,
                    &mut |gi, gj, v| k_t[gi * n + gj] += v,
                );

                // Rotate back into the rotated frame so K_T/f_int stay
                // consistent with f_ext (rotated by assemble_3d) for the
                // residual/solve below.
                for it in &asm.inclined_transforms {
                    assembly::apply_inclined_transform(&mut k_t, &mut f_int, n, &it.dofs, &it.r);
                }
            }

            // Residual R = F_ext - f_int
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Reduce residual and check convergence on independent DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let rel_error = metric.relative_residual(&residual, &f_ext, None, cs.as_ref());

            if rel_error < tolerance {
                nr_converged = true;
                break;
            }

            // Solve K_T * delta_u = R (with constraint reduction if present)
            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if modified_nr {
                if let Some(ref factor) = cached_factor {
                    solve_with_cached_factor(factor, &r_s)
                } else if ns >= SPARSE_THRESHOLD {
                    // Sparse path: symbolic factorization is cached across
                    // iterations (pattern is constant); only the numeric
                    // phase runs here, and the resulting factor is reused
                    // for the rest of the increment.
                    let k_s_csc = tangent_free_sparse_triplets(
                        &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                    );
                    let sym = cached_symbolic(&mut sparse_sym_cache, &k_s_csc);
                    let factor = numeric_cholesky(sym, &k_s_csc);
                    if let Some(found) = crate::known_issues::sparse_factor_conditioning(&k_s_csc, factor.as_ref()) { conditioning = Some(found); }
                    match factor {
                        Some(num) => {
                            let result = sparse_cholesky_solve(&num, &r_s);
                            cached_factor = Some(CachedTangentFactor::Sparse(num));
                            result
                        }
                        None => solve_tangent_sparse_diagnosed(&k_s_csc, &r_s, &mut sparse_sym_cache, &mut conditioning)?,
                    }
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    let factor = try_cholesky_factor(&k_s, ns);
                    if let Some(found) = crate::known_issues::dense_factor_conditioning(&k_s, ns, factor.as_ref().map(|f| f.l.as_slice())) { conditioning = Some(found); }
                    match factor {
                        Some(factor) => {
                            let result = solve_with_cholesky_factor(&factor.l, &r_s, factor.n);
                            cached_factor = Some(CachedTangentFactor::Dense(factor));
                            result
                        }
                        None => solve_free_dofs(&k_s, &r_s, ns, &mut conditioning)?,
                    }
                }
            } else if ns >= SPARSE_THRESHOLD {
                let k_s_csc = tangent_free_sparse_triplets(
                    &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                );
                solve_tangent_sparse_diagnosed(&k_s_csc, &r_s, &mut sparse_sym_cache, &mut conditioning)?
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                solve_free_dofs(&k_s, &r_s, ns, &mut conditioning)?
            };

            let delta_u = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            for i in 0..nf {
                u_full[i] += delta_u[i];
            }
        }

        if !nr_converged {
            // Report the last converged increment, not the iterate given up on.
            converged = false;
            u_full.copy_from_slice(&u_converged);
            break;
        }
        naturals = on_one_branch_3d(input, &dof_num, (&u_converged, &naturals), &u_full, left_hand)?;
        u_converged.copy_from_slice(&u_full);
        converged_factor = load_factor;
    }

    let deformations = on_one_branch_3d(input, &dof_num, (&u_converged, &naturals), &u_full, left_hand)?;
    let max_displacement = compute_max_displacement_3d(&dof_num, &u_full);
    let scaled;
    let at_state = if converged_factor < 1.0 {
        scaled = scaled_loads_3d(input, converged_factor);
        &scaled
    } else {
        input
    };
    let mut results = build_final_results_3d(at_state, &dof_num, &u_full, left_hand, &cs, pre_solve_diags)?;
    crate::known_issues::attach(&mut results.structured_diagnostics, conditioning.into_iter().collect());
    crate::known_issues::attach(&mut results.structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Corotational));
    if deformations.iter().any(|d| d.natural > crate::known_issues::NL3_NATURAL_ROTATION) {
        crate::known_issues::attach(&mut results.structured_diagnostics, vec![crate::known_issues::corotational_natural_rotation()]);
    }
    crate::known_issues::refuse(&results.structured_diagnostics)?;

    Ok(CorotationalResult3D {
        results,
        iterations: total_iterations,
        converged,
        load_increments: n_increments,
        load_factor: converged_factor,
        max_displacement,
    })
}

/// Assemble co-rotational internal forces and tangent stiffness for all 3D elements.
fn assemble_corotational_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    left_hand: bool,
) {
    let n = dof_num.n_total;
    let mut scatter = |gi: usize, gj: usize, v: f64| k_t[gi * n + gj] += v;
    assemble_corotational_3d_impl(input, dof_num, u_full, f_int, &mut scatter, left_hand);
}

/// Triplet variant of `assemble_corotational_3d` for the sparse large-model
/// path (ns >= SPARSE_THRESHOLD): identical co-rotational math, tangent
/// accumulated as lower-triangle (gi >= gj) COO triplets. See the 2D twin
/// `assemble_corotational_triplets_2d` for the full rationale.
#[allow(clippy::too_many_arguments)]
fn assemble_corotational_triplets_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    trip_rows: &mut Vec<usize>,
    trip_cols: &mut Vec<usize>,
    trip_vals: &mut Vec<f64>,
    left_hand: bool,
) {
    let mut scatter = |gi: usize, gj: usize, v: f64| {
        if gi >= gj {
            trip_rows.push(gi);
            trip_cols.push(gj);
            trip_vals.push(v);
        }
    };
    assemble_corotational_3d_impl(input, dof_num, u_full, f_int, &mut scatter, left_hand);
}

fn assemble_corotational_3d_impl(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
    left_hand: bool,
) {
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0; // MPa → kN/m²
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            assemble_truss_corotational_3d(
                dof_num, elem, node_i, node_j, e, sec.a,
                u_full, f_int, scatter,
            );
        } else {
            let l = {
                let dx = node_j.x - node_i.x;
                let dy = node_j.y - node_i.y;
                let dz = node_j.z - node_i.z;
                (dx * dx + dy * dy + dz * dz).sqrt()
            };
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| if ay > 0.0 { 12.0 * e * sec.iy / (g * ay * l2) } else { 0.0 }).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| if az > 0.0 { 12.0 * e * sec.iz / (g * az * l2) } else { 0.0 }).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            assemble_frame_corotational_3d(
                dof_num, elem, node_i, node_j,
                e, sec.a, sec.iy, sec.iz, sec.j, g, phi_y, phi_z,
                u_full, f_int, scatter, left_hand,
            );
        }
    }
}

/// Co-rotational treatment for a 3D truss/cable element.
///
/// Exact for arbitrary rotations. Uses deformed geometry to compute:
/// - Axial force: N = EA/L0 * (L_n - L_0)
/// - Internal force: f = N * r, where r = deformed direction
/// - Tangent: K = (EA/L0) * r⊗r + (N/L_n) * (I_block - r⊗r)
fn assemble_truss_corotational_3d(
    dof_num: &DofNumbering,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    e: f64,
    a: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let dz0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

    // Get translational DOFs only (trusses use DOFs 0,1,2 per node)
    let mut truss_dofs = [0usize; 6];
    for i in 0..3 {
        truss_dofs[i] = dof_num.global_dof(elem.node_i, i).unwrap();
        truss_dofs[i + 3] = dof_num.global_dof(elem.node_j, i).unwrap();
    }

    let u_xi = u_full[truss_dofs[0]];
    let u_yi = u_full[truss_dofs[1]];
    let u_zi = u_full[truss_dofs[2]];
    let u_xj = u_full[truss_dofs[3]];
    let u_yj = u_full[truss_dofs[4]];
    let u_zj = u_full[truss_dofs[5]];

    let dx_n = dx0 + u_xj - u_xi;
    let dy_n = dy0 + u_yj - u_yi;
    let dz_n = dz0 + u_zj - u_zi;
    let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();
    let elong = elongation(&[dx0, dy0, dz0], &[u_xj - u_xi, u_yj - u_yi, u_zj - u_zi], l0, l_n);

    if l_n < 1e-15 {
        return;
    }

    let r = [dx_n / l_n, dy_n / l_n, dz_n / l_n];
    let axial_force = e * a / l0 * elong;

    // Internal force: f = N * [-r, r]
    let signs: [f64; 6] = [-1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    for i in 0..6 {
        f_int[truss_dofs[i]] += axial_force * signs[i] * r[i % 3];
    }

    // Tangent: K = (EA/L0) * R⊗R + (N/L_n) * (Z - R⊗R)
    let ea_l0 = e * a / l0;
    let n_over_l = if l_n > 1e-15 { axial_force / l_n } else { 0.0 };

    for i in 0..6 {
        for j in 0..6 {
            let ri = signs[i] * r[i % 3];
            let rj = signs[j] * r[j % 3];

            // Block identity: z_ij = sign_i * sign_j * delta(i%3, j%3)
            let delta = if i % 3 == j % 3 { 1.0 } else { 0.0 };
            let z_ij = signs[i] * signs[j] * delta;

            scatter(truss_dofs[i], truss_dofs[j], ea_l0 * ri * rj + n_over_l * (z_ij - ri * rj));
        }
    }
}

/// Co-rotational treatment for a 3D frame element.
///
/// Uses the direct natural deformation approach:
/// 1. Compute corotated axes from deformed node positions
/// 2. Extract natural deformations (rigid body removed)
/// 3. f_local = K_local * d_nat
/// 4. f_global = T_n^T * f_local
/// 5. K_T = T_n^T * K_local * T_n + K_geometric
fn assemble_frame_corotational_3d(
    dof_num: &DofNumbering,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    e: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    g: f64,
    phi_y: f64,
    phi_z: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
    left_hand: bool,
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let dz0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    if elem_dofs.len() < 12 {
        return; // Need at least 6 DOFs per node
    }
    let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

    // Deformed node positions
    // Current chord from the initial chord plus the relative displacement,
    // never as a difference of absolute deformed positions: x + u rounds u to
    // ulp(x), which for a model 400 m from the origin (let alone in survey
    // coordinates) put a residual floor above the convergence tolerance and
    // the solve never converged (found by the metamorphic rotation check:
    // the same building translated 400 m failed).
    let dx_n = dx0 + (u_elem[6] - u_elem[0]);
    let dy_n = dy0 + (u_elem[7] - u_elem[1]);
    let dz_n = dz0 + (u_elem[8] - u_elem[2]);
    let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();
    let elong = elongation(&[dx0, dy0, dz0], &[u_elem[6] - u_elem[0], u_elem[7] - u_elem[1], u_elem[8] - u_elem[2]], l0, l_n);

    if l_n < 1e-15 {
        return;
    }

    // Resolve the local-Y reference once from the initial geometry so both
    // frames share it (robust to the default convention's vertical singularity).
    let (ref_yx, ref_yy, ref_yz) = corot_local_y_ref(
        node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
        elem.local_yx, elem.local_yy, elem.local_yz,
    );

    // Original local axes
    let (ex_0, ey_0, ez_0) = compute_local_axes_3d(
        node_i.x, node_i.y, node_i.z,
        node_j.x, node_j.y, node_j.z,
        ref_yx, ref_yy, ref_yz,
        elem.roll_angle, left_hand,
    );

    let ((ex_n, ey_n, ez_n), theta_i_nat, theta_j_nat, _) = natural_rotations_3d(
        (&ex_0, &ey_0, &ez_0),
        [u_elem[3], u_elem[4], u_elem[5]], [u_elem[9], u_elem[10], u_elem[11]],
        [0, 1, 2].map(|k| (u_elem[6 + k] - u_elem[k]) / l0),
    );

    // Natural deformations (rigid body removed)
    let d_nat = [
        0.0, 0.0, 0.0,
        theta_i_nat[0], theta_i_nat[1], theta_i_nat[2],
        elong, 0.0, 0.0,
        theta_j_nat[0], theta_j_nat[1], theta_j_nat[2],
    ];

    // Local stiffness (using original length)
    let k_local = frame_local_stiffness_3d(
        e, a, iy, iz, j, l0, g,
        Hinge3D::from_elem(elem), phi_y, phi_z,
    );

    // f_local = K_local * d_nat
    let mut f_local = [0.0; 12];
    for i in 0..12 {
        for jj in 0..12 {
            f_local[i] += k_local[i * 12 + jj] * d_nat[jj];
        }
    }
    current_length_shears(&mut f_local, l0, l_n);

    // Wagner torque (see `add_wagner_torque`); the tangent below carries the same term.
    let kg_sec = wagner_section(a, iy, iz);
    let axial_p = -f_local[0]; // Tension positive
    add_wagner_torque(&mut f_local, &d_nat, elem, &kg_sec, l_n);

    // Corotated transformation matrix
    let t_n = frame_transform_3d(&ex_n, &ey_n, &ez_n);

    // f_global = T_n^T * f_local
    let f_local_vec: Vec<f64> = f_local.to_vec();
    let f_global = transform_force(&f_local_vec, &t_n, 12);

    // Handle DOF mapping for warping models (7 DOF per node)
    let ndof_elem = elem_dofs.len();
    if ndof_elem == 12 {
        for i in 0..12 {
            f_int[elem_dofs[i]] += f_global[i];
        }
    } else if ndof_elem == 14 {
        // Map 12-DOF forces to 14-DOF element (skip warping DOFs 6, 13)
        let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
        for (i12, &i14) in map.iter().enumerate() {
            f_int[elem_dofs[i14]] += f_global[i12];
        }
    }

    // Tangent stiffness: T_n^T * K_local * T_n
    let k_glob = transform_stiffness(&k_local, &t_n, 12);

    // Geometric stiffness (Przemieniecki formula, plus the Wagner term above)
    // Condensed for the end releases: a released end rotation belongs to no
    // one, and the uncondensed matrix put −4·P·L/30 on it.
    let k_geo_local = super::geometric_stiffness::frame_kg_local_3d(axial_p, l_n, &Hinge3D::from_elem(elem), &kg_sec);
    let k_geo_global = transform_stiffness(&k_geo_local, &t_n, 12);

    // Scatter to global
    if ndof_elem == 12 {
        for i in 0..12 {
            for jj in 0..12 {
                scatter(elem_dofs[i], elem_dofs[jj], k_glob[i * 12 + jj] + k_geo_global[i * 12 + jj]);
            }
        }
    } else if ndof_elem == 14 {
        let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
        for (i12, &i14) in map.iter().enumerate() {
            for (j12, &j14) in map.iter().enumerate() {
                scatter(elem_dofs[i14], elem_dofs[j14], k_glob[i12 * 12 + j12] + k_geo_global[i12 * 12 + j12]);
            }
        }
    }
}

/// Elongation L − L0 of a chord `d0` displaced by `du` (end j minus end i),
/// with `l_n` = |d0 + du|, computed without the cancellation of L − L0.
///
/// Taken as the difference of two lengths, the elongation carried a rounding
/// error of order ε·L0, so the axial force a residual of order ε·EA: under a
/// small load (a 0.001 kN tip load on a 3 m cantilever) Newton could never
/// reach the tolerance, and once an unconverged solve stopped returning its
/// last iterate the answer was gone. (2·d0·du + du·du)/(L + L0) is exact.
pub(crate) fn elongation(d0: &[f64], du: &[f64], l0: f64, l_n: f64) -> f64 {
    let num: f64 = d0.iter().zip(du).map(|(a, b)| (2.0 * a + b) * b).sum();
    let den = l_n + l0;
    if den > 0.0 { num / den } else { 0.0 }
}

/// Rotate `v` by the rotation vector `theta` (Rodrigues).
fn rotate_by(theta: [f64; 3], v: &[f64; 3]) -> [f64; 3] {
    let t = (theta[0] * theta[0] + theta[1] * theta[1] + theta[2] * theta[2]).sqrt();
    if t < 1e-300 {
        return *v;
    }
    let k = [theta[0] / t, theta[1] / t, theta[2] / t];
    let (c, s) = (t.cos(), t.sin());
    let kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    let kxv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    [0, 1, 2].map(|m| v[m] * c + kxv[m] * s + k[m] * kv * (1.0 - c))
}

type Mat3 = [[f64; 3]; 3];

fn columns(a: &[f64; 3], b: &[f64; 3], c: &[f64; 3]) -> Mat3 {
    [[a[0], b[0], c[0]], [a[1], b[1], c[1]], [a[2], b[2], c[2]]]
}

fn mat_mul(a: &Mat3, b: &Mat3) -> Mat3 {
    let mut out = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            out[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    out
}

fn transposed(a: &Mat3) -> Mat3 {
    [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]]
}

fn rotation_matrix(theta: [f64; 3]) -> Mat3 {
    let e = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]].map(|v| rotate_by(theta, &v));
    columns(&e[0], &e[1], &e[2])
}

fn rotation_delta(theta: [f64; 3]) -> Mat3 {
    let t = theta.into_iter().fold(0.0f64, f64::hypot);
    let sinc = if t == 0.0 { 1.0 } else { t.sin() / t };
    let half_t = 0.5 * t;
    let half_sinc = if half_t == 0.0 {
        1.0
    } else {
        half_t.sin() / half_t
    };
    let a = [
        [0.0, -theta[2], theta[1]],
        [theta[2], 0.0, -theta[0]],
        [-theta[1], theta[0], 0.0],
    ];
    let a2 = mat_mul(&a, &a);
    std::array::from_fn(|i| {
        std::array::from_fn(|j| sinc * a[i][j] + 0.5 * half_sinc * half_sinc * a2[i][j])
    })
}

fn compose_rotation_deltas(a: &Mat3, b: &Mat3) -> Mat3 {
    let ab = mat_mul(a, b);
    std::array::from_fn(|i| std::array::from_fn(|j| a[i][j] + b[i][j] + ab[i][j]))
}

fn rotation_vector_delta(d: &Mat3) -> [f64; 3] {
    let skew = [
        (d[2][1] - d[1][2]) / 2.0,
        (d[0][2] - d[2][0]) / 2.0,
        (d[1][0] - d[0][1]) / 2.0,
    ];
    let sin = skew.into_iter().fold(0.0f64, f64::hypot);
    let cos = (1.0 + 0.5 * (d[0][0] + d[1][1] + d[2][2])).clamp(-1.0, 1.0);
    if sin == 0.0 && cos > 0.0 {
        return skew;
    }
    if cos < 0.0 && sin < 1e-12 {
        let r = std::array::from_fn(|i| {
            std::array::from_fn(|j| d[i][j] + if i == j { 1.0 } else { 0.0 })
        });
        return rotation_vector(&r);
    }
    let factor = sin.atan2(cos) / sin;
    skew.map(|v| v * factor)
}

type Axes3 = ([f64; 3], [f64; 3], [f64; 3]);

/// The nodal rotation DOFs hold total rotation vectors ψ, so they must go through exp(ψ) before
/// being compared: differencing them is wrong for non-coaxial rotations. The last value bounds
/// either end's turn against the chord frame (chord from the mean end frame, plus half the turn
/// between the ends): below π the natural rotations are on their principal branch.
fn natural_rotations_3d(
    (ex_0, ey_0, ez_0): (&[f64; 3], &[f64; 3], &[f64; 3]),
    psi_i: [f64; 3],
    psi_j: [f64; 3],
    relative_chord_increment: [f64; 3],
) -> (Axes3, [f64; 3], [f64; 3], f64) {
    let dot = |a: &[f64; 3], b: &[f64; 3]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let cross = |a: &[f64; 3], b: &[f64; 3]| {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    };
    let norm = |a: [f64; 3]| a.into_iter().fold(0.0f64, f64::hypot);
    let du = relative_chord_increment;
    let stretch = (2.0 * dot(ex_0, &du) + dot(&du, &du))
        / (1.0 + norm(std::array::from_fn(|k| ex_0[k] + du[k])));
    let delta_chord = std::array::from_fn(|k| (du[k] - stretch * ex_0[k]) / (1.0 + stretch));
    let ex_n = std::array::from_fn(|k| ex_0[k] + delta_chord[k]);
    let d_i = rotation_delta(psi_i);
    let d_j = rotation_delta(psi_j);
    let half =
        rotation_vector_delta(&compose_rotation_deltas(&transposed(&d_i), &d_j)).map(|v| 0.5 * v);
    let d_mean = compose_rotation_deltas(&d_i, &rotation_delta(half));
    let turn = |v: &[f64; 3]| [0, 1, 2].map(|m| (0..3).map(|k| d_mean[m][k] * v[k]).sum::<f64>());
    let delta_mean = turn(ex_0);
    let difference = std::array::from_fn(|k| delta_chord[k] - delta_mean[k]);
    let k0 = cross(ex_0, &difference);
    let k1 = cross(&delta_mean, &delta_chord);
    let k = std::array::from_fn(|i| k0[i] + k1[i]);
    let sin = norm(k);
    let cos =
        1.0 + dot(
            ex_0,
            &std::array::from_fn(|i| delta_mean[i] + delta_chord[i]),
        ) + dot(&delta_mean, &delta_chord);
    let angle = sin.atan2(cos);
    let phi = if sin > 0.0 {
        k.map(|v| v / sin * angle)
    } else {
        [0.0; 3]
    };
    let d_n = compose_rotation_deltas(&rotation_delta(phi), &d_mean);
    let turned =
        |v: &[f64; 3]| [0, 1, 2].map(|m| v[m] + (0..3).map(|k| d_n[m][k] * v[k]).sum::<f64>());
    let r_0 = columns(ex_0, ey_0, ez_0);
    let natural = |d: &Mat3| {
        rotation_vector_delta(&mat_mul(
            &mat_mul(
                &transposed(&r_0),
                &compose_rotation_deltas(&transposed(&d_n), d),
            ),
            &r_0,
        ))
    };
    (
        (ex_n, turned(ey_0), turned(ez_0)),
        natural(&d_i),
        natural(&d_j),
        angle + norm(half),
    )
}

/// Each frame member's largest natural rotation and the turn of its chord away from its mean end frame.
struct MemberDeformation3D {
    id: usize,
    natural: f64,
    chord: f64,
    ends: [[f64; 3]; 2],
}

fn on_one_branch_3d(input: &SolverInput3D, dof_num: &DofNumbering, (u_before, before): (&[f64], &[MemberDeformation3D]), u: &[f64], left_hand: bool) -> Result<Vec<MemberDeformation3D>, String> {
    let turned = |node: usize| {
        let d = [3, 4, 5].map(|i| dof_num.global_dof(node, i).map(|k| u[k] - u_before[k]).unwrap_or(0.0));
        (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt()
    };
    for e in crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame") {
        if turned(e.node_i).max(turned(e.node_j)) > MAX_RELATIVE_END_ROTATION {
            return Err(format!(
                "Co-rotational 3D: an end of member {} turned more than {MAX_RELATIVE_END_ROTATION:.2} rad within one load increment; use more load increments",
                e.id
            ));
        }
    }
    if let Some((id, turn)) = largest_relative_end_rotation_3d(input, dof_num, u).filter(|&(_, turn)| turn > MAX_RELATIVE_END_ROTATION) {
        return Err(format!(
            "Co-rotational 3D: the ends of member {id} turn {turn:.2} rad relative to each other, more than {MAX_RELATIVE_END_ROTATION:.2} rad; split it into shorter members"
        ));
    }
    let now = member_deformations_3d(input, dof_num, u, left_hand);
    if let Some(d) = now.iter().find(|d| d.chord > MAX_RELATIVE_END_ROTATION) {
        return Err(format!(
            "Co-rotational 3D: the chord of member {} and its ends may be up to {:.2} rad apart (chord turn plus half the turn between the ends), more than {MAX_RELATIVE_END_ROTATION:.2} rad; split it into shorter members",
            d.id, d.chord
        ));
    }
    let jump = |a: [f64; 3], b: [f64; 3]| ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt();
    let before: std::collections::HashMap<usize, &MemberDeformation3D> = before.iter().map(|b| (b.id, b)).collect();
    for (d, b) in now.iter().filter_map(|d| Some((d, *before.get(&d.id)?))) {
        if (0..2).any(|k| jump(d.ends[k], b.ends[k]) > std::f64::consts::PI) {
            return Err(format!(
                "Co-rotational 3D: an end of member {} turned more than {:.2} rad against its chord within one load increment; use more load increments or split it into shorter members",
                d.id,
                std::f64::consts::PI
            ));
        }
    }
    Ok(now)
}

fn member_deformations_3d(input: &SolverInput3D, dof_num: &DofNumbering, u: &[f64], left_hand: bool) -> Vec<MemberDeformation3D> {
    let at = |node: usize, i: usize| dof_num.global_dof(node, i).map(|d| u[d]).unwrap_or(0.0);
    let norm = |v: [f64; 3]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame").filter_map(|e| {
        let (ni, nj) = (*node_by_id.get(&e.node_i)?, *node_by_id.get(&e.node_j)?);
        let d = [0, 1, 2].map(|k| [nj.x - ni.x, nj.y - ni.y, nj.z - ni.z][k] + at(e.node_j, k) - at(e.node_i, k));
        let l_n = norm(d);
        if l_n < 1e-15 { return None; }
        let (ry_x, ry_y, ry_z) = corot_local_y_ref(ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, e.local_yx, e.local_yy, e.local_yz);
        let (ex_0, ey_0, ez_0) = compute_local_axes_3d(ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, ry_x, ry_y, ry_z, e.roll_angle, left_hand);
        let (_, ti, tj, chord) = natural_rotations_3d((&ex_0, &ey_0, &ez_0), [3, 4, 5].map(|k| at(e.node_i, k)), [3, 4, 5].map(|k| at(e.node_j, k)), [0, 1, 2].map(|k| (at(e.node_j, k) - at(e.node_i, k)) / norm([nj.x-ni.x, nj.y-ni.y, nj.z-ni.z])));
        Some(MemberDeformation3D { id: e.id, natural: norm(ti).max(norm(tj)), chord, ends: [ti, tj] })
    }).collect()
}

/// Past half a turn between a member's ends the rotation matrices no longer say which whole turn is meant.
const MAX_RELATIVE_END_ROTATION: f64 = 0.9 * std::f64::consts::PI;

fn largest_relative_end_rotation_3d(input: &SolverInput3D, dof_num: &DofNumbering, u: &[f64]) -> Option<(usize, f64)> {
    let psi = |node: usize| [3, 4, 5].map(|i| dof_num.global_dof(node, i).map(|d| u[d]).unwrap_or(0.0));
    let norm = |v: [f64; 3]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame").map(|e| {
        let (psi_i, psi_j) = (psi(e.node_i), psi(e.node_j));
        let r_i_t = transposed(&rotation_matrix(psi_i));
        let principal = norm(rotation_vector(&mat_mul(&r_i_t, &rotation_matrix(psi_j))));
        let accumulated = norm([0, 1, 2].map(|m| (0..3).map(|k| r_i_t[m][k] * (psi_j[k] - psi_i[k])).sum::<f64>()));
        (e.id, principal.max(accumulated))
    }).fold(None, |largest: Option<(usize, f64)>, (id, turn)| match largest {
        Some((_, most)) if most >= turn => largest,
        _ => Some((id, turn)),
    })
}

/// End shears in equilibrium with the end moments on the CURRENT chord.
///
/// With only rotations and the elongation in `d_nat`, every row of K·d gives
/// shears V = (M_i + M_j)/L0, for any release or shear area. The member's end
/// forces have to balance on the deformed chord, L_n: the 2D element does this
/// through its B matrix, the 3D one did not, and left an out-of-balance of the
/// order of the axial strain in every member.
fn current_length_shears(f_local: &mut [f64; 12], l0: f64, l_n: f64) {
    let r = l0 / l_n;
    for k in [1, 2, 7, 8] {
        f_local[k] *= r;
    }
}

/// Rotation vector (axis × angle) of a rotation matrix: the logarithmic map.
///
/// The rigid rotation of a member's chord frame used to be taken as the axial
/// vector of the skew part of R, which is sin(θ)·axis, not θ·axis: 1% short at
/// 0.25 rad and 36% at 90°. The natural end rotations, nodal rotation minus
/// rigid rotation, then carried the difference as spurious bending. A portal
/// whose beam is pinned at both ends, swaying 0.5 m on a 3 m column, settled
/// 1.5% further than the same frame in the 2D solver (which uses atan2), and
/// at twice the load did not converge at all.
fn rotation_vector(r: &[[f64; 3]; 3]) -> [f64; 3] {
    let skew = [
        (r[2][1] - r[1][2]) / 2.0,
        (r[0][2] - r[2][0]) / 2.0,
        (r[1][0] - r[0][1]) / 2.0,
    ];
    let sin = (skew[0] * skew[0] + skew[1] * skew[1] + skew[2] * skew[2]).sqrt();
    let cos = ((r[0][0] + r[1][1] + r[2][2] - 1.0) / 2.0).clamp(-1.0, 1.0);
    let angle = sin.atan2(cos);
    if sin < 1e-12 {
        if cos > 0.0 {
            return skew; // identity: θ ≈ skew to machine precision
        }
        // θ = π: R = 2·a·aᵀ − I, the axis from the largest diagonal.
        let k = (0..3).max_by(|&a, &b| r[a][a].partial_cmp(&r[b][b]).unwrap()).unwrap();
        let ak = ((r[k][k] + 1.0) / 2.0).max(0.0).sqrt();
        let mut axis = [0.0; 3];
        for m in 0..3 {
            axis[m] = if m == k { ak } else { (r[k][m] + r[m][k]) / (4.0 * ak) };
        }
        return [axis[0] * angle, axis[1] * angle, axis[2] * angle];
    }
    let f = angle / sin;
    [skew[0] * f, skew[1] * f, skew[2] * f]
}

/// Add spring and connector stiffness and internal forces (3D); `scatter`
/// receives every entry, off-diagonal ones included (see the 2D twin).
fn add_spring_contributions_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    for sup in crate::ordered::values(&input.supports) {
        let springs: [(usize, Option<f64>); 6] = [
            (0, support_dofs_3d(sup)[0].spring), (1, support_dofs_3d(sup)[1].spring), (2, support_dofs_3d(sup)[2].spring),
            (3, support_dofs_3d(sup)[3].spring), (4, support_dofs_3d(sup)[4].spring), (5, support_dofs_3d(sup)[5].spring),
        ];
        for &(local_dof, k_val) in &springs {
            if let Some(k) = k_val {
                if k > 0.0 && local_dof < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        scatter(d, d, k);
                        f_int[d] += k * u_full[d];
                    }
                }
            }
        }
    }
    crate::element::connector::corotational_connectors_3d(input, dof_num, u_full, f_int, scatter);
}

/// Maximum translational displacement magnitude for 3D.
fn compute_max_displacement_3d(dof_num: &DofNumbering, u_full: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
        let uz = dof_num.global_dof(node_id, 2).map(|d| u_full[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy + uz * uz).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

/// Build final 3D results from converged displacement field.
fn build_final_results_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    left_hand: bool,
    cs: &Option<FreeConstraintSystem>,
    pre_solve_diags: Vec<StructuredDiagnostic>,
) -> Result<AnalysisResults3D, String> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Reactions from co-rotational internal forces at restrained DOFs
    let asm = assembly::assemble_3d(input, dof_num);

    // Reverse the inclined-support rotation to get TRUE global displacements
    // — see the 2D build_final_results for the full rationale.
    let mut u_geom = u_full.to_vec();
    for it in &asm.inclined_transforms {
        assembly::reverse_inclined_transform(&mut u_geom, &it.dofs, &it.r);
    }

    let displacements = super::linear::build_displacements_3d(dof_num, &u_geom);

    let mut f_int_corot = vec![0.0; n];
    // See build_final_results (2D): the dense k_dummy tangent is only used by
    // the constraint-forces path; skip the O(n²) assembly when unconstrained.
    let mut k_dummy = if cs.is_some() { vec![0.0; n * n] } else { Vec::new() };
    if cs.is_some() {
        assemble_corotational_3d(input, dof_num, &u_geom, &mut f_int_corot, &mut k_dummy, left_hand);
        add_spring_contributions_3d(
            input, dof_num, &u_geom, &mut f_int_corot,
            &mut |gi, gj, v| k_dummy[gi * n + gj] += v,
        );

        for it in &asm.inclined_transforms {
            assembly::apply_inclined_transform(&mut k_dummy, &mut f_int_corot, n, &it.dofs, &it.r);
        }
    } else {
        let mut tr = Vec::new();
        let mut tc = Vec::new();
        let mut tv = Vec::new();
        assemble_corotational_triplets_3d(
            input, dof_num, &u_geom, &mut f_int_corot, &mut tr, &mut tc, &mut tv, left_hand,
        );
        add_spring_contributions_3d(
            input, dof_num, &u_geom, &mut f_int_corot,
            &mut |d, _, v| {
                tr.push(d);
                tc.push(d);
                tv.push(v);
            },
        );
        for it in &asm.inclined_transforms {
            assembly::rotate_inclined_f_triplets(&mut f_int_corot, &it.dofs, &it.r);
        }
    }

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = f_int_corot[nf + i] - asm.f[nf + i];
    }

    let f_r: Vec<f64> = (nf..n).map(|i| asm.f[i]).collect();
    let mut reactions = super::linear::build_reactions_3d_inclined(
        input, dof_num, &reactions_vec, &f_r, nf, &u_geom, &asm.inclined_transforms,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = compute_corotational_forces_3d(input, dof_num, &u_geom, left_hand);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active. Uses pre-reversal
    // u_full/k_dummy/asm.f — same "mixed" convention rationale as the 2D path.
    let constraint_forces = if let Some(ref fcs) = cs {
        let mut k_ff = vec![0.0; nf * nf];
        for i in 0..nf {
            for j in 0..nf {
                k_ff[i * nf + j] = k_dummy[i * n + j];
            }
        }
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        fcs.constraint_forces(&raw, dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        // Shell stresses are not computed in corotational mode because the NR loop
        // only assembles frame/truss elements — shell tangent stiffness and internal
        // forces are never updated, so displacements at shell DOFs are incorrect.
        plate_stresses: vec![],
        quad_stresses: vec![],
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: pre_solve_diags,
        equilibrium: None,
        timings: None,
        result_summary: None, solver_run_meta: None,
    })
}

/// Compute element internal forces using co-rotational natural deformations (3D).
/// Member end forces of the deformed state (3D): the co-rotational elastic
/// forces K·d_nat plus the fixed-end forces of the member loads, with the
/// load data the diagrams draw from.
///
/// The member loads were left out: a fixed-ended beam under a uniform load
/// reported end moments qL²/12 short and end shears qL/2 short, with no load
/// on the diagram, while the displacements were right. The fixed-end part is
/// the linear solver's own, at zero displacement.
fn compute_corotational_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    left_hand: bool,
) -> Vec<ElementForces3D> {
    let zero = vec![0.0; dof_num.n_total];
    let fixed_end: std::collections::HashMap<usize, ElementForces3D> =
        super::linear::compute_internal_forces_3d(input, dof_num, &zero)
            .into_iter()
            .map(|f| (f.element_id, f))
            .collect();
    elastic_corotational_forces_3d(input, dof_num, u_full, left_hand)
        .into_iter()
        .map(|el| match fixed_end.get(&el.element_id) {
            Some(fe) => ElementForces3D {
                length: el.length,
                n_start: fe.n_start + el.n_start, n_end: fe.n_end + el.n_end,
                vy_start: fe.vy_start + el.vy_start, vy_end: fe.vy_end + el.vy_end,
                vz_start: fe.vz_start + el.vz_start, vz_end: fe.vz_end + el.vz_end,
                mx_start: fe.mx_start + el.mx_start, mx_end: fe.mx_end + el.mx_end,
                my_start: fe.my_start + el.my_start, my_end: fe.my_end + el.my_end,
                mz_start: fe.mz_start + el.mz_start, mz_end: fe.mz_end + el.mz_end,
                ..fe.clone()
            },
            None => el,
        })
        .collect()
}

/// The section data of the co-rotational Wagner term: doubly symmetric,
/// r0² = (Iy + Iz)/A (shear-centre offsets are refused by `solve_corotational_3d`).
fn wagner_section(a: f64, iy: f64, iz: f64) -> super::geometric_stiffness::KgSection {
    super::geometric_stiffness::KgSection { r0_sq: if a > 0.0 { (iy + iz) / a } else { 0.0 }, y0: 0.0, z0: 0.0 }
}

/// Adds the Wagner torque P·r0²·θ' to the local end forces `f_local` (12, local axes,
/// the axial force read from f_local[0] = −N): the axial stress on fibres helixed by
/// the twist, which makes a compressed member lose torsional stiffness. Applied in the
/// residual (`assemble_frame_corotational_3d`) and in the force recovery
/// (`elastic_corotational_forces_3d`) alike, so the reported torques are the ones in
/// equilibrium. A torsion release removes it, as it removes GJ.
fn add_wagner_torque(
    f_local: &mut [f64; 12],
    d_nat: &[f64; 12],
    elem: &SolverElement3D,
    sec: &super::geometric_stiffness::KgSection,
    l_n: f64,
) {
    if elem.release_t_start || elem.release_t_end {
        return;
    }
    let axial_p = -f_local[0]; // Tension positive
    let tw = axial_p * sec.r0_sq / l_n * (d_nat[9] - d_nat[3]);
    f_local[3] -= tw;
    f_local[9] += tw;
}

/// The co-rotational elastic part of the member end forces, K·d_nat (3D).
fn elastic_corotational_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    left_hand: bool,
) -> Vec<ElementForces3D> {
    let mut forces = Vec::new();

    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&input.elements) {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.y - node_i.y;
            let dz0 = node_j.z - node_i.z;
            let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

            let ui: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_i, i).map(|d| u_full[d]).unwrap_or(0.0)
            }).collect();
            let uj: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_j, i).map(|d| u_full[d]).unwrap_or(0.0)
            }).collect();

            let dx_n = dx0 + uj[0] - ui[0];
            let dy_n = dy0 + uj[1] - ui[1];
            let dz_n = dz0 + uj[2] - ui[2];
            let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();
            let elong = elongation(&[dx0, dy0, dz0], &[uj[0] - ui[0], uj[1] - ui[1], uj[2] - ui[2]], l0, l_n);
            let n_axial = e * sec.a / l0 * elong;

            forces.push(ElementForces3D {
                element_id: elem.id, length: l_n,
                n_start: n_axial, n_end: n_axial,
                vy_start: 0.0, vy_end: 0.0,
                vz_start: 0.0, vz_end: 0.0,
                mx_start: 0.0, mx_end: 0.0,
                my_start: 0.0, my_end: 0.0,
                mz_start: 0.0, mz_end: 0.0,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
                q_yi: 0.0, q_yj: 0.0,
                distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
                q_zi: 0.0, q_zj: 0.0,
                distributed_loads_x: Vec::new(),
                distributed_loads_z: Vec::new(), point_loads_x: Vec::new(), point_loads_z: Vec::new(),
                bimoment_start: None, bimoment_end: None,
            });
            continue;
        }

        // Frame element: compute forces from natural deformations
        let dx0 = node_j.x - node_i.x;
        let dy0 = node_j.y - node_i.y;
        let dz0 = node_j.z - node_i.z;
        let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if elem_dofs.len() < 12 {
            continue;
        }

        // Map to 12-DOF for extraction
        let u_elem_12: Vec<f64> = if elem_dofs.len() == 14 {
            let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
            map.iter().map(|&idx| u_full[elem_dofs[idx]]).collect()
        } else {
            elem_dofs.iter().take(12).map(|&d| u_full[d]).collect()
        };

        // Current chord from the initial chord plus the relative displacement,
        // never as a difference of absolute deformed positions: x + u rounds u to
        // ulp(x), which for a model 400 m from the origin (let alone in survey
        // coordinates) put a residual floor above the convergence tolerance and
        // the solve never converged (found by the metamorphic rotation check:
        // the same building translated 400 m failed).
        let dx_n = dx0 + (u_elem_12[6] - u_elem_12[0]);
        let dy_n = dy0 + (u_elem_12[7] - u_elem_12[1]);
        let dz_n = dz0 + (u_elem_12[8] - u_elem_12[2]);
        let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();
        let elong = elongation(&[dx0, dy0, dz0], &[u_elem_12[6] - u_elem_12[0], u_elem_12[7] - u_elem_12[1], u_elem_12[8] - u_elem_12[2]], l0, l_n);

        if l_n < 1e-15 {
            continue;
        }

        let (ref_yx, ref_yy, ref_yz) = corot_local_y_ref(
            node_i.x, node_i.y, node_i.z, node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
        );
        let (ex_0, ey_0, ez_0) = compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            ref_yx, ref_yy, ref_yz,
            elem.roll_angle, left_hand,
        );
        let (_, ti, tj, _) = natural_rotations_3d(
            (&ex_0, &ey_0, &ez_0),
            [u_elem_12[3], u_elem_12[4], u_elem_12[5]], [u_elem_12[9], u_elem_12[10], u_elem_12[11]],
            [0, 1, 2].map(|k| (u_elem_12[6 + k] - u_elem_12[k]) / l0),
        );
        let d_nat = [
            0.0, 0.0, 0.0,
            ti[0], ti[1], ti[2],
            elong, 0.0, 0.0,
            tj[0], tj[1], tj[2],
        ];

        let l_calc = l0;
        let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
            let l2 = l_calc * l_calc;
            let py = sec.as_y.map(|ay| if ay > 0.0 { 12.0 * e * sec.iy / (g * ay * l2) } else { 0.0 }).unwrap_or(0.0);
            let pz = sec.as_z.map(|az| if az > 0.0 { 12.0 * e * sec.iz / (g * az * l2) } else { 0.0 }).unwrap_or(0.0);
            (py, pz)
        } else {
            (0.0, 0.0)
        };

        let k_local = frame_local_stiffness_3d(
            e, sec.a, sec.iy, sec.iz, sec.j, l0, g,
            Hinge3D::from_elem(elem), phi_y, phi_z,
        );

        let mut f_local = [0.0; 12];
        for i in 0..12 {
            for jj in 0..12 {
                f_local[i] += k_local[i * 12 + jj] * d_nat[jj];
            }
        }
        current_length_shears(&mut f_local, l0, l_n);
        // The same Wagner torque the residual carries, so the reported member
        // torques balance the applied torques and the reactions.
        add_wagner_torque(&mut f_local, &d_nat, elem, &wagner_section(sec.a, sec.iy, sec.iz), l_n);

        // Sign convention: match linear solver output
        forces.push(ElementForces3D {
            element_id: elem.id,
            length: l_n,
            n_start: -f_local[0],
            n_end: f_local[6],
            vy_start: f_local[1],
            vy_end: -f_local[7],
            vz_start: f_local[2],
            vz_end: -f_local[8],
            mx_start: f_local[3],
            mx_end: -f_local[9],
            my_start: f_local[4],
            my_end: -f_local[10],
            mz_start: f_local[5],
            mz_end: -f_local[11],
            release_my_start: elem.release_my_start,
            release_my_end: elem.release_my_end,
            release_mz_start: elem.release_mz_start,
            release_mz_end: elem.release_mz_end,
            release_t_start: elem.release_t_start,
            release_t_end: elem.release_t_end,
            q_yi: 0.0, q_yj: 0.0,
            distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
            q_zi: 0.0, q_zj: 0.0,
            distributed_loads_x: Vec::new(),
            distributed_loads_z: Vec::new(), point_loads_x: Vec::new(), point_loads_z: Vec::new(),
            bimoment_start: None, bimoment_end: None,
        });
    }

    forces
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn ends_a_whole_turn_apart_are_refused_whichever_turn_is_meant() {
        let input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "y": 0.0, "z": 0.0}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
            "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
            "supports": {}, "loads": []
        })).unwrap();
        let dof_num = DofNumbering::build_3d(&input);
        let state = |psi_i: [f64; 3], psi_j: [f64; 3]| {
            let mut u = vec![0.0; dof_num.n_total];
            for (node, psi) in [(1, psi_i), (2, psi_j)] {
                for k in 0..3 { u[dof_num.global_dof(node, 3 + k).unwrap()] = psi[k]; }
            }
            largest_relative_end_rotation_3d(&input, &dof_num, &u).filter(|&(_, turn)| turn > MAX_RELATIVE_END_ROTATION)
        };
        let turn = 2.0 * std::f64::consts::PI - 0.01;
        assert!(state([-turn, 0.0, 0.0], [turn, 0.0, 0.0]).is_some());
        assert!(state([0.0; 3], [2.0 * std::f64::consts::PI, 0.0, 0.0]).is_some());
        assert!(state([0.0, 0.0, 1.0], [0.0, 0.0, 1.0 + 0.95 * std::f64::consts::PI]).is_some());
        assert!(state([0.3, -0.2, 2.5], [0.4, -0.1, 2.9]).is_none());
        assert!(state([0.0; 3], [0.8 * std::f64::consts::PI, 0.0, 0.0]).is_none());
    }

    #[test]
    fn an_end_bent_past_half_a_turn_against_its_chord_is_refused_not_wrapped() {
        let input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "y": 0.0, "z": 0.0}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
            "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
            "supports": {}, "loads": []
        })).unwrap();
        let dof_num = DofNumbering::build_3d(&input);
        let bent = |chord: f64, rz_i: f64, rz_j: f64| {
            let mut u = vec![0.0; dof_num.n_total];
            u[dof_num.global_dof(2, 0).unwrap()] = 2.0 * chord.cos() - 2.0;
            u[dof_num.global_dof(2, 1).unwrap()] = 2.0 * chord.sin();
            u[dof_num.global_dof(1, 5).unwrap()] = rz_i;
            u[dof_num.global_dof(2, 5).unwrap()] = rz_j;
            member_deformations_3d(&input, &dof_num, &u, false)[0].chord
        };
        assert!(bent(2.6, -1.3, 1.3) > MAX_RELATIVE_END_ROTATION);
        assert!(bent(2.6, 1.3, 1.3) < MAX_RELATIVE_END_ROTATION);
        assert!((bent(0.5, -0.4, 0.4) - 0.9).abs() < 1e-12);
    }

    #[test]
    fn a_chord_turned_back_through_its_ends_is_measured_not_read_as_undeformed() {
        let input: SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "y": 0.0, "z": 0.0}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
            "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
            "supports": {}, "loads": []
        })).unwrap();
        let dof_num = DofNumbering::build_3d(&input);
        let chord_with_tip_at = |dx: f64, dy: f64| {
            let mut u = vec![0.0; dof_num.n_total];
            u[dof_num.global_dof(2, 0).unwrap()] = dx;
            u[dof_num.global_dof(2, 1).unwrap()] = dy;
            member_deformations_3d(&input, &dof_num, &u, false)[0].chord
        };
        assert!((chord_with_tip_at(-4.0, 0.0) - std::f64::consts::PI).abs() < 1e-12);
        assert!(chord_with_tip_at(-4.0, 0.0) > MAX_RELATIVE_END_ROTATION);
        assert!(chord_with_tip_at(-4.0, 0.3) > MAX_RELATIVE_END_ROTATION);
        assert!((chord_with_tip_at(-2.0, 2.0) - std::f64::consts::FRAC_PI_2).abs() < 1e-12);
    }

    fn cantilever_input(length: f64, load_fy: f64) -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: length, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "frame".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None,
            angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 0.0,
                fz: load_fy,
                my: 0.0,
            }),
        ];

        SolverInput { solver_options: None, masses: Default::default(), nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() }
    }

    #[test]
    fn test_corotational_small_load_matches_linear() {
        // With a very small load, co-rotational should closely match linear
        // E=200 MPa -> E_actual=200000 kN/m^2, A=0.01 m^2, Iz=1e-4 m^4, L=3m
        // Use a very small load so geometric effects are negligible
        let input = cantilever_input(3.0, -0.001);

        let linear = super::super::linear::solve_2d(&input).unwrap();
        let corot = solve_corotational_2d(&input, 50, 1e-6, 1, false).unwrap();

        assert!(corot.converged, "Should converge");

        let lin_d = linear.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let cor_d = corot.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // For very small loads, uy should match closely
        let rel_tol_uy = (lin_d.uz - cor_d.uz).abs() / lin_d.uz.abs().max(1e-15);
        assert!(
            rel_tol_uy < 1e-3,
            "uy relative mismatch too large: linear={}, corot={}, rel={}",
            lin_d.uz, cor_d.uz, rel_tol_uy
        );

        // ux: linear gives 0, co-rotational gives a small shortening
        // For small loads this should be negligible
        assert!(
            cor_d.ux.abs() < 1e-6,
            "ux should be negligible for small load, got {}",
            cor_d.ux
        );
    }

    #[test]
    fn test_corotational_converges_with_increments() {
        let input = cantilever_input(3.0, -50.0);

        let corot = solve_corotational_2d(&input, 100, 1e-6, 10, false).unwrap();
        assert!(corot.converged, "Should converge with 10 increments");
        assert!(corot.max_displacement > 0.0, "Should have nonzero displacement");
        assert!(corot.iterations > 0, "Should take some iterations");
    }

    #[test]
    fn test_corotational_axial_truss() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 0.0, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "truss".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None,
            angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2,
            node_id: 2,
            support_type: "rollerX".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None,
            angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 100.0,
                fz: 0.0,
                my: 0.0,
            }),
        ];

        let input = SolverInput { solver_options: None, masses: Default::default(), nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() };
        let corot = solve_corotational_2d(&input, 50, 1e-8, 1, false).unwrap();

        assert!(corot.converged);
        let ef = &corot.results.element_forces[0];
        assert!(
            (ef.n_start - 100.0).abs() < 0.1,
            "Axial force should be ~100 kN, got {}",
            ef.n_start
        );
    }

    #[test]
    fn test_no_free_dofs_error() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 3.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "frame".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2, node_id: 2, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        let input = SolverInput {
            solver_options: None, masses: Default::default(),
            nodes, materials, sections, elements, supports,
            loads: vec![],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        let result = solve_corotational_2d(&input, 50, 1e-8, 1, false);
        assert!(result.is_err());
    }

    #[test]
    fn test_corotational_two_element_frame() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 3.0, z: 0.0 });
        nodes.insert("3".into(), SolverNode { id: 3, x: 3.0, z: 3.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 2, node_j: 3, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2, node_id: 3, support_type: "pinned".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: -5.0, fz: -5.0, my: 0.0,
            }),
        ];

        let input = SolverInput { solver_options: None, masses: Default::default(), nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() };
        let corot = solve_corotational_2d(&input, 100, 1e-6, 5, false).unwrap();
        assert!(corot.converged, "Two-element frame should converge");
        assert_eq!(corot.results.element_forces.len(), 2);
    }

    #[test]
    fn test_corotational_frame_axial_stiffness() {
        // A frame element under pure axial load must reproduce the truss
        // result: N = P and ux = P*L/(E*A). The natural-deformation map
        // d_local = P * d_natural must place the full elongation at node j
        // (u_j = d_axial, u_i = 0) — splitting it as [+d_axial, -d_axial]
        // would quadruple the effective axial stiffness (K_nat = 4EA/L).
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 100.0, fz: 0.0, my: 0.0,
            }),
        ];

        let input = SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new(), solver_options: None, masses: Default::default() };
        let corot = solve_corotational_2d(&input, 50, 1e-8, 1, false).unwrap();
        assert!(corot.converged);

        // E_eff = 200_000 kN/m^2, A = 0.01 m^2, L = 5 m → ux = PL/(EA) = 0.25 m
        let d2 = corot.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!(
            (d2.ux - 0.25).abs() < 0.005,
            "Axial displacement should be PL/(EA) = 0.25 m, got {}",
            d2.ux
        );

        let ef = &corot.results.element_forces[0];
        assert!(
            (ef.n_start - 100.0).abs() < 0.1,
            "Axial force should be ~100 kN, got {}",
            ef.n_start
        );
    }
}

#[cfg(test)]
mod infinitesimal_rotation_regressions {
    use super::*;

    #[test]
    fn rotated_pure_axial_chords_have_exactly_zero_rotation() {
        let a = 1.0 + 2.0f64.powi(-27);
        let b = 1.0 - 2.0f64.powi(-27);
        assert_eq!(chord_rotation(a, a, b, b), 0.0);
        for sx in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                for extension in [-0.5 * b, 0.0, b] {
                    assert_eq!(
                        chord_rotation(sx * a, sz * a, sx * extension, sz * extension),
                        0.0
                    );
                }
                for transverse in [-2.0f64.powi(-26), 2.0f64.powi(-26)] {
                    let actual = chord_rotation(sx * a, sz * a, -sz * transverse, sx * transverse);
                    let expected = transverse.atan2(a);
                    assert!((actual / expected - 1.0).abs() < 1e-14);
                }
            }
        }
    }

    #[test]
    fn rotated_pure_axial_states_have_no_assembled_or_recovered_bending() {
        let a = 1.0 + 2.0f64.powi(-27);
        let b = 1.0 - 2.0f64.powi(-27);
        for extension in [-0.5 * b, b] {
            let input: SolverInput = serde_json::from_value(serde_json::json!({
                "nodes":{"1":{"id":1,"x":0.0,"z":0.0},"2":{"id":2,"x":a,"z":a}},
                "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
                "materials":{"1":{"id":1,"e":1.0,"nu":0.0}},
                "sections":{"1":{"id":1,"a":1.0,"iz":1.0}},"supports":{},"loads":[]
            })).unwrap();
            let dofs = DofNumbering::build_2d(&input);
            let mut u = vec![0.0; dofs.n_total];
            u[dofs.global_dof(2, 0).unwrap()] = extension;
            u[dofs.global_dof(2, 1).unwrap()] = extension;
            let mut internal = vec![0.0; dofs.n_total];
            let mut tangent = vec![0.0; dofs.n_total * dofs.n_total];
            assemble_corotational(&input, &dofs, &u, &mut internal, &mut tangent);
            for node in [1, 2] {
                assert_eq!(internal[dofs.global_dof(node, 2).unwrap()], 0.0);
            }
            let mut triplet_internal = vec![0.0; dofs.n_total];
            assemble_corotational_triplets_2d(
                &input,
                &dofs,
                &u,
                &mut triplet_internal,
                &mut vec![],
                &mut vec![],
                &mut vec![],
            );
            assert_eq!(internal, triplet_internal);
            let forces = compute_corotational_forces(&input, &dofs, &u);
            for force in forces {
                assert_eq!(
                    [force.v_start, force.v_end, force.m_start, force.m_end],
                    [0.0; 4]
                );
                assert!(force.n_start.is_sign_positive() == extension.is_sign_positive());
            }
        }
    }

    #[test]
    fn natural_rotations_retain_increments_on_both_sides_of_machine_precision() {
        let ex = [1.0, 0.0, 0.0];
        let ey = [0.0, 1.0, 0.0];
        for handedness in [-1.0, 1.0] {
            let ez = [0.0, 0.0, handedness];
            for value in [
                0.5 * f64::EPSILON,
                f64::EPSILON,
                f64::from_bits(f64::EPSILON.to_bits() + 1),
                2.0 * f64::EPSILON,
            ] {
                for t in [value, -value] {
                    let (_, ti, tj, _) =
                        natural_rotations_3d((&ex, &ey, &ez), [0.0, t, 0.0], [0.0; 3], [0.0; 3]);
                    assert!((ti[1] / t - handedness).abs() <= 8.0 * f64::EPSILON);
                    assert!(tj
                        .into_iter()
                        .all(|v| v.abs() <= 8.0 * f64::EPSILON * t.abs()));
                    let (_, ti, tj, _) =
                        natural_rotations_3d((&ex, &ey, &ez), [0.0; 3], [0.0; 3], [0.0, t, 0.0]);
                    for theta in [ti, tj] {
                        assert!((theta[2] / t + 1.0).abs() <= 8.0 * f64::EPSILON);
                    }
                }
            }
        }
    }
}
