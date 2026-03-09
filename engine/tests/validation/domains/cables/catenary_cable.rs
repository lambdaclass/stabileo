/// Validation: Cable/Catenary-like Truss Structures
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5 (Cables)
///
/// These tests model cable-like structures as linear truss approximations.
/// All V-cable elements carry only axial tension under gravity-type loading.
///
/// Sign convention: n_start > 0 = tension, n_start < 0 = compression.
///
/// Note: A simple chain of truss elements (more than 2 bars between 2 supports)
/// is a mechanism in 2D (M+R < 2N). Therefore multi-segment cable tests use
/// triangulated truss configurations or V-cables (3 nodes, 2 bars).
///
/// Tests:
///   1. Simple cable with single midspan point load
///   2. Asymmetric V-cable with off-center load
///   3. Cable sag effect on horizontal thrust
///   4. Triangulated cable truss approximating parabolic shape
///   5. All-tension verification for symmetric V-cable
///   6. Cable vs arch: opposite axial sign comparison
///   7. Shallow cable amplification of tension
///   8. Horizontal cable equilibrium under combined loading
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.001; // m^2 cable cross-section
const IZ: f64 = 1e-8; // small value; truss elements ignore bending stiffness

// ================================================================
// 1. Simple Cable with Single Point Load
// ================================================================
//
// V-cable: two pinned supports at same height, one intermediate node
// at midspan with sag. Load P=10kN downward at midspan.
//
// Geometry: (0,0) -- (5,-1) -- (10,0)
//   span L=10m, sag f=1m
//
// Analytical (statics at midspan node):
//   H = P*L/(4*f) = 10*10/(4*1) = 25 kN
//   V_each = P/2 = 5 kN
//   T = sqrt(H^2 + V^2) = sqrt(625 + 25) = sqrt(650) ~ 25.495 kN

#[test]
fn validation_cable_single_point_load() {
    let span = 10.0;
    let sag = 1.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -sag),
        (3, span, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected horizontal thrust
    let h_expected = p * span / (4.0 * sag); // 25 kN
    let v_expected = p / 2.0; // 5 kN
    let t_expected = (h_expected * h_expected + v_expected * v_expected).sqrt(); // ~25.495 kN

    // Check reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.ry, v_expected, 0.02, "Cable R1_y");
    assert_close(r3.ry, v_expected, 0.02, "Cable R3_y");
    assert_close(r1.rx.abs(), h_expected, 0.02, "Cable H (left support)");

    // Axial forces should equal cable tension
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.n_start.abs(), t_expected, 0.02, "Cable T element 1");
    assert_close(ef2.n_start.abs(), t_expected, 0.02, "Cable T element 2");

    // Both elements must be in tension (n_start > 0)
    assert!(ef1.n_start > 0.0,
        "Element 1 should be in tension: n_start={:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0,
        "Element 2 should be in tension: n_start={:.4}", ef2.n_start);
}

// ================================================================
// 2. Asymmetric V-Cable with Off-Center Load
// ================================================================
//
// V-cable with asymmetric geometry: node at 1/3 span instead of midspan.
// Supports at (0,0) and (12,0). Low point at (4,-2).
// Load P=6kN downward at the low point.
//
// Bar 1: (0,0)->(4,-2), L1=sqrt(20)=2*sqrt(5), dir=(4,-2)/L1
// Bar 2: (4,-2)->(12,0), L2=sqrt(68)=2*sqrt(17), dir=(8,2)/L2
//
// Equilibrium at node 2:
//   x: -T1*4/L1 + T2*8/L2 = 0
//   y:  T1*2/L1 + T2*2/L2 = 6
// From x: T1 = T2 * (8/L2) * (L1/4) = T2 * 2*L1/L2
// Sub into y: T2*(2*2*L1/(L1*L2) + 2/L2) = 6
//           = T2*(4/L2 + 2/L2) = T2*6/L2 = 6
//           => T2 = L2 = 2*sqrt(17) ~ 8.246
//           => T1 = 2*L1 = 2*2*sqrt(5) = 4*sqrt(5) ~ 8.944

