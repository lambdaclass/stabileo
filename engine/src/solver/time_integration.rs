//! Linear time-history analysis with Newmark-beta and HHT-alpha methods
//! (HHT-α: `M a_{n+1} + (1+α)(C v_{n+1} + K u_{n+1}) − α(C v_n + K u_n) = (1+α) f_{n+1} − α f_n`,
//! α ∈ [−1/3, 0], β = (1−α)²/4, γ = ½ − α; second-order accurate).

use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::mass_matrix;
use super::damping;
use super::constraints::FreeConstraintSystem;

/// The discrete system a time-history run integrated and the full state it
/// computed, in the solver's reduced (free, constraint-independent) DOF space.
/// Read by `certify::dynamics`; the matrices are the f64 ones the solver used.
#[derive(Debug, Clone)]
pub struct DynamicTrace {
    pub k: CscMatrix,
    pub m: CscMatrix,
    /// Rayleigh coefficients: `C = a0·M + a1·K` (both 0 without damping).
    pub a0: f64,
    pub a1: f64,
    /// Newmark parameters actually used (for HHT-α: `(1−α)²/4`, `½ − α`).
    pub beta: f64,
    pub gamma: f64,
    /// HHT α actually integrated (`½ − γ` exactly), None for plain Newmark:
    /// `M a_{n+1} + (1+α)(C v_{n+1} + K u_{n+1}) − α(C v_n + K u_n) = (1+α) f_{n+1} − α f_n`.
    pub alpha: Option<f64>,
    pub dt: f64,
    /// Raw load vector `f_n` at every step n = 0..=N.
    pub f: Vec<Vec<f64>>,
    pub u: Vec<Vec<f64>>,
    pub v: Vec<Vec<f64>>,
    pub a: Vec<Vec<f64>>,
}

impl DynamicTrace {
    #[allow(clippy::too_many_arguments)]
    fn start(k: &CscMatrix, m: &CscMatrix, a0: f64, a1: f64, beta: f64, gamma: f64, alpha: Option<f64>, dt: f64) -> Self {
        DynamicTrace {
            k: k.clone(), m: m.clone(), a0, a1, beta, gamma, alpha, dt,
            f: Vec::new(), u: Vec::new(), v: Vec::new(), a: Vec::new(),
        }
    }
    fn push(&mut self, f: &[f64], u: &[f64], v: &[f64], a: &[f64]) {
        self.f.push(f.to_vec());
        self.u.push(u.to_vec());
        self.v.push(v.to_vec());
        self.a.push(a.to_vec());
    }
}

/// Solve a 2D linear time-history analysis.
///
/// Supports Newmark-beta (default: average acceleration) and HHT-alpha methods.
/// Uses a single factorization of the effective stiffness matrix with back-substitution
/// at each time step for efficiency.
pub fn solve_time_history_2d(
    input: &TimeHistoryInput,
) -> Result<TimeHistoryResult, String> {
    solve_time_history_2d_inner(input, None)
}

/// `solve_time_history_2d` that also returns the full discrete trajectory.
pub fn solve_time_history_2d_traced(
    input: &TimeHistoryInput,
) -> Result<(TimeHistoryResult, DynamicTrace), String> {
    let mut trace = None;
    let res = solve_time_history_2d_inner(input, Some(&mut trace))?;
    Ok((res, trace.ok_or("no trace recorded")?))
}

fn solve_time_history_2d_inner(
    input: &TimeHistoryInput,
    mut trace: Option<&mut Option<DynamicTrace>>,
) -> Result<TimeHistoryResult, String> {
    super::linear::validate_input_2d(&input.solver)?;
    super::dynamic_validation::validate_mass_2d(&input.solver, &input.densities)?;
    super::dynamic_validation::validate_time_params(input.time_step, input.n_steps)?;
    validate_integration_params(input.beta, input.gamma, input.alpha, input.damping_xi)?;
    validate_method(&input.method, input.alpha)?;
    if let Some(d) = input.ground_direction.as_deref() {
        if !matches!(d, "X" | "x" | "Y" | "y") {
            return Err(format!("Time history: unknown groundDirection '{d}'; expected \"X\" or \"Y\""));
        }
    }
    if let Some(ga) = &input.ground_accel {
        if ga.iter().any(|v| !v.is_finite()) {
            return Err("Ground acceleration history contains non-finite values".to_string());
        }
    }
    if let Some(fh) = &input.force_history {
        for rec in fh {
            if !rec.time.is_finite() {
                return Err("Force history contains a non-finite time value".to_string());
            }
            for l in &rec.loads {
                if !crate::ordered::values(&input.solver.nodes).any(|n| n.id == l.node_id) {
                    return Err(format!("Force history load: node {} does not exist", l.node_id));
                }
                if [l.fx, l.fz, l.my].into_iter().any(|v| !v.is_finite()) {
                    return Err(format!("Force history load on node {} contains a non-finite value", l.node_id));
                }
            }
        }
    }
    let dof_num = DofNumbering::build_2d(&input.solver);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    // 1. Assemble K (sparse; full-K kept for peak reactions) and F_static.
    // K and F are in the inclined-roller frames of `its`; M, the ground
    // influence and the force history are rotated into the same frames, and
    // the recorded states are rotated back to global axes.
    let sasm = assembly::assemble_sparse_2d_ex(&input.solver, &dof_num, true);
    let its = &sasm.inclined_transforms_2d;

    // 2. Assemble mass matrix M (sparse CSC, free block)
    let m_ff = mass_matrix::assemble_mass_matrix_2d_sparse_inclined(&input.solver, &dof_num, &input.densities, its);

    // 3. Free-DOF force vector
    let f_static: Vec<f64> = sasm.f[..nf].to_vec();

    // 3a. Precompute the ground-acceleration influence product M*r once —
    // r and M are time-invariant, so it must not be rebuilt per time step.
    let m_ground_r = build_ground_influence_2d(input, &dof_num, its, &m_ff);

    // 3b. Constraint reduction: reduce K, M to independent DOF space
    // (sparse triple products — no dense reduced matrices)
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_s, m_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix_sparse(&sasm.k_ff), cs.reduce_matrix_sparse(&m_ff))
    } else {
        (sasm.k_ff.clone(), m_ff.clone())
    };

    // 4. Damping in reduced space: C = a0·M + a1·K, anchored on the first
    // two modes (sparse Lanczos). None when no damping was requested.
    let rayleigh = compute_damping_sparse(&k_s, &m_s, input.damping_xi);
    let c_s: Option<&CscMatrix> = rayleigh.as_ref().map(|(c, _, _)| c);

    // 5. Determine method parameters
    let dt = input.time_step;
    if dt <= 0.0 {
        return Err("Time step must be positive".into());
    }

    let (beta, gamma, alpha) = scheme_parameters(input.beta, input.gamma, input.alpha);

    if beta <= 0.0 {
        return Err("Newmark beta must be positive".into());
    }

    // 6. Form effective stiffness: K_eff = c1·M + (1+α)(K + c2·C), α = 0 for
    // Newmark. With C = a0·M + a1·K this folds into a two-term combination
    // over the union of the K and M patterns.
    let dt2 = dt * dt;
    let c1 = 1.0 / (beta * dt2);         // coefficient for M
    let c2 = gamma / (beta * dt);         // coefficient for C
    let w = 1.0 + alpha.unwrap_or(0.0);
    let (a0, a1) = rayleigh.as_ref().map(|(_, a0, a1)| (*a0, *a1)).unwrap_or((0.0, 0.0));
    let k_eff = CscMatrix::linear_combination(w * (1.0 + c2 * a1), &k_s, c1 + w * c2 * a0, &m_s);

    // 7. Factor K_eff once (sparse Cholesky, dense LU fallback with size cap)
    let factored = factor_effective_stiffness(&k_eff)?;

    // 8. Initialize state vectors in reduced space (all zero at t=0)
    let mut u = vec![0.0; ns];   // displacement (reduced)
    let mut v = vec![0.0; ns];   // velocity (reduced)
    let mut a_vec = vec![0.0; ns]; // acceleration (reduced)

    // Compute initial acceleration from M*a0 = F0 - C*v0 - K*u0
    // Force is computed in nf space then reduced
    let f_0_nf = compute_force_at_step(input, &dof_num, its, m_ground_r.as_deref(), &f_static, 0, dt);
    let f_0 = if let Some(ref cs) = cs { cs.reduce_vector(&f_0_nf) } else { f_0_nf };
    compute_initial_acceleration(&m_s, c_s, &k_s, &u, &v, &f_0, ns, &[], &mut a_vec);
    if let Some(t) = trace.as_deref_mut() {
        let mut tr = DynamicTrace::start(&k_s, &m_s, a0, a1, beta, gamma, alpha, dt);
        tr.push(&f_0, &u, &v, &a_vec);
        *t = Some(tr);
    }

    // 9. Prepare history storage -- track all nodes
    let tracked_nodes: Vec<usize> = dof_num.node_order.clone();
    let n_out = input.n_steps + 1; // include t=0

    let mut histories: Vec<NodeTimeHistoryBuilder> = tracked_nodes.iter().map(|&node_id| {
        NodeTimeHistoryBuilder {
            node_id,
            ux: Vec::with_capacity(n_out),
            uz: Vec::with_capacity(n_out),
            ry: Vec::with_capacity(n_out),
            vx: Vec::with_capacity(n_out),
            vz: Vec::with_capacity(n_out),
            ax: Vec::with_capacity(n_out),
            az: Vec::with_capacity(n_out),
        }
    }).collect();

    let mut time_steps = Vec::with_capacity(n_out);

    // Helper: expand reduced-space vector to nf-space for recording
    let expand = |v_s: &[f64]| -> Vec<f64> {
        if let Some(ref cs) = cs { cs.expand_solution(v_s) } else { v_s.to_vec() }
    };

    // Record initial state (t=0) — expand from ns to nf for recording
    time_steps.push(0.0);
    let u_nf = expand(&u);
    let v_nf = expand(&v);
    let a_nf = expand(&a_vec);
    record_state(&dof_num, &tracked_nodes, &assembly::to_global(&u_nf, n, its), &assembly::to_global(&v_nf, n, its), &assembly::to_global(&a_nf, n, its), &mut histories);

    // Track peak displacement for reaction computation (in nf space)
    let mut peak_disp_norm = 0.0_f64;
    let mut u_at_peak = u_nf;

    // Store F_prev for HHT (in ns space)
    let mut f_prev = f_0;

    // 10. Time stepping loop
    for step in 0..input.n_steps {
        let t_next = (step + 1) as f64 * dt;

        // Compute F_{n+1} in nf space, then reduce to ns
        let f_next_nf = compute_force_at_step(input, &dof_num, its, m_ground_r.as_deref(), &f_static, step + 1, dt);
        let f_next = if let Some(ref cs) = cs { cs.reduce_vector(&f_next_nf) } else { f_next_nf };

        // Compute effective load (all in ns space)
        let f_eff = compute_effective_load(
            &f_next, &f_prev, &k_s, &m_s, c_s, &u, &v, &a_vec, ns,
            beta, gamma, dt, alpha,
        );

        // Solve K_eff * u_{n+1} = F_eff (ns space)
        let u_new = solve_with_factored(&factored, &f_eff, ns);

        // Update acceleration (ns space)
        let mut a_new = vec![0.0; ns];
        let inv_beta_dt2 = 1.0 / (beta * dt2);
        let inv_beta_dt = 1.0 / (beta * dt);
        let half_beta_m1 = 1.0 / (2.0 * beta) - 1.0;
        for i in 0..ns {
            a_new[i] = inv_beta_dt2 * (u_new[i] - u[i]) - inv_beta_dt * v[i] - half_beta_m1 * a_vec[i];
        }

        // Update velocity (ns space)
        let mut v_new = vec![0.0; ns];
        for i in 0..ns {
            v_new[i] = v[i] + dt * ((1.0 - gamma) * a_vec[i] + gamma * a_new[i]);
        }

        // Update state (ns space)
        u = u_new;
        v = v_new;
        a_vec = a_new;
        if let Some(Some(t)) = trace.as_deref_mut() {
            t.push(&f_next, &u, &v, &a_vec);
        }
        f_prev = f_next;

        // Record history — expand to nf for recording
        time_steps.push(t_next);
        let u_nf = expand(&u);
        let v_nf = expand(&v);
        let a_nf = expand(&a_vec);
        record_state(&dof_num, &tracked_nodes, &assembly::to_global(&u_nf, n, its), &assembly::to_global(&v_nf, n, its), &assembly::to_global(&a_nf, n, its), &mut histories);

        // Track peak displacement (nf space; the norm is frame-independent)
        let disp_norm: f64 = u_nf.iter().map(|x| x * x).sum::<f64>().sqrt();
        if disp_norm > peak_disp_norm {
            peak_disp_norm = disp_norm;
            u_at_peak = u_nf;
        }
    }

    // 11. Build results
    let node_histories: Vec<NodeTimeHistory> = histories.into_iter().map(|h| {
        NodeTimeHistory {
            node_id: h.node_id,
            ux: h.ux,
            uz: h.uz,
            ry: h.ry,
            vx: h.vx,
            vz: h.vz,
            ax: h.ax,
            az: h.az,
        }
    }).collect();

    // Peak displacements: max absolute values over all time steps
    let peak_displacements = build_peak_displacements(&dof_num, &node_histories);

    // Peak reactions: compute at the peak displacement time step (u_at_peak is nf-space)
    let peak_reactions = compute_reactions_at_state(
        &input.solver, &dof_num,
        sasm.k_full.as_ref().expect("assemble_sparse_2d_ex with build_k_full"),
        &sasm.f, &u_at_peak, its,
    );

    let method_name = if let Some(alpha) = alpha {
        format!("HHT-alpha (alpha={alpha:.3})")
    } else {
        format!("Newmark (beta={:.4}, gamma={:.4})", beta, gamma)
    };

    let mut structured_diagnostics = crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::TimeHistory);
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_conditioning(&sasm.k_ff).into_iter().collect());
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_stiffness_conditioning(&k_s).into_iter().collect());
    let factor = match &factored { FactoredMatrix::Sparse(factor) => Some(factor), FactoredMatrix::Lu { .. } => None };
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_factor_conditioning(&k_eff, factor).into_iter().collect());
    Ok(TimeHistoryResult {
        structured_diagnostics,
        time_steps,
        node_histories,
        peak_displacements,
        peak_reactions,
        n_steps: input.n_steps,
        method: method_name,
    })
}

