/// Validation: Extended Buckling Eigenvalue Analysis
///
/// Tests the linearized buckling solver (solve_buckling_2d) against
/// classical Euler column formulas and frame stability benchmarks.
///
/// References:
///   - Euler: Pcr = pi^2 * EI / (K*L)^2
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 2
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-4
///   - AISC 360, Appendix 7 (Effective Length Method)
///
/// Convention: E is in MPa; the solver uses E * 1000.0 internally (kN/m^2).
///
/// K factors for ideal conditions:
///   K = 1.0  pin-pin         Pcr = pi^2 EI / L^2
///   K = 2.0  fixed-free      Pcr = pi^2 EI / (2L)^2
///   K = 0.699  fixed-pin     Pcr = 2.046 * pi^2 EI / L^2
///   K = 0.5  fixed-fixed     Pcr = 4 * pi^2 EI / L^2
mod helpers;

use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;       // MPa
const E_EFF: f64 = E * 1000.0;  // kN/m^2 (effective stiffness used by solver)
const A: f64 = 0.01;            // m^2
const IZ: f64 = 1e-4;           // m^4
const EI: f64 = E_EFF * IZ;     // 20,000 kN*m^2
const L: f64 = 5.0;             // m
const P: f64 = 100.0;           // kN reference load (applied as compression)

// ================================================================
// 1. Pin-Pin Column: Pcr = pi^2 * EI / L^2
// ================================================================
//
// Boundary conditions: pinned at base (ux, uy fixed), rollerX at top
// (uy fixed, ux free). Effective length factor K = 1.0.
//
// Pcr = pi^2 * 20,000 / 25 = 7,895.68 kN
// lambda = Pcr / P = 78.957

