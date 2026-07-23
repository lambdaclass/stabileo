//! Shared parameter validation for dynamic-analysis entry points.

use std::collections::HashMap;

/// Densities must be finite and >= 0, and at least one must be > 0
/// (an all-zero mass matrix makes any dynamic analysis meaningless).
pub(crate) fn validate_densities(densities: &HashMap<String, f64>) -> Result<(), String> {
    let mut any_positive = false;
    for (id, &rho) in densities {
        if !rho.is_finite() || rho < 0.0 {
            return Err(format!(
                "Density for material {}: must be finite and >= 0 (got {})", id, rho
            ));
        }
        if rho > 0.0 {
            any_positive = true;
        }
    }
    if !any_positive {
        return Err("At least one material density must be > 0 for dynamic analysis".to_string());
    }
    Ok(())
}

pub(crate) fn validate_time_params(time_step: f64, n_steps: usize) -> Result<(), String> {
    if !time_step.is_finite() || time_step <= 0.0 {
        return Err(format!("time_step must be finite and > 0 (got {})", time_step));
    }
    if n_steps == 0 {
        return Err("n_steps must be >= 1".to_string());
    }
    Ok(())
}
