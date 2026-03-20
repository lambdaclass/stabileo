/// Differential fuzzing — verify Rust solver matches TS solver fixtures.
///
/// Loads JSON fixtures from `web/src/lib/templates/fixtures/`,
/// runs Rust solver on the same input, and compares results field-by-field.
///
/// Both Rust and TS solvers use the same convention: f = K·u - FEF (subtractive).
/// Element forces (n_start, v_start, m_start, etc.) are compared directly AND via
/// diagram evaluation at interior points for maximum coverage.
///
/// Fixtures are pre-generated JSON files in web/src/lib/templates/fixtures/.
/// Run: cd engine && cargo test --test differential_fuzz

use dedaliano_engine::postprocess::combinations::*;
use dedaliano_engine::postprocess::diagrams::compute_diagram_value_at;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;
use std::path::Path;

// ─── Comparison helpers ──────────────────────────────────────────

use crate::common::tolerance::parity;
const REL_TOL_DISP: f64 = parity::REL_TOL_DISP;
const REL_TOL_FORCE: f64 = parity::REL_TOL_FORCE;
const ABS_TOL: f64 = parity::ABS_TOL;

fn close(actual: f64, expected: f64, rel_tol: f64) -> bool {
    let diff = (actual - expected).abs();
    if diff < ABS_TOL {
        return true;
    }
    let denom = expected.abs().max(1.0);
    diff / denom < rel_tol
}

fn assert_close(actual: f64, expected: f64, rel_tol: f64, label: &str) {
    assert!(
        close(actual, expected, rel_tol),
        "{}: actual={:.8e}, expected={:.8e}, diff={:.4e}",
        label,
        actual,
        expected,
        (actual - expected).abs()
    );
}

// ─── Fixture loading ─────────────────────────────────────────────

fn fixtures_dir() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
}

fn load_fixture(name: &str) -> Option<String> {
    let path = fixtures_dir().join(format!("{}.json", name));
    if path.exists() {
        Some(std::fs::read_to_string(&path).unwrap_or_else(|e| {
            panic!("Failed to read fixture {}: {}", name, e)
        }))
    } else {
        None
    }
}

fn fixture_exists(name: &str) -> bool {
    fixtures_dir().join(format!("{}.json", name)).exists()
}

// ─── Displacement + reaction comparison ──────────────────────────

fn compare_displacements(prefix: &str, actual: &AnalysisResults, expected: &AnalysisResults) {
    let mut actual_disp: Vec<_> = actual.displacements.clone();
    let mut expected_disp: Vec<_> = expected.displacements.clone();
    actual_disp.sort_by_key(|d| d.node_id);
    expected_disp.sort_by_key(|d| d.node_id);

    assert_eq!(
        actual_disp.len(),
        expected_disp.len(),
        "{}: displacement count mismatch",
        prefix
    );
    for (a, e) in actual_disp.iter().zip(expected_disp.iter()) {
        assert_eq!(
            a.node_id, e.node_id,
            "{}: node_id mismatch in displacements",
            prefix
        );
        let lbl = format!("{} node{}", prefix, a.node_id);
        assert_close(a.ux, e.ux, REL_TOL_DISP, &format!("{} ux", lbl));
        assert_close(a.uz, e.uz, REL_TOL_DISP, &format!("{} uy", lbl));
        assert_close(a.ry, e.ry, REL_TOL_DISP, &format!("{} rz", lbl));
    }
}

fn compare_reactions(prefix: &str, actual: &AnalysisResults, expected: &AnalysisResults) {
    let mut actual_react: Vec<_> = actual.reactions.clone();
    let mut expected_react: Vec<_> = expected.reactions.clone();
    actual_react.sort_by_key(|r| r.node_id);
    expected_react.sort_by_key(|r| r.node_id);

    assert_eq!(
        actual_react.len(),
        expected_react.len(),
        "{}: reaction count mismatch",
        prefix
    );
    for (a, e) in actual_react.iter().zip(expected_react.iter()) {
        assert_eq!(
            a.node_id, e.node_id,
            "{}: node_id mismatch in reactions",
            prefix
        );
        let lbl = format!("{} react{}", prefix, a.node_id);
        assert_close(a.rx, e.rx, REL_TOL_FORCE, &format!("{} rx", lbl));
        assert_close(a.rz, e.rz, REL_TOL_FORCE, &format!("{} ry", lbl));
        assert_close(a.my, e.my, REL_TOL_FORCE, &format!("{} mz", lbl));
    }
}

// ─── Full element force comparison: direct + interior diagrams ────
// Both Rust and TS use f = K·u - FEF, so raw force fields match directly.
// Additionally, diagram values at interior points are compared on BOTH
// sides to verify the load contribution formulas are consistent.

fn compare_element_forces_full(
    prefix: &str,
    actual: &AnalysisResults,
    expected: &AnalysisResults,
) {
    let mut actual_ef: Vec<_> = actual.element_forces.clone();
    let mut expected_ef: Vec<_> = expected.element_forces.clone();
    actual_ef.sort_by_key(|f| f.element_id);
    expected_ef.sort_by_key(|f| f.element_id);

    assert_eq!(
        actual_ef.len(),
        expected_ef.len(),
        "{}: element forces count mismatch",
        prefix
    );

    for (a, e) in actual_ef.iter().zip(expected_ef.iter()) {
        assert_eq!(
            a.element_id, e.element_id,
            "{}: element_id mismatch",
            prefix
        );
        let lbl = format!("{} elem{}", prefix, a.element_id);

        // 1) Direct raw force comparison (strongest check)
        assert_close(a.n_start, e.n_start, REL_TOL_FORCE, &format!("{} nStart", lbl));
        assert_close(a.n_end, e.n_end, REL_TOL_FORCE, &format!("{} nEnd", lbl));
        assert_close(a.v_start, e.v_start, REL_TOL_FORCE, &format!("{} vStart", lbl));
        assert_close(a.v_end, e.v_end, REL_TOL_FORCE, &format!("{} vEnd", lbl));
        assert_close(a.m_start, e.m_start, REL_TOL_FORCE, &format!("{} mStart", lbl));
        assert_close(a.m_end, e.m_end, REL_TOL_FORCE, &format!("{} mEnd", lbl));

        // 2) Interior diagram comparison at 9 points (t = 0.1, 0.2, ..., 0.9)
        // Evaluates diagram formulas on BOTH Rust and TS element forces to
        // verify load contributions (distributed, point, thermal) are identical.
        for i in 1..=9 {
            let t = i as f64 / 10.0;
            for kind in &["moment", "shear", "axial"] {
                let val_rust = compute_diagram_value_at(kind, t, a);
                let val_ts = compute_diagram_value_at(kind, t, e);
                assert_close(
                    val_rust,
                    val_ts,
                    REL_TOL_FORCE,
                    &format!("{} {}(t={:.1})", lbl, kind, t),
                );
            }
        }
    }
}

