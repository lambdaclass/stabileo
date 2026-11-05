use crate::models::*;
use crate::support::*;
use dedaliano_engine::linalg::{cholesky_solve, jacobi_eigen, lu_solve, solve_generalized_eigen};
use dedaliano_engine::solver::assembly::{assemble_2d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::harmonic::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::mass_matrix::{assemble_mass_matrix_2d, assemble_mass_matrix_3d};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

/// The free-DOF stiffness, mass and load of a model without constraints, inclined
/// supports or artificial stiffness, assembled densely: the direct path's own system.
struct Dense {
    k: Vec<f64>,
    m: Vec<f64>,
    f: Vec<f64>,
    n: usize,
    target: usize,
}

fn free_block(full: &[f64], n_total: usize, nf: usize) -> Vec<f64> {
    (0..nf).flat_map(|i| (0..nf).map(move |j| full[i * n_total + j])).collect()
}

fn dense_2d(h: &HarmonicInput) -> Result<Dense, String> {
    let dof = DofNumbering::build_2d(&h.solver);
    let asm = assemble_2d(&h.solver, &dof);
    if !asm.artificial_dofs.is_empty() || !asm.inclined_transforms_2d.is_empty() {
        return Err("the direct reference handles neither artificial stiffness nor inclined supports".into());
    }
    let local = match h.response_dof.as_str() {
        "x" => 0,
        "y" => 1,
        "rz" => 2,
        d => return Err(format!("dof {d}")),
    };
    let (n, nt) = (dof.n_free, dof.n_total);
    let m = assemble_mass_matrix_2d(&h.solver, &dof, &h.densities);
    Ok(Dense { k: free_block(&asm.k, nt, n), m: free_block(&m, nt, n), f: asm.f[..n].to_vec(), n, target: dof.map[&(h.response_node_id, local)] })
}

fn dense_3d(h: &HarmonicInput3D) -> Result<Dense, String> {
    let dof = DofNumbering::build_3d(&h.solver);
    let asm = assemble_3d(&h.solver, &dof);
    if !asm.artificial_dofs.is_empty() || !asm.inclined_transforms.is_empty() {
        return Err("the direct reference handles neither artificial stiffness nor inclined supports".into());
    }
    let local = ["x", "y", "z", "rx", "ry", "rz"].iter().position(|d| *d == h.response_dof).ok_or("dof")?;
    let (n, nt) = (dof.n_free, dof.n_total);
    let m = assemble_mass_matrix_3d(&h.solver, &dof, &h.densities);
    Ok(Dense { k: free_block(&asm.k, nt, n), m: free_block(&m, nt, n), f: asm.f[..n].to_vec(), n, target: dof.map[&(h.response_node_id, local)] })
}

/// `(K − ω²M + iωC) u = f` with `C = a₀M + a₁K`, by LU of the real 2n×2n form: the
/// target's real and imaginary parts and the largest |uᵢ| of the whole solution.
fn direct(d: &Dense, (a0, a1): (f64, f64), omega: f64) -> Result<(Length, Length, Length), String> {
    let n = d.n;
    let n2 = 2 * n;
    let mut a = vec![0.0; n2 * n2];
    for i in 0..n {
        for j in 0..n {
            let (k, m) = (d.k[i * n + j], d.m[i * n + j]);
            let kd = k - omega * omega * m;
            let wc = omega * (a0 * m + a1 * k);
            a[i * n2 + j] = kd;
            a[i * n2 + n + j] = -wc;
            a[(n + i) * n2 + j] = wc;
            a[(n + i) * n2 + n + j] = kd;
        }
    }
    let mut rhs = vec![0.0; n2];
    rhs[..n].copy_from_slice(&d.f);
    let u = lu_solve(&mut a, &mut rhs, n2).ok_or("singular dynamic stiffness")?;
    let umax = (0..n).map(|i| u[i].hypot(u[n + i])).fold(0.0, f64::max);
    Ok((Length::from_m(u[d.target]), Length::from_m(u[n + d.target]), Length::from_m(umax)))
}

/// The exact spectrum of the free system (Jacobi, independent of the engine's
/// Lanczos) with each mode's contribution `pⱼ = φⱼₜ φⱼᵀf` (mass-normalised) to the
/// target, and κ(K).
struct Spectrum {
    lambda: Vec<f64>,
    p: Vec<f64>,
    condition: f64,
}

fn spectrum(d: &Dense) -> Result<Spectrum, String> {
    let n = d.n;
    let eig = solve_generalized_eigen(&d.k, &d.m, n, 200).ok_or("Jacobi eigensolve failed")?;
    if eig.values.len() != n || eig.values.iter().any(|l| !(l.is_finite() && *l > 0.0)) {
        return Err("the reference needs a definite K and M".into());
    }
    let p = (0..n)
        .map(|j| {
            let phi = |i: usize| eig.vectors[i * n + j];
            phi(d.target) * (0..n).map(|i| phi(i) * d.f[i]).sum::<f64>()
        })
        .collect();
    let ks = jacobi_eigen(&d.k, n, 200).values;
    Ok(Spectrum { lambda: eig.values, p, condition: ks.last().unwrap() / ks.first().unwrap() })
}

fn cabs(re: f64, im: f64) -> f64 {
    re.hypot(im)
}

/// With Rayleigh damping each mode is decoupled: `uₜ = Σⱼ pⱼ / (λⱼd − z)`,
/// `z = ω² − i a₀ω`, `d = 1 + i a₁ω`. Two allowances, each in metres at the target:
///
/// - round-off: a backward-stable solve is good to ~κ(K)·ε of the whole solution,
///   and a response that cancels large modal terms (a DOF symmetry holds at zero)
///   only to that of the terms: `64 κ ε max(‖u‖∞, Σ|pⱼ/(λⱼd − z)|)`, 64 ≈ 2n here;
/// - truncation: the modal path sums the kept modes exactly and represents the
///   omitted ones by `1/(λd) + z/(λd)²` (static correction and its first dynamic
///   term) where `q = |z|/(λ_{p+1}|d|) < ½`; the rest is `Σ_omit pⱼ z²/((λⱼd)²(λⱼd − z))`,
///   bounded by the sum of its terms' magnitudes. Where `q ≥ ½` the engine applies no
///   correction and has no bound (it only warns), so the exact answer is required.
fn allowances(sp: &Spectrum, modes_used: usize, omega: f64, (a0, a1): (f64, f64), corrected: bool, umax: Length) -> (Length, Length, f64) {
    let (zr, zi) = (omega * omega, -a0 * omega);
    let (dr, di) = (1.0, a1 * omega);
    let mut modal_sum = 0.0;
    let mut remainder = 0.0;
    for (j, (&l, &p)) in sp.lambda.iter().zip(&sp.p).enumerate() {
        let den = cabs(l * dr - zr, l * di - zi);
        modal_sum += p.abs() / den;
        if j >= modes_used {
            remainder += p.abs() * cabs(zr, zi).powi(2) / ((l * cabs(dr, di)).powi(2) * den);
        }
    }
    let q = sp.lambda.get(modes_used).map_or(0.0, |l| cabs(zr, zi) / (l * cabs(dr, di)));
    let truncation = if corrected && q < 0.5 { remainder } else { 0.0 };
    (Length::from_m(64.0 * sp.condition * f64::EPSILON * modal_sum.max(umax.in_m())), Length::from_m(truncation), q)
}

fn compare(d: &Dense, res: &HarmonicResult, damping: (f64, f64)) -> Result<Report, String> {
    let sp = spectrum(d)?;
    let corrected = res.method == "modal+static";
    let mut r = Report::new();
    for pt in &res.response_points {
        let (re, im, umax) = direct(d, damping, pt.omega)?;
        let (floor, truncation, q) = allowances(&sp, res.modes_used, pt.omega, damping, corrected, umax);
        let tol = floor + truncation;
        let uncorrected = if corrected && q < 0.5 { "" } else { ", uncorrected" };
        let at = format!("{:.4} Hz ({}, {} of {} modes, q = {q:.2}{uncorrected})", pt.frequency, res.method, res.modes_used, d.n);
        r.close(&format!("Re u at {at}"), Length::from_m(pt.real), re, tol);
        r.close(&format!("Im u at {at}"), Length::from_m(pt.imag), im, tol);
    }
    Ok(r)
}

/// The decoupled modal sum over the exact spectrum is a second reference: it must
/// equal the direct complex solve before either is used to judge the engine.
#[test]
fn reference_paths_agree_on_the_frames() {
    let spec = FrameSpec::two_storey();
    let s = frame_2d(&spec);
    let roof = plane_frame(&spec).roof[0];
    let h = HarmonicInput { solver: s, densities: steel_densities(), frequencies: vec![0.0], damping_ratio: 0.05, response_node_id: roof, response_dof: "x".into() };
    let d = dense_2d(&h).unwrap();
    let sp = spectrum(&d).unwrap();
    let damping = (0.3, 2e-4);
    let mut r = Report::new();
    for f in [0.0, 1.0, 3.0, 10.0, 60.0, 400.0] {
        let w = 2.0 * PI * f;
        let (re, im, umax) = direct(&d, damping, w).unwrap();
        let (mut sr, mut si) = (0.0, 0.0);
        for (&l, &p) in sp.lambda.iter().zip(&sp.p) {
            let (ar, ai) = (l - w * w, w * (damping.0 + damping.1 * l));
            let m2 = ar * ar + ai * ai;
            sr += p * ar / m2;
            si -= p * ai / m2;
        }
        let (floor, _, _) = allowances(&sp, d.n, w, damping, false, umax);
        r.close(&format!("Re at {f} Hz"), Length::from_m(sr), re, floor);
        r.close(&format!("Im at {f} Hz"), Length::from_m(si), im, floor);
    }
    agree("exact modal sum vs direct complex solve", Ok(r));
}

fn sweep(f_max_hz: f64, n: usize) -> Vec<f64> {
    (0..=n).map(|i| f_max_hz * i as f64 / n as f64).collect()
}

pub fn harmonic_2d(solver: SolverInput, node: usize, dof: &str, frequencies: Vec<f64>) -> Result<Report, String> {
    let h = HarmonicInput {
        solver,
        densities: steel_densities(),
        frequencies,
        damping_ratio: 0.05,
        response_node_id: node,
        response_dof: dof.into(),
    };
    let (res, damping) = solve_harmonic_2d_with_damping(&h)?;
    compare(&dense_2d(&h)?, &res, damping)
}

pub fn harmonic_3d(solver: SolverInput3D, densities: HashMap<String, f64>, node: usize, dof: &str, frequencies: Vec<f64>) -> Result<Report, String> {
    let h = HarmonicInput3D {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.05,
        response_node_id: node,
        response_dof: dof.into(),
    };
    let (res, damping) = solve_harmonic_3d_with_damping(&h)?;
    compare(&dense_3d(&h)?, &res, damping)
}

fn fundamental_hz_2d(s: &SolverInput) -> f64 {
    dedaliano_engine::solver::modal::solve_modal_2d(s, &steel_densities(), 1).unwrap().modes[0].frequency
}

fn fundamental_hz_3d(s: &SolverInput3D, densities: &HashMap<String, f64>) -> f64 {
    dedaliano_engine::solver::modal::solve_modal_3d(s, densities, 1).unwrap().modes[0].frequency
}

#[test]
fn harmonic_2d_modal_matches_direct_complex_solve() {
    let s = frame_2d(&FrameSpec::two_storey());
    let roof = *plane_frame(&FrameSpec::two_storey()).roof.first().unwrap();
    let f1 = fundamental_hz_2d(&s);
    for dof in ["x", "y", "rz"] {
        agree(&format!("2D harmonic, roof {dof}"), harmonic_2d(s.clone(), roof, dof, sweep(4.0 * f1, 60)));
    }
}

#[test]
fn harmonic_3d_modal_matches_direct_complex_solve() {
    let spec = FrameSpec { subdivisions: 1, ..FrameSpec::two_storey() };
    let s = space_frame_3d(&spec, 5.0);
    let roof = *plane_frame(&spec).roof.first().unwrap();
    let f1 = fundamental_hz_3d(&s, &steel_densities());
    for dof in ["x", "y", "z"] {
        agree(&format!("3D harmonic, roof {dof}"), harmonic_3d(s.clone(), steel_densities(), roof, dof, sweep(4.0 * f1, 60)));
    }
}

fn issue_1371_model() -> (SolverInput3D, HashMap<String, f64>) {
    let s: SolverInput3D = serde_json::from_str(include_str!("issue_1371.json")).unwrap();
    let d = s.materials.keys().map(|k| (k.clone(), STEEL_DENSITY_KG_M3)).collect();
    (s, d)
}

/// #1371's frame as the nightly metamorphic run solves it: 7850 kg/m³, 5% damping,
/// 0, 0.7 and 2.3 Hz, response at node 4.
#[test]
fn harmonic_3d_issue_1371_frame_modal_matches_direct() {
    let (s, d) = issue_1371_model();
    let outcome = ["x", "y", "z"].iter().try_fold(Report::new(), |mut r, dof| {
        r.merge(&format!("node 4 {dof}"), harmonic_3d(s.clone(), d.clone(), 4, dof, vec![0.0, 0.7, 2.3])?);
        Ok(r)
    });
    agree("3D harmonic modal vs direct, #1371 frame", outcome);
}

/// Forcing frequencies around the first mode the engine omits: below the first,
/// between the last it computes and the next, just above and well above that one.
/// A probe at a frequency above the whole spectrum reports how many it computes.
fn around_the_first_omitted_mode(d: &Dense, kept: usize) -> Result<Vec<f64>, String> {
    if kept == 0 || kept >= d.n {
        return Err(format!("the engine computed {kept} of {} modes", d.n));
    }
    let eig = solve_generalized_eigen(&d.k, &d.m, d.n, 200).ok_or("Jacobi eigensolve failed")?;
    let f = |j: usize| eig.values[j].sqrt() / (2.0 * PI);
    Ok(vec![0.5 * f(0), 0.5 * (f(kept - 1) + f(kept)), f(kept) * 1.01, 1.5 * f(kept)])
}

/// Near and above the first omitted mode, on a well-conditioned frame, the engine
/// sums the kept modes alone and only warns.
fn above_the_kept_modes_2d() -> Result<Report, String> {
    let spec = FrameSpec::two_storey();
    let roof = plane_frame(&spec).roof[0];
    let h = HarmonicInput { solver: frame_2d(&spec), densities: steel_densities(), frequencies: vec![0.0], damping_ratio: 0.05, response_node_id: roof, response_dof: "x".into() };
    let kept = solve_harmonic_2d(&HarmonicInput { frequencies: vec![1e6], ..h.clone() })?.modes_used;
    let freqs = around_the_first_omitted_mode(&dense_2d(&h)?, kept)?;
    harmonic_2d(h.solver, roof, "x", freqs)
}

fn above_the_kept_modes_3d() -> Result<Report, String> {
    let spec = FrameSpec { subdivisions: 1, ..FrameSpec::two_storey() };
    let roof = plane_frame(&spec).roof[0];
    let h = HarmonicInput3D { solver: space_frame_3d(&spec, 5.0), densities: steel_densities(), frequencies: vec![0.0], damping_ratio: 0.05, response_node_id: roof, response_dof: "x".into() };
    let kept = solve_harmonic_3d(&HarmonicInput3D { frequencies: vec![1e6], ..h.clone() })?.modes_used;
    let freqs = around_the_first_omitted_mode(&dense_3d(&h)?, kept)?;
    harmonic_3d(h.solver, steel_densities(), roof, "x", freqs)
}

#[test]
fn harmonic_2d_above_the_kept_modes_matches_direct() {
    agree("2D harmonic above the kept modes vs direct", above_the_kept_modes_2d());
}

#[test]
fn harmonic_3d_above_the_kept_modes_matches_direct() {
    agree("3D harmonic above the kept modes vs direct", above_the_kept_modes_3d());
}

/// At ω = 0 the kept modes plus the static correction are `K⁻¹f` algebraically, so
/// the amplitude is the static displacement to round-off (κ(K) < 1e7 on these frames).
#[test]
fn harmonic_at_zero_frequency_is_the_static_solution() {
    let spec = FrameSpec::two_storey();
    let s = frame_2d(&spec);
    let roof = plane_frame(&spec).roof[0];
    let stat = solve_2d(&s).unwrap();
    let u = stat.displacements.iter().find(|d| d.node_id == roof).unwrap();
    let mut r = Report::new();
    for (dof, want) in [("x", u.ux), ("y", u.uz)] {
        let h = HarmonicInput { solver: s.clone(), densities: steel_densities(), frequencies: vec![0.0], damping_ratio: 0.05, response_node_id: roof, response_dof: dof.into() };
        let got = solve_harmonic_2d(&h).unwrap().response_points[0].real;
        r.close(&format!("2D roof {dof}"), Length::from_m(got), Length::from_m(want), Length::from_m(1e-9 * u.ux.abs().max(u.uz.abs())));
    }
    let s3 = space_frame_3d(&FrameSpec { subdivisions: 1, ..spec }, 5.0);
    let stat = solve_3d(&s3).unwrap();
    let u = stat.displacements.iter().find(|d| d.node_id == roof).unwrap();
    let scale = u.ux.abs().max(u.uy.abs()).max(u.uz.abs());
    for (dof, want) in [("x", u.ux), ("y", u.uy), ("z", u.uz)] {
        let h = HarmonicInput3D { solver: s3.clone(), densities: steel_densities(), frequencies: vec![0.0], damping_ratio: 0.05, response_node_id: roof, response_dof: dof.into() };
        let got = solve_harmonic_3d(&h).unwrap().response_points[0].real;
        r.close(&format!("3D roof {dof}"), Length::from_m(got), Length::from_m(want), Length::from_m(1e-9 * scale));
    }
    agree("harmonic at 0 Hz vs linear static", Ok(r));
}

/// The family's sweeps stop at 0.6 of the first mode the engine omits (q ≈ 0.36),
/// where it claims a bounded truncation; above it is #1434.
fn family_sweep(d: &Dense, computed: usize, f_max: f64) -> Result<Vec<f64>, String> {
    let eig = solve_generalized_eigen(&d.k, &d.m, d.n, 200).ok_or("Jacobi eigensolve failed")?;
    let f_omit = eig.values.get(computed).map_or(f64::INFINITY, |l| l.sqrt() / (2.0 * PI));
    Ok(sweep(f_max.min(0.6 * f_omit), 40))
}

#[test]
#[ignore = "nightly: make test.engine.differential.full"]
fn harmonic_modal_matches_direct_on_frame_family() {
    for seed in 0..24 {
        let spec = FrameSpec::variant(seed);
        let roof = plane_frame(&spec).roof[0];
        let h = HarmonicInput { solver: frame_2d(&spec), densities: steel_densities(), frequencies: vec![1e6], damping_ratio: 0.05, response_node_id: roof, response_dof: "x".into() };
        let computed = solve_harmonic_2d(&h).unwrap().modes_used;
        let freqs = family_sweep(&dense_2d(&h).unwrap(), computed, 5.0 * fundamental_hz_2d(&h.solver)).unwrap();
        agree(&format!("2D harmonic, frame {seed} {spec:?}"), harmonic_2d(h.solver, roof, "x", freqs));
        let s3 = space_frame_3d(&FrameSpec { subdivisions: 1, ..spec }, 4.0 + spec.bay_width / 2.0);
        for dof in ["x", "y"] {
            let h = HarmonicInput3D { solver: s3.clone(), densities: steel_densities(), frequencies: vec![1e6], damping_ratio: 0.05, response_node_id: roof, response_dof: dof.into() };
            let computed = solve_harmonic_3d(&h).unwrap().modes_used;
            let freqs = family_sweep(&dense_3d(&h).unwrap(), computed, 5.0 * fundamental_hz_3d(&s3, &steel_densities())).unwrap();
            agree(&format!("3D harmonic {dof}, frame {seed} {spec:?}"), harmonic_3d(s3.clone(), steel_densities(), roof, dof, freqs));
        }
    }
}

/// A load ramped over `t_r` and then held. Mode j leaves its static share by at
/// most `2/(ωⱼ t_r)` and, once the load is held, decays as `e^{−ξⱼωⱼt}` (Chopra
/// §4.4); Rayleigh damping anchored on the first two modes keeps every ξⱼ above
/// half the target while ω₂/ω₁ < 13, as on this frame. Newmark's average acceleration does not damp modes with
/// `ωⱼΔt > 2`, but the ramp leaves them at most `Δt/t_r` of their share. Summed
/// over the modes, the shares at DOF i are bounded by `√((K⁻¹)ᵢᵢ · fᵀK⁻¹f)`
/// (Cauchy–Schwarz), and the held state is the exact static one.
fn quasi_static_bound(t1: f64, dt: f64, ramp: f64, hold: f64, xi: f64) -> f64 {
    let w1 = 2.0 * PI / t1;
    2.0 / (w1 * ramp) * (-0.5 * xi * w1 * hold).exp() + dt / ramp
}

#[test]
fn time_history_slow_ramp_settles_on_the_static_solution() {
    use dedaliano_engine::solver::time_integration::solve_time_history_2d;
    let spec = FrameSpec::two_storey();
    let mut s = frame_2d(&spec);
    let loads: Vec<SolverNodalLoad> = s.loads.iter().map(|l| match l { SolverLoad::Nodal(n) => n.clone(), _ => unreachable!() }).collect();
    let dof = DofNumbering::build_2d(&s);
    let asm = assemble_2d(&s, &dof);
    let n = dof.n_free;
    let k = free_block(&asm.k, dof.n_total, n);
    let f = &asm.f[..n];
    let u = cholesky_solve(&mut k.clone(), f, n).unwrap();
    let work: f64 = u.iter().zip(f).map(|(a, b)| a * b).sum();
    let share = |node: usize, local: usize| -> Length {
        let i = dof.map[&(node, local)];
        let mut e = vec![0.0; n];
        e[i] = 1.0;
        Length::from_m((cholesky_solve(&mut k.clone(), &e, n).unwrap()[i] * work).sqrt())
    };
    s.loads.clear();
    let mut stat_input = s.clone();
    stat_input.loads = loads.iter().cloned().map(SolverLoad::Nodal).collect();
    let stat = solve_2d(&stat_input).unwrap();
    let t1 = 1.0 / fundamental_hz_2d(&s);
    let (ramp, hold, dt) = (20.0 * t1, 30.0 * t1, t1 / 100.0);
    let n_steps = ((ramp + hold) / dt).round() as usize;
    let xi = 0.05;
    let th = TimeHistoryInput {
        solver: s,
        densities: steel_densities(),
        time_step: dt,
        n_steps,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: Some(xi),
        ground_accel: None,
        ground_direction: None,
        force_history: Some(vec![
            TimeForceRecord { time: 0.0, loads: loads.iter().map(|l| SolverNodalLoad { fx: 0.0, fz: 0.0, my: 0.0, ..l.clone() }).collect() },
            TimeForceRecord { time: ramp, loads: loads.clone() },
            TimeForceRecord { time: ramp + hold + dt, loads: loads.clone() },
        ]),
    };
    let res = solve_time_history_2d(&th).unwrap();
    let rel = quasi_static_bound(t1, dt, ramp, hold, xi);
    let mut r = Report::new();
    for h in &res.node_histories {
        let st = stat.displacements.iter().find(|d| d.node_id == h.node_id).unwrap();
        for (local, name, got, want) in [(0, "ux", *h.ux.last().unwrap(), st.ux), (1, "uz", *h.uz.last().unwrap(), st.uz)] {
            if dof.map[&(h.node_id, local)] < n {
                r.close(&format!("node {} {name}", h.node_id), Length::from_m(got), Length::from_m(want), share(h.node_id, local) * rel);
            }
        }
    }
    agree("time history slow ramp vs static", Ok(r));
}

/// A pinned 8-element beam driven well above its kept modes: the modal residual stays
/// under the direct-solve threshold while the imaginary part is off by up to 60 %.
#[test]
fn harmonic_2d_beam_above_the_kept_modes_matches_direct() {
    let n = 8;
    let nodes = (0..=n).map(|i| (i + 1, i as f64 * 1.25, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let solver = crate::common::make_input(nodes, vec![(1, 200_000.0, 0.3)], vec![(1, 0.05, 1e-4)], elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -10.0, my: 0.0 })]);
    known_issue(1434, "2D beam harmonic above the kept modes vs direct", &[", uncorrected)"], harmonic_2d(solver, 4, "y", (1..=40).map(|i| i as f64 * 250.0).collect()));
}
