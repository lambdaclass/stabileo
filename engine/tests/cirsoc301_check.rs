//! CIRSOC 301-2018 steel checks (`postprocess::cirsoc301_check`) against INTI-CIRSOC's
//! published worked examples, clauses worked by hand, and the certified (interval)
//! evaluation of the same formulas.
//!
//! Source of the examples: G. Troglia, D. Troglia, J. Angulo Bocco, *Ejemplos de
//! Aplicación del Reglamento CIRSOC 301-2018*, INTI-CIRSOC, July 2018. Printed values are
//! compared at their printed rounding (0.5 % relative unless stated). The app's TypeScript
//! suite pins the same numbers through the WASM adapter.

use dedaliano_engine::certify::design::{
    certify_cirsoc301_members, cirsoc301_ratio_enclosures, BoundedCirsoc301Demand, CertifiedCirsoc301CheckInput,
    DemandBound,
};
use dedaliano_engine::postprocess::cirsoc301_check::*;
use serde_json::{json, Value};

fn member(extra: Value) -> Cirsoc301MemberData {
    let mut base = json!({
        "Fy": 235.0, "Fu": 370.0, "E": 200000.0,
        "A": 0.0, "Iz": 0.0, "Iy": 0.0, "h": 0.0, "b": 0.0, "tw": 0.0, "tf": 0.0,
        "L": 0.0, "Lb": 0.0
    });
    for (k, v) in extra.as_object().unwrap() {
        base[k] = v.clone();
    }
    serde_json::from_value(base).unwrap()
}

fn published(actual: f64, printed: f64, rel: f64) {
    let err = ((actual - printed) / printed).abs();
    assert!(err <= rel, "engine {actual}, published {printed} (off by {:.3} %)", err * 100.0);
}

fn val(o: &CheckOutcome, k: &str) -> f64 {
    o.values.get(k).and_then(|v| v.as_f64()).unwrap_or(f64::NAN)
}

// ───────────── Ejemplo 10 — compression ─────────────

#[test]
fn inti_10a_ipe300_elastic_e33() {
    let a = 53.8e-4;
    let iy = a * 0.0335f64.powi(2);
    let m = member(json!({"A": a, "Iy": iy, "Iz": 10.0 * iy, "L": 6.5, "h": 0.30, "b": 0.15, "tw": 0.0071, "tf": 0.0107}));
    let r = check_compression(&m, 200.0);
    assert_eq!(val(&r, "Q"), 1.0);
    published(val(&r, "KLr"), 194.0, 0.005);
    published(val(&r, "Fcr"), 46.0, 0.005);
    published(r.capacity, 210.3, 0.005);
}

#[test]
fn inti_10b_tube_inelastic_e32() {
    let a = 20.65e-4;
    let i = a * 0.0581f64.powi(2);
    let m = member(json!({"A": a, "Iy": i, "Iz": i, "L": 6.5, "shape": "CHS", "h": 0.1683, "tw": 0.004}));
    let r = check_compression(&m, 200.0);
    assert_eq!(val(&r, "Q"), 1.0);
    published(val(&r, "KLr"), 111.9, 0.005);
    published(val(&r, "Fcr"), 126.04, 0.005);
    published(r.capacity, 221.2, 0.005);
}

#[test]
fn inti_10c_slender_box_e7_example_widths() {
    let m = member(json!({
        "A": 17.75e-4, "Iy": 932.24e-8, "Iz": 932.24e-8, "L": 6.5, "shape": "box",
        "h": 0.18, "b": 0.18, "tw": 0.0025, "tf": 0.0025, "builtUp": true,
        "compressionElements": [
            {"kind": "stiffened", "b": 0.18, "t": 0.0025, "count": 2},
            {"kind": "stiffened", "b": 0.1775, "t": 0.0025, "count": 2}
        ]
    }));
    let r = check_compression(&m, 200.0);
    published(val(&r, "KLr"), 89.70, 0.005);
    // The example uses the 2005 form of E.7.17; the 2018 text gives be 0,4 % smaller.
    published(val(&r, "Q"), 0.794, 0.01);
    published(val(&r, "Fcr"), 135.70, 0.01);
    published(r.capacity, 204.7, 0.005);
}

