//! A solver response as a list of tagged physical quantities, each of which
//! knows how it changes under a rigid motion, a relabelling and a change of
//! units. Every analysis is reduced to one of these, so the invariants are
//! written once for all analyses.

use dedaliano_engine::metamorphic::compare::Flat;
use dedaliano_engine::metamorphic::relabel::Relabel;
use dedaliano_engine::metamorphic::transform::{Iso2, Iso3};
use dedaliano_engine::metamorphic::units::Units;
use dedaliano_engine::types::*;

/// Physical dimension L^l · F^f · T^t.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Dim(pub i32, pub i32, pub i32);

impl Dim {
    pub const NONE: Dim = Dim(0, 0, 0);
    pub const LEN: Dim = Dim(1, 0, 0);
    pub const FORCE: Dim = Dim(0, 1, 0);
    pub const MOMENT: Dim = Dim(1, 1, 0);
    pub const FREQ: Dim = Dim(0, 0, -1);
    pub const MASS: Dim = Dim(-1, 1, 2);
    pub fn factor(&self, u: &Units) -> f64 {
        u.length.powi(self.0) * u.force.powi(self.1) * u.time.powi(self.2)
    }
}

#[derive(Clone, Debug)]
pub enum Kind {
    /// 2-vector in the X–Z plane (translation-like or force-like by `dim`).
    V2(Dim),
    /// In-plane rotation / moment: a pseudo-scalar (× det Q).
    P2(Dim),
    /// 3-vector (rotations and moments rotate as vectors under proper rotations).
    V3(Dim),
    /// Scalar in element axes: unchanged by rigid motions, except that it
    /// changes sign under a 2D mirror when `odd` (transverse shear, moment).
    Local(Dim, bool),
    /// Envelope pair (max positive, max negative) of a local quantity; under a
    /// mirror with `odd` it becomes (−neg, −pos).
    Pair(Dim, bool),
    /// Symmetric 2×2 tensor (xx, xz, zz), e.g. an effective-mass tensor.
    T2(Dim),
    /// Symmetric 3×3 tensor (xx, xy, xz, yy, yz, zz).
    T3(Dim),
    /// Component magnitudes of a 2-vector (SRSS envelopes): only axis maps.
    Abs2(Dim),
    Abs3(Dim),
    /// Family of the value in the comparison: forces vs moments vs
    /// translations matter for the scale floors.
    Stress,
}

#[derive(Clone, Debug)]
pub struct Item {
    pub node: Option<usize>,
    pub elem: Option<usize>,
    pub tag: String,
    pub kind: Kind,
    pub v: Vec<f64>,
    /// Smallest magnitude the item is compared against (in its own units):
    /// e.g. an effective-mass tensor of a mode with no participation is
    /// compared on the total mass, not on its own ~0 entries.
    pub floor: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Resp(pub Vec<Item>);

fn item(node: Option<usize>, elem: Option<usize>, tag: &str, kind: Kind, v: Vec<f64>) -> Item {
    Item { node, elem, tag: tag.into(), kind, v, floor: 0.0 }
}

impl Resp {
    pub fn push(&mut self, node: Option<usize>, elem: Option<usize>, tag: &str, kind: Kind, v: Vec<f64>) {
        self.0.push(item(node, elem, tag, kind, v));
    }
    pub fn scalar(&mut self, tag: &str, dim: Dim, v: f64) {
        self.push(None, None, tag, Kind::Local(dim, false), vec![v]);
    }
    /// Without the stress invariants (von Mises is not linear in the loads).
    pub fn without_stress(&self) -> Resp {
        Resp(self.0.iter().filter(|i| !matches!(i.kind, Kind::Stress)).cloned().collect())
    }
    pub fn set_floor(&mut self, tag: &str, floor: f64) {
        for it in self.0.iter_mut().filter(|i| i.tag == tag) {
            it.floor = floor;
        }
    }
    /// Keep only items whose key (node, element, tag) is also in `other`.
    pub fn common(&self, other: &Resp) -> Resp {
        let keys: std::collections::HashSet<(Option<usize>, Option<usize>, String)> = other.0.iter().map(|i| (i.node, i.elem, i.tag.clone())).collect();
        Resp(self.0.iter().filter(|i| keys.contains(&(i.node, i.elem, i.tag.clone()))).cloned().collect())
    }
    /// Keep only items on the given nodes/elements (drop padding).
    pub fn retain_ids(&mut self, nodes: &std::collections::HashSet<usize>, elems: &std::collections::HashSet<usize>) {
        self.0.retain(|i| i.node.map_or(true, |n| nodes.contains(&n)) && i.elem.map_or(true, |e| elems.contains(&e)));
    }

