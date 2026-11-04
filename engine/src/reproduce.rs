//! Reproducing a linear solve from its provenance (docs/verification/PROVENANCE.md).
//!
//! The web app records, for the static solve behind a report, the SHA-256 of the
//! solver input as the engine parsed it and of the engine's result, both as
//! canonical JSON (`certify::provenance::canonical_json`: keys sorted, compact,
//! every f64 in its shortest round-trip form). `cargo run --release --example
//! reproduce -- input.json` recomputes both from the same input natively; the WASM
//! export `engine_reproduce_hashes` computes them in the browser.
//!
//! Wall-clock fields (`timings`, `solveTimings`, `runMeta`) are left out of the
//! result hash: they describe the run, not the answer.

use crate::certify::provenance::{canonical_json, sha256_hex};
use crate::solver::linear::{solve_2d, solve_3d};
use crate::types::{SolverInput, SolverInput3D};
use serde::Serialize;

/// The hashes that identify one linear solve.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReproduceHashes {
    /// `2d` or `3d`.
    pub dimension: String,
    /// SHA-256 of the canonical JSON of the parsed solver input.
    pub input_sha256: String,
    /// SHA-256 of the canonical JSON of the result, without wall-clock fields.
    pub results_sha256: String,
    pub engine_version: String,
    pub engine_commit: String,
}

const RUN_FIELDS: [&str; 3] = ["timings", "solveTimings", "runMeta"];

fn strip_run_fields(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(m) => {
            for k in RUN_FIELDS {
                m.remove(k);
            }
            m.values_mut().for_each(strip_run_fields);
        }
        serde_json::Value::Array(a) => a.iter_mut().for_each(strip_run_fields),
        _ => {}
    }
}

/// Canonical JSON of a result, wall-clock fields removed.
pub fn canonical_results_json<T: Serialize>(r: &T) -> Result<String, String> {
    let mut v = serde_json::to_value(r).map_err(|e| format!("result does not serialize: {e}"))?;
    strip_run_fields(&mut v);
    canonical_json(&v)
}

fn hashes<I: Serialize, R: Serialize>(dim: &str, input: &I, result: &R) -> Result<ReproduceHashes, String> {
    Ok(ReproduceHashes {
        dimension: dim.into(),
        input_sha256: sha256_hex(canonical_json(input)?.as_bytes()),
        results_sha256: sha256_hex(canonical_results_json(result)?.as_bytes()),
        engine_version: env!("CARGO_PKG_VERSION").into(),
        engine_commit: env!("STABILEO_ENGINE_COMMIT").into(),
    })
}

/// Solve a linear `SolverInput` (2D) or `SolverInput3D` (3D) given as JSON and hash input and result.
pub fn linear_hashes(json: &str, is_3d: bool) -> Result<ReproduceHashes, String> {
    if is_3d {
        let input: SolverInput3D = serde_json::from_str(json).map_err(|e| format!("SolverInput3D: {e}"))?;
        let r = solve_3d(&input)?;
        hashes("3d", &input, &r)
    } else {
        let input: SolverInput = serde_json::from_str(json).map_err(|e| format!("SolverInput: {e}"))?;
        let r = solve_2d(&input)?;
        hashes("2d", &input, &r)
    }
}
