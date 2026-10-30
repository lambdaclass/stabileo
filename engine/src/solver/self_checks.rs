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
    let r: Vec<_> = ku.iter().zip(f).map(|(k,f)| k-f).collect();
    residual_from_difference(&r, f)
}

pub(super) fn residual_from_difference(r: &[f64], f: &[f64]) -> Result<StructuredDiagnostic, String> {
    if r.iter().chain(f).any(|v| !v.is_finite()) {
        return Err("REFUSE: self-check static_residual: non-finite equation".into());
    }
    let scale = r.iter().chain(f).fold(1.0_f64, |a,b| a.max(b.abs()));
    let norm = |v: &[f64]| v.iter().fold(0.0_f64, |a, b| a.hypot(*b/scale));
    diagnostic("static_residual", norm(r)/norm(f).max(1e-30/scale), WARN, REFUSE)
}

fn statics(eq: &EquilibriumSummary, reactions: impl Iterator<Item = Vec<f64>>, dimensions: usize, relative_residual: f64) -> Result<Vec<StructuredDiagnostic>, String> {
    let reactions: Vec<_> = reactions.collect();
    let applied = &eq.applied_force_sum[..dimensions];
    let components = &eq.applied_force_components;
    if applied.iter().chain(components).chain(reactions.iter().flatten()).any(|v| !v.is_finite()) {
        return Err("REFUSE: self-check static_balance: non-finite force".into());
    }
    let peak = applied.iter().chain(components).chain(reactions.iter().flatten()).fold(1.0_f64, |a,b| a.max(b.abs()));
    let mut balance: Vec<_> = applied.iter().map(|v| v/peak).collect();
    let mut scale: f64 = components.iter().map(|v| (v/peak).abs()).sum();
    for reaction in reactions {
        for (sum, force) in balance.iter_mut().zip(reaction) {
            *sum += force/peak;
            scale += (force/peak).abs();
        }
    }
    let imbalance = balance.iter().fold(0.0_f64, |a, b| a.max(b.abs())) / scale.max(1.0/peak);
    Ok(vec![
        diagnostic("static_residual", relative_residual, WARN, REFUSE)?,
        diagnostic("static_balance", imbalance, WARN, REFUSE)?,
    ])
}

pub(super) fn static_2d(r: &mut AnalysisResults, constraint_resultant: &[f64]) -> Result<(), String> {
    if let Some(eq) = &r.equilibrium {
        let relative_residual = r.structured_diagnostics.iter()
            .find(|d| d.phase.as_deref() == Some("self_check:static_residual"))
            .and_then(|d| d.value).unwrap_or(eq.relative_residual);
        let checks = statics(eq, r.reactions.iter().map(|r| vec![r.rx, r.rz]).chain(std::iter::once(constraint_resultant.to_vec())), 2, relative_residual)?;
        crate::known_issues::attach(&mut r.structured_diagnostics, checks);
    }
    Ok(())
}

