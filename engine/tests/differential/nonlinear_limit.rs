use crate::models::*;
use crate::support::*;
use dedaliano_engine::element::fiber_beam::{rectangular_fiber_section, FiberMaterial};
use dedaliano_engine::linalg::{cholesky_solve, solve_generalized_eigen};
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

/// The linear system K u₀ = f, the spectral radius ρ of K⁻¹Kg per unit load, and the
/// first-order correction u₁ = K⁻¹(−Kg)u₀ per unit load.
struct Linearised {
    dof: DofNumbering,
    k: Vec<f64>,
    u0: Vec<f64>,
    u1: Vec<f64>,
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
    let kg_u0: Vec<f64> = (0..n).map(|i| (0..n).map(|j| neg_kg[i * n + j] * u0[j]).sum()).collect();
    let u1 = cholesky_solve(&mut k.clone(), &kg_u0, n).unwrap();
    Linearised { dof: sys.dof_num, k, u0, u1, rho }
}

fn energy(k: &[f64], e: &[f64]) -> f64 {
    let n = e.len();
    let w: f64 = (0..n).map(|i| e[i] * (0..n).map(|j| k[i * n + j] * e[j]).sum::<f64>()).sum();
    if w.is_finite() { w.max(0.0).sqrt() } else { f64::NAN }
}

/// `‖v − u₀ − scale·u₁‖_K / ‖u₀‖_K` for `v` the nonlinear response to load
/// `scale·f`, divided by `scale`: what is left after the first-order correction.
fn remainder(lin: &Linearised, r: &AnalysisResults, scale: f64) -> f64 {
    let v = free_vector(&lin.dof, r, 1.0 / scale);
    let e: Vec<f64> = v.iter().zip(&lin.u0).zip(&lin.u1).map(|((a, b), c)| a - b - scale * c).collect();
    energy(&lin.k, &e) / energy(&lin.k, &lin.u0)
}

impl Linearised {
    fn first_order(&self) -> f64 {
        energy(&self.k, &self.u1) / energy(&self.k, &self.u0) / self.rho
    }

    fn deviation(&self, r: &AnalysisResults, scale: f64) -> f64 {
        let v = free_vector(&self.dof, r, 1.0 / scale);
        let e: Vec<f64> = v.iter().zip(&self.u0).map(|(a, b)| a - b).collect();
        energy(&self.k, &e) / energy(&self.k, &self.u0)
    }
}

/// The solves stop at a relative residual of 1e-12; with κ(K) < 1e7 on these frames
/// the response is good to κ·1e-12 < 1e-5, and dividing by the load scale keeps
/// that relative error.
const SOLVER_FLOOR: f64 = 1e-5;

/// `(K + θA) v = f` with `A = Kg/ρ` and `K u₀ = f`: `A` is K-symmetric with K-norm 1, so
/// the Neumann series leaves `‖v − u₀ − θu₁/ρ‖_K ≤ θ² r₁/(1−θ) ‖u₀‖_K`, where
/// `r₁ = ‖u₁‖_K/(ρ‖u₀‖_K)`. P-delta takes the axial forces from the deformed state,
/// which moves `A` by `O(θ r₁)` and adds `θ² r₁²`.
fn second_order_bound(theta: f64, r1: f64) -> f64 {
    theta * theta * r1 / (1.0 - theta) + theta * theta * r1 * r1 + SOLVER_FLOOR
}

const THETAS: [f64; 4] = [1e-1, 1e-2, 1e-3, 1e-4];

/// P-delta solves second-order theory, so after `u₁ = K⁻¹(−Kg)u₀` the remainder must
/// fall as θ². A path that returned the linear solution leaves `θ r₁`, which the
/// first check keeps above twice the bound at θ = 0.1.
fn pdelta_converges_to_linear(s: &SolverInput) -> Result<Report, String> {
    pdelta_converges_to_linear_with(s, &pdelta)
}

fn pdelta_converges_to_linear_with(s: &SolverInput, solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) -> Result<Report, String> {
    let lin = linearise(s);
    let r1 = lin.first_order();
    let mut r = Report::new();
    if !(r1 * THETAS[0] > 2.0 * second_order_bound(THETAS[0], r1)) {
        r.fail(format!("first-order correction {:.3e} at θ = 0.1 is under twice the bound: the frame tests nothing", r1 * THETAS[0]));
    }
    for theta in THETAS {
        let scale = theta / lin.rho;
        let rem = remainder(&lin, &solve(&scaled(s, scale))?, scale);
        r.close(&format!("P-delta θ = {theta:.0e}: ‖v − u₀ − θu₁/ρ‖_K/‖u₀‖_K"), Ratio::from_ratio(rem), Ratio::from_ratio(0.0), Ratio::from_ratio(second_order_bound(theta, r1)));
    }
    Ok(r)
}

