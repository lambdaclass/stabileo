//! Every number the page, the README and the validation report use: static critical points
//! against mesh size and in the shallow limit, the bifurcation diagram with its spectra, rate
//! sweeps, sensitivity studies and the toy model.
use crate::dynamics::{simulate, Settings, Simulation, Trace};
use crate::model::{Assembler, Strip};
use crate::shallow;
use crate::spectrum::{spectrum, Spectrum};
use crate::statics::{at_height, critical, invert, natural, Critical, Equilibrium, Free};
use crate::toy::Toy;
use crate::units::{EXPERIMENTS, SIMULATIONS};
use serde::Serialize;
use std::f64::consts::PI;


pub const PAPER_ALPHA: f64 = PI / 12.0;
pub const START: f64 = 0.6;
pub const SEED: f64 = 1e-3;
pub const MESH: usize = 48;
pub const SHALLOW_ALPHA: f64 = 0.02;
pub const SHALLOW_SLENDERNESS: f64 = 2e4;
pub const RATES: [f64; 17] = [0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3, 0.5, 0.7];
pub const PHASES: usize = 12;
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

pub fn richardson(coarse: f64, medium: f64, fine: f64) -> Option<Extrapolated> {
    let ratio = (medium - coarse) / (fine - medium);
    if !ratio.is_finite() || ratio <= 1.0 { return None; }
    let order = ratio.log2();
    let correction = (fine - medium) / (2f64.powf(order) - 1.0);
    (fine + correction).is_finite().then_some(Extrapolated { value: fine + correction, order, correction })
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
    let k = meshes.len();
    if k < 3 || !meshes[k - 3..].windows(2).all(|w| w[0].checked_mul(2) == Some(w[1])) {
        return Err("Richardson requires three successively doubled meshes".into());
    }
    let mut points = vec![];
    for &n in meshes {
        let strip = Strip { n, alpha, slenderness };
        let (_, c) = prepare(&strip, START)?;
        let quarter = natural(&strip, 0.25 * alpha * alpha)?;
        let s = spectrum(&strip, &mut Assembler::new(&strip), &quarter.q);
        points.push(MeshPoint { n, mu_a: c.mu_a, mu_star: c.mu_star, omega_antisymmetric: s.omega2_antisymmetric.sqrt(), omega_symmetric: s.omega2_symmetric.sqrt() });
    }
    let r = |f: &dyn Fn(&MeshPoint) -> f64| richardson(f(&points[k - 3]), f(&points[k - 2]), f(&points[k - 1])).ok_or("mesh differences do not support Richardson extrapolation");
    Ok(Convergence {
        alpha,
        slenderness,
        mu_a: r(&|p| p.mu_a)?,
        mu_star: r(&|p| p.mu_star)?,
        omega: r(&|p| p.omega_antisymmetric)?,
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
    /// Midpoint load (EI/L²) and height (αL) at µ₀, the midpoint pushed at fixed heights from
    /// the natural to the inverted state.
    pub load_path: Vec<[f64; 2]>,
    pub critical: Critical,
    /// The shallow theory's branches, h/(αL) against µ (Eqs. S14–S15), and the height of its
    /// asymmetric branch.
    pub shallow_natural: Vec<[f64; 2]>,
    pub shallow_inverted: Vec<[f64; 2]>,
    pub shallow_asymmetric_height: f64,
}

/// Heights are fixed in advance: an adaptive arc-length step sequence follows Newton iteration
/// counts, which round-off changes between platforms.
fn by_height(strip: &Strip, from: &Equilibrium, step: f64, free: Free, steps: usize, stop: &dyn Fn(&Equilibrium) -> bool) -> Result<Vec<Equilibrium>, String> {
    let mut assembler = Assembler::new(strip);
    let h0 = from.height(strip);
    let mut states = vec![from.clone()];
    for k in 1..=steps {
        let next = at_height(strip, &mut assembler, states.last().unwrap(), h0 + k as f64 * step * strip.alpha, free)?;
        let done = stop(&next);
        states.push(next);
        if done {
            return Ok(states);
        }
    }
    Err(format!("no stop after {steps} height steps"))
}

fn branch(strip: &Strip, states: &[Equilibrium]) -> Vec<BranchPoint> {
    let a2 = strip.alpha * strip.alpha;
    let mut assembler = Assembler::new(strip);
    states.iter().map(|s| BranchPoint { mu: s.clamps.shortening() / a2, height: s.height(strip) / strip.alpha, spectrum: spectrum(strip, &mut assembler, &s.q) }).collect()
}

pub const BRANCH_STEP: f64 = 0.002;
pub const LOAD_STEP: f64 = 0.01;

pub fn diagram(alpha: f64, n: usize) -> Result<Diagram, String> {
    let strip = Strip { n, alpha, slenderness: SIMULATIONS.slenderness() };
    let a2 = alpha * alpha;
    let up = natural(&strip, START * a2)?;
    let (_, down) = invert(&strip, &up, false).map_err(|e| format!("inversion: {e}"))?;
    let (c, _) = critical(&strip, &down).map_err(|e| format!("critical: {e}"))?;
    let natural_path = by_height(&strip, &up, -BRANCH_STEP, Free::Shortening, 400, &|s| s.clamps.shortening() < 0.18 * a2).map_err(|e| format!("natural branch: {e}"))?;
    let mut inverted_path = by_height(&strip, &down, BRANCH_STEP, Free::Shortening, 400, &|s| s.clamps.shortening() > START * a2).map_err(|e| format!("inverted branch: {e}"))?;
    inverted_path.pop();
    let target = down.height(&strip);
    let mut load_path = by_height(&strip, &up, -LOAD_STEP, Free::Load, 400, &|s| s.height(&strip) - LOAD_STEP * alpha < target).map_err(|e| format!("load path: {e}"))?;
    load_path.push(down.clone());
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
        inverted: branch(&strip, &inverted_path),
        load_path: load_path.iter().map(|s| [s.clamps.load, s.height(&strip) / alpha]).collect(),
        critical: c,
        shallow_natural: curve(1e-3, 2.0 * PI - 0.35),
        shallow_inverted: curve(2.0 * PI + 0.25, 4.0 * PI - 0.6),
        shallow_asymmetric_height: shallow::height(tau_star),
    })
}

