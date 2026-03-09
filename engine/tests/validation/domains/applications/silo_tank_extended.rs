/// Validation: Silo, Tank, and Containment Structure Concepts
///
/// References:
///   - Janssen (1895): "Versuche uber Getreidedruck in Silozellen"
///   - EN 1991-4: Eurocode 1 -- Actions on Silos and Tanks
///   - API 650: Welded Tanks for Oil Storage
///   - ACI 350: Environmental Engineering Concrete Structures
///   - Rotter: "Guide for the Economic Design of Circular Metal Silos" (2001)
///   - Ibrahim: "Liquid Sloshing Dynamics" (Cambridge, 2005)
///   - DNV-OS-C101: Design of Offshore Steel Structures
///
/// Tests verify Janssen pressure, hydrostatic cantilever wall,
/// wind buckling, ring beam stiffener, hopper loads, sloshing
/// frequency, foundation ring, and combined hydrostatic+wind loading.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Janssen Equation -- Silo Wall Pressure
// ================================================================
//
// Horizontal pressure in a granular silo:
//   p_h = gamma * R / (mu * K) * (1 - exp(-mu * K * z / R))
// where:
//   gamma = bulk density of stored material
//   R = hydraulic radius = A / perimeter = D/4 for circular silo
//   mu = wall friction coefficient
//   K = lateral pressure ratio (Rankine: K = (1 - sin(phi))/(1 + sin(phi)))
//   z = depth from free surface
//
// At large depth, pressure asymptotes to p_inf = gamma * R / (mu * K).
// This is fundamentally different from hydrostatic (linear) pressure.
//
// We model a vertical cantilever strip of silo wall under Janssen
// pressure, compare midspan deflection to analytical estimate.

#[test]
fn silo_janssen_pressure_wall_strip() {
    // Material properties for stored grain
    let gamma_grain: f64 = 8.0;     // kN/m^3, bulk density wheat
    let phi: f64 = 30.0_f64.to_radians(); // internal friction angle
    let mu: f64 = 0.40;             // wall friction coefficient
    let k: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin()); // Rankine K

    // Silo geometry
    let d_silo: f64 = 6.0;          // m, diameter
    let r_hyd: f64 = d_silo / 4.0;  // hydraulic radius for circular silo
    let h_fill: f64 = 20.0;         // m, fill height

    // Janssen asymptotic pressure
    let p_inf: f64 = gamma_grain * r_hyd / (mu * k);

    // Janssen pressure at various depths
    let z_vals = [5.0, 10.0, 15.0, 20.0];
    let mut p_janssen = Vec::new();
    for &z in &z_vals {
        let exponent: f64 = -mu * k * z / r_hyd;
        let p_h: f64 = p_inf * (1.0 - exponent.exp());
        p_janssen.push(p_h);
    }

    // Verify pressure increases with depth but asymptotes
    for i in 1..p_janssen.len() {
        assert!(
            p_janssen[i] > p_janssen[i - 1],
            "Pressure should increase with depth"
        );
    }
    // Deepest pressure should approach but not exceed p_inf
    assert!(
        *p_janssen.last().unwrap() < p_inf,
        "Janssen pressure {:.2} < asymptote {:.2} kPa",
        p_janssen.last().unwrap(), p_inf
    );

    // Model a vertical wall strip (1m wide) as a cantilever under
    // trapezoidal pressure from Janssen distribution
    let h_strip: f64 = 5.0;         // m, strip height (bottom portion)
    let e: f64 = 30_000.0;          // MPa, concrete
    let wall_t: f64 = 0.25;         // m, wall thickness
    let a_strip: f64 = wall_t * 1.0; // m^2 per unit width
    let iz_strip: f64 = 1.0 * wall_t.powi(3) / 12.0; // m^4

    // Pressure at top and bottom of strip
    let z_top: f64 = h_fill - h_strip;
    let z_bot: f64 = h_fill;
    let exp_top: f64 = -mu * k * z_top / r_hyd;
    let exp_bot: f64 = -mu * k * z_bot / r_hyd;
    let p_top: f64 = p_inf * (1.0 - exp_top.exp());
    let p_bot: f64 = p_inf * (1.0 - exp_bot.exp());

    // Build cantilever (fixed at bottom) with trapezoidal load
    let n = 8;
    let mut loads = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        // Interpolate pressure linearly along strip (top to bottom)
        let qi = -(p_top + (p_bot - p_top) * xi);
        let qj = -(p_top + (p_bot - p_top) * xj);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, h_strip, e, a_strip, iz_strip, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Tip deflection should be reasonable for a loaded cantilever
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Approximate: for uniform load p_avg, delta = p*L^4/(8*EI)
    let p_avg: f64 = (p_top + p_bot) / 2.0;
    let e_eff: f64 = e * 1000.0; // solver uses kN/m^2
    let delta_approx: f64 = p_avg * h_strip.powi(4) / (8.0 * e_eff * iz_strip);

    // FEM result should be in the same order of magnitude
    assert_close(tip.uy.abs(), delta_approx, 0.35, "Janssen wall strip deflection");
}

