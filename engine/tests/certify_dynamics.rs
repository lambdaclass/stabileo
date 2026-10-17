//! Certified time-history integration (docs/verification/CERTIFY.md,
//! "Time-history integration").
//!
//! Honesty: residual bounds are compared with the residuals recomputed in exact
//! rational arithmetic; the certified λ_max bound and stable step with a dense
//! Jacobi eigen-solve of L⁻¹KL⁻ᵀ; the stability verdict with the trajectory's
//! actual growth. Refusals tamper with the recorded trajectory and parameters.

mod common;

use common::*;
use dedaliano_engine::certify::dynamics::*;
use dedaliano_engine::certify::exact::{q, to_f64, Q};
use dedaliano_engine::linalg::{jacobi_eigen, CscMatrix};
use dedaliano_engine::solver::time_integration::{solve_time_history_2d_traced, DynamicTrace};
use dedaliano_engine::types::*;
use num_traits::{Signed, Zero};
use std::collections::HashMap;

fn cantilever(n: usize, dt: f64, steps: usize, beta: f64, gamma: f64) -> TimeHistoryInput {
    let solver = make_beam(n, 2.0, 200_000.0, 0.01, 8.33e-6, "fixed", None, vec![]);
    let tip = n + 1;
    TimeHistoryInput {
        solver,
        densities: HashMap::from([("1".to_string(), 7850.0)]),
        time_step: dt,
        n_steps: steps,
        method: "newmark".into(),
        beta,
        gamma,
        alpha: None,
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: Some(vec![
            TimeForceRecord { time: 0.0, loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -1.0, my: 0.0 }] },
            TimeForceRecord { time: 0.01, loads: vec![SolverNodalLoad { node_id: tip, fx: 0.3, fz: -1.0, my: 0.0 }] },
            TimeForceRecord { time: 0.02, loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: 0.0, my: 0.0 }] },
        ]),
    }
}

fn trace(inp: &TimeHistoryInput) -> DynamicTrace {
    solve_time_history_2d_traced(inp).unwrap().1
}

fn dense(a: &CscMatrix) -> Vec<Vec<Q>> {
    let mut d = vec![vec![Q::zero(); a.n]; a.n];
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[p];
            let v = q(a.values[p]).unwrap();
            d[i][j] += &v;
            if i != j {
                d[j][i] += &v;
            }
        }
    }
    d
}

fn mv(a: &[Vec<Q>], x: &[f64]) -> Vec<Q> {
    let xq: Vec<Q> = x.iter().map(|v| q(*v).unwrap()).collect();
    a.iter().map(|row| row.iter().zip(&xq).map(|(p, r)| p * r).sum()).collect()
}

/// Exact residuals of the discrete scheme for the recorded trajectory. Equation
/// of motion: `M a_n + C v_n + K u_n = f_n` (Newmark, and n = 0), HHT-α for
/// n ≥ 1: `M a_n + (1+α)(C v_n + K u_n) − α(C v_{n−1} + K u_{n−1}) = (1+α) f_n − α f_{n−1}`.
fn exact_residuals(tr: &DynamicTrace) -> (Q, Q, Q) {
    let (k, m) = (dense(&tr.k), dense(&tr.m));
    let (a0, a1, b, g, dt) = (q(tr.a0).unwrap(), q(tr.a1).unwrap(), q(tr.beta).unwrap(), q(tr.gamma).unwrap(), q(tr.dt).unwrap());
    let half = Q::new(1.into(), 2.into());
    let one = Q::from_integer(1.into());
    // C v_n + K u_n, exactly
    let elastic = |n: usize| -> Vec<Q> {
        let (mvv, kv, ku) = (mv(&m, &tr.v[n]), mv(&k, &tr.v[n]), mv(&k, &tr.u[n]));
        (0..tr.k.n).map(|i| &a0 * &mvv[i] + &a1 * &kv[i] + &ku[i]).collect()
    };
    let mut req = Q::zero();
    let mut prev = elastic(0);
    for n in 0..tr.u.len() {
        let ma = mv(&m, &tr.a[n]);
        let cur = elastic(n);
        for i in 0..tr.k.n {
            let f = |s: usize| q(tr.f[s][i]).unwrap();
            let r = match (n, tr.alpha) {
                (0, _) | (_, None) => f(n) - &ma[i] - &cur[i],
                (_, Some(al)) => {
                    let al = q(al).unwrap();
                    (&one + &al) * f(n) - &al * f(n - 1) - &ma[i] - (&one + &al) * &cur[i] + &al * &prev[i]
                }
            };
            req = req.max(r.abs());
        }
        prev = cur;
    }
    let (mut ru, mut rv) = (Q::zero(), Q::zero());
    for n in 0..tr.u.len() - 1 {
        for i in 0..tr.k.n {
            let x = |v: &Vec<Vec<f64>>, s: usize| q(v[s][i]).unwrap();
            let r = x(&tr.u, n + 1) - x(&tr.u, n) - &dt * x(&tr.v, n)
                - &dt * &dt * ((&half - &b) * x(&tr.a, n) + &b * x(&tr.a, n + 1));
            ru = ru.max(r.abs());
            let r = x(&tr.v, n + 1) - x(&tr.v, n) - &dt * ((&one - &g) * x(&tr.a, n) + &g * x(&tr.a, n + 1));
            rv = rv.max(r.abs());
        }
    }
    (req, ru, rv)
}

