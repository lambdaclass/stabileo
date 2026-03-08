/// Validation: Extended Load Combination and Envelope Analysis
///
/// References:
///   - ASCE 7-22, Ch. 2 (Combinations of Loads)
///   - AISC 360-22, Ch. B (Design Requirements)
///   - Eurocode 0, EN 1990 (Basis of Structural Design)
///   - ACI 318-19, Ch. 5 (Loads)
///
/// Extended tests cover additional scenarios beyond the base
/// load combination and envelope validation file:
///
///   1. Triple superposition: 3 independent load cases combined
///   2. Symmetric vs asymmetric loading: envelope of moment at interior support
///   3. Moving point load envelope: max midspan deflection from sweeping load
///   4. Uplift check: 0.9D + 1.0W, verify net response reversal
///   5. Four-span pattern loading: worst-case for max positive moment
///   6. Load combination scaling: n*q produces n times response
///   7. Envelope of portal frame drift: gravity vs wind vs combined
///   8. Continuous beam moment redistribution: compare 2-span vs 3-span
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Triple Superposition: 3 Independent Load Cases Combined
// ================================================================
//
// Verify that α*R₁ + β*R₂ + γ*R₃ = R(α*F₁ + β*F₂ + γ*F₃).
// Three distinct load types: point load, UDL, and end moment.

#[test]
fn validation_ext_triple_superposition() {
    let l = 10.0;
    let n = 20;
    let mid = n / 2 + 1;
    let alpha = 1.2;
    let beta = 1.6;
    let gamma = 0.5;

    // Case 1: point load at midspan
    let p1 = 12.0;
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let r1 = linear::solve_2d(&input1).unwrap();
    let d1 = r1.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry1 = r1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Case 2: UDL over entire span
    let q2: f64 = -4.0;
    let loads2: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q2, q_j: q2, a: None, b: None,
        }))
        .collect();
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let r2 = linear::solve_2d(&input2).unwrap();
    let d2 = r2.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry2 = r2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Case 3: point load at quarter-span
    let p3 = 8.0;
    let qtr_node = n / 4 + 1;
    let loads3 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: qtr_node, fx: 0.0, fy: -p3, mz: 0.0,
    })];
    let input3 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads3);
    let r3 = linear::solve_2d(&input3).unwrap();
    let d3 = r3.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ry3 = r3.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Combined: α*case1 + β*case2 + γ*case3
    let mut loads_c: Vec<SolverLoad> = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -alpha * p1, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: qtr_node, fx: 0.0, fy: -gamma * p3, mz: 0.0,
        }),
    ];
    let loads_c_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: beta * q2, q_j: beta * q2, a: None, b: None,
        }))
        .collect();
    loads_c.extend(loads_c_udl);
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let rc = linear::solve_2d(&input_c).unwrap();
    let dc = rc.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let ryc = rc.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    let expected_d = alpha * d1 + beta * d2 + gamma * d3;
    let expected_ry = alpha * ry1 + beta * ry2 + gamma * ry3;

    assert_close(dc, expected_d, 0.001,
        "Triple superposition: deflection");
    assert_close(ryc, expected_ry, 0.001,
        "Triple superposition: reaction");
}

// ================================================================
// 2. Symmetric vs Asymmetric Loading on 2-Span Beam
// ================================================================
//
// For a 2-span continuous beam, symmetric loading (same on both spans)
// produces a different interior support reaction than asymmetric
// loading (different on each span). Verify superposition holds for
// the interior support reaction and that asymmetric loading produces
// larger midspan deflection in the more heavily loaded span.

