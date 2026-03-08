/// Validation: Elevator and Escalator Structural Analysis
///
/// References:
///   - ASME A17.1/CSA B44: Safety Code for Elevators and Escalators
///   - EN 81-20/50: Safety rules for the construction and installation of lifts
///   - BS 5655: Lifts and service lifts (structural)
///   - Janovsky: "Elevator Mechanical Design" 3rd ed. (2004)
///   - EN 115-1: Safety of escalators and moving walks
///   - Strakosch: "The Vertical Transportation Handbook" 4th ed. (2010)
///
/// Tests verify guide rail bending, machine room beam, hoistway bracket,
/// counterweight support, escalator truss, pit base slab, overhead beam
/// deflection, and shaft wall pressure distribution.

mod helpers;

use dedaliano_engine::{types::*, solver::linear::*};
use helpers::*;

// ================================================================
// 1. Elevator Guide Rail Bending Under Car Eccentric Load
// ================================================================
//
// Guide rails span between bracket supports. The car exerts eccentric
// load on rails through guide shoes/rollers. Model as a continuous
// 3-span beam (rail between 4 brackets) with a concentrated load
// at midspan of the center span (worst case for eccentric car loading).
// EN 81-20 Annex G: guide rail check under eccentric car load.
// Reactions at brackets are checked against continuous beam theory.

#[test]
fn elevator_guide_rail_bending() {
    // T127/B guide rail properties (heavy rail for mid/high-rise elevators)
    let e_steel: f64 = 210_000.0; // MPa
    let a_rail: f64 = 24.0e-4;    // m^2, T127/B cross-section area
    let iz_rail: f64 = 450.0e-8;  // m^4, moment of inertia about bending axis

    // Bracket spacing (rail span between brackets)
    let bracket_spacing: f64 = 2.5; // m, typical bracket spacing per EN 81-20
    let n_per_span: usize = 4;

    // Eccentric load from car (EN 81-20 Annex G)
    // Car weight 1800 kg, rated load 1000 kg, eccentricity factor
    let car_mass: f64 = 1800.0; // kg
    let rated_load: f64 = 1000.0; // kg
    let g: f64 = 9.81 / 1000.0;  // m/s^2 -> kN/kg
    let eccentricity_factor: f64 = 0.50;
    // Horizontal force on one rail from eccentric loading
    let f_guide: f64 = (car_mass + rated_load) * g * eccentricity_factor / 4.0;
    // This gives roughly 3.43 kN per rail

    // 3-span continuous beam with point load at midspan of center span
    // Spans: [2.5, 2.5, 2.5]
    let spans = vec![bracket_spacing, bracket_spacing, bracket_spacing];
    let _total_elements = n_per_span * 3;

    // Point load at midspan of center span
    // Center span starts at node (n_per_span + 1), midspan element is at midpoint
    let center_mid_node = n_per_span + n_per_span / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: center_mid_node,
        fx: 0.0,
        fy: -f_guide,
        mz: 0.0,
    })];

    let input = make_continuous_beam(&spans, n_per_span, e_steel, a_rail, iz_rail, loads);
    let results = solve_2d(&input).expect("solve");

    // Total vertical reaction must equal applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry, f_guide, 0.02, "Guide rail vertical equilibrium");

    // For 3-span continuous beam with point load P at center of middle span:
    // The center supports carry most load. Using three-moment equation results:
    // Internal support reactions are larger than end reactions.
    let r_end1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_internal1 = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();

    // End reaction should be smaller than internal reaction
    assert!(
        r_end1.ry.abs() < r_internal1.ry.abs(),
        "End reaction {:.3} < internal reaction {:.3}",
        r_end1.ry.abs(), r_internal1.ry.abs()
    );

    // Total load equilibrium
    let total_r: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(total_r, f_guide, 0.02, "Total reaction equals applied guide force");

    // Check midspan deflection of center span is within L/1000 (EN 81-20 limit)
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == center_mid_node).unwrap();
    let deflection_limit: f64 = bracket_spacing / 1000.0;
    assert!(
        mid_disp.uy.abs() < deflection_limit,
        "Guide rail deflection {:.5} m < L/1000 = {:.5} m",
        mid_disp.uy.abs(), deflection_limit
    );
}

