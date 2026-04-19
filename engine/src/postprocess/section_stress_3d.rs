use crate::types::*;
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use crate::postprocess::section_stress::{
    ResolvedSection, MohrCircle, FailureCheck, SectionGeometry,
    compute_mohr_circle, check_failure,
};
use serde::{Deserialize, Serialize};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressPoint3D {
    pub y: f64,
    pub z: f64,
    pub sigma: f64,
    pub tau_vy: f64,
    pub tau_vz: f64,
    pub tau_t: f64,
    pub tau_total: f64,
    pub von_mises: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionStressResult3D {
    #[serde(rename = "N")]
    pub n: f64,
    #[serde(rename = "Vy")]
    pub vy: f64,
    #[serde(rename = "Vz")]
    pub vz: f64,
    #[serde(rename = "Mx")]
    pub mx: f64,
    #[serde(rename = "My")]
    pub my: f64,
    #[serde(rename = "Mz")]
    pub mz: f64,
    pub resolved: ResolvedSection,
    #[serde(rename = "Iz")]
    pub iz: f64,
    pub distribution_y: Vec<StressPoint3D>,
    pub distribution_z: Vec<StressPoint3D>,
    pub sigma_at_fiber: f64,
    pub tau_vy_at_fiber: f64,
    pub tau_vz_at_fiber: f64,
    pub tau_torsion: f64,
    pub tau_total: f64,
    pub mohr: MohrCircle,
    pub failure: FailureCheck,
    pub neutral_axis: Option<NeutralAxis3D>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeutralAxis3D {
    pub y1: f64,
    pub z1: f64,
    pub y2: f64,
    pub z2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionStressInput3D {
    pub element_forces: ElementForces3D,
    pub section: SectionGeometry,
    #[serde(default)]
    pub fy: Option<f64>,
    pub t: f64,
    #[serde(default)]
    pub y_fiber: Option<f64>,
    #[serde(default)]
    pub z_fiber: Option<f64>,
}

const NUM_POINTS_3D: usize = 31;

// ==================== 3D Normal Stress (Biaxial Navier) ====================

/// σ(y,z) = N/A + Mz*y/Iz - My*z/Iy  (result in MPa)
///
/// Section coordinates: y = vertical (height), z = horizontal (width).
/// Mz = moment about Z-axis (vertical) → bending in Y-Z plane (vertical) → stress varies with y → uses Iz.
/// My = moment about Y-axis (horizontal) → bending in X-Z plane (lateral) → stress varies with z → uses Iy.
/// Sign: My negative from θy = -dw/dx convention; Mz positive (θz = +dv/dx, same as 2D).
fn biaxial_normal_stress(n: f64, my: f64, mz: f64, a: f64, iy: f64, iz: f64, y: f64, z: f64) -> f64 {
    let mut sigma = 0.0;
    if a > 1e-15 { sigma += n / a; }
    if iz > 1e-15 { sigma += mz * y / iz; }  // Mz about Z-vert → stress varies with y (vertical)
    if iy > 1e-15 { sigma -= my * z / iy; }  // My about Y-horiz → stress varies with z (horizontal)
    sigma / 1000.0
}

// ==================== 3D Shear Stress ====================

/// Jourawski shear stress from Vy (strong axis) at fiber y.
fn shear_stress_vy(vy: f64, y: f64, rs: &ResolvedSection) -> f64 {
    // Reuse 2D Q(y) computation
    let (q, b_at_y) = compute_q_and_b_3d(y, rs);
    if b_at_y < 1e-12 || rs.iz < 1e-15 { return 0.0; }
    (vy * q) / (rs.iz * b_at_y) / 1000.0
}

/// Jourawski shear stress from Vz (weak axis) at fiber z.
fn shear_stress_vz(vz: f64, z: f64, rs: &ResolvedSection) -> f64 {
    let (q_y, width) = compute_qy_and_width(z, rs);
    if width < 1e-12 || rs.iy < 1e-15 { return 0.0; }
    (vz * q_y) / (rs.iy * width) / 1000.0
}

/// Torsion shear stress.
fn torsion_shear(mx: f64, rs: &ResolvedSection) -> f64 {
    if rs.j < 1e-15 { return 0.0; }
    match rs.shape.as_str() {
        "RHS" => {
            // Bredt: τ = Mx / (2*Am*t)
            let am = (rs.b - rs.t) * (rs.h - rs.t);
            if am < 1e-15 || rs.t < 1e-12 { return 0.0; }
            (mx / (2.0 * am * rs.t)) / 1000.0
        }
        "CHS" => {
            let rm = (rs.h / 2.0) - (rs.t / 2.0);
            let am = std::f64::consts::PI * rm * rm;
            if am < 1e-15 || rs.t < 1e-12 { return 0.0; }
            (mx / (2.0 * am * rs.t)) / 1000.0
        }
        _ => {
            // Saint-Venant open: τ = Mx*t_max/J
            let t_max = rs.tw.max(rs.tf).max(rs.t);
            if t_max < 1e-12 { return 0.0; }
            (mx * t_max / rs.j) / 1000.0
        }
    }
}

/// Q(y) and b(y) for strong-axis shear (3D uses iz for Iy in 2D convention).
fn compute_q_and_b_3d(y: f64, rs: &ResolvedSection) -> (f64, f64) {
    let half_h = rs.h / 2.0;
    match rs.shape.as_str() {
        "rect" | "generic" => {
            let q = (rs.b / 2.0) * (half_h * half_h - y * y);
            (q, rs.b)
        }
        "I" | "H" | "U" => {
            let y_abs = y.abs();
            let y_junction = half_h - rs.tf;
            if y_abs >= half_h { return (0.0, rs.b); }
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
            let half_hi = (rs.h - 2.0 * rs.t) / 2.0;
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
        _ => {
            let q = (rs.b / 2.0) * (half_h * half_h - y * y);
            (q, rs.b)
        }
    }
}

/// Qy(z) and width(z) for weak-axis shear (transposed from strong).
fn compute_qy_and_width(z: f64, rs: &ResolvedSection) -> (f64, f64) {
    let half_b = rs.b / 2.0;
    match rs.shape.as_str() {
        "rect" | "generic" => {
            let q = (rs.h / 2.0) * (half_b * half_b - z * z);
            (q, rs.h)
        }
        "I" | "H" => {
            // Weak axis: flanges carry most shear, web contribution negligible
            let z_abs = z.abs();
            if z_abs >= half_b { return (0.0, 2.0 * rs.tf); }
            let q = 2.0 * rs.tf * (half_b * half_b - z * z) / 2.0;
            (q, 2.0 * rs.tf)
        }
        "RHS" => {
            let half_bi = (rs.b - 2.0 * rs.t) / 2.0;
            if z.abs() > half_b { return (0.0, rs.h); }
            if z.abs() > half_bi {
                let dz = half_b - z.abs();
                let q = rs.h * dz * (half_b - dz / 2.0);
                return (q, rs.h);
            }
            let q_side = rs.h * rs.t * (half_b - rs.t / 2.0);
            let top_above = half_bi - z.abs();
            let q_top = 2.0 * rs.t * top_above * (half_bi - top_above / 2.0);
            (q_side + q_top, 2.0 * rs.t)
        }
        "CHS" => {
            let r = rs.h / 2.0;
            if z.abs() >= r { return (0.0, rs.t); }
            let q = rs.t * (r * r - z * z);
            (q, 2.0 * rs.t)
        }
        _ => {
            let q = (rs.h / 2.0) * (half_b * half_b - z * z);
            (q, rs.h)
        }
    }
}

// ==================== Resolve Section ====================

fn resolve_section_3d(sec: &SectionGeometry) -> ResolvedSection {
    let tw = sec.tw.unwrap_or(sec.b * 0.05);
    let tf = sec.tf.unwrap_or(sec.h * 0.06);
    let t = sec.t.unwrap_or(sec.b.min(sec.h) * 0.05);
    let j = sec.j.unwrap_or_else(|| estimate_j_3d(&sec.shape, sec.h, sec.b, tw, tf, t));

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
        y_min: -sec.h / 2.0,
        y_max: sec.h / 2.0,
        z_min: -sec.b / 2.0,
        z_max: sec.b / 2.0,
    }
}

fn estimate_j_3d(shape: &str, h: f64, b: f64, tw: f64, tf: f64, t: f64) -> f64 {
    match shape {
        "rect" | "generic" => {
            let a = h.max(b);
            let b_min = h.min(b);
            let ratio = b_min / a;
            a * b_min.powi(3) * (1.0 / 3.0 - 0.21 * ratio * (1.0 - ratio.powi(4) / 12.0))
        }
        "I" | "H" | "U" => (2.0 * b * tf.powi(3) + (h - 2.0 * tf) * tw.powi(3)) / 3.0,
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
        _ => h * b * h.min(b).powi(2) / 30.0,
    }
}

// ==================== Main 3D Analysis ====================

/// Analyze 3D section stress at position t along element.
pub fn compute_section_stress_3d(input: &SectionStressInput3D) -> SectionStressResult3D {
    let ef = &input.element_forces;

    let n = evaluate_diagram_3d_at(ef, "axial", input.t);
    let vy = evaluate_diagram_3d_at(ef, "shearY", input.t);
    let vz = evaluate_diagram_3d_at(ef, "shearZ", input.t);
    let mx = evaluate_diagram_3d_at(ef, "torsion", input.t);
    let my = evaluate_diagram_3d_at(ef, "momentY", input.t);
    let mz = evaluate_diagram_3d_at(ef, "momentZ", input.t);

    compute_stress_3d_from_raw(n, vy, vz, mx, my, mz, &input.section, input.fy, input.y_fiber, input.z_fiber)
}

/// Analyze 3D section stress from raw internal forces (no element forces interpolation).
pub fn compute_stress_3d_from_raw(
    n: f64, vy: f64, vz: f64, mx: f64, my: f64, mz: f64,
    section: &SectionGeometry,
    fy: Option<f64>,
    y_fiber: Option<f64>,
    z_fiber: Option<f64>,
) -> SectionStressResult3D {
    let resolved = resolve_section_3d(section);

    let y = y_fiber.unwrap_or(resolved.h / 2.0);
    let z = z_fiber.unwrap_or(0.0);

    // Y-axis distribution (z=0 cut)
    let distribution_y: Vec<StressPoint3D> = {
        let span = resolved.y_max - resolved.y_min;
        (0..NUM_POINTS_3D).map(|i| {
            let yi = resolved.y_min + (i as f64 / (NUM_POINTS_3D - 1) as f64) * span;
            let sigma = biaxial_normal_stress(n, my, mz, resolved.a, resolved.iy, resolved.iz, yi, 0.0);
            let t_vy = shear_stress_vy(vy, yi, &resolved);
            let t_vz = 0.0;
            let t_t = torsion_shear(mx, &resolved);
            let tau_total = (t_vy * t_vy + t_vz * t_vz + t_t * t_t).sqrt();
            let vm = (sigma * sigma + 3.0 * tau_total * tau_total).sqrt();
            StressPoint3D { y: yi, z: 0.0, sigma, tau_vy: t_vy, tau_vz: t_vz, tau_t: t_t, tau_total, von_mises: vm }
        }).collect()
    };

    // Z-axis distribution (y=0 cut)
    let distribution_z: Vec<StressPoint3D> = {
        let span = resolved.z_max - resolved.z_min;
        (0..NUM_POINTS_3D).map(|i| {
            let zi = resolved.z_min + (i as f64 / (NUM_POINTS_3D - 1) as f64) * span;
            let sigma = biaxial_normal_stress(n, my, mz, resolved.a, resolved.iy, resolved.iz, 0.0, zi);
            let t_vy = 0.0;
            let t_vz = shear_stress_vz(vz, zi, &resolved);
            let t_t = torsion_shear(mx, &resolved);
            let tau_total = (t_vy * t_vy + t_vz * t_vz + t_t * t_t).sqrt();
            let vm = (sigma * sigma + 3.0 * tau_total * tau_total).sqrt();
            StressPoint3D { y: 0.0, z: zi, sigma, tau_vy: t_vy, tau_vz: t_vz, tau_t: t_t, tau_total, von_mises: vm }
        }).collect()
    };

    // Stress at selected point
    let sigma_at_fiber = biaxial_normal_stress(n, my, mz, resolved.a, resolved.iy, resolved.iz, y, z);
    let tau_vy_at_fiber = shear_stress_vy(vy, y, &resolved);
    let tau_vz_at_fiber = shear_stress_vz(vz, z, &resolved);
    let tau_torsion = torsion_shear(mx, &resolved);
    let tau_total = (tau_vy_at_fiber * tau_vy_at_fiber + tau_vz_at_fiber * tau_vz_at_fiber + tau_torsion * tau_torsion).sqrt();

    let mohr = compute_mohr_circle(sigma_at_fiber, tau_total);
    let failure = check_failure(sigma_at_fiber, tau_total, fy);

    // Neutral axis
    let neutral_axis = compute_neutral_axis_3d(n, my, mz, &resolved);
    let iz = resolved.iz;

    SectionStressResult3D {
        n, vy, vz, mx, my, mz,
        resolved,
        iz,
        distribution_y,
        distribution_z,
        sigma_at_fiber,
        tau_vy_at_fiber,
        tau_vz_at_fiber,
        tau_torsion,
        tau_total,
        mohr,
        failure,
        neutral_axis,
    }
}

fn compute_neutral_axis_3d(n: f64, my: f64, mz: f64, rs: &ResolvedSection) -> Option<NeutralAxis3D> {
    // σ(y,z) = 0 → N/A + Mz*y/Iz - My*z/Iy = 0
    if mz.abs() < 1e-10 && my.abs() < 1e-10 { return None; }

    let (y1, z1, y2, z2);
    if mz.abs() > 1e-10 {
        // Express y = f(z): y = (-N/A + My*z/Iy) * Iz / Mz
        // At z=z_min and z=z_max
        let za = rs.z_min;
        let zb = rs.z_max;
        let n_over_a = if rs.a > 1e-15 { n / rs.a } else { 0.0 };
        let ya = if rs.iz > 1e-15 {
            (-n_over_a + if rs.iy > 1e-15 { my * za / rs.iy } else { 0.0 }) * rs.iz / mz
        } else { 0.0 };
        let yb = if rs.iz > 1e-15 {
            (-n_over_a + if rs.iy > 1e-15 { my * zb / rs.iy } else { 0.0 }) * rs.iz / mz
        } else { 0.0 };
        y1 = ya; z1 = za; y2 = yb; z2 = zb;
    } else {
        // Mz=0, My≠0 → vertical line at z = N*Iy/(A*My)
        let n_over_a = if rs.a > 1e-15 { n / rs.a } else { 0.0 };
        let z_na = if my.abs() > 1e-10 && rs.iy > 1e-15 {
            n_over_a * rs.iy / my
        } else { 0.0 };
        y1 = rs.y_min; z1 = z_na;
        y2 = rs.y_max; z2 = z_na;
    }

    Some(NeutralAxis3D { y1, z1, y2, z2 })
}
