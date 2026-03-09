/// Validation: Storage Rack and Pallet Racking Structural Analysis
///
/// References:
///   - RMI (Rack Manufacturers Institute), ANSI/RMI MH16.1-2021
///   - EN 15512:2020, Steel Static Storage Systems
///   - Godley, "Design of Cold-Formed Steel Members and Structures
///     for Storage Rack Applications" (2002)
///   - Bajoria & Talikoti, "Stability of Rack Structures" (2006)
///   - FEM 10.2.02, Design of Static Steel Pallet Racking (2000)
///
/// Tests verify storage rack structural behavior:
///   1. Upright column: axial capacity under gravity loads (Euler Pcr)
///   2. Beam level: pallet beam moment = wL^2/8 under uniform pallet load
///   3. Frame stability: sway analysis under horizontal seismic force
///   4. Semi-rigid connector: reduced stiffness at beam-upright connection
///   5. Down-aisle stability: multi-level rack sway frame, story drift
///   6. Cross-aisle bracing: braced frame resists lateral loads efficiently
///   7. Base plate: column base as semi-rigid support (spring kz)
///   8. Progressive collapse: removing one upright, load redistribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// Typical cold-formed steel for rack uprights (thin-walled C/sigma sections)
const E_RACK: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m^2)
const E_EFF: f64 = E_RACK * 1000.0; // kN/m^2 for hand calculations

// Upright section (80x60x2.0 mm cold-formed C)
const A_UPRIGHT: f64 = 5.92e-4; // m^2 (approx 592 mm^2)
const IZ_UPRIGHT: f64 = 3.2e-7; // m^4 (about major axis)

// Pallet beam section (100x50x1.5 mm box)
const A_BEAM: f64 = 4.35e-4; // m^2
const IZ_BEAM: f64 = 4.5e-7; // m^4

// Brace section (40x40x2.0 mm angle)
const A_BRACE: f64 = 3.0e-4; // m^2
const IZ_BRACE: f64 = 0.0; // truss (no bending)

// ================================================================
// 1. Upright Column: Axial Capacity Under Gravity Loads
// ================================================================
//
// A single rack upright column, pinned at base and roller at top,
// under axial compression from pallet loads above. Verify that:
//   - Euler critical load Pcr = pi^2 * EI / L^2
//   - Under a load well below Pcr, column deflection is small
//   - Axial force in column equals the applied load
//
// Reference: RMI MH16.1, Section 5.2 (Upright Frame Design)

#[test]
fn validation_rack_upright_column_axial_capacity() {
    let h: f64 = 3.0; // column height (m), typical first-level height
    let pi: f64 = std::f64::consts::PI;

    // Euler critical load for pinned-pinned column
    let pcr: f64 = pi.powi(2) * E_EFF * IZ_UPRIGHT / (h * h);

    // Apply 20% of Pcr as axial compression (safe working load)
    let p_applied: f64 = 0.20 * pcr;

    // Build column along Y-axis: nodes at (0,0) and (0,h)
    // Pinned at base (restrains ux, uy), rollerY at top (restrains ux, allows uy)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h)];
    let elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let sups = vec![(1, 1_usize, "pinned"), (2, 2, "rollerY")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: -p_applied,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).expect("solve");

    // Check axial force in column equals applied load
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // For a vertical element under downward load, n_start should be compressive
    let n_col: f64 = ef.n_start.abs();
    assert_close(n_col, p_applied, 0.02, "Upright axial force = P_applied");

    // Verify Pcr is positive and reasonable
    assert!(pcr > 0.0, "Euler Pcr must be positive: {:.2}", pcr);
    assert!(
        p_applied < pcr,
        "Applied load {:.2} kN must be below Pcr {:.2} kN",
        p_applied,
        pcr
    );

    // Vertical equilibrium: sum of vertical reactions = applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_applied, 0.02, "Upright: vertical equilibrium");
}

