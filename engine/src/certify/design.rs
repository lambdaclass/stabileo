//! Certified design-code utilization. See "Certified design checks" in
//! `docs/verification/CERTIFY.md`.
//!
//! Given demand enclosures `[F − ΔF, F + ΔF]` (from the force / combination
//! certificates), the code formulas are evaluated in outward-rounded interval
//! arithmetic through the *same generic implementation* the ordinary check
//! uses (`crate::certify::real::Real`), so the result `[lower, upper]`
//! encloses the exact real utilization for every demand in the box. Branches
//! whose condition is undecided on the box are evaluated both ways and hulled.
//!
//! Covered: AISC 360 member checks (`postprocess::steel_check`): tension D2,
//! compression E3, flexure F2/F6, shear G2 and the H1 interaction; EC3
//! (`ec3_check`) member checks; EC2 (`ec2_check`) RC flexure and shear.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::combinations::{certify_multi_case_2d, certify_multi_case_3d, CertifiedMultiCase2D, CertifiedMultiCase3D};
use crate::solver::load_cases::{MultiCaseInput, MultiCaseInput3D};
use super::interval::Interval;
use super::real::{branch, Real};
use crate::postprocess::diagrams::{compute_diagram_value_at_sorted, sorted_point_loads};
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use crate::postprocess::ec2_check::{ec2_flexure, ec2_shear, Ec2DesignForces, Ec2Flexure, Ec2MemberData, Ec2Shear};
use crate::postprocess::ec3_check::{ec3_capacities, Ec3Capacities, Ec3DesignForces, Ec3MemberData};
use crate::postprocess::steel_check::{
    compression_capacity, flexural_capacity_y, flexural_capacity_z, interaction_h1, shear_capacity,
    tension_capacity, ElementDesignForces, SteelMemberData,
};

/// Absolute bounds |exact − computed| on one set of design forces.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemandBound {
    pub n: f64,
    pub my: f64,
    #[serde(default)]
    pub mz: f64,
    #[serde(default)]
    pub vy: f64,
}

/// Design forces with their certified error bounds.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedSteelDemand {
    pub forces: ElementDesignForces,
    pub bound: DemandBound,
}

/// Members and every demand set (e.g. each station × combination) to check.
/// A member is certified over *all* demand sets given for its element id.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedSteelCheckInput {
    pub members: Vec<SteelMemberData>,
    pub demands: Vec<BoundedSteelDemand>,
}

/// Enclosure of one check's ratio, maximized over the member's demand sets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatioEnclosure {
    pub name: String,
    pub lower: f64,
    pub upper: f64,
}

/// Certified result of one member's design check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedMemberResult {
    pub element_id: usize,
    pub certified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The exact utilization (max over checks and demand sets) lies in
    /// `[utilization_lower, utilization_upper]` (both 0 when uncertified).
    pub utilization_lower: f64,
    pub utilization_upper: f64,
    /// Certified to pass: `utilization_upper < 1`.
    pub certified_ok: bool,
    /// Certified to fail: `utilization_lower > 1`.
    pub certified_fail: bool,
    /// Check with the largest upper bound.
    pub governing_check: String,
    pub checks: Vec<RatioEnclosure>,
    pub demand_count: usize,
}

/// AISC result (same shape for every code).
pub type CertifiedSteelResult = CertifiedMemberResult;

const CHECK_NAMES: [&str; 6] =
    ["Tension D2", "Compression E3", "Flexure-Y F2", "Flexure-Z F6", "Shear G2", "Interaction H1"];

/// `[x − d, x + d]`, exact when `d = 0`; Err on non-finite or negative input.
fn around(x: f64, d: f64, what: &str) -> Result<Interval, String> {
    if !x.is_finite() || !d.is_finite() || d < 0.0 {
        return Err(format!("invalid {what} demand {x} ± {d}"));
    }
    if d == 0.0 {
        return Ok(Interval::point(x)); // exact
    }
    Ok(Interval::point(x) + Interval::new(-d, d))
}

/// Ratio for a check that applies only when loaded: an identically zero
/// demand is "not applicable" (ratio 0), exactly as `CheckLedger::ratio_if_loaded`;
/// otherwise the capacity must be certified positive.
fn loaded_ratio(name: &str, d: Interval, cap: Interval) -> Result<Interval, String> {
    if d.lo == 0.0 && d.hi == 0.0 {
        return Ok(Interval::ZERO);
    }
    if !cap.is_finite() || !(cap.lo > 0.0) {
        return Err(format!("{name}: capacity not certified positive ({cap:?})"));
    }
    let r = d.div(cap);
    if r.is_finite() { Ok(r) } else { Err(format!("{name}: non-finite ratio")) }
}