// ============================================================================
// Internal helpers
// ============================================================================

/// Reject integration parameters that make the scheme amplify.
///
/// These were checked for finiteness only, so a provably unstable scheme ran to
/// completion and returned numbers. Nothing downstream re-checks, and a diverging
/// history is not distinguishable from a resonant one by looking at it.
///
/// * `γ < ½` gives Newmark NEGATIVE numerical damping — energy grows every step.
///   γ = ½ is the neutral value; above it the scheme merely damps.
/// * HHT-α sets `γ = ½ − α`, so `α > 0` is the same defect wearing another name,
///   and below −1/3 the method loses second-order accuracy. The range was already
///   written in the comment beside the formula; this makes it hold.
/// * A negative `damping_xi` was accepted and then silently dropped by
///   `compute_damping_matrix`'s `x > 0.0` guard, so the run reported a damped
///   method in `result.method` while assembling no damping at all.
///
/// NOT checked here: `β < γ/2` is conditionally stable rather than unstable —
/// linear acceleration (β = 1/6, γ = ½) is a legitimate scheme — and its stability
/// depends on Δt against the model's highest frequency, which this solver does not
/// compute. Refusing it would remove a valid capability and accepting it silently
/// is what this function exists to stop, so it needs a warning channel
/// `TimeHistoryResult` does not have. Left for the E5 write-up.
/// The integration method: "newmark" (default) or "hht" (any case). An
/// unknown name used to be ignored (e.g. "Wilson" ran Newmark), and "hht"
/// without α ran average-acceleration Newmark under the HHT name.
fn validate_method(method: &str, alpha: Option<f64>) -> Result<(), String> {
    match method.to_ascii_lowercase().as_str() {
        "newmark" => Ok(()),
        "hht" if alpha.is_some() => Ok(()),
        "hht" => Err("Time history: method \"hht\" needs alpha (in [-1/3, 0])".into()),
        _ => Err(format!("Time history: unknown method '{method}'; expected \"newmark\" or \"hht\"")),
    }
}

fn validate_integration_params(
    beta: f64, gamma: f64, alpha: Option<f64>, damping_xi: Option<f64>,
) -> Result<(), String> {
    if !beta.is_finite() || !gamma.is_finite() {
        return Err("Newmark beta/gamma parameters must be finite".to_string());
    }
    if let Some(alpha) = alpha {
        if !alpha.is_finite() {
            return Err("HHT alpha parameter must be finite".to_string());
        }
        if !(-1.0 / 3.0..=0.0).contains(&alpha) {
            return Err(format!(
                "HHT alpha must be in [-1/3, 0] (got {alpha}). Above 0 it gives \
                 gamma = 0.5 - alpha < 0.5, which amplifies instead of damping."
            ));
        }
    } else if gamma < 0.5 {
        return Err(format!(
            "Newmark gamma must be >= 0.5 (got {gamma}). Below 0.5 the scheme has \
             negative numerical damping and the response grows without bound."
        ));
    }
    if let Some(xi) = damping_xi {
        if !xi.is_finite() {
            return Err("damping_xi must be finite".to_string());
        }
        if xi < 0.0 {
            return Err(format!("damping_xi must be >= 0 (got {xi})"));
        }
    }
    Ok(())
}

/// Memory ceiling for dense fallbacks in the dynamic path: past this many
/// reduced DOFs a dense ns×ns matrix is ~300 MB per copy, and WASM would run
/// out of address space. Fail loudly instead of allocating.
pub(crate) const MAX_DENSE_FALLBACK_DOFS: usize = 6000;

/// Rayleigh damping C = a0·M + a1·K in sparse form, anchored on the
/// structure's first two modes (sparse Lanczos). None when no damping.
fn compute_damping_sparse(
    k_s: &CscMatrix, m_s: &CscMatrix, damping_xi: Option<f64>,
) -> Option<(CscMatrix, f64, f64)> {
    let xi = match damping_xi {
        Some(x) if x > 0.0 => x,
        _ => return None,
    };

    // Anchored on the structure's real first two modes (see the note in
    // damping::rayleigh_from_modes for why the diagonal estimate is only a
    // last resort).
    let (a0, a1) = damping::rayleigh_from_modes_sparse(k_s, m_s, xi);
    Some((CscMatrix::linear_combination(a0, m_s, a1, k_s), a0, a1))
}