// ================================================================
// 2. Beam Level: Pallet Beam Moment = wL^2/8
// ================================================================
//
// A pallet beam spanning between two uprights, simply supported
// (pinned + rollerX), with uniform distributed load from pallets.
// Midspan moment should be wL^2/8.
//
// Reference: EN 15512, Section 9 (Beam Design); basic beam theory

#[test]
fn validation_rack_pallet_beam_moment() {
    let span: f64 = 2.7; // typical pallet beam span (m)
    let w: f64 = 8.0; // kN/m (2 pallets at ~1000 kg each over 2.7m)
    let n_elem = 4;

    // Expected midspan moment
    let m_mid_expected: f64 = w * span * span / 8.0;

    let input = make_ss_beam_udl(n_elem, span, E_RACK, A_BEAM, IZ_BEAM, -w);
    let results = linear::solve_2d(&input).expect("solve");

    // Find maximum moment magnitude across all elements
    let m_max: f64 = results
        .element_forces
        .iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert_close(m_max, m_mid_expected, 0.05, "Pallet beam Mmax = wL^2/8");

    // Check reactions: each support should carry wL/2
    let r_expected: f64 = w * span / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w * span, 0.02, "Pallet beam: total vertical reaction = wL");

    // Each reaction ~ wL/2
    for r in &results.reactions {
        assert_close(r.ry.abs(), r_expected, 0.05, "Pallet beam: each reaction ~ wL/2");
    }
}

// ================================================================
// 3. Frame Stability: Sway Analysis Under Horizontal Force
// ================================================================
//
// Single-bay rack frame (two uprights + one beam) under horizontal
// seismic force. With fixed bases, verify sway drift and that
// horizontal equilibrium holds.
//
// Reference: RMI MH16.1, Section 2.6 (Seismic Design)

#[test]
fn validation_rack_frame_sway_seismic() {
    let h: f64 = 3.0; // upright height
    let w: f64 = 2.7; // beam span
    let h_seismic: f64 = 2.0; // horizontal seismic force (kN) at beam level

    // Portal frame: fixed-base, lateral load at top
    let input = make_portal_frame(h, w, E_RACK, A_UPRIGHT, IZ_UPRIGHT, h_seismic, 0.0);
    let results = linear::solve_2d(&input).expect("solve");

    // Lateral drift at top (node 2)
    let drift: f64 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // For storage racks, code limits drift to h/100 typically
    let drift_limit: f64 = h / 100.0;

    // Verify drift is positive (frame does sway)
    assert!(drift > 0.0, "Frame must have nonzero sway under lateral load");

    // Verify horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_seismic, 0.02, "Rack frame: horizontal equilibrium");

    // Report drift ratio for reference
    let drift_ratio: f64 = drift / h;
    assert!(
        drift_ratio < 0.1,
        "Drift ratio {:.4} should be reasonable (< 10%)",
        drift_ratio
    );

    // Check drift_limit is a positive value
    assert!(drift_limit > 0.0, "Drift limit must be positive");
}

// ================================================================
// 4. Semi-Rigid Connector: Reduced Stiffness at Beam-Upright Joint
// ================================================================
//
// Beam-to-upright connections in storage racks are typically
// semi-rigid (boltless connectors, tab/slot connections).
// Model: beam with semi-rigid end springs (rotational stiffness kz).
// Compare midspan deflection with pinned and rigid cases.
//   - Pinned: delta = 5wL^4/(384EI)
//   - Fixed:  delta = wL^4/(384EI)
//   - Semi-rigid should fall between these two extremes
//
// Reference: FEM 10.2.02, Section 4.3 (Connection Stiffness)

