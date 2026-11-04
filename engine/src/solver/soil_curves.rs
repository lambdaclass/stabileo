/// Nonlinear soil reaction curves for soil-structure interaction (SSI).
///
/// Each curve returns (reaction, secant stiffness) at a soil displacement:
///
/// - p-y and t-z: force per unit length of pile (kN/m) and kN/m². The SSI
///   solver multiplies by the spring's tributary length to get kN and kN/m.
/// - q-z: a force (kN) and kN/m. The tip is a point spring: the SSI solver
///   does not multiply it by a tributary length.
///
/// References:
///   - Matlock (1970), "Correlations for design of laterally loaded piles in
///     soft clay", OTC 1204, as tabulated by API RP 2A-WSD (2000) §6.8.2–6.8.3
///     and API RP 2GEO (2011) §8.5: soft clay p-y, short-term static loading.
///   - Welch & Reese (1972), Reese & Welch (1975), "Lateral loading of deep
///     foundations in stiff clay", J. Geotech. Eng. Div. ASCE 101(GT7): stiff
///     clay without free water (above the water table), static loading.
///   - API RP 2A-WSD (2000) §6.8.6–6.8.7 and API RP 2GEO (2011) §8.5.7,
///     Table 5 (Addendum 1, 2014): sand p-y, static and cyclic.
///   - API RP 2A-WSD (2000) §6.4.3 / API RP 2GEO §7.4.3: q-z.
///
/// Every curve refuses (an error, never a guess) a missing parameter the
/// reference needs or a value outside the range the reference covers.

use serde::{Serialize, Deserialize};

/// Loading condition of the API sand curve: it sets the factor A.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SandLoading {
    /// A = max(3 − 0.8 z/D, 0.9) (API RP 2A Eq. 6.8.6-4).
    Static,
    /// A = 0.9.
    Cyclic,
}

/// Soil curve type definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SoilCurve {
    /// Soft clay p-y curve, short-term static loading (Matlock 1970; API RP 2A
    /// §6.8.2–3): p_u = min(3c + γ'z + J c z/D, 9c)·D, y_c = 2.5 ε50 D, p/p_u =
    /// 0, 0.23, 0.33, 0.50, 0.72, 1.00 at y/y_c = 0, 0.1, 0.3, 1, 3, 8, p_u beyond.
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
        /// Matlock's empirical J, 0.25 to 0.5 (0.5 for soft Gulf of Mexico
        /// clays). Required: a missing J is refused, not assumed.
        #[serde(default)]
        j: Option<f64>,
    },
    /// Sand p-y curve (API RP 2A §6.8.6–6.8.7):
    /// p = A p_u tanh(k z y / (A p_u)), p_u = min((C1 z + C2 D) γ' z, C3 D γ' z),
    /// k from API RP 2GEO Table 5 interpolated linearly in φ (25° to 40°).
    #[serde(rename = "py_sand")]
    PySand {
        /// Angle of internal friction (degrees), 25 to 40 (the k table's range)
        phi: f64,
        /// Effective unit weight (kN/m³)
        gamma_eff: f64,
        /// Pile diameter (m)
        d: f64,
        /// Depth below ground (m)
        depth: f64,
        /// Static or cyclic loading (sets A). Required: refused when missing.
        #[serde(default)]
        loading: Option<SandLoading>,
    },
    /// Stiff clay without free water (above the water table), static loading
    /// (Welch & Reese 1972; Reese & Welch 1975): p_u as soft clay,
    /// y50 = 2.5 ε50 D, p = 0.5 p_u (y/y50)^(1/4) up to 16 y50, p_u beyond,
    /// sampled at y/y50 = 0.1, 0.3, 1, 3, 8, 16 and linear between.
    /// Stiff clay with free water (Reese, Cox & Koop 1975) is not implemented
    /// and is refused: use a custom curve.
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
        /// J of the ultimate resistance, 0.25 to 0.5. Required.
        #[serde(default)]
        j: Option<f64>,
        /// Whether the clay is below the water table. Required; `true` is
        /// refused (the submerged stiff-clay curve is not implemented).
        #[serde(default)]
        free_water: Option<bool>,
    },
    /// Axial shaft friction t-z curve: t = t_ult √(z/z_ult) up to z_ult, t_ult
    /// beyond (a simplified power law, not the API RP 2A t-z table), times
    /// the shaft perimeter, so the reaction is kN per metre of pile.
    #[serde(rename = "tz")]
    Tz {
        /// Ultimate unit shaft friction (kPa)
        t_ult: f64,
        /// Displacement at ultimate (m, typically 0.005-0.01)
        z_ult: f64,
        /// Shaft perimeter (m), π·D for a round pile. Required.
        #[serde(default)]
        perimeter: Option<f64>,
    },
    /// Tip bearing q-z curve (API RP 2A §6.4.3 table: Q/Qp = 0.25, 0.50, 0.75,
    /// 0.90, 1.00 at z/D = 0.002, 0.013, 0.042, 0.073, 0.100, linear between),
    /// times the tip area, so the reaction is a force (kN). A point spring:
    /// the tributary length does not apply. Compression only: the tip bears
    /// when the node moves in the negative direction of the spring's axis
    /// (down, for a vertical pile with the vertical axis up), never in uplift.
    #[serde(rename = "qz")]
    Qz {
        /// Ultimate unit end bearing (kPa)
        q_ult: f64,
        /// Pile diameter (m)
        d: f64,
        /// Tip area (m²), π·D²/4 for a closed round pile. Required.
        #[serde(default)]
        tip_area: Option<f64>,
    },
    /// User-defined multilinear curve
    #[serde(rename = "custom")]
    Custom {
        /// Points as (displacement, reaction) pairs, sorted by displacement
        points: Vec<[f64; 2]>,
    },
}

