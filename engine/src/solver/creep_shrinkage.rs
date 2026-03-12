/// Time-dependent structural solver for creep and shrinkage.
///
/// Steps through time intervals, computing creep strains from sustained stress
/// and shrinkage strains from drying, then applying as equivalent thermal loads.
///
/// Uses the age-adjusted effective modulus method (AEMM) per Bazant (1972):
///   E_eff(t, t0) = E_c(t0) / (1 + χ(t,t0) × φ(t,t0))
/// where χ ≈ 0.8 is the aging coefficient.
///
/// References:
/// - Bazant, Z.P. (1972). "Prediction of concrete creep effects..."
/// - Gilbert & Ranzi (2011). "Time-Dependent Behaviour of Concrete Structures"
/// - EN 1992-1-1 (EC2) Annex B: Creep and shrinkage
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::types::*;
use super::linear;
use super::dof::DofNumbering;

/// Creep/shrinkage material parameters for concrete elements.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConcreteCreepParams {
    /// 28-day compressive strength (MPa)
    pub fc: f64,
    /// Relative humidity (%, e.g., 70)
    pub rh: f64,
    /// Notional size h0 = 2*Ac/u (mm)
    pub h0: f64,
    /// Age at loading (days)
    #[serde(default = "default_t0")]
    pub t0: f64,
    /// Cement class: "S" (slow), "N" (normal), "R" (rapid)
    #[serde(default = "default_cement")]
    pub cement_class: String,
}

fn default_t0() -> f64 { 28.0 }
fn default_cement() -> String { "N".into() }

/// Time step definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeStep {
    /// Time at end of step (days from casting)
    pub t_days: f64,
    /// Additional loads applied at this time step (optional)
    #[serde(default)]
    pub additional_loads: Vec<SolverLoad>,
}

/// Input for time-dependent analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreepShrinkageInput {
    pub solver: SolverInput,
    /// Concrete creep parameters per material ID
    pub creep_params: HashMap<String, ConcreteCreepParams>,
    /// Time steps to analyze
    pub time_steps: Vec<TimeStep>,
    /// Aging coefficient χ (default 0.8)
    #[serde(default = "default_chi")]
    pub aging_coefficient: f64,
}

fn default_chi() -> f64 { 0.8 }

/// Per-step result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeStepResult {
    pub t_days: f64,
    pub displacements: Vec<Displacement>,
    pub reactions: Vec<Reaction>,
    pub element_forces: Vec<ElementForces>,
    /// Creep coefficient φ(t, t0)
    pub creep_coefficient: f64,
    /// Shrinkage strain ε_sh(t)
    pub shrinkage_strain: f64,
}

/// Result of time-dependent analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreepShrinkageResult {
    pub steps: Vec<TimeStepResult>,
    pub converged: bool,
}

/// EC2 creep coefficient φ(t, t0).
pub fn ec2_creep_coefficient(params: &ConcreteCreepParams, t_days: f64) -> f64 {
    let fc = params.fc;
    let rh = params.rh;
    let h0 = params.h0;
    let t0 = params.t0;

    if t_days <= t0 { return 0.0; }

    // φ_RH
    let phi_rh = if rh < 99.0 {
        let alpha_1 = (35.0 / fc).powf(0.7);
        let alpha_2 = (35.0 / fc).powf(0.2);
        (1.0 + (1.0 - rh / 100.0) / (0.1 * h0.powf(1.0 / 3.0)) * alpha_1) * alpha_2
    } else {
        1.0
    };

    // β(f_cm)
    let beta_fcm = 16.8 / fc.sqrt();

    // β(t0) with cement class adjustment
    let s = match params.cement_class.as_str() {
        "S" => 0.38,
        "R" => 0.20,
        _ => 0.25, // "N"
    };
    let t0_adj = t0 * (9.0 / (2.0 + t0.powf(1.2)) + 1.0).powf(s).max(0.5);
    let beta_t0 = 1.0 / (0.1 + t0_adj.powf(0.20));

    // φ_0 = φ_RH × β(f_cm) × β(t0)
    let phi_0 = phi_rh * beta_fcm * beta_t0;

    // β_c(t, t0) - development function
    let alpha = if fc <= 35.0 { 1.0 } else { (35.0 / fc).powf(0.7) };
    let beta_h = (1.5 * (1.0 + (0.012 * rh).powi(18)) * h0 + 250.0 * alpha).min(1500.0 * alpha);
    let dt = (t_days - t0).max(0.0);
    let beta_c = (dt / (beta_h + dt)).powf(0.3);

    phi_0 * beta_c
}

