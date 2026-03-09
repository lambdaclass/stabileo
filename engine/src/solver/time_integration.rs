//! Linear time-history analysis with Newmark-beta and HHT-alpha methods.

use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::mass_matrix;
use super::damping;
use super::constraints::FreeConstraintSystem;

/// Solve a 2D linear time-history analysis.
///
/// Supports Newmark-beta (default: average acceleration) and HHT-alpha methods.
/// Uses a single factorization of the effective stiffness matrix with back-substitution
/// at each time step for efficiency.
pub fn solve_time_history_2d(
    input: &TimeHistoryInput,
) -> Result<TimeHistoryResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    // 1. Assemble K and F_static
    let asm = assembly::assemble_2d(&input.solver, &dof_num);

    // 2. Assemble mass matrix M
    let m_full = mass_matrix::assemble_mass_matrix_2d(&input.solver, &dof_num, &input.densities);

    // 3. Extract free-DOF partitions
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let f_static = extract_subvec(&asm.f, &free_idx);

    // 3b. Constraint reduction: reduce K, M to independent DOF space
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_s, m_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff))
    } else {
        (k_ff.clone(), m_ff.clone())
    };

    // 4. Compute damping matrix in reduced space
    let c_s = compute_damping_matrix(&k_s, &m_s, ns, input.damping_xi);

    // 5. Determine method parameters
    let dt = input.time_step;
    if dt <= 0.0 {
        return Err("Time step must be positive".into());
    }

    let (beta, gamma) = if let Some(alpha) = input.alpha {
        // HHT-alpha: alpha should be in [-1/3, 0]
        let b = (1.0 - alpha) * (1.0 - alpha) / 4.0;
        let g = 0.5 - alpha;
        (b, g)
    } else {
        (input.beta, input.gamma)
    };

    if beta <= 0.0 {
        return Err("Newmark beta must be positive".into());
    }

    // 6. Form effective stiffness: K_eff = K + gamma/(beta*dt)*C + 1/(beta*dt^2)*M
    let dt2 = dt * dt;
    let c1 = 1.0 / (beta * dt2);         // coefficient for M
    let c2 = gamma / (beta * dt);         // coefficient for C
    let mut k_eff = vec![0.0; ns * ns];
    for i in 0..ns * ns {
        k_eff[i] = k_s[i] + c2 * c_s[i] + c1 * m_s[i];
    }

    // 7. Factor K_eff once (Cholesky with LU fallback)
    let factored = factor_effective_stiffness(&k_eff, ns)?;

    // 8. Initialize state vectors in reduced space (all zero at t=0)
    let mut u = vec![0.0; ns];   // displacement (reduced)
    let mut v = vec![0.0; ns];   // velocity (reduced)
    let mut a_vec = vec![0.0; ns]; // acceleration (reduced)

    // Compute initial acceleration from M*a0 = F0 - C*v0 - K*u0
    // Force is computed in nf space then reduced
    let f_0_nf = compute_force_at_step(input, &dof_num, nf, &m_ff, &f_static, 0, dt);
    let f_0 = if let Some(ref cs) = cs { cs.reduce_vector(&f_0_nf) } else { f_0_nf };
    compute_initial_acceleration(&m_s, &c_s, &k_s, &u, &v, &f_0, ns, &mut a_vec);

    // 9. Prepare history storage -- track all nodes
    let tracked_nodes: Vec<usize> = dof_num.node_order.clone();
    let n_out = input.n_steps + 1; // include t=0

    let mut histories: Vec<NodeTimeHistoryBuilder> = tracked_nodes.iter().map(|&node_id| {
        NodeTimeHistoryBuilder {
            node_id,
            ux: Vec::with_capacity(n_out),
            uy: Vec::with_capacity(n_out),
            rz: Vec::with_capacity(n_out),
            vx: Vec::with_capacity(n_out),
            vy: Vec::with_capacity(n_out),
            ax: Vec::with_capacity(n_out),
            ay: Vec::with_capacity(n_out),
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
    record_state(&dof_num, &tracked_nodes, &u_nf, &v_nf, &a_nf, nf, &mut histories);

    // Track peak displacement for reaction computation (in nf space)
    let mut peak_disp_norm = 0.0_f64;
    let mut u_at_peak = u_nf;

    // Store F_prev for HHT (in ns space)
    let mut f_prev = f_0;

    // 10. Time stepping loop
    for step in 0..input.n_steps {
        let t_next = (step + 1) as f64 * dt;

        // Compute F_{n+1} in nf space, then reduce to ns
        let f_next_nf = compute_force_at_step(input, &dof_num, nf, &m_ff, &f_static, step + 1, dt);
        let f_next = if let Some(ref cs) = cs { cs.reduce_vector(&f_next_nf) } else { f_next_nf };

        // Compute effective load (all in ns space)
        let f_eff = compute_effective_load(
            &f_next, &f_prev, &m_s, &c_s, &u, &v, &a_vec, ns,
            beta, gamma, dt, input.alpha,
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
        f_prev = f_next;

        // Record history — expand to nf for recording
        time_steps.push(t_next);
        let u_nf = expand(&u);
        let v_nf = expand(&v);
        let a_nf = expand(&a_vec);
        record_state(&dof_num, &tracked_nodes, &u_nf, &v_nf, &a_nf, nf, &mut histories);

        // Track peak displacement (nf space)
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
            uy: h.uy,
            rz: h.rz,
            vx: h.vx,
            vy: h.vy,
            ax: h.ax,
            ay: h.ay,
        }
    }).collect();

    // Peak displacements: max absolute values over all time steps
    let peak_displacements = build_peak_displacements(&dof_num, &node_histories);

    // Peak reactions: compute at the peak displacement time step (u_at_peak is nf-space)
    let peak_reactions = compute_reactions_at_state(
        &input.solver, &dof_num, &asm.k, &asm.f, &u_at_peak, nf, n,
    );

    let method_name = if input.alpha.is_some() {
        format!("HHT-alpha (alpha={:.3})", input.alpha.unwrap())
    } else {
        format!("Newmark (beta={:.4}, gamma={:.4})", beta, gamma)
    };

    Ok(TimeHistoryResult {
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

/// Compute the Rayleigh damping matrix for free DOFs.
/// If damping_xi is None, returns a zero matrix.
fn compute_damping_matrix(
    k_ff: &[f64], m_ff: &[f64], nf: usize, damping_xi: Option<f64>,
) -> Vec<f64> {
    let xi = match damping_xi {
        Some(x) if x > 0.0 => x,
        _ => return vec![0.0; nf * nf],
    };

    // Estimate omega1 via Rayleigh quotient: omega1^2 ~ (phi^T K phi) / (phi^T M phi)
    // Use a unit vector as initial guess, then one step of inverse iteration
    let omega1 = estimate_fundamental_frequency(k_ff, m_ff, nf);
    let omega2 = 3.0 * omega1; // Bracket a range of frequencies

    let (a0, a1) = damping::rayleigh_coefficients(omega1, omega2, xi);
    damping::rayleigh_damping_matrix(m_ff, k_ff, nf, a0, a1)
}

/// Estimate the fundamental circular frequency from K and M using the Rayleigh quotient.
fn estimate_fundamental_frequency(k: &[f64], m: &[f64], n: usize) -> f64 {
    // Use the diagonal Rayleigh quotient as a quick estimate:
    // omega^2 ~ sum(K_ii) / sum(M_ii) for translational DOFs
    let mut k_sum = 0.0;
    let mut m_sum = 0.0;
    for i in 0..n {
        k_sum += k[i * n + i].abs();
        m_sum += m[i * n + i].abs();
    }

    if m_sum < 1e-30 {
        // Fallback: assume 1 Hz
        return 2.0 * std::f64::consts::PI;
    }

    let omega2 = k_sum / m_sum;
    if omega2 <= 0.0 {
        return 2.0 * std::f64::consts::PI;
    }

    omega2.sqrt()
}

/// Compute initial acceleration: M * a0 = F0 - C*v0 - K*u0.
/// Since typically u0=v0=0, this simplifies, but we handle the general case.
fn compute_initial_acceleration(
    m: &[f64], c: &[f64], k: &[f64],
    u: &[f64], v: &[f64], f: &[f64],
    n: usize, a: &mut [f64],
) {
    // rhs = F - C*v - K*u
    let kv = mat_vec(k, u, n);
    let cv = mat_vec(c, v, n);
    let mut rhs = vec![0.0; n];
    for i in 0..n {
        rhs[i] = f[i] - cv[i] - kv[i];
    }

    // Solve M * a = rhs
    let mut m_work = m.to_vec();
    match cholesky_solve(&mut m_work, &rhs, n) {
        Some(result) => {
            a.copy_from_slice(&result);
        }
        None => {
            // Fallback: LU solve
            let mut m_work2 = m.to_vec();
            let mut rhs2 = rhs.clone();
            match lu_solve(&mut m_work2, &mut rhs2, n) {
                Some(result) => {
                    a.copy_from_slice(&result);
                }
                None => {
                    // Last resort: lumped mass approximation (diagonal)
                    for i in 0..n {
                        let mii = m[i * n + i];
                        a[i] = if mii.abs() > 1e-30 { rhs[i] / mii } else { 0.0 };
                    }
                }
            }
        }
    }
}

/// Compute the external force vector at a given time step.
/// Handles both ground acceleration and explicit force history.
fn compute_force_at_step(
    input: &TimeHistoryInput,
    dof_num: &DofNumbering,
    nf: usize,
    m_ff: &[f64],
    f_static: &[f64],
    step: usize,
    dt: f64,
) -> Vec<f64> {
    let t = step as f64 * dt;
    let mut f = vec![0.0; nf];

    // Ground acceleration: F_ground = -M * r * a_g(t)
    if let Some(ref ground_accel) = input.ground_accel {
        let dir = input.ground_direction.as_deref().unwrap_or("X");
        let local_dof = match dir {
            "Y" | "y" => 1,
            _ => 0, // "X" or default
        };

        // Interpolate ground acceleration at time t
        let a_g = interpolate_ground_accel(ground_accel, step, dt);

        // Build influence vector r (1.0 for DOFs in ground direction)
        let mut r = vec![0.0; nf];
        for &node_id in &dof_num.node_order {
            if let Some(&d) = dof_num.map.get(&(node_id, local_dof)) {
                if d < nf {
                    r[d] = 1.0;
                }
            }
        }

        // F_ground = -M * r * a_g
        let m_r = mat_vec(m_ff, &r, nf);
        for i in 0..nf {
            f[i] -= m_r[i] * a_g;
        }
    }

    // Force history: interpolate between time records
    if let Some(ref force_history) = input.force_history {
        let f_interp = interpolate_force_history(force_history, dof_num, nf, t);
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
    nf: usize,
    t: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; nf];

    if force_history.is_empty() {
        return f;
    }

    // Find bracketing records
    if t <= force_history[0].time {
        // At or before first record: use first record scaled by proximity
        if force_history[0].time.abs() < 1e-15 {
            assemble_force_record(&force_history[0], dof_num, nf, &mut f, 1.0);
        } else {
            let frac = t / force_history[0].time;
            assemble_force_record(&force_history[0], dof_num, nf, &mut f, frac.max(0.0));
        }
        return f;
    }

    if t >= force_history.last().unwrap().time {
        // Beyond last record: hold last value
        assemble_force_record(force_history.last().unwrap(), dof_num, nf, &mut f, 1.0);
        return f;
    }

    // Linear interpolation between bracketing records
    for i in 0..force_history.len() - 1 {
        let t0 = force_history[i].time;
        let t1 = force_history[i + 1].time;
        if t >= t0 && t <= t1 {
            let dt_rec = t1 - t0;
            if dt_rec.abs() < 1e-15 {
                assemble_force_record(&force_history[i], dof_num, nf, &mut f, 1.0);
            } else {
                let alpha = (t - t0) / dt_rec;
                let mut f0 = vec![0.0; nf];
                let mut f1 = vec![0.0; nf];
                assemble_force_record(&force_history[i], dof_num, nf, &mut f0, 1.0);
                assemble_force_record(&force_history[i + 1], dof_num, nf, &mut f1, 1.0);
                for j in 0..nf {
                    f[j] = (1.0 - alpha) * f0[j] + alpha * f1[j];
                }
            }
            return f;
        }
    }

    f
}

/// Assemble a single TimeForceRecord into the free-DOF force vector with a scale factor.
fn assemble_force_record(
    record: &TimeForceRecord,
    dof_num: &DofNumbering,
    nf: usize,
    f: &mut [f64],
    scale: f64,
) {
    for load in &record.loads {
        if let Some(&d) = dof_num.map.get(&(load.node_id, 0)) {
            if d < nf { f[d] += load.fx * scale; }
        }
        if let Some(&d) = dof_num.map.get(&(load.node_id, 1)) {
            if d < nf { f[d] += load.fy * scale; }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(load.node_id, 2)) {
                if d < nf { f[d] += load.mz * scale; }
            }
        }
    }
}

/// Compute the effective load vector for the Newmark/HHT step.
fn compute_effective_load(
    f_next: &[f64], f_prev: &[f64],
    m: &[f64], c: &[f64],
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
    let m_part = mat_vec(m, &m_contrib, n);

    // C contribution vector: C * (c2*u + c4*v + c5*a)
    //   c2 = gamma/(beta*dt), c4 = gamma/beta - 1, c5 = dt/2*(gamma/beta - 2)
    let mut c_contrib = vec![0.0; n];
    for i in 0..n {
        c_contrib[i] = gamma_beta_dt * u[i] + gamma_beta_m1 * v[i] + dt_half_gamma_beta_m2 * a[i];
    }
    let c_part = mat_vec(c, &c_contrib, n);

    let mut f_eff = vec![0.0; n];

    if let Some(alp) = alpha {
        // HHT-alpha: F_eff = (1+alpha)*F_{n+1} - alpha*F_n + M_part + C_part
        for i in 0..n {
            f_eff[i] = (1.0 + alp) * f_next[i] - alp * f_prev[i] + m_part[i] + c_part[i];
        }
    } else {
        // Standard Newmark: F_eff = F_{n+1} + M_part + C_part
        for i in 0..n {
            f_eff[i] = f_next[i] + m_part[i] + c_part[i];
        }
    }

    f_eff
}

// ============================================================================
// Factored matrix representation and solve
// ============================================================================

/// Stores the factored effective stiffness matrix for repeated back-substitution.
enum FactoredMatrix {
    /// Cholesky factor (lower triangular L stored in n*n array)
    Cholesky { l: Vec<f64>, n: usize },
    /// LU decomposition (pivoted)
    Lu { a: Vec<f64>, piv: Vec<usize>, n: usize },
}

/// Factor the effective stiffness matrix. Try Cholesky first, fall back to LU.
fn factor_effective_stiffness(k_eff: &[f64], n: usize) -> Result<FactoredMatrix, String> {
    // Try Cholesky
    let mut l = k_eff.to_vec();
    if cholesky_decompose(&mut l, n) {
        return Ok(FactoredMatrix::Cholesky { l, n });
    }

    // Fallback: LU with partial pivoting
    let mut a = k_eff.to_vec();
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
        FactoredMatrix::Cholesky { l, n } => {
            let y = forward_solve(l, b, *n);
            back_solve(l, &y, *n)
        }
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
    uy: Vec<f64>,
    rz: Vec<f64>,
    vx: Vec<f64>,
    vy: Vec<f64>,
    ax: Vec<f64>,
    ay: Vec<f64>,
}

/// Record the current state into the history builders.
fn record_state(
    dof_num: &DofNumbering,
    tracked_nodes: &[usize],
    u: &[f64], v: &[f64], a: &[f64],
    nf: usize,
    histories: &mut [NodeTimeHistoryBuilder],
) {
    for (idx, &node_id) in tracked_nodes.iter().enumerate() {
        let get_val = |vec: &[f64], local_dof: usize| -> f64 {
            dof_num.map.get(&(node_id, local_dof))
                .map(|&d| if d < nf { vec[d] } else { 0.0 })
                .unwrap_or(0.0)
        };

        histories[idx].ux.push(get_val(u, 0));
        histories[idx].uy.push(get_val(u, 1));
        histories[idx].rz.push(
            if dof_num.dofs_per_node >= 3 { get_val(u, 2) } else { 0.0 }
        );
        histories[idx].vx.push(get_val(v, 0));
        histories[idx].vy.push(get_val(v, 1));
        histories[idx].ax.push(get_val(a, 0));
        histories[idx].ay.push(get_val(a, 1));
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
        let max_uy = hist.uy.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);
        let max_rz = hist.rz.iter().map(|v| v.abs()).fold(0.0_f64, f64::max);

        // Determine the sign of the peak (use the value with max absolute)
        let ux_peak = find_peak_with_sign(&hist.ux);
        let uy_peak = find_peak_with_sign(&hist.uy);
        let rz_peak = find_peak_with_sign(&hist.rz);

        let _ = (max_ux, max_uy, max_rz); // suppress unused warnings for the abs values

        peaks.push(Displacement {
            node_id: hist.node_id,
            ux: ux_peak,
            uy: uy_peak,
            rz: rz_peak,
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

/// Compute reactions at a specific displacement state using the full stiffness matrix.
fn compute_reactions_at_state(
    solver_input: &SolverInput,
    dof_num: &DofNumbering,
    k_full: &[f64],
    f_full: &[f64],
    u_free: &[f64],
    nf: usize,
    n: usize,
) -> Vec<Reaction> {
    let nr = n - nf;
    if nr == 0 {
        return Vec::new();
    }

    // Build full displacement vector
    let mut u_full = vec![0.0; n];
    for i in 0..nf {
        u_full[i] = u_free[i];
    }
    // Restrained DOFs remain zero (no prescribed displacements in dynamic analysis)

    // R = K_rf * u_f - F_r
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_rf = extract_submatrix(k_full, n, &rest_idx, &free_idx);
    let f_r = extract_subvec(f_full, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, u_free, nr, nf);

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }

    let mut reactions = Vec::new();
    for sup in solver_input.supports.values() {
        let mut rx = 0.0;
        let mut ry = 0.0;
        let mut mz = 0.0;

        if sup.support_type == "spring" {
            // Spring reaction: R = -k * u
            let ux = dof_num.global_dof(sup.node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let uy = dof_num.global_dof(sup.node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let rz_disp = if dof_num.dofs_per_node >= 3 {
                dof_num.global_dof(sup.node_id, 2).map(|d| u_full[d]).unwrap_or(0.0)
            } else { 0.0 };

            rx = -sup.kx.unwrap_or(0.0) * ux;
            ry = -sup.ky.unwrap_or(0.0) * uy;
            mz = -sup.kz.unwrap_or(0.0) * rz_disp;
        } else {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                if d >= nf { rx = reactions_vec[d - nf]; }
            }
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                if d >= nf { ry = reactions_vec[d - nf]; }
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d >= nf { mz = reactions_vec[d - nf]; }
                }
            }
        }

        reactions.push(Reaction {
            node_id: sup.node_id,
            rx, ry, mz,
        });
    }

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
    let dof_num = DofNumbering::build_3d(&input.solver);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    if nf == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    // 1. Assemble K and F_static
    let asm = assembly::assemble_3d(&input.solver, &dof_num);

    // 2. Assemble mass matrix M
    let m_full = mass_matrix::assemble_mass_matrix_3d(&input.solver, &dof_num, &input.densities);

    // 3. Extract free-DOF partitions
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let f_static = extract_subvec(&asm.f, &free_idx);

    // 3b. Constraint reduction
    let cs3 = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs3.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_s, m_s) = if let Some(ref cs) = cs3 {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff))
    } else {
        (k_ff.clone(), m_ff.clone())
    };

    // 4. Compute damping matrix in reduced space
    let c_s = compute_damping_matrix(&k_s, &m_s, ns, input.damping_xi);

    // 5. Determine method parameters
    let dt = input.time_step;
    if dt <= 0.0 {
        return Err("Time step must be positive".into());
    }

    let (beta, gamma) = if let Some(alpha) = input.alpha {
        let b = (1.0 - alpha) * (1.0 - alpha) / 4.0;
        let g = 0.5 - alpha;
        (b, g)
    } else {
        (input.beta, input.gamma)
    };

    if beta <= 0.0 {
        return Err("Newmark beta must be positive".into());
    }

    // 6. Form effective stiffness in reduced space
    let dt2 = dt * dt;
    let c1 = 1.0 / (beta * dt2);
    let c2 = gamma / (beta * dt);
    let mut k_eff = vec![0.0; ns * ns];
    for i in 0..ns * ns {
        k_eff[i] = k_s[i] + c2 * c_s[i] + c1 * m_s[i];
    }

    // 7. Factor K_eff once
    let factored = factor_effective_stiffness(&k_eff, ns)?;

    // 8. Initialize state vectors in reduced space
    let mut u = vec![0.0; ns];
    let mut v = vec![0.0; ns];
    let mut a_vec = vec![0.0; ns];

    // Force computed in nf space, then reduced
    let f_0_nf = compute_force_at_step_3d(input, &dof_num, nf, &m_ff, &f_static, 0, dt);
    let f_0 = if let Some(ref cs) = cs3 { cs.reduce_vector(&f_0_nf) } else { f_0_nf };
    compute_initial_acceleration(&m_s, &c_s, &k_s, &u, &v, &f_0, ns, &mut a_vec);

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
    record_state_3d(&dof_num, &tracked_nodes, &u_nf, &v_nf, &a_nf, nf, dpn, &mut histories);

    let mut peak_disp_norm = 0.0_f64;
    let mut u_at_peak = u_nf;
    let mut f_prev = f_0;

    // 10. Time stepping loop
    for step in 0..input.n_steps {
        let t_next = (step + 1) as f64 * dt;

        // Force in nf space, then reduce
        let f_next_nf = compute_force_at_step_3d(input, &dof_num, nf, &m_ff, &f_static, step + 1, dt);
        let f_next = if let Some(ref cs) = cs3 { cs.reduce_vector(&f_next_nf) } else { f_next_nf };

        let f_eff = compute_effective_load(
            &f_next, &f_prev, &m_s, &c_s, &u, &v, &a_vec, ns,
            beta, gamma, dt, input.alpha,
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
        f_prev = f_next;

        // Expand and record
        time_steps.push(t_next);
        let u_nf = expand3(&u);
        let v_nf = expand3(&v);
        let a_nf = expand3(&a_vec);
        record_state_3d(&dof_num, &tracked_nodes, &u_nf, &v_nf, &a_nf, nf, dpn, &mut histories);

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

    // u_at_peak is in nf space
    let peak_reactions = compute_reactions_at_state_3d(
        &input.solver, &dof_num, &asm.k, &asm.f, &u_at_peak, nf, n,
    );

    let method_name = if input.alpha.is_some() {
        format!("HHT-alpha (alpha={:.3})", input.alpha.unwrap())
    } else {
        format!("Newmark (beta={:.4}, gamma={:.4})", beta, gamma)
    };

    Ok(TimeHistoryResult3D {
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

/// Compute force vector at a given step for 3D time history.
fn compute_force_at_step_3d(
    input: &TimeHistoryInput3D,
    dof_num: &DofNumbering,
    nf: usize,
    m_ff: &[f64],
    f_static: &[f64],
    step: usize,
    dt: f64,
) -> Vec<f64> {
    let t = step as f64 * dt;
    let mut f = vec![0.0; nf];
    let dpn = dof_num.dofs_per_node;

    let has_ground = input.ground_accel_x.is_some()
        || input.ground_accel_y.is_some()
        || input.ground_accel_z.is_some();

    // Tri-directional ground acceleration: F_ground = -M * r * a_g(t)
    if has_ground {
        let accel_dirs: [(Option<&Vec<f64>>, usize); 3] = [
            (input.ground_accel_x.as_ref(), 0), // X → local DOF 0
            (input.ground_accel_y.as_ref(), 1), // Y → local DOF 1
            (input.ground_accel_z.as_ref(), 2), // Z → local DOF 2
        ];

        for (accel_opt, local_dof) in &accel_dirs {
            if let Some(accel_data) = accel_opt {
                let a_g = if step < accel_data.len() { accel_data[step] } else { 0.0 };
                if a_g.abs() < 1e-30 { continue; }

                let mut r = vec![0.0; nf];
                for &node_id in &dof_num.node_order {
                    if let Some(&d) = dof_num.map.get(&(node_id, *local_dof)) {
                        if d < nf {
                            r[d] = 1.0;
                        }
                    }
                }

                let m_r = mat_vec(m_ff, &r, nf);
                for i in 0..nf {
                    f[i] -= m_r[i] * a_g;
                }
            }
        }
    }

    // Force history
    if let Some(ref force_history) = input.force_history {
        let f_interp = interpolate_force_history_3d(force_history, dof_num, nf, dpn, t);
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

/// Record current 3D state into history builders.
fn record_state_3d(
    dof_num: &DofNumbering,
    tracked_nodes: &[usize],
    u: &[f64], v: &[f64], a: &[f64],
    nf: usize,
    dpn: usize,
    histories: &mut [NodeTimeHistory3DBuilder],
) {
    for (idx, &node_id) in tracked_nodes.iter().enumerate() {
        let get_val = |vec: &[f64], local_dof: usize| -> f64 {
            if local_dof >= dpn { return 0.0; }
            dof_num.map.get(&(node_id, local_dof))
                .map(|&d| if d < nf { vec[d] } else { 0.0 })
                .unwrap_or(0.0)
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

/// Compute reactions at peak displacement for 3D.
fn compute_reactions_at_state_3d(
    solver_input: &SolverInput3D,
    dof_num: &DofNumbering,
    k_full: &[f64],
    f_full: &[f64],
    u_free: &[f64],
    nf: usize,
    n: usize,
) -> Vec<Reaction3D> {
    let nr = n - nf;
    if nr == 0 {
        return Vec::new();
    }

    let mut u_full = vec![0.0; n];
    for i in 0..nf {
        u_full[i] = u_free[i];
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_rf = extract_submatrix(k_full, n, &rest_idx, &free_idx);
    let f_r = extract_subvec(f_full, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, u_free, nr, nf);

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] - f_r[i];
    }

    let dpn = dof_num.dofs_per_node;
    let mut reactions = Vec::new();
    for sup in solver_input.supports.values() {
        let mut fx = 0.0;
        let mut fy = 0.0;
        let mut fz = 0.0;
        let mut mx = 0.0;
        let mut my = 0.0;
        let mut mz = 0.0;

        let dof_labels = [
            (&mut fx, 0), (&mut fy, 1), (&mut fz, 2),
            (&mut mx, 3), (&mut my, 4), (&mut mz, 5),
        ];

        for (val, local_dof) in dof_labels {
            if local_dof >= dpn { continue; }
            if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                if d >= nf {
                    *val = reactions_vec[d - nf];
                }
            }
        }

        reactions.push(Reaction3D {
            node_id: sup.node_id,
            fx, fy, fz, mx, my, mz,
            bimoment: None,
        });
    }

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
        nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".to_string(), SolverNode { id: 2, x: 1.0, y: 0.0 });

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
            dx: None, dy: None, drz: None,
            angle: None,
        });

        let solver = SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![],
            constraints: vec![],
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
            for &u in &hist.uy {
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
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0 }] },
            TimeForceRecord {
                time: 1.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0 }] },
        ]);
        input.n_steps = 500;
        input.time_step = 0.001;

        let result = solve_time_history_2d(&input).unwrap();

        // Node 2 should deflect in Y
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let max_uy: f64 = node2_hist.uy.iter().map(|v| v.abs()).fold(0.0, f64::max);
        assert!(max_uy > 1e-6, "Expected non-zero Y displacement, got max_uy={}", max_uy);

        // Check that peak displacements are populated
        let peak_node2 = result.peak_displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!(peak_node2.uy.abs() > 1e-6);
    }

    #[test]
    fn test_hht_alpha_method() {
        let mut input = make_cantilever();
        input.alpha = Some(-0.1); // HHT-alpha = -0.1
        // Apply impulse force
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0 }] },
            TimeForceRecord {
                time: 0.01,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: 0.0, mz: 0.0 }] },
        ]);
        input.n_steps = 200;

        let result = solve_time_history_2d(&input).unwrap();
        assert!(result.method.contains("HHT"));

        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();
        let max_uy: f64 = node2_hist.uy.iter().map(|v| v.abs()).fold(0.0, f64::max);
        assert!(max_uy > 1e-8, "HHT should produce non-zero response");
    }

    #[test]
    fn test_rayleigh_damping_effect() {
        let mut input = make_cantilever();
        input.damping_xi = Some(0.05); // 5% damping
        input.force_history = Some(vec![
            TimeForceRecord {
                time: 0.0,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0 }] },
            TimeForceRecord {
                time: 0.001,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: 0.0, mz: 0.0 }] },
        ]);
        input.n_steps = 1000;
        input.time_step = 0.001;

        let result = solve_time_history_2d(&input).unwrap();
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();

        // With damping, later oscillations should have smaller amplitude than early ones
        // Compare peak in first half vs second half
        let half = node2_hist.uy.len() / 2;
        let max_first_half: f64 = node2_hist.uy[..half].iter().map(|v| v.abs()).fold(0.0, f64::max);
        let max_second_half: f64 = node2_hist.uy[half..].iter().map(|v| v.abs()).fold(0.0, f64::max);

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
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0 }] },
            TimeForceRecord {
                time: 0.001,
                loads: vec![SolverNodalLoad { node_id: 2, fx: 0.0, fy: 0.0, mz: 0.0 }] },
        ]);
        input.n_steps = 500;
        input.time_step = 0.001;
        input.damping_xi = None; // No damping

        let result = solve_time_history_2d(&input).unwrap();
        let node2_hist = result.node_histories.iter().find(|h| h.node_id == 2).unwrap();

        // After the impulse, oscillation amplitude should not grow (stability check)
        let max_early: f64 = node2_hist.uy[10..100].iter().map(|v| v.abs()).fold(0.0, f64::max);
        let max_late: f64 = node2_hist.uy[400..].iter().map(|v| v.abs()).fold(0.0, f64::max);

        // For unconditionally stable Newmark, amplitude should not grow significantly
        assert!(
            max_late < max_early * 1.1 + 1e-12,
            "Undamped Newmark should not amplify: early={}, late={}",
            max_early, max_late
        );
    }
}