fn need(name: &str, v: f64, ok: bool, what: &str) -> Result<f64, String> {
    if v.is_finite() && ok { Ok(v) } else { Err(format!("{name} = {v}: must be {what}")) }
}

fn pos(name: &str, v: f64) -> Result<f64, String> { need(name, v, v > 0.0, "positive and finite") }
fn nonneg(name: &str, v: f64) -> Result<f64, String> { need(name, v, v >= 0.0, "non-negative and finite") }

fn matlock_j(curve: &str, j: Option<f64>) -> Result<f64, String> {
    let j = j.ok_or_else(|| format!("{curve} p-y curve needs J (Matlock's empirical constant, 0.25 to 0.5; 0.5 for soft Gulf of Mexico clays); it is not assumed"))?;
    need("J", j, (0.25..=0.5).contains(&j), "between 0.25 and 0.5 (Matlock 1970; API RP 2A §6.8.2)")
}

impl SoilCurve {
    /// Whether the curve is a point spring (q-z at the tip), whose reaction
    /// is a force: the SSI solver does not multiply it by a tributary length.
    pub fn is_point_spring(&self) -> bool {
        matches!(self, SoilCurve::Qz { .. })
    }

    /// Refuse a curve that is missing a parameter its reference needs or has
    /// one outside the reference's range.
    pub fn validate(&self) -> Result<(), String> {
        match self {
            SoilCurve::PySoftClay { su, gamma_eff, d, depth, eps_50, j } => {
                pos("su", *su)?; nonneg("gamma_eff", *gamma_eff)?; pos("d", *d)?;
                nonneg("depth", *depth)?; pos("eps_50", *eps_50)?;
                matlock_j("Soft clay", *j)?;
            }
            SoilCurve::PyStiffClay { su, gamma_eff, d, depth, eps_50, j, free_water } => {
                pos("su", *su)?; nonneg("gamma_eff", *gamma_eff)?; pos("d", *d)?;
                nonneg("depth", *depth)?; pos("eps_50", *eps_50)?;
                matlock_j("Stiff clay", *j)?;
                match free_water {
                    None => return Err("Stiff clay p-y curve needs free_water (whether the clay is below the water table); it is not assumed".into()),
                    Some(true) => return Err("Stiff clay with free water (below the water table, Reese, Cox & Koop 1975) is not implemented; the stiff-clay curve here is the one without free water (Welch & Reese 1972). Use a custom curve".into()),
                    Some(false) => {}
                }
            }
            SoilCurve::PySand { phi, gamma_eff, d, depth, loading } => {
                api_sand_k(*phi)?; nonneg("gamma_eff", *gamma_eff)?; pos("d", *d)?; nonneg("depth", *depth)?;
                if loading.is_none() {
                    return Err("Sand p-y curve needs loading (\"static\" or \"cyclic\": it sets API's factor A); it is not assumed".into());
                }
            }
            SoilCurve::Tz { t_ult, z_ult, perimeter } => {
                nonneg("t_ult", *t_ult)?; pos("z_ult", *z_ult)?;
                let p = perimeter.ok_or("t-z curve needs the shaft perimeter (m): t_ult is a stress, the spring needs force per metre of pile; it is not assumed")?;
                pos("perimeter", p)?;
            }
            SoilCurve::Qz { q_ult, d, tip_area } => {
                nonneg("q_ult", *q_ult)?; pos("d", *d)?;
                let a = tip_area.ok_or("q-z curve needs the tip area (m²): q_ult is a stress, the tip spring needs a force; it is not assumed")?;
                pos("tip_area", a)?;
            }
            SoilCurve::Custom { points } => {
                for (i, p) in points.iter().enumerate() {
                    if !p[0].is_finite() || !p[1].is_finite() {
                        return Err(format!("Custom soil curve point {i} is not finite"));
                    }
                    if i > 0 && p[0] < points[i - 1][0] {
                        return Err(format!("Custom soil curve points must be sorted by displacement (point {i})"));
                    }
                }
            }
        }
        Ok(())
    }
}

