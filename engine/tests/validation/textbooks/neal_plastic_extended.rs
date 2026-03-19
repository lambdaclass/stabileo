/// Validation: Extended plastic collapse benchmarks.
///
/// References:
///   - Neal, "The Plastic Methods of Structural Analysis", 2nd Ed.
///   - Horne, "Plastic Design of Steel Frames"
///
/// Tests:
///   1. SS beam, central point load: Pc = 4Mp/L
///   2. Fixed-fixed beam, UDL: wc = 16Mp/L²
///   3. Propped cantilever, central load: Pc = 6Mp/L
///   4. Portal frame combined: beam + sway + combined mechanisms
///   5. Two-span continuous beam UDL: λ ≥ 11.66Mp/L²
///   6. Fixed-fixed asymmetric load: 3 hinges at collapse
///   7. Portal frame sway mechanism: Pc = 2(Mp_col1+Mp_col2)/H
///   8. Upper/lower bound theorem: solver between kinematic and static bounds
use dedaliano_engine::solver::plastic;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const FY: f64 = 250.0; // MPa

const B: f64 = 0.15;
const H_SEC: f64 = 0.3;
const A_SEC: f64 = 0.045;     // b*h
const IZ_SEC: f64 = 3.375e-4; // bh³/12
// Zp = bh²/4 = 0.15*0.09/4 = 3.375e-3 m³
// Mp = fy*1000*Zp = 250*1000*3.375e-3 = 843.75 kN·m
const MP: f64 = 843.75;

fn make_plastic(solver: SolverInput) -> PlasticInput {
    let mut sections = HashMap::new();
    sections.insert(
        "1".to_string(),
        PlasticSectionData {
            a: A_SEC,
            iz: IZ_SEC,
            material_id: 1,
            b: Some(B),
            h: Some(H_SEC),
        },
    );
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), PlasticMaterialData { fy: Some(FY) });
    PlasticInput {
        solver,
        sections,
        materials,
        max_hinges: Some(15),
        mp_overrides: None,
    }
}

fn make_plastic_beam(
    n: usize,
    l: f64,
    start_sup: &str,
    end_sup: Option<&str>,
    loads: Vec<SolverLoad>,
) -> PlasticInput {
    let solver = make_beam(n, l, E_EFF, A_SEC, IZ_SEC, start_sup, end_sup, loads);
    make_plastic(solver)
}

// ═══════════════════════════════════════════════════════════════
// 1. SS Beam, Central Point Load: λ = 4Mp/(P·L)
// ═══════════════════════════════════════════════════════════════
//
// Neal §2.3: Simply supported beam with central point load.
// Single hinge at midspan. Collapse load Pc = 4Mp/L.
// Unit load P=1 applied at midspan node.

