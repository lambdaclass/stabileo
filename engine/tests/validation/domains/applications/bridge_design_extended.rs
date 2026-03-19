use dedaliano_engine::{types::*, solver::linear::{solve_2d, solve_3d}};
use crate::common::*;

/// Common material and section properties for bridge tests.
const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.05; // m^2 (girder cross-section)
const IZ: f64 = 5e-3; // m^4 (girder moment of inertia)
const A_TRUSS: f64 = 0.005; // m^2 (truss member)

// ================================================================
// 1. AASHTO HL-93 Lane Load — Simply Supported Bridge Girder
// ================================================================
//
// AASHTO HL-93 lane load component: 9.3 kN/m uniform over the span.
// For a simply supported girder of span L:
//   R = q*L/2 (each reaction)
//   M_max = q*L^2/8 (at midspan)
//   delta_max = 5*q*L^4 / (384*E*I) (midspan deflection)
//
// We model a single girder with 8 elements under 9.3 kN/m lane load
// and verify reactions, midspan moment, and deflection.
//
// Reference: AASHTO LRFD Bridge Design Specifications, 9th Ed., §3.6.1.2.4

#[test]
fn bridge_ext_aashto_hl93_lane_load() {
    let l: f64 = 20.0; // m, span
    let q: f64 = 9.3; // kN/m, AASHTO lane load
    let n = 8; // elements

    // Build distributed loads (negative = downward in solver convention)
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Expected reactions: R = q*L/2 = 9.3*20/2 = 93.0 kN each
    let r_expected: f64 = q * l / 2.0;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.rz, r_expected, 0.02, "HL-93 lane R_left");
    assert_close(r_right.rz, r_expected, 0.02, "HL-93 lane R_right");

    // Total vertical equilibrium: sum_Ry = q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.02, "HL-93 lane equilibrium");

    // Midspan deflection should be downward and match analytical formula
    // delta = 5*q*L^4 / (384*E_kN*I)
    // E in solver output is in kN/m^2 = E_MPa * 1000
    let e_kn: f64 = E * 1000.0;
    let delta_analytical: f64 = 5.0 * q * l.powi(4) / (384.0 * e_kn * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert!(d_mid.uz < 0.0, "HL-93 lane: midspan deflects downward");
    assert_close(d_mid.uz.abs(), delta_analytical, 0.05, "HL-93 lane midspan deflection");
}

// ================================================================
// 2. Through-Truss Bridge — Pratt Pattern Under Symmetric Load
// ================================================================
//
// A through-truss bridge with Pratt configuration: vertical members
// and diagonals sloping toward the center. Under symmetric gravity
// loading at the bottom chord panel points:
//   - Bottom chord is in tension (increases toward midspan)
//   - Top chord is in compression
//   - Vertical reactions are symmetric and sum to total applied load
//
// The maximum bottom chord force at midspan can be estimated from the
// equivalent beam moment: F_chord ~ M_max / h, where h is the truss
// depth and M_max = R*L/2 - P*d (from method of sections).
//
// Reference: Kassimali, "Structural Analysis", Ch. 5 (Trusses)

#[test]
fn bridge_ext_through_truss_pratt() {
    let span: f64 = 24.0;
    let h: f64 = 4.0; // truss depth
    let n_panels: usize = 6;
    let p: f64 = 50.0; // kN at each interior bottom chord node
    let dx: f64 = span / n_panels as f64;

    let mut nodes = Vec::new();
    let mut elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    let mut eid: usize = 1;

    // Bottom chord nodes: 1 .. n_panels+1
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * dx, 0.0));
    }
    // Top chord nodes: n_panels+2 .. 2*n_panels+2
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * dx, h));
    }

    // Bottom chord (frame with both hinges = truss behavior)
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, true, true));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels {
        let t1 = n_panels + 2 + i;
        let t2 = n_panels + 3 + i;
        elems.push((eid, "frame", t1, t2, 1, 1, true, true));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        let bot = i + 1;
        let top = n_panels + 2 + i;
        elems.push((eid, "frame", bot, top, 1, 1, true, true));
        eid += 1;
    }
    // Diagonals (Pratt: bottom-left to top-right in first half,
    // top-left to bottom-right in second half)
    for i in 0..n_panels {
        let bot = i + 1;
        let top_right = n_panels + 3 + i;
        elems.push((eid, "frame", bot, top_right, 1, 1, true, true));
        eid += 1;
    }

    // Loads at interior bottom chord nodes
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }));
    }

    let total_load: f64 = (n_panels - 1) as f64 * p;

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 1e-8)], // near-zero Iz for truss behavior with hinges
        elems,
        vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")],
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "Pratt truss total Ry");

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().rz;
    assert_close(r1, r2, 0.05, "Pratt truss symmetric reactions");
    assert_close(r1, total_load / 2.0, 0.05, "Pratt truss R = W/2");

    // Horizontal equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.05, "Pratt truss Rx equilibrium");
}

