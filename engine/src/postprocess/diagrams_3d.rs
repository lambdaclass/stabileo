use crate::types::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

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

const NUM_POINTS: usize = 21;

// ==================== Sampling ====================

fn build_sampling_positions_3d(
    length: f64,
    point_loads: &[PointLoadInfo3D],
) -> Vec<f64> {
    let mut positions = BTreeSet::new();
    for i in 0..NUM_POINTS {
        let t = i as f64 / (NUM_POINTS - 1) as f64;
        positions.insert((t * 1e12) as i64);
    }
    let eps = 1e-6;
    for pl in point_loads {
        let t_pl = pl.a / length;
        if t_pl > eps { positions.insert(((t_pl - eps) * 1e12) as i64); }
        positions.insert((t_pl * 1e12) as i64);
        if t_pl < 1.0 - eps { positions.insert(((t_pl + eps) * 1e12) as i64); }
    }
    positions.into_iter().map(|k| k as f64 / 1e12).collect()
}

// ==================== Evaluate at t ====================

/// Evaluate a 3D diagram value at position t.
pub fn evaluate_diagram_3d_at(
    ef: &ElementForces3D,
    kind: &str,
    t: f64,
) -> f64 {
    let l = ef.length;
    let x = t * l;

    match kind {
        "momentZ" => {
            let mut value = ef.mz_start - ef.vy_start * x;
            for dl in &ef.distributed_loads_y {
                let a = dl.a;
                let b = dl.b;
                let span = b - a;
                if span < 1e-12 { continue; }
                let dq = dl.q_j - dl.q_i;
                let x_clamp = x.min(b);
                if x_clamp <= a { continue; }
                let s = x_clamp - a;
                value -= dl.q_i * (s * (x - a) - s * s / 2.0)
                       + dq / span * (s * s / 2.0 * (x - a) - s * s * s / 3.0);
            }
            for pl in &ef.point_loads_y {
                if pl.a < x - 1e-10 {
                    value -= pl.p * (x - pl.a);
                }
            }
            value
        }
        "momentY" => {
            let mut value = ef.my_start + ef.vz_start * x;
            for dl in &ef.distributed_loads_z {
                let a = dl.a;
                let b = dl.b;
                let span = b - a;
                if span < 1e-12 { continue; }
                let dq = dl.q_j - dl.q_i;
                let x_clamp = x.min(b);
                if x_clamp <= a { continue; }
                let s = x_clamp - a;
                value += dl.q_i * (s * (x - a) - s * s / 2.0)
                       + dq / span * (s * s / 2.0 * (x - a) - s * s * s / 3.0);
            }
            for pl in &ef.point_loads_z {
                if pl.a < x - 1e-10 {
                    value += pl.p * (x - pl.a);
                }
            }
            value
        }
        "shearY" => {
            let mut value = ef.vy_start;
            for dl in &ef.distributed_loads_y {
                let a = dl.a;
                let b = dl.b;
                let span = b - a;
                if span < 1e-12 { continue; }
                let dq = dl.q_j - dl.q_i;
                let x_clamp = x.min(b);
                if x_clamp <= a { continue; }
                let s = x_clamp - a;
                value += dl.q_i * s + dq * s * s / (2.0 * span);
            }
            for pl in &ef.point_loads_y {
                if pl.a < x - 1e-10 { value += pl.p; }
            }
            value
        }
        "shearZ" => {
            let mut value = ef.vz_start;
            for dl in &ef.distributed_loads_z {
                let a = dl.a;
                let b = dl.b;
                let span = b - a;
                if span < 1e-12 { continue; }
                let dq = dl.q_j - dl.q_i;
                let x_clamp = x.min(b);
                if x_clamp <= a { continue; }
                let s = x_clamp - a;
                value += dl.q_i * s + dq * s * s / (2.0 * span);
            }
            for pl in &ef.point_loads_z {
                if pl.a < x - 1e-10 { value += pl.p; }
            }
            value
        }
        "axial" => ef.n_start + t * (ef.n_end - ef.n_start),
        "torsion" => ef.mx_start + t * (ef.mx_end - ef.mx_start),
        _ => 0.0,
    }
}

// ==================== Compute Diagram ====================

fn compute_single_diagram_3d(
    ef: &ElementForces3D,
    kind: &str,
) -> ElementDiagram3D {
    let relevant_pl: &[PointLoadInfo3D] = match kind {
        "momentZ" | "shearY" => &ef.point_loads_y,
        "momentY" | "shearZ" => &ef.point_loads_z,
        _ => &[],
    };

    let positions = if relevant_pl.is_empty() {
        (0..NUM_POINTS).map(|i| i as f64 / (NUM_POINTS - 1) as f64).collect()
    } else {
        build_sampling_positions_3d(ef.length, relevant_pl)
    };

    let mut points = Vec::new();
    let mut max_val = f64::NEG_INFINITY;
    let mut min_val = f64::INFINITY;
    let mut max_abs_value: f64 = 0.0;

    for &t in &positions {
        let value = evaluate_diagram_3d_at(ef, kind, t);
        points.push(DiagramPoint3D { t, value });
        if value > max_val { max_val = value; }
        if value < min_val { min_val = value; }
        if value.abs() > max_abs_value.abs() {
            max_abs_value = value;
        }
    }

    ElementDiagram3D {
        element_id: ef.element_id,
        points,
        max_value: max_val,
        min_value: min_val,
        max_abs_value,
    }
}

/// Compute all 3D diagrams for all elements.
pub fn compute_diagrams_3d(results: &AnalysisResults3D) -> DiagramResults3D {
    let kinds = ["momentY", "momentZ", "shearY", "shearZ", "axial", "torsion"];
    // Iterate elements outermost so each element's forces stay in cache across
    // all six kinds, instead of six separate passes over the whole vector.
    let mut all: Vec<Vec<ElementDiagram3D>> =
        kinds.iter().map(|_| Vec::with_capacity(results.element_forces.len())).collect();
    for ef in &results.element_forces {
        for (k, kind) in kinds.iter().enumerate() {
            all[k].push(compute_single_diagram_3d(ef, kind));
        }
    }

    DiagramResults3D {
        moment_y: all.remove(0),
        moment_z: all.remove(0),
        shear_y: all.remove(0),
        shear_z: all.remove(0),
        axial: all.remove(0),
        torsion: all.remove(0),
    }
}
