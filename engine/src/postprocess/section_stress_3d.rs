use crate::types::*;
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use crate::postprocess::section_stress::{
    ResolvedSection, MohrCircle, FailureCheck, SectionGeometry,
    compute_mohr_circle, check_failure,
};
use serde::{Deserialize, Serialize};

// ==================== Types ====================

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CombinedStressRefusal {
    CombinedTorsionAndTransverseShear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressPoint3D {
    pub y: f64,
    pub z: f64,
    pub sigma: f64,
    pub tau_vy: f64,
    pub tau_vz: f64,
    pub tau_t: f64,
    pub tau_total: Option<f64>,
    pub von_mises: Option<f64>,
    pub refusal: Option<CombinedStressRefusal>,
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
    pub tau_total: Option<f64>,
    pub mohr: Option<MohrCircle>,
    pub failure: Option<FailureCheck>,
    pub refusal: Option<CombinedStressRefusal>,
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

/// σ(y,z) = N/A − My*y/Iy + Mz*z/Iz  (PR [12] convention, result in MPa)
///
/// Section coordinates: y = DEPTH (vertical, ±h/2), z = WIDTH (lateral, ±b/2).
/// My = moment about local y → bends over the depth (y) → uses Iy (strong axis).
/// Mz = moment about local z → bends over the width (z) → uses Iz (weak axis).
/// Sign: My carries the θy = −dw/dx convention (negative coefficient) so a horizontal beam
/// under gravity reproduces the 2D result σ = +M*y/Iy on the depth axis; Mz stays positive.
fn biaxial_normal_stress(n: f64, my: f64, mz: f64, a: f64, iy: f64, iz: f64, y: f64, z: f64) -> f64 {
    let mut sigma = 0.0;
    if a > 1e-15 { sigma += n / a; }
    if iy > 1e-15 { sigma -= my * y / iy; }  // My → bends over the depth (y), uses Iy (strong)
    if iz > 1e-15 { sigma += mz * z / iz; }  // Mz → bends over the width (z), uses Iz (weak)
    sigma / 1000.0
}

// ==================== 3D Shear Stress ====================

/// Jourawski shear stress over the DEPTH (strong axis), at fiber y.
/// Fed the vertical shear Vz (paired with My / depth bending); uses Iy.
fn shear_stress_depth(v: f64, y: f64, rs: &ResolvedSection) -> f64 {
    let (q, b_at_y) = compute_q_and_b_3d(y, rs);
    if b_at_y < 1e-12 || rs.iy < 1e-15 { return 0.0; }
    (v * q) / (rs.iy * b_at_y) / 1000.0
}

/// Jourawski shear stress over the WIDTH (weak axis), at fiber z.
/// Fed the lateral shear Vy (paired with Mz / width bending); uses Iz.
fn shear_stress_width(v: f64, z: f64, rs: &ResolvedSection) -> f64 {
    let (q_y, width) = compute_qy_and_width(z, rs);
    if width < 1e-12 || rs.iz < 1e-15 { return 0.0; }
    (v * q_y) / (rs.iz * width) / 1000.0
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
            // Saint-Venant open: τ = Mx*t_max/J. A solid rectangle (or a generic section) has no
            // wall thickness: its "thickness" is the shorter side, τ = Mx·min(b,h)/J, which bounds
            // the exact Saint-Venant peak from above (×1,48 for a square). It used to take
            // max(tw, tf, t) = 0 for a rectangle and report no torsional shear at all.
            let t_max = if matches!(rs.shape.as_str(), "rect" | "generic") {
                rs.b.min(rs.h)
            } else {
                rs.tw.max(rs.tf).max(rs.t)
            };
            if t_max < 1e-12 { return 0.0; }
            (mx * t_max / rs.j) / 1000.0
        }
    }
}

