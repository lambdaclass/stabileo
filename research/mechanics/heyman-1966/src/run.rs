use crate::lp::LpError;
use crate::{collapse, five_hinge, four_hinge, hinges, kinematic, least_thickness, least_violation, mechanism_multiplier, Arch, Body, Hinge, PointLoad, Side, State, Weights};
use serde_json::{json, Value};

pub const ALPHA_DEG: f64 = 90.0;
pub const VOUSSOIRS: usize = 101;
pub const RING_VOUSSOIRS: usize = 31;
pub const RING_INNER_RADIUS: f64 = 2.35;
pub const RING_THICKNESS: f64 = 0.30;
pub const RING_DEPTH: f64 = 1.0;
pub const RING_GAMMA: f64 = 20.0;
pub const RING_POSITION: f64 = 0.25;
pub const KINEMATIC_MAX: usize = 40;
const MECHANISM_FRAMES: usize = 24;
const RAMP_FRAMES: usize = 16;

fn round(v: f64) -> f64 {
    (v * 1e7).round() / 1e7
}

fn frame(kind: &str, t: f64, r: f64, s: &State, feasible: bool, tau: f64) -> Value {
    json!({
        "kind": kind, "t": round(t), "lambda": round(s.lambda), "s": round(s.s), "feasible": feasible, "tau": round(tau),
        "e": s.e.iter().map(|e| round((e * r).clamp(-1e3, 1e3))).collect::<Vec<_>>(),
    })
}

fn hinge_json(arch: &Arch, h: &[Hinge]) -> Value {
    h.iter()
        .map(|x| json!({"joint": x.joint, "side": x.side, "angle": round((arch.phi(x.joint) - arch.phi(0)).to_degrees())}))
        .collect()
}

fn bodies_json(bodies: &[Body]) -> (Value, f64) {
    let peak = bodies.iter().fold(0.0f64, |m, b| m.max(b.omega.abs()));
    let list = bodies
        .iter()
        .map(|b| json!({"from": b.from, "to": b.to, "centre": [round(b.centre[0]), round(b.centre[1])], "omega": round(b.omega / peak)}))
        .collect();
    (list, 0.1)
}

fn mechanism_frames(frames: &mut Vec<Value>, t: f64, r: f64, s: &State, tau_max: f64) {
    for i in 1..=MECHANISM_FRAMES {
        frames.push(frame("mechanism", t, r, s, true, tau_max * i as f64 / MECHANISM_FRAMES as f64));
    }
}

/// The least thickness of a circular arch under self-weight (r = 1, w per unit length = t).
pub fn self_weight(alpha_deg: f64, n: usize, weights: Weights) -> Result<Value, LpError> {
    let alpha = alpha_deg.to_radians();
    let lt = least_thickness(alpha, n, weights, 1e-10)?;
    let arch = Arch { r: 1.0, t: lt.eta, d: 1.0, gamma: 1.0, alpha, n, weights };
    let mut frames = vec![];
    let close = lt.steps.iter().position(|s| (s.t - lt.eta).abs() < 2e-3 * lt.eta).unwrap_or(lt.steps.len());
    for s in &lt.steps[..close] {
        frames.push(frame("bisection", s.t, 1.0, &s.state, s.feasible, 0.0));
    }
    frames.push(frame("least", lt.eta, 1.0, &lt.state, true, 0.0));
    let pattern = [Side::Extrados, Side::Intrados, Side::Extrados, Side::Intrados, Side::Extrados];
    let mut bodies = json!([]);
    if lt.hinges.len() == 5 && lt.hinges.iter().zip(pattern).all(|(h, s)| h.side == s) {
        let h: [Hinge; 5] = std::array::from_fn(|i| lt.hinges[i]);
        if let Some(b) = five_hinge(&arch, &h) {
            let (list, tau) = bodies_json(&b);
            bodies = list;
            mechanism_frames(&mut frames, lt.eta, 1.0, &lt.state, tau);
        }
    }
    let t_max = lt.steps.iter().map(|s| s.t).fold(lt.eta, f64::max);
    Ok(json!({
        "case": "self-weight", "alpha": alpha_deg, "n": n, "weights": weights, "r": 1.0, "d": 1.0, "gamma": 1.0, "t_max": round(t_max),
        "result": {"eta": lt.eta, "beta": lt.beta, "h": lt.h, "hinges": hinge_json(&arch, &lt.hinges), "steps": lt.steps.len()},
        "bodies": bodies, "frames": frames,
    }))
}

pub fn ring(n: usize, t: f64) -> Arch {
    Arch { r: RING_INNER_RADIUS + t / 2.0, t, d: RING_DEPTH, gamma: RING_GAMMA, alpha: std::f64::consts::FRAC_PI_2, n, weights: Weights::True }
}

/// The ring under a unit point load on the extrados at `position` (fraction of the clear span from
/// the left springing): its collapse multiplier, the static and kinematic bounds, and the mechanism.
pub fn point_load(n: usize, t: f64, position: f64) -> Result<Value, LpError> {
    let arch = ring(n, t);
    let x = -RING_INNER_RADIUS + 2.0 * RING_INNER_RADIUS * position;
    let (block, point) = arch.extrados_point(x);
    let load = PointLoad { block, x, p: 1.0 };
    let mut frames = vec![];
    let fail = least_violation(&arch, None, 0.0)?;
    if fail.s > 0.0 {
        return Err(LpError::Infeasible);
    }
    let top = collapse(&arch, &load)?;
    let lambda = top.lambda;
    for i in 0..RAMP_FRAMES {
        let s = least_violation(&arch, Some(&load), top.lambda * i as f64 / RAMP_FRAMES as f64)?;
        frames.push(frame("load", t, arch.r, &s, s.s <= 0.0, 0.0));
    }
    frames.push(frame("collapse", t, arch.r, &top, true, 0.0));
    let found = hinges(&arch, &top.e, 1e-6);
    let mut bodies = json!([]);
    if found.len() == 4 {
        let h: [Hinge; 4] = std::array::from_fn(|i| found[i]);
        if let Some((_, b)) = mechanism_multiplier(&arch, &h, &load).or_else(|| four_hinge(&arch, &h).map(|b| (0.0, b))) {
            let (list, tau) = bodies_json(&b);
            bodies = list;
            mechanism_frames(&mut frames, t, arch.r, &top, tau);
        }
    }
    let kin = (n <= KINEMATIC_MAX).then(|| kinematic(&arch, &load)).flatten();
    Ok(json!({
        "case": "point-load", "n": n, "weights": Weights::True, "alpha": 90.0, "r": arch.r, "d": arch.d, "gamma": arch.gamma, "t_max": t,
        "position": position, "load": {"x": round(x), "y": round(point[1]), "block": block},
        "result": {"lambda": lambda, "lambda_kinematic": kin.map(|k| k.0), "kinematic_hinges": kin.map(|k| hinge_json(&arch, &k.1)), "hinges": hinge_json(&arch, &found), "h": top.h * arch.total_weight()},
        "bodies": bodies, "frames": frames,
    }))
}

/// Both runs of the page, at the settings it opens on.
pub fn replay() -> Result<Value, LpError> {
    Ok(json!({
        "self_weight": self_weight(ALPHA_DEG, VOUSSOIRS, Weights::True)?,
        "point_load": point_load(RING_VOUSSOIRS, RING_THICKNESS, RING_POSITION)?,
    }))
}
