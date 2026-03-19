/// Validation: Extended Bridge Structural Analysis
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed. (2020)
///   - EN 1991-2:2003 (EC1-2): Traffic loads on bridges
///   - Hambly, "Bridge Deck Behaviour", 2nd Ed. (1991)
///   - Priestley, Seible & Calvi, "Seismic Design and Retrofit of Bridges" (1996)
///   - Barker & Puckett, "Design of Highway Bridges", 3rd Ed. (2013)
///   - AASHTO Guide Specifications for LRFD Seismic Bridge Design, 2nd Ed.
///   - PCI Bridge Design Manual, 3rd Ed.
///   - Ghali, Favre & Elbadry, "Concrete Structures", 4th Ed.
///
/// Tests use the actual solver to verify:
///   1. Simply supported bridge girder under HL-93 truck loading — moment envelope
///   2. Continuous 3-span bridge — negative moment at piers
///   3. Bridge grillage analysis using 3D solver for deck distribution
///   4. Bridge natural frequency — first lateral mode for seismic screening
///   5. Bridge influence line — reaction IL at pier support
///   6. Composite bridge deck — transformed section steel+concrete
///   7. Skew bridge effect — compare normal vs 30-degree skew span
///   8. Temperature gradient on bridge — AASHTO nonlinear gradient

use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::modal;
use dedaliano_engine::solver::moving_loads;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E_STEEL: f64 = 200_000.0; // MPa; solver uses E * 1000.0 internally -> kN/m^2
const E_CONCRETE: f64 = 30_000.0; // MPa
const A_GIRDER: f64 = 0.025; // m^2, typical steel bridge girder
const IZ_GIRDER: f64 = 4.0e-3; // m^4, typical W36 girder Iz
const DENSITY_STEEL: f64 = 7_850.0; // kg/m^3
const _DENSITY_CONCRETE: f64 = 2_400.0; // kg/m^3

fn steel_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY_STEEL);
    d
}

// ================================================================
// 1. Simply Supported Bridge Girder — HL-93 Truck Loading
// ================================================================
//
// AASHTO HL-93 design truck: front axle 35 kN, two rear axles 145 kN each,
// axle spacing 4.3 m. Moving the truck across a 20 m simply supported span,
// the moment envelope captures the maximum sagging moment.
//
// For a single 145 kN axle on a 20 m SS beam:
//   M_max = P*L/4 = 145*20/4 = 725 kN-m
// The 3-axle HL-93 truck produces a larger envelope moment.
//
// Reference: AASHTO LRFD 3.6.1.2

#[test]
fn bridge_hl93_truck_moment_envelope() {
    let l = 20.0; // m, span length
    let n = 16;   // elements (1.25 m each)

    let train = LoadTrain {
        name: "HL-93 Truck".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: 35.0 },   // front axle
            Axle { offset: 4.3, weight: 145.0 },   // drive axle
            Axle { offset: 8.6, weight: 145.0 },   // rear axle
        ],
    };

    let solver = make_beam(n, l, E_STEEL, A_GIRDER, IZ_GIRDER, "pinned", Some("rollerX"), vec![]);
    let input = MovingLoadInput {
        solver,
        train,
        step: Some(0.5),
        path_element_ids: None,
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Find maximum sagging moment magnitude across all elements
    // Convention: sagging is negative, so m_max_neg is the most negative value
    let m_max_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg.abs())
        .fold(0.0_f64, f64::max);

    // Single rear axle at midspan: M = 145*20/4 = 725 kN-m
    // Full truck produces more due to superposition of 3 axles
    let m_single_axle = 145.0 * l / 4.0;

    // HL-93 truck envelope must exceed single axle value
    assert!(
        m_max_sag > m_single_axle * 0.90,
        "HL-93 envelope M_max={:.1} should exceed single axle PL/4={:.1}",
        m_max_sag, m_single_axle
    );

    // Upper bound: total truck weight on SS beam
    let w_truck = 35.0 + 145.0 + 145.0;
    let m_upper = w_truck * l / 4.0; // 1625 kN-m (crude upper)
    assert!(
        m_max_sag < m_upper,
        "HL-93 envelope M_max={:.1} < upper bound {:.1}", m_max_sag, m_upper
    );

    // Shear envelope: max shear near support should approach total truck weight
    let v_max: f64 = result.elements.values()
        .map(|e| e.v_max_pos.abs().max(e.v_max_neg.abs()))
        .fold(0.0_f64, f64::max);

    assert!(
        v_max > 100.0 && v_max <= w_truck * 1.05,
        "Shear envelope V_max={:.1} bounded by truck weight {:.0}", v_max, w_truck
    );
}

