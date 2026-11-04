//! Symmetric models: a symmetric structure under a symmetric load responds
//! symmetrically, and (linear analyses) under an antisymmetric load
//! antisymmetrically.
//!
//! Symmetric models are built from any model ("half"): 2D — mirror it about a
//! vertical line through its right-most node and join the copies there; 3D —
//! rotate it by 180° about a vertical axis through one of its nodes (C2
//! symmetry) and join there. Loads are copied with the same transform (or
//! negated, for the antisymmetric case). The response must then equal its own
//! image under the symmetry, with nodes and members exchanged pairwise.

use crate::ana2::{Ana2, Law};
use crate::ana3::Ana3;
use crate::case::{Case2, Case3};
use crate::checks2::guarded;
use crate::tally::{Tally, Verdict};
use dedaliano_engine::metamorphic::compare::compare_with_floor;
use dedaliano_engine::metamorphic::conditioning::{self, INCONCLUSIVE};
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::{transform_2d, transform_3d, Iso2, Iso3};
use dedaliano_engine::types::*;

pub struct Sym2 {
    pub case: Case2,
    pub iso: Iso2,
    pub pair: Relabel,
}

fn neg2(l: &SolverLoad) -> SolverLoad {
    let mut l = l.clone();
    match &mut l {
        SolverLoad::Nodal(n) => {
            n.fx = -n.fx;
            n.fz = -n.fz;
            n.my = -n.my;
        }
        SolverLoad::Distributed(d) => {
            d.q_i = -d.q_i;
            d.q_j = -d.q_j;
        }
        SolverLoad::PointOnElement(p) => {
            p.p = -p.p;
            p.px = p.px.map(|v| -v);
            p.my = p.my.map(|v| -v);
        }
        SolverLoad::Thermal(t) => {
            t.dt_uniform = -t.dt_uniform;
            t.dt_gradient = -t.dt_gradient;
        }
        SolverLoad::AxialDistributed(d) => {
            d.q_i = -d.q_i;
            d.q_j = -d.q_j;
        }
    }
    l
}

fn same_support_2d(a: &SolverSupport, b: &SolverSupport) -> bool {
    let ang = |s: &SolverSupport| s.angle.unwrap_or(0.0).rem_euclid(std::f64::consts::PI);
    a.support_type == b.support_type
        && (ang(a) - ang(b)).abs() < 1e-12
        && a.kx == b.kx
        && a.ky == b.ky
        && a.kz == b.kz
        && a.dx.unwrap_or(0.0).abs() < 1e-300
        && b.dx.unwrap_or(0.0).abs() < 1e-300
        && a.dry.unwrap_or(0.0).abs() < 1e-300
}

/// Symmetric (anti = false) or antisymmetric 2D model from `half`.
pub fn symmetrize_2d(name: &str, half: &SolverInput, anti: bool) -> Option<Sym2> {
    if !half.constraints.is_empty() || half.nodes.is_empty() {
        return None;
    }
    let xmax = half.nodes.values().map(|n| n.x).fold(f64::NEG_INFINITY, f64::max);
    let iso = Iso2 { q: [[-1.0, 0.0], [0.0, 1.0]], t: [2.0 * xmax, 0.0] };
    let img = transform_2d(half, &iso).ok()?;
    let axis: Vec<usize> = half.nodes.values().filter(|n| (n.x - xmax).abs() <= 1e-12 * xmax.abs().max(1.0)).map(|n| n.id).collect();
    let nmax = half.nodes.values().map(|n| n.id).max()?;
    let emax = half.elements.values().map(|e| e.id).max()?;
    let smax = half.supports.values().map(|s| s.id).max().unwrap_or(0);
    let cmax = half.connectors.values().map(|c| c.id).max().unwrap_or(0);
    let nm = |id: usize| if axis.contains(&id) { id } else { id + nmax };
    let mut full = half.clone();
    let mut pair = Relabel::default();
    for n in half.nodes.values() {
        pair.node.insert(n.id, nm(n.id));
        pair.node.insert(nm(n.id), n.id);
        if !axis.contains(&n.id) {
            let p = &img.nodes[&n.id.to_string()];
            full.nodes.insert(nm(n.id).to_string(), SolverNode { id: nm(n.id), x: p.x, z: p.z });
        }
    }
    for e in img.elements.values() {
        if axis.contains(&e.node_i) && axis.contains(&e.node_j) {
            return None; // a member on the symmetry line would be doubled
        }
        let id = e.id + emax;
        pair.element.insert(e.id, id);
        pair.element.insert(id, e.id);
        full.elements.insert(id.to_string(), SolverElement { id, node_i: nm(e.node_i), node_j: nm(e.node_j), ..e.clone() });
    }
    for s in img.supports.values() {
        if axis.contains(&s.node_id) {
            let orig = half.supports.values().find(|o| o.id == s.id)?;
            if !same_support_2d(orig, s) || (anti && orig.dz.unwrap_or(0.0) != 0.0) {
                return None;
            }
            continue;
        }
        let id = s.id + smax;
        let mut s2 = SolverSupport { id, node_id: nm(s.node_id), ..s.clone() };
        if anti {
            // Prescribed displacements are actions too: antisymmetric copy.
            (s2.dx, s2.dz, s2.dry) = (s.dx.map(|v| -v), s.dz.map(|v| -v), s.dry.map(|v| -v));
        }
        full.supports.insert(id.to_string(), s2);
    }
    for c in img.connectors.values() {
        if axis.contains(&c.node_i) || axis.contains(&c.node_j) {
            return None;
        }
        let id = c.id + cmax;
        full.connectors.insert(id.to_string(), ConnectorElement { id, node_i: nm(c.node_i), node_j: nm(c.node_j), ..c.clone() });
    }
    for l in &img.loads {
        let l = pair_load_2d(l, &nm, emax);
        full.loads.push(if anti { neg2(&l) } else { l });
    }
    let mut case = Case2::new(format!("{name}/{}", if anti { "anti" } else { "sym" }), full);
    case.path = None;
    // Single-node responses (harmonic) are read on the symmetry line.
    case.probes = axis.clone();
    Some(Sym2 { case, iso, pair })
}