/// Interval enclosures of the six AISC ratios for one demand box. Mirrors
/// `steel_check::check_single_member`; Err when the box cannot be certified
/// (non-finite input, capacity not certified positive where a demand exists).
pub fn steel_ratio_enclosures(
    m: &SteelMemberData,
    f: &ElementDesignForces,
    b: &DemandBound,
) -> Result<[Interval; 6], String> {
    let n = around(f.n, b.n, "axial")?;
    let my = around(f.my, b.my, "My")?.abs();
    let mz = around(f.mz.unwrap_or(0.0), b.mz, "Mz")?.abs();
    let vy = around(f.vy.unwrap_or(0.0), b.vy, "Vy")?.abs();
    let zero = Interval::ZERO;

    let phi_pn_t: Interval = tension_capacity(m);
    let phi_pn_c: Interval = compression_capacity(m);
    let phi_mn_y: Interval = flexural_capacity_y(m);
    let phi_mn_z: Interval = flexural_capacity_z(m);
    let phi_vn: Interval = shear_capacity(m);

    let tension = loaded_ratio(CHECK_NAMES[0], n.max(zero), phi_pn_t)?;
    let compression = loaded_ratio(CHECK_NAMES[1], (-n).max(zero), phi_pn_c)?;
    let flex_y = loaded_ratio(CHECK_NAMES[2], my, phi_mn_y)?;
    let flex_z = loaded_ratio(CHECK_NAMES[3], mz, phi_mn_z)?;
    // Shear: `if phi_vn > 0 { vy / phi_vn } else { 0 }`.
    let shear = branch(zero.lt(phi_vn), || vy.div(phi_vn), || zero);
    let axial = branch(n.lt(zero), || compression, || tension);
    let interaction = interaction_h1(axial, flex_y, flex_z);
    let out = [tension, compression, flex_y, flex_z, shear, interaction];
    for (r, name) in out.iter().zip(CHECK_NAMES) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok(out)
}

fn uncertified(element_id: usize, reason: String, demand_count: usize) -> CertifiedMemberResult {
    CertifiedMemberResult {
        element_id,
        certified: false,
        reason: Some(reason),
        utilization_lower: 0.0,
        utilization_upper: 0.0,
        certified_ok: false,
        certified_fail: false,
        governing_check: "Not certified".into(),
        checks: vec![],
        demand_count,
    }
}

/// Per member, the enclosure of the utilization maximized over every demand
/// set given for it. `enclose` returns one enclosure per check name.
fn certify_members<M, D>(
    members: &[M],
    member_id: impl Fn(&M) -> usize,
    demands: &[D],
    demand_id: impl Fn(&D) -> usize,
    names: &[&str],
    enclose: impl Fn(&M, &D) -> Result<Vec<Interval>, String>,
) -> Vec<CertifiedMemberResult> {
    let mut by_id: HashMap<usize, Vec<&D>> = HashMap::new();
    for d in demands {
        by_id.entry(demand_id(d)).or_default().push(d);
    }
    let mut out: Vec<CertifiedMemberResult> = members
        .iter()
        .map(|m| {
            let eid = member_id(m);
            let demands = by_id.get(&eid).map(|v| v.as_slice()).unwrap_or(&[]);
            if demands.is_empty() {
                return uncertified(eid, "no demands for this member".into(), 0);
            }
            let mut acc = vec![Interval::ZERO; names.len()];
            for d in demands {
                match enclose(m, d) {
                    Ok(r) if r.len() == names.len() => {
                        for (a, r) in acc.iter_mut().zip(&r) {
                            // max over demand sets: componentwise max of endpoints
                            *a = Interval::new(a.lo.max(r.lo), a.hi.max(r.hi));
                        }
                    }
                    Ok(_) => return uncertified(eid, "internal: wrong number of checks".into(), demands.len()),
                    Err(reason) => return uncertified(eid, reason, demands.len()),
                }
            }
            let lower = acc.iter().map(|r| r.lo).fold(0.0, f64::max);
            let upper = acc.iter().map(|r| r.hi).fold(0.0, f64::max);
            let gov = (0..acc.len()).max_by(|&a, &b| acc[a].hi.total_cmp(&acc[b].hi)).unwrap_or(0);
            CertifiedMemberResult {
                element_id: eid,
                certified: true,
                reason: None,
                utilization_lower: lower,
                utilization_upper: upper,
                certified_ok: upper < 1.0,
                certified_fail: lower > 1.0,
                governing_check: names.get(gov).copied().unwrap_or("").into(),
                checks: names
                    .iter()
                    .zip(acc)
                    .map(|(n, r)| RatioEnclosure { name: n.to_string(), lower: r.lo, upper: r.hi })
                    .collect(),
                demand_count: demands.len(),
            }
        })
        .collect();
    out.sort_by_key(|r| r.element_id);
    out
}

/// Certified AISC 360 checks: per member, the enclosure of the utilization
/// maximized over every demand set given for it.
pub fn certify_steel_members(input: &CertifiedSteelCheckInput) -> Vec<CertifiedSteelResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &CHECK_NAMES,
        |m, d| steel_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

// ───────────────────────────── EC3 ─────────────────────────────

/// EC3 design forces with their certified error bounds (`n`→NEd, `my`→My,Ed,
/// `mz`→Mz,Ed, `vy`→VEd).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedEc3Demand {
    pub forces: Ec3DesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedEc3CheckInput {
    pub members: Vec<Ec3MemberData>,
    pub demands: Vec<BoundedEc3Demand>,
}

const EC3_CHECK_NAMES: [&str; 6] =
    ["Compression 6.3.1", "Tension 6.2.3", "Flexure-y 6.3.2", "Flexure-z 6.2.5", "Shear 6.2.6", "Interaction 6.3.3"];

