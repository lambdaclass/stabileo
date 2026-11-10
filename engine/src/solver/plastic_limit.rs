use crate::solver::support::support_dofs_2d;
use crate::postprocess::diagrams::compute_diagram_value_at;
use crate::types::*;
use std::collections::HashMap;

/// Members the limit analysis takes on; its dense linear program grows with the square of
/// the number of sections.
pub const MAX_LIMIT_ELEMENTS: usize = 200;

const FIT: [f64; 4] = [0.125, 0.375, 0.625, 0.875];
const MAX_CERTIFIED_ELEMENTS: usize = 100;
const INTERIOR: [f64; 3] = [0.25, 0.5, 0.75];
const MAX_ROUNDS: usize = 60;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitHinge {
    pub element_id: usize,
    pub position: f64,
    /// "bending" or "axial".
    pub kind: String,
    /// Sign of the moment (or axial force) the section carries at collapse.
    pub sign: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitResult {
    /// Statically admissible load factor: the field it comes with satisfies equilibrium and
    /// the yield condition at every section, so it is a lower bound of the collapse factor.
    pub lambda: f64,
    /// Optimum of the linear program on the sampled sections, an upper bound of it.
    pub lambda_upper: f64,
    pub hinges: Vec<LimitHinge>,
    /// What the exact plastic certificate, which shares nothing with this linear program, says
    /// of `lambda`. Outside its scope the caller confirms `lambda` some other way or not at all.
    pub confirmation: Confirmation,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Confirmation {
    /// The certificate's bounds meet at the factor.
    Exact,
    /// The factor lies outside the certificate's bounds; `lower` is its certified lower bound,
    /// axial capacities included.
    Contradicted { reason: String, lower: f64 },
    /// The factor lies inside the certificate's bounds, which do not meet (axial capacities
    /// govern, or the certificate did not converge): only an independent history can confirm it.
    Bracketed { reason: String, lower: f64, upper: f64 },
    OutOfScope { reason: String },
}

impl Confirmation {
    /// `Ok` when the certificate's bounds meet at `lambda`, or, when they do not reach it, when an
    /// independent step-by-step history ends at a mechanism within `tol` of it.
    pub fn accept(&self, lambda: f64, history: Option<f64>, tol: f64) -> Result<(), String> {
        let reason = match self {
            Confirmation::Exact => return Ok(()),
            Confirmation::Contradicted { reason, .. } => return Err(reason.clone()),
            Confirmation::Bracketed { reason, .. } | Confirmation::OutOfScope { reason } => reason,
        };
        match history {
            Some(h) if (h - lambda).abs() <= tol * lambda => Ok(()),
            Some(h) => Err(format!("{reason}, and the step-by-step history ends at {h}, not at {lambda}")),
            None => Err(format!("{reason}, and the step-by-step history ends at no mechanism")),
        }
    }

    /// The factor to report when `accept` fails: the certified lower bound where there is one,
    /// else the lower of the two uncertified factors.
    pub fn unconfirmed_factor(&self, lambda: f64, history: f64) -> f64 {
        match self {
            Confirmation::Contradicted { lower, .. } | Confirmation::Bracketed { lower, .. } => *lower,
            _ => lambda.min(history),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitInput {
    pub solver: SolverInput,
    /// Plastic moment per element id; every frame needs a finite, positive entry or the input is refused.
    #[serde(default)]
    pub mp: HashMap<String, f64>,
    /// Axial yield force per element id, positive; a missing entry never yields axially, an infinite one is refused.
    #[serde(default)]
    pub np: HashMap<String, f64>,
}

struct Piece {
    ta: f64,
    tb: f64,
    m: [f64; 4],
    n: [f64; 4],
}

struct Member {
    id: usize,
    mp: f64,
    np: f64,
    free_start: bool,
    free_end: bool,
    pieces: Vec<Piece>,
    /// Per self-stress field: moment at the start, at the end, and the axial force.
    selfs: Vec<[f64; 3]>,
}

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Moment,
    Axial,
}

#[derive(Clone, Copy)]
struct Sample {
    m: usize,
    p: usize,
    u: f64,
    kind: Kind,
}

fn cubic_fit(f: impl Fn(f64) -> f64) -> [f64; 4] {
    let y: Vec<f64> = FIT.iter().map(|&u| f(u)).collect();
    let mut a: Vec<[f64; 5]> = FIT.iter().zip(&y).map(|(&u, &v)| [1.0, u, u * u, u * u * u, v]).collect();
    for c in 0..4 {
        let piv = (c..4).max_by(|&x, &z| a[x][c].abs().total_cmp(&a[z][c].abs())).unwrap();
        a.swap(c, piv);
        for r in 0..4 {
            if r != c {
                let f = a[r][c] / a[c][c];
                for k in c..5 {
                    a[r][k] -= f * a[c][k];
                }
            }
        }
    }
    [a[0][4] / a[0][0], a[1][4] / a[1][1], a[2][4] / a[2][2], a[3][4] / a[3][3]]
}

fn poly(c: &[f64; 4], u: f64) -> f64 {
    ((c[3] * u + c[2]) * u + c[1]) * u + c[0]
}

fn unique_key<V>(map: &HashMap<String, V>, id: usize) -> String {
    let mut k = id.to_string();
    let mut n = 0;
    while map.contains_key(&k) {
        n += 1;
        k = format!("{id}~limit{n}");
    }
    k
}

/// What the exact plastic certificate (`certify::plastic`, rational arithmetic, its own
/// equilibrium and mechanism) says of `lambda` as the collapse factor of the model. Its static
/// field is held to the axial capacities too; its mechanism is bending-only, which bounds the
/// factor with axial yield from above but leaves the bounds apart when axial yield governs.
pub fn confirm_2d(input: &SolverInput, mp: &HashMap<usize, f64>, np: &HashMap<usize, f64>, lambda: f64) -> Confirmation {
    certificate_encloses(input, mp, np, lambda).unwrap_or_else(|reason| Confirmation::OutOfScope { reason })
}

fn certificate_encloses(input: &SolverInput, mp: &HashMap<usize, f64>, np: &HashMap<usize, f64>, lambda: f64) -> Result<Confirmation, String> {
    super::support::validate_supports_2d(input)?;
    use crate::certify::exact::{q, to_f64_up, Q};
    if input.elements.len() > MAX_CERTIFIED_ELEMENTS {
        return Err(format!("more than {MAX_CERTIFIED_ELEMENTS} members: too large for the exact certificate"));
    }
    use crate::certify::plastic::{build_model, check_static, plastic_candidates, ElemLoad};
    use num_traits::Signed;
    let mut solver = mechanical(input);
    let axial_spans = axial_spans_to_nodes(&mut solver)?;
    for sup in solver.supports.values_mut() {
        let base = support_dofs_2d(sup).map(|d| d.restrained);
        let sprung = support_dofs_2d(sup).map(|d| d.spring).map(|k| k.is_some_and(|k| k > 0.0));
        sup.support_type = match [0, 1, 2].map(|i| base[i] || sprung[i]) {
            [true, true, true] => "fixed",
            [true, true, false] => "pinned",
            [false, true, false] => "rollerX",
            [true, false, false] => "rollerZ",
            [false, true, true] => "guidedX",
            [true, false, true] => "guidedZ",
            [false, false, false] => "free",
            [false, false, true] => return Err("the exact certificate does not apply: a support that restrains only the rotation".into()),
        }
        .into();
        (sup.kx, sup.ky, sup.kz) = (None, None, None);
    }
    let mut sections = HashMap::new();
    let mut overrides = HashMap::new();
    let originals: HashMap<usize, SolverSection> = crate::ordered::values(&input.sections).map(|x| (x.id, x.clone())).collect();
    for e in solver.elements.values_mut() {
        let sec = originals.get(&e.section_id).ok_or("element with unknown section")?;
        let h = (12.0 * sec.iz / sec.a).sqrt();
        sections.insert(e.id.to_string(), PlasticSectionData { a: sec.a, iz: sec.iz, material_id: e.material_id, b: Some(sec.a / h), h: Some(h) });
        if let Some(&m) = mp.get(&e.id).filter(|m| m.is_finite() && **m > 0.0) {
            overrides.insert(e.id.to_string(), m);
        } else if e.elem_type == "frame" {
            return Err(format!("element {} has no finite plastic moment", e.id));
        }
        e.section_id = e.id;
    }
    solver.sections = crate::ordered::values(&input.elements)
        .map(|e| {
            let sec = &originals[&e.section_id];
            (e.id.to_string(), SolverSection { id: e.id, ..sec.clone() })
        })
        .collect();
    let materials = crate::ordered::values(&input.materials).map(|m| (m.id.to_string(), PlasticMaterialData { fy: Some(1.0) })).collect();
    let pi = PlasticInput { solver, sections, materials, max_hinges: None, mp_overrides: Some(overrides) };
    let refused = |why: String| format!("the exact certificate does not apply: {why}");
    crate::certify::finite::check_input(&pi).map_err(refused)?;
    let model = build_model(&pi).map_err(refused)?;
    let c = plastic_candidates(&model, None).map_err(refused)?;
    let (Some(field), Some(mech)) = (&c.static_field, &c.mechanism_check) else {
        return Err(refused(c.static_reason.or(c.mechanism_reason).unwrap_or_else(|| "no bound".into())));
    };
    let scale = check_static(&model, field).map_err(refused)?.scale;
    let up = to_f64_up(&mech.lambda_upper).ok_or_else(|| refused("upper bound out of range".into()))?;
    let lower = q(lambda * (1.0 - 1e-6)).ok_or("non-finite collapse factor")? / &field.lambda;
    let mut admissible = lower <= scale;
    let mut axial_scale = f64::INFINITY;
    for e in model.elems.iter().zip(&field.elems).filter(|(e, _)| np.get(&e.id).is_some_and(|n| n.is_finite())) {
        let (e, [fx, fz, _]) = e;
        let npl = q(np[&e.id]).ok_or("non-finite axial capacity")?;
        let lsq = &e.dx * &e.dx + &e.dz * &e.dz;
        let mut n = fx * &e.dx + fz * &e.dz;
        let mut points: Vec<(&Q, &Q)> = e.loads.iter().filter_map(|ld| if let ElemLoad::Point { ta, px, .. } = ld { Some((ta, px)) } else { None }).collect();
        points.sort_by(|a, b| a.0.cmp(b.0));
        let mut values = vec![n.clone()];
        for (_, px) in points {
            n += &field.lambda * px * e.l.as_ref().ok_or("point load on a member of irrational length")?;
            values.push(n.clone());
        }
        // `n` carries N·L; the axial span loads moved to the nodes can shift N by up to 2∫|q|.
        if let Some(&total) = axial_spans.get(&e.id) {
            let spread = q(2.0 * total * (1.0 + 1e-9) * crate::certify::exact::to_f64(&lsq).sqrt() * (1.0 + 1e-9)).ok_or("non-finite axial span load")? * &field.lambda;
            for v in values.iter_mut() {
                *v = v.abs() + &spread;
            }
        }
        admissible &= values.iter().all(|v| &lower * &lower * v * v <= &npl * &npl * &lsq);
        let lsq = crate::certify::exact::to_f64(&lsq);
        for v in &values {
            let v = crate::certify::exact::to_f64(v).abs();
            if v > 0.0 {
                axial_scale = axial_scale.min(np[&e.id] * lsq.sqrt() / v);
            }
        }
    }
    let lower = (crate::certify::exact::to_f64(&field.lambda) * crate::certify::exact::to_f64(&scale).min(axial_scale) * (1.0 - 1e-9)).min(up);
    let bounds = format!("the exact certificate bounds the collapse factor by [{lower}, {up}]");
    Ok(if lambda > up * (1.0 + 1e-7) || lambda < lower * (1.0 - 1e-6) {
        Confirmation::Contradicted { reason: format!("{bounds}, not {lambda}"), lower }
    } else if admissible && lambda >= up * (1.0 - 1e-6) {
        Confirmation::Exact
    } else {
        Confirmation::Bracketed { reason: format!("{bounds}, too far apart to confirm {lambda}"), lower, upper: up }
    })
}

/// Moves every axial span load to its member's end nodes, which leaves the bending collapse factor
/// as it was but not the member's axial force: returns per member the ∫|q| that bounds the change.
fn axial_spans_to_nodes(solver: &mut SolverInput) -> Result<HashMap<usize, f64>, String> {
    let mut totals: HashMap<usize, f64> = HashMap::new();
    let mut nodal = Vec::new();
    for load in &solver.loads {
        let SolverLoad::AxialDistributed(al) = load else { continue };
        if al.q_i == 0.0 && al.q_j == 0.0 {
            continue;
        }
        let e = crate::ordered::values(&solver.elements).find(|e| e.id == al.element_id).ok_or("axial span load on unknown element")?;
        let node = |id: usize| crate::ordered::values(&solver.nodes).find(|n| n.id == id).ok_or("element on unknown node");
        let (ni, nj) = (node(e.node_i)?, node(e.node_j)?);
        let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
        let len = (dx * dx + dz * dz).sqrt();
        let (a, b) = (al.a.unwrap_or(0.0), al.b.unwrap_or(len));
        if !(len > 0.0 && 0.0 <= a && a <= b && b <= len * (1.0 + 1e-12)) {
            return Err(format!("element {}: axial span load outside the member", e.id));
        }
        let [fi, fj] = crate::element::axial_distributed_fef(al.q_i, al.q_j, a, b, len);
        let (c, s) = (dx / len, dz / len);
        nodal.push(SolverLoad::Nodal(SolverNodalLoad { node_id: e.node_i, fx: fi * c, fz: fi * s, my: 0.0 }));
        nodal.push(SolverLoad::Nodal(SolverNodalLoad { node_id: e.node_j, fx: fj * c, fz: fj * s, my: 0.0 }));
        let abs = if al.q_i * al.q_j >= 0.0 { 0.5 * (al.q_i.abs() + al.q_j.abs()) * (b - a) } else { 0.5 * al.q_i.abs().max(al.q_j.abs()) * (b - a) };
        *totals.entry(e.id).or_default() += abs;
    }
    solver.loads.retain(|l| !matches!(l, SolverLoad::AxialDistributed(_)));
    solver.loads.extend(nodal);
    Ok(totals)
}

fn uniform_stiffness(input: &SolverInput) -> SolverInput {
    let mut s = mechanical(input);
    let lref = extent(input);
    let (ea, ei) = (1000.0, 1000.0 * lref * lref / 12.0);
    for m in s.materials.values_mut() {
        m.e = 1.0;
    }
    for x in s.sections.values_mut() {
        x.a = 1.0;
        x.iz = lref * lref / 12.0;
        x.as_y = None;
    }
    let uniform = |k: &mut Option<f64>, v: f64| {
        if k.is_some_and(|k| k > 0.0 && k.is_finite()) {
            *k = Some(v);
        }
    };
    for sp in s.supports.values_mut() {
        uniform(&mut sp.kx, ea / lref);
        uniform(&mut sp.ky, ea / lref);
        uniform(&mut sp.kz, ei / lref);
    }
    for c in s.connectors.values_mut() {
        for (k, v) in [(&mut c.k_axial, ea / lref), (&mut c.k_shear, ea / lref), (&mut c.k_moment, ei / lref)] {
            if *k > 0.0 && k.is_finite() {
                *k = v;
            }
        }
    }
    s
}

fn mechanical(input: &SolverInput) -> SolverInput {
    let mut s = input.clone();
    s.loads.retain(|l| !matches!(l, SolverLoad::Thermal(_)));
    for sup in s.supports.values_mut() {
        sup.dx = None;
        sup.dz = None;
        sup.dry = None;
    }
    s
}

/// Self-stress fields of the model: the elastic response to a unit dislocation in every
/// member (axial, and bending on each half), which together span every state of
/// self-equilibrium the model's supports, springs, constraints and connectors allow.
fn self_stresses(input: &SolverInput, members: &[usize]) -> Result<Vec<(HashMap<usize, [f64; 3]>, f64)>, String> {
    let mut s = uniform_stiffness(input);
    s.loads.clear();
    let lref = extent(input);
    let mut next_node = crate::ordered::values(&s.nodes).map(|n| n.id).max().unwrap_or(0) + 1;
    let mut next_elem = crate::ordered::values(&s.elements).map(|e| e.id).max().unwrap_or(0) + 1;
    let by_id: HashMap<usize, String> = s.elements.iter().map(|(k, e)| (e.id, k.clone())).collect();
    let mut halves: HashMap<usize, usize> = HashMap::new();
    for &id in members {
        let key = &by_id[&id];
        let e = s.elements[key].clone();
        if e.elem_type != "frame" {
            continue;
        }
        let ni = crate::ordered::values(&s.nodes).find(|n| n.id == e.node_i).ok_or("element on unknown node")?.clone();
        let nj = crate::ordered::values(&s.nodes).find(|n| n.id == e.node_j).ok_or("element on unknown node")?.clone();
        let nid = next_node;
        next_node += 1;
        let nkey = unique_key(&s.nodes, nid);
        s.nodes.insert(nkey, SolverNode { id: nid, x: 0.5 * (ni.x + nj.x), z: 0.5 * (ni.z + nj.z) });
        let eid = next_elem;
        next_elem += 1;
        let ekey = unique_key(&s.elements, eid);
        s.elements.insert(ekey, SolverElement { id: eid, node_i: nid, hinge_start: false, ..e.clone() });
        let first = s.elements.get_mut(key).unwrap();
        first.node_j = nid;
        first.hinge_end = false;
        halves.insert(id, eid);
    }
    let thermal = |element_id: usize, uniform: f64, gradient: f64| {
        SolverLoad::Thermal(SolverThermalLoad { element_id, dt_uniform: uniform, dt_gradient: gradient, alpha: Some(1e-5), depth: None })
    };
    let mut cases = Vec::new();
    for &id in members {
        let e = &s.elements[&by_id[&id]];
        let mat = crate::ordered::values(&s.materials).find(|m| m.id == e.material_id).ok_or("element with unknown material")?;
        let sec = crate::ordered::values(&s.sections).find(|x| x.id == e.section_id).ok_or("element with unknown section")?;
        let (ea, ei) = (mat.e * 1000.0 * sec.a * 1e-5, mat.e * 1000.0 * sec.iz * 1e-5 / (12.0 * sec.iz / sec.a).sqrt());
        cases.push((vec![thermal(id, 1.0, 0.0)], ea * lref));
        if let Some(&h) = halves.get(&id) {
            cases.push((vec![thermal(id, 0.0, 1.0)], ei));
            cases.push((vec![thermal(h, 0.0, 1.0)], ei));
        }
    }
    let mut out = Vec::with_capacity(cases.len());
    for (loads, reference) in cases {
        s.loads = loads;
        let r = super::linear::solve_2d(&s)?;
        let ef: HashMap<usize, &ElementForces> = r.element_forces.iter().map(|f| (f.element_id, f)).collect();
        let mut field = HashMap::new();
        for &id in members {
            let (Some(a), Some(b)) = (ef.get(&id), ef.get(halves.get(&id).unwrap_or(&id))) else {
                return Err(format!("no forces for element {id}"));
            };
            field.insert(
                id,
                [compute_diagram_value_at("moment", 0.0, a), compute_diagram_value_at("moment", 1.0, b), compute_diagram_value_at("axial", 0.0, a)],
            );
        }
        out.push((field, reference));
    }
    Ok(out)
}

fn extent(input: &SolverInput) -> f64 {
    let xs: Vec<(f64, f64)> = crate::ordered::values(&input.nodes).map(|n| (n.x, n.z)).collect();
    let span = |f: fn(&(f64, f64)) -> f64| xs.iter().map(f).fold(f64::NEG_INFINITY, f64::max) - xs.iter().map(f).fold(f64::INFINITY, f64::min);
    span(|p| p.0).max(span(|p| p.1)).max(f64::MIN_POSITIVE)
}

/// Collapse load factor of a 2D frame by limit analysis: the largest λ for which a field in
/// equilibrium with λ times the mechanical loads keeps |M| ≤ Mp (and |N| ≤ Np where given) at
/// every section. Equilibrium is the elastic solver's own (supports, springs taken as
/// unbreakable, constraints, connectors), as a particular solution plus self-stress fields.
/// Imposed deformations (temperatures, settlements) do not change a collapse load and are
/// left out. The linear program runs on sampled sections and adds the exact peak of every
/// member's moment diagram until the field is admissible everywhere.
pub fn limit_analysis_2d(input: &SolverInput, mp: &HashMap<usize, f64>, np: &HashMap<usize, f64>) -> Result<LimitResult, String> {
    super::support::validate_supports_2d(input)?;
    if input.elements.len() > MAX_LIMIT_ELEMENTS {
        return Err(format!("more than {MAX_LIMIT_ELEMENTS} members: too large for the limit analysis"));
    }
    for (what, map) in [("plastic moment", mp), ("axial yield force", np)] {
        let mut bad: Vec<(usize, f64)> = map.iter().filter(|(_, v)| !(v.is_finite() && **v > 0.0)).map(|(k, v)| (*k, *v)).collect();
        bad.sort_by_key(|b| b.0);
        if let Some((id, v)) = bad.first() {
            return Err(format!("element {id}: {what} {v} must be finite and positive; leave out a member that never yields"));
        }
    }
    let mut frames: Vec<usize> = crate::ordered::values(&input.elements).filter(|e| e.elem_type == "frame").map(|e| e.id).collect();
    frames.sort();
    if let Some(id) = frames.iter().find(|id| !mp.get(id).is_some_and(|m| m.is_finite())) {
        return Err(format!("element {id}: frame has no finite plastic moment"));
    }
    let mech = mechanical(input);
    if !super::kinematic::analyze_kinematics_2d(&mech).is_solvable {
        return Err(super::plastic::INITIAL_MECHANISM.into());
    }
    let r0 = super::linear::solve_2d(&uniform_stiffness(input))?;
    let ef0: HashMap<usize, &ElementForces> = r0.element_forces.iter().map(|f| (f.element_id, f)).collect();
    let mut elems: Vec<&SolverElement> = crate::ordered::values(&input.elements).collect();
    elems.sort_by_key(|e| e.id);
    let yield_of = |map: &HashMap<usize, f64>, id: usize| map.get(&id).copied().filter(|v| v.is_finite() && *v > 0.0).unwrap_or(f64::INFINITY);
    let mut members = Vec::new();
    for e in &elems {
        let (m_y, n_y) = (if e.elem_type == "frame" { yield_of(mp, e.id) } else { f64::INFINITY }, yield_of(np, e.id));
        if e.elem_type != "frame" && e.elem_type != "truss" {
            return Err(format!("element type '{}' is not part of the limit analysis", e.elem_type));
        }
        let ef = *ef0.get(&e.id).ok_or_else(|| format!("no forces for element {}", e.id))?;
        let len = ef.length;
        let mut cuts = vec![0.0, 1.0];
        cuts.extend(ef.point_loads.iter().map(|p| p.a / len));
        cuts.extend(ef.distributed_loads.iter().chain(&ef.distributed_loads_x).flat_map(|d| [d.a / len, d.b / len]));
        cuts.retain(|t| t.is_finite() && *t >= 0.0 && *t <= 1.0);
        cuts.sort_by(f64::total_cmp);
        if cuts.windows(2).any(|w| w[1] > w[0] && w[1] - w[0] <= 1e-9) {
            return Err(format!(
                "element {}: loads closer than 1e-9 of its length to each other or to its ends leave a stretch between them that the limit analysis cannot resolve",
                e.id
            ));
        }
        cuts.dedup();
        let pieces = cuts
            .windows(2)
            .map(|w| {
                let (ta, tb) = (w[0], w[1]);
                let at = |kind: &'static str| move |u: f64| compute_diagram_value_at(kind, ta + (tb - ta) * u, ef);
                Piece { ta, tb, m: cubic_fit(at("moment")), n: cubic_fit(at("axial")) }
            })
            .collect();
        members.push(Member {
            id: e.id,
            mp: m_y,
            np: n_y,
            free_start: !(e.elem_type == "frame" && e.hinge_start),
            free_end: !(e.elem_type == "frame" && e.hinge_end),
            pieces,
            selfs: Vec::new(),
        });
    }
    if members.iter().all(|m| !m.mp.is_finite() && !m.np.is_finite()) {
        return Err("no member can yield: there is no collapse factor".into());
    }
    let ids: Vec<usize> = members.iter().map(|m| m.id).collect();
    let fields = self_stresses(input, &ids)?;
    let lref = extent(input);
    let mut basis: Vec<Vec<[f64; 3]>> = Vec::new();
    for (f, reference) in &fields {
        let scale = members.iter().map(|m| {
            let v = f[&m.id];
            v[0].abs().max(v[1].abs()).max(v[2].abs() * lref)
        }).fold(0.0f64, f64::max);
        if scale > 1e-9 * reference && scale.is_finite() {
            let chop = |x: f64, unit: f64| if (x * unit).abs() <= 1e-9 * scale { 0.0 } else { x / scale };
            basis.push(members.iter().map(|m| {
                let v = f[&m.id];
                [chop(v[0], 1.0), chop(v[1], 1.0), chop(v[2], lref)]
            }).collect());
        }
    }
    let weights = |b: &[[f64; 3]]| -> Vec<f64> {
        members
            .iter()
            .zip(b)
            .flat_map(|(m, v)| {
                let wm = if m.mp.is_finite() { 1.0 / m.mp } else { 0.0 };
                let wn = if m.np.is_finite() { 1.0 / m.np } else { 0.0 };
                [v[0] * wm, v[1] * wm, v[2] * wn]
            })
            .collect()
    };
    let mut vecs: Vec<(Vec<f64>, Vec<[f64; 3]>)> = basis.iter().map(|b| (weights(b), b.clone())).collect();
    let norm = |v: &[f64]| v.iter().map(|x| x * x).sum::<f64>().sqrt();
    let top = vecs.iter().map(|(v, _)| norm(v)).fold(0.0f64, f64::max);
    let mut ortho: Vec<Vec<[f64; 3]>> = Vec::new();
    let mut taken: Vec<Vec<f64>> = Vec::new();
    while !vecs.is_empty() {
        let (k, nk) = vecs.iter().enumerate().map(|(k, (v, _))| (k, norm(v))).max_by(|a, b| a.1.total_cmp(&b.1)).unwrap();
        if !(nk > 1e-9 * top) {
            break;
        }
        let (v, b) = vecs.swap_remove(k);
        let v: Vec<f64> = v.iter().map(|x| x / nk).collect();
        let b: Vec<[f64; 3]> = b.iter().map(|x| x.map(|y| y / nk)).collect();
        for (w, c) in vecs.iter_mut() {
            let d: f64 = w.iter().zip(&v).map(|(a, b)| a * b).sum();
            for (wi, vi) in w.iter_mut().zip(&v) {
                *wi -= d * vi;
            }
            for (ci, bi) in c.iter_mut().zip(&b) {
                for j in 0..3 {
                    ci[j] -= d * bi[j];
                }
            }
        }
        taken.push(v);
        ortho.push(b);
    }
    for (mi, m) in members.iter_mut().enumerate() {
        m.selfs = ortho.iter().map(|b| b[mi]).collect();
    }
    let r = ortho.len();

    let value = |m: &Member, p: usize, u: f64, kind: Kind, lam: f64, z: &[f64]| -> f64 {
        let pc = &m.pieces[p];
        let t = pc.ta + (pc.tb - pc.ta) * u;
        match kind {
            Kind::Moment => lam * poly(&pc.m, u) + z.iter().zip(&m.selfs).map(|(zk, s)| zk * (s[0] + (s[1] - s[0]) * t)).sum::<f64>(),
            Kind::Axial => lam * poly(&pc.n, u) + z.iter().zip(&m.selfs).map(|(zk, s)| zk * s[2]).sum::<f64>(),
        }
    };
    let cap = |m: &Member, kind: Kind| if kind == Kind::Moment { m.mp } else { m.np };

    let mut samples: Vec<Sample> = Vec::new();
    for (mi, m) in members.iter().enumerate() {
        let last = m.pieces.len() - 1;
        for kind in [Kind::Moment, Kind::Axial] {
            if !cap(m, kind).is_finite() {
                continue;
            }
            for (p, pc) in m.pieces.iter().enumerate() {
                let curved = [2, 3].iter().any(|&k| if kind == Kind::Moment { pc.m[k] != 0.0 } else { pc.n[k] != 0.0 });
                if kind == Kind::Axial || p > 0 || m.free_start {
                    samples.push(Sample { m: mi, p, u: 0.0, kind });
                }
                if kind == Kind::Axial || p < last || m.free_end {
                    samples.push(Sample { m: mi, p, u: 1.0, kind });
                }
                if curved {
                    samples.extend(INTERIOR.iter().map(|&u| Sample { m: mi, p, u, kind }));
                }
            }
        }
    }

    for _ in 0..MAX_ROUNDS {
        let k = samples.len();
        let mut a = vec![Vec::with_capacity(2 * k); r + 1];
        for s in &samples {
            let m = &members[s.m];
            let c = cap(m, s.kind);
            let g = value(m, s.p, s.u, s.kind, 1.0, &vec![0.0; r]) / c;
            let h: Vec<f64> = (0..r).map(|j| {
                let mut z = vec![0.0; r];
                z[j] = 1.0;
                value(m, s.p, s.u, s.kind, 0.0, &z) / c
            }).collect();
            for sign in [1.0, -1.0] {
                a[0].push(sign * g);
                for j in 0..r {
                    a[j + 1].push(sign * h[j]);
                }
            }
        }
        let scales: Vec<f64> = a.iter().map(|row| row.iter().fold(0.0f64, |x, v| x.max(v.abs()))).collect();
        if !(scales[0] > 0.0) {
            return Err("the loads produce no moment or axial force at any section that can yield".into());
        }
        for (row, s) in a.iter_mut().zip(&scales) {
            if *s > 0.0 {
                row.iter_mut().for_each(|v| *v /= s);
            }
        }
        let mut b = vec![0.0; r + 1];
        b[0] = 1.0 / scales[0];
        let (mu, y) = crate::certify::plastic::simplex_min_sum(&a, &b)
            .ok_or("the limit analysis linear program did not solve")?;
        let y: Vec<f64> = y.iter().zip(&scales).map(|(y, s)| if *s > 0.0 { y / s } else { 0.0 }).collect();
        let lam = y[0];
        let z = y[1..].to_vec();
        if !(lam.is_finite() && lam > 0.0) {
            return Err("the limit analysis found no positive collapse factor".into());
        }
        let signed: Vec<f64> = (0..k).map(|i| mu[2 * i] - mu[2 * i + 1]).collect();

        let mut worst = 1.0f64;
        let mut added = Vec::new();
        for (mi, m) in members.iter().enumerate() {
            for kind in [Kind::Moment, Kind::Axial] {
                let c = cap(m, kind);
                if !c.is_finite() {
                    continue;
                }
                for p in 0..m.pieces.len() {
                    let f = |u: f64| value(m, p, u, kind, lam, &z);
                    let co = cubic_fit(f);
                    let mut us = vec![0.0, 1.0];
                    let (qa, qb, qc) = (3.0 * co[3], 2.0 * co[2], co[1]);
                    if qa.abs() > 1e-14 * (qb.abs() + qc.abs()) {
                        let disc = qb * qb - 4.0 * qa * qc;
                        if disc >= 0.0 {
                            let sd = disc.sqrt();
                            let r1 = if qb >= 0.0 { (-qb - sd) / (2.0 * qa) } else { (-qb + sd) / (2.0 * qa) };
                            us.push(r1);
                            if r1 != 0.0 {
                                us.push(qc / (qa * r1));
                            }
                        }
                    } else if qb != 0.0 {
                        us.push(-qc / qb);
                    }
                    for u in us {
                        if !(0.0..=1.0).contains(&u) {
                            continue;
                        }
                        let ratio = f(u).abs() / c;
                        worst = worst.max(ratio);
                        if u > 0.0 && u < 1.0 && ratio > 1.0 + 1e-12 && !samples.iter().chain(&added).any(|s| s.m == mi && s.p == p && s.kind == kind && (s.u - u).abs() < 1e-12) {
                            added.push(Sample { m: mi, p, u, kind });
                        }
                    }
                }
            }
        }
        if added.is_empty() && worst > 1.0 + 1e-6 {
            return Err(format!("the limit analysis leaves a section {worst:.6} times its capacity that it cannot refine"));
        }
        if worst <= 1.0 + 1e-10 || added.is_empty() {
            let big = signed.iter().fold(0.0f64, |x, v| x.max(v.abs()));
            let mut hinges: Vec<LimitHinge> = Vec::new();
            for (s, &mu) in samples.iter().zip(&signed) {
                if mu.abs() <= 1e-9 * big {
                    continue;
                }
                let m = &members[s.m];
                let pc = &m.pieces[s.p];
                let t = pc.ta + (pc.tb - pc.ta) * s.u;
                let kind = if s.kind == Kind::Moment { "bending" } else { "axial" };
                if hinges.iter().any(|h| h.element_id == m.id && h.kind == kind && (h.position - t).abs() < 1e-9) {
                    continue;
                }
                hinges.push(LimitHinge { element_id: m.id, position: t, kind: kind.into(), sign: mu.signum() });
            }
            hinges.sort_by(|a, b| a.element_id.cmp(&b.element_id).then(a.position.total_cmp(&b.position)));
            let capacity = members.iter().flat_map(|m| [m.mp, m.np * lref]).filter(|c| c.is_finite()).fold(0.0f64, f64::max);
            if lam * super::plastic::load_moment_scale_2d(input) > 1e9 * capacity {
                return Err("the loads produce no moment or axial force at any section that can yield".into());
            }
            let lambda = lam / worst;
            let confirmation = confirm_2d(input, mp, np, lambda);
            return Ok(LimitResult { lambda, lambda_upper: lam, hinges, confirmation });
        }
        samples.extend(added);
    }
    Err("the limit analysis did not settle the moment peaks".into())
}

/// `limit_analysis_2d_input`, released from PL-2D-INVARIANCE (#758) only where `confirm_2d` is
/// `Exact`; every other outcome, errors included, is that refusal.
pub fn certified_limit_2d(input: &LimitInput) -> Result<LimitResult, String> {
    use crate::known_issues::{for_2d, refuse, Analysis};
    let mut diagnostics = for_2d(&input.solver, Analysis::Plastic);
    let result = limit_analysis_2d_input(input);
    if matches!(&result, Ok(r) if r.confirmation == Confirmation::Exact && r.lambda.is_finite() && r.lambda > 0.0) {
        diagnostics.retain(|d| d.phase.as_deref() != Some("PL-2D-INVARIANCE"));
    }
    refuse(&diagnostics)?;
    result
}

/// `limit_analysis_2d` from its JSON input.
pub fn limit_analysis_2d_input(input: &LimitInput) -> Result<LimitResult, String> {
    let parse = |m: &HashMap<String, f64>| -> Result<HashMap<usize, f64>, String> {
        let mut keys: Vec<&String> = m.keys().collect();
        keys.sort();
        let mut out = HashMap::new();
        for k in keys {
            let id = k.parse::<usize>().map_err(|_| format!("element id '{k}' is not a number"))?;
            if out.insert(id, m[k]).is_some() {
                return Err(format!("element {id} is given more than one capacity (key '{k}')"));
            }
        }
        Ok(out)
    };
    super::linear::validate_input_2d(&input.solver)?;
    let (mp, np) = (parse(&input.mp)?, parse(&input.np)?);
    limit_analysis_2d(&input.solver, &mp, &np)
}