/// Solve A·x = b with A sparse symmetric: sparse Cholesky first, dense LU
/// (size-capped) as fallback.
fn solve_spd_sparse_or_dense(a: &CscMatrix, b: &[f64], what: &str) -> Result<Vec<f64>, String> {
    if let Some(x) = sparse_cholesky_solve_full(a, b) {
        return Ok(x);
    }
    let n = a.n;
    if n > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "{what}: sparse Cholesky failed and the dense LU fallback would need a {n}×{n} dense matrix ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * n * n / 1_000_000
        ));
    }
    let mut a_work = a.to_dense_symmetric();
    let mut b_work = b.to_vec();
    lu_solve(&mut a_work, &mut b_work, n)
        .ok_or_else(|| format!("{what}: singular matrix (sparse Cholesky and dense LU both failed)"))
}

/// Compute initial acceleration: M * a0 = F0 - C*v0 - K*u0.
/// Since typically u0=v0=0, this simplifies, but we handle the general case.
///
/// The mass matrix can be singular (lumped mass with massless rotational
/// DOFs); the sparse Cholesky correctly reports that, and the fallback chain
/// mirrors the previous dense path: LU, then the lumped diagonal solve.
fn compute_initial_acceleration(
    m: &CscMatrix, c: Option<&CscMatrix>, k: &CscMatrix,
    u: &[f64], v: &[f64], f: &[f64],
    n: usize, triads: &[[usize; 3]], a: &mut [f64],
) {
    // rhs = F - C*v - K*u
    let kv = k.sym_mat_vec(u);
    let cv = c.map_or_else(|| vec![0.0; n], |c| c.sym_mat_vec(v));
    let mut rhs = vec![0.0; n];
    for i in 0..n {
        rhs[i] = f[i] - cv[i] - kv[i];
    }

    if let Ok(x) = solve_spd_sparse_or_dense(m, &rhs, "initial acceleration") {
        a.copy_from_slice(&x);
        return;
    }

    // M is singular: some motions carry no mass. M is positive semi-definite,
    // so a direction d with dᵀMd = 0 has M·d = 0: such motions follow
    // quasi-statically and get no initial acceleration (the minimum-norm
    // solution, a ⟂ null(M), with the right-hand side projected orthogonally
    // onto range(M)), and the massive ones solve their own block exactly.
    //
    // The null directions are not always coordinate DOFs. The rotary inertia of
    // a flat shell is about its two in-plane axes, so on an oblique shell the
    // massless drilling rotation is a combination of θx, θy, θz while every
    // rotational diagonal is positive. Each node's rotation triad is therefore
    // first turned to the eigenbasis of its 3×3 block of M (an orthogonal,
    // coordinate-free change of basis); the null directions then are zero rows
    // there. Treating only zero diagonals fell back to diagonal lumping of all
    // of M on an oblique shell: a 45°-rotated cantilever quad got a 25% wrong
    // initial acceleration (review of #330). (The diagonal solve this used to
    // fall back to straight away also gave a solid-shell model meshed with
    // frames first steps up to twice too large.)
    let (mt, rt, basis) = rotate_triads_to_mass_eigenbasis(m, &rhs, n, triads);
    let md = mt.diagonal();
    let max_m = md.iter().fold(0.0f64, |acc, v| acc.max(v.abs()));
    let massive: Vec<usize> = (0..n).filter(|&i| md[i].abs() > max_m * 1e-12).collect();
    let mut at = vec![0.0; n];
    let rhs_m: Vec<f64> = massive.iter().map(|&i| rt[i]).collect();
    let m_mm = mt.extract_principal_submatrix(&massive);
    match solve_spd_sparse_or_dense(&m_mm, &rhs_m, "initial acceleration") {
        Ok(x) => {
            for (k, &i) in massive.iter().enumerate() {
                at[i] = x[k];
            }
            // Back to the original coordinates: a = Q·ã.
            a.iter_mut().for_each(|x| *x = 0.0);
            for i in 0..n {
                for &(p, q) in &basis[i] {
                    a[i] += q * at[p];
                }
            }
        }
        Err(_) => {
            // Last resort: lumped mass approximation (diagonal)
            let md = m.diagonal();
            for i in 0..n {
                a[i] = if md[i].abs() > 1e-30 { rhs[i] / md[i] } else { 0.0 };
            }
        }
    }
}

/// The free (reduced) indices of each node's three rotations (θx, θy, θz), for
/// the nodes whose three rotations are all independent free DOFs. With
/// constraints the reduced system keeps the independent free DOFs in ascending
/// order (`FreeConstraintSystem::from_transform`).
fn rotation_triads(dof_num: &DofNumbering, cs: Option<&FreeConstraintSystem>) -> Vec<[usize; 3]> {
    if dof_num.dofs_per_node < 6 {
        return Vec::new();
    }
    let nf = dof_num.n_free;
    let reduced: Vec<Option<usize>> = match cs {
        None => (0..nf).map(Some).collect(),
        Some(cs) => {
            let mut next = 0;
            (0..nf).map(|i| if cs.is_dependent(i) { None } else { next += 1; Some(next - 1) }).collect()
        }
    };
    let mut nodes: Vec<usize> = dof_num.map.keys().map(|&(node, _)| node).collect();
    nodes.sort_unstable();
    nodes.dedup();
    let mut out = Vec::new();
    for node in nodes {
        let ids: Option<Vec<usize>> = (3..6)
            .map(|k| dof_num.global_dof(node, k).filter(|&d| d < nf).and_then(|d| reduced[d]))
            .collect();
        if let Some(ids) = ids {
            out.push([ids[0], ids[1], ids[2]]);
        }
    }
    out
}

/// Q·(…) with Q block-orthogonal: identity outside the triads, and on each triad
/// the eigenvectors of its 3×3 diagonal block of M. Returns (Qᵀ·M·Q, Qᵀ·r, Q by
/// rows as (column, value) lists).
fn rotate_triads_to_mass_eigenbasis(
    m: &CscMatrix, r: &[f64], n: usize, triads: &[[usize; 3]],
) -> (CscMatrix, Vec<f64>, Vec<Vec<(usize, f64)>>) {
    let mut basis: Vec<Vec<(usize, f64)>> = (0..n).map(|i| vec![(i, 1.0)]).collect();
    if !triads.is_empty() {
        let dense_entry = |i: usize, j: usize| -> f64 {
            let (row, col) = if i >= j { (i, j) } else { (j, i) };
            (m.col_ptr[col]..m.col_ptr[col + 1]).find(|&p| m.row_idx[p] == row).map_or(0.0, |p| m.values[p])
        };
        for t in triads {
            let b: Vec<f64> = (0..9).map(|ab| dense_entry(t[ab / 3], t[ab % 3])).collect();
            let eig = crate::linalg::jacobi_eigen(&b, 3, 100);
            for a_ in 0..3 {
                basis[t[a_]] = (0..3).map(|k| (t[k], eig.vectors[a_ * 3 + k])).collect();
            }
        }
    }
    // Qᵀ·M·Q over the full symmetric pattern, keeping the lower triangle.
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..n {
        for p in m.col_ptr[j]..m.col_ptr[j + 1] {
            let i = m.row_idx[p];
            let v = m.values[p];
            let mut push = |i: usize, j: usize| {
                for &(pi, qi) in &basis[i] {
                    for &(pj, qj) in &basis[j] {
                        if pi >= pj {
                            rows.push(pi);
                            cols.push(pj);
                            vals.push(qi * v * qj);
                        }
                    }
                }
            };
            push(i, j);
            if i != j {
                push(j, i);
            }
        }
    }
    let mt = CscMatrix::from_triplets(n, &rows, &cols, &vals);
    let mut rt = vec![0.0; n];
    for i in 0..n {
        for &(p, q) in &basis[i] {
            rt[p] += q * r[i];
        }
    }
    (mt, rt, basis)
}

/// Build the ground-acceleration influence product M*r (2D).
/// r (1.0 at free DOFs in the ground direction) and M are time-invariant,
/// so this is computed once per analysis instead of at every time step.
/// Returns None when no ground acceleration is applied.
fn build_ground_influence_2d(
    input: &TimeHistoryInput,
    dof_num: &DofNumbering,
    its: &[assembly::InclinedTransformData2D],
    m_ff: &CscMatrix,
) -> Option<Vec<f64>> {
    input.ground_accel.as_ref()?;

    let dir = input.ground_direction.as_deref().unwrap_or("X");
    // Validated: "X"/"x" (default) or "Y"/"y".
    let local_dof = if matches!(dir, "Y" | "y") { 1 } else { 0 };

    Some(mass_matrix::ground_influence(dof_num, local_dof, its, m_ff, || {
        mass_matrix::assemble_mass_matrix_2d_sparse_block(&input.solver, dof_num, &input.densities, dof_num.n_total)
    }))
}

/// Compute the external force vector at a given time step.
/// Handles both ground acceleration and explicit force history.
/// `m_ground_r` is the precomputed M*r influence product (see
/// `build_ground_influence_2d`); it is Some iff `input.ground_accel` is Some.
fn compute_force_at_step(
    input: &TimeHistoryInput,
    dof_num: &DofNumbering,
    its: &[assembly::InclinedTransformData2D],
    m_ground_r: Option<&[f64]>,
    f_static: &[f64],
    step: usize,
    dt: f64,
) -> Vec<f64> {
    let t = step as f64 * dt;
    let nf = dof_num.n_free;
    let mut f = vec![0.0; nf];

    // Ground acceleration: F_ground = -M * r * a_g(t)
    if let Some(ref ground_accel) = input.ground_accel {
        // Interpolate ground acceleration at time t
        let a_g = interpolate_ground_accel(ground_accel, step, dt);

        if let Some(m_r) = m_ground_r {
            for i in 0..nf {
                f[i] -= m_r[i] * a_g;
            }
        }
    }

    // Force history: interpolate between time records, over all DOFs, and
    // rotate into the inclined-roller frames before keeping the free block
    if let Some(ref force_history) = input.force_history {
        let mut f_interp = interpolate_force_history(force_history, dof_num, dof_num.n_total, t);
        for it in its {
            assembly::rotate_inclined_f_2d(&mut f_interp, &it.dofs, &it.r);
        }
        for i in 0..nf {
            f[i] += f_interp[i];
        }
    }

    // If neither ground accel nor force history, use static loads
    if input.ground_accel.is_none() && input.force_history.is_none() {
        for i in 0..nf {
            f[i] += f_static[i];
        }
    }

    f
}

