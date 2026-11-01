use dedaliano_engine::{solver::buckling::solve_buckling_2d, types::SolverInput};
use serde::Serialize;
use serde_json::json;
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize)]
pub struct Mode {
    pub force: f64,
    pub y: Vec<f64>,
    pub slope: Vec<f64>,
}

pub fn basis(n: usize, count: usize) -> Result<Vec<Mode>, String> {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    let mut loads = vec![];
    for i in 0..=n {
        nodes.insert(i.to_string(), json!({"id":i,"x":i as f64/n as f64,"z":0}));
        if i < n {
            elements.insert(
                i.to_string(),
                json!({"id":i,"type":"frame","nodeI":i,"nodeJ":i+1,"materialId":0,"sectionId":0}),
            );
            loads.push(json!({"type":"thermal","data":{"elementId":i,"dtUniform":1.0,"dtGradient":0.0,"alpha":0.00001}}));
        }
    }
    let input: SolverInput = serde_json::from_value(json!({"nodes":nodes,"elements":elements,
        "materials":{"0":{"id":0,"e":1000,"nu":0.3}},
        "sections":{"0":{"id":0,"a":0.1,"iz":0.000001}},
        "supports":{"0":{"id":0,"nodeId":0,"type":"fixed"},"1":{"id":1,"nodeId":n,"type":"fixed"}},"loads":loads})).map_err(|e|e.to_string())?;
    let result = solve_buckling_2d(&input, count)?;
    result
        .modes
        .into_iter()
        .map(|m| {
            let mut y = vec![0.; n + 1];
            let mut slope = y.clone();
            for d in m.displacements {
                y[d.node_id] = d.uz;
                slope[d.node_id] = d.ry;
            }
            let norm = (0..n)
                .map(|j| {
                    let h = 1. / n as f64;
                    let a = 6. * (y[j] - y[j + 1]) / h + 3. * (slope[j] + slope[j + 1]);
                    let b = 6. * (y[j + 1] - y[j]) / h - 4. * slope[j] - 2. * slope[j + 1];
                    let c = slope[j];
                    h * (a * a / 5. + a * b / 2. + (b * b + 2. * a * c) / 3. + b * c + c * c) / 2.
                })
                .sum::<f64>()
                .sqrt();
            if !norm.is_finite() || norm < 1e-12 {
                return Err("invalid mode normalization".into());
            }
            let sign = if y[n / 2] < -1e-8 { -1. } else { 1. };
            for v in &mut y {
                *v *= sign / norm;
            }
            for v in &mut slope {
                *v *= sign / norm;
            }
            Ok(Mode {
                force: m.load_factor,
                y,
                slope,
            })
        })
        .collect()
}

fn slope_at(mode: &Mode, x: f64) -> f64 {
    let n = mode.y.len() - 1;
    let j = ((x * n as f64).floor() as usize).min(n - 1);
    let t = x * n as f64 - j as f64;
    let h = 1. / n as f64;
    (6. * t * t - 6. * t) * mode.y[j] / h
        + (3. * t * t - 4. * t + 1.) * mode.slope[j]
        + (-6. * t * t + 6. * t) * mode.y[j + 1] / h
        + (3. * t * t - 2. * t) * mode.slope[j + 1]
}

pub fn coefficients(modes: &[Mode], width: f64) -> Vec<f64> {
    modes
        .iter()
        .enumerate()
        .map(|(i, m)| {
            if i % 2 == 1 {
                0.
            } else {
                (slope_at(m, (1. + width) / 2.) - slope_at(m, (1. - width) / 2.)) / 2.
            }
        })
        .collect()
}
fn spectrum(modes: &[Mode], c: &[f64], f: f64) -> f64 {
    modes
        .iter()
        .zip(c)
        .filter(|(_, c)| c.abs() > 1e-12)
        .map(|(m, c)| (c / (f - m.force)).powi(2))
        .sum()
}
pub fn threshold(modes: &[Mode], width: f64) -> (f64, f64) {
    let c = coefficients(modes, width);
    let mut lo = modes[0].force + 1e-8;
    let mut hi = modes[1].force;
    for _ in 0..100 {
        let a = lo + (hi - lo) / 3.;
        let b = hi - (hi - lo) / 3.;
        if spectrum(modes, &c, a) < spectrum(modes, &c, b) {
            hi = b;
        } else {
            lo = a;
        }
    }
    let f = (lo + hi) / 2.;
    (1. / spectrum(modes, &c, f).sqrt(), f)
}

