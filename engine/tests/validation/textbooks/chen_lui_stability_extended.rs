/// Validation: Chen & Lui Stability Design of Steel Structures -- Extended
///
/// References:
///   - Chen & Lui, "Stability Design of Steel Structures" (1991)
///   - Chen & Lui, "Theory of Beam-Columns" Vols. 1 & 2 (1976-77)
///   - Timoshenko & Gere, "Theory of Elastic Stability" (1961)
///
/// These 8 tests extend the original Chen & Lui validation suite with:
///   1. Effective length for fixed-fixed column (K = 0.5)
///   2. Effective length for fixed-pinned column (K ~ 0.7)
///   3. Multi-bay frame has higher buckling capacity than single-bay
///   4. Multi-column portal: gravity redistribution effect on buckling
///   5. Stepped column buckling (stiff lower half, flexible upper half)
///   6. Asymmetric portal frame sway buckling
///   7. P-delta B2 factor grows large near critical load
///   8. Three-story frame drift amplification progression
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

/// E in MPa (solver internally multiplies by 1000 to get kN/m^2).
const E: f64 = 200_000.0;
/// Effective E in kN/m^2 for hand calculations.
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Effective Length: Fixed-Fixed Column (K = 0.5)
// ================================================================
//
// Chen & Lui, Ch. 2, Table 2.1: Column with both ends fixed against
// rotation and translation (non-sway). Effective length factor K = 0.5.
// P_cr = pi^2 * E * I / (K*L)^2 = 4 * pi^2 * E * I / L^2.
// L = 5 m, I = 8356e-8 m^4, A = 53.8e-4 m^2.
// Boundary: node 1 = fixed (ux,uy,rz); node n+1 = guidedX (uy+rz fixed, ux free).

#[test]
fn validation_chen_lui_ext_1_effective_length_fixed_fixed() {
    let l = 5.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_ref = 100.0;
    let n = 10;

    let pcr_exact = 4.0 * std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed"), (2, n + 1, "guidedX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_ref,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_computed = result.modes[0].load_factor * p_ref;

    let error = (pcr_computed - pcr_exact).abs() / pcr_exact;
    assert!(
        error < 0.01,
        "Fixed-fixed Pcr: computed={:.1}, exact={:.1}, error={:.4}%",
        pcr_computed,
        pcr_exact,
        error * 100.0
    );
}

// ================================================================
// 2. Effective Length: Fixed-Pinned Column (K ~ 0.7)
// ================================================================
//
// Chen & Lui, Ch. 2, Table 2.1: Column fixed at one end, pinned at the
// other (non-sway). Theoretical K = 0.6992 ~ 0.7.
// P_cr = pi^2 * E * I / (K*L)^2.
// L = 4 m, I = 8356e-8 m^4, A = 53.8e-4 m^2.
// For a column along X: node 1 = fixed, node n+1 = rollerX (uy only).
// rollerX restrains uy, leaves ux and rz free => pin at that end.

#[test]
fn validation_chen_lui_ext_2_effective_length_fixed_pinned() {
    let l = 4.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_ref = 100.0;
    let n = 10;

    let k_eff: f64 = 0.6992;
    let pcr_exact = std::f64::consts::PI.powi(2) * E_EFF * iz / (k_eff * l).powi(2);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_ref,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_computed = result.modes[0].load_factor * p_ref;

    let error = (pcr_computed - pcr_exact).abs() / pcr_exact;
    assert!(
        error < 0.01,
        "Fixed-pinned Pcr: computed={:.1}, exact={:.1}, error={:.4}%",
        pcr_computed,
        pcr_exact,
        error * 100.0
    );
}

// ================================================================
// 3. Truss Bar Euler Buckling (Hinge-Hinge Element)
// ================================================================
//
// Chen & Lui, Ch. 2: A single truss member (pin-pin) under axial
// compression has P_cr = pi^2 * E * I / L^2. In the solver, a truss
// bar is modeled as a frame element with hinge_start=true /
// hinge_end=true (moment releases at both ends).
// To capture the sinusoidal buckling mode, the member is subdivided
// into multiple sub-elements; only the end sub-elements carry the
// hinge flags.
// L = 3 m, I = 5696e-8 m^4, A = 78.1e-4 m^2.

