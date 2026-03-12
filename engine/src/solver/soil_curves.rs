/// Nonlinear soil reaction curves for soil-structure interaction (SSI).
///
/// Implements standard p-y, t-z, and q-z curves from API RP 2A and
/// related geotechnical literature.
///
/// Each curve function returns (reaction, secant_stiffness) given
/// the soil displacement.
///
/// References:
///   - Matlock (1970): Soft clay p-y curves
///   - API RP 2A (2000): Sand and stiff clay p-y curves
///   - Reese & Van Impe (2001): Comprehensive pile analysis
///   - Mosher (1984): t-z curves
use serde::{Serialize, Deserialize};

/// Soil curve type definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SoilCurve {
    /// Soft clay p-y curve (Matlock 1970)
    #[serde(rename = "py_soft_clay")]
    PySoftClay {
        /// Undrained shear strength (kPa)
        su: f64,
        /// Effective unit weight of soil (kN/m³)
        gamma_eff: f64,
        /// Pile diameter (m)
        d: f64,
        /// Depth below ground (m)
        depth: f64,
        /// Strain at 50% of ultimate stress (typically 0.005-0.02)
        eps_50: f64,
    },
    /// Sand p-y curve (API RP 2A)
    #[serde(rename = "py_sand")]
    PySand {
        /// Angle of internal friction (degrees)
        phi: f64,
        /// Effective unit weight (kN/m³)
        gamma_eff: f64,
        /// Pile diameter (m)
        d: f64,
        /// Depth below ground (m)
        depth: f64,
    },
    /// Stiff clay p-y curve (Reese & Van Impe)
    #[serde(rename = "py_stiff_clay")]
    PyStiffClay {
        /// Undrained shear strength (kPa)
        su: f64,
        /// Effective unit weight (kN/m³)
        gamma_eff: f64,
        /// Pile diameter (m)
        d: f64,
        /// Depth below ground (m)
        depth: f64,
        /// Strain at 50% ultimate stress
        eps_50: f64,
    },
    /// Axial shaft friction t-z curve
    #[serde(rename = "tz")]
    Tz {
        /// Ultimate shaft friction (kPa)
        t_ult: f64,
        /// Displacement at ultimate (m, typically 0.005-0.01)
        z_ult: f64,
    },
    /// Tip bearing q-z curve
    #[serde(rename = "qz")]
    Qz {
        /// Ultimate tip bearing capacity (kPa)
        q_ult: f64,
        /// Pile diameter (m)
        d: f64,
    },
    /// User-defined multilinear curve
    #[serde(rename = "custom")]
    Custom {
        /// Points as (displacement, reaction) pairs, sorted by displacement
        points: Vec<[f64; 2]>,
    },
}

/// Evaluate a soil curve at given displacement.
///
/// Returns (reaction_per_length, secant_stiffness) in (kN/m, kN/m²).
pub fn evaluate_soil_curve(curve: &SoilCurve, displacement: f64) -> (f64, f64) {
    match curve {
        SoilCurve::PySoftClay { su, gamma_eff, d, depth, eps_50 } => {
            py_soft_clay(*su, *gamma_eff, *d, *depth, *eps_50, displacement)
        }
        SoilCurve::PySand { phi, gamma_eff, d, depth } => {
            py_sand(*phi, *gamma_eff, *d, *depth, displacement)
        }
        SoilCurve::PyStiffClay { su, gamma_eff, d, depth, eps_50 } => {
            py_stiff_clay(*su, *gamma_eff, *d, *depth, *eps_50, displacement)
        }
        SoilCurve::Tz { t_ult, z_ult } => {
            tz_curve(*t_ult, *z_ult, displacement)
        }
        SoilCurve::Qz { q_ult, d } => {
            qz_curve(*q_ult, *d, displacement)
        }
        SoilCurve::Custom { points } => {
            custom_curve(points, displacement)
        }
    }
}

