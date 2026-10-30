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

/// Whether the flexural section data are finite, positive, and define a
/// strictly increasing force residual R(x) on x > 0.
pub(crate) fn ec2_flexure_valid(m: &Ec2MemberData) -> bool {
    let es = m.es.unwrap_or(200e9);
    let gamma_c = m.gamma_c.unwrap_or(1.5);
    let gamma_s = m.gamma_s.unwrap_or(1.15);
    let alpha_cc = m.alpha_cc.unwrap_or(1.0);
    let as_c = m.as_compression.unwrap_or(0.0);
    let d_p = m.d_prime.unwrap_or(0.0);
    [m.fck, m.fyk, es, gamma_c, gamma_s, alpha_cc, m.b, m.h, m.d, m.as_tension]
        .iter()
        .all(|v| v.is_finite() && *v > 0.0)
        && m.fck < 250e6
        && m.d <= m.h
        && as_c.is_finite()
        && d_p.is_finite()
}

fn doubly_steel(m: &Ec2MemberData) -> (f64, f64) {
    match (m.as_compression, m.d_prime) {
        (Some(as_c), Some(d_p)) if as_c > 0.0 && d_p > 0.0 && d_p < m.d => (as_c, d_p),
        _ => (0.0, 0.0),
    }
}

/// Force residual R(x) = Cc(x) + As'·fsc(x) − As·fst(x) (N) at neutral axis depth `x`.
/// Continuous and strictly increasing in `x > 0` whenever `ec2_flexure_valid(m)` holds.
fn ec2_flexure_residual<T: Real>(m: &Ec2MemberData, x: T) -> T {
    let (fcd, fyd, fck_mpa) = design_strengths::<T>(m);
    let es = T::exact(m.es.unwrap_or(200e9));
    let (one, fifty) = (T::exact(1.0), T::exact(50.0));
    let (as_t, b, d) = (T::exact(m.as_tension), T::exact(m.b), T::exact(m.d));
    let (as_c, d_p) = doubly_steel(m);

    // Simplified rectangular stress block (EC2 3.1.7)
    let lambda = branch(fck_mpa.le(fifty), || T::lit(0.8), || T::lit(0.8) - (fck_mpa - fifty).dv(T::exact(400.0)));
    let eta = branch(fck_mpa.le(fifty), || one, || one - (fck_mpa - fifty).dv(T::exact(200.0)));

    let ecu_es = T::lit(0.0035) * es;
    let fsc = (ecu_es * (one - T::exact(d_p).dv(x))).max(-fyd).min(fyd);
    let fst = (ecu_es * (d.dv(x) - one)).max(-fyd).min(fyd);
    let cc = eta * fcd * lambda * x * b;
    cc + T::exact(as_c) * fsc - as_t * fst
}

/// Flexural resistance by strain compatibility (EC2 6.1, rectangular stress block 3.1.7).
/// Generic over `Real` so the certified check (`certify::design`) evaluates the same
/// formula in interval arithmetic.
pub(crate) fn ec2_flexure<T: Real>(m: &Ec2MemberData) -> Ec2Flexure<T> {
    if !ec2_flexure_valid(m) {
        let z = T::exact(0.0);
        return Ec2Flexure { m_rd: z, z, x_na: z };
    }
    let (fcd_f, fyd_f, fck_mpa_f) = design_strengths::<f64>(m);
    let lambda_f = if fck_mpa_f <= 50.0 { 0.8 } else { 0.8 - (fck_mpa_f - 50.0) / 400.0 };
    let eta_f = if fck_mpa_f <= 50.0 { 1.0 } else { 1.0 - (fck_mpa_f - 50.0) / 200.0 };
    let (as_c, d_p) = doubly_steel(m);
    let s = (m.as_tension + as_c) * fyd_f / (eta_f * fcd_f * lambda_f * m.b);
    if !(s > 0.0) || !s.is_finite() {
        let z = T::exact(0.0);
        return Ec2Flexure { m_rd: z, z, x_na: z };
    }
    // R(x) >= eta·fcd·lambda·b·x − (As + As')·fyd, so the root is below s;
    // at x = lo_scale·1e-12 both steel strains exceed yield in tension, so R(lo) < 0.
    let lo_scale = if d_p > 0.0 { s.min(m.d).min(d_p) } else { s.min(m.d) };
    let x_na = T::increasing_root(
        |x| ec2_flexure_residual::<f64>(m, x),
        |x| ec2_flexure_residual::<T>(m, x),
        lo_scale * 1e-12,
        2.0 * s,
    );

    let (fcd, fyd, fck_mpa) = design_strengths::<T>(m);
    let es = T::exact(m.es.unwrap_or(200e9));
    let (one, two, fifty) = (T::exact(1.0), T::exact(2.0), T::exact(50.0));
    let (b, d) = (T::exact(m.b), T::exact(m.d));
    let lambda = branch(fck_mpa.le(fifty), || T::lit(0.8), || T::lit(0.8) - (fck_mpa - fifty).dv(T::exact(400.0)));
    let eta = branch(fck_mpa.le(fifty), || one, || one - (fck_mpa - fifty).dv(T::exact(200.0)));
    let ecu_es = T::lit(0.0035) * es;
    let fsc = (ecu_es * (one - T::exact(d_p).dv(x_na))).max(-fyd).min(fyd);

    let z = d - (lambda * x_na).dv(two);
    let m_c = eta * fcd * lambda * x_na * b * z;
    let m_s = T::exact(as_c) * fsc * (d - T::exact(d_p));
    Ec2Flexure { m_rd: m_c + m_s, z, x_na }
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