/// Evaluate a soil curve at given displacement.
///
/// Returns (reaction, secant stiffness): kN/m and kN/m² for p-y, t-z and
/// custom curves (per unit length of pile), kN and kN/m for q-z (a force).
/// Refuses an invalid curve (see [`SoilCurve::validate`]).
pub fn evaluate_soil_curve(curve: &SoilCurve, displacement: f64) -> Result<(f64, f64), String> {
    curve.validate()?;
    Ok(match curve {
        SoilCurve::PySoftClay { su, gamma_eff, d, depth, eps_50, j } => {
            py_soft_clay(*su, *gamma_eff, *d, *depth, *eps_50, j.unwrap(), displacement)
        }
        SoilCurve::PySand { phi, gamma_eff, d, depth, loading } => {
            py_sand(*phi, *gamma_eff, *d, *depth, loading.unwrap(), displacement)?
        }
        SoilCurve::PyStiffClay { su, gamma_eff, d, depth, eps_50, j, .. } => {
            py_stiff_clay(*su, *gamma_eff, *d, *depth, *eps_50, j.unwrap(), displacement)
        }
        SoilCurve::Tz { t_ult, z_ult, perimeter } => {
            let (t, k) = tz_curve(*t_ult, *z_ult, displacement);
            let p = perimeter.unwrap();
            (t * p, k * p)
        }
        SoilCurve::Qz { q_ult, d, tip_area } => {
            let (q, k) = qz_curve(*q_ult, *d, displacement);
            let a = tip_area.unwrap();
            (q * a, k * a)
        }
        SoilCurve::Custom { points } => custom_curve(points, displacement),
    })
}

/// Matlock's ultimate resistance per unit length (kN/m):
/// p_u = min(3c + γ'z + J c z/D, 9c)·D (API RP 2A Eq. 6.8.2-1, -2).
pub fn matlock_pu(su: f64, gamma_eff: f64, d: f64, depth: f64, j: f64) -> f64 {
    (3.0 * su + gamma_eff * depth + j * su * depth / d).min(9.0 * su) * d
}

/// API RP 2A §6.8.3 (and RP 2GEO §8.5.4) soft clay, short-term static loading:
/// (y/y_c, p/p_u). Matlock's p = 0.5 p_u (y/y_c)^(1/3) sampled at these
/// points, linear between, p_u beyond 8 y_c.
pub const API_SOFT_CLAY_STATIC: [(f64, f64); 6] = [(0.0, 0.0), (0.1, 0.23), (0.3, 0.33), (1.0, 0.50), (3.0, 0.72), (8.0, 1.00)];

/// A normalized multilinear curve: (y/y_c, p/p_u) points from the origin,
/// linear between, the last p/p_u beyond. (p, secant); the secant at y = 0
/// is the first segment's slope.
fn normalized_curve(p_u: f64, y_c: f64, pts: &[(f64, f64)], y: f64) -> (f64, f64) {
    let y_abs = y.abs();
    if y_abs < 1e-15 {
        return (0.0, p_u * pts[1].1 / (pts[1].0 * y_c));
    }
    let r = y_abs / y_c;
    let mut ratio = pts[pts.len() - 1].1;
    for w in pts.windows(2) {
        if r <= w[1].0 {
            ratio = w[0].1 + (r - w[0].0) / (w[1].0 - w[0].0) * (w[1].1 - w[0].1);
            break;
        }
    }
    let p = p_u * ratio;
    (p * y.signum(), p / y_abs)
}

