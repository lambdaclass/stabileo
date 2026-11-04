//! CIRSOC 201-2025 isolated footings (`postprocess::isolated_footing`), against hand values.

use dedaliano_engine::certify::design::certify_isolated_footings;
use dedaliano_engine::postprocess::isolated_footing::*;

fn base() -> IsolatedFootingData {
    IsolatedFootingData {
        footing_id: 1,
        kind: FootingKind::Isolated,
        b: 2.0,
        l: 2.0,
        thickness: 0.5,
        d: 0.42,
        column_b: 0.4,
        column_h: 0.4,
        fc: 25.0,
        allowable_bearing: 200.0,
        service_axial: 600.0,
        factored_axial: 840.0,
        service_moment_b: 0.0,
        service_moment_l: 0.0,
        factored_moment_b: 0.0,
        factored_moment_l: 0.0,
        eccentricity_b: 0.0,
        eccentricity_l: 0.0,
        position: ColumnPosition::Interior,
        rho_w: None,
        moment_tolerance: None,
    }
}

fn close(a: f64, b: f64, tol: f64) {
    assert!((a - b).abs() <= tol * b.abs().max(1.0), "{a} vs {b}");
}

#[test]
fn centred_footing_matches_hand_values() {
    let r = check_isolated_footing(&base());
    // Bearing: 600 / 4 = 150 kPa against 200.
    close(r.bearing.q_max, 150.0, 1e-12);
    close(r.bearing.q_min, 150.0, 1e-12);
    close(r.bearing.utilization, 0.75, 1e-12);
    assert_eq!(r.bearing.status, FootingStatus::Ok);

    // Factored pressure 840 / 4 = 210 kPa. One-way: a = 1 − 0,2 − 0,42 = 0,38 m,
    // Vu = 210·0,38·2 = 159,6 kN.
    let ow = r.one_way_shear.as_ref().unwrap();
    close(ow.vu, 159.6, 1e-12);
    close(ow.cantilever, 0.38, 1e-12);
    // φVc = 0,75·0,66·λs·0,0018^⅓·√25·2·0,42·1000, λs = √(2/(1+0,004·420)).
    let ls = (2.0f64 / (1.0 + 0.004 * 420.0)).sqrt();
    let phi_vc = 0.75 * 0.66 * ls * 0.0018f64.cbrt() * 5.0 * 2.0 * 0.42 * 1000.0;
    close(ow.phi_vc, phi_vc, 1e-12);
    close(ow.utilization, 159.6 / phi_vc, 1e-12);

    // Punching: bo = 4·0,82 = 3,28 m, enclosed 0,6724 m², Vu = 840 − 210·0,6724.
    let p = r.punching.as_ref().unwrap();
    close(p.bo, 3.28, 1e-12);
    close(p.enclosed_area, 0.6724, 1e-12);
    let vu_kn = 840.0 - 210.0 * 0.6724;
    close(p.demand_vu, vu_kn, 1e-12);
    // vc = min(0,33; 0,17·3; 0,083·(2 + 40·0,42/3,28))·λs·5.
    let vc = (0.33f64).min(0.17 * 3.0).min(0.083 * (2.0 + 40.0 * 0.42 / 3.28)) * ls * 5.0;
    close(p.vc, vc, 1e-12);
    close(p.vu, vu_kn / (3.28 * 0.42) / 1000.0, 1e-12);
    close(p.utilization, p.vu / (0.75 * vc), 1e-12);
    assert_eq!(p.moment_transfer, MomentTransferStatus::None);

    // Flexure: c = 0,8 m, Mu = 2·0,8²·(3·210)/6 = 134,4 kN·m.
    close(r.flexure_b.mu, 134.4, 1e-12);
    close(r.flexure_l.mu, 134.4, 1e-12);
    assert_eq!(r.status, FootingStatus::Ok);
    assert!(r.refusals.is_empty());
}

#[test]
fn service_and_factored_loads_are_separate() {
    // A bearing failure under service loads does not come from the factored axial force.
    let mut f = base();
    f.service_axial = 900.0; // 225 kPa > 200
    f.factored_axial = 500.0;
    let r = check_isolated_footing(&f);
    assert_eq!(r.bearing.status, FootingStatus::Fail);
    close(r.bearing.q_max, 225.0, 1e-12);
    close(r.q_factored, 125.0, 1e-12);
    close(r.one_way_shear.as_ref().unwrap().vu, 125.0 * 0.38 * 2.0, 1e-12);
    assert_eq!(r.status, FootingStatus::Fail);
}