// ================================================================
// 2. Machine Room Beam: Traction Machine Support
// ================================================================
//
// The traction machine sits on a beam spanning between machine room
// walls. Model as a simply-supported beam with a concentrated load
// at midspan. The machine weight includes motor, sheave, brake, and
// frame. Midspan moment M = PL/4, deflection delta = PL^3/(48EI).
// Reference: ASME A17.1 Section 2.8 — machine room structural loads.

#[test]
fn elevator_machine_room_beam() {
    // Machine room beam: W310x33 (HEB 300 equivalent)
    let e_steel: f64 = 210_000.0; // MPa
    let a_beam: f64 = 42.1e-4;    // m^2
    let iz_beam: f64 = 6500.0e-8;  // m^4, strong axis

    let l_beam: f64 = 4.0; // m, span between walls
    let n: usize = 8;

    // Traction machine weight (gearless for high-rise)
    // Machine: 2500 kg, sheave: 400 kg, brake: 200 kg, frame: 300 kg
    let total_mass: f64 = 3400.0; // kg
    let g: f64 = 9.81 / 1000.0;  // kN/kg
    let p_machine: f64 = total_mass * g; // ~33.35 kN

    // Dynamic factor for traction machine (EN 81-20: 2.0 for safety gear engagement)
    let dynamic_factor: f64 = 2.0;
    let p_design: f64 = p_machine * dynamic_factor; // ~66.7 kN

    // Point load at midspan
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p_design,
        mz: 0.0,
    })];

    let input = make_beam(n, l_beam, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Reactions: R = P/2 each support
    let r_exact: f64 = p_design / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry, r_exact, 0.02, "Machine beam left reaction");
    assert_close(r_end.ry, r_exact, 0.02, "Machine beam right reaction");

    // Midspan deflection: delta = PL^3/(48EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_design * l_beam.powi(3) / (48.0 * e_eff * iz_beam);

    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Machine beam midspan deflection");

    // Midspan moment: M = PL/4
    let m_exact: f64 = p_design * l_beam / 4.0;

    // The midspan moment can be checked from element forces at the elements
    // adjacent to the midspan node
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_left.m_end.abs(), m_exact, 0.05, "Machine beam midspan moment");
}

// ================================================================
// 3. Hoistway Bracket: Cantilever Bracket Supporting Guide Rail
// ================================================================
//
// Guide rail brackets are cantilevered from the hoistway wall.
// Model as a short cantilever with a point load at the free end
// (guide rail reaction). Deflection delta = PL^3/(3EI), tip moment
// M = P*L. EN 81-20 Annex G: bracket deflection < 5 mm.

#[test]
fn elevator_hoistway_bracket() {
    // Steel bracket: L-shaped, equivalent section
    let e_steel: f64 = 210_000.0; // MPa
    // Heavy bracket: 100x100x10 angle section equivalent
    let a_bracket: f64 = 19.2e-4;  // m^2
    let iz_bracket: f64 = 177.0e-8; // m^4

    let l_bracket: f64 = 0.30; // m, cantilever length (bracket projection from wall)
    let n: usize = 4;

    // Guide rail force on bracket (from test 1, worst case internal reaction)
    let p_bracket: f64 = 8.0; // kN, horizontal force from guide rail

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fy: -p_bracket,
        mz: 0.0,
    })];

    let input = make_beam(n, l_bracket, e_steel, a_bracket, iz_bracket, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Tip deflection: delta = PL^3/(3EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_bracket * l_bracket.powi(3) / (3.0 * e_eff * iz_bracket);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.uy.abs(), delta_exact, 0.05, "Bracket tip deflection");

    // EN 81-20: bracket deflection must be < 5 mm
    assert!(
        tip_disp.uy.abs() < 0.005,
        "Bracket deflection {:.4} m < 5 mm limit",
        tip_disp.uy.abs()
    );

    // Root moment: M = P * L
    let m_exact: f64 = p_bracket * l_bracket;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r1.mz.abs(), m_exact, 0.05, "Bracket root moment");

    // Root shear: V = P
    assert_close(r1.ry.abs(), p_bracket, 0.02, "Bracket root shear reaction");
}

// ================================================================
// 4. Counterweight Support: Frame Under Counterweight Guide Rails
// ================================================================
//
// Counterweight guide rails are supported at the bottom of the pit
// by a steel frame. Model as a simply-supported beam with the
// counterweight buffer reaction as a concentrated load.
// Counterweight mass = car weight + 0.5 * rated load (traction ratio).
// Buffer impact force = 2.5 * static weight (hydraulic buffer).
// Reference: ASME A17.1 Section 8.2 — buffer forces.

