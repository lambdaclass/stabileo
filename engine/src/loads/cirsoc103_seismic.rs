//! INPRES-CIRSOC 103-2018 Parte I: the design spectrum (Tabla 3.1, [3.1]–[3.4], [3.13], [3.14]),
//! the seismic weight (§3.6 [3.15], Tabla 3.3), the static method's period (§6.2.3, Tablas 6.1
//! and 6.2), design coefficient (§6.2.2 [6.3]–[6.7]), distribution in height (§6.2.4.1
//! [6.11]–[6.13]) and its applicability (Tabla 2.5, §2.7).
//!
//! Verified clause by clause in `docs/verification/LOADS.md`. The TypeScript modules
//! (`web/src/lib/codes/cirsoc103/spectrum.ts`, `static-method.ts`) are adapters over these
//! functions; they render the messages and clause references from what is returned here.

use serde::{Deserialize, Serialize};

// ==================== Spectrum ====================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiteClass {
    SA,
    SB,
    SC,
    SD,
    SE,
    SF,
}

/// Tabla 3.1 spectral type of a site: 1 (SA–SC), 2 (SD), 3 (SE); SF needs a site study.
pub fn spectral_type(site: SiteClass) -> Option<u8> {
    match site {
        SiteClass::SA | SiteClass::SB | SiteClass::SC => Some(1),
        SiteClass::SD => Some(2),
        SiteClass::SE => Some(3),
        SiteClass::SF => None,
    }
}

/// as per zone (Tabla 3.1).
pub fn zone_as(zone: u8) -> f64 {
    [0.0, 0.08, 0.15, 0.25, 0.35][zone.min(4) as usize]
}

/// T3 per zone (Tabla 3.2), s.
pub fn zone_t3(zone: u8) -> f64 {
    [0.0, 3.0, 5.0, 8.0, 13.0][zone.min(4) as usize]
}

/// Tabla 3.1 (Ca, Cv, near-fault) for a spectral type and zone 1–4.
pub fn table_3_1(spectral_type: u8, zone: u8) -> (f64, f64, bool) {
    let rows: [[(f64, f64); 4]; 3] = [
        [(0.09, 0.13), (0.18, 0.25), (0.29, 0.39), (0.37, 0.51)],
        [(0.12, 0.18), (0.22, 0.32), (0.32, 0.47), (0.40, 0.59)],
        [(0.19, 0.26), (0.30, 0.50), (0.35, 0.74), (0.36, 0.90)],
    ];
    let (ca, cv) = rows[(spectral_type - 1) as usize][(zone - 1) as usize];
    (ca, cv, zone >= 3)
}

