//! Checks on the model as entered: materials, sections, geometry scale, load path, supports and
//! springs. None needs a solve.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use super::geometry::{dot, median, norm, sub, Components, ModelGeometry};
use super::{
    finding, fmt, CheckId, MaterialFamily, Params, Report, SanityCode, SanityInput, SanityMaterial, Severity, SkipReason,
};

pub(super) fn run(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    materials(input, g, r);
    sections(input, g, r);
    geometry_scale(input, g, r);
    load_path(input, g, r);
    nodes_on_spans(input, g, r);
    supports(input, g, r);
    springs(input, g, r);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/// No structural material has a modulus outside this, MPa: from soft timber across the grain
/// and polymers (~0.5 GPa) to high-modulus carbon fibre (~450 GPa).
pub const E_PLAUSIBLE: (f64, f64) = (500.0, 450_000.0);
/// Unit weight, kN/m³: nothing structural weighs more than ~100 kN/m³ (lead is 111).
pub const RHO_MAX: f64 = 100.0;
/// fy or f'c, MPa: from low concrete grades to prestressing strand.
pub const FY_PLAUSIBLE: (f64, f64) = (5.0, 2200.0);

/// What each family's modulus, unit weight and strength look like.
struct FamilyBands {
    name: &'static str,
    e: (f64, f64),
    rho: (f64, f64),
}

fn bands(f: MaterialFamily) -> Option<FamilyBands> {
    match f {
        MaterialFamily::Steel => Some(FamilyBands { name: "steel", e: (180_000.0, 220_000.0), rho: (70.0, 85.0) }),
        MaterialFamily::Concrete => Some(FamilyBands { name: "concrete", e: (10_000.0, 55_000.0), rho: (14.0, 28.0) }),
        MaterialFamily::Timber => Some(FamilyBands { name: "timber", e: (4_000.0, 25_000.0), rho: (3.0, 12.0) }),
        MaterialFamily::Aluminium => Some(FamilyBands { name: "aluminium", e: (60_000.0, 80_000.0), rho: (25.0, 29.0) }),
        MaterialFamily::Masonry => Some(FamilyBands { name: "masonry", e: (500.0, 25_000.0), rho: (10.0, 25.0) }),
        MaterialFamily::Unknown => None,
    }
}

/// Typical moduli, MPa, for naming what a corrected value would be.
const TYPICAL_E: [(&str, f64, f64); 4] = [
    ("steel", 190_000.0, 215_000.0),
    ("concrete", 18_000.0, 45_000.0),
    ("aluminium", 65_000.0, 75_000.0),
    ("timber", 7_000.0, 16_000.0),
];

/// Units a stress is commonly mistaken in, with the factor to MPa.
const STRESS_UNITS: [(&str, f64); 6] = [
    ("GPa", 1e3),
    ("kPa (kN/m²)", 1e-3),
    ("Pa", 1e-6),
    ("kgf/cm²", 0.0980665),
    ("psi", 6.894757e-3),
    ("ksi", 6.894757),
];

/// A family read from the material: stated, or unmistakable from its modulus.
fn family_of(m: &SanityMaterial) -> (Option<MaterialFamily>, bool) {
    if let Some(f) = m.family {
        if f != MaterialFamily::Unknown {
            return (Some(f), true);
        }
    }
    let e = m.e;
    let fy = m.fy.unwrap_or(0.0);
    let inferred = if (180_000.0..=220_000.0).contains(&e) {
        Some(MaterialFamily::Steel)
    } else if (18_000.0..=55_000.0).contains(&e) && fy <= 80.0 {
        Some(MaterialFamily::Concrete)
    } else if (60_000.0..=80_000.0).contains(&e) {
        Some(MaterialFamily::Aluminium)
    } else if (7_000.0..=16_000.0).contains(&e) && fy <= 80.0 {
        Some(MaterialFamily::Timber)
    } else {
        None
    };
    (inferred, false)
}

/// The unit the value was probably entered in, and the value it would then be, given the band it
/// should fall in.
fn unit_hint(value: f64, units: &[(&'static str, f64)], targets: &[(&'static str, f64, f64)]) -> Option<(&'static str, f64, &'static str)> {
    for &(unit, factor) in units {
        let v = value * factor;
        for &(name, lo, hi) in targets {
            if v >= lo && v <= hi {
                return Some((unit, v, name));
            }
        }
    }
    None
}

fn materials(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    // Who uses each material: an unused one changes no result.
    let mut members_of: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    let mut shells_of: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for m in &input.members {
        members_of.entry(m.material_id).or_default().push(m.id);
    }
    for s in &input.shells {
        shells_of.entry(s.material_id).or_default().push(s.id);
    }
    let used: BTreeSet<usize> = members_of.keys().chain(shells_of.keys()).copied().collect();
    if used.is_empty() {
        r.skipped(CheckId::Materials, SkipReason::NoMembers, "the model has no members or shells", Params::new());
        return;
    }
    let self_weight_on = input.cases.iter().any(|c| c.self_weight);
    let mut checked = 0;
    for id in used {
        let Some(m) = g.materials.get(&id) else { continue };
        checked += 1;
        let elems = members_of.get(&id).cloned().unwrap_or_default();
        let shells = shells_of.get(&id).cloned().unwrap_or_default();
        let name = if m.name.is_empty() { format!("#{}", m.id) } else { m.name.clone() };
        let (family, stated) = family_of(m);

        // Modulus.
        if m.e > 0.0 && (m.e < E_PLAUSIBLE.0 || m.e > E_PLAUSIBLE.1) {
            let targets: Vec<(&str, f64, f64)> = match family.and_then(bands) {
                Some(b) if stated => vec![(b.name, b.e.0, b.e.1)],
                _ => TYPICAL_E.to_vec(),
            };
            let hint = unit_hint(m.e, &STRESS_UNITS, &targets);
            let mut msg = format!(
                "Material '{}': E = {} MPa is outside every structural material ({}–{} MPa).",
                name, fmt(m.e), fmt(E_PLAUSIBLE.0), fmt(E_PLAUSIBLE.1)
            );
            let mut f = finding(SanityCode::ModulusImplausible, CheckId::Materials, Severity::Error, String::new())
                .with("material", name.clone())
                .with("e", m.e)
                .with("lo", E_PLAUSIBLE.0)
                .with("hi", E_PLAUSIBLE.1);
            if let Some((unit, v, what)) = hint {
                msg.push_str(&format!(" Read as {} it would be {} MPa, which is {}.", unit, fmt(v), what));
                f = f.with("unit", unit).with("corrected", v).with("family", what);
            }
            f.message = msg;
            r.push(f.elements(elems.clone()).shells(shells.clone()));
        } else if let (Some(fam), true) = (family, stated) {
            if let Some(b) = bands(fam) {
                if m.e > 0.0 && (m.e < b.e.0 || m.e > b.e.1) {
                    let msg = format!(
                        "Material '{}' is {} by its grade, but E = {} MPa; {} has {}–{} MPa.",
                        name, b.name, fmt(m.e), b.name, fmt(b.e.0), fmt(b.e.1)
                    );
                    r.push(
                        finding(SanityCode::ModulusFamilyMismatch, CheckId::Materials, Severity::Warning, msg)
                            .with("material", name.clone())
                            .with("family", b.name)
                            .with("e", m.e)
                            .with("lo", b.e.0)
                            .with("hi", b.e.1)
                            .elements(elems.clone())
                            .shells(shells.clone()),
                    );
                }
            }
        }

        // Unit weight.
        if let Some(rho) = m.rho {
            const WEIGHT_UNITS: [(&str, f64); 3] = [("kg/m³", 9.80665e-3), ("t/m³", 9.80665), ("N/m³", 1e-3)];
            let target = family.and_then(bands).map(|b| (b.name, b.rho.0, b.rho.1));
            let out_of_family = target.map_or(false, |(_, lo, hi)| rho > 0.0 && (rho < lo || rho > hi));
            if rho > RHO_MAX || out_of_family {
                let targets: Vec<(&str, f64, f64)> = match target {
                    Some(t) => vec![t],
                    None => vec![("steel", 70.0, 85.0), ("concrete", 14.0, 28.0), ("timber", 3.0, 12.0)],
                };
                let hint = unit_hint(rho, &WEIGHT_UNITS, &targets);
                let severity = if rho > RHO_MAX { Severity::Error } else { Severity::Warning };
                let mut msg = match target {
                    Some((fam, lo, hi)) => format!(
                        "Material '{}': unit weight {} kN/m³, but {} weighs {}–{} kN/m³.",
                        name, fmt(rho), fam, fmt(lo), fmt(hi)
                    ),
                    None => format!(
                        "Material '{}': unit weight {} kN/m³ is more than any structural material (≤ {} kN/m³).",
                        name, fmt(rho), fmt(RHO_MAX)
                    ),
                };
                let mut f = finding(SanityCode::DensityImplausible, CheckId::Materials, severity, String::new())
                    .with("material", name.clone())
                    .with("rho", rho);
                if let Some((fam, lo, hi)) = target {
                    f = f.with("family", fam).with("lo", lo).with("hi", hi);
                } else {
                    f = f.with("lo", 0.0).with("hi", RHO_MAX);
                }
                if let Some((unit, v, _)) = hint {
                    msg.push_str(&format!(" Read as {} it would be {} kN/m³.", unit, fmt(v)));
                    f = f.with("unit", unit).with("corrected", v);
                }
                f.message = msg;
                r.push(f.elements(elems.clone()).shells(shells.clone()));
            } else if rho == 0.0 && self_weight_on {
                let msg = format!(
                    "Material '{}' has zero unit weight while self-weight is on: its {} member(s) and {} shell(s) add no self-weight and no mass.",
                    name,
                    elems.len(),
                    shells.len()
                );
                r.push(
                    finding(SanityCode::DensityZero, CheckId::Materials, Severity::Warning, msg)
                        .with("material", name.clone())
                        .with("members", elems.len())
                        .with("shells", shells.len())
                        .elements(elems.clone())
                        .shells(shells.clone()),
                );
            }
        }

        // Strength.
        if let Some(fy) = m.fy {
            if fy > 0.0 && (fy < FY_PLAUSIBLE.0 || fy > FY_PLAUSIBLE.1) {
                let hint = unit_hint(fy, &STRESS_UNITS[1..], &[("steel", 200.0, 700.0), ("concrete", 15.0, 60.0)]);
                let mut msg = format!(
                    "Material '{}': strength {} MPa is outside every structural material ({}–{} MPa).",
                    name, fmt(fy), fmt(FY_PLAUSIBLE.0), fmt(FY_PLAUSIBLE.1)
                );
                let mut f = finding(SanityCode::StrengthImplausible, CheckId::Materials, Severity::Warning, String::new())
                    .with("material", name.clone())
                    .with("fy", fy)
                    .with("lo", FY_PLAUSIBLE.0)
                    .with("hi", FY_PLAUSIBLE.1);
                if let Some((unit, v, what)) = hint {
                    msg.push_str(&format!(" Read as {} it would be {} MPa, typical of {}.", unit, fmt(v), what));
                    f = f.with("unit", unit).with("corrected", v).with("family", what);
                }
                f.message = msg;
                r.push(f.elements(elems.clone()).shells(shells.clone()));
            }
        }
    }
    if checked == 0 {
        r.skipped(CheckId::Materials, SkipReason::NoMaterials, "no member or shell names a material the model defines", Params::new());
    } else {
        r.ran(CheckId::Materials);
    }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/// A member section above this area, m², is no real section (the largest bridge box girders and
/// piers are tens of m²).
const A_MAX: f64 = 50.0;
/// Below this, m² (1 mm²), no structural member.
const A_MIN: f64 = 1e-6;
/// Radius of gyration √(I/A) bounds, m.
const R_GYR: (f64, f64) = (5e-4, 10.0);
/// A member whose area differs from the model's median by more than this factor is an outlier.
const A_OUTLIER: f64 = 1e4;
/// The same for the moment of inertia (I goes with size⁴, so this is 100× in size).
const I_OUTLIER: f64 = 1e8;

fn sections(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if input.members.is_empty() {
        r.skipped(CheckId::Sections, SkipReason::NoMembers, "the model has no members", Params::new());
        return;
    }
    let mut users: BTreeMap<usize, (Vec<usize>, bool)> = BTreeMap::new();
    for m in &input.members {
        let e = users.entry(m.section_id).or_insert((vec![], true));
        e.0.push(m.id);
        e.1 &= m.truss;
    }
    // Medians over members, so a section used by most of the model weighs as much as it is used.
    let mut areas = vec![];
    let mut inertias = vec![];
    for m in &input.members {
        if let Some(s) = g.sections.get(&m.section_id) {
            if s.a > 0.0 {
                areas.push(s.a);
            }
            if !m.truss && s.iz > 0.0 {
                inertias.push(s.iz);
            }
        }
    }
    let a_med = median(&mut areas);
    let i_med = median(&mut inertias);

    const AREA_UNITS: [(&str, f64); 2] = [("cm²", 1e-4), ("mm²", 1e-6)];
    const INERTIA_UNITS: [(&str, f64); 2] = [("cm⁴", 1e-8), ("mm⁴", 1e-12)];

    for (id, (members, all_truss)) in users {
        let Some(s) = g.sections.get(&id) else { continue };
        if !(s.a > 0.0) {
            continue; // a zero or negative area is the editor's own error
        }
        let name = if s.name.is_empty() { format!("#{}", s.id) } else { s.name.clone() };
        let mut implausible = false;
        if s.a > A_MAX || s.a < A_MIN {
            implausible = true;
            let hint = if s.a > A_MAX { unit_hint(s.a, &AREA_UNITS, &[("", 1e-5, 5.0)]) } else { None };
            let mut msg = format!(
                "Section '{}': A = {} m² is outside any structural member ({}–{} m²).",
                name, fmt(s.a), fmt(A_MIN), fmt(A_MAX)
            );
            let mut f = finding(SanityCode::SectionImplausible, CheckId::Sections, Severity::Warning, String::new())
                .with("section", name.clone())
                .with("property", "A")
                .with("value", s.a)
                .with("lo", A_MIN)
                .with("hi", A_MAX);
            if let Some((unit, v, _)) = hint {
                msg.push_str(&format!(" Read as {} it would be {} m².", unit, fmt(v)));
                f = f.with("unit", unit).with("corrected", v);
            }
            f.message = msg;
            r.push(f.elements(members.clone()));
        }
        if !all_truss {
            for (label, inertia) in [("Iz", Some(s.iz)), ("Iy", s.iy)] {
                let Some(i) = inertia else { continue };
                if !(i > 0.0) {
                    continue;
                }
                let rg = (i / s.a).sqrt();
                if rg > R_GYR.1 || rg < R_GYR.0 {
                    implausible = true;
                    let hint = if rg > R_GYR.1 {
                        INERTIA_UNITS.iter().find_map(|&(u, k)| {
                            let rr = (i * k / s.a).sqrt();
                            (rr >= 0.005 && rr <= 2.0).then_some((u, i * k))
                        })
                    } else {
                        None
                    };
                    let mut msg = format!(
                        "Section '{}': {} = {} m⁴ with A = {} m² gives a radius of gyration of {} m; real sections have {}–{} m.",
                        name, label, fmt(i), fmt(s.a), fmt(rg), fmt(R_GYR.0), fmt(R_GYR.1)
                    );
                    let mut f = finding(SanityCode::SectionImplausible, CheckId::Sections, Severity::Warning, String::new())
                        .with("section", name.clone())
                        .with("property", label)
                        .with("value", i)
                        .with("a", s.a)
                        .with("radius", rg)
                        .with("lo", R_GYR.0)
                        .with("hi", R_GYR.1);
                    if let Some((unit, v)) = hint {
                        msg.push_str(&format!(" Read as {} it would be {} m⁴.", unit, fmt(v)));
                        f = f.with("unit", unit).with("corrected", v);
                    }
                    f.message = msg;
                    r.push(f.elements(members.clone()));
                }
            }
        }
        if implausible {
            continue; // the outlier test would say the same thing again
        }
        let mut outlier = |prop: &str, v: f64, med: f64, limit: f64| {
            if med > 0.0 && v > 0.0 {
                let ratio = v / med;
                if ratio > limit || ratio < 1.0 / limit {
                    let msg = format!(
                        "Section '{}': {} = {} is {}× the model's median ({}).",
                        name, prop, fmt(v), fmt(ratio), fmt(med)
                    );
                    r.push(
                        finding(SanityCode::SectionOutlier, CheckId::Sections, Severity::Warning, msg)
                            .with("section", name.clone())
                            .with("property", prop)
                            .with("value", v)
                            .with("median", med)
                            .with("ratio", ratio)
                            .elements(members.clone()),
                    );
                    return true;
                }
            }
            false
        };
        if !outlier("A", s.a, a_med, A_OUTLIER) && !all_truss {
            outlier("Iz", s.iz, i_med, I_OUTLIER);
        }
    }
    r.ran(CheckId::Sections);
}

// ---------------------------------------------------------------------------
// Geometry scale
// ---------------------------------------------------------------------------

/// A typical member longer than this, m, is not plausible in metres.
const MEDIAN_MEMBER_MAX: f64 = 100.0;
/// A typical storey taller than this, m, is not plausible in metres.
const MEDIAN_STOREY_MAX: f64 = 20.0;

fn geometry_scale(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if g.members.is_empty() && input.shells.is_empty() {
        r.skipped(CheckId::Geometry, SkipReason::NoMembers, "the model has no members or shells", Params::new());
        return;
    }
    let mut lengths: Vec<f64> = g.members.iter().map(|m| m.length).collect();
    let med = median(&mut lengths);
    if med > MEDIAN_MEMBER_MAX {
        let msg = format!(
            "The median member is {} m long (longest {} m); members of more than {} m are not plausible in metres. The geometry looks like millimetres or centimetres.",
            fmt(med),
            fmt(lengths.last().copied().unwrap_or(med)),
            fmt(MEDIAN_MEMBER_MAX)
        );
        r.push(
            finding(SanityCode::GeometryScale, CheckId::Geometry, Severity::Warning, msg)
                .with("what", "member")
                .with("median", med)
                .with("limit", MEDIAN_MEMBER_MAX),
        );
    } else if g.building {
        let mut storeys: Vec<f64> = vec![];
        let mut prev = g.base;
        for l in &g.levels {
            storeys.push(l.z - prev);
            prev = l.z;
        }
        let ms = median(&mut storeys);
        if ms > MEDIAN_STOREY_MAX {
            let msg = format!(
                "The median storey is {} m tall; storeys of more than {} m are not plausible in metres. The geometry looks like millimetres or centimetres.",
                fmt(ms),
                fmt(MEDIAN_STOREY_MAX)
            );
            r.push(
                finding(SanityCode::GeometryScale, CheckId::Geometry, Severity::Warning, msg)
                    .with("what", "storey")
                    .with("median", ms)
                    .with("limit", MEDIAN_STOREY_MAX),
            );
        }
    }
    r.ran(CheckId::Geometry);
}

// ---------------------------------------------------------------------------
// Load path: parts with no support
// ---------------------------------------------------------------------------

fn load_path(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if input.members.is_empty() && input.shells.is_empty() {
        r.skipped(CheckId::LoadPath, SkipReason::NoMembers, "the model has no members or shells", Params::new());
        return;
    }
    let supported: HashSet<usize> = input
        .supports
        .iter()
        .filter(|s| (0..6).any(|k| s.holds(k)))
        .map(|s| s.node_id)
        .collect();
    if supported.is_empty() {
        r.skipped(CheckId::LoadPath, SkipReason::NoSupports, "the model has no supports", Params::new());
        return;
    }
    let mut uf = Components::new();
    for m in &input.members {
        uf.union(m.node_i, m.node_j);
    }
    for s in &input.shells {
        for w in s.nodes.windows(2) {
            uf.union(w[0], w[1]);
        }
    }
    for l in &input.links {
        for w in l.windows(2) {
            uf.union(w[0], w[1]);
        }
    }
    let mut held: HashSet<usize> = HashSet::new();
    for &n in &supported {
        let root = uf.find(n);
        held.insert(root);
    }
    let mut parts: BTreeMap<usize, (BTreeSet<usize>, Vec<usize>, Vec<usize>)> = BTreeMap::new();
    for m in &input.members {
        let root = uf.find(m.node_i);
        if held.contains(&root) {
            continue;
        }
        let e = parts.entry(root).or_default();
        e.0.insert(m.node_i);
        e.0.insert(m.node_j);
        e.1.push(m.id);
    }
    for s in &input.shells {
        let Some(&n0) = s.nodes.first() else { continue };
        let root = uf.find(n0);
        if held.contains(&root) {
            continue;
        }
        let e = parts.entry(root).or_default();
        e.0.extend(s.nodes.iter().copied());
        e.2.push(s.id);
    }
    let _ = g;
    for (_, (nodes, members, shells)) in parts {
        let msg = format!(
            "{} member(s), {} shell(s) and {} node(s) are connected to each other but to no support.",
            members.len(),
            shells.len(),
            nodes.len()
        );
        r.push(
            finding(SanityCode::UnsupportedPart, CheckId::LoadPath, Severity::Error, msg)
                .with("members", members.len())
                .with("shells", shells.len())
                .with("nodes", nodes.len())
                .elements(members)
                .shells(shells)
                .nodes(nodes.into_iter().collect()),
        );
    }
    r.ran(CheckId::LoadPath);
}

// ---------------------------------------------------------------------------
// Nodes on a member's span, not connected to it
// ---------------------------------------------------------------------------

/// A node within this fraction of a member's length of its axis, and at least this far from
/// both ends, lies on its span. Scale-free, so a model drawn in millimetres reads the same.
const ON_SPAN_TOL: f64 = 1e-3;

/// Nodes that lie on a member's span without being one of its ends. The solver connects a member
/// only at its two end nodes, so a node drawn on it is not connected: what frames into that node
/// never reaches the member. Only nodes that something structural uses (a member or a shell) are
/// looked at; a free construction point on a member changes nothing. A node tied to one of the
/// member's ends by a link (a rigid offset, a constraint) is connected through it: a beam hung
/// below a slab by an offset has its end on the column's line, linked to the column's node.
fn nodes_on_spans(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    if g.members.is_empty() {
        r.skipped(CheckId::Connectivity, SkipReason::NoMembers, "the model has no members", Params::new());
        return;
    }
    let mut linked = Components::new();
    for l in &input.links {
        for w in l.windows(2) {
            linked.union(w[0], w[1]);
        }
    }
    let mut used: BTreeSet<usize> = BTreeSet::new();
    for m in &g.members {
        used.insert(m.i);
        used.insert(m.j);
    }
    for s in &input.shells {
        used.extend(s.nodes.iter().copied());
    }
    // A uniform grid over the used nodes, cells about a typical member long.
    let mut lengths: Vec<f64> = g.members.iter().map(|m| m.length).collect();
    let cell = median(&mut lengths).max(1e-3 * g.extent).max(1e-9);
    let key = |p: [f64; 3]| [(p[0] / cell).floor() as i64, (p[1] / cell).floor() as i64, (p[2] / cell).floor() as i64];
    let mut grid: HashMap<[i64; 3], Vec<(usize, [f64; 3])>> = HashMap::new();
    for &n in &used {
        if let Some(&p) = g.nodes.get(&n) {
            grid.entry(key(p)).or_default().push((n, p));
        }
    }
    // (member, node) pairs, the member's own ends excluded.
    let mut hits: Vec<(usize, usize, f64)> = vec![];
    for m in &g.members {
        let tol = ON_SPAN_TOL * m.length;
        let lo = key([m.pi[0].min(m.pj[0]) - tol, m.pi[1].min(m.pj[1]) - tol, m.pi[2].min(m.pj[2]) - tol]);
        let hi = key([m.pi[0].max(m.pj[0]) + tol, m.pi[1].max(m.pj[1]) + tol, m.pi[2].max(m.pj[2]) + tol]);
        for x in lo[0]..=hi[0] {
            for y in lo[1]..=hi[1] {
                for z in lo[2]..=hi[2] {
                    let Some(bucket) = grid.get(&[x, y, z]) else { continue };
                    for &(n, p) in bucket {
                        if n == m.i || n == m.j {
                            continue;
                        }
                        let root = linked.find(n);
                        if root == linked.find(m.i) || root == linked.find(m.j) {
                            continue;
                        }
                        let v = sub(p, m.pi);
                        let t = dot(v, m.dir);
                        if t < tol || t > m.length - tol {
                            continue;
                        }
                        let off = norm([v[0] - t * m.dir[0], v[1] - t * m.dir[1], v[2] - t * m.dir[2]]);
                        if off <= tol {
                            hits.push((m.id, n, t / m.length));
                        }
                    }
                }
            }
        }
    }
    if !hits.is_empty() {
        hits.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        let members: BTreeSet<usize> = hits.iter().map(|h| h.0).collect();
        let nodes: BTreeSet<usize> = hits.iter().map(|h| h.1).collect();
        let (m0, n0, t0) = hits[0];
        let msg = format!(
            "{} node(s) lie on the span of {} member(s) without being connected to them. First: node {} at {} % of member {}.",
            nodes.len(),
            members.len(),
            n0,
            fmt(100.0 * t0),
            m0
        );
        r.push(
            finding(SanityCode::NodeOnSpan, CheckId::Connectivity, Severity::Warning, msg)
                .with("count", nodes.len())
                .with("members", members.len())
                .with("node", n0)
                .with("member", m0)
                .with("percent", 100.0 * t0)
                .elements(members.into_iter().collect())
                .nodes(nodes.into_iter().collect()),
        );
    }
    r.ran(CheckId::Connectivity);
}

// ---------------------------------------------------------------------------
// Supports on one point or one line
// ---------------------------------------------------------------------------

fn supports(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    let held: Vec<(&super::SanitySupport, [f64; 3])> = input
        .supports
        .iter()
        .filter(|s| (0..3).any(|k| s.holds(k)))
        .filter_map(|s| g.nodes.get(&s.node_id).map(|p| (s, *p)))
        .collect();
    if held.is_empty() {
        r.skipped(CheckId::Supports, SkipReason::NoSupports, "the model has no supports", Params::new());
        return;
    }
    let tol = (1e-6 * g.extent).max(1e-6);
    let p0 = held[0].1;
    let far = held.iter().map(|(_, p)| norm(sub(*p, p0))).fold(0.0, f64::max);
    let nodes: Vec<usize> = held.iter().map(|(s, _)| s.node_id).collect();
    // The rotations that matter: in a plane model only the one about the plane's normal.
    let normal_axis = if input.up.index() == 1 { 2 } else { 1 };
    if far <= tol {
        // Every support at one point.
        let needed: Vec<usize> = if input.planar { vec![3 + normal_axis] } else { vec![3, 4, 5] };
        let missing: Vec<usize> = needed.iter().copied().filter(|&k| !held.iter().any(|(s, _)| s.holds(k))).collect();
        if !missing.is_empty() && g.extent > tol {
            let axes: Vec<&str> = missing.iter().map(|k| ["rx", "ry", "rz"][k - 3]).collect();
            let msg = format!(
                "All {} support(s) are at one point and rotation {} is free there: the structure can turn about that point.",
                held.len(),
                axes.join(", ")
            );
            r.push(
                finding(SanityCode::SupportsSinglePoint, CheckId::Supports, Severity::Warning, msg)
                    .with("count", held.len())
                    .with("axes", axes.join(", "))
                    .nodes(nodes),
            );
        }
        r.ran(CheckId::Supports);
        return;
    }
    if input.planar {
        // Supports on a line are a beam on supports: fine in a plane model.
        r.ran(CheckId::Supports);
        return;
    }
    // On one line?
    let far_p = held.iter().map(|(_, p)| *p).max_by(|a, b| norm(sub(*a, p0)).partial_cmp(&norm(sub(*b, p0))).unwrap()).unwrap();
    let d = {
        let v = sub(far_p, p0);
        let n = norm(v);
        [v[0] / n, v[1] / n, v[2] / n]
    };
    let off_line = |p: [f64; 3]| {
        let v = sub(p, p0);
        let t = dot(v, d);
        norm([v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]])
    };
    let colinear = held.iter().all(|(_, p)| off_line(*p) <= tol.max(1e-4 * far));
    if colinear {
        // A structure that is itself on the line (a straight beam) cannot tip about it.
        let structure_off = g.nodes.values().map(|p| off_line(*p)).fold(0.0, f64::max);
        if structure_off > 1e-3 * far.max(g.extent) {
            let rot_held = held.iter().any(|(s, _)| (0..3).any(|k| s.holds(3 + k) && d[k].abs() > 0.1));
            if !rot_held {
                let msg = format!(
                    "All {} supports lie on one line (direction {}, {}, {}) and none holds rotation about it, while the structure reaches {} m off that line.",
                    held.len(),
                    fmt(d[0]),
                    fmt(d[1]),
                    fmt(d[2]),
                    fmt(structure_off)
                );
                r.push(
                    finding(SanityCode::SupportsColinear, CheckId::Supports, Severity::Warning, msg)
                        .with("count", held.len())
                        .with("dx", d[0])
                        .with("dy", d[1])
                        .with("dz", d[2])
                        .with("offset", structure_off)
                        .nodes(nodes),
                );
            }
        }
    }
    r.ran(CheckId::Supports);
}

// ---------------------------------------------------------------------------
// Springs relative to the structure they hold
// ---------------------------------------------------------------------------

const SPRING_SOFT: f64 = 1e-6;
const SPRING_STIFF: f64 = 1e8;

fn springs(input: &SanityInput, g: &ModelGeometry, r: &mut Report) {
    let any = input.supports.iter().any(|s| s.spring.iter().any(|k| k.map_or(false, |v| v > 0.0)));
    if !any {
        r.ran(CheckId::Springs);
        return;
    }
    // Members and shells at each node.
    let mut at: HashMap<usize, Vec<usize>> = HashMap::new();
    for (k, m) in g.members.iter().enumerate() {
        at.entry(m.i).or_default().push(k);
        at.entry(m.j).or_default().push(k);
    }
    let member_def: HashMap<usize, &super::SanityMember> = input.members.iter().map(|m| (m.id, m)).collect();
    let mut shells_at: HashMap<usize, Vec<&super::SanityShell>> = HashMap::new();
    for s in &input.shells {
        for &n in &s.nodes {
            shells_at.entry(n).or_default().push(s);
        }
    }
    struct Hit {
        node: usize,
        ratio: f64,
        k: f64,
        kref: f64,
        comp: usize,
    }
    let mut soft: Vec<Hit> = vec![];
    let mut stiff: Vec<Hit> = vec![];
    for s in &input.supports {
        for comp in 0..6 {
            let Some(k) = s.spring[comp] else { continue };
            if !(k > 0.0) || s.restraint[comp] {
                continue;
            }
            let mut kref = 0.0;
            for &mi in at.get(&s.node_id).map(|v| v.as_slice()).unwrap_or(&[]) {
                let mg = &g.members[mi];
                let Some(def) = member_def.get(&mg.id) else { continue };
                let (Some(mat), Some(sec)) = (g.materials.get(&def.material_id), g.sections.get(&def.section_id)) else { continue };
                let e = mat.e * 1e3; // kN/m²
                let ea_l = e * sec.a / mg.length;
                let i = if def.truss { 0.0 } else { sec.iz.max(sec.iy.unwrap_or(0.0)) };
                if comp < 3 {
                    let c = mg.dir[comp];
                    kref += ea_l * c * c + 3.0 * e * i / mg.length.powi(3) * (1.0 - c * c);
                } else {
                    kref += 4.0 * e * i / mg.length;
                }
            }
            if kref == 0.0 {
                for sh in shells_at.get(&s.node_id).map(|v| v.as_slice()).unwrap_or(&[]) {
                    if let Some(mat) = g.materials.get(&sh.material_id) {
                        let e = mat.e * 1e3;
                        kref += if comp < 3 { e * sh.thickness } else { e * sh.thickness.powi(3) / 12.0 };
                    }
                }
            }
            if !(kref > 0.0) {
                continue;
            }
            let ratio = k / kref;
            let hit = Hit { node: s.node_id, ratio, k, kref, comp };
            if ratio < SPRING_SOFT {
                soft.push(hit);
            } else if ratio > SPRING_STIFF {
                stiff.push(hit);
            }
        }
    }
    const COMP: [&str; 6] = ["kx", "ky", "kz", "krx", "kry", "krz"];
    for (hits, code, lim) in [(soft, SanityCode::SpringSoft, SPRING_SOFT), (stiff, SanityCode::SpringStiff, SPRING_STIFF)] {
        if hits.is_empty() {
            continue;
        }
        let worst = if code == SanityCode::SpringSoft {
            hits.iter().min_by(|a, b| a.ratio.partial_cmp(&b.ratio).unwrap()).unwrap()
        } else {
            hits.iter().max_by(|a, b| a.ratio.partial_cmp(&b.ratio).unwrap()).unwrap()
        };
        let nodes: Vec<usize> = hits.iter().map(|h| h.node).collect::<BTreeSet<_>>().into_iter().collect();
        let msg = format!(
            "{} spring(s) are {} than the members they hold by more than {}×: at node {}, {} = {} against {} from the members framing in (ratio {}).",
            hits.len(),
            if code == SanityCode::SpringSoft { "softer" } else { "stiffer" },
            fmt(if code == SanityCode::SpringSoft { 1.0 / lim } else { lim }),
            worst.node,
            COMP[worst.comp],
            fmt(worst.k),
            fmt(worst.kref),
            fmt(worst.ratio)
        );
        r.push(
            finding(code, CheckId::Springs, Severity::Warning, msg)
                .with("count", hits.len())
                .with("node", worst.node)
                .with("component", COMP[worst.comp])
                .with("k", worst.k)
                .with("kref", worst.kref)
                .with("ratio", worst.ratio)
                .nodes(nodes),
        );
    }
    r.ran(CheckId::Springs);
}
