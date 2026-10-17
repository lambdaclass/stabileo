//! Canonical geometry for parametric and catalogue cross-sections.
//!
//! Every section family that can be described honestly today is turned into
//! [`SectionPolygon`] outlines here, so that one geometry drives properties,
//! meshing, stress and drawing. Nothing in this module infers a dimension: a
//! builder either receives every dimension it needs or it refuses.
//!
//! # Why this exists
//!
//! The stress path used to resolve geometry from a section's *name* (`IPE…`,
//! `HEB…`, `L\d…`) and to invent thicknesses when they were missing —
//! `tw = 0.05 b`, `tf = 0.06 h`. Measured, that produced a 40 % error in the
//! shear stress of an I-profile, silently. Requiring the dimensions makes that
//! class of defect unrepresentable rather than merely unlikely.
//!
//! # One closed outline, never overlapping rectangles
//!
//! An I-section is a single twelve-or-more-vertex loop, not three rectangles.
//! Overlapping component rectangles share edges, which seeds duplicate
//! constraint vertices in the mesher and drives the minimum triangle angle to
//! 0.76 deg — measured while validating `section::mesh`.
//!
//! # Root fillets
//!
//! Rolled I-profiles have a fillet between web and flange. Omitting it makes a
//! canonical polygon 2.4-6.0 % light on area and 2.9-5.7 % light on `Iy`
//! against published tables, so a profile without an authoritative root radius
//! is *not* representable here and stays properties-only. See
//! `web/src/lib/data/steel-profiles.ts` for the data provenance.

use serde::{Deserialize, Serialize};

use super::SectionPolygon;

/// Default arc discretization: segments per quarter circle.
///
/// Every curved boundary is polygonised, so the count is part of the geometry
/// and is recorded rather than assumed. 24 puts a solid circle within 1e-4
/// relative on area and inertia — below the rounding of published tables — and
/// the convergence tests pin the trend.
pub const DEFAULT_ARC_SEGMENTS: usize = 24;

/// Most segments per arc the geometry builders accept from a caller: far
/// beyond any convergence need, and small enough that `4 * n` vertices per
/// circle cannot exhaust memory or overflow.
pub const MAX_ARC_SEGMENTS: usize = 1_024;

/// How a canonical geometry was produced, carried for provenance and auditing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum GeometrySource {
    /// A rolled catalogue profile with authoritative dimensions.
    Catalogue { profile_id: String, standard: String },
    /// Dimensions entered explicitly by the user. Sharp corners are the
    /// declared shape, not an approximation of a rolled profile.
    Parametric { shape: String },
    /// Vertices supplied directly.
    Custom,
}

/// A resolved canonical section: geometry plus how it was obtained.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalGeometry {
    /// Schema version. Bumped when the wire shape changes so a stored geometry
    /// can always be interpreted by the code that reads it.
    pub version: u32,
    pub polygons: Vec<SectionPolygon>,
    pub source: GeometrySource,
    /// Segments per quarter arc used for any curved boundary.
    pub arc_segments: usize,
    /// Section rotation about its own centroid, radians, applied by consumers.
    #[serde(default)]
    pub rotation: f64,
}

pub const CANONICAL_GEOMETRY_VERSION: u32 = 1;

impl CanonicalGeometry {
    fn new(polygons: Vec<SectionPolygon>, source: GeometrySource, arc_segments: usize) -> Self {
        Self {
            version: CANONICAL_GEOMETRY_VERSION,
            polygons,
            source,
            arc_segments,
            rotation: 0.0,
        }
    }

    /// Coordinate quantum for the digest, in section units (metres): 1 pm.
    ///
    /// Coordinates are quantised before hashing rather than hashed by bit
    /// pattern, because `serde_json` does not round-trip f64 bit-exactly —
    /// measured, `0.023426254764648238` returns as `0.02342625476464824`. A
    /// bit-pattern digest therefore changes merely by crossing the wire, which
    /// would make the drawing and the numerical path disagree for no
    /// geometric reason and defeat the whole purpose of the digest.
    ///
    /// 1 pm is roughly nine orders of magnitude below any meaningful
    /// structural tolerance and about seven above the f64 round-trip noise at
    /// these magnitudes, so it absorbs serialization jitter while still
    /// changing whenever the geometry actually changes.
    const DIGEST_QUANTUM: f64 = 1e-12;

    /// Deterministic digest of the exact geometry.
    ///
    /// Lets the drawing and the numerical analysis *prove* they consumed the
    /// same section rather than assert it. FNV-1a needs no dependency, and
    /// collisions do not matter here: this is an identity check between two
    /// in-process values, not a security boundary.
    pub fn digest(&self) -> String {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        let mut feed = |b: u64| {
            for i in 0..8 {
                h ^= (b >> (i * 8)) & 0xff;
                h = h.wrapping_mul(0x100_0000_01b3);
            }
        };
        let quantise = |v: f64| -> u64 { ((v / Self::DIGEST_QUANTUM).round() as i64) as u64 };
        feed(self.version as u64);
        feed(self.arc_segments as u64);
        feed(quantise(self.rotation));
        for p in &self.polygons {
            feed(if p.is_void { 1 } else { 0 });
            feed(p.material_id as u64);
            feed(p.vertices.len() as u64);
            for v in &p.vertices {
                feed(quantise(v[0]));
                feed(quantise(v[1]));
            }
        }
        format!("{h:016x}")
    }
}

// ─── Primitives ────────────────────────────────────────────────────

fn require_positive(name: &str, v: f64) -> Result<f64, String> {
    if !v.is_finite() || v <= 0.0 {
        return Err(format!("{name} must be a positive, finite dimension (got {v})"));
    }
    Ok(v)
}

fn arc_points(cy: f64, cz: f64, r: f64, a0: f64, a1: f64, n: usize) -> Vec<[f64; 2]> {
    (0..=n)
        .map(|i| {
            let a = a0 + (a1 - a0) * (i as f64) / (n as f64);
            [cy + r * a.cos(), cz + r * a.sin()]
        })
        .collect()
}

fn solid(vertices: Vec<[f64; 2]>) -> SectionPolygon {
    SectionPolygon { vertices, material_id: 0, is_void: false }
}
fn void(vertices: Vec<[f64; 2]>) -> SectionPolygon {
    SectionPolygon { vertices, material_id: 0, is_void: true }
}

// ─── Builders ──────────────────────────────────────────────────────

/// Solid rectangle, centred on its centroid.
pub fn rectangle(b: f64, h: f64) -> Result<CanonicalGeometry, String> {
    let b = require_positive("b", b)?;
    let h = require_positive("h", h)?;
    let (hb, hh) = (b / 2.0, h / 2.0);
    Ok(CanonicalGeometry::new(
        vec![solid(vec![[-hb, -hh], [hb, -hh], [hb, hh], [-hb, hh]])],
        GeometrySource::Parametric { shape: "rect".into() },
        0,
    ))
}

/// Solid circle of diameter `d`.
pub fn solid_circle(d: f64, arc_segments: usize) -> Result<CanonicalGeometry, String> {
    let d = require_positive("d", d)?;
    let n = arc_segments.max(4) * 4;
    let r = d / 2.0;
    let mut v = arc_points(0.0, 0.0, r, 0.0, 2.0 * std::f64::consts::PI, n);
    v.pop(); // the closing point repeats the first
    Ok(CanonicalGeometry::new(
        vec![solid(v)],
        GeometrySource::Parametric { shape: "circle".into() },
        arc_segments,
    ))
}

