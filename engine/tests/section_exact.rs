//! Section properties against exact closed forms, at random rational dimensions.
//!
//! Every sharp-cornered parametric family (rectangle, I/H, channel, angle, tee,
//! rectangular hollow) is an exact union of disjoint axis-aligned rectangles.
//! For such a union the area, centroid, second moments, product of inertia,
//! extreme-fibre distances and plastic moduli all have closed forms that are
//! evaluated here in EXACT rational arithmetic (`BigRational`), independently
//! of the polygon (Green's theorem) routine in `section::analyze_section` and
//! of the clipped-mesh routine in `section::plastic`. The closed forms are
//! derived symbolically in `verify/sections/derive_closed_forms.py`.
//!
//! The f64 dimensions handed to the builders are converted to rationals with
//! `BigRational::from_float`, which is exact (an f64 IS a dyadic rational), so
//! the reference is the exact property of the very section the engine was
//! given, and the only admissible disagreement is floating-point rounding.
//!
//! General polygons (random star-shaped outlines with holes) are checked
//! against an exact triangle-fan integration — a different decomposition from
//! the engine's edge formula — and regular n-gons (the polygonised circles the
//! builders emit) against the exact n-gon formulas.

use dedaliano_engine::section::catalogue as cat;
use dedaliano_engine::section::mesh::{mesh_section, MeshParams};
use dedaliano_engine::section::plastic::solve_plastic;
use dedaliano_engine::section::{analyze_section, SectionInput, SectionPolygon, SectionProperties};
use num_rational::BigRational;
use num_traits::{FromPrimitive, One, Signed, ToPrimitive, Zero};

type Q = BigRational;

fn q(v: f64) -> Q {
    Q::from_float(v).expect("finite")
}
fn qi(n: i64) -> Q {
    Q::from_i64(n).expect("every i64 is exactly representable as a rational")
}
fn f(v: &Q) -> f64 {
    v.to_f64().unwrap()
}

/// Deterministic generator so failures reproduce. Rationals p/d with small
/// denominators (not only dyadic), i.e. genuinely "random rational" dimensions.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    /// A rational in [lo, hi], as f64 (the builders take f64).
    fn dim(&mut self, lo: f64, hi: f64) -> f64 {
        let den = [1u64, 2, 3, 4, 5, 7, 8, 9, 16, 25][(self.next() % 10) as usize] as f64;
        let span = ((hi - lo) * den).floor().max(1.0) as u64;
        lo + (self.next() % span) as f64 / den
    }
}

/// Exact rectangle `[y0, y1] x [z0, z1]`.
#[derive(Clone)]
struct R {
    y0: Q,
    y1: Q,
    z0: Q,
    z1: Q,
}
fn r(y0: f64, y1: f64, z0: f64, z1: f64) -> R {
    R { y0: q(y0), y1: q(y1), z0: q(z0), z1: q(z1) }
}

/// Exact properties of a union of disjoint rectangles.
struct Exact {
    a: Q,
    yc: Q,
    zc: Q,
    iy: Q,
    iz: Q,
    iyz: Q,
    zy: Q,
    zz: Q,
    zmax: Q,
    zmin: Q,
    ymax: Q,
    ymin: Q,
}

/// `integral |s - c| dA` over a rectangle extruded along the other axis with
/// width `w`, the rectangle spanning `[s0, s1]` in the coordinate of interest.
fn abs_moment(s0: &Q, s1: &Q, w: &Q, c: &Q) -> Q {
    let half = qi(1) / qi(2);
    if c <= s0 {
        w * (((s1 - c) * (s1 - c)) - ((s0 - c) * (s0 - c))) * &half
    } else if c >= s1 {
        w * (((c - s0) * (c - s0)) - ((c - s1) * (c - s1))) * &half
    } else {
        w * (((c - s0) * (c - s0)) + ((s1 - c) * (s1 - c))) * &half
    }
}