#[derive(Clone, Debug, Serialize)]
pub struct RatePoint {
    pub truncated: bool,
    pub rate: f64,
    pub amplification: f64,
    pub amplification_from_mu_a: f64,
    /// Largest amplification over the seed's phase (seeded runs only).
    pub envelope: Option<f64>,
    pub t_snap: f64,
    pub mu_snap: f64,
    pub theta_before: f64,
    pub theta_during: f64,
}

fn rate_point(sim: &Simulation, envelope: Option<f64>, truncated: bool) -> Result<RatePoint, String> {
    let j = sim.outcome.jump()?;
    Ok(RatePoint {
        truncated,
        rate: sim.settings.rate,
        amplification: j.amplification,
        amplification_from_mu_a: j.amplification_from_mu_a,
        envelope,
        t_snap: j.t_snap,
        mu_snap: j.mu_snap,
        theta_before: sim.outcome.theta_before,
        theta_during: j.theta_during,
    })
}

#[derive(Default)]
struct Runs {
    count: usize,
    truncated: Vec<RunRecord>,
}

#[derive(Clone, Debug, Serialize)]
pub struct RunRecord {
    pub sweep: String,
    pub settings: Settings,
}

impl Runs {
    fn run(&mut self, sweep: &str, settings: &Settings, prepared: &(Equilibrium, Critical)) -> Result<Simulation, String> {
        let sim = simulate(settings, &prepared.0, prepared.1.mu_star, prepared.1.mu_a, &mut |_| false)?;
        if !sim.outcome.snapped { return Err(format!("no snap for {settings:?}")); }
        self.count += 1;
        if sim.outcome.truncated {
            self.truncated.push(RunRecord { sweep: sweep.into(), settings: *settings });
        }
        Ok(sim)
    }

