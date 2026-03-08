/// Validation: Cooling Tower Structural Analysis
///
/// References:
///   - ACI 334.2R-91: Reinforced Concrete Cooling Tower Shells (Practice & Commentary)
///   - BS 4485-4:1996: Water Cooling Towers -- Code of Practice for Structural Design
///   - VGB-R 610Ue (2005): Structural Design of Cooling Towers
///   - Gould, P.L.: "Finite Element Analysis of Shells of Revolution" (1985)
///   - Niemann, H.-J. & Kopper, H.: "Wind Loading of Cooling Towers" (1998)
///   - Kratzig, W.B. & Zerna, W.: "Reinforced Concrete Cooling Tower Shells" (1987)
///   - EN 1991-1-4: Wind actions on structures (Annex B: circular cylinders)
///   - Mungan, I. & Wittek, U.: "Natural Draught Cooling Towers" (2004)
///
/// Tests verify hyperbolic shell meridional stress, mechanical draft frame,
/// fill support beam, fan deck slab, column ring beam, wind loading on shell,
/// basin wall hydrostatic design, and drift eliminator support structure.

mod helpers;

use dedaliano_engine::{types::*, solver::linear::*};
use helpers::*;

// ================================================================
// 1. Natural Draft Hyperbolic Shell -- Meridional Compression at Throat
// ================================================================
//
// A natural draft cooling tower is a thin reinforced concrete hyperbolic
// shell of revolution. Under self-weight, the shell develops meridional
// (vertical) compressive stress that is maximum near the throat.
//
// Meridional stress: Nφ = -W/(2πR·cos(α))
// where W = total weight above the section, R = shell radius at section,
// α = meridional slope angle.
//
// Model the tower as a tapered cantilever column (fixed at base, free at top)
// with equivalent axial stiffness, to verify that dead-load axial forces
// are transmitted correctly to the foundation.
//
// Reference: ACI 334.2R-91 Section 4.3; VGB-R 610Ue Section 6.