// ================================================================
// 2. Hydrostatic Tank -- Triangular Pressure on Cantilever Wall
// ================================================================
//
// Tank wall modeled as vertical cantilever strip under triangular
// hydrostatic pressure: p = gamma_w * (H - z), max at base.
// Exact tip deflection: delta = gamma_w * H * L^4 / (30 * E * I)
// for triangular load increasing toward fixed end.

#[test]
fn tank_hydrostatic_cantilever_wall() {
    let h_water: f64 = 5.0;         // m, water depth
    let gamma_w: f64 = 9.81;        // kN/m^3

    // Wall properties (reinforced concrete, per unit width)
    let wall_t: f64 = 0.30;         // m, thickness
    let e: f64 = 30_000.0;          // MPa
    let a_wall: f64 = wall_t * 1.0;
    let iz_wall: f64 = 1.0 * wall_t.powi(3) / 12.0;

    // Triangular hydrostatic load: max at base (fixed end), zero at top (free end)
    // In beam model: element 1 is at fixed end (base), element n at free end (top)
    // Load at base = gamma_w * h_water, at top = 0
    let n = 12;
    let q_max: f64 = gamma_w * h_water; // kN/m^2 at base

    let mut loads = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        // Load decreases from q_max at fixed end (x=0) to 0 at free end (x=L)
        let qi = -q_max * (1.0 - xi);
        let qj = -q_max * (1.0 - xj);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, h_water, e, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Exact: delta_tip = q_max * L^4 / (30 * E * I)
    let e_eff: f64 = e * 1000.0;
    let delta_exact: f64 = q_max * h_water.powi(4) / (30.0 * e_eff * iz_wall);

    assert_close(tip.uy.abs(), delta_exact, 0.05,
        "Hydrostatic cantilever wall tip deflection");

    // Verify base reaction moment: M_base = q_max * L^2 / 6
    let m_base_exact: f64 = q_max * h_water.powi(2) / 6.0;
    let base_reaction = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    assert_close(base_reaction.mz.abs(), m_base_exact, 0.02,
        "Hydrostatic cantilever base moment");
}

// ================================================================
// 3. Wind Buckling -- External Pressure on Thin Cylindrical Shell
// ================================================================
//
// Classical elastic buckling of thin cylindrical shells under
// uniform external pressure (wind suction):
//   p_cr = 0.92 * E * (t/D)^2.5 / (L/D)   (Donnell, short cylinders)
//   p_cr = 0.855 * E * (t/R)^2 / sqrt(1-nu^2)  (long cylinders, n=2)
//
// Wind external pressure on unstiffened tank shell.
// Model a horizontal ring segment as a curved beam approximation.

