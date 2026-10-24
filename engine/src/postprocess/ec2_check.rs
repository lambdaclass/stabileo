//! Reinforced concrete design checks per Eurocode 2 (EN 1992-1-1).
//!
//! Covers flexural capacity using parabolic-rectangular stress block,
//! shear capacity with variable strut inclination method, and
//! combined checks. Uses characteristic/design material strengths.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

// ==================== Types ====================

/// EC2 concrete class (e.g., C25/30, C30/37).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2MemberData {
    pub element_id: usize,
    /// Characteristic cylinder strength fck (Pa)
    pub fck: f64,
    /// Characteristic yield strength of reinforcement fyk (Pa)
    pub fyk: f64,
    /// Section width b (m)
    pub b: f64,
    /// Total depth h (m)
    pub h: f64,
    /// Effective depth d (m)
    pub d: f64,
    /// Tension reinforcement area As (m²)
    pub as_tension: f64,
    /// Compression reinforcement area As' (m²)
    #[serde(default)]
    pub as_compression: Option<f64>,
    /// Compression steel depth d' (m)
    #[serde(default)]
    pub d_prime: Option<f64>,
    /// Modulus of elasticity of steel Es (Pa, default 200 GPa)
    #[serde(default)]
    pub es: Option<f64>,
    /// Partial safety factor for concrete gamma_c (default 1.5)
    #[serde(default)]
    pub gamma_c: Option<f64>,
    /// Partial safety factor for steel gamma_s (default 1.15)
    #[serde(default)]
    pub gamma_s: Option<f64>,
    /// Alpha_cc factor (default 1.0 per UK NA, 0.85 per some NAs)
    #[serde(default)]
    pub alpha_cc: Option<f64>,
    /// Stirrup area Asw per spacing (m²)
    #[serde(default)]
    pub asw: Option<f64>,
    /// Stirrup spacing s (m)
    #[serde(default)]
    pub s_stirrup: Option<f64>,
    /// Strut angle theta for shear (radians, default computed)
    #[serde(default)]
    pub theta_shear: Option<f64>,
    /// Minimum web width bw (m) — for T-beams, default = b
    #[serde(default)]
    pub bw: Option<f64>,
    /// Inner lever arm z (m) — if None, approximated as 0.9*d
    #[serde(default)]
    pub z: Option<f64>,
}

/// Applied design forces.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2DesignForces {
    pub element_id: usize,
    /// Design bending moment MEd (N-m)
    #[serde(default)]
    pub m_ed: Option<f64>,
    /// Design shear force VEd (N)
    #[serde(default)]
    pub v_ed: Option<f64>,
    /// Design axial force NEd (N, + tension, - compression)
    #[serde(default)]
    pub n_ed: Option<f64>,
}

/// Input for EC2 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2CheckInput {
    pub members: Vec<Ec2MemberData>,
    pub forces: Vec<Ec2DesignForces>,
}

/// Result of EC2 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2CheckResult {
    pub element_id: usize,
    /// Flexural capacity MRd (N-m)
    pub m_rd: f64,
    /// Flexure ratio MEd / MRd
    pub flexure_ratio: f64,
    /// Shear capacity VRd (N) — minimum of VRd,c and VRd,max
    pub v_rd: f64,
    /// Shear ratio VEd / VRd
    pub shear_ratio: f64,
    /// Concrete-only shear capacity VRd,c (N)
    pub v_rdc: f64,
    /// Shear reinforcement capacity VRd,s (N)
    pub v_rds: f64,
    /// Max strut capacity VRd,max (N)
    pub v_rd_max: f64,
    /// Neutral axis depth x (m)
    pub x_na: f64,
    /// Lever arm z (m)
    pub z: f64,
    /// Overall pass
    pub pass: bool,
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== Implementation ====================


/// Index the force records by id so each member is a hash lookup rather than a
/// scan of the whole list. The pairing was O(members x forces): fine at 100
/// members, quadratic at 10,000 — and this runs on every edit.
fn index_forces<T>(forces: &[T], id_of: impl Fn(&T) -> usize) -> std::collections::HashMap<usize, &T> {
    let mut map = std::collections::HashMap::with_capacity(forces.len());
    for f in forces {
        map.entry(id_of(f)).or_insert(f);
    }
    map
}