/// Soft clay p-y curve, short-term static loading (Matlock 1970, as API RP 2A
/// §6.8.3 tabulates it): [`API_SOFT_CLAY_STATIC`] with y_c = 2.5 ε50 D and
/// p_u from [`matlock_pu`]. The table is Matlock's cube-root curve at its
/// points; its first segment gives a finite initial stiffness (the cube root
/// has an infinite one, on which the SSI secant iteration does not settle).
pub fn py_soft_clay(su: f64, gamma_eff: f64, d: f64, depth: f64, eps_50: f64, j: f64, y: f64) -> (f64, f64) {
    normalized_curve(matlock_pu(su, gamma_eff, d, depth, j), 2.5 * eps_50 * d, &API_SOFT_CLAY_STATIC, y)
}

/// Initial modulus of subgrade reaction k (kN/m³) of API sand: API RP 2GEO
/// (2011) §8.5.7 Table 5 (the values of API RP 2A Fig. 6.8.7-1), φ' = 25°,
/// 30°, 35°, 40° → 5.4, 11, 22, 45 MN/m³, interpolated linearly. Outside
/// 25°–40° the table gives nothing and the curve is refused.
pub fn api_sand_k(phi: f64) -> Result<f64, String> {
    const T: [(f64, f64); 4] = [(25.0, 5_400.0), (30.0, 11_000.0), (35.0, 22_000.0), (40.0, 45_000.0)];
    if !phi.is_finite() || phi < T[0].0 || phi > T[3].0 {
        return Err(format!("Sand p-y curve: φ = {phi}° is outside 25°–40°, the range of API's k table (API RP 2GEO Table 5); use a custom curve"));
    }
    for w in T.windows(2) {
        if phi <= w[1].0 {
            return Ok(w[0].1 + (phi - w[0].0) / (w[1].0 - w[0].0) * (w[1].1 - w[0].1));
        }
    }
    Ok(T[3].1)
}

/// API sand ultimate resistance per unit length (kN/m): the lesser of
/// p_us = (C1 z + C2 D) γ' z and p_ud = C3 D γ' z (API RP 2A Eq. 6.8.6-1, -2).
pub fn api_sand_pu(phi: f64, gamma_eff: f64, d: f64, depth: f64) -> f64 {
    let phi_rad = phi.to_radians();
    // C1, C2, C3 of API RP 2A Fig. 6.8.6-1: the closed forms of Reese, Cox &
    // Koop (1974) the figure plots, with α = φ/2, β = 45° + φ/2, K0 = 0.4,
    // Ka = tan²(45° − φ/2). At φ = 30° they are ≈ 1.91, 2.67, 28.7.
    let alpha = phi_rad / 2.0;
    let beta = std::f64::consts::FRAC_PI_4 + phi_rad / 2.0;
    let k0 = 0.4;
    let ka = (std::f64::consts::FRAC_PI_4 - phi_rad / 2.0).tan().powi(2);
    let (tp, tb, tbp) = (phi_rad.tan(), beta.tan(), (beta - phi_rad).tan());
    let c1 = k0 * tp * beta.sin() / (tbp * alpha.cos())
        + tb * tb * alpha.tan() / tbp
        + k0 * tb * (tp * beta.sin() - alpha.tan());
    let c2 = tb / tbp - ka;
    let c3 = ka * (tb.powi(8) - 1.0) + k0 * tp * tb.powi(4);
    let p_us = (c1 * depth + c2 * d) * gamma_eff * depth;
    let p_ud = c3 * gamma_eff * depth * d;
    p_us.min(p_ud)
}

/// API's loading factor A: static max(3 − 0.8 z/D, 0.9), cyclic 0.9.
pub fn api_sand_a(loading: SandLoading, d: f64, depth: f64) -> f64 {
    match loading {
        SandLoading::Static => (3.0 - 0.8 * depth / d).max(0.9),
        SandLoading::Cyclic => 0.9,
    }
}

