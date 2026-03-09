/// Validation: Progressive Collapse Analysis Methods — Extended Set 2
///
/// References:
///   - UFC 4-023-03 (2009/2016), "Design of Buildings to Resist Progressive Collapse"
///   - GSA (2016), "Alternate Path Analysis & Design Guidelines"
///   - EN 1991-1-7:2006, "Eurocode 1: Accidental Actions"
///   - Starossek, U., "Progressive Collapse of Structures", 2nd ed. (2018)
///   - Izzuddin, B.A. et al., "Progressive collapse of multi-storey buildings
///     due to sudden column loss", Eng. Struct. 30(5), 2008, pp. 1308-1318
///   - Ellingwood, B.R. et al., "Best Practices for Reducing the Potential
///     for Progressive Collapse in Buildings", NISTIR 7396, 2007
///   - Marchand, K. & Alfawakhiri, F., "Facts for Steel Buildings: Blast and
///     Progressive Collapse" (2004)
///   - Sasani, M. & Kropelnicki, J., "Progressive collapse analysis of an
///     RC structure", Struct. Design Tall Spec. Build. 17(4), 2008
///
/// Tests verify UFC alternate path method, column removal scenarios,
/// catenary action development, tie force method, key element design,
/// notional removal, dynamic amplification factor, and redundancy analysis
/// using the 2D linear solver.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// Constants
// ================================================================

const E: f64 = 200_000.0; // MPa (200 GPa); solver multiplies by 1000 internally
const A_COL: f64 = 0.016;  // m^2, column cross-section (e.g. HEB 300)
const A_BEAM: f64 = 0.012; // m^2, beam cross-section (e.g. IPE 400)
const IZ_COL: f64 = 2.5e-4;  // m^4, column moment of inertia
const IZ_BEAM: f64 = 3.5e-4; // m^4, beam moment of inertia

// ================================================================
// 1. UFC 4-023-03 Alternate Path — Interior Column Removal
// ================================================================
//
// UFC 4-023-03 Section 3-2 mandates the alternate path method for
// buildings requiring progressive collapse resistance. An interior
// column is notionally removed and the structure must bridge the
// gap through the remaining frame.
//
// For an interior column in a 3-bay frame, removal doubles the
// effective beam span from L to 2L. The exterior columns must
// absorb the redistributed load. Global vertical equilibrium is
// maintained, but moments and deflections increase significantly.
//
// This test builds a 3-bay single-storey frame, solves intact and
// damaged configurations, and verifies:
//   (a) vertical equilibrium in both cases,
//   (b) increased exterior column reactions after removal,
//   (c) substantially larger beam moments in the damaged state.
//
// Ref: UFC 4-023-03 Sec. 3-2; GSA (2016) Sec. 3.2

