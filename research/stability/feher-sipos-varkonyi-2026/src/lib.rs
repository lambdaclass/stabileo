use dedaliano_engine::linalg::cholesky::{back_solve, cholesky_decompose, forward_solve};
use dedaliano_engine::solver::corotational::{
    assemble_corotational_public, solve_corotational_2d_from, CorotationalStart2D,
};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::types::{Displacement, SolverInput};
use serde::Serialize;
use serde_json::json;

pub const BENDING_STIFFNESS: f64 = 1.0 / (4.0 * std::f64::consts::PI * std::f64::consts::PI);
pub const AXIAL_STIFFNESS: f64 = 2.0e4;
const TOLERANCE: f64 = 1e-7;
const MAX_ITERATIONS: usize = 60;

pub fn span() -> f64 {
    1f64.sin()
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Distribution {
    Uniform,
    Asymmetric,
}

impl Distribution {
    pub fn intensity(self, s: f64) -> f64 {
        match self {
            Distribution::Uniform => 1.0,
            Distribution::Asymmetric => {
                if s <= 0.5 {
                    2.0
                } else {
                    0.0
                }
            }
        }
    }

    fn nodal_share(self, n: usize, i: usize) -> f64 {
        let h = 1.0 / n as f64;
        let left = if i > 0 { self.intensity((i as f64 - 0.5) * h) } else { 0.0 };
        let right = if i < n { self.intensity((i as f64 + 0.5) * h) } else { 0.0 };
        0.5 * h * (left + right)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Setting {
    pub theta: f64,
    pub delta: f64,
    pub q: f64,
}

impl Setting {
    pub fn end_angles(&self) -> (f64, f64) {
        (0.5 * self.delta + self.theta, 0.5 * self.delta - self.theta)
    }
}

/// The strip with clamped ends at A and B; `chord` places B, `None` lets it
/// slide along the x axis.
pub fn model(n: usize, setting: Setting, chord: Option<f64>, distribution: Distribution) -> SolverInput {
    let (theta_a, theta_b) = setting.end_angles();
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut loads = vec![];
    for i in 0..=n {
        nodes.insert(i.to_string(), json!({"id": i, "x": i as f64 / n as f64, "z": 0.0}));
        if i < n {
            elements.insert(
                i.to_string(),
                json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 0, "sectionId": 0}),
            );
        }
        let share = distribution.nodal_share(n, i);
        if share != 0.0 && setting.q != 0.0 {
            loads.push(json!({"type": "nodal", "data": {"nodeId": i, "fx": 0.0, "fz": -setting.q * share, "my": 0.0}}));
        }
    }
    let far = match chord {
        Some(c) => json!({"id": 1, "nodeId": n, "type": "fixed", "dx": c - 1.0, "dz": 0.0, "dry": theta_b}),
        None => json!({"id": 1, "nodeId": n, "type": "guidedX", "dz": 0.0, "dry": theta_b}),
    };
    serde_json::from_value(json!({
        "nodes": nodes,
        "elements": elements,
        "materials": {"0": {"id": 0, "e": 0.001, "nu": 0.3}},
        "sections": {"0": {"id": 0, "a": AXIAL_STIFFNESS, "iz": BENDING_STIFFNESS}},
        "supports": {
            "0": {"id": 0, "nodeId": 0, "type": "fixed", "dx": 0.0, "dz": 0.0, "dry": theta_a},
            "1": far
        },
        "loads": loads
    }))
    .expect("the strip model is valid")
}

#[derive(Clone)]
pub struct State {
    pub n: usize,
    pub distribution: Distribution,
    pub setting: Setting,
    pub chord: Option<f64>,
    pub input: SolverInput,
    pub displacements: Vec<Displacement>,
    pub iterations: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct Snapshot {
    pub theta: f64,
    pub delta: f64,
    pub q: f64,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub angle: Vec<f64>,
    pub y_mid: f64,
    pub y_third: f64,
    pub y_two_thirds: f64,
    pub max_curvature: f64,
    pub stable: bool,
    pub lowest_stiffness: f64,
}

/// The paper's path to a loaded state: the end rotations are applied while B
/// slides freely, B is then clamped and moved to the span ν, and the load is
/// applied last.
pub fn bend(n: usize, setting: Setting, distribution: Distribution, increments: usize) -> Result<State, String> {
    let rest = Setting { theta: 0.0, delta: 0.0, q: 0.0 };
    let mut state = State {
        n,
        distribution,
        setting: rest,
        chord: None,
        displacements: (0..=n).map(|i| Displacement { node_id: i, ux: 0.0, uz: 0.0, ry: 0.0 }).collect(),
        input: model(n, rest, None, distribution),
        iterations: 0,
    };
    let (a, b) = setting.end_angles();
    let turns = (a.abs().max(b.abs()) / 0.05).ceil().max(1.0) as usize;
    for k in 1..=turns {
        let f = k as f64 / turns as f64;
        state = state.reach(Setting { theta: setting.theta * f, delta: setting.delta * f, q: 0.0 }, None, increments)?;
    }
    let from = 1.0 + state.by_node()[n].ux;
    let moves = ((from - span()).abs() / 0.01).ceil().max(1.0) as usize;
    for k in 1..=moves {
        let chord = from + (span() - from) * k as f64 / moves as f64;
        state = state.reach(Setting { q: 0.0, ..setting }, Some(chord), increments)?;
    }
    if setting.q != 0.0 {
        state = state.advance(setting, increments.max(4) * (setting.q.abs() / 0.25).ceil() as usize)?;
    }
    Ok(state)
}

impl State {
    pub fn advance(&self, to: Setting, increments: usize) -> Result<State, String> {
        self.reach(to, Some(span()), increments)
    }

    fn reach(&self, to: Setting, chord: Option<f64>, increments: usize) -> Result<State, String> {
        let input = model(self.n, to, chord, self.distribution);
        let start = CorotationalStart2D { input: &self.input, displacements: &self.displacements };
        let r = solve_corotational_2d_from(&input, Some(&start), MAX_ITERATIONS, TOLERANCE, increments, false)?;
        if !r.converged {
            return Err(format!("no equilibrium near {to:?} (stopped at {} of the step)", r.load_factor));
        }
        Ok(State {
            n: self.n,
            distribution: self.distribution,
            setting: to,
            chord,
            input,
            displacements: r.results.displacements,
            iterations: r.iterations,
        })
    }

    pub fn jump_to(&self, other: &State) -> f64 {
        self.by_node()
            .iter()
            .zip(other.by_node())
            .map(|(a, b)| (a.ux - b.ux).hypot(a.uz - b.uz))
            .fold(0.0, f64::max)
    }

    fn by_node(&self) -> Vec<&Displacement> {
        let mut d: Vec<&Displacement> = self.displacements.iter().collect();
        d.sort_by_key(|d| d.node_id);
        d
    }

    pub fn lowest_stiffness(&self) -> Option<f64> {
        let dofs = DofNumbering::build_2d(&self.input);
        let (n, nf) = (dofs.n_total, dofs.n_free);
        let mut u = vec![0.0; n];
        for d in &self.displacements {
            for (local, value) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                if let Some(&i) = dofs.map.get(&(d.node_id, local)) {
                    u[i] = value;
                }
            }
        }
        let mut f = vec![0.0; n];
        let mut k = vec![0.0; n * n];
        assemble_corotational_public(&self.input, &dofs, &u, &mut f, &mut k);
        let mut kff: Vec<f64> = (0..nf).flat_map(|i| (0..nf).map(move |j| (i, j))).map(|(i, j)| k[i * n + j]).collect();
        if !cholesky_decompose(&mut kff, nf) {
            return None;
        }
        let mut v = vec![1.0; nf];
        let mut mu = 0.0;
        for _ in 0..200 {
            let norm = v.iter().map(|x| x * x).sum::<f64>().sqrt();
            v.iter_mut().for_each(|x| *x /= norm);
            let w = back_solve(&kff, &forward_solve(&kff, &v, nf), nf);
            let next: f64 = v.iter().zip(&w).map(|(a, b)| a * b).sum();
            v = w;
            if (next - mu).abs() <= 1e-10 * next.abs() {
                mu = next;
                break;
            }
            mu = next;
        }
        Some(1.0 / mu)
    }

    pub fn snapshot(&self) -> Snapshot {
        let n = self.n;
        let h = 1.0 / n as f64;
        let d = self.by_node();
        let x: Vec<f64> = d.iter().enumerate().map(|(i, d)| i as f64 * h + d.ux).collect();
        let y: Vec<f64> = d.iter().map(|d| d.uz).collect();
        let angle: Vec<f64> = d.iter().map(|d| d.ry).collect();
        let max_curvature = angle
            .windows(2)
            .map(|w| ((w[1] - w[0]).sin().atan2((w[1] - w[0]).cos()) / h).abs())
            .fold(0.0, f64::max);
        let at = |s: f64| {
            let t = s * n as f64;
            let i = (t.floor() as usize).min(n - 1);
            let f = t - i as f64;
            y[i] * (1.0 - f) + y[i + 1] * f
        };
        let lowest = self.lowest_stiffness();
        Snapshot {
            theta: self.setting.theta,
            delta: self.setting.delta,
            q: self.setting.q,
            y_mid: at(0.5),
            y_third: at(1.0 / 3.0),
            y_two_thirds: at(2.0 / 3.0),
            x,
            y,
            angle,
            max_curvature,
            stable: lowest.is_some_and(|l| l > 0.0),
            lowest_stiffness: lowest.unwrap_or(f64::NAN),
        }
    }
}

/// Largest load intensity the strip carries from rest at the given clamp
/// angles while its tangent stays positive definite (stability) and its
/// curvature stays below `max_curvature`; `None` when the unloaded strip
/// already exceeds that curvature.
pub fn limit_load(n: usize, theta: f64, delta: f64, distribution: Distribution, max_curvature: f64, sign: f64) -> Result<Option<(f64, &'static str)>, String> {
    let rest = bend(n, Setting { theta, delta, q: 0.0 }, distribution, 2)?;
    if rest.snapshot().max_curvature > max_curvature {
        return Ok(None);
    }
    let feasible = |from: &State, s: &State| {
        let p = s.snapshot();
        if from.jump_to(s) > 0.05 {
            Err("snap")
        } else if !p.stable {
            Err("stability")
        } else if p.max_curvature > max_curvature {
            Err("curvature")
        } else {
            Ok(())
        }
    };
    let mut good = rest;
    let mut step = 0.1;
    let mut reason = "stability";
    while step > 1e-4 {
        let to = Setting { q: good.setting.q + sign * step, ..good.setting };
        match good.advance(to, 2).map_err(|_| "stability").and_then(|s| feasible(&good, &s).map(|_| s)) {
            Ok(s) => good = s,
            Err(why) => {
                reason = why;
                step /= 2.0;
            }
        }
        if good.setting.q.abs() > 50.0 {
            return Ok(Some((good.setting.q, "bounded")));
        }
    }
    Ok(Some((good.setting.q, reason)))
}

/// Largest curvature once the load first reaches `q`, loading from rest, and
/// whether the strip passed through an unstable state on the way.
pub fn curvature_at(n: usize, theta: f64, delta: f64, distribution: Distribution, q: f64) -> Result<(f64, bool), String> {
    let mut s = bend(n, Setting { theta, delta, q: 0.0 }, distribution, 2)?;
    let steps = (q.abs() / 0.02).ceil() as usize;
    for k in 1..=steps {
        let to = Setting { q: q * k as f64 / steps as f64, ..s.setting };
        match s.advance(to, 2) {
            Ok(next) if s.jump_to(&next) <= 0.05 && next.snapshot().stable => s = next,
            _ => {
                let landed = s.advance(Setting { q, ..s.setting }, 200)?;
                return Ok((landed.snapshot().max_curvature, true));
            }
        }
    }
    Ok((s.snapshot().max_curvature, false))
}

pub mod run;
pub mod wasm;