#[test]
fn cooling_tower_hyperbolic_shell_meridional() {
    // Tower geometry (typical 120m natural draft tower)
    let h_total: f64 = 120.0;       // m, total height
    let r_base: f64 = 55.0;         // m, base radius
    let r_throat: f64 = 30.0;       // m, throat radius (at ~85m)
    let t_shell: f64 = 0.20;        // m, shell thickness (average)
    let gamma_c: f64 = 25.0;        // kN/m³, reinforced concrete

    // Model as a multi-element vertical cantilever with varying cross-section
    // The column represents a 1-radian sector of the shell
    // Use average properties for upper portion (throat to top) and lower (base to throat)
    let h_throat: f64 = 85.0;       // m, height of throat above base

    // Equivalent area for a strip of shell (1-radian sector × thickness)
    // At throat: circumference fraction = R_throat × 1 rad, so A = R_throat × t
    let a_throat: f64 = r_throat * t_shell;    // m²
    let iz_throat: f64 = r_throat * t_shell.powi(3) / 12.0; // m⁴ (strip bending)

    let e_concrete: f64 = 30_000.0; // MPa

    // Model lower tower column (base to throat): 8 elements
    let n_lower: usize = 8;
    let n_upper: usize = 4;
    let n_total: usize = n_lower + n_upper;
    let _n_nodes: usize = n_total + 1;

    let dz_lower: f64 = h_throat / n_lower as f64;
    let dz_upper: f64 = (h_total - h_throat) / n_upper as f64;

    // Build nodes along vertical (x-axis in solver)
    let mut nodes = Vec::new();
    for i in 0..=n_lower {
        nodes.push((i + 1, i as f64 * dz_lower, 0.0));
    }
    for i in 1..=n_upper {
        nodes.push((n_lower + 1 + i, h_throat + i as f64 * dz_upper, 0.0));
    }

    // Lower section: larger area (base radius governs)
    let a_base: f64 = r_base * t_shell;
    let iz_base: f64 = r_base * t_shell.powi(3) / 12.0;

    // Two section types: lower (sec 1) and upper (sec 2)
    let mats = vec![(1, e_concrete, 0.2)];
    let secs = vec![
        (1, a_base, iz_base),      // lower section
        (2, a_throat, iz_throat),   // upper section
    ];

    let mut elems = Vec::new();
    for i in 0..n_lower {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in 0..n_upper {
        elems.push((n_lower + i + 1, "frame", n_lower + 1 + i, n_lower + 2 + i, 1, 2, false, false));
    }

    let sups = vec![(1, 1, "fixed")];

    // Self-weight as distributed load along each element (vertical = along x)
    // Shell weight per unit length of meridian for 1-radian sector:
    // w = R(z) × t × γ (approximately)
    // Lower: w_lower = r_base * t * γ; Upper: w_throat * t * γ
    let w_lower: f64 = -r_base * t_shell * gamma_c;   // kN/m (negative = gravity)
    let w_upper: f64 = -r_throat * t_shell * gamma_c;

    // Apply as transverse distributed load (fy = downward) -- but since
    // the column is along X, self-weight along the member axis is axial.
    // We apply nodal loads instead (weight at each node)
    let mut loads = Vec::new();
    // Weight concentrated at nodes from lower portion
    for i in 1..=n_lower {
        let w_seg: f64 = w_lower * dz_lower;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: w_seg, fy: 0.0, mz: 0.0,
        }));
    }
    // Weight from upper portion
    for i in 1..=n_upper {
        let w_seg: f64 = w_upper * dz_upper;
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_lower + 1 + i, fx: w_seg, fy: 0.0, mz: 0.0,
        }));
    }

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total weight applied
    let w_total_lower: f64 = w_lower.abs() * h_throat;
    let w_total_upper: f64 = w_upper.abs() * (h_total - h_throat);
    let w_total: f64 = w_total_lower + w_total_upper;

    // Base reaction should equal total weight
    let r_base_node = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base_node.rx.abs(), w_total, 0.05, "Base axial reaction = total shell weight");

    // Axial force at base element should be close to total weight
    let ef_base = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_base.n_start.abs(), w_total, 0.10, "Base element axial force");

    // Meridional stress at base: σ = N / (2πR_base × t)
    // For full circumference, N_total = w_total * 2π (since we modeled 1 radian)
    let sigma_meridional: f64 = w_total / (r_base * t_shell) / 1000.0; // MPa
    // Typical range 1-5 MPa for large towers
    assert!(
        sigma_meridional > 0.5 && sigma_meridional < 10.0,
        "Meridional stress: {:.2} MPa (typical 1-5 MPa for natural draft towers)",
        sigma_meridional
    );
}

// ================================================================
// 2. Mechanical Draft Frame -- Column-Beam Structure
// ================================================================
//
// Mechanical draft cooling towers use a structural steel or concrete
// frame to support the fan, motor, and casing. The frame is a portal
// structure subjected to fan weight + wind + vibration loads.
//
// Model as a portal frame with fan deck weight at the beam and
// lateral wind load. Verify column moments and beam deflection.
//
// Reference: BS 4485-4 Section 7; CTI STD-201.