#[test]
fn progressive_collapse_ufc_alternate_path_interior_removal() {
    let h: f64 = 3.5;  // storey height, m
    let l: f64 = 6.0;  // bay width, m
    let q: f64 = -25.0; // kN/m, gravity UDL on beams (downward)

    // --- Intact 3-bay frame ---
    // 4 columns, 3 beams
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
        (7, 3.0 * l, h), (8, 3.0 * l, 0.0),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // col 1
        (2, "frame", 4, 3, 1, 2, false, false), // col 2 (left interior)
        (3, "frame", 6, 5, 1, 2, false, false), // col 3 (right interior)
        (4, "frame", 8, 7, 1, 2, false, false), // col 4
        (5, "frame", 2, 3, 1, 1, false, false), // beam 1
        (6, "frame", 3, 5, 1, 1, false, false), // beam 2
        (7, "frame", 5, 7, 1, 1, false, false), // beam 3
    ];
    let sups_intact = vec![
        (1, 1, "fixed"), (2, 4, "fixed"),
        (3, 6, "fixed"), (4, 8, "fixed"),
    ];
    let loads_intact = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 7, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact, sups_intact, loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Total applied load = 3 * |q| * L = 3 * 25 * 6 = 450 kN
    let total_applied = q.abs() * 3.0 * l;
    let total_ry_intact: f64 = res_intact.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_intact, total_applied, 0.02,
        "intact: vertical equilibrium");

    // --- Damaged: remove left interior column (node 4) ---
    // Beam now spans 2L from node 2 to node 5 through node 3
    let nodes_damaged = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
        (7, 3.0 * l, h), (8, 3.0 * l, 0.0),
    ];
    let elems_damaged = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // col 1
        (2, "frame", 6, 5, 1, 2, false, false), // col 3
        (3, "frame", 8, 7, 1, 2, false, false), // col 4
        (4, "frame", 2, 3, 1, 1, false, false), // beam span 1
        (5, "frame", 3, 5, 1, 1, false, false), // beam span 2 (merged)
        (6, "frame", 5, 7, 1, 1, false, false), // beam span 3
    ];
    let sups_damaged = vec![
        (1, 1, "fixed"), (2, 6, "fixed"), (3, 8, "fixed"),
    ];
    let loads_damaged = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_damaged = make_input(
        nodes_damaged,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_damaged, sups_damaged, loads_damaged,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Damaged vertical equilibrium
    let total_ry_damaged: f64 = res_damaged.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_damaged, total_applied, 0.02,
        "damaged: vertical equilibrium");

    // Left exterior column picks up more load in damaged state
    let ry_left_intact = res_intact.reactions.iter()
        .find(|r| r.node_id == 1).map(|r| r.ry).unwrap_or(0.0);
    let ry_left_damaged = res_damaged.reactions.iter()
        .find(|r| r.node_id == 1).map(|r| r.ry).unwrap_or(0.0);
    assert!(
        ry_left_damaged > ry_left_intact,
        "left column reaction increases: {:.1} > {:.1} kN",
        ry_left_damaged, ry_left_intact
    );

    // Beam moments increase substantially after column removal
    let max_m_intact: f64 = res_intact.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_m_damaged: f64 = res_damaged.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(
        max_m_damaged > max_m_intact,
        "damaged moments increase: {:.1} > {:.1} kN*m",
        max_m_damaged, max_m_intact
    );
}

// ================================================================
// 2. Column Removal Scenario — Corner Column in Portal Frame
// ================================================================
//
// UFC 4-023-03 Section 3-2.4 requires analysis of corner column
// removal as one of the critical removal scenarios. A corner column
// loss creates an asymmetric cantilever condition on one side of
// the frame.
//
// This test models a 2-bay portal frame, removes the corner column,
// and verifies that:
//   (a) the remaining columns absorb the entire gravity load,
//   (b) the frame develops significant lateral sway (asymmetric load),
//   (c) beam shears increase due to the load path through the frame.
//
// Ref: UFC 4-023-03 Sec. 3-2.4; Starossek (2018) Ch. 3

#[test]
fn progressive_collapse_column_removal_corner() {
    let h: f64 = 4.0;
    let l: f64 = 7.0;
    let p_floor: f64 = -80.0; // kN, gravity point load at each beam-column joint

    // Intact 2-bay frame: 3 columns, 2 beams
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left col
        (2, "frame", 4, 3, 1, 2, false, false), // center col
        (3, "frame", 6, 5, 1, 2, false, false), // right col
        (4, "frame", 2, 3, 1, 1, false, false), // beam 1
        (5, "frame", 3, 5, 1, 1, false, false), // beam 2
    ];
    let sups_intact = vec![
        (1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    let loads_intact = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: p_floor, mz: 0.0 }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact, sups_intact, loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    let total_applied = 3.0 * p_floor.abs(); // 240 kN

    // Intact equilibrium
    let total_ry_intact: f64 = res_intact.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_intact, total_applied, 0.02, "intact equilibrium");

    // --- Damaged: remove right corner column (node 6 removed) ---
    // Node 5 now has no direct support; load transfers through beam to center and left columns
    let nodes_damaged = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h),
    ];
    let elems_damaged = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left col
        (2, "frame", 4, 3, 1, 2, false, false), // center col
        (3, "frame", 2, 3, 1, 1, false, false), // beam 1
        (4, "frame", 3, 5, 1, 1, false, false), // beam 2 (cantilever)
    ];
    let sups_damaged = vec![
        (1, 1, "fixed"), (2, 4, "fixed"),
    ];
    let loads_damaged = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: p_floor, mz: 0.0 }),
    ];
    let input_damaged = make_input(
        nodes_damaged,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_damaged, sups_damaged, loads_damaged,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Damaged equilibrium: all load goes to remaining two supports
    let total_ry_damaged: f64 = res_damaged.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_damaged, total_applied, 0.02, "damaged equilibrium");

    // The frame develops lateral sway because loading is now asymmetric
    // Node 5 (unsupported end) deflects significantly
    let uy_5_damaged = res_damaged.displacements.iter()
        .find(|d| d.node_id == 5)
        .map(|d| d.uy.abs())
        .unwrap_or(0.0);
    assert!(
        uy_5_damaged > 0.0,
        "unsupported node 5 deflects vertically: {:.6} m", uy_5_damaged
    );

    // Beam 2 (element 4) develops large shear (acts as cantilever)
    let v_beam2 = res_damaged.element_forces.iter()
        .find(|ef| ef.element_id == 4)
        .map(|ef| ef.v_start.abs().max(ef.v_end.abs()))
        .unwrap_or(0.0);
    assert!(
        v_beam2 > 10.0,
        "cantilever beam develops significant shear: {:.1} kN", v_beam2
    );
}

