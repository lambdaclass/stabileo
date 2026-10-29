use crate::types::*;
use super::dof::DofNumbering;

/// Spectral analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralResult {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub displacements: Vec<Displacement>,
    pub element_forces: Vec<SpectralElementForce>,
    pub base_shear: f64,
    pub per_mode: Vec<PerModeResult>,
    pub rule: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralElementForce {
    pub element_id: usize,
    pub n_max: f64,
    pub v_max: f64,
    pub m_max: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerModeResult {
    pub mode: usize,
    pub period: f64,
    pub sa: f64,
    pub sd: f64,
    pub participation: f64,
    pub modal_force: f64,
}

/// The modal combination rule of a response-spectrum analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CombinationRule {
    /// Square root of the sum of squares.
    Srss,
    /// Complete quadratic combination, Der Kiureghian (1981), equal modal damping.
    Cqc,
}

impl CombinationRule {
    /// `None` is CQC. Anything other than exactly "SRSS" or "CQC" is refused (an unknown
    /// rule used to fall through to CQC silently), as for every enum string of the input:
    /// no trimming or case folding (tests/unknown_enum_strings.rs).
    pub fn parse(rule: Option<&str>) -> Result<Self, String> {
        match rule {
            None | Some("CQC") => Ok(CombinationRule::Cqc),
            Some("SRSS") => Ok(CombinationRule::Srss),
            Some(other) => Err(format!("Spectral analysis: unknown combination rule '{other}'; expected \"SRSS\" or \"CQC\"")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CombinationRule::Srss => "SRSS",
            CombinationRule::Cqc => "CQC",
        }
    }
}

/// Der Kiureghian's CQC coefficient for equal damping `xi`, `r = ω_j/ω_i`:
/// ρ = 8ξ²(1+r)r^{3/2} / ((1−r²)² + 4ξ²r(1+r)²). Symmetric in i, j; ρ_ii = 1.
pub fn cqc_coefficient(omega_i: f64, omega_j: f64, xi: f64) -> f64 {
    let r = omega_j / omega_i;
    let num = 8.0 * xi * xi * (1.0 + r) * r.powf(1.5);
    let den = (1.0 - r * r).powi(2) + 4.0 * xi * xi * r * (1.0 + r).powi(2);
    if den > 1e-30 {
        num / den
    } else if (r - 1.0).abs() < 1e-12 {
        // Coincident frequencies without damping: the limit is full correlation.
        1.0
    } else {
        0.0
    }
}

/// Combines per-mode values of one response quantity with the requested rule.
/// Every reported quantity (displacements, end forces, base shear) goes
/// through the same combiner: the base shear used to be SRSS whatever the
/// rule, which under-reported it when CQC was asked for (closely spaced modes
/// add their base shears with the same sign).
pub(crate) struct ModalCombiner {
    /// CQC coefficients, None for SRSS.
    rho: Option<Vec<Vec<f64>>>,
}

impl ModalCombiner {
    pub(crate) fn new(rule: CombinationRule, omegas: &[f64], xi: f64) -> Result<Self, String> {
        let rho = match rule {
            CombinationRule::Srss => None,
            CombinationRule::Cqc => {
                if !(xi.is_finite() && (0.0..1.0).contains(&xi)) {
                    return Err(format!("CQC damping ratio must be in [0, 1), got {xi}"));
                }
                if omegas.iter().any(|w| !(w.is_finite() && *w > 0.0)) {
                    return Err("CQC needs every mode's circular frequency finite and positive".into());
                }
                Some(
                    (0..omegas.len())
                        .map(|i| (0..omegas.len()).map(|j| if i == j { 1.0 } else { cqc_coefficient(omegas[i], omegas[j], xi) }).collect())
                        .collect(),
                )
            }
        };
        Ok(ModalCombiner { rho })
    }

