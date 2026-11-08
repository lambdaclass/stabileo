//! CIRSOC 301-2018 §D.3 and §B.4.2.2, evaluated by `postprocess::tension_net_area` against the
//! clauses worked by hand in mm; each expected number is reproduced beside its assertion. The
//! nominal holes are Tabla J.3.3's: M12 → 14, M16 → 18, M20 → 22 standard and 24 oversize.

use dedaliano_engine::postprocess::tension_net_area::*;

fn sec(shape: &str, h: f64, b: f64, tw: f64, tf: f64, a: f64) -> NetAreaSection {
    NetAreaSection { shape: Some(shape.into()), a: Some(a), h: Some(h), b: Some(b), tw: Some(tw), tf: Some(tf), ..Default::default() }
}

fn angle(h: f64, b: f64, t: f64, a: f64) -> NetAreaSection {
    NetAreaSection { shape: Some("L".into()), a: Some(a), h: Some(h), b: Some(b), t: Some(t), ..Default::default() }
}

fn plate(b: f64, h: f64, a: f64) -> NetAreaSection {
    NetAreaSection { shape: Some("rect".into()), a: Some(a), h: Some(h), b: Some(b), ..Default::default() }
}

fn l100() -> NetAreaSection {
    angle(0.1, 0.1, 0.01, 19.2e-4)
}

fn ipe200() -> NetAreaSection {
    sec("I", 0.2, 0.1, 0.0056, 0.0085, 28.5e-4)
}

fn bolted(connected: Connected, hole: f64, nb: f64, nl: f64, pitch: Option<f64>) -> EndConnection {
    EndConnection::Bolted {
        connected, diameter_mm: Some(hole - 2.0), hole_mm: Some(hole), bolts_per_line: Some(nb), lines: Some(nl),
        web_lines: None, pitch_mm: pitch, stagger: None,
    }
}

fn welded(connected: Connected, weld: WeldLayout, length_mm: Option<f64>) -> EndConnection {
    EndConnection::Welded { connected, weld, length_mm }
}

fn ok(s: &NetAreaSection, e: &EndConnection) -> EndNetArea {
    end_net_area(s, e).unwrap_or_else(|r| panic!("refused: {r:?}"))
}

fn code(s: &NetAreaSection, e: &EndConnection) -> &'static str {
    end_net_area(s, e).err().map(|r| r.code).unwrap_or("ok")
}

fn close(actual: f64, expected: f64, tol: f64) {
    assert!((actual - expected).abs() <= tol, "{actual} against {expected}");
}

#[test]
fn single_angle_bolted_on_one_leg() {
    let r = ok(&l100(), &bolted(Connected::LegH, 22.0, 4.0, 1.0, Some(70.0)));
    close(r.an * 1e6, 1920.0 - 24.0 * 10.0, 1e-9);
    close(r.x_bar.unwrap() * 1000.0, 10.0 * (1000.0 + 10000.0 - 100.0) / (2.0 * 1900.0), 1e-9);
    close(r.l.unwrap() * 1000.0, 210.0, 1e-9);
    let u = 1.0 - (10900.0 / 380.0) / 210.0;
    close(r.u, u, 1e-12);
    close(r.ae * 1e6, 1680.0 * u, 1e-9);
    assert_eq!(r.clause, "D.3.1");
}

#[test]
fn single_bolt_per_line_gives_the_connected_leg_net_area() {
    let r = ok(&l100(), &bolted(Connected::LegH, 22.0, 1.0, 1.0, None));
    close(r.ae * 1e6, 100.0 * 10.0 - 24.0 * 10.0, 1e-9);
    assert_eq!(r.clause, "D.3(2)(a)");
    close(r.u, 760.0 / 1680.0, 1e-12);
}

#[test]
fn oversize_hole_deducts_its_own_column() {
    let r = ok(&l100(), &bolted(Connected::LegH, 24.0, 4.0, 1.0, Some(70.0)));
    close(r.an * 1e6, 1920.0 - 26.0 * 10.0, 1e-9);
}

#[test]
fn short_connection_raises_u_to_the_connected_area_ratio() {
    let r = ok(&l100(), &bolted(Connected::LegH, 22.0, 2.0, 1.0, Some(30.0)));
    close(r.u, 1000.0 / 1920.0, 1e-12);
    assert!(r.events.iter().any(|e| matches!(e, Event::UFloor { .. })));
}