fn umax(tr: &DynamicTrace) -> f64 {
    tr.u.iter().flatten().fold(0.0f64, |m, v| m.max(v.abs()))
}
fn vmax(tr: &DynamicTrace) -> f64 {
    tr.v.iter().flatten().fold(0.0f64, |m, v| m.max(v.abs()))
}

#[test]
fn average_acceleration_residuals_are_honest_and_small() {
    let inp = cantilever(2, 2e-4, 150, 0.25, 0.5);
    let tr = trace(&inp);
    let c = certify_dynamics(&tr);
    assert!(c.stability_certified, "{c:?}");
    assert!(c.parameters.unconditionally_stable && c.parameters.high_frequency_complex);
    let r = c.residual.as_ref().unwrap();
    assert_eq!(r.steps, 150);
    let (req, ru, rv) = exact_residuals(&tr);
    // honesty: certified bounds ≥ exact residuals
    assert!(q(r.max_abs_equation).unwrap() >= req, "{} < {}", r.max_abs_equation, to_f64(&req));
    assert!(r.max_rel_displacement_update * umax(&tr) >= to_f64(&ru) * (1.0 - 1e-12));
    assert!(r.max_rel_velocity_update * vmax(&tr) >= to_f64(&rv) * (1.0 - 1e-12));
    // and tight: the solver's trajectory satisfies the scheme to round-off
    assert!(r.max_rel_equation < 1e-9, "{r:?}");
    assert!(r.max_rel_displacement_update < 1e-12 && r.max_rel_velocity_update < 1e-12, "{r:?}");
    let e = c.energy.as_ref().unwrap();
    assert!(e.identity_exact_for_scheme);
    assert!(e.relative_imbalance < 1e-8, "{e:?}");
    assert!(e.external_work[1] > 0.0);
    let t = c.time_error_estimate.as_ref().unwrap();
    assert!(t.max_local_displacement_error > 0.0);
    eprintln!("avg accel: {r:?}\n{e:?}\n{t:?}");
}