/// Q(y) and b(y) for strong-axis (over-the-depth) shear; paired with Iy in the PR [12] convention.
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
            // A cut severs TWO walls (width 2t) and Q is the first moment of the whole area
            // beyond it: Q = 2·t·R·√(R²−y²), τ_max = 2V/A, as `section_stress.rs` (2D) and the
            // TypeScript oracle have it. This was the one-sided t·(R²−y²) over the two-sided
            // width: HALF the shear of a tube, found by the engine/oracle differential test.
            // t = 0 is a solid bar: Q = (2/3)(R²−y²)^(3/2) over the chord, τ_max = 4V/3A.
            let r = rs.h / 2.0;
            if y.abs() >= r { return (0.0, if rs.t > 0.0 { rs.t } else { r }); }
            if rs.t > 0.0 {
                return (2.0 * rs.t * r * (r * r - y * y).sqrt(), 2.0 * rs.t);
            }
            let chord = (r * r - y * y).sqrt();
            ((2.0 / 3.0) * (r * r - y * y) * chord, 2.0 * chord)
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
            // A cut severs TWO walls (width 2t) and Q is the first moment of the whole area
            // beyond it: Q = 2·t·R·√(R²−z²), τ_max = 2V/A, as `section_stress.rs` (2D) and the
            // TypeScript oracle have it. This was the one-sided t·(R²−z²) over the two-sided
            // width: HALF the shear of a tube, found by the engine/oracle differential test.
            // t = 0 is a solid bar: Q = (2/3)(R²−z²)^(3/2) over the chord, τ_max = 4V/3A.
            let r = rs.h / 2.0;
            if z.abs() >= r { return (0.0, if rs.t > 0.0 { rs.t } else { r }); }
            if rs.t > 0.0 {
                return (2.0 * rs.t * r * (r * r - z * z).sqrt(), 2.0 * rs.t);
            }
            let chord = (r * r - z * z).sqrt();
            ((2.0 / 3.0) * (r * r - z * z) * chord, 2.0 * chord)
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
    let tau_torsion = torsion_shear(mx, &resolved);

    let stress_at = |y, z| {
        let sigma = biaxial_normal_stress(n, my, mz, resolved.a, resolved.iy, resolved.iz, y, z);
        let tau_vy = shear_stress_width(vy, z, &resolved);
        let tau_vz = shear_stress_depth(vz, y, &resolved);
        let refusal = (tau_torsion != 0.0 && (tau_vy != 0.0 || tau_vz != 0.0))
            .then_some(CombinedStressRefusal::CombinedTorsionAndTransverseShear);
        let tau_total = refusal.is_none().then(|| {
            (tau_vy * tau_vy + tau_vz * tau_vz + tau_torsion * tau_torsion).sqrt()
        });

        StressPoint3D {
            y,
            z,
            sigma,
            tau_vy,
            tau_vz,
            tau_t: tau_torsion,
            tau_total,
            von_mises: tau_total.map(|tau| (sigma * sigma + 3.0 * tau * tau).sqrt()),
            refusal,
        }
    };

    let distribution_y = (0..NUM_POINTS_3D)
        .map(|i| {
            let span = resolved.y_max - resolved.y_min;
            let y = resolved.y_min + (i as f64 / (NUM_POINTS_3D - 1) as f64) * span;
            StressPoint3D { tau_vy: 0.0, ..stress_at(y, 0.0) }
        })
        .collect();
    let distribution_z = (0..NUM_POINTS_3D)
        .map(|i| {
            let span = resolved.z_max - resolved.z_min;
            let z = resolved.z_min + (i as f64 / (NUM_POINTS_3D - 1) as f64) * span;
            StressPoint3D { tau_vz: 0.0, ..stress_at(0.0, z) }
        })
        .collect();

    let fibre = stress_at(y, z);
    let mohr = fibre.tau_total.map(|tau| compute_mohr_circle(fibre.sigma, tau));
    let failure = fibre.tau_total.map(|tau| check_failure(fibre.sigma, tau, fy));

    // Neutral axis
    let neutral_axis = compute_neutral_axis_3d(n, my, mz, &resolved);
    let iz = resolved.iz;

    SectionStressResult3D {
        n, vy, vz, mx, my, mz,
        resolved,
        iz,
        distribution_y,
        distribution_z,
        sigma_at_fiber: fibre.sigma,
        tau_vy_at_fiber: fibre.tau_vy,
        tau_vz_at_fiber: fibre.tau_vz,
        tau_torsion,
        tau_total: fibre.tau_total,
        mohr,
        failure,
        refusal: fibre.refusal,
        neutral_axis,
    }
}