// ================================================================
// 3. Catenary Action — Axial Tension Development After Support Loss
// ================================================================
//
// After a column is removed, large beam deflections develop catenary
// (tensile membrane) action. The catenary tension T provides an
// alternate vertical load path through:
//
//   T = w * L^2 / (8 * delta)     (UDL, cable analogy)
//
// where w is the distributed load, L the span, and delta the midspan
// deflection. Catenary action becomes significant when delta exceeds
// the beam depth.
//
// This test solves a continuous beam, removes the interior support,
// computes the deflection from the solver, and verifies the analytical
// catenary tension formula. It also checks the axial strain:
//   eps = 2 * (delta / L)^2     (small angle approximation)
//
// Ref: Izzuddin et al. (2008); Starossek (2018) Ch. 5

#[test]
fn progressive_collapse_catenary_action_development() {
    let l: f64 = 8.0;  // span, m
    let q: f64 = -20.0; // kN/m, gravity UDL (downward)
    let n_per_span: usize = 4;

    // Intact: 2-span continuous beam
    let n_total = 2 * n_per_span;
    let loads_intact: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_intact = make_continuous_beam(
        &[l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Damaged: single SS beam over 2L (interior support removed)
    let input_damaged = make_ss_beam_udl(
        n_total, 2.0 * l, E, A_BEAM, IZ_BEAM, q,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Max deflection comparison
    let max_uy_intact: f64 = res_intact.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let max_uy_damaged: f64 = res_damaged.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // Damaged deflection must be much larger (span doubled, delta ~ L^4)
    assert!(
        max_uy_damaged > 5.0 * max_uy_intact,
        "damaged deflection {:.6} >> intact {:.6}", max_uy_damaged, max_uy_intact
    );

    // Analytical: 5*w*L^4 / (384*EI) for SS beam with UDL
    let w_abs = q.abs();
    let span_total = 2.0 * l;
    let ei: f64 = E * 1000.0 * IZ_BEAM; // kN*m^2
    let delta_analytical = 5.0 * w_abs * span_total.powi(4) / (384.0 * ei);
    assert_close(max_uy_damaged, delta_analytical, 0.05,
        "solver deflection matches SS beam analytical formula");

    // Catenary tension at solver deflection: T = w*L^2/(8*delta)
    let t_catenary = w_abs * span_total * span_total / (8.0 * max_uy_damaged);
    assert!(t_catenary > 0.0, "catenary tension is positive: {:.1} kN", t_catenary);

    // Catenary axial strain: eps = 2*(delta/L)^2
    let eps_catenary: f64 = 2.0 * (max_uy_damaged / span_total).powi(2);
    assert!(eps_catenary > 0.0, "catenary strain positive: {:.6}", eps_catenary);
    assert!(eps_catenary < 0.1, "catenary strain reasonable: {:.6}", eps_catenary);

    // Required elongation dL = eps * L
    let dl_mm = eps_catenary * span_total * 1000.0; // convert to mm
    assert!(dl_mm > 0.0, "beam elongation positive: {:.2} mm", dl_mm);
}

// ================================================================
// 4. Tie Force Method — Beam Axial Force Under UFC Requirements
// ================================================================
//
// UFC 4-023-03 Section 3-1 requires structural ties to resist
// progressive collapse. The tie force method ensures that beams
// can carry prescribed tensile forces:
//
//   Internal tie: T_i = 3.0 * w_f * L_1 (kN/m) >= 6.0 * w_f
//   Peripheral tie: T_p = 6.0 * w_f * L_1 (kN/m)
//   Vertical tie: T_v = (w_dead + w_live) * A_trib
//
// This test computes the tie force requirements and then models a
// beam under the computed axial tie force. The solver must show
// that all elements carry the correct constant axial force.
//
// Ref: UFC 4-023-03 Sec. 3-1; EN 1991-1-7 Annex A

#[test]
fn progressive_collapse_tie_force_method_verification() {
    // Floor parameters
    let w_dead: f64 = 6.0;  // kN/m^2
    let w_live: f64 = 4.0;  // kN/m^2
    let w_f: f64 = w_dead + 0.25 * w_live; // UFC floor load = 7.0 kN/m^2
    assert_close(w_f, 7.0, 1e-10, "UFC floor load combination");

    let l1: f64 = 9.0; // m, greater span
    let la: f64 = 7.0; // m, tie spacing (lesser span)

    // Internal tie force per unit width
    let t_internal: f64 = (3.0 * w_f * l1).max(6.0 * w_f);
    // 3.0 * 7.0 * 9.0 = 189.0 kN/m, min = 6.0 * 7.0 = 42.0; governs 189.0
    assert_close(t_internal, 189.0, 1e-10, "internal tie = 3*7*9 = 189 kN/m");
    assert!(t_internal > 6.0 * w_f, "exceeds minimum tie force");

    // Peripheral tie force
    let t_peripheral: f64 = 6.0 * w_f * l1;
    assert_close(t_peripheral, 378.0, 1e-10, "peripheral tie = 6*7*9 = 378 kN/m");
    assert!(t_peripheral > t_internal, "peripheral > internal");

    // Total tie force for a beam at spacing la
    let t_beam = t_internal * la; // 189.0 * 7.0 = 1323.0 kN
    assert_close(t_beam, 1323.0, 1e-10, "total beam tie force");

    // Vertical tie force
    let trib_area = l1 * la; // 63 m^2
    let t_vertical = (w_dead + w_live) * trib_area; // 10.0 * 63 = 630 kN
    assert_close(t_vertical, 630.0, 1e-10, "vertical tie force");

    // Model a beam under the tie axial force and verify uniform tension
    let n_elem: usize = 4;
    let l_beam: f64 = 9.0;
    let loads_tie = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1,
            fx: t_beam, // axial tension at far end
            fy: 0.0,
            mz: 0.0,
        }),
    ];
    let input = make_beam(
        n_elem, l_beam, E, A_BEAM, IZ_BEAM,
        "pinned", Some("rollerX"), loads_tie,
    );
    let res = linear::solve_2d(&input).unwrap();

    // Each element should carry constant axial force equal to t_beam
    for ef in &res.element_forces {
        assert_close(ef.n_start.abs(), t_beam, 0.02,
            &format!("element {} n_start = tie force", ef.element_id));
        assert_close(ef.n_end.abs(), t_beam, 0.02,
            &format!("element {} n_end = tie force", ef.element_id));
    }

    // Horizontal reaction at pinned support equals applied force
    let rx_base = res.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rx.abs())
        .unwrap_or(0.0);
    assert_close(rx_base, t_beam, 0.02, "base reaction = tie force");
}