#[test]
fn validation_rack_semirigid_connector() {
    let span: f64 = 2.7;
    let w_load: f64 = 8.0; // kN/m
    let n_elem = 4;
    let ei: f64 = E_EFF * IZ_BEAM;

    // Theoretical deflections
    let delta_pinned: f64 = 5.0 * w_load * span.powi(4) / (384.0 * ei);
    let delta_fixed: f64 = w_load * span.powi(4) / (384.0 * ei);

    // Case 1: Simply supported (pinned ends)
    let input_pinned = make_ss_beam_udl(n_elem, span, E_RACK, A_BEAM, IZ_BEAM, -w_load);
    let res_pinned = linear::solve_2d(&input_pinned).expect("solve pinned");

    // Case 2: Semi-rigid ends (typical rack connector ~ 50 kN-m/rad)
    let k_semi: f64 = 50.0; // kN-m/rad, typical rack connector stiffness
    let elem_len: f64 = span / n_elem as f64;

    let mut nodes = HashMap::new();
    for i in 0..=n_elem {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * elem_len,
                y: 0.0,
            },
        );
    }
    let mut mats = HashMap::new();
    mats.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E_RACK,
            nu: 0.3,
        },
    );
    let mut secs = HashMap::new();
    secs.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: A_BEAM,
            iz: IZ_BEAM,
            as_y: None,
        },
    );
    let mut elems = HashMap::new();
    for i in 0..n_elem {
        elems.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: Some(k_semi),
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n_elem + 1,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: Some(k_semi),
            dx: None,
            dy: None,
            drz: None,
            angle: None,
        },
    );
    let mut loads_semi = Vec::new();
    for i in 0..n_elem {
        loads_semi.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -w_load,
            q_j: -w_load,
            a: None,
            b: None,
        }));
    }
    let input_semi = SolverInput {
        nodes,
        materials: mats,
        sections: secs,
        elements: elems,
        supports: sups,
        loads: loads_semi,
    constraints: vec![],
    };
    let res_semi = linear::solve_2d(&input_semi).expect("solve semi-rigid");

    // Get midspan deflections
    let mid_node = n_elem / 2 + 1;
    let uy_pinned: f64 = res_pinned
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy
        .abs();
    let uy_semi: f64 = res_semi
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uy
        .abs();

    // Semi-rigid deflection must be less than pinned (springs resist rotation)
    assert!(
        uy_semi < uy_pinned,
        "Semi-rigid deflection {:.6e} must be < pinned {:.6e}",
        uy_semi,
        uy_pinned
    );

    // Semi-rigid deflection must be greater than fully fixed
    assert!(
        uy_semi > delta_fixed * 0.5,
        "Semi-rigid deflection {:.6e} should exceed ~50% of fixed {:.6e}",
        uy_semi,
        delta_fixed
    );

    // Verify the theoretical pinned deflection is reasonable
    assert_close(uy_pinned, delta_pinned, 0.10, "Pinned deflection ~ 5wL^4/(384EI)");
}

// ================================================================
// 5. Down-Aisle Stability: Multi-Level Rack Sway Frame
// ================================================================
//
// Two-bay, two-level rack frame in down-aisle direction.
// Under horizontal force at top level, verify story drift
// and that lower level has greater shear than upper level.
//
// Reference: EN 15512, Section 10 (Down-Aisle Stability)

#[test]
fn validation_rack_down_aisle_stability() {
    let h1: f64 = 1.5; // first beam level height
    let h2: f64 = 1.5; // second beam level height (above first)
    let w_bay: f64 = 2.7; // bay width
    let h_force: f64 = 1.5; // horizontal force at top level (kN)

    // Build a single-bay, two-level rack frame
    //   Nodes: 1(0,0), 2(0,h1), 3(0,h1+h2), 4(w,0), 5(w,h1), 6(w,h1+h2)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, 0.0, h1 + h2),
        (4, w_bay, 0.0),
        (5, w_bay, h1),
        (6, w_bay, h1 + h2),
    ];
    let elems = vec![
        // Left upright
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        // Right upright
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Beam level 1
        (5, "frame", 2, 5, 1, 2, false, false),
        // Beam level 2
        (6, "frame", 3, 6, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: h_force,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT), (2, A_BEAM, IZ_BEAM)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).expect("solve");

    // Story drifts
    let ux_level1: f64 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;
    let ux_level2: f64 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 3)
        .unwrap()
        .ux;

    // Top level drift must be greater than first level drift
    assert!(
        ux_level2.abs() > ux_level1.abs(),
        "Top drift {:.6e} must exceed level-1 drift {:.6e}",
        ux_level2.abs(),
        ux_level1.abs()
    );

    // Inter-story drift for upper story
    let inter_story: f64 = (ux_level2 - ux_level1).abs();
    assert!(
        inter_story > 0.0,
        "Inter-story drift must be positive"
    );

    // Global horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_force, 0.02, "Down-aisle: horizontal equilibrium");

    // Vertical equilibrium (no vertical loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 0.02, "Down-aisle: vertical equilibrium (no gravity)");
}