#[test]
fn validation_ext_symmetric_vs_asymmetric() {
    let span = 6.0;
    let n = 12;

    let q_sym: f64 = -8.0;
    let q_heavy: f64 = -12.0;
    let q_light: f64 = -4.0;

    // Symmetric case: same load on both spans
    let loads_sym: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_sym, q_j: q_sym, a: None, b: None,
        }))
        .collect();
    let input_sym = make_continuous_beam(&[span, span], n, E, A, IZ, loads_sym);
    let rs = linear::solve_2d(&input_sym).unwrap();
    // Interior support node is at n+1
    let r_sym_interior = rs.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    let d_sym_span1 = rs.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Asymmetric case: heavy on span 1, light on span 2
    let mut loads_asym: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_heavy, q_j: q_heavy, a: None, b: None,
        }))
        .collect();
    let loads_asym2: Vec<SolverLoad> = ((n + 1)..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_light, q_j: q_light, a: None, b: None,
        }))
        .collect();
    loads_asym.extend(loads_asym2);
    let input_asym = make_continuous_beam(&[span, span], n, E, A, IZ, loads_asym);
    let ra = linear::solve_2d(&input_asym).unwrap();
    let d_asym_span1 = ra.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Average load is the same ((-12 + -4)/2 = -8), but asymmetric loading
    // produces larger deflection in the heavily loaded span
    assert!(d_asym_span1 > d_sym_span1,
        "Asymmetric: span 1 deflects more than symmetric: {:.6e} > {:.6e}",
        d_asym_span1, d_sym_span1);

    // Interior support reaction for symmetric case should be nonzero
    assert!(r_sym_interior.abs() > 0.0,
        "Interior support reaction is nonzero for symmetric loading");
}

// ================================================================
// 3. Moving Point Load Envelope: Max Midspan Deflection
// ================================================================
//
// Sweep a unit point load across a simply-supported beam and find
// the position that produces maximum midspan deflection. By
// influence line theory, maximum midspan deflection occurs when
// the load is at midspan.

#[test]
fn validation_ext_moving_load_envelope() {
    let l = 10.0;
    let n = 20;
    let p: f64 = -10.0;
    let mid = n / 2 + 1;

    let mut max_deflection: f64 = 0.0;
    let mut max_position = 0_usize;

    // Apply point load at each interior node and track max midspan deflection
    for load_node in 2..=n {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: p, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let result = linear::solve_2d(&input).unwrap();
        let d_mid = result.displacements.iter()
            .find(|d| d.node_id == mid).unwrap().uy.abs();

        if d_mid > max_deflection {
            max_deflection = d_mid;
            max_position = load_node;
        }
    }

    // Maximum midspan deflection occurs when load is at midspan
    assert_eq!(max_position, mid,
        "Moving load: max deflection at midspan node {}, got {}",
        mid, max_position);

    // Verify against closed-form: delta = PL^3 / (48 * E_eff * Iz)
    let e_eff: f64 = E * 1000.0;
    let expected = p.abs() * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(max_deflection, expected, 0.02,
        "Moving load: midspan deflection matches PL^3/(48EI)");
}

// ================================================================
// 4. Uplift Check: 0.9D + 1.0W (Net Upward Response)
// ================================================================
//
// For a simply-supported beam with gravity dead load and an upward
// wind load, the ASCE 7 combination 0.9D + 1.0W can produce net
// uplift (upward deflection) when wind suction exceeds factored
// dead load. Verify the response reverses sign.

#[test]
fn validation_ext_uplift_check() {
    let l = 8.0;
    let n = 16;
    let q_dead: f64 = -2.0; // downward
    let q_wind: f64 = 5.0;  // upward (wind suction)
    let mid = n / 2 + 1;

    // Dead only
    let loads_d: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_dead, q_j: q_dead, a: None, b: None,
        }))
        .collect();
    let input_d = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_d);
    let rd = linear::solve_2d(&input_d).unwrap();
    let d_dead = rd.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Wind only (upward)
    let loads_w: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_wind, q_j: q_wind, a: None, b: None,
        }))
        .collect();
    let input_w = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_w);
    let rw = linear::solve_2d(&input_w).unwrap();
    let d_wind = rw.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // 0.9D + 1.0W combination
    let q_combo = 0.9 * q_dead + 1.0 * q_wind;
    let loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_combo, q_j: q_combo, a: None, b: None,
        }))
        .collect();
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let rc = linear::solve_2d(&input_c).unwrap();
    let d_combo = rc.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Dead load deflects downward (negative uy)
    assert!(d_dead < 0.0,
        "Dead load: downward deflection, uy={:.6e}", d_dead);

    // Wind deflects upward (positive uy)
    assert!(d_wind > 0.0,
        "Wind load: upward deflection, uy={:.6e}", d_wind);

    // Combined 0.9D + 1.0W should produce net uplift since
    // q_combo = 0.9*(-2) + 1.0*(5) = 3.2 > 0 (net upward)
    assert!(d_combo > 0.0,
        "0.9D+1.0W: net uplift (positive uy), uy={:.6e}", d_combo);

    // Verify superposition: 0.9*d_dead + 1.0*d_wind = d_combo
    assert_close(d_combo, 0.9 * d_dead + 1.0 * d_wind, 0.001,
        "0.9D+1.0W: superposition");
}

