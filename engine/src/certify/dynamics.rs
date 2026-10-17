//! Certificates for linear time-history integration (docs/verification/CERTIFY.md,
//! "Time-history integration").
//!
//! What is certified is the *discrete* problem the solver integrates — the f64
//! reduced `K`, `M`, Rayleigh `C = a0·M + a1·K`, the load sequence `f_n` and the
//! Newmark parameters, all taken as exact data:
//!
//! * **Stability of the scheme for this model.** Exact rational checks of the
//!   HHT-α parameters (unconditional range), or of the Newmark parameters (`γ ≥ ½`, `2β ≥ γ` unconditional), or for a conditionally
//!   stable choice (`γ ≥ ½`, `β < γ/2`) the step bound `Δt² · λ_max(M⁻¹K) <
//!   1/(γ/2 − β)` with a *certified upper bound* on `λ_max` (`μM − K ≻ 0` by the
//!   Gram residual + Gershgorin check). Model hypotheses (`M ≻ 0`, `K ≻ 0`,
//!   `a0, a1 ≥ 0`) are certified the same way.
//! * **A posteriori residuals.** Interval enclosures of the residuals of the
//!   three discrete relations at every step for the computed trajectory.
//! * **Energy balance** of the computed trajectory, in interval arithmetic.
//!
//! Not certified: the time-discretization error against the continuous ODE. A
//! Zienkiewicz–Xie local error *estimate* is reported and labelled as such.

use super::exact::{q, qi, to_f64_down, Q};
use super::interval::Interval;
use super::sparse::certify_lambda_min_lower;
use crate::linalg::{numeric_cholesky, sparse_cholesky_solve, symbolic_cholesky, CscMatrix};
use crate::solver::time_integration::{
    solve_time_history_2d_traced, solve_time_history_3d_traced, DynamicTrace,
};
use crate::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Stability class of Newmark(β, γ) for undamped / non-negatively damped
/// linear systems with `M ≻ 0`, `K ⪰ 0` (checked in exact rational arithmetic
/// on the f64 parameters).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SchemeStability {
    /// `γ ≥ ½` and `2β ≥ γ`: spectral radius ≤ 1 for every `ω Δt ≥ 0`.
    pub unconditionally_stable: bool,
    /// `γ ≥ ½` and `β ≥ (2γ + 1)²/16`: additionally no real-eigenvalue
    /// (bifurcated) branch at high frequency.
    pub high_frequency_complex: bool,
    /// `γ ≥ ½`, `β < γ/2`: stable iff `ω_max Δt ≤ Ω_crit`.
    pub conditionally_stable: bool,
    /// `Ω_crit² = 1/(γ/2 − β)` (undamped limit; damping with `ξ ≥ 0` only
    /// raises it), rounded down.
    pub omega_crit_sq: Option<f64>,
}

fn half() -> Q {
    Q::new(1.into(), 2.into())
}

/// Stability class of HHT-α (Hilber's sign, `M a_{n+1} + (1+α)(C v_{n+1} +
/// K u_{n+1}) − α(C v_n + K u_n) = …`): it is the generalized-α method with
/// `α_m = 0`, `α_f = −α`, unconditionally stable (Chung & Hulbert 1993) when
/// `γ = ½ − α`, `−½ ≤ α ≤ 0` and `β ≥ ¼ − α/2` — checked exactly on the f64
/// values (the solver takes α = ½ − γ, so the first holds exactly). Otherwise
/// nothing is certified: the conditional (Newmark) criterion does not apply.
pub fn hht_stability(alpha: f64, beta: f64, gamma: f64) -> SchemeStability {
    let none = SchemeStability { unconditionally_stable: false, high_frequency_complex: false, conditionally_stable: false, omega_crit_sq: None };
    let (Some(a), Some(b), Some(g)) = (q(alpha), q(beta), q(gamma)) else { return none };
    let ok = g == half() - &a && a >= -half() && a <= qi(0) && b >= half() * half() - &a / qi(2);
    SchemeStability { unconditionally_stable: ok, ..none }
}