#[test]
fn elevator_counterweight_support() {
    // Support beam: W200x22
    let e_steel: f64 = 210_000.0; // MPa
    let a_beam: f64 = 28.5e-4;    // m^2
    let iz_beam: f64 = 2000.0e-8;  // m^4

    let l_beam: f64 = 1.8; // m, span between pit walls
    let n: usize = 8;

    // Counterweight mass: car weight + 50% rated load
    let car_weight: f64 = 1800.0; // kg
    let rated_load: f64 = 1000.0;  // kg
    let cw_mass: f64 = car_weight + 0.5 * rated_load; // 2300 kg
    let g: f64 = 9.81 / 1000.0; // kN/kg

    // Buffer impact factor (hydraulic buffer per EN 81-20)
    let buffer_factor: f64 = 2.5;
    let p_buffer: f64 = cw_mass * g * buffer_factor; // ~56.4 kN

    // Load applied at midspan (buffer centered on beam)
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p_buffer,
        mz: 0.0,
    })];

    let input = make_beam(n, l_beam, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Reactions: R = P/2
    let r_exact: f64 = p_buffer / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry, r_exact, 0.02, "Counterweight beam left reaction");
    assert_close(r_end.ry, r_exact, 0.02, "Counterweight beam right reaction");

    // Midspan moment: M = PL/4
    let m_exact: f64 = p_buffer * l_beam / 4.0;
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();

    assert_close(ef_left.m_end.abs(), m_exact, 0.05, "Counterweight beam midspan moment");

    // Midspan deflection: delta = PL^3/(48EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_buffer * l_beam.powi(3) / (48.0 * e_eff * iz_beam);

    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Counterweight beam midspan deflection");

    // Stress check: sigma = M/S where S = I/(d/2), using approximate d = 0.2 m
    let d_beam: f64 = 0.20; // m, approximate beam depth
    let s_mod: f64 = iz_beam / (d_beam / 2.0);
    let sigma: f64 = m_exact / s_mod; // kN/m^2
    let sigma_mpa: f64 = sigma / 1000.0;
    let fy: f64 = 250.0; // MPa, Grade 250 steel

    assert!(
        sigma_mpa < fy,
        "Bending stress {:.1} MPa < yield {:.1} MPa", sigma_mpa, fy
    );
}

// ================================================================
// 5. Escalator Truss: Main Supporting Structure
// ================================================================
//
// Escalator truss spans between landings. It is a Warren-type truss
// with top and bottom chords and diagonal web members. Model a
// simplified truss with top chord carrying passenger load and bottom
// chord in tension. The truss span is the horizontal projection.
// EN 115-1: escalator structural design, 5 kN/m^2 passenger load.
// Use pin-jointed truss elements (hinge_start=true, hinge_end=true).

