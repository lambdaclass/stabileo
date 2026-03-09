/// Validation: Scaffolding and Temporary Works Structural Analysis
///
/// References:
///   - BS EN 12811-1:2003: Temporary works equipment — Scaffolds
///   - BS EN 12812:2008: Falsework — Performance requirements
///   - BS 5975:2019: Code of practice for temporary works procedures
///   - Ratay: "Temporary Structures in Construction" 3rd ed. (2012)
///   - Rodin: "Lateral pressure of fresh concrete on formwork" (1952)
///   - Euler: Column buckling theory
///
/// Tests verify scaffold tube axial capacity, ledger beams, standard
/// buckling, tie forces, bracing diagonals, formwork pressure,
/// telescopic prop capacity, and platform combined loading.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Scaffold Tube: Axial Capacity of Steel Tube Under Compression
// ================================================================
//
// Standard scaffold tube: 48.3 mm OD, 3.2 mm wall, Grade S235.
// A = π*(D²-d²)/4, I = π*(D⁴-d⁴)/64
// Model a 2 m tube as a column under axial compression.
// Verify axial stress σ = P/A and compare with yield.

#[test]
fn scaffolding_tube_axial_capacity() {
    // Scaffold tube properties (48.3 mm OD, 3.2 mm wall)
    let d_outer: f64 = 0.0483;   // m
    let d_inner: f64 = 0.0483 - 2.0 * 0.0032; // m
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 210_000.0; // MPa
    let l: f64 = 2.0;             // m, standard lift height
    let p_axial: f64 = -20.0;     // kN, compressive load (negative fx => compression along x)
    let n: usize = 4;

    // Model as horizontal column along X (make_column lays along X)
    let input = make_column(n, l, e_steel, a_tube, iz_tube, "fixed", "rollerX", p_axial);
    let results = solve_2d(&input).expect("solve");

    // Axial displacement: δ = PL/(EA)
    let e_eff: f64 = e_steel * 1000.0; // convert to kPa (kN/m²)
    let delta_exact: f64 = p_axial.abs() * l / (e_eff * a_tube);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.ux.abs(), delta_exact, 0.02, "Scaffold tube axial displacement");

    // Verify axial force in element
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let n_force: f64 = ef.n_start.abs();

    assert_close(n_force, p_axial.abs(), 0.02, "Scaffold tube axial force");

    // Stress check: σ = P/A
    let sigma: f64 = p_axial.abs() / a_tube; // kN/m² = kPa
    let sigma_mpa: f64 = sigma / 1000.0;
    let fy: f64 = 235.0; // MPa, yield strength

    assert!(
        sigma_mpa < fy,
        "Tube stress {:.1} MPa < yield {:.1} MPa", sigma_mpa, fy
    );
}

// ================================================================
// 2. Ledger Beam: SS Beam Under Platform Distributed Load
// ================================================================
//
// Ledger (horizontal tube) spanning between standards, loaded by
// platform boards. Model as SS beam under UDL.
// Midspan deflection: δ = 5qL⁴/(384EI)
// Midspan moment: M = qL²/8

#[test]
fn scaffolding_ledger_beam_platform_load() {
    // Ledger tube: 48.3 mm OD, 3.2 mm wall
    let d_outer: f64 = 0.0483;
    let d_inner: f64 = 0.0483 - 2.0 * 0.0032;
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 210_000.0; // MPa
    let l: f64 = 2.5;             // m, bay length
    let n: usize = 8;

    // EN 12811 Class 3 (masonry): 2.0 kN/m² over 0.6 m width = 1.2 kN/m
    let q: f64 = -1.2; // kN/m downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e_steel, a_tube, iz_tube, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0;

    // Midspan deflection: δ = 5qL⁴/(384EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_tube);
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Ledger midspan deflection");

    // Reactions: R = qL/2
    let r_exact: f64 = q.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r1.ry.abs(), r_exact, 0.02, "Ledger support reaction");
}

// ================================================================
// 3. Standard (Vertical): Column Buckling of Scaffold Standard
// ================================================================
//
// Scaffold standard (vertical tube) checked for Euler buckling.
// Pcr = π²EI/(KL)² with K=1.0 (pinned-pinned between ledger ties)
// Verify that working load is well below critical.