#[test]
fn inti_10c_slender_box_geometry_widths() {
    let m = member(json!({
        "A": 17.75e-4, "Iy": 932.24e-8, "Iz": 932.24e-8, "L": 6.5, "shape": "box",
        "h": 0.18, "b": 0.18, "tw": 0.0025, "tf": 0.0025, "builtUp": true
    }));
    let r = check_compression(&m, 200.0);
    published(val(&r, "Q"), 0.8071, 0.001);
    published(val(&r, "Fcr"), 137.21, 0.001);
    published(r.capacity, 207.0, 0.001);
}

// ───────────── Ejemplo 14 — flexure and shear ─────────────

fn ipn180(extra: Value) -> Cirsoc301MemberData {
    let mut v = json!({
        "A": 27.9e-4, "Iz": 1450e-8, "Iy": 81.3e-8, "h": 0.18, "b": 0.082, "tw": 0.0069, "tf": 0.0104,
        "Zx": 187e-6, "Sx": 161e-6, "J": 7.89e-8, "L": 5.0, "Lb": 0.0
    });
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    member(v)
}

fn v2(extra: Value) -> Cirsoc301MemberData {
    let mut v = json!({
        "A": 62.31e-4, "Iz": 45129e-8, "Iy": 1059.2e-8, "h": 0.65 + 2.0 * 0.00794, "b": 0.20,
        "tw": 0.0047, "tf": 0.00794, "Zx": 1541.2e-6, "Sx": 1355.5e-6, "L": 10.0, "Lb": 2.0, "builtUp": true
    });
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    member(v)
}

#[test]
fn inti_14_v1_plastic_moment() {
    let r = check_flexure(&ipn180(json!({})), 37.5, true);
    published(val(&r, "Mp"), 43.95, 0.005);
    published(r.capacity, 0.9 * 43.95, 0.005);
    assert_eq!(r.clause, "F.2");
}

#[test]
fn inti_14_v1_shear_cv1() {
    let r = check_shear(&ipn180(json!({})), 30.0);
    assert_eq!(val(&r, "Cv"), 1.0);
    published(r.capacity / 0.9, 175.1, 0.005);
    published(r.capacity, 157.6, 0.005);
}

#[test]
fn inti_14_v2_slender_web_shear_g25() {
    let r = check_shear(&v2(json!({})), 78.6);
    published(val(&r, "Cv"), 0.336, 0.005);
    published(r.capacity / 0.9, 144.7, 0.005);
    published(r.capacity, 130.3, 0.005);
}

#[test]
fn inti_14_v2_f4_noncompact() {
    let r = check_flexure(&v2(json!({"J": 26.77e-8})), 280.8, true);
    assert_eq!(r.clause, "F.4");
    published(val(&r, "Mp"), 362.2, 0.005);
    published(val(&r, "Lp") * 100.0, 162.4, 0.005);
    published(val(&r, "Lr") * 100.0, 711.2, 0.005);
    published(val(&r, "Mn"), 317.9, 0.005);
    published(r.capacity, 286.1, 0.005);
}

#[test]
fn inti_14_v1_top_flange_elastic_ltb() {
    let r = check_flexure(&ipn180(json!({"Lb": 5.0, "Cb": 1.14, "Cw": 5924e-12, "loadPosition": "topFlange"})), 37.5, true);
    assert_eq!(r.clause, "F.2");
    published(val(&r, "Lp") * 100.0, 79.1, 0.005);
    published(val(&r, "Lr") * 100.0, 335.0, 0.005);
    published(val(&r, "Mn"), 20.43, 0.005);
    published(r.capacity, 18.39, 0.005);
}

#[test]
fn inti_14_v1_midspan_inelastic_ltb() {
    let r = check_flexure(&ipn180(json!({"Lb": 2.5, "Cb": 1.298, "Cw": 5924e-12, "loadPosition": "topFlange"})), 37.5, true);
    published(val(&r, "Mn"), 42.12, 0.005);
    published(r.capacity, 37.91, 0.005);
}