/// Interpolate ground acceleration at a given step.
/// ground_accel is a vector of acceleration values at each time step.
fn interpolate_ground_accel(ground_accel: &[f64], step: usize, _dt: f64) -> f64 {
    if step >= ground_accel.len() {
        // Beyond provided data: assume zero
        return 0.0;
    }
    ground_accel[step]
}

/// Interpolate force history at time t using linear interpolation between records.
fn interpolate_force_history(
    force_history: &[TimeForceRecord],
    dof_num: &DofNumbering,
    n: usize,
    t: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; n];

    if force_history.is_empty() {
        return f;
    }

    // Find bracketing records
    if t <= force_history[0].time {
        // At or before first record: use first record scaled by proximity
        if force_history[0].time.abs() < 1e-15 {
            assemble_force_record(&force_history[0], dof_num, n, &mut f, 1.0);
        } else {
            let frac = t / force_history[0].time;
            assemble_force_record(&force_history[0], dof_num, n, &mut f, frac.max(0.0));
        }
        return f;
    }

    if t >= force_history.last().unwrap().time {
        // Beyond last record: hold last value
        assemble_force_record(force_history.last().unwrap(), dof_num, n, &mut f, 1.0);
        return f;
    }

    // Linear interpolation between bracketing records
    for i in 0..force_history.len() - 1 {
        let t0 = force_history[i].time;
        let t1 = force_history[i + 1].time;
        if t >= t0 && t <= t1 {
            let dt_rec = t1 - t0;
            if dt_rec.abs() < 1e-15 {
                assemble_force_record(&force_history[i], dof_num, n, &mut f, 1.0);
            } else {
                let alpha = (t - t0) / dt_rec;
                let mut f0 = vec![0.0; n];
                let mut f1 = vec![0.0; n];
                assemble_force_record(&force_history[i], dof_num, n, &mut f0, 1.0);
                assemble_force_record(&force_history[i + 1], dof_num, n, &mut f1, 1.0);
                for j in 0..n {
                    f[j] = (1.0 - alpha) * f0[j] + alpha * f1[j];
                }
            }
            return f;
        }
    }

    f
}

/// Assemble a single TimeForceRecord into a force vector of length `n` (only
/// DOFs below `n` are kept) with a scale factor.
fn assemble_force_record(
    record: &TimeForceRecord,
    dof_num: &DofNumbering,
    n: usize,
    f: &mut [f64],
    scale: f64,
) {
    for load in &record.loads {
        if let Some(&d) = dof_num.map.get(&(load.node_id, 0)) {
            if d < n { f[d] += load.fx * scale; }
        }
        if let Some(&d) = dof_num.map.get(&(load.node_id, 1)) {
            if d < n { f[d] += load.fz * scale; }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(load.node_id, 2)) {
                if d < n { f[d] += load.my * scale; }
            }
        }
    }
}

/// Compute the effective load vector for the Newmark/HHT step.
///
/// HHT-α (Hilber–Hughes–Taylor, α ∈ [−1/3, 0]) solves
///   M a_{n+1} + (1+α)(C v_{n+1} + K u_{n+1}) − α(C v_n + K u_n) = (1+α) f_{n+1} − α f_n
/// with the Newmark updates; substituting them, the right-hand side is
///   (1+α) f_{n+1} − α f_n + M(c1 u + c1Δt v + c3 a) + (1+α) C(c2 u + c4 v + c5 a) + α(C v_n + K u_n).
/// α = None is Newmark (α = 0).
#[allow(clippy::too_many_arguments)]
fn compute_effective_load(
    f_next: &[f64], f_prev: &[f64],
    k: &CscMatrix, m: &CscMatrix, c: Option<&CscMatrix>,
    u: &[f64], v: &[f64], a: &[f64],
    n: usize,
    beta: f64, gamma: f64, dt: f64,
    alpha: Option<f64>,
) -> Vec<f64> {
    let dt2 = dt * dt;
    let inv_beta_dt2 = 1.0 / (beta * dt2);
    let inv_beta_dt = 1.0 / (beta * dt);
    let half_beta_m1 = 1.0 / (2.0 * beta) - 1.0;
    let gamma_beta_dt = gamma / (beta * dt);
    let gamma_beta_m1 = gamma / beta - 1.0;
    let dt_half_gamma_beta_m2 = dt / 2.0 * (gamma / beta - 2.0);

    // M contribution vector: M * (c1*u + c1*dt*v + c3*a)
    //   c1 = 1/(beta*dt^2), c1*dt = 1/(beta*dt), c3 = 1/(2*beta)-1
    let mut m_contrib = vec![0.0; n];
    for i in 0..n {
        m_contrib[i] = inv_beta_dt2 * u[i] + inv_beta_dt * v[i] + half_beta_m1 * a[i];
    }
    let m_part = m.sym_mat_vec(&m_contrib);

    // C contribution vector: C * ((1+α)(c2*u + c4*v + c5*a) + α v)
    //   c2 = gamma/(beta*dt), c4 = gamma/beta - 1, c5 = dt/2*(gamma/beta - 2)
    let alp = alpha.unwrap_or(0.0);
    let w = 1.0 + alp;
    let c_part = match c {
        Some(c) => {
            let mut c_contrib = vec![0.0; n];
            for i in 0..n {
                c_contrib[i] = w * (gamma_beta_dt * u[i] + gamma_beta_m1 * v[i] + dt_half_gamma_beta_m2 * a[i])
                    + alp * v[i];
            }
            c.sym_mat_vec(&c_contrib)
        }
        None => vec![0.0; n],
    };

    let mut f_eff = vec![0.0; n];
    if alpha.is_some() {
        // HHT-α: the stiffness term of the previous state, α K u_n
        let ku = k.sym_mat_vec(u);
        for i in 0..n {
            f_eff[i] = w * f_next[i] - alp * f_prev[i] + m_part[i] + c_part[i] + alp * ku[i];
        }
    } else {
        // Standard Newmark: F_eff = F_{n+1} + M_part + C_part
        for i in 0..n {
            f_eff[i] = f_next[i] + m_part[i] + c_part[i];
        }
    }

    f_eff
}

/// Newmark parameters `(β, γ)` and the HHT `α` the step uses.
///
/// HHT-α (Hilber's sign convention, α ∈ [−1/3, 0]): γ = ½ − α rounded, then α
/// taken back as ½ − γ — exact in f64 (Sterbenz: γ ∈ [½, 5/6]) — so γ = ½ − α
/// holds exactly for the α actually integrated; β = (1 − α)²/4. These make the
/// scheme second-order accurate and unconditionally stable, with numerical
/// damping of the high frequencies growing as α goes to −1/3.
fn scheme_parameters(beta: f64, gamma: f64, alpha: Option<f64>) -> (f64, f64, Option<f64>) {
    match alpha {
        Some(al) => {
            let g = 0.5 - al;
            let al = 0.5 - g;
            ((1.0 - al) * (1.0 - al) / 4.0, g, Some(al))
        }
        None => (beta, gamma, None),
    }
}

// ============================================================================
// Factored matrix representation and solve
// ============================================================================

/// Stores the factored effective stiffness matrix for repeated back-substitution.
enum FactoredMatrix {
    /// Sparse Cholesky factor (the common case).
    Sparse(NumericCholesky),
    /// LU decomposition (pivoted), dense — only when the sparse factorization
    /// reports the matrix as non-SPD, and only under the size ceiling.
    Lu { a: Vec<f64>, piv: Vec<usize>, n: usize },
}

