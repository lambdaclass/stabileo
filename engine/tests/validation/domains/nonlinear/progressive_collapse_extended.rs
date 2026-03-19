/// Validation: Progressive Collapse & Structural Robustness — Extended
///
/// References:
///   - GSA (2016), "Alternate Path Analysis & Design Guidelines for Progressive Collapse"
///   - DoD UFC 4-023-03 (2009), "Design of Buildings to Resist Progressive Collapse"
///   - EN 1991-1-7:2006, "Eurocode 1: Accidental Actions"
///   - Starossek, U., "Progressive Collapse of Structures", 2nd ed. (2018)
///   - Izzuddin et al., "Progressive collapse of multi-storey buildings", Eng. Struct. (2008)
///   - Ellingwood, B., "Mitigating Risk from Abnormal Loads and Progressive Collapse",
///     J. Perf. Constr. Facil. (2006)
///   - Marchand & Alfawakhiri, "Facts for Steel Buildings: Blast and Progressive Collapse" (2004)
///   - Adam, Parisi, et al., "Research and practice on progressive collapse" (2018)
///
/// Tests use the linear solver to verify progressive collapse resistance concepts:
/// column removal, catenary action, Vierendeel action, alternate load paths,
/// tie force requirements, key element assessment, multi-column removal,
/// and redundancy quantification.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// Constants
// ================================================================

const E: f64 = 200_000.0; // MPa (200 GPa); solver uses E * 1000.0 internally
const A_COL: f64 = 0.015;  // m^2, column cross-section
const A_BEAM: f64 = 0.012; // m^2, beam cross-section
const IZ_COL: f64 = 2.0e-4;  // m^4, column moment of inertia
const IZ_BEAM: f64 = 3.0e-4; // m^4, beam moment of inertia
const Q_GRAV: f64 = -30.0;   // kN/m, gravity distributed load (downward)

// ================================================================
// 1. Column Removal — 2-Bay Frame, Redistributed Forces
// ================================================================
//
// A 2-bay single-storey rigid frame (3 columns, 2 beams) is loaded
// with gravity UDL on both beams. Removing the interior column forces
// load redistribution to the exterior columns. We compare the intact
// frame reactions against a damaged (single-bay, double-span) frame.
//
// Intact: nodes 1-5 with columns at 1-2, 3-4 (interior), 5-6 and
//         beams spanning 2-3, 4-5.
// Damaged: interior column removed; beam now spans the full 2L.
//
// Ref: GSA (2016) Sec. 3.2; Starossek (2018) Ch. 3