#[test]
fn validation_cable_asymmetric_load() {
    let p = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, -2.0),
        (3, 12.0, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical solution from equilibrium at node 2
    let l1 = (4.0_f64.powi(2) + 2.0_f64.powi(2)).sqrt(); // sqrt(20)
    let l2 = (8.0_f64.powi(2) + 2.0_f64.powi(2)).sqrt(); // sqrt(68)

    // T2 = P * L2 / 6 and T1 = 2*T2*L1/L2 from the derivation above
    // Actually let me re-derive carefully:
    // x: -T1*(4/L1) + T2*(8/L2) = 0  => T1 = T2 * 8*L1/(4*L2) = 2*T2*L1/L2
    // y:  T1*(2/L1) + T2*(2/L2) = P
    // Sub: 2*T2*L1/L2 * 2/L1 + T2*2/L2 = P
    //      4*T2/L2 + 2*T2/L2 = P
    //      6*T2/L2 = P
    //      T2 = P*L2/6 = 6*sqrt(68)/6 = sqrt(68) = 2*sqrt(17)
    //      T1 = 2*(2*sqrt(17))*sqrt(20)/sqrt(68) = 4*sqrt(17)*sqrt(20)/sqrt(68)
    //         = 4*sqrt(17*20/68) = 4*sqrt(340/68) = 4*sqrt(5)
    let t2_expected = p * l2 / 6.0;
    let t1_expected = 2.0 * t2_expected * l1 / l2;

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.n_start, t1_expected, 0.02, "Asymmetric cable T1");
    assert_close(ef2.n_start, t2_expected, 0.02, "Asymmetric cable T2");

    // Both in tension
    assert!(ef1.n_start > 0.0, "Bar 1 should be tension: {:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0, "Bar 2 should be tension: {:.4}", ef2.n_start);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_ry, p, 0.01, "Asymmetric cable sum_ry");
    assert!(sum_rx.abs() < 1e-6,
        "Asymmetric cable sum_rx should be zero: {:.6e}", sum_rx);

    // Asymmetry: T1 != T2 (the steeper bar has different tension)
    assert!((ef1.n_start - ef2.n_start).abs() > 0.1,
        "Asymmetric cable: T1={:.4}, T2={:.4} should differ", ef1.n_start, ef2.n_start);
}

// ================================================================
// 3. Cable Sag Effect on Thrust
// ================================================================
//
// Same V-cable geometry but with two different sag values.
// Horizontal thrust H = PL/(4f), so H is inversely proportional to sag.
//
// sag1=0.5m -> H1 = 10*10/(4*0.5) = 50 kN
// sag2=2.0m -> H2 = 10*10/(4*2.0) = 12.5 kN
// ratio H1/H2 = 4.0

#[test]
fn validation_cable_sag_effect_on_thrust() {
    let span = 10.0;
    let p = 10.0;
    let sag_shallow = 0.5;
    let sag_deep = 2.0;

    let solve_cable = |sag: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, -sag),
            (3, span, 0.0),
        ];
        let elems = vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
            elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        r1.rx.abs()
    };

    let h_shallow = solve_cable(sag_shallow);
    let h_deep = solve_cable(sag_deep);

    // H is inversely proportional to sag: H1/H2 = f2/f1
    let ratio = h_shallow / h_deep;
    let expected_ratio = sag_deep / sag_shallow; // 2.0/0.5 = 4.0

    // Note: linear FEM includes deformation effects, so the ratio
    // won't be exactly 4.0, but should be close for small deformations
    assert_close(ratio, expected_ratio, 0.05, "Cable sag-thrust ratio");

    // Also verify individual values against analytical
    let h_shallow_expected = p * span / (4.0 * sag_shallow); // 50 kN
    let h_deep_expected = p * span / (4.0 * sag_deep); // 12.5 kN
    assert_close(h_shallow, h_shallow_expected, 0.05, "H shallow");
    assert_close(h_deep, h_deep_expected, 0.05, "H deep");
}

// ================================================================
// 4. Triangulated Cable Truss
// ================================================================
//
// A cable-like truss with triangulation to ensure stability.
// Bottom chord follows a parabolic sag profile; top chord is straight.
// Vertical web members connect top and bottom chords.
//
// Top chord: (0,0) -- (4,0) -- (8,0) -- (12,0)
// Bottom chord: (4,-1.5) -- (8,-1.5)
// This forms a triangulated truss where the bottom chord acts as
// the tension cable and the top chord carries compression.
//
// 4 top nodes, 2 bottom nodes, 9 truss elements (3 top + 2 bottom + 4 diags)
// M+R = 9+4 = 13 = 2*6+1 -> 1x indeterminate, stable.