/// Factor the effective stiffness matrix once: sparse Cholesky, dense LU
/// fallback (size-capped) for the non-SPD case.
fn factor_effective_stiffness(k_eff: &CscMatrix) -> Result<FactoredMatrix, String> {
    let n = k_eff.n;
    let sym = std::rc::Rc::new(symbolic_cholesky(k_eff));
    if let Some(num) = numeric_cholesky(&sym, k_eff) {
        return Ok(FactoredMatrix::Sparse(num));
    }

    if n > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Effective stiffness is not SPD (sparse Cholesky) and the dense LU fallback would need a {n}×{n} dense matrix ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * n * n / 1_000_000
        ));
    }

    // Fallback: LU with partial pivoting
    let mut a = k_eff.to_dense_symmetric();
    let mut piv: Vec<usize> = (0..n).collect();

    for k in 0..n {
        let mut max_val = a[piv[k] * n + k].abs();
        let mut max_row = k;
        for i in (k + 1)..n {
            let val = a[piv[i] * n + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        if max_val < 1e-14 {
            return Err("Singular effective stiffness matrix -- check constraints and mass".into());
        }

        piv.swap(k, max_row);

        let pivot = a[piv[k] * n + k];
        for i in (k + 1)..n {
            let factor = a[piv[i] * n + k] / pivot;
            a[piv[i] * n + k] = factor;
            for j in (k + 1)..n {
                let val = a[piv[k] * n + j];
                a[piv[i] * n + j] -= factor * val;
            }
        }
    }

    Ok(FactoredMatrix::Lu { a, piv, n })
}

/// Solve using the pre-factored matrix: K_eff * x = b.
fn solve_with_factored(factored: &FactoredMatrix, b: &[f64], _n: usize) -> Vec<f64> {
    match factored {
        FactoredMatrix::Sparse(num) => sparse_cholesky_solve(num, b),
        FactoredMatrix::Lu { a, piv, n } => {
            let n = *n;
            // Forward substitution (Ly = Pb)
            let mut y = vec![0.0; n];
            for i in 0..n {
                y[i] = b[piv[i]];
                for j in 0..i {
                    y[i] -= a[piv[i] * n + j] * y[j];
                }
            }
            // Back substitution (Ux = y)
            let mut x = vec![0.0; n];
            for i in (0..n).rev() {
                x[i] = y[i];
                for j in (i + 1)..n {
                    x[i] -= a[piv[i] * n + j] * x[j];
                }
                x[i] /= a[piv[i] * n + i];
            }
            x
        }
    }
}

// ============================================================================
// History recording and result building
// ============================================================================

/// Temporary builder for node time histories.
struct NodeTimeHistoryBuilder {
    node_id: usize,
    ux: Vec<f64>,
    uz: Vec<f64>,
    ry: Vec<f64>,
    vx: Vec<f64>,
    vz: Vec<f64>,
    ax: Vec<f64>,
    az: Vec<f64>,
}

/// Record the current state (all-DOF vectors in global axes, see
/// `assembly::to_global`) into the history builders.
fn record_state(
    dof_num: &DofNumbering,
    tracked_nodes: &[usize],
    u: &[f64], v: &[f64], a: &[f64],
    histories: &mut [NodeTimeHistoryBuilder],
) {
    for (idx, &node_id) in tracked_nodes.iter().enumerate() {
        let get_val = |vec: &[f64], local_dof: usize| -> f64 {
            dof_num.map.get(&(node_id, local_dof)).map(|&d| vec[d]).unwrap_or(0.0)
        };

        histories[idx].ux.push(get_val(u, 0));
        histories[idx].uz.push(get_val(u, 1));
        histories[idx].ry.push(
            if dof_num.dofs_per_node >= 3 { get_val(u, 2) } else { 0.0 }
        );
        histories[idx].vx.push(get_val(v, 0));
        histories[idx].vz.push(get_val(v, 1));
        histories[idx].ax.push(get_val(a, 0));
        histories[idx].az.push(get_val(a, 1));
    }
}

/// Build peak displacement results (max absolute values across all time steps).
fn build_peak_displacements(
    dof_num: &DofNumbering,
    node_histories: &[NodeTimeHistory],
) -> Vec<Displacement> {
    let mut peaks = Vec::new();

    for hist in node_histories {
        let max_ux = hist.ux.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);
        let max_uy = hist.uz.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);
        let max_rz = hist.ry.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);

        // Determine the sign of the peak (use the value with max absolute)
        let ux_peak = find_peak_with_sign(&hist.ux);
        let uy_peak = find_peak_with_sign(&hist.uz);
        let rz_peak = find_peak_with_sign(&hist.ry);

        let _ = (max_ux, max_uy, max_rz); // suppress unused warnings for the abs values

        peaks.push(Displacement {
            node_id: hist.node_id,
            ux: ux_peak,
            uz: uy_peak,
            ry: rz_peak,
        });
    }

    // Suppress unused variable warning
    let _ = dof_num;

    peaks
}

/// Find the value with maximum absolute magnitude, preserving sign.
fn find_peak_with_sign(values: &[f64]) -> f64 {
    let mut peak = 0.0_f64;
    for &v in values {
        if v.abs() > peak.abs() {
            peak = v;
        }
    }
    peak
}

/// Reactions at the restrained DOFs for a dynamic state: R = K_rf·u_f − F_r
/// (restrained DOFs stay at zero — no prescribed motion in time history).
/// k_full is the full n×n stiffness as lower-triangle CSC: the K_rf block
/// lives in columns j < nf at rows i ≥ nf.
fn reactions_vec_from_kfull(k_full: &CscMatrix, f_full: &[f64], u_free: &[f64], nf: usize) -> Vec<f64> {
    let n = k_full.n;
    let nr = n - nf;
    let mut reactions_vec = vec![0.0; nr];
    if nr == 0 {
        return reactions_vec;
    }
    for j in 0..nf {
        let uj = u_free[j];
        if uj == 0.0 {
            continue;
        }
        for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            let i = k_full.row_idx[p];
            if i >= nf {
                reactions_vec[i - nf] += k_full.values[p] * uj;
            }
        }
    }
    for i in 0..nr {
        reactions_vec[i] -= f_full[nf + i];
    }
    reactions_vec
}

/// Reactions at a specific displacement state using the full stiffness matrix,
/// through the linear solver's reaction builder (rotated springs, springs on
/// rigid supports, inclined rollers back to global axes). `u_free` is in the
/// inclined-roller frames K was assembled in.
fn compute_reactions_at_state(
    solver_input: &SolverInput,
    dof_num: &DofNumbering,
    k_full: &CscMatrix,
    f_full: &[f64],
    u_free: &[f64],
    its: &[assembly::InclinedTransformData2D],
) -> Vec<Reaction> {
    let (n, nf) = (dof_num.n_total, dof_num.n_free);
    if n == nf {
        return Vec::new();
    }
    // Restrained DOFs stay zero (no prescribed displacements in dynamic analysis)
    let reactions_vec = reactions_vec_from_kfull(k_full, f_full, u_free, nf);
    let u_full = assembly::to_global(u_free, n, its);
    let mut reactions = super::linear::build_reactions_2d_inclined(
        solver_input, dof_num, &reactions_vec, &f_full[nf..], nf, &u_full, its,
    );
    reactions.sort_by_key(|r| r.node_id);
    reactions
}

// ============================================================================
// 3D Time History Analysis
// ============================================================================

/// Solve a 3D linear time-history analysis.
///
/// Supports Newmark-beta (default: average acceleration) and HHT-alpha methods
/// with tri-directional ground acceleration and 3D force histories.
/// Uses a single factorization of the effective stiffness matrix with
/// back-substitution at each time step for efficiency.
pub fn solve_time_history_3d(
    input: &TimeHistoryInput3D,
) -> Result<TimeHistoryResult3D, String> {
    solve_time_history_3d_inner(input, None)
}

/// `solve_time_history_3d` that also returns the full discrete trajectory.
pub fn solve_time_history_3d_traced(
    input: &TimeHistoryInput3D,
) -> Result<(TimeHistoryResult3D, DynamicTrace), String> {
    let mut trace = None;
    let res = solve_time_history_3d_inner(input, Some(&mut trace))?;
    Ok((res, trace.ok_or("no trace recorded")?))
}