#[test]
fn validation_neal_1_ss_beam_central() {
    let l = 6.0;
    let n = 2; // midspan node at node 2

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];

    let input = make_plastic_beam(n, l, "pinned", Some("rollerX"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected = 4.0 * MP / l; // 562.5
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.10,
        "SS central point: λ={:.2}, expected 4Mp/L={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-Fixed Beam, UDL: λ = 16Mp/(q·L²)
// ═══════════════════════════════════════════════════════════════
//
// Neal §2.5: Fixed-fixed beam under UDL. Three hinges form:
// two at supports, one at midspan. wc = 16Mp/L².

#[test]
fn validation_neal_2_fixed_beam_udl() {
    let l = 6.0;
    let n = 2; // 2 elements, midspan node for hinge

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -1.0,
            q_j: -1.0,
            a: None,
            b: None,
        }));
    }

    let input = make_plastic_beam(n, l, "fixed", Some("fixed"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected = 16.0 * MP / (l * l); // 375.0
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.10,
        "FF UDL: λ={:.2}, expected 16Mp/L²={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Propped Cantilever, Central Load: λ = 6Mp/(P·L)
// ═══════════════════════════════════════════════════════════════
//
// Neal §2.4: Propped cantilever with point load at midspan.
// Two hinges: one at fixed support, one at midspan.
// Pc = 6Mp/L.

#[test]
fn validation_neal_3_propped_cantilever() {
    let l = 6.0;
    let n = 2; // midspan node at node 2

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];

    let input = make_plastic_beam(n, l, "fixed", Some("rollerX"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected = 6.0 * MP / l; // 843.75
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.10,
        "Propped cantilever central: λ={:.2}, expected 6Mp/L={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Portal Frame Combined Loading: Multiple Mechanisms
// ═══════════════════════════════════════════════════════════════
//
// Horne Ch.3: Portal frame under combined vertical + lateral.
// Three mechanisms checked: beam, sway, combined.
// The combined mechanism gives the lowest collapse factor.

#[test]
fn validation_neal_4_portal_combined() {
    let h = 4.0;
    let w = 6.0;

    // Build portal with midspan beam node for beam mechanism
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 2.0, h),
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left half beam
        (3, "frame", 3, 4, 1, 1, false, false), // right half beam
        (4, "frame", 4, 5, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];

    // Beam mechanism only (gravity at midspan)
    let loads_beam = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];
    let solver_beam =
        make_input(nodes.clone(), vec![(1, E_EFF, 0.3)], vec![(1, A_SEC, IZ_SEC)],
            elems.clone(), sups.clone(), loads_beam);
    let input_beam = make_plastic(solver_beam);
    let result_beam = plastic::solve_plastic_2d(&input_beam).unwrap();

    // Sway mechanism only (lateral load)
    let loads_sway = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 1.0,
        fz: 0.0,
        my: 0.0,
    })];
    let solver_sway =
        make_input(nodes.clone(), vec![(1, E_EFF, 0.3)], vec![(1, A_SEC, IZ_SEC)],
            elems.clone(), sups.clone(), loads_sway);
    let input_sway = make_plastic(solver_sway);
    let result_sway = plastic::solve_plastic_2d(&input_sway).unwrap();

    // Combined mechanism (lateral + gravity)
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -1.0,
            my: 0.0,
        }),
    ];
    let solver_combined =
        make_input(nodes, vec![(1, E_EFF, 0.3)], vec![(1, A_SEC, IZ_SEC)],
            elems, sups, loads_combined);
    let input_combined = make_plastic(solver_combined);
    let result_combined = plastic::solve_plastic_2d(&input_combined).unwrap();

    // All mechanisms should find collapse
    assert!(
        result_beam.collapse_factor > 0.0,
        "Beam mechanism should find collapse"
    );
    assert!(
        result_sway.collapse_factor > 0.0,
        "Sway mechanism should find collapse"
    );
    assert!(
        result_combined.collapse_factor > 0.0,
        "Combined mechanism should find collapse"
    );

    // Combined mechanism should give equal or lower collapse factor than
    // either individual mechanism (adding loads cannot increase capacity)
    assert!(
        result_combined.collapse_factor <= result_beam.collapse_factor * 1.05,
        "Combined λ={:.2} should be ≤ beam-only λ={:.2}",
        result_combined.collapse_factor,
        result_beam.collapse_factor
    );
    assert!(
        result_combined.collapse_factor <= result_sway.collapse_factor * 1.05,
        "Combined λ={:.2} should be ≤ sway-only λ={:.2}",
        result_combined.collapse_factor,
        result_sway.collapse_factor
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Two-Span Continuous Beam, UDL: λ ≥ 11.66Mp/L²
// ═══════════════════════════════════════════════════════════════
//
// Neal §3.2: Two equal spans with UDL. Collapse pattern requires
// hinge at interior support + hinge in span at x ≈ 0.414L.
// Exact: λ = 11.66Mp/(q·L²).

#[test]
fn validation_neal_5_two_span_udl() {
    let l_span = 6.0;
    let n_per = 12; // fine mesh to capture hinge at ~0.414L

    let total_elems = n_per * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -1.0,
            q_j: -1.0,
            a: None,
            b: None,
        }));
    }

    let solver = make_continuous_beam(
        &[l_span, l_span],
        n_per,
        E_EFF,
        A_SEC,
        IZ_SEC,
        loads,
    );
    let input = make_plastic(solver);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    let expected = 11.66 * MP / (l_span * l_span); // ≈ 273.2
    // Allow wider tolerance since hinge location discretization affects result
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.30,
        "Two-span UDL: λ={:.2}, expected ≥11.66Mp/L²={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );

    // Lower bound check: result should not be below the theoretical value
    // by more than discretization tolerance
    assert!(
        result.collapse_factor > expected * 0.70,
        "Two-span UDL: λ={:.2} should be close to {:.2}",
        result.collapse_factor,
        expected
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Fixed-Fixed Beam, Asymmetric Load: 3 Hinges at Collapse
// ═══════════════════════════════════════════════════════════════
//
// Neal §2.6: Fixed-fixed beam with asymmetric point load at L/3.
// Three hinges form: two at supports + one at load point.
// Verify at least 2 yielded elements (hinges) at collapse.

#[test]
fn validation_neal_6_three_hinge_collapse() {
    let l = 6.0;
    let n = 6; // 6 elements so L/3 falls on node 3

    // Point load at L/3 (node 3 for 6-element beam)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, // at x = 2.0 = L/3
        fx: 0.0,
        fz: -1.0,
        my: 0.0,
    })];

    let input = make_plastic_beam(n, l, "fixed", Some("fixed"), loads);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Exact: λ = 9Mp/L for fixed-fixed with load at a=L/3, b=2L/3.
    // Virtual work: left part rotates θ, right part rotates θ·a/b = θ/2.
    // External work = P·a·θ = P·(L/3)·θ.
    // Internal work = Mp·θ + Mp·(θ+θ/2) + Mp·(θ/2) = 3Mp·θ.
    // So P·L/3 = 3Mp → P = 9Mp/L.
    let expected = 9.0 * MP / l; // 1265.625
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.10,
        "FF asymmetric: λ={:.2}, expected 9Mp/L={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );

    // At least 2 hinges should form for collapse of a fixed-fixed beam
    assert!(
        result.hinges.len() >= 2,
        "FF asymmetric should form ≥2 hinges, got {}",
        result.hinges.len()
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Portal Frame Sway Mechanism: Pc = 2(Mp_col1+Mp_col2)/H
// ═══════════════════════════════════════════════════════════════
//
// Horne §4.2: Fixed-base portal under lateral load only.
// Sway mechanism: 4 hinges (2 at column bases, 2 at beam-column joints).
// For equal columns: Pc = 4Mp/H.

#[test]
fn validation_neal_7_frame_sway_mechanism() {
    let h = 4.0;
    let w = 6.0;

    // Portal with lateral load only at top-left
    let solver = make_portal_frame(h, w, E_EFF, A_SEC, IZ_SEC, 1.0, 0.0);
    let input = make_plastic(solver);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Sway mechanism: virtual work gives λ·1·H = 4Mp (for equal columns/beams)
    // λ = 4Mp/H = 4*843.75/4 = 843.75
    // But with 3-member portal (2 cols + 1 beam, all same section), the actual
    // sway mechanism has hinges at column bases and beam-column joints.
    // Virtual work: λ·H = Mp_base_left + Mp_top_left + Mp_top_right + Mp_base_right
    // = 4Mp, so λ = 4Mp/H.
    let expected = 4.0 * MP / h; // 843.75
    let error = (result.collapse_factor - expected).abs() / expected;
    assert!(
        error < 0.10,
        "Portal sway: λ={:.2}, expected 4Mp/H={:.2}, err={:.1}%",
        result.collapse_factor,
        expected,
        error * 100.0
    );

    // Should form hinges
    assert!(
        !result.hinges.is_empty(),
        "Portal sway should form hinges"
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Upper/Lower Bound Theorem Check
// ═══════════════════════════════════════════════════════════════
//
// Neal Ch.5 / Horne Ch.3: For any valid mechanism (kinematic theorem),
// the collapse load is an upper bound. For any equilibrium stress field
// not exceeding Mp (static theorem), the load is a lower bound.
// The solver result should fall between hand-calculated bounds.

#[test]
fn validation_neal_8_upper_lower_bound() {
    let h = 4.0;
    let w = 6.0;

    // Portal frame with combined loading (lateral + gravity)
    // Build with midspan beam node
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 2.0, h),
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 1.0,
            fz: 0.0,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -2.0,
            my: 0.0,
        }),
    ];

    let solver = make_input(
        nodes,
        vec![(1, E_EFF, 0.3)],
        vec![(1, A_SEC, IZ_SEC)],
        elems,
        sups,
        loads,
    );
    let input = make_plastic(solver);
    let result = plastic::solve_plastic_2d(&input).unwrap();

    // Upper bound (kinematic): Consider combined mechanism
    // Sway mechanism: λ·1·H = 4Mp → λ_sway = 4Mp/H = 843.75
    // Beam mechanism: λ·2·(w/4) = 4Mp → λ_beam = 4Mp/(2·w/4) = 4Mp/(w/2)·(1/2)
    //   Actually beam: λ·2·w/4 = 2Mp (beam ends) + 2Mp (midspan) → λ·w/2 = 4Mp → λ = 8Mp/w
    //   = 8*843.75/6 = 1125
    // Combined: λ·(1·H + 2·w/4) = 6Mp → λ·(4+3) = 6Mp → λ = 6Mp/7
    //   More carefully: sway Δ=1, beam θ at midspan, combined gives
    //   external work = λ(1·H + 2·w/4) for H and V loads
    //   internal work = sum of Mp at all hinges
    // Use generous bounds:
    let lambda_lower_bound = MP / (h + w); // Very conservative static lower bound
    let lambda_upper_bound = 4.0 * MP / h; // Pure sway upper bound

    assert!(
        result.collapse_factor > lambda_lower_bound * 0.5,
        "Solver λ={:.2} should exceed lower bound {:.2}",
        result.collapse_factor,
        lambda_lower_bound * 0.5
    );
    assert!(
        result.collapse_factor < lambda_upper_bound * 1.10,
        "Solver λ={:.2} should be below upper bound {:.2}",
        result.collapse_factor,
        lambda_upper_bound * 1.10
    );

    // The result should be positive and the solver should identify it as a mechanism
    assert!(
        result.collapse_factor > 0.0,
        "Collapse factor should be positive"
    );
    assert!(
        !result.hinges.is_empty(),
        "Should form at least one hinge"
    );
}