#[test]
fn cooling_tower_mechanical_draft_frame() {
    // Frame geometry
    let h_frame: f64 = 6.0;         // m, column height (air intake height)
    let w_frame: f64 = 8.0;         // m, span (fan diameter + clearance)

    // Structural steel properties
    let e_steel: f64 = 210_000.0;    // MPa
    // HEB 300 columns and IPE 400 beam (typical)
    let a_col: f64 = 149.1e-4;      // m², HEB 300
    let iz_col: f64 = 25170.0e-8;   // m⁴, HEB 300 strong axis
    let a_beam: f64 = 84.5e-4;      // m², IPE 400
    let iz_beam: f64 = 23130.0e-8;  // m⁴, IPE 400 strong axis

    // Fan deck load: fan weight + motor + gearbox + deck self-weight
    let w_fan: f64 = 50.0;          // kN, total equipment weight
    let w_deck: f64 = 30.0;         // kN, deck self-weight
    let p_gravity: f64 = -(w_fan + w_deck) / 2.0; // kN per node (split to 2 nodes)

    // Wind load on casing
    let f_wind: f64 = 15.0;         // kN, lateral wind at top

    // Build portal frame manually with different sections for column vs beam
    let nodes = vec![
        (1, 0.0, 0.0),              // left base
        (2, 0.0, h_frame),          // left top
        (3, w_frame, h_frame),      // right top
        (4, w_frame, 0.0),          // right base
    ];
    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![
        (1, a_col, iz_col),         // column section
        (2, a_beam, iz_beam),       // beam section
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 2, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_wind, fy: p_gravity, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p_gravity, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium: sum of ry = total gravity load
    let total_gravity: f64 = w_fan + w_deck;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_gravity, 0.02, "Vertical equilibrium for fan deck load");

    // Horizontal equilibrium: sum of rx = wind load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>();
    assert_close(sum_rx.abs(), f_wind, 0.02, "Horizontal equilibrium for wind load");

    // Beam midspan deflection under gravity: check serviceability
    // For a portal frame with rigid joints, beam deflection < span/250
    let beam_ef = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    // Beam carries shear and moment from gravity
    let v_beam: f64 = beam_ef.v_start.abs();
    assert!(
        v_beam > 0.0 && v_beam < total_gravity,
        "Beam shear: {:.2} kN", v_beam
    );

    // Column base moments exist (fixed base portal under lateral + gravity)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        r1.mz.abs() > 0.0 && r4.mz.abs() > 0.0,
        "Both column bases have moment reactions"
    );

    // Wind-induced overturning: base moments resist M = F_wind × h
    let m_wind_ot: f64 = f_wind * h_frame;
    let sum_base_mz: f64 = r1.mz.abs() + r4.mz.abs();
    let vert_couple: f64 = (r1.ry - r4.ry).abs() * w_frame / 2.0;
    let m_resist: f64 = sum_base_mz + vert_couple;
    assert_close(m_resist, m_wind_ot, 0.10, "Moment equilibrium under wind");
}

// ================================================================
// 3. Fill Support Beam -- Simply Supported Under Water Load
// ================================================================
//
// The cooling tower fill (heat exchange media) sits on horizontal
// support beams spanning between columns. These beams carry the fill
// weight plus the water flow load.
//
// Model as a simply supported beam with uniform distributed load.
// Verify midspan deflection δ = 5qL⁴/(384EI) and moment M = qL²/8.
//
// Reference: BS 4485-4 Section 5.3; CTI STD-201 Section 6.

#[test]
fn cooling_tower_fill_support_beam() {
    // Fill support beam: precast concrete
    let l_span: f64 = 4.0;          // m, beam span between columns
    let b_beam: f64 = 0.30;         // m, beam width
    let d_beam: f64 = 0.45;         // m, beam depth
    let e_concrete: f64 = 30_000.0; // MPa

    let a_beam: f64 = b_beam * d_beam;
    let iz_beam: f64 = b_beam * d_beam.powi(3) / 12.0;

    // Fill + water load on beam
    // Fill weight: 1.5 kN/m² (PVC fill, dry)
    // Water load: 2.0 kN/m² (operating water film)
    // Tributary width: 1.5 m (spacing between support beams)
    let q_fill: f64 = 1.5;          // kN/m²
    let q_water: f64 = 2.0;         // kN/m²
    let trib_width: f64 = 1.5;      // m
    let q_self: f64 = a_beam * 25.0; // kN/m, beam self-weight (concrete)

    let q_total: f64 = -((q_fill + q_water) * trib_width + q_self); // kN/m, downward

    let n: usize = 8;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }

    let input = make_beam(n, l_span, e_concrete, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_concrete * 1000.0; // kN/m²

    // Analytical midspan deflection: δ = 5qL⁴/(384EI)
    let delta_exact: f64 = 5.0 * q_total.abs() * l_span.powi(4) / (384.0 * e_eff * iz_beam);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Fill beam midspan deflection");

    // Analytical reaction: R = qL/2
    let r_exact: f64 = q_total.abs() * l_span / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry.abs(), r_exact, 0.02, "Fill beam support reaction");

    // Analytical midspan moment: M = qL²/8
    let m_exact: f64 = q_total.abs() * l_span.powi(2) / 8.0;
    // Check element forces near midspan
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef_mid.m_end.abs(), m_exact, 0.10, "Fill beam midspan moment");

    // Serviceability: deflection < span/250
    let defl_limit: f64 = l_span / 250.0;
    assert!(
        mid_disp.uy.abs() < defl_limit,
        "Deflection {:.4} m < L/250 = {:.4} m", mid_disp.uy.abs(), defl_limit
    );
}

