//! Refusals an export returns as a code the app can branch on, in the shape of a known-issue
//! refusal: `{"message", "structuredDiagnostics": [..]}` with one error-severity diagnostic.

use crate::types::{DiagnosticCode, Severity, StructuredDiagnostic};

pub fn coded(code: DiagnosticCode, message: &str) -> String {
    let d = StructuredDiagnostic::global(code, Severity::Error, message);
    serde_json::json!({ "message": message, "structuredDiagnostics": [d] }).to_string()
}

pub fn no_free_dofs() -> String {
    coded(DiagnosticCode::NoFreeDofs, "No free DOFs")
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
}
