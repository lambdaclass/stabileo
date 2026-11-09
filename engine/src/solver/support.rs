use crate::types::*;

pub(crate) const MAX_SUPPORT_ANGLE: f64 = 1_000_000.0;

pub(crate) fn prepare_support_angle(angle: f64) -> f64 {
    let reduced = angle.rem_euclid(std::f64::consts::TAU);
    if reduced == 0.0 || reduced == std::f64::consts::TAU { 0.0 } else { reduced }
}

fn validate_angle(key: &str, node: usize, angle: Option<f64>) -> Result<(), String> {
    if angle.is_some_and(|a| !a.is_finite() || a.abs() > MAX_SUPPORT_ANGLE) {
        let message = format!("Support {key} (node {node}): the support angle must be finite and its magnitude must not exceed {MAX_SUPPORT_ANGLE} radians. Give the angle within one turn (0 to 2π radians).");
        let diagnostic = StructuredDiagnostic::global(DiagnosticCode::InvalidSupportAngle, Severity::Error, &message)
            .with_nodes(vec![node]).with_phase("input");
        return Err(serde_json::json!({"message": message, "structuredDiagnostics": [diagnostic]}).to_string());
    }
    Ok(())
}

#[derive(Clone, Copy)]
pub(crate) struct SupportDof {
    pub restrained: bool,
    pub spring: Option<f64>,
    conflict: bool,
}

fn support_dof(restrained: bool, spring: Option<f64>, same_frame: bool) -> SupportDof {
    SupportDof {
        restrained,
        spring,
        conflict: same_frame && restrained && spring.is_some_and(|k| k > 0.0),
    }
}

pub(crate) fn support_dofs_2d(s: &SolverSupport) -> [SupportDof; 3] {
    let restrained = match s.support_type.as_str() {
        "fixed" => [true, true, true],
        "pinned" => [true, true, false],
        "rollerX" | "inclinedRoller" => [false, true, false],
        "rollerY" | "rollerZ" => [true, false, false],
        "guidedX" => [false, true, true],
        "guidedY" | "guidedZ" => [true, false, true],
        _ => [false; 3],
    };
    let springs = [s.kx, s.ky, s.kz];
    let inclined = s.support_type == "inclinedRoller";
    std::array::from_fn(|i| support_dof(restrained[i], springs[i], !inclined || i == 2))
}

pub(crate) fn support_dofs_3d(s: &SolverSupport3D) -> [SupportDof; 7] {
    let inclined = s.is_inclined.unwrap_or(false);
    let restrained = if inclined {
        [true, false, false, s.rrx, s.rry, s.rrz, s.rw.unwrap_or(false)]
    } else {
        [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz, s.rw.unwrap_or(false)]
    };
    let springs = [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.kw];
    std::array::from_fn(|i| support_dof(restrained[i], springs[i], !inclined || i >= 3))
}

fn validate<const N: usize>(key: &str, node: usize, dofs: [SupportDof; N], names: [&str; N], restraints: [&str; N]) -> Result<(), String> {
    for (i, d) in dofs.into_iter().enumerate() {
        if d.conflict {
            let message = format!(
                "Support {key} (node {node}): {} contradicts the rigid restraint {} on the same DOF. Remove {} to keep it rigid, or release {} to use the spring.",
                names[i], restraints[i], names[i], restraints[i],
            );
            let diagnostic = StructuredDiagnostic::global(DiagnosticCode::ConflictingSupportSpring, Severity::Error, &message)
                .with_nodes(vec![node]).with_dofs(vec![i]).with_phase("input");
            return Err(serde_json::json!({"message": message, "structuredDiagnostics": [diagnostic]}).to_string());
        }
    }
    Ok(())
}

pub(crate) fn validate_supports_2d(input: &SolverInput) -> Result<(), String> {
    for (key, s) in crate::ordered::entries(&input.supports) {
        validate_angle(key, s.node_id, s.angle)?;
        let restraint = ["ux", "uz", "ry"].map(|d| format!("type={} ({d})", s.support_type));
        validate(key, s.node_id, support_dofs_2d(s), ["kx", "ky", "kz"], restraint.each_ref().map(String::as_str))?;
    }
    Ok(())
}

pub(crate) fn validate_supports_3d(input: &SolverInput3D) -> Result<(), String> {
    for (key, s) in crate::ordered::entries(&input.supports) {
        validate(key, s.node_id, support_dofs_3d(s), ["kx", "ky", "kz", "krx", "kry", "krz", "kw"], ["rx", "ry", "rz", "rrx", "rry", "rrz", "rw"])?;
    }
    Ok(())
}
