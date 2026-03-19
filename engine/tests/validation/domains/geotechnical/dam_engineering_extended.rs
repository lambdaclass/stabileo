/// Validation: Dam Engineering Extended — Hydraulic Structures
///
/// References:
///   - USBR Design of Small Dams (3rd Edition, 1987)
///   - USACE EM 1110-2-2200: Gravity Dam Design
///   - Westergaard (1933): Water Pressures on Dams during Earthquakes
///   - ICOLD Bulletin 148: Selecting Seismic Parameters for Large Dams
///   - Creager, Justin & Hinds: Engineering for Dams, Vol. III
///   - FERC Engineering Guidelines: Chapter 3 (Gravity Dams)
///
/// Tests build structural models of dam components (cantilever walls,
/// buttress frames, spillway piers, arch segments) and verify the
/// solver output against closed-form analytical results.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Gravity Dam Sliding: FOS = (W*mu + c*B) / H_hydro
// ================================================================
//
// Model the dam base as a simply-supported beam carrying the net
// vertical load (self-weight minus uplift). The vertical reaction
// at each support must equal the analytical value. We then compute
// the sliding factor of safety from the analytical forces and check
// that the structural model's total vertical reaction matches the
// net weight applied.
//
// FOS_sliding = (W * tan(phi) + c * B) / F_hydro

#[test]
fn dam_gravity_sliding_frame_model() {
    // Dam parameters
    let h: f64 = 30.0;          // m, dam height
    let b: f64 = 24.0;          // m, base width
    let gamma_c: f64 = 24.0;    // kN/m^3, concrete unit weight
    let gamma_w: f64 = 9.81;    // kN/m^3, water
    let h_water: f64 = 28.0;    // m, water depth

    // Self-weight per unit length (triangular cross-section)
    let w_dam: f64 = 0.5 * gamma_c * b * h; // kN/m

    // Hydrostatic horizontal force per unit length
    let f_hydro: f64 = 0.5 * gamma_w * h_water * h_water;

    // Uplift with 50% drain effectiveness
    let drain_eff: f64 = 0.50;
    let u_heel: f64 = gamma_w * h_water;
    let f_uplift: f64 = 0.5 * u_heel * (1.0 - drain_eff) * b;

    // Net vertical force
    let v_net: f64 = w_dam - f_uplift;

    // Model the dam base as a beam of length B carrying v_net as UDL
    // Equivalent UDL on the base = v_net / B
    let q_base: f64 = -(v_net / b); // downward (negative in solver convention)

    let n: usize = 8;
    let e: f64 = 25_000.0; // MPa, concrete
    let a_sec: f64 = 1.0;  // m^2 per unit length
    let iz: f64 = 0.0833;  // m^4 (1.0 * 1.0^3 / 12 for unit strip)

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_base,
            q_j: q_base,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, b, e, a_sec, iz, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Total vertical reaction should equal v_net
    let total_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry, v_net, 0.01, "Total vertical reaction vs net weight");

    // Each support reaction for uniform load on SS beam = v_net / 2
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.rz, v_net / 2.0, 0.02, "Left reaction = v_net/2");

    // Sliding factor of safety (analytical)
    let phi: f64 = 45.0_f64.to_radians();
    let c: f64 = 100.0; // kPa cohesion
    let fos_sliding: f64 = (v_net * phi.tan() + c * b) / f_hydro;

    assert!(
        fos_sliding > 1.5,
        "Sliding FOS = {:.2} must exceed 1.5", fos_sliding
    );
}

// ================================================================
// 2. Overturning Stability: Stabilizing vs Overturning Moments
// ================================================================
//
// Model the dam as a cantilever wall (fixed at the base).
// Apply the hydrostatic triangular load. The base moment from the
// solver must match M = gamma_w * h^3 / 6 (moment from triangular
// hydrostatic pressure). Then compute overturning stability.