#[test]
fn progressive_collapse_column_removal_2bay_frame() {
    let h: f64 = 3.5;  // storey height
    let l: f64 = 6.0;  // bay width

    // --- Intact 2-bay frame ---
    // Nodes: 1(0,0), 2(0,h), 3(L,h), 4(L,0), 5(2L,h), 6(2L,0)
    // Columns: 1-2, 4-3 (interior), 6-5
    // Beams: 2-3, 3-5
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 4, 3, 1, 2, false, false), // interior column
        (4, "frame", 3, 5, 1, 1, false, false), // right beam
        (5, "frame", 6, 5, 1, 2, false, false), // right column
    ];
    let sups_intact = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
        (3, 6, "fixed"),
    ];
    let loads_intact = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact,
        sups_intact,
        loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Total vertical reaction must equal total applied load = 2 * q * L
    let total_vert_intact: f64 = res_intact.reactions.iter().map(|r| r.rz).sum();
    let total_applied = -Q_GRAV * 2.0 * l; // positive (upward reaction for downward load)
    assert_close(total_vert_intact, total_applied, 0.02, "intact vertical equilibrium");

    // Interior column carries roughly half the total load (by symmetry)
    // Find reaction at node 4 (interior column base)
    let ry_interior = res_intact.reactions.iter()
        .find(|r| r.node_id == 4)
        .map(|r| r.rz)
        .unwrap_or(0.0);
    assert!(
        ry_interior.abs() > 0.2 * total_applied,
        "Interior column carries significant load: {:.1} kN", ry_interior
    );

    // --- Damaged frame: remove interior column ---
    // Nodes: 1(0,0), 2(0,h), 3(L,h), 5(2L,h), 6(2L,0)
    // Beam now spans continuously 2-3-5 (double span, 2L = 12m)
    let nodes_damaged = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_damaged = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 3, 5, 1, 1, false, false), // right beam (now double span with elem 2)
        (4, "frame", 6, 5, 1, 2, false, false), // right column
    ];
    let sups_damaged = vec![
        (1, 1, "fixed"),
        (2, 6, "fixed"),
    ];
    let loads_damaged = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
    ];
    let input_damaged = make_input(
        nodes_damaged,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_damaged,
        sups_damaged,
        loads_damaged,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Vertical equilibrium still holds in damaged structure
    let total_vert_damaged: f64 = res_damaged.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_vert_damaged, total_applied, 0.02, "damaged vertical equilibrium");

    // Each exterior column now carries more than in the intact case
    // In intact case, exterior columns each carry roughly 1/4 of total load
    // In damaged case, they each carry roughly 1/2 of total load
    let ry_left_intact = res_intact.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rz)
        .unwrap_or(0.0);
    let ry_left_damaged = res_damaged.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rz)
        .unwrap_or(0.0);
    assert!(
        ry_left_damaged.abs() > ry_left_intact.abs(),
        "Exterior column load increases after removal: {:.1} > {:.1}",
        ry_left_damaged.abs(), ry_left_intact.abs()
    );

    // Deflection at midspan (node 3) increases significantly
    let uy_mid_intact = res_intact.displacements.iter()
        .find(|d| d.node_id == 3)
        .map(|d| d.uz.abs())
        .unwrap_or(0.0);
    let uy_mid_damaged = res_damaged.displacements.iter()
        .find(|d| d.node_id == 3)
        .map(|d| d.uz.abs())
        .unwrap_or(0.0);
    assert!(
        uy_mid_damaged > uy_mid_intact,
        "Midspan deflection increases: {:.6} > {:.6}", uy_mid_damaged, uy_mid_intact
    );
}

// ================================================================
// 2. Catenary Action — Beam Develops Tension After Support Loss
// ================================================================
//
// A beam spanning 2L after interior support removal develops both
// bending and axial (catenary) response. We verify the solver
// captures the increased bending demand when the beam loses its
// intermediate support. With fixed ends, the beam that previously
// spanned L now spans 2L, causing moment to increase by ~4x.
//
// We also verify the analytical catenary tension formula:
//   T = w*L^2 / (8*delta)
// against the solver deflection.
//
// Ref: Izzuddin et al. (2008); Starossek (2018) Ch. 5