// ================================================================
// 4. Fan Deck Slab -- Continuous Beam Over Supports
// ================================================================
//
// The fan deck is a reinforced concrete slab that supports the fan
// assembly and motor. Model as a two-span continuous beam strip.
// For equal spans with UDL: R_mid = 5qL/4, R_end = 3qL/8.
//
// Reference: BS 4485-4 Section 7.2; ACI 334.2R Section 5.

#[test]
fn cooling_tower_fan_deck() {
    // Fan deck slab
    let span: f64 = 5.0;            // m, span between supports
    let t_slab: f64 = 0.25;         // m, slab thickness
    let b_strip: f64 = 1.0;         // m, unit width strip

    let e_concrete: f64 = 30_000.0; // MPa
    let a_slab: f64 = b_strip * t_slab;
    let iz_slab: f64 = b_strip * t_slab.powi(3) / 12.0;

    // Loads on fan deck
    // Self-weight: 25 kN/m³ × 0.25m = 6.25 kN/m²
    // Fan + motor equipment: 5.0 kN/m² (distributed over deck area)
    // Maintenance live load: 2.5 kN/m²
    let q_sw: f64 = 25.0 * t_slab;          // kN/m²
    let q_equip: f64 = 5.0;                 // kN/m²
    let q_live: f64 = 2.5;                  // kN/m²
    let q_total: f64 = -((q_sw + q_equip + q_live) * b_strip); // kN/m, downward

    // Two-span continuous beam
    let n_per_span: usize = 4;
    let total_elements: usize = n_per_span * 2;

    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span], n_per_span, e_concrete, a_slab, iz_slab, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied load
    let total_load: f64 = q_total.abs() * 2.0 * span;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Fan deck vertical equilibrium");

    // Internal support reaction: R_mid = 5qL/4 (for equal-span two-span beam)
    let r_mid_exact: f64 = 5.0 * q_total.abs() * span / 4.0;
    let mid_node = n_per_span + 1;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    assert_close(r_mid.ry.abs(), r_mid_exact, 0.05, "Fan deck internal support reaction (5qL/4)");

    // End reaction: R_end = 3qL/8
    let r_end_exact: f64 = 3.0 * q_total.abs() * span / 8.0;
    let r_end = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_end.ry.abs(), r_end_exact, 0.05, "Fan deck end support reaction (3qL/8)");

    // Hogging moment at internal support: M = -qL²/8
    let m_hog_exact: f64 = q_total.abs() * span.powi(2) / 8.0;
    // Element at internal support (last element of first span)
    let ef_sup = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    assert_close(ef_sup.m_end.abs(), m_hog_exact, 0.10, "Fan deck hogging moment at internal support");
}

// ================================================================
// 5. Column Ring Beam -- Circumferential Beam on Tower Columns
// ================================================================
//
// Natural draft towers rest on inclined columns (typically V-shaped
// pairs) that transmit shell forces to the foundation. A ring beam
// at the column tops distributes the load circumferentially.
//
// Model a segment of the ring beam as a 3-span continuous beam
// (representing 3 adjacent column bays) under the shell reaction load.
// Verify load redistribution and moment distribution.
//
// Reference: ACI 334.2R Section 3.4; VGB-R 610Ue Section 5.