fn compute_neutral_axis_3d(n: f64, my: f64, mz: f64, rs: &ResolvedSection) -> Option<NeutralAxis3D> {
    // σ(y,z) = 0 → N/A − My*y/Iy + Mz*z/Iz = 0   (y = depth, z = width)
    if mz.abs() < 1e-10 && my.abs() < 1e-10 { return None; }

    let (y1, z1, y2, z2);
    if my.abs() > 1e-10 {
        // Depth bending present → express y = f(z): y = (N/A + Mz*z/Iz) * Iy / My
        // Evaluate at z = z_min and z = z_max.
        let za = rs.z_min;
        let zb = rs.z_max;
        let n_over_a = if rs.a > 1e-15 { n / rs.a } else { 0.0 };
        let ya = if rs.iy > 1e-15 {
            (n_over_a + if rs.iz > 1e-15 { mz * za / rs.iz } else { 0.0 }) * rs.iy / my
        } else { 0.0 };
        let yb = if rs.iy > 1e-15 {
            (n_over_a + if rs.iz > 1e-15 { mz * zb / rs.iz } else { 0.0 }) * rs.iy / my
        } else { 0.0 };
        y1 = ya; z1 = za; y2 = yb; z2 = zb;
    } else {
        // My=0, Mz≠0 → vertical line at z = -N*Iz/(A*Mz)
        let n_over_a = if rs.a > 1e-15 { n / rs.a } else { 0.0 };
        let z_na = if mz.abs() > 1e-10 && rs.iz > 1e-15 {
            -n_over_a * rs.iz / mz
        } else { 0.0 };
        y1 = rs.y_min; z1 = z_na;
        y2 = rs.y_max; z2 = z_na;
    }

    Some(NeutralAxis3D { y1, z1, y2, z2 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value, Value};
    use std::f64::consts::PI;

    const RADIUS: f64 = 0.100;
    const WALL: f64 = 0.001;
    const TORQUE: f64 = 0.2009999494975003;
    const FY: f64 = 9.0;

    fn chs() -> SectionGeometry {
        let inner = RADIUS - WALL;
        let i = PI / 4.0 * (RADIUS.powi(4) - inner.powi(4));
        SectionGeometry {
            shape: "CHS".into(),
            a: PI * (RADIUS.powi(2) - inner.powi(2)),
            iy: i,
            iz: i,
            j: Some(2.0 * i),
            h: 2.0 * RADIUS,
            b: 2.0 * RADIUS,
            tw: None,
            tf: None,
            t: Some(WALL),
        }
    }

    fn station(vy: f64, vz: f64, mx: f64, y: f64, z: f64) -> SectionStressInput3D {
        serde_json::from_value(json!({
            "elementForces": {
                "elementId": 1, "length": 1.0,
                "nStart": 0.0, "nEnd": 0.0,
                "vyStart": vy, "vyEnd": vy, "vzStart": vz, "vzEnd": vz,
                "mxStart": mx, "mxEnd": mx,
                "myStart": 0.0, "myEnd": vz, "mzStart": 0.0, "mzEnd": -vy,
                "qYI": 0.0, "qYJ": 0.0, "qZI": 0.0, "qZJ": 0.0,
                "distributedLoadsY": [], "distributedLoadsZ": [],
                "pointLoadsX": [], "pointLoadsY": [], "pointLoadsZ": []
            },
            "section": chs(), "t": 0.0, "fy": FY, "yFiber": y, "zFiber": z
        })).unwrap()
    }

    #[test]
    fn issue_2366_selected_fibre_refuses_combined_shear_for_either_axis_and_sign() {
        let midwall = RADIUS - WALL / 2.0;
        for (vy, vz, y, z) in [(0.0, 1.0, 0.0, midwall), (1.0, 0.0, midwall, 0.0)] {
            for mx in [TORQUE, -TORQUE] {
                let raw = compute_stress_3d_from_raw(0.0, vy, vz, mx, 0.0, 0.0, &chs(), Some(FY), Some(y), Some(z));
                let interpolated = compute_section_stress_3d(&station(vy, vz, mx, y, z));
                for result in [raw, interpolated] {
                    let result = to_value(result).unwrap();
                    assert_eq!(
                        result["tauTotal"], Value::Null,
                        "tauTotal = {}, failure = {}", result["tauTotal"], result["failure"],
                    );
                    assert_eq!(result["mohr"], Value::Null);
                    assert_eq!(result["failure"], Value::Null);
                    assert_eq!(result["refusal"], "combinedTorsionAndTransverseShear");
                }
            }
        }
    }

    #[test]
    fn issue_2366_cuts_refuse_only_where_torsion_and_transverse_shear_are_nonzero() {
        let biaxial = to_value(compute_section_stress_3d(&station(1.0, 1.0, TORQUE, RADIUS, 0.0))).unwrap();
        for cut in ["distributionY", "distributionZ"] {
            let points = biaxial[cut].as_array().unwrap();
            assert_eq!(points.len(), NUM_POINTS_3D);
            for point in points {
                assert_eq!(point["tauTotal"], Value::Null);
                assert_eq!(point["vonMises"], Value::Null);
                assert_eq!(point["refusal"], "combinedTorsionAndTransverseShear");
            }
        }
        for (cut, vy, vz) in [("distributionY", 0.0, 1.0), ("distributionZ", 1.0, 0.0)] {
            let result = to_value(compute_section_stress_3d(&station(vy, vz, TORQUE, RADIUS, 0.0))).unwrap();
            let points = result[cut].as_array().unwrap();
            let middle = &points[points.len() / 2];
            assert_eq!(middle["tauTotal"], Value::Null, "{cut}: {middle}");
            assert_eq!(middle["vonMises"], Value::Null);
            assert_eq!(middle["refusal"], "combinedTorsionAndTransverseShear");
            for edge in [&points[0], points.last().unwrap()] {
                assert_eq!(edge["tauTotal"], edge["tauT"]);
                assert!(edge["vonMises"].is_number());
                assert_eq!(edge["refusal"], Value::Null);
            }
        }
    }

    fn assert_cross_cut_refuses(vy: f64, vz: f64, cut: &str) {
        for mx in [TORQUE, -TORQUE] {
            let raw = compute_stress_3d_from_raw(0.0, vy, vz, mx, 0.0, 0.0, &chs(), Some(FY), Some(0.0), Some(0.0));
            let interpolated = compute_section_stress_3d(&station(vy, vz, mx, 0.0, 0.0));
            for result in [raw, interpolated] {
                let result = to_value(result).unwrap();
                assert_eq!(result["refusal"], "combinedTorsionAndTransverseShear");
                let points = result[cut].as_array().unwrap();
                assert_eq!(points.len(), NUM_POINTS_3D);
                for point in points {
                    assert_eq!(point["refusal"], result["refusal"], "{cut}: {point}");
                    assert_eq!(point["tauTotal"], Value::Null);
                    assert_eq!(point["vonMises"], Value::Null);
                }
            }
        }
    }

    #[test]
    fn issue_2366_y_cut_refuses_vy_with_torsion() {
        assert_cross_cut_refuses(1.0, 0.0, "distributionY");
    }

    #[test]
    fn issue_2366_z_cut_refuses_vz_with_torsion() {
        assert_cross_cut_refuses(0.0, 1.0, "distributionZ");
    }

    fn assert_cut_magnitudes(stress: &SectionStressResult3D) {
        assert_ne!((stress.vy, stress.vz), (0.0, 0.0));
        let centre_factor = RADIUS.powi(2) / chs().iy / 1000.0;
        for (points, depth_cut) in [(&stress.distribution_y, true), (&stress.distribution_z, false)] {
            assert_eq!(points.len(), NUM_POINTS_3D);
            for point in points {
                let profile = (1.0 - (point.y.hypot(point.z) / RADIUS).powi(2)).sqrt();
                let (vy_factor, vz_factor) = if depth_cut { (1.0, profile) } else { (profile, 1.0) };
                let tau_vy = stress.vy * centre_factor * vy_factor;
                let tau_vz = stress.vz * centre_factor * vz_factor;
                let expected_tau = tau_vy.hypot(tau_vz);
                let expected_vm = point.sigma.hypot(3.0_f64.sqrt() * expected_tau);
                assert!(point.refusal.is_none());
                assert!((point.tau_vy - if depth_cut { 0.0 } else { tau_vy }).abs() < 1e-12);
                assert!((point.tau_vz - if depth_cut { tau_vz } else { 0.0 }).abs() < 1e-12);
                let (tau, vm) = (point.tau_total.unwrap(), point.von_mises.unwrap());
                assert!(
                    (tau - expected_tau).abs() < 1e-12 && (vm - expected_vm).abs() < 1e-12,
                    "{point:?}; expected tauTotal={expected_tau}, vonMises={expected_vm}"
                );
            }
        }
    }

    #[test]
    fn issue_2366_cut_magnitudes_include_both_transverse_components() {
        for (vy, vz) in [(0.0, 1.0), (1.0, 0.0), (-1.0, 1.0)] {
            let raw = compute_stress_3d_from_raw(0.0, vy, vz, 0.0, 0.0, 0.0, &chs(), Some(FY), Some(0.0), Some(0.0));
            let interpolated = compute_section_stress_3d(&station(vy, vz, 0.0, 0.0, 0.0));
            assert_cut_magnitudes(&raw);
            assert_cut_magnitudes(&interpolated);
        }
    }

    fn cantilever(mx: f64) -> SolverInput3D {
        let section = chs();
        serde_json::from_value(json!({
            "nodes": {
                "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
                "2": {"id": 2, "x": 1.0, "y": 0.0, "z": 0.0}
            },
            "materials": {"1": {"id": 1, "e": 200_000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": section.a, "iy": section.iy, "iz": section.iz, "j": section.j}},
            "elements": {"1": {
                "id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1,
                "localYx": 0.0, "localYy": 1.0, "localYz": 0.0
            }},
            "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": -1.0, "fy": 0.0, "fz": 1.0, "mx": mx, "my": 0.0, "mz": 0.0}}]
        })).unwrap()
    }

    #[test]
    fn issue_2366_cut_magnitudes_from_linear_and_pdelta_member_forces() {
        let input = cantilever(0.0);
        let linear = crate::solver::linear::solve_3d(&input).unwrap();
        let pdelta = crate::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();
        assert!(pdelta.converged);
        for results in [linear, pdelta.results] {
            let stress = compute_section_stress_3d(&SectionStressInput3D {
                element_forces: results.element_forces.into_iter().next().unwrap(),
                section: chs(),
                fy: Some(FY),
                t: 1.0,
                y_fiber: Some(0.0),
                z_fiber: Some(0.0),
            });
            assert_cut_magnitudes(&stress);
        }
    }

    #[test]
    fn issue_2366_refuses_shear_from_linear_and_pdelta_member_forces() {
        let section = chs();
        let input = cantilever(TORQUE);
        let linear = crate::solver::linear::solve_3d(&input).unwrap();
        let pdelta = crate::solver::pdelta::solve_pdelta_3d(&input, 20, 1e-4).unwrap();
        assert!(pdelta.converged);
        for results in [linear, pdelta.results] {
            let query = SectionStressInput3D {
                element_forces: results.element_forces.into_iter().next().unwrap(),
                section: section.clone(),
                fy: Some(FY),
                t: 1.0,
                y_fiber: Some(0.0),
                z_fiber: Some(RADIUS - WALL / 2.0),
            };
            let stress = compute_section_stress_3d(&query);
            assert_ne!(stress.tau_torsion, 0.0);
            assert_ne!(stress.tau_vz_at_fiber, 0.0);
            assert!(stress.tau_total.is_none());
            assert!(stress.mohr.is_none());
            assert!(stress.failure.is_none());
            for point in stress.distribution_z {
                assert!(matches!(point.refusal, Some(CombinedStressRefusal::CombinedTorsionAndTransverseShear)));
                assert!(point.tau_total.is_none());
                assert!(point.von_mises.is_none());
            }
        }
    }
}