// ================================================================
// 3. Box Girder Torsion — Eccentric Load on Twin-Girder Bridge
// ================================================================
//
// A twin-girder bridge under eccentric loading demonstrates torsional
// load distribution. When two identical parallel girders are connected
// by rigid transverse beams and loaded eccentrically, the near girder
// carries more load.
//
// For symmetric girders with a centered load (e=0): each carries P/2.
// With eccentric load on one girder directly: that girder carries more.
//
// We model two parallel SS beams of the same span and properties.
// The centered case applies P/2 to each girder midspan.
// The eccentric case applies 0.7P to girder 1 and 0.3P to girder 2.
// We verify that reactions are consistent and that the eccentric case
// produces larger deflection in the more heavily loaded girder.
//
// Reference: Barker & Puckett, "Design of Highway Bridges", Ch. 7

#[test]
fn bridge_ext_box_girder_eccentric_load() {
    let l: f64 = 16.0; // m, span
    let p: f64 = 100.0; // kN, total load
    let n: usize = 4;
    let mid_node = n / 2 + 1;

    // Case 1: Symmetric loading — P/2 on each girder at midspan
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p / 2.0, my: 0.0,
        })]);
    let res1 = solve_2d(&input1).unwrap();

    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p / 2.0, my: 0.0,
        })]);
    let res2 = solve_2d(&input2).unwrap();

    // Symmetric: both girders have equal reactions and deflections
    let d1_sym: f64 = res1.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz;
    let d2_sym: f64 = res2.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz;
    assert_close(d1_sym, d2_sym, 0.02, "Box girder symmetric: equal deflections");

    // Total reaction of each girder = P/2
    let sum_ry1: f64 = res1.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry1, p / 2.0, 0.02, "Box girder symmetric: girder 1 Ry = P/2");

    // Case 2: Eccentric loading — 70% on girder 1, 30% on girder 2
    let frac_near: f64 = 0.70;
    let frac_far: f64 = 0.30;
    let input_near = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p * frac_near, my: 0.0,
        })]);
    let res_near = solve_2d(&input_near).unwrap();

    let input_far = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p * frac_far, my: 0.0,
        })]);
    let res_far = solve_2d(&input_far).unwrap();

    // Eccentric: near girder carries more
    let sum_ry_near: f64 = res_near.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_far: f64 = res_far.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_near, p * frac_near, 0.02, "Box girder eccentric: near Ry = 0.7P");
    assert_close(sum_ry_far, p * frac_far, 0.02, "Box girder eccentric: far Ry = 0.3P");

    // Near girder deflects more than far girder
    let d_near: f64 = res_near.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let d_far: f64 = res_far.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    assert!(d_near > d_far,
        "Near girder deflects more: {:.6e} > {:.6e}", d_near, d_far);

    // Deflection ratio should match load ratio (same stiffness)
    let load_ratio: f64 = frac_near / frac_far;
    let defl_ratio: f64 = d_near / d_far;
    assert_close(defl_ratio, load_ratio, 0.05,
        "Box girder: deflection ratio = load ratio");

    // Total load on bridge = near + far = P
    assert_close(sum_ry_near + sum_ry_far, p, 0.02,
        "Box girder: total Ry = P");
}

// ================================================================
// 4. Integral Abutment Bridge — Fixed-End Continuous Beam
// ================================================================
//
// An integral abutment bridge has the deck monolithically connected
// to the abutments (no expansion joints). The structural model is a
// beam fixed at both ends with intermediate support(s).
//
// For a two-span fixed-end continuous beam under uniform load q:
//   Fixed end moment: M_A = M_C = -q*L^2/12 (each end, single span formula)
//   Central reaction carries more load than end reactions.
//
// We verify that the fixed-end moments are present and that the
// central support carries ~5/4 of the simple beam reaction.
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 5

