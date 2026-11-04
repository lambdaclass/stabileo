//! CIRSOC 201 sections of any shape under axial force and bending in any direction.
//!
//! One strain-compatibility engine for every section the app designs outside the beam checker
//! (`cirsoc201_check`): rectangular, T, circular and hollow columns, the interaction diagrams,
//! the CIRSOC_FLEX calculator's eight cases and the legacy designer's columns. The outline is a
//! polygon with holes, the bars are points with an area, and the neutral axis is any line.
//!
//! Clauses, CIRSOC 201-2025 first and 2005 in brackets:
//!
//! * Strain compatibility (22.2.1; [10.2.2]) with εcu = 0,003 (22.2.2.1; [10.2.3]); steel
//!   elastic-perfectly-plastic, fs = Es·εs within ±fy (20.2.2.1; [10.2.4]).
//! * Rectangular stress block 0,85·f'c over a = β1·c measured from the extreme compressed fibre
//!   (22.2.2.4; [10.2.7]). A bar inside the block is net of the concrete it displaces (the
//!   option can be turned off to reproduce a calculation made without it).
//! * φ from the net tensile strain of the most stretched bar, Tabla 21.2.2: compression-controlled
//!   0,65 with ties and 0,75 with a spiral at εt ≤ εty, tension-controlled 0,90 at
//!   εt ≥ εty + 0,003, linear between, εty = fy/Es (21.2.2.1). [9.3.2: 0,65 ties, 0,70 spiral,
//!   tension-controlled at εt ≥ 0,005, 10.3.4.]
//! * Maximum axial strength φ·Pn,max = φ·0,80·Po with ties, φ·0,85·Po with a spiral,
//!   Po = 0,85·f'c·(Ag − Ast) + fy·Ast (Tabla 22.4.2.1, 22.4.2.2; [10.3.6]).
//! * Maximum axial tension Pnt,max = fy·Ast (22.4.3.1), with φ = 0,90 (tension-controlled).
//!
//! The section state at one neutral axis is generic over `Real` (`certify::real`), like the beam
//! checker, so the same clause arithmetic can be evaluated in interval arithmetic: a comparison
//! that the intervals cannot decide (a vertex on the cut line, a bar on the block edge) makes
//! the state NaN rather than guessing a side. The searches built on it (the neutral axis for a
//! given axial force, the moment direction in biaxial bending) are f64.
//!
//! Units: Pa, N, N·m, m, m². Axial force and strain POSITIVE IN COMPRESSION. Moments are about
//! the gross section's centroid: `mnx` bends about x (compression at +y gives a negative Mnx,
//! the sign the CIRSOC_FLEX sheets print with the opposite sign), `mny` about y.

use crate::certify::real::{Real, Tri};
use crate::postprocess::cirsoc201_check::{beta1, beta1_r, tension_controlled_strain_r, Cirsoc201Edition};

const EPSILON_CU: f64 = 0.003;

/// Transverse reinforcement of a column: closed ties or a spiral (25.7.3; [7.10.4]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Confinement {
    #[default]
    Ties,
    Spiral,
}

/// φ for compression-controlled sections, Tabla 21.2.2 (a)/(b) [9.3.2.2].
pub fn phi_compression(edition: Cirsoc201Edition, confinement: Confinement) -> f64 {
    match (confinement, edition) {
        (Confinement::Ties, _) => 0.65,
        (Confinement::Spiral, Cirsoc201Edition::E2025) => 0.75,
        (Confinement::Spiral, Cirsoc201Edition::E2005) => 0.70,
    }
}

/// φ for moment, axial force or both, from the net tensile strain εt (Tabla 21.2.2
/// [9.3.2 with 10.3.3–10.3.4]).
pub(crate) fn phi_r<T: Real>(edition: Cirsoc201Edition, confinement: Confinement, eps_t: T, fy: f64, es: f64) -> T {
    let ety = T::exact(fy).dv(T::exact(es));
    let etc = tension_controlled_strain_r::<T>(edition, fy, es);
    let pc = T::lit(phi_compression(edition, confinement));
    crate::certify::real::branch(
        etc.le(eps_t),
        || T::lit(0.90),
        || crate::certify::real::branch(eps_t.le(ety), || pc, || pc + (T::lit(0.90) - pc) * (eps_t - ety).dv(etc - ety)),
    )
}

pub fn phi(edition: Cirsoc201Edition, confinement: Confinement, eps_t: f64, fy: f64, es: f64) -> f64 {
    phi_r::<f64>(edition, confinement, eps_t, fy, es)
}

/// Po = 0,85·f'c·(Ag − Ast) + fy·Ast (22.4.2.2; [10.3.6]), N.
pub fn squash_load(fc: f64, fy: f64, ag: f64, ast: f64) -> f64 {
    0.85 * fc * (ag - ast) + fy * ast
}

/// φ·Pn,max, Tabla 22.4.2.1 [10.3.6]: 0,80·Po with ties, 0,85·Po with a spiral, times the
/// compression-controlled φ. N.
pub fn axial_cap(edition: Cirsoc201Edition, confinement: Confinement, fc: f64, fy: f64, ag: f64, ast: f64) -> f64 {
    let k = match confinement {
        Confinement::Ties => 0.80,
        Confinement::Spiral => 0.85,
    };
    phi_compression(edition, confinement) * k * squash_load(fc, fy, ag, ast)
}

/// Least flexural steel of a beam, 9.6.1.2 [10.5.1]: max(0,25·√f'c/fy, 1,4/fy)·bw·d, m².
/// `bw` is the web width (the flange is in compression and does not count).
pub fn min_flexural_steel(fc: f64, fy: f64, bw: f64, d: f64) -> f64 {
    let (fc_mpa, fy_mpa) = (fc / 1e6, fy / 1e6);
    (0.25 * fc_mpa.sqrt() / fy_mpa).max(1.4 / fy_mpa) * bw * d
}

/// Column longitudinal steel bounds as a fraction of Ag, 10.6.1.1 [10.9.1].
pub const COLUMN_STEEL_RATIO_MIN: f64 = 0.01;
pub const COLUMN_STEEL_RATIO_MAX: f64 = 0.08;