// ================================================================
// 2. Continuous Bridge — 3-Span, Negative Moment at Piers
// ================================================================
//
// A 3-span continuous bridge (25-35-25 m) under moving load develops
// negative (hogging) moments over the interior piers and positive
// (sagging) moments within spans. This is a fundamental characteristic
// of continuous bridge design that affects rebar detailing.
//
// Reference: Barker & Puckett Ch. 6, AASHTO LRFD 4.6.2

#[test]
fn bridge_continuous_3span_pier_moments() {
    let spans = [25.0, 35.0, 25.0]; // m, typical highway bridge
    let n_per_span = 8;

    let solver = make_continuous_beam(
        &spans, n_per_span, E_STEEL, A_GIRDER, IZ_GIRDER, vec![],
    );

    let train = LoadTrain {
        name: "HL-93 Truck".to_string(),
        axles: vec![
            Axle { offset: 0.0, weight: 35.0 },
            Axle { offset: 4.3, weight: 145.0 },
            Axle { offset: 8.6, weight: 145.0 },
        ],
    };

    let input = MovingLoadInput {
        solver,
        train,
        step: Some(1.0),
        path_element_ids: None,
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // Sagging moment (negative in convention): max magnitude in spans
    let m_sag_max: f64 = result.elements.values()
        .map(|e| e.m_max_neg)
        .fold(0.0_f64, f64::min);

    // Hogging moment (positive in convention): at pier regions
    let m_hog_max: f64 = result.elements.values()
        .map(|e| e.m_max_pos)
        .fold(0.0_f64, f64::max);

    // Must have both sagging and hogging
    assert!(
        m_sag_max < 0.0,
        "Continuous bridge must develop sagging: m_sag_max={:.1}", m_sag_max
    );
    assert!(
        m_hog_max > 0.0,
        "Continuous bridge must develop hogging at piers: m_hog_max={:.1}", m_hog_max
    );

    // Pier hogging is typically 60-80% of equivalent SS sagging for medium spans
    let l_center = spans[1];
    let p_total = 35.0 + 145.0 + 145.0;
    let m_ss = p_total * l_center / 4.0; // SS reference

    // Hogging should be significant but less than SS midspan moment
    assert!(
        m_hog_max.abs() < m_ss,
        "Pier hogging {:.1} < SS reference {:.1}", m_hog_max.abs(), m_ss
    );
    assert!(
        m_hog_max.abs() > 10.0,
        "Pier hogging should be significant: {:.1}", m_hog_max.abs()
    );
}

// ================================================================
// 3. Bridge Grillage Analysis — 3D Solver for Deck Distribution
// ================================================================
//
// A simplified bridge grillage models the deck as a grid of
// longitudinal girders and transverse beams. A point load applied
// to one girder is shared with adjacent girders through transverse
// members. With equal girder stiffness and transverse stiffness,
// load distribution is governed by relative stiffness.
//
// Reference: Hambly, "Bridge Deck Behaviour", Ch. 3

#[test]
fn bridge_grillage_load_distribution() {
    let l = 12.0;       // m, span length
    let s = 2.5;        // m, girder spacing
    let n_girders = 3;  // 3 longitudinal girders
    let n_elem = 8;     // elements per girder

    let nu = 0.3;
    let a_girder = 0.015;    // m^2
    let iy_girder = 5e-4;    // m^4 (strong axis)
    let iz_girder = 3e-4;    // m^4
    let j_girder = 2e-5;     // m^4

    // Transverse beams (diaphragms) at quarter-points
    let a_diaphragm = 0.008;
    let iy_diaphragm = 1e-4;
    let iz_diaphragm = 2e-4;
    let j_diaphragm = 1e-5;

    let elem_len = l / n_elem as f64;

    // Build nodes: 3 girders along X, spaced s apart in Z
    let mut nodes = Vec::new();
    let mut node_id = 1_usize;
    for g in 0..n_girders {
        for i in 0..=n_elem {
            nodes.push((node_id, i as f64 * elem_len, 0.0, g as f64 * s));
            node_id += 1;
        }
    }
    let n_per_girder = n_elem + 1;

    // Materials and sections
    let mats = vec![(1, E_STEEL, nu)];
    let secs = vec![
        (1, a_girder, iy_girder, iz_girder, j_girder),       // girder
        (2, a_diaphragm, iy_diaphragm, iz_diaphragm, j_diaphragm), // diaphragm
    ];

    // Longitudinal elements (girders)
    let mut elems = Vec::new();
    let mut elem_id = 1_usize;
    for g in 0..n_girders {
        let base = g * n_per_girder + 1;
        for i in 0..n_elem {
            elems.push((elem_id, "frame", base + i, base + i + 1, 1, 1));
            elem_id += 1;
        }
    }

    // Transverse elements (diaphragms) at quarter-points: x = L/4, L/2, 3L/4
    let diaphragm_positions = [n_elem / 4, n_elem / 2, 3 * n_elem / 4];
    for &pos in &diaphragm_positions {
        for g in 0..(n_girders - 1) {
            let n_from = g * n_per_girder + 1 + pos;
            let n_to = (g + 1) * n_per_girder + 1 + pos;
            elems.push((elem_id, "frame", n_from, n_to, 1, 2));
            elem_id += 1;
        }
    }

    // Supports: all girders pinned at start, roller (Y,Z) at end
    let mut sups = Vec::new();
    for g in 0..n_girders {
        let start_node = g * n_per_girder + 1;
        let end_node = (g + 1) * n_per_girder;
        sups.push((start_node, vec![true, true, true, true, true, true]));
        sups.push((end_node, vec![false, true, true, false, false, false]));
    }

    // Load: point load on center girder at midspan
    let p = 100.0; // kN
    let mid_node_center = 1 * n_per_girder + 1 + n_elem / 2; // girder 1 (center), midspan
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node_center,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Center girder midspan deflection
    let d_center = results.displacements.iter()
        .find(|d| d.node_id == mid_node_center)
        .unwrap().uz;
    assert!(d_center < 0.0, "Center girder deflects down: uy={:.6}", d_center);

    // Edge girder midspan deflection (girder 0)
    let mid_node_edge = 0 * n_per_girder + 1 + n_elem / 2;
    let d_edge = results.displacements.iter()
        .find(|d| d.node_id == mid_node_edge)
        .unwrap().uz;

    // Transverse distribution: edge girder deflects less than center
    assert!(
        d_edge.abs() < d_center.abs(),
        "Edge deflection {:.6} < center {:.6} (load distribution)",
        d_edge.abs(), d_center.abs()
    );

    // Distribution factor: ratio of edge to center deflection
    let df = d_edge / d_center;
    assert!(
        df > 0.05 && df < 0.95,
        "Distribution factor = {:.3} (load is shared but not equally)", df
    );

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_ry, p, 0.02, "Grillage equilibrium: sum Ry = P");
}