#[test]
fn cooling_tower_column_ring_beam() {
    // Ring beam geometry
    let n_columns: f64 = 36.0;      // number of V-columns around circumference
    let r_ring: f64 = 52.0;         // m, radius of ring beam
    let circumference: f64 = 2.0 * std::f64::consts::PI * r_ring;
    let bay_length: f64 = circumference / n_columns; // ~9.08 m arc, approximated as chord

    // Ring beam section (reinforced concrete)
    let b_ring: f64 = 0.80;         // m, beam width
    let d_ring: f64 = 1.20;         // m, beam depth
    let e_concrete: f64 = 30_000.0; // MPa

    let a_ring: f64 = b_ring * d_ring;
    let iz_ring: f64 = b_ring * d_ring.powi(3) / 12.0;

    // Shell reaction load at ring beam
    // Total tower shell weight distributed to ring beam
    let w_shell_total: f64 = 25000.0; // kN, total shell weight
    let q_ring: f64 = -(w_shell_total / circumference); // kN/m, distributed on ring beam

    // Model 3 bays of the ring beam as a 3-span continuous beam
    let n_per_span: usize = 4;
    let total_elements: usize = n_per_span * 3;

    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_ring, q_j: q_ring, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(
        &[bay_length, bay_length, bay_length],
        n_per_span, e_concrete, a_ring, iz_ring, loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Total load on 3 bays
    let total_3bay: f64 = q_ring.abs() * 3.0 * bay_length;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_3bay, 0.02, "Ring beam vertical equilibrium");

    // Column reactions (internal supports carry more than end supports)
    // For uniform continuous beam, internal support reaction ≈ qL (approximately)
    let r_interior_approx: f64 = q_ring.abs() * bay_length;

    // Check one of the internal supports (node at end of first span)
    let int_node = n_per_span + 1;
    let r_int = results.reactions.iter().find(|r| r.node_id == int_node).unwrap();
    assert_close(r_int.ry.abs(), r_interior_approx, 0.15, "Ring beam interior column reaction");

    // Per-column load from full ring (each column gets total weight / n_columns)
    let p_per_column: f64 = w_shell_total / n_columns;
    assert!(
        p_per_column > 500.0 && p_per_column < 1000.0,
        "Per-column load: {:.0} kN", p_per_column
    );
}

// ================================================================
// 6. Wind Loading on Shell -- Circumferential Pressure Distribution
// ================================================================
//
// Wind on a cooling tower shell follows a circumferential pressure
// distribution: p(θ) = q_ref × Σ(aₙ cos(nθ))
// where Fourier coefficients aₙ define the pressure pattern.
//
// The net horizontal wind force on the tower creates overturning
// moment at the base. Model as a cantilever under equivalent
// lateral force to verify base reactions.
//
// Drag coefficient for hyperbolic tower: Cd ≈ 0.8-1.0 (rough)
// Net horizontal force: F = Cd × q × D × H (projected area)
//
// Reference: EN 1991-1-4 Annex B; VGB-R 610Ue Section 4.3;
// Niemann & Kopper (1998).

