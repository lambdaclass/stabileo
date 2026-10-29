use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput, EquilibriumStep};
use dedaliano_engine::types::Displacement;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseFile {
    cases: Vec<Case>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    id: String,
    geometry: Geometry,
    apex: Apex,
    reference: CaseReference,
    tolerances: Tolerances,
    input: ArcLengthInput,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Geometry {
    half_span: f64,
    rise: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Apex {
    node_id: usize,
    reference_load: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseReference {
    upper_limit: Limit,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Limit {
    displacement: f64,
    load: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tolerances {
    limit_load_relative: f64,
    limit_displacement_relative: f64,
    equilibrium_path_normalized_by_limit_load: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeResults {
    schema_version: u32,
    case_file: String,
    solver: String,
    frame_method: String,
    cases: Vec<NativeCase>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCase {
    id: String,
    converged: bool,
    total_iterations: usize,
    final_load_factor: f64,
    steps: Vec<EquilibriumStep>,
    final_displacements: Vec<Displacement>,
    frames: Vec<DisplacementFrame>,
    prefix_checks: Vec<PrefixCheck>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplacementFrame {
    step: usize,
    load_factor: f64,
    converged: bool,
    iterations: usize,
    displacements: Vec<Displacement>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PrefixCheck {
    max_steps: usize,
    recorded_steps: usize,
    exact_path_prefix: bool,
}

fn run_case(case: &Case) -> Result<NativeCase, String> {
    let full = solve_arc_length(&case.input)
        .map_err(|e| format!("{}: production solve failed: {e}", case.id))?;
    if full.steps.is_empty() {
        return Err(format!("{}: no equilibrium steps were recorded", case.id));
    }

    let mut frames = Vec::with_capacity(full.steps.len());
    let mut prefix_checks = Vec::with_capacity(full.steps.len());
    for k in 1..=full.steps.len() {
        let mut input = case.input.clone();
        input.max_steps = k;
        let rerun = solve_arc_length(&input)
            .map_err(|e| format!("{}: maxSteps={k} rerun failed: {e}", case.id))?;
        let expected = serde_json::to_value(&full.steps[..k]).map_err(|e| e.to_string())?;
        let observed = serde_json::to_value(&rerun.steps).map_err(|e| e.to_string())?;
        if observed != expected {
            return Err(format!(
                "{0}: maxSteps={k} result is not the exact {k}-step path prefix",
                case.id
            ));
        }
        let step = &rerun.steps[k - 1];
        frames.push(DisplacementFrame {
            step: step.step,
            load_factor: step.load_factor,
            converged: step.converged,
            iterations: step.iterations,
            displacements: rerun.results.displacements,
        });
        prefix_checks.push(PrefixCheck {
            max_steps: k,
            recorded_steps: rerun.steps.len(),
            exact_path_prefix: true,
        });
    }

    Ok(NativeCase {
        id: case.id.clone(),
        converged: full.converged,
        total_iterations: full.total_iterations,
        final_load_factor: full.final_load_factor,
        steps: full.steps,
        final_displacements: full.results.displacements,
        frames,
        prefix_checks,
    })
}

fn apex_displacement(frame: &DisplacementFrame, node_id: usize) -> Result<f64, String> {
    frame
        .displacements
        .iter()
        .find(|d| d.node_id == node_id)
        .map(|d| -d.uz)
        .ok_or_else(|| format!("apex node {node_id} is absent from displacement frame"))
}

fn validate(case: &Case, native: &NativeCase) -> Result<(Vec<Value>, Value), String> {
    if native.frames.len() != native.steps.len() {
        return Err(format!("{}: step/frame count mismatch", case.id));
    }
    let material = case
        .input
        .solver
        .materials
        .values()
        .next()
        .ok_or_else(|| format!("{}: missing material", case.id))?;
    let section = case
        .input
        .solver
        .sections
        .values()
        .next()
        .ok_or_else(|| format!("{}: missing section", case.id))?;
    let e_eff = material.e * 1000.0;
    let mut max_path_error = 0.0_f64;
    let mut max_path_step = 0;
    let mut loads = Vec::with_capacity(native.frames.len());
    let mut displacements = Vec::with_capacity(native.frames.len());

    for frame in &native.frames {
        let v = apex_displacement(frame, case.apex.node_id)?;
        let y = case.geometry.rise - v;
        let length = case.geometry.half_span.hypot(y);
        let length0 = case.geometry.half_span.hypot(case.geometry.rise);
        let reference_load = 2.0 * e_eff * section.a * (1.0 - length / length0) * y / length;
        let computed_load = frame.load_factor * case.apex.reference_load;
        let error = (computed_load - reference_load).abs() / case.reference.upper_limit.load.abs();
        if error > max_path_error {
            max_path_error = error;
            max_path_step = frame.step;
        }
        loads.push(computed_load);
        displacements.push(v);
    }

    let first_limit =
        (0..loads.len().saturating_sub(1)).find(|&i| loads[i] > 0.0 && loads[i + 1] < loads[i]);
    let limit_reached = first_limit.is_some();
    let limit_index = match first_limit {
        Some(index) => index,
        None => loads
            .iter()
            .copied()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(index, _)| index)
            .ok_or_else(|| format!("{}: empty equilibrium path", case.id))?,
    };
    let measured_load = loads[limit_index];
    let measured_displacement = displacements[limit_index];
    let limit_load_error = (measured_load - case.reference.upper_limit.load).abs()
        / case.reference.upper_limit.load.abs();
    let limit_displacement_error =
        (measured_displacement - case.reference.upper_limit.displacement).abs()
            / case.reference.upper_limit.displacement.abs();
    let prefix_ok = native.prefix_checks.iter().all(|p| p.exact_path_prefix);

    let mut checks = vec![
        json!({
            "caseId": case.id,
            "metric": "relative difference",
            "name": "upper limit load",
            "observed": limit_load_error,
            "tolerance": case.tolerances.limit_load_relative,
            "passed": limit_load_error <= case.tolerances.limit_load_relative,
            "measured": measured_load,
            "reference": case.reference.upper_limit.load,
            "step": native.frames[limit_index].step
        }),
        json!({
            "caseId": case.id,
            "metric": "max absolute load residual / reference upper limit load",
            "name": "equilibrium path at every recorded step",
            "observed": max_path_error,
            "tolerance": case.tolerances.equilibrium_path_normalized_by_limit_load,
            "passed": max_path_error <= case.tolerances.equilibrium_path_normalized_by_limit_load,
            "step": max_path_step
        }),
        json!({
            "caseId": case.id,
            "metric": "exact path-prefix equality",
            "name": "all displacement frames come from independent maxSteps=k reruns",
            "observed": if prefix_ok { 0.0 } else { 1.0 },
            "tolerance": 0.0,
            "passed": prefix_ok
        }),
    ];
    if limit_reached {
        checks.push(json!({
            "caseId": case.id,
            "metric": "relative difference",
            "name": "apex displacement at the measured upper limit load",
            "observed": limit_displacement_error,
            "tolerance": case.tolerances.limit_displacement_relative,
            "passed": limit_displacement_error <= case.tolerances.limit_displacement_relative,
            "measured": measured_displacement,
            "reference": case.reference.upper_limit.displacement,
            "step": native.frames[limit_index].step
        }));
    }
    let summary = json!({
        "caseId": case.id,
        "steps": native.steps.len(),
        "limitPointReached": limit_reached,
        "measuredLimitLoad": measured_load,
        "referenceLimitLoad": case.reference.upper_limit.load,
        "limitLoadRelativeError": limit_load_error,
        "measuredLimitDisplacement": measured_displacement,
        "referenceLimitDisplacement": case.reference.upper_limit.displacement,
        "limitDisplacementRelativeError": limit_displacement_error,
        "maxEquilibriumPathError": max_path_error,
        "maxEquilibriumPathErrorStep": max_path_step
    });
    Ok((checks, summary))
}

fn validation(case_file: &CaseFile, native: &NativeResults) -> Result<Value, String> {
    let mut checks = Vec::new();
    let mut summaries = Vec::new();
    for (case, result) in case_file.cases.iter().zip(&native.cases) {
        let (mut case_checks, summary) = validate(case, result)?;
        checks.append(&mut case_checks);
        summaries.push(summary);
    }
    let all_passed = checks.iter().all(|c| c["passed"] == Value::Bool(true));
    Ok(json!({
        "schemaVersion": 1,
        "caseFile": "arc_length_snap_through.json",
        "checks": checks,
        "caseSummaries": summaries,
        "allPassed": all_passed
    }))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let mut text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    text.push('\n');
    fs::write(path, text).map_err(|e| format!("{}: {e}", path.display()))
}

fn manifest(reference_dir: &Path) -> Result<Value, String> {
    let names = [
        "arc_length_snap_through.json",
        "native-results.json",
        "VALIDATION.json",
    ];
    let mut hashes = serde_json::Map::new();
    for name in names {
        let bytes = fs::read(reference_dir.join(name))
            .map_err(|e| format!("{}: {e}", reference_dir.join(name).display()))?;
        hashes.insert(name.to_owned(), Value::String(sha256(&bytes)));
    }
    Ok(json!({
        "produced_by": "cargo run --release -- generate in research/numerical-methods/riks-crisfield/native",
        "files_sha256": hashes
    }))
}

fn sha256(bytes: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h = [
        0x6a09e667_u32,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut data = bytes.to_vec();
    let bit_len = (data.len() as u64).wrapping_mul(8);
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in data.chunks_exact(64) {
        let mut w = [0_u32; 64];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes(word.try_into().unwrap());
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (state, value) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *state = state.wrapping_add(value);
        }
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

fn reference_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("reference-results")
}

fn execute(mode: &str) -> Result<bool, String> {
    let dir = reference_dir();
    let case_path = dir.join("arc_length_snap_through.json");
    let case_file: CaseFile = serde_json::from_value(read_json(&case_path)?)
        .map_err(|e| format!("{}: {e}", case_path.display()))?;
    let cases = case_file
        .cases
        .iter()
        .map(run_case)
        .collect::<Result<Vec<_>, _>>()?;
    let native = NativeResults {
        schema_version: 1,
        case_file: "arc_length_snap_through.json".into(),
        solver: "dedaliano_engine::solver::arc_length::solve_arc_length".into(),
        frame_method: "For every recorded step k, rerun production solve_arc_length with maxSteps=k and require exact equality of all k step records before storing that run's displacement frame.".into(),
        cases,
    };
    let native_value = serde_json::to_value(&native).map_err(|e| e.to_string())?;
    let validation_value = validation(&case_file, &native)?;
    let validation_passed = validation_value["allPassed"] == Value::Bool(true);

    match mode {
        "generate" => {
            write_json(&dir.join("native-results.json"), &native_value)?;
            write_json(&dir.join("VALIDATION.json"), &validation_value)?;
            let manifest_value = manifest(&dir)?;
            write_json(&dir.join("MANIFEST.json"), &manifest_value)?;
            println!(
                "{}",
                serde_json::to_string(&json!({
                    "mode": mode,
                    "nativeResults": "reference-results/native-results.json",
                    "validation": "reference-results/VALIDATION.json",
                    "manifest": "reference-results/MANIFEST.json",
                    "allPassed": validation_passed
                }))
                .unwrap()
            );
            Ok(true)
        }
        "check" => {
            let native_matches = read_json(&dir.join("native-results.json"))? == native_value;
            let validation_matches = read_json(&dir.join("VALIDATION.json"))? == validation_value;
            let manifest_matches = read_json(&dir.join("MANIFEST.json"))? == manifest(&dir)?;
            let ok = native_matches && validation_matches && manifest_matches;
            println!(
                "{}",
                serde_json::to_string(&json!({
                    "mode": mode,
                    "nativeOutputMatches": native_matches,
                    "validationMatches": validation_matches,
                    "manifestMatches": manifest_matches,
                    "validationPassed": validation_passed,
                    "allPassed": ok
                }))
                .unwrap()
            );
            Ok(ok)
        }
        _ => Err("usage: cargo run --release -- generate|check".into()),
    }
}

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_default();
    match execute(&mode) {
        Ok(true) => {}
        Ok(false) => {
            eprintln!("Riks/Crisfield evidence checks failed");
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