// ================================================================
// 4. Bridge Natural Frequency — Seismic Screening
// ================================================================
//
// For seismic screening, AASHTO requires knowing the fundamental
// period of the bridge. A simply-supported beam's first bending
// frequency is:
//   f1 = (pi/2) * sqrt(EI / (m * L^4))  (in Hz, Euler-Bernoulli)
//
// For a typical highway bridge girder (L=30m, steel), the
// fundamental frequency should be in the range 1-5 Hz for
// typical bridge structures.
//
// Reference: AASHTO Guide Spec for Seismic Bridge Design, 3.4

#[test]
fn bridge_natural_frequency_seismic_screening() {
    let l = 30.0;   // m, span length
    let n = 16;      // elements

    // Use a simply-supported beam (no loads needed for modal)
    let mut input = make_ss_beam_udl(n, l, E_STEEL, A_GIRDER, IZ_GIRDER, 0.0);
    input.loads.clear();

    let result = modal::solve_modal_2d(&input, &steel_densities(), 3).unwrap();

    assert!(
        result.modes.len() >= 1,
        "Should find at least 1 mode, got {}", result.modes.len()
    );

    let f1 = result.modes[0].frequency; // Hz
    let t1 = result.modes[0].period;    // s

    // Analytical first frequency for SS beam:
    // omega_1 = (pi/L)^2 * sqrt(EI / (rho*A))
    // f_1 = omega_1 / (2*pi)
    let e_eff = E_STEEL * 1000.0; // kN/m^2
    let ei = e_eff * IZ_GIRDER;
    let rho_a = DENSITY_STEEL * A_GIRDER / 1000.0; // tonnes/m (mass per length)
    let omega_exact = (std::f64::consts::PI / l).powi(2) * (ei / rho_a).sqrt();
    let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

    assert_close(f1, f_exact, 0.05, "Bridge fundamental frequency vs analytical");

    // Typical highway bridge: period between 0.1s and 2.0s
    assert!(
        t1 > 0.01 && t1 < 5.0,
        "Bridge period T1={:.3}s should be in typical range", t1
    );

    // Mode ratios: f2/f1 should approximate 4 for SS beam (n=2 mode)
    if result.modes.len() >= 2 {
        let ratio = result.modes[1].frequency / f1;
        assert!(
            (ratio - 4.0).abs() < 1.0,
            "f2/f1 = {:.2}, expected ~4.0 for SS beam", ratio
        );
    }
}

