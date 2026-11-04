//! Load generation from the Argentine regulations: the coefficient and clause arithmetic the app
//! used to do in TypeScript. See `docs/verification/LOADS.md` for the clause-by-clause
//! verification and `docs/verification/TS_ENGINE_LOGIC.md` for what is still TypeScript.

pub mod cirsoc101_combinations;
pub mod cirsoc103_seismic;

use serde::Deserialize;
use serde_json::{json, Value};

use cirsoc103_seismic as s103;

/// One request to the loads entry point (`loads_request` in WASM).
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum LoadsRequest {
    Cirsoc101Combinations { inputs: cirsoc101_combinations::CombinationInputs },
    Cirsoc101LiveCompanion { inputs: cirsoc101_combinations::CombinationInputs },
    Cirsoc103Spectrum { inputs: s103::SpectrumInputs },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Ordinates { spectrum: s103::DesignSpectrum, periods: Vec<f64> },
    #[serde(rename_all = "camelCase")]
    Cirsoc103SpectrumPoints { spectrum: s103::DesignSpectrum, t_max: Option<f64> },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Weight { dead: f64, live: f64, snow: f64, occupancy: String, snow_retaining: bool },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Period { height: f64, system: String, computed_t: Option<f64>, #[serde(rename = "as")] as_: f64 },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Coefficient { spectrum: s103::DesignSpectrum, group: String, r: f64, t: f64 },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Distribution { levels: Vec<s103::MassLevel>, base_shear: f64, uncapped_t: f64, t2: Option<f64> },
    #[serde(rename_all = "camelCase")]
    Cirsoc103Applicability { zone: u8, group: String, height: f64, levels: u32, regularity: String, t: Option<f64>, t2: Option<f64> },
}

/// Answer one request as JSON. `Err` on an input outside the regulation's tables.
pub fn answer(req: LoadsRequest) -> Result<Value, String> {
    use LoadsRequest::*;
    Ok(match req {
        Cirsoc101Combinations { inputs } => json!(cirsoc101_combinations::generate_combinations(&inputs)),
        Cirsoc101LiveCompanion { inputs } => {
            let (factor, note) = cirsoc101_combinations::live_load_factor_in_companion(&inputs);
            json!({ "factor": factor, "note": note })
        }
        Cirsoc103Spectrum { inputs } => json!(s103::design_spectrum(&inputs)),
        Cirsoc103Ordinates { spectrum, periods } => {
            json!(periods.iter().map(|&t| s103::spectral_ordinate(t, &spectrum)).collect::<Vec<_>>())
        }
        Cirsoc103SpectrumPoints { spectrum, t_max } => json!(s103::spectrum_points(&spectrum, t_max)),
        Cirsoc103Weight { dead, live, snow, occupancy, snow_retaining } => {
            let f1 = s103::simultaneity_f1(&occupancy).ok_or_else(|| format!("unknown occupancy {occupancy}"))?;
            let (w, f2) = s103::seismic_weight(dead, live, snow, f1, snow_retaining);
            json!({ "weightKN": w, "f1": f1, "f2": f2 })
        }
        Cirsoc103Period { height, system, computed_t, as_ } => {
            json!(s103::design_period(height, &system, computed_t, as_).ok_or_else(|| format!("unknown system {system}"))?)
        }
        Cirsoc103Coefficient { spectrum, group, r, t } => {
            let g = s103::risk_factor(&group).ok_or_else(|| format!("unknown group {group}"))?;
            json!(s103::design_seismic_coefficient(&spectrum, g, r, t))
        }
        Cirsoc103Distribution { levels, base_shear, uncapped_t, t2 } => {
            json!(s103::distribute_in_height(&levels, base_shear, uncapped_t, t2))
        }
        Cirsoc103Applicability { zone, group, height, levels, regularity, t, t2 } => {
            json!(s103::static_method_applicable(zone, &group, height, levels, &regularity, t, t2))
        }
    })
}
