use dedaliano_engine::certify::{plastic as cplastic, plastic_3d as cplastic3};
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;

pub const MAX_DENSE_LP_BYTES: usize = 128 * 1024 * 1024;

fn budget(work: dedaliano_engine::certify::plastic_budget::PlasticLpWork) -> Result<(), String> {
    if work.check_engine_budget().is_err() || work.max_dense_bytes() > MAX_DENSE_LP_BYTES {
        return Err(format!(
            "skipped: exact plastic LP fuzz budget: {}",
            serde_json::to_string(&work).unwrap()
        ));
    }
    Ok(())
}

pub fn certificate_budget_3d(input: &PlasticInput3D) -> Result<(), String> {
    if input.solver.elements.len() > 40 {
        return Err("skipped: solver budget".into());
    }
    match cplastic3::build_model_3d(input) {
        Ok(model) => budget(cplastic3::lp_work(&model)),
        Err(_) => Ok(()),
    }
}

pub fn certificate_budget_2d(input: &PlasticInput) -> Result<(), String> {
    match cplastic::build_model(input) {
        Ok(model) => budget(cplastic::lp_work(&model)),
        Err(_) => Ok(()),
    }
}

pub fn exercise(data: &[u8]) {
    drop(evaluate(data, true, false));
}

pub fn replay(data: &[u8], gate: bool) -> String {
    evaluate(data, gate, true)
}