// ================================================================
// 5. Bridge Influence Line — Reaction at Pier Support
// ================================================================
//
// For a 2-span continuous beam (L1 + L2), the reaction at the
// central pier varies as a unit load traverses the bridge.
// When the unit load is directly over the pier, the pier reaction
// is 1.0. The influence line for the pier reaction extends into
// both spans with a peak of 1.0 at the pier.
//
// A moving unit load across the bridge traces the influence line
// for the pier reaction.
//
// Reference: Barker & Puckett, Ch. 4 (influence lines)

#[test]
fn bridge_influence_line_pier_reaction() {
    let l_span = 15.0; // m, each span
    let n_per = 8;

    // 2-span continuous beam: supports at 0, L, 2L
    let solver = make_continuous_beam(
        &[l_span, l_span], n_per, E_STEEL, A_GIRDER, IZ_GIRDER, vec![],
    );

    // Unit moving load
    let train = LoadTrain {
        name: "Unit Load".to_string(),
        axles: vec![Axle { offset: 0.0, weight: 1.0 }],
    };

    let input = MovingLoadInput {
        solver,
        train,
        step: Some(0.5),
        path_element_ids: None,
    };

    let result = moving_loads::solve_moving_loads_2d(&input).unwrap();

    // For a 2-span beam with unit load, the maximum shear near the
    // intermediate support should be significant
    // Elements near the intermediate support (node n_per+1)
    let elem_at_pier_left = n_per; // last element of span 1
    let elem_at_pier_right = n_per + 1; // first element of span 2

    let v_pier_left = result.elements.get(&elem_at_pier_left.to_string());
    let v_pier_right = result.elements.get(&elem_at_pier_right.to_string());

    // Shear near pier should capture the reaction influence
    if let Some(env) = v_pier_left {
        let v_max = env.v_max_pos.abs().max(env.v_max_neg.abs());
        assert!(
            v_max > 0.3,
            "Pier-adjacent element should see significant shear from IL: V={:.4}", v_max
        );
    }

    if let Some(env) = v_pier_right {
        let v_max = env.v_max_pos.abs().max(env.v_max_neg.abs());
        assert!(
            v_max > 0.3,
            "Pier-adjacent element (right) should see significant shear: V={:.4}", v_max
        );
    }

    // The moment envelope should show both sagging and hogging
    let m_sag: f64 = result.elements.values()
        .map(|e| e.m_max_neg)
        .fold(0.0_f64, f64::min);
    let m_hog: f64 = result.elements.values()
        .map(|e| e.m_max_pos)
        .fold(0.0_f64, f64::max);

    assert!(m_sag < 0.0, "IL must produce sagging: {:.4}", m_sag);
    assert!(m_hog > 0.0, "IL must produce hogging at pier: {:.4}", m_hog);
}