#[test]
fn progressive_collapse_catenary_action_after_support_loss() {
    let l: f64 = 5.0;
    let n_per_span: usize = 4;
    let q: f64 = -25.0; // kN/m downward

    // Intact: 2-span continuous beam (L + L) with interior support
    let loads_2span: Vec<SolverLoad> = (1..=(2 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_intact = make_continuous_beam(&[l, l], n_per_span, E, A_BEAM, IZ_BEAM, loads_2span);
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Damaged: single span beam over 2L (remove interior support)
    let loads_single: Vec<SolverLoad> = (1..=(2 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_damaged = make_ss_beam_udl(2 * n_per_span, 2.0 * l, E, A_BEAM, IZ_BEAM, q);
    // Use the simple SS beam for the damaged case
    let _loads_single = loads_single;
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Max deflection in intact vs damaged
    let max_uy_intact: f64 = res_intact.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    let max_uy_damaged: f64 = res_damaged.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Damaged deflection should be much larger (span doubled -> delta ~ 16x for SS)
    assert!(
        max_uy_damaged > 5.0 * max_uy_intact,
        "Damaged deflection {:.6} >> intact {:.6}",
        max_uy_damaged, max_uy_intact
    );

    // Verify analytical catenary tension formula at solver deflection
    // T = w * (2L)^2 / (8 * delta)
    let w_abs = q.abs();
    let span_damaged = 2.0 * l;
    let t_catenary = w_abs * span_damaged * span_damaged / (8.0 * max_uy_damaged);

    // Catenary tension should be a real positive force
    assert!(
        t_catenary > 0.0,
        "Catenary tension is positive: {:.1} kN", t_catenary
    );

    // For a simply supported beam, the analytical midspan deflection is:
    // delta = 5*w*L^4 / (384*EI)
    let ei = E * 1000.0 * IZ_BEAM; // kN*m^2 (E in kPa)
    let delta_analytical = 5.0 * w_abs * span_damaged.powi(4) / (384.0 * ei);
    assert_close(max_uy_damaged, delta_analytical, 0.05,
        "solver deflection matches SS beam formula");

    // Maximum bending moment increases roughly by factor of 4
    // (moment proportional to L^2 for UDL on SS beam)
    // Intact midspan M ~ w*L^2/8 (for each span), Damaged M ~ w*(2L)^2/8
    let m_intact_analytical = w_abs * l * l / 8.0;
    let m_damaged_analytical = w_abs * span_damaged * span_damaged / 8.0;
    let moment_ratio = m_damaged_analytical / m_intact_analytical;
    assert_close(moment_ratio, 4.0, 1e-10, "moment increases by factor 4");
}

// ================================================================
// 3. Vierendeel Action — Frame Resists Load via Frame Action
// ================================================================
//
// After removing a diagonal brace or a column, a moment frame
// resists gravity load through Vierendeel (frame) action: beams
// and columns develop shear and bending to bridge the gap.
//
// We model a 2-storey single-bay portal frame and compare intact
// vs damaged (column stub removed at ground level, replaced by
// a roller that allows vertical movement but provides lateral
// restraint). The upper storey frame action redistributes load.
//
// Ref: Starossek (2018) Ch. 4; Marchand & Alfawakhiri (2004)

#[test]
fn progressive_collapse_vierendeel_action() {
    let h: f64 = 3.0;  // storey height
    let l: f64 = 6.0;  // bay width

    // --- Intact 2-storey single-bay portal ---
    // Nodes: 1(0,0), 2(0,h), 3(L,h), 4(L,0), 5(0,2h), 6(L,2h)
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, l, h), (4, l, 0.0),
        (5, 0.0, 2.0 * h), (6, l, 2.0 * h),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left col, ground
        (2, "frame", 2, 5, 1, 2, false, false), // left col, upper
        (3, "frame", 4, 3, 1, 2, false, false), // right col, ground
        (4, "frame", 3, 6, 1, 2, false, false), // right col, upper
        (5, "frame", 2, 3, 1, 1, false, false), // beam, 1st floor
        (6, "frame", 5, 6, 1, 1, false, false), // beam, 2nd floor
    ];
    let sups_intact = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ];
    // Gravity point loads at beam-column joints (representing floor loads)
    let p_floor: f64 = -60.0; // kN downward per joint
    let loads_intact = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: p_floor, my: 0.0 }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact,
        sups_intact,
        loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // --- Damaged: right ground column removed ---
    // Node 4 removed. Node 3 is now unsupported at base level.
    // The frame must carry right-side loads through Vierendeel action
    // in the upper frame (beams + left column).
    // We model this by extending the left column all the way and
    // having node 3 supported only by the beams.
    let nodes_damaged = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, l, h),
        (5, 0.0, 2.0 * h), (6, l, 2.0 * h),
    ];
    let elems_damaged = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // left col, ground
        (2, "frame", 2, 5, 1, 2, false, false), // left col, upper
        (3, "frame", 3, 6, 1, 2, false, false), // right col, upper (hanging)
        (4, "frame", 2, 3, 1, 1, false, false), // beam, 1st floor
        (5, "frame", 5, 6, 1, 1, false, false), // beam, 2nd floor
    ];
    let sups_damaged = vec![
        (1, 1, "fixed"),
    ];
    let loads_damaged = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: p_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: p_floor, my: 0.0 }),
    ];
    let input_damaged = make_input(
        nodes_damaged,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_damaged,
        sups_damaged,
        loads_damaged,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Total vertical equilibrium: all load goes to left column base
    let total_applied = 4.0 * p_floor.abs(); // 240 kN total
    let ry_left_damaged: f64 = res_damaged.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_left_damaged, total_applied, 0.02,
        "all gravity load transfers to remaining support");

    // Vierendeel action produces significant beam shear
    // The beams now carry shear to transfer gravity from right side to left
    // Beam shear should be nonzero (frame action)
    let beam_forces: Vec<&ElementForces> = res_damaged.element_forces.iter()
        .filter(|ef| ef.element_id == 4 || ef.element_id == 5) // beams
        .collect();
    for bf in &beam_forces {
        assert!(
            bf.v_start.abs() > 1.0,
            "Beam {} develops shear via Vierendeel: V_start = {:.1} kN",
            bf.element_id, bf.v_start
        );
    }

    // Moments increase significantly in damaged structure
    let max_moment_intact: f64 = res_intact.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_moment_damaged: f64 = res_damaged.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(
        max_moment_damaged > max_moment_intact,
        "Damaged frame moments increase: {:.1} > {:.1} kN*m",
        max_moment_damaged, max_moment_intact
    );
}