pub const NA_MIN: f64 = 1.0;
pub const NV_MIN: f64 = 1.2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpectrumInputs {
    pub zone: u8,
    pub site: SiteClass,
    #[serde(default)]
    pub na: Option<f64>,
    #[serde(default)]
    pub nv: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignSpectrum {
    pub zone: u8,
    #[serde(rename = "type")]
    pub spectral_type: u8,
    #[serde(rename = "as")]
    pub as_: f64,
    pub ca: f64,
    pub cv: f64,
    pub na: f64,
    pub nv: f64,
    pub t1: f64,
    pub t2: f64,
    pub t3: f64,
    /// Na and Nv were taken at their minimums because they were not given.
    pub fault_proximity_assumed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SpectrumOutcome {
    Spectrum { spectrum: DesignSpectrum },
    /// Zone 0 (§2.5.2) or site SF (§2.3.2): no design spectrum.
    Blocked { reason: String },
}

pub fn design_spectrum(i: &SpectrumInputs) -> SpectrumOutcome {
    if i.zone == 0 || i.zone > 4 {
        return SpectrumOutcome::Blocked { reason: "zone0".into() };
    }
    let Some(ty) = spectral_type(i.site) else {
        return SpectrumOutcome::Blocked { reason: "siteSF".into() };
    };
    let (ca0, cv0, near) = table_3_1(ty, i.zone);
    let (mut na, mut nv, mut assumed) = (1.0, 1.0, false);
    if near {
        na = NA_MIN.max(i.na.unwrap_or(NA_MIN));
        nv = NV_MIN.max(i.nv.unwrap_or(NV_MIN));
        assumed = i.na.is_none() || i.nv.is_none();
    }
    let ca = ca0 * na;
    let cv = cv0 * nv;
    let t2 = cv / (2.5 * ca); // [3.13]
    let t1 = 0.2 * t2; // [3.14]
    SpectrumOutcome::Spectrum {
        spectrum: DesignSpectrum {
            zone: i.zone,
            spectral_type: ty,
            as_: zone_as(i.zone),
            ca,
            cv,
            na,
            nv,
            t1,
            t2,
            t3: zone_t3(i.zone),
            fault_proximity_assumed: assumed,
        },
    }
}

/// Sa(T), [3.1]–[3.4].
pub fn spectral_ordinate(t: f64, s: &DesignSpectrum) -> f64 {
    if t <= s.t1 {
        s.ca * (1.0 + 1.5 * (t / s.t1))
    } else if t <= s.t2 {
        2.5 * s.ca
    } else if t <= s.t3 {
        s.cv / t
    } else {
        (s.cv * s.t3) / (t * t)
    }
}

/// The spectrum sampled for plotting: the corners, every 0,01 s to 2 s, every 0,05 s beyond.
pub fn spectrum_points(s: &DesignSpectrum, t_max: Option<f64>) -> Vec<(f64, f64)> {
    let t_max = t_max.unwrap_or(10.0f64.max(s.t3 * 1.5));
    let mut ts = vec![0.0, s.t1, s.t2, s.t3];
    let mut t = 0.01;
    while t <= t_max.min(2.0) + 1e-9 {
        ts.push((t * 1000.0f64).round() / 1000.0);
        t += 0.01;
    }
    let mut t = 2.05;
    while t <= t_max + 1e-9 {
        ts.push((t * 1000.0f64).round() / 1000.0);
        t += 0.05;
    }
    ts.retain(|&t| t <= t_max);
    ts.sort_by(|a, b| a.total_cmp(b));
    ts.dedup();
    ts.into_iter().map(|t| (t, spectral_ordinate(t, s))).collect()
}

/// Tabla 3.3 f1 by occupancy probability.
pub fn simultaneity_f1(occupancy: &str) -> Option<f64> {
    Some(match occupancy {
        "exceptional" => 0.0,
        "reduced" => 0.25,
        "intermediate" => 0.50,
        "high" => 0.75,
        "full" => 1.0,
        "other" => 0.20,
        _ => return None,
    })
}

/// §3.6 [3.15]: W = D + f1·L + f2·S, f2 = 0,70 on roofs that retain snow, 0,20 otherwise.
pub fn seismic_weight(dead: f64, live: f64, snow: f64, f1: f64, snow_retaining: bool) -> (f64, f64) {
    let f2 = if snow_retaining { 0.70 } else { 0.20 };
    (dead + f1 * live + f2 * snow, f2)
}

// ==================== Static method ====================

/// Tabla 6.2 (Cr, x) by system.
pub fn period_coefficients(system: &str) -> Option<(f64, f64)> {
    Some(match system {
        "steelMomentFrame" => (0.0724, 0.80),
        "concreteMomentFrame" => (0.0466, 0.90),
        "steelEccentricOrBRB" => (0.0731, 0.75),
        "other" => (0.0488, 0.75),
        _ => return None,
    })
}

/// [6.5] Ta = Cr·hn^x.
pub fn approximate_period(height: f64, cr: f64, x: f64) -> f64 {
    cr * height.max(0.0).powf(x)
}

/// Tabla 6.1 Cu, interpolated in as.
pub fn period_cap_factor(as_: f64) -> f64 {
    const T: [(f64, f64); 4] = [(0.08, 1.70), (0.15, 1.60), (0.25, 1.45), (0.35, 1.40)];
    if as_ <= T[0].0 {
        return T[0].1;
    }
    if as_ >= T[3].0 {
        return T[3].1;
    }
    for w in T.windows(2) {
        let (a, b) = (w[0], w[1]);
        if as_ <= b.0 {
            let t = (as_ - a.0) / (b.0 - a.0);
            return a.1 + t * (b.1 - a.1);
        }
    }
    T[3].1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodResult {
    pub t: f64,
    pub ta: f64,
    pub cu: f64,
    pub cr: f64,
    pub x: f64,
    pub limit: f64,
    pub capped: bool,
    /// A computed period was given (> 0).
    pub computed: bool,
}

/// §6.2.3: the design period, a computed one capped at Cu·Ta, or Ta.
pub fn design_period(height: f64, system: &str, computed_t: Option<f64>, as_: f64) -> Option<PeriodResult> {
    let (cr, x) = period_coefficients(system)?;
    let ta = approximate_period(height, cr, x);
    let cu = period_cap_factor(as_);
    let limit = cu * ta;
    Some(match computed_t {
        Some(c) if c > 0.0 => {
            let capped = c > limit;
            PeriodResult { t: if capped { limit } else { c }, ta, cu, cr, x, limit, capped, computed: true }
        }
        _ => PeriodResult { t: ta, ta, cu, cr, x, limit, capped: false, computed: false },
    })
}

/// γr (§2.4) by destination group.
pub fn risk_factor(group: &str) -> Option<f64> {
    Some(match group {
        "Ao" => 1.5,
        "A" => 1.3,
        "B" => 1.0,
        "C" => 0.8,
        _ => return None,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoefficientResult {
    pub c: f64,
    /// The spectral coefficient before any floor.
    pub c_spectral: f64,
    pub plateau: bool,
    /// "nearFault", "lowZone" or absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub floor_applied: Option<String>,
    pub gamma_r: f64,
    pub sa: f64,
    pub r: f64,
}

/// §6.2.2: C = Sa·γr/R ([6.3]/[6.4]), floored by [6.6] in zones 3–4 or [6.7] otherwise.
pub fn design_seismic_coefficient(s: &DesignSpectrum, gamma_r: f64, r: f64, t: f64) -> CoefficientResult {
    let r = r.max(1e-9);
    let plateau = t <= s.t2;
    let sa = if plateau { 2.5 * s.ca } else { spectral_ordinate(t, s) };
    let c_spectral = (sa * gamma_r) / r;
    let mut c = c_spectral;
    let mut floor_applied = None;
    if s.zone >= 3 {
        let floor = (0.8 * s.as_ * s.nv) / r;
        if floor > c {
            c = floor;
            floor_applied = Some("nearFault".to_string());
        }
    } else {
        let floor = 0.11 * s.ca * gamma_r;
        if floor > c {
            c = floor;
            floor_applied = Some("lowZone".to_string());
        }
    }
    CoefficientResult { c, c_spectral, plateau, floor_applied, gamma_r, sa, r }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct MassLevel {
    pub h: f64,
    pub w: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionResult {
    /// (h, w, F) of every level with mass and height.
    pub forces: Vec<(f64, f64, f64)>,
    pub top_heavy: bool,
    pub sum_wh: f64,
}

/// §6.2.4.1 [6.11]: Fk = Wk·hk·V0/ΣWh; past T > 2·T2 ([6.12]/[6.13]) 0,9 of it so, and 0,1·V0
/// at the top.
/// `t2 = None`: no spectrum plateau to compare with (the app's T2 = ∞), never top-heavy.
pub fn distribute_in_height(levels: &[MassLevel], base_shear: f64, uncapped_t: f64, t2: Option<f64>) -> DistributionResult {
    let usable: Vec<MassLevel> = levels.iter().copied().filter(|l| l.w > 0.0 && l.h > 0.0).collect();
    let sum_wh: f64 = usable.iter().map(|l| l.w * l.h).sum();
    let top_heavy = t2.is_some_and(|t2| uncapped_t > 2.0 * t2);
    if sum_wh <= 0.0 {
        return DistributionResult { forces: usable.iter().map(|l| (l.h, l.w, 0.0)).collect(), top_heavy, sum_wh };
    }
    let mut top = 0;
    for (i, l) in usable.iter().enumerate().skip(1) {
        if l.h > usable[top].h {
            top = i;
        }
    }
    let factor = if top_heavy { 0.9 } else { 1.0 };
    let forces = usable
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let mut f = (factor * l.w * l.h * base_shear) / sum_wh;
            if top_heavy && i == top {
                f += 0.1 * base_shear;
            }
            (l.h, l.w, f)
        })
        .collect();
    DistributionResult { forces, top_heavy, sum_wh }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Applicability {
    pub allowed: bool,
    pub dynamic_required: bool,
    /// "dynamicRequired" (T > 3·T2), "heightOverTable25", "irregular", "aoIrregular" block;
    /// "groupCAsB" is an assumption.
    pub reasons: Vec<String>,
    /// Tabla 2.5 height limit that applied, when one did.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height_limit: Option<f64>,
}

/// Tabla 2.5 and §2.7: may the static method be used?
pub fn static_method_applicable(zone: u8, group: &str, height: f64, levels: u32, regularity: &str, t: Option<f64>, t2: Option<f64>) -> Applicability {
    if let (Some(t), Some(t2)) = (t, t2) {
        if t > 3.0 * t2 {
            return Applicability { allowed: false, dynamic_required: true, reasons: vec!["dynamicRequired".into()], height_limit: None };
        }
    }
    if levels <= 3 || height < 9.0 {
        return Applicability { allowed: true, dynamic_required: false, reasons: vec![], height_limit: None };
    }
    let high = zone >= 3;
    let limit = match (high, group) {
        (true, "Ao") => 12.0,
        (true, "A") => 30.0,
        (true, _) => 45.0,
        (false, "Ao") => 16.0,
        (false, "A") => 45.0,
        (false, _) => 60.0,
    };
    let mut reasons = Vec::new();
    if height > limit {
        reasons.push("heightOverTable25".to_string());
    }
    if regularity == "irregular" {
        reasons.push("irregular".into());
    } else if regularity == "medium" && group == "Ao" {
        reasons.push("aoIrregular".into());
    }
    let blocking = !reasons.is_empty();
    if group == "C" {
        reasons.push("groupCAsB".into());
    }
    Applicability { allowed: !blocking, dynamic_required: blocking, reasons, height_limit: Some(limit) }
}