#[test]
fn hht_and_rayleigh_damping() {
    let mut inp = cantilever(3, 2e-4, 120, 0.25, 0.5);
    inp.alpha = Some(-0.1);
    let tr = trace(&inp);
    let c = certify_dynamics(&tr);
    assert!(c.stability_certified && c.parameters.unconditionally_stable, "{c:?}");
    assert!(c.scheme.contains("HHT") && c.scheme.contains("(1+α)(C v_{n+1} + K u_{n+1})"));
    // γ = ½ − α exactly for the α integrated
    assert_eq!(q(tr.gamma).unwrap(), Q::new(1.into(), 2.into()) - q(tr.alpha.unwrap()).unwrap());
    let (req, ru, rv) = exact_residuals(&tr);
    let r = c.residual.as_ref().unwrap();
    assert!(q(r.max_abs_equation).unwrap() >= req);
    assert!(r.max_rel_displacement_update * umax(&tr) >= to_f64(&ru) * (1.0 - 1e-12));
    assert!(r.max_rel_velocity_update * vmax(&tr) >= to_f64(&rv) * (1.0 - 1e-12));
    // the solver's trajectory satisfies the HHT equation of motion to round-off
    assert!(r.max_rel_equation < 1e-9, "{r:?}");
    assert!(!c.energy.as_ref().unwrap().identity_exact_for_scheme);
    // and, being dissipative, does not satisfy the Newmark one: the old scheme's
    // residual (load blend only) is far from round-off
    let mut newmark = tr.clone();
    newmark.alpha = None;
    let (req_nm, _, _) = exact_residuals(&newmark);
    assert!(to_f64(&req_nm) > 1e3 * to_f64(&req), "{} vs {}", to_f64(&req_nm), to_f64(&req));
    // α outside the unconditional range is not certified stable
    let mut t = tr.clone();
    t.beta = 0.2;
    assert!(!certify_dynamics(&t).stability_certified);

    // HHT with Rayleigh damping: the α-weighting of C v is in the residual too
    let mut inp = cantilever(3, 2e-4, 120, 0.25, 0.5);
    inp.alpha = Some(-0.3);
    inp.damping_xi = Some(0.05);
    let tr = trace(&inp);
    let c = certify_dynamics(&tr);
    assert!(c.stability_certified, "{c:?}");
    let (req, _, _) = exact_residuals(&tr);
    let r = c.residual.as_ref().unwrap();
    assert!(q(r.max_abs_equation).unwrap() >= req);
    assert!(r.max_rel_equation < 1e-9, "{r:?}");

    let mut inp = cantilever(3, 2e-4, 120, 0.25, 0.5);
    inp.damping_xi = Some(0.05);
    let tr = trace(&inp);
    assert!(tr.a0 > 0.0 && tr.a1 > 0.0);
    let c = certify_dynamics(&tr);
    assert!(c.stability_certified && c.rayleigh_nonnegative, "{c:?}");
    let e = c.energy.as_ref().unwrap();
    assert!(e.damping_dissipation[0] > 0.0, "{e:?}");
    assert!(e.relative_imbalance < 1e-8, "{e:?}");
    let (req, _, _) = exact_residuals(&tr);
    assert!(q(c.residual.as_ref().unwrap().max_abs_equation).unwrap() >= req);
}

/// Reference λ_max of (K, M) by dense Cholesky of M and Jacobi on L⁻¹KL⁻ᵀ.
fn reference_lambda_max(tr: &DynamicTrace) -> f64 {
    let n = tr.k.n;
    let (k, m) = (tr.k.to_dense_symmetric(), tr.m.to_dense_symmetric());
    let mut l = vec![0.0; n * n];
    for j in 0..n {
        let mut s = m[j * n + j];
        for p in 0..j {
            s -= l[j * n + p] * l[j * n + p];
        }
        l[j * n + j] = s.sqrt();
        for i in j + 1..n {
            let mut s = m[i * n + j];
            for p in 0..j {
                s -= l[i * n + p] * l[j * n + p];
            }
            l[i * n + j] = s / l[j * n + j];
        }
    }
    // X = L⁻¹ K, then C = X L⁻ᵀ = L⁻¹ (L⁻¹ K)ᵀ
    let solve = |b: &[f64]| -> Vec<f64> {
        let mut x = vec![0.0; n];
        for i in 0..n {
            let mut s = b[i];
            for p in 0..i {
                s -= l[i * n + p] * x[p];
            }
            x[i] = s / l[i * n + i];
        }
        x
    };
    let mut xk = vec![0.0; n * n];
    for c in 0..n {
        let col: Vec<f64> = (0..n).map(|r| k[r * n + c]).collect();
        let x = solve(&col);
        for r in 0..n {
            xk[r * n + c] = x[r];
        }
    }
    let mut cm = vec![0.0; n * n];
    for r in 0..n {
        let row: Vec<f64> = (0..n).map(|c| xk[r * n + c]).collect();
        let x = solve(&row);
        for c in 0..n {
            cm[c * n + r] = x[c];
        }
    }
    let ev = jacobi_eigen(&cm, n, 200);
    ev.values.iter().fold(0.0f64, |a, v| a.max(*v))
}

