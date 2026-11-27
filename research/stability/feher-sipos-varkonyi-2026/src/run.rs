use crate::{bend, Distribution, Setting, State};
use serde_json::{json, Value};

pub const ELEMENTS: usize = 60;
pub const LOAD: f64 = 2.5;
pub const CORNER: (f64, f64) = (1.3, 1.3);
const STEP: f64 = 0.02;
const SNAP: f64 = 0.05;
const LOAD_STEP: f64 = 0.25;

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
    /// The solver itself failed while loading the arch at (1, 0).
    StartUnsolved,
}

impl PathError {
    pub fn code(self) -> &'static str {
        match self {
            PathError::CornerOutOfRange => "corner_out_of_range",
            PathError::LoadOrMeshOutOfRange => "load_or_mesh_out_of_range",
            PathError::StartSnaps => "start_snaps",
            PathError::StartUnsolved => "start_unsolved",
        }
    }
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            PathError::CornerOutOfRange => "corner out of range",
            PathError::LoadOrMeshOutOfRange => "load or mesh out of range",
            PathError::StartSnaps => "the arch at (1, 0) snaps under this load",
            PathError::StartUnsolved => "the solver failed while loading the arch at (1, 0)",
        })
    }
}

fn load_arch(state: &State, target: Setting) -> Result<State, PathError> {
    load_arch_with(state, target, |s, to| s.advance(to, 4).or_else(|_| s.advance(to, 40)))
}

fn load_arch_with(state: &State, target: Setting, advance: impl Fn(&State, Setting) -> Result<State, String>) -> Result<State, PathError> {
    let mut inverted_landings = 0;
    for pieces in 1..=32 {
        let mut current = state.clone();
        for i in 1..=pieces {
            let q = state.setting.q + (target.q - state.setting.q) * i as f64 / pieces as f64;
            let Ok(next) = advance(&current, Setting { q, ..target }) else { break };
            let landed = next.snapshot();
            if !landed.stable { break; }
            if landed.y_mid <= 0. || current.jump_to(&next) > SNAP {
                if landed.y_mid < 0. && current.snapshot().y_mid > 0. {
                    inverted_landings += 1;
                }
                break;
            }
            current = next;
            if i == pieces { return Ok(current); }
        }
    }
    Err(if inverted_landings >= 2 { PathError::StartSnaps } else { PathError::StartUnsolved })
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
    let mut s = bend(elements, Setting { theta: 1.0, delta: 0.0, q: 0.0 }, distribution, 2)
        .map_err(|_| PathError::StartUnsolved)?;
    let pieces = (q / LOAD_STEP).ceil().max(1.0) as usize;
    for k in 1..=pieces {
        let to = Setting { theta: 1.0, delta: 0.0, q: q * k as f64 / pieces as f64 };
        s = load_arch(&s, to)?;
    }
    if s.snapshot().y_mid <= 0.0 {
        return Err(PathError::StartUnsolved);
    }
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

#[test]
fn start_recovers_when_a_full_increment_fails_but_half_steps_converge() {
    let start = Setting { theta: 1.0, delta: 0.0, q: 0.0 };
    let arch = bend(20, start, Distribution::Uniform, 2).unwrap();
    let target = Setting { q: LOAD_STEP, ..start };
    let result = load_arch_with(&arch, target, |s, to| {
        if to.q - s.setting.q > LOAD_STEP / 2.0 { return Err("full increment failed".into()); }
        s.advance(to, 4)
    }).unwrap();
    assert_eq!(result.setting.q, target.q);
    assert!(result.snapshot().y_mid > 0.0);
}

#[test]
fn start_rejects_an_indefinite_positive_height_landing() {
    let start = Setting { theta: 1., delta: 0., q: 0. };
    let arch = bend(20, start, Distribution::Uniform, 2).unwrap();
    let mut unstable = arch.clone();
    for material in unstable.input.materials.values_mut() { material.e = -material.e; }
    assert!(unstable.snapshot().y_mid > 0. && !unstable.snapshot().stable);
    let result = load_arch_with(&arch, start, |_, _| Ok(unstable.clone()));
    assert_eq!(result.err(), Some(PathError::StartUnsolved));
}

#[test]
fn start_recognizes_repeat_inversion_after_a_failed_full_increment() {
    let start = Setting { theta: 1., delta: 0., q: 0. };
    let arch = bend(20, start, Distribution::Uniform, 2).unwrap();
    let mut inverted = arch.clone();
    for d in &mut inverted.displacements { d.uz = -d.uz; d.ry = -d.ry; }
    assert!(inverted.snapshot().stable && inverted.snapshot().y_mid < 0.);
    let result = load_arch_with(&arch, Setting { q: LOAD_STEP, ..start }, |s, to| {
        if to.q - s.setting.q >= LOAD_STEP { return Err("full increment failed".into()); }
        Ok(inverted.clone())
    });
    assert_eq!(result.err(), Some(PathError::StartSnaps));
}
