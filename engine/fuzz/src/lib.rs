//! Shared harness for the engine fuzz targets (docs/verification/FUZZ_MUTANTS.md).
//!
//! Every target feeds an entry point the WASM layer exposes (engine/src/lib.rs)
//! and checks the outcome:
//!
//! - no panic (libFuzzer aborts on one) and no runaway work: inputs are capped
//!   by `within_bounds` before solving, and libFuzzer's `-timeout` catches the rest;
//! - every result is an `Err` or has only finite numbers, except fields that
//!   document +∞ as a value (`ALLOWED_NON_FINITE`);
//! - certificates are self-consistent (enclosures ordered, bounds finite and
//!   non-negative) and a certified linear result is in global equilibrium.

use dedaliano_engine::certify::Certificate;
use dedaliano_engine::types::*;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

pub mod audit;

/// Fields whose documented values include +∞ (serialized as `null`):
/// - `relBound`: +∞ when ũ = 0 but the absolute bound is not 0;
/// - `omega2Upper`: +∞ when the residual is too large to bound ω² from above;
/// - `uniquenessRadius`: +∞ for a linear P-Delta model (β = 0);
/// - `bimoment` of a force bound: combinations and envelopes do not combine
///   the warping bimoment and report it unbounded (certify/combinations.rs);
/// - `b2Factor`: +∞ when the P-Delta solve fails or K + K_G is not positive
///   definite, reported with `isStable: false` (checked in `check_certificates`).
pub const ALLOWED_NON_FINITE: &[&str] = &["relBound", "omega2Upper", "uniquenessRadius", "bimoment", "b2Factor"];

/// Caps on the integer knobs that scale the work (time steps, iterations,
/// subdivisions).
const CAPS: &[(&str, u64)] = &[
    ("nSteps", 400),
    ("numSegments", 64),
    ("maxIterations", 2000),
    ("maxHinges", 40),
    ("maxIter", 50),
    ("nIncrements", 20),
];

/// Largest JSON array the harness lets through (ground-acceleration records,
/// frequency lists, …).
const MAX_ARRAY: usize = 512;

/// Largest JSON object (node, element, support maps) the harness lets through.
/// The 232-node industrial-hall template (tests/fixtures/ex-3d-nave-industrial)
/// takes 4–11 s natively for P-Delta, the modal and harmonic certificates, and
/// over the 60 s timeout in the instrumented fuzz build; models this large are
/// exercised by the release test suite, and the fuzz budget goes to small ones.
const MAX_OBJECT: usize = 96;

/// Whether a parsed input is small enough to solve within the fuzz time budget.
pub fn within_bounds<T: Serialize>(input: &T) -> bool {
    match serde_json::to_value(input) {
        Ok(v) => value_within_bounds(&v),
        Err(_) => false,
    }
}

fn value_within_bounds(v: &Value) -> bool {
    match v {
        Value::Array(a) => a.len() <= MAX_ARRAY && a.iter().all(value_within_bounds),
        Value::Object(m) => m.len() <= MAX_OBJECT && m.iter().all(|(k, x)| {
            let capped = CAPS.iter().find(|(name, _)| name == k);
            match (capped, x.as_u64()) {
                (Some((_, cap)), Some(n)) if n > *cap => false,
                _ => value_within_bounds(x),
            }
        }),
        _ => true,
    }
}

/// Parameters the numeric arguments of the WASM entry points take, drawn
/// from one byte so they stay small.
#[derive(Clone, Copy, Debug)]
pub struct Params {
    pub num_modes: usize,
    pub max_iter: usize,
    pub tolerance: f64,
    pub n_increments: usize,
}

impl Params {
    pub fn from_byte(b: u8) -> Self {
        Params {
            num_modes: 1 + (b & 0x07) as usize,
            max_iter: 1 + ((b >> 3) & 0x0f) as usize * 3,
            tolerance: [1e-6, 1e-8, 1e-3, 1e-12][(b >> 6) as usize],
            n_increments: 1 + ((b >> 3) & 0x07) as usize,
        }
    }
}