#[test]
fn double_angle_back_to_back_deducts_both_angles_and_takes_one_angle_x_bar() {
    let ll = NetAreaSection {
        shape: Some("L".into()), a: Some(9.6e-4), h: Some(0.05), b: Some(0.105),
        arrangement: Some("doubleBack".into()), part: Some(Box::new(angle(0.05, 0.05, 0.005, 4.8e-4))),
        ..Default::default()
    };
    let r = ok(&ll, &bolted(Connected::LegH, 14.0, 3.0, 1.0, Some(40.0)));
    close(r.an * 1e6, 960.0 - 2.0 * 16.0 * 5.0, 1e-9);
    let x_bar = 5.0 * (250.0 + 2500.0 - 25.0) / (2.0 * 5.0 * 95.0);
    close(r.x_bar.unwrap() * 1000.0, x_bar, 1e-9);
    close(r.u, 1.0 - x_bar / 80.0, 1e-12);
    assert_eq!(code(&NetAreaSection { part: None, ..ll.clone() }, &bolted(Connected::LegH, 14.0, 3.0, 1.0, Some(40.0))), "builtUpPart");
    assert_eq!(code(&NetAreaSection { arrangement: Some("doubleX".into()), ..ll }, &welded(Connected::All, WeldLayout::LongitudinalAndTransverse, None)), "builtUp");
}

#[test]
fn i_section_bolted_through_the_flanges() {
    let r = ok(&ipe200(), &bolted(Connected::Flanges, 18.0, 3.0, 2.0, Some(50.0)));
    close(r.an * 1e6, 2850.0 - 4.0 * 20.0 * 8.5, 1e-9);
    let x_bar = (850.0 * 4.25 + 91.5 * 5.6 * 54.25) / (850.0 + 91.5 * 5.6);
    close(r.x_bar.unwrap() * 1000.0, x_bar, 1e-9);
    close(r.u, 1.0 - x_bar / 100.0, 1e-12);
    close(r.ae * 1e6, 2170.0 * (1.0 - x_bar / 100.0), 1e-9);
}

#[test]
fn i_section_by_its_web_from_the_web_mid_plane() {
    let r = ok(&ipe200(), &bolted(Connected::Web, 18.0, 3.0, 2.0, Some(50.0)));
    let x_bar = (2.0 * 425.0 * 25.0 + 183.0 * 2.8 * 1.4) / (850.0 + 183.0 * 2.8);
    close(r.x_bar.unwrap() * 1000.0, x_bar, 1e-9);
    close(r.an * 1e6, 2850.0 - 2.0 * 20.0 * 5.6, 1e-9);
    close(r.u, 1.0 - x_bar / 100.0, 1e-12);
}

#[test]
fn every_element_connected_gives_ae_equal_an() {
    let end = EndConnection::Bolted {
        connected: Connected::All, diameter_mm: Some(16.0), hole_mm: Some(18.0), bolts_per_line: Some(3.0), lines: Some(2.0),
        web_lines: Some(2.0), pitch_mm: Some(50.0), stagger: None,
    };
    let r = ok(&ipe200(), &end);
    close(r.ae * 1e6, 2850.0 - 4.0 * 20.0 * 8.5 - 2.0 * 20.0 * 5.6, 1e-9);
    assert_eq!((r.u, r.clause), (1.0, "D.3(1)"));
}

#[test]
fn u_is_capped_at_nine_tenths() {
    let inch = 0.0254;
    let wt = sec("T", 5.97 * inch, 8.01 * inch, 0.295 * inch, 0.515 * inch, 5.84 * inch * inch);
    let r = ok(&wt, &welded(Connected::Flange, WeldLayout::LongitudinalAndTransverse, Some(16.0 * 25.4)));
    assert_eq!(r.u, 0.9);
    close(r.ae / (inch * inch), 5.84 * 0.9, 1e-9);
    assert_eq!(r.clause, "D.3.3");
}

#[test]
fn tee_flange_x_bar_and_stem_x_bar() {
    let wt = sec("T", 0.15, 0.2, 0.008, 0.012, 0.0035);
    let flange = ok(&wt, &welded(Connected::Flange, WeldLayout::Longitudinal, Some(400.0)));
    let x_flange = (200.0 * 12.0 * 6.0 + 138.0 * 8.0 * (12.0 + 69.0)) / (200.0 * 12.0 + 138.0 * 8.0);
    close(flange.x_bar.unwrap() * 1000.0, x_flange, 1e-9);
    let stem = ok(&wt, &welded(Connected::Web, WeldLayout::Longitudinal, Some(400.0)));
    let x_stem = (100.0 * 12.0 * 50.0 + 138.0 * 4.0 * 2.0) / (100.0 * 12.0 + 138.0 * 4.0);
    close(stem.x_bar.unwrap() * 1000.0, x_stem, 1e-9);
}