#[test]
fn inti_14_v3_f5_slender_web() {
    let m = member(json!({
        "A": 156.38e-4, "Iz": 293292e-8, "Iy": 1e-5, "h": 0.95 + 2.0 * 0.01588, "b": 0.35,
        "tw": 0.00476, "tf": 0.01588, "Sx": 5974e-6, "L": 25.0, "Lb": 10.0, "builtUp": true
    }));
    let r = check_flexure(&m, 740.0, true);
    assert_eq!(r.clause, "F.5");
    published(val(&r, "Lp") * 100.0, 307.4, 0.005);
    published(val(&r, "Lr") * 100.0, 1223.6, 0.005);
    published(val(&r, "Mn"), 857.2, 0.005);
    published(r.capacity, 771.4, 0.005);
}

// ───────────── Refusals ─────────────

#[test]
fn unknown_shape_is_refused_never_a_pass() {
    let m = member(json!({"A": 5e-4, "Iz": 1e-6, "Iy": 2e-7, "h": 0.1, "b": 0.05, "tw": 0.002, "tf": 0.002, "L": 2.0, "shape": "C"}));
    let c = check_compression(&m, 10.0);
    assert!(c.not_evaluated.is_some() && !c.pass && c.ratio.is_infinite());
    let f = check_flexure(&m, 1.0, true);
    assert!(f.not_evaluated.is_some() && !f.pass);
    // Unloaded: not applicable, no failure.
    let f0 = check_flexure(&m, 0.0, true);
    assert!(f0.pass && f0.ratio == 0.0);
}

#[test]
fn chs_beyond_e72c_is_refused() {
    let m = member(json!({"A": 10e-4, "Iz": 1e-5, "Iy": 1e-5, "L": 2.0, "shape": "CHS", "h": 0.5, "tw": 0.00085}));
    let c = check_compression(&m, 10.0);
    assert!(c.not_evaluated.is_some() && !c.pass);
}

#[test]
fn ltb_without_j_is_refused() {
    let m = member(json!({"A": 27.9e-4, "Iz": 1450e-8, "Iy": 81.3e-8, "h": 0.18, "b": 0.082, "tw": 0.0069, "tf": 0.0104,
        "Zx": 187e-6, "Sx": 161e-6, "L": 5.0, "Lb": 5.0}));
    let r = check_flexure(&m, 10.0, true);
    assert!(r.not_evaluated.is_some() && !r.pass);
}

#[test]
fn tension_without_connection_is_refused_with_load() {
    let m = ipn180(json!({}));
    let t = check_tension(&m, -100.0);
    assert!(t.not_evaluated.is_some() && !t.pass && t.ratio.is_infinite());
    let ok = check_tension(&ipn180(json!({"tensionConnection": {"An": 25e-4, "U": 0.85}})), -100.0);
    // φPn = min(0,9·235·2790, 0,75·370·2500·0,85) / 1000 = min(590,1; 589,7)
    published(ok.capacity, 0.75 * 370.0 * 2500.0 * 0.85 / 1000.0, 1e-12);
    assert_eq!(ok.clause, "D.2(b)");
}

#[test]
fn tension_shear_lag_d32_and_floor() {
    // U = 1 − x̄/L = 1 − 20/50 = 0,6 ≤ 0,9; connected area 1500 of 2790 mm² → floor 0,5376 < 0,6.
    let m = ipn180(json!({"tensionConnection": {"xBar": 0.020, "length": 0.050, "connectedArea": 15e-4}}));
    let t = check_tension(&m, -10.0);
    published(val(&t, "phiPnRupture"), 0.75 * 370.0 * 2790.0 * 0.6 / 1000.0, 1e-12);
    // Floor governs when x̄/L is large: U = 1 − 40/50 = 0,2 → 1500/2790.
    let m = ipn180(json!({"tensionConnection": {"xBar": 0.040, "length": 0.050, "connectedArea": 15e-4}}));
    let t = check_tension(&m, -10.0);
    published(val(&t, "phiPnRupture"), 0.75 * 370.0 * 1500.0 / 1000.0, 1e-12);
}