/// Circular hollow section from outer diameter and wall thickness.
///
/// Fully determined by `d` and `t` — no fillet or corner data is involved,
/// which is why CHS is geometry-backed for the whole catalogue.
pub fn circular_hollow(d: f64, t: f64, arc_segments: usize) -> Result<CanonicalGeometry, String> {
    let d = require_positive("d", d)?;
    let t = require_positive("t", t)?;
    let r = d / 2.0;
    if t >= r {
        return Err(format!("wall thickness {t} must be smaller than the radius {r}"));
    }
    let n = arc_segments.max(4) * 4;
    let full = 2.0 * std::f64::consts::PI;
    let mut outer = arc_points(0.0, 0.0, r, 0.0, full, n);
    outer.pop();
    let mut inner = arc_points(0.0, 0.0, r - t, 0.0, full, n);
    inner.pop();
    Ok(CanonicalGeometry::new(
        vec![solid(outer), void(inner)],
        GeometrySource::Parametric { shape: "chs".into() },
        arc_segments,
    ))
}

/// Doubly-symmetric I/H outline with parallel flanges.
///
/// `root_radius` may be zero for a fabricated/welded section whose corners
/// really are sharp. For a *rolled* profile it must be the authoritative value:
/// omitting the fillets costs 2.4-6.0 % of the area.
pub fn i_section(
    h: f64,
    b: f64,
    tw: f64,
    tf: f64,
    root_radius: f64,
    arc_segments: usize,
    source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if !root_radius.is_finite() || root_radius < 0.0 {
        return Err(format!("root radius must be finite and non-negative (got {root_radius})"));
    }
    if 2.0 * tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw >= b {
        return Err("web is wider than the flange".into());
    }
    let (hb, bb, tb) = (h / 2.0, b / 2.0, tw / 2.0);
    let (zb, zt) = (-hb + tf, hb - tf);
    let r = root_radius.min((zt - zb) / 2.0).min(bb - tb);
    let pi = std::f64::consts::PI;
    let n = arc_segments.max(1);

    let mut v: Vec<[f64; 2]> = vec![[-bb, -hb], [bb, -hb], [bb, zb]];
    if r > 0.0 {
        // Concave quarter fillets, tangent to the flange underside and web face.
        v.extend(arc_points(tb + r, zb + r, r, -pi / 2.0, -pi, n));
        v.extend(arc_points(tb + r, zt - r, r, pi, pi / 2.0, n));
    } else {
        v.push([tb, zb]);
        v.push([tb, zt]);
    }
    v.extend([[bb, zt], [bb, hb], [-bb, hb], [-bb, zt]]);
    if r > 0.0 {
        v.extend(arc_points(-tb - r, zt - r, r, pi / 2.0, 0.0, n));
        v.extend(arc_points(-tb - r, zb + r, r, 0.0, -pi / 2.0, n));
    } else {
        v.push([-tb, zt]);
        v.push([-tb, zb]);
    }
    v.push([-bb, zb]);

    Ok(CanonicalGeometry::new(vec![solid(v)], source, arc_segments))
}

/// Sharp-cornered T outline: flange on top, web below, centred on the bounding box.
pub fn tee_section(h: f64, b: f64, tw: f64, tf: f64) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw > b {
        return Err("web is wider than the flange".into());
    }
    let (hb, bb, tb) = (h / 2.0, b / 2.0, tw / 2.0);
    Ok(CanonicalGeometry::new(
        vec![solid(vec![
            [-tb, -hb], [tb, -hb], [tb, hb - tf], [bb, hb - tf],
            [bb, hb], [-bb, hb], [-bb, hb - tf], [-tb, hb - tf],
        ])],
        GeometrySource::Parametric { shape: "tee".into() },
        0,
    ))
}

/// T outline with rolled fillets: flange on top, web below.
///
/// `root_radius` fills the two junctions where the web meets the flange
/// underside; `toe_radius` rounds the two flange tips. Zero for either is the
/// sharp case, which is what a user-declared T is.
pub fn tee_section_filleted(
    h: f64, b: f64, tw: f64, tf: f64, root_radius: f64, toe_radius: f64,
    arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw > b {
        return Err("web is wider than the flange".into());
    }
    for (name, r) in [("root radius", root_radius), ("toe radius", toe_radius)] {
        if !r.is_finite() || r < 0.0 {
            return Err(format!("{name} must be finite and non-negative (got {r})"));
        }
    }
    let (hb, bb, tb) = (h / 2.0, b / 2.0, tw / 2.0);
    let zf = hb - tf;                      // flange underside
    let r1 = root_radius.min(bb - tb).min(zf + hb);
    let r2 = toe_radius.min(tf).min((bb - tb - r1).max(0.0));
    let pi = std::f64::consts::PI;
    let n = arc_segments.max(1);

    // Walk anticlockwise from the web's bottom-left.
    let mut v: Vec<[f64; 2]> = vec![[-tb, -hb], [tb, -hb]];
    // Up the web's right face to the junction, then the fillet out to the flange.
    if r1 > 0.0 {
        v.push([tb, zf - r1]);
        v.extend(arc_points(tb + r1, zf - r1, r1, pi, pi / 2.0, n));
    } else {
        v.push([tb, zf]);
    }
    // Along the flange underside to its tip.
    if r2 > 0.0 {
        v.push([bb - r2, zf]);
        v.extend(arc_points(bb - r2, zf + r2, r2, -pi / 2.0, 0.0, n));
    } else {
        v.push([bb, zf]);
    }
    v.extend([[bb, hb], [-bb, hb]]);
    // Mirror down the left-hand side.
    if r2 > 0.0 {
        v.push([-bb, zf + r2]);
        v.extend(arc_points(-bb + r2, zf + r2, r2, pi, pi + pi / 2.0, n));
    } else {
        v.push([-bb, zf]);
    }
    if r1 > 0.0 {
        v.push([-tb - r1, zf]);
        v.extend(arc_points(-tb - r1, zf - r1, r1, pi / 2.0, 0.0, n));
    } else {
        v.push([-tb, zf]);
    }
    v.push([-tb, -hb]);
    v.pop();

    Ok(CanonicalGeometry::new(vec![solid(v)], source, arc_segments))
}

/// Sharp-cornered angle outline with the corner at the origin.
pub fn angle_section(h: f64, b: f64, t: f64) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let t = require_positive("t", t)?;
    if t >= h || t >= b {
        return Err("leg thickness must be smaller than both legs".into());
    }
    Ok(CanonicalGeometry::new(
        vec![solid(vec![[0.0, 0.0], [b, 0.0], [b, t], [t, t], [t, h], [0.0, h]])],
        GeometrySource::Parametric { shape: "angle".into() },
        0,
    ))
}