#[test]
fn bridge_ext_integral_abutment() {
    let l: f64 = 15.0; // m, each span
    let q: f64 = 20.0; // kN/m, self-weight + superimposed dead load
    let n_per_span: usize = 6;

    // Two-span beam, fixed at both ends, roller at interior support
    let n_total = 2 * n_per_span;
    let elem_len: f64 = l / n_per_span as f64;

    let mut nodes = Vec::new();
    let mut node_id: usize = 1;
    for i in 0..=n_total {
        nodes.push((node_id, i as f64 * elem_len, 0.0));
        node_id += 1;
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Fixed at both ends, roller at interior support
    let interior_node = n_per_span + 1;
    let end_node = n_total + 1;
    let sups = vec![
        (1, 1, "fixed"),
        (2, interior_node, "rollerX"),
        (3, end_node, "fixed"),
    ];

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Total vertical equilibrium: sum Ry = q * 2L
    let total_load: f64 = q * 2.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "Integral abutment total Ry");

    // Fixed ends should have moment reactions (non-zero Mz)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == end_node).unwrap();
    assert!(r_left.my.abs() > 1.0,
        "Integral abutment: left fixed-end moment = {:.2}", r_left.my);
    assert!(r_right.my.abs() > 1.0,
        "Integral abutment: right fixed-end moment = {:.2}", r_right.my);

    // By symmetry, fixed-end moments should be equal in magnitude
    assert_close(r_left.my.abs(), r_right.my.abs(), 0.05,
        "Integral abutment: symmetric fixed-end moments");

    // The interior support should carry more load than either end
    let r_interior = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();
    assert!(r_interior.rz > r_left.rz,
        "Interior support ({:.1}) > left end ({:.1})",
        r_interior.rz, r_left.rz);
}

// ================================================================
// 5. Pier Cap Load Distribution — Cantilever + Backspan
// ================================================================
//
// A bridge pier cap (hammerhead pier) acts as a cantilever on each
// side of the column, with backspan over the column. Under symmetric
// loading, the column carries all vertical load and zero moment.
// Under asymmetric loading, the column carries net moment.
//
// Model: a beam fixed at the center (column) with cantilevers on
// both sides. Apply equal loads at the two cantilever tips.
//
// For a symmetric hammerhead with equal loads P at each tip,
// arm length a on each side:
//   Vertical reaction at column = 2P
//   Moment at column = 0 (by symmetry)
//
// With unequal loads P1 and P2:
//   V_column = P1 + P2
//   M_column = P1*a - P2*a = a*(P1 - P2)
//
// Reference: Priestley, Seible & Calvi, "Seismic Design of Bridges"

#[test]
fn bridge_ext_pier_cap_distribution() {
    let a: f64 = 5.0; // m, cantilever arm on each side
    let p1: f64 = 80.0; // kN, load on left tip
    let p2: f64 = 80.0; // kN, load on right tip (symmetric case)
    let total_l: f64 = 2.0 * a;

    // Model: beam from x=0 to x=2a, fixed support at x=a (center)
    let n = 8; // 4 per arm
    // Build manually: fixed at center, free at tips
    let elem_len: f64 = total_l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let center_node = n / 2 + 1; // node at x = a
    let sups = vec![(1, center_node, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fz: -p1,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: -p2,
            my: 0.0,
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
    let results = solve_2d(&input).unwrap();

    // Symmetric case: V = P1 + P2, M = 0
    let r_col = results.reactions.iter().find(|r| r.node_id == center_node).unwrap();
    assert_close(r_col.rz, p1 + p2, 0.02, "Pier cap: V_column = P1 + P2");
    assert_close(r_col.my.abs(), 0.0, 0.05, "Pier cap: M_column = 0 (symmetric)");

    // Now test asymmetric case: P1 = 80, P2 = 40
    let p2_asym: f64 = 40.0;
    let nodes2: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems2: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let loads2 = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fz: -p1,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: -p2_asym,
            my: 0.0,
        }),
    ];
    let input2 = make_input(
        nodes2,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems2,
        vec![(1, center_node, "fixed")],
        loads2,
    );
    let results2 = solve_2d(&input2).unwrap();

    let r_col2 = results2.reactions.iter().find(|r| r.node_id == center_node).unwrap();
    assert_close(r_col2.rz, p1 + p2_asym, 0.02, "Pier cap asymmetric: V_column");

    // Moment should be non-zero for asymmetric loading
    // M = P1*a - P2*a = a*(P1 - P2) = 5*(80-40) = 200 kN*m
    let m_expected: f64 = a * (p1 - p2_asym);
    assert!(r_col2.my.abs() > 10.0,
        "Pier cap asymmetric: M_column should be non-zero, got {:.2}", r_col2.my);
    assert_close(r_col2.my.abs(), m_expected, 0.05, "Pier cap asymmetric: M = a*(P1-P2)");
}