fn pair_load_2d(l: &SolverLoad, nm: &dyn Fn(usize) -> usize, emax: usize) -> SolverLoad {
    match l {
        SolverLoad::Nodal(x) => SolverLoad::Nodal(SolverNodalLoad { node_id: nm(x.node_id), ..x.clone() }),
        SolverLoad::Distributed(x) => SolverLoad::Distributed(SolverDistributedLoad { element_id: x.element_id + emax, ..x.clone() }),
        SolverLoad::PointOnElement(x) => SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: x.element_id + emax, ..x.clone() }),
        SolverLoad::Thermal(x) => SolverLoad::Thermal(SolverThermalLoad { element_id: x.element_id + emax, ..x.clone() }),
        // The mirrored member keeps its i → j direction, so the load along it is the same.
        SolverLoad::AxialDistributed(x) => SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: x.element_id + emax, ..x.clone() }),
    }
}

pub fn check_2d(tally: &Tally, sym: &Sym2, anti: bool, anas: &[Ana2]) {
    let c = &sym.case;
    let cond = match guarded(|| conditioning::of_2d(&c.s)) {
        Ok(k) => k,
        Err(e) => {
            for a in anas {
                tally.record(a.name, "symmetry", &c.name, Verdict::Refused(format!("no conditioning estimate: {e}")));
            }
            return;
        }
    };
    for a in anas {
        if anti && a.law != Law::Linear {
            continue;
        }
        // A deck path runs one way: its load is not symmetric.
        if a.name == "moving loads" || a.name == "influence line" {
            continue;
        }
        let v = match guarded(|| (a.run)(c)) {
            Err(e) => Verdict::Refused(e),
            Ok(r) => match r.iso2(&sym.iso) {
                Err(e) => Verdict::Unrepresentable(e),
                Ok(img) => {
                    let mut exp = img.relabel(&sym.pair).common(&r);
                    let r = r.common(&exp);
                    if r.0.is_empty() {
                        tally.record(a.name, "symmetry", &c.name, Verdict::NotApplicable);
                        continue;
                    }
                    if anti {
                        exp.0.iter_mut().filter(|i| !matches!(i.kind, crate::response::Kind::Stress)).for_each(|i| i.v.iter_mut().for_each(|x| *x = -*x));
                    }
                    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
                    if rel > INCONCLUSIVE {
                        Verdict::Inconclusive(rel)
                    } else {
                        match compare_with_floor(&r.flat(), &exp.flat(), cond.lchar, rel, crate::checks2::load_floor_2d(&c.s, cond.lchar)) {
                            Ok(rep) => Verdict::Pass(rep.worst),
                            Err(e) => Verdict::Fail(format!("{} response not {}: {e}", if anti { "antisymmetric" } else { "symmetric" }, if anti { "antisymmetric" } else { "symmetric" })),
                        }
                    }
                }
            },
        };
        tally.record(a.name, "symmetry", &c.name, v);
    }
}