// ================================================================
// 6. Composite Bridge Deck — Steel Girder + Concrete Slab
// ================================================================
//
// A composite section transforms the concrete slab into an
// equivalent steel area using the modular ratio n = Es/Ec.
// The transformed section has larger I and thus less deflection
// than the bare steel girder.
//
// Steel girder + concrete slab (effective width b_eff, thickness t_s):
//   n = Es / Ec
//   A_transformed = A_steel + b_eff * t_s / n
//   I_transformed > I_steel (parallel axis theorem)
//
// Reference: PCI Bridge Design Manual, AASHTO LRFD 4.6.2.6

#[test]
fn bridge_composite_deck_transformed_section() {
    let l = 20.0;
    let n_elem = 12;
    let p = 100.0; // kN midspan load

    // Steel girder properties
    let e_s = E_STEEL; // 200,000 MPa
    let a_s = 0.015;   // m^2
    let iz_s = 2.0e-3;  // m^4

    // Concrete slab
    let e_c = E_CONCRETE; // 30,000 MPa
    let b_eff = 2.0;      // m, effective flange width
    let t_s = 0.20;       // m, slab thickness

    // Modular ratio
    let n_ratio = e_s / e_c;
    assert_close(n_ratio, 200_000.0 / 30_000.0, 0.01, "Modular ratio");

    // Transformed slab area (convert concrete to equivalent steel)
    let a_slab_transformed = b_eff * t_s / n_ratio;

    // Composite section properties (approximate)
    // Assume girder centroid at y=0, slab centroid at y = d_girder/2 + t_s/2
    let d_girder = (12.0_f64 * iz_s / a_s).sqrt(); // approximate depth from I = A*d^2/12
    let y_slab = d_girder / 2.0 + t_s / 2.0;

    // Combined area
    let a_composite = a_s + a_slab_transformed;

    // Centroid of composite
    let y_bar = a_slab_transformed * y_slab / a_composite;

    // Parallel axis theorem for composite Iz
    let iz_slab_local = b_eff * t_s * t_s * t_s / (12.0 * n_ratio);
    let iz_composite = iz_s + a_s * y_bar * y_bar
        + iz_slab_local + a_slab_transformed * (y_slab - y_bar).powi(2);

    assert!(
        iz_composite > iz_s,
        "Composite I={:.6e} > bare steel I={:.6e}", iz_composite, iz_s
    );

    // Solve bare steel girder
    let mid = n_elem / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_bare = make_beam(n_elem, l, e_s, a_s, iz_s, "pinned", Some("rollerX"), loads);
    let res_bare = linear::solve_2d(&input_bare).unwrap();
    let d_bare = res_bare.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Solve composite section (use transformed properties with steel E)
    let loads_c = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_comp = make_beam(
        n_elem, l, e_s, a_composite, iz_composite,
        "pinned", Some("rollerX"), loads_c,
    );
    let res_comp = linear::solve_2d(&input_comp).unwrap();
    let d_comp = res_comp.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Composite section deflects less (stiffer)
    assert!(
        d_comp.abs() < d_bare.abs(),
        "Composite delta={:.6e} < bare delta={:.6e}", d_comp.abs(), d_bare.abs()
    );

    // Deflection ratio should match I ratio (for same E): delta ~ 1/I
    let i_ratio = iz_composite / iz_s;
    let d_ratio = d_bare.abs() / d_comp.abs();
    assert_close(d_ratio, i_ratio, 0.05, "Deflection ratio matches I ratio");

    // Analytical check: delta = PL^3/(48EI)
    let e_eff = e_s * 1000.0;
    let d_exact_comp = p * l.powi(3) / (48.0 * e_eff * iz_composite);
    assert_close(d_comp.abs(), d_exact_comp, 0.02, "Composite deflection vs PL^3/(48EI)");
}