/// Interval enclosures of the six EC3 ratios for one demand box. Mirrors
/// `ec3_check::check_single_ec3_member`.
pub fn ec3_ratio_enclosures(
    m: &Ec3MemberData,
    f: &Ec3DesignForces,
    b: &DemandBound,
) -> Result<[Interval; 6], String> {
    let n = around(f.n_ed.unwrap_or(0.0), b.n, "NEd")?;
    let my = around(f.my_ed.unwrap_or(0.0), b.my, "My,Ed")?.abs();
    let mz = around(f.mz_ed.unwrap_or(0.0), b.mz, "Mz,Ed")?.abs();
    let v = around(f.v_ed.unwrap_or(0.0), b.vy, "VEd")?.abs();
    let zero = Interval::ZERO;
    let caps: Ec3Capacities<Interval> = ec3_capacities(m);
    for (x, name) in [(caps.chi_y, "chi_y"), (caps.chi_z, "chi_z"), (caps.chi_lt, "chi_LT")] {
        if !x.is_finite() {
            return Err(format!("{name} not finite"));
        }
    }
    let compression = loaded_ratio(EC3_CHECK_NAMES[0], (-n).max(zero), caps.nb_rd)?;
    let tension = loaded_ratio(EC3_CHECK_NAMES[1], n.max(zero), caps.npl_rd)?;
    let flex_y = loaded_ratio(EC3_CHECK_NAMES[2], my, caps.mb_rd)?;
    let flex_z = loaded_ratio(EC3_CHECK_NAMES[3], mz, caps.mc_z_rd)?;
    let shear = loaded_ratio(EC3_CHECK_NAMES[4], v, caps.vpl_rd)?;
    // 6.3.3 (simplified): every capacity used is certified positive wherever
    // its demand can be non-zero, so the f64 `if cap > 0 { d / cap } else { 0 }`
    // terms are exactly the ratios above.
    let interaction = branch(
        n.lt(zero),
        || compression + flex_y + flex_z,
        || branch(zero.lt(n), || tension + flex_y + flex_z, || flex_y + flex_z),
    );
    let out = [compression, tension, flex_y, flex_z, shear, interaction];
    for (r, name) in out.iter().zip(EC3_CHECK_NAMES) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok(out)
}