// ───────────── §E.4 by hand ─────────────

fn tee(extra: Value) -> Cirsoc301MemberData {
    let (h, b, tf, tw) = (0.2f64, 0.15f64, 0.012f64, 0.01f64);
    let mut v = json!({"A": 0.00368, "Iz": 1.475448e-5, "Iy": 3.390667e-6, "h": h, "b": b, "tw": tw, "tf": tf,
        "L": 3.0, "Lb": 3.0, "shape": "T", "J": (b * tf.powi(3) + (h - tf) * tw.powi(3)) / 3.0});
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    member(v)
}

#[test]
fn tee_e42_governs() {
    let r = check_compression(&tee(json!({})), 300.0);
    assert!(r.not_evaluated.is_none());
    assert_eq!(r.clause, "E.4");
    published(val(&r, "Fcr"), 125.6, 0.005);
    published(r.capacity, 392.8, 0.005);
    let r2 = check_compression(&tee(json!({"shearCentreOffset": 0.051087})), 300.0);
    published(r2.capacity, 392.8, 0.005);
    let r3 = check_compression(&tee(json!({"J": null})), 300.0);
    assert!(r3.not_evaluated.is_some());
}

#[test]
fn doubly_symmetric_i_e44_when_torsional_length_exceeds() {
    let (a, iz, iy) = (53.8e-4, 8356e-8, 603.8e-8);
    let base = json!({"A": a, "Iz": iz, "Iy": iy, "h": 0.3, "b": 0.15, "tw": 0.0071, "tf": 0.0107, "L": 6.0, "Lb": 6.0, "Ky": 0.5});
    let mut with = base.clone();
    with["J"] = json!(20.1e-8);
    with["Cw"] = json!(125900e-12);
    let r = check_compression(&member(with), 300.0);
    let fe = (std::f64::consts::PI.powi(2) * 200000.0 * 125900e-12 / 36.0 + 77200.0 * 20.1e-8) / (iz + iy);
    let fcr_t = 0.658f64.powf(235.0 / fe) * 235.0;
    let ry = (iy / a).sqrt();
    let fe_f = std::f64::consts::PI.powi(2) * 200000.0 / (3.0 / ry).powi(2);
    let fcr_f = 0.658f64.powf(235.0 / fe_f) * 235.0;
    published(val(&r, "Fcr"), fcr_t.min(fcr_f), 1e-9);
    assert!(check_compression(&member(base), 300.0).not_evaluated.is_some());
}

// ───────────── H.1 ─────────────

#[test]
fn biaxial_bending_without_axial_runs_h11b() {
    // H.1.1, last paragraph: biaxial flexure uses H.1.1b without the axial term.
    let m = ipn180(json!({}));
    let f = Cirsoc301DesignForces { element_id: 0, nu: 0.0, mu_strong: 20.0, mu_weak: 3.0, vu: 0.0 };
    let r = check_member(&m, &f);
    let i = r.interaction.as_ref().expect("biaxial interaction runs");
    let expect = 20.0 / r.flexure_strong.capacity + 3.0 / r.flexure_weak.as_ref().unwrap().capacity;
    published(i.ratio, expect, 1e-12);
    assert_eq!(i.clause, "H.1.1b");
}

#[test]
fn interaction_h11a_by_hand() {
    let m = ipn180(json!({"tensionConnection": {"allElementsConnected": true}}));
    let f = Cirsoc301DesignForces { element_id: 0, nu: -400.0, mu_strong: 10.0, mu_weak: 0.0, vu: 0.0 };
    let r = check_member(&m, &f);
    let t = r.tension.as_ref().unwrap();
    let i = r.interaction.as_ref().unwrap();
    let ar = 400.0 / t.capacity;
    assert!(ar >= 0.2);
    published(i.ratio, ar + 8.0 / 9.0 * 10.0 / r.flexure_strong.capacity, 1e-12);
    assert_eq!(i.clause, "H.1.1a");
}