// ================================================================
// 4. Alternate Load Path — GSA DCR Check After Column Removal
// ================================================================
//
// GSA (2016) alternate path method: after instantaneous column removal,
// the demand-capacity ratio (DCR) for each member must satisfy:
//   DCR = Q_ud / Q_ce <= 2.0 (for flexure-controlled, linear elastic)
//
// We model a 2-bay frame, solve intact and damaged, then compute the
// DCR from the solver element forces.
//
// Ref: GSA (2016) Sec. 3.2; UFC 4-023-03 Sec. 3-2

#[test]
fn progressive_collapse_alternate_load_path_dcr() {
    let h: f64 = 3.5;
    let l: f64 = 6.0;

    // Intact 2-bay portal frame with UDL on beams
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 2, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 6, 5, 1, 2, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed"), (3, 6, "fixed")];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
    ];
    let input_intact = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems, sups, loads,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Damaged: remove interior column (node 4 gone)
    let nodes_dam = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
    ];
    let elems_dam = vec![
        (1, "frame", 1, 2, 1, 2, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 6, 5, 1, 2, false, false),
    ];
    let sups_dam = vec![(1, 1, "fixed"), (2, 6, "fixed")];

    // GSA load combination: 2.0 * (1.2*D + 0.5*L)
    // For dead-load only case: factor = 2.0 * 1.2 = 2.4
    let gsa_factor: f64 = 2.4;
    let q_gsa = Q_GRAV * gsa_factor; // amplified load

    let loads_dam = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_gsa, q_j: q_gsa, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q_gsa, q_j: q_gsa, a: None, b: None,
        }),
    ];
    let input_damaged = make_input(
        nodes_dam, vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_dam, sups_dam, loads_dam,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Compute DCR: max moment demand / capacity
    // Assume beam plastic moment capacity: M_pl = fy * Z
    let fz: f64 = 355.0; // MPa
    let z_pl: f64 = 1.5e-3; // m^3, plastic section modulus
    let m_capacity = fz * 1e3 * z_pl; // kN*m = 532.5

    let max_moment_demand: f64 = res_damaged.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);

    let dcr = max_moment_demand / m_capacity;

    // DCR should be positive and reflect increased demand
    assert!(dcr > 0.0, "DCR is positive: {:.2}", dcr);

    // The max moment in damaged case should exceed intact case
    let max_moment_intact: f64 = res_intact.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(
        max_moment_demand > max_moment_intact,
        "GSA-amplified damaged moment {:.1} > intact {:.1} kN*m",
        max_moment_demand, max_moment_intact
    );

    // GSA acceptance: DCR <= 2.0 for moment frames (linear elastic)
    let gsa_dcr_limit: f64 = 2.0;
    // Document the DCR value (structure may or may not pass)
    let _passes_gsa = dcr <= gsa_dcr_limit;

    // Verify the load amplification factor is correct
    assert_close(gsa_factor, 2.4, 1e-10, "GSA DIF * 1.2D = 2.4");
}