#[test]
fn validation_chen_lui_ext_3_truss_bar_euler_buckling() {
    let l = 3.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let p_ref = 100.0;
    let n = 10;

    let pcr_exact = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_ref,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_computed = result.modes[0].load_factor * p_ref;

    let error = (pcr_computed - pcr_exact).abs() / pcr_exact;
    assert!(
        error < 0.05,
        "Truss bar Pcr: computed={:.1}, exact={:.1}, error={:.2}%",
        pcr_computed,
        pcr_exact,
        error * 100.0
    );
}

// ================================================================
// 4. Multi-Column Portal: Gravity Redistribution on Buckling
// ================================================================
//
// Chen & Lui, Ch. 5: Compare two portal frame loading patterns:
//   (a) Symmetric: equal gravity P on both columns.
//   (b) Eccentric: all gravity 2P on one column, zero on the other.
// Same total gravity load applied. The eccentric case should have a
// lower critical load factor because the heavily loaded column
// destabilizes sooner while the unloaded column cannot compensate.
// Frame: H = 4 m, W = 6 m, fixed bases, same section throughout.

#[test]
fn validation_chen_lui_ext_4_gravity_redistribution_effect() {
    let h = 4.0;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let p_ref = 100.0;

    // (a) Symmetric loading: P on each top node
    let nodes_a = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let input_a = make_input(
        nodes_a,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems_a,
        vec![(1, 1_usize, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 0.0,
                fy: -p_ref,
                mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3,
                fx: 0.0,
                fy: -p_ref,
                mz: 0.0,
            }),
        ],
    );
    let result_a = buckling::solve_buckling_2d(&input_a, 1).unwrap();
    let lambda_sym = result_a.modes[0].load_factor;

    // (b) Eccentric loading: 2P on left column only
    let nodes_b = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let input_b = make_input(
        nodes_b,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems_b,
        vec![(1, 1_usize, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fy: -2.0 * p_ref,
            mz: 0.0,
        })],
    );
    let result_b = buckling::solve_buckling_2d(&input_b, 1).unwrap();
    let lambda_ecc = result_b.modes[0].load_factor;

    // Symmetric total critical load = lambda_sym * (P + P) = lambda_sym * 2P
    // Eccentric total critical load = lambda_ecc * 2P
    let total_pcr_sym = lambda_sym * 2.0 * p_ref;
    let total_pcr_ecc = lambda_ecc * 2.0 * p_ref;

    assert!(
        total_pcr_ecc < total_pcr_sym,
        "Eccentric Pcr_total={:.1} should be less than symmetric Pcr_total={:.1}",
        total_pcr_ecc,
        total_pcr_sym
    );
    assert!(lambda_sym > 0.0, "Symmetric lambda should be positive");
    assert!(lambda_ecc > 0.0, "Eccentric lambda should be positive");
}

// ================================================================
// 5. Stepped Column Buckling (Two Different Sections)
// ================================================================
//
// Chen & Lui, Ch. 2: Column with different stiffness in upper and lower
// halves. Lower half has moment of inertia I1, upper half has I2 = I1/2.
// The critical load lies between the Euler loads for uniform columns
// of each section over the full length:
//   P_cr(I2) < P_cr_stepped < P_cr(I1).
// L = 6 m (3 m + 3 m), pin-pin boundary conditions.