/// Soft clay p-y curve (Matlock 1970 / API RP 2A).
///
/// p = 0.5 * p_u * (y / y_50)^(1/3)  for y ≤ 8 * y_50
/// p = p_u                             for y > 8 * y_50
///
/// where y_50 = 2.5 * ε₅₀ * D
///       p_u = min(3*su + γ'*z, 9*su) * D
pub fn py_soft_clay(
    su: f64,
    gamma_eff: f64,
    d: f64,
    depth: f64,
    eps_50: f64,
    y: f64,
) -> (f64, f64) {
    let y_50 = 2.5 * eps_50 * d;
    let p_u = (3.0 * su + gamma_eff * depth).min(9.0 * su) * d;

    let y_abs = y.abs();
    if y_abs < 1e-15 {
        // Initial tangent stiffness
        let k0 = if y_50 > 1e-15 {
            0.5 * p_u / (3.0 * y_50) * (1e-6_f64).powf(-2.0/3.0) // very stiff initially
        } else {
            1e6
        };
        return (0.0, k0.min(1e8));
    }

    let ratio = y_abs / y_50;
    let p = if ratio <= 8.0 {
        0.5 * p_u * ratio.powf(1.0 / 3.0)
    } else {
        p_u
    };

    let p_signed = p * y.signum();
    let k_secant = if y_abs > 1e-15 { p / y_abs } else { 1e6 };

    (p_signed, k_secant)
}

/// Sand p-y curve (API RP 2A).
///
/// p = A * p_u * tanh(k_h * z * y / (A * p_u))
///
/// where k_h = initial modulus of subgrade reaction (varies with φ)
///       A = static loading factor (for static: 0.9)
pub fn py_sand(
    phi: f64,
    gamma_eff: f64,
    d: f64,
    depth: f64,
    y: f64,
) -> (f64, f64) {
    let phi_rad = phi * std::f64::consts::PI / 180.0;

    // Coefficients from API RP 2A Table
    let c1 = (phi_rad.tan()).powi(2) * (std::f64::consts::PI / 4.0 + phi_rad / 2.0).tan();
    let c2 = (phi_rad.tan()).powi(2);
    let c3 = phi_rad.tan() * (std::f64::consts::PI / 4.0 + phi_rad / 2.0).tan().powi(2);

    // Ultimate resistance
    let p_us = (c1 * depth + c2 * d) * gamma_eff * depth; // shallow
    let p_ud = c3 * gamma_eff * depth * d;                 // deep
    let p_u = p_us.min(p_ud);

    // Initial modulus of subgrade reaction (kN/m³)
    // Approximation from API RP 2A Fig. 6.8.7-1
    let k_h = match phi as usize {
        0..=25 => 5_400.0,
        26..=30 => 10_800.0,
        31..=35 => 22_000.0,
        36..=40 => 45_000.0,
        _ => 80_000.0,
    };

    let a = 0.9; // Static loading
    let y_abs = y.abs();

    if y_abs < 1e-15 {
        return (0.0, k_h * depth.max(0.1));
    }

    let arg = k_h * depth * y_abs / (a * p_u).max(1e-10);
    let p = a * p_u * arg.tanh();
    let k_secant = p / y_abs;

    (p * y.signum(), k_secant)
}

/// Stiff clay p-y curve (Reese & Van Impe).
///
/// Uses the same basic form as soft clay but with:
/// - Higher initial stiffness
/// - Brittle post-peak behavior (residual = p_u * 0.7 after y > 16*y_50)
pub fn py_stiff_clay(
    su: f64,
    gamma_eff: f64,
    d: f64,
    depth: f64,
    eps_50: f64,
    y: f64,
) -> (f64, f64) {
    let y_50 = 2.5 * eps_50 * d;
    let p_u = (3.0 * su + gamma_eff * depth).min(9.0 * su) * d;

    let y_abs = y.abs();
    if y_abs < 1e-15 {
        let k0 = if y_50 > 1e-15 { p_u / y_50 } else { 1e6 };
        return (0.0, k0);
    }

    let ratio = y_abs / y_50;
    let p = if ratio <= 1.0 {
        0.5 * p_u * ratio.powf(0.25) // stiffer initial response
    } else if ratio <= 16.0 {
        p_u * (1.0 - 0.3 * ((ratio - 1.0) / 15.0)) // gradual softening
    } else {
        0.7 * p_u // residual
    };

    let k_secant = p / y_abs;
    (p * y.signum(), k_secant)
}

/// Axial shaft friction t-z curve.
///
/// t = t_ult * (z / z_ult)^0.5  for z ≤ z_ult
/// t = t_ult                     for z > z_ult
///
/// Returns (friction_per_length, secant_stiffness) in (kPa, kPa/m)
pub fn tz_curve(t_ult: f64, z_ult: f64, z: f64) -> (f64, f64) {
    let z_abs = z.abs();
    if z_abs < 1e-15 {
        let k0 = if z_ult > 1e-15 { t_ult / (2.0 * z_ult.sqrt() * 1e-6_f64.sqrt()) } else { 1e6 };
        return (0.0, k0.min(1e8));
    }

    let ratio = z_abs / z_ult;
    let t = if ratio <= 1.0 {
        t_ult * ratio.sqrt()
    } else {
        t_ult
    };

    let k_secant = t / z_abs;
    (t * z.signum(), k_secant)
}

