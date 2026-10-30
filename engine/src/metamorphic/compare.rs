//! Flattening of results into physical families and their comparison.
//!
//! Results carry different units (m, rad, kN, kN·m, stress), so every
//! comparison is made per family against that family's own magnitude:
//! `|a − e| ≤ rel · S_family`. A family that is legitimately ~0 (rotations of
//! a pure truss, moments of a pin-jointed model) would otherwise be compared
//! at pure round-off level, so each family's scale is floored by its
//! dimensional sibling through the model size L:
//! `S_t = max(|t|, |r|·L)`, `S_r = max(|r|, |t|/L)`, `S_f = max(|f|, |m|/L)`,
//! `S_m = max(|m|, |f|·L)`. `rel` comes from [`super::conditioning`].

use crate::types::*;

#[derive(Debug, Clone, Default)]
pub struct Family {
    pub vals: Vec<f64>,
    pub labels: Vec<String>,
    /// Per-entry magnitude scale (used by the scalar family: an entry of a
    /// tensor or an envelope pair is compared on the magnitude of the whole
    /// quantity, a lone scalar on its own).
    pub scales: Vec<f64>,
    /// Lower bound on the family's magnitude scale (a quantity's natural
    /// size when the values themselves can legitimately all vanish).
    pub floor: f64,
}

impl Family {
    fn push(&mut self, label: impl Into<String>, v: f64) {
        self.push_scaled(label, v, v.abs());
    }
    fn push_scaled(&mut self, label: impl Into<String>, v: f64, scale: f64) {
        self.vals.push(v);
        self.labels.push(label.into());
        self.scales.push(scale);
    }
    pub fn maxabs(&self) -> f64 {
        self.vals.iter().fold(self.floor, |a, &b| a.max(b.abs()))
    }
}

/// Results flattened in a canonical order (sorted ids).
#[derive(Debug, Clone, Default)]
pub struct Flat {
    /// Translations.
    pub t: Family,
    /// Rotations (and warping, which is a rotation per length × length).
    pub r: Family,
    /// Forces: reactions, member N and V.
    pub f: Family,
    /// Moments: reaction moments, member moments.
    pub m: Family,
    /// Stress-like shell results (von Mises).
    pub s: Family,
    /// Scalars compared on their own scale (frequencies, load factors, …).
    pub x: Family,
}

/// Which parts of a static result to flatten.
#[derive(Debug, Clone, Copy)]
pub struct Parts {
    pub displacements: bool,
    pub reactions: bool,
    pub member_forces: bool,
    pub shell_stresses: bool,
}

impl Parts {
    pub const ALL: Parts = Parts { displacements: true, reactions: true, member_forces: true, shell_stresses: true };
    pub const DISPLACEMENTS: Parts = Parts { displacements: true, reactions: false, member_forces: false, shell_stresses: false };
}

pub fn flat_2d(r: &AnalysisResults, p: Parts) -> Flat {
    let mut o = Flat::default();
    if p.displacements {
        let mut d: Vec<&Displacement> = r.displacements.iter().collect();
        d.sort_by_key(|d| d.node_id);
        for d in d {
            o.t.push(format!("ux@{}", d.node_id), d.ux);
            o.t.push(format!("uz@{}", d.node_id), d.uz);
            o.r.push(format!("ry@{}", d.node_id), d.ry);
        }
    }
    if p.reactions {
        let mut rs: Vec<&Reaction> = r.reactions.iter().collect();
        rs.sort_by_key(|x| x.node_id);
        // Several supports on one node are merged: compare per node sums.
        let mut k = 0;
        while k < rs.len() {
            let id = rs[k].node_id;
            let (mut fx, mut fz, mut my) = (0.0, 0.0, 0.0);
            while k < rs.len() && rs[k].node_id == id {
                fx += rs[k].rx;
                fz += rs[k].rz;
                my += rs[k].my;
                k += 1;
            }
            o.f.push(format!("Rx@{id}"), fx);
            o.f.push(format!("Rz@{id}"), fz);
            o.m.push(format!("My@{id}"), my);
        }
    }
    if p.member_forces {
        let mut es: Vec<&ElementForces> = r.element_forces.iter().collect();
        es.sort_by_key(|e| e.element_id);
        for e in es {
            let id = e.element_id;
            o.f.push(format!("N_s@e{id}"), e.n_start);
            o.f.push(format!("N_e@e{id}"), e.n_end);
            o.f.push(format!("V_s@e{id}"), e.v_start);
            o.f.push(format!("V_e@e{id}"), e.v_end);
            o.m.push(format!("M_s@e{id}"), e.m_start);
            o.m.push(format!("M_e@e{id}"), e.m_end);
        }
    }
    o
}