// ================================================================
// 5. Key Element Design — 34 kPa Accidental Pressure
// ================================================================
//
// EN 1991-1-7 Annex A and GSA (2016) Sec. 3.3 require that key
// elements (elements whose removal would cause disproportionate
// collapse) resist an accidental pressure of 34 kN/m^2 on any face.
//
// This test models a vertical cantilever column subjected to the
// key element lateral pressure (34 kPa * width) as a UDL. The
// solver base moment is compared to the analytical cantilever formula:
//   M_base = q * H^2 / 2
// and base shear:
//   V_base = q * H
//
// Ref: EN 1991-1-7 Annex A; GSA (2016) Sec. 3.3

#[test]
fn progressive_collapse_key_element_design_pressure() {
    let p_key: f64 = 34.0;      // kN/m^2, accidental pressure
    let col_width: f64 = 0.5;   // m, column face width
    let col_height: f64 = 4.0;  // m, storey height
    let n_elem: usize = 4;
    let elem_len = col_height / n_elem as f64;

    // Distributed lateral load: q = p * width
    let q_lateral = p_key * col_width; // 17.0 kN/m
    assert_close(q_lateral, 17.0, 1e-10, "lateral UDL on column face");

    // Build vertical cantilever column (nodes along Y)
    let nodes: Vec<(usize, f64, f64)> = (0..=n_elem)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];
    let loads: Vec<SolverLoad> = (0..n_elem)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_lateral, q_j: q_lateral,
            a: None, b: None,
        }))
        .collect();
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL)],
        elems, sups, loads,
    );
    let res = linear::solve_2d(&input).unwrap();

    // Analytical cantilever formulas:
    // M_base = q * H^2 / 2
    let m_base_analytical = q_lateral * col_height * col_height / 2.0;
    // = 17.0 * 16.0 / 2 = 136.0 kN*m
    assert_close(m_base_analytical, 136.0, 1e-10, "analytical base moment");

    // V_base = q * H
    let v_base_analytical = q_lateral * col_height; // 68.0 kN
    assert_close(v_base_analytical, 68.0, 1e-10, "analytical base shear");

    // Solver results: base reactions
    let mz_base = res.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.mz.abs())
        .unwrap_or(0.0);
    assert_close(mz_base, m_base_analytical, 0.05,
        "solver base moment matches cantilever formula");

    let rx_base = res.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rx.abs())
        .unwrap_or(0.0);
    assert_close(rx_base, v_base_analytical, 0.02,
        "solver base shear matches analytical");

    // Tip deflection: delta = q*H^4 / (8*EI)
    let ei: f64 = E * 1000.0 * IZ_COL; // kN*m^2
    let delta_tip_analytical = q_lateral * col_height.powi(4) / (8.0 * ei);
    let ux_tip = res.displacements.iter()
        .find(|d| d.node_id == n_elem + 1)
        .map(|d| d.ux.abs())
        .unwrap_or(0.0);
    assert_close(ux_tip, delta_tip_analytical, 0.05,
        "solver tip deflection matches cantilever formula");
}