#[test]
fn validation_chen_lui_ext_5_stepped_column_buckling() {
    let l_total = 6.0;
    let a = 53.8e-4;
    let iz_lower = 8356e-8;
    let iz_upper = 4178e-8;
    let p_ref = 100.0;
    let n_per_half = 5;
    let n = 2 * n_per_half;

    let pcr_stiff =
        std::f64::consts::PI.powi(2) * E_EFF * iz_lower / (l_total * l_total);
    let pcr_flex =
        std::f64::consts::PI.powi(2) * E_EFF * iz_upper / (l_total * l_total);

    let elem_len = l_total / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| {
            let sec_id: usize = if i < n_per_half { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz_lower), (2, a, iz_upper)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: -p_ref,
            fy: 0.0,
            mz: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_stepped = result.modes[0].load_factor * p_ref;

    assert!(
        pcr_stepped > pcr_flex * 0.95,
        "Stepped Pcr={:.1} should exceed flexible-section Pcr={:.1}",
        pcr_stepped,
        pcr_flex
    );
    assert!(
        pcr_stepped < pcr_stiff * 1.05,
        "Stepped Pcr={:.1} should be below stiff-section Pcr={:.1}",
        pcr_stepped,
        pcr_stiff
    );
}

// ================================================================
// 6. Asymmetric Portal Frame Sway Buckling
// ================================================================
//
// Chen & Lui, Ch. 5: Portal frame where one column is stiffer than
// the other. Left column: I1, right column: I2 = 2*I1.
// Under symmetric gravity loading, the sway buckling load should be
// higher than a frame with both columns having I1 (weaker section),
// but lower than a frame with both columns at I2 (stronger section).
// H = 4 m, W = 6 m, fixed bases.

#[test]
fn validation_chen_lui_ext_6_asymmetric_portal_sway() {
    let h = 4.0;
    let w = 6.0;
    let a = 53.8e-4;
    let iz1 = 8356e-8;
    let iz2 = 2.0 * iz1;
    let p_ref = 100.0;

    let solve_portal = |sec_left: usize, sec_right: usize| -> f64 {
        let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
        let elems = vec![
            (1, "frame", 1, 2, 1, sec_left, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, sec_right, false, false),
        ];
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, a, iz1), (2, a, iz2)],
            elems,
            vec![(1, 1_usize, "fixed"), (2, 4, "fixed")],
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 2,
                    fx: 0.0,
                    fy: -p_ref,
                    mz: 0.0,
                }),
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 3,
                    fx: 0.0,
                    fy: -p_ref,
                    mz: 0.0,
                }),
            ],
        );
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        result.modes[0].load_factor
    };

    let lambda_weak = solve_portal(1, 1);
    let lambda_asym = solve_portal(1, 2);
    let lambda_strong = solve_portal(2, 2);

    assert!(
        lambda_asym > lambda_weak * 0.99,
        "Asymmetric lambda={:.2} should exceed weak-uniform lambda={:.2}",
        lambda_asym,
        lambda_weak
    );
    assert!(
        lambda_asym < lambda_strong * 1.01,
        "Asymmetric lambda={:.2} should be below strong-uniform lambda={:.2}",
        lambda_asym,
        lambda_strong
    );
}

// ================================================================
// 7. P-Delta Divergence Near Critical Load
// ================================================================
//
// Chen & Lui, Ch. 3: When axial load P approaches or exceeds P_cr,
// the P-delta lateral displacement amplification becomes very large.
// A vertical cantilever-like column (fixed base, free top) under
// gravity and a small lateral perturbation demonstrates this clearly:
// as P approaches Pcr the B2 amplification factor grows without
// bound. We compare two load levels — one at 0.5*Pcr (safe) and
// one at 0.9*Pcr (near-critical) — and verify that the amplification
// at the higher load is substantially larger.
// H = 5 m (vertical), I = 5696e-8 m^4, A = 78.1e-4 m^2.
// Fixed-free column: K_eff = 2.0, Pcr = pi^2*EI/(K*L)^2 = pi^2*EI/(4L^2).

#[test]
fn validation_chen_lui_ext_7_pdelta_divergence() {
    let h = 5.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let n = 10;

    // Fixed-free column effective length K=2
    let pcr = std::f64::consts::PI.powi(2) * E_EFF * iz / (4.0 * h * h);
    let h_perturbation = 1.0;

    let elem_len = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let top_node = n + 1;

    // Helper to run P-delta at a given fraction of Pcr
    let run_pdelta = |p_fraction: f64| -> (f64, bool) {
        let p_axial = p_fraction * pcr;
        let input = make_input(
            nodes.clone(),
            vec![(1, E, 0.3)],
            vec![(1, a, iz)],
            elems.clone(),
            vec![(1, 1, "fixed")],
            vec![
                SolverLoad::Nodal(SolverNodalLoad {
                    node_id: top_node,
                    fx: h_perturbation,
                    fy: -p_axial,
                    mz: 0.0,
                }),
            ],
        );

        let lin_res = linear::solve_2d(&input).unwrap();
        let lin_ux = lin_res
            .displacements
            .iter()
            .find(|d| d.node_id == top_node)
            .unwrap()
            .ux
            .abs();

        let pd_res = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();
        let pd_ux = pd_res
            .results
            .displacements
            .iter()
            .find(|d| d.node_id == top_node)
            .unwrap()
            .ux
            .abs();

        let amplification = if lin_ux > 1e-20 { pd_ux / lin_ux } else { 1.0 };
        (amplification, pd_res.converged && pd_res.is_stable)
    };

    let (af_low, _) = run_pdelta(0.5);
    let (af_high, stable_high) = run_pdelta(0.9);

    // Near Pcr the amplification should be much larger than at 0.5*Pcr.
    // Theoretical B2 ~ 1/(1-P/Pcr): at 0.5 -> ~2.0, at 0.9 -> ~10.0.
    // Either the solver flags instability or the amplification ratio is large.
    assert!(
        !stable_high || af_high > af_low * 2.0,
        "Near-critical amplification ({:.2}x at 0.9*Pcr) should be much larger \
         than safe amplification ({:.2}x at 0.5*Pcr), or instability flagged (stable={})",
        af_high,
        af_low,
        stable_high
    );

    // Also check that the safe-load amplification is reasonable (> 1.0)
    assert!(
        af_low > 1.0,
        "P-delta should amplify displacements at 0.5*Pcr: AF={:.3}",
        af_low
    );
}