// ─── Direct element force comparison (for combo results in same convention) ──

fn compare_element_forces_direct(
    prefix: &str,
    actual: &AnalysisResults,
    expected: &AnalysisResults,
) {
    let mut actual_ef: Vec<_> = actual.element_forces.clone();
    let mut expected_ef: Vec<_> = expected.element_forces.clone();
    actual_ef.sort_by_key(|f| f.element_id);
    expected_ef.sort_by_key(|f| f.element_id);

    assert_eq!(
        actual_ef.len(),
        expected_ef.len(),
        "{}: element forces count mismatch",
        prefix
    );
    for (a, e) in actual_ef.iter().zip(expected_ef.iter()) {
        let lbl = format!("{} elem{}", prefix, a.element_id);
        assert_close(a.n_start, e.n_start, REL_TOL_FORCE, &format!("{} nStart", lbl));
        assert_close(a.n_end, e.n_end, REL_TOL_FORCE, &format!("{} nEnd", lbl));
        assert_close(a.v_start, e.v_start, REL_TOL_FORCE, &format!("{} vStart", lbl));
        assert_close(a.v_end, e.v_end, REL_TOL_FORCE, &format!("{} vEnd", lbl));
        assert_close(a.m_start, e.m_start, REL_TOL_FORCE, &format!("{} mStart", lbl));
        assert_close(a.m_end, e.m_end, REL_TOL_FORCE, &format!("{} mEnd", lbl));
    }
}

// ─── 3D element force comparison ─────────────────────────────────
// Both Rust and TS solvers now use SAP2000/textbook local axis convention,
// so element forces (n, vy, vz, mx, my, mz) can be compared directly.

fn compare_element_forces_3d(
    prefix: &str,
    actual: &AnalysisResults3D,
    expected: &AnalysisResults3D,
    rel_tol: f64,
) {
    let mut actual_ef: Vec<_> = actual.element_forces.clone();
    let mut expected_ef: Vec<_> = expected.element_forces.clone();
    actual_ef.sort_by_key(|f| f.element_id);
    expected_ef.sort_by_key(|f| f.element_id);

    assert_eq!(
        actual_ef.len(),
        expected_ef.len(),
        "{}: 3D element forces count mismatch",
        prefix
    );

    for (a, e) in actual_ef.iter().zip(expected_ef.iter()) {
        assert_eq!(
            a.element_id, e.element_id,
            "{}: 3D element_id mismatch",
            prefix
        );
        let lbl = format!("{} elem{}", prefix, a.element_id);

        assert_close(a.n_start, e.n_start, rel_tol, &format!("{} n_start", lbl));
        assert_close(a.n_end, e.n_end, rel_tol, &format!("{} n_end", lbl));
        assert_close(a.vy_start, e.vy_start, rel_tol, &format!("{} vy_start", lbl));
        assert_close(a.vy_end, e.vy_end, rel_tol, &format!("{} vy_end", lbl));
        assert_close(a.vz_start, e.vz_start, rel_tol, &format!("{} vz_start", lbl));
        assert_close(a.vz_end, e.vz_end, rel_tol, &format!("{} vz_end", lbl));
        assert_close(a.mx_start, e.mx_start, rel_tol, &format!("{} mx_start", lbl));
        assert_close(a.mx_end, e.mx_end, rel_tol, &format!("{} mx_end", lbl));
        assert_close(a.my_start, e.my_start, rel_tol, &format!("{} my_start", lbl));
        assert_close(a.my_end, e.my_end, rel_tol, &format!("{} my_end", lbl));
        assert_close(a.mz_start, e.mz_start, rel_tol, &format!("{} mz_start", lbl));
        assert_close(a.mz_end, e.mz_end, rel_tol, &format!("{} mz_end", lbl));
    }
}

// ─── 3D comparison (displacements + reactions + element forces) ──