    pub fn iso2(&self, iso: &Iso2) -> Result<Resp, String> {
        let det = iso.det();
        let q = iso.q;
        let mut o = self.clone();
        for it in o.0.iter_mut() {
            match &it.kind {
                Kind::V2(_) => {
                    let w = iso.apply_vec([it.v[0], it.v[1]]);
                    it.v = w.to_vec();
                }
                Kind::P2(_) => it.v[0] *= det,
                Kind::Local(_, odd) => {
                    if *odd {
                        it.v.iter_mut().for_each(|x| *x *= det);
                    }
                }
                Kind::Pair(_, odd) => {
                    if *odd && det < 0.0 {
                        it.v = vec![-it.v[1], -it.v[0]];
                    }
                }
                Kind::T2(_) => {
                    let t = [[it.v[0], it.v[1]], [it.v[1], it.v[2]]];
                    let mut r = [[0.0; 2]; 2];
                    for i in 0..2 {
                        for j in 0..2 {
                            r[i][j] = (0..2).flat_map(|a| (0..2).map(move |b| (a, b))).map(|(a, b)| q[i][a] * t[a][b] * q[j][b]).sum();
                        }
                    }
                    it.v = vec![r[0][0], r[0][1], r[1][1]];
                }
                Kind::Abs2(_) => {
                    if (q[0][0].abs() - 1.0).abs() < 1e-12 {
                    } else if (q[0][1].abs() - 1.0).abs() < 1e-12 {
                        it.v.swap(0, 1);
                    } else {
                        return Err("component magnitudes do not rotate off the axes".into());
                    }
                }
                Kind::Stress => {}
                Kind::V3(_) | Kind::T3(_) | Kind::Abs3(_) => return Err("3D quantity in a 2D response".into()),
            }
        }
        Ok(o)
    }

    pub fn iso3(&self, iso: &Iso3) -> Result<Resp, String> {
        let r = iso.r;
        let mut o = self.clone();
        for it in o.0.iter_mut() {
            match &it.kind {
                Kind::V3(_) => it.v = iso.apply_vec([it.v[0], it.v[1], it.v[2]]).to_vec(),
                Kind::T3(_) => {
                    let v = &it.v;
                    let t = [[v[0], v[1], v[2]], [v[1], v[3], v[4]], [v[2], v[4], v[5]]];
                    let mut m = [[0.0; 3]; 3];
                    for i in 0..3 {
                        for j in 0..3 {
                            let mut s = 0.0;
                            for a in 0..3 {
                                for b in 0..3 {
                                    s += r[i][a] * t[a][b] * r[j][b];
                                }
                            }
                            m[i][j] = s;
                        }
                    }
                    it.v = vec![m[0][0], m[0][1], m[0][2], m[1][1], m[1][2], m[2][2]];
                }
                Kind::Abs3(_) => {
                    let mut w = [0.0; 3];
                    for i in 0..3 {
                        let j = (0..3).find(|&j| (r[i][j].abs() - 1.0).abs() < 1e-12).ok_or("component magnitudes do not rotate off the axes")?;
                        w[i] = it.v[j];
                    }
                    it.v = w.to_vec();
                }
                Kind::Local(..) | Kind::Pair(..) | Kind::Stress => {}
                Kind::V2(_) | Kind::P2(_) | Kind::T2(_) | Kind::Abs2(_) => return Err("2D quantity in a 3D response".into()),
            }
        }
        Ok(o)
    }

    /// Expected response after reversing the members in `flipped` (see
    /// dedaliano_engine::metamorphic::reversal for the end-force maps).
    pub fn reverse(&self, flipped: &std::collections::HashSet<usize>, three_d: bool) -> Result<Resp, String> {
        let mut o = self.clone();
        for it in o.0.iter_mut() {
            let Some(e) = it.elem else { continue };
            if !flipped.contains(&e) {
                continue;
            }
            let v = it.v.clone();
            if let Kind::Pair(..) = it.kind {
                // Envelopes of end values (max, min over both ends): a
                // quantity that changes sign between ends under reversal
                // swaps and negates the pair, the others are unchanged.
                let odd = matches!((it.tag.as_str(), three_d), ("M", false) | ("My", true) | ("Vy", true));
                if odd {
                    it.v = vec![-v[1], -v[0]];
                }
                continue;
            }
            if !matches!(it.kind, Kind::Local(..)) {
                return Err(format!("no reversal map for {}", it.tag));
            }
            it.v = match (it.tag.as_str(), three_d, v.len()) {
                ("N" | "V" | "M", _, 1) => v,
                ("N", _, 2) => vec![v[1], v[0]],
                ("V", false, 2) => vec![v[1], v[0]],
                ("M", false, 2) => vec![-v[1], -v[0]],
                ("V", true, 4) => vec![-v[1], -v[0], v[3], v[2]],
                ("M", true, 6) => vec![v[1], v[0], -v[3], -v[2], v[5], v[4]],
                _ => return Err(format!("no reversal map for member quantity {}", it.tag)),
            };
        }
        Ok(o)
    }

