use crate::models::*;
use crate::support::*;
use dedaliano_engine::element::fiber_beam::{rectangular_fiber_section, FiberMaterial};
use dedaliano_engine::linalg::solve_generalized_eigen;
use dedaliano_engine::solver::buckling::buckling_system_2d;
use dedaliano_engine::solver::corotational::solve_corotational_2d;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::solver::pdelta::solve_pdelta_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn scaled(s: &SolverInput, k: f64) -> SolverInput {
    let mut s = s.clone();
    for l in &mut s.loads {
        match l {
            SolverLoad::Nodal(n) => {
                n.fx *= k;
                n.fz *= k;
                n.my *= k;
            }
            SolverLoad::Distributed(d) => {
                d.q_i *= k;
                d.q_j *= k;
            }
            other => panic!("{other:?}"),
        }
    }
    s
}

fn free_vector(dof: &DofNumbering, r: &AnalysisResults, k: f64) -> Vec<f64> {
    let mut u = vec![0.0; dof.n_free];
    for d in &r.displacements {
        for (local, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(&i) = dof.map.get(&(d.node_id, local)) {
                if i < dof.n_free {
                    u[i] = v * k;
                }
            }
        }
    }
    u
}

/// The linear system K u₀ = f and the spectral radius ρ of K⁻¹Kg per unit load.
struct Linearised {
    dof: DofNumbering,
    k: Vec<f64>,
    u0: Vec<f64>,
    rho: f64,
}

fn linearise(s: &SolverInput) -> Linearised {
    let sys = buckling_system_2d(s).unwrap();
    let n = sys.dof_num.n_free;
    assert!(sys.inclined_transforms_2d.is_empty());
    let k = sys.k_ff.to_dense_symmetric();
    let neg_kg = sys.neg_kg_csc.to_dense_symmetric();
    let eig = solve_generalized_eigen(&neg_kg, &k, n, 200).unwrap();
    let rho = eig.values.iter().map(|m| m.abs()).fold(0.0, f64::max);
    let u0 = free_vector(&sys.dof_num, &solve_2d(s).unwrap(), 1.0);
    Linearised { dof: sys.dof_num, k, u0, rho }
}

fn energy(k: &[f64], e: &[f64]) -> f64 {
    let n = e.len();
    (0..n).map(|i| e[i] * (0..n).map(|j| k[i * n + j] * e[j]).sum::<f64>()).sum::<f64>().max(0.0).sqrt()
}

/// `‖v − u₀‖_K / ‖u₀‖_K` for `v` the nonlinear response to load `scale·f`, divided by `scale`.
fn deviation(lin: &Linearised, r: &AnalysisResults, scale: f64) -> f64 {
    let v = free_vector(&lin.dof, r, 1.0 / scale);
    let e: Vec<f64> = v.iter().zip(&lin.u0).map(|(a, b)| a - b).collect();
    energy(&lin.k, &e) / energy(&lin.k, &lin.u0)
}

/// `(K + θKg/ρ) v = f` against `K u₀ = f`: `‖v − u₀‖_K ≤ θ/(1−θ) ‖u₀‖_K` with
/// `θ = scale·ρ` (Neumann series in the K inner product). Axial forces taken from
/// the deformed state, and the co-rotational chord rotations, add O(θ²).
fn first_order_bound(theta: f64) -> f64 {
    theta / (1.0 - theta) + theta * theta
}

/// The solves stop at a relative residual of 1e-12; with κ(K) < 1e7 on these frames
/// the response is good to κ·1e-12 < 1e-5, and dividing by the load scale keeps
/// that relative error.
const SOLVER_FLOOR: f64 = 1e-5;