#[derive(Serialize)]
pub struct Frame {
    pub alpha: f64,
    pub force: f64,
    pub y: Vec<f64>,
}
#[derive(Serialize)]
pub struct Run {
    pub width: f64,
    pub compression: f64,
    pub threshold: f64,
    pub modes: Vec<Mode>,
    pub curve: Vec<[f64; 2]>,
    pub frames: Vec<Frame>,
}
pub fn run(width: f64, compression: f64) -> Result<Run, String> {
    if !width.is_finite()
        || !(0.3..=0.9).contains(&width)
        || !compression.is_finite()
        || !(0.002..=0.02).contains(&compression)
    {
        return Err("parameters outside shallow-arch domain".into());
    }
    let modes = basis(64, 16)?;
    let (limit, critical) = threshold(&modes, width);
    let c = coefficients(&modes, width);
    let frames = (0..61)
        .map(|i| {
            let a = limit * 1.25 * i as f64 / 60.;
            if i == 0 {
                return Frame {
                    alpha: 0.,
                    force: modes[0].force,
                    y: modes[0].y.iter().map(|y| y * compression.sqrt()).collect(),
                };
            }
            let (mut lo, mut hi) = if a < limit {
                (modes[0].force + 1e-9, critical)
            } else {
                (-10000., modes[0].force - 1e-9)
            };
            for _ in 0..100 {
                let mid = (lo + hi) / 2.;
                let value = a * a * spectrum(&modes, &c, mid);
                if (value > 1.) == (a < limit) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            let f = (lo + hi) / 2.;
            let y = (0..modes[0].y.len())
                .map(|j| {
                    modes
                        .iter()
                        .zip(&c)
                        .map(|(m, c)| -a * c / (f - m.force) * m.y[j] * compression.sqrt())
                        .sum()
                })
                .collect();
            Frame {
                alpha: a * compression.sqrt(),
                force: f,
                y,
            }
        })
        .collect();
    let curve = (30..=90)
        .step_by(2)
        .map(|i| {
            let w = i as f64 / 100.;
            [w, threshold(&modes, w).0]
        })
        .collect();
    Ok(Run {
        width,
        compression,
        threshold: limit * compression.sqrt(),
        modes,
        curve,
        frames,
    })
}

#[wasm_bindgen]
pub fn simulation_run(width: f64, compression: f64) -> Result<String, JsValue> {
    run(width, compression)
        .and_then(|r| serde_json::to_string(&r).map_err(|e| e.to_string()))
        .map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_modes_and_published_threshold() {
        let m = basis(64, 16).unwrap();
        println!(
            "f0={} f1={} threshold={}",
            m[0].force,
            m[1].force,
            threshold(&m, 0.7).0
        );
        assert!((m[0].force / (4. * std::f64::consts::PI.powi(2)) - 1.).abs() < 1e-5);
        assert!((m[1].force / 80.7629142257 - 1.).abs() < 1e-5);
        assert!((threshold(&m, 0.7).0 - 21.52).abs() < 0.02);
    }
    #[test]
    fn zenodo_curve_and_replay_agree() {
        let result = run(0.7, 0.012).unwrap();
        let reference: Vec<[f64; 2]> =
            serde_json::from_str(include_str!("../reference-results/thresholds.json")).unwrap();
        assert_eq!(result.curve.len(), reference.len());
        for (a, b) in result.curve.iter().zip(reference) {
            assert_eq!(a[0], b[0]);
            assert!((a[1] / b[1] - 1.).abs() < 0.003);
        }
        let replay: serde_json::Value =
            serde_json::from_str(include_str!("../reference-results/replay.json")).unwrap();
        assert!((replay["threshold"].as_f64().unwrap() - result.threshold).abs() < 1e-8);
        for (i, f) in result.frames.iter().enumerate() {
            for (j, y) in f.y.iter().enumerate() {
                assert!((y - replay["frames"][i]["y"][j].as_f64().unwrap()).abs() < 1e-8);
            }
        }
    }

    #[test]
    fn domain_and_jump() {
        assert!(run(f64::NAN, 0.012).is_err());
        assert!(run(0.7, 0.2).is_err());
        let r = run(0.7, 0.012).unwrap();
        assert!(r.frames[0].y[32] > 0.);
        assert!(r.frames[60].y[32] < 0.);
        for f in r.frames {
            assert!(f.y.iter().all(|v| v.is_finite()));
            assert!(f.y[0].abs() < 1e-8);
            assert!(f.y[64].abs() < 1e-8);
        }
    }
}