/// Material and code data of a section.
#[derive(Debug, Clone, Copy)]
pub struct SectionCode {
    /// f'c, fy, Es (Pa).
    pub fc: f64,
    pub fy: f64,
    pub es: f64,
    pub edition: Cirsoc201Edition,
    pub confinement: Confinement,
    /// Net a bar inside the stress block of the concrete it displaces.
    pub deduct_displaced_concrete: bool,
}

/// The state of a section at one neutral axis.
#[derive(Debug, Clone, Copy)]
pub struct SectionStateR<T> {
    /// Nominal axial force (N, compression positive) and moments about the centroid (N·m).
    pub pn: T,
    pub mnx: T,
    pub mny: T,
    /// Net tensile strain of the most stretched bar; 0 when no bar is in tension.
    pub eps_t: T,
    pub phi: T,
    /// min(φ·Pn, φ·Pn,max) and φ·Mn.
    pub phi_pn: T,
    pub phi_mnx: T,
    pub phi_mny: T,
}

/// f64 state with the neutral axis that produced it.
#[derive(Debug, Clone, Copy)]
pub struct SectionPoint {
    pub nx: f64,
    pub ny: f64,
    /// Neutral axis depth from the extreme compressed fibre (m).
    pub c: f64,
    pub s: SectionStateR<f64>,
}

type Pt = [f64; 2];

/// One boundary of the concrete: a polygon (any winding) or an exact circle.
#[derive(Debug, Clone)]
pub enum Ring {
    Polygon(Vec<Pt>),
    Circle { c: Pt, r: f64 },
}

impl Ring {
    fn area_moments(&self) -> (f64, f64, f64) {
        match self {
            Ring::Polygon(p) => {
                let (a, mx, my) = ring_area_moments(p);
                let s = a.signum();
                (s * a, s * mx, s * my)
            }
            Ring::Circle { c, r } => {
                let a = std::f64::consts::PI * r * r;
                (a, a * c[0], a * c[1])
            }
        }
    }
    /// (max, min) of n·p over the ring.
    fn extent(&self, nx: f64, ny: f64) -> (f64, f64) {
        match self {
            Ring::Polygon(p) => p.iter().fold((f64::NEG_INFINITY, f64::INFINITY), |(mx, mn), q| {
                let s = nx * q[0] + ny * q[1];
                (mx.max(s), mn.min(s))
            }),
            Ring::Circle { c, r } => {
                let s = nx * c[0] + ny * c[1];
                let n = (nx * nx + ny * ny).sqrt();
                (s + r * n, s - r * n)
            }
        }
    }
    fn finite(&self) -> bool {
        match self {
            Ring::Polygon(p) => p.iter().flatten().all(|v| v.is_finite()),
            Ring::Circle { c, r } => c[0].is_finite() && c[1].is_finite() && r.is_finite() && *r > 0.0,
        }
    }
}

/// Area and first moments of the part of a circle where n·p ≥ level (n a unit vector): the
/// segment at distance t = level − n·c from the centre has A = r²·acos(t/r) − t·√(r² − t²) and
/// its centroid (2/3)·(r² − t²)^{3/2}/A beyond the centre along n. None when undecided.
fn clipped_circle<T: Real>(c: Pt, r: f64, nx: f64, ny: f64, level: T) -> Option<[T; 3]> {
    let zero = T::exact(0.0);
    let rr = T::exact(r);
    let t = level - (T::exact(nx) * T::exact(c[0]) + T::exact(ny) * T::exact(c[1]));
    let full = || {
        let a = T::pi() * rr * rr;
        [a, a * T::exact(c[0]), a * T::exact(c[1])]
    };
    match rr.le(t) {
        Tri::True => return Some([zero; 3]),
        Tri::Unknown => return None,
        Tri::False => {}
    }
    match t.le(-rr) {
        Tri::True => return Some(full()),
        Tri::Unknown => return None,
        Tri::False => {}
    }
    let h2 = (rr * rr - t * t).max(zero);
    let h = h2.sqrt();
    let a = rr * rr * t.dv(rr).max(T::exact(-1.0)).min(T::exact(1.0)).acos() - t * h;
    let m = T::exact(2.0).dv(T::exact(3.0)) * h2 * h;
    Some([a, a * T::exact(c[0]) + T::exact(nx) * m, a * T::exact(c[1]) + T::exact(ny) * m])
}

/// A section (polygons and circles) with bars, prepared once and asked many times.
#[derive(Debug, Clone)]
pub struct Section {
    /// Outer ring first, then holes; the caller's coordinates.
    rings: Vec<Ring>,
    /// x, y (the caller's coordinates), area.
    bars: Vec<[f64; 3]>,
    pub code: SectionCode,
    ag: f64,
    ast: f64,
    /// Where the caller's origin sits relative to the gross centroid.
    centroid: Pt,
    /// Sampled curves already computed, by (nx, ny, n): a curve does not depend on the axial
    /// force, and the verifier asks the same directions for every station of a member.
    curves: std::cell::RefCell<std::collections::HashMap<(u64, u64, usize), std::rc::Rc<Vec<SectionPoint>>>>,
}

fn ring_area_moments(ring: &[Pt]) -> (f64, f64, f64) {
    // Signed area and first moments ∫x, ∫y (shoelace).
    let (mut a, mut mx, mut my) = (0.0, 0.0, 0.0);
    if ring.len() < 3 {
        return (0.0, 0.0, 0.0);
    }
    let mut p = ring[ring.len() - 1];
    for &q in ring {
        let cross = p[0] * q[1] - q[0] * p[1];
        a += cross;
        mx += (p[0] + q[0]) * cross;
        my += (p[1] + q[1]) * cross;
        p = q;
    }
    (a / 2.0, mx / 6.0, my / 6.0)
}

