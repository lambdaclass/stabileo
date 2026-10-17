//! CIRSOC 301-2018 steel member checks (LRFD).
//!
//! The engine's statement of the clauses the app used to evaluate only in TypeScript
//! (`web/src/lib/engine/codes/argentina/cirsoc301.ts`, now a thin adapter over this module):
//!
//! * D.2 tension: yield on Ag, rupture on Ae = An·U (D.3, B.4.2.2); without the end
//!   connection the rupture limit state is refused, never taken on Ag.
//! * E compression: E.3 flexural buckling, E.4 torsional and flexural-torsional buckling,
//!   E.7 slender elements (Q = Qs·Qa), E.5 single angles, E.6 double angles (Groups I, II).
//! * F flexure: F.2 (LTB with load height and Cb), F.3, F.4, F.5 strong axis of I and
//!   channels; F.6 weak axis.
//! * G shear: G.2 (kv = 5, G.2.3–G.2.5); G.4 for angle legs (kv = 1,2).
//! * H.1 interaction, including H.1.1b for biaxial bending without axial force.
//!
//! Units follow the app's checker: lengths m, areas m², inertias m⁴, Cw m⁶, stresses MPa,
//! forces kN, moments kN·m. Axial force is POSITIVE IN COMPRESSION.
//!
//! The capacities are written once, generic over [`Real`], so the certified check
//! (`certify::design::certify_cirsoc301_members`) evaluates the same formulas in
//! outward-rounded interval arithmetic. Every step of the calculation is reported as a
//! message `{ key, params }` (`c301.*`), localised by the app; a refusal is a message too.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::certify::real::{branch, Real, Tri};

// ==================== Constants ====================

pub const PHI_T_YIELD: f64 = 0.90; // D.2(a)
pub const PHI_T_RUPTURE: f64 = 0.75; // D.2(b)
pub const PHI_C: f64 = 0.85; // E.1
pub const PHI_B: f64 = 0.90; // F.1
pub const PHI_V: f64 = 0.90; // G.1
/// Residual stress Fr, F.2.7 / F.3.2 / F.4.6a.
const FR_ROLLED: f64 = 69.0;
const FR_WELDED: f64 = 114.0;
/// G, A.3.5.
const G_CIRSOC: f64 = 77200.0;
/// Below this a demand is "absent", as in the app's checker.
const TINY: f64 = 1e-6;

// ==================== Messages ====================

/// One line of the calculation, or the reason a check was not evaluated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Msg {
    pub key: String,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub params: Map<String, Value>,
}

/// A parameter: a number rounded for display, or text.
pub enum P {
    N(f64, i32),
    S(String),
}

fn num(v: f64, d: i32) -> Value {
    if !v.is_finite() {
        return Value::String(if v.is_nan() { "—".into() } else if v > 0.0 { "∞".into() } else { "−∞".into() });
    }
    let k = 10f64.powi(d);
    let r = (v * k).round() / k;
    serde_json::Number::from_f64(if r == 0.0 { 0.0 } else { r }).map(Value::Number).unwrap_or(Value::Null)
}

pub fn msg(key: &str, params: &[(&str, P)]) -> Msg {
    let mut m = Map::new();
    for (k, p) in params {
        let v = match p {
            P::N(x, d) => num(*x, *d),
            P::S(s) => Value::String(s.clone()),
        };
        m.insert((*k).to_string(), v);
    }
    Msg { key: format!("c301.{key}"), params: m }
}

fn n(v: f64, d: i32) -> P {
    P::N(v, d)
}

fn s(v: impl Into<String>) -> P {
    P::S(v.into())
}

/// The calculation trace. Off for the certified (interval) evaluation.
pub struct Steps {
    on: bool,
    pub list: Vec<Msg>,
}

impl Steps {
    pub fn new(on: bool) -> Self {
        Self { on, list: Vec::new() }
    }
    fn push(&mut self, key: &str, params: &[(&str, P)]) {
        if self.on {
            self.list.push(msg(key, params));
        }
    }
    fn push_msg(&mut self, m: &Msg) {
        if self.on {
            self.list.push(m.clone());
        }
    }
}

/// A refusal: the check cannot be evaluated, with the reason.
pub type Refusal = Msg;

fn refuse(key: &str, params: &[(&str, P)]) -> Refusal {
    msg(&format!("refuse.{key}"), params)
}

// ==================== Input ====================

/// Section and member data. Field names follow the app's `SteelDesignParams`
/// (note: `Iz` is the STRONG axis there, `Iy` the weak one).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cirsoc301MemberData {
    #[serde(rename = "elementId", default)]
    pub element_id: usize,
    #[serde(rename = "Fy")]
    pub fy: f64,
    #[serde(rename = "Fu")]
    pub fu: f64,
    #[serde(rename = "E")]
    pub e: f64,
    #[serde(rename = "A")]
    pub a: f64,
    /// Strong-axis inertia (CIRSOC Ix).
    #[serde(rename = "Iz")]
    pub i_strong: f64,
    /// Weak-axis inertia (CIRSOC Iy).
    #[serde(rename = "Iy")]
    pub i_weak: f64,
    /// Plate dimensions; absent = 0, which every check that needs them refuses or fails.
    #[serde(default)]
    pub h: f64,
    #[serde(default)]
    pub b: f64,
    #[serde(default)]
    pub tw: f64,
    #[serde(default)]
    pub tf: f64,
    #[serde(rename = "Zx", default)]
    pub zx: Option<f64>,
    #[serde(rename = "Zy", default)]
    pub zy: Option<f64>,
    #[serde(rename = "Sx", default)]
    pub sx: Option<f64>,
    #[serde(rename = "Sy", default)]
    pub sy: Option<f64>,
    #[serde(default)]
    pub c: Option<f64>,
    #[serde(rename = "L")]
    pub l: f64,
    #[serde(rename = "Lb")]
    pub lb: f64,
    #[serde(rename = "Kx", default)]
    pub kx: Option<f64>,
    #[serde(rename = "Ky", default)]
    pub ky: Option<f64>,
    #[serde(rename = "J", default)]
    pub j: Option<f64>,
    #[serde(rename = "Cw", default)]
    pub cw: Option<f64>,
    #[serde(rename = "Cb", default)]
    pub cb: Option<f64>,
    #[serde(rename = "builtUp", default)]
    pub built_up: Option<bool>,
    #[serde(default)]
    pub shape: Option<String>,
    #[serde(default)]
    pub hw: Option<f64>,
    #[serde(rename = "loadPosition", default)]
    pub load_position: Option<String>,
    #[serde(rename = "G", default)]
    pub g: Option<f64>,
    #[serde(rename = "compressionElements", default)]
    pub compression_elements: Option<Vec<CompressionElement>>,
    #[serde(rename = "Kz", default)]
    pub kz: Option<f64>,
    #[serde(rename = "Lz", default)]
    pub lz: Option<f64>,
    #[serde(rename = "shearCentreOffset", default)]
    pub shear_centre_offset: Option<f64>,
    #[serde(rename = "tensionConnection", default)]
    pub tension_connection: Option<TensionConnection>,
    /// Single or double angle data (shape 'L' / '2L').
    #[serde(default)]
    pub angle: Option<AngleData>,
}

/// A compression element for Q (§E.7). `b`, `t` in m.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionElement {
    pub kind: String,
    pub b: f64,
    pub t: f64,
    pub count: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedAe {
    #[serde(rename = "Ae")]
    pub ae: f64,
    /// Steps already rendered by the caller (the model's end connections).
    #[serde(default)]
    pub steps: Vec<String>,
    /// The same steps as messages, when the caller has them.
    #[serde(default)]
    pub messages: Vec<Msg>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Holes {
    pub count: f64,
    pub d: f64,
    pub t: f64,
    #[serde(default)]
    pub staggers: Vec<Stagger>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stagger {
    pub s: f64,
    pub g: f64,
    pub t: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlateWeld {
    #[serde(rename = "L")]
    pub l: f64,
    pub w: f64,
}

/// The end connection of a tension member (D.3, B.4.2.2). See `TensionConnection` in the app.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TensionConnection {
    #[serde(default)]
    pub resolved: Option<ResolvedAe>,
    #[serde(default)]
    pub refused: Option<String>,
    #[serde(rename = "An", default)]
    pub an: Option<f64>,
    #[serde(default)]
    pub holes: Option<Holes>,
    #[serde(rename = "U", default)]
    pub u: Option<f64>,
    #[serde(rename = "allElementsConnected", default)]
    pub all_elements_connected: Option<bool>,
    #[serde(rename = "plateWeld", default)]
    pub plate_weld: Option<PlateWeld>,
    #[serde(rename = "xBar", default)]
    pub x_bar: Option<f64>,
    #[serde(default)]
    pub length: Option<f64>,
    #[serde(rename = "connectedArea", default)]
    pub connected_area: Option<f64>,
    #[serde(default)]
    pub welded: Option<bool>,
}

/// Angle data (m). A single angle: `legLong ≥ legShort`, one thickness. A double angle:
/// two equal angles back to back, `gap` between the backs (0 = in continuous contact).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AngleData {
    pub leg_long: f64,
    pub leg_short: f64,
    pub t: f64,
    /// Catalogue properties of ONE angle, when known (m², m⁴): area and the inertias about
    /// the geometric axes parallel to the long and the short leg. See [`angle_section`].
    #[serde(default)]
    pub area: Option<f64>,
    #[serde(default)]
    pub i_par_long: Option<f64>,
    #[serde(default)]
    pub i_par_short: Option<f64>,
    /// How the angle is loaded at its ends (E.5); single angles only.
    /// 'concentric' — line of load on the centroid (E.5, first case);
    /// 'e5aLong' / 'e5aShort' — E.5(a), connected through the long / short leg;
    /// 'e5bLong' / 'e5bShort' — E.5(b). Absent: compression is refused.
    #[serde(default)]
    pub end_condition: Option<String>,
    /// Double angles: the legs placed back to back, 'long' or 'short'.
    #[serde(default)]
    pub back_to_back: Option<String>,
    /// Double angles: clear distance between the backs, m (0 = continuous contact).
    #[serde(default)]
    pub gap: Option<f64>,
    /// Double angles: distance a between intermediate connectors (E.6.2.1), m.
    #[serde(default)]
    pub connector_spacing: Option<f64>,
    /// Double angles: 'snugBolts' (E.6.1) or 'welded' (welds or pretensioned bolts, E.6.2).
    #[serde(default)]
    pub connector: Option<String>,
}

/// Design forces. `nu` POSITIVE IN COMPRESSION, kN; moments kN·m; shear kN.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cirsoc301DesignForces {
    #[serde(rename = "elementId")]
    pub element_id: usize,
    #[serde(rename = "Nu")]
    pub nu: f64,
    /// Strong-axis moment (CIRSOC Mux; the app's `Muz`).
    #[serde(rename = "Muz", default)]
    pub mu_strong: f64,
    /// Weak-axis moment (CIRSOC Muy).
    #[serde(rename = "Muy", default)]
    pub mu_weak: f64,
    #[serde(rename = "Vu", default)]
    pub vu: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cirsoc301CheckInput {
    pub members: Vec<Cirsoc301MemberData>,
    pub forces: Vec<Cirsoc301DesignForces>,
}

// ==================== Output ====================

/// One limit-state check. `ratio` is ∞ (JSON null) for a loaded check that was refused.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckOutcome {
    pub demand: f64,
    /// Design strength φRn (0 when refused under load).
    pub capacity: f64,
    #[serde(serialize_with = "ser_ratio", deserialize_with = "de_ratio")]
    pub ratio: f64,
    pub pass: bool,
    /// Clause of the governing expression (e.g. "F.2", "E.4").
    pub clause: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_evaluated: Option<Msg>,
    /// Named intermediate values (KLr, Fe, Fcr, Q, Mp, Mn, Lp, Lr, Cv, value …).
    pub values: Map<String, Value>,
    pub steps: Vec<Msg>,
}

fn ser_ratio<S: serde::Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
    if v.is_finite() { s.serialize_f64(*v) } else { s.serialize_none() }
}