#[test]
fn transverse_welds_only_take_the_connected_area() {
    let wt = sec("T", 0.15, 0.2, 0.008, 0.012, 0.0035);
    let r = ok(&wt, &welded(Connected::Flange, WeldLayout::Transverse, None));
    close(r.ae, 0.2 * 0.012, 1e-15);
    assert_eq!(r.clause, "D.3.4");
}

#[test]
fn welded_plate_follows_the_length_to_width_table() {
    let bar = plate(0.01, 0.2, 0.002);
    let w = |l: f64| welded(Connected::All, WeldLayout::Longitudinal, Some(l));
    assert_eq!(ok(&bar, &w(400.0)).u, 1.0);
    assert_eq!(ok(&bar, &w(300.0)).u, 0.87);
    assert_eq!(ok(&bar, &w(250.0)).u, 0.75);
    close(ok(&bar, &w(250.0)).ae * 1e6, 1500.0, 1e-9);
    assert_eq!(ok(&bar, &w(250.0)).clause, "D.3.5");
    assert_eq!(code(&bar, &w(150.0)), "plateWeldShort");
    assert_eq!(code(&bar, &welded(Connected::All, WeldLayout::Longitudinal, None)), "weldLength");
    let both = ok(&bar, &welded(Connected::All, WeldLayout::LongitudinalAndTransverse, Some(100.0)));
    assert_eq!((both.ae, both.clause), (0.002, "D.3(1)"));
}

#[test]
fn staggered_chains_deduct_the_larger() {
    let p = plate(0.3, 0.012, 0.0036);
    let st = |nl: f64, pitch: f64, s: f64, g: f64| EndConnection::Bolted {
        connected: Connected::All, diameter_mm: Some(20.0), hole_mm: Some(22.0), bolts_per_line: Some(3.0), lines: Some(nl),
        web_lines: None, pitch_mm: Some(pitch), stagger: Some(Stagger { s_mm: Some(s), g_mm: Some(g) }),
    };
    let zig = ok(&p, &st(4.0, 80.0, 40.0, 70.0));
    close(zig.an * 1e6, 3600.0 - (4.0 * 24.0 * 12.0 - 3.0 * 1600.0 * 12.0 / 280.0), 1e-9);
    let straight = ok(&p, &st(2.0, 200.0, 100.0, 50.0));
    close(straight.an * 1e6, 3600.0 - 24.0 * 12.0, 1e-9);
    assert_eq!(code(&p, &st(1.0, 80.0, 40.0, 70.0)), "stagger");
}

#[test]
fn channel_by_its_web_from_the_back_of_the_web() {
    let u200 = sec("U", 0.2, 0.075, 0.0085, 0.0115, 32.2e-4);
    let r = ok(&u200, &welded(Connected::Web, WeldLayout::Longitudinal, Some(200.0)));
    let x_bar = (1725.0 * 37.5 + 177.0 * 8.5 * 4.25) / (1725.0 + 177.0 * 8.5);
    close(r.x_bar.unwrap() * 1000.0, x_bar, 1e-9);
    close(r.u, 1.0 - x_bar / 200.0, 1e-12);
}