/// Area and first moments (∫x dA, ∫y dA) of the part of `ring` where n·p ≥ level.
/// `None` when a vertex's side of the line cannot be decided (intervals).
fn clipped<T: Real>(ring: &[Pt], nx: f64, ny: f64, level: T, cut: &mut Vec<[T; 2]>) -> Option<[T; 3]> {
    cut.clear();
    let zero = T::exact(0.0);
    if ring.is_empty() {
        return Some([zero; 3]);
    }
    let side = |p: &Pt| -> (T, Option<bool>) {
        let s = T::exact(nx) * T::exact(p[0]) + T::exact(ny) * T::exact(p[1]) - level;
        let inside = match zero.le(s) {
            Tri::True => Some(true),
            Tri::False => Some(false),
            Tri::Unknown => None,
        };
        (s, inside)
    };
    let mut a = ring[ring.len() - 1];
    let (mut sa, ia) = side(&a);
    let mut ia = ia?;
    for b in ring {
        let (sb, ib) = side(b);
        let ib = ib?;
        if ia != ib {
            let t = sa.dv(sa - sb);
            cut.push([
                T::exact(a[0]) + t * (T::exact(b[0]) - T::exact(a[0])),
                T::exact(a[1]) + t * (T::exact(b[1]) - T::exact(a[1])),
            ]);
        }
        if ib {
            cut.push([T::exact(b[0]), T::exact(b[1])]);
        }
        a = *b;
        sa = sb;
        ia = ib;
    }
    if cut.len() < 3 {
        return Some([zero; 3]);
    }
    let (mut area, mut mx, mut my) = (zero, zero, zero);
    let mut p = cut[cut.len() - 1];
    for &q in cut.iter() {
        let cross = p[0] * q[1] - q[0] * p[1];
        area = area + cross;
        mx = mx + (p[0] + q[0]) * cross;
        my = my + (p[1] + q[1]) * cross;
        p = q;
    }
    let two = T::exact(2.0);
    let six = T::exact(6.0);
    // |A| and the first moments with the orientation's sign taken out (A·x̄ = mx/6 / sign).
    let neg = match area.lt(zero) {
        Tri::True => true,
        Tri::False => false,
        Tri::Unknown => return None,
    };
    let s = if neg { T::exact(-1.0) } else { T::exact(1.0) };
    Some([s * area.dv(two), s * mx.dv(six), s * my.dv(six)])
}