#[test]
fn escalator_truss_structure() {
    let e_steel: f64 = 210_000.0; // MPa

    // Truss geometry: 12 m horizontal span, 6 m rise (30 degree inclination)
    let span: f64 = 12.0;   // m, horizontal projection
    let rise: f64 = 6.0;    // m, vertical rise
    let n_panels: usize = 4; // number of truss panels
    let panel_len: f64 = span / n_panels as f64; // 3.0 m each
    let panel_rise: f64 = rise / n_panels as f64; // 1.5 m each

    // Section properties for truss chords (RHS 150x100x6)
    let a_chord: f64 = 28.1e-4;   // m^2
    let iz_truss: f64 = 1.0e-10;  // very small I (truss behavior)

    // Section properties for diagonals (RHS 100x60x5)
    let a_diag: f64 = 14.4e-4;    // m^2

    // Nodes: bottom chord at floor level, top chord following escalator incline
    // Bottom chord: nodes 1..5 at y=0
    // Top chord: nodes 6..10 at escalator incline
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x: f64 = i as f64 * panel_len;
        // Bottom chord node
        nodes.push((i + 1, x, 0.0));
        // Top chord node (1.0 m above bottom chord, following incline)
        let y_top: f64 = i as f64 * panel_rise + 1.0; // truss depth = 1.0 m
        nodes.push((i + 1 + (n_panels + 1), x, y_top));
    }

    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![
        (1, a_chord, iz_truss), // chords
        (2, a_diag, iz_truss),  // diagonals
    ];

    let mut elems = Vec::new();
    let mut eid: usize = 1;
    let nb = n_panels + 1; // number of bottom nodes

    // Bottom chord elements
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, true, true));
        eid += 1;
    }
    // Top chord elements
    for i in 0..n_panels {
        elems.push((eid, "frame", nb + i + 1, nb + i + 2, 1, 1, true, true));
        eid += 1;
    }
    // Vertical members at each panel point
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, nb + i + 1, 1, 2, true, true));
        eid += 1;
    }
    // Diagonal members (Warren pattern)
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, nb + i + 2, 1, 2, true, true));
        eid += 1;
    }

    // Supports: pinned at bottom-left, rollerX at bottom-right
    let sups = vec![
        (1, 1, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    // Passenger load: 5 kN/m^2 * 1.0 m width = 5 kN/m
    // Applied as concentrated loads at top chord nodes
    let q_passenger: f64 = 5.0; // kN/m
    let p_node: f64 = q_passenger * panel_len; // kN per node

    let mut loads = Vec::new();
    // Apply loads to interior top chord nodes
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nb + i + 1,
            fx: 0.0,
            fy: -p_node,
            mz: 0.0,
        }));
    }
    // Half loads at end top chord nodes
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: nb + 1,
        fx: 0.0,
        fy: -p_node / 2.0,
        mz: 0.0,
    }));
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: nb + n_panels + 1,
        fx: 0.0,
        fy: -p_node / 2.0,
        mz: 0.0,
    }));

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total applied load = q * span = 5.0 * 12.0 = 60 kN
    let total_load: f64 = q_passenger * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();

    assert_close(sum_ry, total_load, 0.02, "Escalator truss vertical equilibrium");

    // For a simply-supported truss, reactions are approximately equal for
    // uniform loading (asymmetric geometry shifts them slightly)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap();

    // Both reactions should be positive (upward) and roughly share total load
    assert!(r1.ry > 0.0, "Left support reaction is upward");
    assert!(r_end.ry > 0.0, "Right support reaction is upward");
    assert_close(r1.ry + r_end.ry, total_load, 0.02, "Sum of reactions equals total load");

    // Bottom chord at midspan should be in tension (positive axial force)
    // Element at midspan of bottom chord
    let mid_bottom_elem = n_panels / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_bottom_elem).unwrap();
    assert!(
        ef_mid.n_start > 0.0 || ef_mid.n_end < 0.0,
        "Bottom chord at midspan is in tension"
    );
}

// ================================================================
// 6. Elevator Pit Base Slab: Beam on Two Supports Under Buffer Load
// ================================================================
//
// The elevator pit base slab supports the car buffer and counterweight
// buffer. Model a 1 m wide strip of slab as a simply-supported beam
// under UDL (slab self-weight + buffer concentrated force).
// Reference: EN 81-20 Section 5.5 — pit structural requirements.

