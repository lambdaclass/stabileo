//! Reproduce a linear solve from its provenance (docs/verification/PROVENANCE.md).
//!
//!   reproduce [--2d|--3d] FILE [--expect-input SHA] [--expect-results SHA]
//!
//! FILE is the solver input the app exports with a report ("Download solver
//! input" in the reproduce dialog). Prints the input and result SHA-256 as JSON,
//! solving twice to check the run is deterministic, and exits 1 when an expected
//! hash does not match (2 on a solver error).

use dedaliano_engine::reproduce::linear_hashes;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (mut file, mut force, mut want_in, mut want_out) = (None, None, None, None);
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--2d" => force = Some(false),
            "--3d" => force = Some(true),
            "--expect-input" => { i += 1; want_in = args.get(i).cloned(); }
            "--expect-results" => { i += 1; want_out = args.get(i).cloned(); }
            other => file = Some(other.to_string()),
        }
        i += 1;
    }
    let path = file.unwrap_or_else(|| { eprintln!("usage: reproduce [--2d|--3d] FILE [--expect-input SHA] [--expect-results SHA]"); std::process::exit(64) });
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| { eprintln!("read {path}: {e}"); std::process::exit(64) });
    let v: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|e| { eprintln!("parse: {e}"); std::process::exit(64) });
    // 3D nodes carry both y and z; 2D ones one of them.
    let is_3d = force.unwrap_or_else(|| v.get("nodes").and_then(|n| n.as_object())
        .map_or(false, |m| m.values().any(|n| n.get("y").is_some() && n.get("z").is_some())));
    let run = || linear_hashes(&text, is_3d).unwrap_or_else(|e| { println!("{}", serde_json::json!({ "error": e })); std::process::exit(2) });
    let (a, b) = (run(), run());
    let deterministic = a == b;
    let input_ok = want_in.as_ref().map(|w| *w == a.input_sha256);
    let results_ok = want_out.as_ref().map(|w| *w == a.results_sha256);
    println!("{}", serde_json::json!({
        "hashes": a, "deterministic": deterministic,
        "inputMatches": input_ok, "resultsMatches": results_ok,
    }));
    if !deterministic || input_ok == Some(false) || results_ok == Some(false) { std::process::exit(1) }
}
