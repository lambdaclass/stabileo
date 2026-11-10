use crate::{bend, Distribution, Setting, State};
use serde_json::{json, Value};

pub const ELEMENTS: usize = 60;
pub const LOAD: f64 = 2.5;
pub const CORNER: (f64, f64) = (1.3, 1.3);
const STEP: f64 = 0.02;
const SNAP: f64 = 0.05;

fn round(v: f64) -> f64 {
    (v * 1e5).round() / 1e5
}

fn frame(s: &State) -> Value {
    let p = s.snapshot();
    let n = s.n;
    let h = 1.0 / n as f64;
    let curvature: Vec<f64> = (0..=n)
        .map(|i| {
            let (a, b) = if i == 0 { (0, 1) } else if i == n { (n - 1, n) } else { (i - 1, i + 1) };
            let d = p.angle[b] - p.angle[a];
            round(d.sin().atan2(d.cos()) / ((b - a) as f64 * h))
        })
        .collect();
    json!({
        "theta": round(p.theta),
        "delta": round(p.delta),
        "y_mid": round(p.y_mid),
        "y_third": round(p.y_third),
        "y_two_thirds": round(p.y_two_thirds),
        "max_curvature": round(p.max_curvature),
        "stable": p.stable,
        "ux": p.x.iter().enumerate().map(|(i, x)| round(x - i as f64 * h)).collect::<Vec<_>>(),
        "uz": p.y.iter().map(|&y| round(y)).collect::<Vec<_>>(),
        "curvature": curvature,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathError {
    CornerOutOfRange,
    LoadOrMeshOutOfRange,
    /// The arch at (1, 0) does not carry the load: it snaps while being loaded.
    StartSnaps,
}

impl PathError {
    pub fn code(self) -> &'static str {
        match self {
            PathError::CornerOutOfRange => "corner_out_of_range",
            PathError::LoadOrMeshOutOfRange => "load_or_mesh_out_of_range",
            PathError::StartSnaps => "start_snaps",
        }
    }
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            PathError::CornerOutOfRange => "corner out of range",
            PathError::LoadOrMeshOutOfRange => "load or mesh out of range",
            PathError::StartSnaps => "the arch at (1, 0) snaps under this load",
        })
    }
}

/// The path of Section 3.4 with the far corner of the rectangle at
/// `(theta, delta)`: (1,0) → (Θ,0) → (Θ,Δ) → (1,Δ) → (1,0) under the paper's
/// uniform load 2.5, on 60 members.
pub fn path(theta: f64, delta: f64) -> Result<Value, PathError> {
    path_with(theta, delta, LOAD, Distribution::Uniform, ELEMENTS)
}

/// The same rectangle under the load `q` with the given distribution, on
/// `elements` members. Where no equilibrium is found near the previous state
/// (a fold: the strip would snap), the path stops and `lost` names the
/// actuator setting.
pub fn path_with(theta: f64, delta: f64, q: f64, distribution: Distribution, elements: usize) -> Result<Value, PathError> {
    if !(1.0..=1.6).contains(&theta) || !(0.0..=1.8).contains(&delta) {
        return Err(PathError::CornerOutOfRange);
    }
    if !(0.0..=4.0).contains(&q) || !(20..=120).contains(&elements) {
        return Err(PathError::LoadOrMeshOutOfRange);
    }
    let mut s = bend(elements, Setting { theta: 1.0, delta: 0.0, q }, distribution, 2)
        .ok()
        .filter(|s| s.snapshot().y_mid > 0.0)
        .ok_or(PathError::StartSnaps)?;
    let mut frames = vec![frame(&s)];
    let mut corners = vec![0];
    let mut snaps = vec![];
    let mut lost = Value::Null;
    let legs = [(1.0, 0.0), (theta, 0.0), (theta, delta), (1.0, delta), (1.0, 0.0)];
    'legs: for w in legs.windows(2) {
        let ((t0, d0), (t1, d1)) = (w[0], w[1]);
        let steps = ((t1 - t0).abs().max((d1 - d0).abs()) / STEP).ceil() as usize;
        for k in 1..=steps {
            let f = k as f64 / steps as f64;
            let to = Setting { theta: t0 + f * (t1 - t0), delta: d0 + f * (d1 - d0), q };
            let Ok(next) = s.advance(to, 2).or_else(|_| s.advance(to, 40)) else {
                lost = json!({"theta": round(to.theta), "delta": round(to.delta)});
                break 'legs;
            };
            if s.jump_to(&next) > SNAP {
                snaps.push(frames.len());
            }
            s = next;
            frames.push(frame(&s));
        }
        corners.push(frames.len() - 1);
    }
    Ok(json!({
        "lost": lost,
        "elements": elements,
        "load": q,
        "distribution": distribution,
        "corner": [theta, delta],
        "corners": corners,
        "snaps": snaps,
        "frames": frames,
    }))
}