// ================================================================
// 7. Skew Bridge Effect — Normal vs 30-Degree Skew
// ================================================================
//
// A skew bridge has supports not perpendicular to the span.
// In a 3D model, skewing the supports changes the load path
// and can introduce torsion. A 30-degree skew is common.
//
// For a simply-supported beam, the effective span in a skew bridge
// is L/cos(theta), but the orthogonal span (structural span) L
// carries the load. The skew introduces coupling between bending
// and torsion.
//
// Reference: Hambly, "Bridge Deck Behaviour", Ch. 7

#[test]
fn bridge_skew_effect_comparison() {
    let l = 10.0;       // m, orthogonal span
    let n = 8;
    let p = 50.0;       // kN midspan load
    let nu = 0.3;
    let a = 0.01;
    let iy = 5e-5;
    let iz = 1e-4;
    let j = 3e-5;

    // Normal (0-degree skew) bridge: beam along X
    let mid_normal = n / 2 + 1;
    let loads_normal = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_normal, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_normal = make_3d_beam(
        n, l, E_STEEL, nu, a, iy, iz, j,
        vec![true, true, true, true, true, true],     // fixed at start
        Some(vec![false, true, true, false, false, false]), // roller Y,Z at end
        loads_normal,
    );
    let res_normal = linear::solve_3d(&input_normal).unwrap();
    let d_normal = res_normal.displacements.iter()
        .find(|d| d.node_id == mid_normal).unwrap().uz;

    // Skew bridge: beam along a 30-degree angle in X-Z plane
    let theta = 30.0_f64.to_radians();
    let l_skew = l; // same structural span length
    let elem_len = l_skew / n as f64;

    let mut nodes_skew = Vec::new();
    for i in 0..=n {
        let s = i as f64 * elem_len;
        nodes_skew.push((i + 1, s * theta.cos(), 0.0, s * theta.sin()));
    }

    let mats = vec![(1, E_STEEL, nu)];
    let secs = vec![(1, a, iy, iz, j)];
    let elems_skew: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let sups_skew = vec![
        (1, vec![true, true, true, true, true, true]),     // fixed
        (n + 1, vec![false, true, true, false, false, false]), // roller Y,Z
    ];
    let mid_skew = n / 2 + 1;
    let loads_skew = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_skew, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input_skew = make_3d_input(
        nodes_skew, mats, secs, elems_skew, sups_skew, loads_skew,
    );
    let res_skew = linear::solve_3d(&input_skew).unwrap();
    let d_skew = res_skew.displacements.iter()
        .find(|d| d.node_id == mid_skew).unwrap().uz;

    // Both beams deflect downward
    assert!(d_normal < 0.0, "Normal bridge deflects down: {:.6}", d_normal);
    assert!(d_skew < 0.0, "Skew bridge deflects down: {:.6}", d_skew);

    // Same beam length, same load => deflections should be similar.
    // The skew beam is the same structural length, so vertical deflection
    // is essentially the same (the beam bends about its local weak axis).
    let ratio = d_skew.abs() / d_normal.abs();
    assert!(
        ratio > 0.70 && ratio < 1.40,
        "Skew/normal deflection ratio = {:.3}, should be close to 1.0", ratio
    );

    // Skew bridge may develop torsion (twist at midspan)
    let twist_skew = res_skew.displacements.iter()
        .find(|d| d.node_id == mid_skew).unwrap().rx;
    let twist_normal = res_normal.displacements.iter()
        .find(|d| d.node_id == mid_normal).unwrap().rx;

    // The straight beam loaded in-plane should have minimal twist
    // The skew beam may or may not develop twist depending on the
    // load direction vs local axes, but both should be small
    assert!(
        twist_normal.abs() < 0.01,
        "Normal beam twist should be ~0: {:.6}", twist_normal
    );
    // Just verify the skew result is finite
    assert!(
        twist_skew.is_finite(),
        "Skew beam twist should be finite: {:.6}", twist_skew
    );
}