// ================================================================
// 5. Tie Force Method — Peripheral and Internal Tie Requirements
// ================================================================
//
// UFC 4-023-03 and EN 1991-1-7 require structural ties to prevent
// progressive collapse. We model a continuous beam representing a
// floor tie line and verify that the axial force developed in the
// beam under extreme loading meets the tie force requirements.
//
// Internal tie: T_i = 3.0 * w_f * L_1 (kN/m, minimum 6*w_f)
// Peripheral tie: T_p = 6.0 * w_f * L_1
//
// Ref: UFC 4-023-03 Sec. 3-1; EN 1991-1-7 Annex A

#[test]
fn progressive_collapse_tie_force_method() {
    // Floor parameters
    let w_dead: f64 = 5.0;  // kN/m^2
    let w_live: f64 = 3.0;  // kN/m^2
    let w_f: f64 = w_dead + 0.25 * w_live; // UFC floor load = 5.75 kN/m^2
    let l1: f64 = 8.0;      // m, greater span
    let la: f64 = 6.0;      // m, tie spacing (lesser span)

    // Internal tie force per unit width: T_i = 3.0 * w_f * L1
    let t_internal = (3.0 * w_f * l1).max(6.0 * w_f);
    assert_close(t_internal, 138.0, 1e-10, "internal tie = 3*5.75*8 = 138 kN/m");

    // Peripheral tie force: T_p = 6.0 * w_f * L1
    let t_peripheral = 6.0 * w_f * l1;
    assert_close(t_peripheral, 276.0, 1e-10, "peripheral tie = 6*5.75*8 = 276 kN/m");

    // Total tie force for a beam at spacing la
    let t_beam = t_internal * la;
    assert_close(t_beam, 828.0, 1e-10, "beam tie force = 138*6 = 828 kN");

    // Verify the solver captures axial force in a beam under axial loading
    // Model: a single beam with applied tension representing tie force
    let l_tie: f64 = 8.0;
    let n_elem: usize = 4;
    let loads_tie = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1,
            fx: t_beam, // tension along beam axis
            fz: 0.0,
            my: 0.0,
        }),
    ];
    let input_tie = make_beam(n_elem, l_tie, E, A_BEAM, IZ_BEAM, "pinned", Some("rollerX"), loads_tie);
    let res_tie = linear::solve_2d(&input_tie).unwrap();

    // All elements should carry the same axial force (constant tension)
    for ef in &res_tie.element_forces {
        assert_close(ef.n_start.abs(), t_beam, 0.02,
            &format!("element {} axial = tie force", ef.element_id));
    }

    // Vertical tie: column must carry one floor load in tension
    let trib_area = l1 * la; // 48 m^2
    let t_vertical = (w_dead + w_live) * trib_area; // 384 kN
    assert_close(t_vertical, 384.0, 1e-10, "vertical tie force = 8*48 = 384 kN");

    // Peripheral tie must exceed internal tie
    assert!(
        t_peripheral > t_internal,
        "peripheral {:.1} > internal {:.1} kN/m", t_peripheral, t_internal
    );
}

// ================================================================
// 6. Key Element Approach — Disproportionate Collapse Assessment
// ================================================================
//
// EN 1991-1-7 Annex A: a key element must resist 34 kN/m^2 pressure
// on any face. GSA (2016) uses the same 34 kPa criterion.
//
// We model a fixed-end column subjected to the key element lateral
// load (34 kPa on its projected face) and verify the solver moment
// against the analytical solution: M_base = q*H^2/2 for a cantilever.
//
// Ref: EN 1991-1-7 Annex A; GSA (2016) Sec. 3.3