fn converges_to_linear(what: &str, s: &SolverInput, solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) -> Result<Report, String> {
    let lin = linearise(s);
    let mut r = Report::new();
    let mut prev: Option<(f64, f64)> = None;
    for theta in [1e-1, 1e-2, 1e-3, 1e-4] {
        let scale = theta / lin.rho;
        let res = solve(&scaled(s, scale))?;
        let dev = deviation(&lin, &res, scale);
        let bound = first_order_bound(theta) + SOLVER_FLOOR;
        if !(dev <= bound) {
            r.fail(format!("{what} θ = {theta:.0e}: ‖v − u₀‖_K/‖u₀‖_K = {dev:.3e} > {bound:.3e}"));
        }
        if let Some((t0, d0)) = prev {
            if d0 > 100.0 * SOLVER_FLOOR && !(dev <= d0 * (theta / t0) * 3.0 + SOLVER_FLOOR) {
                r.fail(format!("{what}: not first order, deviation {d0:.3e} at θ = {t0:.0e} then {dev:.3e} at θ = {theta:.0e}"));
            }
        }
        r.close(&format!("{what} θ = {theta:.0e} deviation"), LoadFactor::from_factor(dev), LoadFactor::from_factor(0.0), LoadFactor::from_factor(bound));
        prev = Some((theta, dev));
    }
    Ok(r)
}

fn pdelta(s: &SolverInput) -> Result<AnalysisResults, String> {
    let p = solve_pdelta_2d(s, 100, 1e-12)?;
    if !p.converged {
        return Err("P-delta did not converge".into());
    }
    Ok(p.results)
}

fn corotational(s: &SolverInput) -> Result<AnalysisResults, String> {
    let c = solve_corotational_2d(s, 100, 1e-12, 1, false)?;
    if !c.converged {
        return Err("co-rotational did not converge".into());
    }
    Ok(c.results)
}

fn sway_frame() -> SolverInput {
    frame_2d(&FrameSpec { gravity_kn: 300.0, ..FrameSpec::two_storey() })
}

#[test]
fn pdelta_converges_to_linear_at_vanishing_load() {
    agree("P-delta → linear", converges_to_linear("P-delta", &sway_frame(), &pdelta));
}

#[test]
fn corotational_converges_to_linear_at_vanishing_load() {
    agree("co-rotational → linear", converges_to_linear("co-rotational", &sway_frame(), &corotational));
}

const RECT_B: f64 = 0.2;
const RECT_H: f64 = 0.4;

/// Midpoint layers integrate `∫y² dA` as `Σ b·Δ·yᵢ² = bh³/12 · (1 − 1/n²)` exactly.
fn layered_inertia(n_layers: usize) -> f64 {
    RECT_B * RECT_H.powi(3) / 12.0 * (1.0 - 1.0 / (n_layers * n_layers) as f64)
}

fn rect_frame(iz: f64) -> SolverInput {
    let mut s = frame_2d(&FrameSpec { column: (RECT_B * RECT_H, iz), beam: (RECT_B * RECT_H, iz), ..FrameSpec::two_storey() });
    s.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
        element_id: first_beam(&s),
        q_i: -5.0, q_j: -5.0, a: None, b: None,
    }));
    s
}

fn fiber(s: &SolverInput, n_layers: usize) -> Result<AnalysisResults, String> {
    let section = rectangular_fiber_section(RECT_B, RECT_H, n_layers, FiberMaterial::SteelBilinear { e: E_STEEL_MPA, fy: 355.0, hardening_ratio: 0.01 });
    let input = FiberNonlinearInput {
        solver: s.clone(),
        fiber_sections: HashMap::from([("1".to_string(), section.clone()), ("2".to_string(), section)]),
        n_integration_points: 5,
        max_iter: 50,
        tolerance: 1e-12,
        n_increments: 1,
        modified_nr: false,
    };
    let f = solve_fiber_nonlinear_2d(&input)?;
    if !f.converged || f.fiber_status.iter().any(|x| x.yielded) {
        return Err(format!("fiber run converged {} yielded {}", f.converged, f.fiber_status.iter().any(|x| x.yielded)));
    }
    Ok(f.results)
}