fn de_ratio<'de, D: serde::Deserializer<'de>>(d: D) -> Result<f64, D::Error> {
    let v: Option<f64> = Option::deserialize(d)?;
    Ok(v.unwrap_or(f64::INFINITY))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc301CheckResult {
    pub element_id: usize,
    pub nu: f64,
    pub mu_strong: f64,
    pub mu_weak: f64,
    pub vu: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tension: Option<CheckOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression: Option<CheckOutcome>,
    pub flexure_strong: CheckOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flexure_weak: Option<CheckOutcome>,
    pub shear: CheckOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interaction: Option<CheckOutcome>,
    /// Largest ratio over the checks run (∞ = JSON null when a loaded check was refused).
    #[serde(serialize_with = "ser_ratio", deserialize_with = "de_ratio")]
    pub unity_ratio: f64,
    pub governing_check: String,
    /// Every check run passed (ratio ≤ 1) and none was refused under load.
    pub pass: bool,
    /// Names of the loaded checks that could not be evaluated.
    pub unevaluated: Vec<String>,
}

// ==================== Shapes ====================

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Shape {
    I,
    U,
    T,
    Box,
    Rhs,
    Chs,
    Solid,
    SingleAngle,
    DoubleAngle,
}

/// The app's shape name as a family, or None for one the checker cannot classify.
pub fn shape_of(s: Option<&str>) -> Option<Shape> {
    match s {
        None | Some("I") | Some("H") => Some(Shape::I),
        Some("U") => Some(Shape::U),
        Some("T") => Some(Shape::T),
        Some("box") => Some(Shape::Box),
        Some("RHS") => Some(Shape::Rhs),
        Some("CHS") => Some(Shape::Chs),
        Some("rect") | Some("solid") => Some(Shape::Solid),
        Some("L") => Some(Shape::SingleAngle),
        Some("2L") => Some(Shape::DoubleAngle),
        _ => None,
    }
}

fn shape_name(m: &Cirsoc301MemberData) -> String {
    m.shape.clone().unwrap_or_else(|| "I".into())
}

fn unknown_shape(m: &Cirsoc301MemberData) -> Refusal {
    refuse("unknownShape", &[("shape", s(shape_name(m)))])
}

fn built_up(m: &Cirsoc301MemberData) -> bool {
    m.built_up.unwrap_or(false)
}

fn ex<T: Real>(x: f64) -> T {
    T::exact(x)
}

fn lit<T: Real>(x: f64) -> T {
    T::lit(x)
}

/// `a / b` with b exact, as T.
fn q<T: Real>(a: T, b: T) -> T {
    a.dv(b)
}

fn pi2<T: Real>() -> T {
    T::pi() * T::pi()
}

// ==================== §D Tension ====================

/// Ae (m²) per D.3 and B.4.2.2, or why it cannot be known.
fn effective_net_area<T: Real>(m: &Cirsoc301MemberData, st: &mut Steps) -> Result<T, Refusal> {
    let Some(c) = &m.tension_connection else {
        return Err(refuse("noConnection", &[]));
    };
    if let Some(r) = &c.refused {
        return Err(refuse("connectionRefused", &[("reason", s(r.clone()))]));
    }
    let ag = m.a;
    if let Some(r) = &c.resolved {
        if !(r.ae > 0.0 && r.ae <= ag * (1.0 + 1e-9)) {
            return Err(refuse("aeOutOfRange", &[("Ae", n(r.ae * 1e6, 0))]));
        }
        if !r.messages.is_empty() {
            for mm in &r.messages {
                st.push_msg(mm);
            }
        } else {
            for line in &r.steps {
                st.push("text", &[("text", s(line.clone()))]);
            }
        }
        return Ok(ex(r.ae));
    }
    let mut an: T = ex(ag);
    if let Some(a) = c.an {
        if !(a > 0.0 && a <= ag) {
            return Err(refuse("anOutOfRange", &[("An", n(a * 1e6, 0))]));
        }
        an = ex(a);
        st.push("d.anGiven", &[("An", n(a * 1e6, 0))]);
    } else if let Some(h) = c.holes.as_ref().filter(|h| h.count > 0.0) {
        if !(h.d > 0.0 && h.t > 0.0) {
            return Err(refuse("holesIncomplete", &[]));
        }
        // B.4.2.2: the hole width is the nominal hole plus 2 mm.
        let mut stagger: T = ex(0.0);
        for z in &h.staggers {
            stagger = stagger + q(ex::<T>(z.s) * ex(z.s) * ex(z.t), ex::<T>(4.0) * ex(z.g));
        }
        let dh: T = ex::<T>(h.d) + lit(0.002);
        an = ex::<T>(ag) - ex::<T>(h.count) * dh * ex(h.t) + stagger;
        st.push(
            "d.anHoles",
            &[
                ("Ag", n(ag * 1e6, 0)),
                ("count", n(h.count, 0)),
                ("dh", n(dh.mid() * 1000.0, 1)),
                ("t", n(h.t * 1000.0, 1)),
                ("stagger", n(stagger.mid() * 1e6, 0)),
                ("An", n(an.mid() * 1e6, 0)),
            ],
        );
        if !(an.mid() > 0.0) {
            return Err(refuse("anNonPositive", &[]));
        }
    }

    if let Some(u) = c.u {
        if !(u > 0.0 && u <= 1.0) {
            return Err(refuse("uOutOfRange", &[("U", n(u, 3))]));
        }
        st.push("d.uGiven", &[("U", n(u, 3))]);
        return Ok(an * ex(u));
    }
    if c.all_elements_connected == Some(true) {
        st.push("d.allConnected", &[]);
        return Ok(an);
    }
    if let Some(pw) = &c.plate_weld {
        let (l, w) = (pw.l, pw.w);
        if !(l > 0.0 && w > 0.0) || l < w {
            return Err(refuse("plateWeldShort", &[]));
        }
        let u = if l >= 2.0 * w { 1.0 } else if l >= 1.5 * w { 0.87 } else { 0.75 };
        st.push("d.plateWeld", &[("L", n(l * 1000.0, 0)), ("w", n(w * 1000.0, 0)), ("U", n(u, 2))]);
        return Ok(ex::<T>(ag) * lit(u));
    }
    if let (Some(xb), Some(len)) = (c.x_bar, c.length) {
        if !(xb >= 0.0 && len > 0.0) {
            return Err(refuse("xBarInvalid", &[]));
        }
        let raw: T = ex::<T>(1.0) - q(ex::<T>(xb), ex(len));
        let mut u = raw.min(lit(0.9));
        st.push(
            "d.uShearLag",
            &[("xBar", n(xb * 1000.0, 1)), ("L", n(len * 1000.0, 0)), ("raw", n(raw.mid(), 3)), ("U", n(u.mid(), 3))],
        );
        if let Some(ac) = c.connected_area.filter(|a| *a > 0.0) {
            let lower: T = q(ex::<T>(ac), ex(ag)).min(ex(1.0));
            if lower.mid() > u.mid() {
                st.push("d.uFloor", &[("U", n(lower.mid(), 3))]);
            }
            u = u.max(lower);
        }
        if !(u.mid() > 0.0) {
            return Err(refuse("uNonPositive", &[("U", n(u.mid(), 3))]));
        }
        let welded = c.welded == Some(true);
        st.push("d.aeBase", &[("base", s(if welded { "Ag" } else { "An" })), ("clause", s(if welded { "D.3.3" } else { "D.3.1" }))]);
        let base: T = if welded { ex(ag) } else { an };
        return Ok(base * u);
    }
    Err(refuse("noShearLag", &[]))
}

/// D.2 design strengths: (φPn yield, φPn rupture or why it was refused), kN.
pub fn tension_capacity<T: Real>(m: &Cirsoc301MemberData, st: &mut Steps) -> (T, Result<T, Refusal>) {
    let ag_mm2: T = ex::<T>(m.a) * lit(1e6);
    let pn_y = ex::<T>(m.fy) * ag_mm2.dv(lit(1000.0));
    let phi_y = lit::<T>(PHI_T_YIELD) * pn_y;
    st.push("d.yieldTitle", &[]);
    st.push("d.yield", &[("Fy", n(m.fy, 1)), ("Ag", n(ag_mm2.mid(), 0)), ("Pn", n(pn_y.mid(), 2)), ("phiPn", n(phi_y.mid(), 2))]);
    st.push("d.ruptureTitle", &[]);
    let rupture = effective_net_area::<T>(m, st).map(|ae| {
        let ae_mm2 = ae * lit(1e6);
        let pn = ex::<T>(m.fu) * ae_mm2.dv(lit(1000.0));
        let phi = lit::<T>(PHI_T_RUPTURE) * pn;
        st.push("d.rupture", &[("Fu", n(m.fu, 1)), ("Ae", n(ae_mm2.mid(), 0)), ("Pn", n(pn.mid(), 2)), ("phiPn", n(phi.mid(), 2))]);
        phi
    });
    (phi_y, rupture)
}

// ==================== Classification, Q (§E.7) ====================

/// Clear web height h of B.4.1(b), mm.
fn web_clear_height_mm(m: &Cirsoc301MemberData) -> f64 {
    m.hw.unwrap_or(m.h - 2.0 * m.tf) * 1000.0
}

/// kc = 4/√(h/tw), clamped to 0,35 … 0,763 (Tabla B.4.1, obs. a).
fn kc_of(h_mm: f64, tw_mm: f64) -> f64 {
    (4.0 / (h_mm / tw_mm).sqrt()).max(0.35).min(0.763)
}

fn el(kind: &str, b: f64, t: f64, count: f64) -> CompressionElement {
    CompressionElement { kind: kind.into(), b, t, count }
}

/// The section's compression elements as B.4.1 defines their widths.
fn compression_elements(m: &Cirsoc301MemberData, shape: Shape) -> Option<Vec<CompressionElement>> {
    if let Some(e) = &m.compression_elements {
        return Some(e.clone());
    }
    let hw = web_clear_height_mm(m) / 1000.0;
    let flange = if built_up(m) { "unstiffenedWelded" } else { "unstiffenedRolled" };
    match shape {
        Shape::I => Some(vec![el(flange, m.b / 2.0, m.tf, 4.0), el("stiffened", hw, m.tw, 1.0)]),
        Shape::U => Some(vec![el(flange, m.b, m.tf, 2.0), el("stiffened", hw, m.tw, 1.0)]),
        Shape::T => Some(vec![el(flange, m.b / 2.0, m.tf, 2.0), el("teeStem", m.h, m.tw, 1.0)]),
        Shape::Box => Some(vec![
            el("stiffened", m.b - 2.0 * m.tw, m.tf, 2.0),
            el("stiffened", m.h - 2.0 * m.tf, m.tw, 2.0),
        ]),
        Shape::Rhs => Some(vec![
            el("tubeWall", m.b - 3.0 * m.tw, m.tw, 2.0),
            el("tubeWall", m.h - 3.0 * m.tw, m.tw, 2.0),
        ]),
        Shape::Solid => Some(vec![]),
        // Angle legs: Tabla B.4.1a case 3 (both legs, whole leg width b, B.4.1(a)(a)).
        Shape::SingleAngle | Shape::DoubleAngle => m.angle.as_ref().map(|a| {
            let k = if shape == Shape::DoubleAngle { 2.0 } else { 1.0 };
            vec![el("angle", a.leg_long, a.t, k), el("angle", a.leg_short, a.t, k)]
        }),
        Shape::Chs => None,
    }
}

pub struct QResult<T> {
    pub q: T,
    pub qs: T,
    pub qa: T,
    pub slender: bool,
    /// Q is exactly 1 (no reduction applied).
    pub unit: bool,
}

/// §E.7 — Q = Qs·Qa. `fq1` is f = Fcr with Q = 1 (E.7.17); `area` the gross area used.
fn slender_reduction<T: Real>(
    m: &Cirsoc301MemberData,
    shape: Shape,
    fq1: T,
    area: f64,
    st: &mut Steps,
) -> Result<QResult<T>, Refusal> {
    let (fy, e) = (m.fy, m.e);
    let one: T = ex(1.0);
    if shape == Shape::Chs {
        let dt = m.h / m.tw;
        let lim = 0.11 * e / fy;
        if dt <= lim {
            st.push("e.chsCompact", &[("Dt", n(dt, 1)), ("lim", n(lim, 1))]);
            return Ok(QResult { q: one, qs: one, qa: one, slender: false, unit: true });
        }
        if dt > 0.45 * e / fy {
            return Err(refuse("chsTooSlender", &[("Dt", n(dt, 1)), ("lim", n(0.45 * e / fy, 1))]));
        }
        let qv: T = q(lit::<T>(0.038) * ex(e), ex::<T>(fy) * ex(dt)) + q(ex::<T>(2.0), ex(3.0));
        st.push("e.chsQ", &[("Dt", n(dt, 1)), ("Q", n(qv.mid(), 3))]);
        return Ok(QResult { q: qv, qs: one, qa: qv, slender: true, unit: false });
    }
    let Some(elems) = compression_elements(m, shape) else {
        return Err(unknown_shape(m));
    };
    let r = (e / fy).sqrt();
    let rt: T = q(ex::<T>(e), ex(fy)).sqrt();
    let kc = kc_of(web_clear_height_mm(m), m.tw * 1000.0);
    let mut qs: T = one;
    let mut qs_reduced = false;
    let mut lost: T = ex(0.0);
    let mut lost_any = false;
    let mut slender = false;
    for elm in &elems {
        if !(elm.b > 0.0 && elm.t > 0.0 && elm.count.is_finite() && elm.count >= 0.0) {
            return Err(refuse("elementInvalid", &[("kind", s(elm.kind.clone()))]));
        }
        let lam = elm.b / elm.t;
        let lam_t: T = q(ex::<T>(elm.b), ex(elm.t));
        let mut qv: Option<T> = None;
        let lam_r: f64;
        match elm.kind.as_str() {
            "unstiffenedRolled" => {
                lam_r = 0.56 * r;
                if lam > 1.03 * r {
                    qv = Some(q(lit::<T>(0.69) * ex(e), ex::<T>(fy) * lam_t * lam_t));
                } else if lam > lam_r {
                    qv = Some(lit::<T>(1.415) - lit::<T>(0.74) * q(lam_t, rt));
                }
            }
            "unstiffenedWelded" => {
                let rk = (e * kc / fy).sqrt();
                let rk_t: T = q(ex::<T>(e) * ex(kc), ex(fy)).sqrt();
                lam_r = 0.64 * rk;
                if lam > 1.17 * rk {
                    qv = Some(q(lit::<T>(0.90) * ex(e) * ex(kc), ex::<T>(fy) * lam_t * lam_t));
                } else if lam > lam_r {
                    qv = Some(lit::<T>(1.415) - lit::<T>(0.65) * q(lam_t, rk_t));
                }
            }
            "angle" => {
                lam_r = 0.45 * r;
                if lam > 0.91 * r {
                    qv = Some(q(lit::<T>(0.53) * ex(e), ex::<T>(fy) * lam_t * lam_t));
                } else if lam > lam_r {
                    qv = Some(lit::<T>(1.34) - lit::<T>(0.76) * q(lam_t, rt));
                }
            }
            "teeStem" => {
                lam_r = 0.75 * r;
                if lam > 1.03 * r {
                    qv = Some(q(lit::<T>(0.69) * ex(e), ex::<T>(fy) * lam_t * lam_t));
                } else if lam > lam_r {
                    qv = Some(lit::<T>(1.908) - lit::<T>(1.22) * q(lam_t, rt));
                }
            }
            "stiffened" => {
                lam_r = 1.49 * r;
                let rf: T = q(ex::<T>(e), fq1).sqrt();
                if lam > lam_r {
                    let c = (lit::<T>(1.49) * rf).le(lam_t);
                    let lost_el = |rf: T| {
                        let be = (lit::<T>(1.91) * ex(elm.t) * rf * (one - q(lit::<T>(0.34), lam_t) * rf)).min(ex(elm.b));
                        ex::<T>(elm.count) * (ex::<T>(elm.b) - be) * ex(elm.t)
                    };
                    let add = branch(c, || lost_el(rf), || ex(0.0));
                    if c != Tri::False {
                        lost_any = true;
                        let be = (lit::<T>(1.91) * ex(elm.t) * rf * (one - q(lit::<T>(0.34), lam_t) * rf)).min(ex(elm.b));
                        st.push(
                            "e.stiffenedBe",
                            &[("bt", n(lam, 1)), ("lamR", n(lam_r, 1)), ("be", n(be.mid() * 1000.0, 1)), ("b", n(elm.b * 1000.0, 1)), ("f", n(fq1.mid(), 1))],
                        );
                    }
                    lost = lost + add;
                }
            }
            "tubeWall" => {
                lam_r = 1.40 * r;
                if lam > lam_r {
                    let be = (lit::<T>(1.91) * ex(elm.t) * rt * (one - q(lit::<T>(0.38), lam_t) * rt)).min(ex(elm.b));
                    lost = lost + ex::<T>(elm.count) * (ex::<T>(elm.b) - be) * ex(elm.t);
                    lost_any = true;
                    st.push("e.tubeBe", &[("bt", n(lam, 1)), ("lamR", n(lam_r, 1)), ("be", n(be.mid() * 1000.0, 1))]);
                }
            }
            other => return Err(refuse("elementInvalid", &[("kind", s(other))])),
        }
        if lam > lam_r {
            slender = true;
        }
        if let Some(v) = qv {
            if v.mid() < 1.0 {
                st.push("e.unstiffenedQs", &[("kind", s(elm.kind.clone())), ("bt", n(lam, 1)), ("lamR", n(lam_r, 1)), ("Qs", n(v.mid(), 3))]);
                qs = qs.min(v);
                qs_reduced = true;
            }
        }
    }
    let qa: T = if lost_any { q(ex::<T>(area) - lost, ex(area)) } else { one };
    let unit = !qs_reduced && !lost_any;
    let qv = if unit { one } else { qs * qa };
    Ok(QResult { q: qv, qs, qa, slender, unit })
}

// ==================== §E Compression ====================

/// E.3 / E.7 in the λc form, λe = √(Fy/Fe):
///   λe·√Q ≤ 1,5: Fcr = Q·0,658^(Q·λe²)·Fy  (E.7.2; E.3.2 with Q = 1)
///   λe·√Q > 1,5: Fcr = (0,877/λe²)·Fy       (E.7.3; E.3.3)
fn fcr_of<T: Real>(fy: f64, qv: T, fe: T) -> T {
    let lam2 = q(ex::<T>(fy), fe);
    branch(
        (qv * lam2).sqrt().le(lit(1.5)),
        || qv * lit::<T>(0.658).powf(qv * lam2) * ex(fy),
        || q(lit::<T>(0.877), lam2) * ex(fy),
    )
}

enum Torsional<T> {
    None,
    Fe(T),
    Fcr(T),
}

/// The flexural-torsional "combine" of E.4.2 / E.4.5.
fn ftb_combine<T: Real>(a: T, b: T, h: T) -> T {
    let sum = a + b;
    q(sum, ex::<T>(2.0) * h) * (ex::<T>(1.0) - (ex::<T>(1.0) - q(ex::<T>(4.0) * a * b * h, sum * sum)).sqrt())
}

/// Shear-centre offset from the centroid along the axis of symmetry (thin plates), m.
fn shear_centre_offset_of(m: &Cirsoc301MemberData, shape: Shape) -> f64 {
    let (h, b, tw, tf) = (m.h, m.b, m.tw, m.tf);
    if shape == Shape::T {
        return ((h - tf) * tw * (h / 2.0)) / (b * tf + (h - tf) * tw);
    }
    let bp = b - tw / 2.0;
    let hp = h - tf;
    (3.0 * bp * bp * tf) / (6.0 * bp * tf + hp * tw) + (bp * bp * tf) / (2.0 * bp * tf + hp * tw)
}

/// §E.4 for I, U and T. Fe goes into E.7.2a/E.7.3a like the flexural Fe.
fn torsional_buckling<T: Real>(
    m: &Cirsoc301MemberData,
    shape: Shape,
    q_unit: bool,
    st: &mut Steps,
) -> Result<Torsional<T>, Refusal> {
    if matches!(shape, Shape::Box | Shape::Rhs | Shape::Chs | Shape::Solid) {
        return Ok(Torsional::None);
    }
    let e: T = ex(m.e);
    let g: T = ex(m.g.unwrap_or(G_CIRSOC));
    let kz = m.kz.unwrap_or(1.0);
    let lz = m.lz.unwrap_or(m.l);
    let kzl: T = ex::<T>(kz) * ex(lz);
    let (ky, kx) = (m.ky.unwrap_or(1.0), m.kx.unwrap_or(1.0));
    let j = m.j.unwrap_or(0.0);
    let (ix, iy, a) = (ex::<T>(m.i_strong), ex::<T>(m.i_weak), ex::<T>(m.a));
    if shape == Shape::I {
        let cw = m.cw.unwrap_or(0.0);
        if !(j > 0.0 && cw > 0.0) {
            if kz * lz > ky * m.l {
                return Err(refuse("e4NoJCw", &[]));
            }
            st.push("e.e4NotApplicable", &[]);
            return Ok(Torsional::None);
        }
        let fe = q(q(pi2::<T>() * e * ex(cw), kzl * kzl) + g * ex(j), ix + iy);
        st.push("e.e4Torsional", &[("Fe", n(fe.mid(), 1))]);
        return Ok(Torsional::Fe(fe));
    }
    if !(j > 0.0) {
        return Err(refuse("e4NoJ", &[]));
    }
    let e0 = m.shear_centre_offset.unwrap_or_else(|| shear_centre_offset_of(m, shape));
    if !(e0.is_finite() && e0 >= 0.0) {
        return Err(refuse("e4ShearCentre", &[]));
    }
    let cw = m.cw.filter(|c| *c > 0.0).unwrap_or(0.0);
    let e0t: T = ex(e0);
    let ro2 = e0t * e0t + q(ix + iy, a);
    let hh = ex::<T>(1.0) - q(e0t * e0t, ro2);
    let fez = q(q(pi2::<T>() * e * ex(cw), kzl * kzl) + g * ex(j), a * ro2);
    st.push("e.e4Geometry", &[("e0", n(e0 * 1000.0, 1)), ("ro2", n(ro2.mid() * 1e4, 2)), ("H", n(hh.mid(), 3))]);
    let ry = q(iy, a).sqrt();
    if shape == Shape::T && q_unit {
        let fey = q(pi2::<T>() * e, (q(ex::<T>(ky) * ex(m.l), ry)).sq());
        let fcry = fcr_of(m.fy, ex(1.0), fey);
        let fcrz = q(g * ex(j), a * ro2);
        let fcr = ftb_combine(fcry, fcrz, hh);
        st.push("e.e4Tee", &[("Fcry", n(fcry.mid(), 1)), ("Fcrz", n(fcrz.mid(), 1)), ("Fcr", n(fcr.mid(), 1))]);
        return Ok(Torsional::Fcr(fcr));
    }
    let fes = if shape == Shape::U {
        let rx = q(ix, a).sqrt();
        q(pi2::<T>() * e, (q(ex::<T>(kx) * ex(m.l), rx)).sq())
    } else {
        q(pi2::<T>() * e, (q(ex::<T>(ky) * ex(m.l), ry)).sq())
    };
    let fe = ftb_combine(fes, fez, hh);
    st.push("e.e4Ftb", &[("Fes", n(fes.mid(), 1)), ("Fez", n(fez.mid(), 1)), ("Fe", n(fe.mid(), 1))]);
    Ok(Torsional::Fe(fe))
}

/// The compression design strength and what it rests on.
pub struct CompressionCap<T> {
    pub phi_pn: T,
    pub klr: T,
    pub fe: T,
    pub fcr: T,
    pub q: T,
    pub clause: &'static str,
}

/// §E: φc·Pn, kN, or why it cannot be evaluated.
pub fn compression_capacity<T: Real>(m: &Cirsoc301MemberData, st: &mut Steps) -> Result<CompressionCap<T>, Refusal> {
    let shape = shape_of(m.shape.as_deref()).ok_or_else(|| unknown_shape(m))?;
    if matches!(shape, Shape::SingleAngle | Shape::DoubleAngle) {
        return angle_compression(m, shape, st);
    }
    let (fy, e, a) = (m.fy, m.e, m.a);
    let kx = m.kx.unwrap_or(1.0);
    let ky = m.ky.unwrap_or(1.0);
    let rx: T = q(ex::<T>(m.i_strong), ex(a)).sqrt();
    let ry: T = q(ex::<T>(m.i_weak), ex(a)).sqrt();
    let klrx = q(ex::<T>(kx) * ex(m.l), rx);
    let klry = q(ex::<T>(ky) * ex(m.l), ry);
    let klr = klrx.max(klry);
    st.push("e.title", &[]);
    st.push(
        "e.slenderness",
        &[
            ("rx", n(rx.mid() * 1000.0, 1)),
            ("ry", n(ry.mid() * 1000.0, 1)),
            ("KLrx", n(klrx.mid(), 1)),
            ("KLry", n(klry.mid(), 1)),
            ("KLr", n(klr.mid(), 1)),
            ("axis", s(if klrx.mid() >= klry.mid() { "x" } else { "y" })),
        ],
    );
    let fe = q(pi2::<T>() * ex(e), klr * klr);
    st.push("e.euler", &[("Fe", n(fe.mid(), 1))]);
    let fq1 = fcr_of(fy, ex(1.0), fe);
    let qr = slender_reduction(m, shape, fq1, a, st)?;
    finish_compression(m, shape, qr, fe, klr, st)
}

/// Fcr from E.3/E.7 with the E.4 limit state, and φc·Pn.
fn finish_compression<T: Real>(
    m: &Cirsoc301MemberData,
    shape: Shape,
    qr: QResult<T>,
    fe: T,
    klr: T,
    st: &mut Steps,
) -> Result<CompressionCap<T>, Refusal> {
    let fy = m.fy;
    let qv = qr.q;
    if qr.slender {
        st.push("e.slenderQ", &[("Qs", n(qr.qs.mid(), 3)), ("Qa", n(qr.qa.mid(), 3)), ("Q", n(qv.mid(), 3))]);
    } else {
        st.push("e.compactQ", &[]);
    }
    let fcr_flex = fcr_of(fy, qv, fe);
    let lam_q = (qv * q(ex::<T>(fy), fe)).sqrt();
    st.push(
        if lam_q.mid() <= 1.5 { "e.fcrInelastic" } else { "e.fcrElastic" },
        &[("lam", n(lam_q.mid(), 3)), ("Fcr", n(fcr_flex.mid(), 1)), ("clause", s(if qr.unit { "E.3" } else { "E.7" }))],
    );
    let tb = torsional_buckling::<T>(m, shape, qr.unit, st)?;
    let (fcr, clause) = match tb {
        Torsional::None => (fcr_flex, if qr.unit { "E.3" } else { "E.7" }),
        Torsional::Fe(fet) => {
            let ft = fcr_of(fy, qv, fet);
            st.push("e.e4Fcr", &[("Fcr", n(ft.mid(), 1))]);
            let gov = ft.mid() < fcr_flex.mid();
            if gov {
                st.push("e.e4Governs", &[("Fcr", n(ft.mid(), 1))]);
            }
            (fcr_flex.min(ft), if gov { "E.4" } else if qr.unit { "E.3" } else { "E.7" })
        }
        Torsional::Fcr(ft) => {
            let gov = ft.mid() < fcr_flex.mid();
            if gov {
                st.push("e.e4Governs", &[("Fcr", n(ft.mid(), 1))]);
            }
            (fcr_flex.min(ft), if gov { "E.4" } else { "E.3" })
        }
    };
    Ok(pn_from_fcr(m.a, fcr, fe, klr, qv, clause, st))
}

fn pn_from_fcr<T: Real>(a: f64, fcr: T, fe: T, klr: T, qv: T, clause: &'static str, st: &mut Steps) -> CompressionCap<T> {
    let ag_mm2 = ex::<T>(a) * lit(1e6);
    let pn = fcr * ag_mm2.dv(lit(1000.0));
    let phi_pn = lit::<T>(PHI_C) * pn;
    st.push("e.pn", &[("Fcr", n(fcr.mid(), 1)), ("Ag", n(ag_mm2.mid(), 0)), ("Pn", n(pn.mid(), 2)), ("phiPn", n(phi_pn.mid(), 2))]);
    CompressionCap { phi_pn, klr, fe, fcr, q: qv, clause }
}

// ==================== Angles (§E.5, §E.6, E.4) ====================

/// Angle properties from the legs and thickness, sharp corners (thin plates with no root
/// or toe radius). All in m. See [`angle_section`] for how they are made conservative
/// against a rolled section's catalogue values.
#[derive(Debug, Clone, Copy)]
pub struct AngleProps {
    pub area: f64,
    /// Inertia about the geometric axis parallel to the SHORT leg (the long leg bends).
    pub i_par_short: f64,
    /// Inertia about the geometric axis parallel to the LONG leg.
    pub i_par_long: f64,
    /// Principal inertias, major and minor.
    pub i_major: f64,
    pub i_minor: f64,
    /// Shear centre (leg mid-line intersection) relative to the centroid, in principal axes.
    pub xo: f64,
    pub yo: f64,
    /// St Venant constant Σ b·t³/3 over the mid-line legs.
    pub j: f64,
}

/// Properties of one angle from its legs and thickness (m).
pub fn angle_props(bl: f64, bs: f64, t: f64) -> AngleProps {
    // Corner at the origin, long leg along +y (vertical), short leg along +x.
    // Rectangles: long leg t × bl, short leg (bs − t) × t.
    let a1 = t * bl;
    let a2 = (bs - t) * t;
    let area = a1 + a2;
    let (x1, y1) = (t / 2.0, bl / 2.0);
    let (x2, y2) = (t + (bs - t) / 2.0, t / 2.0);
    let xc = (a1 * x1 + a2 * x2) / area;
    let yc = (a1 * y1 + a2 * y2) / area;
    // About centroidal axes parallel to the legs.
    let ixx = t * bl.powi(3) / 12.0 + a1 * (y1 - yc).powi(2) + (bs - t) * t.powi(3) / 12.0 + a2 * (y2 - yc).powi(2);
    let iyy = bl * t.powi(3) / 12.0 + a1 * (x1 - xc).powi(2) + t * (bs - t).powi(3) / 12.0 + a2 * (x2 - xc).powi(2);
    let ixy = a1 * (x1 - xc) * (y1 - yc) + a2 * (x2 - xc) * (y2 - yc);
    let avg = 0.5 * (ixx + iyy);
    let rad = (0.25 * (ixx - iyy).powi(2) + ixy * ixy).sqrt();
    let (i_major, i_minor) = (avg + rad, avg - rad);
    // Principal directions: the major-axis angle θ with tan 2θ = −2Ixy/(Ixx − Iyy).
    let theta = 0.5 * (-2.0 * ixy).atan2(ixx - iyy);
    let (c, sn) = (theta.cos(), theta.sin());
    // Shear centre at the mid-line intersection (t/2, t/2), relative to the centroid.
    let (dx, dy) = (t / 2.0 - xc, t / 2.0 - yc);
    // Coordinates in the principal frame (u along the major axis direction).
    let xo = dx * c + dy * sn;
    let yo = -dx * sn + dy * c;
    let j = ((bl - t / 2.0) + (bs - t / 2.0)) * t.powi(3) / 3.0;
    AngleProps { area, i_par_short: ixx, i_par_long: iyy, i_major, i_minor, xo, yo, j }
}

/// One angle's properties for the checks, and the area that multiplies Fcr.
///
/// Sharp corners are NOT a bound on a rolled angle: the root fillet adds area, the toe
/// radii remove material far from the axes, so a rolled L 100×100×10 has A = 19,2 cm²
/// (sharp: 19,0) and I = 177 cm⁴ (sharp: 180,0). So when the catalogue's area and
/// geometric inertias are given, every sharp-corner inertia (geometric and principal) is
/// scaled by the smallest ratio catalogue/sharp (≤ 1); radii of gyration use the LARGER
/// area and the strength the SMALLER one — each the conservative side.
pub fn angle_section(a: &AngleData) -> (AngleProps, f64) {
    let mut p = angle_props(a.leg_long, a.leg_short, a.t);
    let mut k: f64 = 1.0;
    if let Some(il) = a.i_par_long.filter(|v| *v > 0.0) {
        k = k.min(il / p.i_par_long);
    }
    if let Some(is) = a.i_par_short.filter(|v| *v > 0.0) {
        k = k.min(is / p.i_par_short);
    }
    p.i_par_long *= k;
    p.i_par_short *= k;
    p.i_major *= k;
    p.i_minor *= k;
    let a_cat = a.area.filter(|v| *v > 0.0).unwrap_or(p.area);
    let strength_area = a_cat.min(p.area);
    p.area = a_cat.max(p.area);
    (p, strength_area)
}

/// §E.5 (single angles) and §E.6 / E.4(a) (double angles in contact or with fillers).
fn angle_compression<T: Real>(m: &Cirsoc301MemberData, shape: Shape, st: &mut Steps) -> Result<CompressionCap<T>, Refusal> {
    let Some(ang) = &m.angle else {
        return Err(refuse("angleData", &[]));
    };
    let (bl, bs, t) = (ang.leg_long, ang.leg_short, ang.t);
    if !(bl > 0.0 && bs > 0.0 && t > 0.0 && bl >= bs && 2.0 * t < bs) {
        return Err(refuse("angleData", &[]));
    }
    let (fy, e) = (m.fy, m.e);
    let g = m.g.unwrap_or(G_CIRSOC);
    let (p, a_strength) = angle_section(ang);
    let kx = m.kx.unwrap_or(1.0);
    let ky = m.ky.unwrap_or(1.0);
    let l = m.l;
    st.push("e.title", &[]);
    if shape == Shape::SingleAngle {
        let cond = ang.end_condition.as_deref().ok_or_else(|| refuse("e5Condition", &[]))?;
        let area = p.area;
        let r_min = (p.i_minor / area).sqrt();
        let r_long = (p.i_par_long / area).sqrt(); // about the axis parallel to the long leg
        let r_short = (p.i_par_short / area).sqrt();
        st.push(
            "e.angleProps",
            &[
                ("A", n(area * 1e6, 0)),
                ("rx", n(r_long * 1000.0, 1)),
                ("ry", n(r_short * 1000.0, 1)),
                ("rz", n(r_min * 1000.0, 1)),
            ],
        );
        let klr: T = match cond {
            "concentric" => {
                // E.5, axially loaded: the largest slenderness about the geometric axes and
                // the weak principal axis. The member's K applies to every axis (the larger).
                let k = kx.max(ky);
                let v = (k * l) / r_min.min(r_long).min(r_short);
                st.push("e.e5Concentric", &[("KLr", n(v, 1))]);
                ex(v)
            }
            "e5aLong" | "e5aShort" | "e5bLong" | "e5bShort" => {
                let long = cond.ends_with("Long");
                let ratio = bl / bs;
                if !long && ratio >= 1.7 {
                    return Err(refuse("e5Ratio", &[("ratio", n(ratio, 2))]));
                }
                // rx: geometric axis parallel to the connected leg.
                let rx = if long { r_long } else { r_short };
                let lr = l / rx;
                let a_case = cond.starts_with("e5a");
                let mut v = if a_case {
                    if lr <= 80.0 { 72.0 + 0.75 * lr } else { (32.0 + 1.25 * lr).min(200.0) }
                } else if lr <= 75.0 {
                    60.0 + 0.80 * lr
                } else {
                    (45.0 + lr).min(200.0)
                };
                let eq = match (a_case, lr <= if a_case { 80.0 } else { 75.0 }) {
                    (true, true) => "E.5.1",
                    (true, false) => "E.5.2",
                    (false, true) => "E.5.3",
                    (false, false) => "E.5.4",
                };
                st.push("e.e5Effective", &[("Lr", n(lr, 1)), ("KLrm", n(v, 1)), ("eq", s(eq))]);
                if !long && bl > bs {
                    let add = if a_case { 4.0 } else { 6.0 } * (ratio * ratio - 1.0);
                    let floor = if a_case { 0.95 } else { 0.82 } * l / r_min;
                    v = (v + add).max(floor);
                    st.push("e.e5Short", &[("add", n(add, 2)), ("floor", n(floor, 1)), ("KLrm", n(v, 1))]);
                }
                ex(v)
            }
            other => return Err(refuse("e5ConditionUnknown", &[("cond", s(other))])),
        };
        let fe = q(pi2::<T>() * ex(e), klr * klr);
        st.push("e.euler", &[("Fe", n(fe.mid(), 1))]);
        let fq1 = fcr_of(fy, ex(1.0), fe);
        let qr = slender_reduction(m, shape, fq1, area, st)?;
        let qv = qr.q;
        if qr.slender {
            st.push("e.slenderQ", &[("Qs", n(qr.qs.mid(), 3)), ("Qa", n(qr.qa.mid(), 3)), ("Q", n(qv.mid(), 3))]);
        } else {
            st.push("e.compactQ", &[]);
        }
        let fcr_flex = fcr_of(fy, qv, fe);
        let lam_q = (qv * q(ex::<T>(fy), fe)).sqrt();
        st.push(
            if lam_q.mid() <= 1.5 { "e.fcrInelastic" } else { "e.fcrElastic" },
            &[("lam", n(lam_q.mid(), 3)), ("Fcr", n(fcr_flex.mid(), 1)), ("clause", s(if qr.unit { "E.3" } else { "E.7" }))],
        );
        // E.4 flexural-torsional buckling of the angle, about its principal axes (x major,
        // y minor), Cw = 0 (lowers Fez: conservative). Evaluated on both E.5 paths.
        let ro2 = p.xo * p.xo + p.yo * p.yo + (p.i_major + p.i_minor) / area;
        let fex: T = q(pi2::<T>() * ex(e), ex::<T>((kx.max(ky) * l).powi(2) * area / p.i_major));
        let fey: T = q(pi2::<T>() * ex(e), ex::<T>((kx.max(ky) * l).powi(2) * area / p.i_minor));
        let fez: T = q(ex::<T>(g) * ex(p.j), ex::<T>(area) * ex(ro2));
        let fe_t: T = if (bl - bs).abs() <= 1e-12 * bl {
            // Equal legs: symmetric about the major principal axis (E.4(b.2)), with the
            // symmetry axis's flexural Fe and Fez.
            let hh = ex::<T>(1.0) - ex::<T>((p.xo * p.xo + p.yo * p.yo) / ro2);
            let v = ftb_combine(fex, fez, hh);
            st.push("e.e4AngleSym", &[("Fex", n(fex.mid(), 1)), ("Fez", n(fez.mid(), 1)), ("H", n(hh.mid(), 3)), ("Fe", n(v.mid(), 1))]);
            v
        } else {
            let v = ftb_cubic::<T>(fex, fey, fez, p.xo * p.xo / ro2, p.yo * p.yo / ro2);
            st.push("e.e4AngleAsym", &[("Fex", n(fex.mid(), 1)), ("Fey", n(fey.mid(), 1)), ("Fez", n(fez.mid(), 1)), ("Fe", n(v.mid(), 1))]);
            v
        };
        if !(fe_t.mid() > 0.0) {
            return Err(refuse("e4Cubic", &[]));
        }
        let ft = fcr_of(fy, qv, fe_t);
        st.push("e.e4Fcr", &[("Fcr", n(ft.mid(), 1))]);
        let gov = ft.mid() < fcr_flex.mid();
        if gov {
            st.push("e.e4Governs", &[("Fcr", n(ft.mid(), 1))]);
        }
        let fcr = fcr_flex.min(ft);
        return Ok(pn_from_fcr(a_strength, fcr, fe, klr, qv, if gov { "E.4" } else { "E.5" }, st));
    }

    // ── Double angle: two equal angles back to back. ──
    let back = ang.back_to_back.as_deref().unwrap_or("long");
    if back != "long" && back != "short" {
        return Err(refuse("angleData", &[]));
    }
    let gap = ang.gap.unwrap_or(0.0);
    if !(gap >= 0.0) {
        return Err(refuse("angleData", &[]));
    }
    let a_sp = ang.connector_spacing.filter(|v| *v > 0.0).ok_or_else(|| refuse("e6Spacing", &[]))?;
    let conn = ang.connector.as_deref().ok_or_else(|| refuse("e6Connector", &[]))?;
    if conn != "snugBolts" && conn != "welded" {
        return Err(refuse("e6Connector", &[]));
    }
    let area = 2.0 * p.area;
    // Axis x: the material axis (through both centroids, perpendicular to the backs' plane
    // normal); the angles bend about their own axes parallel to the outstanding legs' ...
    // Concretely: backs in a vertical plane; y vertical (symmetry, free axis), x horizontal.
    // With the long legs back to back, the long legs are vertical: Ix = 2·I(parallel to short leg).
    let (i_x1, i_y1, dist_back) = if back == "long" {
        // y-direction offset: centroid distance from the back = x̄ measured perpendicular to
        // the long leg (the back face is the outer face of the long leg).
        let xbar = centroid_from_back(bl, bs, t, true);
        (p.i_par_short, p.i_par_long, xbar)
    } else {
        let xbar = centroid_from_back(bl, bs, t, false);
        (p.i_par_long, p.i_par_short, xbar)
    };
    let ix = 2.0 * i_x1;
    let d = dist_back + gap / 2.0;
    let iy = 2.0 * (i_y1 + p.area * d * d);
    let rx = (ix / area).sqrt();
    let ry = (iy / area).sqrt();
    let ri = (p.i_minor / p.area).sqrt();
    let klrx = kx * l / rx;
    let klr_o = ky * l / ry;
    let a_ri = a_sp / ri;
    // E.6.2.1: modified slenderness about the free axis y.
    let contact = gap <= 1e-9;
    let (klr_m, eq) = if conn == "snugBolts" {
        ((klr_o * klr_o + a_ri * a_ri).sqrt(), "E.6.1")
    } else if a_ri <= 20.0 {
        (klr_o, "E.6.2a")
    } else {
        let ki = if contact { 0.50 } else { 0.86 };
        ((klr_o * klr_o + (ki * a_ri).powi(2)).sqrt(), "E.6.2b")
    };
    st.push(
        "e.doubleAngle",
        &[
            ("A", n(area * 1e6, 0)),
            ("rx", n(rx * 1000.0, 1)),
            ("ry", n(ry * 1000.0, 1)),
            ("ri", n(ri * 1000.0, 1)),
            ("KLrx", n(klrx, 1)),
            ("KLro", n(klr_o, 1)),
            ("ari", n(a_ri, 1)),
            ("KLrm", n(klr_m, 1)),
            ("eq", s(eq)),
        ],
    );
    // E.6.2.2(a)(3) / (b)(3): a/ri ≤ 3/4 of the governing slenderness.
    let governing = klrx.max(klr_m);
    if a_ri > 0.75 * governing {
        return Err(refuse("e6SpacingTooLarge", &[("ari", n(a_ri, 1)), ("lim", n(0.75 * governing, 1))]));
    }
    let klr_v = governing;
    let klr: T = ex(klr_v);
    let fe = q(pi2::<T>() * ex(e), klr * klr);
    st.push("e.euler", &[("Fe", n(fe.mid(), 1))]);
    let fq1 = fcr_of(fy, ex(1.0), fe);
    let qr = slender_reduction(m, shape, fq1, area, st)?;
    let qv = qr.q;
    if qr.slender {
        st.push("e.slenderQ", &[("Qs", n(qr.qs.mid(), 3)), ("Qa", n(qr.qa.mid(), 3)), ("Q", n(qv.mid(), 3))]);
    } else {
        st.push("e.compactQ", &[]);
    }
    let fcr_flex = fcr_of(fy, qv, fe);
    let lam_q = (qv * q(ex::<T>(fy), fe)).sqrt();
    st.push(
        if lam_q.mid() <= 1.5 { "e.fcrInelastic" } else { "e.fcrElastic" },
        &[("lam", n(lam_q.mid(), 3)), ("Fcr", n(fcr_flex.mid(), 1)), ("clause", s(if qr.unit { "E.3" } else { "E.7" }))],
    );
    // E.4(a) (E.4.2, E.4.3): Fcry from E.3 about the symmetry axis with (kL/r)m (also for
    // continuous contact, where the clause allows kL/ry: the larger slenderness is the
    // conservative reading), Fcrz = G·J/(Ag·ro²), xo = 0 and Cw = 0 (Observación).
    // The shear centre lies on the symmetry axis y at the backs' plane level of the legs'
    // intersection; yo = distance from the centroid to that point.
    let yo = centroid_offset_y(bl, bs, t, back == "long");
    let ro2 = yo * yo + (ix + iy) / area;
    let hh = 1.0 - yo * yo / ro2;
    let fcry = fcr_of(fy, ex(1.0), q(pi2::<T>() * ex(e), ex::<T>(klr_m * klr_m)));
    let fcrz: T = q(ex::<T>(g) * ex(2.0 * p.j), ex::<T>(area) * ex(ro2));
    let ft = if qr.unit {
        let v = ftb_combine(fcry, fcrz, ex(hh));
        st.push("e.e4Tee", &[("Fcry", n(fcry.mid(), 1)), ("Fcrz", n(fcrz.mid(), 1)), ("Fcr", n(v.mid(), 1))]);
        v
    } else {
        // Slender legs: E.4(b.2) with Fe into E.7.2a/E.7.3a.
        let fey = q(pi2::<T>() * ex(e), ex::<T>(klr_m * klr_m));
        let fez = fcrz;
        let fe2 = ftb_combine(fey, fez, ex(hh));
        let v = fcr_of(fy, qv, fe2);
        st.push("e.e4Ftb", &[("Fes", n(fey.mid(), 1)), ("Fez", n(fez.mid(), 1)), ("Fe", n(fe2.mid(), 1))]);
        v
    };
    let gov = ft.mid() < fcr_flex.mid();
    if gov {
        st.push("e.e4Governs", &[("Fcr", n(ft.mid(), 1))]);
    }
    let fcr = fcr_flex.min(ft);
    Ok(pn_from_fcr(2.0 * a_strength, fcr, fe, klr, qv, if gov { "E.4" } else { "E.6" }, st))
}

/// Distance from the back face (outer face of the leg placed against the other angle) to
/// the angle's centroid, m. `long_back`: the long leg is the one against the other angle.
fn centroid_from_back(bl: f64, bs: f64, t: f64, long_back: bool) -> f64 {
    // The back leg lies along the back face; the outstanding leg projects from it.
    let (back, out) = if long_back { (bl, bs) } else { (bs, bl) };
    let a1 = back * t;
    let a2 = (out - t) * t;
    (a1 * t / 2.0 + a2 * (t + (out - t) / 2.0)) / (a1 + a2)
}

/// Distance along the symmetry axis from the double angle's centroid to the shear centre
/// (the outstanding legs' mid-line), m.
fn centroid_offset_y(bl: f64, bs: f64, t: f64, long_back: bool) -> f64 {
    // Along the backs, measured from the outstanding leg's outer face.
    let (back, out) = if long_back { (bl, bs) } else { (bs, bl) };
    let a1 = back * t; // back leg, spans 0..back along the symmetry axis
    let a2 = (out - t) * t; // outstanding leg, at 0..t
    let yc = (a1 * back / 2.0 + a2 * t / 2.0) / (a1 + a2);
    (yc - t / 2.0).abs()
}

/// E.4(b.3): the least root of
///   (Fe − Fex)(Fe − Fey)(Fe − Fez) − Fe²(Fe − Fey)(xo/ro)² − Fe²(Fe − Fex)(yo/ro)² = 0.
///
/// The roots are the eigenvalues of a definite pencil; Courant–Fischer on the (u, v)
/// sub-pencil puts the second root at or above min(Fex, Fey), and the Rayleigh quotients
/// on the unit vectors put the first at or below min(Fex, Fey, Fez). So on (0, m),
/// m = min(Fex, Fey, Fez), the cubic (negative at 0) has exactly one root — the least —
/// found by bisection, and certified on intervals by a sign-checked bracket.
fn ftb_cubic<T: Real>(fex: T, fey: T, fez: T, x2: f64, y2: f64) -> T {
    let (a, b, c) = (fex.mid(), fey.mid(), fez.mid());
    let f64f = move |f: f64| (f - a) * (f - b) * (f - c) - f * f * (f - b) * x2 - f * f * (f - a) * y2;
    let gen = move |f: T| {
        (f - fex) * (f - fey) * (f - fez) - f * f * (f - fey) * T::exact(x2) - f * f * (f - fex) * T::exact(y2)
    };
    let hi = a.min(b).min(c);
    if !(hi > 0.0) {
        return T::exact(f64::NAN);
    }
    T::increasing_root(f64f, gen, 0.0, hi)
}

// ==================== §F Flexure ====================

pub struct FlexureCap<T> {
    pub phi_mn: T,
    pub mp: T,
    pub mn: T,
    pub lp: f64,
    pub lr: f64,
    pub clause: &'static str,
}

struct LimitState<T> {
    name: &'static str,
    mn: T,
}

fn govern<T: Real>(states: &[LimitState<T>], st: &mut Steps) -> (T, &'static str) {
    let mut v = states[0].mn;
    let mut name = states[0].name;
    let mut best = states[0].mn.mid();
    for s_ in states {
        st.push("f.limitState", &[("name", s(s_.name)), ("Mn", n(s_.mn.mid(), 2))]);
    }
    for s_ in &states[1..] {
        if s_.mn.mid() < best {
            best = s_.mn.mid();
            name = s_.name;
        }
        v = v.min(s_.mn);
    }
    (v, name)
}

fn sx_of(m: &Cirsoc301MemberData) -> f64 {
    m.sx.unwrap_or(m.i_strong / (m.h / 2.0))
}

fn zx_of(m: &Cirsoc301MemberData) -> f64 {
    m.zx.unwrap_or_else(|| {
        let hw = m.h - 2.0 * m.tf;
        m.b * m.tf * (m.h - m.tf) + m.tw * hw * hw / 4.0
    })
}

fn zy_of(m: &Cirsoc301MemberData) -> f64 {
    m.zy.unwrap_or_else(|| {
        let hw = m.h - 2.0 * m.tf;
        m.tf * m.b * m.b / 2.0 + hw * m.tw * m.tw / 4.0
    })
}

fn sy_of(m: &Cirsoc301MemberData) -> f64 {
    m.sy.unwrap_or(m.i_weak / (m.b / 2.0))
}

/// §F.2.2 — LTB of compact doubly symmetric I and channels, X1/X2 form with load height.
fn ltb_f22<T: Real>(m: &Cirsoc301MemberData, mp: T, fl: f64, st: &mut Steps) -> Result<(T, f64, f64), Refusal> {
    let (fy, e) = (m.fy, m.e);
    let g = m.g.unwrap_or(G_CIRSOC);
    let top = m.load_position.as_deref().unwrap_or("topFlange") == "topFlange";
    let a = m.a * 1e6;
    let iy = m.i_weak * 1e12;
    let sx = sx_of(m) * 1e9;
    let ry: T = q(ex::<T>(iy), ex(a)).sqrt();
    let lb = m.lb * 1000.0;
    let cb = m.cb.unwrap_or(1.0);
    let cbt: T = ex(cb);
    match m.load_position.as_deref() {
        Some(_) => st.push(if top { "f.loadTop" } else { "f.loadWeb" }, &[]),
        None => st.push("f.loadUnknown", &[]),
    }
    match m.cb {
        Some(c) => st.push("f.cbComputed", &[("Cb", n(c, 3))]),
        None => st.push("f.cbDefault", &[]),
    }
    let lp: T = lit::<T>(if top { 1.59 } else { 1.76 }) * ry * q(ex::<T>(e), ex(fy)).sqrt();
    st.push("f.lp", &[("ry", n(ry.mid(), 1)), ("coef", s(if top { "1,59" } else { "1,76" })), ("Lp", n(lp.mid(), 0)), ("eq", s(if top { "F.2.5b" } else { "F.2.5a" }))]);
    st.push("f.lb", &[("Lb", n(lb, 0))]);
    let lbt: T = ex(lb);
    let plateau = lbt.le(lp);
    if plateau == Tri::True {
        st.push("f.plateau", &[("Mp", n(mp.mid(), 2))]);
        return Ok((mp, lp.mid() / 1000.0, lp.mid() / 1000.0));
    }
    let j = m.j.unwrap_or(0.0) * 1e12;
    if !(j > 0.0) {
        return Err(refuse("ltbNoJ", &[]));
    }
    let (et, gt, jt, at, sxt, iyt) = (ex::<T>(e), ex::<T>(g), ex::<T>(j), ex::<T>(a), ex::<T>(sx), ex::<T>(iy));
    let x1 = q(T::pi(), sxt) * q(et * gt * jt * at, ex(2.0)).sqrt();
    let cw = m.cw.unwrap_or(0.0) * 1e18;
    let x2: T = if cw > 0.0 { q(ex::<T>(4.0) * ex(cw), iyt) * (q(sxt, gt * jt)).sq() } else { ex(0.0) };
    let flt: T = ex(fl);
    let lr: T = if top {
        lit::<T>(1.28) * ry * q(x1, flt)
    } else {
        q(ry * x1, flt) * (ex::<T>(1.0) + (ex::<T>(1.0) + x2 * flt * flt).sqrt()).sqrt()
    };
    let mr = flt * sxt.dv(lit(1e6));
    st.push("f.x1", &[("X1", n(x1.mid(), 0)), ("X2", n(x2.mid(), 9)), ("cw", s(if cw > 0.0 { "yes" } else { "no" }))]);
    st.push("f.lr", &[("FL", n(fl, 0)), ("Lr", n(lr.mid(), 0)), ("Mr", n(mr.mid(), 2)), ("eq", s(if top { "F.2.6b" } else { "F.2.6a" }))]);
    let inel = || (cbt * (mp - (mp - mr) * q(lbt - lp, lr - lp))).min(mp);
    let elastic = || {
        let lr_ = q(lbt, ry);
        let mcr = if top {
            lit::<T>(1.28) * cbt * sxt * q(x1, lr_)
        } else {
            q(cbt * sxt * x1 * ex::<T>(2.0).sqrt(), lr_) * (ex::<T>(1.0) + q(x1 * x1 * x2, ex::<T>(2.0) * lr_ * lr_)).sqrt()
        };
        (mcr.dv(lit(1e6))).min(mp)
    };
    let c2 = lbt.le(lr);
    let mn = branch(plateau, || mp, || branch(c2, inel, elastic));
    if c2 != Tri::False {
        st.push("f.ltbInelastic", &[("Mn", n(mn.mid(), 2))]);
    } else {
        st.push("f.ltbElastic", &[("Mn", n(mn.mid(), 2)), ("eq", s(if top { "F.2.4b" } else { "F.2.4a" }))]);
    }
    Ok((mn, lp.mid() / 1000.0, lr.mid() / 1000.0))
}

/// rt of F.4.10 (I) or F.4.11 (channel), mm.
fn rt_of<T: Real>(m: &Cirsoc301MemberData, channel: bool) -> Option<T> {
    let (d, bf, tf, tw) = (m.h * 1000.0, m.b * 1000.0, m.tf * 1000.0, m.tw * 1000.0);
    let hw = web_clear_height_mm(m);
    let ho = d - tf;
    if channel {
        let cw = m.cw.unwrap_or(0.0) * 1e18;
        if !(cw > 0.0) {
            return None;
        }
        return Some(q((ex::<T>(m.i_weak * 1e12) * ex(cw)).sqrt(), ex(sx_of(m) * 1e9)).sqrt());
    }
    let aw: T = q(ex::<T>(hw) * ex(tw), ex::<T>(bf) * ex(tf));
    let inner = q(ex::<T>(ho), ex(d)) + aw * q(ex::<T>(hw) * ex(hw), ex::<T>(6.0) * ex(ho) * ex(d));
    Some(q(ex::<T>(bf), (ex::<T>(12.0) * inner).sqrt()))
}

fn strong_axis_flexure<T: Real>(m: &Cirsoc301MemberData, channel: bool, st: &mut Steps) -> Result<FlexureCap<T>, (Refusal, &'static str)> {
    let (fy, e) = (m.fy, m.e);
    let (d, bf, tf, tw) = (m.h * 1000.0, m.b * 1000.0, m.tf * 1000.0, m.tw * 1000.0);
    let hw = web_clear_height_mm(m);
    let ho = d - tf;
    let sx = sx_of(m) * 1e9;
    let zx = zx_of(m) * 1e9;
    let fr = if built_up(m) { FR_WELDED } else { FR_ROLLED };
    let fl = fy - fr;
    let sq_ef = (e / fy).sqrt();
    let kc = kc_of(hw, tw);
    let (fyt, sxt) = (ex::<T>(fy), ex::<T>(sx));

    // F.2.1: Mp = Fy Zx ≤ 1,5 My.
    let mp_unc = fyt * ex::<T>(zx).dv(lit(1e6));
    let my = fyt * sxt.dv(lit(1e6));
    let mp = mp_unc.min(lit::<T>(1.5) * my);
    st.push("f.moduli", &[("Zx", n(zx, 0)), ("Sx", n(sx, 0))]);
    st.push(
        if 1.5 * my.mid() < mp_unc.mid() { "f.mpCapped" } else { "f.mpPlastic" },
        &[("Mp", n(mp.mid(), 2)), ("ratio", n(zx / sx, 3))],
    );

    // Tabla B.4.1b.
    let lam_f = if channel { bf / tf } else { bf / (2.0 * tf) };
    let lam_pf = 0.38 * sq_ef;
    let lam_rf = if built_up(m) { 0.95 * (kc * e / fl).sqrt() } else { 0.83 * (e / (0.7 * fy)).sqrt() };
    let lam_w = hw / tw;
    let lam_pw = 3.76 * sq_ef;
    let lam_rw = 5.70 * sq_ef;
    let fclass = if lam_f <= lam_pf { "compact" } else if lam_f <= lam_rf { "noncompact" } else { "slender" };
    let wclass = if lam_w <= lam_pw { "compact" } else if lam_w <= lam_rw { "noncompact" } else { "slender" };
    st.push("f.flangeClass", &[("lam", n(lam_f, 2)), ("lamP", n(lam_pf, 2)), ("lamR", n(lam_rf, 2)), ("cls", s(fclass)), ("case", n(if built_up(m) { 12.0 } else { 11.0 }, 0))]);
    st.push("f.webClass", &[("lam", n(lam_w, 1)), ("lamP", n(lam_pw, 1)), ("lamR", n(lam_rw, 1)), ("cls", s(wclass))]);

    let flt: T = ex(fl);
    let flb = |mmax: T| -> Option<LimitState<T>> {
        if lam_f <= lam_pf {
            return None;
        }
        if lam_f <= lam_rf {
            let mr = flt * sxt.dv(lit(1e6));
            return Some(LimitState { name: "flbNoncompact", mn: mmax - (mmax - mr) * ex::<T>((lam_f - lam_pf) / (lam_rf - lam_pf)) });
        }
        let k: T = if built_up(m) || wclass != "compact" { lit::<T>(0.9) * ex(kc) } else { lit(0.69) };
        Some(LimitState { name: "flbSlender", mn: k * ex::<T>(e) * q(sxt, ex(lam_f * lam_f)).dv(lit(1e6)) })
    };

    if wclass == "compact" {
        let clause = if fclass == "compact" { "F.2" } else { "F.3" };
        let (mn_ltb, lp, lr) = ltb_f22(m, mp, fl, st).map_err(|r| (r, clause))?;
        let mut states = vec![LimitState { name: if fclass == "compact" { "plasticLtb" } else { "ltb" }, mn: mn_ltb }];
        if let Some(f) = flb(mp) {
            states.push(f);
        }
        let (mn, name) = govern(&states, st);
        st.push("f.governs", &[("clause", s(clause)), ("name", s(name)), ("Mn", n(mn.mid(), 2))]);
        return Ok(FlexureCap { phi_mn: lit::<T>(PHI_B) * mn, mp, mn, lp, lr, clause });
    }

    let lb = m.lb * 1000.0;
    let lbt: T = ex(lb);
    let cbt: T = ex(m.cb.unwrap_or(1.0));
    let (et, sq_eft) = (ex::<T>(e), q(ex::<T>(e), ex(fy)).sqrt());

    if wclass == "noncompact" {
        // §F.4 (doubly symmetric: Sxc = Sxt, Iyc/Iy = 0,5).
        let myc = my;
        let mpmyc = q(mp, myc);
        let rpc = (mpmyc - (mpmyc - ex(1.0)) * ex::<T>((lam_w - lam_pw) / (lam_rw - lam_pw))).min(mpmyc);
        let rm = rpc * myc;
        st.push("f.f4Rpc", &[("Myc", n(myc.mid(), 2)), ("Rpc", n(rpc.mid(), 3)), ("RM", n(rm.mid(), 2))]);
        let mut states = vec![LimitState { name: "compressionFlangeYield", mn: rm }];
        let Some(rt) = rt_of::<T>(m, channel) else {
            return Err((refuse("f4NoCw", &[]), "F.4"));
        };
        let j = m.j.unwrap_or(0.0) * 1e12;
        let c: T = if channel {
            match m.c {
                Some(c) => ex(c),
                None => ex::<T>(ho / 2.0) * q(ex::<T>(m.i_weak * 1e12), ex(m.cw.unwrap_or(0.0) * 1e18)).sqrt(),
            }
        } else {
            ex(1.0)
        };
        let jt = q(c * ex(j), ex::<T>(sx) * ex(ho));
        let lp = lit::<T>(1.10) * rt * sq_eft;
        let lr = lit::<T>(1.95) * rt * q(et, flt) * (jt + (jt * jt + lit::<T>(6.76) * (q(flt, et)).sq()).sqrt()).sqrt();
        st.push("f.f4Lengths", &[("rt", n(rt.mid(), 1)), ("Lp", n(lp.mid(), 0)), ("Lr", n(lr.mid(), 0)), ("Lb", n(lb, 0)), ("eq", s(if channel { "F.4.11" } else { "F.4.10" }))]);
        let past = lp.lt(lbt);
        if past != Tri::False {
            let mr = flt * sxt.dv(lit(1e6));
            let mltb = branch(
                lbt.le(lr),
                || (cbt * (rm - (rm - mr) * q(lbt - lp, lr - lp))).min(rm),
                || {
                    let lr2 = (q(lbt, rt)).sq();
                    let fcr = q(cbt * pi2::<T>() * et, lr2) * (ex::<T>(1.0) + lit::<T>(0.078) * jt * lr2).sqrt();
                    (fcr * sxt.dv(lit(1e6))).min(rm)
                },
            );
            // Undecided Lb vs Lp: the hull with RM (plateau) — the min below keeps it sound.
            let mltb = branch(past, || mltb, || rm.hull(mltb));
            states.push(LimitState { name: "ltb", mn: mltb });
        }
        if let Some(f) = flb(rm) {
            states.push(f);
        }
        let (mn, name) = govern(&states, st);
        st.push("f.governsF4", &[("name", s(name)), ("Mn", n(mn.mid(), 2))]);
        return Ok(FlexureCap { phi_mn: lit::<T>(PHI_B) * mn, mp, mn, lp: lp.mid() / 1000.0, lr: lr.mid() / 1000.0, clause: "F.4" });
    }

    // §F.5 — slender web.
    if channel {
        return Err((refuse("f5Channel", &[]), "F.5"));
    }
    let aw = hw * tw / (bf * tf);
    if aw > 10.0 {
        return Err((refuse("f5Aw", &[("aw", n(aw, 2))]), "F.5"));
    }
    let rt: T = rt_of::<T>(m, false).expect("I-section rt");
    let lp = lit::<T>(1.10) * rt * sq_eft;
    let lr = T::pi() * rt * q(et, ex(fy - fr)).sqrt();
    let fy_t: T = ex(fy);
    let frt: T = ex(fr);
    let fcr_ltb = branch(
        lr.lt(lbt),
        || (q(lit::<T>(1_970_000.0) * cbt, (q(lbt, rt)).sq())).min(fy_t),
        || branch(lp.lt(lbt), || (cbt * (fy_t - (fy_t - frt) * q(lbt - lp, lr - lp))).min(fy_t), || fy_t),
    );
    let lam_rf12 = 0.95 * (kc * e / fl).sqrt();
    let fcr_flb: T = if lam_f > lam_rf12 {
        (q(lit::<T>(0.9) * et * ex(kc), ex(lam_f * lam_f))).min(fy_t)
    } else if lam_f > lam_pf {
        fy_t - (fy_t - flt) * ex::<T>((lam_f - lam_pf) / (lam_rf12 - lam_pf))
    } else {
        fy_t
    };
    let fcrf = fcr_ltb.min(fcr_flb);
    let awt: T = ex(aw);
    let rpg = (ex::<T>(1.0) - q(awt, lit::<T>(1200.0) + lit::<T>(300.0) * awt) * (ex::<T>(lam_w) - lit::<T>(5.70) * q(et, fcrf).sqrt())).min(ex(1.0));
    let sxm = sxt.dv(lit(1e6));
    let states = vec![
        LimitState { name: "compressionFlangeYield", mn: rpg * fy_t * sxm },
        LimitState { name: "ltb", mn: rpg * fcr_ltb * sxm },
        LimitState { name: "flb", mn: rpg * fcr_flb * sxm },
    ];
    st.push("f.f5", &[("aw", n(aw, 3)), ("rt", n(rt.mid(), 1)), ("Lp", n(lp.mid(), 0)), ("Lr", n(lr.mid(), 0)), ("Lb", n(lb, 0))]);
    st.push("f.f5Fcr", &[("FcrLtb", n(fcr_ltb.mid(), 1)), ("FcrFlb", n(fcr_flb.mid(), 1)), ("Rpg", n(rpg.mid(), 3))]);
    let (mn, name) = govern(&states, st);
    st.push("f.governs", &[("clause", s("F.5")), ("name", s(name)), ("Mn", n(mn.mid(), 2))]);
    Ok(FlexureCap { phi_mn: lit::<T>(PHI_B) * mn, mp, mn, lp: lp.mid() / 1000.0, lr: lr.mid() / 1000.0, clause: "F.5" })
}

/// §F.6 — minor-axis bending of I and channels.
fn weak_axis_flexure<T: Real>(m: &Cirsoc301MemberData, channel: bool, st: &mut Steps) -> FlexureCap<T> {
    let (fy, e) = (m.fy, m.e);
    let zy = zy_of(m) * 1e9;
    let sy = sy_of(m) * 1e9;
    let fyt: T = ex(fy);
    let mp = (fyt * ex(zy)).min(lit::<T>(1.5) * fyt * ex(sy)).dv(lit(1e6));
    st.push("f.weakModuli", &[("Zy", n(zy, 0)), ("Sy", n(sy, 0))]);
    st.push("f.weakMp", &[("Mp", n(mp.mid(), 2))]);
    st.push("f.weakNoLtb", &[]);
    let lam = if channel { m.b / m.tf } else { m.b / (2.0 * m.tf) };
    let lam_p = 0.38 * (e / fy).sqrt();
    let lam_r = 1.00 * (e / fy).sqrt();
    let mn = if lam > lam_r {
        let fcr = q(lit::<T>(0.69) * ex(e), ex(lam * lam));
        let mn = fcr * ex::<T>(sy).dv(lit(1e6));
        st.push("f.weakSlender", &[("lam", n(lam, 2)), ("lamR", n(lam_r, 2)), ("Fcr", n(fcr.mid(), 1)), ("Mn", n(mn.mid(), 2))]);
        mn
    } else if lam > lam_p {
        let mn = mp - (mp - lit::<T>(0.7) * fyt * ex::<T>(sy).dv(lit(1e6))) * ex::<T>((lam - lam_p) / (lam_r - lam_p));
        st.push("f.weakNoncompact", &[("lam", n(lam, 2)), ("lamP", n(lam_p, 2)), ("lamR", n(lam_r, 2)), ("Mn", n(mn.mid(), 2))]);
        mn
    } else {
        st.push("f.weakCompact", &[("lam", n(lam, 2)), ("lamP", n(lam_p, 2))]);
        mp
    };
    FlexureCap { phi_mn: lit::<T>(PHI_B) * mn, mp, mn, lp: 0.0, lr: 0.0, clause: "F.6" }
}

/// §F: φb·Mn about the strong (`strong = true`) or weak axis, or why it is refused (with
/// the clause that would apply).
pub fn flexure_capacity<T: Real>(m: &Cirsoc301MemberData, strong: bool, st: &mut Steps) -> Result<FlexureCap<T>, (Refusal, &'static str)> {
    st.push(if strong { "f.titleStrong" } else { "f.titleWeak" }, &[]);
    match shape_of(m.shape.as_deref()) {
        Some(Shape::I) => if strong { strong_axis_flexure(m, false, st) } else { Ok(weak_axis_flexure(m, false, st)) },
        Some(Shape::U) => if strong { strong_axis_flexure(m, true, st) } else { Ok(weak_axis_flexure(m, true, st)) },
        Some(Shape::SingleAngle) => Err((refuse("f10", &[]), "F.10")),
        Some(Shape::DoubleAngle) => Err((refuse("f9", &[]), "F.9")),
        Some(_) => Err((refuse("fShape", &[("shape", s(shape_name(m)))]), "F")),
        None => Err((unknown_shape(m), "F")),
    }
}

// ==================== §G Shear ====================

pub struct ShearCap<T> {
    pub phi_vn: T,
    pub cv: T,
    pub clause: &'static str,
}

/// §G: φv·Vn, kN. G.2 for webs; G.4 for angle legs (the shorter leg: Vu is the envelope
/// of both shear components).
pub fn shear_capacity<T: Real>(m: &Cirsoc301MemberData, st: &mut Steps) -> ShearCap<T> {
    let (fy, e) = (m.fy, m.e);
    st.push("g.title", &[]);
    let shape = shape_of(m.shape.as_deref());
    if let (Some(Shape::SingleAngle | Shape::DoubleAngle), Some(a)) = (shape, &m.angle) {
        let k = if shape == Some(Shape::DoubleAngle) { 2.0 } else { 1.0 };
        let b = a.leg_short * 1000.0;
        let t = a.t * 1000.0;
        let aw = k * b * t;
        let bt = b / t;
        let kv = 1.2;
        let lim = (kv * e / fy).sqrt();
        let btt: T = ex(bt);
        let limt: T = q(ex::<T>(kv) * ex(e), ex(fy)).sqrt();
        let cv = branch(
            btt.le(lit::<T>(1.10) * limt),
            || ex(1.0),
            || branch(btt.le(lit::<T>(1.37) * limt), || q(lit::<T>(1.10) * limt, btt), || q(lit::<T>(1.51) * ex(e) * ex(kv), btt * btt * ex(fy))),
        );
        let vn = lit::<T>(0.6) * ex::<T>(fy) * ex::<T>(aw) * cv.dv(lit(1000.0));
        let phi = lit::<T>(PHI_V) * vn;
        st.push("g.angle", &[("b", n(b, 1)), ("t", n(t, 1)), ("Aw", n(aw, 0)), ("bt", n(bt, 1)), ("lim", n(1.10 * lim, 1)), ("Cv", n(cv.mid(), 3))]);
        st.push("g.vn", &[("Fy", n(fy, 1)), ("Aw", n(aw, 0)), ("Cv", n(cv.mid(), 3)), ("Vn", n(vn.mid(), 2)), ("phiVn", n(phi.mid(), 2))]);
        return ShearCap { phi_vn: phi, cv, clause: "G.4" };
    }
    let d = m.h * 1000.0;
    let tw = m.tw * 1000.0;
    let tf = m.tf * 1000.0;
    let hw = d - 2.0 * tf;
    let aw = (if built_up(m) { hw } else { d }) * tw;
    st.push("g.web", &[("d", n(d, 1)), ("tw", n(tw, 1)), ("Aw", n(aw, 0)), ("htw", n(hw / tw, 1))]);
    let htw: T = q(ex::<T>(hw), ex(tw));
    let kv = 5.0;
    let lim: T = q(ex::<T>(kv) * ex(e), ex(fy)).sqrt();
    let c1 = htw.le(lit::<T>(1.10) * lim);
    let c2 = htw.le(lit::<T>(1.37) * lim);
    let cv = branch(
        c1,
        || ex(1.0),
        || branch(c2, || q(lit::<T>(1.10) * lim, htw), || q(lit::<T>(1.51) * ex(e) * ex(kv), htw * htw * ex(fy))),
    );
    let key = if c1 == Tri::True { "g.cv1" } else if c2 == Tri::True { "g.cvInelastic" } else { "g.cvElastic" };
    st.push(key, &[("htw", n(htw.mid(), 1)), ("lim", n((lit::<T>(1.10) * lim).mid(), 1)), ("Cv", n(cv.mid(), 3))]);
    let vn = lit::<T>(0.6) * ex::<T>(fy) * ex::<T>(aw) * cv.dv(lit(1000.0));
    let phi = lit::<T>(PHI_V) * vn;
    st.push("g.vn", &[("Fy", n(fy, 1)), ("Aw", n(aw, 0)), ("Cv", n(cv.mid(), 3)), ("Vn", n(vn.mid(), 2)), ("phiVn", n(phi.mid(), 2))]);
    ShearCap { phi_vn: phi, cv, clause: "G.2" }
}

// ==================== §H Interaction ====================

/// H.1.1a / H.1.1b on ratios already formed (axial = Pu/φPn, mx = Mux/φMnx, my = Muy/φMny).
pub fn interaction_h1<T: Real>(axial: T, mx: T, my: T) -> T {
    branch(
        lit::<T>(0.2).le(axial),
        || axial + q(ex::<T>(8.0), ex(9.0)) * (mx + my),
        || axial.dv(ex(2.0)) + mx + my,
    )
}

// ==================== Member check (f64) ====================

fn ratio_of(d: f64, cap: f64) -> f64 {
    if cap > 0.0 { d / cap } else if d > 0.0 { f64::INFINITY } else { 0.0 }
}

fn outcome(demand: f64, capacity: f64, clause: &str, values: Map<String, Value>, steps: Vec<Msg>) -> CheckOutcome {
    let ratio = ratio_of(demand, capacity);
    CheckOutcome { demand, capacity, ratio, pass: ratio <= 1.0, clause: clause.into(), not_evaluated: None, values, steps }
}

fn refused_outcome(demand: f64, capacity_if_unloaded: f64, clause: &str, reason: Msg, mut steps: Vec<Msg>) -> CheckOutcome {
    let mut params = Map::new();
    params.insert("reason".into(), serde_json::to_value(&reason).unwrap_or(Value::Null));
    steps.push(Msg { key: "c301.notEvaluated".into(), params });
    let loaded = demand > 0.0;
    CheckOutcome {
        demand,
        capacity: if loaded { 0.0 } else { capacity_if_unloaded },
        ratio: if loaded { f64::INFINITY } else { 0.0 },
        pass: !loaded,
        clause: clause.into(),
        not_evaluated: Some(reason),
        values: Map::new(),
        steps,
    }
}

fn vals(pairs: &[(&str, f64)]) -> Map<String, Value> {
    let mut m = Map::new();
    for (k, v) in pairs {
        m.insert((*k).into(), serde_json::Number::from_f64(*v).map(Value::Number).unwrap_or(Value::Null));
    }
    m
}

fn finish_steps(st: &mut Steps, demand_key: &str, demand: f64, ratio: f64) {
    st.push("demand", &[("what", s(demand_key)), ("value", n(demand, 2)), ("ratio", n(ratio, 3))]);
}

pub fn check_tension(m: &Cirsoc301MemberData, pu: f64) -> CheckOutcome {
    let mut st = Steps::new(true);
    let pu = pu.abs();
    let (phi_y, rup) = tension_capacity::<f64>(m, &mut st);
    match rup {
        Err(r) => refused_outcome(pu, phi_y, "D.2", r, st.list),
        Ok(phi_r) => {
            let phi = phi_y.min(phi_r);
            let gov = if phi == phi_y { "yield" } else { "rupture" };
            st.push("d.governs", &[("which", s(gov)), ("phiPn", n(phi, 2))]);
            let ratio = ratio_of(pu, phi);
            finish_steps(&mut st, "Pu", pu, ratio);
            outcome(pu, phi, if gov == "yield" { "D.2(a)" } else { "D.2(b)" }, vals(&[("phiPnYield", phi_y), ("phiPnRupture", phi_r)]), st.list)
        }
    }
}

pub fn check_compression(m: &Cirsoc301MemberData, pu: f64) -> CheckOutcome {
    let mut st = Steps::new(true);
    let pu = pu.abs();
    match compression_capacity::<f64>(m, &mut st) {
        Err(r) => refused_outcome(pu, 0.0, "E", r, st.list),
        Ok(c) => {
            let ratio = ratio_of(pu, c.phi_pn);
            finish_steps(&mut st, "Pu", pu, ratio);
            outcome(pu, c.phi_pn, c.clause, vals(&[("KLr", c.klr), ("Fe", c.fe), ("Fcr", c.fcr), ("Q", c.q)]), st.list)
        }
    }
}

pub fn check_flexure(m: &Cirsoc301MemberData, mu: f64, strong: bool) -> CheckOutcome {
    let mut st = Steps::new(true);
    let mu = mu.abs();
    match flexure_capacity::<f64>(m, strong, &mut st) {
        Err((r, clause)) => refused_outcome(mu, 0.0, clause, r, st.list),
        Ok(c) => {
            st.push("f.phiMn", &[("Mn", n(c.mn, 2)), ("phiMn", n(c.phi_mn, 2))]);
            let ratio = ratio_of(mu, c.phi_mn);
            finish_steps(&mut st, "Mu", mu, ratio);
            outcome(mu, c.phi_mn, c.clause, vals(&[("Mp", c.mp), ("Mn", c.mn), ("Lp", c.lp), ("Lr", c.lr)]), st.list)
        }
    }
}

pub fn check_shear(m: &Cirsoc301MemberData, vu: f64) -> CheckOutcome {
    let mut st = Steps::new(true);
    let vu = vu.abs();
    let c = shear_capacity::<f64>(m, &mut st);
    let ratio = ratio_of(vu, c.phi_vn);
    finish_steps(&mut st, "Vu", vu, ratio);
    outcome(vu, c.phi_vn, c.clause, vals(&[("Cv", c.cv)]), st.list)
}

/// H.1 with the member's own axial and flexural checks. A capacity refused under load
/// refuses the interaction.
pub fn check_interaction(m: &Cirsoc301MemberData, nu: f64, mux: f64, muy: f64) -> CheckOutcome {
    let mut st = Steps::new(true);
    let axial = if nu >= 0.0 { check_compression(m, nu) } else { check_tension(m, nu) };
    let fx = check_flexure(m, mux, true);
    let fy = check_flexure(m, muy, false);
    let pu = nu.abs();
    let refused = [(&axial, pu), (&fx, mux.abs()), (&fy, muy.abs())]
        .iter()
        .find_map(|(o, d)| if *d > 0.0 { o.not_evaluated.clone() } else { None });
    st.push("h.title", &[]);
    if let Some(r) = refused {
        let mut o = refused_outcome(1.0, 0.0, "H.1", r, st.list);
        o.demand = 0.0;
        return o;
    }
    let ar = if axial.capacity > 0.0 { pu / axial.capacity } else { 0.0 };
    let rx = ratio_of(mux.abs(), fx.capacity);
    let ry = ratio_of(muy.abs(), fy.capacity);
    let value = interaction_h1(ar, rx, ry);
    let eq = if ar >= 0.2 { "H.1.1a" } else { "H.1.1b" };
    st.push(
        if nu >= 0.0 { "h.axialCompression" } else { "h.axialTension" },
        &[("phiPn", n(axial.capacity, 2))],
    );
    st.push("h.moments", &[("phiMnx", n(fx.capacity, 2)), ("phiMny", n(fy.capacity, 2))]);
    st.push("h.axialRatio", &[("Pu", n(pu, 2)), ("phiPn", n(axial.capacity, 2)), ("ratio", n(ar, 3))]);
    st.push(
        if ar >= 0.2 { "h.eqA" } else { "h.eqB" },
        &[("ar", n(ar, 3)), ("Mux", n(mux.abs(), 2)), ("phiMnx", n(fx.capacity, 2)), ("Muy", n(muy.abs(), 2)), ("phiMny", n(fy.capacity, 2)), ("value", n(value, 3))],
    );
    st.push(if value <= 1.0 { "h.ok" } else { "h.fail" }, &[("value", n(value, 3))]);
    CheckOutcome {
        demand: value,
        capacity: 1.0,
        ratio: value,
        pass: value <= 1.0,
        clause: eq.into(),
        not_evaluated: None,
        values: vals(&[("value", value), ("axialRatio", ar)]),
        steps: st.list,
    }
}

/// Which checks a demand runs: (tension, compression, weak flexure, interaction).
pub fn checks_present(nu: f64, mux: f64, muy: f64) -> (bool, bool, bool, bool) {
    let has_axial = nu.abs() > TINY;
    let has_mx = mux.abs() > TINY;
    let has_my = muy.abs() > TINY;
    // H.1.1: axial force with flexure, and biaxial flexure on its own (H.1.1b without the
    // axial term).
    let inter = (has_axial && (has_mx || has_my)) || (has_mx && has_my);
    (nu < 0.0, nu > 0.0, has_my, inter)
}

pub fn check_member(m: &Cirsoc301MemberData, f: &Cirsoc301DesignForces) -> Cirsoc301CheckResult {
    let (nu, mux, muy, vu) = (f.nu, f.mu_strong, f.mu_weak, f.vu);
    let (t, c, w, i) = checks_present(nu, mux, muy);
    let tension = t.then(|| check_tension(m, nu));
    let compression = c.then(|| check_compression(m, nu));
    let flexure_strong = check_flexure(m, mux, true);
    let flexure_weak = w.then(|| check_flexure(m, muy, false));
    let shear = check_shear(m, vu);
    let interaction = i.then(|| check_interaction(m, nu, mux, muy));
    let mut list: Vec<(&str, &CheckOutcome)> = vec![("flexureStrong", &flexure_strong), ("shear", &shear)];
    if let Some(o) = &tension {
        list.push(("tension", o));
    }
    if let Some(o) = &compression {
        list.push(("compression", o));
    }
    if let Some(o) = &flexure_weak {
        list.push(("flexureWeak", o));
    }
    if let Some(o) = &interaction {
        list.push(("interaction", o));
    }
    let mut unity = 0.0f64;
    let mut gov = "none";
    let mut unevaluated = Vec::new();
    let mut pass = true;
    for (name, o) in &list {
        if o.not_evaluated.is_some() && !o.pass {
            unevaluated.push((*name).to_string());
        }
        if !o.pass || !o.ratio.is_finite() || o.ratio.is_nan() {
            pass = false;
        }
        if o.ratio > unity {
            unity = o.ratio;
            gov = name;
        }
    }
    if !(nu.is_finite() && mux.is_finite() && muy.is_finite() && vu.is_finite()) {
        pass = false;
        unevaluated.push("demand".into());
    }
    Cirsoc301CheckResult {
        element_id: m.element_id,
        nu,
        mu_strong: mux,
        mu_weak: muy,
        vu,
        tension,
        compression,
        flexure_strong,
        flexure_weak,
        shear,
        interaction,
        unity_ratio: unity,
        governing_check: gov.into(),
        pass,
        unevaluated,
    }
}

/// Every member with its forces (pairs by element id; several force sets per member are
/// checked separately, in order).
pub fn check_cirsoc301_members(input: &Cirsoc301CheckInput) -> Vec<Cirsoc301CheckResult> {
    let by_id: std::collections::HashMap<usize, &Cirsoc301MemberData> =
        input.members.iter().map(|m| (m.element_id, m)).collect();
    input.forces.iter().filter_map(|f| by_id.get(&f.element_id).map(|m| check_member(m, f))).collect()
}