/// Plastic neutral axis: the `c` at which the area with coordinate below `c`
/// is half the total. The cumulative area is piecewise linear in `c`, with
/// breakpoints at rectangle edges, so it is located exactly.
fn pna(spans: &[(Q, Q, Q)], total: &Q) -> Q {
    let half = total / qi(2);
    let mut cuts: Vec<Q> = spans.iter().flat_map(|(a, b, _)| [a.clone(), b.clone()]).collect();
    cuts.sort();
    cuts.dedup();
    let below = |c: &Q| -> Q {
        spans.iter().fold(Q::zero(), |acc, (a, b, w)| {
            if c <= a {
                acc
            } else if c >= b {
                acc + (b - a) * w
            } else {
                acc + (c - a) * w
            }
        })
    };
    for win in cuts.windows(2) {
        let (lo, hi) = (&win[0], &win[1]);
        let (al, ah) = (below(lo), below(hi));
        if al <= half && half <= ah {
            if ah == al {
                return lo.clone();
            }
            return lo + (hi - lo) * (&half - &al) / (ah - al);
        }
    }
    unreachable!("PNA must lie within the section")
}

fn exact(rects: &[R]) -> Exact {
    let mut a = Q::zero();
    let mut sy = Q::zero();
    let mut sz = Q::zero();
    let mut iyy0 = Q::zero(); // integral z^2 about the origin
    let mut izz0 = Q::zero(); // integral y^2
    let mut iyz0 = Q::zero(); // integral y z
    for rc in rects {
        let w = &rc.y1 - &rc.y0;
        let h = &rc.z1 - &rc.z0;
        let ar = &w * &h;
        let cy = (&rc.y0 + &rc.y1) / qi(2);
        let cz = (&rc.z0 + &rc.z1) / qi(2);
        sy += &ar * &cy;
        sz += &ar * &cz;
        iyy0 += &w * (&rc.z1 * &rc.z1 * &rc.z1 - &rc.z0 * &rc.z0 * &rc.z0) / qi(3);
        izz0 += &h * (&rc.y1 * &rc.y1 * &rc.y1 - &rc.y0 * &rc.y0 * &rc.y0) / qi(3);
        iyz0 += &ar * &cy * &cz;
        a += ar;
    }
    let yc = &sy / &a;
    let zc = &sz / &a;
    let iy = &iyy0 - &a * &zc * &zc;
    let iz = &izz0 - &a * &yc * &yc;
    let iyz = &iyz0 - &a * &yc * &zc;

    let zspans: Vec<(Q, Q, Q)> = rects.iter().map(|r| (r.z0.clone(), r.z1.clone(), &r.y1 - &r.y0)).collect();
    let yspans: Vec<(Q, Q, Q)> = rects.iter().map(|r| (r.y0.clone(), r.y1.clone(), &r.z1 - &r.z0)).collect();
    let pz = pna(&zspans, &a);
    let py = pna(&yspans, &a);
    let zy = zspans.iter().fold(Q::zero(), |s, (a0, a1, w)| s + abs_moment(a0, a1, w, &pz));
    let zz = yspans.iter().fold(Q::zero(), |s, (a0, a1, w)| s + abs_moment(a0, a1, w, &py));

    let zmax = rects.iter().map(|r| r.z1.clone()).max().unwrap();
    let zmin = rects.iter().map(|r| r.z0.clone()).min().unwrap();
    let ymax = rects.iter().map(|r| r.y1.clone()).max().unwrap();
    let ymin = rects.iter().map(|r| r.y0.clone()).min().unwrap();
    Exact { a, yc, zc, iy, iz, iyz, zy, zz, zmax, zmin, ymax, ymin }
}

fn props(g: &cat::CanonicalGeometry) -> SectionProperties {
    analyze_section(&SectionInput { polygons: g.polygons.clone(), modular_ratios: Default::default() }).unwrap()
}

fn rel(got: f64, exp: &Q, scale: &Q) -> f64 {
    let e = (q(got) - exp).abs();
    f(&(e / scale.abs()))
}

/// Tolerance for quantities computed by straight-line f64 arithmetic on a
/// handful of vertices: a few hundred ulps of headroom.
const TIGHT: f64 = 1e-12;

