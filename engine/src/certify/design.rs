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
//! (`ec3_check`) member checks; EC2 (`ec2_check`) RC flexure and shear;
//! CIRSOC 201 (`cirsoc201_check`) RC flexure and shear; ACI 318 (`rc_check`)
//! RC flexure (incl. P-M interaction), shear and axial capacity; NDS timber
//! (`timber_check`); AISI S100 cold-formed steel (`cfs_check`); CIRSOC 301
//! (`cirsoc301_check`) steel member checks D, E (incl. E.4, E.5, E.6, E.7), F.2–F.6, G, H.1.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::combinations::{certify_multi_case_2d, certify_multi_case_3d, CertifiedMultiCase2D, CertifiedMultiCase3D};
use crate::solver::load_cases::{MultiCaseInput, MultiCaseInput3D};
use super::interval::Interval;
use super::real::{branch, Real, Tri};
use crate::postprocess::diagrams::{compute_diagram_value_at_sorted, sorted_point_loads};
use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
use crate::postprocess::ec2_check::{
    ec2_flexure, ec2_flexure_valid, ec2_shear, Ec2DesignForces, Ec2Flexure, Ec2MemberData, Ec2Shear,
};
use crate::postprocess::ec3_check::{
    ec3_capacities, ec3_cm_inputs_valid, ec3_interaction, Ec3Capacities, Ec3DesignForces, Ec3MemberData,
};
use crate::postprocess::cirsoc201_check::{
    ductility_applies as cirsoc201_ductility_applies, ductility_strain_r as cirsoc201_ductility_strain,
    min_shear_missing as cirsoc201_min_shear_missing, nominal_flexure_axial_r as cirsoc201_nominal_flexure,
    phi_flexure_r as cirsoc201_phi, shear_inputs_valid as cirsoc201_shear_valid,
    shear_strength_r as cirsoc201_shear_strength, Cirsoc201DesignForces, Cirsoc201MemberData, CIRSOC201_DUCTILITY,
    CIRSOC201_FLEXURE, CIRSOC201_MIN_SHEAR, CIRSOC201_SHEAR,
};
use crate::postprocess::cirsoc301_check::{Cirsoc301DesignForces, Cirsoc301MemberData};
use crate::postprocess::rc_check::{
    axial_capacity as rc_axial_capacity, flexural_capacity as rc_flexural_capacity,
    flexure_section as rc_flexure_section, interaction_c_range, interaction_point,
    shear_capacity as rc_shear_capacity, RCDesignForces, RCMemberData, RCSectionType, RC_AXIAL, RC_FLEXURE,
    RC_SHEAR,
};
use crate::postprocess::cfs_check::{
    cfs_capacities, CfsCapacities, CfsDesignForces, CfsMemberData, CFS_CHECK_NAMES, PHI_B as CFS_PHI_B,
    PHI_C as CFS_PHI_C, PHI_T as CFS_PHI_T, PHI_V as CFS_PHI_V,
};
use crate::postprocess::rc_flexure::RcFlexureSection;
use crate::postprocess::timber_check::{
    timber_capacities, timber_interaction, TimberCapacities, TimberDesignForces, TimberMemberData, TIMBER_CHECK_NAMES,
};
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
fn certify_members<M: Serialize, D: Serialize>(
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
            // Nothing is certified from non-finite member data or demands;
            // a non-finite ratio would vanish in the f64::max below.
            if let Err(e) = super::finite::check_input(&(m, demands)) {
                return uncertified(eid, e, demands.len());
            }
            let mut acc = vec![Interval::ZERO; names.len()];
            for d in demands {
                match enclose(m, d) {
                    Ok(r) if r.iter().any(|x| !x.is_finite()) => {
                        return uncertified(eid, "non-finite ratio enclosure".into(), demands.len())
                    }
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
    // 6.3.3, eqs. (6.61)/(6.62) with Annex B factors in compression — the
    // same `ec3_interaction` the f64 check runs; the linear sum of 6.2.1(7)
    // in tension. Every capacity used is certified positive wherever its
    // demand can be non-zero, so the f64 guards are exactly these ratios.
    if n.lt(zero) != super::real::Tri::False && !ec3_cm_inputs_valid(m) {
        return Err("Interaction 6.3.3: Cm outside Table B.3's [0.4, 1]".into());
    }
    let interaction = branch(
        n.lt(zero),
        || {
            let ([e1, e2, e3], _) = ec3_interaction(m, &caps, -n, my, mz);
            e1.max(e2).max(e3)
        },
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

/// Most stations per element for the demand sets: the count comes from the
/// caller and multiplies elements × combinations.
pub const MAX_DEMAND_STATIONS: usize = 1_001;

/// Demand sets for every element at `stations` evenly spaced stations
/// (t = 0..1) of every combination, with the combination's certified station
/// bounds (2D: N, M about the major axis, V). Err if any combination is
/// uncertified; an element lacking a bound in some combination gets a NaN
/// bound so its check refuses rather than silently skipping that combination.
pub fn steel_demands_from_combinations_2d(
    out: &CertifiedMultiCase2D,
    stations: usize,
) -> Result<Vec<BoundedSteelDemand>, String> {
    if stations > MAX_DEMAND_STATIONS {
        return Err(format!("stations {stations} exceeds the maximum of {MAX_DEMAND_STATIONS}"));
    }
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
    if stations > MAX_DEMAND_STATIONS {
        return Err(format!("stations {stations} exceeds the maximum of {MAX_DEMAND_STATIONS}"));
    }
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
/// Mirrors `ec2_check::check_single_ec2_member`; the neutral axis is the
/// certified unique root of the strain-compatibility residual, and the shear
/// resistance depends on NEd (6.2.2(1) axial term) evaluated over the whole
/// NEd interval.
pub fn ec2_ratio_enclosures(
    m: &Ec2MemberData,
    f: &Ec2DesignForces,
    b: &DemandBound,
) -> Result<[Interval; 2], String> {
    if !ec2_flexure_valid(m) {
        return Err(format!("{}: section data outside the certified domain: {m:?}", EC2_CHECK_NAMES[0]));
    }
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

// ───────────────────────────── CIRSOC 201 (RC) ─────────────────────────────

/// CIRSOC 201 design forces with their certified error bounds (`my`→Mu,
/// `vy`→Vu; `n`, `mz` unused).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedCirsoc201Demand {
    pub forces: Cirsoc201DesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedCirsoc201CheckInput {
    pub members: Vec<Cirsoc201MemberData>,
    pub demands: Vec<BoundedCirsoc201Demand>,
}

const CIRSOC201_CHECK_NAMES: [&str; 4] = [CIRSOC201_FLEXURE, CIRSOC201_DUCTILITY, CIRSOC201_SHEAR, CIRSOC201_MIN_SHEAR];

/// Flexure ratio as `CheckLedger::ratio`: the capacity must be certified
/// positive even with no moment (the f64 check flags it otherwise).
fn required_ratio(name: &str, d: Interval, cap: Interval) -> Result<Interval, String> {
    if !cap.is_finite() || !(cap.lo > 0.0) {
        return Err(format!("{name}: capacity not certified positive ({cap:?})"));
    }
    let r = d.div(cap);
    if r.is_finite() { Ok(r) } else { Err(format!("{name}: non-finite ratio")) }
}

/// Refuse a flexure section whose force residual is not provably strictly
/// increasing (the uniqueness argument of `rc_flexure`).
fn require_monotone(sec: &RcFlexureSection) -> Result<(), String> {
    if sec.monotone() { Ok(()) } else { Err(format!("section data outside the certified domain: {sec:?}")) }
}

/// Interval enclosures of the four CIRSOC 201 ratios (flexure, ductility,
/// shear, minimum shear reinforcement) for one demand box. Mirrors
/// `cirsoc201_check::check_single_cirsoc201` through the same generic
/// formulas. The neutral axis is the certified unique root of the
/// strain-compatibility residual. The ductility ratio is εt,min/εt where the
/// clause applies (0 where it certainly does not; the hull where undecided).
/// Minimum shear reinforcement has ratio 0 when it is certainly not required
/// or present; when it may be required and missing the box is refused (the
/// f64 check fails it). A box with εt ≤ 0 possible is refused.
pub fn cirsoc201_ratio_enclosures(
    m: &Cirsoc201MemberData,
    f: &Cirsoc201DesignForces,
    b: &DemandBound,
) -> Result<[Interval; 4], String> {
    let mu = around(f.mu.unwrap_or(0.0), b.my, "Mu")?.abs();
    let vu = around(f.vu.unwrap_or(0.0), b.vy, "Vu")?.abs();
    let nu = around(f.axial_compression.unwrap_or(0.0), if f.axial_compression.is_some() { b.n } else { 0.0 }, "Nu")?;
    let es = m.es.unwrap_or(200e9);
    let flex = cirsoc201_nominal_flexure::<Interval>(m, nu, f.axial_compression.unwrap_or(0.0))
        .ok_or_else(|| format!("section data outside the certified domain: {m:?}"))?;
    if !(flex.mn.is_finite() && flex.epsilon_t.is_finite()) {
        return Err("neutral axis not certified".into());
    }
    let phi = cirsoc201_phi::<Interval>(m.edition, flex.epsilon_t, m.fy, es);
    let flexure = required_ratio(CIRSOC201_FLEXURE, mu, phi * flex.mn)?;

    let applies = cirsoc201_ductility_applies::<Interval>(m, mu, nu);
    let ductility = match applies {
        Tri::False => Interval::ZERO,
        _ => {
            if !(flex.epsilon_t.lo > 0.0) {
                return Err(format!("{CIRSOC201_DUCTILITY}: εt not certified positive"));
            }
            let r = cirsoc201_ductility_strain::<Interval>(m.edition, m.fy, es).div(flex.epsilon_t);
            if applies == Tri::True { r } else { r.hull(Interval::ZERO) }
        }
    };

    if !cirsoc201_shear_valid(m) {
        return Err(format!("{CIRSOC201_SHEAR}: section data outside the certified domain"));
    }
    let sh = cirsoc201_shear_strength::<Interval>(m, nu)
        .ok_or_else(|| format!("{CIRSOC201_SHEAR}: not evaluable"))?;
    let shear = loaded_ratio(CIRSOC201_SHEAR, vu, Interval::lit(0.75) * (sh.vc + sh.vs))?;
    let min_shear = match cirsoc201_min_shear_missing::<Interval>(m, &sh, vu) {
        Tri::False => Interval::ZERO,
        _ => return Err(format!("{CIRSOC201_MIN_SHEAR}: required and missing, or undecided")),
    };
    Ok([flexure, ductility, shear, min_shear])
}

/// Certified CIRSOC 201 member checks (flexure, shear).
pub fn certify_cirsoc201_members(input: &CertifiedCirsoc201CheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &CIRSOC201_CHECK_NAMES,
        |m, d| cirsoc201_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in CIRSOC 201 form (major-axis moment, shear).
pub fn cirsoc201_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedCirsoc201Demand> {
    demands
        .iter()
        .map(|d| BoundedCirsoc201Demand {
            // `n` is tension-positive; CIRSOC 201 takes compression positive.
            forces: Cirsoc201DesignForces {
                element_id: d.forces.element_id,
                mu: Some(d.forces.my),
                vu: d.forces.vy,
                axial_compression: Some(-d.forces.n),
            },
            bound: d.bound,
        })
        .collect()
}

// ───────────────────────────── CIRSOC 301 (steel) ─────────────────────────────

/// CIRSOC 301 design forces with their certified error bounds: `n`→Nu
/// (compression-positive, as the forces), `my`→Mu strong axis, `mz`→Mu weak
/// axis, `vy`→Vu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedCirsoc301Demand {
    pub forces: Cirsoc301DesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedCirsoc301CheckInput {
    pub members: Vec<Cirsoc301MemberData>,
    pub demands: Vec<BoundedCirsoc301Demand>,
}

pub const CIRSOC301_CHECK_NAMES: [&str; 6] =
    ["Tension D.2", "Compression E", "Flexure-x F", "Flexure-y F.6", "Shear G", "Interaction H.1"];

fn tri_or(a: Tri, b: Tri) -> Tri {
    match (a, b) {
        (Tri::True, _) | (_, Tri::True) => Tri::True,
        (Tri::False, Tri::False) => Tri::False,
        _ => Tri::Unknown,
    }
}

/// A check that runs only for some demands: its enclosure where it certainly
/// runs, `[0, hi]` where that is undecided (it can only raise the maximum, so
/// the lower bound must not count it), 0 where it certainly does not.
fn present(t: Tri, r: impl FnOnce() -> Result<Interval, String>) -> Result<Interval, String> {
    match t {
        Tri::False => Ok(Interval::ZERO),
        Tri::True => r(),
        Tri::Unknown => r().map(|r| Interval::new(0.0, r.hi.max(0.0))),
    }
}

fn refused_cap<T>(name: &str, r: Result<T, String>) -> impl FnOnce() -> Result<T, String> {
    let name = name.to_string();
    move || r.map_err(|m| format!("{name}: not evaluated ({m})"))
}

/// Interval enclosures of the six CIRSOC 301 ratios for one demand box,
/// through the same generic capacity functions as `cirsoc301_check::check_member`.
/// A check refused (not evaluated) while its demand may be non-zero refuses
/// the box: the f64 check fails it, it is never certified.
pub fn cirsoc301_ratio_enclosures(
    m: &Cirsoc301MemberData,
    f: &Cirsoc301DesignForces,
    b: &DemandBound,
) -> Result<[Interval; 6], String> {
    use crate::postprocess::cirsoc301_check as c3;
    let n = around(f.nu, b.n, "Nu")?;
    let mx = around(f.mu_strong, b.my, "Mux")?.abs();
    let my = around(f.mu_weak, b.mz, "Muy")?.abs();
    let v = around(f.vu, b.vy, "Vu")?.abs();
    let zero = Interval::ZERO;
    let tiny = Interval::point(1e-6);
    let mut off = c3::Steps::new(false);
    let fmt = |m: c3::Msg| m.key;

    let (phi_y, rup) = c3::tension_capacity::<Interval>(m, &mut off);
    let cap_t = rup.map(|r| phi_y.min(r)).map_err(fmt);
    let cap_c = c3::compression_capacity::<Interval>(m, &mut off).map(|c| c.phi_pn).map_err(fmt);
    let cap_x = c3::flexure_capacity::<Interval>(m, true, &mut off).map(|c| c.phi_mn).map_err(|(r, _)| r.key);
    let cap_y = c3::flexure_capacity::<Interval>(m, false, &mut off).map(|c| c.phi_mn).map_err(|(r, _)| r.key);
    let cap_v = c3::shear_capacity::<Interval>(m, &mut off).phi_vn;

    // A demand identically zero needs no capacity (ratio 0, as the f64 check).
    let ratio = |name: &str, d: Interval, cap: &Result<Interval, String>| -> Result<Interval, String> {
        if d.lo == 0.0 && d.hi == 0.0 {
            return Ok(zero);
        }
        let cap = refused_cap(name, cap.clone())()?;
        loaded_ratio(name, d, cap)
    };
    let t_dem = (-n).max(zero);
    let c_dem = n.max(zero);
    let tension = present(n.lt(zero), || ratio(CIRSOC301_CHECK_NAMES[0], t_dem, &cap_t))?;
    let compression = present(zero.lt(n), || ratio(CIRSOC301_CHECK_NAMES[1], c_dem, &cap_c))?;
    let flex_x = ratio(CIRSOC301_CHECK_NAMES[2], mx, &cap_x)?;
    let has_my = tiny.lt(my);
    let flex_y_full = ratio(CIRSOC301_CHECK_NAMES[3], my, &cap_y);
    let flex_y = present(has_my, || flex_y_full.clone())?;
    let shear = loaded_ratio(CIRSOC301_CHECK_NAMES[4], v, cap_v)?;

    let has_axial = tiny.lt(n.abs());
    let has_mx = tiny.lt(mx);
    let inter_runs = tri_or(has_axial.and(tri_or(has_mx, has_my)), has_mx.and(has_my));
    let interaction = present(inter_runs, || {
        // H.1: the axial ratio of the demand's sign (compression at Nu = 0), the
        // flexural ratios of both axes.
        let ar_t = ratio(CIRSOC301_CHECK_NAMES[0], t_dem, &cap_t);
        let ar_c = ratio(CIRSOC301_CHECK_NAMES[1], c_dem, &cap_c);
        let ar = match n.lt(zero) {
            Tri::True => ar_t?,
            Tri::False => ar_c?,
            Tri::Unknown => ar_t?.hull(ar_c?),
        };
        let ry = flex_y_full.clone()?;
        Ok(cirsoc301_interaction(ar, flex_x, ry))
    })?;
    let out = [tension, compression, flex_x, flex_y, shear, interaction];
    for (r, name) in out.iter().zip(CIRSOC301_CHECK_NAMES) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok(out)
}

fn cirsoc301_interaction(ar: Interval, rx: Interval, ry: Interval) -> Interval {
    crate::postprocess::cirsoc301_check::interaction_h1(ar, rx, ry)
}

/// Certified CIRSOC 301 member checks (see `certify_steel_members`).
pub fn certify_cirsoc301_members(input: &CertifiedCirsoc301CheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &CIRSOC301_CHECK_NAMES,
        |m, d| cirsoc301_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in CIRSOC 301 form (`n` tension-positive there,
/// compression-positive here).
pub fn cirsoc301_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedCirsoc301Demand> {
    demands
        .iter()
        .map(|d| BoundedCirsoc301Demand {
            forces: Cirsoc301DesignForces {
                element_id: d.forces.element_id,
                nu: -d.forces.n,
                mu_strong: d.forces.my,
                mu_weak: d.forces.mz.unwrap_or(0.0),
                vu: d.forces.vy.unwrap_or(0.0),
            },
            bound: d.bound,
        })
        .collect()
}

// ───────────────────────────── ACI 318 (RC) ─────────────────────────────

/// ACI 318 RC design forces with their certified error bounds (`my`→Mu,
/// `vy`→Vu, `n`→Nu tension-positive; `mz` unused).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedRcDemand {
    pub forces: RCDesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedRcCheckInput {
    pub members: Vec<RCMemberData>,
    pub demands: Vec<BoundedRcDemand>,
}

const RC_CHECK_NAMES: [&str; 3] = [RC_FLEXURE, RC_SHEAR, RC_AXIAL];

/// Most boxes the axial-flexure branch and bound may evaluate before refusing.
const PM_MAX_BOXES: usize = 200_000;

/// Enclosure of phi*Mn over every point of the interaction diagram whose
/// phi*Pn lies in `pu` (compression positive): the f64 check bisects to *a*
/// crossing phi*Pn(c) = Pu, which this set contains whichever crossing it is
/// (phi*Pn need not be monotonic). Branch and bound over the neutral-axis
/// range: boxes whose phi*Pn enclosure misses `pu` are dropped, boxes inside
/// it are kept once narrow, boxes straddling its edge are split down to a
/// relative width of 1e-12. Err unless `pu` is certified to lie strictly
/// inside (phi*Pn(lo), phi*Pn(hi)] — off the diagram the f64 check flags the
/// flexure check unevaluated.
fn interaction_moment_enclosure(m: &RCMemberData, es: f64, pu: Interval) -> Result<Interval, String> {
    let (c_lo, c_hi) = interaction_c_range(m);
    let p_at = |c: f64| interaction_point::<Interval>(m, es, Interval::point(c)).0;
    let (p_lo, p_hi) = (p_at(c_lo), p_at(c_hi));
    if !(p_lo.is_finite() && p_hi.is_finite() && p_lo.hi < pu.lo && pu.hi <= p_hi.lo) {
        return Err(format!("{RC_FLEXURE}: axial load {pu:?} not certified on the interaction diagram"));
    }
    let narrow = 1e-12 * c_hi;
    let inside_narrow = 1e-4 * c_hi;
    let mut stack = vec![Interval::new(c_lo, c_hi)];
    let mut hull: Option<Interval> = None;
    let mut boxes = 0usize;
    while let Some(c) = stack.pop() {
        boxes += 1;
        if boxes > PM_MAX_BOXES {
            return Err(format!("{RC_FLEXURE}: interaction branch and bound did not converge"));
        }
        let (p, mn, _, _) = interaction_point::<Interval>(m, es, c);
        if !p.is_finite() || !mn.is_finite() {
            return Err(format!("{RC_FLEXURE}: non-finite interaction point on {c:?}"));
        }
        if p.hi < pu.lo || p.lo > pu.hi {
            continue; // no crossing for any Pu in the box
        }
        let inside = pu.lo <= p.lo && p.hi <= pu.hi;
        let w = c.hi - c.lo;
        if w <= narrow || (inside && w <= inside_narrow) {
            hull = Some(match hull {
                None => mn,
                Some(h) => Interval::new(h.lo.min(mn.lo), h.hi.max(mn.hi)),
            });
            continue;
        }
        let mid = 0.5 * (c.lo + c.hi);
        stack.push(Interval::new(c.lo, mid));
        stack.push(Interval::new(mid, c.hi));
    }
    // Non-empty: pu inside (p_lo, p_hi] gives a crossing for every Pu by continuity.
    let h = hull.ok_or_else(|| format!("{RC_FLEXURE}: no interaction point found"))?;
    Ok(h.max(Interval::ZERO)) // `phi_mn.max(0.0)`
}

/// Interval enclosures of the ACI 318 flexure, shear and axial ratios for one
/// demand box. Mirrors `rc_check::check_single_rc_member`: Nu = 0 uses the
/// pure-flexure strength, Nu ≠ 0 on a rectangular section the interaction
/// diagram at Pu = −Nu; a box containing 0 and non-zero values takes the hull
/// of both. A T-beam with a possibly non-zero axial force is refused (the f64
/// check flags it incomplete).
pub fn rc_ratio_enclosures(m: &RCMemberData, f: &RCDesignForces, b: &DemandBound) -> Result<[Interval; 3], String> {
    let mu = around(f.mu, b.my, "Mu")?.abs();
    let vu = around(f.vu.unwrap_or(0.0), b.vy, "Vu")?.abs();
    let nu = around(f.nu.unwrap_or(0.0), b.n, "Nu")?;
    let es = m.es.unwrap_or(200e9);
    let zero_possible = nu.contains_zero();
    let nonzero_possible = !(nu.lo == 0.0 && nu.hi == 0.0);

    let pure = || -> Result<Interval, String> {
        require_monotone(&rc_flexure_section(m))?;
        Ok(rc_flexural_capacity::<Interval>(m).0)
    };
    let phi_mn = match m.section_type {
        RCSectionType::TBeam if nonzero_possible => {
            return Err(format!("{RC_FLEXURE}: T-beam with axial force {nu:?} (no P-M interaction)"));
        }
        RCSectionType::TBeam => pure()?,
        RCSectionType::Rectangular => {
            let mut acc: Option<Interval> = None;
            if zero_possible {
                acc = Some(pure()?);
            }
            if nonzero_possible {
                let pm = interaction_moment_enclosure(m, es, -nu)?;
                acc = Some(acc.map_or(pm, |a| a.hull(pm)));
            }
            acc.ok_or("internal: empty axial case")?
        }
    };
    let flexure = required_ratio(RC_CHECK_NAMES[0], mu, phi_mn)?;
    let phi_vn: Interval = rc_shear_capacity(m);
    let shear = loaded_ratio(RC_CHECK_NAMES[1], vu, phi_vn)?;
    // `if pu >= 0 { pu / phiPn,max } else { -pu / phiPnt }`, each "if loaded".
    let (pmax, pnt): (Interval, Interval) = rc_axial_capacity(m);
    let pu = -nu;
    let zero = Interval::ZERO;
    let compression = || loaded_ratio(RC_CHECK_NAMES[2], pu.max(zero), pmax);
    let tension = || loaded_ratio(RC_CHECK_NAMES[2], (-pu).max(zero), pnt);
    let axial = if pu.lo >= 0.0 {
        compression()?
    } else if pu.hi < 0.0 {
        tension()?
    } else {
        compression()?.hull(tension()?)
    };
    for (r, name) in [flexure, shear, axial].iter().zip(RC_CHECK_NAMES) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok([flexure, shear, axial])
}

/// Certified ACI 318 RC member checks (flexure incl. P-M interaction, shear, axial).
pub fn certify_rc_members(input: &CertifiedRcCheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &RC_CHECK_NAMES,
        |m, d| rc_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in ACI RC form (major-axis moment, shear, axial).
pub fn rc_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedRcDemand> {
    demands
        .iter()
        .map(|d| BoundedRcDemand {
            forces: RCDesignForces { element_id: d.forces.element_id, mu: d.forces.my, vu: d.forces.vy, nu: Some(d.forces.n) },
            bound: d.bound,
        })
        .collect()
}

// ───────────────────────────── NDS timber ─────────────────────────────

/// NDS timber design forces with their certified error bounds (`my`→M,
/// `n`→N tension-positive, `vy`→V; `mz` unused).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedTimberDemand {
    pub forces: TimberDesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedTimberCheckInput {
    pub members: Vec<TimberMemberData>,
    pub demands: Vec<BoundedTimberDemand>,
}

/// Interval enclosures of the five NDS ratios for one demand box. Mirrors
/// `timber_check::check_single_timber_member` (the adjusted design values and
/// the 3.9 interaction are the same generic functions). Requires b, d > 0.
pub fn timber_ratio_enclosures(
    m: &TimberMemberData,
    f: &TimberDesignForces,
    b: &DemandBound,
) -> Result<[Interval; 5], String> {
    let names = TIMBER_CHECK_NAMES;
    let mm = around(f.m, b.my, "M")?.abs();
    let n = around(f.n.unwrap_or(0.0), b.n, "N")?;
    let v = around(f.v.unwrap_or(0.0), b.vy, "V")?.abs();
    if !(m.b > 0.0 && m.d > 0.0 && m.b.is_finite() && m.d.is_finite()) {
        return Err(format!("section b = {}, d = {} not positive", m.b, m.d));
    }
    let zero = Interval::ZERO;
    let caps: TimberCapacities<Interval> = timber_capacities(m);
    let fb = mm.div(caps.s);
    let fv = (Interval::point(1.5) * v).div(caps.area);
    // `CheckLedger::ratio`: Fb' must be certified positive even without a moment.
    let bending = required_ratio(names[0], fb, caps.fb_prime)?;
    let compression = loaded_ratio(names[1], (-n).max(zero).div(caps.area), caps.fc_prime)?;
    let tension = loaded_ratio(names[2], n.max(zero).div(caps.area), caps.ft_prime)?;
    let shear = loaded_ratio(names[3], fv, caps.fv_prime)?;
    let interaction = timber_interaction(m, &caps, n, bending, tension);
    let out = [bending, compression, tension, shear, interaction];
    for (r, name) in out.iter().zip(names) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok(out)
}

/// Certified NDS timber member checks.
pub fn certify_timber_members(input: &CertifiedTimberCheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &TIMBER_CHECK_NAMES,
        |m, d| timber_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in NDS timber form (major-axis moment, axial, shear).
pub fn timber_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedTimberDemand> {
    demands
        .iter()
        .map(|d| BoundedTimberDemand {
            forces: TimberDesignForces { element_id: d.forces.element_id, m: d.forces.my, n: Some(d.forces.n), v: d.forces.vy },
            bound: d.bound,
        })
        .collect()
}

// ───────────────────────────── AISI S100 (CFS) ─────────────────────────────

/// AISI S100 design forces with their certified error bounds (`n`→axial
/// tension-positive, `my`→Mx strong axis, `mz`→My weak axis, `vy`→shear).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundedCfsDemand {
    pub forces: CfsDesignForces,
    pub bound: DemandBound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedCfsCheckInput {
    pub members: Vec<CfsMemberData>,
    pub demands: Vec<BoundedCfsDemand>,
}

/// Interval enclosures of the six AISI S100 ratios for one demand box.
/// Mirrors `cfs_check::check_single_cfs_member`. A shear demand on a member
/// without web geometry is refused (the f64 check flags it).
pub fn cfs_ratio_enclosures(m: &CfsMemberData, f: &CfsDesignForces, b: &DemandBound) -> Result<[Interval; 6], String> {
    let names = CFS_CHECK_NAMES;
    let n = around(f.axial.unwrap_or(0.0), b.n, "axial")?;
    let mx = around(f.mx.unwrap_or(0.0), b.my, "Mx")?.abs();
    let my = around(f.my.unwrap_or(0.0), b.mz, "My")?.abs();
    let v = around(f.shear.unwrap_or(0.0), b.vy, "shear")?.abs();
    let zero = Interval::ZERO;
    let caps: CfsCapacities<Interval> = cfs_capacities(m);
    let phi = |x: f64, c: Interval| Interval::lit(x) * c;
    let compression = loaded_ratio(names[0], (-n).max(zero), phi(CFS_PHI_C, caps.pn))?;
    if m.xo.is_none() && n.lo < 0.0 {
        return Err(format!("{}: no xo for flexural-torsional buckling (E2.2)", names[0]));
    }
    let tension = loaded_ratio(names[1], n.max(zero), phi(CFS_PHI_T, caps.tn))?;
    let flex_x = loaded_ratio(names[2], mx, phi(CFS_PHI_B, caps.mn_x))?;
    let flex_y = loaded_ratio(names[3], my, phi(CFS_PHI_B, caps.mn_y))?;
    let shear = match caps.vn {
        Some(vn) => loaded_ratio(names[4], v, phi(CFS_PHI_V, vn))?,
        None if v.lo == 0.0 && v.hi == 0.0 => zero,
        None => return Err(format!("{}: no web geometry (h, t) for a shear demand", names[4])),
    };
    let interaction = compression + tension + flex_x + flex_y;
    let out = [compression, tension, flex_x, flex_y, shear, interaction];
    for (r, name) in out.iter().zip(names) {
        if !r.is_finite() {
            return Err(format!("{name}: enclosure not finite"));
        }
    }
    Ok(out)
}

/// Certified AISI S100 cold-formed steel member checks.
pub fn certify_cfs_members(input: &CertifiedCfsCheckInput) -> Vec<CertifiedMemberResult> {
    certify_members(
        &input.members,
        |m| m.element_id,
        &input.demands,
        |d| d.forces.element_id,
        &CFS_CHECK_NAMES,
        |m, d| cfs_ratio_enclosures(m, &d.forces, &d.bound).map(|r| r.to_vec()),
    )
}

/// The same demand sets in AISI S100 form.
pub fn cfs_demands(demands: &[BoundedSteelDemand]) -> Vec<BoundedCfsDemand> {
    demands
        .iter()
        .map(|d| BoundedCfsDemand {
            forces: CfsDesignForces {
                element_id: d.forces.element_id,
                axial: Some(d.forces.n),
                mx: Some(d.forces.my),
                my: d.forces.mz,
                shear: d.forces.vy,
            },
            bound: d.bound,
        })
        .collect()
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
    use crate::postprocess::steel_check::{check_steel_members, AiscElement, AiscElementKind, SteelCheckInput};

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
            flange_slenderness: None,
            // bf = 305, tf = 15.4, h = 255, tw = 9.9 mm: no element slender (E7).
            compression_elements: Some(vec![
                AiscElement { kind: AiscElementKind::RolledFlange, b: 0.1525, t: 0.0154, count: Some(4.0), kc: None },
                AiscElement { kind: AiscElementKind::Web, b: 0.255, t: 0.0099, count: None, kc: None },
            ]),
            lcz: None,
            load_position: None,
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
        // Compact, noncompact and slender flanges (F3, F6.2), and absent.
        m.flange_slenderness = if g.unit() < 0.4 { None } else { Some(g.range(4.0, 40.0)) };
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
            e_n_y: None,
            e_n_z: None,
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
            interaction: None,
            // IPE 300; the default top-flange load height needs the depth.
            geometry: Some(crate::postprocess::ec3_check::Ec3Geometry::I {
                h: 0.300,
                b: 0.150,
                tw: 0.0071,
                tf: 0.0107,
                r: 0.015,
            }),
            ltb: None,
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
        bad.iz = 0.0; // Mcr = 0·(Iw/0) → chi_LT not finite
        assert!(ec3_ratio_enclosures(&bad, &f, &ZERO_BOUND).is_err());
        // Lb = 0 used to be the refusal case here; it is a continuously
        // restrained member and now certifies with chi_LT = 1.
        let mut braced = m.clone();
        braced.lb = 0.0;
        assert!(ec3_ratio_enclosures(&braced, &f, &ZERO_BOUND).is_ok());
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
    fn ec2_certifies_strain_compatibility_failure() {
        // Over-reinforced beam: MRd = 203.28 kN·m by strain compatibility
        // (238.66 kN·m if tension steel were assumed to yield). At MEd = 225 kN·m
        // the member must be certified as failing, not certified_ok.
        let m_over = Ec2MemberData {
            element_id: 1,
            fck: 25e6,
            fyk: 500e6,
            b: 0.25,
            h: 0.40,
            d: 0.35,
            as_tension: 2.5e-3,
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: None,
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        };
        // Doubly reinforced with x < d': MRd = 81.80 kN·m by strain compatibility
        // (90.74 kN·m from the non-iterated singly-reinforced trial). At MEd = 86 kN·m
        // the member must be certified as failing.
        let m_doubly = Ec2MemberData {
            element_id: 2,
            fck: 40e6,
            fyk: 500e6,
            b: 0.40,
            h: 0.35,
            d: 0.26,
            as_tension: 0.65e-3,
            as_compression: Some(0.65e-3),
            d_prime: Some(0.09),
            ..m_over.clone()
        };
        let res = certify_ec2_members(&CertifiedEc2CheckInput {
            members: vec![m_over, m_doubly],
            demands: vec![
                BoundedEc2Demand {
                    forces: Ec2DesignForces { element_id: 1, m_ed: Some(225_000.0), v_ed: None, n_ed: None },
                    bound: ZERO_BOUND,
                },
                BoundedEc2Demand {
                    forces: Ec2DesignForces { element_id: 2, m_ed: Some(86_000.0), v_ed: None, n_ed: None },
                    bound: ZERO_BOUND,
                },
            ],
        });
        assert!(res[0].certified && res[0].certified_fail && !res[0].certified_ok, "{:?}", res[0]);
        assert!(res[1].certified && res[1].certified_fail && !res[1].certified_ok, "{:?}", res[1]);
    }

    // ───────────── CIRSOC 201 ─────────────

    use crate::postprocess::cirsoc201_check::{check_cirsoc201_members, Cirsoc201CheckInput, Cirsoc201CheckResult, Cirsoc201Edition};

    fn cirsoc_beam(g: &mut Lcg, id: usize) -> Cirsoc201MemberData {
        let h = g.range(0.3, 0.9);
        let b = g.range(0.2, 0.6);
        let d = h - 0.05;
        let doubly = g.unit() < 0.4;
        let stirrups = g.unit() < 0.6;
        Cirsoc201MemberData {
            element_id: id,
            fc: [20e6, 25e6, 28e6, 30e6, 40e6, 56e6, 60e6, 80e6][(g.unit() * 8.0) as usize % 8],
            fy: [220e6, 420e6, 500e6][(g.unit() * 3.0) as usize % 3],
            es: if g.unit() < 0.2 { Some(g.range(190e9, 210e9)) } else { None },
            b,
            h,
            d,
            // up to heavily over-reinforced (eps_t < eps_y)
            as_tension: b * d * g.range(0.002, 0.06),
            as_compression: if doubly { Some(b * d * g.range(0.001, 0.03)) } else { None },
            d_prime: if doubly { Some(g.range(0.02, 0.1)) } else { None },
            av: if stirrups { Some(g.range(1e-4, 4e-4)) } else { None },
            s_stirrup: if stirrups { Some(g.range(0.05, 0.3)) } else { None },
            fyt: if g.unit() < 0.2 { Some(500e6) } else { None },
            ag: None,
            lambda: if g.unit() < 0.2 { Some(0.75) } else { None },
            bf: if g.unit() < 0.3 { Some(b * g.range(1.0, 4.0)) } else { None },
            hf: Some(g.range(0.05, 0.15)),
            edition: if g.unit() < 0.5 { Cirsoc201Edition::E2005 } else { Cirsoc201Edition::E2025 },
        }
    }

    fn cirsoc_forces(g: &mut Lcg, id: usize) -> Cirsoc201DesignForces {
        let pick = |g: &mut Lcg, x: f64| if g.unit() < 0.1 { None } else { Some(g.range(-x, x)) };
        Cirsoc201DesignForces { element_id: id, mu: pick(g, 8e5), vu: pick(g, 6e5), axial_compression: pick(g, 5e5) }
    }

    /// The f64 checker's four ratios (minimum shear reinforcement: 0 or ∞).
    fn cirsoc_f64_any(m: &Cirsoc201MemberData, f: &Cirsoc201DesignForces) -> Cirsoc201CheckResult {
        check_cirsoc201_members(&Cirsoc201CheckInput { members: vec![m.clone()], forces: vec![f.clone()] }).remove(0)
    }

    fn cirsoc_f64(m: &Cirsoc201MemberData, f: &Cirsoc201DesignForces) -> [f64; 4] {
        let r = cirsoc_f64_any(m, f);
        assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
        [r.flexure_ratio, r.ductility_ratio, r.shear_ratio, if r.min_shear_reinforcement_missing { f64::INFINITY } else { 0.0 }]
    }

    /// The f64 check fails or cannot evaluate the member: refusing to certify it is right.
    fn cirsoc_refusal_ok(r: &Cirsoc201CheckResult) -> bool {
        !r.unevaluated.is_empty() || r.min_shear_reinforcement_missing || !r.ductility_ratio.is_finite()
    }

    #[test]
    fn cirsoc201_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(201);
        let mut n = 0;
        for i in 0..4000 {
            let m = cirsoc_beam(&mut g, i);
            let f = cirsoc_forces(&mut g, i);
            let r = match cirsoc201_ratio_enclosures(&m, &f, &ZERO_BOUND) { Ok(r) => r, Err(e) => {
                let res = cirsoc_f64_any(&m, &f);
                assert!(cirsoc_refusal_ok(&res), "{i}: refused an evaluable member ({e}) {res:?}");
                continue;
            } };
            n += 1;
            let p = cirsoc_f64(&m, &f);
            for k in 0..4 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-11 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
        // Most random sections without stirrups under a large Vu lack the minimum shear
        // reinforcement, which the certificate refuses (the f64 check fails them).
        assert!(n > 1500, "{n}");
    }

    #[test]
    fn cirsoc201_enclosure_contains_sampled_demands() {
        let mut g = Lcg(2010);
        for i in 0..400 {
            let m = cirsoc_beam(&mut g, i);
            let f = cirsoc_forces(&mut g, i);
            let b = DemandBound {
                n: 0.0,
                my: f.mu.unwrap_or(0.0).abs() * g.range(0.0, 0.3) + 1.0,
                mz: 0.0,
                vy: f.vu.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
            };
            let Ok(r) = cirsoc201_ratio_enclosures(&m, &f, &b) else { continue };
            for _ in 0..40 {
                let s = Cirsoc201DesignForces {
                    element_id: i,
                    mu: Some(f.mu.unwrap_or(0.0) + b.my * g.range(-1.0, 1.0)),
                    vu: Some(f.vu.unwrap_or(0.0) + b.vy * g.range(-1.0, 1.0)),
                    axial_compression: f.axial_compression,
                };
                let p = cirsoc_f64(&m, &s);
                for k in 0..4 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
    }

    /// Sections built to sit on a branch threshold (beta1 at f'c = 28 / 56
    /// MPa; eps_t at 0.005, at eps_y; the compression steel at first yield;
    /// sqrt(f'c) at the 25/3 cap): the interval comparison is undecided there
    /// and the hull of both arms must still contain the f64 value.
    #[test]
    fn cirsoc201_straddled_thresholds_are_enclosed() {
        let base = Cirsoc201MemberData {
            element_id: 1,
            fc: 28e6,
            fy: 420e6,
            es: None,
            b: 0.3,
            h: 0.5,
            d: 0.45,
            as_tension: 1.5e-3,
            as_compression: None,
            d_prime: None,
            av: Some(1.5e-4),
            s_stirrup: Some(0.15),
            fyt: None,
            ag: None,
            lambda: None, bf: None, hf: None,
            edition: Cirsoc201Edition::E2005,
        };
        let f = Cirsoc201DesignForces { element_id: 1, mu: Some(1e5), vu: Some(1e5), axial_compression: None };
        let mut cases = vec![base.clone(), Cirsoc201MemberData { fc: 56e6, ..base.clone() }];
        // eps_t exactly at a phi threshold: singly, steel yielding, c = 0.003·d/(0.003 + eps)
        for (eps, fy) in [(0.005, 420e6), (0.002, 420e6), (0.0025, 500e6), (0.005, 500e6)] {
            let c = 0.003 * base.d / (0.003 + eps);
            let as_t = 0.85 * base.fc * 0.85 * c * base.b / fy;
            cases.push(Cirsoc201MemberData { fy, as_tension: as_t, ..base.clone() });
        }
        // compression steel exactly at first yield: c = d'·600/(600 − 420)
        let dp = 0.06;
        let c = dp * 600.0 / 180.0;
        let as_c = 4e-4;
        let as_t = (0.85 * base.fc * 0.85 * c * base.b + as_c * 420e6) / 420e6;
        cases.push(Cirsoc201MemberData { as_tension: as_t, as_compression: Some(as_c), d_prime: Some(dp), ..base.clone() });
        // sqrt(f'c) at the 8.3 MPa cap
        cases.push(Cirsoc201MemberData { fc: 8.3f64.powi(2) * 1e6, ..base.clone() });
        // both editions
        let n_cases = cases.len();
        for i in 0..n_cases {
            cases.push(Cirsoc201MemberData { edition: Cirsoc201Edition::E2025, ..cases[i].clone() });
        }
        for (i, m) in cases.iter().enumerate() {
            let Ok(r) = cirsoc201_ratio_enclosures(m, &f, &ZERO_BOUND) else {
                assert!(cirsoc_refusal_ok(&cirsoc_f64_any(m, &f)), "case {i}: refused an evaluable member");
                continue;
            };
            let p = cirsoc_f64(m, &f);
            for k in 0..4 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "case {i}/{k}: {} ∉ {:?}", p[k], r[k]);
                // A straddled ductility branch hulls with 0 (the clause applies or not).
                if k != 1 {
                    assert!(r[k].hi - r[k].lo <= 1e-6 * p[k], "case {i}/{k}: wide {:?}", r[k]);
                }
            }
        }
    }

    #[test]
    fn cirsoc201_refuses() {
        let mut g = Lcg(4);
        let mut m = cirsoc_beam(&mut g, 1);
        let f = cirsoc_forces(&mut g, 1);
        assert!(cirsoc201_ratio_enclosures(&m, &f, &DemandBound { my: f64::NAN, ..ZERO_BOUND }).is_err());
        m.as_tension = 0.0;
        m.as_compression = None;
        let res = certify_cirsoc201_members(&CertifiedCirsoc201CheckInput {
            members: vec![m.clone()],
            demands: vec![BoundedCirsoc201Demand { forces: Cirsoc201DesignForces { mu: Some(0.0), ..f.clone() }, bound: ZERO_BOUND }],
        });
        assert!(!res[0].certified && !res[0].certified_ok, "{res:?}");
        m.as_tension = 1e-3;
        m.b = -0.3; // outside the monotone domain
        assert!(cirsoc201_ratio_enclosures(&m, &f, &ZERO_BOUND).is_err());
    }

    // ───────────── ACI 318 RC ─────────────

    use crate::postprocess::rc_check::{check_rc_members, RCCheckInput};

    fn aci_member(g: &mut Lcg, id: usize) -> RCMemberData {
        let h = g.range(0.3, 0.9);
        let b = g.range(0.2, 0.6);
        let d = h - 0.05;
        let tbeam = g.unit() < 0.25;
        let doubly = g.unit() < 0.5;
        let stirrups = g.unit() < 0.6;
        RCMemberData {
            element_id: id,
            fc: [21e6, 28e6, 35e6, 56e6, 70e6, 80e6][(g.unit() * 6.0) as usize % 6],
            fy: [420e6, 550e6][(g.unit() * 2.0) as usize % 2],
            es: if g.unit() < 0.5 { Some(200e9) } else { None },
            b,
            h,
            d,
            d_prime: if doubly { Some(g.range(0.03, 0.08)) } else { None },
            as_tension: b * d * g.range(0.003, 0.05),
            as_compression: if doubly { Some(b * d * g.range(0.002, 0.03)) } else { None },
            section_type: if tbeam { RCSectionType::TBeam } else { RCSectionType::Rectangular },
            bf: if tbeam { Some(b * g.range(1.0, 4.0)) } else { None },
            hf: if tbeam && g.unit() < 0.7 { Some(g.range(0.05, 0.2)) } else { None },
            av: if stirrups { Some(g.range(2e-5, 4e-4)) } else { None },
            s_stirrup: if stirrups { Some(g.range(0.05, 0.3)) } else { None },
            lambda: if g.unit() < 0.2 { Some(0.85) } else { None },
        }
    }

    fn aci_forces(g: &mut Lcg, m: &RCMemberData) -> RCDesignForces {
        let rect = matches!(m.section_type, RCSectionType::Rectangular);
        let po = 0.85 * m.fc * m.b * m.h;
        RCDesignForces {
            element_id: m.element_id,
            mu: g.range(-8e5, 8e5),
            vu: if g.unit() < 0.1 { None } else { Some(g.range(-6e5, 6e5)) },
            nu: if !rect || g.unit() < 0.3 { None } else { Some(g.range(-0.6 * po, 0.1 * po)) },
        }
    }

    fn aci_f64(m: &RCMemberData, f: &RCDesignForces) -> Option<[f64; 3]> {
        let r = &check_rc_members(&RCCheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        r.unevaluated.is_empty().then_some([r.flexure_ratio, r.shear_ratio, r.axial_ratio])
    }

    #[test]
    fn rc_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(318);
        let (mut n, mut pm) = (0, 0);
        for i in 0..3000 {
            let m = aci_member(&mut g, i);
            let f = aci_forces(&mut g, &m);
            let r = rc_ratio_enclosures(&m, &f, &ZERO_BOUND);
            let p = aci_f64(&m, &f);
            let (Ok(r), Some(p)) = (r, p) else {
                // Only refusals where the f64 check also could not evaluate.
                assert!(p.is_none(), "{i}: refused an evaluable member {m:?} {f:?}");
                continue;
            };
            n += 1;
            if f.nu.unwrap_or(0.0) != 0.0 {
                pm += 1;
            }
            for k in 0..3 {
                let tol = 1e-9 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-8 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
        assert!(n > 2700 && pm > 1200, "{n} {pm}");
    }

    #[test]
    fn rc_enclosure_contains_sampled_demands() {
        let mut g = Lcg(3180);
        let mut checked = 0;
        for i in 0..300 {
            let m = aci_member(&mut g, i);
            let f = aci_forces(&mut g, &m);
            let rect = matches!(m.section_type, RCSectionType::Rectangular);
            let b = DemandBound {
                n: if rect { f.nu.unwrap_or(0.0).abs() * g.range(0.0, 0.2) + 1e3 } else { 0.0 },
                my: f.mu.abs() * g.range(0.0, 0.3),
                mz: 0.0,
                vy: f.vu.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
            };
            let Ok(r) = rc_ratio_enclosures(&m, &f, &b) else { continue };
            checked += 1;
            for j in 0..30 {
                // include the box ends and Nu = 0 when it is in the box
                let t = [-1.0, 1.0][j % 2] * if j < 2 { 1.0 } else { g.unit() };
                let nu = f.nu.unwrap_or(0.0) + b.n * t;
                let nu = if j == 2 && (f.nu.unwrap_or(0.0).abs() <= b.n) { 0.0 } else { nu };
                let s = RCDesignForces {
                    element_id: i,
                    mu: f.mu + b.my * g.range(-1.0, 1.0),
                    vu: Some(f.vu.unwrap_or(0.0) + b.vy * g.range(-1.0, 1.0)),
                    nu: Some(nu),
                };
                let p = aci_f64(&m, &s).unwrap_or_else(|| panic!("{i}: certified box contains an unevaluable point"));
                for k in 0..3 {
                    let tol = 1e-9 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
        assert!(checked > 250, "{checked}");
    }

    /// Nu straddling 0 switches between the pure-flexure strength and the
    /// interaction diagram (which differ: the diagram deducts the displaced
    /// concrete), and the axial check between tension and compression.
    #[test]
    fn rc_axial_straddling_zero_takes_hull() {
        let m = RCMemberData {
            element_id: 1,
            fc: 28e6,
            fy: 420e6,
            es: Some(200e9),
            b: 0.4,
            h: 0.4,
            d: 0.34,
            d_prime: Some(0.06),
            as_tension: 1.6e-3,
            as_compression: Some(0.8e-3),
            section_type: RCSectionType::Rectangular,
            bf: None,
            hf: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        };
        let f = RCDesignForces { element_id: 1, mu: 1.5e5, vu: None, nu: Some(0.0) };
        let r = rc_ratio_enclosures(&m, &f, &DemandBound { n: 5e4, ..ZERO_BOUND }).unwrap();
        for nu in [-5e4, -1e4, -1.0, 0.0, 1.0, 1e4, 5e4] {
            let p = aci_f64(&m, &RCDesignForces { nu: Some(nu), ..f.clone() }).unwrap();
            for k in 0..3 {
                assert!(r[k].lo <= p[k] * (1.0 + 1e-9) && p[k] <= r[k].hi * (1.0 + 1e-9), "{nu}/{k}: {} ∉ {:?}", p[k], r[k]);
            }
        }
        // A T-beam with a possibly non-zero axial force is refused.
        let t = RCMemberData { section_type: RCSectionType::TBeam, bf: Some(1.0), hf: Some(0.1), ..m.clone() };
        assert!(rc_ratio_enclosures(&t, &f, &DemandBound { n: 1.0, ..ZERO_BOUND }).is_err());
        assert!(rc_ratio_enclosures(&t, &f, &ZERO_BOUND).is_ok());
        // Off the interaction diagram: refused (the f64 check flags it).
        let over = RCDesignForces { nu: Some(-2e7), ..f.clone() };
        assert!(rc_ratio_enclosures(&m, &over, &ZERO_BOUND).is_err());
        assert!(aci_f64(&m, &over).is_none());
    }

    /// Shear exactly at Av,min (22.5.5.1 table switch) and phi exactly at the
    /// tension-controlled limit: undecided comparisons, hull contains f64.
    #[test]
    fn rc_straddled_thresholds_are_enclosed() {
        let mut m = RCMemberData {
            element_id: 1,
            fc: 28e6,
            fy: 420e6,
            es: Some(200e9),
            b: 0.3,
            h: 0.6,
            d: 0.55,
            d_prime: None,
            as_tension: 0.0,
            as_compression: None,
            section_type: RCSectionType::Rectangular,
            bf: None,
            hf: None,
            av: None,
            s_stirrup: Some(0.2),
            lambda: None,
        };
        let eps = 420e6 / 200e9 + 0.003;
        let c = 0.003 * m.d / (0.003 + eps);
        m.as_tension = 0.85 * m.fc * 0.85 * c * m.b / m.fy;
        let sqrt_fc = 28.0f64.sqrt();
        let av_min_mm2 = (0.062 * sqrt_fc * 300.0 * 200.0 / 420.0).max(0.35 * 300.0 * 200.0 / 420.0);
        m.av = Some(av_min_mm2 / 1e6);
        let f = RCDesignForces { element_id: 1, mu: 1e5, vu: Some(2e5), nu: None };
        let r = rc_ratio_enclosures(&m, &f, &ZERO_BOUND).unwrap();
        let p = aci_f64(&m, &f).unwrap();
        for k in 0..3 {
            let tol = 1e-12 * p[k].abs();
            assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{k}: {} ∉ {:?}", p[k], r[k]);
        }
    }

    // ───────────── NDS timber ─────────────

    use crate::postprocess::timber_check::{check_timber_members, TimberCheckInput};

    fn timber_member(g: &mut Lcg, id: usize) -> TimberMemberData {
        let b = g.range(0.038, 0.2);
        let d = g.range(0.089, 0.4);
        let opt = |g: &mut Lcg, lo: f64, hi: f64| if g.unit() < 0.5 { None } else { Some(g.range(lo, hi)) };
        TimberMemberData {
            element_id: id,
            fb: g.range(5e6, 15e6),
            ft: g.range(3e6, 9e6),
            fc: g.range(6e6, 12e6),
            fv: g.range(0.9e6, 1.4e6),
            e: g.range(8e9, 13e9),
            e_min: if g.unit() < 0.5 { None } else { Some(g.range(3e9, 5e9)) },
            b,
            d,
            le: g.range(0.5, 6.0),
            lu: opt(g, 0.3, 6.0),
            le_b: opt(g, 0.0, 6.0),
            le_bending: opt(g, 0.3, 10.0),
            cd: opt(g, 0.9, 1.6),
            cm: opt(g, 0.8, 1.0),
            ct: opt(g, 0.7, 1.0),
            cf_bending: opt(g, 1.0, 1.5),
            cf_tension: opt(g, 1.0, 1.5),
            cf_compression: opt(g, 1.0, 1.15),
            cfu: opt(g, 1.0, 1.2),
            ci: opt(g, 0.8, 1.0),
            cr: opt(g, 1.0, 1.15),
        }
    }

    fn timber_forces(g: &mut Lcg, m: &TimberMemberData) -> TimberDesignForces {
        let a = m.b * m.d;
        TimberDesignForces {
            element_id: m.element_id,
            m: g.range(-1.0, 1.0) * 10e6 * m.b * m.d * m.d / 6.0,
            n: if g.unit() < 0.2 { None } else { Some(g.range(-1.2, 0.8) * 8e6 * a) },
            v: if g.unit() < 0.2 { None } else { Some(g.range(-1.0, 1.0) * 1e6 * a) },
        }
    }

    fn timber_f64(m: &TimberMemberData, f: &TimberDesignForces) -> [f64; 5] {
        let r = &check_timber_members(&TimberCheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
        [r.bending_ratio, r.compression_ratio, r.tension_ratio, r.shear_ratio, r.interaction_ratio]
    }

    #[test]
    fn timber_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(1997);
        for i in 0..4000 {
            let m = timber_member(&mut g, i);
            let f = timber_forces(&mut g, &m);
            let r = timber_ratio_enclosures(&m, &f, &ZERO_BOUND).unwrap();
            let p = timber_f64(&m, &f);
            for k in 0..5 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-11 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
    }

    #[test]
    fn timber_enclosure_contains_sampled_demands() {
        let mut g = Lcg(1998);
        let mut checked = 0;
        for i in 0..400 {
            let m = timber_member(&mut g, i);
            let f = timber_forces(&mut g, &m);
            let b = DemandBound {
                n: f.n.unwrap_or(0.0).abs() * g.range(0.0, 0.3) + 1.0,
                my: f.m.abs() * g.range(0.0, 0.3),
                mz: 0.0,
                vy: f.v.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
            };
            // Refused only where the box reaches a buckled member with a moment
            // box containing 0 (the saturated term jumps 0 → 99 there).
            let Ok(r) = timber_ratio_enclosures(&m, &f, &b) else { continue };
            checked += 1;
            for j in 0..40 {
                let t = |g: &mut Lcg| if j < 2 { [-1.0, 1.0][j] } else { g.range(-1.0, 1.0) };
                let s = TimberDesignForces {
                    element_id: i,
                    m: f.m + b.my * t(&mut g),
                    n: Some(f.n.unwrap_or(0.0) + b.n * t(&mut g)),
                    v: Some(f.v.unwrap_or(0.0) + b.vy * t(&mut g)),
                };
                let p = timber_f64(&m, &s);
                for k in 0..5 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
        assert!(checked > 380, "{checked}");
    }

    /// N straddling 0 (three interaction forms) and N straddling FcE1 (the
    /// amplification passes through 0 and the term saturates at 99).
    #[test]
    fn timber_straddled_branches_take_hull() {
        let mut g = Lcg(7);
        let m = TimberMemberData { le: 5.0, lu: Some(5.0), ..timber_member(&mut g, 1) };
        let f = TimberDesignForces { element_id: 1, m: 2e3, n: Some(0.0), v: Some(1e3) };
        let r = timber_ratio_enclosures(&m, &f, &DemandBound { n: 1e4, ..ZERO_BOUND }).unwrap();
        for nn in [-1e4, -1.0, 0.0, 1.0, 1e4] {
            let p = timber_f64(&m, &TimberDesignForces { n: Some(nn), ..f.clone() });
            for k in 0..5 {
                assert!(r[k].lo <= p[k] * (1.0 + 1e-12) && p[k] <= r[k].hi * (1.0 + 1e-12), "{nn}/{k}: {} ∉ {:?}", p[k], r[k]);
            }
        }
        // fc = FcE1: compression N = −FcE1·A.
        let emin = m.e_min.unwrap_or(m.e * (1.0 - 1.645 * 0.25) * 1.03 / 1.66)
            * m.cm.unwrap_or(1.0) * m.ct.unwrap_or(1.0) * m.ci.unwrap_or(1.0);
        let fce = 0.822 * emin / (m.le / m.d).powi(2);
        let n0 = -fce * m.b * m.d;
        let f = TimberDesignForces { n: Some(n0), ..f };
        let bn = 1e-3 * n0.abs();
        let r = timber_ratio_enclosures(&m, &f, &DemandBound { n: bn, ..ZERO_BOUND }).unwrap();
        assert!(r[4].hi >= 99.0 - 1e-9, "{:?}", r[4]);
        for t in [-1.0, -0.5, -1e-6, 0.0, 1e-6, 0.5, 1.0] {
            let p = timber_f64(&m, &TimberDesignForces { n: Some(n0 + bn * t), ..f.clone() })[4];
            assert!(r[4].lo <= p * (1.0 + 1e-12) && p <= r[4].hi * (1.0 + 1e-12), "{t}: {p} ∉ {:?}", r[4]);
        }
    }

    #[test]
    fn timber_refuses() {
        let mut g = Lcg(9);
        let m = timber_member(&mut g, 1);
        let f = timber_forces(&mut g, &m);
        assert!(timber_ratio_enclosures(&m, &f, &DemandBound { vy: f64::NAN, ..ZERO_BOUND }).is_err());
        assert!(timber_ratio_enclosures(&TimberMemberData { b: 0.0, ..m.clone() }, &f, &ZERO_BOUND).is_err());
        let res = certify_timber_members(&CertifiedTimberCheckInput {
            members: vec![TimberMemberData { fb: 0.0, ..m }],
            demands: vec![BoundedTimberDemand { forces: f, bound: ZERO_BOUND }],
        });
        assert!(!res[0].certified && !res[0].certified_ok);
    }

    // ───────────── AISI S100 (CFS) ─────────────

    use crate::postprocess::cfs_check::{check_cfs_members, CfsCheckInput};

    fn cfs_member(g: &mut Lcg, id: usize) -> CfsMemberData {
        let s = g.range(0.5, 2.0);
        let opt = |g: &mut Lcg, lo: f64, hi: f64| if g.unit() < 0.5 { None } else { Some(g.range(lo, hi)) };
        let web = g.unit() < 0.7;
        CfsMemberData {
            element_id: id,
            fy: [230e6, 345e6, 450e6][(g.unit() * 3.0) as usize % 3],
            e: 200e9,
            ag: 4.84e-4 * s,
            ae: 4.84e-4 * s * g.range(0.6, 1.0),
            ix: 1.16e-6 * s * s,
            se_x: 1.53e-5 * s * g.range(0.7, 1.0),
            sf_x: 1.53e-5 * s,
            iy: 1.10e-7 * s * s,
            se_y: 3.8e-6 * s,
            rx: 0.049 * s.sqrt(),
            ry: 0.0151 * s.sqrt(),
            j: 3.73e-10 * s * g.range(0.5, 2.0),
            cw: 7.5e-10 * s * s * g.range(0.5, 2.0),
            lb: g.range(0.3, 6.0),
            lc: g.range(0.3, 6.0),
            k: opt(g, 0.5, 2.0),
            xo: Some(-g.range(0.0, 0.04) * s.sqrt()),
            kx_lx: opt(g, 0.3, 6.0),
            kt_lt: opt(g, 0.3, 6.0),
            cb: opt(g, 1.0, 2.3),
            fcrd: opt(g, 50e6, 900e6),
            fcrd_flex: opt(g, 50e6, 900e6),
            aw: None,
            h: if web { Some(g.range(0.08, 0.3)) } else { None },
            t: if web { Some(g.range(0.0008, 0.004)) } else { None },
        }
    }

    fn cfs_forces(g: &mut Lcg, m: &CfsMemberData) -> CfsDesignForces {
        let pick = |g: &mut Lcg, x: f64| if g.unit() < 0.15 { None } else { Some(g.range(-x, x)) };
        CfsDesignForces {
            element_id: m.element_id,
            axial: pick(g, 0.5 * m.ag * m.fy),
            mx: pick(g, 0.6 * m.sf_x * m.fy),
            my: pick(g, 0.6 * m.se_y * m.fy),
            shear: if m.h.is_some() { pick(g, 3e4) } else { None },
        }
    }

    fn cfs_f64(m: &CfsMemberData, f: &CfsDesignForces) -> [f64; 6] {
        let r = &check_cfs_members(&CfsCheckInput { members: vec![m.clone()], forces: vec![f.clone()] })[0];
        assert!(r.unevaluated.is_empty(), "{:?}", r.unevaluated);
        [r.compression_ratio, r.tension_ratio, r.flexure_ratio_x, r.flexure_ratio_y, r.shear_ratio, r.interaction_ratio]
    }

    #[test]
    fn cfs_f64_and_interval_paths_agree_on_points() {
        let mut g = Lcg(100);
        for i in 0..4000 {
            let m = cfs_member(&mut g, i);
            let f = cfs_forces(&mut g, &m);
            let r = cfs_ratio_enclosures(&m, &f, &ZERO_BOUND).unwrap();
            let p = cfs_f64(&m, &f);
            for k in 0..6 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                assert!(r[k].hi - r[k].lo <= 1e-11 * p[k].abs().max(1e-12), "{i}/{k}: wide {:?}", r[k]);
            }
        }
    }

    #[test]
    fn cfs_enclosure_contains_sampled_demands() {
        let mut g = Lcg(101);
        for i in 0..400 {
            let m = cfs_member(&mut g, i);
            let f = cfs_forces(&mut g, &m);
            let b = DemandBound {
                n: f.axial.unwrap_or(0.0).abs() * g.range(0.0, 0.3) + 1.0,
                my: f.mx.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
                mz: f.my.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
                vy: f.shear.unwrap_or(0.0).abs() * g.range(0.0, 0.3),
            };
            let r = cfs_ratio_enclosures(&m, &f, &b).unwrap();
            for j in 0..40 {
                let t = |g: &mut Lcg| if j < 2 { [-1.0, 1.0][j] } else { g.range(-1.0, 1.0) };
                let s = CfsDesignForces {
                    element_id: i,
                    axial: Some(f.axial.unwrap_or(0.0) + b.n * t(&mut g)),
                    mx: Some(f.mx.unwrap_or(0.0) + b.my * t(&mut g)),
                    my: Some(f.my.unwrap_or(0.0) + b.mz * t(&mut g)),
                    shear: if m.h.is_some() { Some(f.shear.unwrap_or(0.0) + b.vy * t(&mut g)) } else { None },
                };
                let p = cfs_f64(&m, &s);
                for k in 0..6 {
                    let tol = 1e-12 * p[k].abs();
                    assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "{i}/{k}: {} ∉ {:?}", p[k], r[k]);
                }
            }
        }
    }

    /// Members built on capacity thresholds (λc = 1.5, Fe = 2.78·Fy and
    /// 0.56·Fy for LTB, h/t at both shear limits): the hull contains the f64.
    #[test]
    fn cfs_straddled_thresholds_are_enclosed() {
        let mut g = Lcg(102);
        let base = CfsMemberData { fcrd: None, fcrd_flex: None, k: Some(1.0), cb: Some(1.0), ..cfs_member(&mut g, 1) };
        let pi = std::f64::consts::PI;
        let mut cases = vec![];
        // λc = 1.5: Fe = Fy/2.25 → lc = π·ry·sqrt(E/Fe)
        cases.push(CfsMemberData { lc: pi * base.ry * (base.e * 2.25 / base.fy).sqrt(), ..base.clone() });
        // shear limits: h/t = sqrt(E·kv/Fy) and 1.51·sqrt(...)
        let lim = (base.e * 5.34 / base.fy).sqrt();
        for r in [1.0, 1.51] {
            cases.push(CfsMemberData { h: Some(0.15), t: Some(0.15 / (r * lim)), ..base.clone() });
        }
        let f = CfsDesignForces { element_id: 1, axial: Some(-1e4), mx: Some(1e3), my: Some(10.0), shear: Some(5e3) };
        for (i, m) in cases.iter().enumerate() {
            let r = cfs_ratio_enclosures(m, &f, &ZERO_BOUND).unwrap();
            let p = cfs_f64(m, &f);
            for k in 0..6 {
                let tol = 1e-12 * p[k].abs();
                assert!(r[k].lo - tol <= p[k] && p[k] <= r[k].hi + tol, "case {i}/{k}: {} ∉ {:?}", p[k], r[k]);
            }
        }
    }

    #[test]
    fn cfs_refuses() {
        let mut g = Lcg(103);
        let m = CfsMemberData { h: None, t: None, ..cfs_member(&mut g, 1) };
        let f = CfsDesignForces { element_id: 1, axial: Some(-1e3), mx: None, my: None, shear: Some(1e3) };
        assert!(cfs_ratio_enclosures(&m, &f, &ZERO_BOUND).is_err());
        let f0 = CfsDesignForces { shear: None, ..f.clone() };
        assert!(cfs_ratio_enclosures(&m, &f0, &ZERO_BOUND).is_ok());
        // No xo: flexural-torsional buckling unknown, compression refused
        // (the f64 check flags it); tension alone is still certified.
        let no_xo = CfsMemberData { xo: None, ..m.clone() };
        assert!(cfs_ratio_enclosures(&no_xo, &f0, &ZERO_BOUND).is_err());
        let tension = CfsDesignForces { axial: Some(1e3), ..f0.clone() };
        assert!(cfs_ratio_enclosures(&no_xo, &tension, &ZERO_BOUND).is_ok());
        let res = certify_cfs_members(&CertifiedCfsCheckInput {
            members: vec![CfsMemberData { ry: 0.0, ..m }],
            demands: vec![BoundedCfsDemand { forces: f0, bound: ZERO_BOUND }],
        });
        assert!(!res[0].certified && !res[0].certified_ok, "{res:?}");
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

// ==================== Isolated footings (CIRSOC 201) ====================

const FOOTING_CHECK_NAMES: [&str; 3] = ["Bearing", "One-way shear", "Punching"];

/// Certified CIRSOC 201 isolated footings (`postprocess::isolated_footing`): per footing, the
/// enclosure of the bearing, one-way shear and punching utilizations, evaluated through the same
/// generic formulas as the ordinary check. A footing the check refuses (uplift, a significant or
/// unformed unbalanced moment, not isolated) is not certified.
pub fn certify_isolated_footings(
    input: &crate::postprocess::isolated_footing::IsolatedFootingInput,
) -> Vec<CertifiedMemberResult> {
    use crate::postprocess::isolated_footing::footing_ratio_enclosures;
    certify_members(
        &input.footings,
        |f| f.footing_id,
        &input.footings,
        |f| f.footing_id,
        &FOOTING_CHECK_NAMES,
        |f, _| {
            let r = footing_ratio_enclosures::<Interval>(f)?;
            for (e, name) in r.iter().zip(FOOTING_CHECK_NAMES) {
                if !e.is_finite() {
                    return Err(format!("{name}: enclosure not finite"));
                }
            }
            Ok(r.to_vec())
        },
    )
}