/// Split fuzz bytes into `(selector, params, json)`: byte 0 picks the entry
/// point, byte 1 the numeric parameters, the rest is the JSON text.
pub fn split(data: &[u8]) -> Option<(u8, Params, &str)> {
    if data.len() < 3 {
        return None;
    }
    let json = std::str::from_utf8(&data[2..]).ok()?;
    Some((data[0], Params::from_byte(data[1]), json))
}

/// Parse `json` as `I` and, if it parses and is within bounds, run `f` and
/// check its output. Returns the parsed input and output for further checks.
pub fn run<I, O>(name: &str, json: &str, f: impl FnOnce(&I) -> Result<O, String>) -> Option<(I, O)>
where
    I: DeserializeOwned + Serialize,
    O: Serialize,
{
    let input: I = serde_json::from_str(json).ok()?;
    if !within_bounds(&input) {
        return None;
    }
    let out = f(&input).ok()?;
    check_output(name, &out);
    Some((input, out))
}

/// Finite numbers (outside `ALLOWED_NON_FINITE`) and consistent certificates.
pub fn check_output<O: Serialize>(name: &str, out: &O) {
    let bad: Vec<String> = audit::non_finite_paths(out)
        .into_iter()
        .filter(|p| !ALLOWED_NON_FINITE.iter().any(|f| p.ends_with(&format!(".{f}"))))
        .collect();
    assert!(bad.is_empty(), "{name}: non-finite numbers in an Ok result at {bad:?}");
    let v = serde_json::to_value(out).expect("result serializes");
    check_certificates(name, "$", &v);
}