fn check_elastic(name: &str, g: &cat::CanonicalGeometry, ex: &Exact) {
    let p = props(g);
    let ipolar = &ex.iy + &ex.iz;
    let lref = (&ex.ymax - &ex.ymin).max(&ex.zmax - &ex.zmin);
    let checks: [(&str, f64, &Q, &Q); 6] = [
        ("A", p.a, &ex.a, &ex.a),
        ("yc", p.yc, &ex.yc, &lref),
        ("zc", p.zc, &ex.zc, &lref),
        ("Iy", p.iy, &ex.iy, &ex.iy),
        ("Iz", p.iz, &ex.iz, &ex.iz),
        // The product is checked against the polar moment: it is zero for a
        // symmetric section and must then be zero to rounding.
        ("Iyz", p.iyz, &ex.iyz, &ipolar),
    ];
    for (label, got, want, scale) in checks {
        let e = rel(got, want, scale);
        assert!(e < TIGHT, "{name} {label}: engine {got:e} vs exact {:e} (rel {e:e})", f(want));
    }

    // Principal axes: i1 >= i2, trace and determinant invariants, and theta_p
    // is the angle (anticlockwise from +Y) of the axis carrying i1: rotating
    // the tensor by it must zero the product and return i1.
    let (iy, iz, iyz) = (f(&ex.iy), f(&ex.iz), f(&ex.iyz));
    let s = iy + iz;
    assert!(((p.i1 + p.i2) - s).abs() < TIGHT * s, "{name}: trace");
    let det = f(&(&ex.iy * &ex.iz - &ex.iyz * &ex.iyz));
    assert!((p.i1 * p.i2 - det).abs() < 1e-10 * s * s, "{name}: determinant");
    assert!(p.i1 >= p.i2);
    let (c2, s2) = ((2.0 * p.theta_p).cos(), (2.0 * p.theta_p).sin());
    let i_rot = 0.5 * (iy + iz) + 0.5 * (iy - iz) * c2 - iyz * s2;
    let iyz_rot = 0.5 * (iy - iz) * s2 + iyz * c2;
    assert!((i_rot - p.i1).abs() < 1e-11 * s, "{name}: theta_p must carry i1 ({i_rot} vs {})", p.i1);
    assert!(iyz_rot.abs() < 1e-11 * s, "{name}: rotated product {iyz_rot}");

    // Elastic moduli to each extreme fibre, and radii of gyration.
    let mods: [(&str, f64, Q); 4] = [
        ("Sy_top", p.sy_top, &ex.iy / (&ex.zmax - &ex.zc)),
        ("Sy_bot", p.sy_bot, &ex.iy / (&ex.zc - &ex.zmin)),
        ("Sz_right", p.sz_right, &ex.iz / (&ex.ymax - &ex.yc)),
        ("Sz_left", p.sz_left, &ex.iz / (&ex.yc - &ex.ymin)),
    ];
    for (label, got, want) in mods {
        let e = rel(got, &want, &want);
        assert!(e < TIGHT, "{name} {label}: {got} vs {} ({e:e})", f(&want));
    }
    let ry = (iy / f(&ex.a)).sqrt();
    let rz = (iz / f(&ex.a)).sqrt();
    assert!((p.ry - ry).abs() < TIGHT * ry && (p.rz - rz).abs() < TIGHT * rz, "{name}: radii");
}

/// The mesh plastic routine clips triangles exactly against the axis, and the
/// constrained mesh tiles a polygon exactly, so for a polygonal section the
/// only error left is the 80-step bisection on the axis position, which is
/// below 1e-20 of the depth. Anything beyond rounding is a defect.
fn check_plastic(name: &str, g: &cat::CanonicalGeometry, ex: &Exact) {
    let mut mp = MeshParams::default();
    mp.max_area = f(&ex.a) / 400.0;
    let mesh = mesh_section(&g.polygons, &mp).expect("mesh");
    let z = solve_plastic(&mesh).unwrap();
    for (label, got, want) in [("Zy", z.zy, &ex.zy), ("Zz", z.zz, &ex.zz)] {
        let e = rel(got, want, want);
        assert!(e < 1e-9, "{name} {label}: mesh-clipped {got} vs exact {} ({e:e})", f(want));
    }
}