fn compare_results_3d(prefix: &str, actual: &AnalysisResults3D, expected: &AnalysisResults3D) {
    let mut actual_disp: Vec<_> = actual.displacements.clone();
    let mut expected_disp: Vec<_> = expected.displacements.clone();
    actual_disp.sort_by_key(|d| d.node_id);
    expected_disp.sort_by_key(|d| d.node_id);

    assert_eq!(
        actual_disp.len(),
        expected_disp.len(),
        "{}: 3D displacement count mismatch",
        prefix
    );
    for (a, e) in actual_disp.iter().zip(expected_disp.iter()) {
        let lbl = format!("{} node{}", prefix, a.node_id);
        assert_close(a.ux, e.ux, REL_TOL_DISP, &format!("{} ux", lbl));
        assert_close(a.uy, e.uy, REL_TOL_DISP, &format!("{} uy", lbl));
        assert_close(a.uz, e.uz, REL_TOL_DISP, &format!("{} uz", lbl));
        assert_close(a.rx, e.rx, REL_TOL_DISP, &format!("{} rx", lbl));
        assert_close(a.ry, e.ry, REL_TOL_DISP, &format!("{} ry", lbl));
        assert_close(a.rz, e.rz, REL_TOL_DISP, &format!("{} rz", lbl));
    }

    let mut actual_react: Vec<_> = actual.reactions.clone();
    let mut expected_react: Vec<_> = expected.reactions.clone();
    actual_react.sort_by_key(|r| r.node_id);
    expected_react.sort_by_key(|r| r.node_id);

    assert_eq!(
        actual_react.len(),
        expected_react.len(),
        "{}: 3D reaction count mismatch",
        prefix
    );
    for (a, e) in actual_react.iter().zip(expected_react.iter()) {
        let lbl = format!("{} react{}", prefix, a.node_id);
        assert_close(a.fx, e.fx, REL_TOL_FORCE, &format!("{} fx", lbl));
        assert_close(a.fy, e.fy, REL_TOL_FORCE, &format!("{} fy", lbl));
        assert_close(a.fz, e.fz, REL_TOL_FORCE, &format!("{} fz", lbl));
        assert_close(a.mx, e.mx, REL_TOL_FORCE, &format!("{} mx", lbl));
        assert_close(a.my, e.my, REL_TOL_FORCE, &format!("{} my", lbl));
        assert_close(a.mz, e.mz, REL_TOL_FORCE, &format!("{} mz", lbl));
    }

    // Full element force comparison (both solvers now use same local axis convention)
    compare_element_forces_3d(prefix, actual, expected, REL_TOL_FORCE);
}

// ─── Canonical 2D solve parity ───────────────────────────────────