// ==================== 3D: C2 symmetry about a vertical axis ====================

pub struct Sym3 {
    pub case: Case3,
    pub iso: Iso3,
    pub pair: Relabel,
}

fn neg3(l: &SolverLoad3D) -> Option<SolverLoad3D> {
    let mut l = l.clone();
    match &mut l {
        SolverLoad3D::Nodal(n) => {
            for v in [&mut n.fx, &mut n.fy, &mut n.fz, &mut n.mx, &mut n.my, &mut n.mz] {
                *v = -*v;
            }
        }
        SolverLoad3D::Distributed(d) => {
            for v in [&mut d.q_xi, &mut d.q_xj, &mut d.q_yi, &mut d.q_yj, &mut d.q_zi, &mut d.q_zj] {
                *v = -*v;
            }
        }
        SolverLoad3D::PointOnElement(p) => {
            p.py = -p.py;
            p.pz = -p.pz;
        }
        SolverLoad3D::Thermal(t) => {
            t.dt_uniform = -t.dt_uniform;
            t.dt_gradient_y = -t.dt_gradient_y;
            t.dt_gradient_z = -t.dt_gradient_z;
        }
        _ => return None,
    }
    Some(l)
}

pub fn symmetrize_3d(name: &str, half: &SolverInput3D, anti: bool) -> Option<Sym3> {
    if !half.constraints.is_empty() || !half.plates.is_empty() || !half.quads.is_empty() || !half.quad9s.is_empty() || !half.solid_shells.is_empty() || !half.curved_shells.is_empty() || !half.curved_beams.is_empty() {
        return None;
    }
    // Axis through the node with the largest x (ties: smallest id).
    let pivot = half.nodes.values().max_by(|a, b| a.x.total_cmp(&b.x).then(b.id.cmp(&a.id)))?;
    let (px, py) = (pivot.x, pivot.y);
    // p' = Rz(π)(p − c) + c = (2cx − x, 2cy − y, z).
    let iso = Iso3 { r: [[-1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0]], t: [2.0 * px, 2.0 * py, 0.0] };
    let img = transform_3d(half, &iso).ok()?;
    let on_axis = |n: &SolverNode3D| (n.x - px).abs() <= 1e-12 * px.abs().max(1.0) && (n.y - py).abs() <= 1e-12 * py.abs().max(1.0);
    let axis: Vec<usize> = half.nodes.values().filter(|n| on_axis(n)).map(|n| n.id).collect();
    let nmax = half.nodes.values().map(|n| n.id).max()?;
    let emax = half.elements.values().map(|e| e.id).max()?;
    let cmax = half.connectors.values().map(|c| c.id).max().unwrap_or(0);
    let nm = |id: usize| if axis.contains(&id) { id } else { id + nmax };
    let mut full = half.clone();
    let mut pair = Relabel::default();
    for n in half.nodes.values() {
        pair.node.insert(n.id, nm(n.id));
        pair.node.insert(nm(n.id), n.id);
        if !axis.contains(&n.id) {
            let p = &img.nodes[&n.id.to_string()];
            full.nodes.insert(nm(n.id).to_string(), SolverNode3D { id: nm(n.id), ..p.clone() });
        }
    }
    // The image's members carry explicit (rotated) local axes; give the
    // originals their explicit axes too, so both halves use one convention.
    full.elements.clear();
    let explicit = transform_3d(half, &Iso3 { r: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], t: [0.0; 3] }).ok()?;
    for e in explicit.elements.values() {
        full.elements.insert(e.id.to_string(), e.clone());
    }
    for e in img.elements.values() {
        if axis.contains(&e.node_i) && axis.contains(&e.node_j) {
            return None;
        }
        let id = e.id + emax;
        pair.element.insert(e.id, id);
        pair.element.insert(id, e.id);
        full.elements.insert(id.to_string(), SolverElement3D { id, node_i: nm(e.node_i), node_j: nm(e.node_j), ..e.clone() });
    }
    let mut k = 0;
    full.supports.clear();
    for s in half.supports.values() {
        full.supports.insert(format!("{k}"), s.clone());
        k += 1;
    }
    for s in img.supports.values() {
        if axis.contains(&s.node_id) {
            let orig = half.supports.values().find(|o| o.node_id == s.node_id)?;
            let same = (orig.rx, orig.ry, orig.rz, orig.rrx, orig.rry, orig.rrz) == (s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz)
                && orig.is_inclined.unwrap_or(false) == s.is_inclined.unwrap_or(false)
                && !orig.is_inclined.unwrap_or(false)
                && [orig.kx, orig.ky, orig.kz, orig.krx, orig.kry, orig.krz] == [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz]
                && [orig.dx, orig.dy, orig.drx, orig.dry].iter().all(|d| d.unwrap_or(0.0) == 0.0)
                && !(anti && orig.dz.unwrap_or(0.0) != 0.0 || anti && orig.drz.unwrap_or(0.0) != 0.0);
            if !same {
                return None;
            }
            continue;
        }
        let mut s2 = SolverSupport3D { node_id: nm(s.node_id), ..s.clone() };
        if anti {
            for d in [&mut s2.dx, &mut s2.dy, &mut s2.dz, &mut s2.drx, &mut s2.dry, &mut s2.drz] {
                *d = d.map(|v| -v);
            }
        }
        full.supports.insert(format!("{k}"), s2);
        k += 1;
    }
    for c in img.connectors.values() {
        if axis.contains(&c.node_i) || axis.contains(&c.node_j) {
            return None;
        }
        let id = c.id + cmax;
        full.connectors.insert(id.to_string(), ConnectorElement { id, node_i: nm(c.node_i), node_j: nm(c.node_j), ..c.clone() });
    }
    for l in &img.loads {
        let l = match l {
            SolverLoad3D::Nodal(x) => SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: nm(x.node_id), ..x.clone() }),
            SolverLoad3D::Distributed(x) => SolverLoad3D::Distributed(SolverDistributedLoad3D { element_id: x.element_id + emax, ..x.clone() }),
            SolverLoad3D::PointOnElement(x) => SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: x.element_id + emax, ..x.clone() }),
            SolverLoad3D::Thermal(x) => SolverLoad3D::Thermal(SolverThermalLoad3D { element_id: x.element_id + emax, ..x.clone() }),
            _ => return None,
        };
        full.loads.push(if anti { neg3(&l)? } else { l });
    }
    let mut case = Case3::new(format!("{name}/{}", if anti { "anti" } else { "sym" }), full);
    case.path = None;
    case.probes = axis.clone();
    // Excitations given in global axes must share the symmetry: a vertical
    // ground motion and spectrum direction are invariant under Rz(π).
    case.p.ground = [0.0, 0.0, 1.0];
    case.p.axis = 2;
    Some(Sym3 { case, iso, pair })
}