fn i_rects(h: f64, b: f64, tw: f64, tf: f64) -> Vec<R> {
    let (hh, hb, ht) = (h / 2.0, b / 2.0, tw / 2.0);
    vec![
        r(-hb, hb, -hh, -hh + tf),
        r(-ht, ht, -hh + tf, hh - tf),
        r(-hb, hb, hh - tf, hh),
    ]
}

/// Random sharp sections of every polygonal family, the generator also
/// varying which part the plastic neutral axis falls in.
fn families(seed: u64, count: usize) -> Vec<(String, cat::CanonicalGeometry, Vec<R>)> {
    let mut g = Lcg(seed);
    let mut out = Vec::new();
    for k in 0..count {
        // Rectangle.
        let (b, h) = (g.dim(1.0, 400.0), g.dim(1.0, 400.0));
        out.push((format!("rect#{k} {b}x{h}"), cat::rectangle(b, h).unwrap(),
                  vec![r(-b / 2.0, b / 2.0, -h / 2.0, h / 2.0)]));

        // I/H with sharp corners (fabricated/welded).
        let h = g.dim(50.0, 1000.0);
        let b = g.dim(20.0, 500.0);
        let tf = g.dim(1.0, (h / 2.0 - 1.0).min(60.0));
        let tw = g.dim(1.0, (b - 1.0).min(40.0));
        out.push((format!("I#{k} h{h} b{b} tw{tw} tf{tf}"),
                  cat::i_section(h, b, tw, tf, 0.0, 8, cat::GeometrySource::Parametric { shape: "i".into() }).unwrap(),
                  i_rects(h, b, tw, tf)));

        // Channel, web on the left, as built.
        let h = g.dim(40.0, 600.0);
        let b = g.dim(20.0, 200.0);
        let tf = g.dim(1.0, (h / 2.0 - 1.0).min(40.0));
        let tw = g.dim(1.0, (b - 1.0).min(40.0));
        let hh = h / 2.0;
        out.push((format!("C#{k} h{h} b{b} tw{tw} tf{tf}"), cat::channel_section(h, b, tw, tf).unwrap(), vec![
            r(0.0, b, -hh, -hh + tf), r(0.0, tw, -hh + tf, hh - tf), r(0.0, b, hh - tf, hh),
        ]));

        // Unequal angle, corner at the origin.
        let h = g.dim(10.0, 300.0);
        let b = g.dim(10.0, 300.0);
        let t = g.dim(1.0, h.min(b) - 1.0);
        out.push((format!("L#{k} {h}x{b}x{t}"), cat::angle_section(h, b, t).unwrap(), vec![
            r(0.0, b, 0.0, t), r(0.0, t, t, h),
        ]));

        // Tee, flange on top, centred on its bounding box.
        let h = g.dim(10.0, 400.0);
        let b = g.dim(10.0, 400.0);
        let tf = g.dim(1.0, h - 1.0);
        let tw = g.dim(1.0, b);
        let (hh, hb, ht) = (h / 2.0, b / 2.0, tw / 2.0);
        out.push((format!("T#{k} h{h} b{b} tw{tw} tf{tf}"), cat::tee_section(h, b, tw, tf).unwrap(), vec![
            r(-ht, ht, -hh, hh - tf), r(-hb, hb, hh - tf, hh),
        ]));

        // Rectangular hollow, sharp, as four disjoint walls.
        let b = g.dim(20.0, 500.0);
        let h = g.dim(20.0, 500.0);
        let t = g.dim(0.5, b.min(h) / 2.0 - 0.5);
        let (hb, hh) = (b / 2.0, h / 2.0);
        out.push((format!("RHS#{k} {b}x{h}x{t}"), cat::rectangular_hollow(b, h, t).unwrap(), vec![
            r(-hb, hb, -hh, -hh + t), r(-hb, hb, hh - t, hh),
            r(-hb, -hb + t, -hh + t, hh - t), r(hb - t, hb, -hh + t, hh - t),
        ]));
    }
    out
}

#[test]
fn polygon_properties_match_exact_closed_forms_at_random_rational_dimensions() {
    for (name, g, rects) in families(0x5eed_0001, 40) {
        check_elastic(&name, &g, &exact(&rects));
    }
}

#[test]
fn mesh_plastic_moduli_match_exact_closed_forms_at_random_rational_dimensions() {
    for (name, g, rects) in families(0x5eed_0002, 8) {
        check_plastic(&name, &g, &exact(&rects));
    }
}