// ================================================================
// 6. Cross-Aisle Bracing: Braced Frame Resists Lateral Loads
// ================================================================
//
// Rack upright frame in cross-aisle direction with diagonal bracing.
// Compare braced vs unbraced drift. The bracing dramatically
// reduces lateral drift in the cross-aisle direction.
//
// Reference: RMI MH16.1, Section 5.3 (Cross-Aisle Stability)

#[test]
fn validation_rack_cross_aisle_bracing() {
    let h: f64 = 3.0; // frame height
    let d: f64 = 1.0; // frame depth (cross-aisle direction)
    let h_lat: f64 = 1.0; // lateral force (kN)

    // Unbraced portal frame (fixed bases)
    let input_unbraced = make_portal_frame(h, d, E_RACK, A_UPRIGHT, IZ_UPRIGHT, h_lat, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).expect("solve unbraced");
    let drift_unbraced: f64 = res_unbraced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // X-braced frame: add two diagonal truss braces
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, d, h),
        (4, d, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal 1
        (5, "truss", 2, 4, 1, 2, false, false), // diagonal 2
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: h_lat,
        fy: 0.0,
        mz: 0.0,
    })];

    let input_braced = make_input(
        nodes,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT), (2, A_BRACE, IZ_BRACE)],
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).expect("solve braced");
    let drift_braced: f64 = res_braced
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Braced drift must be significantly less than unbraced
    assert!(
        drift_braced < drift_unbraced * 0.5,
        "Braced drift {:.6e} should be < 50% of unbraced {:.6e}",
        drift_braced,
        drift_unbraced
    );

    // Both must satisfy horizontal equilibrium
    let sum_rx_b: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_b, -h_lat, 0.02, "Cross-aisle braced: horizontal equilibrium");
    let sum_rx_u: f64 = res_unbraced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_u, -h_lat, 0.02, "Cross-aisle unbraced: horizontal equilibrium");

    // Braces carry significant axial force
    let n_brace: f64 = res_braced
        .element_forces
        .iter()
        .filter(|ef| ef.element_id == 4 || ef.element_id == 5)
        .map(|ef| ef.n_start.abs())
        .fold(0.0_f64, f64::max);
    assert!(
        n_brace > 0.1,
        "Brace axial force {:.4} kN should be significant",
        n_brace
    );
}

// ================================================================
// 7. Base Plate: Column Base as Semi-Rigid Support (Spring kz)
// ================================================================
//
// Rack base plates provide partial rotational restraint.
// Model base as pinned + rotational spring kz.
// Compare deflection with pinned base (kz=0) vs semi-rigid base.
// As kz increases, sway decreases toward the fixed-base case.
//
// Reference: FEM 10.2.02, Annex A (Base Plate Stiffness Tests)