#[test]
fn elevator_pit_base_slab() {
    // Reinforced concrete slab properties (300 mm thick)
    let e_concrete: f64 = 30_000.0; // MPa, C30/37 concrete
    let t_slab: f64 = 0.30;         // m, slab thickness
    let b_strip: f64 = 1.0;         // m, unit width strip
    let a_slab: f64 = b_strip * t_slab;
    let iz_slab: f64 = b_strip * t_slab.powi(3) / 12.0;

    let l_pit: f64 = 2.0; // m, pit width (short span direction)
    let n: usize = 8;

    // Slab self-weight: 25 kN/m^3 * 0.3 m * 1.0 m width = 7.5 kN/m
    let gamma_concrete: f64 = 25.0; // kN/m^3
    let q_self: f64 = -gamma_concrete * t_slab * b_strip; // -7.5 kN/m

    // Buffer force: car weight (1800 kg) * gravity * impact factor (3.0)
    let car_mass: f64 = 1800.0; // kg
    let g: f64 = 9.81 / 1000.0; // kN/kg
    let impact_factor: f64 = 3.0;
    let p_buffer: f64 = car_mass * g * impact_factor; // ~52.97 kN

    // Distribute buffer force over 1 m strip width and apply at midspan
    let mid_node = n / 2 + 1;

    let mut loads = Vec::new();
    // Self-weight UDL on all elements
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_self,
            q_j: q_self,
            a: None,
            b: None,
        }));
    }
    // Buffer concentrated force at midspan
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p_buffer,
        mz: 0.0,
    }));

    let input = make_beam(n, l_pit, e_concrete, a_slab, iz_slab, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total load = self-weight + buffer
    let total_sw: f64 = q_self.abs() * l_pit;
    let total_load: f64 = total_sw + p_buffer;

    // Total reaction must equal total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry, total_load, 0.02, "Pit slab total vertical equilibrium");

    // Reactions are symmetric: R = total_load / 2
    let r_exact: f64 = total_load / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_exact, 0.02, "Pit slab symmetric reaction");

    // Midspan moment: M_udl + M_point = qL^2/8 + PL/4
    let m_udl: f64 = q_self.abs() * l_pit.powi(2) / 8.0;
    let m_point: f64 = p_buffer * l_pit / 4.0;
    let m_total: f64 = m_udl + m_point;

    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_total, 0.05, "Pit slab midspan bending moment");

    // Midspan deflection: delta = 5qL^4/(384EI) + PL^3/(48EI)
    let e_eff: f64 = e_concrete * 1000.0;
    let delta_udl: f64 = 5.0 * q_self.abs() * l_pit.powi(4) / (384.0 * e_eff * iz_slab);
    let delta_point: f64 = p_buffer * l_pit.powi(3) / (48.0 * e_eff * iz_slab);
    let delta_total: f64 = delta_udl + delta_point;

    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_total, 0.05, "Pit slab midspan deflection");
}

// ================================================================
// 7. Overhead Beam Deflection: Sheave Beam at Top of Hoistway
// ================================================================
//
// The overhead (diverter) sheave beam supports the rope deflection
// sheave at the top of the hoistway. It carries rope tension loads.
// Model as a fixed-fixed beam with a concentrated load at the third
// point (off-center sheave placement).
// delta_max for fixed-fixed beam with point load at distance a from
// left support: delta = Pa^2*b^2/(3EIL) at the load point,
// where b = L - a. M_fixed_end_left = Pab^2/L^2, M_fixed_end_right = Pa^2b/L^2.

#[test]
fn elevator_overhead_beam_deflection() {
    // Overhead beam: W250x25
    let e_steel: f64 = 210_000.0; // MPa
    let a_beam: f64 = 32.0e-4;    // m^2
    let iz_beam: f64 = 3480.0e-8;  // m^4

    let l_beam: f64 = 3.0; // m, span between hoistway walls
    let n: usize = 12;      // enough elements for accuracy

    // Sheave load: rope tension * number of ropes * sheave factor
    // 2:1 roping, 6 ropes, car+load = 2800 kg
    let total_mass: f64 = 2800.0; // kg (car + rated load)
    let g: f64 = 9.81 / 1000.0;   // kN/kg
    let p_rope: f64 = total_mass * g; // ~27.47 kN total rope load
    // With 2:1 roping, sheave sees full load
    let p_sheave: f64 = p_rope;

    // Sheave at L/3 from left wall
    let a_pos: f64 = l_beam / 3.0; // 1.0 m from left
    let b_pos: f64 = l_beam - a_pos; // 2.0 m from right

    // Find node closest to L/3
    let elem_len: f64 = l_beam / n as f64;
    let load_node: usize = (a_pos / elem_len).round() as usize + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fy: -p_sheave,
        mz: 0.0,
    })];

    // Fixed-fixed beam
    let input = make_beam(n, l_beam, e_steel, a_beam, iz_beam, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed beam with point load P at distance a from left:
    // Left reaction: R_L = Pb^2(3a + b)/L^3
    // Right reaction: R_R = Pa^2(a + 3b)/L^3
    let l3: f64 = l_beam.powi(3);
    let r_left_exact: f64 = p_sheave * b_pos.powi(2) * (3.0 * a_pos + b_pos) / l3;
    let r_right_exact: f64 = p_sheave * a_pos.powi(2) * (a_pos + 3.0 * b_pos) / l3;

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_left.ry, r_left_exact, 0.05, "Overhead beam left reaction");
    assert_close(r_right.ry, r_right_exact, 0.05, "Overhead beam right reaction");

    // Fixed-end moments:
    // M_left = P*a*b^2/L^2 (hogging at left support)
    // M_right = P*a^2*b/L^2 (hogging at right support)
    let l2: f64 = l_beam.powi(2);
    let m_left_exact: f64 = p_sheave * a_pos * b_pos.powi(2) / l2;
    let m_right_exact: f64 = p_sheave * a_pos.powi(2) * b_pos / l2;

    assert_close(r_left.mz.abs(), m_left_exact, 0.10, "Overhead beam left fixed-end moment");
    assert_close(r_right.mz.abs(), m_right_exact, 0.10, "Overhead beam right fixed-end moment");

    // Deflection at load point: delta = Pa^2*b^2/(3EIL)
    // Note: this is approximate for the exact load position
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_sheave * a_pos.powi(2) * b_pos.powi(2) / (3.0 * e_eff * iz_beam * l_beam);

    let load_disp = results.displacements.iter()
        .find(|d| d.node_id == load_node).unwrap();

    assert_close(load_disp.uy.abs(), delta_exact, 0.10, "Overhead beam deflection at sheave");

    // Deflection serviceability check: L/500 for machine-supporting beams
    let deflection_limit: f64 = l_beam / 500.0;
    assert!(
        load_disp.uy.abs() < deflection_limit,
        "Deflection {:.5} m < L/500 = {:.4} m",
        load_disp.uy.abs(), deflection_limit
    );
}