    /// The combined peak of a quantity whose signed value in mode `i` is `r(i)`.
    pub(crate) fn combine(&self, n_modes: usize, r: impl Fn(usize) -> f64) -> f64 {
        let vals: Vec<f64> = (0..n_modes).map(r).collect();
        let s: f64 = match &self.rho {
            None => vals.iter().map(|v| v * v).sum(),
            Some(rho) => {
                let mut s = 0.0;
                for i in 0..n_modes {
                    for j in 0..n_modes {
                        s += vals[i] * rho[i][j] * vals[j];
                    }
                }
                s
            }
        };
        s.abs().sqrt()
    }
}

/// Signed per-mode end forces of every member, `(element id, values)`: `values` is
/// `[start components…, end components…]`. Each end component is a response
/// quantity linear in the modal displacement, and it is that signed value the
/// rule combines; the envelope of the two ends is taken after combining.
/// (Combining per-mode max(|start|, |end|) made every CQC cross term
/// non-negative and mixed the two ends across modes.)
fn combine_end_forces(
    combiner: &ModalCombiner,
    per_mode: &[Vec<(usize, Vec<f64>)>],
    n_comp: usize,
) -> Vec<(usize, Vec<f64>)> {
    let n_modes = per_mode.len();
    let Some(first) = per_mode.first() else { return Vec::new() };
    first
        .iter()
        .enumerate()
        .map(|(e, (id, _))| {
            let vals = (0..n_comp)
                .map(|c| {
                    let start = combiner.combine(n_modes, |m| per_mode[m][e].1[c]);
                    let end = combiner.combine(n_modes, |m| per_mode[m][e].1[n_comp + c]);
                    start.max(end)
                })
                .collect();
            (*id, vals)
        })
        .collect()
}

/// Check the spectral data the solver trusts (issue #335): every mode has a
/// finite ω > 0 and period > 0 and finite participation, effective mass and
/// shape; the spectrum has finite ordinates at finite, strictly increasing
/// periods; ξ, the importance and reduction factors are finite, ξ ≥ 0 and the
/// factors > 0. A negative ω made the CQC ratio ω_j/ω_i negative, r^1.5 NaN,
/// and every combined displacement and force NaN; ω ≤ 0 also dropped the
/// mode silently (S_d = 0).
// `!(x > 0.0)` is deliberate: it also rejects NaN.
#[allow(clippy::neg_cmp_op_on_partial_ord)]
fn validate_spectral(
    modes: &[(f64, f64, Vec<f64>)],
    spectrum: &DesignSpectrum,
    xi: f64,
    importance: f64,
    reduction: f64,
) -> Result<(), String> {
    for (i, (omega, period, rest)) in modes.iter().enumerate() {
        // `!(x > 0.0)` also rejects NaN.
        if !omega.is_finite() || !(*omega > 0.0) {
            return Err(format!("Spectral analysis: mode {} has omega = {omega}; it must be finite and > 0", i + 1));
        }
        if !period.is_finite() || !(*period > 0.0) {
            return Err(format!("Spectral analysis: mode {} has period = {period}; it must be finite and > 0", i + 1));
        }
        if let Some(x) = rest.iter().find(|x| !x.is_finite()) {
            return Err(format!(
                "Spectral analysis: mode {} has a non-finite participation factor, effective mass or shape value ({x})",
                i + 1
            ));
        }
    }
    if let Some(p) = spectrum.points.iter().find(|p| !p.period.is_finite() || !p.sa.is_finite()) {
        return Err(format!("Spectral analysis: spectrum point (T = {}, Sa = {}) is not finite", p.period, p.sa));
    }
    if spectrum.points.windows(2).any(|w| !(w[0].period < w[1].period)) {
        return Err("Spectral analysis: spectrum periods must be strictly increasing".into());
    }
    if !xi.is_finite() || xi < 0.0 {
        return Err(format!("Spectral analysis: damping ratio xi = {xi} must be finite and >= 0"));
    }
    if !importance.is_finite() || !(importance > 0.0) {
        return Err(format!("Spectral analysis: importance factor {importance} must be finite and > 0"));
    }
    if !reduction.is_finite() || !(reduction > 0.0) {
        return Err(format!("Spectral analysis: reduction factor {reduction} must be finite and > 0"));
    }
    Ok(())
}

/// Index of the excitation direction among `accepted` ("X", "Y"[, "Z"]);
/// anything else is refused (it used to fall back to Y in 2D and Z in 3D).
pub(crate) fn spectral_direction(direction: &str, accepted: &[&str]) -> Result<usize, String> {
    accepted.iter().position(|&d| d == direction).ok_or_else(|| {
        format!(
            "Spectral analysis: unknown direction '{direction}'; expected one of {}",
            accepted.iter().map(|d| format!("\"{d}\"")).collect::<Vec<_>>().join(", ")
        )
    })
}

/// Backstop after the combination: a result with a non-finite number (an
/// overflow on huge but finite input) is refused, never returned.
fn check_finite_output(disps: &[f64], forces: &[f64], base_shear: f64, per_mode: &[PerModeResult]) -> Result<(), String> {
    let modal = per_mode.iter().flat_map(|m| [m.period, m.sa, m.sd, m.participation, m.modal_force]);
    if disps.iter().chain(forces).copied().chain(modal).all(f64::is_finite) && base_shear.is_finite() {
        Ok(())
    } else {
        Err("Spectral analysis: the combined response is not finite (overflow; check the modes, spectrum and factors)".into())
    }
}

/// Solve 2D spectral analysis using pre-computed modal data.
pub fn solve_spectral_2d(input: &SpectralInput) -> Result<SpectralResult, String> {
    super::linear::validate_input_2d(&input.solver)?;
    super::dynamic_validation::validate_mass_input_2d(&input.solver)?;
    if input.modes.is_empty() {
        return Err("Spectral analysis requires at least one mode (run modal analysis first)".to_string());
    }
    let solver_input = &input.solver;
    let modes = &input.modes;
    let spectrum = &input.spectrum;
    let direction = &input.direction;
    let rule = CombinationRule::parse(input.rule.as_deref())?;
    let xi = input.xi.unwrap_or(0.05);
    let importance_factor = input.importance_factor.unwrap_or(1.0);
    let reduction_factor = input.reduction_factor.unwrap_or(1.0);
    let dir = spectral_direction(direction, &["X", "Y"])?;
    let checked: Vec<(f64, f64, Vec<f64>)> = modes
        .iter()
        .map(|m| {
            let mut rest = vec![m.participation_x, m.participation_y, m.effective_mass_x, m.effective_mass_y];
            rest.extend(m.displacements.iter().flat_map(|d| [d.ux, d.uz, d.ry]));
            (m.omega, m.period, rest)
        })
        .collect();
    validate_spectral(&checked, spectrum, xi, importance_factor, reduction_factor)?;
    let omegas: Vec<f64> = modes.iter().map(|m| m.omega).collect();
    let combiner = ModalCombiner::new(rule, &omegas, xi)?;

    let dof_num = DofNumbering::build_2d(solver_input);
    let n = dof_num.n_total;

    // For each mode, compute peak response
    let mut modal_disps: Vec<Vec<f64>> = Vec::new();
    let mut modal_forces: Vec<Vec<(usize, Vec<f64>)>> = Vec::new();
    let mut per_mode = Vec::new();

    for (mode_idx, mode) in modes.iter().enumerate() {
        // Get Sa from spectrum
        let mut sa = interpolate_spectrum(spectrum, mode.period);
        if spectrum.in_g.unwrap_or(true) {
            sa *= 9.81;
        }
        sa *= importance_factor / reduction_factor;

        // ω > 0 for every mode (validate_spectral).
        let sd = sa / (mode.omega * mode.omega);

        let (participation, meff) = if dir == 0 {
            (mode.participation_x, mode.effective_mass_x)
        } else {
            (mode.participation_y, mode.effective_mass_y)
        };
        let modal_force = meff * sa;

        // Modal displacement vector over all DOFs, in global axes like the
        // mode shapes: at an inclined roller both components move although
        // only the tangential DOF is free, so restrained slots are kept too
        // (they are zero everywhere else).
        let mut u_full = vec![0.0; n];
        for d in &mode.displacements {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 0)) {
                u_full[idx] = d.ux * participation * sd;
            }
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 1)) {
                u_full[idx] = d.uz * participation * sd;
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&idx) = dof_num.map.get(&(d.node_id, 2)) {
                    u_full[idx] = d.ry * participation * sd;
                }
            }
        }
        modal_disps.push(u_full.clone());

        // Compute element forces for this mode
        // The mode's response to its spectral inertia forces only: no element
        // loads, whose fixed-end forces are static and must not be combined.
        let mut ef = super::linear::compute_internal_forces_2d_with_loads(solver_input, &[], &dof_num, &u_full);
        // The same member order in every mode: the per-end combination pairs
        // the modes' values by position.
        ef.sort_by_key(|f| f.element_id);
        modal_forces.push(
            ef.iter()
                .map(|f| (f.element_id, vec![f.n_start, f.v_start, f.m_start, f.n_end, f.v_end, f.m_end]))
                .collect(),
        );

        per_mode.push(PerModeResult {
            mode: mode_idx + 1,
            period: mode.period,
            sa,
            sd,
            participation,
            modal_force,
        });
    }

    let n_modes = modes.len();
    let combined_disps: Vec<f64> = (0..n).map(|k| combiner.combine(n_modes, |m| modal_disps[m][k])).collect();
    let displacements = super::linear::build_displacements_2d(&dof_num, &combined_disps);

    let element_forces: Vec<SpectralElementForce> = combine_end_forces(&combiner, &modal_forces, 3)
        .into_iter()
        .map(|(element_id, v)| SpectralElementForce { element_id, n_max: v[0], v_max: v[1], m_max: v[2] })
        .collect();

    // Modal base shears V_n = M*_n·Sa_n, combined with the requested rule.
    let base_shear = combiner.combine(n_modes, |m| per_mode[m].modal_force);
    let forces: Vec<f64> = element_forces.iter().flat_map(|f| [f.n_max, f.v_max, f.m_max]).collect();
    check_finite_output(&combined_disps, &forces, base_shear, &per_mode)?;

    Ok(SpectralResult {
        structured_diagnostics: {
            let mut diagnostics = crate::known_issues::for_2d(solver_input, crate::known_issues::Analysis::Modal);
            let k = super::sparse_assembly::assemble_stiffness_sparse_2d(solver_input, &dof_num).k_ff;
            crate::known_issues::attach(&mut diagnostics, crate::known_issues::sparse_conditioning(&k).into_iter().collect());
            let cs = super::constraints::FreeConstraintSystem::build_2d(solver_input, &dof_num)?;
            let reduced = cs.as_ref().map(|c| c.reduce_matrix_sparse(&k));
            crate::known_issues::attach(&mut diagnostics, crate::known_issues::sparse_stiffness_conditioning(reduced.as_ref().unwrap_or(&k)).into_iter().collect());
            diagnostics
        },
        displacements,
        element_forces,
        base_shear,
        per_mode,
        rule: rule.as_str().to_string(),
    })
}

