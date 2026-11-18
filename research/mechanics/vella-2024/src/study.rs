//! Every number the page, the README and the validation report use: static critical points
//! against mesh size and in the shallow limit, the bifurcation diagram with its spectra, rate
//! sweeps, sensitivity studies and the toy model.
use crate::dynamics::{simulate, Settings, Simulation, Trace};
use crate::model::{Assembler, Strip};
use crate::shallow;
use crate::spectrum::{spectrum, Spectrum};
use crate::statics::{critical, invert, natural, release, Critical, Equilibrium};
use crate::toy::Toy;
use crate::units::{EXPERIMENTS, SIMULATIONS};
use serde::Serialize;
use std::f64::consts::PI;
use std::sync::atomic::{AtomicUsize, Ordering};

pub const PAPER_ALPHA: f64 = PI / 12.0;
pub const START: f64 = 0.6;
pub const SEED: f64 = 1e-3;
pub const MESH: usize = 48;
pub const SHALLOW_ALPHA: f64 = 0.02;
pub const SHALLOW_SLENDERNESS: f64 = 2e4;
pub const RATES: [f64; 17] = [0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3, 0.5, 0.7];
pub const PHASES: usize = 12;
/// An amplification at or above this marks the snap as asymmetric (SUPUESTO).
pub const ASYMMETRIC: f64 = 2.0;

/// The page's default run: the paper's strip and clamp angle, both clamps moving apart, the
/// start state seeded with θ₀ = 10⁻³ rad of its lowest antisymmetric mode.
pub fn default_settings() -> Settings {
    Settings {
        alpha: PAPER_ALPHA,
        n: MESH,
        slenderness: SIMULATIONS.slenderness(),
        rate: 0.01,
        start: START,
        one_end: false,
        ramp: SIMULATIONS.ramp(0.01),
        imperfection: SEED,
        phase: 0.0,
        dt: 0.005,
        hht: -0.1,
        after: 1.0,
    }
}

/// The inverted start state at µ₀ and the two critical points of its branch.
pub fn prepare(strip: &Strip, start: f64) -> Result<(Equilibrium, Critical), String> {
    let a2 = strip.alpha * strip.alpha;
    let up = natural(strip, start * a2)?;
    let (_, down) = invert(strip, &up, false)?;
    let (c, _) = critical(strip, &down)?;
    Ok((down, c))
}