#[test]
fn refused_capacity_refuses_interaction() {
    let m = ipn180(json!({"Lb": 5.0, "J": null}));
    let f = Cirsoc301DesignForces { element_id: 0, nu: 50.0, mu_strong: 10.0, mu_weak: 0.0, vu: 0.0 };
    let r = check_member(&m, &f);
    assert!(!r.pass);
    assert!(r.interaction.as_ref().unwrap().not_evaluated.is_some());
    assert!(r.unevaluated.contains(&"flexureStrong".to_string()));
}

// ───────────── Angles ─────────────

#[test]
fn angle_props_sharp_corner_l100x10() {
    // Equal angle 100×100×10, sharp corners, by hand: A = 19,0 cm², centroid
    // (100·10·50 + 90·10·5)/1900 = 28,68 mm from the heel; I (geometric) = 833 333 +
    // 1000·21,32² + 7500 + 900·23,68² = 180,0 cm⁴; Ixy = −106,6 cm⁴ → Iv = 73,4, Iu = 286,6.
    let p = angle_props(0.1, 0.1, 0.01);
    published(p.area * 1e4, 19.0, 1e-9);
    published(p.i_par_long * 1e8, 180.0, 0.001);
    published((p.i_major + p.i_minor) / (2.0 * p.i_par_long), 1.0, 1e-9);
    published(p.i_minor * 1e8, 73.4, 0.002);
    published(p.i_major * 1e8, 286.6, 0.002);
    // With the EN 10056-1 catalogue values (A = 19,2, I = 177, Iv = 72,9 cm⁴), every inertia
    // is scaled by 177/180: Iv = 72,2 ≤ 72,9; radii use 19,2 cm², the strength 19,0 cm².
    let a = AngleData { leg_long: 0.1, leg_short: 0.1, t: 0.01, area: Some(19.2e-4), i_par_long: Some(177e-8),
        i_par_short: Some(177e-8), end_condition: None, back_to_back: None, gap: None, connector_spacing: None, connector: None };
    let (q, a_str) = angle_section(&a);
    assert!(q.i_minor * 1e8 <= 72.9 && q.i_minor * 1e8 > 71.5);
    published(q.area * 1e4, 19.2, 1e-9);
    published(a_str * 1e4, 19.0, 1e-9);
    // The shear centre lies on the symmetry (major) axis: one principal coordinate is zero.
    assert!(p.xo.abs().min(p.yo.abs()) < 1e-12);
}

fn single_angle(cond: &str, l: f64, bl: f64, bs: f64, t: f64) -> Cirsoc301MemberData {
    member(json!({
        "shape": "L", "h": bl, "b": bs, "tw": t, "tf": t,
        "L": l, "Lb": l, "angle": {"legLong": bl, "legShort": bs, "t": t, "endCondition": cond}
    }))
}

#[test]
fn single_angle_e5a_effective_slenderness() {
    // L 100×100×10, L = 2 m, E.5(a): rx (geometric) = √(176,7/19) = 30,5 mm, L/rx = 65,6 ≤ 80
    // → (kL/r)m = 72 + 0,75·65,6 = 121,2 (E.5.1).
    let m = single_angle("e5aLong", 2.0, 0.1, 0.1, 0.01);
    let r = check_compression(&m, 50.0);
    assert!(r.not_evaluated.is_none(), "{:?}", r.not_evaluated);
    let p = angle_props(0.1, 0.1, 0.01);
    let rx = (p.i_par_long / p.area).sqrt();
    let klr = 72.0 + 0.75 * 2.0 / rx;
    published(val(&r, "KLr"), klr, 1e-12);
    // b/t = 10 ≤ 0,45·√(E/Fy) = 13,1: Q = 1. Fe, Fcr by E.3.2.
    let fe = std::f64::consts::PI.powi(2) * 200000.0 / (klr * klr);
    let fcr_flex = 0.658f64.powf(235.0 / fe) * 235.0;
    assert!(val(&r, "Fcr") <= fcr_flex + 1e-9);
    published(r.capacity, 0.85 * val(&r, "Fcr") * p.area * 1e3, 1e-12);
}

