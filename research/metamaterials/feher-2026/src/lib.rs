use dedaliano_engine::solver::corotational::{solve_corotational_2d_from, CorotationalStart2D};
use dedaliano_engine::types::{Displacement, SolverInput};
use serde_json::json;
use std::f64::consts::PI;

pub mod exact;

pub const LENGTH: f64 = 340.0;
pub const WIDTH: f64 = 90.0;
pub const THICKNESS: f64 = 0.5;
pub const YOUNG: f64 = 2800.0;
pub const WEIGHT_DENSITY: f64 = 1.33e-6 * 9.81;
pub const ELEMENTS: usize = 136;
/// Tight enough that a converged state does not depend on how many increments reached it.
const TOLERANCE: f64 = 1e-10;

/// The cut strip of Section 2.1 in N and mm: two symmetric edge cuts of
/// relative length `a` and depth `b`, with the inactive 45° triangles beside
/// them removed from the bending stiffness (Eq. 2) but kept in the weight.
pub struct Strip {
    pub a: f64,
    pub b: f64,
}

impl Strip {
    fn ends(&self) -> (f64, f64) {
        ((1.0 - self.a) * LENGTH / 2.0, (1.0 + self.a) * LENGTH / 2.0)
    }

    pub fn effective_width(&self, s: f64) -> f64 {
        let (sl, sr) = self.ends();
        let inner = (1.0 - self.b) * WIDTH;
        if s <= sl {
            WIDTH.min(inner + 2.0 * (sl - s))
        } else if s < sr {
            inner
        } else {
            WIDTH.min(inner + 2.0 * (s - sr))
        }
    }

    pub fn material_width(&self, s: f64) -> f64 {
        let (sl, sr) = self.ends();
        if s > sl && s < sr { (1.0 - self.b) * WIDTH } else { WIDTH }
    }

    /// Clamps at ±π/2 rotation; `span` places the far clamp (`None` lets it
    /// slide); `weight` scales the self-weight; `load` acts down at midspan.
    pub fn model(&self, rotation: f64, span: Option<f64>, weight: f64, load: f64) -> SolverInput {
        let n = ELEMENTS;
        let h = LENGTH / n as f64;
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        let mut sections = serde_json::Map::new();
        let mut loads = vec![];
        for i in 0..=n {
            nodes.insert(i.to_string(), json!({"id": i, "x": i as f64 * h, "z": 0.0}));
            if i < n {
                let w = self.effective_width((i as f64 + 0.5) * h);
                sections.insert(i.to_string(), json!({"id": i, "a": w * THICKNESS, "iz": w * THICKNESS.powi(3) / 12.0}));
                elements.insert(i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 0, "sectionId": i}));
            }
            let left = if i > 0 { self.material_width((i as f64 - 0.5) * h) } else { 0.0 };
            let right = if i < n { self.material_width((i as f64 + 0.5) * h) } else { 0.0 };
            let fz = -weight * WEIGHT_DENSITY * THICKNESS * 0.5 * h * (left + right) - if i == n / 2 { load } else { 0.0 };
            if fz != 0.0 {
                loads.push(json!({"type": "nodal", "data": {"nodeId": i, "fx": 0.0, "fz": fz, "my": 0.0}}));
            }
        }
        let far = match span {
            Some(c) => json!({"id": 1, "nodeId": n, "type": "fixed", "dx": c - LENGTH, "dz": 0.0, "dry": -rotation}),
            None => json!({"id": 1, "nodeId": n, "type": "guidedX", "dz": 0.0, "dry": -rotation}),
        };
        serde_json::from_value(json!({
            "nodes": nodes, "elements": elements, "sections": sections,
            "materials": {"0": {"id": 0, "e": YOUNG / 1000.0, "nu": 0.4}},
            "supports": {"0": {"id": 0, "nodeId": 0, "type": "fixed", "dx": 0.0, "dz": 0.0, "dry": rotation}, "1": far},
            "loads": loads
        }))
        .expect("the strip model is valid")
    }
}

pub struct State {
    pub input: SolverInput,
    pub displacements: Vec<Displacement>,
}

impl State {
    fn go(&self, next: SolverInput, increments: usize) -> Result<State, String> {
        let start = CorotationalStart2D { input: &self.input, displacements: &self.displacements };
        let r = solve_corotational_2d_from(&next, Some(&start), 80, TOLERANCE, increments, false)?;
        if !r.converged {
            return Err(format!("no equilibrium (stopped at {} of the step)", r.load_factor));
        }
        Ok(State { input: next, displacements: r.results.displacements })
    }

    pub fn height(&self) -> f64 {
        self.displacements.iter().find(|d| d.node_id == ELEMENTS / 2).map(|d| d.uz).unwrap_or(f64::NAN)
    }
}

/// The paper's preparation (Section 2.2): turn the clamps to vertical while the
/// far end slides, move it to the support distance, add the self-weight.
pub fn prepare(strip: &Strip, span: f64) -> Result<State, String> {
    let flat = strip.model(0.0, None, 0.0, 0.0);
    let mut s = State { displacements: (0..=ELEMENTS).map(|i| Displacement { node_id: i, ux: 0.0, uz: 0.0, ry: 0.0 }).collect(), input: flat };
    for k in 1..=32 {
        s = s.go(strip.model(PI / 2.0 * k as f64 / 32.0, None, 0.0, 0.0), 2)?;
    }
    let from = LENGTH + s.displacements.iter().find(|d| d.node_id == ELEMENTS).unwrap().ux;
    let moves = ((from - span).abs() / 2.0).ceil().max(1.0) as usize;
    for k in 1..=moves {
        s = s.go(strip.model(PI / 2.0, Some(from + (span - from) * k as f64 / moves as f64), 0.0, 0.0), 2)?;
    }
    s.go(strip.model(PI / 2.0, Some(span), 1.0, 0.0), 4)
}

