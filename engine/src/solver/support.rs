use crate::types::*;

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