#[test]
fn single_angle_e5_long_branch_and_short_leg_rules() {
    // L/rx > 80 → E.5.2, capped at 200.
    let m = single_angle("e5aLong", 4.0, 0.1, 0.1, 0.01);
    let p = angle_props(0.1, 0.1, 0.01);
    let rx = (p.i_par_long / p.area).sqrt();
    let r = check_compression(&m, 20.0);
    published(val(&r, "KLr"), (32.0 + 1.25 * 4.0 / rx).min(200.0), 1e-12);
    // Unequal, connected by the short leg: + 4[(bl/bs)² − 1], ≥ 0,95·L/rz.
    let (bl, bs, t) = (0.15, 0.1, 0.01);
    let m = single_angle("e5aShort", 2.0, bl, bs, t);
    let p = angle_props(bl, bs, t);
    let rx = (p.i_par_short / p.area).sqrt();
    let lr = 2.0 / rx;
    let mut klr = if lr <= 80.0 { 72.0 + 0.75 * lr } else { (32.0 + 1.25 * lr).min(200.0) };
    klr = (klr + 4.0 * ((bl / bs).powi(2) - 1.0)).max(0.95 * 2.0 / (p.i_minor / p.area).sqrt());
    let r = check_compression(&m, 20.0);
    published(val(&r, "KLr"), klr, 1e-12);
    // bl/bs ≥ 1,7 through the short leg is outside E.5: refused by name.
    let r = check_compression(&single_angle("e5aShort", 2.0, 0.2, 0.1, 0.01), 20.0);
    assert_eq!(r.not_evaluated.as_ref().unwrap().key, "c301.refuse.e5Ratio");
}

#[test]
fn single_angle_without_end_condition_is_refused() {
    let m = member(json!({"shape": "L", "h": 0.1, "b": 0.1, "tw": 0.01, "tf": 0.01,
        "L": 2.0, "Lb": 2.0, "angle": {"legLong": 0.1, "legShort": 0.1, "t": 0.01}}));
    let r = check_compression(&m, 10.0);
    assert_eq!(r.not_evaluated.as_ref().unwrap().key, "c301.refuse.e5Condition");
    // Flexure of a single angle (F.10) is refused by name, tension is not affected.
    let f = check_flexure(&m, 1.0, true);
    assert_eq!(f.not_evaluated.as_ref().unwrap().key, "c301.refuse.f10");
}

#[test]
fn single_angle_concentric_uses_least_radius_and_e4() {
    let m = single_angle("concentric", 1.0, 0.1, 0.1, 0.01);
    let p = angle_props(0.1, 0.1, 0.01);
    let r = check_compression(&m, 10.0);
    published(val(&r, "KLr"), 1.0 / (p.i_minor / p.area).sqrt(), 1e-12);
    // E.4(b.2) for the equal angle by hand.
    let ro2 = p.xo * p.xo + p.yo * p.yo + (p.i_major + p.i_minor) / p.area;
    let fex = std::f64::consts::PI.powi(2) * 200000.0 / (1.0f64.powi(2) * p.area / p.i_major);
    let fez = 77200.0 * p.j / (p.area * ro2);
    let h = 1.0 - (p.xo * p.xo + p.yo * p.yo) / ro2;
    let fe = (fex + fez) / (2.0 * h) * (1.0 - (1.0 - 4.0 * fex * fez * h / (fex + fez).powi(2)).sqrt());
    let lam2 = 235.0 / fe;
    let ft = if lam2.sqrt() <= 1.5 { 0.658f64.powf(lam2) * 235.0 } else { 0.877 / lam2 * 235.0 };
    assert!(val(&r, "Fcr") <= ft + 1e-9);
}