fn num(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

/// `a ≤ b` up to a relative slack (for comparing an f64 solver value with a
/// certified enclosure of the exact one).
fn le_slack(a: f64, b: f64, rel: f64) -> bool {
    a <= b + rel * a.abs().max(b.abs()) + f64::MIN_POSITIVE
}

/// Self-consistency of every certificate object in the result tree.
fn check_certificates(name: &str, path: &str, v: &Value) {
    match v {
        Value::Array(a) => {
            for (i, x) in a.iter().enumerate() {
                check_certificates(name, &format!("{path}[{i}]"), x);
            }
        }
        Value::Object(m) => {
            if m.contains_key("b2Factor") && m.get("b2Factor").and_then(Value::as_f64).is_none() {
                assert!(
                    m.get("isStable").and_then(Value::as_bool) == Some(false),
                    "{name}: {path} has a non-finite b2Factor but is not flagged unstable"
                );
            }
            let certified = m.get("status").and_then(Value::as_str) == Some("certified")
                || m.get("certified").and_then(Value::as_bool) == Some(true);
            if certified {
                check_certificate(name, path, v);
            }
            for (k, x) in m {
                check_certificates(name, &format!("{path}.{k}"), x);
            }
        }
        _ => {}
    }
}

fn check_certificate(name: &str, path: &str, c: &Value) {
    for key in ["absBound", "residualNorm", "sigma", "mu", "beta", "newtonStep"] {
        if let Some(x) = num(c, key) {
            assert!(x >= 0.0, "{name}: certified {path}.{key} = {x} < 0");
        }
    }
    // Buckling: λ_lower ≤ λ_upper, and the solver's λ̂ inside up to round-off.
    // Plastic: λ_lower ≤ λ_upper (both from exact checks).
    if let (Some(lo), Some(hi)) = (num(c, "lambdaLower"), num(c, "lambdaUpper")) {
        assert!(lo <= hi, "{name}: certified {path} has lambdaLower {lo} > lambdaUpper {hi}");
    }
    if let (Some(lo), Some(comp)) = (num(c, "lambdaLower"), num(c, "lambdaComputed")) {
        assert!(le_slack(lo, comp, 1e-6), "{name}: certified {path}: lambdaLower {lo} > computed {comp}");
    }
    if let (Some(hi), Some(comp)) = (num(c, "lambdaUpper"), num(c, "lambdaComputed")) {
        assert!(le_slack(comp, hi, 1e-6), "{name}: certified {path}: computed {comp} > lambdaUpper {hi}");
    }
    // Modal: each enclosure ordered and containing the computed ω².
    if let Some(modes) = c.get("modes").and_then(Value::as_array) {
        for (i, m) in modes.iter().enumerate() {
            let (Some(lo), Some(comp)) = (num(m, "omega2Lower"), num(m, "omega2Computed")) else {
                continue;
            };
            assert!(le_slack(lo, comp, 1e-6), "{name}: certified {path}.modes[{i}]: omega2Lower {lo} > computed {comp}");
            if let Some(hi) = num(m, "omega2Upper") {
                assert!(le_slack(comp, hi, 1e-6), "{name}: certified {path}.modes[{i}]: computed {comp} > omega2Upper {hi}");
            }
        }
    }
}

/// Global force equilibrium of a certified 2D linear result: with only nodal
/// loads, ΣR + Σf equals the sum of the free-DOF residuals, so it is bounded
/// by √n·‖f − Kũ‖₂ ≤ √n·residualNorm, plus round-off in the reactions.
/// Skipped (returns false) when the model has anything that breaks that
/// identity (element loads, springs, inclined supports, constraints).
pub fn check_equilibrium_2d(input: &SolverInput, results: &AnalysisResults, cert: &Certificate) -> bool {
    let Certificate::Certified { residual_norm, .. } = cert else { return false };
    let plain_supports = input.supports.values().all(|s| {
        s.kx.is_none() && s.ky.is_none() && s.kz.is_none() && s.angle.is_none()
            && matches!(s.support_type.as_str(), "fixed" | "pinned" | "rollerX" | "rollerZ")
    });
    if !plain_supports || !input.constraints.is_empty() || !input.connectors.is_empty() {
        return false;
    }
    let mut sum = [0.0f64; 2];
    let mut scale = 0.0f64;
    for l in &input.loads {
        let SolverLoad::Nodal(l) = l else { return false };
        if !input.nodes.values().any(|n| n.id == l.node_id) {
            return false;
        }
        sum[0] += l.fx;
        sum[1] += l.fz;
        scale += l.fx.abs() + l.fz.abs();
    }
    for r in &results.reactions {
        sum[0] += r.rx;
        sum[1] += r.rz;
        scale += r.rx.abs() + r.rz.abs();
    }
    let n = results.displacements.len() as f64 * 3.0;
    let tol = n.sqrt() * residual_norm + 1e-6 * scale + 1e-300;
    for (axis, s) in ["x", "z"].iter().zip(sum) {
        assert!(
            s.abs() <= tol,
            "certified 2D result out of equilibrium in {axis}: |ΣR + Σf| = {} > {tol} (residualNorm {residual_norm})",
            s.abs()
        );
    }
    true
}

/// 3D version of `check_equilibrium_2d`.
pub fn check_equilibrium_3d(input: &SolverInput3D, results: &AnalysisResults3D, cert: &Certificate) -> bool {
    let Certificate::Certified { residual_norm, .. } = cert else { return false };
    let plain_supports = input.supports.values().all(|s| {
        [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.kw, s.normal_x, s.normal_y, s.normal_z]
            .iter()
            .all(Option::is_none)
    });
    if !plain_supports || !input.constraints.is_empty() || !input.connectors.is_empty() {
        return false;
    }
    let mut sum = [0.0f64; 3];
    let mut scale = 0.0f64;
    for l in &input.loads {
        let SolverLoad3D::Nodal(l) = l else { return false };
        if !input.nodes.values().any(|n| n.id == l.node_id) {
            return false;
        }
        for (s, f) in sum.iter_mut().zip([l.fx, l.fy, l.fz]) {
            *s += f;
            scale += f.abs();
        }
    }
    for r in &results.reactions {
        for (s, f) in sum.iter_mut().zip([r.fx, r.fy, r.fz]) {
            *s += f;
            scale += f.abs();
        }
    }
    let n = results.displacements.len() as f64 * 7.0;
    let tol = n.sqrt() * residual_norm + 1e-6 * scale + 1e-300;
    for (axis, s) in ["x", "y", "z"].iter().zip(sum) {
        assert!(
            s.abs() <= tol,
            "certified 3D result out of equilibrium in {axis}: |ΣR + Σf| = {} > {tol} (residualNorm {residual_norm})",
            s.abs()
        );
    }
    true
}