fn interpolate_spectrum(spectrum: &DesignSpectrum, period: f64) -> f64 {
    if spectrum.points.is_empty() {
        return 0.0;
    }
    if period <= spectrum.points[0].period {
        return spectrum.points[0].sa;
    }
    let last = spectrum.points.last().unwrap();
    if period >= last.period {
        return last.sa;
    }
    for i in 0..spectrum.points.len() - 1 {
        let p1 = &spectrum.points[i];
        let p2 = &spectrum.points[i + 1];
        if period >= p1.period && period <= p2.period {
            let t = (period - p1.period) / (p2.period - p1.period);
            return p1.sa + t * (p2.sa - p1.sa);
        }
    }
    last.sa
}

/// 3D spectral analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralResult3D {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub displacements: Vec<Displacement3D>,
    pub element_forces: Vec<SpectralElementForce3D>,
    pub base_shear: f64,
    pub per_mode: Vec<PerModeResult>,
    pub rule: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralElementForce3D {
    pub element_id: usize,
    pub n_max: f64,
    pub vy_max: f64,
    pub vz_max: f64,
    pub mx_max: f64,
    pub my_max: f64,
    pub mz_max: f64,
}

/// Solve 3D spectral analysis using pre-computed modal data.
pub fn solve_spectral_3d(input: &SpectralInput3D) -> Result<SpectralResult3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    super::dynamic_validation::validate_mass_input_3d(&input.solver)?;
    if input.modes.is_empty() {
        return Err("Spectral analysis requires at least one mode (run modal analysis first)".to_string());
    }
    let solver_input = &input.solver;
    let modes = &input.modes;
    let spectrum = &input.spectrum;
    let direction = &input.direction;
    let rule = CombinationRule::parse(input.rule.as_deref())?;
    let xi = input.xi.unwrap_or(0.05);
    let importance_factor = input.importance_factor.unwrap_or(1.0);
    let reduction_factor = input.reduction_factor.unwrap_or(1.0);
    let dir = spectral_direction(direction, &["X", "Y", "Z"])?;
    let checked: Vec<(f64, f64, Vec<f64>)> = modes
        .iter()
        .map(|m| {
            let mut rest = vec![
                m.participation_x, m.participation_y, m.participation_z,
                m.effective_mass_x, m.effective_mass_y, m.effective_mass_z,
            ];
            rest.extend(m.displacements.iter().flat_map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]));
            (m.omega, m.period, rest)
        })
        .collect();
    validate_spectral(&checked, spectrum, xi, importance_factor, reduction_factor)?;
    let omegas: Vec<f64> = modes.iter().map(|m| m.omega).collect();
    let combiner = ModalCombiner::new(rule, &omegas, xi)?;

    let dof_num = DofNumbering::build_3d(solver_input);
    let n = dof_num.n_total;

    let mut modal_disps: Vec<Vec<f64>> = Vec::new();
    let mut modal_forces: Vec<Vec<(usize, Vec<f64>)>> = Vec::new();
    let mut per_mode = Vec::new();

    for (mode_idx, mode) in modes.iter().enumerate() {
        let mut sa = interpolate_spectrum(spectrum, mode.period);
        if spectrum.in_g.unwrap_or(true) { sa *= 9.81; }
        sa *= importance_factor / reduction_factor;

        // ω > 0 for every mode (validate_spectral).
        let sd = sa / (mode.omega * mode.omega);

        let (participation, meff) = match dir {
            0 => (mode.participation_x, mode.effective_mass_x),
            1 => (mode.participation_y, mode.effective_mass_y),
            _ => (mode.participation_z, mode.effective_mass_z),
        };
        let modal_force = meff * sa;

        // Over all DOFs in global axes (see the 2D solver).
        let mut u_full = vec![0.0; n];
        for d in &mode.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &val) in vals.iter().enumerate() {
                if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) {
                    u_full[idx] = val * participation * sd;
                }
            }
        }
        modal_disps.push(u_full.clone());
        // Spectral inertia forces only: no element loads (see the 2D solver).
        let mut ef = super::linear::compute_internal_forces_3d_with_loads(solver_input, &[], &dof_num, &u_full);
        // The same member order in every mode (see the 2D solver).
        ef.sort_by_key(|f| f.element_id);
        modal_forces.push(
            ef.iter()
                .map(|f| {
                    (f.element_id, vec![
                        f.n_start, f.vy_start, f.vz_start, f.mx_start, f.my_start, f.mz_start,
                        f.n_end, f.vy_end, f.vz_end, f.mx_end, f.my_end, f.mz_end,
                    ])
                })
                .collect(),
        );

        per_mode.push(PerModeResult {
            mode: mode_idx + 1, period: mode.period, sa, sd, participation, modal_force,
        });
    }

    let n_modes = modes.len();
    let combined_disps: Vec<f64> = (0..n).map(|k| combiner.combine(n_modes, |m| modal_disps[m][k])).collect();
    let displacements = super::linear::build_displacements_3d(&dof_num, &combined_disps);

    let element_forces: Vec<SpectralElementForce3D> = combine_end_forces(&combiner, &modal_forces, 6)
        .into_iter()
        .map(|(element_id, v)| SpectralElementForce3D {
            element_id,
            n_max: v[0],
            vy_max: v[1],
            vz_max: v[2],
            mx_max: v[3],
            my_max: v[4],
            mz_max: v[5],
        })
        .collect();

    // Modal base shears combined with the requested rule (see the 2D solver).
    let base_shear = combiner.combine(n_modes, |m| per_mode[m].modal_force);
    let forces: Vec<f64> = element_forces
        .iter()
        .flat_map(|f| [f.n_max, f.vy_max, f.vz_max, f.mx_max, f.my_max, f.mz_max])
        .collect();
    check_finite_output(&combined_disps, &forces, base_shear, &per_mode)?;

    Ok(SpectralResult3D {
        structured_diagnostics: {
            let mut diagnostics = crate::known_issues::for_3d(solver_input, crate::known_issues::Analysis::Modal);
            let k = super::assembly::assemble_sparse_3d(solver_input, &dof_num, false).k_ff;
            crate::known_issues::attach(&mut diagnostics, crate::known_issues::sparse_conditioning(&k).into_iter().collect());
            let cs = super::constraints::FreeConstraintSystem::build_3d(solver_input, &dof_num)?;
            let reduced = cs.as_ref().map(|c| c.reduce_matrix_sparse(&k));
            crate::known_issues::attach(&mut diagnostics, crate::known_issues::sparse_stiffness_conditioning(reduced.as_ref().unwrap_or(&k)).into_iter().collect());
            diagnostics
        },
        displacements, element_forces, base_shear, per_mode, rule: rule.as_str().to_string(),
    })
}