fn solve_time_history_3d_inner(
    input: &TimeHistoryInput3D,
    mut trace: Option<&mut Option<DynamicTrace>>,
) -> Result<TimeHistoryResult3D, String> {
    super::linear::validate_input_3d_for_analysis(&input.solver, crate::known_issues::Analysis::TimeHistory)?;
    super::dynamic_validation::validate_mass_3d(&input.solver, &input.densities)?;
    super::dynamic_validation::validate_time_params(input.time_step, input.n_steps)?;
    validate_integration_params(input.beta, input.gamma, input.alpha, input.damping_xi)?;
    validate_method(&input.method, input.alpha)?;
    for ga in [&input.ground_accel_x, &input.ground_accel_y, &input.ground_accel_z] {
        if let Some(ga) = ga {
            if ga.iter().any(|v| !v.is_finite()) {
                return Err("Ground acceleration history contains non-finite values".to_string());
            }
        }
    }
    if let Some(fh) = &input.force_history {
        for rec in fh {
            if !rec.time.is_finite() {
                return Err("Force history contains a non-finite time value".to_string());
            }
            for l in &rec.loads {
                if !crate::ordered::values(&input.solver.nodes).any(|n| n.id == l.node_id) {
                    return Err(format!("Force history load: node {} does not exist", l.node_id));
                }
                if [l.fx, l.fy, l.fz, l.mx, l.my, l.mz].into_iter().any(|v| !v.is_finite())
                    || l.bw.is_some_and(|v| !v.is_finite())
                {
                    return Err(format!("Force history load on node {} contains a non-finite value", l.node_id));
                }
            }
        }
    }

    // Expand curved beams before DOF numbering, assembly and mass matrix.
    let input_solver = &super::linear::expand_curved_beams_3d(&input.solver);
    let dof_num = DofNumbering::build_3d(input_solver);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    // 1. Assemble K (sparse; full-K kept for peak reactions) and F_static.
    // K and F are in the inclined-support frames of `its`; M, the ground
    // influence and the force history are rotated into the same frames, and
    // the recorded states are rotated back to global axes (as in 2D).
    let sasm = assembly::assemble_sparse_3d(input_solver, &dof_num, true);
    let its = &sasm.inclined_transforms;

    // A force-history moment on a node without rotational stiffness would be
    // lost, as in a static load case (`validate_loads_3d` checks `loads` only).
    if let Some(fh) = &input.force_history {
        let loads: Vec<SolverLoad3D> = fh.iter().flat_map(|r| r.loads.iter().cloned().map(SolverLoad3D::Nodal)).collect();
        super::linear::refuse_moments_without_rotation_3d(input_solver, &loads)?;
        let orphan: std::collections::HashSet<usize> = sasm.artificial_dofs.iter().copied().collect();
        super::linear::refuse_loads_on_orphan_dofs_3d(&dof_num, &orphan, &loads)?;
    }

    // 2. Assemble mass matrix M (sparse CSC, free block)
    let m_ff = mass_matrix::assemble_mass_matrix_3d_sparse_inclined(input_solver, &dof_num, &input.densities, its);

    // 3. Free-DOF force vector
    let f_static: Vec<f64> = sasm.f[..nf].to_vec();

    // 3a. Precompute the per-direction ground-acceleration influence product
    // M*r once — r and M are time-invariant, so it must not be rebuilt per step.
    let m_ground_r_3d = build_ground_influence_3d(input, &dof_num, its, &m_ff);

    // 3b. Constraint reduction (sparse triple products — no dense reduced matrices)
    let cs3 = FreeConstraintSystem::build_3d(&input_solver, &dof_num)?;
    let ns = cs3.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_s, m_s) = if let Some(ref cs) = cs3 {
        (cs.reduce_matrix_sparse(&sasm.k_ff), cs.reduce_matrix_sparse(&m_ff))
    } else {
        (sasm.k_ff.clone(), m_ff.clone())
    };

    // 4. Damping in reduced space: C = a0·M + a1·K, anchored on the first
    // two modes (sparse Lanczos). None when no damping was requested.
    let rayleigh = compute_damping_sparse(&k_s, &m_s, input.damping_xi);
    let c_s: Option<&CscMatrix> = rayleigh.as_ref().map(|(c, _, _)| c);

    // 5. Determine method parameters
    let dt = input.time_step;
    if dt <= 0.0 {
        return Err("Time step must be positive".into());
    }

    let (beta, gamma, alpha) = scheme_parameters(input.beta, input.gamma, input.alpha);

    if beta <= 0.0 {
        return Err("Newmark beta must be positive".into());
    }

    // 6. Form effective stiffness: K_eff = c1·M + (1+α)(K + c2·C), α = 0 for
    // Newmark. With C = a0·M + a1·K this folds into a two-term combination
    // over the union of the K and M patterns.
    let dt2 = dt * dt;
    let c1 = 1.0 / (beta * dt2);         // coefficient for M
    let c2 = gamma / (beta * dt);         // coefficient for C
    let w = 1.0 + alpha.unwrap_or(0.0);
    let (a0, a1) = rayleigh.as_ref().map(|(_, a0, a1)| (*a0, *a1)).unwrap_or((0.0, 0.0));
    let k_eff = CscMatrix::linear_combination(w * (1.0 + c2 * a1), &k_s, c1 + w * c2 * a0, &m_s);

    // 7. Factor K_eff once (sparse Cholesky; dense LU fallback with size cap)
    let factored = factor_effective_stiffness(&k_eff)?;

    // 8. Initialize state vectors in reduced space
    let mut u = vec![0.0; ns];
    let mut v = vec![0.0; ns];
    let mut a_vec = vec![0.0; ns];

    // Force computed in nf space, then reduced
    let f_0_nf = compute_force_at_step_3d(input, &dof_num, its, &m_ground_r_3d, &f_static, 0, dt);
    let f_0 = if let Some(ref cs) = cs3 { cs.reduce_vector(&f_0_nf) } else { f_0_nf };
    let triads = rotation_triads(&dof_num, cs3.as_ref());
    compute_initial_acceleration(&m_s, c_s, &k_s, &u, &v, &f_0, ns, &triads, &mut a_vec);
    if let Some(t) = trace.as_deref_mut() {
        let mut tr = DynamicTrace::start(&k_s, &m_s, a0, a1, beta, gamma, alpha, dt);
        tr.push(&f_0, &u, &v, &a_vec);
        *t = Some(tr);
    }

    // 9. Prepare history storage
    let tracked_nodes: Vec<usize> = dof_num.node_order.clone();
    let n_out = input.n_steps + 1;
    let dpn = dof_num.dofs_per_node;

    let mut histories: Vec<NodeTimeHistory3DBuilder> = tracked_nodes.iter().map(|&node_id| {
        NodeTimeHistory3DBuilder {
            node_id,
            ux: Vec::with_capacity(n_out),
            uy: Vec::with_capacity(n_out),
            uz: Vec::with_capacity(n_out),
            rx: Vec::with_capacity(n_out),
            ry: Vec::with_capacity(n_out),
            rz: Vec::with_capacity(n_out),
            vx: Vec::with_capacity(n_out),
            vy: Vec::with_capacity(n_out),
            vz: Vec::with_capacity(n_out),
            ax: Vec::with_capacity(n_out),
            ay: Vec::with_capacity(n_out),
            az: Vec::with_capacity(n_out),
        }
    }).collect();

    let mut time_steps = Vec::with_capacity(n_out);

    // Helper: expand reduced-space vector to nf-space
    let expand3 = |v_s: &[f64]| -> Vec<f64> {
        if let Some(ref cs) = cs3 { cs.expand_solution(v_s) } else { v_s.to_vec() }
    };

    // Record initial state — expand from ns to nf
    time_steps.push(0.0);
    let u_nf = expand3(&u);
    let v_nf = expand3(&v);
    let a_nf = expand3(&a_vec);
    record_state_3d(&dof_num, &tracked_nodes, &assembly::to_global(&u_nf, n, its), &assembly::to_global(&v_nf, n, its), &assembly::to_global(&a_nf, n, its), dpn, &mut histories);

    let mut peak_disp_norm = 0.0_f64;
    let mut u_at_peak = u_nf;
    let mut f_prev = f_0;

    // 10. Time stepping loop
    for step in 0..input.n_steps {
        let t_next = (step + 1) as f64 * dt;

        // Force in nf space, then reduce
        let f_next_nf = compute_force_at_step_3d(input, &dof_num, its, &m_ground_r_3d, &f_static, step + 1, dt);
        let f_next = if let Some(ref cs) = cs3 { cs.reduce_vector(&f_next_nf) } else { f_next_nf };

        let f_eff = compute_effective_load(
            &f_next, &f_prev, &k_s, &m_s, c_s, &u, &v, &a_vec, ns,
            beta, gamma, dt, alpha,
        );

        let u_new = solve_with_factored(&factored, &f_eff, ns);

        let mut a_new = vec![0.0; ns];
        let inv_beta_dt2 = 1.0 / (beta * dt2);
        let inv_beta_dt = 1.0 / (beta * dt);
        let half_beta_m1 = 1.0 / (2.0 * beta) - 1.0;
        for i in 0..ns {
            a_new[i] = inv_beta_dt2 * (u_new[i] - u[i]) - inv_beta_dt * v[i] - half_beta_m1 * a_vec[i];
        }

        let mut v_new = vec![0.0; ns];
        for i in 0..ns {
            v_new[i] = v[i] + dt * ((1.0 - gamma) * a_vec[i] + gamma * a_new[i]);
        }

        u = u_new;
        v = v_new;
        a_vec = a_new;
        if let Some(Some(t)) = trace.as_deref_mut() {
            t.push(&f_next, &u, &v, &a_vec);
        }
        f_prev = f_next;

        // Expand and record
        time_steps.push(t_next);
        let u_nf = expand3(&u);
        let v_nf = expand3(&v);
        let a_nf = expand3(&a_vec);
        record_state_3d(&dof_num, &tracked_nodes, &assembly::to_global(&u_nf, n, its), &assembly::to_global(&v_nf, n, its), &assembly::to_global(&a_nf, n, its), dpn, &mut histories);

        let disp_norm: f64 = u_nf.iter().map(|x| x * x).sum::<f64>().sqrt();
        if disp_norm > peak_disp_norm {
            peak_disp_norm = disp_norm;
            u_at_peak = u_nf;
        }
    }

    // 11. Build results
    let node_histories: Vec<NodeTimeHistory3D> = histories.into_iter().map(|h| {
        NodeTimeHistory3D {
            node_id: h.node_id,
            ux: h.ux, uy: h.uy, uz: h.uz,
            rx: h.rx, ry: h.ry, rz: h.rz,
            vx: h.vx, vy: h.vy, vz: h.vz,
            ax: h.ax, ay: h.ay, az: h.az,
        }
    }).collect();

    let peak_displacements = build_peak_displacements_3d(&node_histories);

    // u_at_peak is in nf space (inclined-support frames)
    let peak_reactions = compute_reactions_at_state_3d(
        input_solver, &dof_num,
        sasm.k_full.as_ref().expect("assemble_sparse_3d with build_k_full"),
        &sasm.f, &u_at_peak, its,
    );

    let method_name = if let Some(alpha) = alpha {
        format!("HHT-alpha (alpha={alpha:.3})")
    } else {
        format!("Newmark (beta={:.4}, gamma={:.4})", beta, gamma)
    };

    let mut structured_diagnostics = crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::TimeHistory);
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_conditioning(&sasm.k_ff).into_iter().collect());
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_stiffness_conditioning(&k_s).into_iter().collect());
    let factor = match &factored { FactoredMatrix::Sparse(factor) => Some(factor), FactoredMatrix::Lu { .. } => None };
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_factor_conditioning(&k_eff, factor).into_iter().collect());
    Ok(TimeHistoryResult3D {
        structured_diagnostics,
        time_steps,
        node_histories,
        peak_displacements,
        peak_reactions,
        n_steps: input.n_steps,
        method: method_name,
    })
}

// ============================================================================
// 3D Internal helpers
// ============================================================================