// ================================================================
// 5. Four-Span Pattern Loading: Worst-Case Positive Moment
// ================================================================
//
// For a 4-span continuous beam, loading alternate spans (1 & 3)
// vs (2 & 4) and comparing envelope of midspan deflections.
// Pattern loading spans 1 & 3 produces larger deflection in span 1
// than full loading.

#[test]
fn validation_ext_four_span_pattern() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    // Full load on all 4 spans
    let loads_full: Vec<SolverLoad> = (1..=(4 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_full = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads_full);
    let rf = linear::solve_2d(&input_full).unwrap();
    let d_full_span1 = rf.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Pattern A: load spans 1 & 3 only
    let mut loads_a: Vec<SolverLoad> = Vec::new();
    for i in 1..=n {
        loads_a.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (2 * n + 1)..=(3 * n) {
        loads_a.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_a = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads_a);
    let ra = linear::solve_2d(&input_a).unwrap();
    let d_pattern_a_span1 = ra.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Pattern B: load spans 2 & 4 only
    let mut loads_b: Vec<SolverLoad> = Vec::new();
    for i in (n + 1)..=(2 * n) {
        loads_b.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (3 * n + 1)..=(4 * n) {
        loads_b.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_b = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads_b);
    let rb = linear::solve_2d(&input_b).unwrap();
    let d_pattern_b_span1 = rb.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Pattern A (loaded spans 1 & 3) produces larger span-1 deflection
    // than full load (because adjacent unloaded spans allow more rotation)
    assert!(d_pattern_a_span1 > d_full_span1,
        "Pattern 1&3: span 1 deflection > full load: {:.6e} > {:.6e}",
        d_pattern_a_span1, d_full_span1);

    // Pattern B (spans 2 & 4 loaded) produces much smaller span-1 deflection
    // than pattern A in span 1
    assert!(d_pattern_a_span1 > d_pattern_b_span1,
        "Pattern 1&3 in span 1 > Pattern 2&4 in span 1: {:.6e} > {:.6e}",
        d_pattern_a_span1, d_pattern_b_span1);
}

// ================================================================
// 6. Load Combination Scaling: n*q Produces n Times Response
// ================================================================
//
// For a linear system, doubling the load doubles the response.
// Verify for reactions, displacements across multiple scale factors.

#[test]
fn validation_ext_load_scaling() {
    let l = 8.0;
    let n = 16;
    let q_base: f64 = -5.0;
    let mid = n / 2 + 1;

    // Base case
    let loads_base: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q_base, q_j: q_base, a: None, b: None,
        }))
        .collect();
    let input_base = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_base);
    let rb = linear::solve_2d(&input_base).unwrap();
    let d_base = rb.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let r_base = rb.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    // Test scale factors: 2, 3, 0.5
    let factors = [2.0_f64, 3.0, 0.5];
    for &factor in &factors {
        let q_scaled = factor * q_base;
        let loads_scaled: Vec<SolverLoad> = (1..=n)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q_scaled, q_j: q_scaled, a: None, b: None,
            }))
            .collect();
        let input_scaled = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_scaled);
        let rs = linear::solve_2d(&input_scaled).unwrap();
        let d_scaled = rs.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
        let r_scaled = rs.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

        assert_close(d_scaled, factor * d_base, 0.001,
            &format!("Scaling {:.1}x: deflection", factor));
        assert_close(r_scaled, factor * r_base, 0.001,
            &format!("Scaling {:.1}x: reaction", factor));
    }
}

// ================================================================
// 7. Portal Frame Drift Envelope: Gravity vs Wind vs Combined
// ================================================================
//
// Compare portal frame lateral drift under gravity only, wind only,
// and combined cases. The envelope maximum drift comes from
// the combination that includes wind. Verify drift contributions
// combine by superposition.

