//! Inputs of the CIRSOC 301 checker that are read off the model rather than the catalogue.
//!
//! `moment_gradient`: Cb of one unbraced segment, CIRSOC 301-2018 §F.1(3), Ec. F.1-1, with the
//! scope that clause states. Cb = 1 is the clause's own conservative value and is returned,
//! with its basis, wherever F.1-1 does not apply. The curvature and Mmáx are read over the
//! stations inside the segment and the diagram interpolated at both of its ends.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Cirsoc301InputsRequest {
    MomentGradient(MomentGradientInput),
}

pub fn answer(req: &Cirsoc301InputsRequest) -> Result<Value, String> {
    match req {
        Cirsoc301InputsRequest::MomentGradient(input) => moment_gradient(input).map(|g| json!(g)),
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct StationMoment {
    pub t: f64,
    pub m: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentGradientInput {
    pub stations: Vec<StationMoment>,
    #[serde(default)]
    pub t_start: f64,
    #[serde(default = "whole_member_end")]
    pub t_end: f64,
    #[serde(default)]
    pub shape: Option<String>,
    #[serde(default)]
    pub cantilever_free_end: bool,
}

fn whole_member_end() -> f64 {
    1.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CbBasis {
    Computed,
    UnityRequiredCantilever,
    UnityNoDiagram,
    UnityOutOfScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Curvature {
    Single,
    Double,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ShapeSymmetry {
    Double,
    Single,
    None,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentGradient {
    pub cb: f64,
    pub basis: CbBasis,
    pub reason_key: &'static str,
    pub m_max: f64,
    pub m_a: f64,
    pub m_b: f64,
    pub m_c: f64,
    pub curvature: Curvature,
    pub symmetry: ShapeSymmetry,
}

pub fn shape_symmetry(shape: Option<&str>) -> ShapeSymmetry {
    match shape {
        Some("I" | "H" | "RHS" | "CHS" | "rect") => ShapeSymmetry::Double,
        Some("U" | "C" | "T") => ShapeSymmetry::Single,
        Some("Z" | "L" | "invL") => ShapeSymmetry::None,
        _ => ShapeSymmetry::Unknown,
    }
}

const SEGMENT_EDGE_TOLERANCE: f64 = 1e-9;

fn moment_at(sorted: &[StationMoment], t: f64) -> f64 {
    let (Some(first), Some(last)) = (sorted.first(), sorted.last()) else { return 0.0 };
    if t <= first.t {
        return first.m;
    }
    if t >= last.t {
        return last.m;
    }
    for w in sorted.windows(2) {
        let (a, b) = (w[0], w[1]);
        if t <= b.t {
            let span = b.t - a.t;
            if span <= 0.0 {
                return b.m;
            }
            return a.m + ((t - a.t) / span) * (b.m - a.m);
        }
    }
    last.m
}

/// Err on a non-finite station or segment bound, or a segment that ends before it starts.
pub fn moment_gradient(input: &MomentGradientInput) -> Result<MomentGradient, String> {
    let (t_start, t_end) = (input.t_start, input.t_end);
    if !t_start.is_finite() || !t_end.is_finite() || t_start > t_end {
        return Err(format!("moment gradient: invalid segment [{t_start}, {t_end}]"));
    }
    if let Some(s) = input.stations.iter().find(|s| !s.t.is_finite() || !s.m.is_finite()) {
        return Err(format!("moment gradient: non-finite station (t = {}, m = {})", s.t, s.m));
    }
    let symmetry = shape_symmetry(input.shape.as_deref());
    let unity = |basis, reason_key, curvature, m: [f64; 4]| MomentGradient {
        cb: 1.0, basis, reason_key, m_max: m[0], m_a: m[1], m_b: m[2], m_c: m[3], curvature, symmetry,
    };

    if input.cantilever_free_end {
        return Ok(unity(CbBasis::UnityRequiredCantilever, "steel.cb.reason.cantilever", Curvature::None, [0.0; 4]));
    }

    let mut sorted = input.stations.clone();
    sorted.sort_by(|a, b| a.t.partial_cmp(&b.t).unwrap_or(std::cmp::Ordering::Equal));
    let in_segment: Vec<StationMoment> = sorted
        .iter()
        .copied()
        .filter(|s| s.t >= t_start - SEGMENT_EDGE_TOLERANCE && s.t <= t_end + SEGMENT_EDGE_TOLERANCE)
        .collect();

    let ends = if in_segment.is_empty() { vec![] } else { vec![moment_at(&sorted, t_start), moment_at(&sorted, t_end)] };
    let read = || in_segment.iter().map(|s| s.m).chain(ends.iter().copied());
    let mut signs = read().filter(|&m| m != 0.0).map(|m| m > 0.0);
    let curvature = match signs.next() {
        None => Curvature::None,
        Some(first) => if signs.any(|x| x != first) { Curvature::Double } else { Curvature::Single },
    };

    let in_scope = match symmetry {
        ShapeSymmetry::Double => true,
        ShapeSymmetry::Single => curvature != Curvature::Double,
        ShapeSymmetry::None | ShapeSymmetry::Unknown => false,
    };
    if !in_scope {
        let reason = if symmetry == ShapeSymmetry::Single {
            "steel.cb.reason.singlySymmetricDoubleCurvature"
        } else {
            "steel.cb.reason.symmetryOutOfScope"
        };
        return Ok(unity(CbBasis::UnityOutOfScope, reason, curvature, [0.0; 4]));
    }

    if in_segment.len() < 3 {
        return Ok(unity(CbBasis::UnityNoDiagram, "steel.cb.reason.noDiagram", curvature, [0.0; 4]));
    }

    let span = t_end - t_start;
    let m_a = moment_at(&sorted, t_start + 0.25 * span).abs();
    let m_b = moment_at(&sorted, t_start + 0.50 * span).abs();
    let m_c = moment_at(&sorted, t_start + 0.75 * span).abs();
    let m_max = read().map(f64::abs).chain([m_a, m_b, m_c]).fold(f64::NEG_INFINITY, f64::max);

    let denom = 2.5 * m_max + 3.0 * m_a + 4.0 * m_b + 3.0 * m_c;
    if denom <= 0.0 {
        return Ok(unity(CbBasis::UnityNoDiagram, "steel.cb.reason.zeroMoment", curvature, [m_max, m_a, m_b, m_c]));
    }

    Ok(MomentGradient {
        cb: (12.5 * m_max) / denom,
        basis: CbBasis::Computed,
        reason_key: "steel.cb.reason.computed",
        m_max, m_a, m_b, m_c, curvature, symmetry,
    })
}