#[test]
fn dam_overturning_stability() {
    let h: f64 = 20.0;          // m, wall height
    let gamma_w: f64 = 9.81;    // kN/m^3
    let h_water: f64 = 18.0;    // m, water depth (some freeboard)

    // Cantilever wall from base (node 1) to top (node n+1)
    // The wall is vertical: nodes along Y axis
    // In 2D solver, beam along X. We model the wall height as beam length.
    let n: usize = 12;
    let e: f64 = 25_000.0;      // MPa
    let a_sec: f64 = 2.0;       // m^2 (wall thickness * unit width)
    let iz: f64 = 0.667;        // m^4

    // Triangular hydrostatic load: 0 at top, gamma_w * h_water at bottom
    // On cantilever oriented along X: fixed at x=0 (base), free at x=h
    // Hydrostatic pressure increases from free end to fixed end:
    //   at x (from base): pressure = gamma_w * (h_water - x) for x <= h_water
    // But in our beam model, node 1 is fixed (base), node n+1 is free (top).
    // Distance from top: at element i, the depth = h_water - x_center.
    // Load at start of element i (closer to base) is larger.
    let elem_len: f64 = h / n as f64;

    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;         // distance from base
        let x_j: f64 = (i + 1) as f64 * elem_len;   // distance from base
        // Depth of water at these positions (from top of water)
        let depth_i: f64 = (h_water - x_i).max(0.0);
        let depth_j: f64 = (h_water - x_j).max(0.0);
        // Hydrostatic pressure (horizontal, transverse to beam = fy direction)
        let q_i: f64 = -(gamma_w * depth_i); // negative = transverse load
        let q_j: f64 = -(gamma_w * depth_j);

        if q_i.abs() > 1e-10 || q_j.abs() > 1e-10 {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i,
                q_j,
                a: None,
                b: None,
            }));
        }
    }

    let input = make_beam(n, h, e, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Analytical base moment for triangular hydrostatic load on cantilever:
    // Total force F = 0.5 * gamma_w * h_water^2
    // Acting at h_water/3 from base
    // Base moment M = F * h_water / 3 = gamma_w * h_water^3 / 6
    let f_hydro: f64 = 0.5 * gamma_w * h_water * h_water;
    let m_base_analytical: f64 = f_hydro * h_water / 3.0;

    // Solver base reaction moment (at node 1, fixed support)
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // The base moment from the solver should match the analytical value
    assert_close(r_base.my.abs(), m_base_analytical, 0.02,
        "Base moment from hydrostatic triangular load");

    // Base shear should equal total hydrostatic force
    assert_close(r_base.rz.abs(), f_hydro, 0.02,
        "Base shear = total hydrostatic force");

    // Now compute overturning stability
    let b_base: f64 = 16.0;     // m, base width of gravity dam
    let gamma_c: f64 = 24.0;    // kN/m^3
    let w_dam: f64 = 0.5 * gamma_c * b_base * h;
    let m_stabilizing: f64 = w_dam * (2.0 * b_base / 3.0); // weight at 2B/3 from toe
    let fos_overturning: f64 = m_stabilizing / m_base_analytical;

    assert!(
        fos_overturning > 1.5,
        "Overturning FOS = {:.2} must exceed 1.5", fos_overturning
    );
}

// ================================================================
// 3. Hydrostatic Pressure Distribution: Triangular Load on Wall
// ================================================================
//
// Cantilever retaining wall under full triangular hydrostatic load.
// Verify tip deflection matches delta = gamma_w * h^4 / (30 * EI)
// (cantilever under triangular load decreasing from max at base
// to zero at the tip).