/// Tip bearing q-z curve.
///
/// q = q_ult * (z / (0.1*D))^0.5  for z ≤ 0.1*D
/// q = q_ult                        for z > 0.1*D
///
/// Returns (tip_pressure, secant_stiffness) in (kPa, kPa/m)
pub fn qz_curve(q_ult: f64, d: f64, z: f64) -> (f64, f64) {
    let z_ref = 0.1 * d; // Reference displacement = 10% of pile diameter
    let z_abs = z.abs();

    if z_abs < 1e-15 {
        let k0 = if z_ref > 1e-15 { q_ult / z_ref } else { 1e6 };
        return (0.0, k0);
    }

    let ratio = z_abs / z_ref;
    let q = if ratio <= 1.0 {
        q_ult * ratio.sqrt()
    } else {
        q_ult
    };

    let k_secant = q / z_abs;
    (q * z.signum(), k_secant)
}

/// User-defined multilinear curve.
///
/// Linearly interpolates between user-defined points.
/// Points must be sorted by displacement (first column).
/// For displacements beyond the range, the curve is constant at the last value.
pub fn custom_curve(points: &[[f64; 2]], displacement: f64) -> (f64, f64) {
    if points.is_empty() {
        return (0.0, 0.0);
    }

    let y_abs = displacement.abs();
    let sign = displacement.signum();

    // Find bracketing interval
    if y_abs <= points[0][0] {
        let k = if points[0][0] > 1e-15 {
            points[0][1] / points[0][0]
        } else if points.len() > 1 {
            (points[1][1] - points[0][1]) / (points[1][0] - points[0][0]).max(1e-15)
        } else {
            0.0
        };
        let p = k * y_abs;
        return (p * sign, k);
    }

    for i in 1..points.len() {
        if y_abs <= points[i][0] {
            let dx = points[i][0] - points[i-1][0];
            let dp = points[i][1] - points[i-1][1];
            let t = (y_abs - points[i-1][0]) / dx.max(1e-15);
            let p = points[i-1][1] + t * dp;
            let k_secant = if y_abs > 1e-15 { p / y_abs } else { dp / dx.max(1e-15) };
            return (p * sign, k_secant);
        }
    }

    // Beyond last point: constant
    let p = points.last().unwrap()[1];
    let k_secant = if y_abs > 1e-15 { p / y_abs } else { 0.0 };
    (p * sign, k_secant)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_py_soft_clay_zero() {
        let (p, k) = py_soft_clay(50.0, 10.0, 0.5, 5.0, 0.01, 0.0);
        assert!((p).abs() < 1e-10);
        assert!(k > 0.0);
    }

    #[test]
    fn test_py_soft_clay_ultimate() {
        // At large displacement, should reach p_u
        let depth = 10.0;
        let su = 50.0;
        let d = 0.5;
        let p_u = (3.0_f64 * su + 10.0 * depth).min(9.0 * su) * d;
        let (p, _) = py_soft_clay(su, 10.0, d, depth, 0.01, 1.0);
        assert!((p - p_u).abs() / p_u < 0.01, "p={}, p_u={}", p, p_u);
    }

    #[test]
    fn test_py_sand() {
        let (p, k) = py_sand(35.0, 10.0, 0.5, 5.0, 0.01);
        assert!(p > 0.0);
        assert!(k > 0.0);
    }

    #[test]
    fn test_tz_curve() {
        let (t, k) = tz_curve(100.0, 0.005, 0.005);
        assert!((t - 100.0).abs() < 1e-6); // At z_ult, t = t_ult
        assert!(k > 0.0);
    }

    #[test]
    fn test_qz_curve() {
        let (q, _) = qz_curve(5000.0, 0.5, 0.05);
        assert!((q - 5000.0).abs() < 1e-6); // At 0.1*D, q = q_ult
    }

    #[test]
    fn test_custom_curve() {
        let points = vec![[0.0, 0.0], [0.01, 50.0], [0.05, 100.0]];
        let (p, _) = custom_curve(&points, 0.01);
        assert!((p - 50.0).abs() < 1e-6);

        let (p2, _) = custom_curve(&points, 0.03);
        assert!(p2 > 50.0 && p2 < 100.0);
    }
}