/// Spot values of the closed forms themselves, so that a defect shared by the
/// exact routine and the engine cannot pass silently.
#[test]
fn closed_forms_reproduce_textbook_values() {
    // I 300x150x7.1x10.7 sharp: Iy = (b h^3 - (b-tw)(h-2tf)^3)/12,
    // Z = b tf (h - tf) + tw (h - 2tf)^2 / 4.
    let ex = exact(&i_rects(300.0, 150.0, 7.1, 10.7));
    let iy = (150.0 * 300f64.powi(3) - (150.0 - 7.1) * (300.0 - 21.4f64).powi(3)) / 12.0;
    let zy = 150.0 * 10.7 * (300.0 - 10.7) + 7.1 * (300.0 - 21.4f64).powi(2) / 4.0;
    let zz = 10.7 * 150.0f64.powi(2) / 2.0 + (300.0 - 21.4) * 7.1f64.powi(2) / 4.0;
    assert!((f(&ex.iy) / iy - 1.0).abs() < 1e-14);
    assert!((f(&ex.zy) / zy - 1.0).abs() < 1e-14);
    assert!((f(&ex.zz) / zz - 1.0).abs() < 1e-14);
    // Rectangle: Z = b h^2 / 4.
    let ex = exact(&[r(0.0, 3.0, 0.0, 7.0)]);
    assert_eq!(ex.zy, qi(147) / qi(4));
    // Tee with the PNA in the web: area below = half.
    let ex = exact(&[r(-0.5, 0.5, 0.0, 10.0), r(-2.0, 2.0, 10.0, 11.0)]);
    // A = 14, PNA where web length below = 7.
    let pz = pna(&[(qi(0), qi(10), qi(1)), (qi(10), qi(11), qi(4))], &ex.a);
    assert_eq!(pz, qi(7));
    // Z = 7*3.5 + 3*1.5 + 4*(3.5) = 24.5 + 4.5 + 14 = 43.
    assert_eq!(ex.zy, qi(43));
}

// ─── General polygons and regular n-gons ────────────────────────────

/// Exact properties of a polygon set (solids minus voids) by a triangle fan
/// from the origin: each signed triangle (0, p, q) contributes its own closed
/// forms. A different decomposition from the engine's edge formula.
fn fan_exact(polys: &[(Vec<[f64; 2]>, bool)]) -> (Q, Q, Q, Q, Q, Q) {
    let (mut a, mut sy, mut sz, mut iyy, mut izz, mut iyz) =
        (Q::zero(), Q::zero(), Q::zero(), Q::zero(), Q::zero(), Q::zero());
    for (verts, is_void) in polys {
        // Orientation-independent: take each polygon's signed fan and fix its
        // sign by the sign of its area.
        let (mut pa, mut psy, mut psz, mut piyy, mut pizz, mut piyz) =
            (Q::zero(), Q::zero(), Q::zero(), Q::zero(), Q::zero(), Q::zero());
        for i in 0..verts.len() {
            let (y1, z1) = (q(verts[i][0]), q(verts[i][1]));
            let j = (i + 1) % verts.len();
            let (y2, z2) = (q(verts[j][0]), q(verts[j][1]));
            // Triangle (0,0),(y1,z1),(y2,z2): signed area, first and second
            // moments from the standard triangle formulas with one vertex at
            // the origin.
            let ta = (&y1 * &z2 - &y2 * &z1) / qi(2);
            psy += &ta * (&y1 + &y2) / qi(3);
            psz += &ta * (&z1 + &z2) / qi(3);
            piyy += &ta * (&z1 * &z1 + &z1 * &z2 + &z2 * &z2) / qi(6);
            pizz += &ta * (&y1 * &y1 + &y1 * &y2 + &y2 * &y2) / qi(6);
            piyz += &ta * (qi(2) * &y1 * &z1 + &y1 * &z2 + &y2 * &z1 + qi(2) * &y2 * &z2) / qi(12);
            pa += ta;
        }
        let sgn = if pa.is_negative() { -Q::one() } else { Q::one() };
        let sgn = if *is_void { -sgn } else { sgn };
        a += &sgn * pa;
        sy += &sgn * psy;
        sz += &sgn * psz;
        iyy += &sgn * piyy;
        izz += &sgn * pizz;
        iyz += &sgn * piyz;
    }
    let yc = &sy / &a;
    let zc = &sz / &a;
    let iy = iyy - &a * &zc * &zc;
    let iz = izz - &a * &yc * &yc;
    let iyz = iyz - &a * &yc * &zc;
    (a, yc, zc, iy, iz, iyz)
}