#[test]
fn eccentricity_moves_the_pressure_and_both_faces_are_tried() {
    // Service moment about L-axis offset the resultant along B: e = 60/600 = 0,1 m.
    let mut f = base();
    f.service_moment_b = 60.0;
    let r = check_isolated_footing(&f);
    // q = 150·(1 ± 6·0,1/2) = 195 / 105.
    close(r.bearing.q_max, 195.0, 1e-12);
    close(r.bearing.q_min, 105.0, 1e-12);

    // The footing's centroid 0,2 m from the node along B: the column sits at −0,2 from the
    // centroid, so the long cantilever (1,2 − 0,2 = 1,0 m) is on the high side.
    let mut g = base();
    g.eccentricity_b = 0.2;
    let r = check_isolated_footing(&g);
    close(r.bearing.b.column_offset, -0.2, 1e-12);
    // Resultant at −0,2 under N alone: q = 150·(1 ± 0,6) = 240 / 60.
    close(r.bearing.q_max, 240.0, 1e-12);
    assert_eq!(r.bearing.status, FootingStatus::Fail);
    // Flexure along B: high-side cantilever 1 + 0,2 − 0,2 = 1,0 m (c = B/2 − u − cb/2), with the
    // pressure falling towards that edge; low side 0,6 m under the heavy edge.
    let fl = &r.flexure_b;
    assert!(fl.side.is_some());
    let q = |u: f64| 210.0 * (1.0 + 12.0 * (-0.2) * u / 4.0);
    let m_high = 2.0 * 1.0f64.powi(2) * (2.0 * q(0.0) + q(1.0)) / 6.0;
    let m_low = 2.0 * 0.6f64.powi(2) * (2.0 * q(-0.4) + q(-1.0)) / 6.0;
    close(fl.mu, m_high.max(m_low), 1e-12);
}

#[test]
fn uplift_refuses_instead_of_reporting_a_linear_peak() {
    let mut f = base();
    f.service_moment_b = 250.0; // e = 0,417 > B/6 = 0,333
    let r = check_isolated_footing(&f);
    assert!(r.bearing.uplift);
    assert_eq!(r.bearing.status, FootingStatus::Unsupported);
    assert_eq!(r.status, FootingStatus::Unsupported);
    assert!(r.refusals.contains(&FootingRefusal::BearingUplift));

    let mut g = base();
    g.factored_moment_b = 400.0; // e = 0,476
    let r = check_isolated_footing(&g);
    assert!(r.factored_uplift);
    assert!(r.one_way_shear.is_none() && r.punching.is_none());
    assert_eq!(r.flexure_b.mu, 0.0);
    assert!(r.refusals.contains(&FootingRefusal::FactoredUplift));
}

#[test]
fn biaxial_kern_is_the_rhombus() {
    // 0,2 m along each axis: each below B/6 = 0,333, together 6·0,2/2·2 = 1,2 > 1.
    let mut f = base();
    f.service_moment_b = 120.0;
    f.service_moment_l = 120.0;
    let r = check_isolated_footing(&f);
    assert!(!r.bearing.b.outside_kern && !r.bearing.l.outside_kern);
    assert!(r.bearing.uplift);
}

#[test]
fn punching_refuses_a_significant_or_unformed_moment() {
    let mut f = base();
    f.factored_moment_b = 60.0;
    let r = check_isolated_footing(&f);
    let p = r.punching.as_ref().unwrap();
    assert!(p.significant);
    assert_eq!(p.moment_transfer, MomentTransferStatus::UnsupportedMomentTransferNotEvaluated);
    assert_eq!(r.status, FootingStatus::Unsupported);

    let mut g = base();
    g.position = ColumnPosition::Edge;
    let r = check_isolated_footing(&g);
    let p = r.punching.as_ref().unwrap();
    assert_eq!(p.moment_transfer, MomentTransferStatus::UnsupportedMomentNotFormed);
    // Edge perimeter: 2·0,82 + 0,82, αs = 30.
    close(p.bo, 3.0 * 0.82, 1e-12);
    assert_eq!(p.alpha_s, 30.0);
}

#[test]
fn other_kinds_are_refused_by_name() {
    let mut f = base();
    f.kind = FootingKind::Combined;
    let r = check_isolated_footing(&f);
    assert_eq!(r.status, FootingStatus::Unsupported);
    assert_eq!(r.refusals, vec![FootingRefusal::KindNotImplemented]);
}

#[test]
fn certified_enclosures_contain_the_f64_ratios() {
    let mut cases = vec![base()];
    let mut f = base();
    f.eccentricity_b = 0.1;
    f.footing_id = 2;
    cases.push(f);
    let mut g = base();
    g.b = 2.6;
    g.service_moment_l = 30.0;
    g.footing_id = 3;
    cases.push(g);
    let certified = certify_isolated_footings(&IsolatedFootingInput { footings: cases.clone() });
    for (c, f) in certified.iter().zip(&cases) {
        let r = check_isolated_footing(f);
        let ow = r.one_way_shear.as_ref().unwrap().utilization;
        let pu = r.punching.as_ref().unwrap().utilization;
        if r.punching.as_ref().unwrap().significant {
            assert!(!c.certified, "a significant moment is not certified");
            continue;
        }
        assert!(c.certified, "{:?}", c.reason);
        for (e, v) in c.checks.iter().zip([r.bearing.utilization, ow, pu]) {
            assert!(e.lower <= v && v <= e.upper, "{}: {v} not in [{}, {}]", e.name, e.lower, e.upper);
            assert!(e.upper - e.lower <= 1e-12 * v.max(1.0));
        }
        assert_eq!(c.certified_ok, r.worst_utilization < 1.0);
    }
}

#[test]
fn certified_refuses_uplift() {
    let mut f = base();
    f.service_moment_b = 250.0;
    let c = certify_isolated_footings(&IsolatedFootingInput { footings: vec![f] });
    assert!(!c[0].certified && !c[0].certified_ok);
}