    fn envelope(&mut self, sweep: &str, settings: &Settings, prepared: &(Equilibrium, Critical)) -> Result<(Simulation, f64, bool), String> {
        let prior = self.truncated.len();
        let first = self.run(sweep, settings, prepared)?;
        let mut best = first.outcome.jump()?.amplification;
        for k in 1..PHASES {
            let s = Settings { phase: 2.0 * PI * k as f64 / PHASES as f64, ..*settings };
            best = best.max(self.run(sweep, &s, prepared)?.outcome.jump()?.amplification);
        }
        Ok((first, best, self.truncated.len() != prior))
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Sensitivity {
    pub truncated: bool,
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
    pub truncated: bool,
    pub rate_m_s: f64,
    pub rate: f64,
    pub time_s: Vec<f64>,
    pub travel_mm: Vec<f64>,
    pub mu_star: f64,
    pub paper_mu: Vec<f64>,
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
    #[serde(rename = "first_downward_crossing_A2")]
    pub transition: f64,
    pub transition_envelope: f64,
    /// Dynamic runs in this study, and how many stopped early after their jump.
    pub runs: usize,
    pub truncated_runs: usize,
    pub truncated_settings: Vec<RunRecord>,
    pub unseeded_truncated: Vec<bool>,
}

pub fn first_downward_bracket(points: &[(f64, f64)]) -> Result<[(f64, f64); 2], String> {
    points.windows(2).find(|w| w[0].1 >= ASYMMETRIC && w[1].1 < ASYMMETRIC)
        .map(|w| [w[0], w[1]]).ok_or_else(|| "missing downward crossing of A = 2".into())
}

fn crossing(points: &[RatePoint], value: impl Fn(&RatePoint) -> f64) -> Result<f64, String> {
    let curve: Vec<_> = points.iter().map(|p| (p.rate, value(p))).collect();
    let [(r0, a), (r1, b)] = first_downward_bracket(&curve)?;
    let fraction = (a - ASYMMETRIC) / (a - b);
    Ok((r0.ln() + fraction * (r1.ln() - r0.ln())).exp())
}

pub fn dynamics() -> Result<Dynamics, String> {
    let mut runs = Runs::default();
    let base = default_settings();
    let strip = base.strip();
    let prepared = prepare(&strip, START)?;
    let mut seeded = vec![];
    for &rate in &RATES {
        let (first, best, truncated) = runs.envelope("seeded", &Settings { rate, ..base }, &prepared)?;
        seeded.push(rate_point(&first, Some(best), truncated)?);
    }
    let one_end_start = 0.2 / (PAPER_ALPHA * PAPER_ALPHA);
    let far = prepare(&strip, one_end_start)?;
    let mut one_end = vec![];
    for &rate in &RATES {
        let s = Settings { rate, start: one_end_start, one_end: true, imperfection: 0.0, ..base };
        let sim = runs.run("one_end", &s, &far)?;
        one_end.push(rate_point(&sim, None, sim.outcome.truncated)?);
    }
    let mut unseeded = vec![];
    let mut unseeded_truncated = vec![];
    for rate in [0.01, 0.03, 0.1, 0.3] {
        let sim = runs.run("unseeded", &Settings { rate, imperfection: 0.0, ..base }, &prepared)?;
        let worst = sim.trace.theta_max.iter().chain(&sim.trace.theta_min).fold(0.0f64, |m, v| m.max(v.abs()));
        unseeded_truncated.push(sim.outcome.truncated);
        unseeded.push([rate, worst]);
    }
    let mut sensitivity = vec![];
    let mut add = |parameter: &str, value: f64, (sim, envelope, truncated): &(Simulation, f64, bool)| -> Result<(), String> {
        let j = sim.outcome.jump()?;
        sensitivity.push(Sensitivity { truncated: *truncated, parameter: parameter.into(), value, rate: sim.settings.rate, amplification: j.amplification, envelope: *envelope, t_snap: j.t_snap, mu_snap: j.mu_snap });
        Ok(())
    };
    for rate in [0.03, 0.1] {
        for dt in [0.02, 0.01, 0.005, 0.0025] {
            add("dt", dt, &runs.envelope("dt", &Settings { rate, dt, ..base }, &prepared)?)?;
        }
        for hht in [-0.05, -0.1, -0.2, -0.3] {
            add("hht", hht, &runs.envelope("hht", &Settings { rate, hht, ..base }, &prepared)?)?;
        }
        for seed in [1e-4, 3e-4, 1e-3, 3e-3, 1e-2] {
            add("imperfection", seed, &runs.envelope("imperfection", &Settings { rate, imperfection: seed, ..base }, &prepared)?)?;
        }
        for n in [24, 48, 96] {
            let s = Settings { rate, n, ..base };
            let p = if n == MESH { prepared.clone() } else { prepare(&s.strip(), START)? };
            add("n", n as f64, &runs.envelope("n", &s, &p)?)?;
        }
        for start in [0.4, 0.6, 1.0, one_end_start] {
            let s = Settings { rate, start, ..base };
            let p = if start == START { prepared.clone() } else if start == one_end_start { far.clone() } else { prepare(&strip, start)? };
            add("start", start, &runs.envelope("start", &s, &p)?)?;
        }
    }
    let mut figure_2a = vec![];

    for rate_m_s in [0.0018, 0.2466] {
        let rate = rate_m_s * SIMULATIONS.rate_factor(PAPER_ALPHA);
        let s = Settings { rate, start: one_end_start, one_end: true, imperfection: 0.0, ..base };
        let sim = runs.run("figure_2a", &s, &far)?;
        let mu_star = far.1.mu_star;
        let time_s: Vec<_> = sim.trace.t.iter().map(|t| t * SIMULATIONS.t_osc()).collect();
        let travel_mm = time_s.iter().map(|seconds| seconds * rate_m_s * 1000.0).collect();
        let paper_mu = sim.trace.t.iter().map(|t| mu_star - rate * t).collect();
        figure_2a.push(Figure2a {
            truncated: sim.outcome.truncated,
            rate_m_s,
            rate,
            time_s,
            travel_mm,
            mu_star,
            paper_mu,
            trace: sim.trace.clone(),
            amplification: sim.outcome.jump()?.amplification,
        });
    }
    Ok(Dynamics {
        runs: runs.count,
        truncated_runs: runs.truncated.len(),
        truncated_settings: runs.truncated,
        unseeded_truncated,
        transition: crossing(&seeded, |p| p.amplification)?,
        transition_envelope: crossing(&seeded, |p| p.envelope.unwrap())?,
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
    pub t_osc_over_t_star: f64,
    /// t* in s.
    pub time_unit_simulations: f64,
    pub time_unit_experiments: f64,
    /// T_osc = 0.108 t* in s: the unit of the dynamics' times.
    pub t_osc_simulations: f64,
    pub t_osc_experiments: f64,
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
            t_osc_over_t_star: crate::dynamics::T_OSC,
            time_unit_simulations: SIMULATIONS.time_unit(),
            time_unit_experiments: EXPERIMENTS.time_unit(),
            t_osc_simulations: SIMULATIONS.t_osc(),
            t_osc_experiments: EXPERIMENTS.t_osc(),
            rate_factor_simulations: SIMULATIONS.rate_factor(PAPER_ALPHA),
            rate_factor_experiments: EXPERIMENTS.rate_factor(PAPER_ALPHA),
            ramp: SIMULATIONS.ramp(0.01),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_accounting_belongs_to_each_study() {
        let settings = Settings { n: 8, rate: 0.1, ..default_settings() };
        let prepared = prepare(&settings.strip(), settings.start).unwrap();
        let mut first = Runs::default();
        let mut second = Runs::default();
        first.run("seeded", &settings, &prepared).unwrap();
        second.run("seeded", &settings, &prepared).unwrap();
        first.run("one_end", &Settings { one_end: true, ..settings }, &prepared).unwrap();
        assert_eq!((first.count, second.count), (2, 1));
    }
}
