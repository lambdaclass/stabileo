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

/// The path of Section 3.4 with the far corner of the rectangle at
/// `(theta, delta)`: (1,0) → (Θ,0) → (Θ,Δ) → (1,Δ) → (1,0) under the uniform
/// load 2.5, recording every state and any jump between neighbouring ones.
pub fn path(theta: f64, delta: f64) -> Result<Value, String> {
    if !(1.0..=1.6).contains(&theta) || !(0.0..=1.8).contains(&delta) {
        return Err("corner out of range".into());
    }
    let mut s = bend(ELEMENTS, Setting { theta: 1.0, delta: 0.0, q: LOAD }, Distribution::Uniform, 2)?;
    let mut frames = vec![frame(&s)];
    let mut corners = vec![0];
    let mut snaps = vec![];
    let legs = [(1.0, 0.0), (theta, 0.0), (theta, delta), (1.0, delta), (1.0, 0.0)];
    for w in legs.windows(2) {
        let ((t0, d0), (t1, d1)) = (w[0], w[1]);
        let steps = ((t1 - t0).abs().max((d1 - d0).abs()) / STEP).ceil() as usize;
        for k in 1..=steps {
            let f = k as f64 / steps as f64;
            let to = Setting { theta: t0 + f * (t1 - t0), delta: d0 + f * (d1 - d0), q: LOAD };
            let next = s.advance(to, 2).or_else(|_| s.advance(to, 40))?;
            if s.jump_to(&next) > SNAP {
                snaps.push(frames.len());
            }
            s = next;
            frames.push(frame(&s));
        }
        corners.push(frames.len() - 1);
    }
    Ok(json!({
        "elements": ELEMENTS,
        "load": LOAD,
        "corner": [theta, delta],
        "corners": corners,
        "snaps": snaps,
        "frames": frames,
    }))
}