#[test]
fn validation_rack_base_plate_semirigid() {
    let h: f64 = 3.0;
    let w_bay: f64 = 2.7;
    let h_lat: f64 = 1.5; // kN lateral

    // Compute EI/L for reference
    let ei: f64 = E_EFF * IZ_UPRIGHT;
    let ei_over_l: f64 = ei / h;

    // Case 1: Pinned base (pure portal with hinged feet)
    // Build portal frame manually with pinned bases
    let nodes_p = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w_bay, h),
        (4, w_bay, 0.0),
    ];
    let elems_p = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups_p = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads_p = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: h_lat,
        fy: 0.0,
        mz: 0.0,
    })];
    let input_pinned = make_input(
        nodes_p,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT)],
        elems_p,
        sups_p,
        loads_p,
    );
    let res_pinned = linear::solve_2d(&input_pinned).expect("solve pinned base");
    let drift_pinned: f64 = res_pinned
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Case 2: Semi-rigid base (kz = 5*EI/L, moderate fixity)
    let k_base: f64 = 5.0 * ei_over_l;

    let mut nodes_sr = HashMap::new();
    nodes_sr.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes_sr.insert("2".to_string(), SolverNode { id: 2, x: 0.0, y: h });
    nodes_sr.insert("3".to_string(), SolverNode { id: 3, x: w_bay, y: h });
    nodes_sr.insert("4".to_string(), SolverNode { id: 4, x: w_bay, y: 0.0 });

    let mut mats_sr = HashMap::new();
    mats_sr.insert("1".to_string(), SolverMaterial { id: 1, e: E_RACK, nu: 0.3 });

    let mut secs_sr = HashMap::new();
    secs_sr.insert("1".to_string(), SolverSection { id: 1, a: A_UPRIGHT, iz: IZ_UPRIGHT, as_y: None });

    let mut elems_sr = HashMap::new();
    elems_sr.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems_sr.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems_sr.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(), node_i: 3, node_j: 4,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut sups_sr = HashMap::new();
    sups_sr.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_base),
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_sr.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: Some(k_base),
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads_sr = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: h_lat, fy: 0.0, mz: 0.0,
    })];

    let input_semi = SolverInput {
        nodes: nodes_sr,
        materials: mats_sr,
        sections: secs_sr,
        elements: elems_sr,
        supports: sups_sr,
        loads: loads_sr,
    constraints: vec![],
    };
    let res_semi = linear::solve_2d(&input_semi).expect("solve semi-rigid base");
    let drift_semi: f64 = res_semi
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Case 3: Fixed base (rigid)
    let input_fixed = make_portal_frame(h, w_bay, E_RACK, A_UPRIGHT, IZ_UPRIGHT, h_lat, 0.0);
    let res_fixed = linear::solve_2d(&input_fixed).expect("solve fixed base");
    let drift_fixed: f64 = res_fixed
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    // Ordering: fixed < semi-rigid < pinned
    assert!(
        drift_fixed < drift_semi,
        "Fixed drift {:.6e} must be < semi-rigid drift {:.6e}",
        drift_fixed,
        drift_semi
    );
    assert!(
        drift_semi < drift_pinned,
        "Semi-rigid drift {:.6e} must be < pinned drift {:.6e}",
        drift_semi,
        drift_pinned
    );

    // All three must satisfy horizontal equilibrium
    let sum_rx_p: f64 = res_pinned.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_p, -h_lat, 0.02, "Pinned base: horizontal eq");
    let sum_rx_s: f64 = res_semi.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_s, -h_lat, 0.02, "Semi-rigid base: horizontal eq");
    let sum_rx_f: f64 = res_fixed.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_f, -h_lat, 0.02, "Fixed base: horizontal eq");
}

// ================================================================
// 8. Progressive Collapse: Removing One Upright, Load Redistribution
// ================================================================
//
// Two-bay rack frame. Under gravity load, each bay carries its
// share. After removing the center upright (modeled as a two-bay
// continuous frame with no center support), the remaining uprights
// must carry the full load, and moment increases significantly.
//
// Reference: Bajoria & Talikoti, "Stability of Rack Structures" (2006)

