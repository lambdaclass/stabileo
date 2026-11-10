//! Load-only solve sessions: one immutable model and factorization, many RHSs.
//! Constraints retain the ordinary constrained solver rather than silently
//! entering the unconstrained prepared path.
use crate::solver::linear::{
    prepare_static_2d, prepare_static_3d, solve_2d, solve_3d, PreparedStatic2D, PreparedStatic3D,
};
use crate::types::*;
use wasm_bindgen::prelude::*;

enum State2D {
    Prepared(Box<PreparedStatic2D<'static>>),
    Constrained(Box<SolverInput>),
}
#[wasm_bindgen]
pub struct LoadSession2D {
    state: State2D,
}
#[wasm_bindgen]
impl LoadSession2D {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<LoadSession2D, JsValue> {
        LoadSession2D::from_input(crate::from_js_value(input)?).map_err(|e| JsValue::from_str(&e))
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let result = self.solve_loads(&crate::from_js_value::<Vec<SolverLoad>>(loads)?).map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
    }
}
impl LoadSession2D {
    pub fn from_input(mut input: SolverInput) -> Result<LoadSession2D, String> {
        crate::solver::linear::validate_input_2d(&input)?;
        input.loads.clear();
        let state = if input.constraints.is_empty() {
            State2D::Prepared(Box::new(prepare_static_2d(&input)?.into_owned()))
        } else {
            State2D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve_loads(&self, loads: &[SolverLoad]) -> Result<AnalysisResults, String> {
        match &self.state {
            State2D::Prepared(p) => p.solve_loads(loads),
            State2D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads.to_vec();
                solve_2d(&input)
            }
        }
    }
}
enum State3D {
    Prepared(Box<PreparedStatic3D>),
    Constrained(Box<SolverInput3D>),
}
#[wasm_bindgen]
pub struct LoadSession3D {
    state: State3D,
}
#[wasm_bindgen]
impl LoadSession3D {
    #[wasm_bindgen(constructor)]
    pub fn new(input: JsValue) -> Result<LoadSession3D, JsValue> {
        LoadSession3D::from_input(crate::from_js_value::<crate::types::units::ElasticInput3D>(input)?.into_legacy()).map_err(|e| JsValue::from_str(&e))
    }
    pub fn solve(&self, loads: JsValue) -> Result<JsValue, JsValue> {
        let result = self.solve_loads(&crate::from_js_value::<Vec<SolverLoad3D>>(loads)?).map_err(|e| JsValue::from_str(&e))?;
        crate::to_js_value(&result)
    }
}
impl LoadSession3D {
    pub fn from_input(input: SolverInput3D) -> Result<LoadSession3D, String> {
        Self::from_input_with_prepare(input, prepare_static_3d)
    }
    fn from_input_with_prepare(mut input: SolverInput3D, mut prepare: impl FnMut(&SolverInput3D) -> Result<PreparedStatic3D, String>) -> Result<LoadSession3D, String> {
        crate::solver::linear::validate_input_3d(&input)?;
        let initial_loads = std::mem::take(&mut input.loads);
        let state = if input.constraints.is_empty() {
            let prepared = match prepare(&input) {
                Ok(prepared) => prepared,
                Err(original) => {
                    input.loads = initial_loads;
                    return Err(prepare(&input).err().unwrap_or(original));
                },
            };
            State3D::Prepared(Box::new(prepared))
        } else {
            State3D::Constrained(Box::new(input))
        };
        Ok(Self { state })
    }
    pub fn solve_loads(&self, loads: &[SolverLoad3D]) -> Result<AnalysisResults3D, String> {
        match &self.state {
            State3D::Prepared(p) => p.solve_loads(loads),
            State3D::Constrained(input) => {
                let mut input = input.clone();
                input.loads = loads.to_vec();
                solve_3d(&input)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn loaded_beam() -> SolverInput3D {
        serde_json::from_str(include_str!("../tests/fixtures/cantilever-3d-input.json")).unwrap()
    }

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn issue_1753_loaded_prepare_success_is_retained_after_unloaded_failure() {
        let input = loaded_beam();
        assert!(!input.loads.is_empty());
        let expected = prepare_static_3d(&input).unwrap().solve_loads(&input.loads).unwrap();
        let mut attempts = 0;
        let session = LoadSession3D::from_input_with_prepare(input.clone(), |candidate| {
            attempts += 1;
            if attempts == 1 {
                assert!(candidate.loads.is_empty());
                Err("unloaded preparation failed".into())
            } else {
                assert_eq!(serde_json::to_value(&candidate.loads).unwrap(), serde_json::to_value(&input.loads).unwrap());
                prepare_static_3d(candidate)
            }
        }).unwrap();
        assert_eq!(attempts, 2);
        let actual = session.solve_loads(&input.loads).unwrap();
        assert_eq!(serde_json::to_value(&actual.displacements).unwrap(), serde_json::to_value(&expected.displacements).unwrap());
        assert_eq!(serde_json::to_value(&actual.reactions).unwrap(), serde_json::to_value(&expected.reactions).unwrap());
        assert_eq!(serde_json::to_value(&actual.element_forces).unwrap(), serde_json::to_value(&expected.element_forces).unwrap());
    }

    #[test]
    #[ignore = "known wrong result: #1753"]
    fn issue_1753_failed_loaded_retry_preserves_original_error() {
        let input = loaded_beam();
        let mut attempts = 0;
        let error = LoadSession3D::from_input_with_prepare(input, |candidate| {
            attempts += 1;
            Err(if candidate.loads.is_empty() { "original failure" } else { "retry failure" }.into())
        }).err().unwrap();
        assert_eq!(attempts, 2);
        assert_eq!(error, "original failure");
    }
}