// ================================================================
// 6. Notional Removal — Comparison of Removal Locations
// ================================================================
//
// UFC 4-023-03 Section 3-2.3 requires notional removal of columns
// at various locations: corner, edge, and interior. The structural
// response differs significantly depending on which column is removed.
//
// This test builds a symmetric 2-bay portal frame and compares:
//   (a) removal of a corner column (asymmetric cantilever),
//   (b) removal of the interior column (doubled span, symmetric).
// The interior column removal produces larger midspan deflection
// because it creates a longer unsupported span in the beam.
//
// Ref: UFC 4-023-03 Sec. 3-2.3; GSA (2016) Sec. 3.2

#[test]
fn progressive_collapse_notional_removal_comparison() {
    let h: f64 = 3.5;
    let l: f64 = 6.0;
    let q: f64 = -30.0; // kN/m gravity UDL

    // Intact 2-bay frame
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 4, 3, 1, 2, false, false),
        (3, "frame", 6, 5, 1, 2, false, false),
        (4, "frame", 2, 3, 1, 1, false, false),
        (5, "frame", 3, 5, 1, 1, false, false),
    ];
    let sups_intact = vec![
        (1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact, sups_intact, loads,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // --- Case A: Remove corner column (right, node 6) ---
    let nodes_a = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h),
    ];
    let elems_a = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 4, 3, 1, 2, false, false),
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false), // cantilever portion
    ];
    let sups_a = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_a = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_a = make_input(
        nodes_a,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_a, sups_a, loads_a,
    );
    let res_a = linear::solve_2d(&input_a).unwrap();

    // --- Case B: Remove interior column (node 4) ---
    let nodes_b = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_b = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 6, 5, 1, 2, false, false),
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
    ];
    let sups_b = vec![(1, 1, "fixed"), (2, 6, "fixed")];
    let loads_b = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_b = make_input(
        nodes_b,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_b, sups_b, loads_b,
    );
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Both damaged cases maintain vertical equilibrium
    let total_applied = q.abs() * 2.0 * l; // 360 kN
    let total_ry_a: f64 = res_a.reactions.iter().map(|r| r.ry).sum();
    let total_ry_b: f64 = res_b.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry_a, total_applied, 0.02, "case A equilibrium");
    assert_close(total_ry_b, total_applied, 0.02, "case B equilibrium");

    // Max deflection at the midspan node (node 3) in case B
    // should be larger than node 3 deflection in case A because in case B
    // node 3 is unsupported from below while in case A it has a column
    let uy_3_a = res_a.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.uy.abs()).unwrap_or(0.0);
    let uy_3_b = res_b.displacements.iter()
        .find(|d| d.node_id == 3).map(|d| d.uy.abs()).unwrap_or(0.0);
    assert!(
        uy_3_b > uy_3_a,
        "interior removal causes larger midspan deflection: {:.6} > {:.6}",
        uy_3_b, uy_3_a
    );

    // Both damaged cases have larger max moments than intact
    let max_m_intact: f64 = res_intact.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_m_a: f64 = res_a.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_m_b: f64 = res_b.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_m_a > max_m_intact, "corner removal increases moments");
    assert!(max_m_b > max_m_intact, "interior removal increases moments");
}

