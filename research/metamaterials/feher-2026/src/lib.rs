use dedaliano_engine::solver::corotational::{solve_corotational_2d_from, CorotationalStart2D};
use dedaliano_engine::types::{Displacement, SolverInput};
use serde_json::json;
use std::f64::consts::PI;

pub const LENGTH: f64 = 340.0;
pub const WIDTH: f64 = 90.0;
pub const THICKNESS: f64 = 0.5;
pub const YOUNG: f64 = 2800.0;
pub const WEIGHT_DENSITY: f64 = 1.33e-6 * 9.81;
pub const ELEMENTS: usize = 136;

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
        let r = solve_corotational_2d_from(&next, Some(&start), 80, 1e-7, increments, false)?;
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

/// Load-controlled loading to `max_load` and unloading back to zero, as in the
/// experiments; a step whose midpoint moves more than `jump` mm is a snap, and
/// a load with no equilibrium found from the previous state ends the cycle.
pub fn load_cycle(strip: &Strip, span: f64, max_load: f64, step: f64, jump: f64) -> Result<serde_json::Value, String> {
    let mut s = prepare(strip, span)?;
    let mut load = 0.0f64;
    let mut points = vec![[0.0, s.height()]];
    let mut snaps = vec![];
    let mut lost = serde_json::Value::Null;
    'cycle: for sign in [1.0f64, -1.0] {
        loop {
            let next = ((load + sign * step) / step).round() * step;
            if next > max_load + 1e-9 || next < -1e-9 {
                break;
            }
            let model = strip.model(PI / 2.0, Some(span), 1.0, next);
            let Ok(n) = s.go(model.clone(), 2).or_else(|_| s.go(model, 50)) else {
                lost = json!(next);
                break 'cycle;
            };
            if (n.height() - s.height()).abs() > jump {
                snaps.push(json!({"load": next, "from": s.height(), "to": n.height()}));
            }
            s = n;
            load = next;
            points.push([load, s.height()]);
        }
    }
    Ok(json!({"a": strip.a, "b": strip.b, "span": span, "points": points, "snaps": snaps, "lost_at": lost}))
}