pub fn flat_3d(r: &AnalysisResults3D, p: Parts) -> Flat {
    let mut o = Flat::default();
    if p.displacements {
        let mut d: Vec<&Displacement3D> = r.displacements.iter().collect();
        d.sort_by_key(|d| d.node_id);
        for d in d {
            let id = d.node_id;
            o.t.push(format!("ux@{id}"), d.ux);
            o.t.push(format!("uy@{id}"), d.uy);
            o.t.push(format!("uz@{id}"), d.uz);
            o.r.push(format!("rx@{id}"), d.rx);
            o.r.push(format!("ry@{id}"), d.ry);
            o.r.push(format!("rz@{id}"), d.rz);
        }
    }
    if p.reactions {
        let mut rs: Vec<&Reaction3D> = r.reactions.iter().collect();
        rs.sort_by_key(|x| x.node_id);
        let mut k = 0;
        while k < rs.len() {
            let id = rs[k].node_id;
            let mut s = [0.0; 6];
            while k < rs.len() && rs[k].node_id == id {
                let x = rs[k];
                for (a, b) in s.iter_mut().zip([x.fx, x.fy, x.fz, x.mx, x.my, x.mz]) {
                    *a += b;
                }
                k += 1;
            }
            for (i, c) in ["x", "y", "z"].iter().enumerate() {
                o.f.push(format!("F{c}@{id}"), s[i]);
                o.m.push(format!("M{c}@{id}"), s[i + 3]);
            }
        }
    }
    if p.member_forces {
        let mut es: Vec<&ElementForces3D> = r.element_forces.iter().collect();
        es.sort_by_key(|e| e.element_id);
        for e in es {
            let id = e.element_id;
            for (n, v) in [("N_s", e.n_start), ("N_e", e.n_end), ("Vy_s", e.vy_start), ("Vy_e", e.vy_end), ("Vz_s", e.vz_start), ("Vz_e", e.vz_end)] {
                o.f.push(format!("{n}@e{id}"), v);
            }
            for (n, v) in [("Mx_s", e.mx_start), ("Mx_e", e.mx_end), ("My_s", e.my_start), ("My_e", e.my_end), ("Mz_s", e.mz_start), ("Mz_e", e.mz_end)] {
                o.m.push(format!("{n}@e{id}"), v);
            }
        }
    }
    if p.shell_stresses {
        let mut ps: Vec<&PlateStress> = r.plate_stresses.iter().collect();
        ps.sort_by_key(|x| x.element_id);
        for x in ps {
            o.s.push(format!("vm@plate{}", x.element_id), x.von_mises);
        }
        let mut qs: Vec<&QuadStress> = r.quad_stresses.iter().collect();
        qs.sort_by(|a, b| a.element_id.cmp(&b.element_id).then(a.von_mises.total_cmp(&b.von_mises)));
        for x in qs {
            o.s.push(format!("vm@quad{}", x.element_id), x.von_mises);
        }
    }
    o
}

/// Outcome of a comparison: the worst |a − e| / tol seen (≤ 1 passes) and
/// where.
#[derive(Debug, Clone)]
pub struct Report {
    pub worst: f64,
    pub where_: String,
}

/// Compare `actual` against `expected` family by family (see module docs);
/// scales come from `expected`. `Err` describes the first violation.
pub fn compare(actual: &Flat, expected: &Flat, lchar: f64, rel: f64) -> Result<Report, String> {
    compare_scaled(actual, expected, expected, lchar, rel)
}

