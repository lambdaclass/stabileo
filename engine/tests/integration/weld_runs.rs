use dedaliano_engine::postprocess::connection_check::{check_weld_groups, WeldGroupInput};
use serde_json::Value;

fn weld_run_case(name: &str) {
    let fixture: Value = serde_json::from_str(include_str!("fixtures/weld-runs.json")).unwrap();
    let case = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["name"] == name)
        .unwrap();
    let input: WeldGroupInput = serde_json::from_value(case["input"].clone()).unwrap();
    let result = check_weld_groups(&input).remove(0);
    if let Some(reason) = case["expectedUnevaluated"].as_str() {
        assert_eq!(result.unity_ratio, f64::INFINITY, "{name}");
        assert_eq!(result.unevaluated, vec![reason], "{name}");
        return;
    }
    assert!(
        result.unevaluated.is_empty(),
        "{name}: {:?}",
        result.unevaluated
    );
    let actual = serde_json::to_value(result).unwrap();
    for (key, value) in case["expected"].as_object().unwrap() {
        let expected = value.as_f64().unwrap();
        let actual = actual[key].as_f64().unwrap();
        assert!(
            (actual - expected).abs() <= 1e-12 * expected.abs().max(1e-12),
            "{name} {key}: {actual} != {expected}; {}",
            fixture["source"]
        );
    }
}

#[test]
fn issue_2243_witness() {
    weld_run_case("issue_2243_witness");
}

#[test]
fn issue_2243_nonuniform_short_pieces() {
    weld_run_case("issue_2243_nonuniform_short_pieces");
}

#[test]
fn issue_2243_reversed_order_and_direction() {
    weld_run_case("issue_2243_reversed_order_and_direction");
}

#[test]
fn issue_2243_collinear_vertices() {
    weld_run_case("issue_2243_collinear_vertices");
}

#[test]
fn issue_2244_witness_true() {
    weld_run_case("issue_2244_witness_true");
}

#[test]
fn issue_2244_split_true() {
    weld_run_case("issue_2244_split_true");
}

#[test]
fn issue_2244_witness_false() {
    weld_run_case("issue_2244_witness_false");
}

#[test]
fn issue_2244_split_false() {
    weld_run_case("issue_2244_split_false");
}

#[test]
fn issue_2244_witness_none() {
    weld_run_case("issue_2244_witness_none");
}

#[test]
fn issue_2244_split_none() {
    weld_run_case("issue_2244_split_none");
}

#[test]
fn boundary_3_9_whole() {
    weld_run_case("boundary_3_9_whole");
}

#[test]
fn boundary_3_9_split() {
    weld_run_case("boundary_3_9_split");
}

#[test]
fn boundary_4_whole() {
    weld_run_case("boundary_4_whole");
}

#[test]
fn boundary_4_split() {
    weld_run_case("boundary_4_split");
}

#[test]
fn boundary_4_1_whole() {
    weld_run_case("boundary_4_1_whole");
}

#[test]
fn boundary_4_1_split() {
    weld_run_case("boundary_4_1_split");
}

#[test]
fn boundary_99_whole() {
    weld_run_case("boundary_99_whole");
}

#[test]
fn boundary_99_split() {
    weld_run_case("boundary_99_split");
}

#[test]
fn boundary_100_whole() {
    weld_run_case("boundary_100_whole");
}

#[test]
fn boundary_100_split() {
    weld_run_case("boundary_100_split");
}

#[test]
fn boundary_101_whole() {
    weld_run_case("boundary_101_whole");
}

#[test]
fn boundary_101_split() {
    weld_run_case("boundary_101_split");
}

#[test]
fn boundary_299_whole() {
    weld_run_case("boundary_299_whole");
}

#[test]
fn boundary_299_split() {
    weld_run_case("boundary_299_split");
}

#[test]
fn boundary_300_whole() {
    weld_run_case("boundary_300_whole");
}

#[test]
fn boundary_300_split() {
    weld_run_case("boundary_300_split");
}

#[test]
fn boundary_301_whole() {
    weld_run_case("boundary_301_whole");
}

#[test]
fn boundary_301_split() {
    weld_run_case("boundary_301_split");
}

#[test]
fn correct_unreduced_answer() {
    weld_run_case("correct_unreduced_answer");
}

#[test]
fn correct_unreduced_segmented_answer() {
    weld_run_case("correct_unreduced_segmented_answer");
}

#[test]
fn correct_along_length_long_answer() {
    weld_run_case("correct_along_length_long_answer");
}

#[test]
fn issue_2244_disconnected_short_fillets() {
    weld_run_case("issue_2244_disconnected_short_fillets");
}

#[test]
fn issue_2243_disconnected_long_fillets() {
    weld_run_case("issue_2243_disconnected_long_fillets");
}

#[test]
fn distinct_parallel_long_fillets() {
    weld_run_case("distinct_parallel_long_fillets");
}

#[test]
fn issue_2244_distinct_parallel_short_fillets() {
    weld_run_case("issue_2244_distinct_parallel_short_fillets");
}

#[test]
fn issue_2244_size_changes() {
    weld_run_case("issue_2244_size_changes");
}

#[test]
fn loading_changes() {
    weld_run_case("loading_changes");
}

#[test]
fn issue_2243_eccentric_centroid_inertia_uniform() {
    weld_run_case("issue_2243_eccentric_centroid_inertia_uniform");
}

#[test]
fn issue_2243_zero_length_uniform() {
    weld_run_case("issue_2243_zero_length_uniform");
}

#[test]
fn issue_2243_eccentric_centroid_inertia_nonuniform() {
    weld_run_case("issue_2243_eccentric_centroid_inertia_nonuniform");
}

#[test]
fn issue_2243_zero_length_nonuniform() {
    weld_run_case("issue_2243_zero_length_nonuniform");
}

#[test]
fn issue_2244_uniform_run_includes_returns() {
    weld_run_case("issue_2244_uniform_run_includes_returns");
}

#[test]
fn issue_2243_ambiguous_branch() {
    weld_run_case("issue_2243_ambiguous_branch");
}

#[test]
fn invalid_nonpositive_size() {
    weld_run_case("invalid_nonpositive_size");
}