#[test]
fn refusals_by_name() {
    let b = bolted(Connected::All, 18.0, 2.0, 1.0, Some(50.0));
    let f = bolted(Connected::Flanges, 18.0, 2.0, 1.0, Some(50.0));
    assert_eq!(code(&NetAreaSection { shape: Some("RHS".into()), ..ipe200() }, &b), "tube");
    assert_eq!(code(&NetAreaSection { shape: Some("CHS".into()), ..ipe200() }, &b), "tube");
    assert_eq!(code(&NetAreaSection { shape: Some("C".into()), ..ipe200() }, &b), "coldFormed");
    assert_eq!(code(&NetAreaSection { shape: None, ..ipe200() }, &b), "noShape");
    assert_eq!(code(&NetAreaSection { shape: Some("invL".into()), ..ipe200() }, &b), "shape");
    assert_eq!(code(&NetAreaSection { drawn: true, ..ipe200() }, &b), "drawn");
    assert_eq!(code(&NetAreaSection { a: None, ..ipe200() }, &b), "area");
    assert_eq!(code(&NetAreaSection { tf: Some(0.1), ..ipe200() }, &b), "dimensions");
    let with = |f: &dyn Fn(&mut EndConnection)| { let mut e = bolted(Connected::Flanges, 18.0, 2.0, 1.0, Some(50.0)); f(&mut e); e };
    assert_eq!(code(&ipe200(), &with(&|e| if let EndConnection::Bolted { pitch_mm, .. } = e { *pitch_mm = None })), "pitch");
    assert_eq!(code(&ipe200(), &with(&|e| if let EndConnection::Bolted { hole_mm, .. } = e { *hole_mm = None })), "holeNotTabulated");
    assert_eq!(code(&ipe200(), &with(&|e| if let EndConnection::Bolted { diameter_mm, .. } = e { *diameter_mm = None })), "diameter");
    assert_eq!(code(&ipe200(), &with(&|e| if let EndConnection::Bolted { bolts_per_line, .. } = e { *bolts_per_line = Some(2.5) })), "boltsPerLine");
    assert_eq!(code(&ipe200(), &with(&|e| if let EndConnection::Bolted { lines, .. } = e { *lines = Some(5.0) })), "holesDoNotFit");
    assert_eq!(code(&ipe200(), &b), "webLines");
    assert_eq!(code(&ipe200(), &bolted(Connected::LegH, 18.0, 2.0, 1.0, Some(50.0))), "connectedForShape");
    assert_eq!(code(&l100(), &welded(Connected::LegH, WeldLayout::Longitudinal, None)), "weldLength");
    assert_eq!(code(&ipe200(), &f), "ok");
}

#[test]
fn angle_thickness_from_tw_only_when_it_equals_tf() {
    let s = NetAreaSection { shape: Some("L".into()), h: Some(0.05), b: Some(0.05), tw: Some(0.005), tf: Some(0.005), ..Default::default() };
    assert_eq!(tension_geometry(&s).unwrap().kind, GeometryKind::L);
    let uneven = NetAreaSection { tf: Some(0.006), ..s };
    assert_eq!(tension_geometry(&uneven).unwrap_err().code, "dimensions");
}

#[test]
fn the_weaker_end_governs_and_missing_ends_are_named() {
    let end = bolted(Connected::LegH, 22.0, 4.0, 1.0, Some(70.0));
    let shorter = bolted(Connected::LegH, 22.0, 2.0, 1.0, Some(70.0));
    let r = member_net_area(&NetAreaInput { section: l100(), ends: vec![Some(end.clone()), Some(shorter)] }).unwrap();
    let MemberNetArea::Resolved { per_end, governing } = r else { panic!("{r:?}") };
    assert_eq!(governing, 1);
    assert!(per_end[1].ae < per_end[0].ae);
    let m = member_net_area(&NetAreaInput { section: l100(), ends: vec![Some(end.clone()), None] }).unwrap();
    assert_eq!(m, MemberNetArea::Missing { missing: vec![1] });
    let refused = member_net_area(&NetAreaInput { section: l100(), ends: vec![Some(end), Some(bolted(Connected::Web, 22.0, 2.0, 1.0, Some(70.0)))] }).unwrap();
    assert!(matches!(refused, MemberNetArea::Refused { at: 1, ref refused } if refused.code == "connectedForShape"));
}

#[test]
fn non_finite_numbers_are_an_error() {
    let end = bolted(Connected::LegH, 22.0, 4.0, 1.0, Some(f64::NAN));
    assert!(member_net_area(&NetAreaInput { section: l100(), ends: vec![Some(end)] }).is_err());
    let s = NetAreaSection { a: Some(f64::INFINITY), ..l100() };
    assert!(member_net_area(&NetAreaInput { section: s, ends: vec![Some(bolted(Connected::LegH, 22.0, 4.0, 1.0, Some(70.0)))] }).is_err());
}

#[test]
fn the_json_op_takes_the_web_payload() {
    let json = r#"{"op":"netArea","section":{"shape":"L","a":0.00192,"h":0.1,"b":0.1,"t":0.01},
        "ends":[{"kind":"bolted","connected":"legH","diameterMm":20,"holeKind":"standard","holeMm":22,"boltsPerLine":4,"lines":1,"pitchMm":70},null]}"#;
    let req: dedaliano_engine::postprocess::cirsoc301_inputs::Cirsoc301InputsRequest = serde_json::from_str(json).unwrap();
    let v = dedaliano_engine::postprocess::cirsoc301_inputs::answer(&req).unwrap();
    assert_eq!(v["missing"], serde_json::json!([1]));
}