#[test]
fn tank_wind_buckling_shell() {
    let d: f64 = 12.0;              // m, tank diameter
    let r: f64 = d / 2.0;           // m, radius
    let t: f64 = 0.008;             // m, shell thickness (8mm steel)
    let h_shell: f64 = 10.0;        // m, shell height
    let e_steel: f64 = 210_000.0;   // MPa
    let nu: f64 = 0.30;

    // R/t ratio - key slenderness parameter
    let r_over_t: f64 = r / t;
    assert!(
        r_over_t > 100.0,
        "R/t = {:.0} -- thin shell regime", r_over_t
    );

    // Classical buckling pressure (Donnell for short cylinders)
    let l_over_d: f64 = h_shell / d;
    let t_over_d: f64 = t / d;
    let p_cr_donnell: f64 = 0.92 * e_steel * t_over_d.powf(2.5) / l_over_d;

    // Alternative: long cylinder formula
    let nu_factor: f64 = (1.0 - nu * nu).sqrt();
    let p_cr_long: f64 = 0.855 * e_steel * (t / r).powi(2) / nu_factor;

    // Use minimum of the two as conservative estimate
    let p_cr: f64 = p_cr_donnell.min(p_cr_long);

    assert!(
        p_cr > 0.0,
        "Critical buckling pressure: {:.4} MPa", p_cr
    );

    // Wind pressure on tank (typical: 1.0 kPa external suction)
    let p_wind: f64 = 1.5 / 1000.0; // MPa (1.5 kPa)

    // Buckling utilization
    let util: f64 = p_wind / p_cr;

    // Model a horizontal beam strip representing tank shell ring
    // Under uniform lateral load representing wind suction
    let strip_width: f64 = 1.0;     // m, vertical strip
    let a_strip: f64 = t * strip_width;
    let iz_strip: f64 = strip_width * t.powi(3) / 12.0;

    // Simply supported beam segment (chord of ring between stiffeners)
    let arc_len: f64 = std::f64::consts::PI * d / 4.0; // quarter circumference
    let q_wind: f64 = -(p_wind * 1000.0) * strip_width; // kN/m

    let n = 4;
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_wind, q_j: q_wind, a: None, b: None,
        }));
    }

    let input = make_beam(n, arc_len, e_steel, a_strip, iz_strip,
        "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Midspan deflection of strip
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    // Deflection should be positive (non-zero) under wind
    assert!(
        mid_d.uy.abs() > 0.0,
        "Shell strip deflects under wind pressure"
    );

    // Verify utilization is below 1.0 (no buckling under design wind)
    assert!(
        util < 1.0,
        "Wind buckling utilization {:.4} < 1.0", util
    );
}

// ================================================================
// 4. Ring Beam -- Horizontal Frame for Tank Ring Stiffener
// ================================================================
//
// Tank ring stiffener modeled as a horizontal frame (polygonal
// approximation of circular ring) under uniform radial load.
// For a ring under uniform radial pressure p, the hoop force
// is N = p * R and maximum bending moment is small for high n.
//
// We model this as a portal frame approximation: a rectangular
// frame representing two adjacent ring segments under lateral load.

#[test]
fn tank_ring_beam_stiffener() {
    let d_tank: f64 = 10.0;         // m, tank diameter
    let r: f64 = d_tank / 2.0;
    let p_internal: f64 = 50.0;     // kPa, internal pressure (hydrostatic)

    // Ring stiffener properties (steel angle section)
    let e: f64 = 210_000.0;         // MPa
    let a_ring: f64 = 0.003;        // m^2, cross-section area
    let iz_ring: f64 = 5.0e-6;      // m^4, moment of inertia

    // Hoop force in ring: N = p * R * h_trib
    let h_trib: f64 = 1.0;          // m, tributary height
    let n_hoop: f64 = p_internal * r * h_trib; // kN

    // Hoop stress
    let sigma_hoop: f64 = n_hoop / (a_ring * 1000.0); // MPa (a in m^2, force in kN)

    assert!(
        sigma_hoop > 0.0 && sigma_hoop < 250.0,
        "Hoop stress: {:.1} MPa", sigma_hoop
    );

    // Model ring as portal frame segment under lateral load
    // Use portal frame to verify force distribution
    let h_frame: f64 = 2.0;         // m, column height
    let w_frame: f64 = 3.0;         // m, beam span
    let lateral: f64 = p_internal * h_trib; // kN, total lateral per meter

    let input = make_portal_frame(h_frame, w_frame, e, a_ring, iz_ring,
        lateral, 0.0);
    let results = solve_2d(&input).expect("solve");

    // Base reactions should sum to applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), lateral.abs(), 0.01,
        "Ring frame horizontal equilibrium");

    // Verify moments exist at fixed bases (frame action)
    let has_base_moments = results.reactions.iter()
        .any(|r| r.mz.abs() > 1.0);
    assert!(has_base_moments, "Ring stiffener frame has base moments");
}

// ================================================================
// 5. Hopper -- Conical Section Equivalent Load on Support Ring
// ================================================================
//
// Conical hopper below silo: material weight creates meridional
// and hoop forces in the cone wall, plus a horizontal ring
// tension at the transition ring beam.
//
// Horizontal ring force: H = W / (2 * pi * R * tan(alpha))
// where W = total weight in hopper, alpha = half-angle of cone.
//
// Model the support ring as a simply supported beam under
// the equivalent vertical reaction from hopper weight.