fn load_steps(load: f64, step: f64) -> Result<usize, String> {
    let count = (load.abs() / step).ceil();
    if !step.is_finite() || step <= 0.0 || !load.is_finite() || count >= usize::MAX as f64 {
        return Err("invalid load or increment".into());
    }
    Ok(count as usize)
}

pub const CYCLE_LOAD_STEP: f64 = 0.05;
pub const HEIGHT_INCREMENT: f64 = 10.0;

fn advance(state: &State, strip: &Strip, span: f64, load: f64) -> Result<State, String> {
    let model = strip.model(PI / 2.0, Some(span), 1.0, load);
    state.go(model.clone(), 2).or_else(|_| state.go(model, 50))
}

fn continuous(state: &State, strip: &Strip, span: f64, from: f64, to: f64, depth: usize) -> Result<State, String> {
    if let Ok(next) = advance(state, strip, span, to) {
        if (next.height() - state.height()).abs() <= HEIGHT_INCREMENT { return Ok(next); }
    }
    if depth == 0 { return Err("continuity of the initial equilibrium branch could not be established".into()); }
    let mid = 0.5 * (from + to);
    let next = continuous(state, strip, span, from, mid, depth - 1)?;
    continuous(&next, strip, span, mid, to, depth - 1)
}

/// Midpoint height under a midspan load raised from zero in `step` increments on the branch the
/// strip starts on.
pub fn loaded_height(strip: &Strip, span: f64, load: f64, step: f64) -> Result<f64, String> {
    load_steps(load, step)?;
    let steps = load_steps(load, step.min(CYCLE_LOAD_STEP))?;
    let mut s = prepare(strip, span)?;
    let mut from = 0.;
    for k in 1..=steps {
        let to = load * (k as f64 / steps as f64);
        s = continuous(&s, strip, span, from, to, 8)?;
        from = to;
    }
    Ok(s.height())
}

pub fn load_cycle(strip: &Strip, span: f64, max_load: f64, step: f64, jump: f64) -> Result<serde_json::Value, String> {
    let steps = load_steps(max_load, step)?;
    if max_load < 0.0 || !jump.is_finite() || jump <= 0.0 { return Err("invalid load cycle".into()); }
    let start = prepare(strip, span)?;
    trace_cycle(strip, span, max_load, step, steps, jump, start, |s, load| advance(s, strip, span, load))
}

fn trace_cycle(strip: &Strip, span: f64, max_load: f64, step: f64, steps: usize, jump: f64, mut s: State,
               solve: impl Fn(&State, f64) -> Result<State, String>) -> Result<serde_json::Value, String> {
    let mut points = vec![[0.0, s.height()]];
    let mut snaps = vec![];
    let mut lost = serde_json::Value::Null;
    'cycle: for loading in [true, false] {
        for k in 1..=steps {
            let index = if loading { k } else { steps - k };
            let next = (step * index as f64).min(max_load);
            let Ok(n) = solve(&s, next) else {
                lost = json!(next);
                break 'cycle;
            };
            if (n.height() - s.height()).abs() > jump {
                let previous = points.last().unwrap()[0];
                if let Ok(returned) = solve(&n, previous) {
                    if (returned.height() - s.height()).abs() > jump {
                        snaps.push(json!({"load": next, "from": s.height(), "to": n.height(), "loading": loading}));
                    }
                }
            }
            s = n;
            points.push([next, s.height()]);
        }
    }
    Ok(json!({"a": strip.a, "b": strip.b, "span": span, "points": points, "snaps": snaps, "lost_at": lost}))
}

#[cfg(test)]
mod tests {
    use super::load_steps;

    #[test]
    fn signed_subdivisions_respect_the_requested_spacing() {
        for load in [-1.0, 1.0] {
            assert_eq!(load_steps(load, 0.4).unwrap(), 3);
            assert_eq!(load_steps(load, 0.25).unwrap(), 4);
        }
        assert_eq!(load_steps(0.0, 0.1).unwrap(), 0);
        for load in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(load_steps(load, 0.1).is_err());
        }
    }
}

#[cfg(test)]
mod continuation_regressions {
    use super::*;

    #[test]
    #[ignore = "known wrong result: #2505"]
    fn failed_reverse_solve_keeps_the_direction_and_bracket() {
        let strip = Strip { a: 0.5, b: 0.5 };
        let state = |height| State {
            input: strip.model(PI / 2., Some(LENGTH / 2.), 1., 0.),
            displacements: vec![Displacement { node_id: ELEMENTS / 2, ux: 0., uz: height, ry: 0. }],
        };
        for loading in [false, true] {
            let calls = std::cell::Cell::new(0);
            let cycle = trace_cycle(&strip, LENGTH / 2., 1., 1., 1, HEIGHT_INCREMENT, state(0.), |_, _| {
                let i = calls.get();
                calls.set(i + 1);
                match (loading, i) {
                    (false, 0) => Ok(state(0.)),
                    (true, 0) | (false, 1) => Ok(state(2. * HEIGHT_INCREMENT)),
                    _ => Err("no reverse equilibrium".into()),
                }
            }).unwrap();
            let bracket = if loading { [0., 1.] } else { [1., 0.] };
            assert_eq!(cycle["unresolved_switch"]["bracket"], json!(bracket));
            assert_eq!(cycle["unresolved_switch"]["loading"], loading);
            assert_eq!(cycle["lost_at"], bracket[1]);
            assert_eq!(cycle["snaps"], json!([]));
        }
    }
}