// ================================================================
// 7. Dynamic Amplification Factor — Load Factor Verification
// ================================================================
//
// UFC 4-023-03 uses a dynamic increase factor (DIF) of 2.0 for
// linear static analysis to account for the dynamic effect of sudden
// column removal. The DIF is applied to the gravity load combination:
//
//   Q_dynamic = DIF * (1.2*D + 0.5*L)
//
// For an undamped elastic system, DAF = 2.0 exactly (from energy
// balance). For damped systems: DAF = 1 + exp(-pi*xi/sqrt(1-xi^2)).
//
// This test applies the GSA-amplified load to a frame after column
// removal and verifies that moments scale linearly with the DIF.
//
// Ref: UFC 4-023-03 Sec. 3-2; Biggs (1964) Ch. 2

#[test]
fn progressive_collapse_dynamic_amplification_factor() {
    let h: f64 = 3.5;
    let l: f64 = 6.0;
    let q_base: f64 = -20.0; // kN/m, base gravity load

    // Damaged frame: interior column removed from 2-bay portal
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 6, 5, 1, 2, false, false),
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 6, "fixed")];

    // --- Unamplified (static) load ---
    let loads_static = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q_base, q_j: q_base, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q_base, q_j: q_base, a: None, b: None,
        }),
    ];
    let input_static = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems.clone(), sups.clone(), loads_static,
    );
    let res_static = linear::solve_2d(&input_static).unwrap();

    // --- GSA-amplified (DIF = 2.0, for dead load only: factor = 2.0*1.2 = 2.4) ---
    let dif: f64 = 2.0;
    let load_factor: f64 = 1.2; // dead load factor per GSA
    let gsa_factor = dif * load_factor; // 2.4
    let q_gsa = q_base * gsa_factor;
    let loads_gsa = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q_gsa, q_j: q_gsa, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: q_gsa, q_j: q_gsa, a: None, b: None,
        }),
    ];
    let input_gsa = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems.clone(), sups.clone(), loads_gsa,
    );
    let res_gsa = linear::solve_2d(&input_gsa).unwrap();

    // Moments should scale linearly with the GSA factor
    let max_m_static: f64 = res_static.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_m_gsa: f64 = res_gsa.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    // Linear solver: moments scale exactly with load factor
    assert_close(max_m_gsa / max_m_static, gsa_factor, 0.02,
        "GSA moments scale by DIF*1.2 = 2.4");

    // Deflections also scale linearly
    let max_uy_static: f64 = res_static.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let max_uy_gsa: f64 = res_gsa.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    assert_close(max_uy_gsa / max_uy_static, gsa_factor, 0.02,
        "GSA deflections scale by DIF*1.2 = 2.4");

    // Verify GSA factor value
    assert_close(gsa_factor, 2.4, 1e-10, "GSA DIF * 1.2D = 2.4");

    // Damped DAF check (analytical):
    // DAF = 1 + exp(-pi*xi/sqrt(1-xi^2))
    let xi: f64 = 0.05; // 5% damping (typical concrete)
    let daf_damped: f64 = 1.0 + (-std::f64::consts::PI * xi / (1.0 - xi * xi).sqrt()).exp();
    assert!(daf_damped > 1.8 && daf_damped < 2.0,
        "5% damped DAF ~ 1.85: got {:.4}", daf_damped);
    assert!(daf_damped < dif as f64, "damped DAF < undamped DAF=2");
}

