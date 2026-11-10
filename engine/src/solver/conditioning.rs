/// Conditioning diagnostics for stiffness matrices.
///
/// Provides quick, inexpensive estimates of matrix conditioning
/// to detect ill-conditioning before attempting a factorization.

/// Report from conditioning analysis.
#[derive(Debug, Clone)]
pub struct ConditioningReport {
    /// Ratio of max diagonal to min nonzero diagonal.
    pub diagonal_ratio: f64,
    /// DOF indices whose diagonal is near-zero (< max_diag * 1e-12).
    pub near_zero_dofs: Vec<usize>,
    /// Human-readable warning messages.
    pub warnings: Vec<String>,
}

/// Analyze the conditioning of a dense stiffness matrix.
///
/// Takes a dense (row-major) stiffness matrix `k` of size `n x n` and returns
/// a `ConditioningReport` with:
/// - `diagonal_ratio`: max(K_ii) / min(K_ii) for nonzero diagonals
/// - `near_zero_dofs`: DOF indices where |K_ii| < max_diag * 1e-12
/// - `warnings`: human-readable warnings about detected issues
pub fn check_conditioning(k: &[f64], n: usize) -> ConditioningReport {
    assert!(k.len() >= n * n, "Matrix too small: expected {} elements, got {}", n * n, k.len());

    check_diagonals((0..n).map(|i| k[i * n + i]))
}

pub fn check_sparse_conditioning(k: &crate::linalg::sparse::CscMatrix) -> ConditioningReport {
    check_diagonals((0..k.n).map(|j| {
        (k.col_ptr[j]..k.col_ptr[j + 1]).find(|&p| k.row_idx[p] == j).map_or(0.0, |p| k.values[p])
    }))
}

fn check_diagonals(diagonals: impl Iterator<Item = f64> + Clone) -> ConditioningReport {
    let max_diag = diagonals.clone().map(f64::abs).fold(0.0f64, f64::max);
    let threshold = if max_diag > 0.0 { max_diag * 1e-12 } else { f64::EPSILON };
    let mut min_nonzero_diag = f64::MAX;
    let mut near_zero_dofs = Vec::new();
    for (i, d) in diagonals.map(f64::abs).enumerate() {
        if d <= threshold {
            near_zero_dofs.push(i);
        } else if d < min_nonzero_diag {
            min_nonzero_diag = d;
        }
    }
    let diagonal_ratio = if min_nonzero_diag < f64::MAX && min_nonzero_diag > 0.0 {
        max_diag / min_nonzero_diag
    } else { 0.0 };

    // Build warnings
    let mut warnings = Vec::new();

    if !near_zero_dofs.is_empty() {
        warnings.push(format!(
            "{} near-zero diagonal(s) detected at DOFs: {:?}",
            near_zero_dofs.len(),
            &near_zero_dofs[..near_zero_dofs.len().min(10)]
        ));
    }

    if diagonal_ratio > 1e12 {
        warnings.push(format!(
            "Extremely high diagonal ratio {:.2e} — matrix is likely ill-conditioned",
            diagonal_ratio
        ));
    } else if diagonal_ratio > 1e8 {
        warnings.push(format!(
            "High diagonal ratio {:.2e} — potential conditioning issues",
            diagonal_ratio
        ));
    }

    if max_diag == 0.0 {
        warnings.push("All diagonal entries are zero — singular matrix".to_string());
    }

    ConditioningReport {
        diagonal_ratio,
        near_zero_dofs,
        warnings,
    }
}

impl ConditioningReport {
    pub fn legacy_diagnostics(&self) -> Vec<crate::types::SolverDiagnostic> {
        self.warnings.iter().map(|message| crate::types::SolverDiagnostic {
            category: "conditioning".into(), message: message.clone(), severity: "warning".into(),
        }).collect()
    }

    pub fn structured_diagnostics(&self) -> Vec<crate::types::StructuredDiagnostic> {
        use crate::types::{DiagnosticCode, Severity, StructuredDiagnostic};
        let mut out = Vec::new();
        let cond = self.diagonal_ratio;
        if cond > 1e12 {
            out.push(StructuredDiagnostic::global(DiagnosticCode::ExtremelyHighDiagonalRatio, Severity::Warning,
                format!("Extremely high diagonal ratio {:.2e}", cond)).with_value(cond, 1e12).with_phase("conditioning"));
        } else if cond > 1e8 {
            out.push(StructuredDiagnostic::global(DiagnosticCode::HighDiagonalRatio, Severity::Warning,
                format!("High diagonal ratio {:.2e}", cond)).with_value(cond, 1e8).with_phase("conditioning"));
        }
        if !self.near_zero_dofs.is_empty() {
            out.push(StructuredDiagnostic::global(DiagnosticCode::NearZeroDiagonal, Severity::Warning,
                format!("{} near-zero diagonal entries", self.near_zero_dofs.len())).with_dofs(self.near_zero_dofs.clone()).with_phase("conditioning"));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_well_conditioned() {
        // 3x3 identity
        let k = vec![
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0,
        ];
        let report = check_conditioning(&k, 3);
        assert!((report.diagonal_ratio - 1.0).abs() < 1e-15);
        assert!(report.near_zero_dofs.is_empty());
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn test_near_zero_diagonal() {
        // DOF 1 has near-zero diagonal
        let k = vec![
            1e6, 0.0, 0.0,
            0.0, 1e-20, 0.0,
            0.0, 0.0, 1e6,
        ];
        let report = check_conditioning(&k, 3);
        assert_eq!(report.near_zero_dofs, vec![1]);
        assert!(!report.warnings.is_empty());
    }

    #[test]
    fn test_high_ratio() {
        // Very different diagonal magnitudes but both above near-zero threshold
        let k = vec![
            1e10, 0.0, 0.0,
            0.0,  0.1, 0.0,
            0.0,  0.0, 1e10,
        ];
        let report = check_conditioning(&k, 3);
        // ratio = 1e10 / 0.1 = 1e11 > 1e8 triggers "potential" warning
        assert!(report.diagonal_ratio > 1e10);
        assert!(report.warnings.iter().any(|w| w.contains("potential")));
    }

    #[test]
    fn test_zero_matrix() {
        let k = vec![0.0; 9];
        let report = check_conditioning(&k, 3);
        assert_eq!(report.near_zero_dofs, vec![0, 1, 2]);
        assert!(report.warnings.iter().any(|w| w.contains("zero")));
    }

    #[test]
    fn test_moderate_ratio() {
        // Ratio of ~1e10 should trigger "potential" warning
        let k = vec![
            1e10, 0.0,
            0.0,  1.0,
        ];
        let report = check_conditioning(&k, 2);
        assert!(report.diagonal_ratio > 1e9);
        assert!(report.warnings.iter().any(|w| w.contains("potential")));
    }
}