#[test]
fn unequal_angle_cubic_least_root() {
    // E.4(b.3): the root lies below min(Fex, Fey, Fez) and makes the cubic vanish.
    let m = single_angle("concentric", 1.5, 0.15, 0.09, 0.01);
    let r = check_compression(&m, 10.0);
    assert!(r.not_evaluated.is_none(), "{:?}", r.not_evaluated);
    let ae = r.steps.iter().find(|s| s.key == "c301.e.e4AngleAsym").expect("cubic step");
    let g = |k: &str| ae.params[k].as_f64().unwrap();
    assert!(g("Fe") < g("Fex").min(g("Fey")).min(g("Fez")) + 0.1);
}

fn double_angle(extra: Value) -> Cirsoc301MemberData {
    let mut ang = json!({"legLong": 0.075, "legShort": 0.075, "t": 0.008, "backToBack": "long", "gap": 0.010,
        "connectorSpacing": 0.6, "connector": "welded"});
    for (k, x) in extra.as_object().unwrap() {
        ang[k] = x.clone();
    }
    member(json!({"shape": "2L", "h": 0.075, "b": 0.16, "tw": 0.008, "tf": 0.008,
        "L": 3.0, "Lb": 3.0, "angle": ang}))
}

#[test]
fn double_angle_group_ii_modified_slenderness() {
    let r = check_compression(&double_angle(json!({})), 50.0);
    assert!(r.not_evaluated.is_none(), "{:?}", r.not_evaluated);
    let s_ = r.steps.iter().find(|s| s.key == "c301.e.doubleAngle").unwrap();
    let g = |k: &str| s_.params[k].as_f64().unwrap();
    // Welded, a/ri > 20 → E.6.2b with ki = 0,86 (fillers).
    let p = angle_props(0.075, 0.075, 0.008);
    let ri = (p.i_minor / p.area).sqrt();
    let ari = 0.6 / ri;
    assert!(ari > 20.0);
    let expect = (g("KLro").powi(2) + (0.86 * ari).powi(2)).sqrt();
    published(g("KLrm"), expect, 2e-3);
    // Snug bolts: E.6.1.
    let r = check_compression(&double_angle(json!({"connector": "snugBolts"})), 50.0);
    let s_ = r.steps.iter().find(|s| s.key == "c301.e.doubleAngle").unwrap();
    let g = |k: &str| s_.params[k].as_f64().unwrap();
    published(g("KLrm"), (g("KLro").powi(2) + ari * ari).sqrt(), 2e-3);
}

#[test]
fn double_angle_refusals_by_name() {
    let r = check_compression(&double_angle(json!({"connectorSpacing": null})), 50.0);
    assert_eq!(r.not_evaluated.unwrap().key, "c301.refuse.e6Spacing");
    let r = check_compression(&double_angle(json!({"connectorSpacing": 2.5})), 50.0);
    assert_eq!(r.not_evaluated.unwrap().key, "c301.refuse.e6SpacingTooLarge");
    let f = check_flexure(&double_angle(json!({})), 1.0, true);
    assert_eq!(f.not_evaluated.unwrap().key, "c301.refuse.f9");
}

// ───────────── Certified evaluation ─────────────

/// A small deterministic generator (no external crate).
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((self.0 >> 11) as f64) / ((1u64 << 53) as f64)
    }
    fn range(&mut self, a: f64, b: f64) -> f64 {
        a + (b - a) * self.next()
    }
}

fn random_i(rng: &mut Lcg) -> Cirsoc301MemberData {
    let h = rng.range(0.1, 0.9);
    let b = rng.range(0.05, 0.35);
    let tf = rng.range(0.004, 0.03);
    let tw = rng.range(0.003, 0.02);
    let hw = h - 2.0 * tf;
    let a = 2.0 * b * tf + hw * tw;
    let iz = (b * h.powi(3) - (b - tw) * hw.powi(3)) / 12.0;
    let iy = (2.0 * tf * b.powi(3) + hw * tw.powi(3)) / 12.0;
    let j = (2.0 * b * tf.powi(3) + hw * tw.powi(3)) / 3.0;
    let cw = iy * (h - tf).powi(2) / 4.0;
    let shape = if rng.next() < 0.8 { "I" } else { "U" };
    let l = rng.range(1.0, 10.0);
    member(json!({
        "Fy": rng.range(235.0, 355.0), "Fu": 400.0, "A": a, "Iz": iz, "Iy": iy, "h": h, "b": b, "tw": tw, "tf": tf,
        "L": l, "Lb": l * rng.range(0.1, 1.0), "J": j, "Cw": cw, "shape": shape, "builtUp": rng.next() < 0.5,
        "Cb": rng.range(1.0, 2.0), "loadPosition": if rng.next() < 0.5 { "web" } else { "topFlange" },
        "tensionConnection": {"An": a * 0.85, "U": 0.9}
    }))
}