#[test]
fn dam_hydrostatic_pressure_cantilever() {
    let h: f64 = 10.0;          // m, wall height = water depth
    let gamma_w: f64 = 9.81;    // kN/m^3
    let n: usize = 16;
    let e: f64 = 25_000.0;      // MPa, concrete
    let a_sec: f64 = 0.5;       // m^2
    let iz: f64 = 0.01;         // m^4
    let e_eff: f64 = e * 1000.0; // kN/m^2

    // Triangular load: max at fixed end (base, x=0), zero at free end (top, x=h)
    // q(x) = gamma_w * (h - x)
    // At element i: x_i = i*h/n, q_i = gamma_w*(h - x_i)
    let elem_len: f64 = h / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let q_i: f64 = -(gamma_w * (h - x_i));
        let q_j: f64 = -(gamma_w * (h - x_j));
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i,
            q_j,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, h, e, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Tip deflection for cantilever with triangular load (max at root, zero at tip):
    // delta_tip = q_max * L^4 / (30 * EI)
    let q_max: f64 = gamma_w * h;
    let delta_exact: f64 = q_max * h.powi(4) / (30.0 * e_eff * iz);

    let error: f64 = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.05,
        "Hydrostatic cantilever tip: delta={:.6e}, exact={:.6e}, err={:.1}%",
        tip.uz.abs(), delta_exact, error * 100.0
    );

    // Also check base reaction: total force = 0.5 * gamma_w * h^2
    let f_total: f64 = 0.5 * gamma_w * h * h;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz.abs(), f_total, 0.02, "Base shear = 0.5*gamma_w*h^2");
}

// ================================================================
// 4. Uplift Pressure Effect on Dam Base
// ================================================================
//
// Model the dam base as a beam with two load cases:
// (a) Self-weight (downward UDL)
// (b) Uplift pressure (upward UDL)
// Verify that the net midspan deflection and reactions are
// consistent with the reduced loading from uplift.

#[test]
fn dam_uplift_pressure_base_model() {
    let b: f64 = 20.0;          // m, base width
    let n: usize = 10;
    let e: f64 = 25_000.0;      // MPa
    let a_sec: f64 = 1.0;
    let iz: f64 = 0.0833;
    let e_eff: f64 = e * 1000.0;

    // Self-weight UDL on base
    let h: f64 = 25.0;
    let gamma_c: f64 = 24.0;
    let w_per_length: f64 = 0.5 * gamma_c * b * h; // total weight per unit length
    let q_weight: f64 = -(w_per_length / b);        // UDL on base (downward)

    // Uplift pressure: linear from gamma_w*H at heel to 0 at toe
    // With 50% drain effectiveness, average uplift pressure:
    let gamma_w: f64 = 9.81;
    let h_water: f64 = 23.0;
    let drain_eff: f64 = 0.50;
    let u_avg: f64 = gamma_w * h_water * (1.0 - drain_eff) * 0.5;
    let q_uplift: f64 = u_avg; // upward (positive)

    // Net load = weight - uplift (both as UDL for simplicity)
    let q_net: f64 = q_weight + q_uplift;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_net,
            q_j: q_net,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, b, e, a_sec, iz, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Total vertical reaction = net load * base width
    let total_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let expected_ry: f64 = -q_net * b; // reactions oppose applied load

    assert_close(total_ry, expected_ry, 0.02,
        "Total reaction with uplift reduction");

    // Midspan deflection of SS beam under UDL: delta = 5*q*L^4 / (384*EI)
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_exact: f64 = 5.0 * q_net.abs() * b.powi(4) / (384.0 * e_eff * iz);

    let error: f64 = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.05,
        "Midspan deflection with uplift: delta={:.6e}, exact={:.6e}, err={:.1}%",
        mid_d.uz.abs(), delta_exact, error * 100.0
    );

    // Uplift reduces net load: verify reaction is less than no-uplift case
    let reaction_no_uplift: f64 = -q_weight * b;
    assert!(
        total_ry.abs() < reaction_no_uplift.abs(),
        "Uplift reduces reactions: {:.0} < {:.0}", total_ry.abs(), reaction_no_uplift.abs()
    );
}

// ================================================================
// 5. Arch Dam Ring: Horizontal Arch Under Radial Pressure
// ================================================================
//
// A horizontal arch ring of an arch dam is modeled as a curved beam.
// Approximate with a polygon of frame elements forming a half-circle.
// Under uniform radial pressure p, the thrust in a circular arch is
// T = p * R. Verify the axial force in the arch elements.