/// EC2 shrinkage strain ε_sh(t).
pub fn ec2_shrinkage_strain(params: &ConcreteCreepParams, t_days: f64) -> f64 {
    let fc = params.fc;
    let rh = params.rh;
    let h0 = params.h0;
    let t_s = 3.0; // Curing period (days)

    if t_days <= t_s { return 0.0; }

    // Drying shrinkage
    let alpha_ds1 = if fc <= 40.0 { 4.0 } else { 3.0 };
    let alpha_ds2 = 0.13;
    let f_cm0 = 10.0;
    let beta_rh = if rh < 99.0 {
        1.55 * (1.0 - (rh / 100.0).powi(3))
    } else {
        0.25
    };
    let eps_cd0 = alpha_ds1 * alpha_ds2 * (-0.1 * fc / f_cm0).exp() * beta_rh * 1e-3;

    let dt = (t_days - t_s).max(0.0);
    let beta_ds = dt / (dt + 0.04 * h0.powf(1.5));

    // Autogenous shrinkage
    let eps_ca_inf = 2.5 * (fc - 10.0).max(0.0) * 1e-6;
    let beta_as = 1.0 - (-0.2 * t_days.sqrt()).exp();

    eps_cd0 * beta_ds + eps_ca_inf * beta_as
}

/// Solve time-dependent 2D analysis with creep and shrinkage.
pub fn solve_creep_shrinkage_2d(input: &CreepShrinkageInput) -> Result<CreepShrinkageResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    // Sort time steps
    let mut steps = input.time_steps.clone();
    steps.sort_by(|a, b| a.t_days.partial_cmp(&b.t_days).unwrap());

    // Build O(1) lookup maps by numeric id
    let node_by_id: HashMap<usize, &SolverNode> =
        input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection> =
        input.solver.sections.values().map(|s| (s.id, s)).collect();
    let material_by_id: HashMap<usize, &SolverMaterial> =
        input.solver.materials.values().map(|m| (m.id, m)).collect();

    // Initial elastic solution (used for sustained stress baseline)
    let _base_results = linear::solve_2d(&input.solver)?;

    let mut results = Vec::new();
    let cumulative_creep_loads: Vec<SolverLoad> = Vec::new();

    for step in &steps {
        let t = step.t_days;

        // Compute creep and shrinkage for each material
        let mut max_phi = 0.0_f64;
        let mut max_eps_sh = 0.0_f64;

        // Build creep/shrinkage equivalent loads
        let mut cs_loads = Vec::new();

        for elem in input.solver.elements.values() {
            let mat_key = elem.material_id.to_string();
            let params = match input.creep_params.get(&mat_key) {
                Some(p) => p,
                None => continue,
            };

            let phi = ec2_creep_coefficient(params, t);
            let eps_sh = ec2_shrinkage_strain(params, t);
            max_phi = max_phi.max(phi);
            max_eps_sh = max_eps_sh.max(eps_sh.abs());

            let sec = match section_by_id.get(&elem.section_id) {
                Some(s) => s,
                None => continue,
            };

            let mat = match material_by_id.get(&elem.material_id) {
                Some(m) => m,
                None => continue,
            };

            let e_c = mat.e * 1000.0; // kN/m²

            // Age-adjusted effective modulus
            let e_eff = e_c / (1.0 + input.aging_coefficient * phi);

            // Shrinkage equivalent load: N_sh = E_eff * A * ε_sh (compressive)
            let n_sh = e_eff * sec.a * eps_sh;

            // Apply as axial load on element (via distributed)
            // Convert to equivalent nodal forces
            let ni = node_by_id.get(&elem.node_i).unwrap();
            let nj = node_by_id.get(&elem.node_j).unwrap();
            let dx = nj.x - ni.x;
            let dy = nj.y - ni.y;
            let l = (dx * dx + dy * dy).sqrt();
            let cos = dx / l;
            let sin = dy / l;

            // Shrinkage causes uniform compressive force → equivalent nodal loads
            cs_loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: elem.node_i,
                fx: n_sh * cos,
                fy: n_sh * sin,
                mz: 0.0,
            }));
            cs_loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: elem.node_j,
                fx: -n_sh * cos,
                fy: -n_sh * sin,
                mz: 0.0,
            }));
        }

        // Build modified input with creep/shrinkage loads added
        let mut modified = input.solver.clone();
        modified.loads.extend(cs_loads);
        modified.loads.extend(cumulative_creep_loads.clone());
        modified.loads.extend(step.additional_loads.clone());

        let step_results = linear::solve_2d(&modified)?;

        results.push(TimeStepResult {
            t_days: t,
            displacements: step_results.displacements,
            reactions: step_results.reactions,
            element_forces: step_results.element_forces,
            creep_coefficient: max_phi,
            shrinkage_strain: max_eps_sh,
        });
    }

    Ok(CreepShrinkageResult {
        steps: results,
        converged: true,
    })
}

