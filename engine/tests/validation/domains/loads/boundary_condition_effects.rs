/// Validation: Boundary Condition Effects on Beam Behavior
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", Ch. 4-6
///
/// These tests systematically verify how different boundary conditions
/// (fixed, pinned, roller, free) affect deflections, rotations, moments,
/// and reactions for the same beam geometry and loading.
///
/// Tests verify:
///   1. Fixed-fixed vs simply-supported deflection ratio = 5
///   2. Cantilever vs simply-supported deflection ratio = 9.6
///   3. Fixed ends have zero rotation
///   4. Pinned ends have zero moment
///   5. Roller allows horizontal movement under axial load
///   6. Fixed-fixed beam end reactions match analytical formulas
///   7. Propped cantilever deflects more than fixed-fixed
///   8. Increasing fixity reduces deflection: SS > propped > fixed-fixed
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed vs Simply-Supported Deflection Ratio
// ================================================================
//
// Same UDL beam:
//   Fixed-fixed midspan: delta = qL^4 / (384 EI)
//   SS midspan:          delta = 5 qL^4 / (384 EI)
//   Ratio = 5
//
// Source: Timoshenko, Table of Beam Deflections.

#[test]
fn validation_bc_fixed_vs_ss_deflection_ratio() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    // Build fixed-fixed beam with UDL
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();

    // Build simply-supported beam with UDL
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Midspan node
    let mid = n / 2 + 1;
    let d_ff = results_ff.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let d_ss = results_ss.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Ratio of SS to fixed-fixed midspan deflection should be 5
    let ratio = d_ss.uy.abs() / d_ff.uy.abs();
    assert_close(ratio, 5.0, 0.02,
        "BC effect: SS/fixed-fixed deflection ratio = 5");
}

// ================================================================
// 2. Cantilever vs Simply-Supported Deflection Ratio
// ================================================================
//
// Same UDL:
//   Cantilever tip:  delta = qL^4 / (8 EI)
//   SS midspan:      delta = 5 qL^4 / (384 EI)
//   Ratio = 384 / (8 * 5) = 9.6
//
// Source: Gere & Goodno, Table of Beam Deflections.

#[test]
fn validation_bc_cantilever_vs_ss_deflection_ratio() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    // Build cantilever beam with UDL
    let loads_cant: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_cant = make_beam(n, l, E, A, IZ, "fixed", None, loads_cant);
    let results_cant = linear::solve_2d(&input_cant).unwrap();

    // Build simply-supported beam with UDL
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Cantilever tip deflection (free end = last node)
    let tip = results_cant.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // SS midspan deflection
    let mid = n / 2 + 1;
    let d_ss = results_ss.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    // Ratio = cantilever tip / SS midspan = 9.6
    let ratio = tip.uy.abs() / d_ss.uy.abs();
    assert_close(ratio, 9.6, 0.02,
        "BC effect: cantilever/SS deflection ratio = 9.6");
}

// ================================================================
// 3. Fixed End Has Zero Rotation
// ================================================================
//
// Fixed-fixed beam with UDL: rotation at both ends must be zero.
// This is a fundamental kinematic constraint of the fixed support.

#[test]
fn validation_bc_fixed_end_zero_rotation() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_start = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Fixed supports enforce zero rotation
    assert!(d_start.rz.abs() < 1e-10,
        "BC effect: fixed start rz = {:.6e}, expected 0", d_start.rz);
    assert!(d_end.rz.abs() < 1e-10,
        "BC effect: fixed end rz = {:.6e}, expected 0", d_end.rz);
}

// ================================================================
// 4. Pinned End Has Zero Moment
// ================================================================
//
// Simply-supported beam with UDL: moment at pinned end must be zero.
// The pin cannot transmit moment; the first element's m_start must
// be approximately zero.

#[test]
fn validation_bc_pinned_end_zero_moment() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Check moment at start (first element, start end)
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert!(ef_first.m_start.abs() < 1e-6,
        "BC effect: m_start at pin = {:.6e}, expected ~0", ef_first.m_start);

    // Check moment at end (last element, end end)
    let ef_last = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert!(ef_last.m_end.abs() < 1e-6,
        "BC effect: m_end at roller = {:.6e}, expected ~0", ef_last.m_end);
}

// ================================================================
// 5. Roller Allows Horizontal Movement
// ================================================================
//
// Horizontal beam with axial load: one end pinned (ux,uy restrained),
// other end rollerX (only uy restrained). Under axial load, the roller
// end must have nonzero ux displacement while the pinned end stays fixed.

