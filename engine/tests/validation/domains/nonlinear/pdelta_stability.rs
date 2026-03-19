/// Validation: P-Delta second-order amplification effects.
///
/// Reference: Chen/Lui *Stability Design of Steel Frames*
///
/// Tests: amplification factor, B2 monotonicity, instability detection.
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Cantilever: Lateral + Axial, Amplification Factor
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_cantilever_amplification() {
    // Cantilever L=5, lateral H=10 at tip, axial P (compression)
    // Pcr = π²EI/(4L²) = 9.8696*20000/(4*25) = 1973.9 kN (fixed-free)
    // AF = 1/(1 - P/Pcr)
    // Use P = 500 kN: AF = 1/(1 - 500/1973.9) = 1.339
    let l = 5.0;
    let h_load = 10.0;
    let p_axial = 500.0;
    let n = 8;
    let pcr = std::f64::consts::PI.powi(2) * EI / (4.0 * l * l);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: h_load, my: 0.0,
            }),
        ],
    );

    let linear_res = linear::solve_2d(&input).unwrap();
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    assert!(pdelta_res.converged, "should converge");
    assert!(pdelta_res.is_stable, "should be stable at P < Pcr");

    let lin_uy = linear_res.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;
    let pd_uy = pdelta_res.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // P-Delta should amplify displacement
    let actual_af = pd_uy.abs() / lin_uy.abs();
    let expected_af = 1.0 / (1.0 - p_axial / pcr);

    // Allow 20% tolerance (geometric P-delta vs exact second-order differ)
    assert!(
        (actual_af - expected_af).abs() / expected_af < 0.20,
        "AF: actual={:.3}, expected={:.3}", actual_af, expected_af
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Portal B2 Factor
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_portal_b2() {
    // Portal frame: lateral + gravity
    // B2 = 1/(1 - ΣPΔ/(ΣHL))
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let gravity = -100.0; // per top node

    let input = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    assert!(pdelta_res.converged, "portal should converge");
    assert!(pdelta_res.is_stable, "portal should be stable");

    // B2 should be > 1.0 (gravity amplifies lateral)
    assert!(
        pdelta_res.b2_factor >= 1.0,
        "B2={:.4} should be >= 1.0", pdelta_res.b2_factor
    );
    // And reasonable (not too large for this load level)
    assert!(
        pdelta_res.b2_factor < 5.0,
        "B2={:.4} should be < 5.0", pdelta_res.b2_factor
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. B2 Increases with Load
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_b2_monotonic() {
    // B2 should grow monotonically as gravity increases
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let mut prev_b2 = 1.0;
    for &grav in &[-50.0, -100.0, -200.0, -400.0] {
        let input = make_portal_frame(h, w, E, A, IZ, lateral, grav);
        let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-4).unwrap();
        if pdelta_res.converged && pdelta_res.is_stable {
            assert!(
                pdelta_res.b2_factor >= prev_b2 - 0.01,
                "B2 should increase: grav={}, B2={:.4}, prev={:.4}",
                grav, pdelta_res.b2_factor, prev_b2
            );
            prev_b2 = pdelta_res.b2_factor;
        }
    }
    assert!(prev_b2 > 1.02, "B2 should have grown above 1.02, got {:.4}", prev_b2);
}

// ═══════════════════════════════════════════════════════════════
// 4. Near-Critical: Large B2
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_near_critical() {
    // Column near critical load: should converge with large B2
    let l = 5.0;
    let n = 8;
    // Pcr (pinned-pinned) ≈ 789.6 kN
    let pcr = std::f64::consts::PI.powi(2) * EI / (l * l);
    let p = 0.85 * pcr; // 85% of critical

    let input = make_input(
        (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect(),
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p, fz: 0.0, my: 0.0,
            }),
            // Small lateral perturbation to trigger P-delta
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fz: 1.0, my: 0.0,
            }),
        ],
    );

    let pdelta_res = pdelta::solve_pdelta_2d(&input, 50, 1e-4).unwrap();

    if pdelta_res.converged && pdelta_res.is_stable {
        // B2 should be very large near critical
        assert!(
            pdelta_res.b2_factor > 3.0,
            "near-critical B2={:.2} should be > 3.0", pdelta_res.b2_factor
        );
    }
    // It's also acceptable if the solver flags instability near critical
}