#[test]
fn the_geometry_op_names_the_kind_and_its_connected_elements() {
    let json = r#"{"op":"tensionGeometry","shape":"H","h":0.2,"b":0.2,"tw":0.009,"tf":0.015}"#;
    let req: dedaliano_engine::postprocess::cirsoc301_inputs::Cirsoc301InputsRequest = serde_json::from_str(json).unwrap();
    let v = dedaliano_engine::postprocess::cirsoc301_inputs::answer(&req).unwrap();
    assert_eq!(v, serde_json::json!({"kind": "I", "options": ["flanges", "web", "all"]}));
    let p = geometry_answer(&plate(0.01, 0.2, 0.002)).unwrap();
    assert_eq!(serde_json::to_value(p).unwrap(), serde_json::json!({"kind": "plate", "options": ["all"]}));
    let r = geometry_answer(&NetAreaSection { shape: Some("CHS".into()), ..Default::default() }).unwrap();
    assert_eq!(serde_json::to_value(r).unwrap(), serde_json::json!({"refused": {"code": "tube"}}));
}

fn staggered_plate(lines: f64, pitch: f64, s: f64, g: f64) -> (NetAreaSection, EndConnection) {
    let end = EndConnection::Bolted {
        connected: Connected::All, diameter_mm: Some(20.0), hole_mm: Some(22.0), bolts_per_line: Some(3.0), lines: Some(lines),
        web_lines: None, pitch_mm: Some(pitch), stagger: Some(Stagger { s_mm: Some(s), g_mm: Some(g) }),
    };
    (plate(0.3, 0.012, 0.0036), end)
}

#[test]
fn a_partial_staggered_chain_can_govern() {
    let (p, e) = staggered_plate(4.0, 200.0, 70.0, 70.0);
    let straight = 2.0 * 24.0 * 12.0;
    let full = 4.0 * 24.0 * 12.0 - 3.0 * 70.0 * 70.0 * 12.0 / (4.0 * 70.0);
    let through_1_3_4 = 3.0 * 24.0 * 12.0 - 70.0 * 70.0 * 12.0 / (4.0 * 70.0);
    assert!(through_1_3_4 > straight && through_1_3_4 > full);
    close(ok(&p, &e).an * 1e6, 3600.0 - through_1_3_4, 1e-9);
}

#[test]
fn the_diagonal_to_the_next_bolt_of_the_line_can_be_shorter_than_the_stagger() {
    let (p, e) = staggered_plate(2.0, 80.0, 60.0, 50.0);
    let s = 80.0_f64 - 60.0;
    close(ok(&p, &e).an * 1e6, 3600.0 - (2.0 * 24.0 * 12.0 - s * s * 12.0 / (4.0 * 50.0)), 1e-9);
}

#[test]
fn every_element_connected_needs_bolts_in_the_web_or_the_second_leg() {
    let all = |web_lines: f64| EndConnection::Bolted {
        connected: Connected::All, diameter_mm: Some(16.0), hole_mm: Some(18.0), bolts_per_line: Some(3.0), lines: Some(1.0),
        web_lines: Some(web_lines), pitch_mm: Some(50.0), stagger: None,
    };
    assert_eq!(code(&ipe200(), &all(0.0)), "webLines");
    assert_eq!(code(&l100(), &all(0.0)), "webLines");
    assert_eq!(code(&sec("T", 0.15, 0.2, 0.008, 0.012, 0.0035), &all(0.0)), "webLines");
    assert_eq!(ok(&ipe200(), &all(1.0)).clause, "D.3(1)");
    assert_eq!(ok(&l100(), &all(1.0)).clause, "D.3(1)");
}

#[test]
fn a_stagger_not_shorter_than_the_pitch_is_refused() {
    for s in [80.0, 100.0, 160.0] {
        let (p, e) = staggered_plate(2.0, 80.0, s, 50.0);
        assert_eq!(code(&p, &e), "staggerPitch", "s = {s}");
    }
    let (p, e) = staggered_plate(2.0, 80.0, 40.0, 50.0);
    close(ok(&p, &e).an * 1e6, 3600.0 - (2.0 * 24.0 * 12.0 - 40.0 * 40.0 * 12.0 / 200.0), 1e-9);
    let single = EndConnection::Bolted {
        connected: Connected::All, diameter_mm: Some(20.0), hole_mm: Some(22.0), bolts_per_line: Some(1.0), lines: Some(2.0),
        web_lines: None, pitch_mm: None, stagger: Some(Stagger { s_mm: Some(100.0), g_mm: Some(50.0) }),
    };
    assert_eq!(ok(&p, &single).clause, "D.3(1)");
}