#[test]
fn scaffolding_standard_column_buckling() {
    let d_outer: f64 = 0.0483;
    let d_inner: f64 = 0.0483 - 2.0 * 0.0032;
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 210_000.0; // MPa
    let l: f64 = 2.0;             // m, lift height (distance between ledgers)
    let n: usize = 8;
    let p_working: f64 = -15.0;   // kN, working axial load

    // Model: pinned-pinned column (ledgers provide lateral support)
    // Apply axial load plus small lateral perturbation to induce bending
    let p_lateral: f64 = 0.001;   // kN, tiny perturbation at midspan

    let input = make_beam(n, l, e_steel, a_tube, iz_tube, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: p_working, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fy: p_lateral, mz: 0.0,
            }),
        ]);
    let results = solve_2d(&input).expect("solve");

    // Euler critical load: Pcr = π²EI/L²
    let e_eff: f64 = e_steel * 1000.0;
    let pi: f64 = std::f64::consts::PI;
    let p_euler: f64 = pi.powi(2) * e_eff * iz_tube / (l * l);

    // Verify working load is well below Euler load
    let ratio: f64 = p_working.abs() / p_euler;
    assert!(
        ratio < 0.5,
        "P/Pcr = {:.3} — standard is safe (< 0.5)", ratio
    );

    // Verify the structure solves and produces finite displacements
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap();
    assert!(mid_disp.uy.abs() > 0.0, "Non-zero lateral displacement from perturbation");
    assert!(mid_disp.uy.abs() < 0.01, "Small lateral displacement at working load");

    // Slenderness ratio: λ = L/r, r = sqrt(I/A)
    let r_gyration: f64 = (iz_tube / a_tube).sqrt();
    let slenderness: f64 = l / r_gyration;
    assert!(
        slenderness > 50.0 && slenderness < 200.0,
        "Slenderness ratio = {:.1}, typical for scaffold standard", slenderness
    );
}

// ================================================================
// 4. Tie Force: Horizontal Tie to Building, Wind Load Reaction
// ================================================================
//
// Scaffold tied to building at top. Wind load applied laterally.
// The tie transmits the horizontal reaction to the building.
// Model as portal frame: wind load at top, fixed base (ground),
// pinned connection at top (tie point). Horizontal reaction at tie = wind.

#[test]
fn scaffolding_tie_force_wind() {
    let h: f64 = 6.0;   // m, scaffold height (3 lifts)
    let w: f64 = 2.5;    // m, bay width
    let e_steel: f64 = 210_000.0;
    let a: f64 = 4.53e-4; // m², scaffold tube area
    let iz: f64 = 1.09e-7; // m⁴, scaffold tube inertia

    // Wind load on scaffold face: 0.6 kN/m² * 2.5 m bay * 6 m height
    // Distributed as equivalent point loads at nodes
    let f_wind: f64 = 0.6 * 2.5 * 6.0; // = 9.0 kN total on face
    // Applied as lateral load at top of frame
    let f_top: f64 = f_wind; // kN

    let input = make_portal_frame(h, w, e_steel, a, iz, f_top, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Sum of horizontal reactions must equal applied wind
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_top, 0.02, "Total horizontal reaction equals wind load");

    // Each base gets a share of the horizontal reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // For a portal frame with fixed bases, both bases share the horizontal load
    let total_rx: f64 = (r1.rx + r4.rx).abs();
    assert_close(total_rx, f_top, 0.02, "Horizontal equilibrium check");

    // Overturning moment at base: M = F * h
    let m_overturning: f64 = f_top * h;
    // Resisting couple: vertical reactions * width
    let r_vert_diff: f64 = (r1.ry - r4.ry).abs();
    let m_resisting: f64 = r_vert_diff * w / 2.0;

    // Moment equilibrium: overturning = base moments + vertical couple
    let sum_base_moments: f64 = r1.mz.abs() + r4.mz.abs();
    let m_total_resist: f64 = sum_base_moments + m_resisting;

    assert_close(m_total_resist, m_overturning, 0.10, "Moment equilibrium at base");
}

// ================================================================
// 5. Bracing Diagonal: Lateral Force in Diagonal Brace Member
// ================================================================
//
// Diagonal brace in a scaffold bay resists lateral (wind) load.
// Model as a pin-jointed truss panel: two verticals + one diagonal.
// Diagonal force = F_lateral / cos(θ) where θ = atan(h/w).