fn run_2d_parity(name: &str) {
    let input_json = load_fixture(&format!("{}-input", name))
        .unwrap_or_else(|| {
            panic!(
                "Missing fixture {}-input.json — run fixture generator first",
                name
            )
        });
    let expected_json = load_fixture(&format!("{}-results", name))
        .unwrap_or_else(|| panic!("Missing fixture {}-results.json", name));

    let input: SolverInput = serde_json::from_str(&input_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-input.json: {}", name, e));
    let expected: AnalysisResults = serde_json::from_str(&expected_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-results.json: {}", name, e));

    let actual =
        solve_2d(&input).unwrap_or_else(|e| panic!("Rust solver failed on {}: {}", name, e));

    compare_displacements(name, &actual, &expected);
    compare_reactions(name, &actual, &expected);
    compare_element_forces_full(name, &actual, &expected);
}

#[test]
fn test_fuzz_ss_beam() {
    run_2d_parity("ss-beam");
}

#[test]
fn test_fuzz_cantilever() {
    run_2d_parity("cantilever");
}

#[test]
fn test_fuzz_portal_d() {
    run_2d_parity("portal-d");
}

#[test]
fn test_fuzz_portal_l() {
    run_2d_parity("portal-l");
}

#[test]
fn test_fuzz_portal_w() {
    run_2d_parity("portal-w");
}

// ─── 3D canonical test ───────────────────────────────────────────

#[test]
fn test_fuzz_cantilever_3d() {
    let input_json = load_fixture("cantilever-3d-input")
        .expect("Missing cantilever-3d-input.json — run fixture generator first");
    let expected_json =
        load_fixture("cantilever-3d-results").expect("Missing cantilever-3d-results.json");

    let input: SolverInput3D =
        serde_json::from_str(&input_json).expect("Failed to parse cantilever-3d-input.json");
    let expected: AnalysisResults3D =
        serde_json::from_str(&expected_json).expect("Failed to parse cantilever-3d-results.json");

    let actual = solve_3d(&input).expect("Rust 3D solver failed");

    compare_results_3d("cantilever-3d", &actual, &expected);
}

// ─── Combination parity ─────────────────────────────────────────
// Combo tests use TS fixture results as input to Rust combine_results.
// Both sides share the same convention → direct comparison works.

fn run_combo_parity(name: &str, case_names: &[(&str, usize)]) {
    let combo_json =
        load_fixture(name).unwrap_or_else(|| panic!("Missing fixture {}.json", name));

    let combo_data: serde_json::Value = serde_json::from_str(&combo_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}.json: {}", name, e));

    let expected: AnalysisResults = serde_json::from_value(combo_data["results"].clone())
        .unwrap_or_else(|e| panic!("Failed to parse results from {}.json: {}", name, e));

    let factors_val = combo_data["factors"].as_array().unwrap();
    let mut factors = Vec::new();
    let mut cases = Vec::new();

    for f in factors_val {
        let case_id = f["caseId"].as_u64().unwrap() as usize;
        let factor = f["factor"].as_f64().unwrap();
        factors.push(CombinationFactor { case_id, factor });

        let case_name = case_names
            .iter()
            .find(|(_, id)| *id == case_id)
            .unwrap_or_else(|| panic!("No case fixture for caseId {} in {}", case_id, name))
            .0;
        let case_results_json = load_fixture(&format!("{}-results", case_name))
            .unwrap_or_else(|| panic!("Missing {}-results.json for combo {}", case_name, name));
        let case_results: AnalysisResults = serde_json::from_str(&case_results_json).unwrap();
        cases.push(CaseEntry {
            case_id,
            results: case_results,
        });
    }

    let actual = combine_results(&CombinationInput { factors, cases })
        .unwrap_or_else(|| panic!("Rust combine_results returned None for {}", name));

    compare_displacements(&format!("combo:{}", name), &actual, &expected);
    compare_reactions(&format!("combo:{}", name), &actual, &expected);
    compare_element_forces_direct(&format!("combo:{}", name), &actual, &expected);
}

#[test]
fn test_fuzz_portal_combo_12d_16l() {
    run_combo_parity(
        "portal-combo-12d-16l",
        &[("portal-d", 1), ("portal-l", 2), ("portal-w", 3)],
    );
}

#[test]
fn test_fuzz_portal_combo_12d_l_16w() {
    run_combo_parity(
        "portal-combo-12d-l-16w",
        &[("portal-d", 1), ("portal-l", 2), ("portal-w", 3)],
    );
}

#[test]
fn test_fuzz_portal_combo_09d_16w() {
    run_combo_parity(
        "portal-combo-09d-16w",
        &[("portal-d", 1), ("portal-l", 2), ("portal-w", 3)],
    );
}

// ─── Envelope parity ─────────────────────────────────────────────
// Solve each case with Rust, combine, compute envelope, compare against TS fixture.

#[test]
fn test_fuzz_portal_envelope() {
    let envelope_json = load_fixture("portal-envelope")
        .expect("Missing portal-envelope.json — run fixture generator first");
    let expected: FullEnvelope =
        serde_json::from_str(&envelope_json).expect("Failed to parse portal-envelope.json");

    // Solve each case with Rust solver
    let case_inputs: Vec<(&str, usize)> = vec![("portal-d", 1), ("portal-l", 2), ("portal-w", 3)];
    let mut rust_case_results: std::collections::HashMap<usize, AnalysisResults> =
        std::collections::HashMap::new();
    for &(case_name, case_id) in &case_inputs {
        let json = load_fixture(&format!("{}-input", case_name)).unwrap();
        let input: SolverInput = serde_json::from_str(&json).unwrap();
        let result = solve_2d(&input).unwrap();
        rust_case_results.insert(case_id, result);
    }

    // Build combos using Rust solver results
    let combos_spec: Vec<Vec<(usize, f64)>> = vec![
        vec![(1, 1.2), (2, 1.6)],
        vec![(1, 1.2), (2, 1.0), (3, 1.6)],
        vec![(1, 0.9), (3, 1.6)],
    ];

    let mut combo_results = Vec::new();
    for factors_spec in &combos_spec {
        let factors: Vec<CombinationFactor> = factors_spec
            .iter()
            .map(|&(case_id, factor)| CombinationFactor { case_id, factor })
            .collect();
        let cases: Vec<CaseEntry> = factors_spec
            .iter()
            .map(|&(case_id, _)| CaseEntry {
                case_id,
                results: rust_case_results[&case_id].clone(),
            })
            .collect();
        combo_results.push(combine_results(&CombinationInput { factors, cases }).unwrap());
    }

    let actual = compute_envelope(&combo_results).expect("Rust compute_envelope returned None");

    // Compare globalMax for each diagram kind
    assert_close(
        actual.moment.global_max,
        expected.moment.global_max,
        REL_TOL_FORCE,
        "envelope moment globalMax",
    );
    assert_close(
        actual.shear.global_max,
        expected.shear.global_max,
        REL_TOL_FORCE,
        "envelope shear globalMax",
    );
    assert_close(
        actual.axial.global_max,
        expected.axial.global_max,
        REL_TOL_FORCE,
        "envelope axial globalMax",
    );

    // Compare maxAbsResults: displacements and reactions
    compare_displacements(
        "envelope:maxAbs",
        &actual.max_abs_results,
        &expected.max_abs_results,
    );
    compare_reactions(
        "envelope:maxAbs",
        &actual.max_abs_results,
        &expected.max_abs_results,
    );

    // Compare per-element envelope diagram data
    for kind_name in &["moment", "shear", "axial"] {
        let (actual_diag, expected_diag) = match *kind_name {
            "moment" => (&actual.moment, &expected.moment),
            "shear" => (&actual.shear, &expected.shear),
            "axial" => (&actual.axial, &expected.axial),
            _ => unreachable!(),
        };

        assert_eq!(
            actual_diag.elements.len(),
            expected_diag.elements.len(),
            "Envelope {} element count mismatch",
            kind_name
        );

        let mut actual_elems = actual_diag.elements.clone();
        let mut expected_elems = expected_diag.elements.clone();
        actual_elems.sort_by_key(|e| e.element_id);
        expected_elems.sort_by_key(|e| e.element_id);

        for (ae, ee) in actual_elems.iter().zip(expected_elems.iter()) {
            assert_eq!(ae.element_id, ee.element_id);
            for (j, ((ap, an), (ep, en))) in ae
                .pos_values
                .iter()
                .zip(ae.neg_values.iter())
                .zip(ee.pos_values.iter().zip(ee.neg_values.iter()))
                .enumerate()
            {
                let lbl = format!(
                    "envelope {} elem{} pt{}",
                    kind_name, ae.element_id, j
                );
                assert_close(*ap, *ep, REL_TOL_FORCE, &format!("{} pos", lbl));
                assert_close(*an, *en, REL_TOL_FORCE, &format!("{} neg", lbl));
            }
        }
    }
}

// ─── Random model parity ─────────────────────────────────────────

/// Run 2D parity with relaxed reaction comparison (matches by node ID,
/// tolerates extra reactions from Rust roller support handling).
fn run_2d_parity_relaxed_reactions(name: &str) {
    let input_json = load_fixture(&format!("{}-input", name))
        .unwrap_or_else(|| panic!("Missing fixture {}-input.json", name));
    let expected_json = load_fixture(&format!("{}-results", name))
        .unwrap_or_else(|| panic!("Missing fixture {}-results.json", name));

    let input: SolverInput = serde_json::from_str(&input_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-input.json: {}", name, e));
    let expected: AnalysisResults = serde_json::from_str(&expected_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-results.json: {}", name, e));

    let actual =
        solve_2d(&input).unwrap_or_else(|e| panic!("Rust solver failed on {}: {}", name, e));

    compare_displacements(name, &actual, &expected);

    // Relaxed reaction comparison: compare by matching node IDs
    let expected_node_ids: std::collections::HashSet<usize> =
        expected.reactions.iter().map(|r| r.node_id).collect();
    for a in &actual.reactions {
        if let Some(e) = expected.reactions.iter().find(|r| r.node_id == a.node_id) {
            let lbl = format!("{} react{}", name, a.node_id);
            assert_close(a.rx, e.rx, REL_TOL_FORCE, &format!("{} rx", lbl));
            assert_close(a.rz, e.rz, REL_TOL_FORCE, &format!("{} ry", lbl));
            assert_close(a.my, e.my, REL_TOL_FORCE, &format!("{} mz", lbl));
        }
    }
    // Verify all expected reactions are present in actual
    let actual_node_ids: std::collections::HashSet<usize> =
        actual.reactions.iter().map(|r| r.node_id).collect();
    for e_id in &expected_node_ids {
        assert!(
            actual_node_ids.contains(e_id),
            "{}: expected reaction at node {} not found in Rust output",
            name,
            e_id
        );
    }

    compare_element_forces_full(name, &actual, &expected);
}

macro_rules! random_parity_test {
    ($name:ident, $seed:expr) => {
        #[test]
        fn $name() {
            let seed = $seed;
            let skip_name = format!("random-{}-skip", seed);
            if fixture_exists(&skip_name) {
                return;
            }
            let input_name = format!("random-{}-input", seed);
            if !fixture_exists(&input_name) {
                eprintln!("Skipping random-{}: fixture not found", seed);
                return;
            }
            // Use relaxed reactions for random models (Rust may emit extra
            // reactions for roller supports that TS omits)
            run_2d_parity_relaxed_reactions(&format!("random-{}", seed));
        }
    };
}

random_parity_test!(test_fuzz_random_1, 1);
random_parity_test!(test_fuzz_random_2, 2);
random_parity_test!(test_fuzz_random_3, 3);
random_parity_test!(test_fuzz_random_4, 4);
random_parity_test!(test_fuzz_random_5, 5);
random_parity_test!(test_fuzz_random_6, 6);
random_parity_test!(test_fuzz_random_7, 7);
random_parity_test!(test_fuzz_random_8, 8);
random_parity_test!(test_fuzz_random_9, 9);
random_parity_test!(test_fuzz_random_10, 10);
random_parity_test!(test_fuzz_random_11, 11);
random_parity_test!(test_fuzz_random_12, 12);
random_parity_test!(test_fuzz_random_13, 13);
random_parity_test!(test_fuzz_random_14, 14);
random_parity_test!(test_fuzz_random_15, 15);
random_parity_test!(test_fuzz_random_16, 16);
random_parity_test!(test_fuzz_random_17, 17);
random_parity_test!(test_fuzz_random_18, 18);
random_parity_test!(test_fuzz_random_19, 19);
random_parity_test!(test_fuzz_random_20, 20);
random_parity_test!(test_fuzz_random_21, 21);
random_parity_test!(test_fuzz_random_22, 22);
random_parity_test!(test_fuzz_random_23, 23);
random_parity_test!(test_fuzz_random_24, 24);
random_parity_test!(test_fuzz_random_25, 25);
random_parity_test!(test_fuzz_random_26, 26);
random_parity_test!(test_fuzz_random_27, 27);
random_parity_test!(test_fuzz_random_28, 28);
random_parity_test!(test_fuzz_random_29, 29);
random_parity_test!(test_fuzz_random_30, 30);
random_parity_test!(test_fuzz_random_31, 31);
random_parity_test!(test_fuzz_random_32, 32);
random_parity_test!(test_fuzz_random_33, 33);
random_parity_test!(test_fuzz_random_34, 34);
random_parity_test!(test_fuzz_random_35, 35);
random_parity_test!(test_fuzz_random_36, 36);
random_parity_test!(test_fuzz_random_37, 37);
random_parity_test!(test_fuzz_random_38, 38);
random_parity_test!(test_fuzz_random_39, 39);
random_parity_test!(test_fuzz_random_40, 40);
random_parity_test!(test_fuzz_random_41, 41);
random_parity_test!(test_fuzz_random_42, 42);
random_parity_test!(test_fuzz_random_43, 43);
random_parity_test!(test_fuzz_random_44, 44);
random_parity_test!(test_fuzz_random_45, 45);
random_parity_test!(test_fuzz_random_46, 46);
random_parity_test!(test_fuzz_random_47, 47);
random_parity_test!(test_fuzz_random_48, 48);
random_parity_test!(test_fuzz_random_49, 49);
random_parity_test!(test_fuzz_random_50, 50);

// ─── Random 3D model parity ─────────────────────────────────────
// Tests random 3D frame models with asymmetric sections (Iy ≠ Iz)
// and distributed loads in both local Y and Z. Detects local axis
// convention mismatches between TS and Rust solvers.

macro_rules! random_3d_parity_test {
    ($name:ident, $seed:expr) => {
        #[test]
        fn $name() {
            let seed = $seed;
            let skip_name = format!("random3d-{}-skip", seed);
            if fixture_exists(&skip_name) {
                return;
            }
            let input_name = format!("random3d-{}-input", seed);
            if !fixture_exists(&input_name) {
                eprintln!("Skipping random3d-{}: fixture not found", seed);
                return;
            }
            run_3d_parity(&format!("random3d-{}", seed));
        }
    };
}

random_3d_parity_test!(test_fuzz_random3d_1, 1);
random_3d_parity_test!(test_fuzz_random3d_2, 2);
random_3d_parity_test!(test_fuzz_random3d_3, 3);
random_3d_parity_test!(test_fuzz_random3d_4, 4);
random_3d_parity_test!(test_fuzz_random3d_5, 5);
random_3d_parity_test!(test_fuzz_random3d_6, 6);
random_3d_parity_test!(test_fuzz_random3d_7, 7);
random_3d_parity_test!(test_fuzz_random3d_8, 8);
random_3d_parity_test!(test_fuzz_random3d_9, 9);
random_3d_parity_test!(test_fuzz_random3d_10, 10);
random_3d_parity_test!(test_fuzz_random3d_11, 11);
random_3d_parity_test!(test_fuzz_random3d_12, 12);
random_3d_parity_test!(test_fuzz_random3d_13, 13);
random_3d_parity_test!(test_fuzz_random3d_14, 14);
random_3d_parity_test!(test_fuzz_random3d_15, 15);
random_3d_parity_test!(test_fuzz_random3d_16, 16);
random_3d_parity_test!(test_fuzz_random3d_17, 17);
random_3d_parity_test!(test_fuzz_random3d_18, 18);
random_3d_parity_test!(test_fuzz_random3d_19, 19);
random_3d_parity_test!(test_fuzz_random3d_20, 20);

// ─── Example model parity (2D single-case) ──────────────────────
// These test every built-in example model in the app: trusses, hinges,
// thermal loads, springs, prescribed displacements, point loads on
// elements, multi-section frames, arches, and large structures.

macro_rules! example_2d_parity_test {
    ($name:ident, $fixture:expr) => {
        #[test]
        fn $name() {
            let fixture_name = $fixture;
            if !fixture_exists(&format!("{}-input", fixture_name)) {
                eprintln!(
                    "Skipping {}: fixture not found — run fixture generator first",
                    fixture_name
                );
                return;
            }
            run_2d_parity(fixture_name);
        }
    };
}

example_2d_parity_test!(test_ex_simply_supported, "ex-simply-supported");
example_2d_parity_test!(test_ex_cantilever, "ex-cantilever");
example_2d_parity_test!(test_ex_portal_frame, "ex-portal-frame");
example_2d_parity_test!(test_ex_continuous_beam, "ex-continuous-beam");
example_2d_parity_test!(test_ex_two_story_frame, "ex-two-story-frame");
example_2d_parity_test!(test_ex_point_loads, "ex-point-loads");
example_2d_parity_test!(test_ex_cantilever_point, "ex-cantilever-point");
example_2d_parity_test!(test_ex_multi_section_frame, "ex-multi-section-frame");
example_2d_parity_test!(test_ex_color_map_demo, "ex-color-map-demo");
example_2d_parity_test!(test_ex_bridge_moving_load, "ex-bridge-moving-load");
example_2d_parity_test!(test_ex_bridge_highway, "ex-bridge-highway");
example_2d_parity_test!(test_ex_truss, "ex-truss");
example_2d_parity_test!(test_ex_warren_truss, "ex-warren-truss");
example_2d_parity_test!(test_ex_howe_truss, "ex-howe-truss");

// ─── Previously known parity gaps — now fixed ───────────────────

example_2d_parity_test!(test_ex_spring_support, "ex-spring-support");
example_2d_parity_test!(test_ex_settlement, "ex-settlement");
example_2d_parity_test!(test_ex_thermal, "ex-thermal");
example_2d_parity_test!(test_ex_gerber_beam, "ex-gerber-beam");
example_2d_parity_test!(test_ex_three_hinge_arch, "ex-three-hinge-arch");

// ─── Example model parity (2D multi-case) ───────────────────────
// Tests per-case solve + combination + envelope for models with load cases.

/// Run multi-case 2D parity: solve each case with Rust, combine with TS results, compare.
///
/// Per-case: Rust solver vs TS fixture (direct forces + interior diagrams).
/// Combos: Use TS per-case fixture results as input to Rust combine_results, then
/// compare directly against TS combo results.
fn run_multicase_2d_parity(prefix: &str) {
    // Load metadata
    let meta_json = match load_fixture(&format!("{}-meta", prefix)) {
        Some(j) => j,
        None => {
            eprintln!("Skipping {}: meta fixture not found", prefix);
            return;
        }
    };
    let meta: serde_json::Value = serde_json::from_str(&meta_json).unwrap();

    let load_cases = meta["loadCases"].as_array().unwrap();
    let mut case_names: Vec<(usize, String)> = Vec::new();
    let mut ts_case_results: std::collections::HashMap<usize, AnalysisResults> =
        std::collections::HashMap::new();
    let mut rust_case_results: std::collections::HashMap<usize, AnalysisResults> =
        std::collections::HashMap::new();

    for lc in load_cases {
        let case_id = lc["id"].as_u64().unwrap() as usize;
        let case_name = lc["name"].as_str().unwrap();
        case_names.push((case_id, case_name.to_string()));

        // Run 2D parity on per-case fixture (Rust solve vs TS fixture)
        let input_json = match load_fixture(&format!("{}-input", case_name)) {
            Some(j) => j,
            None => continue,
        };
        let expected_json = match load_fixture(&format!("{}-results", case_name)) {
            Some(j) => j,
            None => continue,
        };

        let input: SolverInput = serde_json::from_str(&input_json).unwrap();
        let expected: AnalysisResults = serde_json::from_str(&expected_json).unwrap();
        let actual = solve_2d(&input).unwrap_or_else(|e| {
            panic!("Rust solver failed on {} case {}: {}", prefix, case_id, e)
        });

        compare_displacements(case_name, &actual, &expected);
        compare_reactions(case_name, &actual, &expected);
        compare_element_forces_full(case_name, &actual, &expected);

        // Store both convention results for different comparison phases
        ts_case_results.insert(case_id, expected);
        rust_case_results.insert(case_id, actual);
    }

    // Test combinations using TS per-case results as input
    let combinations = meta["combinations"].as_array().unwrap();

    for combo in combinations {
        let combo_id = combo["id"].as_u64().unwrap();
        let combo_fixture = format!("{}-combo{}", prefix, combo_id);
        let combo_json = match load_fixture(&combo_fixture) {
            Some(j) => j,
            None => continue,
        };

        let combo_data: serde_json::Value = serde_json::from_str(&combo_json).unwrap();
        let expected: AnalysisResults =
            serde_json::from_value(combo_data["results"].clone()).unwrap();

        let factors_val = combo_data["factors"].as_array().unwrap();
        let mut factors = Vec::new();
        let mut cases = Vec::new();

        for f in factors_val {
            let case_id = f["caseId"].as_u64().unwrap() as usize;
            let factor = f["factor"].as_f64().unwrap();
            factors.push(CombinationFactor { case_id, factor });
            if let Some(r) = ts_case_results.get(&case_id) {
                cases.push(CaseEntry {
                    case_id,
                    results: r.clone(),
                });
            }
        }

        let actual = combine_results(&CombinationInput { factors, cases })
            .unwrap_or_else(|| panic!("Rust combine_results returned None for {}", combo_fixture));

        let label = format!("combo:{}", combo_fixture);
        compare_displacements(&label, &actual, &expected);
        compare_reactions(&label, &actual, &expected);
        compare_element_forces_direct(&label, &actual, &expected);
    }

    // Test envelope using Rust-solved per-case results.
    let envelope_fixture = format!("{}-envelope", prefix);
    if let Some(envelope_json) = load_fixture(&envelope_fixture) {
        let expected: FullEnvelope = serde_json::from_str(&envelope_json).unwrap();

        // Build combos from Rust-solved per-case results
        let mut rust_combo_results = Vec::new();
        for combo in combinations {
            let factors_val = combo["factors"].as_array().unwrap();
            let mut factors = Vec::new();
            let mut cases = Vec::new();
            for f in factors_val {
                let case_id = f["caseId"].as_u64().unwrap() as usize;
                let factor = f["factor"].as_f64().unwrap();
                factors.push(CombinationFactor { case_id, factor });
                if let Some(r) = rust_case_results.get(&case_id) {
                    cases.push(CaseEntry {
                        case_id,
                        results: r.clone(),
                    });
                }
            }
            if let Some(result) = combine_results(&CombinationInput { factors, cases }) {
                rust_combo_results.push(result);
            }
        }

        let actual = compute_envelope(&rust_combo_results)
            .unwrap_or_else(|| panic!("Rust compute_envelope returned None for {}", prefix));

        assert_close(
            actual.moment.global_max,
            expected.moment.global_max,
            REL_TOL_FORCE,
            &format!("{} envelope moment globalMax", prefix),
        );
        assert_close(
            actual.shear.global_max,
            expected.shear.global_max,
            REL_TOL_FORCE,
            &format!("{} envelope shear globalMax", prefix),
        );
        assert_close(
            actual.axial.global_max,
            expected.axial.global_max,
            REL_TOL_FORCE,
            &format!("{} envelope axial globalMax", prefix),
        );
        compare_displacements(
            &format!("{}:envelope:maxAbs", prefix),
            &actual.max_abs_results,
            &expected.max_abs_results,
        );
        compare_reactions(
            &format!("{}:envelope:maxAbs", prefix),
            &actual.max_abs_results,
            &expected.max_abs_results,
        );
    }
}

#[test]
fn test_ex_frame_cirsoc_dl() {
    run_multicase_2d_parity("ex-frame-cirsoc-dl");
}

#[test]
fn test_ex_building_3story_dlw() {
    run_multicase_2d_parity("ex-building-3story-dlw");
}

#[test]
fn test_ex_frame_seismic() {
    run_multicase_2d_parity("ex-frame-seismic");
}

// ─── Example model parity (3D) ──────────────────────────────────

/// Relaxed 3D comparison for complex models where small numerical differences accumulate.
fn compare_results_3d_relaxed(
    prefix: &str,
    actual: &AnalysisResults3D,
    expected: &AnalysisResults3D,
    rel_tol_disp: f64,
    rel_tol_force: f64,
) {
    let mut actual_disp: Vec<_> = actual.displacements.clone();
    let mut expected_disp: Vec<_> = expected.displacements.clone();
    actual_disp.sort_by_key(|d| d.node_id);
    expected_disp.sort_by_key(|d| d.node_id);

    assert_eq!(
        actual_disp.len(),
        expected_disp.len(),
        "{}: 3D displacement count mismatch",
        prefix
    );
    for (a, e) in actual_disp.iter().zip(expected_disp.iter()) {
        let lbl = format!("{} node{}", prefix, a.node_id);
        assert_close(a.ux, e.ux, rel_tol_disp, &format!("{} ux", lbl));
        assert_close(a.uy, e.uy, rel_tol_disp, &format!("{} uy", lbl));
        assert_close(a.uz, e.uz, rel_tol_disp, &format!("{} uz", lbl));
        assert_close(a.rx, e.rx, rel_tol_disp, &format!("{} rx", lbl));
        assert_close(a.ry, e.ry, rel_tol_disp, &format!("{} ry", lbl));
        assert_close(a.rz, e.rz, rel_tol_disp, &format!("{} rz", lbl));
    }

    let mut actual_react: Vec<_> = actual.reactions.clone();
    let mut expected_react: Vec<_> = expected.reactions.clone();
    actual_react.sort_by_key(|r| r.node_id);
    expected_react.sort_by_key(|r| r.node_id);

    assert_eq!(
        actual_react.len(),
        expected_react.len(),
        "{}: 3D reaction count mismatch",
        prefix
    );
    for (a, e) in actual_react.iter().zip(expected_react.iter()) {
        let lbl = format!("{} react{}", prefix, a.node_id);
        assert_close(a.fx, e.fx, rel_tol_force, &format!("{} fx", lbl));
        assert_close(a.fy, e.fy, rel_tol_force, &format!("{} fy", lbl));
        assert_close(a.fz, e.fz, rel_tol_force, &format!("{} fz", lbl));
        assert_close(a.mx, e.mx, rel_tol_force, &format!("{} mx", lbl));
        assert_close(a.my, e.my, rel_tol_force, &format!("{} my", lbl));
        assert_close(a.mz, e.mz, rel_tol_force, &format!("{} mz", lbl));
    }

    // Full element force comparison (both solvers now use same local axis convention)
    compare_element_forces_3d(prefix, actual, expected, rel_tol_force);
}

fn run_3d_parity(name: &str) {
    run_3d_parity_with_tolerance(name, REL_TOL_DISP, REL_TOL_FORCE);
}

fn run_3d_parity_with_tolerance(name: &str, rel_tol_disp: f64, rel_tol_force: f64) {
    let input_json = match load_fixture(&format!("{}-input", name)) {
        Some(j) => j,
        None => {
            eprintln!(
                "Skipping {}: fixture not found — run fixture generator first",
                name
            );
            return;
        }
    };
    let expected_json = load_fixture(&format!("{}-results", name))
        .unwrap_or_else(|| panic!("Missing {}-results.json", name));

    let input: SolverInput3D = serde_json::from_str(&input_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-input.json: {}", name, e));
    let expected: AnalysisResults3D = serde_json::from_str(&expected_json)
        .unwrap_or_else(|e| panic!("Failed to parse {}-results.json: {}", name, e));

    let actual =
        solve_3d(&input).unwrap_or_else(|e| panic!("Rust 3D solver failed on {}: {}", name, e));

    compare_results_3d_relaxed(name, &actual, &expected, rel_tol_disp, rel_tol_force);
}

macro_rules! example_3d_parity_test {
    ($name:ident, $fixture:expr) => {
        #[test]
        fn $name() {
            run_3d_parity($fixture);
        }
    };
}

example_3d_parity_test!(test_ex_3d_cantilever_load, "ex-3d-cantilever-load");
// Grid slab: Both solvers now use SAP2000/textbook local axis convention.
example_3d_parity_test!(test_ex_3d_grid_slab, "ex-3d-grid-slab");
example_3d_parity_test!(test_ex_3d_tower, "ex-3d-tower");
example_3d_parity_test!(test_ex_3d_torsion_beam, "ex-3d-torsion-beam");

// Portal frame and nave industrial: both solvers now use same local axis convention.
example_3d_parity_test!(test_ex_3d_portal_frame, "ex-3d-portal-frame");
example_3d_parity_test!(test_ex_3d_nave_industrial, "ex-3d-nave-industrial");

// 3D space truss has a rollerXY support that produces a different reaction count
// between TS and Rust solvers. Test with relaxed reaction count check.
#[test]
fn test_ex_3d_space_truss() {
    let name = "ex-3d-space-truss";
    let input_json = match load_fixture(&format!("{}-input", name)) {
        Some(j) => j,
        None => {
            eprintln!("Skipping {}: fixture not found", name);
            return;
        }
    };
    let expected_json = load_fixture(&format!("{}-results", name)).unwrap();
    let input: SolverInput3D = serde_json::from_str(&input_json).unwrap();
    let expected: AnalysisResults3D = serde_json::from_str(&expected_json).unwrap();
    let actual = solve_3d(&input).unwrap_or_else(|e| panic!("Rust 3D solver failed on {}: {}", name, e));

    // Compare displacements (same count)
    let mut actual_disp: Vec<_> = actual.displacements.clone();
    let mut expected_disp: Vec<_> = expected.displacements.clone();
    actual_disp.sort_by_key(|d| d.node_id);
    expected_disp.sort_by_key(|d| d.node_id);
    assert_eq!(actual_disp.len(), expected_disp.len(), "{}: displacement count mismatch", name);
    for (a, e) in actual_disp.iter().zip(expected_disp.iter()) {
        let lbl = format!("{} node{}", name, a.node_id);
        assert_close(a.ux, e.ux, REL_TOL_DISP, &format!("{} ux", lbl));
        assert_close(a.uy, e.uy, REL_TOL_DISP, &format!("{} uy", lbl));
        assert_close(a.uz, e.uz, REL_TOL_DISP, &format!("{} uz", lbl));
    }

    // Reactions: Rust may include an extra reaction for rollerXY support.
    // Compare only the reactions that both solvers agree on (by node ID).
    let mut actual_react: Vec<_> = actual.reactions.clone();
    let mut expected_react: Vec<_> = expected.reactions.clone();
    actual_react.sort_by_key(|r| r.node_id);
    expected_react.sort_by_key(|r| r.node_id);
    let expected_node_ids: std::collections::HashSet<usize> =
        expected_react.iter().map(|r| r.node_id).collect();
    for a in &actual_react {
        if !expected_node_ids.contains(&a.node_id) {
            continue; // Extra Rust reaction for rollerXY
        }
        let e = expected_react.iter().find(|r| r.node_id == a.node_id).unwrap();
        let lbl = format!("{} react{}", name, a.node_id);
        assert_close(a.fx, e.fx, REL_TOL_FORCE, &format!("{} fx", lbl));
        assert_close(a.fy, e.fy, REL_TOL_FORCE, &format!("{} fy", lbl));
        assert_close(a.fz, e.fz, REL_TOL_FORCE, &format!("{} fz", lbl));
    }
}

// ─── 3D multi-case (3d-building) ────────────────────────────────

#[test]
fn test_ex_3d_building() {
    let meta_json = match load_fixture("ex-3d-building-meta") {
        Some(j) => j,
        None => {
            eprintln!("Skipping ex-3d-building: meta fixture not found");
            return;
        }
    };
    let meta: serde_json::Value = serde_json::from_str(&meta_json).unwrap();

    // Both solvers now use SAP2000/textbook local axis convention — full comparison.
    let load_cases = meta["loadCases"].as_array().unwrap();
    for lc in load_cases {
        let case_name = lc["name"].as_str().unwrap();
        if fixture_exists(&format!("{}-input", case_name)) {
            run_3d_parity(case_name);
        }
    }
}