#[test]
fn validation_cable_triangulated_truss() {
    let p = 10.0; // load at each bottom node

    let nodes = vec![
        (1, 0.0, 0.0),    // top-left support
        (2, 4.0, 0.0),    // top middle-left
        (3, 8.0, 0.0),    // top middle-right
        (4, 12.0, 0.0),   // top-right support
        (5, 4.0, -1.5),   // bottom middle-left
        (6, 8.0, -1.5),   // bottom middle-right
    ];
    let elems = vec![
        // Top chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Bottom chord (cable-like)
        (4, "truss", 5, 6, 1, 1, false, false),
        // Verticals
        (5, "truss", 2, 5, 1, 1, false, false),
        (6, "truss", 3, 6, 1, 1, false, false),
        // Diagonals
        (7, "truss", 1, 5, 1, 1, false, false),
        (8, "truss", 5, 3, 1, 1, false, false),
        (9, "truss", 6, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];

    // Loads at bottom chord nodes
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];

    let total_load = 2.0 * p;

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Triangulated cable sum_ry");

    // Symmetric structure and loading -> equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let err_sym = (r1.ry - r4.ry).abs() / r1.ry.abs().max(1e-12);
    assert!(err_sym < 0.01,
        "Symmetric reactions: R1={:.4}, R4={:.4}", r1.ry, r4.ry);

    // Bottom chord (element 4) should be in tension (cable behavior)
    let ef_bottom = results.element_forces.iter().find(|f| f.element_id == 4).unwrap();
    assert!(ef_bottom.n_start > 0.0,
        "Bottom chord (cable) should be in tension: n_start={:.4}", ef_bottom.n_start);

    // Top chord elements should be in compression
    for eid in [1, 2, 3] {
        let ef = results.element_forces.iter().find(|f| f.element_id == eid).unwrap();
        assert!(ef.n_start < 0.0,
            "Top chord element {} should be in compression: n_start={:.4}",
            eid, ef.n_start);
    }
}

// ================================================================
// 5. All-Tension Verification for V-Cable
// ================================================================
//
// For a V-cable (3 nodes, 2 truss bars, 2 pinned supports) under
// any downward point load at the sag node, both bars must be in
// tension. Test with several different sag amounts and load magnitudes.

#[test]
fn validation_cable_all_tension_check() {
    let span = 10.0;

    // Test several (sag, load) combinations
    let cases = [
        (0.5, 5.0),
        (1.0, 10.0),
        (2.0, 20.0),
        (3.0, 1.0),
        (0.2, 50.0),
    ];

    for &(sag, p) in &cases {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, -sag),
            (3, span, 0.0),
        ];
        let elems = vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })];

        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
            elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();

        // Both elements must be in tension
        for ef in &results.element_forces {
            assert!(ef.n_start > 0.0,
                "Cable (sag={}, P={}) element {} must be tension: n_start={:.6}",
                sag, p, ef.element_id, ef.n_start);
        }

        // For a truss element, n_start = n_end (constant axial, no distributed load)
        for ef in &results.element_forces {
            let diff = (ef.n_start - ef.n_end).abs();
            assert!(diff < 1e-6,
                "Truss element {}: n_start={:.6}, n_end={:.6} should be equal",
                ef.element_id, ef.n_start, ef.n_end);
        }

        // Global equilibrium
        let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
        assert_close(sum_ry, p, 0.02,
            &format!("V-cable (sag={}, P={}) sum_ry", sag, p));
    }
}

// ================================================================
// 6. Cable vs Arch Comparison
// ================================================================
//
// Same V-geometry. Cable (truss, sag below supports) has tension.
// Arch (frame, rise above supports) has compression under same load.
//
// Cable: supports at (0,0),(10,0), midspan at (5,-1), truss elements
// Arch:  supports at (0,0),(10,0), midspan at (5,+1), frame elements
//
// Both get P=10kN downward at midspan. Verify opposite axial signs.