pub fn scheme_stability(beta: f64, gamma: f64) -> SchemeStability {
    let (Some(b), Some(g)) = (q(beta), q(gamma)) else {
        return SchemeStability { unconditionally_stable: false, high_frequency_complex: false, conditionally_stable: false, omega_crit_sq: None };
    };
    let g_ok = g >= half();
    let uncond = g_ok && qi(2) * &b >= g;
    let hf = g_ok && qi(16) * &b >= (qi(2) * &g + qi(1)).pow(2);
    let cond = g_ok && !uncond;
    let omega_crit_sq = if cond {
        let d = &g / qi(2) - &b;
        to_f64_down(&(qi(1) / d))
    } else {
        None
    };
    SchemeStability { unconditionally_stable: uncond, high_frequency_complex: hf, conditionally_stable: cond, omega_crit_sq }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidualReport {
    pub steps: usize,
    /// max_n of the ∞-norm residual of the equation of motion (E_n) — Newmark:
    /// `f_n − M a_n − C v_n − K u_n`; HHT-α (n ≥ 1): `(1+α) f_n − α f_{n−1} − M a_n
    /// − (1+α)(C v_n + K u_n) + α(C v_{n−1} + K u_{n−1})` (certified upper bound).
    pub max_abs_equation: f64,
    /// `max_abs_equation` / max_n (largest |term| of the equation at step n).
    pub max_rel_equation: f64,
    /// max_n ‖u_{n+1} − u_n − Δt v_n − Δt²((½−β) a_n + β a_{n+1})‖_∞ / max_n ‖u_n‖_∞.
    pub max_rel_displacement_update: f64,
    /// max_n ‖v_{n+1} − v_n − Δt((1−γ) a_n + γ a_{n+1})‖_∞ / max_n ‖v_n‖_∞.
    pub max_rel_velocity_update: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnergyReport {
    /// ½ vᵀMv + ½ uᵀKu at the first and last step: [lo, hi].
    pub initial: [f64; 2],
    pub r#final: [f64; 2],
    /// Σ ½ (f̂_n + f̂_{n+1})·(u_{n+1} − u_n): [lo, hi].
    pub external_work: [f64; 2],
    /// Σ Δt · v̄ᵀ C v̄ (Rayleigh damping, trapezoidal): [lo, hi].
    pub damping_dissipation: [f64; 2],
    /// final − initial + damping − work: [lo, hi]. For average acceleration
    /// (β = ¼, γ = ½) this is exactly 0 for the exact discrete trajectory, so it
    /// measures the computed trajectory's departure; for other parameters it also
    /// contains the scheme's algorithmic dissipation (≤ 0 means energy lost).
    pub imbalance: [f64; 2],
    /// max |imbalance| / max(max_n energy_n, |work|).
    pub relative_imbalance: f64,
    /// True when the exact discrete energy identity applies (β = ¼, γ = ½).
    pub identity_exact_for_scheme: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeErrorEstimate {
    /// ESTIMATE, not a bound: max_n ‖(β − 1/6) Δt² (a_{n+1} − a_n)‖_∞
    /// (Zienkiewicz–Xie local displacement error per step).
    pub max_local_displacement_error: f64,
    pub relative_to_peak_displacement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicsCertificate {
    pub scheme: String,
    pub beta: f64,
    pub gamma: f64,
    pub alpha: Option<f64>,
    pub dt: f64,
    pub parameters: SchemeStability,
    /// Certified lower bounds on λ_min(M), λ_min(K) (None if not certified).
    pub mass_lambda_min_lower: Option<f64>,
    pub stiffness_lambda_min_lower: Option<f64>,
    pub rayleigh_nonnegative: bool,
    /// Conditionally stable schemes: certified λ_max(M⁻¹K) < this, and the
    /// certified largest stable step (rounded down).
    pub lambda_max_upper: Option<f64>,
    pub dt_critical_lower: Option<f64>,
    /// The scheme is certified stable for this model and step.
    pub stability_certified: bool,
    pub stability_reason: Option<String>,
    pub residual: Option<ResidualReport>,
    pub energy: Option<EnergyReport>,
    pub time_error_estimate: Option<TimeErrorEstimate>,
    pub residual_reason: Option<String>,
}

// ───────────────────────────── interval helpers ─────────────────────────────

fn ip(x: f64) -> Interval {
    Interval::point(x)
}

/// Enclosure of A·x for the exact symmetric A stored as a lower triangle.
fn sym_matvec(a: &CscMatrix, x: &[Interval]) -> Vec<Interval> {
    let mut y = vec![Interval::ZERO; a.n];
    for j in 0..a.n {
        for k in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[k];
            let v = ip(a.values[k]);
            y[i] = y[i] + v * x[j];
            if i != j {
                y[j] = y[j] + v * x[i];
            }
        }
    }
    y
}

fn dot(x: &[Interval], y: &[Interval]) -> Interval {
    x.iter().zip(y).fold(Interval::ZERO, |s, (a, b)| s + *a * *b)
}

fn pts(x: &[f64]) -> Vec<Interval> {
    x.iter().map(|&v| ip(v)).collect()
}

/// `a / max(b, MIN_POSITIVE)` rounded up: a relative measure that stays finite
/// (and tiny) for an identically zero solution, where the interval residual
/// of exact zeros is a subnormal and `a / 0` would be +∞ — serialized as
/// `null` in a field the web reads as a number (found by fuzzing,
/// docs/verification/FUZZ_MUTANTS.md).
fn up_div(a: f64, b: f64) -> f64 {
    if a == 0.0 {
        return 0.0;
    }
    ip(a).div(ip(b.max(f64::MIN_POSITIVE))).hi
}

// ───────────────────────────── stability ─────────────────────────────

fn point_vals(a: &CscMatrix) -> Vec<Interval> {
    a.values.iter().map(|&v| ip(v)).collect()
}

/// Power-iteration estimate of λ_max(M⁻¹K) (heuristic; certified afterwards).
fn estimate_lambda_max(k: &CscMatrix, m: &CscMatrix) -> Option<f64> {
    let sym = std::rc::Rc::new(symbolic_cholesky(m));
    let mf = numeric_cholesky(&sym, m)?;
    let n = k.n;
    let mut x: Vec<f64> = (0..n).map(|i| 1.0 + 0.37 * ((i * 7919) % 101) as f64 / 101.0).collect();
    let mut lam = 0.0;
    for _ in 0..300 {
        let kx = k.sym_mat_vec(&x);
        let y = sparse_cholesky_solve(&mf, &kx);
        let my = m.sym_mat_vec(&y);
        let num: f64 = y.iter().zip(&k.sym_mat_vec(&y)).map(|(a, b)| a * b).sum();
        let den: f64 = y.iter().zip(&my).map(|(a, b)| a * b).sum();
        if den.is_nan() || den <= 0.0 {
            return None;
        }
        lam = num / den;
        let nrm = den.sqrt();
        x = y.iter().map(|v| v / nrm).collect();
    }
    (lam.is_finite() && lam > 0.0).then_some(lam)
}

/// Certified λ_max(M⁻¹K) < μ via `μM − K ≻ 0`.
fn certify_lambda_max_upper(k: &CscMatrix, m: &CscMatrix) -> Result<f64, String> {
    let est = estimate_lambda_max(k, m).ok_or("mass matrix is not positive definite (Cholesky failed)")?;
    let mut kmap: HashMap<(usize, usize), f64> = HashMap::new();
    let mut mmap: HashMap<(usize, usize), f64> = HashMap::new();
    for (a, map) in [(k, &mut kmap), (m, &mut mmap)] {
        for j in 0..a.n {
            let span = a.col_ptr[j]..a.col_ptr[j + 1];
            for (&i, &v) in a.row_idx[span.clone()].iter().zip(&a.values[span]) {
                *map.entry((i, j)).or_insert(0.0) += v;
            }
        }
    }
    let mut last = String::new();
    for f in [1.02, 1.1, 1.5, 2.0, 4.0] {
        let mu = est * f;
        let a = CscMatrix::linear_combination(mu, m, -1.0, k);
        let mut vals = Vec::with_capacity(a.values.len());
        for j in 0..a.n {
            for &i in &a.row_idx[a.col_ptr[j]..a.col_ptr[j + 1]] {
                let key = (i, j);
                let mv = mmap.get(&key).copied().unwrap_or(0.0);
                let kv = kmap.get(&key).copied().unwrap_or(0.0);
                vals.push(ip(mu) * ip(mv) - ip(kv));
            }
        }
        match certify_lambda_min_lower(&a, &vals) {
            Ok(_) => return Ok(mu),
            Err(e) => last = e,
        }
    }
    Err(format!("could not certify an upper bound on λ_max(M⁻¹K) (estimate {est:.3e}): {last}"))
}

fn stability(tr: &DynamicTrace, cert: &mut DynamicsCertificate) {
    let p = &cert.parameters;
    let mut reasons = Vec::new();
    if tr.alpha.is_some() && !p.unconditionally_stable {
        reasons.push("HHT-α parameters outside the unconditionally stable range (γ = ½ − α, −½ ≤ α ≤ 0, β ≥ ¼ − α/2)".into());
    }
    cert.mass_lambda_min_lower = match certify_lambda_min_lower(&tr.m, &point_vals(&tr.m)) {
        Ok(v) => Some(v),
        Err(e) => {
            reasons.push(format!("M ≻ 0 not certified: {e}"));
            None
        }
    };
    cert.stiffness_lambda_min_lower = match certify_lambda_min_lower(&tr.k, &point_vals(&tr.k)) {
        Ok(v) => Some(v),
        Err(e) => {
            reasons.push(format!("K ≻ 0 not certified: {e}"));
            None
        }
    };
    if !cert.rayleigh_nonnegative {
        reasons.push("Rayleigh coefficients are not both non-negative".into());
    }
    let mut scheme_ok = p.unconditionally_stable;
    if !p.unconditionally_stable && tr.alpha.is_none() {
        if !p.conditionally_stable {
            reasons.push("γ < ½: the scheme amplifies (negative numerical damping)".into());
        } else if cert.mass_lambda_min_lower.is_some() {
            match certify_lambda_max_upper(&tr.k, &tr.m) {
                Ok(mu) => {
                    cert.lambda_max_upper = Some(mu);
                    // stable if Δt² μ (γ/2 − β) ≤ 1, checked exactly
                    let (b, g, dt, muq) = (q(tr.beta).unwrap(), q(tr.gamma).unwrap(), q(tr.dt).unwrap(), q(mu).unwrap());
                    let d = &g / qi(2) - &b;
                    let lhs = &dt * &dt * &muq * &d;
                    // largest stable Δt ≥ √(1/(μ d)), rounded down
                    let x = Q::from_integer(1.into()) / (&muq * &d);
                    if let Some(xf) = to_f64_down(&x) {
                        let mut s = xf.sqrt();
                        while s > 0.0 && q(s).unwrap().pow(2) > x {
                            s = s.next_down();
                        }
                        cert.dt_critical_lower = Some(s);
                    }
                    if lhs <= Q::from_integer(1.into()) {
                        scheme_ok = true;
                    } else {
                        reasons.push(format!(
                            "Δt = {} exceeds the certified stable step {:?} of the conditionally stable scheme",
                            tr.dt, cert.dt_critical_lower
                        ));
                    }
                }
                Err(e) => reasons.push(e),
            }
        } else {
            reasons.push("conditional stability needs M ≻ 0".into());
        }
    }
    cert.stability_certified = scheme_ok
        && cert.mass_lambda_min_lower.is_some()
        && cert.stiffness_lambda_min_lower.is_some()
        && cert.rayleigh_nonnegative;
    cert.stability_reason = (!reasons.is_empty()).then(|| reasons.join("; "));
}

// ───────────────────────────── residuals and energy ─────────────────────────────

fn residuals(tr: &DynamicTrace) -> Result<(ResidualReport, EnergyReport, TimeErrorEstimate), String> {
    let n_states = tr.u.len();
    if n_states == 0 || [tr.f.len(), tr.v.len(), tr.a.len()].iter().any(|&l| l != n_states) {
        return Err("inconsistent trajectory".into());
    }
    let ns = tr.k.n;
    if tr.m.n != ns || [&tr.f, &tr.u, &tr.v, &tr.a].iter().any(|s| s.iter().any(|x| x.len() != ns)) {
        return Err("trajectory dimension mismatch".into());
    }
    let (a0, a1, beta, gamma, dt) = (ip(tr.a0), ip(tr.a1), ip(tr.beta), ip(tr.gamma), ip(tr.dt));
    let one = ip(1.0);
    let halfi = ip(0.5);
    // effective load of the discrete equation at step n
    let fhat = |n: usize| -> Vec<Interval> {
        match (n, tr.alpha) {
            (0, _) | (_, None) => pts(&tr.f[n]),
            (_, Some(al)) => {
                let al = ip(al);
                tr.f[n].iter().zip(&tr.f[n - 1]).map(|(&fn1, &fn0)| (one + al) * ip(fn1) - al * ip(fn0)).collect()
            }
        }
    };
    struct State {
        mv: Vec<Interval>,
        kv: Vec<Interval>,
        /// C v_n + K u_n
        elastic: Vec<Interval>,
        f: Vec<Interval>,
        energy: Interval,
    }
    // Equation (E_n): M a_n + C v_n + K u_n = f_n at n = 0 and for Newmark;
    // for HHT-α at n ≥ 1: M a_n + (1+α)(C v_n + K u_n) − α(C v_{n−1} + K u_{n−1})
    // = (1+α) f_n − α f_{n−1}.
    let state = |n: usize, prev: Option<&State>| -> (State, f64, f64) {
        let (u, v, a) = (pts(&tr.u[n]), pts(&tr.v[n]), pts(&tr.a[n]));
        let ma = sym_matvec(&tr.m, &a);
        let mv = sym_matvec(&tr.m, &v);
        let kv = sym_matvec(&tr.k, &v);
        let ku = sym_matvec(&tr.k, &u);
        let f = fhat(n);
        let elastic: Vec<Interval> = (0..ns).map(|i| a0 * mv[i] + a1 * kv[i] + ku[i]).collect();
        let hht = match (tr.alpha, prev) {
            (Some(al), Some(p)) if n > 0 => Some((ip(al), p)),
            _ => None,
        };
        let mut rmax = 0.0f64;
        let mut scale = 0.0f64;
        for i in 0..ns {
            let (cur, old) = match hht {
                Some((al, p)) => ((one + al) * elastic[i], al * p.elastic[i]),
                None => (elastic[i], Interval::ZERO),
            };
            let r = f[i] - ma[i] - cur + old;
            rmax = rmax.max(r.mag());
            let cv = a0 * mv[i] + a1 * kv[i];
            scale = scale.max(f[i].mag()).max(ma[i].mag()).max(cv.mag()).max(ku[i].mag()).max(cur.mag()).max(old.mag());
        }
        let energy = halfi * dot(&v, &mv) + halfi * dot(&u, &ku);
        (State { mv, kv, elastic, f, energy }, rmax, scale)
    };

    let (mut prev, r0, s0) = state(0, None);
    let mut max_req = r0;
    let mut max_scale = s0;
    let e_init = prev.energy;
    let mut emax = e_init.mag();
    let (mut work, mut diss) = (Interval::ZERO, Interval::ZERO);
    let (mut max_ru, mut max_rv) = (0.0f64, 0.0f64);
    let (mut umax, mut vmax) = (0.0f64, 0.0f64);
    let mut est = 0.0f64;
    for x in &tr.u[0] {
        umax = umax.max(x.abs());
    }
    for x in &tr.v[0] {
        vmax = vmax.max(x.abs());
    }
    let bz = tr.beta - 1.0 / 6.0;
    for n in 0..n_states - 1 {
        let (cur, rn, sn) = state(n + 1, Some(&prev));
        max_req = max_req.max(rn);
        max_scale = max_scale.max(sn);
        emax = emax.max(cur.energy.mag());
        let (u0, u1) = (&tr.u[n], &tr.u[n + 1]);
        let (v0, v1) = (&tr.v[n], &tr.v[n + 1]);
        let (acc0, acc1) = (&tr.a[n], &tr.a[n + 1]);
        let mut dw = Interval::ZERO;
        let mut vcv = Interval::ZERO;
        for i in 0..ns {
            let du = ip(u1[i]) - ip(u0[i]);
            let ru = du - dt * ip(v0[i]) - dt * dt * ((halfi - beta) * ip(acc0[i]) + beta * ip(acc1[i]));
            let rv = ip(v1[i]) - ip(v0[i]) - dt * ((one - gamma) * ip(acc0[i]) + gamma * ip(acc1[i]));
            max_ru = max_ru.max(ru.mag());
            max_rv = max_rv.max(rv.mag());
            dw = dw + halfi * (prev.f[i] + cur.f[i]) * du;
            let vb = halfi * (ip(v0[i]) + ip(v1[i]));
            let mvb = halfi * (prev.mv[i] + cur.mv[i]);
            let kvb = halfi * (prev.kv[i] + cur.kv[i]);
            vcv = vcv + vb * (a0 * mvb + a1 * kvb);
            umax = umax.max(u1[i].abs());
            vmax = vmax.max(v1[i].abs());
            est = est.max((bz * tr.dt * tr.dt * (acc1[i] - acc0[i])).abs());
        }
        work = work + dw;
        diss = diss + dt * vcv;
        prev = cur;
    }
    let e_fin = prev.energy;
    let imb = e_fin - e_init + diss - work;
    let all = [e_init, e_fin, work, diss, imb];
    if !all.iter().all(|i| i.is_finite()) || ![max_req, max_ru, max_rv].iter().all(|x| x.is_finite()) {
        return Err("non-finite residual or energy enclosure".into());
    }
    let pair = |i: Interval| [i.lo, i.hi];
    let residual = ResidualReport {
        steps: n_states - 1,
        max_abs_equation: max_req,
        max_rel_equation: up_div(max_req, max_scale),
        max_rel_displacement_update: up_div(max_ru, umax),
        max_rel_velocity_update: up_div(max_rv, vmax),
    };
    let energy = EnergyReport {
        initial: pair(e_init),
        r#final: pair(e_fin),
        external_work: pair(work),
        damping_dissipation: pair(diss),
        imbalance: pair(imb),
        relative_imbalance: up_div(imb.mag(), emax.max(work.mag())),
        identity_exact_for_scheme: tr.beta == 0.25 && tr.gamma == 0.5 && tr.alpha.unwrap_or(0.0) == 0.0,
    };
    let time = TimeErrorEstimate {
        max_local_displacement_error: est,
        relative_to_peak_displacement: if umax > 0.0 { est / umax } else { 0.0 },
    };
    Ok((residual, energy, time))
}

/// Certify a recorded trajectory: scheme stability for the model and step,
/// per-step residuals, energy balance, and a labelled time-error estimate.
pub fn certify_dynamics(tr: &DynamicTrace) -> DynamicsCertificate {
    let scheme = if tr.alpha.is_some() {
        "HHT-α: M a_{n+1} + (1+α)(C v_{n+1} + K u_{n+1}) − α(C v_n + K u_n) = (1+α) f_{n+1} − α f_n, \
         Newmark updates with β = (1−α)²/4, γ = ½ − α"
            .to_string()
    } else {
        "Newmark".to_string()
    };
    let rayleigh_nonnegative = tr.a0.is_finite() && tr.a1.is_finite() && tr.a0 >= 0.0 && tr.a1 >= 0.0;
    let mut cert = DynamicsCertificate {
        scheme,
        beta: tr.beta,
        gamma: tr.gamma,
        alpha: tr.alpha,
        dt: tr.dt,
        parameters: match tr.alpha {
            Some(al) => hht_stability(al, tr.beta, tr.gamma),
            None => scheme_stability(tr.beta, tr.gamma),
        },
        mass_lambda_min_lower: None,
        stiffness_lambda_min_lower: None,
        rayleigh_nonnegative,
        lambda_max_upper: None,
        dt_critical_lower: None,
        stability_certified: false,
        stability_reason: None,
        residual: None,
        energy: None,
        time_error_estimate: None,
        residual_reason: None,
    };
    if !(tr.dt.is_finite() && tr.dt > 0.0 && tr.beta.is_finite() && tr.gamma.is_finite()) {
        cert.stability_reason = Some("non-finite or non-positive scheme parameters".into());
        cert.residual_reason = cert.stability_reason.clone();
        return cert;
    }
    stability(tr, &mut cert);
    match residuals(tr) {
        Ok((r, e, t)) => {
            cert.residual = Some(r);
            cert.energy = Some(e);
            cert.time_error_estimate = Some(t);
        }
        Err(e) => cert.residual_reason = Some(e),
    }
    cert
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedTimeHistory2D {
    pub results: TimeHistoryResult,
    pub certificate: DynamicsCertificate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedTimeHistory3D {
    pub results: TimeHistoryResult3D,
    pub certificate: DynamicsCertificate,
}

pub fn certify_time_history_2d(input: &TimeHistoryInput) -> Result<CertifiedTimeHistory2D, String> {
    let (results, trace) = solve_time_history_2d_traced(input)?;
    Ok(CertifiedTimeHistory2D { results, certificate: certify_dynamics(&trace) })
}

pub fn certify_time_history_3d(input: &TimeHistoryInput3D) -> Result<CertifiedTimeHistory3D, String> {
    let (results, trace) = solve_time_history_3d_traced(input)?;
    Ok(CertifiedTimeHistory3D { results, certificate: certify_dynamics(&trace) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newmark_parameter_table() {
        // average acceleration: unconditional, complex at high frequency
        let s = scheme_stability(0.25, 0.5);
        assert!(s.unconditionally_stable && s.high_frequency_complex && !s.conditionally_stable);
        // linear acceleration: conditional, Ω_crit² = 12
        let s = scheme_stability(1.0 / 6.0, 0.5);
        assert!(!s.unconditionally_stable && s.conditionally_stable);
        let w = s.omega_crit_sq.unwrap();
        assert!(w <= 12.0 && w > 12.0 * (1.0 - 1e-15));
        // Fox–Goodwin: Ω_crit² = 6
        let s = scheme_stability(1.0 / 12.0, 0.5);
        assert!((s.omega_crit_sq.unwrap() - 6.0).abs() < 1e-14);
        // γ < ½: never stable
        let s = scheme_stability(0.25, 0.49);
        assert!(!s.unconditionally_stable && !s.conditionally_stable);
        // dissipative Newmark: γ = 0.6, β = 0.3025 = (γ+½)²/4
        let s = scheme_stability(0.3025, 0.6);
        assert!(s.unconditionally_stable);
        // 2β ≥ γ but below (2γ+1)²/16: unconditional with a real branch
        let s = scheme_stability(0.3, 0.6);
        assert!(s.unconditionally_stable && !s.high_frequency_complex);
        // the boundary 2β = γ is decided exactly: one ulp of γ above ½ with β = ¼
        // is no longer unconditionally stable
        let s = scheme_stability(0.25, 0.5f64.next_up());
        assert!(!s.unconditionally_stable && s.conditionally_stable);
        assert!(!scheme_stability(0.1, 0.2).conditionally_stable);
        assert!(!scheme_stability(f64::NAN, 0.5).unconditionally_stable);
    }
}