    pub fn reverse_influence(&self, flipped: &std::collections::HashSet<usize>, target: usize) -> Result<Resp, String> {
        let mut out = self.clone();
        for item in &mut out.0 {
            if item.elem.is_some_and(|id| flipped.contains(&id)) {
                let t: usize = item.tag.strip_prefix("IL_t").ok_or("missing influence coordinate")?.parse().map_err(|_| "invalid influence coordinate")?;
                item.tag = format!("IL_t{:04}", 1000 - t);
            }
            if flipped.contains(&target) { item.v.iter_mut().for_each(|x| *x = -*x); }
        }
        Ok(out)
    }

    pub fn relabel(&self, rl: &Relabel) -> Resp {
        let mut o = self.clone();
        for it in o.0.iter_mut() {
            it.node = it.node.map(|n| rl.n(n));
            let table = match it.tag.as_str() {
                "vm_plate" => Some(&rl.plate),
                "vm_quad" => Some(&rl.quad),
                _ => None,
            };
            it.elem = it.elem.map(|e| match table {
                Some(t) => *t.get(&e).unwrap_or(&e),
                None => rl.e(e),
            });
        }
        o
    }

    pub fn units(&self, u: &Units) -> Resp {
        let mut o = self.clone();
        for it in o.0.iter_mut() {
            let k = match &it.kind {
                Kind::V2(d) | Kind::P2(d) | Kind::V3(d) | Kind::Local(d, _) | Kind::Pair(d, _) | Kind::T2(d) | Kind::T3(d) | Kind::Abs2(d) | Kind::Abs3(d) => d.factor(u),
                Kind::Stress => u.stress(),
            };
            it.v.iter_mut().for_each(|x| *x *= k);
            it.floor *= k;
        }
        o
    }

    /// Canonical flattening for comparison (sorted by node, element, tag).
    pub fn flat(&self) -> Flat {
        let mut items: Vec<&Item> = self.0.iter().collect();
        items.sort_by(|a, b| (a.node, a.elem, &a.tag).cmp(&(b.node, b.elem, &b.tag)));
        let mut f = Flat::default();
        for it in items {
            let lab = |k: usize| format!("{}{}{}[{k}]", it.tag, it.node.map(|n| format!("@n{n}")).unwrap_or_default(), it.elem.map(|e| format!("@e{e}")).unwrap_or_default());
            let fam = |d: &Dim| -> u8 {
                match *d {
                    Dim(1, 0, 0) => b't',
                    Dim(0, 0, 0) if matches!(it.kind, Kind::P2(_) | Kind::V3(_)) => b'r',
                    Dim(0, 1, 0) => b'f',
                    Dim(1, 1, 0) => b'm',
                    _ => b'x',
                }
            };
            let (family, dim_scalar) = match &it.kind {
                Kind::V2(d) | Kind::P2(d) | Kind::V3(d) | Kind::Local(d, _) => (fam(d), false),
                Kind::Abs2(d) | Kind::Abs3(d) => (fam(d), false),
                Kind::Pair(..) | Kind::T2(_) | Kind::T3(_) => (b'x', true),
                Kind::Stress => (b's', false),
            };
            // Local scalars without a translation/force/moment family are
            // compared on their own magnitude; tensors and pairs on the whole
            // quantity's magnitude.
            let whole = it.v.iter().fold(it.floor, |a, &b| a.max(b.abs()));
            if it.floor > 0.0 {
                let fam = match family { b't' => &mut f.t, b'r' => &mut f.r, b'f' => &mut f.f, b'm' => &mut f.m, b's' => &mut f.s, _ => &mut f.x };
                fam.floor = fam.floor.max(it.floor);
            }
            for (k, &v) in it.v.iter().enumerate() {
                match family {
                    b't' => f.push_t(lab(k), v),
                    b'r' => f.push_r(lab(k), v),
                    b'f' => f.push_f(lab(k), v),
                    b'm' => f.push_m(lab(k), v),
                    b's' => f.push_s(lab(k), v),
                    _ => {
                        if dim_scalar {
                            f.push_scalar_scaled(lab(k), v, whole)
                        } else {
                            f.push_scalar(lab(k), v)
                        }
                    }
                }
            }
        }
        f
    }