#[test]
fn validation_cable_vs_arch_axial_sign() {
    let span = 10.0;
    let sag = 1.0;
    let p = 10.0;

    // --- Cable (V-shape below, truss elements) ---
    let cable_nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -sag),
        (3, span, 0.0),
    ];
    let cable_elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let cable_sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let cable_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let cable_input = make_input(cable_nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        cable_elems, cable_sups, cable_loads);
    let cable_results = linear::solve_2d(&cable_input).unwrap();

    // --- Arch (inverted V above, frame elements to capture compression) ---
    let arch_nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, sag),
        (3, span, 0.0),
    ];
    let arch_elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let arch_sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let arch_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let arch_input = make_input(arch_nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        arch_elems, arch_sups, arch_loads);
    let arch_results = linear::solve_2d(&arch_input).unwrap();

    // Cable elements: tension (n_start > 0)
    for ef in &cable_results.element_forces {
        assert!(ef.n_start > 0.0,
            "Cable element {} should be tension: n_start={:.4}",
            ef.element_id, ef.n_start);
    }

    // Arch elements: compression (n_start < 0)
    for ef in &arch_results.element_forces {
        assert!(ef.n_start < 0.0,
            "Arch element {} should be compression: n_start={:.4}",
            ef.element_id, ef.n_start);
    }

    // Magnitudes should be comparable (same geometry, same load)
    let cable_n = cable_results.element_forces[0].n_start.abs();
    let arch_n = arch_results.element_forces[0].n_start.abs();
    let ratio = cable_n / arch_n;
    assert!(ratio > 0.5 && ratio < 2.0,
        "Cable and arch axial magnitudes should be comparable: cable={:.4}, arch={:.4}",
        cable_n, arch_n);
}

// ================================================================
// 7. Shallow Cable Amplification
// ================================================================
//
// As sag decreases, cable tension increases dramatically.
// For V-cable: T = sqrt(H^2 + (P/2)^2), H = PL/(4f)
//
// Compare sag = 2m, 1m, 0.5m with P=10kN:
//   f=2.0: H=12.5,  T=sqrt(156.25+25)=sqrt(181.25)=13.46
//   f=1.0: H=25.0,  T=sqrt(625+25)   =sqrt(650)   =25.50
//   f=0.5: H=50.0,  T=sqrt(2500+25)  =sqrt(2525)  =50.25
//
// Verify T_{0.5} > T_{1.0} > T_{2.0}
// and that for small sag, T ~ H ~ PL/(4f) ~ 1/f

#[test]
fn validation_cable_shallow_amplification() {
    let span = 10.0;
    let p = 10.0;
    let sags = [2.0, 1.0, 0.5];

    let solve_tension = |sag: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, -sag),
            (3, span, 0.0),
        ];
        let elems = vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
            elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        // Return the axial tension from the first element
        results.element_forces.iter()
            .find(|f| f.element_id == 1).unwrap().n_start
    };

    let t_deep = solve_tension(sags[0]); // sag=2.0
    let t_mid = solve_tension(sags[1]); // sag=1.0
    let t_shallow = solve_tension(sags[2]); // sag=0.5

    // Monotonic increase as sag decreases
    assert!(t_shallow > t_mid,
        "T(sag=0.5)={:.4} should > T(sag=1.0)={:.4}", t_shallow, t_mid);
    assert!(t_mid > t_deep,
        "T(sag=1.0)={:.4} should > T(sag=2.0)={:.4}", t_mid, t_deep);

    // All should be in tension
    assert!(t_deep > 0.0, "T(sag=2.0) should be tension: {:.4}", t_deep);

    // Verify approximate analytical values
    let h_deep = p * span / (4.0 * sags[0]);
    let t_deep_expected = (h_deep * h_deep + (p / 2.0).powi(2)).sqrt();
    assert_close(t_deep, t_deep_expected, 0.05, "T at sag=2.0");

    let h_mid = p * span / (4.0 * sags[1]);
    let t_mid_expected = (h_mid * h_mid + (p / 2.0).powi(2)).sqrt();
    assert_close(t_mid, t_mid_expected, 0.05, "T at sag=1.0");

    let h_shallow = p * span / (4.0 * sags[2]);
    let t_shallow_expected = (h_shallow * h_shallow + (p / 2.0).powi(2)).sqrt();
    assert_close(t_shallow, t_shallow_expected, 0.05, "T at sag=0.5");

    // For shallow cables, T ~ H ~ PL/(4f), verify T*f is roughly constant
    let product_deep = t_deep * sags[0];
    let product_shallow = t_shallow * sags[2];
    let ratio = product_deep / product_shallow;
    // Won't be exactly 1.0 because T = sqrt(H^2 + V^2), not just H,
    // but should be close for small sag
    assert!(ratio > 0.8 && ratio < 1.3,
        "T*f ratio: {:.4} (expected near 1.0)", ratio);
}