#[test]
fn hopper_conical_section_support_ring() {
    // Hopper geometry
    let d_top: f64 = 6.0;           // m, top diameter (transition)
    let r_top: f64 = d_top / 2.0;
    let d_bot: f64 = 0.5;           // m, outlet diameter
    let alpha: f64 = 30.0_f64.to_radians(); // half-angle from vertical

    // Height of conical section
    let h_hopper: f64 = (r_top - d_bot / 2.0) / alpha.tan();

    // Stored material
    let gamma: f64 = 8.0;           // kN/m^3
    // Volume of frustum: V = (pi*h/3)*(R1^2 + R1*R2 + R2^2)
    let r_bot: f64 = d_bot / 2.0;
    let v_hopper: f64 = std::f64::consts::PI * h_hopper / 3.0
        * (r_top * r_top + r_top * r_bot + r_bot * r_bot);
    let w_material: f64 = gamma * v_hopper;

    // Horizontal ring tension at transition
    let h_ring: f64 = w_material / (2.0 * std::f64::consts::PI * r_top * alpha.tan());

    assert!(
        h_ring > 10.0,
        "Ring horizontal force: {:.1} kN/m", h_ring
    );

    // Model a beam representing a diameter of the support ring
    // under point loads from column supports
    let e: f64 = 210_000.0;         // MPa, steel
    let a_ring: f64 = 0.005;        // m^2
    let iz_ring: f64 = 1.0e-5;      // m^4

    // Two-column support: beam spanning between supports, loaded at midspan
    let span: f64 = d_top;          // m, diametral span
    let p_mid: f64 = -w_material / 4.0; // quarter of total weight per support point

    let n = 8;
    let mid_node = n / 2 + 1;
    let input = make_beam(n, span, e, a_ring, iz_ring,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: p_mid, mz: 0.0,
        })]);
    let results = solve_2d(&input).expect("solve");

    // Verify vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -p_mid, 0.01, "Hopper ring vertical equilibrium");

    // Midspan deflection: delta = P*L^3/(48*E*I)
    let e_eff: f64 = e * 1000.0;
    let delta_exact: f64 = p_mid.abs() * span.powi(3) / (48.0 * e_eff * iz_ring);
    let mid_d = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_exact, 0.02,
        "Hopper ring midspan deflection");
}

// ================================================================
// 6. Sloshing -- Fundamental Frequency in Rectangular Tank
// ================================================================
//
// Fundamental sloshing frequency (Ibrahim, 2005):
//   f = (1/(2*pi)) * sqrt(g * pi / L * tanh(pi * h / L))
// where L = tank length, h = liquid depth.
//
// We verify the analytical formula and model a tank wall strip
// under equivalent quasi-static sloshing pressure.

#[test]
fn tank_sloshing_frequency() {
    let l_tank: f64 = 10.0;         // m, tank length
    let h_liquid: f64 = 6.0;        // m, liquid depth
    let g: f64 = 9.81;              // m/s^2

    // Fundamental sloshing frequency
    let arg_tanh: f64 = std::f64::consts::PI * h_liquid / l_tank;
    let f_slosh: f64 = 1.0 / (2.0 * std::f64::consts::PI)
        * (g * std::f64::consts::PI / l_tank * arg_tanh.tanh()).sqrt();

    // For deep liquid (h/L > 0.5): tanh -> 1, f -> sqrt(g*pi/L)/(2*pi)
    let f_deep: f64 = (g * std::f64::consts::PI / l_tank).sqrt()
        / (2.0 * std::f64::consts::PI);

    // h/L = 0.6, so should be close to deep water limit
    let h_over_l: f64 = h_liquid / l_tank;
    assert!(
        h_over_l > 0.5,
        "h/L = {:.2} -- deep liquid regime", h_over_l
    );
    assert_close(f_slosh, f_deep, 0.05, "Sloshing freq near deep-water limit");

    // Sloshing wave amplitude for seismic excitation
    // delta_s = S_a / (omega_s^2) where S_a = spectral acceleration
    let omega_s: f64 = 2.0 * std::f64::consts::PI * f_slosh;
    let s_a: f64 = 0.3 * g;         // spectral acceleration at sloshing period
    let delta_s: f64 = s_a / (omega_s * omega_s);

    // Equivalent pressure on wall from sloshing: p_slosh = rho * g * delta_s
    let rho: f64 = 1000.0;          // kg/m^3, water
    let p_slosh: f64 = rho * g * delta_s / 1000.0; // kPa

    // Model wall strip under equivalent sloshing pressure (triangular, max at top)
    let e: f64 = 30_000.0;          // MPa
    let wall_t: f64 = 0.30;
    let a_wall: f64 = wall_t * 1.0;
    let iz_wall: f64 = 1.0 * wall_t.powi(3) / 12.0;

    let n = 8;
    let mut loads = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        // Sloshing pressure: max at free surface (tip), zero at base (fixed)
        // Increases from fixed end to free end
        let qi = -p_slosh * xi;
        let qj = -p_slosh * xj;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, h_liquid, e, a_wall, iz_wall, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Tip should deflect under sloshing pressure
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(
        tip.uy.abs() > 0.0,
        "Sloshing causes wall deflection"
    );

    // Sloshing period should be reasonable (typically 2-10 seconds for tanks)
    let t_slosh: f64 = 1.0 / f_slosh;
    assert!(
        t_slosh > 1.0 && t_slosh < 15.0,
        "Sloshing period: {:.2} s", t_slosh
    );
}