/// Certified EC3 member checks (see `certify_steel_members`).
pub fn certify_ec3_members(input: &CertifiedEc3CheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &EC3_CHECK_NAMES,
        |m, d| ec3_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in EC3 form.
pub fn ec3_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedEc3Demand> {
    demands
        .iter()
        .map(|d| BoundedEc3Demand {
            forces: Ec3DesignForces {
                element_id: d.forces.element_id,
                n_ed: Some(d.forces.n),
                my_ed: Some(d.forces.my),
                mz_ed: d.forces.mz,
                v_ed: d.forces.vy,
            },
            bound: d.bound,
        })
        .collect()
}

/// Demand sets for every element at `stations` evenly spaced stations
/// (t = 0..1) of every combination, with the combination's certified station
/// bounds (2D: N, M about the major axis, V). Err if any combination is
/// uncertified; an element lacking a bound in some combination gets a NaN
/// bound so its check refuses rather than silently skipping that combination.
pub fn steel_demands_from_combinations_2d(
    out: &CertifiedMultiCase2D,
    stations: usize,
) -> Result<Vec<BoundedSteelDemand>, String> {
    let stations = stations.max(2);
    let mut demands = Vec::new();
    for (cr, cc) in out.results.combination_results.iter().zip(&out.combinations) {
        if !cc.certified {
            return Err(format!("combination '{}' not certified: {:?}", cc.name, cc.reason));
        }
        let sb: HashMap<usize, _> = cc.station_bounds.iter().map(|s| (s.element_id, s)).collect();
        for ef in &cr.results.element_forces {
            let pl = sorted_point_loads(ef);
            let bound = sb
                .get(&ef.element_id)
                .map(|s| DemandBound { n: s.axial, my: s.moment, mz: 0.0, vy: s.shear })
                .unwrap_or(DemandBound { n: f64::NAN, my: f64::NAN, mz: f64::NAN, vy: f64::NAN });
            for j in 0..stations {
                let t = j as f64 / (stations - 1) as f64;
                demands.push(BoundedSteelDemand {
                    forces: ElementDesignForces {
                        element_id: ef.element_id,
                        n: compute_diagram_value_at_sorted("axial", t, ef, &pl),
                        my: compute_diagram_value_at_sorted("moment", t, ef, &pl),
                        mz: None,
                        vy: Some(compute_diagram_value_at_sorted("shear", t, ef, &pl)),
                    },
                    bound,
                });
            }
        }
    }
    Ok(demands)
}

/// 3D version of `steel_demands_from_combinations_2d` (N, My, Mz, Vy).
pub fn steel_demands_from_combinations_3d(
    out: &CertifiedMultiCase3D,
    stations: usize,
) -> Result<Vec<BoundedSteelDemand>, String> {
    let stations = stations.max(2);
    let mut demands = Vec::new();
    for (cr, cc) in out.results.combination_results.iter().zip(&out.combinations) {
        if !cc.certified {
            return Err(format!("combination '{}' not certified: {:?}", cc.name, cc.reason));
        }
        let sb: HashMap<usize, _> = cc.station_bounds.iter().map(|s| (s.element_id, s)).collect();
        for ef in &cr.results.element_forces {
            let bound = sb
                .get(&ef.element_id)
                .map(|s| DemandBound { n: s.axial, my: s.moment_y, mz: s.moment_z, vy: s.shear_y })
                .unwrap_or(DemandBound { n: f64::NAN, my: f64::NAN, mz: f64::NAN, vy: f64::NAN });
            for j in 0..stations {
                let t = j as f64 / (stations - 1) as f64;
                demands.push(BoundedSteelDemand {
                    forces: ElementDesignForces {
                        element_id: ef.element_id,
                        n: evaluate_diagram_3d_at(ef, "axial", t),
                        my: evaluate_diagram_3d_at(ef, "momentY", t),
                        mz: Some(evaluate_diagram_3d_at(ef, "momentZ", t)),
                        vy: Some(evaluate_diagram_3d_at(ef, "shearY", t)),
                    },
                    bound,
                });
            }
        }
    }
    Ok(demands)
}

// ───────────────────────────── EC2 (RC) ─────────────────────────────

/// EC2 design forces with their certified error bounds (`n`→NEd, `my`→MEd,
/// `vy`→VEd; `mz` unused).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedEc2Demand {
    pub forces: Ec2DesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedEc2CheckInput {
    pub members: Vec<Ec2MemberData>,
    pub demands: Vec<BoundedEc2Demand>,
}

const EC2_CHECK_NAMES: [&str; 2] = ["Flexure 6.1", "Shear 6.2"];

/// Interval enclosures of the EC2 flexure and shear ratios for one demand box.
/// Mirrors `ec2_check::check_single_ec2_member`; the shear resistance depends
/// on NEd (6.2.2(1) axial term) and is evaluated over the whole NEd interval.
pub fn ec2_ratio_enclosures(
    m: &Ec2MemberData,
    f: &Ec2DesignForces,
    b: &DemandBound,
) -> Result<[Interval; 2], String> {
    let mm = around(f.m_ed.unwrap_or(0.0), b.my, "MEd")?.abs();
    let v = around(f.v_ed.unwrap_or(0.0), b.vy, "VEd")?.abs();
    let n = around(f.n_ed.unwrap_or(0.0), b.n, "NEd")?;
    let flex: Ec2Flexure<Interval> = ec2_flexure(m);
    // `CheckLedger::ratio` (not `_if_loaded`): the flexural resistance must be
    // usable even without a moment.
    if !flex.m_rd.is_finite() || !(flex.m_rd.lo > 0.0) {
        return Err(format!("{}: MRd not certified positive ({:?})", EC2_CHECK_NAMES[0], flex.m_rd));
    }
    let flexure = mm.div(flex.m_rd);
    let shear: Ec2Shear<Interval> = ec2_shear(m, n);
    let shear = loaded_ratio(EC2_CHECK_NAMES[1], v, shear.v_rd)?;
    if !flexure.is_finite() || !shear.is_finite() {
        return Err("non-finite enclosure".into());
    }
    Ok([flexure, shear])
}

/// Certified EC2 member checks (flexure 6.1, shear 6.2).
pub fn certify_ec2_members(input: &CertifiedEc2CheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &EC2_CHECK_NAMES,
        |m, d| ec2_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// Demand sets with every force and moment multiplied by `s` (e.g. 1000 for
/// kN → N, kN·m → N·m). The bounds grow to cover the f64 rounding of each
/// scaled value: `|s·x − fl(s·x)| ≤ ε·|fl(s·x)|`.
pub fn scale_demands(demands: &[BoundedSteelDemand], s: f64) -> Vec<BoundedSteelDemand> {
    let up = |x: f64| x.next_up();
    let sc = |x: f64, b: f64| -> (f64, f64) {
        let v = s * x;
        (v, up(up(s.abs() * b) + up(v.abs() * f64::EPSILON)))
    };
    demands
        .iter()
        .map(|d| {
            let (n, bn) = sc(d.forces.n, d.bound.n);
            let (my, bmy) = sc(d.forces.my, d.bound.my);
            let (mz, bmz) = sc(d.forces.mz.unwrap_or(0.0), d.bound.mz);
            let (vy, bvy) = sc(d.forces.vy.unwrap_or(0.0), d.bound.vy);
            BoundedSteelDemand {
                forces: ElementDesignForces {
                    element_id: d.forces.element_id,
                    n,
                    my,
                    mz: d.forces.mz.map(|_| mz),
                    vy: d.forces.vy.map(|_| vy),
                },
                bound: DemandBound { n: bn, my: bmy, mz: bmz, vy: bvy },
            }
        })
        .collect()
}

/// The same demand sets in EC2 form (major-axis moment, shear, axial).
pub fn ec2_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedEc2Demand> {
    demands
        .iter()
        .map(|d| BoundedEc2Demand {
            forces: Ec2DesignForces {
                element_id: d.forces.element_id,
                m_ed: Some(d.forces.my),
                v_ed: d.forces.vy,
                n_ed: Some(d.forces.n),
            },
            bound: d.bound,
        })
        .collect()
}

/// Multi-case model plus steel member data: solve, certify the combinations,
/// then certify every member over all stations × combinations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelMultiCaseInput2D {
    pub multi_case: MultiCaseInput,
    pub members: Vec<SteelMemberData>,
    /// Stations per element (default 21, as the envelope diagrams).
    #[serde(default)]
    pub stations: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelMultiCaseInput3D {
    pub multi_case: MultiCaseInput3D,
    pub members: Vec<SteelMemberData>,
    #[serde(default)]
    pub stations: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedSteelMultiCase2D {
    pub analysis: CertifiedMultiCase2D,
    pub steel: Vec<CertifiedSteelResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedSteelMultiCase3D {
    pub analysis: CertifiedMultiCase3D,
    pub steel: Vec<CertifiedSteelResult>,
}

fn members_uncertified(members: &[SteelMemberData], reason: &str) -> Vec<CertifiedSteelResult> {
    members.iter().map(|m| uncertified(m.element_id, reason.to_string(), 0)).collect()
}

/// End to end, 2D: `certify_multi_case_2d` → station demands → `certify_steel_members`.
pub fn certify_steel_multi_case_2d(input: &SteelMultiCaseInput2D) -> Result<CertifiedSteelMultiCase2D, String> {
    let analysis = certify_multi_case_2d(&input.multi_case)?;
    let steel = match steel_demands_from_combinations_2d(&analysis, input.stations.unwrap_or(21)) {
        Ok(demands) => certify_steel_members(&CertifiedSteelCheckInput { members: input.members.clone(), demands }),
        Err(reason) => members_uncertified(&input.members, &reason),
    };
    Ok(CertifiedSteelMultiCase2D { analysis, steel })
}

/// End to end, 3D.
pub fn certify_steel_multi_case_3d(input: &SteelMultiCaseInput3D) -> Result<CertifiedSteelMultiCase3D, String> {
    let analysis = certify_multi_case_3d(&input.multi_case)?;
    let steel = match steel_demands_from_combinations_3d(&analysis, input.stations.unwrap_or(21)) {
        Ok(demands) => certify_steel_members(&CertifiedSteelCheckInput { members: input.members.clone(), demands }),
        Err(reason) => members_uncertified(&input.members, &reason),
    };
    Ok(CertifiedSteelMultiCase3D { analysis, steel })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::postprocess::steel_check::{check_steel_members, SteelCheckInput};

    /// W310x97-like section, SI units (N, m, Pa).
    pub(crate) fn w_member(id: usize, lb: f64) -> SteelMemberData {
        SteelMemberData {
            element_id: id,
            fy: 345e6,
            fu: Some(450e6),
            ag: 1.23e-2,
            an: Some(1.1e-2),
            u_factor: Some(0.9),
            aw: Some(3.08e-3),
            cv1: None,
            lby: lb,
            lbz: lb,
            ky: None,
            kz: None,
            iy: 2.22e-4,
            iz: 7.25e-5,
            ry: 0.134,
            rz: 0.0768,
            zy: 1.59e-3,
            zz: 7.23e-4,
            sy: 1.44e-3,
            sz: 4.77e-4,
            j: 9.1e-7,
            cw: Some(1.56e-6),
            lb: Some(lb),
            cb: Some(1.14),
            e: 200e9,
            g: None,
            depth: Some(0.308),
        }
    }

    struct Lcg(u64);
    impl Lcg {
        fn unit(&mut self) -> f64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
        fn range(&mut self, a: f64, b: f64) -> f64 {
            a + (b - a) * self.unit()
        }
    }

    fn random_member(g: &mut Lcg, id: usize) -> SteelMemberData {
        let mut m = w_member(id, g.range(0.5, 14.0));
        let s = g.range(0.3, 2.5);
        m.ag *= s;
        m.zy *= s * s;
        m.sy *= s * s;
        m.zz *= s * s;
        m.sz *= s * s;
        m.ry *= s.sqrt();
        m.rz *= s.sqrt();
        m.cw = if g.unit() < 0.2 { None } else { m.cw.map(|c| c * s * s * s) };
        m.fu = if g.unit() < 0.3 { None } else { m.fu };
        m.aw = if g.unit() < 0.2 { None } else { m.aw };
        m.cb = Some(g.range(1.0, 2.2));
        m.ky = Some(g.range(0.5, 2.1));
        m
    }

    fn random_forces(g: &mut Lcg, id: usize) -> ElementDesignForces {
        ElementDesignForces {
            element_id: id,
            n: g.range(-4e6, 4e6),
            my: g.range(-6e5, 6e5),
            mz: Some(g.range(-2e5, 2e5)),
            vy: Some(g.range(-8e5, 8e5)),
        }
    }

    fn f64_ratios(m: &SteelMemberData, f: &ElementDesignForces) -> [f64; 6] {
        let r = &check_steel_members(&SteelCheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        [r.tension_ratio, r.compression_ratio, r.flexure_y_ratio, r.flexure_z_ratio, r.shear_ratio, r.interaction_ratio]
    }

    const ZERO_BOUND: DemandBound = DemandBound { n: 0.0, my: 0.0, mz: 0.0, vy: 0.0 };

    /// The f64 check and the interval twin agree on point inputs: the
    /// enclosure contains the f64 value and is ulp-tight.
    #[test]
    fn f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(2024);
        for i in 0..3000 {
            let m = random_member(&mut g, i);
            let f = random_forces(&mut g, i);
            let r = steel_ratio_enclosures(&m, &f, &ZERO_BOUND).unwrap();
            let p = f64_ratios(&m, &f);
            for k in 0..6 {
                let tol = 1e-12 * p[k].abs().max(1e-300);
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "member {i} check {k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-12 * p[k].abs().max(1e-12), "member {i} check {k}: wide {:?}", r[k]);
            }
        }
    }

    /// Sampling the demand box with the f64 check never leaves the enclosure.
    #[test]
    fn enclosure_contains_sampled_demands() {
        let mut g = Lcg(77);
        for i in 0..400 {
            let m = random_member(&mut g, i);
            let f = random_forces(&mut g, i);
            let b = DemandBound {
                n: f.n.abs() * g.range(0.0, 0.3) + 1.0,
                my: f.my.abs() * g.range(0.0, 0.3),
                mz: f.mz.unwrap().abs() * g.range(0.0, 0.3),
                vy: f.vy.unwrap().abs() * g.range(0.0, 0.3),
            };
            let r = steel_ratio_enclosures(&m, &f, &b).unwrap();
            for _ in 0..50 {
                let s = ElementDesignForces {
                    element_id: i,
                    n: f.n + b.n * g.range(-1.0, 1.0),
                    my: f.my + b.my * g.range(-1.0, 1.0),
                    mz: Some(f.mz.unwrap() + b.mz * g.range(-1.0, 1.0)),
                    vy: Some(f.vy.unwrap() + b.vy * g.range(-1.0, 1.0)),
                };
                let p = f64_ratios(&m, &s);
                for k in 0..6 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
    }

    /// Demand box straddling the H1 switch at Pr/Pc = 0.2 (where H1-1a and
    /// H1-1b disagree): the enclosure must contain both branch values.
    #[test]
    fn straddled_h1_branch_takes_hull() {
        let m = w_member(1, 3.0);
        let pc: f64 = compression_capacity(&m);
        let mcy: f64 = flexural_capacity_y(&m);
        let my = 0.3 * mcy;
        let f = ElementDesignForces { element_id: 1, n: -0.2 * pc, my, mz: Some(0.0), vy: Some(0.0) };
        let b = DemandBound { n: 0.01 * pc, my: 0.0, mz: 0.0, vy: 0.0 };
        let r = steel_ratio_enclosures(&m, &f, &b).unwrap()[5];
        let a = 0.195 / 2.0 + 0.3; // H1-1b just below the switch
        let c = 0.205 + 8.0 / 9.0 * 0.3; // H1-1a just above
        assert!(r.lo <= a && a <= r.hi && r.lo <= c && c <= r.hi, "{r:?}");
        // the jump at the switch: 0.2 + 8/9·0.3 vs 0.1 + 0.3
        assert!(r.hi >= 0.2 + 8.0 / 9.0 * 0.3 && r.lo <= 0.1 + 0.3);
    }

    /// The certificate refuses (never under-bounds) on bad input.
    #[test]
    fn refuses_invalid_bounds_and_capacities() {
        let m = w_member(1, 3.0);
        let f = ElementDesignForces { element_id: 1, n: -1e5, my: 1e5, mz: None, vy: Some(1e4) };
        for b in [
            DemandBound { n: f64::NAN, ..ZERO_BOUND },
            DemandBound { my: -1.0, ..ZERO_BOUND },
            DemandBound { vy: f64::INFINITY, ..ZERO_BOUND },
        ] {
            assert!(steel_ratio_enclosures(&m, &f, &b).is_err(), "{b:?}");
        }
        // Zero plastic modulus with a moment demand: no capacity to certify.
        let mut bad = m.clone();
        bad.zy = 0.0;
        assert!(steel_ratio_enclosures(&bad, &f, &ZERO_BOUND).is_err());
        // ... but with no moment the flexure check does not apply.
        let f0 = ElementDesignForces { my: 0.0, ..f.clone() };
        let r0 = steel_ratio_enclosures(&bad, &f0, &ZERO_BOUND);
        assert!(r0.is_ok(), "{r0:?}");
        // Member level: uncertified, never "ok".
        let res = certify_steel_members(&CertifiedSteelCheckInput {
            members: vec![bad, w_member(2, 3.0)],
            demands: vec![BoundedSteelDemand { forces: f.clone(), bound: ZERO_BOUND }],
        });
        assert!(res.iter().all(|r| !r.certified && !r.certified_ok), "{res:?}");
    }

    /// Member results: max over demand sets; ok / fail flags are certified.
    #[test]
    fn member_aggregates_over_demands() {
        let m = w_member(1, 3.0);
        let mcy: f64 = flexural_capacity_y(&m);
        let mk = |my: f64| BoundedSteelDemand {
            forces: ElementDesignForces { element_id: 1, n: 0.0, my, mz: None, vy: None },
            bound: DemandBound { n: 0.0, my: 0.01 * mcy, mz: 0.0, vy: 0.0 },
        };
        let res = certify_steel_members(&CertifiedSteelCheckInput {
            members: vec![m.clone()],
            demands: vec![mk(0.2 * mcy), mk(-0.7 * mcy), mk(0.5 * mcy)],
        });
        let r = &res[0];
        assert!(r.certified && r.certified_ok && !r.certified_fail);
        assert!(r.utilization_lower <= 0.69 + 1e-12 && r.utilization_upper >= 0.71 - 1e-12, "{r:?}");
        assert!(r.utilization_upper < 0.72);
        let res = certify_steel_members(&CertifiedSteelCheckInput { members: vec![m], demands: vec![mk(1.5 * mcy)] });
        assert!(res[0].certified_fail && !res[0].certified_ok);
    }

    // ───────────── EC3 ─────────────

    use crate::postprocess::ec3_check::{check_ec3_members, BucklingCurve, Ec3CheckInput, SectionClass};

    /// IPE 300-like section, SI units.
    fn ipe(id: usize, l: f64) -> Ec3MemberData {
        Ec3MemberData {
            element_id: id,
            fy: 355e6,
            e: None,
            a: 5.381e-3,
            a_eff: None,
            wpl_y: 6.28e-4,
            wel_y: 5.57e-4,
            weff_y: None,
            wpl_z: 1.25e-4,
            wel_z: 8.05e-5,
            weff_z: None,
            iy: 8.356e-5,
            iz: 6.04e-6,
            it: 2.01e-7,
            iw: 1.26e-7,
            lcr_y: l,
            lcr_z: l,
            lb: l,
            section_class: SectionClass::Class1,
            buckling_curve_y: BucklingCurve::A,
            buckling_curve_z: BucklingCurve::B,
            buckling_curve_lt: BucklingCurve::B,
            gamma_m0: None,
            gamma_m1: Some(1.0),
            c1: Some(1.13),
            av: Some(2.568e-3),
        }
    }

    fn random_ec3(g: &mut Lcg, id: usize) -> Ec3MemberData {
        let mut m = ipe(id, g.range(0.3, 12.0));
        let s = g.range(0.4, 2.5);
        m.a *= s;
        m.wpl_y *= s * s;
        m.wel_y *= s * s;
        m.wpl_z *= s * s;
        m.wel_z *= s * s;
        m.iy *= s * s;
        m.iz *= s * s;
        m.section_class = [SectionClass::Class1, SectionClass::Class2, SectionClass::Class3, SectionClass::Class4]
            [(g.unit() * 4.0) as usize % 4];
        m.buckling_curve_y = [BucklingCurve::A, BucklingCurve::B, BucklingCurve::C, BucklingCurve::D][(g.unit() * 4.0) as usize % 4];
        m.lcr_y *= g.range(0.5, 2.0);
        m.gamma_m1 = Some(g.range(1.0, 1.1));
        m.av = if g.unit() < 0.3 { None } else { m.av };
        m
    }

    fn random_ec3_forces(g: &mut Lcg, id: usize) -> Ec3DesignForces {
        let pick = |g: &mut Lcg, x: f64| if g.unit() < 0.15 { None } else { Some(g.range(-x, x)) };
        Ec3DesignForces { element_id: id, n_ed: pick(g, 2e6), my_ed: pick(g, 3e5), mz_ed: pick(g, 5e4), v_ed: pick(g, 6e5) }
    }

    fn ec3_f64(m: &Ec3MemberData, f: &Ec3DesignForces) -> [f64; 6] {
        let r = &check_ec3_members(&Ec3CheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
        [r.compression_ratio, r.tension_ratio, r.flexure_ratio_y, r.flexure_ratio_z, r.shear_ratio, r.interaction_ratio]
    }

    #[test]
    fn ec3_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(99);
        for i in 0..3000 {
            let m = random_ec3(&mut g, i);
            let f = random_ec3_forces(&mut g, i);
            let r = ec3_ratio_enclosures(&m, &f, &ZERO_BOUND).unwrap();
            let p = ec3_f64(&m, &f);
            for k in 0..6 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-12 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
    }

    #[test]
    fn ec3_enclosure_contains_sampled_demands() {
        let mut g = Lcg(5);
        for i in 0..300 {
            let m = random_ec3(&mut g, i);
            let f = random_ec3_forces(&mut g, i);
            let b = DemandBound {
                n: f.n_ed.unwrap_or(0.0).abs() * g.range(0.0, 0.4) + 10.0,
                my: f.my_ed.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
                mz: f.mz_ed.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
                vy: f.v_ed.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
            };
            let r = ec3_ratio_enclosures(&m, &f, &b).unwrap();
            for _ in 0..40 {
                let jit = |g: &mut Lcg, x: Option<f64>, d: f64| Some(x.unwrap_or(0.0) + d * g.range(-1.0, 1.0));
                let s = Ec3DesignForces {
                    element_id: i,
                    n_ed: jit(&mut g, f.n_ed, b.n),
                    my_ed: jit(&mut g, f.my_ed, b.my),
                    mz_ed: jit(&mut g, f.mz_ed, b.mz),
                    v_ed: jit(&mut g, f.v_ed, b.vy),
                };
                let p = ec3_f64(&m, &s);
                for k in 0..6 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
            // n straddling 0 switches the interaction between its three forms.
            let fz = Ec3DesignForces { n_ed: Some(0.0), ..f.clone() };
            let r = ec3_ratio_enclosures(&m, &fz, &DemandBound { n: 1e4, ..b }).unwrap();
            for nn in [-1e4, 0.0, 1e4] {
                let p = ec3_f64(&m, &Ec3DesignForces { n_ed: Some(nn), ..fz.clone() })[5];
                assert!(r[5].lo <= p * (1.0 + 1e-12) && p <= r[5].hi * (1.0 + 1e-12), "{i}: {p} ∉ {:?}", r[5]);
            }
        }
    }

    #[test]
    fn ec3_refuses() {
        let m = ipe(1, 4.0);
        let f = Ec3DesignForces { element_id: 1, n_ed: Some(-1e5), my_ed: Some(5e4), mz_ed: None, v_ed: None };
        assert!(ec3_ratio_enclosures(&m, &f, &DemandBound { n: f64::NAN, ..ZERO_BOUND }).is_err());
        let mut bad = m.clone();
        bad.lb = 0.0; // Mcr = ∞·… → chi_LT not finite
        assert!(ec3_ratio_enclosures(&bad, &f, &ZERO_BOUND).is_err());
        let mut bad = m.clone();
        bad.fy = 0.0;
        let res = certify_ec3_members(&CertifiedEc3CheckInput {
            members: vec![bad],
            demands: vec![BoundedEc3Demand { forces: f, bound: ZERO_BOUND }],
        });
        assert!(!res[0].certified && !res[0].certified_ok);
    }

    // ───────────── EC2 ─────────────

    use crate::postprocess::ec2_check::{check_ec2_members, Ec2CheckInput};

    fn rc_beam(g: &mut Lcg, id: usize) -> Ec2MemberData {
        let h = g.range(0.3, 0.9);
        let b = g.range(0.2, 0.6);
        let d = h - 0.05;
        let doubly = g.unit() < 0.4;
        let stirrups = g.unit() < 0.6;
        Ec2MemberData {
            element_id: id,
            fck: [25e6, 30e6, 40e6, 50e6, 60e6, 80e6][(g.unit() * 6.0) as usize % 6],
            fyk: 500e6,
            b,
            h,
            d,
            as_tension: b * d * g.range(0.003, 0.025),
            as_compression: if doubly { Some(b * d * g.range(0.001, 0.008)) } else { None },
            d_prime: if doubly { Some(0.05) } else { None },
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: if g.unit() < 0.5 { Some(0.85) } else { None },
            asw: if stirrups { Some(g.range(1e-4, 4e-4)) } else { None },
            s_stirrup: if stirrups { Some(g.range(0.1, 0.3)) } else { None },
            theta_shear: if g.unit() < 0.5 { Some(g.range(0.3, 0.9)) } else { None },
            bw: None,
            z: None,
        }
    }

    fn ec2_f64(m: &Ec2MemberData, f: &Ec2DesignForces) -> [f64; 2] {
        let r = &check_ec2_members(&Ec2CheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
        [r.flexure_ratio, r.shear_ratio]
    }

    fn rc_forces(g: &mut Lcg, id: usize) -> Ec2DesignForces {
        Ec2DesignForces {
            element_id: id,
            m_ed: Some(g.range(-6e5, 6e5)),
            v_ed: Some(g.range(-5e5, 5e5)),
            n_ed: if g.unit() < 0.3 { None } else { Some(g.range(-3e6, 1e6)) },
        }
    }

    #[test]
    fn ec2_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(31);
        let mut n = 0;
        for i in 0..3000 {
            let m = rc_beam(&mut g, i);
            let f = rc_forces(&mut g, i);
            let Ok(r) = ec2_ratio_enclosures(&m, &f, &ZERO_BOUND) else {
                // Only refusals where the f64 check also could not evaluate.
                let res = &check_ec2_members(&Ec2CheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
                assert!(!res.unevaluated.is_empty() || !(res.m_rd > 0.0), "{i}: refused an evaluable member {res:?}");
                continue;
            };
            n += 1;
            let p = ec2_f64(&m, &f);
            for k in 0..2 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-11 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
        assert!(n > 2500, "{n}");
    }

    #[test]
    fn ec2_enclosure_contains_sampled_demands() {
        let mut g = Lcg(8);
        for i in 0..300 {
            let m = rc_beam(&mut g, i);
            let f = rc_forces(&mut g, i);
            let b = DemandBound {
                n: f.n_ed.unwrap_or(0.0).abs() * g.range(0.0, 0.5) + 1e3,
                my: f.m_ed.unwrap().abs() * g.range(0.0, 0.3),
                mz: 0.0,
                vy: f.v_ed.unwrap().abs() * g.range(0.0, 0.3),
            };
            let Ok(r) = ec2_ratio_enclosures(&m, &f, &b) else { continue };
            for _ in 0..40 {
                let s = Ec2DesignForces {
                    element_id: i,
                    m_ed: Some(f.m_ed.unwrap() + b.my * g.range(-1.0, 1.0)),
                    v_ed: Some(f.v_ed.unwrap() + b.vy * g.range(-1.0, 1.0)),
                    n_ed: Some(f.n_ed.unwrap_or(0.0) + b.n * g.range(-1.0, 1.0)),
                };
                let p = ec2_f64(&m, &s);
                for k in 0..2 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
    }

    #[test]
    fn ec2_refuses() {
        let mut g = Lcg(1);
        let mut m = rc_beam(&mut g, 1);
        let f = rc_forces(&mut g, 1);
        assert!(ec2_ratio_enclosures(&m, &f, &DemandBound { vy: -1.0, ..ZERO_BOUND }).is_err());
        m.as_tension = 0.0;
        m.as_compression = None;
        m.d_prime = None;
        let res = certify_ec2_members(&CertifiedEc2CheckInput {
            members: vec![m],
            demands: vec![BoundedEc2Demand { forces: Ec2DesignForces { m_ed: Some(0.0), ..f }, bound: ZERO_BOUND }],
        });
        assert!(!res[0].certified, "{res:?}"); // MRd = 0: the f64 check flags it even at M = 0
    }

    #[test]
    fn scaling_widens_for_rounding() {
        let mut g = Lcg(3);
        for _ in 0..10000 {
            let x = g.range(-1e6, 1e6);
            let b = if g.unit() < 0.3 { 0.0 } else { g.range(0.0, 1e-6) };
            let s = [1000.0, 1e-3, 0.1, 3.7][(g.unit() * 4.0) as usize % 4];
            let d = BoundedSteelDemand {
                forces: ElementDesignForces { element_id: 0, n: x, my: x, mz: Some(x), vy: None },
                bound: DemandBound { n: b, my: b, mz: b, vy: b },
            };
            let o = &scale_demands(&[d], s)[0];
            // exact s·x = p + e; every point of s·[x − b, x + b] within the new bound
            let p = s * x;
            let e = s.mul_add(x, -p);
            let dev = ((p - o.forces.n) + e).abs() + s * b;
            assert!(dev <= o.bound.n * (1.0 - 1e-15) || dev <= o.bound.n, "{x} {b} {s}");
            assert!(o.forces.vy.is_none());
        }
    }
}
