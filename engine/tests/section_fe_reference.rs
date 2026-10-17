//! Mesh-based section constants against exact solutions and an independent
//! finite-element reference.
//!
//! J (Saint-Venant), Cw (warping, about the shear centre), the shear centre,
//! the shear areas and the plastic moduli are checked through the production
//! wasm exports (`analyze_section_torsion`, `_shear`, `_plastic`), i.e. with
//! the mesh the app actually uses.
//!
//! References:
//! * exact: square `J = 0.140577 a^4` (Saint-Venant series, evaluated here),
//!   rectangle series, equilateral triangle `J = sqrt(3) a^4 / 80`,
//!   rectangle `kappa = 5/6` (nu = 0, Jourawski).
//! * independent FE: `sectionproperties` 3.x (quadratic 6-node triangles,
//!   mesh A/4000, nu = 0), run on the SAME vertex lists by
//!   `verify/sections/sp_reference.py`. Its shear functions at nu = 0 are the
//!   same physical problem the engine solves, so shear centre and shear areas
//!   must agree to discretisation; Cw and J are the standard definitions.
//!
//! The P1 Prandtl solve is a strict LOWER bound on J, so J is required to sit
//! below the reference (never above, which would be unconservative) and within
//! a stated band of it.

use dedaliano_engine::section::catalogue as cat;
use dedaliano_engine::{analyze_section_plastic, analyze_section_shear, analyze_section_torsion};
use serde_json::Value;

fn src() -> cat::GeometrySource {
    cat::GeometrySource::Parametric { shape: "test".into() }
}

struct Fe {
    j: f64,
    cw: Option<f64>,
    sc: [f64; 2],
    kappa_y: f64,
    kappa_z: f64,
    zy: f64,
    zz: f64,
}

fn fe(g: &cat::CanonicalGeometry) -> Fe {
    let req = format!("{{\"geometry\":{}}}", serde_json::to_string(g).unwrap());
    let t: Value = serde_json::from_str(&analyze_section_torsion(&req).unwrap()).unwrap();
    let s: Value = serde_json::from_str(&analyze_section_shear(&req).unwrap()).unwrap();
    let p: Value = serde_json::from_str(&analyze_section_plastic(&req).unwrap()).unwrap();
    let props = dedaliano_engine::section::analyze_section(&dedaliano_engine::section::SectionInput {
        polygons: g.polygons.clone(), modular_ratios: Default::default(),
    }).unwrap();
    Fe {
        j: t["j"].as_f64().unwrap(),
        cw: p["cw"].as_f64(),
        // Back to absolute coordinates, as the reference reports them.
        sc: [s["shearCentre"][0].as_f64().unwrap() + props.yc, s["shearCentre"][1].as_f64().unwrap() + props.zc],
        kappa_y: s["vy"]["kappa"].as_f64().unwrap(),
        kappa_z: s["vz"]["kappa"].as_f64().unwrap(),
        zy: p["zy"].as_f64().unwrap(),
        zz: p["zz"].as_f64().unwrap(),
    }
}

/// sectionproperties reference (mm). as_y/as_z are the shear areas for forces
/// along y and z; sc is absolute.
struct Ref {
    name: &'static str,
    area: f64,
    j: f64,
    j_band: f64,
    cw: Option<f64>,
    sc: [f64; 2],
    as_y: f64,
    as_z: f64,
    zy: f64,
    zz: f64,
}

