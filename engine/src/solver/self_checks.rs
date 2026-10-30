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

pub(super) fn residual_from_difference(r: &[f64], f: &[f64]) -> Result<StructuredDiagnostic, String> {
    if r.iter().chain(f).any(|v| !v.is_finite()) {
        return Err("REFUSE: self-check static_residual: non-finite equation".into());
    }
    let scale = r.iter().chain(f).fold(0.0_f64, |a,b| a.max(b.abs()));
    if scale == 0.0 { return diagnostic("static_residual", 0.0, WARN, REFUSE); }
    let norm = |v: &[f64]| v.iter().fold(0.0_f64, |a, b| a.hypot(*b/scale));
    diagnostic("static_residual", norm(r)/norm(f), WARN, REFUSE)
}

/// Diagonal energy scaling: force / sqrt(stiffness) has units sqrt(energy),
/// including moment/rotation, bimoment/warping and MPC generalized equations.
/// It is invariant to a change of units for any generalized coordinate.
pub(super) fn energy_scale(diagonal: &[f64]) -> Vec<f64> {
    diagonal.iter().map(|d| d.abs().sqrt()).collect()
}

pub(super) fn residual_energy(r: &[f64], f: &[f64], diagonal: &[f64]) -> Result<StructuredDiagnostic, String> {
    assert_eq!(r.len(), f.len());
    assert_eq!(r.len(), diagonal.len());
    if r.iter().chain(f).chain(diagonal).any(|v| !v.is_finite()) {
        return Err("REFUSE: self-check static_residual: non-finite equation".into());
    }
    let scales = energy_scale(diagonal);
    let scale = |v: &[f64]| v.iter().zip(&scales).map(|(v, s)| {
        if *s == 0.0 && *v == 0.0 { 0.0 } else { v / s }
    }).collect::<Vec<_>>();
    let (sr, sf) = (scale(r), scale(f));
    if r.iter().chain(f).zip(sr.iter().chain(&sf)).any(|(v, s)|
        *v != 0.0 && (*s == 0.0 || !s.is_finite())) && scales.iter().all(|s| *s > 0.0) {
        // Extreme finite unit scales can overflow/underflow before the norm.
        // Normalize in log space only in that exceptional case.
        let logs = |v: &[f64]| v.iter().zip(&scales)
            .map(|(v,s)| v.abs().ln() - s.ln()).collect::<Vec<_>>();
        let (lr, lf) = (logs(r), logs(f));
        let peak = lr.iter().chain(&lf).copied().fold(f64::NEG_INFINITY, f64::max);
        let normalized = |v: &[f64]| v.iter().map(|v| (v-peak).exp()).collect::<Vec<_>>();
        return residual_from_difference(&normalized(&lr), &normalized(&lf));
    }
    residual_from_difference(&sr, &sf)
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
    pub scales: Vec<f64>,
}

impl ModalChecks {
    pub fn check(&mut self, phi: &[f64], lambda: f64, k_phi: &[f64], m_phi: &[f64]) -> Result<(), String> {
        let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(a,b)| a*b).sum::<f64>();
        let norm = |v: &[f64]| v.iter().fold(0.0_f64, |a, b| a.hypot(*b));
        let mass = dot(phi, m_phi);
        if !mass.is_finite() || mass <= 0.0 {
            return Err("REFUSE: self-check modal_mass: non-positive modal mass".into());
        }
        let scaled = |v: &[f64]| v.iter().enumerate().map(|(i, v)| {
            let s = self.scales.get(i).copied().unwrap_or(1.0);
            if s == 0.0 && *v == 0.0 { 0.0 } else { v/s }
        }).collect::<Vec<_>>();
        let k_phi = scaled(k_phi);
        let lm = scaled(&m_phi.iter().map(|m| lambda*m).collect::<Vec<_>>());
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
    fn self_checks_zero_and_tiny_rhs() {
        residual_from_difference(&[0.0], &[0.0]).unwrap();
        assert!(residual_from_difference(&[1e-40], &[0.0]).is_err());
        assert!(residual_from_difference(&[1e-200], &[1e-200]).is_err());
        residual_from_difference(&[1e-212], &[1e-200]).unwrap();
        for stiffness in [1e-300, 1.0, 1e300] {
            assert!(residual_energy(&[1e-200], &[1e-200], &[stiffness]).is_err());
            assert!(residual_energy(&[1e-200], &[0.0], &[stiffness]).is_err());
            residual_energy(&[1e-212], &[1e-200], &[stiffness]).unwrap();
        }
    }

    #[test]
    fn self_checks_energy_scaled_rotational_corruption() {
        // Huge force terms must not mask a rotational equation error. Changing
        // rotation units scales its force by c and stiffness by c².
        for c in [1e-6, 1.0, 1e6] {
            let diagonal = [1e24, c*c];
            assert_eq!(residual_energy(&[0.0, 1e-5*c], &[1e12, c], &diagonal).unwrap().severity, Severity::Warning);
            let mut warned = ModalChecks { scales: energy_scale(&diagonal), ..Default::default() };
            warned.check(&[1.0, 1.0/c], 1.0, &[1e12, (1.0+1e-5)*c], &[1e12, c]).unwrap();
            assert_eq!(warned.diagnostics[0].severity, Severity::Warning);
            assert!(residual_energy(&[0.0, 0.01*c], &[1e12, c], &diagonal).is_err());
            let mut checks = ModalChecks { scales: energy_scale(&diagonal), ..Default::default() };
            assert!(checks.check(&[1.0, 1.0/c], 1.0, &[1e12, 1.01*c], &[1e12, c]).unwrap_err().contains("modal_residual"));
        }
    }

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