#[derive(Clone, Debug, Serialize)]
pub struct MeshPoint {
    pub n: usize,
    pub mu_a: f64,
    pub mu_star: f64,
    pub omega_antisymmetric: f64,
    pub omega_symmetric: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Extrapolated {
    pub value: f64,
    /// Observed order of convergence from the three finest meshes.
    pub order: f64,
    /// Difference between the extrapolated value and the finest mesh.
    pub correction: f64,
}

pub fn richardson(coarse: f64, medium: f64, fine: f64) -> Extrapolated {
    let order = ((medium - coarse) / (fine - medium)).abs().log2();
    let correction = (fine - medium) / (2f64.powf(order) - 1.0);
    Extrapolated { value: fine + correction, order, correction }
}

#[derive(Clone, Debug, Serialize)]
pub struct Convergence {
    pub alpha: f64,
    pub slenderness: f64,
    pub meshes: Vec<MeshPoint>,
    pub mu_a: Extrapolated,
    pub mu_star: Extrapolated,
    pub omega: Extrapolated,
}

pub fn convergence(alpha: f64, slenderness: f64, meshes: &[usize]) -> Result<Convergence, String> {
    let mut points = vec![];
    for &n in meshes {
        let strip = Strip { n, alpha, slenderness };
        let (_, c) = prepare(&strip, START)?;
        let quarter = natural(&strip, 0.25 * alpha * alpha)?;
        let s = spectrum(&strip, &mut Assembler::new(&strip), &quarter.q);
        points.push(MeshPoint { n, mu_a: c.mu_a, mu_star: c.mu_star, omega_antisymmetric: s.omega2_antisymmetric.sqrt(), omega_symmetric: s.omega2_symmetric.sqrt() });
    }
    let k = points.len();
    let r = |f: &dyn Fn(&MeshPoint) -> f64| richardson(f(&points[k - 3]), f(&points[k - 2]), f(&points[k - 1]));
    Ok(Convergence {
        alpha,
        slenderness,
        mu_a: r(&|p| p.mu_a),
        mu_star: r(&|p| p.mu_star),
        omega: r(&|p| p.omega_antisymmetric),
        meshes: points,
    })
}

#[derive(Clone, Debug, Serialize)]
pub struct BranchPoint {
    pub mu: f64,
    /// Midpoint height over αL.
    pub height: f64,
    pub spectrum: Spectrum,
}

#[derive(Clone, Debug, Serialize)]
pub struct Diagram {
    pub alpha: f64,
    pub n: usize,
    pub natural: Vec<BranchPoint>,
    /// From the start state through µ_A and the fold onto the unstable symmetric branch.
    pub inverted: Vec<BranchPoint>,
    /// Midpoint load (EI/L²) and height (αL) along the production arc-length path from the
    /// natural to the inverted state at µ₀.
    pub load_path: Vec<[f64; 2]>,
    pub critical: Critical,
    /// The shallow theory's branches, h/(αL) against µ (Eqs. S14–S15), and the height of its
    /// asymmetric branch.
    pub shallow_natural: Vec<[f64; 2]>,
    pub shallow_inverted: Vec<[f64; 2]>,
    pub shallow_asymmetric_height: f64,
}

fn branch(strip: &Strip, path: &crate::statics::Path) -> Vec<BranchPoint> {
    let a2 = strip.alpha * strip.alpha;
    path.points.iter().map(|p| BranchPoint { mu: p.shortening / a2, height: p.height / strip.alpha, spectrum: p.spectrum.clone() }).collect()
}

/// The path up to where, past its fold, µ starts to fall again: arc-length can turn back there and
/// retrace the unstable branch.
fn until_turn(points: Vec<BranchPoint>) -> Vec<BranchPoint> {
    let fold = (1..points.len()).find(|&i| points[i].mu > points[i - 1].mu).unwrap_or(points.len());
    let turn = (fold + 1..points.len()).find(|&i| points[i].mu < points[i - 1].mu).unwrap_or(points.len());
    points.into_iter().take(turn).collect()
}

pub fn diagram(alpha: f64, n: usize) -> Result<Diagram, String> {
    let strip = Strip { n, alpha, slenderness: SIMULATIONS.slenderness() };
    let a2 = alpha * alpha;
    let up = natural(&strip, START * a2)?;
    let (load, down) = invert(&strip, &up, false).map_err(|e| format!("load path: {e}"))?;
    let (c, _) = critical(&strip, &down).map_err(|e| format!("critical: {e}"))?;
    let mut stop_low = |s: &Equilibrium| s.clamps.shortening() < 0.18 * a2;
    let natural_path = release(&strip, &up, 0.03 * alpha, 0.03 * alpha, 400, &mut stop_low, true).map_err(|e| format!("natural branch: {e}"))?;
    let mut least = f64::MAX;
    let mut stop_back = |s: &Equilibrium| {
        least = least.min(s.clamps.shortening());
        s.clamps.shortening() > START * a2
    };
    let inverted_path = release(&strip, &down, 0.03 * alpha, 0.03 * alpha, 600, &mut stop_back, true).map_err(|e| format!("inverted branch: {e}"))?;
    let tau_star = shallow::tau_asymmetric();
    let curve = |from: f64, to: f64| -> Vec<[f64; 2]> {
        (0..=200)
            .map(|i| from + (to - from) * i as f64 / 200.0)
            .map(|t| [shallow::mu(t), shallow::height(t)])
            .filter(|p| p[0] <= START + 1e-9)
            .collect()
    };
    Ok(Diagram {
        alpha,
        n,
        natural: branch(&strip, &natural_path),
        inverted: until_turn(branch(&strip, &inverted_path)),
        load_path: load.points.iter().map(|p| [p.load, p.height / alpha]).collect(),
        critical: c,
        shallow_natural: curve(1e-3, 2.0 * PI - 0.35),
        shallow_inverted: curve(2.0 * PI + 0.25, 4.0 * PI - 0.6),
        shallow_asymmetric_height: shallow::height(tau_star),
    })
}

#[derive(Clone, Debug, Serialize)]
pub struct RatePoint {
    pub rate: f64,
    pub amplification: f64,
    pub amplification_from_mu_a: f64,
    /// Largest amplification over the seed's phase (seeded runs only).
    pub envelope: f64,
    pub t_snap: f64,
    pub mu_snap: f64,
    pub theta_before: f64,
    pub theta_during: f64,
}

fn rate_point(sim: &Simulation, envelope: f64) -> RatePoint {
    let o = &sim.outcome;
    RatePoint {
        rate: sim.settings.rate,
        amplification: o.amplification,
        amplification_from_mu_a: o.amplification_from_mu_a,
        envelope,
        t_snap: o.t_snap,
        mu_snap: o.mu_snap,
        theta_before: o.theta_before,
        theta_during: o.theta_during,
    }
}

static RUNS: AtomicUsize = AtomicUsize::new(0);
static TRUNCATED: AtomicUsize = AtomicUsize::new(0);

fn run(settings: &Settings, prepared: &(Equilibrium, Critical)) -> Result<Simulation, String> {
    let sim = simulate(settings, &prepared.0, prepared.1.mu_star, prepared.1.mu_a, &mut |_| false)?;
    RUNS.fetch_add(1, Ordering::Relaxed);
    if sim.outcome.truncated {
        TRUNCATED.fetch_add(1, Ordering::Relaxed);
    }
    Ok(sim)
}

/// The run at the seed's phase 0 and the largest amplification over PHASES phases.
fn envelope(settings: &Settings, prepared: &(Equilibrium, Critical)) -> Result<(Simulation, f64), String> {
    let first = run(settings, prepared)?;
    let mut best = first.outcome.amplification;
    for k in 1..PHASES {
        let s = Settings { phase: 2.0 * PI * k as f64 / PHASES as f64, ..*settings };
        best = best.max(run(&s, prepared)?.outcome.amplification);
    }
    Ok((first, best))
}

#[derive(Clone, Debug, Serialize)]
pub struct Sensitivity {
    pub parameter: String,
    pub value: f64,
    pub rate: f64,
    pub amplification: f64,
    /// Largest amplification over the seed's phase.
    pub envelope: f64,
    pub t_snap: f64,
    pub mu_snap: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Figure2a {
    pub rate_m_s: f64,
    pub rate: f64,
    /// −tΔL̇ in mm (zero at µ = µ*) and the binned midpoint angle.
    pub travel_mm: Vec<f64>,
    pub trace: Trace,
    pub amplification: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Dynamics {
    pub base: Settings,
    pub critical: Critical,
    pub seeded: Vec<RatePoint>,
    /// The paper's protocol: one clamp moved from ΔL/L = 0.2 with the experiments' 0.01 s
    /// acceleration, no seed.
    pub one_end_start: f64,
    pub one_end: Vec<RatePoint>,
    /// Both clamps, no seed: largest |θ| during the run.
    pub unseeded: Vec<[f64; 2]>,
    pub sensitivity: Vec<Sensitivity>,
    pub figure_2a: Vec<Figure2a>,
    /// Lowest rate at which the seeded amplification (phase 0, and its phase envelope) falls
    /// below ASYMMETRIC, interpolated on log µ̇.
    pub transition: f64,
    pub transition_envelope: f64,
    /// Dynamic runs in this study, and how many stopped early after their jump.
    pub runs: usize,
    pub truncated_runs: usize,
}

fn crossing(points: &[RatePoint], value: impl Fn(&RatePoint) -> f64) -> f64 {
    for w in points.windows(2) {
        let (a, b) = (value(&w[0]), value(&w[1]));
        if a >= ASYMMETRIC && b < ASYMMETRIC {
            let f = (a - ASYMMETRIC) / (a - b);
            return (w[0].rate.ln() + f * (w[1].rate.ln() - w[0].rate.ln())).exp();
        }
    }
    f64::NAN
}

pub fn dynamics() -> Result<Dynamics, String> {
    let base = default_settings();
    let strip = base.strip();
    let prepared = prepare(&strip, START)?;
    let mut seeded = vec![];
    for &rate in &RATES {
        let (first, best) = envelope(&Settings { rate, ..base }, &prepared)?;
        seeded.push(rate_point(&first, best));
    }
    let one_end_start = 0.2 / (PAPER_ALPHA * PAPER_ALPHA);
    let far = prepare(&strip, one_end_start)?;
    let mut one_end = vec![];
    for &rate in &RATES {
        let s = Settings { rate, start: one_end_start, one_end: true, imperfection: 0.0, ..base };
        one_end.push(rate_point(&run(&s, &far)?, f64::NAN));
    }
    let mut unseeded = vec![];
    for rate in [0.01, 0.03, 0.1, 0.3] {
        let sim = run(&Settings { rate, imperfection: 0.0, ..base }, &prepared)?;
        let worst = sim.trace.theta_max.iter().chain(&sim.trace.theta_min).fold(0.0f64, |m, v| m.max(v.abs()));
        unseeded.push([rate, worst]);
    }
    let mut sensitivity = vec![];
    let mut add = |parameter: &str, value: f64, (sim, envelope): &(Simulation, f64)| {
        sensitivity.push(Sensitivity {
            parameter: parameter.into(),
            value,
            rate: sim.settings.rate,
            amplification: sim.outcome.amplification,
            envelope: *envelope,
            t_snap: sim.outcome.t_snap,
            mu_snap: sim.outcome.mu_snap,
        })
    };
    for rate in [0.03, 0.1] {
        for dt in [0.02, 0.01, 0.005, 0.0025] {
            add("dt", dt, &envelope(&Settings { rate, dt, ..base }, &prepared)?);
        }
        for hht in [-0.05, -0.1, -0.2, -0.3] {
            add("hht", hht, &envelope(&Settings { rate, hht, ..base }, &prepared)?);
        }
        for seed in [1e-4, 3e-4, 1e-3, 3e-3, 1e-2] {
            add("imperfection", seed, &envelope(&Settings { rate, imperfection: seed, ..base }, &prepared)?);
        }
        for n in [24, 48, 96] {
            let s = Settings { rate, n, ..base };
            let p = if n == MESH { prepared.clone() } else { prepare(&s.strip(), START)? };
            add("n", n as f64, &envelope(&s, &p)?);
        }
        for start in [0.4, 0.6, 1.0, one_end_start] {
            let s = Settings { rate, start, ..base };
            let p = if start == START { prepared.clone() } else if start == one_end_start { far.clone() } else { prepare(&strip, start)? };
            add("start", start, &envelope(&s, &p)?);
        }
    }
    let mut figure_2a = vec![];
    let a2l_mm = PAPER_ALPHA * PAPER_ALPHA * SIMULATIONS.length * 1e3;
    for rate_m_s in [0.0018, 0.2466] {
        let rate = rate_m_s * SIMULATIONS.rate_factor(PAPER_ALPHA);
        let s = Settings { rate, start: one_end_start, one_end: true, imperfection: 0.0, ..base };
        let sim = run(&s, &far)?;
        figure_2a.push(Figure2a {
            rate_m_s,
            rate,
            travel_mm: sim.trace.mu.iter().map(|mu| (far.1.mu_star - mu) * a2l_mm).collect(),
            trace: sim.trace.clone(),
            amplification: sim.outcome.amplification,
        });
    }
    Ok(Dynamics {
        runs: RUNS.load(Ordering::Relaxed),
        truncated_runs: TRUNCATED.load(Ordering::Relaxed),
        transition: crossing(&seeded, |p| p.amplification),
        transition_envelope: crossing(&seeded, |p| p.envelope),
        base,
        critical: prepared.1.clone(),
        seeded,
        one_end_start,
        one_end,
        unseeded,
        sensitivity,
        figure_2a,
    })
}

#[derive(Clone, Debug, Serialize)]
pub struct ToyResults {
    pub toy: Toy,
    pub mu_star: f64,
    pub mu_a: f64,
    pub omega_symmetric: f64,
    pub omega_antisymmetric: f64,
    pub t_osc: f64,
    pub critical_rate: f64,
    /// A′ = max|ψ_A|/|ψ_A⁰| over 25 phases, ψ_A⁰ = 0.01 (as Fig. 4b and S7).
    pub amplification: Vec<[f64; 2]>,
}

pub fn toy() -> ToyResults {
    let t = Toy::paper();
    let (s, a) = t.frequencies(0.25);
    let amplification = [0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3]
        .iter()
        .map(|&r| [r, (0..25).map(|k| t.run(r, 0.01, 2.0 * PI * k as f64 / 25.0).1).fold(0.0, f64::max)])
        .collect();
    ToyResults { toy: t, mu_star: t.fold().0, mu_a: t.mu_a(), omega_symmetric: s, omega_antisymmetric: a, t_osc: t.t_osc(), critical_rate: t.critical_rate(), amplification }
}

#[derive(Clone, Debug, Serialize)]
pub struct Units {
    pub time_unit_simulations: f64,
    pub time_unit_experiments: f64,
    pub rate_factor_simulations: f64,
    pub rate_factor_experiments: f64,
    pub ramp: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Study {
    pub shallow_analytic: ShallowAnalytic,
    pub shallow: Convergence,
    pub paper: Convergence,
    pub diagram: Diagram,
    pub dynamics: Dynamics,
    pub toy: ToyResults,
    pub units: Units,
}

#[derive(Clone, Debug, Serialize)]
pub struct ShallowAnalytic {
    pub tau_asymmetric: f64,
    pub mu_a: f64,
    pub tau_fold: f64,
    pub mu_star: f64,
}

pub fn study() -> Result<Study, String> {
    let (tau_fold, mu_star) = shallow::fold();
    let tau = shallow::tau_asymmetric();
    Ok(Study {
        shallow_analytic: ShallowAnalytic { tau_asymmetric: tau, mu_a: shallow::mu(tau), tau_fold, mu_star },
        shallow: convergence(SHALLOW_ALPHA, SHALLOW_SLENDERNESS, &[24, 48, 96]).map_err(|e| format!("shallow mesh study: {e}"))?,
        paper: convergence(PAPER_ALPHA, SIMULATIONS.slenderness(), &[24, 48, 96]).map_err(|e| format!("paper mesh study: {e}"))?,
        diagram: diagram(PAPER_ALPHA, MESH).map_err(|e| format!("diagram: {e}"))?,
        dynamics: dynamics().map_err(|e| format!("dynamics: {e}"))?,
        toy: toy(),
        units: Units {
            time_unit_simulations: SIMULATIONS.time_unit(),
            time_unit_experiments: EXPERIMENTS.time_unit(),
            rate_factor_simulations: SIMULATIONS.rate_factor(PAPER_ALPHA),
            rate_factor_experiments: EXPERIMENTS.rate_factor(PAPER_ALPHA),
            ramp: SIMULATIONS.ramp(0.01),
        },
    })
}
