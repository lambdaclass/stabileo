//! Bounded JSON contract for the opt-in browser experiment; no production dispatch.
use super::total_lagrangian_beam_2d::{self as beam, stability, BeamEquilibrium2D, BeamModel2D};
use super::{IterationMethod, LoadStepping};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub model: BeamModel2D,
    pub control: Control,
    pub equilibrium_tolerance: f64,
    pub refinement: Option<stability::Refinement>,
    pub imperfection: Option<Imperfection>,
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Control {
    Load {
        increments: usize,
        max_iterations: usize,
        tolerance: f64,
    },
    Arc {
        steps: usize,
        max_iterations: usize,
        tolerance: f64,
        initial_radius: f64,
        min_radius: f64,
        max_radius: f64,
        load_weight: f64,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Imperfection {
    pub shape: Vec<[f64; 2]>,
    pub amplitude: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Study {
    pub model: BeamModel2D,
    pub offsets: Vec<[f64; 2]>,
    pub completed: bool,
    pub iterations: usize,
    pub last_equilibrium: BeamEquilibrium2D,
    pub states: Vec<stability::CheckedState>,
    /// None means no sampled transition, or localization was not requested.
    pub critical: Option<stability::CriticalBracket>,
    pub localization_requested: bool,
}

pub fn from_json(json: &str) -> Result<Study, String> {
    if json.len() > 1_048_576 {
        return Err("Experimental beam request exceeds the 1 MiB input budget".into());
    }
    let request: Request = serde_json::from_str(json).map_err(|e| format!("Parse error: {e}"))?;
    run(request)
}

pub fn run(request: Request) -> Result<Study, String> {
    let (model, offsets) = if let Some(imperfection) = request.imperfection {
        let changed = stability::with_imperfection(
            &request.model,
            &imperfection.shape,
            imperfection.amplitude,
        )?;
        (changed.model, changed.offsets)
    } else {
        let offsets = vec![[0.0; 2]; request.model.positions.len()];
        (request.model, offsets)
    };
    // Validate the diagnostic tolerance and the original admission guards before solving.
    stability::diagnose_state(
        &model,
        0.0,
        &vec![[0.0; 3]; model.positions.len()],
        request.equilibrium_tolerance,
    )?;
    let path = match request.control {
        Control::Load {
            increments,
            max_iterations,
            tolerance,
        } => beam::solve_load_control(
            &model,
            beam::LoadControl {
                increments,
                max_iterations,
                tolerance,
                method: IterationMethod::Newton,
                stepping: LoadStepping::Equal,
            },
        )?,
        Control::Arc {
            steps,
            max_iterations,
            tolerance,
            initial_radius,
            min_radius,
            max_radius,
            load_weight,
        } => beam::solve_arc_length(
            &model,
            beam::ArcControl {
                steps,
                max_iterations,
                tolerance,
                initial_radius,
                min_radius,
                max_radius,
                load_weight,
            },
        )?,
    };
    let states = stability::diagnose_path(&model, &path, request.equilibrium_tolerance)?;
    let critical = request
        .refinement
        .map(|options| stability::locate_first_loss(&model, &path, options))
        .transpose()?
        .flatten();
    Ok(Study {
        model,
        offsets,
        completed: path.completed,
        iterations: path.iterations,
        last_equilibrium: path.last_equilibrium,
        states,
        critical,
        localization_requested: request.refinement.is_some(),
    })
}

#[cfg(test)]
mod tests;
