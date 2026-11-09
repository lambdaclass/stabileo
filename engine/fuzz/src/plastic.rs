use dedaliano_engine::certify::{plastic as cplastic, plastic_3d as cplastic3};
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;

pub fn certificate_budget_3d(input: &PlasticInput3D) -> Result<(), String> {
    if input.solver.elements.len() > 10 {
        return Err("skipped: too large for the fuzz time budget".into());
    }
    Ok(())
}

pub fn replay(data: &[u8], gate: bool) -> String {
    let Some((sel, _, json)) = crate::split(data) else { return "invalid bytes".into() };
    fn call<I, O>(json: &str, gate: bool, f: impl FnOnce(&I) -> Result<O, String>) -> String
    where I: serde::de::DeserializeOwned + serde::Serialize, O: serde::Serialize {
        let input: I = match serde_json::from_str(json) {
            Ok(input) => input,
            Err(error) => return format!("invalid JSON: {error}"),
        };
        if gate && !crate::within_bounds(&input) { return "skipped: JSON budget".into(); }
        match f(&input) {
            Err(error) => format!("error: {error}"),
            Ok(output) => {
                crate::check_output("json_plastic", &output);
                let output = serde_json::to_value(output).unwrap();
                format!("ok: {}", output.get("certificate").unwrap_or(&serde_json::Value::Null))
            }
        }
    }
    match sel % 4 {
        0 => call(json, gate, plastic::solve_plastic_2d),
        1 => call(json, gate, |input: &PlasticInput3D| {
            if gate && input.solver.elements.len() > 40 { return Err("skipped: solver budget".into()); }
            plastic::solve_plastic_3d(input)
        }),
        2 => call(json, gate, cplastic::certify_plastic_2d),
        _ => call(json, gate, |input: &PlasticInput3D| {
            if gate { certificate_budget_3d(input)?; }
            cplastic3::certify_plastic_3d(input)
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_expensive(raw: &[u8]) {
        let input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        assert!(crate::within_bounds(&input));
        assert!(certificate_budget_3d(&input).is_err(), "member count admits an expensive certificate");
    }

    #[test]
    #[ignore = "known wrong result: #951"]
    fn issue_951_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-951.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #952"]
    fn issue_952_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-952.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #953"]
    fn issue_953_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-953.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #989"]
    fn issue_989_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-989.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #990"]
    fn issue_990_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-990.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #991"]
    fn issue_991_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-991.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1081"]
    fn issue_1081_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1081.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1082"]
    fn issue_1082_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1082.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1349"]
    fn issue_1349_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1349.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1458"]
    fn issue_1458_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1458.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1459"]
    fn issue_1459_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1459.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1460"]
    fn issue_1460_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1460.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1760"]
    fn issue_1760_lp_budget() {
        assert_expensive(include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin"));
    }

    #[test]
    #[ignore = "known wrong result: #1760"]
    fn issue_1760_incremental_factor_outside_certificate_is_refused() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin");
        let result = replay(raw, false);
        assert!(result.starts_with("error:") && result.contains("outside"), "{result}");
    }

    #[test]
    fn good_cantilever_is_admitted() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/good-cantilever.bin");
        let input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        assert!(crate::within_bounds(&input));
        assert!(certificate_budget_3d(&input).is_ok());
    }

    #[test]
    fn issue_1261_existing_engine_refusal_is_visible() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1261.bin");
        let result = replay(raw, true);
        assert!(result.contains("PL-2D-INVARIANCE"), "{result}");
    }
}
