use crate::types::*;
use serde::{Deserialize, Serialize};
use super::diagram_extrema::{distributed_actions, Curve, Cut, MovingForceCuts, PointAction, Response};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramPoint3D {
    pub t: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDiagram3D {
    pub element_id: usize,
    pub points: Vec<DiagramPoint3D>,
    pub max_value: f64,
    pub min_value: f64,
    pub max_abs_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramResults3D {
    pub moment_y: Vec<ElementDiagram3D>,
    pub moment_z: Vec<ElementDiagram3D>,
    pub shear_y: Vec<ElementDiagram3D>,
    pub shear_z: Vec<ElementDiagram3D>,
    pub axial: Vec<ElementDiagram3D>,
    pub torsion: Vec<ElementDiagram3D>,
}

pub fn diagram_positions_3d(ef: &ElementForces3D, kind: &str) -> Vec<f64> {
    if let Err(error) = validate_diagram_loads_3d(ef) { panic!("{error}"); }
    let mut positions: Vec<_> = spatial_curve(ef, kind).diagram_cuts(21).unwrap_or_else(|error| panic!("{error}")).into_iter().map(|cut| cut.t).collect();
    positions.dedup();
    positions
}

pub(crate) fn diagram_critical_cuts_3d(ef: &ElementForces3D, kind: &str) -> Result<Vec<Cut>, String> {
    validate_diagram_loads_3d(ef)?;
    spatial_curve(ef, kind).critical_cuts().map_err(|e| format!("Element {} {kind}: {e}", ef.element_id))
}

// ==================== Evaluate at t ====================

/// The 3D diagram kinds `evaluate_diagram_3d_at` evaluates.
pub const DIAGRAM_KINDS_3D: [&str; 6] = ["momentY", "momentZ", "shearY", "shearZ", "axial", "torsion"];

/// Refuse an unknown diagram kind (the evaluator returns 0 for one).
pub fn check_diagram_kind_3d(kind: &str) -> Result<(), String> {
    if DIAGRAM_KINDS_3D.contains(&kind) {
        Ok(())
    } else {
        Err(format!("unknown diagram kind '{kind}'; accepted: {}", DIAGRAM_KINDS_3D.join(", ")))
    }
}

/// Evaluate a 3D diagram value at position t.
pub fn evaluate_diagram_3d_at(
    ef: &ElementForces3D,
    kind: &str,
    t: f64,
) -> f64 {
    evaluate_diagram_cut_3d(ef, kind, Cut::left(t))
}

pub fn checked_diagram_value_3d(ef: &ElementForces3D, kind: &str, t: f64) -> Result<f64, String> {
    checked_diagram_limit_3d(ef, kind, t, false)
}

pub(crate) fn checked_diagram_limit_3d(ef: &ElementForces3D, kind: &str, t: f64, right: bool) -> Result<f64, String> {
    validate_diagram_input_3d(ef)?;
    check_diagram_kind_3d(kind)?;
    spatial_curve(ef, kind).checked_station_value(t, right).map_err(str::to_owned)
}

pub(crate) fn evaluate_diagram_cut_3d(ef: &ElementForces3D, kind: &str, cut: Cut) -> f64 {
    try_evaluate_diagram_cut_3d(ef, kind, cut).unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn try_evaluate_diagram_cut_3d(ef: &ElementForces3D, kind: &str, cut: Cut) -> Result<f64, String> {
    validate_diagram_loads_3d(ef)?;
    spatial_curve(ef, kind).checked_value(cut).map_err(str::to_owned)
}

pub(crate) fn member_diagram_range_3d(ef: &ElementForces3D, kind: &str, limits: MovingForceCuts<'_>) -> Result<(f64, f64), String> {
    validate_diagram_loads_3d(ef)?;
    let end = match kind {
        "momentY" => ef.my_end,
        "momentZ" => ef.mz_end,
        "shearY" => ef.vy_end,
        "shearZ" => ef.vz_end,
        "axial" => ef.n_end,
        "torsion" => ef.mx_end,
        _ => 0.0,
    };
    spatial_curve(ef, kind).interior_range(end, limits).map_err(str::to_owned)
}

fn spatial_curve<'a>(
    ef: &'a ElementForces3D, kind: &str,
) -> Curve<impl Iterator<Item = DistributedLoadInfo> + Clone + 'a, impl Iterator<Item = PointAction> + Clone + 'a> {
    let (start, slope, change, response, loads, qi, qj, points) = match kind {
        "momentZ" => (ef.mz_start, -ef.vy_start, 0.0, Response::Moment(-1.0),
            ef.distributed_loads_y.as_slice(), ef.q_yi, ef.q_yj, ef.point_loads_y.as_slice()),
        "momentY" => (ef.my_start, ef.vz_start, 0.0, Response::Moment(1.0),
            ef.distributed_loads_z.as_slice(), ef.q_zi, ef.q_zj, ef.point_loads_z.as_slice()),
        "shearY" => (ef.vy_start, 0.0, 0.0, Response::Force(1.0),
            ef.distributed_loads_y.as_slice(), ef.q_yi, ef.q_yj, ef.point_loads_y.as_slice()),
        "shearZ" => (ef.vz_start, 0.0, 0.0, Response::Force(1.0),
            ef.distributed_loads_z.as_slice(), ef.q_zi, ef.q_zj, ef.point_loads_z.as_slice()),
        "axial" => {
            let change = match (ef.distributed_loads_x.is_empty(), ef.point_loads_x.is_empty()) {
                (true, true) => ef.n_end - ef.n_start,
                _ => 0.0,
            };
            (ef.n_start, 0.0, change, Response::Force(-1.0), ef.distributed_loads_x.as_slice(), 0.0, 0.0, ef.point_loads_x.as_slice())
        }
        "torsion" => (ef.mx_start, 0.0, ef.mx_end - ef.mx_start, Response::Force(1.0), &[][..], 0.0, 0.0, &[][..]),
        _ => (0.0, 0.0, 0.0, Response::Force(1.0), &[][..], 0.0, 0.0, &[][..]),
    };
    Curve {
        length: ef.length, start, change, slope, response,
        distributed: distributed_actions(ef.length, loads, qi, qj),
        points: points.iter().filter(|p| p.p != 0.0).map(move |p| {
            let (jump, slope) = match response {
                Response::Force(sign) => (sign * p.p, 0.0),
                Response::Moment(sign) => (0.0, sign * p.p),
            };
            PointAction { a: p.a, jump, slope }
        }),
    }
}

// ==================== Compute Diagram ====================

fn compute_single_diagram_3d(
    ef: &ElementForces3D,
    kind: &str,
) -> Result<ElementDiagram3D, String> {
    validate_diagram_loads_3d(ef)?;
    let curve = spatial_curve(ef, kind);

    let mut points = Vec::new();
    let mut max_val = f64::NEG_INFINITY;
    let mut min_val = f64::INFINITY;
    let mut max_abs_value: f64 = 0.0;

    let cuts = curve.diagram_cuts(21).map_err(|e| format!("Element {} {kind}: {e}", ef.element_id))?;
    for cut in cuts {
        let t = cut.t;
        let value = curve.checked_value(cut).map_err(|e| format!("Element {} {kind}: {e}", ef.element_id))?;
        if !value.is_finite() {
            return Err(format!("Element {} {kind}: non-finite diagram at t={t}", ef.element_id));
        }
        points.push(DiagramPoint3D { t, value });
        if value > max_val { max_val = value; }
        if value < min_val { min_val = value; }
        if value.abs() > max_abs_value.abs() {
            max_abs_value = value;
        }
    }

    Ok(ElementDiagram3D {
        element_id: ef.element_id,
        points,
        max_value: max_val,
        min_value: min_val,
        max_abs_value,
    })
}

/// Compute all 3D diagrams for all elements.
pub fn compute_diagrams_3d(results: &AnalysisResults3D) -> DiagramResults3D {
    try_compute_diagrams_3d(results).unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn try_compute_diagrams_3d(results: &AnalysisResults3D) -> Result<DiagramResults3D, String> {
    let kinds = ["momentY", "momentZ", "shearY", "shearZ", "axial", "torsion"];
    // Iterate elements outermost so each element's forces stay in cache across
    // all six kinds, instead of six separate passes over the whole vector.
    let mut all: Vec<Vec<ElementDiagram3D>> =
        kinds.iter().map(|_| Vec::with_capacity(results.element_forces.len())).collect();
    for ef in &results.element_forces {
        for (k, kind) in kinds.iter().enumerate() {
            all[k].push(compute_single_diagram_3d(ef, kind)?);
        }
    }

    Ok(DiagramResults3D {
        moment_y: all.remove(0),
        moment_z: all.remove(0),
        shear_y: all.remove(0),
        shear_z: all.remove(0),
        axial: all.remove(0),
        torsion: all.remove(0),
    })
}

pub fn validate_diagram_loads_3d(ef: &ElementForces3D) -> Result<(), String> {
    for d in ef.distributed_loads_x.iter().chain(&ef.distributed_loads_y).chain(&ef.distributed_loads_z) {
        crate::element::validate_member_load_interval(format_args!("Element {}", ef.element_id), ef.length, d.a, d.b)?;
    }
    Ok(())
}

pub fn validate_diagram_input_3d(ef: &ElementForces3D) -> Result<(), String> {
    crate::boundary::require_finite(ef)?;
    validate_diagram_loads_3d(ef)
}