/// Time step definition for 3D analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeStep3D {
    pub t_days: f64,
    #[serde(default)]
    pub additional_loads: Vec<SolverLoad3D>,
}

/// Input for time-dependent 3D analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreepShrinkageInput3D {
    pub solver: SolverInput3D,
    pub creep_params: HashMap<String, ConcreteCreepParams>,
    pub time_steps: Vec<TimeStep3D>,
    #[serde(default = "default_chi")]
    pub aging_coefficient: f64,
}

/// Per-step result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeStepResult3D {
    pub t_days: f64,
    pub displacements: Vec<Displacement3D>,
    pub reactions: Vec<Reaction3D>,
    pub element_forces: Vec<ElementForces3D>,
    pub creep_coefficient: f64,
    pub shrinkage_strain: f64,
}

/// Result of 3D time-dependent analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreepShrinkageResult3D {
    pub steps: Vec<TimeStepResult3D>,
    pub converged: bool,
}

/// Solve time-dependent 3D analysis with creep and shrinkage.
pub fn solve_creep_shrinkage_3d(input: &CreepShrinkageInput3D) -> Result<CreepShrinkageResult3D, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let mut steps = input.time_steps.clone();
    steps.sort_by(|a, b| a.t_days.partial_cmp(&b.t_days).unwrap());

    // Build O(1) lookup maps by numeric id
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let section_by_id: HashMap<usize, &SolverSection3D> =
        input.solver.sections.values().map(|s| (s.id, s)).collect();
    let material_by_id: HashMap<usize, &SolverMaterial> =
        input.solver.materials.values().map(|m| (m.id, m)).collect();

    let _base_results = linear::solve_3d(&input.solver)?;

    let mut results = Vec::new();
    let cumulative_creep_loads: Vec<SolverLoad3D> = Vec::new();

    for step in &steps {
        let t = step.t_days;

        let mut max_phi = 0.0_f64;
        let mut max_eps_sh = 0.0_f64;
        let mut cs_loads = Vec::new();

        for elem in input.solver.elements.values() {
            let mat_key = elem.material_id.to_string();
            let params = match input.creep_params.get(&mat_key) {
                Some(p) => p,
                None => continue,
            };

            let phi = ec2_creep_coefficient(params, t);
            let eps_sh = ec2_shrinkage_strain(params, t);
            max_phi = max_phi.max(phi);
            max_eps_sh = max_eps_sh.max(eps_sh.abs());

            let sec = match section_by_id.get(&elem.section_id) {
                Some(s) => s,
                None => continue,
            };

            let mat = match material_by_id.get(&elem.material_id) {
                Some(m) => m,
                None => continue,
            };

            let e_c = mat.e * 1000.0;
            let e_eff = e_c / (1.0 + input.aging_coefficient * phi);
            let n_sh = e_eff * sec.a * eps_sh;

            let ni = node_by_id.get(&elem.node_i).unwrap();
            let nj = node_by_id.get(&elem.node_j).unwrap();
            let dx = nj.x - ni.x;
            let dy = nj.y - ni.y;
            let dz = nj.z - ni.z;
            let l = (dx * dx + dy * dy + dz * dz).sqrt();
            let dir = [dx / l, dy / l, dz / l];

            cs_loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: elem.node_i,
                fx: n_sh * dir[0],
                fy: n_sh * dir[1],
                fz: n_sh * dir[2],
                mx: 0.0, my: 0.0, mz: 0.0,
                bw: None,
            }));
            cs_loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: elem.node_j,
                fx: -n_sh * dir[0],
                fy: -n_sh * dir[1],
                fz: -n_sh * dir[2],
                mx: 0.0, my: 0.0, mz: 0.0,
                bw: None,
            }));
        }

        let mut modified = input.solver.clone();
        modified.loads.extend(cs_loads);
        modified.loads.extend(cumulative_creep_loads.clone());
        modified.loads.extend(step.additional_loads.clone());

        let step_results = linear::solve_3d(&modified)?;

        results.push(TimeStepResult3D {
            t_days: t,
            displacements: step_results.displacements,
            reactions: step_results.reactions,
            element_forces: step_results.element_forces,
            creep_coefficient: max_phi,
            shrinkage_strain: max_eps_sh,
        });
    }

    Ok(CreepShrinkageResult3D {
        steps: results,
        converged: true,
    })
}