// ================================================================
// 7. Foundation Ring -- Annular Ring Beam Under Column Loads
// ================================================================
//
// Large storage tanks often sit on an annular ring foundation.
// The ring beam carries concentrated column loads from the tank
// shell and distributes them to the foundation soil.
//
// Model as a continuous beam with multiple supports representing
// piles or soil springs, loaded by tank shell self-weight.

#[test]
fn tank_foundation_ring_beam() {
    // Ring beam properties
    let d_tank: f64 = 15.0;         // m, tank diameter
    let _r_tank: f64 = d_tank / 2.0;

    // Ring beam cross-section (concrete)
    let e: f64 = 30_000.0;          // MPa
    let b_ring: f64 = 0.60;         // m, width
    let h_ring: f64 = 0.80;         // m, depth
    let a_ring: f64 = b_ring * h_ring;
    let iz_ring: f64 = b_ring * h_ring.powi(3) / 12.0;

    // Tank shell weight (uniformly distributed around circumference)
    // Total shell weight: pi * D * H * t * gamma_steel
    let h_tank: f64 = 12.0;         // m, tank height
    let t_shell: f64 = 0.010;       // m, shell thickness
    let gamma_steel: f64 = 78.5;    // kN/m^3
    let w_shell_total: f64 = std::f64::consts::PI * d_tank * h_tank * t_shell * gamma_steel;

    // Model a straight beam representing a chord of the ring
    // (half the circumference, supported at three points)
    let half_circ: f64 = std::f64::consts::PI * d_tank / 2.0;
    let w_per_m: f64 = w_shell_total / (std::f64::consts::PI * d_tank); // kN/m

    // Three-span continuous beam (4 supports)
    let n_per_span = 4;
    let n_spans = 3;
    let _span: f64 = half_circ / n_spans as f64;
    let total_n = n_per_span * n_spans;

    // Build nodes along the beam
    let elem_len: f64 = half_circ / total_n as f64;
    let mut nodes = Vec::new();
    for i in 0..=total_n {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..total_n {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    // Supports at each span boundary
    let mut sups = vec![(1, 1, "pinned")];
    for s in 1..=n_spans {
        let node = s * n_per_span + 1;
        sups.push((s + 1, node, "rollerX"));
    }

    // Uniform distributed load on all elements
    let mut loads = Vec::new();
    for i in 0..total_n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -w_per_m, q_j: -w_per_m, a: None, b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, e, 0.2)], vec![(1, a_ring, iz_ring)],
        elems, sups, loads);
    let results = solve_2d(&input).expect("solve");

    // Global vertical equilibrium: sum of reactions = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load: f64 = w_per_m * half_circ;
    assert_close(sum_ry, total_load, 0.02,
        "Foundation ring vertical equilibrium");

    // Interior support reactions should be larger than end reactions
    // (continuous beam effect)
    let end_ry: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let interior_ry: f64 = results.reactions.iter()
        .find(|r| r.node_id == n_per_span + 1).unwrap().ry;
    assert!(
        interior_ry.abs() > end_ry.abs(),
        "Interior reaction {:.2} > end reaction {:.2}",
        interior_ry.abs(), end_ry.abs()
    );
}