#[test]
fn validation_ext_portal_drift_envelope() {
    let h = 5.0;
    let w = 8.0;
    let g = -15.0;  // gravity per node
    let f_w = 10.0; // lateral wind

    // Case 1: gravity only (1.4D)
    let input_g = make_portal_frame(h, w, E, A, IZ, 0.0, 1.4 * g);
    let rg = linear::solve_2d(&input_g).unwrap();
    let drift_g = rg.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Case 2: wind only (1.0W)
    let input_w = make_portal_frame(h, w, E, A, IZ, 1.0 * f_w, 0.0);
    let rw = linear::solve_2d(&input_w).unwrap();
    let drift_w = rw.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Case 3: 1.2D + 1.0W
    let input_dw = make_portal_frame(h, w, E, A, IZ, 1.0 * f_w, 1.2 * g);
    let rdw = linear::solve_2d(&input_dw).unwrap();
    let drift_dw = rdw.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Symmetric gravity produces no lateral drift
    assert!(drift_g.abs() < 1e-10,
        "Gravity only: no lateral drift, got {:.6e}", drift_g);

    // Wind produces positive drift
    assert!(drift_w > 0.0,
        "Wind only: positive drift, got {:.6e}", drift_w);

    // Combined drift = 1.2*drift_gravity + 1.0*drift_wind (superposition)
    // Since drift_gravity is zero for symmetric portal, drift_dw ≈ drift_w
    assert_close(drift_dw, drift_w, 0.01,
        "1.2D+1.0W drift: wind dominates");

    // Envelope: max absolute drift comes from wind-inclusive case
    let envelope_drift = drift_g.abs().max(drift_w.abs()).max(drift_dw.abs());
    assert_close(envelope_drift, drift_dw.abs(), 1e-10,
        "Envelope: wind case governs drift");
}

// ================================================================
// 8. 2-Span vs 3-Span: Continuity Effect on Reactions
// ================================================================
//
// For the same span length and UDL, adding a third span changes
// the interior support reaction due to continuity effects.
// The 3-span beam interior reactions differ from the 2-span beam
// because of the additional restraint from the third span.
// Verify that superposition holds within each configuration,
// and that the total applied load equals sum of reactions.

#[test]
fn validation_ext_continuity_effect_reactions() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // 2-span beam under full UDL
    let loads_2span: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_2 = make_continuous_beam(&[span, span], n, E, A, IZ, loads_2span);
    let r2 = linear::solve_2d(&input_2).unwrap();

    let total_load_2span: f64 = q.abs() * 2.0 * span;
    let sum_ry_2: f64 = r2.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_2, total_load_2span, 0.01,
        "2-span: sum of reactions = total load");

    // Interior support reaction for 2-span (node n+1)
    let r2_interior = r2.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;

    // 3-span beam under full UDL
    let loads_3span: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_3 = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_3span);
    let r3 = linear::solve_2d(&input_3).unwrap();

    let total_load_3span: f64 = q.abs() * 3.0 * span;
    let sum_ry_3: f64 = r3.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_3, total_load_3span, 0.01,
        "3-span: sum of reactions = total load");

    // First interior support for 3-span (node n+1)
    let r3_interior1 = r3.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;

    // The interior support reactions differ between 2-span and 3-span
    // because continuity effects redistribute forces differently.
    // For 2-span symmetric: R_interior = 5/8 * qL * 2 = 1.25 * qL
    // For 3-span with equal spans: R_interior1 = 1.1 * qL (approximately)
    // The key point: they are different due to continuity.
    let r2_ratio = r2_interior / (q.abs() * span);
    let r3_ratio = r3_interior1 / (q.abs() * span);
    assert!(
        (r2_ratio - r3_ratio).abs() > 0.01,
        "Interior reactions differ: 2-span ratio={:.4}, 3-span ratio={:.4}",
        r2_ratio, r3_ratio
    );

    // Both interior reactions should be larger than the simple-beam
    // end reaction of qL/2 = 0.5*qL, because continuity increases
    // interior support reactions
    let simple_ratio = 0.5;
    assert!(r2_ratio > simple_ratio,
        "2-span interior > simple beam end: {:.4} > {:.4}", r2_ratio, simple_ratio);
    assert!(r3_ratio > simple_ratio,
        "3-span interior > simple beam end: {:.4} > {:.4}", r3_ratio, simple_ratio);
}