/// A random star-shaped polygon about `centre`, vertices at rational radii.
fn star(g: &mut Lcg, centre: [f64; 2], rmin: f64, rmax: f64, n: usize, clockwise: bool) -> Vec<[f64; 2]> {
    let mut v: Vec<[f64; 2]> = (0..n)
        .map(|k| {
            let th = 2.0 * std::f64::consts::PI * (k as f64) / (n as f64);
            let rr = g.dim(rmin, rmax);
            [centre[0] + rr * th.cos(), centre[1] + rr * th.sin()]
        })
        .collect();
    if clockwise {
        v.reverse();
    }
    v
}

#[test]
fn general_polygons_with_holes_match_an_independent_exact_integration() {
    let mut g = Lcg(0x5eed_0003);
    for k in 0..30 {
        let n = 5 + (g.next() % 40) as usize;
        let c = [g.dim(-50.0, 50.0), g.dim(-50.0, 50.0)];
        let outer = star(&mut g, c, 60.0, 120.0, n, k % 2 == 1);
        // A hole strictly inside the outer's inscribed radius (>= 60).
        let nh = 3 + (g.next() % 12) as usize;
        let hole = star(&mut g, [c[0] + 5.0, c[1] - 3.0], 10.0, 40.0, nh, k % 3 == 0);
        let sp = |v: &Vec<[f64; 2]>, is_void| SectionPolygon { vertices: v.clone(), material_id: 0, is_void };
        let p = analyze_section(&SectionInput {
            polygons: vec![sp(&outer, false), sp(&hole, true)],
            modular_ratios: Default::default(),
        })
        .unwrap();
        let (a, yc, zc, iy, iz, iyz) = fan_exact(&[(outer.clone(), false), (hole.clone(), true)]);
        let lref = qi(240);
        let ip = &iy + &iz;
        for (label, got, want, scale) in [
            ("A", p.a, &a, &a), ("yc", p.yc, &yc, &lref), ("zc", p.zc, &zc, &lref),
            ("Iy", p.iy, &iy, &iy), ("Iz", p.iz, &iz, &iz), ("Iyz", p.iyz, &iyz, &ip),
        ] {
            let e = rel(got, want, scale);
            assert!(e < 1e-11, "polygon#{k} {label}: engine {got} vs exact {} ({e:e})", f(want));
        }
    }
}

/// The builders polygonise circles as regular n-gons. The n-gon has exact
/// closed forms (derived in derive_closed_forms.py):
///   A  = n R^2 sin(2 pi/n) / 2
///   I  = n R^4 sin(2 pi/n) (2 + cos(2 pi/n)) / 24   about any centroidal axis
/// so the engine must reproduce them to rounding, and the remaining gap to the
/// disc is pure discretisation, bounded and conservative (inscribed).
#[test]
fn polygonised_circles_match_the_exact_regular_polygon() {
    for &(d, segs) in &[(0.3, 24usize), (48.3, 8), (1000.0, 64)] {
        let g = cat::solid_circle(d, segs).unwrap();
        let p = props(&g);
        let n = (segs * 4) as f64;
        let rr = d / 2.0;
        let t = 2.0 * std::f64::consts::PI / n;
        let a = n * rr * rr * t.sin() / 2.0;
        let i = n * rr.powi(4) * t.sin() * (2.0 + t.cos()) / 24.0;
        assert!((p.a / a - 1.0).abs() < 1e-12, "A {} vs {a}", p.a);
        assert!((p.iy / i - 1.0).abs() < 1e-12 && (p.iz / i - 1.0).abs() < 1e-12, "I {} {} vs {i}", p.iy, p.iz);
        assert!(p.iyz.abs() < 1e-12 * i);
        // Inscribed: never more than the disc.
        assert!(p.a < std::f64::consts::PI * rr * rr);
        assert!(p.iy < std::f64::consts::PI * rr.powi(4) / 4.0);
    }
    // And the annulus: outer n-gon minus inner n-gon.
    let (d, t, segs) = (219.1, 6.35, 24usize);
    let p = props(&cat::circular_hollow(d, t, segs).unwrap());
    let n = (segs * 4) as f64;
    let th = 2.0 * std::f64::consts::PI / n;
    let (ro, ri) = (d / 2.0, d / 2.0 - t);
    let a = n * th.sin() / 2.0 * (ro * ro - ri * ri);
    let i = n * th.sin() * (2.0 + th.cos()) / 24.0 * (ro.powi(4) - ri.powi(4));
    assert!((p.a / a - 1.0).abs() < 1e-12 && (p.iy / i - 1.0).abs() < 1e-12);
}

