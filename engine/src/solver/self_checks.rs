use crate::types::*;

const WARN: f64 = 1e-6;
const REFUSE: f64 = 1e-3;

fn diagnostic(phase: &str, value: f64, warn: f64, hard: f64) -> Result<StructuredDiagnostic, String> {
    if !value.is_finite() || value >= hard {
        return Err(format!("REFUSE: self-check {phase}: {value:.3e} exceeds {hard:.3e}"));
    }
    Ok(StructuredDiagnostic::global(
        if value >= warn { DiagnosticCode::ResidualHigh } else { DiagnosticCode::ResidualOk },
        if value >= warn { Severity::Warning } else { Severity::Info },
        format!("{}: self-check {phase}: {value:.3e} (warning at {warn:.3e}, refusal at {hard:.3e})",
            if value >= warn { "WARN" } else { "PASS" }),
    ).with_value(value, warn).with_phase(&format!("self_check:{phase}")))
}

pub(super) fn residual(ku: &[f64], f: &[f64]) -> Result<StructuredDiagnostic, String> {
    let norm = |v: &[f64]| v.iter().fold(0.0_f64, |a, b| a.hypot(*b));
    let r: Vec<_> = ku.iter().zip(f).map(|(k,f)| k-f).collect();
    diagnostic("static_residual", norm(&r)/norm(f).max(1e-30), WARN, REFUSE)
}

fn statics(eq: &EquilibriumSummary, reactions: impl Iterator<Item = Vec<f64>>, dimensions: usize) -> Result<Vec<StructuredDiagnostic>, String> {
    let mut balance = eq.applied_force_sum[..dimensions].to_vec();
    let mut scale: f64 = balance.iter().map(|v| v.abs()).sum();
    for reaction in reactions {
        for (sum, force) in balance.iter_mut().zip(reaction) {
            if !force.is_finite() { return Err("REFUSE: self-check static_balance: non-finite reaction".into()); }
            *sum += force;
            scale += force.abs();
        }
    }
    let imbalance = balance.iter().try_fold(0.0_f64, |a, b| b.is_finite().then_some(a.max(b.abs())))
        .unwrap_or(f64::INFINITY) / scale.max(1.0);
    Ok(vec![
        diagnostic("static_residual", eq.relative_residual, WARN, REFUSE)?,
        diagnostic("static_balance", imbalance, WARN, REFUSE)?,
    ])
}

pub(super) fn static_2d(r: &mut AnalysisResults) -> Result<(), String> {
    if let Some(eq) = &r.equilibrium {
        let checks = statics(eq, r.reactions.iter().map(|r| vec![r.rx, r.rz]), 2)?;
        crate::known_issues::attach(&mut r.structured_diagnostics, checks);
    }
    Ok(())
}

pub(super) fn static_3d(r: &mut AnalysisResults3D) -> Result<(), String> {
    if let Some(eq) = &r.equilibrium {
        let checks = statics(eq, r.reactions.iter().map(|r| vec![r.fx, r.fy, r.fz]), 3)?;
        crate::known_issues::attach(&mut r.structured_diagnostics, checks);
    }
    Ok(())
}

#[derive(Default)]
pub(super) struct ModalChecks {
    normalized: Vec<Vec<f64>>,
    pub diagnostics: Vec<StructuredDiagnostic>,
}

