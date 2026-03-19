/// Validation: Chen & Lui Stability Design of Steel Structures
///
/// References:
///   - Chen & Lui, "Stability Design of Steel Structures" (1991)
///   - Chen & Lui, "Theory of Beam-Columns" Vols. 1 & 2 (1976-77)
///
/// Tests verify P-delta amplification, effective length factors,
/// sway/braced frame critical loads, convergence, imperfection effects,
/// leaning column stability, and multi-story drift amplification.
use dedaliano_engine::solver::{buckling, linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

/// E in MPa (solver internally multiplies by 1000 to get kN/m²).
const E: f64 = 200_000.0;
/// Effective E in kN/m² for hand calculations.
const E_EFF: f64 = E * 1000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Beam-Column Amplification Factor
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 3: Beam-column under combined axial P and lateral H.
// Pin-pin column along X, L = 5 m.
// Section: HEB200-like, I = 5696e-8 m⁴, A = 78.1e-4 m².
// P = 500 kN compression, H = 20 kN lateral at midspan.
// P_cr = π²EI/L² = π² × 200e6 × 5696e-8 / 25 = 4499 kN.
// Amplification factor AF = 1/(1 - P/P_cr) ≈ 1/(1 - 500/4499) ≈ 1.125.
// P-delta midspan displacement should be ~AF × linear displacement.

#[test]
fn validation_chen_lui_1_beam_column_amplification() {
    let l = 5.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let p_axial = 500.0; // kN compression
    let h_lateral = 20.0; // kN lateral at midspan
    let n = 10;
    let pcr = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);
    let expected_af = 1.0 / (1.0 - p_axial / pcr);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let mid_node = n / 2 + 1;
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fz: h_lateral, my: 0.0,
            }),
        ],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_res.converged, "should converge at P/Pcr = {:.3}", p_axial / pcr);

    let lin_uy = lin_res.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let pd_uy = pd_res.results.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();

    let actual_af = pd_uy / lin_uy;

    // Geometric P-delta approximates the exact second-order AF;
    // allow 15% tolerance since iterative P-delta differs from closed-form.
    assert!(
        (actual_af - expected_af).abs() / expected_af < 0.15,
        "Amplification factor: actual={:.4}, expected={:.4} (P/Pcr={:.3})",
        actual_af, expected_af, p_axial / pcr
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Effective Length: Fixed-Free (K=2)
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 2: Cantilever column, effective length factor K = 2.
// P_cr = π²EI / (KL)² = π²EI / (4L²).
// L = 4 m, IPE300-like: I = 8356e-8 m⁴, A = 53.8e-4 m².
// P_cr = π² × 200e6 × 8356e-8 / (4 × 16) = 2577 kN.

#[test]
fn validation_chen_lui_2_effective_length_fixed_free() {
    let l = 4.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let p_ref = 100.0; // reference load for eigenvalue
    let n = 10;

    let pcr_exact = std::f64::consts::PI.powi(2) * E_EFF * iz / (4.0 * l * l);

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed")], // fixed base, free tip (no end support)
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p_ref, fz: 0.0, my: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_computed = result.modes[0].load_factor * p_ref;

    let error = (pcr_computed - pcr_exact).abs() / pcr_exact;
    assert!(
        error < 0.01,
        "Fixed-free Pcr: computed={:.1}, exact={:.1}, error={:.4}%",
        pcr_computed, pcr_exact, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Sway Frame Critical Load
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 5: Portal frame with fixed bases under vertical loads.
// Two columns H=4 m, beam L=6 m, all same section.
// Sway buckling: eigenvalue analysis with gravity loads on top nodes.
// For a fixed-base portal frame, the sway critical load is between
// the fixed-free value (K=2) and fixed-guided value (K=1).
// With a stiff beam, columns approach fixed-guided: P_cr_col ≈ π²EI/L².

#[test]
fn validation_chen_lui_3_sway_frame_critical_load() {
    let h = 4.0;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let p_ref = 100.0;

    // Euler load for one column (pinned-pinned equivalent)
    let pe_col = std::f64::consts::PI.powi(2) * E_EFF * iz / (h * h);
    // Fixed-free for one column
    let pe_fixed_free = pe_col / 4.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p_ref, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p_ref, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();

    // Total critical load on the frame = lambda * total_applied
    let lambda = result.modes[0].load_factor;
    let total_pcr = lambda * 2.0 * p_ref; // 2 nodes × p_ref each
    let pcr_per_col = total_pcr / 2.0;

    // Sway critical load per column should be between fixed-free and pinned-pinned:
    // pe_fixed_free < pcr_per_col < pe_col
    assert!(
        pcr_per_col > pe_fixed_free * 0.9,
        "Sway Pcr/col={:.1} should exceed fixed-free={:.1}",
        pcr_per_col, pe_fixed_free
    );
    assert!(
        pcr_per_col < pe_col * 1.1,
        "Sway Pcr/col={:.1} should be below pinned-pinned={:.1}",
        pcr_per_col, pe_col
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Braced vs. Unbraced Frame
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 5: Adding a lateral brace at beam level prevents
// sway. Braced frame buckles in non-sway mode → much higher Pcr.
// For fixed-base columns with sway prevented, K ≈ 0.7 → Pcr ~2× per col.
// Unbraced K ≈ 1.2-2.0. Ratio braced/unbraced should be ~2-6×.

#[test]
fn validation_chen_lui_4_braced_vs_unbraced() {
    let h = 4.0;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let p_ref = 100.0;

    // --- Unbraced frame ---
    let nodes_ub = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_ub = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_ub = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_ub = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p_ref, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p_ref, my: 0.0 }),
    ];
    let input_ub = make_input(nodes_ub, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_ub, sups_ub, loads_ub);
    let result_ub = buckling::solve_buckling_2d(&input_ub, 1).unwrap();
    let lambda_ub = result_ub.modes[0].load_factor;

    // --- Braced frame: add a roller support at node 2 to prevent sway ---
    // Use rollerY (restrains X movement at node 2 but allows Y movement)
    let nodes_br = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_br = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_br = vec![
        (1, 1_usize, "fixed"),
        (2, 4, "fixed"),
        (3, 2, "rollerY"), // lateral brace at beam level
    ];
    let loads_br = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p_ref, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p_ref, my: 0.0 }),
    ];
    let input_br = make_input(nodes_br, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_br, sups_br, loads_br);
    let result_br = buckling::solve_buckling_2d(&input_br, 1).unwrap();
    let lambda_br = result_br.modes[0].load_factor;

    let ratio = lambda_br / lambda_ub;

    // Braced frame should have significantly higher critical load (2-6×)
    assert!(
        ratio > 2.0,
        "Braced/Unbraced ratio={:.2}, expected > 2.0 (lambda_br={:.1}, lambda_ub={:.1})",
        ratio, lambda_br, lambda_ub
    );
    assert!(
        ratio < 8.0,
        "Braced/Unbraced ratio={:.2}, expected < 8.0",
        ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. P-Delta Convergence at P = 0.5 P_cr
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 3: Pin-pin column at P = 0.5*P_cr.
// Amplification factor = 1/(1 - 0.5) = 2.0.
// Small lateral perturbation at midspan. P-delta should converge
// and give displacement ~2× the linear result.
// L = 6 m, I = 5696e-8 m⁴.

#[test]
fn validation_chen_lui_5_pdelta_convergence() {
    let l = 6.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let n = 10;
    let h_lateral = 1.0; // small lateral perturbation

    let pcr = std::f64::consts::PI.powi(2) * E_EFF * iz / (l * l);
    let p_axial = 0.5 * pcr;
    let expected_af = 1.0 / (1.0 - p_axial / pcr); // = 2.0

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let mid_node = n / 2 + 1;
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: 0.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fz: h_lateral, my: 0.0,
            }),
        ],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 50, 1e-6).unwrap();

    // Should converge (P < Pcr)
    assert!(pd_res.converged, "should converge at P/Pcr = 0.5");

    let lin_uy = lin_res.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let pd_uy = pd_res.results.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz.abs();

    let actual_af = pd_uy / lin_uy;

    // Geometric P-delta approximates AF = 2.0; allow 20% tolerance
    assert!(
        (actual_af - expected_af).abs() / expected_af < 0.20,
        "Convergence test: AF actual={:.3}, expected={:.3}",
        actual_af, expected_af
    );
    // Verify the amplification is at least 1.5× (clearly above unity)
    assert!(
        actual_af > 1.5,
        "AF={:.3} should be well above 1.0", actual_af
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Initial Imperfection via Notional Load
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 4: Notional load method for initial imperfection.
// Cantilever column L = 5 m, P = 1000 kN axial compression.
// Notional lateral load H = 0.002 × P = 2 kN at tip.
// P-delta amplifies this imperfection effect.
// The amplified tip displacement δ_pd should exceed the linear δ.
// First-order base moment: M_linear = H × L = 2 × 5 = 10 kN·m.
// P-delta base moment: M_pd = H × L + P × δ_pd > M_linear.

#[test]
fn validation_chen_lui_6_initial_imperfection() {
    let l = 5.0;
    let a = 78.1e-4;
    let iz = 5696e-8;
    let p_axial = 1000.0; // kN
    let h_notional = 0.002 * p_axial; // 2 kN
    let n = 10;

    let pcr = std::f64::consts::PI.powi(2) * E_EFF * iz / (4.0 * l * l); // fixed-free K=2
    assert!(
        p_axial < pcr,
        "P={:.0} must be below Pcr={:.0} for stability", p_axial, pcr
    );

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed")], // cantilever: fixed base, free tip
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: -p_axial, fz: h_notional, my: 0.0,
            }),
        ],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_res.converged, "should converge");

    // Moments at fixed base (node 1)
    let m_linear = lin_res.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();
    let m_pdelta = pd_res.results.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();

    // First-order moment should be approximately H × L
    assert_close(m_linear, h_notional * l, 0.05, "Linear base moment ≈ H × L");

    // P-delta moment should be amplified
    assert!(
        m_pdelta > m_linear * 1.05,
        "P-delta moment {:.2} should exceed linear moment {:.2} by > 5%",
        m_pdelta, m_linear
    );

    // Displacement amplification
    let lin_uy = lin_res.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let pd_uy = pd_res.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();
    assert!(
        pd_uy > lin_uy,
        "P-delta tip displacement {:.6e} should exceed linear {:.6e}",
        pd_uy, lin_uy
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Leaning Column Effect
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 5: Two-column frame. Left column is a moment
// frame column (fixed base, rigid beam connection). Right column
// is a "leaning" column (pinned top and bottom via hinges).
// All gravity load is on the leaning column.
// The moment frame column must provide lateral stability for both.
// The sway buckling load should be lower than if all gravity were
// on the moment frame column alone.
//
// Geometry: H=4 m, span L=6 m. Same section for all members.

#[test]
fn validation_chen_lui_7_leaning_column() {
    let h = 4.0;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let p_ref = 100.0;

    // --- Frame with load only on the moment-frame column (no leaning) ---
    let nodes_mf = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_mf = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_mf = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_mf = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p_ref, my: 0.0 }),
    ];
    let input_mf = make_input(nodes_mf, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_mf, sups_mf, loads_mf);
    let result_mf = buckling::solve_buckling_2d(&input_mf, 1).unwrap();
    let lambda_mf = result_mf.modes[0].load_factor;

    // --- Frame with leaning column: right column has pin-pin connections ---
    // Leaning column: hinge at both ends (hinge_start=true, hinge_end=true)
    let nodes_lc = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems_lc = vec![
        (1, "frame", 1, 2, 1, 1, false, false),  // moment column
        (2, "frame", 2, 3, 1, 1, false, false),   // beam
        (3, "frame", 3, 4, 1, 1, true, true),     // leaning column (hinges at both ends)
    ];
    let sups_lc = vec![(1, 1_usize, "fixed"), (2, 4, "pinned")];
    let loads_lc = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p_ref, my: 0.0 }),
    ];
    let input_lc = make_input(nodes_lc, vec![(1, E, 0.3)], vec![(1, a, iz)], elems_lc, sups_lc, loads_lc);
    let result_lc = buckling::solve_buckling_2d(&input_lc, 1).unwrap();
    let lambda_lc = result_lc.modes[0].load_factor;

    // The leaning column destabilizes the frame: the same total gravity load
    // on a leaning column should produce a lower critical load factor than
    // when that load is on a proper moment-frame column.
    // Both have p_ref applied, so the critical factor is directly comparable.
    assert!(
        lambda_lc < lambda_mf,
        "Leaning column reduces stability: lambda_lc={:.2} should be < lambda_mf={:.2}",
        lambda_lc, lambda_mf
    );

    // The leaning column frame should still have a positive buckling load
    assert!(
        lambda_lc > 0.0,
        "Leaning column frame should have positive critical load factor, got {:.2}",
        lambda_lc
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Two-Story Sway: Inter-Story Drift Amplification
// ═══════════════════════════════════════════════════════════════
//
// Chen & Lui, Ch. 6: Two-story frame with lateral + gravity loads.
// 3 nodes per column line, 2 beams. Fixed bases.
// Story heights H = 3.5 m, beam span L = 6 m.
// Horizontal loads at each floor level.
// P-delta analysis should amplify inter-story drift compared to linear.
// Upper floor drift should be larger than lower floor drift.

#[test]
fn validation_chen_lui_8_two_story_sway() {
    let h = 3.5;
    let w = 6.0;
    let iz = 8356e-8;
    let a = 53.8e-4;
    let px = 10.0;   // lateral force per floor per node
    let py = -50.0;  // gravity per top node

    // Nodes:
    //  1(0,0)  4(w,0)     = bases
    //  2(0,h)  5(w,h)     = 1st floor
    //  3(0,2h) 6(w,2h)    = 2nd floor (roof)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 2, 3, 1, 1, false, false), // left col, story 2
        (3, "frame", 4, 5, 1, 1, false, false), // right col, story 1
        (4, "frame", 5, 6, 1, 1, false, false), // right col, story 2
        (5, "frame", 2, 5, 1, 1, false, false), // beam, floor 1
        (6, "frame", 3, 6, 1, 1, false, false), // beam, floor 2
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: px, fz: py, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: py, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, a, iz)], elems, sups, loads);

    let lin_res = linear::solve_2d(&input).unwrap();
    let pd_res = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd_res.converged, "Two-story frame should converge");

    // Floor drifts (left column line)
    let lin_d1 = lin_res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let lin_d2 = lin_res.displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();
    let pd_d1 = pd_res.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let pd_d2 = pd_res.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux.abs();

    // P-delta drift should be larger than linear at both levels
    assert!(
        pd_d1 > lin_d1,
        "P-delta amplifies 1st floor drift: {:.6e} > {:.6e}", pd_d1, lin_d1
    );
    assert!(
        pd_d2 > lin_d2,
        "P-delta amplifies 2nd floor drift: {:.6e} > {:.6e}", pd_d2, lin_d2
    );

    // Upper floor total displacement should be larger than lower floor
    assert!(
        pd_d2 > pd_d1,
        "Upper floor sways more: {:.6e} > {:.6e}", pd_d2, pd_d1
    );

    // Check amplification ratios are reasonable (> 1.0 and < 3.0)
    let af1 = pd_d1 / lin_d1;
    let af2 = pd_d2 / lin_d2;
    assert!(
        af1 > 1.0 && af1 < 3.0,
        "1st floor amplification ratio: {:.3}", af1
    );
    assert!(
        af2 > 1.0 && af2 < 3.0,
        "2nd floor amplification ratio: {:.3}", af2
    );
}