#[test]
fn dam_arch_ring_thrust() {
    let r: f64 = 100.0;         // m, arch radius
    let n_seg: usize = 20;      // number of segments for half-circle
    let gamma_w: f64 = 9.81;
    let depth: f64 = 40.0;      // m, depth below water surface
    let p: f64 = gamma_w * depth; // kN/m^2, radial pressure at this depth

    let e: f64 = 25_000.0;      // MPa, concrete
    let t: f64 = 6.0;           // m, arch thickness
    let a_sec: f64 = t * 1.0;   // m^2 per unit height
    let iz: f64 = 1.0 * t * t * t / 12.0; // m^4

    // Build nodes along a semicircular arch from angle 0 to pi
    // Abutments at both ends (pinned supports)
    let n_nodes = n_seg + 1;
    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        let theta: f64 = std::f64::consts::PI * i as f64 / n_seg as f64;
        let x: f64 = r * theta.cos();
        let y: f64 = r * theta.sin();
        nodes.push((i + 1, x, y));
    }

    let mut elems = Vec::new();
    for i in 0..n_seg {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    // Fixed abutments at both ends
    let sups = vec![(1, 1, "pinned"), (2, n_nodes, "pinned")];

    // Radial inward loads at each node (except abutments)
    // At each interior node, the tributary length is the arc segment length
    let arc_seg: f64 = std::f64::consts::PI * r / n_seg as f64;
    let mut loads = Vec::new();
    for i in 1..n_seg {
        let theta: f64 = std::f64::consts::PI * i as f64 / n_seg as f64;
        // Radial inward direction: (-cos(theta), -sin(theta))
        let fx: f64 = -p * arc_seg * theta.cos();
        let fz: f64 = -p * arc_seg * theta.sin();
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1,
            fx,
            fz,
            my: 0.0,
        }));
    }
    // Half-tributary loads at abutment nodes
    let theta_0: f64 = 0.0;
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1,
        fx: -p * (arc_seg / 2.0) * theta_0.cos(),
        fz: -p * (arc_seg / 2.0) * theta_0.sin(),
        my: 0.0,
    }));
    let theta_n: f64 = std::f64::consts::PI;
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: -p * (arc_seg / 2.0) * theta_n.cos(),
        fz: -p * (arc_seg / 2.0) * theta_n.sin(),
        my: 0.0,
    }));

    let input = make_input(
        nodes,
        vec![(1, e, 0.2)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).expect("solve");

    // Analytical thrust in circular arch under uniform radial pressure: T = p * R
    let t_analytical: f64 = p * r;

    // Check axial force in elements near the crown (middle of arch)
    // The element at the crown should have axial compression close to T = p*R
    let crown_elem_id = n_seg / 2;
    let crown_ef = results.element_forces.iter()
        .find(|ef| ef.element_id == crown_elem_id)
        .unwrap();

    // Axial force (compression is negative in frame convention)
    let n_crown: f64 = (crown_ef.n_start.abs() + crown_ef.n_end.abs()) / 2.0;

    // Allow 10% tolerance due to polygon approximation
    assert_close(n_crown, t_analytical, 0.10,
        "Arch crown thrust vs p*R");
}

// ================================================================
// 6. Buttress Dam: Load Sharing Between Buttress and Slab
// ================================================================
//
// A buttress dam consists of a sloping slab supported by buttresses.
// Model a single buttress bay as a portal frame:
// - Two vertical buttress columns
// - A horizontal slab beam between them
// Under uniform vertical load on the slab, verify the load sharing
// and that column axial forces equal the applied load divided by 2.