/// Co-rotational members carry the chord-only geometric stiffness `N/L·zzᵀ`, the moment
/// coupling `(Mᵢ+Mⱼ)/L²` and their own shortening, so their first-order term is not
/// second-order theory's: on a one-element member the chord term alone is 1/1.2 of it.
/// On a frame the check is that the path leaves the linear solution at first order,
/// `‖v − u₀‖_K = c θ r₁ ‖u₀‖_K` with `c` within a factor 2 of the theory and steady to
/// `O(θ)` between θ = 1e-2 and 1e-3; the column test pins `c` to the exact solution.
fn corotational_departs_at_first_order(s: &SolverInput) -> Result<Report, String> {
    corotational_departs_at_first_order_with(s, &corotational)
}

fn corotational_departs_at_first_order_with(s: &SolverInput, solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) -> Result<Report, String> {
    let lin = linearise(s);
    let r1 = lin.first_order();
    let mut r = Report::new();
    let mut c = Vec::new();
    for theta in [1e-2, 1e-3] {
        let scale = theta / lin.rho;
        let ratio = lin.deviation(&solve(&scaled(s, scale))?, scale) / (theta * r1);
        c.push(ratio);
        r.close(&format!("co-rotational θ = {theta:.0e}: ‖v − u₀‖_K/(θ r₁ ‖u₀‖_K)"), Ratio::from_ratio(ratio), Ratio::from_ratio(1.25), Ratio::from_ratio(0.75));
    }
    r.close("co-rotational first-order coefficient, θ = 1e-2 against 1e-3", Ratio::from_ratio(c[0]), Ratio::from_ratio(c[1]), Ratio::from_ratio(0.1 * c[1].abs()));
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
    agree("P-delta → linear", pdelta_converges_to_linear(&sway_frame()));
}

#[test]
fn corotational_departs_from_linear_at_first_order() {
    agree("co-rotational → linear", corotational_departs_at_first_order(&sway_frame()));
}

const COLUMN: FrameSpec = FrameSpec { bays: 0, storeys: 1, gravity_kn: 300.0, lateral_kn: 0.3, ..FrameSpec::two_storey() };

/// Cantilever column under P and a small tip load H, split into `n` elements, at
/// `θ = P/P_cr`: the tip sway's first-order coefficient `(δ/δ₀ − 1)/(2α²/5)`, against
/// the exact `δ/δ₀ = 3(tan α − α)/α³`, `α² = PL²/EI` (Timoshenko & Gere §1.11).
fn column_coefficient(n: usize, theta: f64, solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) -> Result<(f64, f64), String> {
    let spec = FrameSpec { subdivisions: n, ..COLUMN };
    let s = frame_2d(&spec);
    let top = plane_frame(&spec).roof[0];
    let ei = E_STEEL_MPA * 1e3 * spec.column.1;
    let l = spec.storey_height;
    let scale = theta * std::f64::consts::PI.powi(2) * ei / (4.0 * l * l) / spec.gravity_kn;
    let tip = |r: &AnalysisResults| r.displacements.iter().find(|d| d.node_id == top).unwrap().ux;
    let d0 = tip(&solve_2d(&s)?);
    let a2 = spec.gravity_kn * scale * l * l / ei;
    let a = a2.sqrt();
    let exact = (3.0 * (a.tan() - a) / a.powi(3) - 1.0) / (0.4 * a2);
    Ok(((tip(&solve(&scaled(&s, scale))?) / (scale * d0) - 1.0) / (0.4 * a2), exact))
}

/// H/P = 1e-3 keeps the cubic terms in H out of the coefficient. P-delta's cubic
/// Hermite members with the consistent Kg carry the exact cantilever shape, so its
/// coefficient matches the closed form on any mesh to the series' next term.
#[test]
fn pdelta_column_matches_the_exact_amplification() {
    pdelta_column_matches_the_exact_amplification_check(&pdelta);
}

fn pdelta_column_matches_the_exact_amplification_check(solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) {
    let mut r = Report::new();
    for n in [1, 4, 16] {
        for theta in [1e-2, 1e-3] {
            let (c, exact) = column_coefficient(n, theta, solve).unwrap();
            r.close(&format!("P-delta column, {n} elements, θ = {theta:.0e}"), Ratio::from_ratio(c), Ratio::from_ratio(exact), Ratio::from_ratio(1e-4));
        }
    }
    agree("P-delta column vs Timoshenko & Gere", Ok(r));
}

/// Co-rotational members bend between chords, so the coefficient converges as 1/n²
/// (successive differences shrink by 4) to a limit below the closed form by at most
/// the column's own shortening: `ε = P/EA` cuts the `L³` sway by `3ε`, which in the
/// coefficient is `3ε/(2α²/5) = 7.5 r²/L²`, `r² = I/A`.
#[test]
fn corotational_column_converges_on_the_exact_amplification() {
    corotational_column_converges_on_the_exact_amplification_check(&corotational);
}