#[test]
fn buckling_ext_pin_pin_column() {
    let n_elem = 8;
    let input = make_column(n_elem, L, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let pcr_exact = std::f64::consts::PI.powi(2) * EI / (L * L);
    let lambda_exact = pcr_exact / P;

    let lambda1 = result.modes[0].load_factor;
    assert_close(lambda1, lambda_exact, 0.01,
        "Pin-pin Euler buckling: lambda");

    // Verify Pcr directly
    let pcr_computed = lambda1 * P;
    assert_close(pcr_computed, pcr_exact, 0.01,
        "Pin-pin Euler buckling: Pcr");
}

// ================================================================
// 2. Fixed-Free Column (Cantilever): Pcr = pi^2 * EI / (2L)^2
// ================================================================
//
// Boundary conditions: fixed at base (ux, uy, rz all restrained),
// free at tip (no support). K = 2.0.
//
// Pcr = pi^2 * 20,000 / (4 * 25) = 1,973.92 kN
// lambda = Pcr / P = 19.739

#[test]
fn buckling_ext_fixed_free_column() {
    let n_elem = 8;
    let elem_len = L / n_elem as f64;

    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at base only; free tip
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1, fx: -P, fy: 0.0, mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let pcr_exact = std::f64::consts::PI.powi(2) * EI / (4.0 * L * L);
    let lambda_exact = pcr_exact / P;

    let lambda1 = result.modes[0].load_factor;
    assert_close(lambda1, lambda_exact, 0.05,
        "Fixed-free Euler buckling: lambda");
}

// ================================================================
// 3. Fixed-Pin Column: Pcr = 2.046 * pi^2 * EI / L^2
// ================================================================
//
// Boundary conditions: fixed at base, rollerX at top (uy restrained,
// ux and rz free). Effective length factor K ~ 0.699.
//
// Pcr = 2.046 * pi^2 * 20,000 / 25 = 16,154.0 kN
// lambda = Pcr / P = 161.54

#[test]
fn buckling_ext_fixed_pin_column() {
    let n_elem = 8;
    let elem_len = L / n_elem as f64;

    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at base, rollerX at top (pinned end: uy restrained, ux free, rz free)
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![
            (1, 1, "fixed"),
            (2, n_elem + 1, "rollerX"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1, fx: -P, fy: 0.0, mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let pcr_pp = std::f64::consts::PI.powi(2) * EI / (L * L);
    let pcr_exact = 2.046 * pcr_pp;
    let lambda_exact = pcr_exact / P;

    let lambda1 = result.modes[0].load_factor;

    // Fixed-pinned should give approximately 2.046x the pinned-pinned value
    let ratio = lambda1 / (pcr_pp / P);
    assert!(
        ratio > 1.8 && ratio < 2.3,
        "Fixed-pin ratio to pin-pin: {:.3}, expected ~2.046", ratio
    );
    assert_close(lambda1, lambda_exact, 0.10,
        "Fixed-pin Euler buckling: lambda");
}

// ================================================================
// 4. Fixed-Fixed Column: Pcr = 4 * pi^2 * EI / L^2
// ================================================================
//
// Boundary conditions: fixed at base, guidedX at top (uy + rz
// restrained, ux free for axial load application). K = 0.5.
//
// Pcr = 4 * pi^2 * 20,000 / 25 = 31,583 kN
// lambda = Pcr / P = 315.83

#[test]
fn buckling_ext_fixed_fixed_column() {
    let n_elem = 8;
    let elem_len = L / n_elem as f64;

    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at base, guidedX at top (uy + rz restrained, ux free)
    // This models a fixed-fixed column where the top can translate axially
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![
            (1, 1, "fixed"),
            (2, n_elem + 1, "guidedX"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1, fx: -P, fy: 0.0, mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let pcr_exact = 4.0 * std::f64::consts::PI.powi(2) * EI / (L * L);
    let lambda_exact = pcr_exact / P;

    let lambda1 = result.modes[0].load_factor;

    // Fixed-fixed should be approximately 4x pinned-pinned
    let pcr_pp = std::f64::consts::PI.powi(2) * EI / (L * L);
    let ratio = (lambda1 * P) / pcr_pp;
    assert!(
        ratio > 3.5 && ratio < 4.5,
        "Fixed-fixed ratio to pin-pin: {:.3}, expected ~4.0", ratio
    );
    assert_close(lambda1, lambda_exact, 0.05,
        "Fixed-fixed Euler buckling: lambda");
}

// ================================================================
// 5. Portal Frame Sway Buckling: Effective Length > L
// ================================================================
//
// A portal frame with pinned bases under gravity loads buckles in a
// sway mode. The effective length of the columns exceeds L because
// the frame is unbraced (sway-permitted). The eigenvalue from the
// buckling solver should give a critical load factor consistent
// with K_eff > 1.0 for the columns.
//
// Geometry: 2 columns (height h) + 1 beam (span w), pinned bases.

#[test]
fn buckling_ext_portal_frame_sway() {
    let h = 4.0;
    let w = 6.0;
    let p_gravity = -200.0; // kN per column top

    // Portal frame: pinned bases (sway-permitted)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    let lambda1 = result.modes[0].load_factor;
    let pcr_column = lambda1 * p_gravity.abs();

    // For an isolated pinned-pinned column of height h:
    let pcr_isolated = std::f64::consts::PI.powi(2) * EI / (h * h);

    // Sway frame: effective length > h, so Pcr < isolated pin-pin Pcr
    // The frame column is stiffer than a free cantilever but weaker than
    // an isolated pin-pin column because the frame can sway.
    assert!(
        pcr_column < pcr_isolated,
        "Sway frame Pcr={:.1} should be less than isolated pin-pin Pcr={:.1} \
         (effective length > L due to sway)",
        pcr_column, pcr_isolated
    );

    // The effective length factor K should be > 1.0
    // Back-calculate K: Pcr = pi^2 EI / (K*h)^2 => K = pi * sqrt(EI/Pcr) / h
    let k_eff = std::f64::consts::PI * (EI / pcr_column).sqrt() / h;
    assert!(
        k_eff > 1.0,
        "Sway frame effective length factor K={:.3} should exceed 1.0", k_eff
    );

    // Sanity: load factor should be positive and finite
    assert!(lambda1 > 0.0 && lambda1.is_finite(),
        "Load factor should be positive and finite: {:.4}", lambda1);
}

// ================================================================
// 6. Multi-Story Frame: Lowest Eigenvalue is Sway Mode
// ================================================================
//
// A two-story portal frame (pinned bases) under gravity. The
// lowest buckling mode corresponds to the global sway mode. The
// second eigenvalue should be higher (local or antisymmetric mode).
//
// Geometry:
//   Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(0,2h), 6(w,2h)
//   Columns: 1-2, 3-4, 2-5, 3-6
//   Beams: 2-3, 5-6

#[test]
fn buckling_ext_multistory_frame_sway_mode() {
    let h = 3.5;
    let w = 6.0;
    let p_gravity = -150.0; // kN per top node

    let nodes = vec![
        (1, 0.0, 0.0),    // left base
        (2, 0.0, h),      // left floor 1
        (3, w, h),        // right floor 1
        (4, w, 0.0),      // right base
        (5, 0.0, 2.0 * h),// left floor 2
        (6, w, 2.0 * h),  // right floor 2
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col story 1
        (2, "frame", 2, 3, 1, 1, false, false), // beam story 1
        (3, "frame", 3, 4, 1, 1, false, false), // right col story 1
        (4, "frame", 2, 5, 1, 1, false, false), // left col story 2
        (5, "frame", 5, 6, 1, 1, false, false), // beam story 2
        (6, "frame", 6, 3, 1, 1, false, false), // right col story 2
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![
        // Gravity on floor 1
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        // Gravity on floor 2
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();

    // Should have at least 2 modes
    assert!(
        result.modes.len() >= 2,
        "Multi-story frame should yield at least 2 buckling modes, got {}",
        result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;
    let lambda2 = result.modes[1].load_factor;

    // Eigenvalues should be in ascending order
    assert!(
        lambda2 >= lambda1 * 0.99,
        "Second eigenvalue lambda2={:.4} should be >= lambda1={:.4}",
        lambda2, lambda1
    );

    // First mode (sway): look at horizontal displacements of floor nodes
    // In a sway mode, floor nodes displace laterally in the same direction
    let mode1 = &result.modes[0];
    let ux_node2 = mode1.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let ux_node5 = mode1.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().ux;

    // Both floor levels should sway in the same direction (same sign)
    // for the fundamental sway mode
    assert!(
        ux_node2 * ux_node5 > 0.0 || ux_node2.abs() < 1e-6 || ux_node5.abs() < 1e-6,
        "Sway mode: floor displacements should have same sign. \
         ux(node2)={:.6}, ux(node5)={:.6}",
        ux_node2, ux_node5
    );

    // Load factor should be positive
    assert!(lambda1 > 0.0, "First load factor should be positive: {:.4}", lambda1);
}

// ================================================================
// 7. Braced Frame: Eigenvalue > Unbraced Case
// ================================================================
//
// Comparing the same portal frame with pinned bases (unbraced/sway)
// vs fixed bases (braced). The braced frame should have a higher
// critical load factor because the effective length is shorter.

#[test]
fn buckling_ext_braced_vs_unbraced_frame() {
    let h = 4.0;
    let w = 6.0;
    let p_gravity = -200.0;

    // --- Unbraced frame: pinned bases ---
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
    ];

    let input_unbraced = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems.clone(),
        vec![(1, 1, "pinned"), (2, 4, "pinned")],
        loads.clone(),
    );

    // --- Braced frame: fixed bases ---
    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        loads,
    );

    let result_unbraced = buckling::solve_buckling_2d(&input_unbraced, 2).unwrap();
    let result_braced = buckling::solve_buckling_2d(&input_braced, 2).unwrap();

    let lambda_unbraced = result_unbraced.modes[0].load_factor;
    let lambda_braced = result_braced.modes[0].load_factor;

    // Braced (fixed bases) should have a higher critical load factor
    assert!(
        lambda_braced > lambda_unbraced,
        "Braced frame lambda={:.4} should exceed unbraced lambda={:.4}",
        lambda_braced, lambda_unbraced
    );

    // The ratio should be substantial: fixed bases roughly double the
    // effective stiffness compared to pinned bases for sway buckling
    let ratio = lambda_braced / lambda_unbraced;
    assert!(
        ratio > 1.5,
        "Braced/unbraced ratio={:.3} should be > 1.5 (significant improvement)",
        ratio
    );
}

// ================================================================
// 8. Variable Section Column: Bounds Between Uniform Sections
// ================================================================
//
// A column with two different sections (stiffer lower half, weaker
// upper half) should have a critical load bounded between:
//   - Pcr of a uniform column with the weak section (lower bound)
//   - Pcr of a uniform column with the strong section (upper bound)
//
// This tests that the eigenvalue solver correctly handles non-uniform
// stiffness distributions.

#[test]
fn buckling_ext_variable_section_column() {
    let n_half = 4;
    let n_total = 2 * n_half;
    let elem_len = L / n_total as f64;

    // Section properties
    let iz_strong = 2e-4; // m^4 (lower half)
    let iz_weak = 5e-5;   // m^4 (upper half)
    let a_strong = 0.015;
    let a_weak = 0.008;

    // Build the variable-section column manually
    let nodes: Vec<_> = (0..=n_total)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Lower half uses section 1 (strong), upper half uses section 2 (weak)
    let mut elems = Vec::new();
    for i in 0..n_half {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in n_half..n_total {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 2, false, false));
    }

    let input_variable = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_strong, iz_strong), (2, a_weak, iz_weak)],
        elems,
        vec![
            (1, 1, "pinned"),
            (2, n_total + 1, "rollerX"),
        ],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_total + 1, fx: -P, fy: 0.0, mz: 0.0,
        })],
    );

    // Uniform columns for bounds
    let input_weak = make_column(n_total, L, E, a_weak, iz_weak, "pinned", "rollerX", -P);
    let input_strong = make_column(n_total, L, E, a_strong, iz_strong, "pinned", "rollerX", -P);

    let result_variable = buckling::solve_buckling_2d(&input_variable, 2).unwrap();
    let result_weak = buckling::solve_buckling_2d(&input_weak, 1).unwrap();
    let result_strong = buckling::solve_buckling_2d(&input_strong, 1).unwrap();

    let pcr_variable = result_variable.modes[0].load_factor * P;
    let pcr_weak = result_weak.modes[0].load_factor * P;
    let pcr_strong = result_strong.modes[0].load_factor * P;

    // Variable section Pcr should be bounded by the two uniform cases
    assert!(
        pcr_variable > pcr_weak * 0.95,
        "Variable section Pcr={:.1} should exceed weak uniform Pcr={:.1}",
        pcr_variable, pcr_weak
    );
    assert!(
        pcr_variable < pcr_strong * 1.05,
        "Variable section Pcr={:.1} should be less than strong uniform Pcr={:.1}",
        pcr_variable, pcr_strong
    );

    // Variable should be strictly between the two (not equal to either)
    assert!(
        pcr_variable > pcr_weak && pcr_variable < pcr_strong,
        "Variable Pcr={:.1} should be strictly between weak={:.1} and strong={:.1}",
        pcr_variable, pcr_weak, pcr_strong
    );
}