/// Build the per-direction ground-acceleration influence product M*r (3D).
/// r (1.0 at free DOFs in the direction) and M are time-invariant, so this is
/// computed once per analysis instead of at every time step.
/// Entry i is Some(M*r_i) iff that direction's ground acceleration is present.
fn build_ground_influence_3d(
    input: &TimeHistoryInput3D,
    dof_num: &DofNumbering,
    its: &[assembly::InclinedTransformData],
    m_ff: &CscMatrix,
) -> [Option<Vec<f64>>; 3] {
    let accel_dirs: [(Option<&Vec<f64>>, usize); 3] = [
        (input.ground_accel_x.as_ref(), 0), // X → local DOF 0
        (input.ground_accel_y.as_ref(), 1), // Y → local DOF 1
        (input.ground_accel_z.as_ref(), 2), // Z → local DOF 2
    ];

    let mut out: [Option<Vec<f64>>; 3] = [None, None, None];
    for (slot, (accel_opt, local_dof)) in out.iter_mut().zip(accel_dirs.iter()) {
        if accel_opt.is_some() {
            *slot = Some(mass_matrix::ground_influence(dof_num, *local_dof, its, m_ff, || {
                mass_matrix::assemble_mass_matrix_3d_sparse_block(&input.solver, dof_num, &input.densities, dof_num.n_total)
            }));
        }
    }
    out
}

/// Compute force vector at a given step for 3D time history.
/// `m_ground_r` holds the precomputed per-direction M*r influence products
/// (see `build_ground_influence_3d`).
fn compute_force_at_step_3d(
    input: &TimeHistoryInput3D,
    dof_num: &DofNumbering,
    its: &[assembly::InclinedTransformData],
    m_ground_r: &[Option<Vec<f64>>; 3],
    f_static: &[f64],
    step: usize,
    dt: f64,
) -> Vec<f64> {
    let t = step as f64 * dt;
    let nf = dof_num.n_free;
    let mut f = vec![0.0; nf];
    let dpn = dof_num.dofs_per_node;

    let has_ground = input.ground_accel_x.is_some()
        || input.ground_accel_y.is_some()
        || input.ground_accel_z.is_some();

    // Tri-directional ground acceleration: F_ground = -M * r * a_g(t)
    if has_ground {
        let accel_dirs: [Option<&Vec<f64>>; 3] = [
            input.ground_accel_x.as_ref(),
            input.ground_accel_y.as_ref(),
            input.ground_accel_z.as_ref(),
        ];

        for (dir_idx, accel_opt) in accel_dirs.iter().enumerate() {
            if let Some(accel_data) = accel_opt {
                let a_g = if step < accel_data.len() { accel_data[step] } else { 0.0 };
                if a_g.abs() < 1e-30 { continue; }

                if let Some(ref m_r) = m_ground_r[dir_idx] {
                    for i in 0..nf {
                        f[i] -= m_r[i] * a_g;
                    }
                }
            }
        }
    }

    // Force history: over all DOFs, rotated into the inclined-support frames,
    // then the free block
    if let Some(ref force_history) = input.force_history {
        let f_interp = assembly::to_inclined_free(
            interpolate_force_history_3d(force_history, dof_num, dof_num.n_total, dpn, t), its, nf,
        );
        for i in 0..nf {
            f[i] += f_interp[i];
        }
    }

    // Static loads as fallback
    if !has_ground && input.force_history.is_none() {
        for i in 0..nf {
            f[i] += f_static[i];
        }
    }

    f
}

/// Interpolate 3D force history at time t.
fn interpolate_force_history_3d(
    force_history: &[TimeForceRecord3D],
    dof_num: &DofNumbering,
    nf: usize,
    dpn: usize,
    t: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; nf];

    if force_history.is_empty() {
        return f;
    }

    if t <= force_history[0].time {
        if force_history[0].time.abs() < 1e-15 {
            assemble_force_record_3d(&force_history[0], dof_num, nf, dpn, &mut f, 1.0);
        } else {
            let frac = (t / force_history[0].time).max(0.0);
            assemble_force_record_3d(&force_history[0], dof_num, nf, dpn, &mut f, frac);
        }
        return f;
    }

    if t >= force_history.last().unwrap().time {
        assemble_force_record_3d(force_history.last().unwrap(), dof_num, nf, dpn, &mut f, 1.0);
        return f;
    }

    for i in 0..force_history.len() - 1 {
        let t0 = force_history[i].time;
        let t1 = force_history[i + 1].time;
        if t >= t0 && t <= t1 {
            let dt_rec = t1 - t0;
            if dt_rec.abs() < 1e-15 {
                assemble_force_record_3d(&force_history[i], dof_num, nf, dpn, &mut f, 1.0);
            } else {
                let alpha = (t - t0) / dt_rec;
                let mut f0 = vec![0.0; nf];
                let mut f1 = vec![0.0; nf];
                assemble_force_record_3d(&force_history[i], dof_num, nf, dpn, &mut f0, 1.0);
                assemble_force_record_3d(&force_history[i + 1], dof_num, nf, dpn, &mut f1, 1.0);
                for j in 0..nf {
                    f[j] = (1.0 - alpha) * f0[j] + alpha * f1[j];
                }
            }
            return f;
        }
    }

    f
}

/// Assemble a single 3D force record into the free-DOF force vector.
fn assemble_force_record_3d(
    record: &TimeForceRecord3D,
    dof_num: &DofNumbering,
    nf: usize,
    dpn: usize,
    f: &mut [f64],
    scale: f64,
) {
    for load in &record.loads {
        let forces = [load.fx, load.fy, load.fz, load.mx, load.my, load.mz];
        for (local_dof, &force) in forces.iter().enumerate() {
            if local_dof >= dpn { break; }
            if let Some(&d) = dof_num.map.get(&(load.node_id, local_dof)) {
                if d < nf {
                    f[d] += force * scale;
                }
            }
        }
        // Bimoment (DOF 6) for warping elements
        if dpn >= 7 {
            if let Some(bw) = load.bw {
                if let Some(&d) = dof_num.map.get(&(load.node_id, 6)) {
                    if d < nf {
                        f[d] += bw * scale;
                    }
                }
            }
        }
    }
}

/// Builder for 3D node time histories.
struct NodeTimeHistory3DBuilder {
    node_id: usize,
    ux: Vec<f64>, uy: Vec<f64>, uz: Vec<f64>,
    rx: Vec<f64>, ry: Vec<f64>, rz: Vec<f64>,
    vx: Vec<f64>, vy: Vec<f64>, vz: Vec<f64>,
    ax: Vec<f64>, ay: Vec<f64>, az: Vec<f64>,
}

/// Record the current 3D state (all-DOF vectors in global axes, see
/// `assembly::to_global`) into history builders.
fn record_state_3d(
    dof_num: &DofNumbering,
    tracked_nodes: &[usize],
    u: &[f64], v: &[f64], a: &[f64],
    dpn: usize,
    histories: &mut [NodeTimeHistory3DBuilder],
) {
    for (idx, &node_id) in tracked_nodes.iter().enumerate() {
        let get_val = |vec: &[f64], local_dof: usize| -> f64 {
            if local_dof >= dpn { return 0.0; }
            dof_num.map.get(&(node_id, local_dof)).map(|&d| vec[d]).unwrap_or(0.0)
        };

        histories[idx].ux.push(get_val(u, 0));
        histories[idx].uy.push(get_val(u, 1));
        histories[idx].uz.push(get_val(u, 2));
        histories[idx].rx.push(get_val(u, 3));
        histories[idx].ry.push(get_val(u, 4));
        histories[idx].rz.push(get_val(u, 5));
        histories[idx].vx.push(get_val(v, 0));
        histories[idx].vy.push(get_val(v, 1));
        histories[idx].vz.push(get_val(v, 2));
        histories[idx].ax.push(get_val(a, 0));
        histories[idx].ay.push(get_val(a, 1));
        histories[idx].az.push(get_val(a, 2));
    }
}

/// Build peak displacement results for 3D.
fn build_peak_displacements_3d(
    node_histories: &[NodeTimeHistory3D],
) -> Vec<Displacement3D> {
    node_histories.iter().map(|h| {
        Displacement3D {
            node_id: h.node_id,
            ux: find_peak_with_sign(&h.ux),
            uy: find_peak_with_sign(&h.uy),
            uz: find_peak_with_sign(&h.uz),
            rx: find_peak_with_sign(&h.rx),
            ry: find_peak_with_sign(&h.ry),
            rz: find_peak_with_sign(&h.rz),
            warping: None,
        }
    }).collect()
}