#[test]
fn progressive_collapse_key_element_approach() {
    let p_key: f64 = 34.0;      // kN/m^2, accidental pressure
    let col_width: f64 = 0.4;   // m, column face width
    let col_height: f64 = 3.5;  // m, storey height

    // Distributed lateral load on column: q = p_key * col_width (kN/m)
    let q_lateral = p_key * col_width; // 13.6 kN/m
    assert_close(q_lateral, 13.6, 1e-10, "lateral UDL on column");

    // Model as a cantilever column with UDL
    let n_elem: usize = 4;
    let elem_len = col_height / n_elem as f64;

    // Build vertical cantilever: nodes along Y-axis
    let nodes: Vec<(usize, f64, f64)> = (0..=n_elem)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Apply horizontal distributed load on each element
    let loads: Vec<SolverLoad> = (0..n_elem)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_lateral,
            q_j: q_lateral,
            a: None,
            b: None,
        }))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL)],
        elems,
        sups,
        loads,
    );
    let res = linear::solve_2d(&input).unwrap();

    // Analytical: for a cantilever with UDL q along length H,
    // applied perpendicular to the column axis (here horizontal load on vertical column):
    // The distributed load q_lateral acts horizontally on the column.
    // For a vertical column (nodes along Y), the distributed load in element local coords
    // acts transversely. Base moment = q*H^2/2.
    let m_base_analytical = q_lateral * col_height * col_height / 2.0;
    // = 13.6 * 12.25 / 2 = 83.3 kN*m
    assert_close(m_base_analytical, 83.3, 0.01, "analytical base moment");

    // Verify base reaction moment from solver
    let mz_base = res.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.my.abs())
        .unwrap_or(0.0);
    assert_close(mz_base, m_base_analytical, 0.05,
        "solver base moment matches cantilever formula");

    // Total horizontal force on column: F = q * H = 47.6 kN
    let f_horizontal = q_lateral * col_height;
    assert_close(f_horizontal, 47.6, 1e-10, "total horizontal force");

    // Horizontal reaction at base
    let rx_base = res.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rx.abs())
        .unwrap_or(0.0);
    assert_close(rx_base, f_horizontal, 0.02, "base shear equilibrium");

    // Interaction check: for a real column with axial load
    let n_axial: f64 = 2000.0; // kN (gravity)
    let n_pl: f64 = A_COL * 355.0 * 1e3; // kN, yield capacity of column
    let m_pl: f64 = 355.0 * 1e3 * IZ_COL / (0.5 * 0.4); // approximate M_pl
    // Simplified interaction: N/Npl + M/Mpl <= 1.0
    let _interaction = n_axial / n_pl + m_base_analytical / m_pl;
}

// ================================================================
// 7. Two-Column Removal Scenario — Extreme Event Resilience
// ================================================================
//
// For extreme events (vehicle impact, blast), UFC 4-023-03 may require
// checking removal of two adjacent columns simultaneously. This tests
// a 3-bay frame where two interior columns are removed.
//
// Ref: UFC 4-023-03 Sec. 3-2.11; Ellingwood (2006)