#[test]
fn certified_enclosures_contain_the_f64_check() {
    let mut rng = Lcg(42);
    let mut certified = 0;
    for _ in 0..3000 {
        let m = random_i(&mut rng);
        let f = Cirsoc301DesignForces {
            element_id: 0,
            nu: rng.range(-800.0, 800.0),
            mu_strong: rng.range(-300.0, 300.0),
            mu_weak: if rng.next() < 0.5 { 0.0 } else { rng.range(-30.0, 30.0) },
            vu: rng.range(0.0, 400.0),
        };
        let r = check_member(&m, &f);
        let zero = DemandBound { n: 0.0, my: 0.0, mz: 0.0, vy: 0.0 };
        match cirsoc301_ratio_enclosures(&m, &f, &zero) {
            Ok(enc) => {
                certified += 1;
                let f64s = [
                    r.tension.as_ref().map(|o| o.ratio).unwrap_or(0.0),
                    r.compression.as_ref().map(|o| o.ratio).unwrap_or(0.0),
                    r.flexure_strong.ratio,
                    r.flexure_weak.as_ref().map(|o| o.ratio).unwrap_or(0.0),
                    r.shear.ratio,
                    r.interaction.as_ref().map(|o| o.ratio).unwrap_or(0.0),
                ];
                for (k, (e, x)) in enc.iter().zip(f64s).enumerate() {
                    let tol = 1e-12 * x.abs().max(1.0);
                    assert!(e.lo - tol <= x && x <= e.hi + tol, "check {k}: {x} ∉ {e:?} for {m:?} {f:?}");
                    assert!(e.hi - e.lo <= 1e-9 * x.abs().max(1.0), "check {k}: wide {e:?}");
                }
            }
            Err(reason) => {
                // Uncertified only when the f64 check could not evaluate a loaded check.
                assert!(!r.unevaluated.is_empty(), "uncertified ({reason}) but f64 evaluated everything: {r:?}");
            }
        }
    }
    assert!(certified > 2000, "only {certified} certified");
}

#[test]
fn certify_members_over_demand_boxes() {
    let m = ipn180(json!({"tensionConnection": {"allElementsConnected": true}}));
    let d = |nu: f64, mx: f64| BoundedCirsoc301Demand {
        forces: Cirsoc301DesignForces { element_id: 0, nu, mu_strong: mx, mu_weak: 0.0, vu: 10.0 },
        bound: DemandBound { n: 1.0, my: 0.1, mz: 0.0, vy: 0.1 },
    };
    let res = certify_cirsoc301_members(&CertifiedCirsoc301CheckInput { members: vec![m.clone()], demands: vec![d(-100.0, 10.0), d(-150.0, 5.0)] });
    assert_eq!(res.len(), 1);
    let r = &res[0];
    assert!(r.certified && r.certified_ok, "{r:?}");
    // The certified utilization is the maximum over the demand sets.
    let x = [d(-100.0, 10.0), d(-150.0, 5.0)].iter().map(|dd| check_member(&m, &dd.forces).unity_ratio).fold(0.0, f64::max);
    assert!(r.utilization_lower <= x + 1e-12 && x <= r.utilization_upper, "{x} vs {r:?}");
    // A refused loaded check: never certified.
    let bad = ipn180(json!({}));
    let res = certify_cirsoc301_members(&CertifiedCirsoc301CheckInput { members: vec![bad], demands: vec![d(-100.0, 10.0)] });
    assert!(!res[0].certified && !res[0].certified_ok);
}