impl Section {
    /// `rings`: outer polygon then polygon holes. `bars`: x, y, area.
    pub fn new(rings: Vec<Vec<Pt>>, bars: Vec<[f64; 3]>, code: SectionCode) -> Result<Section, &'static str> {
        Self::with_rings(rings.into_iter().map(Ring::Polygon).collect(), bars, code)
    }

    /// `rings`: the outer boundary then holes, polygons or circles. Refuses data that describe
    /// no section.
    pub fn with_rings(rings: Vec<Ring>, bars: Vec<[f64; 3]>, code: SectionCode) -> Result<Section, &'static str> {
        let finite = rings.iter().all(Ring::finite)
            && bars.iter().flatten().all(|v| v.is_finite())
            && [code.fc, code.fy, code.es].iter().all(|v| v.is_finite());
        if !finite {
            return Err("section data are not finite");
        }
        if !(code.fc > 0.0 && code.fy > 0.0 && code.es > 0.0) {
            return Err("f'c, fy and Es must be positive");
        }
        if rings.is_empty() || rings.iter().any(|r| matches!(r, Ring::Polygon(p) if p.len() < 3)) {
            return Err("the outline needs at least three vertices");
        }
        if bars.iter().any(|b| b[2] < 0.0) {
            return Err("a bar area is negative");
        }
        let (mut ag, mut sx, mut sy) = (0.0, 0.0, 0.0);
        for (i, r) in rings.iter().enumerate() {
            let (a, mx, my) = r.area_moments();
            let sign = if i == 0 { 1.0 } else { -1.0 };
            ag += sign * a;
            sx += sign * mx;
            sy += sign * my;
        }
        if !(ag > 0.0) {
            return Err("the outline encloses no concrete");
        }
        let centroid = [sx / ag, sy / ag];
        // Coordinates stay the caller's (so a bar exactly on the block edge is decided the same
        // way the caller's geometry puts it); moments are taken about the centroid below.
        let ast = bars.iter().map(|b| b[2]).sum();
        Ok(Section { rings, bars, code, ag, ast, centroid, curves: Default::default() })
    }

    pub fn gross_area(&self) -> f64 {
        self.ag
    }
    pub fn steel_area(&self) -> f64 {
        self.ast
    }
    /// The gross centroid in the caller's coordinates.
    pub fn centroid(&self) -> Pt {
        self.centroid
    }
    pub fn squash_load(&self) -> f64 {
        squash_load(self.code.fc, self.code.fy, self.ag, self.ast)
    }
    /// φ·Pn,max (N).
    pub fn axial_cap(&self) -> f64 {
        axial_cap(self.code.edition, self.code.confinement, self.code.fc, self.code.fy, self.ag, self.ast)
    }
    /// φ·Pnt,max with every bar yielding in tension, φ = 0,90 (N, negative).
    pub fn tension_cap(&self) -> f64 {
        -0.90 * self.code.fy * self.ast
    }

    /// Extreme projections of the outline on (nx, ny).
    fn extent(&self, nx: f64, ny: f64) -> (f64, f64) {
        self.rings[0].extent(nx, ny)
    }

    /// Depth of the section along (nx, ny) and the depth of the most distant bar, dt.
    pub fn depths(&self, nx: f64, ny: f64) -> (f64, f64) {
        let (max, min) = self.extent(nx, ny);
        let far = self.bars.iter().map(|b| nx * b[0] + ny * b[1]).fold(f64::INFINITY, f64::min);
        (max - min, if self.bars.is_empty() { 0.0 } else { max - far })
    }

    /// The section's state with the neutral axis normal to (nx, ny) — the outward normal of the
    /// compressed face — at depth `c` from the extreme compressed fibre. NaN when an interval
    /// comparison is undecided.
    pub fn state<T: Real>(&self, nx: f64, ny: f64, c: T, c_f64: f64) -> SectionStateR<T> {
        let code = &self.code;
        let (max_f, min_f) = self.extent(nx, ny);
        let max = T::exact(max_f);
        let zero = T::exact(0.0);
        let b1 = beta1_r::<T>(code.fc);
        let depth = T::exact(max_f - min_f);
        let a = (b1 * c).min(depth).max(zero);
        // A block deeper than the section compresses all of it: no cut (and no vertex to decide).
        let whole = depth.le(b1 * c) == Tri::True;
        let level = if whole { T::exact(min_f - 1.0 - (max_f - min_f)) } else { max - a };
        let k = T::lit(0.85) * T::exact(code.fc);
        let nan = T::exact(f64::NAN);
        let bad = SectionStateR { pn: nan, mnx: nan, mny: nan, eps_t: nan, phi: nan, phi_pn: nan, phi_mnx: nan, phi_mny: nan };

        let mut cut = Vec::new();
        let mut z = [zero; 3];
        for (i, ring) in self.rings.iter().enumerate() {
            let part = match ring {
                Ring::Polygon(p) => clipped::<T>(p, nx, ny, level, &mut cut),
                Ring::Circle { c, r } => clipped_circle::<T>(*c, *r, nx, ny, level),
            };
            let Some(part) = part else { return bad };
            for j in 0..3 {
                z[j] = if i == 0 { z[j] + part[j] } else { z[j] - part[j] };
            }
        }
        let mut pn = k * z[0].max(zero);
        // Moments about the gross centroid (cx, cy): ∫(y − cy) = My − A·cy, likewise for x.
        let (cx, cy) = (T::exact(self.centroid[0]), T::exact(self.centroid[1]));
        let mut mnx = -(k * (z[2] - z[0] * cy));
        let mut mny = k * (z[1] - z[0] * cx);

        let es = T::exact(code.es);
        let fy = T::exact(code.fy);
        let ecu = T::lit(EPSILON_CU);
        let mut eps_min = zero;
        for bar in &self.bars {
            let s = T::exact(nx) * T::exact(bar[0]) + T::exact(ny) * T::exact(bar[1]);
            // Pure tension: the axis has left the section; every bar is far past yield.
            let strain = if c_f64 > 1e-9 { ecu * (s - (max - c)).dv(c) } else { T::exact(-10.0) * fy.dv(es) };
            let fs = (strain * es).max(-fy).min(fy);
            let area = T::exact(bar[2]);
            let mut force = area * fs;
            if code.deduct_displaced_concrete {
                let inside = zero.lt(strain).and(level.le(s));
                match inside {
                    Tri::True => force = force - area * k,
                    Tri::False => {}
                    Tri::Unknown => return bad,
                }
            }
            pn = pn + force;
            mnx = mnx - force * (T::exact(bar[1]) - cy);
            mny = mny + force * (T::exact(bar[0]) - cx);
            eps_min = eps_min.min(strain);
        }
        let eps_t = -(eps_min.min(zero));
        let phi = phi_r::<T>(code.edition, code.confinement, eps_t, code.fy, code.es);
        let cap = T::exact(self.axial_cap());
        SectionStateR { pn, mnx, mny, eps_t, phi, phi_pn: (phi * pn).min(cap), phi_mnx: phi * mnx, phi_mny: phi * mny }
    }

    /// f64 state at one neutral axis.
    pub fn point(&self, nx: f64, ny: f64, c: f64) -> SectionPoint {
        SectionPoint { nx, ny, c, s: self.state::<f64>(nx, ny, c, c) }
    }

    /// The interaction curve in one direction: from every fibre compressed (c = 10·depth)
    /// through c = 2·depth … 0 in `n` steps to pure tension (c = 10⁻⁵ m).
    pub fn curve(&self, nx: f64, ny: f64, n: usize) -> Vec<SectionPoint> {
        let (max, min) = self.extent(nx, ny);
        let depth = max - min;
        let mut cs = vec![10.0 * depth];
        for i in 0..=n {
            let c = 2.0 * depth * (1.0 - i as f64 / n as f64);
            if c > 1e-5 {
                cs.push(c);
            }
        }
        cs.push(1e-5);
        cs.sort_by(|p, q| q.partial_cmp(p).unwrap_or(std::cmp::Ordering::Equal));
        cs.into_iter().map(|c| self.point(nx, ny, c)).collect()
    }

    /// Bisect `f` on the neutral-axis depth between `ca` and `cb` (a sign change).
    pub fn refine(&self, nx: f64, ny: f64, ca: f64, cb: f64, f: impl Fn(&SectionPoint) -> f64) -> SectionPoint {
        let (mut a, mut b) = (ca, cb);
        let mut fa = f(&self.point(nx, ny, a));
        for _ in 0..50 {
            let m = (a + b) / 2.0;
            let pm = self.point(nx, ny, m);
            let fm = f(&pm);
            if fm == 0.0 {
                return pm;
            }
            if fa * fm < 0.0 {
                b = m;
            } else {
                a = m;
                fa = fm;
            }
        }
        self.point(nx, ny, (a + b) / 2.0)
    }

    /// The root of `f` between `ca` and `cb` (a sign change) by the Illinois variant of
    /// regula falsi: superlinear where `f` is smooth, bracketed always, to 1e-12 of the bracket.
    fn refine_fast(&self, nx: f64, ny: f64, ca: f64, cb: f64, f: impl Fn(&SectionPoint) -> f64) -> SectionPoint {
        let (mut a, mut b) = (ca, cb);
        let (mut fa, mut fb) = (f(&self.point(nx, ny, a)), f(&self.point(nx, ny, b)));
        let width = (b - a).abs();
        let mut side = 0i8;
        for _ in 0..80 {
            let m = if fb != fa { (a * fb - b * fa) / (fb - fa) } else { 0.5 * (a + b) };
            let m = if m.is_finite() && (m - a) * (m - b) < 0.0 { m } else { 0.5 * (a + b) };
            let pm = self.point(nx, ny, m);
            let fm = f(&pm);
            if fm == 0.0 || (b - a).abs() <= 1e-10 * width || fm.abs() <= 1e-9 * (1.0 + pm.s.pn.abs()) {
                return pm;
            }
            if fa * fm < 0.0 {
                b = m;
                fb = fm;
                if side == -1 { fa *= 0.5; }
                side = -1;
            } else {
                a = m;
                fa = fm;
                if side == 1 { fb *= 0.5; }
                side = 1;
            }
            if (b - a).abs() <= 1e-12 * width {
                return pm;
            }
        }
        self.point(nx, ny, 0.5 * (a + b))
    }

    /// The first point along a sampled curve where `f` changes sign, refined.
    fn crossing(&self, nx: f64, ny: f64, curve: &[SectionPoint], f: impl Fn(&SectionPoint) -> f64) -> Option<SectionPoint> {
        self.crossing_with(nx, ny, curve, f, false)
    }

    fn crossing_with(&self, nx: f64, ny: f64, curve: &[SectionPoint], f: impl Fn(&SectionPoint) -> f64, fast: bool) -> Option<SectionPoint> {
        for w in curve.windows(2) {
            let (fa, fb) = (f(&w[0]), f(&w[1]));
            if fa == 0.0 {
                return Some(w[0]);
            }
            if fa * fb < 0.0 {
                return Some(if fast { self.refine_fast(nx, ny, w[0].c, w[1].c, f) } else { self.refine(nx, ny, w[0].c, w[1].c, f) });
            }
        }
        None
    }

    /// The state where φ·Pn = `pu` with the axis normal to (nx, ny); None when the section
    /// cannot carry that axial force in that direction.
    pub fn at_axial(&self, nx: f64, ny: f64, pu: f64) -> Option<SectionPoint> {
        self.at_axial_with(nx, ny, pu, 60)
    }

    /// `at_axial` sampling the curve in `n` steps before refining (the calculator uses 60).
    /// With fewer than 60 samples the root is refined by regula falsi (the verifier's fast path).
    pub fn at_axial_with(&self, nx: f64, ny: f64, pu: f64, n: usize) -> Option<SectionPoint> {
        let key = (nx.to_bits(), ny.to_bits(), n);
        let cached = self.curves.borrow().get(&key).cloned();
        let curve = match cached {
            Some(c) => c,
            None => {
                let c = std::rc::Rc::new(self.curve(nx, ny, n));
                let mut map = self.curves.borrow_mut();
                if map.len() > 32 {
                    map.clear();
                }
                map.insert(key, c.clone());
                c
            }
        };
        self.crossing_with(nx, ny, &curve, |p| p.s.phi_pn - pu, n < 60)
    }

    /// The end of the diagram on the demand's side: φ·Pn,max in compression, the pure-tension
    /// φ·Pn in tension, and Pu over it.
    pub fn axial_limit(&self, nx: f64, ny: f64, pu: f64) -> Utilisation {
        let curve = self.curve(nx, ny, 90);
        let compression = pu >= 0.0;
        let end = curve
            .iter()
            .copied()
            .reduce(|best, p| if (compression && p.s.phi_pn > best.s.phi_pn) || (!compression && p.s.phi_pn < best.s.phi_pn) { p } else { best })
            .expect("a curve has points");
        let lim = end.s.phi_pn;
        let reaches = if compression { lim > 1e-6 } else { lim < -1e-6 };
        Utilisation {
            ratio: if pu.abs() < 1e-6 { 0.0 } else if reaches { pu / lim } else { f64::INFINITY },
            phi_pn: lim,
            phi_mn: 0.0,
            c: f64::NAN,
            eps_t: if compression { end.s.eps_t } else { f64::NAN },
            phi: end.s.phi,
            nx,
            ny,
            axial_only: true,
        }
    }

    /// Uniaxial check about x along the ray of constant eccentricity through (Mu, Pu): the
    /// demand over the capacity where that ray leaves the design diagram. Mu > 0 compresses the
    /// +y face. With no moment it is the axial limit; with no axial force, the moment where the
    /// diagram crosses φPn = 0.
    pub fn ray(&self, pu: f64, mu: f64) -> Utilisation {
        let mres = mu.abs();
        let (nx, ny) = if mu < 0.0 { (0.0, -1.0) } else { (0.0, 1.0) };
        if mres < 1e-6 && pu.abs() >= 1e-6 {
            return self.axial_limit(nx, ny, pu);
        }
        let curve = self.curve(nx, ny, 90);
        let cap = |p: &SectionPoint| p.s.phi_mnx.hypot(p.s.phi_mny);
        let at = |p: &SectionPoint, ratio: f64, phi_pn: f64, phi_mn: f64| Utilisation {
            ratio, phi_pn, phi_mn, c: p.c, eps_t: p.s.eps_t, phi: p.s.phi, nx, ny, axial_only: false,
        };
        if pu.abs() < 1e-6 {
            for w in curve.windows(2) {
                if w[0].s.phi_pn >= 0.0 && w[1].s.phi_pn < 0.0 {
                    let p = self.refine(nx, ny, w[0].c, w[1].c, |q| q.s.phi_pn);
                    let m = cap(&p);
                    return at(&p, if m > 1e-6 { mres / m } else { f64::INFINITY }, 0.0, m);
                }
            }
            // No crossing: every point carries compression, so the section cannot bend alone.
            let last = curve[curve.len() - 1];
            return at(&last, f64::INFINITY, 0.0, 0.0);
        }
        let slope = mres / pu;
        let on_ray = |p: &SectionPoint| cap(p) - slope * p.s.phi_pn;
        for w in curve.windows(2) {
            let (fa, fb) = (on_ray(&w[0]), on_ray(&w[1]));
            if fa == 0.0 || fa * fb < 0.0 {
                let p = if fa == 0.0 { w[0] } else { self.refine(nx, ny, w[0].c, w[1].c, on_ray) };
                let (cap_p, cap_m) = (p.s.phi_pn, cap(&p));
                let capacity = cap_m.hypot(cap_p);
                let ratio = if capacity > 1e-6 { mres.hypot(pu) / capacity } else { f64::INFINITY };
                return at(&p, ratio, cap_p, cap_m);
            }
        }
        at(&curve[0], f64::INFINITY, 0.0, 0.0)
    }

    /// The direction of the neutral axis for the sheet's angle `fi` (0 → pure Mx, π/2 → pure
    /// My) in the quadrant of the moment signs.
    pub fn theta_for(fi: f64, sx: f64, sy: f64) -> f64 {
        (sx * fi.cos()).atan2(-sy * fi.sin())
    }

    /// Biaxial bending at a fixed axial force: the moment capacity at φPn = Pu along the
    /// demand's own moment direction (the load contour), found by bisecting the axis angle.
    /// `mx`, `my` are signed as the CIRSOC_FLEX sheets sign them (positive Mx compresses +y).
    pub fn moment_capacity_at_axial(&self, pu: f64, mx: f64, my: f64) -> Option<MomentCapacity> {
        self.moment_capacity_at_axial_with(pu, mx, my, 60, 1e-7)
    }

    /// The load-contour search with a coarser curve sampling (`n`) and an angle tolerance
    /// (`tol`, radians of moment direction): the verifier's member-by-member check, which asks
    /// thousands of times per run, uses 24 and 1e-5 (the direction to 0,0006°).
    pub fn moment_capacity_at_axial_with(&self, pu: f64, mx: f64, my: f64, n: usize, tol: f64) -> Option<MomentCapacity> {
        let sx = if mx < 0.0 { -1.0 } else { 1.0 };
        let sy = if my < 0.0 { -1.0 } else { 1.0 };
        let want = my.abs().atan2(mx.abs());
        let at = |fi: f64| {
            let t = Self::theta_for(fi, sx, sy);
            self.at_axial_with(t.cos(), t.sin(), pu, n)
        };
        let sheet_mx = |p: &SectionPoint| -p.s.phi_mnx;
        let sheet_my = |p: &SectionPoint| -p.s.phi_mny;
        let dir_of = |p: &SectionPoint| sheet_my(p).abs().atan2(sheet_mx(p).abs());
        let pack = |fi: f64, p: SectionPoint| MomentCapacity {
            phi_mn: p.s.phi_mnx.hypot(p.s.phi_mny),
            phi_mnx: sheet_mx(&p),
            phi_mny: sheet_my(&p),
            fi,
            point: p,
        };
        if my.abs() < 1e-6 || mx.abs() < 1e-6 {
            let fi = if my.abs() < 1e-6 { 0.0 } else { std::f64::consts::FRAC_PI_2 };
            return at(fi).map(|p| pack(fi, p));
        }
        let (mut lo, mut hi) = (0.0, std::f64::consts::FRAC_PI_2);
        let p_lo = at(lo)?;
        let p_hi = at(hi)?;
        let mut best = pack(lo, p_lo);
        if n < 60 {
            // Fast path: Illinois regula falsi on the direction of the moment, which is smooth
            // and increasing in the axis angle.
            let (mut ga, mut gb) = (dir_of(&p_lo) - want, dir_of(&p_hi) - want);
            if !(ga < 0.0 && gb > 0.0) {
                return Some(if ga.abs() < gb.abs() { best } else { pack(hi, p_hi) });
            }
            let mut side = 0i8;
            for _ in 0..60 {
                let m = (lo * gb - hi * ga) / (gb - ga);
                let m = if m.is_finite() && m > lo && m < hi { m } else { 0.5 * (lo + hi) };
                let p = at(m)?;
                best = pack(m, p);
                let g = dir_of(&p) - want;
                if g.abs() < tol || (hi - lo) < 1e-12 {
                    break;
                }
                if g < 0.0 {
                    lo = m;
                    ga = g;
                    if side == 1 { gb *= 0.5; }
                    side = 1;
                } else {
                    hi = m;
                    gb = g;
                    if side == -1 { ga *= 0.5; }
                    side = -1;
                }
            }
            return Some(best);
        }
        for _ in 0..40 {
            let mid = (lo + hi) / 2.0;
            let p = at(mid)?;
            best = pack(mid, p);
            let d = dir_of(&p) - want;
            if d.abs() < tol {
                break;
            }
            if d < 0.0 {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        Some(best)
    }

    /// Biaxial check: the resultant moment over the capacity on the load contour at Pu.
    pub fn biaxial(&self, pu: f64, mx: f64, my: f64) -> Utilisation {
        self.biaxial_with(pu, mx, my, 60, 1e-7)
    }

    /// `biaxial` with the search settings of [`Section::moment_capacity_at_axial_with`].
    pub fn biaxial_with(&self, pu: f64, mx: f64, my: f64, n: usize, tol: f64) -> Utilisation {
        let mres = mx.hypot(my);
        if mres < 1e-6 {
            return self.axial_limit(0.0, 1.0, pu);
        }
        match self.moment_capacity_at_axial_with(pu, mx, my, n, tol) {
            None => Utilisation { ratio: f64::INFINITY, phi_pn: pu, phi_mn: 0.0, c: f64::NAN, eps_t: f64::NAN, phi: f64::NAN, nx: 0.0, ny: 1.0, axial_only: false },
            Some(g) => {
                let sx = if mx < 0.0 { -1.0 } else { 1.0 };
                let sy = if my < 0.0 { -1.0 } else { 1.0 };
                let t = Self::theta_for(g.fi, sx, sy);
                Utilisation {
                    ratio: if g.phi_mn > 1e-6 { mres / g.phi_mn } else { f64::INFINITY },
                    phi_pn: pu,
                    phi_mn: g.phi_mn,
                    c: g.point.c,
                    eps_t: g.point.s.eps_t,
                    phi: g.point.s.phi,
                    nx: t.cos(),
                    ny: t.sin(),
                    axial_only: false,
                }
            }
        }
    }

    /// The CIRSOC_FLEX sheets' six characteristic points in one direction (see
    /// [`CHARACTERISTIC_KEYS`]); each as (φMn signed as the sheet signs it, φPn, φ, εt).
    pub fn characteristic_points(&self, nx: f64, ny: f64) -> [[f64; 4]; 6] {
        let (_, dt) = self.depths(nx, ny);
        let curve = self.curve(nx, ny, 120);
        let at = |p: &SectionPoint| [-p.s.phi_mnx, p.s.phi_pn, p.s.phi, p.s.eps_t];
        let pmax = curve.iter().map(|p| p.s.phi_pn).fold(f64::NEG_INFINITY, f64::max);
        // The cap is a plateau; the sheet prints its widest point, where the uncapped φ·Pn
        // comes down to the ceiling.
        let cap_point = self.crossing(nx, ny, &curve, |p| p.s.phi * p.s.pn - pmax).unwrap_or(curve[0]);
        let flexure = self.crossing(nx, ny, &curve, |p| p.s.phi_pn);
        let tension = self.point(nx, ny, 1e-7);
        let ety = self.code.fy / self.code.es;
        let etc = tension_controlled_strain_r::<f64>(self.code.edition, self.code.fy, self.code.es);
        let mut pure = match flexure {
            Some(p) => at(&p),
            None => at(&tension),
        };
        if flexure.is_some() {
            pure[1] = 0.0;
        }
        let mut tens = at(&tension);
        tens[0] = 0.0;
        [
            at(&cap_point),
            at(&self.point(nx, ny, dt)),
            at(&self.point(nx, ny, EPSILON_CU * dt / (EPSILON_CU + ety))),
            at(&self.point(nx, ny, EPSILON_CU * dt / (EPSILON_CU + etc))),
            pure,
            tens,
        ]
    }

    /// β1 of this concrete (22.2.2.4.3).
    pub fn beta1(&self) -> f64 {
        beta1(self.code.fc)
    }
}

/// The keys of [`Section::characteristic_points`], in order.
pub const CHARACTERISTIC_KEYS: [&str; 6] = ["axialCap", "zeroStrain", "yieldStrain", "tensionControlled", "pureFlexure", "maxTension"];

/// Demand over capacity, and the section's state at the capacity.
#[derive(Debug, Clone, Copy)]
pub struct Utilisation {
    pub ratio: f64,
    pub phi_pn: f64,
    pub phi_mn: f64,
    /// Neutral axis depth, εt and φ at the capacity (NaN where no axis describes it).
    pub c: f64,
    pub eps_t: f64,
    pub phi: f64,
    /// Outward normal of the compressed face at the capacity.
    pub nx: f64,
    pub ny: f64,
    /// The demand had no moment and was measured against the axial limit alone.
    pub axial_only: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct MomentCapacity {
    pub phi_mn: f64,
    pub phi_mnx: f64,
    pub phi_mny: f64,
    pub fi: f64,
    pub point: SectionPoint,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::certify::interval::Interval;

    fn rect(b: f64, h: f64) -> Vec<Pt> {
        vec![[-b / 2.0, -h / 2.0], [b / 2.0, -h / 2.0], [b / 2.0, h / 2.0], [-b / 2.0, h / 2.0]]
    }

    fn code(edition: Cirsoc201Edition) -> SectionCode {
        SectionCode { fc: 25e6, fy: 420e6, es: 200e9, edition, confinement: Confinement::Ties, deduct_displaced_concrete: true }
    }

    fn column() -> Section {
        let a = 3.14e-4;
        let bars = vec![[-0.1, -0.1, a], [0.1, -0.1, a], [0.1, 0.1, a], [-0.1, 0.1, a]];
        Section::new(vec![rect(0.3, 0.3)], bars, code(Cirsoc201Edition::E2025)).unwrap()
    }

    #[test]
    fn phi_follows_tabla_21_2_2() {
        let (fy, es) = (420e6, 200e9);
        let e = Cirsoc201Edition::E2025;
        assert_eq!(phi(e, Confinement::Spiral, 0.001, fy, es), 0.75);
        assert_eq!(phi(e, Confinement::Ties, 0.001, fy, es), 0.65);
        let mid = fy / es + 0.0015;
        assert!((phi(e, Confinement::Spiral, mid, fy, es) - (0.75 + 0.15 * 0.5)).abs() < 1e-12);
        assert!((phi(e, Confinement::Ties, mid, fy, es) - (0.65 + 0.25 * 0.5)).abs() < 1e-12);
        assert_eq!(phi(Cirsoc201Edition::E2005, Confinement::Spiral, 0.001, fy, es), 0.70);
        assert_eq!(phi(Cirsoc201Edition::E2005, Confinement::Ties, 0.005, fy, es), 0.90);
    }

    #[test]
    fn pure_compression_is_the_squash_load_and_capped() {
        let s = column();
        let p = s.point(0.0, 1.0, 100.0);
        // Every fibre at εcu: concrete over the gross area less the displaced, bars yielded.
        let po = s.squash_load();
        assert!((p.s.pn - po).abs() < 1e-6 * po, "{} vs {}", p.s.pn, po);
        assert_eq!(p.s.phi, 0.65);
        assert!((p.s.phi_pn - 0.65 * 0.80 * po).abs() < 1e-6 * po);
        assert!(p.s.mnx.abs() < 1e-6 * po);
    }

    #[test]
    fn pure_tension_is_every_bar_yielding() {
        let s = column();
        let p = s.point(0.0, 1.0, 1e-12);
        assert!((p.s.pn + 420e6 * 4.0 * 3.14e-4).abs() < 1e-9 * 420e6 * 4.0 * 3.14e-4, "{}", p.s.pn);
        assert_eq!(p.s.phi, 0.90);
    }

    #[test]
    fn rectangle_matches_hand_calculation() {
        // c = 0.12 m from the top (ny = 1): a = 0.102, Cc = 0.85·25e6·0.3·0.102.
        let s = column();
        let p = s.point(0.0, 1.0, 0.12);
        let a = 0.85 * 0.12;
        let cc = 0.85 * 25e6 * 0.3 * a;
        let top = 0.003 * (0.12 - 0.05) / 0.12; // bars at y = 0.1, 0.05 below the top
        let bot = 0.003 * (0.12 - 0.25) / 0.12;
        let fs = |e: f64| (e * 200e9).clamp(-420e6, 420e6);
        let ftop = 2.0 * 3.14e-4 * (fs(top) - 0.85 * 25e6);
        let fbot = 2.0 * 3.14e-4 * fs(bot);
        let pn = cc + ftop + fbot;
        let mnx = -(cc * (0.15 - a / 2.0)) - ftop * 0.1 - fbot * -0.1;
        assert!((p.s.pn - pn).abs() < 1e-6 * pn.abs(), "{} vs {}", p.s.pn, pn);
        assert!((p.s.mnx - mnx).abs() < 1e-6 * mnx.abs(), "{} vs {}", p.s.mnx, mnx);
        assert!((p.s.eps_t + bot).abs() < 1e-15);
    }

    #[test]
    fn interval_state_encloses_the_f64_state() {
        let s = column();
        for c in [0.03, 0.08, 0.12, 0.2, 0.31, 1.0] {
            let f = s.point(0.0, 1.0, c).s;
            let i = s.state::<Interval>(0.0, 1.0, Interval::exact(c), c);
            for (x, iv) in [(f.pn, i.pn), (f.mnx, i.mnx), (f.phi_pn, i.phi_pn), (f.phi_mnx, i.phi_mnx)] {
                assert!(iv.lo <= x && x <= iv.hi, "c = {c}: {x} not in {iv:?}");
            }
        }
    }

    #[test]
    fn undecided_side_is_nan_not_a_guess() {
        // A bar exactly on the block edge, with an interval c that straddles it.
        let s = column();
        let c_edge = (0.15 - 0.1) / 0.85; // a = 0.05: the edge passes through the top bars
        let i = s.state::<Interval>(0.0, 1.0, Interval { lo: c_edge * (1.0 - 1e-9), hi: c_edge * (1.0 + 1e-9) }, c_edge);
        assert!(i.pn.lo.is_nan() || i.pn.hi.is_nan());
    }

    #[test]
    fn symmetric_column_has_no_moment_at_axial_balance() {
        let s = column();
        let u = s.ray(1e6, 0.0);
        assert!(u.axial_only);
        assert!((u.ratio - 1e6 / s.axial_cap()).abs() < 1e-9);
        let t = s.ray(-1e5, 0.0);
        assert!((t.ratio - 1e5 / -s.tension_cap()).abs() < 1e-3, "{}", t.ratio);
    }

    #[test]
    fn fast_biaxial_agrees_with_the_bisection() {
        let s = column();
        for (pu, mx, my) in [(5e5, 3e4, 1e4), (2e5, 1e4, 4e4), (-1e5, 2e4, 2e4), (9e5, 1e4, 1e3)] {
            let a = s.moment_capacity_at_axial(pu, mx, my).unwrap();
            let b = s.moment_capacity_at_axial_with(pu, mx, my, 24, 1e-6).unwrap();
            assert!((a.phi_mn - b.phi_mn).abs() < 1e-4 * a.phi_mn, "{pu}: {} vs {}", a.phi_mn, b.phi_mn);
        }
    }

    #[test]
    fn biaxial_on_an_axis_equals_uniaxial_moment_capacity() {
        let s = column();
        let pu = 5e5;
        let along_x = s.moment_capacity_at_axial(pu, 1e4, 0.0).unwrap();
        let p = s.at_axial(0.0, 1.0, pu).unwrap();
        assert!((along_x.phi_mn - p.s.phi_mnx.abs()).abs() < 1e-6 * along_x.phi_mn);
        // Square and symmetric: the diagonal capacity is less than the axis capacity.
        let diag = s.moment_capacity_at_axial(pu, 1e4, 1e4).unwrap();
        assert!(diag.phi_mn < along_x.phi_mn);
        assert!((diag.phi_mnx.abs() - diag.phi_mny.abs()).abs() < 1e-4 * diag.phi_mn);
    }

    #[test]
    fn holes_and_offsets_are_honoured() {
        let outer = rect(0.6, 0.6);
        let hole = rect(0.3, 0.3);
        let s = Section::new(vec![outer.clone(), hole], vec![], code(Cirsoc201Edition::E2025)).unwrap();
        assert!((s.gross_area() - 0.27).abs() < 1e-12);
        let moved: Vec<Pt> = outer.iter().map(|p| [p[0] + 5.0, p[1] - 2.0]).collect();
        let m = Section::new(vec![moved], vec![], code(Cirsoc201Edition::E2025)).unwrap();
        let o = Section::new(vec![outer], vec![], code(Cirsoc201Edition::E2025)).unwrap();
        let (p, q) = (m.point(0.6, 0.8, 0.2), o.point(0.6, 0.8, 0.2));
        assert!((p.s.mnx - q.s.mnx).abs() < 1e-6 && (p.s.mny - q.s.mny).abs() < 1e-6);
    }

    #[test]
    fn an_exact_circle_gives_the_segment_closed_form() {
        let s = Section::with_rings(vec![Ring::Circle { c: [0.0, 0.0], r: 0.25 }], vec![], code(Cirsoc201Edition::E2025)).unwrap();
        assert!((s.gross_area() - std::f64::consts::PI * 0.0625).abs() < 1e-15);
        for a in [0.05, 0.15, 0.25, 0.35, 0.48] {
            let theta = 2.0 * ((0.25 - a) / 0.25_f64).acos();
            let area = 0.0625 * (theta - theta.sin()) / 2.0;
            let zc = 4.0 * 0.25 * (theta / 2.0).sin().powi(3) / (3.0 * (theta - theta.sin()));
            let p = s.point(0.0, 1.0, a / 0.85);
            let k = 0.85 * 25e6;
            assert!((p.s.pn / k - area).abs() < 1e-12, "{a}: {} vs {area}", p.s.pn / k);
            assert!((-p.s.mnx / k - area * zc).abs() < 1e-12, "{a}");
            let iv = s.state::<Interval>(0.0, 1.0, Interval::exact(a / 0.85), a / 0.85);
            assert!(iv.pn.lo <= p.s.pn && p.s.pn <= iv.pn.hi, "{iv:?}");
        }
        // A ring: the hole's segment is subtracted.
        let ring = Section::with_rings(vec![Ring::Circle { c: [0.0, 0.0], r: 0.5 }, Ring::Circle { c: [0.0, 0.0], r: 0.3 }], vec![], code(Cirsoc201Edition::E2025)).unwrap();
        assert!((ring.gross_area() - std::f64::consts::PI * (0.25 - 0.09)).abs() < 1e-14);
    }

    #[test]
    fn refuses_data_that_describe_no_section() {
        assert!(Section::new(vec![], vec![], code(Cirsoc201Edition::E2025)).is_err());
        assert!(Section::new(vec![rect(0.3, 0.3)], vec![[0.0, 0.0, -1.0]], code(Cirsoc201Edition::E2025)).is_err());
        assert!(Section::new(vec![rect(0.3, f64::NAN)], vec![], code(Cirsoc201Edition::E2025)).is_err());
        let mut c = code(Cirsoc201Edition::E2025);
        c.fc = 0.0;
        assert!(Section::new(vec![rect(0.3, 0.3)], vec![], c).is_err());
    }
}