#[test]
fn dam_buttress_load_sharing() {
    let h_buttress: f64 = 15.0;  // m, buttress height
    let spacing: f64 = 6.0;      // m, buttress spacing (slab span)
    let e: f64 = 25_000.0;       // MPa

    // Buttress (column) properties
    let a_col: f64 = 1.5;        // m^2
    let iz_col: f64 = 0.281;     // m^4

    // Slab properties
    let a_slab: f64 = 0.6;       // m^2
    let iz_slab: f64 = 0.018;    // m^4

    // Hydrostatic load on slab (simplified as uniform for a horizontal slice)
    let gamma_w: f64 = 9.81;
    let depth: f64 = 10.0;       // m, average depth of water
    let q_slab: f64 = -(gamma_w * depth); // kN/m, downward on slab

    // Build portal frame: nodes at base corners and top corners
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h_buttress),
        (3, spacing, h_buttress),
        (4, spacing, 0.0),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left buttress
        (2, "frame", 2, 3, 1, 2, false, false), // slab
        (3, "frame", 3, 4, 1, 1, false, false), // right buttress
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // UDL on slab element
    let loads = vec![SolverLoad::Distributed(SolverDistributedLoad {
        element_id: 2,
        q_i: q_slab,
        q_j: q_slab,
        a: None,
        b: None,
    })];

    let input = make_input(
        nodes,
        vec![(1, e, 0.2)],
        vec![(1, a_col, iz_col), (2, a_slab, iz_slab)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).expect("solve");

    // Total vertical load on slab
    let total_load: f64 = q_slab.abs() * spacing;

    // Total vertical reactions should equal total load
    let total_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(total_ry, total_load, 0.02,
        "Total vertical reaction = slab load");

    // By symmetry, each buttress carries half the load
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r_left.rz, r_right.rz, 0.02,
        "Symmetric buttress reactions");
    assert_close(r_left.rz, total_load / 2.0, 0.02,
        "Each buttress carries half the load");

    // Column axial force should be approximately total_load / 2
    let col_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    // For vertical column, axial force is along column axis
    // n_start is at the base (node 1), should be in compression
    assert_close(col_left.n_start.abs(), total_load / 2.0, 0.05,
        "Left buttress axial force ~ total_load/2");
}

// ================================================================
// 7. Spillway Pier: Cantilever Under Hydrostatic + Hydrodynamic
// ================================================================
//
// A spillway pier acts as a vertical cantilever.
// Apply combined hydrostatic triangular load and a concentrated
// hydrodynamic force at 0.4H from the base (Westergaard).
// Verify base moment = M_hydrostatic + M_hydrodynamic.

#[test]
fn dam_spillway_pier_cantilever() {
    let h: f64 = 12.0;          // m, pier height
    let gamma_w: f64 = 9.81;
    let h_water: f64 = 10.0;    // m, water depth (below crest)
    let n: usize = 12;
    let e: f64 = 25_000.0;      // MPa
    let a_sec: f64 = 0.8;       // m^2
    let iz: f64 = 0.0427;       // m^4

    // Hydrostatic triangular load (max at base, zero at water surface)
    let elem_len: f64 = h / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;       // distance from base
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let depth_i: f64 = (h_water - x_i).max(0.0);
        let depth_j: f64 = (h_water - x_j).max(0.0);
        let q_i: f64 = -(gamma_w * depth_i);
        let q_j: f64 = -(gamma_w * depth_j);
        if q_i.abs() > 1e-10 || q_j.abs() > 1e-10 {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i,
                q_j,
                a: None,
                b: None,
            }));
        }
    }

    // Hydrodynamic force (Westergaard): F = 7/12 * rho_w * a_g * g * H^2
    // Applied as concentrated force at 0.4H from base
    let a_g: f64 = 0.15;        // PGA as fraction of g
    let rho_w: f64 = 9.81;      // kN/m^3 (using unit weight directly)
    let f_hydrodyn: f64 = 7.0 / 12.0 * rho_w * a_g * h_water * h_water;
    let y_hydrodyn: f64 = 0.4 * h_water; // application height from base

    // Find the nearest node to y_hydrodyn
    let hydro_node: usize = (y_hydrodyn / elem_len).round() as usize + 1;

    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: hydro_node,
        fx: 0.0,
        fz: -f_hydrodyn, // transverse
        my: 0.0,
    }));

    let input = make_beam(n, h, e, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Analytical base moments
    let f_hydrostatic: f64 = 0.5 * gamma_w * h_water * h_water;
    let m_hydrostatic: f64 = f_hydrostatic * h_water / 3.0;
    let m_hydrodynamic: f64 = f_hydrodyn * y_hydrodyn;
    let m_total: f64 = m_hydrostatic + m_hydrodynamic;

    // Solver base moment
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_base.my.abs(), m_total, 0.05,
        "Base moment = hydrostatic + hydrodynamic");

    // Base shear = hydrostatic force + hydrodynamic force
    let v_total: f64 = f_hydrostatic + f_hydrodyn;
    assert_close(r_base.rz.abs(), v_total, 0.03,
        "Base shear = F_hydrostatic + F_hydrodynamic");
}

