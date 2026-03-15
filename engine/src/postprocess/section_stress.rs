use crate::types::*;
use crate::postprocess::diagrams::compute_diagram_value_at;
use serde::{Deserialize, Serialize};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSection {
    pub shape: String,
    pub a: f64,
    pub iy: f64,   // about Y (horizontal) — primary 2D bending
    pub iz: f64,   // about Z (vertical)
    pub j: f64,    // torsion constant
    pub h: f64,
    pub b: f64,
    pub tw: f64,
    pub tf: f64,
    pub t: f64,
    pub y_min: f64,
    pub y_max: f64,
    pub z_min: f64,
    pub z_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressPoint {
    pub y: f64,
    pub sigma: f64,
    pub tau: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MohrCircle {
    pub center: f64,
    pub radius: f64,
    pub sigma1: f64,
    pub sigma2: f64,
    pub theta_p: f64,
    pub tau_max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureCheck {
    pub von_mises: f64,
    pub tresca: f64,
    pub rankine: f64,
    pub fy: Option<f64>,
    pub ratio_vm: Option<f64>,
    pub ratio_tresca: Option<f64>,
    pub ratio_rankine: Option<f64>,
    pub ok: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionStressResult {
    #[serde(rename = "N")]
    pub n: f64,
    #[serde(rename = "V")]
    pub v: f64,
    #[serde(rename = "M")]
    pub m: f64,
    pub resolved: ResolvedSection,
    pub distribution: Vec<StressPoint>,
    pub sigma_at_y: f64,
    pub tau_at_y: f64,
    pub mohr: MohrCircle,
    pub failure: FailureCheck,
    pub neutral_axis_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionStressInput {
    pub element_forces: ElementForces,
    pub section: SectionGeometry,
    #[serde(default)]
    pub fy: Option<f64>,
    pub t: f64,
    #[serde(default)]
    pub y_fiber: Option<f64>,
}

/// Pre-resolved section geometry (all numeric, no profile DB lookup).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionGeometry {
    pub shape: String,
    pub a: f64,
    pub iy: f64,
    pub iz: f64,
    #[serde(default)]
    pub j: Option<f64>,
    pub h: f64,
    pub b: f64,
    #[serde(default)]
    pub tw: Option<f64>,
    #[serde(default)]
    pub tf: Option<f64>,
    #[serde(default)]
    pub t: Option<f64>,
}

const NUM_STRESS_POINTS: usize = 31;

// ==================== Normal stress (Navier) ====================

/// σ(y) = N/A + M*y/Iz  (result in MPa)
pub fn normal_stress(n: f64, m: f64, a: f64, iy: f64, y: f64) -> f64 {
    let mut sigma = 0.0;
    if a > 1e-15 { sigma += n / a; }
    if iy > 1e-15 { sigma += m * y / iy; }
    sigma / 1000.0  // kN/m² → MPa
}

// ==================== Shear stress (Jourawski) ====================

/// Q(y) and b(y) for a section shape.
fn compute_q_and_b(y: f64, rs: &ResolvedSection) -> (f64, f64) {
    let half_h = rs.h / 2.0;

    match rs.shape.as_str() {
        "rect" | "generic" => {
            let q = (rs.b / 2.0) * (half_h * half_h - y * y);
            (q, rs.b)
        }
        "I" | "H" | "U" => {
            let y_abs = y.abs();
            let y_junction = half_h - rs.tf;

            if y_abs >= half_h {
                return (0.0, rs.b);
            }
            if y_abs > y_junction {
                let dy = half_h - y_abs;
                let q = rs.b * dy * (half_h - dy / 2.0);
                return (q, rs.b);
            }
            let q_flange = rs.b * rs.tf * (half_h - rs.tf / 2.0);
            let web_above = y_junction - y_abs;
            let q_web = rs.tw * web_above * (y_junction - web_above / 2.0);
            (q_flange + q_web, rs.tw)
        }
        "RHS" => {
            let _b_inner = rs.b - 2.0 * rs.t;
            let h_inner = rs.h - 2.0 * rs.t;
            let half_hi = h_inner / 2.0;

            if y.abs() > half_h { return (0.0, rs.b); }
            if y.abs() > half_hi {
                let dy = half_h - y.abs();
                let q = rs.b * dy * (half_h - dy / 2.0);
                return (q, rs.b);
            }
            let q_flange = rs.b * rs.t * (half_h - rs.t / 2.0);
            let web_above = half_hi - y.abs();
            let q_web = 2.0 * rs.t * web_above * (half_hi - web_above / 2.0);
            (q_flange + q_web, 2.0 * rs.t)
        }
        "CHS" => {
            let r = rs.h / 2.0;
            if y.abs() >= r { return (0.0, rs.t); }
            let q = rs.t * (r * r - y * y);
            (q, 2.0 * rs.t)
        }
        "L" => {
            let q = (rs.t / 2.0) * (half_h * half_h - y * y);
            (q, rs.t)
        }
        "T" | "invL" => {
            let hf = rs.tf;
            let hw = rs.h - hf;
            let bw = rs.tw;
            let bf = rs.b;
            let area = bw * hw + bf * hf;
            let y_bar = (bw * hw * (hw / 2.0) + bf * hf * (hw + hf / 2.0)) / area;
            let y_top = rs.h - y_bar;
            let y_junc = hw - y_bar;
            let y_bot = -y_bar;

            if y >= y_top || y <= y_bot {
                return (0.0, if y >= y_junc { bf } else { bw });
            }
            if y > y_junc {
                let q = (bf / 2.0) * (y_top * y_top - y * y);
                return (q, bf);
            }
            let q_flange = bf * hf * (y_top - hf / 2.0);
            let q_web = (bw / 2.0) * (y_junc * y_junc - y * y);
            (q_flange + q_web, bw)
        }
        _ => {
            let q = (rs.b / 2.0) * (half_h * half_h - y * y);
            (q, rs.b)
        }
    }
}

/// τ(y) = V*Q(y) / (Iy*b(y))  (result in MPa, signed)
pub fn shear_stress(v: f64, y: f64, rs: &ResolvedSection) -> f64 {
    let (q, b_at_y) = compute_q_and_b(y, rs);
    if b_at_y < 1e-12 || rs.iy < 1e-15 { return 0.0; }
    (v * q) / (rs.iy * b_at_y) / 1000.0
}

// ==================== Mohr's Circle ====================

pub fn compute_mohr_circle(sigma: f64, tau: f64) -> MohrCircle {
    let center = sigma / 2.0;
    let radius = ((sigma / 2.0).powi(2) + tau * tau).sqrt();
    let sigma1 = center + radius;
    let sigma2 = center - radius;
    let theta_p = 0.5 * (2.0 * tau).atan2(sigma);

    MohrCircle { center, radius, sigma1, sigma2, theta_p, tau_max: radius }
}

// ==================== Failure Criteria ====================

pub fn check_failure(sigma: f64, tau: f64, fy: Option<f64>) -> FailureCheck {
    let von_mises = (sigma * sigma + 3.0 * tau * tau).sqrt();
    let tresca_tau_max = ((sigma / 2.0).powi(2) + tau * tau).sqrt();
    let tresca = 2.0 * tresca_tau_max;

    let center = sigma / 2.0;
    let radius = tresca_tau_max;
    let rankine = (center + radius).abs().max((center - radius).abs());

    let ratio_vm = fy.map(|f| von_mises / f);
    let ratio_tresca = fy.map(|f| tresca / f);
    let ratio_rankine = fy.map(|f| rankine / f);
    let ok = fy.map(|f| von_mises <= f);

    FailureCheck { von_mises, tresca, rankine, fy, ratio_vm, ratio_tresca, ratio_rankine, ok }
}

// ==================== Stress Distribution ====================

fn build_stress_sampling_positions(rs: &ResolvedSection) -> Vec<f64> {
    let half_h = rs.h / 2.0;
    let eps = rs.h * 0.001;

    let mut y_min = -half_h;
    let mut y_max = half_h;
    if rs.shape == "T" || rs.shape == "invL" {
        let hf = rs.tf;
        let hw = rs.h - hf;
        let bw = rs.tw;
        let bf = rs.b;
        let a_sec = bw * hw + bf * hf;
        if a_sec > 0.0 {
            let y_bar = (bw * hw * (hw / 2.0) + bf * hf * (hw + hf / 2.0)) / a_sec;
            y_min = -y_bar;
            y_max = rs.h - y_bar;
        }
    }

    let span = y_max - y_min;
    let mut positions: Vec<f64> = (0..NUM_STRESS_POINTS)
        .map(|i| y_min + (i as f64 / (NUM_STRESS_POINTS - 1) as f64) * span)
        .collect();

    // Junction points for I/H/U
    if (rs.shape == "I" || rs.shape == "H" || rs.shape == "U") && rs.tf > 0.0 {
        let y_junc = half_h - rs.tf;
        positions.extend_from_slice(&[y_junc + eps, y_junc - eps, -y_junc + eps, -y_junc - eps]);
    }

    // Junction for RHS
    if rs.shape == "RHS" && rs.t > 0.0 {
        let y_inner = half_h - rs.t;
        positions.extend_from_slice(&[y_inner + eps, y_inner - eps, -y_inner + eps, -y_inner - eps]);
    }

    // Junction for T/invL
    if (rs.shape == "T" || rs.shape == "invL") && rs.tf > 0.0 && rs.tw > 0.0 {
        let hf = rs.tf;
        let hw = rs.h - hf;
        let bw = rs.tw;
        let bf = rs.b;
        let a_sec = bw * hw + bf * hf;
        let y_bar = (bw * hw * (hw / 2.0) + bf * hf * (hw + hf / 2.0)) / a_sec;
        let y_junc = hw - y_bar;
        positions.extend_from_slice(&[y_junc + eps, y_junc - eps]);
    }

    positions.sort_by(|a, b| a.partial_cmp(b).unwrap());
    positions.dedup_by(|a, b| (*a - *b).abs() < eps * 0.5);
    positions
}

// ==================== Resolve Section Geometry ====================

fn resolve_section(sec: &SectionGeometry) -> ResolvedSection {
    let tw = sec.tw.unwrap_or(sec.b * 0.05);
    let tf = sec.tf.unwrap_or(sec.h * 0.06);
    let t = sec.t.unwrap_or(sec.b.min(sec.h) * 0.05);
    let j = sec.j.unwrap_or_else(|| estimate_j(&sec.shape, sec.h, sec.b, tw, tf, t));

    let mut y_min = -sec.h / 2.0;
    let mut y_max = sec.h / 2.0;
    if sec.shape == "T" || sec.shape == "invL" {
        let hf = tf;
        let hw = sec.h - hf;
        let bw = tw;
        let bf = sec.b;
        let a_sec = bw * hw + bf * hf;
        if a_sec > 0.0 {
            let y_bar = (bw * hw * (hw / 2.0) + bf * hf * (hw + hf / 2.0)) / a_sec;
            y_min = -y_bar;
            y_max = sec.h - y_bar;
        }
    }

    ResolvedSection {
        shape: sec.shape.clone(),
        a: sec.a,
        iy: sec.iy,
        iz: sec.iz,
        j,
        h: sec.h,
        b: sec.b,
        tw,
        tf,
        t,
        y_min,
        y_max,
        z_min: -sec.b / 2.0,
        z_max: sec.b / 2.0,
    }
}

fn estimate_j(shape: &str, h: f64, b: f64, tw: f64, tf: f64, t: f64) -> f64 {
    match shape {
        "rect" | "generic" => {
            let a = h.max(b);
            let b_min = h.min(b);
            let ratio = b_min / a;
            a * b_min.powi(3) * (1.0 / 3.0 - 0.21 * ratio * (1.0 - ratio.powi(4) / 12.0))
        }
        "I" | "H" | "U" => {
            (2.0 * b * tf.powi(3) + (h - 2.0 * tf) * tw.powi(3)) / 3.0
        }
        "RHS" => {
            let bm = b - t;
            let hm = h - t;
            2.0 * t * bm * bm * hm * hm / (b + h - 2.0 * t)
        }
        "CHS" => {
            let rm = (h / 2.0) - (t / 2.0);
            2.0 * std::f64::consts::PI * rm.powi(3) * t
        }
        "L" => (b + h - t) * t.powi(3) / 3.0,
        "T" | "invL" => {
            let hw = h - tf;
            (b * tf.powi(3) + hw * tw.powi(3)) / 3.0
        }
        _ => h * b * h.min(b).powi(2) / 30.0,
    }
}

// ==================== Main Analysis ====================

/// Analyze 2D section stress at position t along element.
pub fn compute_section_stress_2d(input: &SectionStressInput) -> SectionStressResult {
    let ef = &input.element_forces;
    let n = compute_diagram_value_at("axial", input.t, ef);
    let v = compute_diagram_value_at("shear", input.t, ef);
    let m = compute_diagram_value_at("moment", input.t, ef);

    let resolved = resolve_section(&input.section);
    let y = input.y_fiber.unwrap_or(resolved.h / 2.0);

    let distribution: Vec<StressPoint> = build_stress_sampling_positions(&resolved)
        .into_iter()
        .map(|yi| StressPoint {
            y: yi,
            sigma: normal_stress(n, m, resolved.a, resolved.iy, yi),
            tau: shear_stress(v, yi, &resolved),
        })
        .collect();

    let sigma_at_y = normal_stress(n, m, resolved.a, resolved.iy, y);
    let tau_at_y = shear_stress(v, y, &resolved);
    let mohr = compute_mohr_circle(sigma_at_y, tau_at_y);
    let failure = check_failure(sigma_at_y, tau_at_y, input.fy);

    // Neutral axis
    let neutral_axis_y = if m.abs() > 1e-10 && resolved.a > 1e-15 {
        let y_en = -(n * resolved.iy) / (resolved.a * m);
        if y_en >= resolved.y_min - 1e-6 && y_en <= resolved.y_max + 1e-6 {
            Some(y_en)
        } else {
            None
        }
    } else {
        None
    };

    SectionStressResult {
        n, v, m, resolved, distribution, sigma_at_y, tau_at_y, mohr, failure, neutral_axis_y,
    }
}