/// Fiber sections stay elastic below yield, so the fiber frame is the linear frame
/// with the layered section's A and I: equal to solver tolerance, with no load-size
/// term (the fiber solver is materially, not geometrically, nonlinear). Against the
/// exact `bh³/12` the bending part differs by the 1/n² layering error.
pub fn fiber_pair(n_layers: usize) -> Result<Report, String> {
    let exact = rect_frame(layered_inertia(n_layers));
    let lin = solve_2d(&exact)?;
    let fib = fiber(&exact, n_layers)?;
    let peak_stress_mpa = 1e-3 * lin.element_forces.iter().map(|f| f.m_start.abs().max(f.m_end.abs())).fold(0.0, f64::max) * (RECT_H / 2.0) / layered_inertia(n_layers);
    let mut r = Report::new();
    if peak_stress_mpa > 0.5 * 355.0 {
        r.fail(format!("load too large for an elastic comparison: {peak_stress_mpa:.1} MPa"));
    }
    let pick = |res: &AnalysisResults| -> Vec<(usize, f64, f64, f64)> { res.displacements.iter().map(|d| (d.node_id, d.ux, d.uz, d.ry)).collect() };
    let (a, b) = (pick(&fib), pick(&lin));
    let pairs = |i: usize| -> Vec<(String, Length, Length)> {
        a.iter().zip(&b).map(|(x, y)| (format!("node {}", x.0), Length::from_m([x.1, x.2][i]), Length::from_m([y.1, y.2][i]))).collect()
    };
    r.field(&format!("fiber ({n_layers} layers) ux"), &pairs(0), 1e-8);
    r.field(&format!("fiber ({n_layers} layers) uz"), &pairs(1), 1e-8);
    let rot: Vec<(String, Rotation, Rotation)> = a.iter().zip(&b).map(|(x, y)| (format!("node {}", x.0), Rotation::from_rad(x.3), Rotation::from_rad(y.3))).collect();
    r.field(&format!("fiber ({n_layers} layers) θ"), &rot, 1e-8);
    Ok(r)
}

#[test]
fn fiber_elastic_matches_linear_with_layered_section() {
    for n in [4, 10, 40] {
        agree(&format!("fiber {n} layers vs linear"), fiber_pair(n));
    }
}

/// Second reference: refining the layers converges on the exact section at the
/// predicted rate, the bending flexibility error being `1/(n² − 1)`.
#[test]
fn fiber_layer_refinement_converges_on_the_exact_section() {
    let exact = solve_2d(&rect_frame(RECT_B * RECT_H.powi(3) / 12.0)).unwrap();
    let roof = plane_frame(&FrameSpec::two_storey()).roof[0];
    let ux_exact = exact.displacements.iter().find(|d| d.node_id == roof).unwrap().ux;
    let mut r = Report::new();
    let mut prev = None;
    for n in [4usize, 8, 16, 32] {
        let ux = fiber(&rect_frame(RECT_B * RECT_H.powi(3) / 12.0), n).unwrap().displacements.iter().find(|d| d.node_id == roof).unwrap().ux;
        let err = (ux - ux_exact).abs() / ux_exact.abs();
        let predicted = 1.0 / ((n * n) as f64 - 1.0);
        if !(err <= predicted) {
            r.fail(format!("{n} layers: sway error {err:.3e} above the bending-only 1/(n²−1) = {predicted:.3e}"));
        }
        if let Some(p) = prev {
            let ratio: f64 = p / err;
            r.close(&format!("{n} layers: error ratio on halving the layer depth"), LoadFactor::from_factor(ratio), LoadFactor::from_factor(4.0), LoadFactor::from_factor(0.25));
        }
        prev = Some(err);
    }
    agree("fiber layer refinement", Ok(r));
}

#[test]
#[ignore = "nightly: make test.engine.differential.full"]
fn nonlinear_converges_to_linear_on_frame_family() {
    for seed in 0..16 {
        let spec = FrameSpec { gravity_kn: 200.0, ..FrameSpec::variant(seed) };
        let s = frame_2d(&spec);
        agree(&format!("P-delta, frame {seed} {spec:?}"), converges_to_linear("P-delta", &s, &pdelta));
        agree(&format!("co-rotational, frame {seed} {spec:?}"), converges_to_linear("co-rotational", &s, &corotational));
    }
}
