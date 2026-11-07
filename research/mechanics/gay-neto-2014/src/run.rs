use crate::input::{self, Input};
use crate::model::{Model, State};
use crate::{TUTORIAL01, TUTORIAL16};
use serde_json::{json, Value};

pub const PULL: f64 = 1.0e6;
pub const LIFT: f64 = 186.0;
pub const FRICTION: f64 = 0.2;
const MAX_FRAMES: usize = 60;

fn round(v: f64, unit: f64) -> f64 {
    (v / unit).round() * unit
}

fn rounded(values: impl Iterator<Item = f64>, unit: f64) -> Vec<f64> {
    values.map(|v| round(v, unit)).collect()
}

pub fn riser_input(pull: f64, lift: f64, friction: f64) -> Input {
    let mut inp = input::parse(TUTORIAL16).expect("tutorial 16 parses");
    for row in &mut inp.loads[0].rows {
        if row[1] != 0.0 {
            row[1] = pull;
        }
    }
    inp.displacements[0].rows[1][3] = lift;
    inp.contacts[0].mu = friction;
    inp
}

fn thin<T>(frames: Vec<(usize, T)>) -> Vec<T> {
    let every = frames.len().div_ceil(MAX_FRAMES).max(1);
    let last = frames.len().saturating_sub(1);
    frames
        .into_iter()
        .enumerate()
        .filter(|(i, (step, _))| i % every == 0 || *i == last || *step == usize::MAX)
        .map(|(_, (_, f))| f)
        .collect()
}

/// Every converged increment of tutorial 16 steps 1 to 3, thinned for the page.
pub fn riser(pull: f64, lift: f64, friction: f64) -> Result<Value, String> {
    let model = Model::from_input(&riser_input(pull, lift, friction))?;
    let line: Vec<usize> = (0..269).collect();
    let mut frames = vec![];
    let frame = |s: &State, step: usize| {
        let r = model.resultants(s);
        json!({
            "t": round(s.t, 1e-6),
            "step": step + 1,
            "x": rounded(line.iter().map(|&n| s.x[n][0]), 1e-3),
            "z": rounded(line.iter().map(|&n| s.x[n][2]), 1e-3),
            "m": rounded(r.iter().map(|(_, f)| f[3]), 1e-3),
            "v": rounded(r.iter().map(|(_, f)| f[1]), 1e-3),
        })
    };
    let end = model.run(3, |s, step| frames.push((step, frame(s, step))))?;
    let r = model.resultants(&end);
    let touching = model
        .contact_gaps(&end)
        .into_iter()
        .filter(|(n, g)| *g <= 0.0 && *n < 268)
        .map(|(n, _)| n)
        .max()
        .unwrap_or(0);
    Ok(json!({
        "case": "riser",
        "params": {"pull": pull, "lift": lift, "friction": friction},
        "reference_x": rounded(line.iter().map(|&n| model.reference[n][0]), 1e-5),
        "element_x": rounded(r.iter().map(|(p, _)| p[0]), 1e-5),
        "frames": thin(frames),
        "summary": {
            "fairlead": [round(end.x[268][0], 1e-3), round(end.x[268][2], 1e-3)],
            "anchor_tension": round(r[0].1[2], 1.0),
            "touchdown": model.reference[touching][0],
            "moment_min": round(r.iter().map(|(_, f)| f[3]).fold(f64::INFINITY, f64::min), 1e-4),
        },
    }))
}

/// Tutorial 1, every increment.
pub fn cantilever() -> Result<Value, String> {
    let model = Model::from_input(&input::parse(TUTORIAL01).expect("tutorial 1 parses"))?;
    let frame = |s: &State| {
        let r = model.resultants(s);
        json!({
            "t": round(s.t, 1e-6),
            "x": rounded(s.x.iter().map(|p| p[0]), 1e-6),
            "z": rounded(s.x.iter().map(|p| p[2]), 1e-6),
            "m": rounded(r.iter().map(|(_, f)| f[4]), 1e-4),
        })
    };
    let mut frames = vec![frame(&model.initial_state())];
    model.run(1, |s, _| frames.push(frame(s)))?;
    Ok(json!({
        "case": "cantilever",
        "reference_z": model.reference.iter().map(|p| p[2]).collect::<Vec<_>>(),
        "frames": frames,
    }))
}