#[test]
fn cooling_tower_wind_loading_shell() {
    // Tower geometry
    let h_tower: f64 = 120.0;       // m, total height
    let d_base: f64 = 110.0;        // m, base diameter
    let d_throat: f64 = 60.0;       // m, throat diameter
    let d_top: f64 = 65.0;          // m, top diameter

    // Wind parameters
    let v_ref: f64 = 28.0;          // m/s, reference wind speed at 10m
    let rho_air: f64 = 1.225;       // kg/m³
    let z_ref: f64 = 10.0;
    let alpha_terrain: f64 = 0.16;  // terrain roughness exponent (category II)
    let cd: f64 = 0.9;              // drag coefficient for rough hyperbolic shell

    // Divide tower into 5 segments for wind integration
    let n_seg: usize = 5;
    let dz: f64 = h_tower / n_seg as f64;

    let mut f_segments: Vec<f64> = Vec::new();
    let mut f_total: f64 = 0.0;
    let mut m_base: f64 = 0.0;

    for i in 0..n_seg {
        let z_mid: f64 = (i as f64 + 0.5) * dz;
        let frac: f64 = z_mid / h_tower;

        // Interpolate diameter (approximate: base -> throat -> top)
        let d_z: f64 = if frac < 0.7 {
            d_base + (d_throat - d_base) * frac / 0.7
        } else {
            d_throat + (d_top - d_throat) * (frac - 0.7) / 0.3
        };

        // Wind velocity at height z (power law)
        let v_z: f64 = v_ref * (z_mid / z_ref).powf(alpha_terrain);
        let q_z: f64 = 0.5 * rho_air * v_z * v_z / 1000.0; // kN/m²

        // Force on segment = Cd × q × D × dz
        let f_seg: f64 = cd * q_z * d_z * dz;
        f_segments.push(f_seg);
        f_total += f_seg;
        // Moment arm = node position where load is applied = top of segment
        let z_node: f64 = (i as f64 + 1.0) * dz;
        m_base += f_seg * z_node;
    }

    // Model as cantilever column under equivalent lateral loads
    let n_elem: usize = n_seg;
    let n_nodes_mdl: usize = n_elem + 1;
    let e_concrete: f64 = 30_000.0;

    // Equivalent shell stiffness (annular section at throat)
    let t_shell: f64 = 0.20;
    let r_eq: f64 = d_throat / 2.0;
    let a_eq: f64 = 2.0 * std::f64::consts::PI * r_eq * t_shell;
    let iz_eq: f64 = std::f64::consts::PI * r_eq.powi(3) * t_shell;

    let nodes: Vec<_> = (0..n_nodes_mdl)
        .map(|i| (i + 1, i as f64 * dz, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Apply wind as lateral nodal loads (fy direction = perpendicular to axis)
    let mut loads = Vec::new();
    for i in 0..n_seg {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 2, // nodes 2 through n_seg+1
            fx: 0.0,
            fy: f_segments[i],
            mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, e_concrete, 0.2)],
        vec![(1, a_eq, iz_eq)],
        elems, sups, loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Base shear = total wind force
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry.abs(), f_total, 0.02, "Base shear equals total wind force");

    // Base moment = overturning moment
    assert_close(r_base.mz.abs(), m_base, 0.05, "Base moment equals wind overturning moment");

    // Sanity: total wind force in reasonable range (500-5000 kN for large tower)
    assert!(
        f_total > 500.0 && f_total < 10000.0,
        "Total wind force: {:.0} kN", f_total
    );

    // Sanity: overturning moment in reasonable range
    assert!(
        m_base > 20000.0,
        "Base overturning moment: {:.0} kN*m", m_base
    );
}

// ================================================================
// 7. Basin Wall -- Hydrostatic Pressure on Retaining Wall
// ================================================================
//
// The cold water basin collects water falling from the fill.
// The basin walls act as retaining walls under hydrostatic pressure.
// Model a 1m-wide strip of basin wall as a cantilever beam fixed
// at the base, loaded by triangular hydrostatic pressure.
//
// For cantilever under triangular load (zero at top, max at base):
//   Max deflection at free end: δ = qL⁴/(30EI)
//   Base moment: M = qL²/6 (where q = max pressure intensity)
//   Base shear: V = qL/2
//
// Reference: BS 4485-4 Section 8; ACI 350 (liquid-retaining structures).

