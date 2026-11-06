use crate::types::{DiagnosticCode, Severity, StructuredDiagnostic};

pub fn coded(code: DiagnosticCode, message: &str) -> String {
    let d = StructuredDiagnostic::global(code, Severity::Error, message);
    serde_json::json!({ "message": message, "structuredDiagnostics": [d] }).to_string()
}

pub fn no_free_dofs() -> String {
    coded(DiagnosticCode::NoFreeDofs, "No free DOFs")
}

pub fn no_compressed_elements() -> String {
    coded(DiagnosticCode::NoCompressedElements, "No compressed elements — buckling not applicable")
}

pub fn eigen_decomposition_failed(message: &str) -> String {
    coded(DiagnosticCode::EigenDecompositionFailed, message)
}

pub fn has_code(error: &str, code: DiagnosticCode) -> bool {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Coded { structured_diagnostics: Vec<StructuredDiagnostic> }
    serde_json::from_str::<Coded>(error).is_ok_and(|c| c.structured_diagnostics.iter().any(|d| d.code == code && d.severity == Severity::Error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_coded_refusal_carries_its_code_and_message() {
        let v: serde_json::Value = serde_json::from_str(&no_free_dofs()).unwrap();
        assert_eq!(v["message"], "No free DOFs");
        assert_eq!(v["structuredDiagnostics"][0]["code"], "no_free_dofs");
        assert_eq!(v["structuredDiagnostics"][0]["severity"], "error");
        assert!(!crate::known_issues::is_refusal(&no_free_dofs()));
    }

    #[test]
    fn an_eigen_failure_keeps_the_solver_message_under_its_code() {
        let message = crate::linalg::lanczos::eigen_failure_message(12);
        let v: serde_json::Value = serde_json::from_str(&eigen_decomposition_failed(&message)).unwrap();
        assert_eq!(v["message"], message.as_str());
        assert_eq!(v["structuredDiagnostics"][0]["code"], "eigen_decomposition_failed");
        assert_eq!(v["structuredDiagnostics"][0]["severity"], "error");
    }
}