// ================================================================
// 8. Seismic Pseudo-Static: Westergaard Added Mass on Dam Face
// ================================================================
//
// Model the dam upstream face as a cantilever with discrete
// Westergaard added masses applied as horizontal inertial forces.
// Westergaard pressure at depth y: p(y) = 7/8 * rho_w * a * sqrt(H*y)
// Total force: F = 7/12 * rho_w * a * H^2
// Verify the base shear and moment match the analytical integrals.

#[test]
fn dam_seismic_westergaard_added_mass() {
    let h: f64 = 30.0;          // m, water depth = dam height
    let n: usize = 30;          // fine mesh for accuracy
    let e: f64 = 25_000.0;      // MPa
    let a_sec: f64 = 3.0;       // m^2
    let iz: f64 = 2.25;         // m^4

    let rho_w: f64 = 9.81;      // kN/m^3 (unit weight of water)
    let a_g: f64 = 0.20;        // PGA (fraction of g)

    // Apply Westergaard hydrodynamic pressure as discrete nodal loads
    // p(y) = 7/8 * rho_w * a_g * sqrt(H * y)
    // where y = depth below water surface = distance from free end
    // In our beam: x = distance from base, so y = H - x
    let elem_len: f64 = h / n as f64;
    let mut loads = Vec::new();

    for i in 1..n {
        let x: f64 = i as f64 * elem_len; // distance from base
        let y: f64 = h - x;               // depth from water surface
        if y > 0.0 {
            let p: f64 = 7.0 / 8.0 * rho_w * a_g * (h * y).sqrt();
            // Force at this node: p * tributary_length
            let f_node: f64 = p * elem_len;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: i + 1,
                fx: 0.0,
                fz: -f_node, // transverse to beam
                my: 0.0,
            }));
        }
    }

    let input = make_beam(n, h, e, a_sec, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).expect("solve");

    // Analytical total hydrodynamic force:
    // F = 7/12 * rho_w * a_g * H^2
    let f_total_analytical: f64 = 7.0 / 12.0 * rho_w * a_g * h * h;

    // Solver base shear
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Allow some tolerance due to discrete nodal approximation
    assert_close(r_base.rz.abs(), f_total_analytical, 0.05,
        "Westergaard base shear vs 7/12*rho*a*H^2");

    // Analytical base moment:
    // M = integral of p(y) * (H-y) * dy from 0 to H, where y = depth
    // = 7/8 * rho_w * a_g * integral(sqrt(H*y) * (H-y) dy, 0, H)
    // = 7/8 * rho_w * a_g * H * [2/3*H*sqrt(H) - 2/5*H*sqrt(H)]
    //
    // The integral of sqrt(H*y)*(H-y) dy from 0 to H:
    // Let u = y: integral = sqrt(H) * integral(sqrt(y)*(H-y) dy)
    //                     = sqrt(H) * [H * 2/3 * y^(3/2) - 2/5 * y^(5/2)] from 0 to H
    //                     = sqrt(H) * [2/3 * H * H^(3/2) - 2/5 * H^(5/2)]
    //                     = sqrt(H) * H^(5/2) * [2/3 - 2/5]
    //                     = H^3 * 4/15
    // M = 7/8 * rho_w * a_g * H^3 * 4/15
    let m_analytical: f64 = 7.0 / 8.0 * rho_w * a_g * h.powi(3) * 4.0 / 15.0;

    assert_close(r_base.my.abs(), m_analytical, 0.10,
        "Westergaard base moment");

    // The effective application height = M/F
    let y_eff_analytical: f64 = m_analytical / f_total_analytical;
    let y_eff_solver: f64 = r_base.my.abs() / r_base.rz.abs();

    // Effective height should be around 0.4*H (Westergaard)
    assert_close(y_eff_solver, y_eff_analytical, 0.10,
        "Effective application height of hydrodynamic force");
}
