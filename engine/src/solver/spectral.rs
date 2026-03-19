use crate::types::*;
use super::dof::DofNumbering;

/// Spectral analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralResult {
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

/// Solve 2D spectral analysis using pre-computed modal data.
pub fn solve_spectral_2d(input: &SpectralInput) -> Result<SpectralResult, String> {
    let solver_input = &input.solver;
    let modes = &input.modes;
    let spectrum = &input.spectrum;
    let direction = &input.direction;
    let rule = input.rule.as_deref().unwrap_or("CQC");
    let xi = input.xi.unwrap_or(0.05);
    let importance_factor = input.importance_factor.unwrap_or(1.0);
    let reduction_factor = input.reduction_factor.unwrap_or(1.0);

    let dof_num = DofNumbering::build_2d(solver_input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if modes.is_empty() {
        return Err("No modal results available".into());
    }

    // For each mode, compute peak response
    let mut modal_disps: Vec<Vec<f64>> = Vec::new();
    let mut modal_forces: Vec<Vec<f64>> = Vec::new();
    let mut per_mode = Vec::new();

    for (mode_idx, mode) in modes.iter().enumerate() {
        // Get Sa from spectrum
        let mut sa = interpolate_spectrum(spectrum, mode.period);
        if spectrum.in_g.unwrap_or(true) {
            sa *= 9.81;
        }
        sa *= importance_factor / reduction_factor;

        let sd = if mode.omega > 1e-10 { sa / (mode.omega * mode.omega) } else { 0.0 };

        let participation = match direction.as_str() {
            "X" => mode.participation_x,
            _ => mode.participation_y,
        };
        let meff = match direction.as_str() {
            "X" => mode.effective_mass_x,
            _ => mode.effective_mass_y,
        };
        let modal_force = meff * sa;

        // Build modal displacement vector
        let mut u_modal = vec![0.0; nf];
        for d in &mode.displacements {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 0)) {
                if idx < nf { u_modal[idx] = d.ux * participation * sd; }
            }
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 1)) {
                if idx < nf { u_modal[idx] = d.uz * participation * sd; }
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&idx) = dof_num.map.get(&(d.node_id, 2)) {
                    if idx < nf { u_modal[idx] = d.ry * participation * sd; }
                }
            }
        }
        modal_disps.push(u_modal.clone());

        // Compute element forces for this mode
        let mut u_full = vec![0.0; n];
        for i in 0..nf {
            u_full[i] = u_modal[i];
        }
        let ef = super::linear::compute_internal_forces_2d(solver_input, &dof_num, &u_full);
        let forces: Vec<f64> = ef.iter()
            .flat_map(|f| vec![f.n_start.abs().max(f.n_end.abs()),
                              f.v_start.abs().max(f.v_end.abs()),
                              f.m_start.abs().max(f.m_end.abs())])
            .collect();
        modal_forces.push(forces);

        per_mode.push(PerModeResult {
            mode: mode_idx + 1,
            period: mode.period,
            sa,
            sd,
            participation,
            modal_force,
        });
    }

    // Combine modal responses
    let n_elems = if modal_forces.is_empty() { 0 } else { modal_forces[0].len() / 3 };

    let (combined_disps, combined_forces) = match rule {
        "SRSS" => combine_srss(&modal_disps, &modal_forces, nf, n_elems),
        _ => combine_cqc(&modal_disps, &modal_forces, modes, xi, nf, n_elems),
    };

    // Build combined displacement results
    let mut u_combined = vec![0.0; n];
    for i in 0..nf {
        u_combined[i] = combined_disps[i];
    }
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_combined);

    // Build element force envelopes
    let elem_ids: Vec<usize> = solver_input.elements.values().map(|e| e.id).collect();
    let element_forces: Vec<SpectralElementForce> = (0..n_elems)
        .map(|i| SpectralElementForce {
            element_id: if i < elem_ids.len() { elem_ids[i] } else { 0 },
            n_max: combined_forces[i * 3],
            v_max: combined_forces[i * 3 + 1],
            m_max: combined_forces[i * 3 + 2],
        })
        .collect();

    let base_shear: f64 = per_mode.iter()
        .map(|pm| pm.modal_force * pm.modal_force)
        .sum::<f64>()
        .sqrt();

    Ok(SpectralResult {
        displacements,
        element_forces,
        base_shear,
        per_mode,
        rule: rule.to_string(),
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

fn combine_srss(
    modal_disps: &[Vec<f64>],
    modal_forces: &[Vec<f64>],
    nf: usize,
    n_elems: usize,
) -> (Vec<f64>, Vec<f64>) {
    let mut disps = vec![0.0; nf];
    for i in 0..nf {
        let sum: f64 = modal_disps.iter().map(|md| md[i] * md[i]).sum();
        disps[i] = sum.sqrt();
    }
    let nf_forces = n_elems * 3;
    let mut forces = vec![0.0; nf_forces];
    for i in 0..nf_forces {
        let sum: f64 = modal_forces.iter().map(|mf| mf[i] * mf[i]).sum();
        forces[i] = sum.sqrt();
    }
    (disps, forces)
}

fn combine_cqc(
    modal_disps: &[Vec<f64>],
    modal_forces: &[Vec<f64>],
    modes: &[SpectralModeInput],
    xi: f64,
    nf: usize,
    n_elems: usize,
) -> (Vec<f64>, Vec<f64>) {
    let n_modes = modal_disps.len();

    // CQC correlation coefficients
    let mut rho = vec![vec![0.0; n_modes]; n_modes];
    for i in 0..n_modes {
        for j in 0..n_modes {
            let r = modes[j].omega / modes[i].omega;
            let num = 8.0 * xi * xi * (1.0 + r) * r.powf(1.5);
            let den = (1.0 - r * r).powi(2) + 4.0 * xi * xi * r * (1.0 + r).powi(2);
            rho[i][j] = if den.abs() > 1e-30 { num / den } else { if i == j { 1.0 } else { 0.0 } };
        }
    }

    let mut disps = vec![0.0; nf];
    for k in 0..nf {
        let mut sum = 0.0;
        for i in 0..n_modes {
            for j in 0..n_modes {
                sum += modal_disps[i][k] * rho[i][j] * modal_disps[j][k];
            }
        }
        disps[k] = sum.abs().sqrt();
    }

    let nf_forces = n_elems * 3;
    let mut forces = vec![0.0; nf_forces];
    for k in 0..nf_forces {
        let mut sum = 0.0;
        for i in 0..n_modes {
            for j in 0..n_modes {
                sum += modal_forces[i][k] * rho[i][j] * modal_forces[j][k];
            }
        }
        forces[k] = sum.abs().sqrt();
    }

    (disps, forces)
}

/// 3D spectral analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectralResult3D {
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
    let solver_input = &input.solver;
    let modes = &input.modes;
    let spectrum = &input.spectrum;
    let direction = &input.direction;
    let rule = input.rule.as_deref().unwrap_or("CQC");
    let xi = input.xi.unwrap_or(0.05);
    let importance_factor = input.importance_factor.unwrap_or(1.0);
    let reduction_factor = input.reduction_factor.unwrap_or(1.0);

    let dof_num = DofNumbering::build_3d(solver_input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if modes.is_empty() { return Err("No modal results available".into()); }

    let mut modal_disps: Vec<Vec<f64>> = Vec::new();
    let mut modal_forces: Vec<Vec<f64>> = Vec::new();
    let mut per_mode = Vec::new();

    for (mode_idx, mode) in modes.iter().enumerate() {
        let mut sa = interpolate_spectrum(spectrum, mode.period);
        if spectrum.in_g.unwrap_or(true) { sa *= 9.81; }
        sa *= importance_factor / reduction_factor;

        let sd = if mode.omega > 1e-10 { sa / (mode.omega * mode.omega) } else { 0.0 };

        let participation = match direction.as_str() {
            "X" => mode.participation_x,
            "Y" => mode.participation_y,
            _ => mode.participation_z,
        };
        let meff = match direction.as_str() {
            "X" => mode.effective_mass_x,
            "Y" => mode.effective_mass_y,
            _ => mode.effective_mass_z,
        };
        let modal_force = meff * sa;

        let mut u_modal = vec![0.0; nf];
        for d in &mode.displacements {
            let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            for (i, &val) in vals.iter().enumerate() {
                if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) {
                    if idx < nf { u_modal[idx] = val * participation * sd; }
                }
            }
        }
        modal_disps.push(u_modal.clone());

        let mut u_full = vec![0.0; n];
        for i in 0..nf { u_full[i] = u_modal[i]; }
        let ef = super::linear::compute_internal_forces_3d(solver_input, &dof_num, &u_full);
        let forces: Vec<f64> = ef.iter()
            .flat_map(|f| vec![
                f.n_start.abs().max(f.n_end.abs()),
                f.vy_start.abs().max(f.vy_end.abs()),
                f.vz_start.abs().max(f.vz_end.abs()),
                f.mx_start.abs().max(f.mx_end.abs()),
                f.my_start.abs().max(f.my_end.abs()),
                f.mz_start.abs().max(f.mz_end.abs()),
            ])
            .collect();
        modal_forces.push(forces);

        per_mode.push(PerModeResult {
            mode: mode_idx + 1, period: mode.period, sa, sd, participation, modal_force,
        });
    }

    let n_elems = if modal_forces.is_empty() { 0 } else { modal_forces[0].len() / 6 };

    let n_force_components = n_elems * 6;
    let (combined_disps, combined_forces) = match rule {
        "SRSS" => {
            let mut disps = vec![0.0; nf];
            for i in 0..nf {
                disps[i] = modal_disps.iter().map(|md| md[i] * md[i]).sum::<f64>().sqrt();
            }
            let mut forces = vec![0.0; n_force_components];
            for i in 0..n_force_components {
                forces[i] = modal_forces.iter().map(|mf| mf[i] * mf[i]).sum::<f64>().sqrt();
            }
            (disps, forces)
        }
        _ => {
            let omegas: Vec<f64> = modes.iter().map(|m| m.omega).collect();
            let n_modes = modal_disps.len();
            let mut rho = vec![vec![0.0; n_modes]; n_modes];
            for i in 0..n_modes {
                for j in 0..n_modes {
                    let r = omegas[j] / omegas[i];
                    let num = 8.0 * xi * xi * (1.0 + r) * r.powf(1.5);
                    let den = (1.0 - r * r).powi(2) + 4.0 * xi * xi * r * (1.0 + r).powi(2);
                    rho[i][j] = if den.abs() > 1e-30 { num / den } else { if i == j { 1.0 } else { 0.0 } };
                }
            }
            let mut disps = vec![0.0; nf];
            for k in 0..nf {
                let mut sum = 0.0;
                for i in 0..n_modes { for j in 0..n_modes { sum += modal_disps[i][k] * rho[i][j] * modal_disps[j][k]; } }
                disps[k] = sum.abs().sqrt();
            }
            let mut forces = vec![0.0; n_force_components];
            for k in 0..n_force_components {
                let mut sum = 0.0;
                for i in 0..n_modes { for j in 0..n_modes { sum += modal_forces[i][k] * rho[i][j] * modal_forces[j][k]; } }
                forces[k] = sum.abs().sqrt();
            }
            (disps, forces)
        }
    };

    let mut u_combined = vec![0.0; n];
    for i in 0..nf { u_combined[i] = combined_disps[i]; }
    let displacements = super::linear::build_displacements_3d(&dof_num, &u_combined);

    let elem_ids: Vec<usize> = solver_input.elements.values().map(|e| e.id).collect();
    let element_forces: Vec<SpectralElementForce3D> = (0..n_elems)
        .map(|i| SpectralElementForce3D {
            element_id: if i < elem_ids.len() { elem_ids[i] } else { 0 },
            n_max: combined_forces[i * 6],
            vy_max: combined_forces[i * 6 + 1],
            vz_max: combined_forces[i * 6 + 2],
            mx_max: combined_forces[i * 6 + 3],
            my_max: combined_forces[i * 6 + 4],
            mz_max: combined_forces[i * 6 + 5],
        })
        .collect();

    let base_shear: f64 = per_mode.iter()
        .map(|pm| pm.modal_force * pm.modal_force).sum::<f64>().sqrt();

    Ok(SpectralResult3D {
        displacements, element_forces, base_shear, per_mode, rule: rule.to_string(),
    })
}