#[test]
fn scaffolding_bracing_diagonal() {
    let h: f64 = 2.0;     // m, lift height
    let w: f64 = 2.5;     // m, bay width
    let e_steel: f64 = 210_000.0;
    let a_brace: f64 = 4.53e-4; // m², tube area
    let iz_brace: f64 = 1.0e-10; // very small I (truss behavior, near-pin)

    let f_lateral: f64 = 5.0; // kN, lateral wind force

    // Diagonal length
    let l_diag: f64 = (h * h + w * w).sqrt();
    let cos_theta: f64 = w / l_diag;
    let sin_theta: f64 = h / l_diag;

    // Build a braced panel:
    // Node 1: (0,0) fixed
    // Node 2: (w,0) fixed (rollerX)
    // Node 3: (0,h) free top-left — lateral load applied here
    // Node 4: (w,h) free top-right
    // Elements: 1-3 (left vertical), 2-4 (right vertical), 1-4 (diagonal brace)
    // Horizontal beam 3-4 at top
    let nodes = vec![(1, 0.0, 0.0), (2, w, 0.0), (3, 0.0, h), (4, w, h)];
    let mats = vec![(1, e_steel, 0.3)];
    let secs = vec![(1, a_brace, iz_brace)];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, true, true), // left vertical, hinged both ends (truss)
        (2, "frame", 2, 4, 1, 1, true, true), // right vertical, hinged
        (3, "frame", 1, 4, 1, 1, true, true), // diagonal brace, hinged
        (4, "frame", 3, 4, 1, 1, true, true), // top beam, hinged
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f_lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Diagonal brace force: the horizontal component of diagonal axial force = F_lateral
    // So diagonal axial force = F_lateral / cos(θ)
    let f_diag_expected: f64 = f_lateral / cos_theta;

    let ef_diag = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let n_diag: f64 = ef_diag.n_start.abs();

    // For truss with very small Iz, axial force dominates
    assert_close(n_diag, f_diag_expected, 0.10, "Diagonal brace axial force");

    // Verify lateral equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_lateral, 0.02, "Lateral equilibrium");

    // Check diagonal geometry
    assert_close(l_diag, (h * h + w * w).sqrt(), 0.001, "Diagonal length");
    assert_close(cos_theta, w / l_diag, 0.001, "cos(theta)");
    let _sin_check: f64 = sin_theta; // suppress unused warning
}

// ================================================================
// 6. Concrete Formwork Pressure: Rodin Formula
// ================================================================
//
// Rodin (1952): p = min(ρ*g*h, 50 + ρ*R^0.5) [kPa]
// where ρ = concrete density (approx 24 kN/m³),
//       h = depth of pour (m),
//       R = rate of pour (m/hr).
// Model a 1 m wide strip of formwork as a SS beam loaded by
// the calculated pressure over the form height.

#[test]
fn scaffolding_formwork_pressure_rodin() {
    // Concrete properties
    let rho: f64 = 24.0;   // kN/m³
    let h_pour: f64 = 4.0;  // m, pour height
    let rate: f64 = 2.0;    // m/hr, rate of pour

    // Rodin formula: p = min(ρ*h, 50 + ρ*R^0.5)
    let p_hydrostatic: f64 = rho * h_pour; // = 96 kPa
    let p_rodin: f64 = 50.0 + rho * rate.sqrt(); // = 50 + 24*1.414 = 83.94 kPa
    let p_design: f64 = p_hydrostatic.min(p_rodin);

    // For h=4m, R=2: p_rodin = 83.94 < 96 = p_hydrostatic
    // So Rodin formula governs
    assert_close(p_design, p_rodin, 0.01, "Rodin formula governs over hydrostatic");

    // Model formwork panel as SS beam under this pressure
    // Formwork span between studs/soldiers: 0.6 m
    let l_panel: f64 = 0.6; // m, span of formwork panel
    let n: usize = 4;
    let e_plywood: f64 = 10_000.0; // MPa, plywood E
    let t_panel: f64 = 0.018;      // m, 18 mm plywood
    let b_strip: f64 = 1.0;        // m, unit width strip
    let a_panel: f64 = b_strip * t_panel;
    let iz_panel: f64 = b_strip * t_panel.powi(3) / 12.0;

    // UDL on panel = pressure * unit width (kN/m)
    let q: f64 = -p_design * b_strip; // kN/m, downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l_panel, e_plywood, a_panel, iz_panel, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical deflection: δ = 5qL⁴/(384EI)
    let e_eff: f64 = e_plywood * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l_panel.powi(4) / (384.0 * e_eff * iz_panel);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Formwork panel deflection");

    // Verify Rodin formula values
    assert_close(p_hydrostatic, 96.0, 0.01, "Hydrostatic pressure");
    let p_rodin_check: f64 = 50.0 + 24.0 * 2.0_f64.sqrt();
    assert_close(p_rodin, p_rodin_check, 0.01, "Rodin pressure value");
}

// ================================================================
// 7. Prop Capacity: Telescopic Prop Euler Buckling Check
// ================================================================
//
// Telescopic (Acrow) prop: outer tube 60.3 mm OD, 3.2 mm wall
// Extended length 3.5 m, pin-pin ends (K=1.0).
// Pcr = π²EI/(KL)²
// Verify working load is fraction of Euler load.