/// As [`compare`] with a force floor (see [`compare_floored`]).
pub fn compare_with_floor(actual: &Flat, expected: &Flat, lchar: f64, rel: f64, force_floor: f64) -> Result<Report, String> {
    compare_floored(actual, expected, expected, lchar, rel, force_floor)
}

fn check_shape(a: &Flat, e: &Flat) -> Result<(), String> {
    for (name, x, y) in [("translation", &a.t, &e.t), ("rotation", &a.r, &e.r), ("force", &a.f, &e.f), ("moment", &a.m, &e.m), ("stress", &a.s, &e.s), ("scalar", &a.x, &e.x)] {
        if x.vals.len() != y.vals.len() {
            return Err(format!("{name}: {} values vs {} expected", x.vals.len(), y.vals.len()));
        }
        if let Some(k) = (0..x.labels.len()).find(|&k| x.labels[k] != y.labels[k]) {
            return Err(format!("{name}[{k}]: label {} vs expected {}", x.labels[k], y.labels[k]));
        }
    }
    Ok(())
}

impl Flat {
    /// a·x + b·y entrywise (labels from x).
    pub fn lin_comb(a: f64, x: &Flat, b: f64, y: &Flat) -> Flat {
        let c = |u: &Family, v: &Family| Family {
            vals: u.vals.iter().zip(&v.vals).map(|(p, q)| a * p + b * q).collect(),
            labels: u.labels.clone(),
            scales: u.scales.iter().zip(&v.scales).map(|(p, q)| a.abs() * p + b.abs() * q).collect(),
            floor: a.abs() * u.floor + b.abs() * v.floor,
        };
        Flat { t: c(&x.t, &y.t), r: c(&x.r, &y.r), f: c(&x.f, &y.f), m: c(&x.m, &y.m), s: c(&x.s, &y.s), x: c(&x.x, &y.x) }
    }
    /// |a·x| + |b·y| entrywise: the magnitude a combination's round-off is
    /// carried at (so cancellation does not shrink the tolerance).
    pub fn abs_comb(a: f64, x: &Flat, b: f64, y: &Flat) -> Flat {
        let c = |u: &Family, v: &Family| Family {
            vals: u.vals.iter().zip(&v.vals).map(|(p, q)| (a * p).abs() + (b * q).abs()).collect(),
            labels: u.labels.clone(),
            scales: u.scales.iter().zip(&v.scales).map(|(p, q)| a.abs() * p + b.abs() * q).collect(),
            floor: a.abs() * u.floor + b.abs() * v.floor,
        };
        Flat { t: c(&x.t, &y.t), r: c(&x.r, &y.r), f: c(&x.f, &y.f), m: c(&x.m, &y.m), s: c(&x.s, &y.s), x: c(&x.x, &y.x) }
    }
    pub fn scalar(label: impl Into<String>, v: f64) -> Flat {
        let mut f = Flat::default();
        f.x.push(label, v);
        f
    }
    pub fn push_scalar(&mut self, label: impl Into<String>, v: f64) {
        self.x.push(label, v);
    }
    /// A scalar compared against `scale` (e.g. one entry of a tensor).
    pub fn push_scalar_scaled(&mut self, label: impl Into<String>, v: f64, scale: f64) {
        self.x.push_scaled(label, v, scale);
    }
    pub fn push_t(&mut self, label: impl Into<String>, v: f64) {
        self.t.push(label, v);
    }
    pub fn push_r(&mut self, label: impl Into<String>, v: f64) {
        self.r.push(label, v);
    }
    pub fn push_f(&mut self, label: impl Into<String>, v: f64) {
        self.f.push(label, v);
    }
    pub fn push_m(&mut self, label: impl Into<String>, v: f64) {
        self.m.push(label, v);
    }
    pub fn push_s(&mut self, label: impl Into<String>, v: f64) {
        self.s.push(label, v);
    }
    pub fn is_empty(&self) -> bool {
        self.t.vals.is_empty() && self.r.vals.is_empty() && self.f.vals.is_empty() && self.m.vals.is_empty() && self.s.vals.is_empty() && self.x.vals.is_empty()
    }
}