impl ModalChecks {
    pub fn check(&mut self, phi: &[f64], lambda: f64, k_phi: &[f64], m_phi: &[f64]) -> Result<(), String> {
        let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a,b)| a*b).sum::<f64>();
        let norm = |v: &[f64]| v.iter().fold(0.0_f64, |a, b| a.hypot(*b));
        let mass = dot(phi, m_phi);
        if !mass.is_finite() || mass <= 0.0 {
            return Err("REFUSE: self-check modal_mass: non-positive modal mass".into());
        }
        let residual: Vec<_> = k_phi.iter().zip(m_phi).map(|(k,m)| k-lambda*m).collect();
        let relative = norm(&residual) / (norm(k_phi) + lambda.abs()*norm(m_phi)).max(f64::MIN_POSITIVE);
        self.diagnostics.push(diagnostic(&format!("modal_residual:{}", self.normalized.len()+1), relative, WARN, REFUSE)?);
        let phi: Vec<_> = phi.iter().map(|p| p/mass.sqrt()).collect();
        let m_phi: Vec<_> = m_phi.iter().map(|p| p/mass.sqrt()).collect();
        let mut orthogonality = (dot(&phi, &m_phi)-1.0).abs();
        for previous in &self.normalized {
            orthogonality = orthogonality.max(dot(previous, &m_phi).abs());
        }
        self.diagnostics.push(diagnostic(&format!("modal_orthogonality:{}", self.normalized.len()+1), orthogonality, WARN, REFUSE)?);
        self.normalized.push(phi);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_checks_corrupted_mode_and_duplicate_mode() {
        let mut c = ModalChecks::default();
        c.check(&[1.0,0.0], 2.0, &[2.0,0.0], &[1.0,0.0]).unwrap();
        assert!(c.check(&[1.0,0.1], 2.0, &[2.0,0.3], &[1.0,0.1]).unwrap_err().contains("modal_residual"));
        assert!(c.check(&[1.0,0.0], 2.0, &[2.0,0.0], &[1.0,0.0]).unwrap_err().contains("modal_orthogonality"));
        c.check(&[0.0,2.0], 3.0, &[0.0,6.0], &[0.0,2.0]).unwrap();
    }

    #[test]
    fn self_checks_warning_refusal_and_nonfinite() {
        assert_eq!(diagnostic("test", 2e-6, WARN, REFUSE).unwrap().severity, Severity::Warning);
        assert!(diagnostic("test", 1e-3, WARN, REFUSE).is_err());
        for v in [f64::NAN, f64::INFINITY] { assert!(diagnostic("test", v, WARN, REFUSE).is_err()); }
    }

    #[test]
    fn self_checks_corrupted_static_residual_and_reaction() {
        let mut eq = EquilibriumSummary { relative_residual: 0.0, residual_ok: true,
            applied_force_sum: vec![0.0,-10.0], reaction_force_sum: vec![0.0,10.0],
            max_imbalance: 0.0, equilibrium_ok: true };
        statics(&eq, vec![vec![0.0,10.0]].into_iter(), 2).unwrap();
        assert!(statics(&eq, vec![vec![0.0,9.0]].into_iter(), 2).unwrap_err().contains("static_balance"));
        eq.relative_residual = (2.0_f64 * 1.1 - 2.0).abs()/2.0;
        assert!(statics(&eq, vec![vec![0.0,10.0]].into_iter(), 2).unwrap_err().contains("static_residual"));
    }
    #[test]
    fn self_checks_static_modal_corpus() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        let names = ["cantilever", "ex-simply-supported", "ex-cantilever-point", "ex-continuous-beam",
            "ex-portal-frame", "ex-two-story-frame", "ex-warren-truss", "ex-howe-truss",
            "ex-gerber-beam", "ex-spring-support", "ex-thermal", "ex-settlement",
            "ex-3d-portal-frame", "ex-3d-space-truss", "ex-3d-torsion-beam", "ex-3d-grid-slab", "ex-3d-tower"];
        let mut counts = [0,0];
        for name in names {
            let input = std::fs::read_to_string(root.join(format!("{name}-input.json"))).unwrap();
            let checks = if name.contains("3d-") {
                let input: SolverInput3D = serde_json::from_str(&input).unwrap();
                let r = super::super::linear::solve_3d(&input).unwrap_or_else(|e| panic!("{name}: {e}"));
                let prepared = super::super::linear::prepare_static_3d(&input).unwrap();
                let mut corrupt = r.clone();
                let d = corrupt.displacements.iter_mut().max_by(|a,b| a.ux.abs().max(a.uy.abs()).max(a.uz.abs()).total_cmp(&b.ux.abs().max(b.uy.abs()).max(b.uz.abs()))).unwrap();
                d.ux += 0.1;
                assert!(prepared.check_returned_displacements(&input.loads, &corrupt).is_err(), "{name}");
                let densities = input.materials.keys().map(|k| (k.clone(),7850.0)).collect();
                let modal = super::super::modal::solve_modal_3d(&input, &densities, 3).unwrap_or_else(|e| panic!("{name} modal: {e}"));
                counts[1] += 1;
                [r.structured_diagnostics, modal.structured_diagnostics].concat()
            } else {
                let input: SolverInput = serde_json::from_str(&input).unwrap();
                let r = super::super::linear::solve_2d(&input).unwrap_or_else(|e| panic!("{name}: {e}"));
                let prepared = super::super::linear::prepare_static_2d(&input).unwrap();
                let mut corrupt = r.clone();
                let d = corrupt.displacements.iter_mut().max_by(|a,b| a.ux.abs().max(a.uz.abs()).total_cmp(&b.ux.abs().max(b.uz.abs()))).unwrap();
                d.ux += 0.1;
                assert!(prepared.check_returned_displacements(&input.loads, &corrupt).is_err(), "{name}");
                let densities = input.materials.keys().map(|k| (k.clone(),7850.0)).collect();
                let modal = super::super::modal::solve_modal_2d(&input, &densities, 3).unwrap_or_else(|e| panic!("{name} modal: {e}"));
                counts[1] += 1;
                [r.structured_diagnostics, modal.structured_diagnostics].concat()
            };
            counts[0] += 1;
            let checks: Vec<_> = checks.iter().filter(|d| d.phase.as_deref().unwrap_or("").starts_with("self_check:")).collect();
            assert!(checks.len() >= 4, "{name}: missing checks");
            for check in checks { assert_eq!(check.severity, Severity::Info, "{name}: {}", check.message); }
        }
        assert_eq!(counts, [17,17]);
    }

}