fn cases() -> Vec<(cat::CanonicalGeometry, Ref)> {
    vec![
        (cat::rectangle(100.0, 20.0).unwrap(), Ref { name: "rect 100x20", area: 2000.0, j: 233053.53, j_band: 0.01,
            cw: Some(46924087.5), sc: [0.0, 0.0], as_y: 1666.667, as_z: 1666.667, zy: 10000.0, zz: 50000.0 }),
        (cat::circular_hollow(219.1, 6.35, 24).unwrap(), Ref { name: "CHS 219.1x6.35", area: 4241.144, j: 47995602.3, j_band: 0.01,
            cw: None, sc: [0.0, 0.0], as_y: 2123.538, as_z: 2123.538, zy: 287194.84, zz: 287194.84 }),
        (cat::i_section(300.0, 150.0, 7.1, 10.7, 15.0, 24, src()).unwrap(), Ref { name: "IPE 300 outline", area: 5381.706, j: 197638.72, j_band: 0.035,
            cw: Some(124253818564.4), sc: [0.0, 0.0], as_y: 2938.779, as_z: 2075.750, zy: 628423.42, zz: 125223.38 }),
        (cat::i_section(200.0, 200.0, 9.0, 15.0, 18.0, 24, src()).unwrap(), Ref { name: "HEB 200 outline", area: 7808.851, j: 596176.88, j_band: 0.035,
            cw: Some(167057201950.1), sc: [0.0, 0.0], as_y: 5388.390, as_z: 1738.921, zy: 642604.31, zz: 305820.31 }),
        (cat::channel_section(200.0, 75.0, 8.5, 11.5).unwrap(), Ref { name: "channel 200x75x8.5x11.5", area: 3229.5, j: 107617.33, j_band: 0.035,
            cw: Some(10681281241.3), sc: [-21.96983, 0.0], as_y: 873.224, as_z: 1473.240, zy: 229155.375, zz: 58044.537 }),
        (cat::angle_section(100.0, 100.0, 10.0).unwrap(), Ref { name: "angle 100x100x10", area: 1900.0, j: 61969.54, j_band: 0.025,
            cw: Some(46719835.2), sc: [5.29726, 5.29725], as_y: 827.811, as_z: 827.812, zy: 45475.0, zz: 45475.0 }),
        (cat::tee_section(200.0, 150.0, 8.0, 12.0).unwrap(), Ref { name: "tee 200x150x8x12", area: 3304.0, j: 116157.44, j_band: 0.035,
            cw: Some(142554641.6), sc: [0.0, 93.62085], as_y: 1523.204, as_z: 1309.881, zy: 152029.97, zz: 70508.0 }),
        (cat::rectangular_hollow_rounded(100.0, 200.0, 8.0, 16.0, 24, src()).unwrap(), Ref { name: "RHS 200x100x8 R16", area: 4378.755, j: 18124760.1, j_band: 0.02,
            cw: None, sc: [0.0, 0.0], as_y: 999.216, as_z: 2839.729, zy: 272748.99, zz: 167411.23 }),
        (cat::upn_section(200.0, 75.0, 8.5, 11.5, 24, src()).unwrap(), Ref { name: "UPN 200 outline", area: 3219.629, j: 120209.22, j_band: 0.035,
            cw: Some(8991123598.5), sc: [-18.63356, 0.0], as_y: 935.195, as_z: 1554.443, zy: 227857.94, zz: 51956.15 }),
        (cat::i_section(400.0, 200.0, 2.0, 4.0, 0.0, 8, src()).unwrap(), Ref { name: "thin I 400x200x2x4", area: 2384.0, j: 9504.978, j_band: 0.04,
            cw: Some(209084295892.0), sc: [0.0, 0.0], as_y: 1335.630, as_z: 768.956, zy: 393632.0, zz: 80392.0 }),
        (cat::channel_section(400.0, 100.0, 2.0, 2.0).unwrap(), Ref { name: "thin channel 400x100x2", area: 1192.0, j: 1588.555, j_band: 0.05,
            cw: Some(28231752625.0), sc: [-28.63315, 0.0], as_y: 168.877, as_z: 730.297, zy: 158008.0, zz: 19903.96 }),
    ]
}