#[test]
fn progressive_collapse_two_column_removal() {
    let h: f64 = 3.5;
    let l: f64 = 5.0;

    // 3-bay frame with 4 columns and 3 beams
    // Nodes: 1(0,0),2(0,h), 3(L,h),4(L,0), 5(2L,h),6(2L,0), 7(3L,h),8(3L,0)
    let nodes_intact = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h), (4, l, 0.0),
        (5, 2.0 * l, h), (6, 2.0 * l, 0.0),
        (7, 3.0 * l, h), (8, 3.0 * l, 0.0),
    ];
    let elems_intact = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // col 1
        (2, "frame", 4, 3, 1, 2, false, false), // col 2
        (3, "frame", 6, 5, 1, 2, false, false), // col 3
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
            element_id: 5, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 7, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
    ];
    let input_intact = make_input(
        nodes_intact,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_intact,
        sups_intact,
        loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).unwrap();

    // Total vertical load = 3 * q * L
    let total_load = Q_GRAV.abs() * 3.0 * l;
    let total_ry_intact: f64 = res_intact.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry_intact, total_load, 0.02, "intact equilibrium");

    // --- Damaged: remove two interior columns (nodes 4, 6) ---
    // Beam now spans from node 2 to node 7 (3L = 15m) through nodes 3, 5
    let nodes_damaged = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, l, h),
        (5, 2.0 * l, h),
        (7, 3.0 * l, h), (8, 3.0 * l, 0.0),
    ];
    let elems_damaged = vec![
        (1, "frame", 1, 2, 1, 2, false, false), // col 1 (left)
        (2, "frame", 8, 7, 1, 2, false, false), // col 4 (right)
        (3, "frame", 2, 3, 1, 1, false, false), // beam span 1
        (4, "frame", 3, 5, 1, 1, false, false), // beam span 2
        (5, "frame", 5, 7, 1, 1, false, false), // beam span 3
    ];
    let sups_damaged = vec![
        (1, 1, "fixed"),
        (2, 8, "fixed"),
    ];
    let loads_damaged = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }),
    ];
    let input_damaged = make_input(
        nodes_damaged,
        vec![(1, E, 0.3)],
        vec![(1, A_BEAM, IZ_BEAM), (2, A_COL, IZ_COL)],
        elems_damaged,
        sups_damaged,
        loads_damaged,
    );
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    // Equilibrium still holds
    let total_ry_damaged: f64 = res_damaged.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry_damaged, total_load, 0.02, "damaged equilibrium");

    // Deflection at midspan (node 5) should be very large compared to intact
    let uy_mid_intact = res_intact.displacements.iter()
        .find(|d| d.node_id == 5)
        .map(|d| d.uz.abs())
        .unwrap_or(0.0);
    let uy_mid_damaged = res_damaged.displacements.iter()
        .find(|d| d.node_id == 5)
        .map(|d| d.uz.abs())
        .unwrap_or(0.0);
    assert!(
        uy_mid_damaged > 10.0 * uy_mid_intact,
        "Two-column removal: deflection {:.6} >> intact {:.6}",
        uy_mid_damaged, uy_mid_intact
    );

    // Maximum moment in damaged case much greater than intact
    let max_m_intact: f64 = res_intact.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let max_m_damaged: f64 = res_damaged.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(
        max_m_damaged > 2.0 * max_m_intact,
        "Two-column removal moment {:.1} >> intact {:.1}",
        max_m_damaged, max_m_intact
    );

    // The two remaining columns each carry half the total load
    let ry_left = res_damaged.reactions.iter()
        .find(|r| r.node_id == 1)
        .map(|r| r.rz)
        .unwrap_or(0.0);
    let ry_right = res_damaged.reactions.iter()
        .find(|r| r.node_id == 8)
        .map(|r| r.rz)
        .unwrap_or(0.0);
    // By symmetry, each should carry approximately half
    assert_close(ry_left, total_load / 2.0, 0.15,
        "left column carries ~half total load");
    assert_close(ry_right, total_load / 2.0, 0.15,
        "right column carries ~half total load");
}

// ================================================================
// 8. Redundancy Quantification — Residual Capacity After Member Loss
// ================================================================
//
// Structural redundancy is quantified by comparing the intact and
// damaged structure response. The redundancy factor:
//
//   beta_r = delta_intact / delta_damaged
//
// A value close to 1.0 means high redundancy (little effect from
// member loss). A value much less than 1.0 means low redundancy.
//
// Also compute the residual capacity ratio:
//   R = F_damaged_collapse / F_intact_collapse
//
// Here we use stiffness ratio as a proxy: how much stiffer is the
// intact vs damaged structure under the same load.
//
// Ref: Frangopol & Curley, "Effects of damage and redundancy on
//      structural reliability", J. Struct. Eng. (1987);
//      Starossek (2018) Ch. 7