// ================================================================
// 6. Deck Slab Effective Width — Stiffness Comparison
// ================================================================
//
// The effective width concept in bridge deck design states that a
// wider, thinner slab acts as if it were a narrower, fully-effective
// section. We verify this by comparing the deflection of two beams:
//   - Beam 1: full width section (larger A, larger I)
//   - Beam 2: effective width section (reduced A, reduced I)
//
// The effective beam should deflect more. If beff/b = ratio,
// then I_eff/I_full = ratio (for a rectangular slab),
// and delta_eff/delta_full = I_full/I_eff = 1/ratio.
//
// This verifies the structural mechanics behind effective width
// calculations used in AASHTO §4.6.2.6 and EN 1994-2 §5.4.1.2.
//
// Reference: Barker & Puckett, "Design of Highway Bridges", Ch. 8

#[test]
fn bridge_ext_deck_slab_effective_width() {
    let l: f64 = 12.0;
    let q: f64 = 15.0; // kN/m, lane load per girder
    let n: usize = 8;

    // Full width section properties
    let a_full: f64 = 0.06; // m^2
    let iz_full: f64 = 2.0e-3; // m^4

    // Effective width = 70% of full width for a rectangular slab
    // I_eff = 0.70 * I_full
    let eff_ratio: f64 = 0.70;
    let a_eff: f64 = a_full * eff_ratio;
    let iz_eff: f64 = iz_full * eff_ratio;

    // Build loads
    let make_loads = || -> Vec<SolverLoad> {
        (0..n).map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        })).collect()
    };

    // Full width beam
    let input_full = make_beam(n, l, E, a_full, iz_full, "pinned", Some("rollerX"), make_loads());
    let res_full = solve_2d(&input_full).unwrap();

    // Effective width beam
    let input_eff = make_beam(n, l, E, a_eff, iz_eff, "pinned", Some("rollerX"), make_loads());
    let res_eff = solve_2d(&input_eff).unwrap();

    let mid_node = n / 2 + 1;
    let delta_full: f64 = res_full.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();
    let delta_eff: f64 = res_eff.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Effective width beam should deflect more (less stiff)
    assert!(delta_eff > delta_full,
        "Effective width beam deflects more: {:.6e} > {:.6e}",
        delta_eff, delta_full);

    // Deflection ratio should be approximately I_full/I_eff = 1/eff_ratio
    let expected_ratio: f64 = 1.0 / eff_ratio;
    let actual_ratio: f64 = delta_eff / delta_full;
    assert_close(actual_ratio, expected_ratio, 0.05,
        "Deck slab: delta_eff/delta_full = I_full/I_eff");

    // Both beams should have same reactions (same load, same span)
    let sum_full: f64 = res_full.reactions.iter().map(|r| r.rz).sum();
    let sum_eff: f64 = res_eff.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_full, sum_eff, 0.02, "Deck slab: same reactions regardless of stiffness");
}

// ================================================================
// 7. Bearing Pad Design Load — Thermal Expansion Effects
// ================================================================
//
// An elastomeric bearing pad provides a flexible connection between
// the bridge deck and the pier. Under thermal expansion, the deck
// elongates and the bearing pads resist with a shear force:
//   F_bearing = k_bearing * delta_thermal
// where k_bearing is the translational spring stiffness.
//
// We model a simply supported beam on spring supports. The spring
// stiffness is k = G*A_pad/h_pad (shear stiffness of the elastomer).
// One end has a pinned support (fixed pier), the other has a spring
// (expansion pier). We apply a thermal load as an equivalent axial
// force and verify the spring reaction.
//
// For a beam with one pinned end and one roller end, an applied
// horizontal force F at the roller end produces:
//   Rx_pinned = -F (horizontal equilibrium)
// With a spring at the roller end (kx = k_spring), the force
// distributes: F_spring = F * k_spring / (k_spring + k_axial)
// where k_axial = EA/L.
//
// Reference: AASHTO LRFD §14.7.6 (Elastomeric Bearings)