/// Check all EC2 members.
pub fn check_ec2_members(input: &Ec2CheckInput) -> Vec<Ec2CheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_ec2_member(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

/// EC2 flexural resistance (6.1, rectangular stress block 3.1.7).
pub(crate) struct Ec2Flexure<T> {
    pub m_rd: T,
    pub z: T,
    pub x_na: T,
}

/// EC2 shear resistances (6.2).
pub(crate) struct Ec2Shear<T> {
    pub v_rd: T,
    pub v_rdc: T,
    pub v_rds: T,
    pub v_rd_max: T,
}

fn design_strengths<T: Real>(m: &Ec2MemberData) -> (T, T, T) {
    let gamma_c = T::exact(m.gamma_c.unwrap_or(1.5));
    let gamma_s = T::exact(m.gamma_s.unwrap_or(1.15));
    let alpha_cc = T::exact(m.alpha_cc.unwrap_or(1.0));
    // Design material strengths
    let fcd = (alpha_cc * T::exact(m.fck)).dv(gamma_c);
    let fyd = T::exact(m.fyk).dv(gamma_s);
    let fck_mpa = T::exact(m.fck).dv(T::exact(1e6));
    (fcd, fyd, fck_mpa)
}

/// Ultimate compressive strain εcu3 for the rectangular stress block
/// (EN 1992-1-1 Table 3.1: 0.0035 for fck ≤ 50 MPa,
/// 0.0026 + 0.035·((90 − fck)/100)^4 for 50 < fck ≤ 90 MPa).
fn ec2_ecu3<T: Real>(fck_mpa: T) -> T {
    let fifty = T::exact(50.0);
    branch(
        fck_mpa.le(fifty),
        || T::lit(0.0035),
        || {
            let r = (T::exact(90.0) - fck_mpa).dv(T::exact(100.0)).max(T::exact(0.0));
            T::lit(0.0026) + T::lit(0.035) * r.sq().sq()
        },
    )
}

/// Flexural resistance by strain compatibility (EN 1992-1-1 6.1 & 3.1.7).
/// Generic over `Real` so the certified check (`certify::design`) evaluates
/// the same formula in interval arithmetic.
pub(crate) fn ec2_flexure<T: Real>(m: &Ec2MemberData) -> Ec2Flexure<T> {
    let zero = T::exact(0.0);
    let one = T::exact(1.0);
    let two = T::exact(2.0);
    let fifty = T::exact(50.0);

    let es_f = m.es.unwrap_or(200e9);
    let gamma_c_f = m.gamma_c.unwrap_or(1.5);
    let gamma_s_f = m.gamma_s.unwrap_or(1.15);
    let alpha_cc_f = m.alpha_cc.unwrap_or(1.0);
    let (as_c_f, d_p_f) = match (m.as_compression, m.d_prime) {
        (Some(ac), Some(dp)) if ac > 0.0 && dp > 0.0 => (ac, dp),
        _ => (0.0, 0.0),
    };

    let valid = [m.fck, m.fyk, m.b, m.h, m.d, m.as_tension, as_c_f, d_p_f, es_f, gamma_c_f, gamma_s_f, alpha_cc_f]
        .iter()
        .all(|v| v.is_finite())
        && m.fck > 0.0
        && m.fyk > 0.0
        && m.b > 0.0
        && m.d > 0.0
        && m.as_tension >= 0.0
        && es_f > 0.0
        && gamma_c_f > 0.0
        && gamma_s_f > 0.0
        && alpha_cc_f > 0.0;
    if !valid {
        return Ec2Flexure { m_rd: zero, z: zero, x_na: zero };
    }

    let fck_mpa_f = m.fck / 1e6;
    let lambda_f = if fck_mpa_f <= 50.0 { 0.8 } else { 0.8 - (fck_mpa_f - 50.0) / 400.0 };
    let eta_f = if fck_mpa_f <= 50.0 { 1.0 } else { 1.0 - (fck_mpa_f - 50.0) / 200.0 };
    let fcd_f = alpha_cc_f * m.fck / gamma_c_f;
    let fyd_f = m.fyk / gamma_s_f;
    let k_conc_f = eta_f * fcd_f * lambda_f * m.b;
    let s = (m.as_tension + as_c_f) * fyd_f / k_conc_f;
    if !(s > 0.0) || !s.is_finite() {
        return Ec2Flexure { m_rd: zero, z: zero, x_na: zero };
    }

    let residual = |x: T| -> T {
        let (fcd, fyd, fck_mpa) = design_strengths::<T>(m);
        let lambda = branch(fck_mpa.le(fifty), || T::lit(0.8), || T::lit(0.8) - (fck_mpa - fifty).dv(T::exact(400.0)));
        let eta = branch(fck_mpa.le(fifty), || one, || one - (fck_mpa - fifty).dv(T::exact(200.0)));
        let ecu_es = ec2_ecu3(fck_mpa) * T::exact(es_f);
        let cc = eta * fcd * lambda * T::exact(m.b) * x;
        let fsc = if as_c_f > 0.0 {
            (ecu_es * (one - T::exact(d_p_f).dv(x))).max(-fyd).min(fyd)
        } else {
            zero
        };
        let fst = (ecu_es * (T::exact(m.d).dv(x) - one)).max(-fyd).min(fyd);
        cc + T::exact(as_c_f) * fsc - T::exact(m.as_tension) * fst
    };

    let x_na = T::increasing_root(
        |x| {
            let ecu_es = if fck_mpa_f <= 50.0 {
                0.0035
            } else {
                0.0026 + 0.035 * ((90.0 - fck_mpa_f) / 100.0).max(0.0).powi(4)
            } * es_f;
            let fsc = if as_c_f > 0.0 {
                (ecu_es * (1.0 - d_p_f / x)).clamp(-fyd_f, fyd_f)
            } else {
                0.0
            };
            let fst = (ecu_es * (m.d / x - 1.0)).clamp(-fyd_f, fyd_f);
            k_conc_f * x + as_c_f * fsc - m.as_tension * fst
        },
        residual,
        s * 1e-12,
        2.0 * s,
    );

    let (fcd, fyd, fck_mpa) = design_strengths::<T>(m);
    let lambda = branch(fck_mpa.le(fifty), || T::lit(0.8), || T::lit(0.8) - (fck_mpa - fifty).dv(T::exact(400.0)));
    let eta = branch(fck_mpa.le(fifty), || one, || one - (fck_mpa - fifty).dv(T::exact(200.0)));
    let ecu_es = ec2_ecu3(fck_mpa) * T::exact(es_f);
    let d = T::exact(m.d);
    let z = d - (lambda * x_na).dv(two);
    let m_c = eta * fcd * lambda * x_na * T::exact(m.b) * z;
    let m_s = if as_c_f > 0.0 {
        let fsc = (ecu_es * (one - T::exact(d_p_f).dv(x_na))).max(-fyd).min(fyd);
        T::exact(as_c_f) * fsc * (d - T::exact(d_p_f))
    } else {
        zero
    };
    let m_rd = m_c + m_s;
    Ec2Flexure { m_rd, z, x_na }
}

/// Shear resistance for axial force `n_ed` (tension-positive).
pub(crate) fn ec2_shear<T: Real>(m: &Ec2MemberData, n_ed: T) -> Ec2Shear<T> {
    let (fcd, fyd, fck_mpa) = design_strengths::<T>(m);
    let gamma_c = T::exact(m.gamma_c.unwrap_or(1.5));
    let (d, bw) = (T::exact(m.d), T::exact(m.bw.unwrap_or(m.b)));
    let (zero, one, mega) = (T::exact(0.0), T::exact(1.0), T::exact(1e6));

    // VRd,c — concrete shear resistance without shear reinforcement (EC2 6.2.2)
    let d_mm = d * T::exact(1000.0);
    let bw_mm = bw * T::exact(1000.0);
    let k_shear = (one + T::exact(200.0).dv(d_mm).sqrt()).min(T::exact(2.0));
    let rho_l = T::exact(m.as_tension).dv(bw * d).min(T::lit(0.02));
    let c_rdc = T::lit(0.18).dv(gamma_c);

    // EC2 6.2.2(1) adds k1·sigma_cp, the axial contribution. `n_ed` was
    // accepted and never read, so a column under compression lost the benefit
    // and — the case that matters — a member in net tension kept a capacity it
    // does not have. sigma_cp is compression-positive and capped at 0.2·fcd;
    // `n_ed` is tension-positive here, hence the sign flip.
    const K1_AXIAL: f64 = 0.15;
    let ac = m.b * m.h;
    let sigma_cp_mpa = if ac > 0.0 {
        ((-n_ed).dv(T::exact(m.b) * T::exact(m.h)).dv(mega)).min((T::lit(0.2) * fcd).dv(mega))
    } else {
        zero
    };
    let axial_term = T::lit(K1_AXIAL) * sigma_cp_mpa * bw_mm * d_mm;

    let v_rdc = c_rdc * k_shear * (T::exact(100.0) * rho_l * fck_mpa).powf(one.dv(T::exact(3.0))) * bw_mm * d_mm
        + axial_term;

    // Minimum VRd,c
    let v_min = T::lit(0.035) * k_shear.powf(T::exact(1.5)) * fck_mpa.sqrt() * bw_mm * d_mm + axial_term;
    let v_rdc = v_rdc.max(v_min).max(zero);

    // VRd,s — shear reinforcement capacity (EC2 6.2.3)
    let z_shear = match m.z {
        Some(z) => T::exact(z),
        None => T::lit(0.9) * d,
    };
    // EC2 6.2.3(2) bounds the strut inclination to 1 <= cot(theta) <= 2.5,
    // i.e. 21.8 deg <= theta <= 45 deg. Working directly in cot(theta) keeps
    // the clamp exact and avoids the singularity at theta = 0, where an
    // unvalidated angle produced an unbounded VRd,s (and a shear ratio of 0).
    // The default is the flattest permitted strut, cot = 2.5.
    const COT_THETA_MAX: f64 = 2.5; // theta = 21.8 deg
    const COT_THETA_MIN: f64 = 1.0; // theta = 45 deg
    let cot_theta = match m.theta_shear {
        Some(t) if t.is_finite() && t > 0.0 => {
            one.dv(T::exact(t).tan()).max(T::exact(COT_THETA_MIN)).min(T::exact(COT_THETA_MAX))
        }
        _ => T::exact(COT_THETA_MAX),
    };

    let v_rds = match (m.asw, m.s_stirrup) {
        (Some(asw), Some(s)) if s > 0.0 => (T::exact(asw) * z_shear * fyd * cot_theta).dv(T::exact(s)),
        _ => zero,
    };

    // VRd,max — maximum strut capacity (EC2 6.2.3(3), Eq. 6.9):
    //   VRd,max = alpha_cw · bw · z · nu1 · fcd / (cot θ + tan θ)
    // alpha_cw accounts for the state of stress in the compression chord and is
    // 1.0 for non-prestressed members. It is *not* alpha_cc, which scales the
    // long-term compressive strength and is already inside `fcd` above —
    // reusing it here applied a national-annex 0.85 twice.
    let alpha_cw = one;
    let nu1 = T::lit(0.6) * (one - fck_mpa.dv(T::exact(250.0)));
    let v_rd_max = (alpha_cw * nu1 * fcd * bw * z_shear * cot_theta).dv(one + cot_theta * cot_theta);

    // Design shear capacity
    let v_rd = branch(zero.lt(v_rds), || v_rds.min(v_rd_max), || v_rdc);
    Ec2Shear { v_rd, v_rdc, v_rds, v_rd_max }
}

fn check_single_ec2_member(m: &Ec2MemberData, f: &Ec2DesignForces) -> Ec2CheckResult {
    let m_ed = f.m_ed.unwrap_or(0.0).abs();
    let v_ed = f.v_ed.unwrap_or(0.0).abs();

    // ==================== Flexure (EC2 Sec 6.1) ====================
    let Ec2Flexure { m_rd, z, x_na } = ec2_flexure::<f64>(m);

    let mut ledger = CheckLedger::new();
    let flexure_ratio = ledger.ratio("Flexure 6.1", m_ed, m_rd);

    // ==================== Shear (EC2 Sec 6.2) ====================
    let Ec2Shear { v_rd, v_rdc, v_rds, v_rd_max } = ec2_shear::<f64>(m, f.n_ed.unwrap_or(0.0));

    let shear_ratio = ledger.ratio_if_loaded("Shear 6.2", v_ed, v_rd);

    let pass = ledger.all_evaluated() && flexure_ratio <= 1.0 && shear_ratio <= 1.0;

    Ec2CheckResult {
        element_id: m.element_id,
        m_rd,
        flexure_ratio,
        v_rd,
        shear_ratio,
        v_rdc,
        v_rds,
        v_rd_max,
        x_na,
        z,
        pass,
        unevaluated: ledger.into_unevaluated(),
    }
}