// ================================================================
// 8. Combined Load -- Hydrostatic + Wind on Tank Wall Section
// ================================================================
//
// Tank wall experiences both hydrostatic pressure (inside) and
// wind suction (outside). The combined loading is more severe
// than either alone. Model as a propped cantilever (fixed at base,
// roller at top ring) under superimposed loading.

#[test]
fn tank_combined_hydrostatic_wind() {
    let h_wall: f64 = 8.0;          // m, wall height
    let gamma_w: f64 = 9.81;        // kN/m^3

    // Wall properties (steel plate, per unit width)
    let t_wall: f64 = 0.012;        // m, 12mm steel plate
    let e: f64 = 210_000.0;         // MPa
    let a_wall: f64 = t_wall * 1.0;
    let iz_wall: f64 = 1.0 * t_wall.powi(3) / 12.0;

    // Load case 1: Hydrostatic only (triangular, max at base)
    let q_hydro_max: f64 = gamma_w * h_wall; // kPa at base
    let n = 16;

    let mut loads_hydro = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        // Fixed end = base = max pressure, decreasing toward top
        let qi = -q_hydro_max * (1.0 - xi);
        let qj = -q_hydro_max * (1.0 - xj);
        loads_hydro.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input_hydro = make_beam(n, h_wall, e, a_wall, iz_wall,
        "fixed", Some("rollerX"), loads_hydro);
    let results_hydro = solve_2d(&input_hydro).expect("solve hydrostatic");

    // Load case 2: Wind suction only (uniform external, same direction as hydrostatic)
    let q_wind: f64 = -1.2;         // kPa, external suction (adds to hydrostatic outward)
    let mut loads_wind = Vec::new();
    for i in 0..n {
        loads_wind.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_wind, q_j: q_wind, a: None, b: None,
        }));
    }

    let input_wind = make_beam(n, h_wall, e, a_wall, iz_wall,
        "fixed", Some("rollerX"), loads_wind);
    let results_wind = solve_2d(&input_wind).expect("solve wind");

    // Load case 3: Combined hydrostatic + wind
    let mut loads_combined = Vec::new();
    for i in 0..n {
        let xi: f64 = i as f64 / n as f64;
        let xj: f64 = (i + 1) as f64 / n as f64;
        let qi = -q_hydro_max * (1.0 - xi) + q_wind;
        let qj = -q_hydro_max * (1.0 - xj) + q_wind;
        loads_combined.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input_combined = make_beam(n, h_wall, e, a_wall, iz_wall,
        "fixed", Some("rollerX"), loads_combined);
    let results_combined = solve_2d(&input_combined).expect("solve combined");

    // Superposition: combined deflection = hydrostatic + wind deflections
    // (linear analysis)
    let max_defl_hydro: f64 = results_hydro.displacements.iter()
        .map(|d| d.uy.abs()).fold(0.0_f64, f64::max);
    let max_defl_wind: f64 = results_wind.displacements.iter()
        .map(|d| d.uy.abs()).fold(0.0_f64, f64::max);
    let max_defl_combined: f64 = results_combined.displacements.iter()
        .map(|d| d.uy.abs()).fold(0.0_f64, f64::max);

    // Combined should be greater than either individual case
    assert!(
        max_defl_combined > max_defl_hydro,
        "Combined {:.6e} > hydrostatic {:.6e}",
        max_defl_combined, max_defl_hydro
    );
    assert!(
        max_defl_combined > max_defl_wind,
        "Combined {:.6e} > wind {:.6e}",
        max_defl_combined, max_defl_wind
    );

    // Verify superposition principle (linear analysis)
    // Find node with max deflection in combined case and check superposition there
    let max_node_combined = results_combined.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();
    let node_id = max_node_combined.node_id;

    let uy_hydro = results_hydro.displacements.iter()
        .find(|d| d.node_id == node_id).unwrap().uy;
    let uy_wind = results_wind.displacements.iter()
        .find(|d| d.node_id == node_id).unwrap().uy;
    let uy_combined = max_node_combined.uy;
    let uy_superposed: f64 = uy_hydro + uy_wind;

    assert_close(uy_combined, uy_superposed, 0.01,
        "Superposition principle: combined vs sum of individual");

    // Base moment for combined case should exceed individual cases
    let m_base_combined: f64 = results_combined.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_base_hydro: f64 = results_hydro.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert!(
        m_base_combined > m_base_hydro,
        "Combined base moment {:.2} > hydrostatic base moment {:.2}",
        m_base_combined, m_base_hydro
    );
}