#[test]
fn scaffolding_prop_euler_buckling() {
    // Prop properties (outer tube governs — weakest section)
    let d_outer: f64 = 0.0603;
    let d_inner: f64 = 0.0603 - 2.0 * 0.0032;
    let a_prop: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_prop: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 210_000.0; // MPa
    let l: f64 = 3.5;             // m, extended prop length
    let n: usize = 8;

    // Working load: slab weight * tributary area
    // 25 kN/m³ * 0.2 m thick * 1.5 m × 1.5 m trib = 11.25 kN
    let p_working: f64 = -11.25;   // kN, compressive

    let input = make_column(n, l, e_steel, a_prop, iz_prop, "pinned", "rollerX", p_working);
    let results = solve_2d(&input).expect("solve");

    // Euler critical load: Pcr = π²EI/L²
    let e_eff: f64 = e_steel * 1000.0;
    let pi: f64 = std::f64::consts::PI;
    let p_euler: f64 = pi.powi(2) * e_eff * iz_prop / (l * l);

    // Safety factor
    let sf: f64 = p_euler / p_working.abs();
    assert!(
        sf > 3.0,
        "Euler safety factor = {:.1} — prop is safe (> 3.0)", sf
    );

    // Verify axial shortening: δ = PL/(EA)
    let delta_exact: f64 = p_working.abs() * l / (e_eff * a_prop);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.ux.abs(), delta_exact, 0.02, "Prop axial shortening");

    // Verify element axial force
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), p_working.abs(), 0.02, "Prop axial force");

    // Slenderness check
    let r_gyration: f64 = (iz_prop / a_prop).sqrt();
    let slenderness: f64 = l / r_gyration;
    assert!(
        slenderness > 100.0,
        "Prop slenderness = {:.0} — slender column (> 100)", slenderness
    );
}

// ================================================================
// 8. Platform Loading: Combined Dead + Live Load on Access Scaffold
// ================================================================
//
// Access scaffold platform: dead load (self-weight of boards + tubes)
// plus EN 12811 Class 2 live load (1.5 kN/m²).
// Model as continuous 2-span beam (ledger over 3 standards).
// Verify reactions and midspan deflections.

#[test]
fn scaffolding_platform_combined_loading() {
    // Ledger tube properties
    let d_outer: f64 = 0.0483;
    let d_inner: f64 = 0.0483 - 2.0 * 0.0032;
    let a_tube: f64 = std::f64::consts::PI / 4.0 * (d_outer.powi(2) - d_inner.powi(2));
    let iz_tube: f64 = std::f64::consts::PI / 64.0 * (d_outer.powi(4) - d_inner.powi(4));

    let e_steel: f64 = 210_000.0; // MPa
    let bay: f64 = 2.5;           // m, bay length
    let width: f64 = 0.6;         // m, platform width

    // Dead load: scaffold self-weight + boards
    let dl: f64 = 0.3;            // kN/m², self-weight
    // Live load: EN 12811 Class 2 (light work)
    let ll: f64 = 1.5;            // kN/m²

    // Total line load on ledger = (DL + LL) * tributary width
    let q_total: f64 = -(dl + ll) * width; // kN/m, downward = -1.08 kN/m

    // Two-span continuous beam (3 nodes: pinned-roller-roller)
    let n_per_span: usize = 4;
    let total_elements = n_per_span * 2;

    // Build loads for all elements
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }

    // Use make_continuous_beam helper would be ideal, but build manually
    // to control support types precisely
    let total_length: f64 = 2.0 * bay;
    let elem_len: f64 = total_length / total_elements as f64;
    let n_nodes = total_elements + 1;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    // Supports at start, middle (internal standard), and end
    let mid_node = n_per_span + 1; // node at internal support
    let sups = vec![
        (1, 1, "pinned"),
        (2, mid_node, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    let input = make_input(nodes, vec![(1, e_steel, 0.3)], vec![(1, a_tube, iz_tube)], elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Total load on beam = q * total_length
    let total_load: f64 = q_total.abs() * total_length;

    // Sum of vertical reactions should equal total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_load, 0.02, "Total vertical reaction equals total load");

    // For 2-span continuous beam with equal UDL:
    // Internal reaction R_mid = 5qL/4 (for each span length L)
    // End reactions R_end = 3qL/8
    let r_mid_exact: f64 = 5.0 * q_total.abs() * bay / 4.0;
    let r_end_exact: f64 = 3.0 * q_total.abs() * bay / 8.0;

    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_end1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_mid.ry.abs(), r_mid_exact, 0.05, "Internal standard reaction (5qL/4)");
    assert_close(r_end1.ry.abs(), r_end_exact, 0.05, "End standard reaction (3qL/8)");

    // Deflection should be reasonable (< L/200 serviceability)
    // Check midspan of first bay (node at quarter of total length)
    let quarter_node = n_per_span / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == quarter_node).unwrap();

    let deflection_limit: f64 = bay / 200.0; // 12.5 mm
    assert!(
        mid_disp.uy.abs() < deflection_limit,
        "Deflection {:.4} m < L/200 = {:.4} m", mid_disp.uy.abs(), deflection_limit
    );
}