/// As [`compare`] but with family scales from `scale_src` instead of
/// `expected` (for linear combinations, where `expected` may cancel).
pub fn compare_scaled(actual: &Flat, expected: &Flat, scale_src: &Flat, lchar: f64, rel: f64) -> Result<Report, String> {
    compare_floored(actual, expected, scale_src, lchar, rel, 0.0)
}

/// As [`compare_scaled`], with the force scale floored by `force_floor`
/// (the magnitude of the applied loads): a member or reaction force that is
/// zero in exact arithmetic comes out as round-off of the loads that pass
/// through the structure, not of the (zero) force family itself.
pub fn compare_floored(actual: &Flat, expected: &Flat, scale_src: &Flat, lchar: f64, rel: f64, force_floor: f64) -> Result<Report, String> {
    check_shape(actual, expected)?;
    check_shape(scale_src, expected)?;
    let diff = Flat::lin_comb(1.0, actual, -1.0, expected);
    let (t, r) = (scale_src.t.maxabs(), scale_src.r.maxabs());
    let f = scale_src.f.maxabs().max(force_floor);
    let m = scale_src.m.maxabs().max(force_floor * lchar);
    let l = lchar.max(f64::MIN_POSITIVE);
    // A family that is exactly zero in `expected` (a node whose only load
    // goes straight into its support, a plate bent without membrane
    // stress) is still computed in floating point after a rotation or a
    // mirror: its round-off has no scale of its own. Translations and
    // rotations are then floored by the coordinate round-off of a model of
    // size L (64·ε·L, 64·ε rad), shell stresses by the stress the forces
    // would carry over the model size (F/L², far below any real shell
    // stress, which acts over a thickness ≪ L). Nothing above these floors
    // is hidden: any real displacement or stress is many orders larger.
    let (t_abs, r_abs) = (64.0 * f64::EPSILON * l, 64.0 * f64::EPSILON);
    let fams: [(&str, &Family, &Family, f64, f64); 6] = [
        ("translation", &diff.t, &scale_src.t, t.max(r * l), t_abs),
        ("rotation", &diff.r, &scale_src.r, r.max(t / l), r_abs),
        ("force", &diff.f, &scale_src.f, f.max(m / l), 0.0),
        ("moment", &diff.m, &scale_src.m, m.max(f * l), 0.0),
        ("stress", &diff.s, &scale_src.s, scale_src.s.maxabs().max(f.max(m / l) / (l * l)), 0.0),
        ("scalar", &diff.x, &scale_src.x, 0.0, 0.0),
    ];
    let mut rep = Report { worst: 0.0, where_: String::new() };
    for (name, d, src, s, abs_floor) in fams {
        for k in 0..d.vals.len() {
            let scale = if name == "scalar" { src.scales.get(k).copied().unwrap_or(src.vals[k].abs()) } else { s };
            let tol = rel * scale + abs_floor + f64::MIN_POSITIVE;
            let ratio = d.vals[k].abs() / tol;
            if !d.vals[k].is_finite() || !(ratio <= 1.0) {
                return Err(format!(
                    "{name} {}: got {:.10e}, expected {:.10e}, |diff| {:.3e} > tol {tol:.3e} (scale {scale:.3e}, rel {rel:.2e})",
                    d.labels[k],
                    d.vals[k] + expected_val(expected, name, k),
                    expected_val(expected, name, k),
                    d.vals[k].abs()
                ));
            }
            if ratio > rep.worst {
                rep.worst = ratio;
                rep.where_ = format!("{name} {}", d.labels[k]);
            }
        }
    }
    Ok(rep)
}

fn expected_val(e: &Flat, fam: &str, k: usize) -> f64 {
    let f = match fam {
        "translation" => &e.t,
        "rotation" => &e.r,
        "force" => &e.f,
        "moment" => &e.m,
        "stress" => &e.s,
        _ => &e.x,
    };
    f.vals.get(k).copied().unwrap_or(f64::NAN)
}
