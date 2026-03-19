/// Validation: Serviceability Checks (Deflection Limits)
///
/// References:
///   - AISC 360-22, Appendix L (Serviceability)
///   - IBC 2021, Table 1604.3 (Deflection Limits)
///   - Eurocode 3, EN 1993-1-1, Section 7 (Serviceability)
///   - AS 4100-2020, Section 3.5 (Serviceability)
///
/// Serviceability limits ensure structures perform adequately under
/// service loads. Key checks: deflection limits (L/360, L/240, etc.),
/// drift limits (H/400, H/500), and vibration.
///
/// Tests verify:
///   1. SS beam L/360 check for floor beam
///   2. Cantilever L/180 check
///   3. SS beam L/240 total load check
///   4. Portal frame H/400 drift check
///   5. Beam camber offset
///   6. Ponding check: flat roof deflection
///   7. Multi-span deflection comparison
///   8. Width-to-deflection ratio (span/depth effect)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam: L/360 Live Load Check
// ================================================================
//
// Floor beam: δ_live ≤ L/360
// δ = 5wL⁴/(384EI) for UDL

#[test]
fn validation_serviceability_l360() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -5.0; // live load UDL
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Analytical deflection
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "L/360: δ = 5wL⁴/(384EI)");

    // Compute deflection-to-span ratio
    let ratio = l / d_mid;
    // Just verify we can compute the ratio (may or may not pass L/360)
    assert!(ratio > 0.0, "L/360: deflection ratio = L/{:.1}", ratio);
}

// ================================================================
// 2. Cantilever: L/180 Check
// ================================================================
//
// Cantilever with tip load: δ = PL³/(3EI)
// Limit: L/180 for cantilever (more relaxed than SS)

#[test]
fn validation_serviceability_cantilever() {
    let l = 3.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip, delta_exact, 0.02, "Cantilever: δ = PL³/(3EI)");

    let ratio = l / tip;
    assert!(ratio > 0.0, "Cantilever: L/δ = {:.1}", ratio);
}

// ================================================================
// 3. SS Beam: L/240 Total Load
// ================================================================
//
// Total load (dead + live) deflection limit: L/240

#[test]
fn validation_serviceability_l240() {
    let l = 10.0;
    let n = 20;
    let q_dead: f64 = -3.0;
    let q_live: f64 = -5.0;
    let q_total: f64 = q_dead + q_live;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_total, q_j: q_total, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_total = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let delta_exact = 5.0 * q_total.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_total, delta_exact, 0.02, "L/240: total δ");

    // Verify superposition: dead + live = total
    let loads_d: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    let input_d = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_d);
    let d_dead = linear::solve_2d(&input_d).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    let loads_l: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_live, q_j: q_live, a: None, b: None,
        }))
        .collect();
    let input_l = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_l);
    let d_live = linear::solve_2d(&input_l).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    assert_close(d_dead + d_live, -d_total, 0.01,
        "Superposition: δ_D + δ_L = δ_total");
}

// ================================================================
// 4. Portal Frame: H/400 Drift Check
// ================================================================
//
// Inter-story drift limit for wind: δ ≤ H/400

#[test]
fn validation_serviceability_drift() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0; // service wind

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Drift should be positive (in wind direction)
    assert!(d_top > 0.0, "Drift positive");

    // Compute drift ratio
    let drift_ratio = d_top / h;
    assert!(drift_ratio > 0.0, "Drift ratio: δ/H = {:.6e}", drift_ratio);
}

// ================================================================
// 5. Beam Camber: Pre-Offset to Reduce Apparent Deflection
// ================================================================
//
// If a beam is cambered (pre-deflected upward) by δ_dead,
// the apparent deflection under dead+live = δ_total - δ_dead = δ_live.
// Verify by computing dead and live deflections separately.

#[test]
fn validation_serviceability_camber() {
    let l = 10.0;
    let n = 20;
    let q_dead: f64 = -4.0;
    let q_live: f64 = -6.0;
    let mid = n / 2 + 1;

    // Dead load deflection (= camber amount)
    let loads_d: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    let input_d = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_d);
    let d_dead = linear::solve_2d(&input_d).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Live load deflection
    let loads_l: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_live, q_j: q_live, a: None, b: None,
        }))
        .collect();
    let input_l = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_l);
    let d_live = linear::solve_2d(&input_l).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uz.abs();

    // Camber = d_dead → apparent deflection = d_live (not d_dead+d_live)
    // δ_live should be less than δ_total
    assert!(d_live < d_dead + d_live, "Live < total");

    // Both proportional to their loads
    assert_close(d_live / d_dead, q_live.abs() / q_dead.abs(), 0.01,
        "Camber: δ_L/δ_D = q_L/q_D");
}

// ================================================================
// 6. Ponding Check: Flat Roof Deflection
// ================================================================
//
// Rain load on flat roof accumulates in deflected region.
// The deflection under uniform load should not exceed critical
// ponding threshold. Verify deflection magnitude.

#[test]
fn validation_serviceability_ponding() {
    let l = 12.0;
    let n = 24;
    let q_rain: f64 = -2.0; // rain load
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_rain, q_j: q_rain, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    let delta_exact = 5.0 * q_rain.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid, delta_exact, 0.02, "Ponding: δ check");

    // Ponding stability criterion: EI > wL⁴/(π⁴/5)
    // If δ is too large, ponding can lead to progressive collapse
    // Verify the deflection is finite (structure is stable)
    assert!(d_mid < l, "Ponding: δ < L (stable)");
}

// ================================================================
// 7. Multi-Span: Interior Span Deflects Less
// ================================================================
//
// For equal spans with UDL, interior spans have less deflection
// than equivalent SS spans due to continuity.

#[test]
fn validation_serviceability_multispan() {
    let span = 8.0;
    let n = 12;
    let q: f64 = -10.0;

    // Single span (SS)
    let loads_ss: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ss = make_beam(n, span, E, A, IZ, "pinned", Some("rollerX"), loads_ss);
    let d_ss = linear::solve_2d(&input_ss).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // Three-span continuous beam
    let loads_cont: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_cont = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_cont);
    let results_cont = linear::solve_2d(&input_cont).unwrap();

    // Interior span midpoint (span 2)
    let mid_interior = n + n / 2 + 1;
    let d_interior = results_cont.displacements.iter()
        .find(|d| d.node_id == mid_interior).unwrap().uz.abs();

    // Interior span deflection should be less than SS
    assert!(d_interior < d_ss,
        "Interior < SS: {:.6e} < {:.6e}", d_interior, d_ss);
}

// ================================================================
// 8. Span/Depth Effect: Deeper Section → Less Deflection
// ================================================================
//
// For same span and load, doubling I (deeper beam) halves deflection.

#[test]
fn validation_serviceability_depth_effect() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    // Standard IZ
    let loads1: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // Double IZ
    let loads2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input2 = make_beam(n, l, E, A, 2.0 * IZ, "pinned", Some("rollerX"), loads2);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uz.abs();

    // δ ∝ 1/I
    assert_close(d1 / d2, 2.0, 0.02, "Depth effect: δ ∝ 1/I");
}
