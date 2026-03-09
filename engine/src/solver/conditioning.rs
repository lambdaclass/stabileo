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

    let mut max_diag = 0.0f64;
    let mut min_nonzero_diag = f64::MAX;
    let mut near_zero_dofs = Vec::new();

    // First pass: find max diagonal
    for i in 0..n {
        let d = k[i * n + i].abs();
        if d > max_diag {
            max_diag = d;
        }
    }

    let threshold = if max_diag > 0.0 { max_diag * 1e-12 } else { f64::EPSILON };

    // Second pass: find near-zero diagonals and min nonzero diagonal
    for i in 0..n {
        let d = k[i * n + i].abs();
        if d <= threshold {
            near_zero_dofs.push(i);
        } else {
            if d < min_nonzero_diag {
                min_nonzero_diag = d;
            }
        }
    }

    let diagonal_ratio = if min_nonzero_diag < f64::MAX && min_nonzero_diag > 0.0 {
        max_diag / min_nonzero_diag
    } else {
        0.0
    };

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