fn corotational_column_converges_on_the_exact_amplification_check(solve: &dyn Fn(&SolverInput) -> Result<AnalysisResults, String>) {
    let theta = 1e-2;
    let c: Vec<(f64, f64)> = [4, 8, 16, 32].into_iter().map(|n| column_coefficient(n, theta, solve).unwrap()).collect();
    let exact = c[0].1;
    let mut r = Report::new();
    for w in c.windows(3) {
        r.close("co-rotational column: error ratio on halving the elements", Ratio::from_ratio((w[1].0 - w[0].0) / (w[2].0 - w[1].0)), Ratio::from_ratio(4.0), Ratio::from_ratio(1.0));
    }
    let last = c[3].0 - c[2].0;
    let limit = c[3].0 + last / 3.0;
    let shortening = 7.5 * COLUMN.column.1 / COLUMN.column.0 / COLUMN.storey_height.powi(2);
    r.close("co-rotational column: extrapolated coefficient", Ratio::from_ratio(limit), Ratio::from_ratio(exact - shortening / 2.0), Ratio::from_ratio(shortening / 2.0 + last.abs()));
    agree("co-rotational column vs Timoshenko & Gere", Ok(r));
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
    fiber_pair_with(n_layers, |_| {})
}

fn fiber_pair_with(n_layers: usize, perturb: impl FnOnce(&mut AnalysisResults)) -> Result<Report, String> {
    let exact = rect_frame(layered_inertia(n_layers));
    let lin = solve_2d(&exact)?;
    let mut fib = fiber(&exact, n_layers)?;
    perturb(&mut fib);
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
    fiber_refinement_check(|v| v);
}

fn fiber_refinement_check(perturb: impl Fn(f64) -> f64) {
    let exact = solve_2d(&rect_frame(RECT_B * RECT_H.powi(3) / 12.0)).unwrap();
    let roof = plane_frame(&FrameSpec::two_storey()).roof[0];
    let ux_exact = exact.displacements.iter().find(|d| d.node_id == roof).unwrap().ux;
    let mut r = Report::new();
    let mut prev = None;
    for n in [4usize, 8, 16, 32] {
        let ux = fiber(&rect_frame(RECT_B * RECT_H.powi(3) / 12.0), n).unwrap().displacements.iter().find(|d| d.node_id == roof).unwrap().ux;
        let ux = perturb(ux);
        let err = (ux - ux_exact).abs() / ux_exact.abs();
        let predicted = 1.0 / ((n * n) as f64 - 1.0);
        if !(err <= predicted) {
            r.fail(format!("{n} layers: sway error {err:.3e} above the bending-only 1/(n²−1) = {predicted:.3e}"));
        }
        if let Some(p) = prev {
            let ratio: f64 = p / err;
            r.close(&format!("{n} layers: error ratio on halving the layer depth"), Ratio::from_ratio(ratio), Ratio::from_ratio(4.0), Ratio::from_ratio(0.25));
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
        agree(&format!("P-delta, frame {seed} {spec:?}"), pdelta_converges_to_linear(&s));
        agree(&format!("co-rotational, frame {seed} {spec:?}"), corotational_departs_at_first_order(&s));
    }
}

#[test]
fn seeded_failure_nonlinear_stiffness_terms() {
    let s = sway_frame();
    pdelta_converges_to_linear(&s).unwrap().into_result().unwrap();
    corotational_departs_at_first_order(&s).unwrap().into_result().unwrap();
    let p = pdelta_converges_to_linear_with(&s, &solve_2d).unwrap().into_result();
    let c = corotational_departs_at_first_order_with(&s, &solve_2d).unwrap().into_result();
    assert!(p.is_err(), "dropping geometric stiffness escaped the P-delta check");
    assert!(c.is_err(), "dropping geometric stiffness escaped the corotational check");
}

#[test]
fn seeded_failure_fiber_unit_factor() {
    fiber_pair(4).unwrap().into_result().unwrap();
    for field in 0..3 {
        let result = fiber_pair_with(4, |r| {
            for d in &mut r.displacements {
                match field { 0 => d.ux *= 1000.0, 1 => d.uz *= 1000.0, _ => d.ry *= 1000.0 }
            }
        }).unwrap().into_result();
        assert!(result.is_err(), "fiber field {field} accepted the wrong unit factor");
    }
}

#[test]
fn seeded_failure_column_and_fiber_refinement() {
    pdelta_column_matches_the_exact_amplification();
    rejects_seeded(|| pdelta_column_matches_the_exact_amplification_check(&solve_2d));
    corotational_column_converges_on_the_exact_amplification();
    rejects_seeded(|| corotational_column_converges_on_the_exact_amplification_check(&solve_2d));
    fiber_layer_refinement_converges_on_the_exact_section();
    rejects_seeded(|| fiber_refinement_check(|v| -v));
}