/// Sand p-y curve (API RP 2A §6.8.7): p = A p_u tanh(k z y / (A p_u)).
/// Refuses φ outside the k table (25°–40°).
pub fn py_sand(phi: f64, gamma_eff: f64, d: f64, depth: f64, loading: SandLoading, y: f64) -> Result<(f64, f64), String> {
    let k = api_sand_k(phi)?;
    let ap = api_sand_a(loading, d, depth) * api_sand_pu(phi, gamma_eff, d, depth);
    let y_abs = y.abs();
    if ap <= 0.0 {
        // At the ground surface p_u = 0: no resistance.
        return Ok((0.0, 0.0));
    }
    if y_abs < 1e-15 {
        return Ok((0.0, k * depth));
    }
    let p = ap * (k * depth * y_abs / ap).tanh();
    Ok((p * y.signum(), p / y_abs))
}

/// Stiff clay without free water, static loading (Welch & Reese 1972;
/// Reese & Welch 1975): p = 0.5 p_u (y/y50)^(1/4) up to 16 y50, p_u beyond;
/// y50 = 2.5 ε50 D, p_u from [`matlock_pu`]. Sampled the way API tabulates
/// Matlock's curve — exact at [`WELCH_REESE_ABSCISSAE`], linear between, at
/// most 3.3 % below the quarter power from 0.001 y50 to 16 y50 — so the
/// initial stiffness is finite (the quarter power's is infinite, on which the
/// SSI secant iteration does not settle). Continuous everywhere.
pub fn py_stiff_clay(su: f64, gamma_eff: f64, d: f64, depth: f64, eps_50: f64, j: f64, y: f64) -> (f64, f64) {
    let pts = WELCH_REESE_ABSCISSAE.map(|r| (r, if r == 0.0 { 0.0 } else { 0.5 * f64::powf(r, 0.25) }));
    normalized_curve(matlock_pu(su, gamma_eff, d, depth, j), 2.5 * eps_50 * d, &pts, y)
}

/// The y/y50 at which [`py_stiff_clay`] samples Welch & Reese's curve.
pub const WELCH_REESE_ABSCISSAE: [f64; 11] = [0.0, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 8.0, 16.0];

/// Unit shaft friction t-z curve (kPa, kPa/m): t = t_ult √(z/z_ult) for
/// z ≤ z_ult, t_ult beyond. [`evaluate_soil_curve`] multiplies by the shaft
/// perimeter. At z = 0 the secant is taken at z = 1e-6·z_ult.
pub fn tz_curve(t_ult: f64, z_ult: f64, z: f64) -> (f64, f64) {
    let curve = |za: f64| if za < z_ult { t_ult * (za / z_ult).sqrt() } else { t_ult };
    let z_abs = z.abs();
    if z_abs < 1e-15 {
        let z0 = 1e-6 * z_ult;
        return (0.0, curve(z0) / z0);
    }
    let t = curve(z_abs);
    (t * z.signum(), t / z_abs)
}

/// API RP 2A §6.4.3 q-z table: (z/D, Q/Qp), linear between points, 1 beyond.
const API_QZ: [(f64, f64); 6] = [(0.0, 0.0), (0.002, 0.25), (0.013, 0.50), (0.042, 0.75), (0.073, 0.90), (0.100, 1.00)];

/// Unit tip bearing q-z curve (kPa, kPa/m) per the API RP 2A table.
/// [`evaluate_soil_curve`] multiplies by the tip area. The tip bears only in
/// compression: when the node moves in the negative direction of the spring's
/// axis (down, for a vertical pile with the vertical axis up). Moving the other
/// way it gives no resistance (secant 0), never tension.
pub fn qz_curve(q_ult: f64, d: f64, z: f64) -> (f64, f64) {
    let ratio = |za: f64| {
        let r = za / d;
        for w in API_QZ.windows(2) {
            if r <= w[1].0 {
                return w[0].1 + (r - w[0].0) / (w[1].0 - w[0].0) * (w[1].1 - w[0].1);
            }
        }
        1.0
    };
    let z_abs = z.abs();
    if z_abs < 1e-15 {
        // The first segment is linear: its slope.
        return (0.0, q_ult * API_QZ[1].1 / (API_QZ[1].0 * d));
    }
    if z > 0.0 {
        return (0.0, 0.0);
    }
    let q = q_ult * ratio(z_abs);
    (q * z.signum(), q / z_abs)
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