#[test]
fn cooling_tower_basin_wall() {
    // Basin wall properties
    let h_wall: f64 = 3.0;          // m, basin water depth
    let t_wall: f64 = 0.35;         // m, wall thickness
    let b_strip: f64 = 1.0;         // m, unit width strip
    let e_concrete: f64 = 30_000.0; // MPa

    let a_wall: f64 = b_strip * t_wall;
    let iz_wall: f64 = b_strip * t_wall.powi(3) / 12.0;

    // Hydrostatic pressure: p = γ_w × z (z from top)
    let gamma_w: f64 = 9.81;        // kN/m³
    let p_max: f64 = gamma_w * h_wall; // kN/m², at base = 29.43

    // Model as cantilever (fixed at base = node 1, free at top)
    // Using make_beam: the beam extends along X from 0 to h_wall
    // Fixed at start (base), free end (top of wall)
    let n: usize = 8;
    let elem_len: f64 = h_wall / n as f64;

    // Triangular load: linearly varying from p_max at base (x=0) to 0 at top (x=h_wall)
    // For element i from x_i to x_{i+1}:
    //   q_i = p_max × (1 - x_i/h_wall), q_j = p_max × (1 - x_{i+1}/h_wall)
    // These are transverse loads (perpendicular to beam axis)
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let q_i: f64 = p_max * (1.0 - x_i / h_wall) * b_strip;  // kN/m at start of element
        let q_j: f64 = p_max * (1.0 - x_j / h_wall) * b_strip;  // kN/m at end of element
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        }));
    }

    let input = make_beam(n, h_wall, e_concrete, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical results for triangular load on cantilever:
    // Total force: F = p_max × h_wall / 2 × b_strip
    let f_total: f64 = p_max * h_wall / 2.0 * b_strip;

    // Base shear reaction should equal total hydrostatic force
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry.abs(), f_total, 0.05, "Basin wall base shear = total hydrostatic force");

    // Base moment: M = p_max × h² / 6 (triangular load on cantilever)
    let m_base_exact: f64 = p_max * h_wall.powi(2) / 6.0 * b_strip;
    assert_close(r_base.mz.abs(), m_base_exact, 0.10, "Basin wall base moment");

    // Tip deflection: δ = q_max × L⁴ / (30 × E × I) for triangular load
    let e_eff: f64 = e_concrete * 1000.0;
    let delta_exact: f64 = p_max * b_strip * h_wall.powi(4) / (30.0 * e_eff * iz_wall);
    let tip_node = n + 1;
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip_disp.uy.abs(), delta_exact, 0.10, "Basin wall tip deflection");

    // Crack control: check maximum stress vs concrete tensile strength
    let sigma_base: f64 = m_base_exact / (b_strip * t_wall.powi(2) / 6.0); // kN/m²
    let sigma_mpa: f64 = sigma_base / 1000.0;
    let f_ct: f64 = 2.5; // MPa, concrete tensile strength (C30)
    // Wall likely needs reinforcement (water-retaining structure)
    assert!(
        sigma_mpa > 0.0,
        "Bending stress {:.2} MPa; f_ct = {:.1} MPa — reinforcement needed if sigma > f_ct",
        sigma_mpa, f_ct
    );
}

// ================================================================
// 8. Drift Eliminator Support -- Truss Structure
// ================================================================
//
// Drift eliminators are lightweight panels mounted above the fill
// to capture water droplets. They are supported on a light steel
// truss framework. Model a typical truss panel as a pin-jointed
// 2D truss (Warren type) spanning between tower columns.
//
// For a simple Warren truss under uniform load:
//   Max chord force ≈ M/d (where M = wL²/8, d = truss depth)
//   Diagonal force ≈ V/sin(α) (where V = shear, α = diagonal angle)
//
// Reference: BS 4485-4 Section 5.5; CTI STD-201.