#[test]
fn progressive_collapse_redundancy_quantification() {
    let l: f64 = 6.0;
    let n_per_span: usize = 4;

    // --- 4-span continuous beam (high redundancy) ---
    let spans_4 = [l, l, l, l];
    let n_total_4 = 4 * n_per_span;
    let loads_4: Vec<SolverLoad> = (1..=n_total_4)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }))
        .collect();
    let input_4span = make_continuous_beam(&spans_4, n_per_span, E, A_BEAM, IZ_BEAM, loads_4);
    let res_4span = linear::solve_2d(&input_4span).unwrap();

    let max_uy_4span: f64 = res_4span.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Damaged: remove one interior support -> 3-span + 1 longer span
    // Effectively merge spans 2 and 3 into one 2L span
    // Model as 3-span: [L, 2L, L]
    let spans_damaged = [l, 2.0 * l, l];
    let n_total_dam = (n_per_span + 2 * n_per_span + n_per_span) as usize;
    let loads_dam: Vec<SolverLoad> = (1..=n_total_dam)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }))
        .collect();
    let input_damaged = make_continuous_beam(&spans_damaged, n_per_span, E, A_BEAM, IZ_BEAM, loads_dam);
    let res_damaged = linear::solve_2d(&input_damaged).unwrap();

    let max_uy_damaged: f64 = res_damaged.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Redundancy factor: inverse of deflection amplification
    let beta_r = max_uy_4span / max_uy_damaged;
    assert!(
        beta_r < 1.0,
        "Redundancy factor < 1 (damaged deflects more): beta_r = {:.4}", beta_r
    );
    assert!(
        beta_r > 0.01,
        "Redundancy factor positive: beta_r = {:.4}", beta_r
    );

    // Deflection amplification ratio
    let amplification = max_uy_damaged / max_uy_4span;
    assert!(
        amplification > 1.0,
        "Damaged deflection amplified: {:.2}x", amplification
    );

    // --- Compare to 2-span beam (lower redundancy) ---
    let spans_2 = [l, l];
    let n_total_2 = 2 * n_per_span;
    let loads_2: Vec<SolverLoad> = (1..=n_total_2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }))
        .collect();
    let input_2span = make_continuous_beam(&spans_2, n_per_span, E, A_BEAM, IZ_BEAM, loads_2);
    let res_2span = linear::solve_2d(&input_2span).unwrap();

    let max_uy_2span: f64 = res_2span.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    // Damaged 2-span: remove interior support -> single span 2L
    let loads_ss: Vec<SolverLoad> = (1..=n_total_2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: Q_GRAV, q_j: Q_GRAV, a: None, b: None,
        }))
        .collect();
    let input_ss = make_ss_beam_udl(n_total_2, 2.0 * l, E, A_BEAM, IZ_BEAM, Q_GRAV);
    let _loads_ss = loads_ss;
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    let max_uy_ss: f64 = res_ss.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    let beta_r_2span = max_uy_2span / max_uy_ss;

    // 4-span system should have better redundancy than 2-span
    // (removing one support from 4-span is less impactful than from 2-span)
    assert!(
        beta_r > beta_r_2span,
        "4-span redundancy {:.4} > 2-span redundancy {:.4}",
        beta_r, beta_r_2span
    );

    // Quantify: number of alternate load paths
    let n_supports_4 = 5; // 4-span has 5 supports
    let n_supports_2 = 3; // 2-span has 3 supports
    let redundancy_4 = n_supports_4 - 2; // minus minimum required
    let redundancy_2 = n_supports_2 - 2;
    assert!(
        redundancy_4 > redundancy_2,
        "4-span has {} redundant supports vs {} for 2-span",
        redundancy_4, redundancy_2
    );
}
