use crate::case::*;
use dedaliano_engine::certify::reassembly::EndToEnd;
use dedaliano_engine::certify::{certify_linear_2d_full, certify_linear_3d_full, Certificate};
use dedaliano_engine::types::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

pub const MECHANISM_CODES: &[DiagnosticCode] = &[
    DiagnosticCode::LocalMechanism,
    DiagnosticCode::SingularMatrix,
    DiagnosticCode::InstabilityRisk,
    DiagnosticCode::StiffnessNotPositiveDefinite,
    DiagnosticCode::ExcessiveDisplacement,
    DiagnosticCode::ResidualHigh,
    DiagnosticCode::EquilibriumViolation,
    DiagnosticCode::DisconnectedNode,
    DiagnosticCode::NearZeroDiagonal,
    DiagnosticCode::ExtremelyHighDiagonalRatio,
    DiagnosticCode::DiagonalRegularization,
];

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Refused(String),
    Uncertified(String),
    Contained { by: String, violations: Vec<String> },
    Held,
    Silent(Vec<String>),
}

impl Outcome {
    pub fn is_silent(&self) -> bool {
        matches!(self, Outcome::Silent(_))
    }

    pub fn label(&self) -> &'static str {
        match self {
            Outcome::Refused(_) => "refused",
            Outcome::Uncertified(_) => "uncertified",
            Outcome::Contained { .. } => "contained",
            Outcome::Held => "held",
            Outcome::Silent(_) => "SILENT",
        }
    }
}

struct Certified {
    u: Vector,
    certificate: Certificate,
    end_to_end: EndToEnd,
    diagnostics: Vec<StructuredDiagnostic>,
}

fn certify(case: &Case) -> Result<Result<Certified, String>, String> {
    let run = || match &case.model {
        Model::D2(s) => certify_linear_2d_full(s).map(|o| Certified { u: displacements_2d(&o.results), certificate: o.certificate, end_to_end: o.end_to_end, diagnostics: o.results.structured_diagnostics }),
        Model::D3(s) => certify_linear_3d_full(s).map(|o| Certified { u: displacements_3d(&o.results), certificate: o.certificate, end_to_end: o.end_to_end, diagnostics: o.results.structured_diagnostics }),
    };
    catch_unwind(AssertUnwindSafe(run)).map_err(|p| p.downcast_ref::<String>().cloned().or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default())
}

pub fn judge(case: &Case) -> Outcome {
    let c = match certify(case) {
        Err(panic) => return Outcome::Silent(vec![format!("panicked: {panic}")]),
        Ok(Err(e)) => return Outcome::Refused(e),
        Ok(Ok(c)) => c,
    };
    let (abs_bound, residual_norm) = match &c.certificate {
        Certificate::Certified { abs_bound, residual_norm, .. } => (*abs_bound, *residual_norm),
        Certificate::Uncertified { reason } => return Outcome::Uncertified(reason.clone()),
    };
    let violations = violations(case, &c.u, abs_bound, residual_norm);
    if violations.is_empty() {
        return Outcome::Held;
    }
    if let EndToEnd::Failed { reason } = &c.end_to_end {
        return Outcome::Contained { by: format!("end-to-end: {reason}"), violations };
    }
    let mut violations = violations;
    if let Some(d) = c.diagnostics.iter().find(|d| d.severity != Severity::Info && MECHANISM_CODES.contains(&d.code)) {
        violations.push(format!("certified despite {:?}: {}", d.code, d.message));
    }
    Outcome::Silent(violations)
}

pub fn violations(case: &Case, u: &Vector, abs_bound: f64, residual_norm: f64) -> Vec<String> {
    let p = case.loads();
    let pn = norm(&p);
    let un = norm(u);
    let mut out = Vec::new();
    for (k, phi) in case.mode_vectors().iter().enumerate() {
        let n = norm(phi);
        if n == 0.0 {
            continue;
        }
        let work = dot(phi, &p).abs() / n;
        if work > residual_norm * (1.0 + 1e-6) + 1e-9 * pn {
            out.push(format!("mode {k}: the loads do work {work:.6e} on a zero-energy mode, so the model residual is at least that, above the certified {residual_norm:.3e}"));
        }
    }
    let basis = orthonormal(&case.mode_vectors());
    let along: f64 = basis.iter().map(|q| dot(q, u).powi(2)).sum::<f64>().sqrt();
    if along > 1e-6 * un + abs_bound + 1e-12 {
        out.push(format!("the response has {along:.6e} along the mechanism (|u| = {un:.6e}, certified bound {abs_bound:.3e})"));
    }
    for &(n, d, v) in &case.exact {
        let got = u.get(&(n, d)).copied().unwrap_or(f64::NAN);
        if !((got - v).abs() <= abs_bound + 1e-6 * v.abs()) {
            out.push(format!("node {n} dof {d}: {got:.10e}, exactly {v:.10e} (certified bound {abs_bound:.3e})"));
        }
    }
    out
}