/// Sharp-cornered channel outline, web on the left.
pub fn channel_section(h: f64, b: f64, tw: f64, tf: f64) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if 2.0 * tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw >= b {
        return Err("web is thicker than the flange is wide".into());
    }
    let hh = h / 2.0;
    Ok(CanonicalGeometry::new(
        vec![solid(vec![
            [0.0, -hh], [b, -hh], [b, -hh + tf], [tw, -hh + tf],
            [tw, hh - tf], [b, hh - tf], [b, hh], [0.0, hh],
        ])],
        GeometrySource::Parametric { shape: "channel".into() },
        0,
    ))
}

/// Sharp-cornered rectangular hollow section.
///
/// Rolled RHS have rounded corners; this builder is for a section the user
/// explicitly declares as sharp. A rolled catalogue RHS needs authoritative
/// outer *and* inner corner radii and is not representable here yet.
pub fn rectangular_hollow(b: f64, h: f64, t: f64) -> Result<CanonicalGeometry, String> {
    let b = require_positive("b", b)?;
    let h = require_positive("h", h)?;
    let t = require_positive("t", t)?;
    if 2.0 * t >= b.min(h) {
        return Err("wall thickness leaves no cavity".into());
    }
    let (hb, hh) = (b / 2.0, h / 2.0);
    let (ib, ih) = (hb - t, hh - t);
    Ok(CanonicalGeometry::new(
        vec![
            solid(vec![[-hb, -hh], [hb, -hh], [hb, hh], [-hb, hh]]),
            void(vec![[-ib, -ih], [ib, -ih], [ib, ih], [-ib, ih]]),
        ],
        GeometrySource::Parametric { shape: "rhs".into() },
        0,
    ))
}

// ─── Tapered rolled profiles (DIN 1025) ────────────────────────────
//
// IPN and UPN do not have parallel flanges. The flange thins towards its tip
// along a fixed slope, meets the web through a root fillet, and is rounded off
// at the toe. All three are specified by the standard itself as *rules* on the
// profile's own dimensions, not as an extra table:
//
//   DIN 1025-1 (IPN):  slope 14 %, r_root = tw,  r_toe = 0.6 * tw,
//                      tf quoted at b/4 from the axis of symmetry
//   DIN 1026-1 (UPN):  slope  8 %, r_root = tf,  r_toe = 0.5 * tf,
//                      tf quoted at b/2 from the web's outer face
//
// Because these are rules rather than recalled numbers, they are falsifiable:
// building the outline and integrating it must reproduce the *published* A, Iy
// and Iz, which are independent of everything above. It does — see the tests at
// the bottom of this file, over the whole catalogue. That is the evidence the
// geometry is right, and it is why these families no longer need to sit as
// properties-only for want of "authoritative radii".

/// Fillets and inner face of one tapered flange, walked from the flange tip
/// inwards to the web.
///
/// Coordinates are `[horizontal, vertical]`, the web face is at `w_web` with
/// material to its left, the tip is at `w_tip`, and the flange's inner face is
/// the line `v = m*w + c`. Returns the run between the two flat surfaces: the
/// caller supplies the flat outer face and the web line.
fn tapered_flange_run(
    w_web: f64, w_tip: f64, m: f64, c: f64, r_root: f64, r_toe: f64, n: usize,
) -> Vec<[f64; 2]> {
    let pi = std::f64::consts::PI;
    let k = (1.0 + m * m).sqrt();
    let mut v = Vec::new();

    // Toe: convex rounding of the corner between the tip face and the inner
    // face, so its centre sits inside the material.
    if r_toe > 0.0 {
        let cw = w_tip - r_toe;
        let cv = m * cw + c + r_toe * k;
        v.extend(arc_points(cw, cv, r_toe, 0.0, -(pi / 2.0 - m.atan()), n));
    } else {
        v.push([w_tip, m * w_tip + c]);
    }

    // Root: concave fillet filling the corner between the inner face and the
    // web, so its centre sits in the void.
    if r_root > 0.0 {
        let cw = w_web + r_root;
        let cv = m * cw + c - r_root * k;
        v.extend(arc_points(cw, cv, r_root, pi / 2.0 + m.atan(), pi, n));
    } else {
        v.push([w_web, m * w_web + c]);
    }
    v
}

/// Mirror a quadrant/half outline, dropping the vertex that would repeat.
fn mirrored(run: &[[f64; 2]], flip_w: bool, flip_v: bool, reverse: bool) -> Vec<[f64; 2]> {
    let sw = if flip_w { -1.0 } else { 1.0 };
    let sv = if flip_v { -1.0 } else { 1.0 };
    let mut v: Vec<[f64; 2]> = run.iter().map(|p| [sw * p[0], sv * p[1]]).collect();
    if reverse {
        v.reverse();
    }
    v
}

/// IPN, per DIN 1025-1. `tf` is the published flange thickness, quoted at b/4.
///
/// Doubly symmetric, so one quadrant is built and mirrored three times; the
/// mirror is exact, which keeps `Iyz` at zero to machine precision instead of
/// leaving a spurious product of inertia from independently-built quadrants.
pub fn ipn_section(
    h: f64, b: f64, tw: f64, tf: f64, arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if 2.0 * tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw >= b {
        return Err("web is wider than the flange".into());
    }
    let (hh, hb, tb) = (h / 2.0, b / 2.0, tw / 2.0);
    let (m, r_root, r_toe) = (0.14, tw, 0.6 * tw);
    let c = hh - tf - m * (b / 4.0);
    if m * tb + c <= 0.0 {
        return Err("flange taper leaves no web between the flanges".into());
    }
    let n = arc_segments.max(1);

    // Upper-right quadrant: centreline of the top face, out to the tip, then
    // down and in to the web at mid-height.
    let mut q: Vec<[f64; 2]> = vec![[0.0, hh], [hb, hh]];
    q.extend(tapered_flange_run(tb, hb, m, c, r_root, r_toe, n));
    q.push([tb, 0.0]);

    let mut v = q.clone();
    v.extend_from_slice(&mirrored(&q, false, true, true)[1..]);   // lower right
    v.extend_from_slice(&mirrored(&q, true, true, false)[1..]);   // lower left
    let last = mirrored(&q, true, false, true);
    v.extend_from_slice(&last[1..last.len() - 1]);                // upper left

    Ok(CanonicalGeometry::new(vec![solid(v)], source, arc_segments))
}