// ================================================================
// 8. Shaft Wall Pressure: Horizontal Load on Hoistway Wall Framing
// ================================================================
//
// Elevator hoistway walls experience horizontal pressure from piston
// effect (air pressure changes as car moves). Model a vertical wall
// stud (steel channel) as a simply-supported beam between floor slabs
// under uniform horizontal pressure (UDL).
// EN 81-20 Section 5.2.1.3: hoistway walls withstand 300 N/m^2
// (0.3 kPa) at any point without permanent deformation.
// Reactions: R = qL/2. Midspan moment: M = qL^2/8.
// Deflection: delta = 5qL^4/(384EI).

#[test]
fn elevator_shaft_wall_pressure() {
    // Wall stud: C150x12 channel
    let e_steel: f64 = 210_000.0; // MPa
    let a_stud: f64 = 15.3e-4;    // m^2
    let iz_stud: f64 = 308.0e-8;   // m^4, bending about weak axis

    let l_stud: f64 = 3.5; // m, floor-to-floor height
    let n: usize = 8;

    // Pressure load per EN 81-20
    let pressure: f64 = 0.3;      // kPa (kN/m^2)
    let stud_spacing: f64 = 0.6;  // m, stud center-to-center spacing

    // Line load on stud = pressure * tributary width
    let q_stud: f64 = -pressure * stud_spacing; // kN/m, negative = transverse load

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_stud,
            q_j: q_stud,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n, l_stud, e_steel, a_stud, iz_stud, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Reactions: R = qL/2
    let r_exact: f64 = q_stud.abs() * l_stud / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry.abs(), r_exact, 0.02, "Shaft wall stud left reaction");
    assert_close(r_end.ry.abs(), r_exact, 0.02, "Shaft wall stud right reaction");

    // Midspan moment: M = qL^2/8
    let m_exact: f64 = q_stud.abs() * l_stud.powi(2) / 8.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();

    assert_close(ef_mid.m_end.abs(), m_exact, 0.05, "Shaft wall stud midspan moment");

    // Midspan deflection: delta = 5qL^4/(384EI)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = 5.0 * q_stud.abs() * l_stud.powi(4) / (384.0 * e_eff * iz_stud);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Shaft wall stud midspan deflection");

    // Stress check: sigma = M / S, where S = I / (d/2)
    let d_stud: f64 = 0.150; // m, channel depth
    let s_mod: f64 = iz_stud / (d_stud / 2.0);
    let sigma: f64 = m_exact / s_mod; // kN/m^2
    let sigma_mpa: f64 = sigma / 1000.0;
    let fy: f64 = 250.0; // MPa, Grade 250

    assert!(
        sigma_mpa < fy,
        "Wall stud bending stress {:.1} MPa < yield {:.1} MPa",
        sigma_mpa, fy
    );

    // Serviceability: deflection < L/360 for walls
    let deflection_limit: f64 = l_stud / 360.0;
    assert!(
        mid_disp.uy.abs() < deflection_limit,
        "Deflection {:.5} m < L/360 = {:.4} m",
        mid_disp.uy.abs(), deflection_limit
    );
}