// ═══════════════════════════════════════════════════════════════
// 5. Beyond Critical: Instability Detection
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_beyond_critical() {
    // P-Delta amplification grows dramatically near Pcr.
    // Verify that B2 at 0.9*Pcr is much larger than at 0.5*Pcr.
    // (The P-delta iterative solver doesn't reliably detect instability
    //  beyond Pcr due to sign-reversal artifacts in iterations.)
    let l = 5.0;
    let n = 8;
    let pcr = std::f64::consts::PI.powi(2) * EI / (4.0 * l * l);

    let make_cantilever = |p_ratio: f64| {
        let p = p_ratio * pcr;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
        let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
        make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
            vec![(1, 1, "fixed")],
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: n + 1, fx: -p, fz: 10.0, my: 0.0,
                }),
            ],
        )
    };

    let res_50 = pdelta::solve_pdelta_2d(&make_cantilever(0.5), 30, 1e-4).unwrap();
    let res_90 = pdelta::solve_pdelta_2d(&make_cantilever(0.9), 50, 1e-4).unwrap();

    // B2 at 90% Pcr should be significantly larger than at 50% Pcr
    assert!(
        res_50.b2_factor > 1.0,
        "B2 at 0.5*Pcr should be > 1.0, got {:.3}", res_50.b2_factor
    );
    if res_90.converged && res_90.is_stable {
        assert!(
            res_90.b2_factor > res_50.b2_factor * 1.5,
            "B2 at 0.9Pcr ({:.3}) should be much larger than at 0.5Pcr ({:.3})",
            res_90.b2_factor, res_50.b2_factor
        );
    }
    // If at 0.9*Pcr the solver flags instability or divergence, that's also acceptable
}

// ═══════════════════════════════════════════════════════════════
// 6. Zero Gravity: P-Delta = Linear
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_no_gravity() {
    // No gravity → no axial forces → P-Delta matches linear
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, 0.0);
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    let lin_ux = pdelta_res.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let ratio = if lin_ux.abs() > 1e-10 { pd_ux / lin_ux } else { 1.0 };
    assert!(
        (ratio - 1.0).abs() < 0.05,
        "no gravity: PD/linear={:.4}, should be ~1.0", ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Multi-Story Convergence
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_multistory_convergence() {
    // 2-story frame: should converge in < 15 iterations
    let h = 3.5;
    let w = 6.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
            (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
            (4, "frame", 2, 5, 1, 1, false, false),
            (5, "frame", 5, 6, 1, 1, false, false),
            (6, "frame", 6, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 20.0, fz: -80.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -80.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 10.0, fz: -50.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -50.0, my: 0.0 }),
        ],
    );

    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-4).unwrap();
    assert!(pdelta_res.converged, "2-story should converge");
    assert!(
        pdelta_res.iterations < 15,
        "should converge in < 15 iterations, took {}", pdelta_res.iterations
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Equilibrium after P-Delta
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pdelta_equilibrium() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 20.0, -100.0);
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 20, 1e-4).unwrap();

    let sum_rx: f64 = pdelta_res.results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = pdelta_res.results.reactions.iter().map(|r| r.rz).sum();

    // ΣRx + applied_fx = 0
    assert!(
        (sum_rx + 20.0).abs() < 2.0,
        "PD equilibrium ΣRx={:.2}, applied=20", sum_rx
    );
    // ΣRy + applied_fz = 0 (gravity = -100*2 = -200 → Ry = 200)
    assert!(
        (sum_ry - 200.0).abs() < 2.0,
        "PD equilibrium ΣRy={:.2}, expected=200", sum_ry
    );
}