/// Channel with tapered flanges, web on the left at the horizontal origin.
///
/// The taper is a parameter rather than a constant because the two channel
/// families this serves disagree on every part of it: DIN's UPN slopes at 8 %
/// with `r_root = tf` and quotes `tf` at b/2 from the web's outer face, while
/// the American C series slopes at 1:6, carries a roller radius constant per
/// rolling depth, and quotes `tf` at the middle of the flange overhang.
/// Hard-coding either one is what forced the first version of this to be
/// UPN-only.
///
/// `taper_ref` is the horizontal position, measured from the web's outer face,
/// at which the flange is `tf` thick. `r_root`/`r_toe` of zero give a sharp
/// junction, which is the honest rendering when a table does not publish a
/// radius.
pub fn tapered_channel(
    h: f64, b: f64, tw: f64, tf: f64,
    slope: f64, r_root: f64, r_toe: f64, taper_ref: f64,
    arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let tw = require_positive("tw", tw)?;
    let tf = require_positive("tf", tf)?;
    if 2.0 * tf >= h {
        return Err("flange thickness leaves no web".into());
    }
    if tw >= b {
        return Err("web is thicker than the flange is wide".into());
    }
    if !slope.is_finite() || slope < 0.0 {
        return Err(format!("flange slope must be finite and non-negative (got {slope})"));
    }
    let hh = h / 2.0;
    let c = hh - tf - slope * taper_ref;
    if slope * tw + c <= 0.0 {
        return Err("flange taper leaves no web between the flanges".into());
    }
    // A fillet cannot be larger than the space it sits in.
    //
    // The toe is bounded by the flange's thickness AT THE TIP, not by its
    // quoted thickness: a tapered flange is thinnest exactly where the toe
    // fillet sits. Without that bound the arc does not fit between the tip face
    // and the inner face, and the outline closes through a 1.7-degree spike —
    // which no Delaunay refiner can mesh, so shear and torsion panicked with
    // `unreachable` on eight of the shipped channels while bending, which needs
    // no mesh, answered fine.
    let tip_thickness = hh - (slope * b + c);
    let r_root = r_root.max(0.0).min((b - tw) / 2.0).min(hh - tf);
    let r_toe = r_toe.max(0.0).min((b - tw) / 2.0).min(tip_thickness.max(0.0));
    let n = arc_segments.max(1);

    let mut top: Vec<[f64; 2]> = vec![[0.0, hh], [b, hh]];
    top.extend(tapered_flange_run(tw, b, slope, c, r_root, r_toe, n));
    top.push([tw, 0.0]);

    let mut v = top.clone();
    v.extend_from_slice(&mirrored(&top, false, true, true)[1..]);

    Ok(CanonicalGeometry::new(vec![solid(v)], source, arc_segments))
}

/// UPN, per DIN 1026-1. `tf` is the published flange thickness, quoted at b/2
/// from the web's outer face, which sits at the horizontal origin.
pub fn upn_section(
    h: f64, b: f64, tw: f64, tf: f64, arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    tapered_channel(h, b, tw, tf, 0.08, tf, 0.5 * tf, b / 2.0, arc_segments, source)
}

/// Equal- or unequal-leg angle with the rolled fillets, corner at the origin.
///
/// EN 10056-1 tabulates the root radius per size and sets the toe radius at
/// half of it. A sharp angle is the `r_root = r_toe = 0` case, which is what a
/// user-declared parametric angle is.
pub fn angle_section_filleted(
    h: f64, b: f64, t: f64, r_root: f64, r_toe: f64, arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let h = require_positive("h", h)?;
    let b = require_positive("b", b)?;
    let t = require_positive("t", t)?;
    if t >= h || t >= b {
        return Err("leg thickness must be smaller than both legs".into());
    }
    for (name, r) in [("root radius", r_root), ("toe radius", r_toe)] {
        if !r.is_finite() || r < 0.0 {
            return Err(format!("{name} must be finite and non-negative (got {r})"));
        }
    }
    let r1 = r_root.min(h - t).min(b - t);
    let r2 = r_toe.min(t).min((h - t - r1).max(0.0)).min((b - t - r1).max(0.0));
    let pi = std::f64::consts::PI;
    let n = arc_segments.max(1);

    let mut v: Vec<[f64; 2]> = vec![[0.0, 0.0], [b, 0.0]];
    // Horizontal leg's toe, then the root fillet, then the vertical leg's toe.
    if r2 > 0.0 {
        v.push([b, t - r2]);
        v.extend(arc_points(b - r2, t - r2, r2, 0.0, pi / 2.0, n));
    } else {
        v.push([b, t]);
    }
    if r1 > 0.0 {
        v.push([t + r1, t]);
        v.extend(arc_points(t + r1, t + r1, r1, -pi / 2.0, -pi, n));
    } else {
        v.push([t, t]);
    }
    if r2 > 0.0 {
        v.push([t, h - r2]);
        v.extend(arc_points(t - r2, h - r2, r2, 0.0, pi / 2.0, n));
    } else {
        v.push([t, h]);
    }
    v.push([0.0, h]);

    Ok(CanonicalGeometry::new(vec![solid(v)], source, arc_segments))
}