    /// Translation of `node` (2D: [ux, uz], 3D: [ux, uy, uz]) tagged `tag`.
    pub fn node_vec(&self, node: usize, tag: &str) -> Option<Vec<f64>> {
        self.0.iter().find(|i| i.node == Some(node) && i.tag == tag).map(|i| i.v.clone())
    }
}

// ==================== static results → responses ====================

pub fn static_2d(r: &AnalysisResults) -> Resp {
    let mut o = Resp::default();
    for d in &r.displacements {
        o.push(Some(d.node_id), None, "u", Kind::V2(Dim::LEN), vec![d.ux, d.uz]);
        o.push(Some(d.node_id), None, "ry", Kind::P2(Dim::NONE), vec![d.ry]);
    }
    let mut sums: std::collections::BTreeMap<usize, [f64; 3]> = Default::default();
    for x in &r.reactions {
        let s = sums.entry(x.node_id).or_default();
        s[0] += x.rx;
        s[1] += x.rz;
        s[2] += x.my;
    }
    for (n, s) in sums {
        o.push(Some(n), None, "R", Kind::V2(Dim::FORCE), vec![s[0], s[1]]);
        o.push(Some(n), None, "RM", Kind::P2(Dim::MOMENT), vec![s[2]]);
    }
    for e in &r.element_forces {
        let id = Some(e.element_id);
        o.push(None, id, "N", Kind::Local(Dim::FORCE, false), vec![e.n_start, e.n_end]);
        o.push(None, id, "V", Kind::Local(Dim::FORCE, true), vec![e.v_start, e.v_end]);
        o.push(None, id, "M", Kind::Local(Dim::MOMENT, true), vec![e.m_start, e.m_end]);
    }
    o
}

pub fn disp_2d(r: &AnalysisResults) -> Resp {
    let mut o = Resp::default();
    for d in &r.displacements {
        o.push(Some(d.node_id), None, "u", Kind::V2(Dim::LEN), vec![d.ux, d.uz]);
        o.push(Some(d.node_id), None, "ry", Kind::P2(Dim::NONE), vec![d.ry]);
    }
    o
}

pub fn static_3d(r: &AnalysisResults3D) -> Resp {
    let mut o = disp_3d(r);
    let mut sums: std::collections::BTreeMap<usize, [f64; 6]> = Default::default();
    for x in &r.reactions {
        let s = sums.entry(x.node_id).or_default();
        for (a, b) in s.iter_mut().zip([x.fx, x.fy, x.fz, x.mx, x.my, x.mz]) {
            *a += b;
        }
    }
    for (n, s) in sums {
        o.push(Some(n), None, "R", Kind::V3(Dim::FORCE), s[..3].to_vec());
        o.push(Some(n), None, "RM", Kind::V3(Dim::MOMENT), s[3..].to_vec());
    }
    for e in &r.element_forces {
        let id = Some(e.element_id);
        o.push(None, id, "N", Kind::Local(Dim::FORCE, false), vec![e.n_start, e.n_end]);
        o.push(None, id, "V", Kind::Local(Dim::FORCE, false), vec![e.vy_start, e.vy_end, e.vz_start, e.vz_end]);
        o.push(None, id, "M", Kind::Local(Dim::MOMENT, false), vec![e.mx_start, e.mx_end, e.my_start, e.my_end, e.mz_start, e.mz_end]);
    }
    for p in &r.plate_stresses {
        o.push(None, Some(p.element_id), "vm_plate", Kind::Stress, vec![p.von_mises]);
    }
    for s in &r.quad_stresses {
        o.push(None, Some(s.element_id), "vm_quad", Kind::Stress, vec![s.von_mises]);
    }
    o
}

pub fn disp_3d(r: &AnalysisResults3D) -> Resp {
    let mut o = Resp::default();
    for d in &r.displacements {
        o.push(Some(d.node_id), None, "u", Kind::V3(Dim::LEN), vec![d.ux, d.uy, d.uz]);
        o.push(Some(d.node_id), None, "r", Kind::V3(Dim::NONE), vec![d.rx, d.ry, d.rz]);
    }
    o
}