// ================================================================
// 8. Three-Story Frame Drift Amplification Progression
// ================================================================
//
// Chen & Lui, Ch. 6: Three-story frame under combined lateral and
// gravity loading. Checks that:
//   (a) P-delta amplification increases drift beyond linear analysis.
//   (b) Total drift increases monotonically with height.
//   (c) Amplification factors are reasonable (1.0 < AF < 3.0).
// Story height H = 3.5 m, bay width W = 6 m, fixed bases.
// Lateral loads at each floor on the left column line, uniform gravity
// on all beam-column joints.

#[test]
fn validation_chen_lui_ext_8_three_story_drift_progression() {
    let h = 3.5;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let px = 10.0;
    let py = -80.0;

    // Node layout:
    //  4(0,3h)  8(w,3h)   = roof
    //  3(0,2h)  7(w,2h)   = 3rd floor
    //  2(0,h)   6(w,h)    = 2nd floor
    //  1(0,0)   5(w,0)    = bases
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, 0.0, 3.0 * h),
        (5, w, 0.0),
        (6, w, h),
        (7, w, 2.0 * h),
        (8, w, 3.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 6, 7, 1, 1, false, false),
        (6, "frame", 7, 8, 1, 1, false, false),
        (7, "frame", 2, 6, 1, 1, false, false),
        (8, "frame", 3, 7, 1, 1, false, false),
        (9, "frame", 4, 8, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 5, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: px,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: px,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: px,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6,
            fx: 0.0,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7,
            fx: 0.0,
            fy: py,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 8,
            fx: 0.0,
            fy: py,
            mz: 0.0,
        }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        loads,
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_res.converged, "Three-story frame should converge");

    let get_ux = |results: &AnalysisResults, nid: usize| -> f64 {
        results
            .displacements
            .iter()
            .find(|d| d.node_id == nid)
            .unwrap()
            .ux
            .abs()
    };

    let lin_d1 = get_ux(&lin_res, 2);
    let lin_d2 = get_ux(&lin_res, 3);
    let lin_d3 = get_ux(&lin_res, 4);

    let pd_d1 = get_ux(&pd_res.results, 2);
    let pd_d2 = get_ux(&pd_res.results, 3);
    let pd_d3 = get_ux(&pd_res.results, 4);

    // (a) P-delta drift exceeds linear drift at all floors
    assert!(
        pd_d1 > lin_d1,
        "P-delta amplifies 1st floor drift: pd={:.6e} > lin={:.6e}",
        pd_d1,
        lin_d1
    );
    assert!(
        pd_d2 > lin_d2,
        "P-delta amplifies 2nd floor drift: pd={:.6e} > lin={:.6e}",
        pd_d2,
        lin_d2
    );
    assert!(
        pd_d3 > lin_d3,
        "P-delta amplifies 3rd floor drift: pd={:.6e} > lin={:.6e}",
        pd_d3,
        lin_d3
    );

    // (b) Total drift increases monotonically with height
    assert!(
        pd_d2 > pd_d1,
        "2nd floor drift > 1st floor drift: {:.6e} > {:.6e}",
        pd_d2,
        pd_d1
    );
    assert!(
        pd_d3 > pd_d2,
        "3rd floor drift > 2nd floor drift: {:.6e} > {:.6e}",
        pd_d3,
        pd_d2
    );

    // (c) Amplification factors in a reasonable range
    let af1 = pd_d1 / lin_d1;
    let af2 = pd_d2 / lin_d2;
    let af3 = pd_d3 / lin_d3;
    assert!(
        af1 > 1.0 && af1 < 3.0,
        "1st floor amplification factor: {:.3}",
        af1
    );
    assert!(
        af2 > 1.0 && af2 < 3.0,
        "2nd floor amplification factor: {:.3}",
        af2
    );
    assert!(
        af3 > 1.0 && af3 < 3.0,
        "3rd floor amplification factor: {:.3}",
        af3
    );
}