pub fn check_3d(tally: &Tally, sym: &Sym3, anti: bool, anas: &[Ana3]) {
    let c = &sym.case;
    let cond = match guarded(|| conditioning::of_3d(&c.s)) {
        Ok(k) => k,
        Err(e) => {
            for a in anas {
                tally.record(a.name, "symmetry", &c.name, Verdict::Refused(format!("no conditioning estimate: {e}")));
            }
            return;
        }
    };
    for a in anas {
        if anti && a.law != Law::Linear {
            continue;
        }
        // A deck path runs one way: its load is not symmetric.
        if a.name == "moving loads" || a.name == "influence line" {
            continue;
        }
        let v = match guarded(|| (a.run)(c)) {
            Err(e) => Verdict::Refused(e),
            Ok(r) => match r.iso3(&sym.iso) {
                Err(e) => Verdict::Unrepresentable(e),
                Ok(img) => {
                    let mut exp = img.relabel(&sym.pair).common(&r);
                    let r = r.common(&exp);
                    if r.0.is_empty() {
                        tally.record(a.name, "symmetry", &c.name, Verdict::NotApplicable);
                        continue;
                    }
                    if anti {
                        exp.0.iter_mut().filter(|i| !matches!(i.kind, crate::response::Kind::Stress)).for_each(|i| i.v.iter_mut().for_each(|x| *x = -*x));
                    }
                    let rel = crate::checks2::rel_for(a.name, a.iter_tol, &cond) * 2.0;
                    if rel > INCONCLUSIVE {
                        Verdict::Inconclusive(rel)
                    } else {
                        match compare_with_floor(&r.flat(), &exp.flat(), cond.lchar, rel, crate::checks3::load_floor_3d(&c.s, cond.lchar)) {
                            Ok(rep) => Verdict::Pass(rep.worst),
                            Err(e) => Verdict::Fail(format!("response not {}: {e}", if anti { "antisymmetric" } else { "C2-symmetric" })),
                        }
                    }
                }
            },
        };
        tally.record(a.name, "symmetry", &c.name, v);
    }
}