// ─── Reinforced-concrete section integration ────────────────────────

/// `rc_section_kernel` against a hand calculation (ACI 318 / CIRSOC 201
/// equivalent rectangular block, strain compatibility), 300 x 500 mm, four
/// 3 cm² bars at 50 mm cover to their centres, c = 150 mm, compression on top:
///   a = beta1 c = 127.5 mm;   C = 0.85 f'c b a = 812.8125 kN at y = 186.25 mm
///   top bars:    eps = 0.003 (200-100)/150 = 0.002 -> 400 MPa, less the
///                displaced concrete 0.85 f'c -> 113.625 kN each
///   bottom bars: eps = -0.006 -> -420 MPa (yield) -> -126 kN each
///   Pn = 812.8125 + 2(113.625) - 2(126) = 788.0625 kN
///   Mx = -(812.8125)(0.18625) - 2(113.625)(0.20) - 2(-126)(-0.20) = -247.236328125 kNm
/// (the kernel's sign: Mx = -sum F y), My = 0 by symmetry, eps_t = 0.006.
#[test]
fn rc_section_kernel_matches_a_hand_strain_compatibility_calculation() {
    use dedaliano_engine::rc_section_kernel::section_from_buffers;
    // [f'c, fy, Es (Pa), edition, ties, deduct]
    let params = [25e6, 420e6, 200e9, 2025.0, 0.0, 1.0];
    let ring = [-0.15, -0.25, 0.15, -0.25, 0.15, 0.25, -0.15, 0.25];
    let bars = [-0.10, -0.20, 3e-4, 0.10, -0.20, 3e-4, -0.10, 0.20, 3e-4, 0.10, 0.20, 3e-4];
    let k = section_from_buffers(&ring, &[0, 4], &[], &bars, &params).unwrap_or_else(|_| panic!("valid section"));
    let p = k.point(0.0, 1.0, 0.15);
    // kN, kN·m in the hand calculation; the engine is SI.
    let got = [p.s.pn / 1e3, p.s.mnx / 1e3, p.s.mny / 1e3, p.s.eps_t, p.c];
    let want = [788.0625, -247.236328125, 0.0, 0.006, 0.15];
    for (i, (g, w)) in got.iter().zip(want).enumerate() {
        assert!((g - w).abs() < 1e-9 * (1.0 + w.abs()), "component {i}: {g} vs {w}");
    }
    // Same section, wound clockwise and turned 90 degrees (compression on +x):
    // the engine must give the same axial force.
    let turned: Vec<f64> = [0.25, -0.15, 0.25, 0.15, -0.25, 0.15, -0.25, -0.15].to_vec();
    let tb = [0.20, -0.10, 3e-4, 0.20, 0.10, 3e-4, -0.20, -0.10, 3e-4, -0.20, 0.10, 3e-4];
    let k2 = section_from_buffers(&turned, &[0, 4], &[], &tb, &params).unwrap_or_else(|_| panic!("valid section"));
    let o2 = k2.point(1.0, 0.0, 0.15);
    assert!((o2.s.pn / 1e3 - 788.0625).abs() < 1e-9 && (o2.s.mny / 1e3 - 247.236328125).abs() < 1e-9, "{o2:?}");
}