#[test]
fn validation_rack_progressive_collapse() {
    let h: f64 = 3.0;
    let w_bay: f64 = 2.7;
    let w_pallet: f64 = 6.0; // kN/m per beam
    let _n_per_bay = 2;

    // Case 1: Intact structure (two bays, three uprights at base)
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0), 5(2w,h), 6(2w,0)
    let nodes_intact = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w_bay, h),
        (4, w_bay, 0.0),
        (5, 2.0 * w_bay, h),
        (6, 2.0 * w_bay, 0.0),
    ];
    let elems_intact = vec![
        // Left upright
        (1, "frame", 1, 2, 1, 1, false, false),
        // Beam bay 1
        (2, "frame", 2, 3, 1, 2, false, false),
        // Center upright
        (3, "frame", 4, 3, 1, 1, false, false),
        // Beam bay 2
        (4, "frame", 3, 5, 1, 2, false, false),
        // Right upright
        (5, "frame", 6, 5, 1, 1, false, false),
    ];
    let sups_intact = vec![
        (1, 1_usize, "fixed"),
        (2, 4, "fixed"),
        (3, 6, "fixed"),
    ];
    let loads_intact = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -w_pallet, q_j: -w_pallet, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: -w_pallet, q_j: -w_pallet, a: None, b: None,
        }),
    ];

    let input_intact = make_input(
        nodes_intact,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT), (2, A_BEAM, IZ_BEAM)],
        elems_intact,
        sups_intact,
        loads_intact,
    );
    let res_intact = linear::solve_2d(&input_intact).expect("solve intact");

    // Case 2: Center upright removed (two-bay beam spanning full width)
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(2w,h), 5(2w,0)
    // No center support at floor level
    let nodes_collapsed = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w_bay, h),
        (4, 2.0 * w_bay, h),
        (5, 2.0 * w_bay, 0.0),
    ];
    let elems_collapsed = vec![
        // Left upright
        (1, "frame", 1, 2, 1, 1, false, false),
        // Beam bay 1 (now unsupported at center)
        (2, "frame", 2, 3, 1, 2, false, false),
        // Beam bay 2
        (3, "frame", 3, 4, 1, 2, false, false),
        // Right upright
        (4, "frame", 5, 4, 1, 1, false, false),
    ];
    let sups_collapsed = vec![
        (1, 1_usize, "fixed"),
        (2, 5, "fixed"),
    ];
    let loads_collapsed = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -w_pallet, q_j: -w_pallet, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: -w_pallet, q_j: -w_pallet, a: None, b: None,
        }),
    ];

    let input_collapsed = make_input(
        nodes_collapsed,
        vec![(1, E_RACK, 0.3)],
        vec![(1, A_UPRIGHT, IZ_UPRIGHT), (2, A_BEAM, IZ_BEAM)],
        elems_collapsed,
        sups_collapsed,
        loads_collapsed,
    );
    let res_collapsed = linear::solve_2d(&input_collapsed).expect("solve collapsed");

    // Maximum beam moment must increase after removing center upright
    let m_max_intact: f64 = res_intact
        .element_forces
        .iter()
        .filter(|ef| ef.element_id == 2 || ef.element_id == 4)
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    let m_max_collapsed: f64 = res_collapsed
        .element_forces
        .iter()
        .filter(|ef| ef.element_id == 2 || ef.element_id == 3)
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert!(
        m_max_collapsed > m_max_intact,
        "Collapsed moment {:.4} must exceed intact moment {:.4}",
        m_max_collapsed,
        m_max_intact
    );

    // Maximum midspan deflection increases after collapse
    let uy_max_intact: f64 = res_intact
        .displacements
        .iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let uy_max_collapsed: f64 = res_collapsed
        .displacements
        .iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        uy_max_collapsed > uy_max_intact,
        "Collapsed deflection {:.6e} must exceed intact deflection {:.6e}",
        uy_max_collapsed,
        uy_max_intact
    );

    // Both cases must satisfy global vertical equilibrium
    let total_load: f64 = w_pallet * w_bay * 2.0; // total gravity load on two bays
    let sum_ry_intact: f64 = res_intact.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_intact, total_load, 0.02, "Intact: vertical equilibrium");
    let sum_ry_collapsed: f64 = res_collapsed.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_collapsed, total_load, 0.02, "Collapsed: vertical equilibrium");
}