/// Reactions at the peak displacement for 3D, through the linear solver's
/// reaction builder (springs, inclined supports back to global axes), as in
/// 2D. `u_free` is in the inclined-support frames K was assembled in.
fn compute_reactions_at_state_3d(
    solver_input: &SolverInput3D,
    dof_num: &DofNumbering,
    k_full: &CscMatrix,
    f_full: &[f64],
    u_free: &[f64],
    its: &[assembly::InclinedTransformData],
) -> Vec<Reaction3D> {
    let (n, nf) = (dof_num.n_total, dof_num.n_free);
    if n == nf {
        return Vec::new();
    }
    // Restrained DOFs stay zero (no prescribed displacements in dynamic analysis)
    let reactions_vec = reactions_vec_from_kfull(k_full, f_full, u_free, nf);
    let u_full = assembly::to_global(u_free, n, its);
    let mut reactions = super::linear::build_reactions_3d_inclined(
        solver_input, dof_num, &reactions_vec, &f_full[nf..], nf, &u_full, its,
    );
    reactions.sort_by_key(|r| r.node_id);
    reactions
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Create a simple cantilever beam for testing:
    /// Node 1 (fixed) at (0,0), Node 2 (free) at (1,0).
    /// Single frame element, steel E=200000 MPa, A=0.01 m^2, Iz=8.33e-6 m^4.
    fn make_cantilever() -> TimeHistoryInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
        nodes.insert("2".to_string(), SolverNode { id: 2, x: 1.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 8.33e-6, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".to_string(), SolverElement {
            id: 1, elem_type: "frame".to_string(),
            node_i: 1, node_j: 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None,
            angle: None,
        });

        let solver = SolverInput {
            solver_options: None, masses: Default::default(),
            nodes, materials, sections, elements, supports,
            loads: vec![],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        let mut densities = HashMap::new();
        densities.insert("1".to_string(), 7850.0); // Steel density kg/m^3

        TimeHistoryInput {
            solver,
            densities,
            time_step: 0.001,
            n_steps: 100,
            method: "newmark".to_string(),
            beta: 0.25,
            gamma: 0.5,
            alpha: None,
            damping_xi: None,
            ground_accel: None,
            ground_direction: None,
            force_history: None,
        }
    }

    #[test]
    fn test_free_vibration_zero_initial() {
        // No external force, zero initial conditions => everything stays zero
        let input = make_cantilever();
        let result = solve_time_history_2d(&input).unwrap();

        assert_eq!(result.n_steps, 100);
        assert_eq!(result.time_steps.len(), 101);
        assert!(!result.node_histories.is_empty());

        // All displacements should be zero (no excitation)
        for hist in &result.node_histories {
            for &u in &hist.ux {
                assert!(u.abs() < 1e-10, "Expected zero displacement, got {}", u);
            }
            for &u in &hist.uz {
                assert!(u.abs() < 1e-10, "Expected zero displacement, got {}", u);
            }
        }
    }

    #[test]
    fn test_ground_acceleration_impulse() {
        let mut input = make_cantilever();
        // Apply a single pulse of ground acceleration in X
        let mut ground_accel = vec![0.0; 101];
        ground_accel[1] = 9.81; // 1g impulse at t=dt
        input.ground_accel = Some(ground_accel);
        input.ground_direction = Some("X".to_string());
        input.n_steps = 200;
        input.time_step = 0.001;

        let result = solve_time_history_2d(&input).unwrap();
        assert_eq!(result.time_steps.len(), 201);

        // Node 2 should have non-zero displacement after the impulse
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let max_ux: f64 = node2_hist.ux.iter().map(|v| v.abs()).fold(0.0, f64::max);
        assert!(max_ux > 1e-10, "Expected non-zero response to ground impulse, got max_ux={}", max_ux);
    }

    #[test]
    fn test_force_history_step() {
        let mut input = make_cantilever();
        // Apply a step force of 10 kN in Y at node 2 starting at t=0
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 }] },
            TimeForceRecord {
                time: 1.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 }] },
        ]);
        input.n_steps = 500;
        input.time_step = 0.001;

        let result = solve_time_history_2d(&input).unwrap();

        // Node 2 should deflect in Y
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let max_uy: f64 = node2_hist.uz.iter().map(|v| v.abs()).fold(0.0, f64::max);
        assert!(max_uy > 1e-6, "Expected non-zero Y displacement, got max_uy={}", max_uy);

        // Check that peak displacements are populated
        let peak_node2 = result.peak_displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!(peak_node2.uz.abs() > 1e-6);
    }

    #[test]
    fn test_hht_alpha_method() {
        let mut input = make_cantilever();
        input.alpha = Some(-0.1); // HHT-alpha = -0.1
        // Apply impulse force
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 }] },
            TimeForceRecord {
                time: 0.01,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: 0.0, my: 0.0 }] },
        ]);
        input.n_steps = 200;

        let result = solve_time_history_2d(&input).unwrap();
        assert!(result.method.contains("HHT"));

        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let max_uy: f64 = node2_hist.uz.iter().map(|v| v.abs()).fold(0.0, f64::max);
        assert!(max_uy > 1e-8, "HHT should produce non-zero response");
    }

    #[test]
    fn test_rayleigh_damping_effect() {
        let mut input = make_cantilever();
        input.damping_xi = Some(0.05); // 5% damping
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 }] },
            TimeForceRecord {
                time: 0.001,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: 0.0, my: 0.0 }] },
        ]);
        input.n_steps = 1000;
        input.time_step = 0.001;

        let result = solve_time_history_2d(&input).unwrap();
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();

        // With damping, later oscillations should have smaller amplitude than early ones
        // Compare peak in first half vs second half
        let half = node2_hist.uz.len() / 2;
        let max_first_half: f64 = node2_hist.uz[..half].iter().map(|v| v.abs()).fold(0.0, f64::max);
        let max_second_half: f64 = node2_hist.uz[half..].iter().map(|v| v.abs()).fold(0.0, f64::max);

        // Damped response should decay
        assert!(
            max_second_half < max_first_half || max_first_half < 1e-15,
            "Damping should reduce amplitude: first_half={}, second_half={}",
            max_first_half, max_second_half
        );
    }

    #[test]
    fn test_energy_conservation_undamped() {
        // For undamped Newmark average acceleration (beta=0.25, gamma=0.5),
        // energy should be approximately conserved
        let mut input = make_cantilever();
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 }] },
            TimeForceRecord {
                time: 0.001,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fz: 0.0, my: 0.0 }] },
        ]);
        input.n_steps = 500;
        input.time_step = 0.001;
        input.damping_xi = None; // No damping

        let result = solve_time_history_2d(&input).unwrap();
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();

        // After the impulse, oscillation amplitude should not grow (stability check)
        let max_early: f64 = node2_hist.uz[10..100].iter().map(|v| v.abs()).fold(0.0, f64::max);
        let max_late: f64 = node2_hist.uz[400..].iter().map(|v| v.abs()).fold(0.0, f64::max);

        // For unconditionally stable Newmark, amplitude should not grow significantly
        assert!(
            max_late < max_early * 1.1 + 1e-12,
            "Undamped Newmark should not amplify: early={}, late={}",
            max_early, max_late
        );
    }

    /// Axial SDOF of the cantilever (tip ux, decoupled from bending) under a
    /// constant tip force: the HHT-α trajectory and the exact
    /// u(t) = F/k (1 − cos ωt), with k, m read from the integrated matrices.
    #[allow(clippy::type_complexity)]
    fn axial_step_response(alpha: Option<f64>, dt: f64, n_steps: usize) -> (Vec<f64>, Vec<f64>, Vec<f64>, f64, f64) {
        let f = 1.0;
        let mut input = make_cantilever();
        input.alpha = alpha;
        input.time_step = dt;
        input.n_steps = n_steps;
        let load = vec![SolverNodalLoad { node_id: 2, fx: f, fz: 0.0, my: 0.0 }];
        input.force_history = Some(vec![
            TimeForceRecord { time: 0.0, loads: load.clone() },
            TimeForceRecord { time: 1e3, loads: load },
        ]);
        let (res, tr) = solve_time_history_2d_traced(&input).unwrap();
        let i = tr.f[0].iter().position(|x| *x != 0.0).unwrap();
        let (kd, md) = (tr.k.to_dense_symmetric(), tr.m.to_dense_symmetric());
        let n = tr.k.n;
        for j in 0..n {
            if j != i {
                assert_eq!(kd[i * n + j], 0.0);
                assert_eq!(md[i * n + j], 0.0);
            }
        }
        let (k, m) = (kd[i * n + i], md[i * n + i]);
        let w = (k / m).sqrt();
        let h = res.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let exact = (0..=n_steps).map(|s| f / k * (1.0 - (w * s as f64 * dt).cos())).collect();
        (h.ux.clone(), h.vx.clone(), exact, k, m)
    }

    fn period_of_axial_mode() -> f64 {
        let (_, tr) = solve_time_history_2d_traced(&make_cantilever()).unwrap();
        let (kd, md) = (tr.k.to_dense_symmetric(), tr.m.to_dense_symmetric());
        // ux of node 2 is the first reduced DOF
        2.0 * std::f64::consts::PI / (kd[0] / md[0]).sqrt()
    }

    #[test]
    fn test_hht_alpha_second_order_convergence() {
        // max error over two periods; halving Δt divides it by ≈ 4
        let period = period_of_axial_mode();
        for alpha in [-0.05, -0.1, -0.3] {
            let err = |div: usize| {
                let (u, _, ex, _, _) = axial_step_response(Some(alpha), period / div as f64, 2 * div);
                u.iter().zip(&ex).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max)
            };
            let (e1, e2, e3) = (err(40), err(80), err(160));
            let (r1, r2) = (e1 / e2, e2 / e3);
            assert!(r1 > 3.6 && r1 < 4.4 && r2 > 3.8 && r2 < 4.2, "α = {alpha}: errors {e1:e} {e2:e} {e3:e}, ratios {r1} {r2}");
        }
    }

    #[test]
    fn test_hht_alpha_damps_high_frequencies() {
        // Δt 5.3 periods: ωΔt ≈ 33. Average acceleration keeps the oscillation
        // about the static solution; HHT-α (α < 0) kills it.
        let period = period_of_axial_mode();
        // energy of the oscillation about the static solution
        let amp = |alpha: Option<f64>| {
            let (u, v, _, k, m) = axial_step_response(alpha, 5.3 * period, 40);
            let us = 1.0 / k;
            let e = |s: usize| 0.5 * k * (u[s] - us).powi(2) + 0.5 * m * v[s].powi(2);
            (e(1), e(u.len() - 1))
        };
        let (f0, l0) = amp(None);
        assert!(l0 > 0.5 * f0, "Newmark: {f0} → {l0}");
        let (f1, l1) = amp(Some(-0.3));
        assert!(l1 < 1e-6 * f1, "HHT α = −0.3: {f1} → {l1}");
        let (f2, l2) = amp(Some(-0.05));
        assert!(l2 < 0.1 * f2 && l2 > l1, "HHT α = −0.05: {f2} → {l2}");
    }

}