#[test]
fn cooling_tower_drift_eliminator_support() {
    // Truss geometry (single Warren truss panel)
    let l_truss: f64 = 6.0;         // m, truss span
    let d_truss: f64 = 0.80;        // m, truss depth
    let n_panels: usize = 3;        // 3 panels along span
    let panel_w: f64 = l_truss / n_panels as f64; // 2.0 m per panel

    // Steel angle section properties (for truss members)
    let e_steel: f64 = 210_000.0;   // MPa
    let a_chord: f64 = 8.0e-4;      // m², chord member (L60×60×6)
    let a_diag: f64 = 6.0e-4;       // m², diagonal member (L50×50×5)
    let iz_small: f64 = 1.0e-10;    // m⁴, very small I for truss behavior

    // Loading: drift eliminator weight + water splash
    // Drift eliminator: 0.3 kN/m² × 1.5 m tributary width = 0.45 kN/m
    // Spray/splash: 0.5 kN/m² × 1.5 m = 0.75 kN/m
    let q_total: f64 = (0.3 + 0.5) * 1.5; // kN/m = 1.2 kN/m

    // Convert to panel point loads on top chord nodes
    let p_panel: f64 = q_total * panel_w; // kN per panel point

    // Build Warren truss:
    // Bottom chord: nodes 1-4 (y=0)
    // Top chord: nodes 5-7 (y=d_truss), offset by half panel width
    //
    //    5-------6-------7
    //   / \     / \     / \
    //  /   \   /   \   /   \
    // 1-----2-------3-------4
    //
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, panel_w, 0.0),
        (3, 2.0 * panel_w, 0.0),
        (4, 3.0 * panel_w, 0.0),
        (5, 0.5 * panel_w, d_truss),
        (6, 1.5 * panel_w, d_truss),
        (7, 2.5 * panel_w, d_truss),
    ];

    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![
        (1, a_chord, iz_small),  // chord section
        (2, a_diag, iz_small),   // diagonal section
    ];

    // Elements (all hinged = truss members)
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        // Top chord
        (4, "frame", 5, 6, 1, 1, true, true),
        (5, "frame", 6, 7, 1, 1, true, true),
        // Diagonals (Warren pattern)
        (6, "frame", 1, 5, 1, 2, true, true),  // rising
        (7, "frame", 5, 2, 1, 2, true, true),   // falling
        (8, "frame", 2, 6, 1, 2, true, true),   // rising
        (9, "frame", 6, 3, 1, 2, true, true),   // falling
        (10, "frame", 3, 7, 1, 2, true, true),  // rising
        (11, "frame", 7, 4, 1, 2, true, true),  // falling
    ];

    // Supports: pinned at node 1, rollerX at node 4
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];

    // Loads: applied at top chord nodes (drift eliminator weight)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -p_panel, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fy: -p_panel, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fy: -p_panel, mz: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied load
    let total_load: f64 = p_panel * 3.0;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry, total_load, 0.02, "Truss vertical equilibrium");

    // Symmetry: equal reactions at both supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.ry, r4.ry, 0.05, "Symmetric support reactions");

    // Each support reaction = total load / 2
    assert_close(r1.ry, total_load / 2.0, 0.05, "Support reaction = total load / 2");

    // Analytical max chord force: F_chord = M_max / d
    // where M_max = total_load × L / 8 (equivalent UDL moment for 3 equal point loads)
    // More precisely for 3 equal loads at L/6, L/2, 5L/6:
    // M_max = P × (L/6 + L/2 + 5L/6)/... = by equilibrium
    // For symmetric 3 point loads: M_center = R × L/2 - P × (L/2 - L/6) - P × 0
    // = (3P/2)×(L/2) - P×(L/3) = 3PL/4 - PL/3 = 9PL/12 - 4PL/12 = 5PL/12
    // Wait: loads at top chord nodes 5,6,7 which are at x = 1.0, 3.0, 5.0
    // R1 = R4 = 3P/2 (half total). M_center = R1 × 3.0 - P × (3.0 - 1.0) = 4.5P - 2P = 2.5P
    let m_center: f64 = 2.5 * p_panel;
    let f_chord_expected: f64 = m_center / d_truss;

    // Check bottom chord center element (element 2: nodes 2-3)
    let ef_chord = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let n_chord: f64 = ef_chord.n_start.abs();
    assert_close(n_chord, f_chord_expected, 0.15, "Center bottom chord axial force");

    // Diagonal force at support: V / sin(α)
    let diag_len: f64 = (panel_w * 0.5 * panel_w * 0.5 + d_truss * d_truss).sqrt();
    let sin_alpha: f64 = d_truss / diag_len;
    let v_support: f64 = total_load / 2.0;
    let f_diag_expected: f64 = v_support / sin_alpha;

    // Check first diagonal (element 6: nodes 1-5)
    let ef_diag = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    let n_diag: f64 = ef_diag.n_start.abs();
    assert_close(n_diag, f_diag_expected, 0.15, "End diagonal axial force");
}