#[test]
fn mesh_constants_agree_with_an_independent_quadratic_fe_solution() {
    for (g, r) in cases() {
        let got = fe(&g);
        let n = r.name;
        // J: lower bound, within the band.
        assert!(got.j <= r.j * 1.001, "{n}: J {} above the reference {} — the P1 solve must be a lower bound", got.j, r.j);
        assert!(got.j >= r.j * (1.0 - r.j_band), "{n}: J {} more than {}% below {}", got.j, r.j_band * 100.0, r.j);
        // Cw about the shear centre; closed sections report none.
        match (got.cw, r.cw) {
            (Some(c), Some(w)) => assert!((c / w - 1.0).abs() < 0.01, "{n}: Cw {c:e} vs {w:e}"),
            (None, None) => {}
            (c, w) => panic!("{n}: Cw presence differs: {c:?} vs {w:?}"),
        }
        let size = (r.area).sqrt();
        for k in 0..2 {
            assert!((got.sc[k] - r.sc[k]).abs() < 0.005 * size, "{n}: shear centre {:?} vs {:?}", got.sc, r.sc);
        }
        assert!((got.kappa_y * r.area / r.as_y - 1.0).abs() < 0.015, "{n}: As,y {} vs {}", got.kappa_y * r.area, r.as_y);
        assert!((got.kappa_z * r.area / r.as_z - 1.0).abs() < 0.015, "{n}: As,z {} vs {}", got.kappa_z * r.area, r.as_z);
        // Plastic moduli: polygonal sections are integrated exactly.
        assert!((got.zy / r.zy - 1.0).abs() < 1e-6 && (got.zz / r.zz - 1.0).abs() < 1e-6, "{n}: Z {} {} vs {} {}", got.zy, got.zz, r.zy, r.zz);
    }
}

/// Saint-Venant's series for a b x t rectangle (b >= t):
/// J = b t^3 / 3 * (1 - 192 t / (pi^5 b) * sum_{n odd} tanh(n pi b / 2t) / n^5).
fn rect_j(b: f64, t: f64) -> f64 {
    let (b, t) = if b >= t { (b, t) } else { (t, b) };
    let pi = std::f64::consts::PI;
    let s: f64 = (0..200).map(|k| {
        let n = (2 * k + 1) as f64;
        (n * pi * b / (2.0 * t)).tanh() / n.powi(5)
    }).sum();
    b * t.powi(3) / 3.0 * (1.0 - 192.0 * t / (pi.powi(5) * b) * s)
}

#[test]
fn torsion_matches_exact_solutions_from_below() {
    // The series reproduces the classical square coefficient 0.1406.
    assert!((rect_j(1.0, 1.0) - 0.140577).abs() < 1e-6);
    // Band: measured error of the production mesh, a lower bound throughout;
    // it grows with slenderness (2.2 % at 30:1) as the A/2000 count spreads
    // along the plate rather than across it.
    for (b, t, band) in [(50.0, 50.0, 0.005), (100.0, 20.0, 0.008), (300.0, 10.0, 0.03), (37.0, 23.0, 0.005)] {
        let j = fe(&cat::rectangle(b, t).unwrap()).j;
        let exact = rect_j(b, t);
        assert!(j <= exact && j > exact * (1.0 - band), "rect {b}x{t}: J {j} vs exact {exact}");
    }
    let a = 100.0;
    let tri = cat::custom(vec![[0.0, 0.0], [a, 0.0], [a / 2.0, a * 3f64.sqrt() / 2.0]], vec![]).unwrap();
    let j = fe(&tri).j;
    let exact = 3f64.sqrt() * a.powi(4) / 80.0;
    assert!(j <= exact && j > exact * 0.995, "triangle: J {j} vs exact {exact}");
}

#[test]
fn a_rectangle_has_the_shear_area_five_sixths() {
    let f = fe(&cat::rectangle(60.0, 100.0).unwrap());
    assert!((f.kappa_z - 5.0 / 6.0).abs() < 0.01 && (f.kappa_y - 5.0 / 6.0).abs() < 0.01, "{} {}", f.kappa_y, f.kappa_z);
}