#[test]
fn conditionally_stable_linear_acceleration() {
    // linear acceleration β = 1/6: Ω_crit = √12
    let probe = trace(&cantilever(3, 1e-6, 2, 1.0 / 6.0, 0.5));
    let lam = reference_lambda_max(&probe);
    let dt_true = 12f64.sqrt() / lam.sqrt();
    let c = certify_dynamics(&probe);
    let mu = c.lambda_max_upper.unwrap();
    assert!(mu >= lam * (1.0 - 1e-10), "μ = {mu} < λ_max = {lam}");
    let dtc = c.dt_critical_lower.unwrap();
    assert!(dtc <= dt_true * (1.0 + 1e-10) && dtc > 0.2 * dt_true, "{dtc} vs {dt_true}");
    assert!(c.stability_certified, "{c:?}");

    // below the certified step: certified stable, bounded response
    let good = trace(&cantilever(3, 0.95 * dtc, 400, 1.0 / 6.0, 0.5));
    let cg = certify_dynamics(&good);
    assert!(cg.stability_certified, "{cg:?}");
    // above the true critical step: refused, and the trajectory really diverges
    let bad = trace(&cantilever(3, 1.05 * dt_true, 400, 1.0 / 6.0, 0.5));
    let cb = certify_dynamics(&bad);
    assert!(!cb.stability_certified && cb.stability_reason.as_deref().unwrap().contains("exceeds"), "{cb:?}");
    assert!(umax(&bad) > 1e3 * umax(&good), "{} vs {}", umax(&bad), umax(&good));
}

#[test]
fn tampered_trajectory_and_parameters() {
    let inp = cantilever(2, 2e-4, 60, 0.25, 0.5);
    let tr = trace(&inp);
    let base = certify_dynamics(&tr);
    let r0 = base.residual.clone().unwrap();

    // a displacement nudged by 1e-6 (relative): the residuals expose it
    let mut t = tr.clone();
    let (s, i) = (30, 1);
    t.u[s][i] *= 1.0 + 1e-6;
    let c = certify_dynamics(&t);
    let r = c.residual.unwrap();
    assert!(r.max_rel_displacement_update > 1e3 * r0.max_rel_displacement_update.max(1e-16));
    assert!(r.max_rel_equation > 1e3 * r0.max_rel_equation.max(1e-16), "{r:?} vs {r0:?}");

    // an acceleration replaced: equation and velocity update residuals expose it
    let mut t = tr.clone();
    t.a[10][0] += 1.0;
    let r = certify_dynamics(&t).residual.unwrap();
    assert!(r.max_rel_velocity_update > 1e-6);

    // tampered β (conditional) with a huge step: not certified stable
    let mut t = tr.clone();
    t.beta = 0.1;
    t.dt = 1.0;
    let c = certify_dynamics(&t);
    assert!(!c.stability_certified);
    // γ < ½
    let mut t = tr.clone();
    t.gamma = 0.45;
    assert!(!certify_dynamics(&t).stability_certified);
    // negative Rayleigh coefficient
    let mut t = tr.clone();
    t.a0 = -1e-3;
    let c = certify_dynamics(&t);
    assert!(!c.stability_certified && !c.rayleigh_nonnegative);
    // inconsistent trajectory
    let mut t = tr.clone();
    t.v.pop();
    let c = certify_dynamics(&t);
    assert!(c.residual.is_none() && c.residual_reason.is_some());
    // non-finite state
    let mut t = tr;
    t.u[5][0] = f64::NAN;
    assert!(certify_dynamics(&t).residual.is_none());
}

#[test]
fn ground_acceleration_and_3d() {
    let mut inp = cantilever(2, 5e-4, 80, 0.25, 0.5);
    inp.force_history = None;
    inp.ground_accel = Some((0..80).map(|k| (k as f64 * 0.3).sin()).collect());
    inp.ground_direction = Some("Y".into());
    let out = certify_time_history_2d(&inp).unwrap();
    assert!(out.certificate.stability_certified);
    assert!(out.certificate.residual.unwrap().max_rel_equation < 1e-9);

    let solver = make_3d_beam(3, 2.0, 200_000.0, 0.3, 0.01, 8.33e-6, 8.33e-6, 1e-5, vec![true; 6], None, vec![]);
    let inp3 = TimeHistoryInput3D {
        solver,
        densities: HashMap::from([("1".to_string(), 7850.0)]),
        time_step: 2e-4,
        n_steps: 60,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.02),
        ground_accel_x: None,
        ground_accel_y: None,
        ground_accel_z: Some((0..60).map(|k| (k as f64 * 0.2).cos()).collect()),
        force_history: None,
    };
    let out = certify_time_history_3d(&inp3).unwrap();
    let c = out.certificate;
    assert!(c.stability_certified, "{c:?}");
    assert!(c.residual.unwrap().max_rel_equation < 1e-9);
    assert!(c.energy.unwrap().relative_imbalance < 1e-8);
    let json = serde_json::to_string(&certify_dynamics(&trace(&cantilever(2, 2e-4, 5, 0.25, 0.5)))).unwrap();
    assert!(json.contains("stabilityCertified") && json.contains("timeErrorEstimate"));
}