/// Rectangular hollow section with rolled corner radii.
///
/// IRAM-IAS U 500-218 / U 500-2592 fixes the OUTER corner at `R = 2t`, and the
/// inner corner follows at `R - t`. That single value is the whole difference
/// between this family being geometry-backed and not: EN 10219-2 gives the
/// same radius as a RANGE (1.6t-2.4t below 6 mm), which leaves the outline
/// underdetermined no matter how carefully you read it.
///
/// `outer_radius` of zero yields the sharp box a user-declared section is.
pub fn rectangular_hollow_rounded(
    b: f64, h: f64, t: f64, outer_radius: f64, arc_segments: usize, source: GeometrySource,
) -> Result<CanonicalGeometry, String> {
    let b = require_positive("b", b)?;
    let h = require_positive("h", h)?;
    let t = require_positive("t", t)?;
    if 2.0 * t >= b.min(h) {
        return Err("wall thickness leaves no cavity".into());
    }
    if !outer_radius.is_finite() || outer_radius < 0.0 {
        return Err(format!("corner radius must be finite and non-negative (got {outer_radius})"));
    }
    // A corner cannot eat more than half the shorter side, and the inner
    // corner cannot go negative — a wall thinner than its own radius is a
    // straight inner face, not an error.
    let ro = outer_radius.min(b.min(h) / 2.0);
    let ri = (ro - t).max(0.0);
    let n = arc_segments.max(1);
    let pi = std::f64::consts::PI;

    let ring = |bb: f64, hh: f64, r: f64| -> Vec<[f64; 2]> {
        let (hw, hd) = (bb / 2.0, hh / 2.0);
        if r <= 0.0 {
            return vec![[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        }
        let mut v = Vec::new();
        for (sw, sd, a0) in [(1.0, -1.0, -pi / 2.0), (1.0, 1.0, 0.0), (-1.0, 1.0, pi / 2.0), (-1.0, -1.0, pi)] {
            v.extend(arc_points(sw * (hw - r), sd * (hd - r), r, a0, a0 + pi / 2.0, n));
        }
        v
    };

    Ok(CanonicalGeometry::new(
        vec![solid(ring(b, h, ro)), void(ring(b - 2.0 * t, h - 2.0 * t, ri))],
        source,
        arc_segments,
    ))
}

/// Custom outline with optional holes, supplied by the caller.
pub fn custom(outer: Vec<[f64; 2]>, holes: Vec<Vec<[f64; 2]>>) -> Result<CanonicalGeometry, String> {
    if outer.len() < 3 {
        return Err("outer boundary needs at least 3 vertices".into());
    }
    for v in outer.iter().chain(holes.iter().flatten()) {
        if !v[0].is_finite() || !v[1].is_finite() {
            return Err("geometry has non-finite coordinates".into());
        }
    }
    let mut polys = vec![solid(outer)];
    for h in holes {
        if h.len() < 3 {
            return Err("a hole needs at least 3 vertices".into());
        }
        polys.push(void(h));
    }
    Ok(CanonicalGeometry::new(polys, GeometrySource::Custom, 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::section::{analyze_section, SectionInput};

    fn props(g: &CanonicalGeometry) -> crate::section::SectionProperties {
        analyze_section(&SectionInput { polygons: g.polygons.clone(), modular_ratios: Default::default() }).unwrap()
    }
    fn rel(got: f64, exp: f64) -> f64 {
        if exp == 0.0 { got.abs() } else { ((got - exp) / exp).abs() }
    }

    #[test]
    fn rectangle_is_exact() {
        let g = rectangle(0.2, 0.4).unwrap();
        let p = props(&g);
        assert!(rel(p.a, 0.08) < 1e-15);
        assert!(rel(p.iy, 0.2 * 0.4f64.powi(3) / 12.0) < 1e-14);
        assert!(rel(p.iz, 0.4 * 0.2f64.powi(3) / 12.0) < 1e-14);
        assert!(p.iyz.abs() < 1e-18);
    }

    #[test]
    fn solid_circle_converges_to_the_analytic_disc() {
        let d: f64 = 0.3;
        let (ea, ei) = (std::f64::consts::PI * (d / 2.0).powi(2), std::f64::consts::PI * (d / 2.0).powi(4) / 4.0);
        let mut prev = f64::INFINITY;
        for &n in &[6usize, 12, 24, 48] {
            let p = props(&solid_circle(d, n).unwrap());
            let e = rel(p.a, ea);
            assert!(e < prev, "area error must fall with refinement");
            prev = e;
            if n >= 24 {
                // An inscribed n-gon under-reports area by about pi^2/(3 n^2);
                // at n = 24 quarter-segments (96 sides) that is ~3.6e-4.
                let sides = (n * 4) as f64;
                let bound = 4.0 * std::f64::consts::PI.powi(2) / (3.0 * sides * sides);
                assert!(rel(p.a, ea) < bound, "n={n}: area error {} exceeds {bound}", rel(p.a, ea));
                assert!(rel(p.iy, ei) < 3.0 * bound, "n={n}: inertia error {}", rel(p.iy, ei));
            }
        }
    }

    #[test]
    fn chs_matches_the_exact_annulus() {
        // CHS 48.3x3.2 — one of the six whose published inertia was wrong.
        let (d, t) = (0.0483, 0.0032);
        let p = props(&circular_hollow(d, t, 64).unwrap());
        let (r, ri) = (d / 2.0, d / 2.0 - t);
        let a = std::f64::consts::PI * (r * r - ri * ri);
        let i = std::f64::consts::PI * (r.powi(4) - ri.powi(4)) / 4.0;
        // 64 quarter-segments = 256 sides; the inscribed-polygon bound is ~2e-5.
        assert!(rel(p.a, a) < 2e-4, "A {} vs {a}", p.a);
        assert!(rel(p.iy, i) < 4e-4, "Iy {} vs {i}", p.iy);
        // The corrected catalogue value, in cm^4.
        assert!(rel(p.iy * 1e8, 11.59) < 2e-3, "corrected catalogue Iy");
        // And decisively NOT the old wrong one.
        assert!(rel(p.iy * 1e8, 12.30) > 0.05, "must not reproduce the superseded value");
        assert!(rel(p.iy, p.iz) < 1e-9, "a tube is isotropic in bending");
    }

    /// The published values these polygons must reproduce.
    /// h, b, tw, tf, r in mm; a in cm^2; iy, iz in cm^4.
    const ROLLED: &[(&str, f64, f64, f64, f64, f64, f64, f64, f64)] = &[
        ("IPE 80", 80.0, 46.0, 3.8, 5.2, 5.0, 7.64, 80.1, 8.49),
        ("IPE 300", 300.0, 150.0, 7.1, 10.7, 15.0, 53.8, 8356.0, 604.0),
        ("IPE 600", 600.0, 220.0, 12.0, 19.0, 24.0, 156.0, 92080.0, 3387.0),
        ("HEB 200", 200.0, 200.0, 9.0, 15.0, 18.0, 78.1, 5696.0, 2003.0),
        // HEA are shallow: HEA 300 is 290 mm deep, the 300 naming the series.
        ("HEA 300", 290.0, 300.0, 8.5, 14.0, 27.0, 113.0, 18260.0, 6310.0),
    ];

    #[test]
    fn rolled_profiles_reproduce_published_properties_with_root_fillets() {
        // Tolerance justification: published A and I carry three significant
        // figures (53.8 cm^2, 8356 cm^4), so ~0.1-0.5 % is already inherent in
        // the reference. 0.6 % leaves room for that plus arc discretization
        // without being loose enough to hide a missing fillet, which costs
        // 2.4-6.0 %.
        const TOL: f64 = 6e-3;
        for &(name, h, b, tw, tf, r, a, iy, iz) in ROLLED {
            let g = i_section(
                h / 1000.0, b / 1000.0, tw / 1000.0, tf / 1000.0, r / 1000.0,
                DEFAULT_ARC_SEGMENTS,
                GeometrySource::Catalogue { profile_id: name.into(), standard: "EN 10365".into() },
            )
            .unwrap();
            let p = props(&g);
            assert!(rel(p.a * 1e4, a) < TOL, "{name} A {:.3} vs {a}", p.a * 1e4);
            assert!(rel(p.iy * 1e8, iy) < TOL, "{name} Iy {:.1} vs {iy}", p.iy * 1e8);
            assert!(rel(p.iz * 1e8, iz) < TOL, "{name} Iz {:.1} vs {iz}", p.iz * 1e8);
            assert!(p.iyz.abs() / p.iy < 1e-9, "{name} is doubly symmetric");
        }
    }

    #[test]
    fn omitting_the_root_fillet_is_detectably_wrong() {
        // Guards the tolerance above: it must be tight enough that a sharp
        // outline fails. This is the S1 defect made unrepresentable.
        let (h, b, tw, tf) = (0.300, 0.150, 0.0071, 0.0107);
        let sharp = props(&i_section(h, b, tw, tf, 0.0, DEFAULT_ARC_SEGMENTS,
            GeometrySource::Parametric { shape: "i".into() }).unwrap());
        let filleted = props(&i_section(h, b, tw, tf, 0.015, DEFAULT_ARC_SEGMENTS,
            GeometrySource::Catalogue { profile_id: "IPE 300".into(), standard: "EN 10365".into() }).unwrap());
        assert!(rel(sharp.a * 1e4, 53.8) > 6e-3, "sharp outline must miss the published area");
        assert!(rel(filleted.a * 1e4, 53.8) < 6e-3);
        assert!(filleted.a > sharp.a, "fillets add material");
    }

    #[test]
    fn angle_has_non_principal_geometric_axes() {
        // The case the old stress path treated as if its geometric axes were
        // principal. Equal legs put the principal axes at exactly 45 deg.
        let p = props(&angle_section(0.100, 0.100, 0.010).unwrap());
        assert!(p.iyz.abs() > 1e-9, "an angle must have a non-zero product of inertia");
        assert!((p.theta_p.to_degrees().abs() - 45.0).abs() < 1e-6, "theta_p {}", p.theta_p.to_degrees());
        assert!(rel(p.i1 + p.i2, p.iy + p.iz) < 1e-12, "trace invariant");
        assert!(p.i1 > p.iy && p.i2 < p.iz, "principal inertias must bracket the geometric ones");
    }

    #[test]
    fn tee_and_channel_build_as_single_outlines() {
        let t = props(&tee_section(0.30, 0.30, 0.10, 0.15).unwrap());
        assert!(rel(t.a, 0.30 * 0.15 + 0.10 * 0.15) < 1e-14);
        assert!(t.zc.abs() > 1e-6, "a tee's centroid is off the mid-height");

        let c = props(&channel_section(0.20, 0.075, 0.0085, 0.0115).unwrap());
        let exact = 0.20 * 0.0085 + 2.0 * (0.075 - 0.0085) * 0.0115;
        assert!(rel(c.a, exact) < 1e-12, "channel area {} vs {exact}", c.a);
        assert!(c.yc > 0.0, "a channel's centroid sits toward the flanges");
    }

    #[test]
    fn rhs_subtracts_its_cavity() {
        let p = props(&rectangular_hollow(0.10, 0.20, 0.008).unwrap());
        assert!(rel(p.a, 0.1 * 0.2 - 0.084 * 0.184) < 1e-14);
        assert!(rel(p.iy, (0.1 * 0.2f64.powi(3) - 0.084 * 0.184f64.powi(3)) / 12.0) < 1e-13);
    }

    #[test]
    fn custom_geometry_with_a_hole() {
        let g = custom(
            vec![[0.0, 0.0], [0.2, 0.0], [0.2, 0.3], [0.0, 0.3]],
            vec![vec![[0.05, 0.05], [0.15, 0.05], [0.15, 0.25], [0.05, 0.25]]],
        )
        .unwrap();
        let p = props(&g);
        assert!(rel(p.a, 0.2 * 0.3 - 0.1 * 0.2) < 1e-14);
        assert_eq!(g.polygons.len(), 2);
        assert!(g.polygons[1].is_void);
    }

    #[test]
    fn builders_refuse_missing_or_impossible_dimensions() {
        assert!(rectangle(0.0, 0.4).is_err());
        assert!(rectangle(0.2, f64::NAN).is_err());
        assert!(solid_circle(-1.0, 24).is_err());
        assert!(circular_hollow(0.05, 0.05, 24).is_err(), "wall thicker than the radius");
        assert!(i_section(0.3, 0.15, 0.0071, 0.2, 0.0, 24, GeometrySource::Custom).is_err(), "flange eats the web");
        assert!(i_section(0.3, 0.005, 0.0071, 0.0107, 0.0, 24, GeometrySource::Custom).is_err(), "web wider than flange");
        assert!(i_section(0.3, 0.15, 0.0071, 0.0107, -1.0, 24, GeometrySource::Custom).is_err(), "negative radius");
        assert!(angle_section(0.1, 0.1, 0.2).is_err(), "leg thinner than its thickness");
        assert!(rectangular_hollow(0.1, 0.2, 0.06).is_err(), "no cavity left");
        assert!(custom(vec![[0.0, 0.0], [1.0, 0.0]], vec![]).is_err(), "degenerate outline");
    }

    #[test]
    fn digest_is_deterministic_and_geometry_sensitive() {
        let a = rectangle(0.2, 0.4).unwrap();
        let b = rectangle(0.2, 0.4).unwrap();
        assert_eq!(a.digest(), b.digest(), "same geometry must digest identically");

        let c = rectangle(0.2, 0.4000001).unwrap();
        assert_ne!(a.digest(), c.digest(), "a geometry change must change the digest");
        // Sensitive well below any structural tolerance, but not to f64 noise.
        let fine = rectangle(0.2, 0.4 + 1e-9).unwrap();
        assert_ne!(a.digest(), fine.digest(), "a nanometre change is still a change");

        let mut d = rectangle(0.2, 0.4).unwrap();
        d.rotation = 0.1;
        assert_ne!(a.digest(), d.digest(), "rotation is part of the identity");

        // Discretization is part of the geometry, so it is part of the digest.
        assert_ne!(solid_circle(0.3, 12).unwrap().digest(), solid_circle(0.3, 24).unwrap().digest());
    }

    #[test]
    fn renaming_a_profile_cannot_change_its_geometry() {
        // Geometry comes from dimensions only; the identifier is provenance.
        let mk = |id: &str| {
            i_section(0.300, 0.150, 0.0071, 0.0107, 0.015, DEFAULT_ARC_SEGMENTS,
                GeometrySource::Catalogue { profile_id: id.into(), standard: "EN 10365".into() }).unwrap()
        };
        let a = mk("IPE 300");
        let b = mk("Main beam");
        assert_eq!(a.digest(), b.digest(), "the name must not enter the geometry");
        assert_eq!(a.polygons[0].vertices, b.polygons[0].vertices);
    }

    #[test]
    fn arc_discretization_is_recorded_not_assumed() {
        let g = circular_hollow(0.0483, 0.0032, 32).unwrap();
        assert_eq!(g.arc_segments, 32);
        assert_eq!(g.version, CANONICAL_GEOMETRY_VERSION);
        // Round-trips through the wire unchanged. This is the property the
        // drawing depends on: it receives geometry as JSON and must arrive at
        // the same digest the numerical path computed in Rust.
        let json = serde_json::to_string(&g).unwrap();
        let back: CanonicalGeometry = serde_json::from_str(&json).unwrap();
        assert_eq!(back.digest(), g.digest(), "digest must survive serialization");
        assert_eq!(back.arc_segments, 32);
        // Double round-trip too, so the format is a fixed point.
        let twice: CanonicalGeometry = serde_json::from_str(&serde_json::to_string(&back).unwrap()).unwrap();
        assert_eq!(twice.digest(), g.digest());
    }
}

#[cfg(test)]
mod rolled_profile_validation {
    use super::*;
    use crate::section::{analyze_section, SectionInput};

    /// Integrate a built outline and return (A, Iy, Iz) in catalogue units:
    /// cm² and cm⁴, from millimetre input.
    fn props(g: &CanonicalGeometry) -> (f64, f64, f64) {
        let p = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .expect("section integrates");
        (p.a / 100.0, p.iy / 1e4, p.iz / 1e4)
    }

    fn src() -> GeometrySource {
        GeometrySource::Parametric { shape: "test".into() }
    }

    /// The published tables carry three significant figures, so a correct
    /// outline can only be expected to agree to a few tenths of a percent.
    /// Anything larger is a geometry error, not rounding.
    const TOL: f64 = 0.6;

    fn check(name: &str, got: (f64, f64, f64), want: (f64, f64, f64)) {
        for (label, g, w) in [("A", got.0, want.0), ("Iy", got.1, want.1), ("Iz", got.2, want.2)] {
            let err = (g / w - 1.0) * 100.0;
            assert!(
                err.abs() < TOL,
                "{name} {label}: built {g:.4} vs published {w:.4} ({err:+.2} %) — \
                 the outline does not reproduce the published property"
            );
        }
    }

    /// DIN 1025-1. Columns: h, b, tw, tf, A, Iy, Iz.
    const IPN: &[(&str, f64, f64, f64, f64, f64, f64, f64)] = &[
        ("IPN 80", 80.0, 42.0, 3.9, 5.9, 7.57, 77.8, 6.29),
        ("IPN 100", 100.0, 50.0, 4.5, 6.8, 10.6, 171.0, 12.2),
        ("IPN 120", 120.0, 58.0, 5.1, 7.7, 14.2, 328.0, 21.5),
        ("IPN 140", 140.0, 66.0, 5.7, 8.6, 18.2, 573.0, 35.2),
        ("IPN 160", 160.0, 74.0, 6.3, 9.5, 22.8, 935.0, 54.7),
        ("IPN 180", 180.0, 82.0, 6.9, 10.4, 27.9, 1450.0, 81.3),
        ("IPN 200", 200.0, 90.0, 7.5, 11.3, 33.4, 2140.0, 117.0),
        ("IPN 220", 220.0, 98.0, 8.1, 12.2, 39.5, 3060.0, 162.0),
        ("IPN 240", 240.0, 106.0, 8.7, 13.1, 46.1, 4250.0, 221.0),
        ("IPN 260", 260.0, 113.0, 9.4, 14.1, 53.3, 5740.0, 288.0),
        ("IPN 280", 280.0, 119.0, 10.1, 15.2, 61.0, 7590.0, 364.0),
        ("IPN 300", 300.0, 125.0, 10.8, 16.2, 69.0, 9800.0, 451.0),
        ("IPN 320", 320.0, 131.0, 11.5, 17.3, 77.7, 12510.0, 555.0),
        ("IPN 340", 340.0, 137.0, 12.2, 18.3, 86.7, 15700.0, 674.0),
        ("IPN 360", 360.0, 143.0, 13.0, 19.5, 97.0, 19610.0, 818.0),
        ("IPN 380", 380.0, 149.0, 13.7, 20.5, 107.0, 24010.0, 975.0),
        ("IPN 400", 400.0, 155.0, 14.4, 21.6, 118.0, 29210.0, 1160.0),
        ("IPN 450", 450.0, 170.0, 16.2, 24.3, 147.0, 45850.0, 1730.0),
        ("IPN 500", 500.0, 185.0, 18.0, 27.0, 179.0, 68740.0, 2480.0),
        ("IPN 550", 550.0, 200.0, 19.0, 30.0, 212.0, 99180.0, 3490.0),
        ("IPN 600", 600.0, 215.0, 21.6, 32.4, 254.0, 139000.0, 4670.0),
    ];

    /// DIN 1026-1. Columns: h, b, tw, tf, A, Iy, Iz.
    const UPN: &[(&str, f64, f64, f64, f64, f64, f64, f64)] = &[
        ("UPN 80", 80.0, 45.0, 6.0, 8.0, 11.0, 106.0, 19.4),
        ("UPN 100", 100.0, 50.0, 6.0, 8.5, 13.5, 206.0, 29.3),
        ("UPN 120", 120.0, 55.0, 7.0, 9.0, 17.0, 364.0, 43.2),
        ("UPN 140", 140.0, 60.0, 7.0, 10.0, 20.4, 605.0, 62.7),
        ("UPN 160", 160.0, 65.0, 7.5, 10.5, 24.0, 925.0, 85.3),
        ("UPN 180", 180.0, 70.0, 8.0, 11.0, 28.0, 1350.0, 114.0),
        ("UPN 200", 200.0, 75.0, 8.5, 11.5, 32.2, 1910.0, 148.0),
        ("UPN 220", 220.0, 80.0, 9.0, 12.5, 37.4, 2690.0, 197.0),
        ("UPN 240", 240.0, 85.0, 9.5, 13.0, 42.3, 3600.0, 248.0),
        ("UPN 260", 260.0, 90.0, 10.0, 14.0, 48.3, 4820.0, 317.0),
        ("UPN 280", 280.0, 95.0, 10.0, 15.0, 53.3, 6280.0, 399.0),
        ("UPN 300", 300.0, 100.0, 10.0, 16.0, 58.8, 8030.0, 495.0),
    ];

    /// EN 10056-1 equal angles. Columns: leg, t, root radius, A, Iy.
    /// `Iy` here is about the axis parallel to a leg, through the centroid.
    const ANGLES: &[(&str, f64, f64, f64, f64, f64)] = &[
        ("L 30x30x3", 30.0, 3.0, 5.0, 1.74, 1.40),
        ("L 40x40x4", 40.0, 4.0, 6.0, 3.08, 4.47),
        ("L 50x50x5", 50.0, 5.0, 7.0, 4.80, 11.0),
        ("L 60x60x6", 60.0, 6.0, 8.0, 6.91, 22.8),
        ("L 70x70x7", 70.0, 7.0, 9.0, 9.40, 42.4),
        ("L 80x80x8", 80.0, 8.0, 10.0, 12.3, 72.2),
        ("L 90x90x9", 90.0, 9.0, 11.0, 15.5, 116.0),
        ("L 100x100x10", 100.0, 10.0, 12.0, 19.2, 177.0),
        ("L 120x120x12", 120.0, 12.0, 13.0, 27.5, 368.0),
        ("L 150x150x15", 150.0, 15.0, 16.0, 43.0, 898.0),
    ];

    #[test]
    fn every_ipn_reproduces_its_published_properties() {
        for &(name, h, b, tw, tf, a, iy, iz) in IPN {
            let g = ipn_section(h, b, tw, tf, 8, src()).expect(name);
            check(name, props(&g), (a, iy, iz));
        }
    }

    #[test]
    fn every_upn_reproduces_its_published_properties() {
        for &(name, h, b, tw, tf, a, iy, iz) in UPN {
            let g = upn_section(h, b, tw, tf, 8, src()).expect(name);
            check(name, props(&g), (a, iy, iz));
        }
    }

    #[test]
    fn every_equal_angle_reproduces_its_published_area_and_inertia() {
        for &(name, leg, t, r1, a, iy) in ANGLES {
            let g = angle_section_filleted(leg, leg, t, r1, r1 / 2.0, 8, src()).expect(name);
            let (ga, giy, giz) = props(&g);
            check(name, (ga, giy, giz), (a, iy, iy)); // equal legs: Iy == Iz
        }
    }

    #[test]
    fn a_doubly_symmetric_ipn_has_no_product_of_inertia() {
        // The mirror construction is what guarantees this; an outline assembled
        // from four independently-built quadrants would leave a small spurious
        // Iyz that tilts every neutral axis.
        let g = ipn_section(300.0, 125.0, 10.8, 16.2, 8, src()).unwrap();
        let p = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .unwrap();
        assert!(p.iyz.abs() < 1e-9 * p.iy, "Iyz = {} is not zero", p.iyz);
    }

    #[test]
    fn a_channel_is_asymmetric_about_the_web_but_symmetric_about_mid_height() {
        let g = upn_section(200.0, 75.0, 8.5, 11.5, 8, src()).unwrap();
        let p = analyze_section(&SectionInput {
            polygons: g.polygons.clone(),
            modular_ratios: Default::default(),
        })
        .unwrap();
        // Mirror symmetry about the horizontal axis kills Iyz exactly.
        assert!(p.iyz.abs() < 1e-9 * p.iy);
        // The published centroid sits 20.1 mm from the web's outer face.
        assert!((p.yc - 20.1).abs() < 0.4, "centroid at {}", p.yc);
    }

    /// IRAM-IAS U 500-509-4 American channels: slope 1:6, roller radius
    /// constant per rolling depth, tf quoted at mid-overhang.
    /// Columns: d, bf, tf, tw, r, A, Ix, Iy, centroid from the web face.
    const CHANNELS: &[(&str, f64, f64, f64, f64, f64, f64, f64, f64, f64)] = &[
        ("C15x50", 381.0, 94.4, 16.5, 18.2, 20.00, 94.8, 16816.0, 458.0, 20.3),
        ("C12x30", 305.0, 80.5, 12.7, 13.0, 15.80, 56.9,  6743.0, 214.0, 17.1),
        ("C10x20", 254.0, 69.6, 11.1,  9.6, 14.40, 37.9,  3284.0, 117.0, 15.4),
        ("C8x11,5", 203.0, 57.4, 9.91, 5.6, 13.59, 21.8,  1357.0,  55.0, 14.5),
    ];

    #[test]
    fn american_channels_reproduce_their_published_properties() {
        for &(name, d, bf, tf, tw, r, a, ix, iy, _e) in CHANNELS {
            let g = tapered_channel(d, bf, tw, tf, 1.0 / 6.0, r, r / 2.0,
                                    tw + (bf - tw) / 2.0, 8, src()).expect(name);
            let (ga, gix, giy) = props(&g);
            // Looser than the DIN families on purpose: the American tables give
            // nominal dimensions, so a few percent is the source's own spread.
            for (label, got, want) in [("A", ga, a), ("Ix", gix, ix), ("Iy", giy, iy)] {
                let err = (got / want - 1.0) * 100.0;
                assert!(err.abs() < 7.0, "{name} {label}: {got:.4} vs {want:.4} ({err:+.2} %)");
            }
        }
    }

    #[test]
    fn a_channel_with_no_taper_is_the_sharp_channel() {
        let flat = tapered_channel(200.0, 75.0, 8.5, 11.5, 0.0, 0.0, 0.0, 37.5, 8, src()).unwrap();
        let legacy = channel_section(200.0, 75.0, 8.5, 11.5).unwrap();
        assert!((props(&flat).0 - props(&legacy).0).abs() < 1e-9);
    }

    #[test]
    fn a_steeper_flange_taper_moves_material_towards_the_web() {
        // The centroid of a channel sits between the web and the flange tips;
        // steepening the taper thickens the flange at the web and thins it at
        // the tip, so the centroid must move TOWARDS the web. Getting the sign
        // of the slope wrong is otherwise easy and quiet — it was, once.
        let near = |slope: f64| {
            let g = tapered_channel(200.0, 75.0, 8.5, 11.5, slope, 11.5, 5.75, 37.5, 8, src()).unwrap();
            analyze_section(&SectionInput { polygons: g.polygons.clone(), modular_ratios: Default::default() })
                .unwrap().yc
        };
        assert!(near(0.16) < near(0.0), "{} !< {}", near(0.16), near(0.0));
    }

    #[test]
    fn a_zero_radius_tee_is_the_sharp_outline() {
        let sharp = tee_section_filleted(100.0, 80.0, 6.0, 8.0, 0.0, 0.0, 8, src()).unwrap();
        let legacy = tee_section(100.0, 80.0, 6.0, 8.0).unwrap();
        assert!((props(&sharp).0 - props(&legacy).0).abs() < 1e-9);
    }

    #[test]
    fn tee_fillets_add_at_the_junction_and_remove_at_the_tips() {
        let base = props(&tee_section_filleted(100.0, 80.0, 6.0, 8.0, 0.0, 0.0, 8, src()).unwrap()).0;
        let rooted = props(&tee_section_filleted(100.0, 80.0, 6.0, 8.0, 6.0, 0.0, 8, src()).unwrap()).0;
        let toed = props(&tee_section_filleted(100.0, 80.0, 6.0, 8.0, 0.0, 4.0, 8, src()).unwrap()).0;
        assert!(rooted > base, "root fillets must add material: {rooted} vs {base}");
        assert!(toed < base, "toe rounding must remove material: {toed} vs {base}");
    }

    #[test]
    fn a_zero_radius_angle_is_the_sharp_outline() {
        let sharp = angle_section_filleted(100.0, 100.0, 10.0, 0.0, 0.0, 8, src()).unwrap();
        let legacy = angle_section(100.0, 100.0, 10.0).unwrap();
        let (a1, _, _) = props(&sharp);
        let (a2, _, _) = props(&legacy);
        assert!((a1 - a2).abs() < 1e-9, "{a1} vs {a2}");
    }

    /// IRAM-IAS structural tubes: R = 2t, verified against the published table.
    /// Columns: b, h, t, A, Iy, Iz.
    const TUBES: &[(&str, f64, f64, f64, f64, f64, f64)] = &[
        ("SHS 40x40x2",    40.0,  40.0, 2.0,  2.937,    6.935,    6.935),
        ("SHS 100x100x4", 100.0, 100.0, 4.0, 14.950,  226.200,  226.200),
        ("SHS 150x150x8", 150.0, 150.0, 8.0, 43.790, 1441.910, 1441.910),
        ("RHS 30x20x1.25", 20.0,  30.0, 1.25, 1.147,    1.378,    0.733),
        ("RHS 80x40x4",    40.0,  80.0, 4.0,  8.548,   64.753,   21.441),
        ("RHS 120x60x4",   60.0, 120.0, 4.0, 13.348,  240.557,   81.151),
    ];

    #[test]
    fn structural_tubes_reproduce_their_published_properties() {
        for &(name, b, h, t, a, iy, iz) in TUBES {
            let g = rectangular_hollow_rounded(b, h, t, 2.0 * t, 8, src()).expect(name);
            let (ga, giy, giz) = props(&g);
            // Tube tables carry more precision than the rolled-profile ones,
            // so this is tighter than TOL.
            for (label, got, want) in [("A", ga, a), ("Iy", giy, iy), ("Iz", giz, iz)] {
                let err = (got / want - 1.0) * 100.0;
                assert!(err.abs() < 1.5, "{name} {label}: {got:.4} vs {want:.4} ({err:+.2} %)");
            }
        }
    }

    #[test]
    fn a_zero_radius_tube_is_the_sharp_box() {
        let sharp = rectangular_hollow_rounded(100.0, 60.0, 4.0, 0.0, 8, src()).unwrap();
        let legacy = rectangular_hollow(100.0, 60.0, 4.0).unwrap();
        assert!((props(&sharp).0 - props(&legacy).0).abs() < 1e-9);
    }

    #[test]
    fn rounded_corners_remove_material_rather_than_add_it() {
        // The rounding is real: a rolled tube is lighter than the sharp box of
        // the same outside dimensions, and getting the sign wrong here would
        // quietly inflate every tube in the catalogue.
        let sharp = props(&rectangular_hollow_rounded(80.0, 80.0, 3.0, 0.0, 8, src()).unwrap());
        let round = props(&rectangular_hollow_rounded(80.0, 80.0, 3.0, 6.0, 8, src()).unwrap());
        assert!(round.0 < sharp.0, "{} !< {}", round.0, sharp.0);
        assert!(round.1 < sharp.1);
    }

    #[test]
    fn a_taper_that_would_close_the_web_is_refused() {
        // A flange thick enough that the taper eats the whole half-height must
        // be an error, not a self-intersecting outline.
        assert!(ipn_section(40.0, 400.0, 4.0, 19.0, 8, src()).is_err());
    }
}