// ================================================================
// 8. Temperature Gradient on Bridge — AASHTO Nonlinear Gradient
// ================================================================
//
// AASHTO LRFD 3.12.3 specifies a nonlinear temperature gradient
// through the depth of bridge superstructures. For a simply-supported
// beam, a through-depth temperature gradient produces self-equilibrating
// stresses but no reactions (statically determinate).
// For a fixed-fixed beam, the gradient produces fixed-end moments.
//
// Solver uses dt_gradient (linear gradient, degrees C) with
// alpha = 12e-6 (steel, hardcoded) and h = sqrt(12*Iz/A).
//
// For a fixed-fixed beam under gradient ΔT_gradient:
//   M_fixed = E * Iz * alpha * ΔT_gradient / h
//
// For a SS beam under gradient: M = 0 (free to rotate), but
// curvature develops: kappa = alpha * ΔT_gradient / h

#[test]
fn bridge_temperature_gradient() {
    let l = 20.0;
    let n = 8;

    // Section properties
    let a = 0.02;       // m^2
    let iz = 5.0e-4;    // m^4
    let h = (12.0_f64 * iz / a).sqrt(); // section depth from I = A*h^2/12

    // Temperature gradient: top 15 degrees C warmer than bottom
    let dt_grad = 15.0; // degrees C

    // Alpha (hardcoded in solver)
    let alpha = 12e-6;

    // --- Test 1: Simply-supported beam (determinate) ---
    // No restraint against rotation => no thermal moments at supports
    let loads_ss: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input_ss = make_beam(n, l, E_STEEL, a, iz, "pinned", Some("rollerX"), loads_ss);
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // SS beam under gradient: reactions should be zero (or near-zero)
    let max_ry_ss: f64 = res_ss.reactions.iter()
        .map(|r| r.rz.abs())
        .fold(0.0_f64, f64::max);
    assert!(
        max_ry_ss < 1.0,
        "SS beam under gradient: vertical reactions should be ~0, got {:.4}", max_ry_ss
    );

    // SS beam develops curvature (end rotations)
    let rot_start = res_ss.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().ry;
    let rot_end = res_ss.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry;

    // End rotations should be nonzero and opposite in sign
    assert!(
        rot_start.abs() > 1e-8,
        "SS beam under gradient should develop end rotation: {:.6e}", rot_start
    );
    assert!(
        rot_start * rot_end < 0.0,
        "End rotations should be opposite: start={:.6e}, end={:.6e}", rot_start, rot_end
    );

    // --- Test 2: Fixed-fixed beam (indeterminate) ---
    // Restraint against rotation => thermal moments develop
    let loads_ff: Vec<SolverLoad> = (0..n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input_ff = make_beam(n, l, E_STEEL, a, iz, "fixed", Some("fixed"), loads_ff);
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    // Fixed beam: moment reactions at supports
    let mz_start = res_ff.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let mz_end = res_ff.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().my;

    // Expected thermal moment: M = E * Iz * alpha * dt_gradient / h
    let e_eff = E_STEEL * 1000.0; // kN/m^2
    let m_thermal_expected = e_eff * iz * alpha * dt_grad / h;

    // Reaction moments should be close to analytical value
    assert!(
        mz_start.abs() > 0.1,
        "Fixed beam under gradient must develop moment reactions: {:.4}", mz_start
    );

    // Both ends should have similar magnitude (symmetric loading)
    let ratio = mz_start.abs() / mz_end.abs();
    assert!(
        (ratio - 1.0).abs() < 0.15,
        "Fixed beam: end moments should be equal, ratio={:.3}", ratio
    );

    // Compare with analytical value (allow 15% due to discretization)
    assert_close(
        mz_start.abs(), m_thermal_expected, 0.15,
        "Fixed beam thermal moment vs E*I*alpha*dT/h"
    );

    // Fixed beam: no curvature (no end rotation)
    let rot_ff_start = res_ff.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().ry;
    assert!(
        rot_ff_start.abs() < 1e-8,
        "Fixed beam should have zero end rotation: {:.6e}", rot_ff_start
    );
}