#[test]
fn validation_bc_roller_allows_horizontal_movement() {
    let l = 6.0;
    let n = 4;
    let p_axial = 100.0; // kN axial load at roller end

    // Pinned at start, rollerX at end, axial load at free-to-slide end
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Pinned end: ux = 0 (restrained)
    let d_start = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    assert!(d_start.ux.abs() < 1e-10,
        "BC effect: pinned end ux = {:.6e}, expected 0", d_start.ux);

    // Roller end: ux should be nonzero (free to slide horizontally)
    let d_end = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let e_eff = E * 1000.0;
    let delta_axial = p_axial * l / (e_eff * A); // PL/(EA)
    assert!(d_end.ux.abs() > 1e-10,
        "BC effect: roller end ux = {:.6e}, expected nonzero", d_end.ux);
    assert_close(d_end.ux, delta_axial, 0.02,
        "BC effect: roller ux = PL/(EA)");
}

// ================================================================
// 6. Fixed-Fixed Beam End Reactions
// ================================================================
//
// Fixed-fixed beam with UDL:
//   R = qL/2 (by symmetry)
//   M_end = qL^2/12
//
// Source: AISC Manual, Table 3-23.

#[test]
fn validation_bc_fixed_fixed_reactions() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_start = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();

    // Vertical reaction: R = qL/2
    let r_exact = q.abs() * l / 2.0;
    assert_close(r_start.ry, r_exact, 0.02,
        "BC effect: fixed-fixed R_start = qL/2");
    assert_close(r_end.ry, r_exact, 0.02,
        "BC effect: fixed-fixed R_end = qL/2");

    // Fixed-end moment: M = qL^2/12
    let m_exact = q.abs() * l * l / 12.0;
    assert_close(r_start.mz.abs(), m_exact, 0.02,
        "BC effect: fixed-fixed M_start = qL^2/12");
    assert_close(r_end.mz.abs(), m_exact, 0.02,
        "BC effect: fixed-fixed M_end = qL^2/12");
}

// ================================================================
// 7. Propped Cantilever vs Fixed-Fixed Deflection
// ================================================================
//
// Same UDL: propped cantilever (fixed + roller) has larger max
// deflection than fixed-fixed, because it is less restrained.
//   Propped: delta_max ~ qL^4/(185 EI)
//   Fixed-fixed: delta_max = qL^4/(384 EI)
//   Propped / Fixed-fixed ~ 384/185 ~ 2.08

#[test]
fn validation_bc_propped_vs_fixed_deflection() {
    let l = 6.0;
    let n = 16;
    let q = -10.0;

    // Build propped cantilever (fixed + rollerX)
    let loads_propped: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_propped = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_propped);
    let results_propped = linear::solve_2d(&input_propped).unwrap();

    // Build fixed-fixed beam
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();

    // Max deflection for propped cantilever
    let max_propped = results_propped.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Max deflection for fixed-fixed (at midspan)
    let mid = n / 2 + 1;
    let max_ff = results_ff.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Propped deflection must exceed fixed-fixed
    assert!(max_propped > max_ff,
        "BC effect: propped delta ({:.6e}) > fixed-fixed delta ({:.6e})",
        max_propped, max_ff);

    // Check approximate ratio ~ 384/185 ~ 2.08
    let ratio = max_propped / max_ff;
    assert_close(ratio, 384.0 / 185.0, 0.05,
        "BC effect: propped/fixed-fixed deflection ratio ~ 2.08");
}

// ================================================================
// 8. Adding Fixity Reduces Deflection
// ================================================================
//
// Same beam with UDL, three boundary conditions:
//   SS (pinned + rollerX) > propped (fixed + rollerX) > fixed-fixed
// This ordering confirms that additional restraint reduces deflection.
//
// Analytical values:
//   SS midspan:     5 qL^4 / (384 EI)
//   Propped max:    qL^4 / (185 EI)
//   Fixed midspan:  qL^4 / (384 EI)

#[test]
fn validation_bc_fixity_reduces_deflection() {
    let l = 6.0;
    let n = 16;
    let q = -10.0;

    // Simply-supported
    let input_ss = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();
    let max_ss = results_ss.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Propped cantilever (fixed + rollerX)
    let loads_propped: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_propped = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_propped);
    let results_propped = linear::solve_2d(&input_propped).unwrap();
    let max_propped = results_propped.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Fixed-fixed
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();
    let max_ff = results_ff.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Verify ordering: SS > propped > fixed-fixed
    assert!(max_ss > max_propped,
        "BC effect: SS delta ({:.6e}) > propped delta ({:.6e})",
        max_ss, max_propped);
    assert!(max_propped > max_ff,
        "BC effect: propped delta ({:.6e}) > fixed-fixed delta ({:.6e})",
        max_propped, max_ff);

    // Verify approximate ratios against analytical values
    let e_eff = E * 1000.0;
    let delta_ss_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let delta_ff_exact = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);

    assert_close(max_ss, delta_ss_exact, 0.02,
        "BC effect: SS delta = 5qL^4/(384EI)");
    assert_close(max_ff, delta_ff_exact, 0.05,
        "BC effect: fixed-fixed delta = qL^4/(384EI)");
}