pub(super) fn static_3d(r: &mut AnalysisResults3D, constraint_resultant: &[f64]) -> Result<(), String> {
    if let Some(eq) = &r.equilibrium {
        let relative_residual = r.structured_diagnostics.iter()
            .find(|d| d.phase.as_deref() == Some("self_check:static_residual"))
            .and_then(|d| d.value).unwrap_or(eq.relative_residual);
        let checks = statics(eq, r.reactions.iter().map(|r| vec![r.fx, r.fy, r.fz]).chain(std::iter::once(constraint_resultant.to_vec())), 3, relative_residual)?;
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
        let lm: Vec<_> = m_phi.iter().map(|m| lambda*m).collect();
        if k_phi.iter().chain(&lm).any(|v| !v.is_finite()) {
            return Err("REFUSE: self-check modal_residual: non-finite equation".into());
        }
        let scale = k_phi.iter().chain(&lm).fold(f64::MIN_POSITIVE, |a,b| a.max(b.abs()));
        let k: Vec<_> = k_phi.iter().map(|v| v/scale).collect();
        let lm: Vec<_> = lm.iter().map(|v| v/scale).collect();
        let residual: Vec<_> = k.iter().zip(&lm).map(|(k,m)| k-m).collect();
        let relative = norm(&residual) / (norm(&k) + norm(&lm)).max(f64::MIN_POSITIVE);
        self.diagnostics.push(diagnostic(&format!("modal_residual:{}", self.normalized.len()+1), relative, WARN, REFUSE)?);
        let phi: Vec<_> = phi.iter().map(|p| p/mass.sqrt()).collect();
        let m_phi: Vec<_> = m_phi.iter().map(|p| p/mass.sqrt()).collect();
        if phi.iter().chain(&m_phi).any(|v| !v.is_finite()) {
            return Err("REFUSE: self-check modal_orthogonality: non-finite normalized mode".into());
        }
        let mut orthogonality = (dot(&phi, &m_phi)-1.0).abs();
        if !orthogonality.is_finite() { return Err("REFUSE: self-check modal_orthogonality: non-finite Gram diagonal".into()); }
        for previous in &self.normalized {
            let entry = dot(previous, &m_phi).abs();
            if !entry.is_finite() { return Err("REFUSE: self-check modal_orthogonality: non-finite Gram entry".into()); }
            orthogonality = orthogonality.max(entry);
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
            applied_force_components: vec![0.0,-10.0], applied_force_sum: vec![0.0,-10.0], reaction_force_sum: vec![0.0,10.0],
            max_imbalance: 0.0, equilibrium_ok: true };
        statics(&eq, vec![vec![0.0,10.0]].into_iter(), 2, eq.relative_residual).unwrap();
        assert!(statics(&eq, vec![vec![0.0,9.0]].into_iter(), 2, eq.relative_residual).unwrap_err().contains("static_balance"));
        eq.relative_residual = (2.0_f64 * 1.1 - 2.0).abs()/2.0;
        assert!(statics(&eq, vec![vec![0.0,10.0]].into_iter(), 2, eq.relative_residual).unwrap_err().contains("static_residual"));
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

    #[test]
    fn self_checks_sparse_modal_2d() {
        let mut input: SolverInput = serde_json::from_str(include_str!("../../tests/fixtures/cantilever-input.json")).unwrap();
        let template = input.elements["1"].clone();
        input.elements.clear();
        let segments = 24;
        for i in 1..segments {
            let id = i + 2;
            input.nodes.insert(id.to_string(), SolverNode { id, x: 4.0*i as f64/segments as f64, z: 0.0 });
        }
        for i in 0..segments {
            let mut element = template.clone();
            element.id = i+1;
            element.node_i = if i == 0 { 1 } else { i+2 };
            element.node_j = if i+1 == segments { 2 } else { i+3 };
            input.elements.insert(element.id.to_string(), element);
        }
        let densities = input.materials.keys().map(|k| (k.clone(),7850.0)).collect();
        let r = super::super::modal::solve_modal_2d(&input, &densities, 6).unwrap();
        assert!(r.n_dof >= super::super::linear::SPARSE_THRESHOLD);
        assert_eq!(r.structured_diagnostics.len(), 12);
        assert!(r.structured_diagnostics.iter().all(|d| d.severity == Severity::Info));
    }

    #[test]
    fn self_checks_finite_extreme_scale_and_nonfinite_gram() {
        assert_eq!(residual_from_difference(&[1e293, -1e293], &[1e308, 1e308]).unwrap().severity, Severity::Info);
        let eq = EquilibriumSummary { relative_residual: 0.0, residual_ok: true,
            applied_force_components: vec![1e308,1e308], applied_force_sum: vec![1e308,1e308], reaction_force_sum: vec![], max_imbalance: 0.0, equilibrium_ok: true };
        assert!(statics(&eq, vec![vec![-1e308,-1e308]].into_iter(), 2, 0.0).unwrap().iter().all(|d| d.severity == Severity::Info));
        let mut checks = ModalChecks::default();
        checks.check(&[1.0,0.0], 1.0, &[1e308,0.0], &[1e308,0.0]).unwrap();
        assert!(checks.check(&[f64::NAN,1.0], 1.0, &[0.0,1.0], &[0.0,1.0]).is_err());
    }

}