fn evaluate(data: &[u8], gate: bool, report: bool) -> String {
    let Some((sel, _, json)) = crate::split(data) else {
        return if report {
            "invalid bytes".into()
        } else {
            String::new()
        };
    };
    fn call<I, O>(
        json: &str,
        gate: bool,
        report: bool,
        f: impl FnOnce(&I) -> Result<O, String>,
    ) -> String
    where
        I: serde::de::DeserializeOwned + serde::Serialize,
        O: serde::Serialize,
    {
        let input: I = match serde_json::from_str(json) {
            Ok(input) => input,
            Err(error) => {
                return if report {
                    format!("invalid JSON: {error}")
                } else {
                    String::new()
                }
            }
        };
        if gate && !crate::within_bounds(&input) {
            return if report {
                "skipped: JSON budget".into()
            } else {
                String::new()
            };
        }
        match f(&input) {
            Err(error) => {
                if report {
                    format!("error: {error}")
                } else {
                    String::new()
                }
            }
            Ok(output) => {
                crate::check_output("json_plastic", &output);
                if !report {
                    return String::new();
                }
                let output = serde_json::to_value(output).unwrap();
                let mut report = output
                    .get("certificate")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
                if let Some(report) = report.as_object_mut() {
                    for (source, target) in [
                        ("isMechanism", "solverIsMechanism"),
                        ("warnings", "solverWarnings"),
                        ("structuredDiagnostics", "solverDiagnostics"),
                    ] {
                        report.insert(target.into(), output["results"][source].clone());
                    }
                }
                format!("ok: {report}")
            }
        }
    }
    match sel % 4 {
        0 => call(json, gate, report, plastic::solve_plastic_2d),
        1 => call(json, gate, report, |input: &PlasticInput3D| {
            if gate && input.solver.elements.len() > 40 {
                return Err("skipped: solver budget".into());
            }
            plastic::solve_plastic_3d(input)
        }),
        2 => call(json, gate, report, |input: &PlasticInput| {
            if gate {
                certificate_budget_2d(input)?;
            }
            cplastic::certify_plastic_2d(input)
        }),
        _ => call(json, gate, report, |input: &PlasticInput3D| {
            if gate {
                certificate_budget_3d(input)?;
            }
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
        assert!(
            certificate_budget_3d(&input).is_err(),
            "member count admits an expensive certificate"
        );
    }

    #[test]
    fn issue_951_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-951.bin"
        ));
    }

    #[test]
    fn issue_952_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-952.bin"
        ));
    }

    #[test]
    fn issue_953_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-953.bin"
        ));
    }

    #[test]
    fn issue_989_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-989.bin"
        ));
    }

    #[test]
    fn issue_990_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-990.bin"
        ));
    }

    #[test]
    fn issue_991_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-991.bin"
        ));
    }

    #[test]
    fn issue_1081_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1081.bin"
        ));
    }

    #[test]
    fn issue_1082_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1082.bin"
        ));
    }

    #[test]
    fn issue_1349_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1349.bin"
        ));
    }

    #[test]
    fn issue_1458_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1458.bin"
        ));
    }

    #[test]
    fn issue_1459_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1459.bin"
        ));
    }

    #[test]
    fn issue_1460_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1460.bin"
        ));
    }

    #[test]
    fn issue_1760_lp_budget() {
        assert_expensive(include_bytes!(
            "../corpus-regressions/plastic-lp-budget/issue-1760.bin"
        ));
    }

    #[test]
    fn issue_1760_incremental_factor_outside_certificate_is_refused() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin");
        let result = replay(raw, false);
        assert!(
            result.starts_with("error:") && result.contains("outside"),
            "{result}"
        );
    }

    #[test]
    fn good_cantilever_is_admitted() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/good-cantilever.bin");
        let input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        assert!(crate::within_bounds(&input));
        assert!(certificate_budget_3d(&input).is_ok());
    }

    #[test]
    fn same_member_count_can_have_different_lp_budgets() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin");
        let mut input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        assert!(certificate_budget_3d(&input).is_err());
        let members = input.solver.elements.len();
        input
            .solver
            .loads
            .retain(|load| matches!(load, SolverLoad3D::Nodal(_)));
        assert_eq!(input.solver.elements.len(), members);
        assert!(certificate_budget_3d(&input).is_ok());
    }

    #[test]
    fn a_loaded_cantilever_still_fits_the_lp_budget() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/good-cantilever.bin");
        let mut input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        let portal: PlasticInput3D = serde_json::from_slice(
            &include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin")[2..],
        )
        .unwrap();
        let SolverLoad3D::Distributed(mut load) = portal.solver.loads[0].clone() else {
            panic!("distributed seed load")
        };
        load.element_id = 1;
        input.solver.loads.push(SolverLoad3D::Distributed(load));
        assert!(certificate_budget_3d(&input).is_ok());
    }

    #[test]
    fn work_overflow_is_rejected() {
        let work = dedaliano_engine::certify::plastic_budget::PlasticLpWork {
            equilibrium_equations: usize::MAX,
            force_variables: usize::MAX,
            initial_halfspaces: usize::MAX,
            max_halfspaces: usize::MAX,
            max_solves: usize::MAX,
        };
        assert!(budget(work).is_err());
    }

    #[test]
    fn checked_entry_preserves_the_strict_outside_flag_at_round_off() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/good-cantilever.bin");
        let result = replay(raw, false);
        assert!(result.contains("PL-3D-CERTIFICATE-MISMATCH"), "{result}");
    }

    #[test]
    fn lp_work_uses_the_engine_equilibrium_dimensions() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1760.bin");
        let mut input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        input
            .solver
            .elements
            .values_mut()
            .next()
            .unwrap()
            .release_my_start = true;
        let model = cplastic3::build_model_3d(&input).unwrap();
        let work = cplastic3::lp_work(&model);
        let problem = cplastic3::limit_problem_3d(&model);
        assert_eq!(work.equilibrium_equations, problem.rows.len());
        assert_eq!(work.force_variables, problem.nv);
        let input: PlasticInput = serde_json::from_str(include_str!(
            "../../../verify/samples/plastic-2d-portal.input.json"
        ))
        .unwrap();
        let model = cplastic::build_model(&input).unwrap();
        let work = cplastic::lp_work(&model);
        let problem = cplastic::limit_problem_2d(&model);
        assert_eq!(work.equilibrium_equations, problem.rows.len());
        assert_eq!(work.force_variables, problem.nv);
    }

    #[test]
    fn engine_resource_budget_remains_visible_beyond_the_fuzz_gate() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/engine-grid-slab.bin");
        let input: PlasticInput3D = serde_json::from_slice(&raw[2..]).unwrap();
        assert!(certificate_budget_3d(&input).is_err());
        let model = cplastic3::build_model_3d(&input).unwrap();
        assert!(cplastic3::lp_work(&model).check_engine_budget().is_err());
        let certificate = cplastic3::certify_collapse_3d(&input, None);
        assert!(!certificate.certified);
        assert!(certificate.lambda_lower.is_none() && certificate.lambda_upper.is_none());
        assert!(certificate.reason.unwrap().contains("resource budget"));
    }

    #[test]
    fn issue_1261_existing_engine_refusal_is_visible() {
        let raw = include_bytes!("../corpus-regressions/plastic-lp-budget/issue-1261.bin");
        let result = replay(raw, true);
        assert!(result.contains("PL-2D-INVARIANCE"), "{result}");
    }
}