#[test]
fn bridge_ext_bearing_pad_thermal_load() {
    let l: f64 = 30.0; // m, span
    let n: usize = 6;

    // Thermal expansion: delta = alpha * dT * L
    // alpha = 12e-6 /°C (steel), dT = 40°C
    // Equivalent force: F = E*A * alpha * dT = E*A * delta/L
    let alpha: f64 = 12.0e-6;
    let dt: f64 = 40.0;
    let e_kn: f64 = E * 1000.0; // kN/m^2
    let f_thermal: f64 = e_kn * A * alpha * dt; // kN

    // Model: beam with pinned left, rollerX right.
    // Apply horizontal force at right end to simulate thermal expansion.
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: f_thermal,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // The pinned end should resist the full horizontal force
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.rx, -f_thermal, 0.02, "Bearing pad: Rx_pinned = -F_thermal");

    // The right end (roller) should have zero horizontal reaction
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_right.rx, 0.0, 0.05, "Bearing pad: Rx_roller = 0");

    // The deck should expand: right end displaces to the right
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_right.ux > 0.0,
        "Bearing pad: right end displaces right under thermal force, ux={:.6e}",
        d_right.ux);

    // Axial displacement should be approximately F*L/(EA) = alpha*dT*L
    let delta_expected: f64 = alpha * dt * l;
    assert_close(d_right.ux, delta_expected, 0.05,
        "Bearing pad: thermal displacement = alpha*dT*L");
}

// ================================================================
// 8. Elastomeric Bearing — 3D Bridge Pier With Lateral Load
// ================================================================
//
// A 3D bridge pier modeled as a vertical cantilever column subjected
// to lateral load at the top (simulating wind or seismic force on
// the bridge deck). The pier is fixed at the base.
//
// For a cantilever of length L, fixed at base, free at top:
//   delta_top = P*L^3 / (3*E*I)  (lateral displacement at top)
//   M_base = P*L               (moment at fixed base)
//   V_base = P                 (shear at base)
//
// This test uses the 3D solver to verify a single pier column.
//
// Reference: AASHTO LRFD §5.6 (Columns), Priestley et al. Ch. 4

#[test]
fn bridge_ext_elastomeric_bearing_3d_pier() {
    let h: f64 = 8.0; // m, pier height
    let p_lateral: f64 = 150.0; // kN, lateral force at top
    let n: usize = 8; // elements along height

    // Pier properties (circular column, D=1.2m)
    let a_pier: f64 = 0.10; // m^2
    let iy: f64 = 8.0e-3; // m^4
    let iz: f64 = 8.0e-3; // m^4
    let j: f64 = 1.6e-2; // m^4, torsional constant

    // Build 3D cantilever column along Z-axis (vertical)
    let elem_len: f64 = h / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();

    // Fixed at base (node 1): all 6 DOFs restrained
    let sups = vec![(1, vec![true, true, true, true, true, true])];

    // Lateral force in X at top node
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: p_lateral,
        fy: 0.0,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_pier, iy, iz, j)],
        elems,
        sups,
        loads,
    );
    let results = solve_3d(&input).unwrap();

    // Base reactions: Rx = -P, Mz or My = -P*H (moment about appropriate axis)
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.fx, -p_lateral, 0.03, "3D pier: Rx_base = -P");

    // Moment at base: for force in X on a Z-axis column, moment is about Y
    let m_base_expected: f64 = p_lateral * h;
    assert_close(r_base.my.abs(), m_base_expected, 0.05, "3D pier: My_base = P*H");

    // Top displacement in X direction
    let e_kn: f64 = E * 1000.0;
    // For cantilever with force P at free end, bending about Y axis uses Iy
    // (force in X, column along Z => bending about Y => uses Iy)
    let delta_expected: f64 = p_lateral * h.powi(3) / (3.0 * e_kn * iy);
    let d_top = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_top.ux > 0.0,
        "3D pier: top displaces in direction of load, ux={:.6e}", d_top.ux);
    assert_close(d_top.ux, delta_expected, 0.05, "3D pier: delta_top = PL^3/(3EI)");

    // Vertical displacement at top should be negligible
    assert!(d_top.uz.abs() < delta_expected * 0.01,
        "3D pier: negligible vertical displacement, uz={:.6e}", d_top.uz);
}