// ================================================================
// 8. Horizontal Cable Equilibrium under Combined Loading
// ================================================================
//
// V-cable with both vertical and horizontal loads.
// Span=8m, sag=1m. Vertical P=10kN and horizontal F=5kN at midspan.
//
// Geometry: (0,0) -- (4,-1) -- (8,0)
// Bar 1: (0,0)->(4,-1), L=sqrt(17), dir=(4,-1)/sqrt(17)
// Bar 2: (4,-1)->(8,0), L=sqrt(17), dir=(4,1)/sqrt(17)
//
// Equilibrium at node 2 (free):
//   x: -T1*(4/L) + T2*(4/L) + F = 0  => T2 - T1 = -FL/4
//   y:  T1*(1/L) + T2*(1/L) - P = 0  => T1 + T2 = PL
//
// T1 = (PL + FL/4)/2 = L(4P+F)/8
// T2 = (PL - FL/4)/2 = L(4P-F)/8
//
// Reactions:
//   R1 = bar 1 force on node 1 (bar pulls toward node 2):
//     R1_x = -T1*(4/L), R1_y = -T1*(-1/L) = T1/L
//     But R1 is what the SUPPORT provides, opposing the bar force:
//     R1_x = -T1*4/L (bar pulls node 1 to the right, support pushes left)
//     R1_y = T1/L (bar pulls node 1 down, support pushes up)
//
// Actually wait, for equilibrium at node 1:
//   Bar 1 tension T1 pulls node 1 toward node 2: force = T1*(4,-1)/L
//   Support reaction R1 = -(bar force) = -T1*(4,-1)/L = (-4T1/L, T1/L)
//
// Moment about node 1 (for the whole structure):
//   Sum M = 0: R3_y * 8 - P * 4 + F * 1 = 0
//   (P at (4,-1): moment_P = (-P)*4 = -40, moment_F = F*(-1) = -5...
//    using M = x*Fy - y*Fx: 4*(-10) - (-1)*5 = -40+5 = -35)
//   R3_y * 8 = 35 => R3_y = 35/8 = 4.375
//   R1_y = 10 - 4.375 = 5.625

#[test]
fn validation_cable_horizontal_equilibrium() {
    let span = 8.0;
    let sag = 1.0;
    let p_vert = 10.0;
    let f_horiz = 5.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, -sag),
        (3, span, 0.0),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_horiz, fy: -p_vert, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum_ry = P (reactions balance downward load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_vert, 0.01, "Combined load sum_ry");

    // Horizontal equilibrium: sum_rx = -F (reactions balance rightward load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_horiz, 0.01, "Combined load sum_rx");

    // Moment equilibrium about node 1:
    //   M_loads = x_load * fy_load - y_load * fx_load
    //           = 4 * (-10) - (-1) * 5 = -40 + 5 = -35
    //   M_R3 = x_R3 * R3_y = 8 * R3_y
    //   => R3_y = 35/8 = 4.375
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r3_y_expected = (p_vert * (span / 2.0) - f_horiz * sag) / span;
    assert_close(r3.ry, r3_y_expected, 0.02, "R3_y from moment equilibrium");

    // R1_y = P - R3_y
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_y_expected = p_vert - r3_y_expected;
    assert_close(r1.ry, r1_y_expected, 0.02, "R1_y from vertical equilibrium");

    // Verify individual tensions from analytical solution
    let l_bar = ((span / 2.0).powi(2) + sag.powi(2)).sqrt(); // sqrt(17)
    let t1_expected = l_bar * (4.0 * p_vert + f_horiz) / 8.0;
    let t2_expected = l_bar * (4.0 * p_vert - f_horiz) / 8.0;

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.n_start, t1_expected, 0.02, "T1 combined loading");
    assert_close(ef2.n_start, t2_expected, 0.02, "T2 combined loading");

    // Both elements should still be in tension (the sag is enough
    // that combined loads don't push any member into compression)
    assert!(ef1.n_start > 0.0,
        "Element 1 should be tension: n_start={:.4}", ef1.n_start);
    assert!(ef2.n_start > 0.0,
        "Element 2 should be tension: n_start={:.4}", ef2.n_start);

    // T1 > T2 because the horizontal force adds to the left bar tension
    assert!(ef1.n_start > ef2.n_start,
        "T1={:.4} should > T2={:.4} due to horizontal load", ef1.n_start, ef2.n_start);
}
