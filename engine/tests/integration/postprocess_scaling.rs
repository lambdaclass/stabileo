//! Scaling and equivalence tests for the post-processing hot paths.
//!
//! The design checks paired every member against the force list with a linear
//! scan, which is O(members x forces). That is invisible at 100 members and
//! quadratic at 10,000 — and the README's pitch is that the solver runs on
//! every edit.
//!
//! The gate below is deliberately generous (the fixed path finishes in
//! milliseconds); it exists to catch a reintroduced quadratic scan, not to
//! measure anything. The equivalence tests around it pin the behaviour that
//! must not change.

use dedaliano_engine::postprocess::diagrams::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::types::*;
use std::time::Instant;

// ==================== Fixtures ====================

fn rc_member(id: usize) -> RCMemberData {
    RCMemberData {
        element_id: id,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.30,
        h: 0.60,
        d: 0.55,
        d_prime: None,
        as_tension: 1.5e-3,
        as_compression: None,
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    }
}

fn rc_force(id: usize) -> RCDesignForces {
    RCDesignForces {
        element_id: id,
        mu: 100e3 + id as f64,
        vu: Some(50e3),
        nu: None,
    }
}

// ==================== Scaling ====================

/// 20,000 members with the force list in reverse order — the worst case for a
/// linear scan, where every member walks the entire list before matching.
///
/// Quadratic: 1.6e9 comparisons (~31 s in debug). Indexed: 40,000 hash lookups.
#[test]
fn rc_check_scales_linearly_in_member_count() {
    const N: usize = 40_000;

    let members: Vec<RCMemberData> = (0..N).map(rc_member).collect();
    let forces: Vec<RCDesignForces> = (0..N).rev().map(rc_force).collect();

    let t0 = Instant::now();
    let results = check_rc_members(&RCCheckInput { members, forces });
    let elapsed = t0.elapsed();

    assert_eq!(results.len(), N);
    println!("rc_check over {N} members: {:.1}ms", elapsed.as_secs_f64() * 1000.0);
    assert!(
        elapsed.as_secs() < 20,
        "{N} members took {:.1}s — the member/force pairing has gone quadratic again",
        elapsed.as_secs_f64()
    );
}

/// Pairing by id must be order-independent: a force list in a different order
/// from the member list has to reach the same members.
#[test]
fn rc_check_pairs_members_and_forces_by_id() {
    let members: Vec<RCMemberData> = (1..=4).map(rc_member).collect();
    let forces: Vec<RCDesignForces> = vec![rc_force(3), rc_force(1), rc_force(4), rc_force(2)];

    let results = check_rc_members(&RCCheckInput { members, forces });

    assert_eq!(results.len(), 4);
    for r in &results {
        // mu was seeded as 100e3 + id, so the ratio must track the id.
        let expected = (100e3 + r.element_id as f64) / r.phi_mn;
        assert!(
            (r.flexure_ratio - expected).abs() < 1e-9,
            "element {} got the wrong force record",
            r.element_id
        );
    }
}

/// A member with no matching force record is still skipped.
#[test]
fn rc_check_skips_members_without_forces() {
    let members: Vec<RCMemberData> = (1..=3).map(rc_member).collect();
    let forces = vec![rc_force(1), rc_force(3)];

    let results = check_rc_members(&RCCheckInput { members, forces });

    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);
}

// ==================== Diagram equivalence ====================

fn element_forces_with_loads() -> ElementForces {
    ElementForces {
        element_id: 1,
        n_start: -30e3,
        n_end: -30e3,
        v_start: 45e3,
        v_end: -35e3,
        m_start: 0.0,
        m_end: 0.0,
        length: 8.0,
        q_i: 0.0,
        q_j: 0.0,
        point_loads: vec![
            PointLoadInfo { a: 6.0, p: -20e3, px: Some(5e3), my: Some(3e3) },
            PointLoadInfo { a: 2.0, p: -15e3, px: None, my: None },
            PointLoadInfo { a: 4.0, p: -10e3, px: None, my: None },
        ],
        distributed_loads: vec![
            DistributedLoadInfo { q_i: -5e3, q_j: -8e3, a: 1.0, b: 7.0 },
            DistributedLoadInfo { q_i: -2e3, q_j: -2e3, a: 0.0, b: 8.0 },
        ],
        hinge_start: false,
        hinge_end: false,
    }
}

/// Hoisting the per-station allocations must not move any diagram value.
/// These are the values the current implementation produces; they pin it.
#[test]
fn diagram_values_are_unchanged_by_hoisting() {
    let ef = element_forces_with_loads();
    let sorted = sorted_point_loads(&ef);

    for kind in ["moment", "shear", "axial"] {
        for i in 0..=20 {
            let t = i as f64 / 20.0;
            let direct = compute_diagram_value_at(kind, t, &ef);
            let presorted = compute_diagram_value_at_sorted(kind, t, &ef, &sorted);
            assert!(
                (direct - presorted).abs() < 1e-9,
                "{kind} at t={t}: {direct} vs {presorted}"
            );
            assert!(direct.is_finite(), "{kind} at t={t} is not finite");
        }
    }
}

/// Point loads must be sorted ascending by position, whatever order they arrive
/// in — the diagram evaluator walks them in order.
#[test]
fn point_loads_are_sorted_by_position() {
    let sorted = sorted_point_loads(&element_forces_with_loads());
    let positions: Vec<f64> = sorted.iter().map(|p| p.a).collect();
    assert_eq!(positions, vec![2.0, 4.0, 6.0]);
}

/// Known values on a simple case, so the equivalence test above is anchored to
/// something rather than only to itself.
///
/// Simply supported 8 m span, V(0) = 45 kN, single 15 kN point load at 2 m:
///   M(4 m) = 45·4 - 15·(4-2) = 180 - 30 = 150 kN·m
///   V(3 m) = 45 - 15 = 30 kN
#[test]
fn diagram_values_match_hand_calculation() {
    let ef = ElementForces {
        element_id: 1,
        n_start: 0.0, n_end: 0.0,
        v_start: 45e3, v_end: -30e3,
        m_start: 0.0, m_end: 0.0,
        length: 8.0,
        q_i: 0.0, q_j: 0.0,
        point_loads: vec![PointLoadInfo { a: 2.0, p: -15e3, px: None, my: None }],
        distributed_loads: vec![],
        hinge_start: false, hinge_end: false,
    };

    let m_mid = compute_diagram_value_at("moment", 0.5, &ef);
    assert!((m_mid.abs() - 150e3).abs() < 1.0, "M(4 m) = 150 kN·m, got {m_mid:.0}");

    let v_at_3 = compute_diagram_value_at("shear", 3.0 / 8.0, &ef);
    assert!((v_at_3 - 30e3).abs() < 1.0, "V(3 m) = 30 kN, got {v_at_3:.0}");
}