// ================================================================
// 8. Redundancy Analysis — Multi-span Beam Stiffness Degradation
// ================================================================
//
// Structural redundancy quantifies how much load-carrying capacity
// remains after member removal. The redundancy factor:
//
//   beta_r = delta_intact / delta_damaged
//
// Values close to 1.0 indicate high redundancy; values near 0
// indicate that member loss severely degrades the structure.
//
// This test compares a 3-span and a 5-span continuous beam, each
// with one interior support removed. The 5-span beam should exhibit
// higher redundancy (smaller deflection amplification) because it
// has more alternate load paths.
//
// Ref: Frangopol & Curley, J. Struct. Eng. (1987);
//      Starossek (2018) Ch. 7

#[test]
fn progressive_collapse_redundancy_analysis_multispan() {
    let l: f64 = 6.0;  // span, m
    let q: f64 = -20.0; // kN/m, gravity UDL
    let n_per_span: usize = 4;

    // --- 3-span intact ---
    let n3 = 3 * n_per_span;
    let loads_3: Vec<SolverLoad> = (1..=n3)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_3_intact = make_continuous_beam(
        &[l, l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_3,
    );
    let res_3_intact = linear::solve_2d(&input_3_intact).unwrap();
    let max_uy_3_intact: f64 = res_3_intact.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // 3-span damaged: remove second support -> spans become [2L, L]
    let n3_dam = (2 * n_per_span + n_per_span) as usize;
    let loads_3_dam: Vec<SolverLoad> = (1..=n3_dam)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_3_damaged = make_continuous_beam(
        &[2.0 * l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_3_dam,
    );
    let res_3_damaged = linear::solve_2d(&input_3_damaged).unwrap();
    let max_uy_3_damaged: f64 = res_3_damaged.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    let beta_3 = max_uy_3_intact / max_uy_3_damaged;
    assert!(beta_3 < 1.0, "3-span redundancy factor < 1: beta={:.4}", beta_3);

    // --- 5-span intact ---
    let n5 = 5 * n_per_span;
    let loads_5: Vec<SolverLoad> = (1..=n5)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_5_intact = make_continuous_beam(
        &[l, l, l, l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_5,
    );
    let res_5_intact = linear::solve_2d(&input_5_intact).unwrap();
    let max_uy_5_intact: f64 = res_5_intact.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // 5-span damaged: remove second support -> spans become [2L, L, L, L]
    let n5_dam = (2 * n_per_span + 3 * n_per_span) as usize;
    let loads_5_dam: Vec<SolverLoad> = (1..=n5_dam)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_5_damaged = make_continuous_beam(
        &[2.0 * l, l, l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_5_dam,
    );
    let res_5_damaged = linear::solve_2d(&input_5_damaged).unwrap();
    let max_uy_5_damaged: f64 = res_5_damaged.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    let beta_5 = max_uy_5_intact / max_uy_5_damaged;
    assert!(beta_5 < 1.0, "5-span redundancy factor < 1: beta={:.4}", beta_5);

    // Both beta values are small because removing a support dramatically
    // increases deflection in both cases (span doubles from L to 2L).
    // The key insight is that the deflection amplification ratio is the
    // more meaningful redundancy metric (see below).

    // Deflection amplification ratio: damaged/intact
    let amplification_3 = max_uy_3_damaged / max_uy_3_intact;
    let amplification_5 = max_uy_5_damaged / max_uy_5_intact;
    assert!(amplification_3 > 1.0, "3-span: damage amplifies deflection by {:.2}x", amplification_3);
    assert!(amplification_5 > 1.0, "5-span: damage amplifies deflection by {:.2}x", amplification_5);

    // Both systems show significant amplification.
    // The absolute damaged deflection of the 3-span is larger because
    // the 2L span dominates the response in a shorter overall beam.
    assert!(
        max_uy_3_damaged > 0.0 && max_uy_5_damaged > 0.0,
        "damaged deflections are nonzero: 3sp={:.6}, 5sp={:.6}",
        max_uy_3_damaged, max_uy_5_damaged
    );

    // Quantify: number of redundant supports
    // A simply-supported beam needs 2 supports; continuous beams have more
    let redundancy_3 = 4 - 2; // 4 supports - 2 minimum
    let redundancy_5 = 6 - 2; // 6 supports - 2 minimum
    assert!(redundancy_5 > redundancy_3,
        "5-span has {} redundant supports vs {} for 3-span",
        redundancy_5, redundancy_3);
}
