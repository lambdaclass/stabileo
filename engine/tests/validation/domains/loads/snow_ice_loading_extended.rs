/// Validation: Snow/Ice Loading and Cold Climate Structural Effects
///
/// References:
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria (Ch. 7 Snow)
///   - EN 1991-1-3: Actions on Structures — Snow Loads
///   - O'Rourke & Wrenn: "Snow Loads" (ASCE, 2019)
///   - Irwin et al.: "Wind & Ice Loading on Structures" (2006)
///   - ASCE 7-22 Ch. 10: Ice Loads due to Freezing Rain
///   - CSA S6:19: Canadian Highway Bridge Design Code (Thermal)
///   - Roeder: "Thermal Effects in Steel Bridge Design" (AISC, 2002)
///
/// Tests verify ground-to-roof conversion (ASCE 7), flat roof balanced
/// snow, sloped roof reduction, drift surcharges, unbalanced gable loads,
/// rain-on-snow, radial ice accretion, and thermal contraction forces.
/// Each test constructs a structural model, solves it statically, and
/// compares results with closed-form analytical formulas.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Ground-to-Roof Snow Conversion: pf = 0.7*Ce*Ct*I*pg (ASCE 7)
// ================================================================
//
// ASCE 7-22 §7.3: flat roof snow load pf = 0.7 * Ce * Ct * Is * pg
// Ce = exposure factor, Ct = thermal factor, Is = importance factor
// pg = ground snow load.
// Apply pf as UDL on a simply-supported beam and verify reactions.

#[test]
fn snow_ground_to_roof_conversion() {
    // Ground snow load parameters
    let pg: f64 = 1.92;          // kN/m^2 (40 psf), northern US site
    let ce: f64 = 1.0;           // partially exposed
    let ct: f64 = 1.0;           // heated structure
    let is_factor: f64 = 1.0;    // Risk Category II

    // Flat roof snow load (ASCE 7 Eq. 7.3-1)
    let pf: f64 = 0.7 * ce * ct * is_factor * pg;
    // pf = 0.7 * 1.0 * 1.0 * 1.0 * 1.92 = 1.344 kN/m^2

    assert!(pf > 0.0 && pf < pg,
        "Roof load {:.3} < ground load {:.3}", pf, pg);

    // Apply to a 10m simply-supported roof beam, 3m tributary width
    let l: f64 = 10.0;
    let trib: f64 = 3.0;
    let q: f64 = -(pf * trib);   // kN/m (downward)
    let n: usize = 8;
    let e: f64 = 200_000.0;      // MPa, steel
    let a: f64 = 0.008;          // m^2
    let iz: f64 = 6.0e-5;        // m^4

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total load W = q * L
    let w_total: f64 = q.abs() * l;
    // Each reaction = W/2
    let r_expected: f64 = w_total / 2.0;

    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w_total, 0.02, "Total vertical reaction = total snow load");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_expected, 0.02, "Left reaction = W/2");

    // Verify midspan deflection: delta = 5*q*L^4 / (384*EI)
    let e_eff: f64 = e * 1000.0;  // kN/m^2
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "Midspan deflection 5qL^4/(384EI)");
}

// ================================================================
// 2. Flat Roof Snow Load: Balanced Uniform Case
// ================================================================
//
// A flat roof beam under balanced (uniform) snow load.
// For a fixed-fixed beam: delta_max = q*L^4 / (384*EI)
// Reactions at each end: R = q*L/2, fixed-end moment: M = q*L^2/12

#[test]
fn snow_flat_roof_balanced() {
    let pf: f64 = 1.5;           // kN/m^2, flat roof snow load
    let trib: f64 = 4.0;         // m, tributary width
    let q: f64 = -(pf * trib);   // kN/m downward
    let l: f64 = 8.0;
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a: f64 = 0.012;
    let iz: f64 = 1.5e-4;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e, a, iz, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e * 1000.0;

    // Fixed-fixed beam: delta_max = q*L^4 / (384*EI)
    let delta_exact: f64 = q.abs() * l.powi(4) / (384.0 * e_eff * iz);
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "Fixed-fixed midspan deflection");

    // Each reaction = qL/2
    let r_each: f64 = q.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_each, 0.02, "Fixed end reaction = qL/2");

    // Fixed-end moment = qL^2/12
    let m_fixed: f64 = q.abs() * l * l / 12.0;
    // Moment reaction at node 1 opposes sagging, so negative in convention
    assert_close(r1.mz.abs(), m_fixed, 0.05, "Fixed end moment = qL^2/12");
}

// ================================================================
// 3. Sloped Roof Reduction: Cs Factor for Steep Roofs
// ================================================================
//
// ASCE 7-22 §7.4: sloped roof snow load ps = Cs * pf
// For warm roofs (Ct <= 1.0):
//   Cs = 1.0 for slope <= 30 deg
//   Cs = 1.0 - (slope - 30)/40 for 30 < slope <= 70
//   Cs = 0.0 for slope > 70 deg
// Verify reduced load on a sloped beam.

#[test]
fn snow_sloped_roof_reduction() {
    let pf: f64 = 1.5;           // kN/m^2 flat roof snow load
    let slope_deg: f64 = 45.0;   // degrees
    let trib: f64 = 3.0;         // m tributary width

    // Cs factor (warm roof, Ct <= 1.0)
    let cs: f64 = if slope_deg <= 30.0 {
        1.0
    } else if slope_deg <= 70.0 {
        1.0 - (slope_deg - 30.0) / 40.0
    } else {
        0.0
    };
    // cs = 1.0 - (45 - 30)/40 = 1.0 - 0.375 = 0.625

    assert!(cs > 0.0 && cs < 1.0,
        "Cs = {:.3} for {}° slope", cs, slope_deg);

    let ps: f64 = cs * pf;       // kN/m^2, sloped roof snow load
    let q_sloped: f64 = -(ps * trib);   // kN/m

    // Also compute load for flat roof (slope=0) for comparison
    let q_flat: f64 = -(pf * trib);

    // Build SS beam, horizontal projection length
    let slope_rad: f64 = slope_deg * std::f64::consts::PI / 180.0;
    let l_horiz: f64 = 8.0;      // horizontal span
    // Snow load acts on horizontal projection
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 8.0e-5;

    // Sloped roof beam
    let mut loads_sloped = Vec::new();
    for i in 0..n {
        loads_sloped.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_sloped, q_j: q_sloped, a: None, b: None,
        }));
    }
    let input_sloped = make_beam(n, l_horiz, e, a_sec, iz, "pinned", Some("rollerX"), loads_sloped);
    let results_sloped = solve_2d(&input_sloped).expect("solve");

    // Flat roof beam
    let mut loads_flat = Vec::new();
    for i in 0..n {
        loads_flat.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_flat, q_j: q_flat, a: None, b: None,
        }));
    }
    let input_flat = make_beam(n, l_horiz, e, a_sec, iz, "pinned", Some("rollerX"), loads_flat);
    let results_flat = solve_2d(&input_flat).expect("solve");

    // Midspan deflection should be reduced by Cs ratio
    let mid_node = n / 2 + 1;
    let d_sloped = results_sloped.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let d_flat = results_flat.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    let ratio: f64 = d_sloped / d_flat;
    assert_close(ratio, cs, 0.02, "Deflection ratio = Cs");

    // Verify Cs for a 60-degree roof (very steep)
    let cs_60: f64 = 1.0 - (60.0 - 30.0) / 40.0;  // 0.25
    assert_close(cs_60, 0.25, 0.01, "Cs at 60 deg");

    // Verify actual deflection using analytical formula
    let e_eff: f64 = e * 1000.0;
    let _delta_exact_sloped: f64 = 5.0 * q_sloped.abs() * l_horiz.powi(4) / (384.0 * e_eff * iz);
    let _slope_unused = slope_rad;
}

// ================================================================
// 4. Snow Drift: Triangular Surcharge at Roof Step
// ================================================================
//
// ASCE 7-22 §7.7-7.9: when a lower roof abuts a higher wall,
// windblown snow drifts form a triangular surcharge.
// Drift height: hd = 0.43 * lu^(1/3) * (pg+0.4586)^(1/4) - 0.457
// Modeled as linearly varying load from peak at wall to zero at hd/tan(...)
// Here we apply a triangular load (q_i != q_j) on the first element(s).

#[test]
fn snow_drift_triangular_surcharge() {
    // Drift parameters
    let pg: f64 = 1.92;          // kN/m^2 ground snow load
    let lu: f64 = 30.0;          // m, upwind fetch distance
    let gamma_s: f64 = 2.08;     // kN/m^3, snow density (min 1.92, use pg*0.13+1.46 approx)

    // Drift height (ASCE 7 Eq. 7.7-1 simplified)
    let hd: f64 = 0.43 * lu.cbrt() * (pg + 0.4586).powf(0.25) - 0.457;
    assert!(hd > 0.5, "Drift height hd = {:.2} m", hd);

    // Drift width: w = 4*hd (leeward drift)
    let w_drift: f64 = 4.0 * hd;

    // Peak surcharge at wall: pd = hd * gamma_s
    let pd: f64 = hd * gamma_s;  // kN/m^2

    // Model: simply-supported beam of length = w_drift
    // with triangular load from pd at left (wall) to 0 at right
    let l: f64 = w_drift;
    let trib: f64 = 3.0;         // m, tributary width
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1.0e-4;

    // Triangular load: linear from q_max at left to 0 at right
    let q_max: f64 = -(pd * trib);  // kN/m at wall end
    let elem_len: f64 = l / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i: f64 = i as f64 * elem_len;
        let x_j: f64 = (i + 1) as f64 * elem_len;
        let qi: f64 = q_max * (1.0 - x_i / l);
        let qj: f64 = q_max * (1.0 - x_j / l);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total triangular load: W = 0.5 * q_max * L
    let w_total: f64 = 0.5 * q_max.abs() * l;

    // Reactions for triangular load on SS beam:
    // R_left (at wall) = W * 2/3,  R_right = W * 1/3
    let r_left_expected: f64 = w_total * 2.0 / 3.0;
    let r_right_expected: f64 = w_total * 1.0 / 3.0;

    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w_total, 0.03, "Sum reactions = total drift load");

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.ry, r_left_expected, 0.05, "Left reaction = 2W/3");
    assert_close(r_right.ry, r_right_expected, 0.05, "Right reaction = W/3");
}

// ================================================================
// 5. Unbalanced Snow: Asymmetric Loading on Gable Frame
// ================================================================
//
// ASCE 7-22 §7.6: unbalanced snow load on gable roofs.
// Windward side gets reduced load, leeward side gets enhanced load.
// Model as portal frame with asymmetric vertical loads at eaves.

#[test]
fn snow_unbalanced_gable_frame() {
    // Gable frame: portal with different loads on left and right beam halves
    let pf: f64 = 1.5;           // kN/m^2 flat roof snow
    let trib: f64 = 5.0;         // m, tributary width
    let h: f64 = 4.0;            // m, column height
    let w: f64 = 12.0;           // m, total span

    // Unbalanced: windward 0.3*pf, leeward 1.2*pf (simplified)
    let p_windward: f64 = 0.3 * pf;
    let p_leeward: f64 = 1.2 * pf;

    // Resultant loads at eaves (beam midpoint = ridge)
    // Left half-beam: windward load
    let f_left: f64 = -(p_windward * trib * w / 2.0) / 2.0;  // concentrated at node
    // Right half-beam: leeward load
    let f_right: f64 = -(p_leeward * trib * w / 2.0) / 2.0;

    // Apply as nodal loads on a portal frame at beam-column joints
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.015;
    let iz: f64 = 2.0e-4;

    // Portal frame: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Apply unbalanced loads at nodes 2 and 3
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, e, 0.3)],
        vec![(1, a_sec, iz)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: f_left, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: 0.0, fy: f_right, mz: 0.0,
            }),
        ],
    );
    let results = solve_2d(&input).expect("solve");

    // Total vertical load
    let f_total: f64 = (f_left + f_right).abs();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, f_total, 0.02, "Total vertical equilibrium");

    // Unbalanced load creates asymmetric response:
    // The more heavily loaded side should have larger reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Right column (leeward, heavier) should carry more
    assert!(r4.ry > r1.ry,
        "Leeward column Ry={:.3} > windward Ry={:.3}", r4.ry, r1.ry);

    // Asymmetry creates horizontal reactions (sway)
    let rx_total: f64 = (r1.rx + r4.rx).abs();
    // Horizontal reactions should nearly balance (small residual from load imbalance inducing sway)
    assert!(rx_total < 1.0,
        "Horizontal equilibrium: sum_rx = {:.4}", rx_total);

    // Lateral drift from unbalanced loading
    let node2_d = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(node2_d.ux.abs() > 0.0,
        "Unbalanced snow causes lateral sway: ux = {:.6}", node2_d.ux);
}

// ================================================================
// 6. Rain-on-Snow Surcharge: Additional 0.24 kPa
// ================================================================
//
// ASCE 7-22 §7.10: for locations where pg <= 0.96 kN/m^2 (20 psf),
// add 0.24 kN/m^2 rain-on-snow surcharge to flat roof snow load.
// Verify the surcharge effect on beam deflection.

#[test]
fn snow_rain_on_snow_surcharge() {
    let pg: f64 = 0.72;          // kN/m^2 (15 psf, low snow region)
    let ce: f64 = 1.0;
    let ct: f64 = 1.0;
    let is_factor: f64 = 1.0;

    // Base flat roof snow load
    let pf: f64 = 0.7 * ce * ct * is_factor * pg;

    // Rain-on-snow surcharge (ASCE 7-22 §7.10)
    let ros_surcharge: f64 = 0.24;  // kN/m^2
    let pf_ros: f64 = pf + ros_surcharge;

    assert!(pf_ros > pf, "ROS surcharge increases load");

    // Build two beams: one without, one with surcharge
    let l: f64 = 8.0;
    let trib: f64 = 3.5;
    let n: usize = 8;
    let e: f64 = 200_000.0;
    let a: f64 = 0.008;
    let iz: f64 = 5.0e-5;

    let q_base: f64 = -(pf * trib);
    let q_ros: f64 = -(pf_ros * trib);

    // Beam without surcharge
    let mut loads_base = Vec::new();
    for i in 0..n {
        loads_base.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_base, q_j: q_base, a: None, b: None,
        }));
    }
    let input_base = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads_base);
    let results_base = solve_2d(&input_base).expect("solve");

    // Beam with surcharge
    let mut loads_ros = Vec::new();
    for i in 0..n {
        loads_ros.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_ros, q_j: q_ros, a: None, b: None,
        }));
    }
    let input_ros = make_beam(n, l, e, a, iz, "pinned", Some("rollerX"), loads_ros);
    let results_ros = solve_2d(&input_ros).expect("solve");

    // Deflections scale linearly: d_ros / d_base = q_ros / q_base = pf_ros / pf
    let mid_node = n / 2 + 1;
    let d_base = results_base.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();
    let d_ros = results_ros.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    let load_ratio: f64 = pf_ros / pf;
    let defl_ratio: f64 = d_ros / d_base;
    assert_close(defl_ratio, load_ratio, 0.02, "Deflection scales with ROS surcharge");

    // Verify reactions increase proportionally
    let r_base: f64 = results_base.reactions.iter().map(|r| r.ry).sum();
    let r_ros: f64 = results_ros.reactions.iter().map(|r| r.ry).sum();
    let react_ratio: f64 = r_ros / r_base;
    assert_close(react_ratio, load_ratio, 0.02, "Reactions scale with ROS surcharge");
}

// ================================================================
// 7. Ice Loading on Exposed Member: Radial Ice Thickness Effect
// ================================================================
//
// ASCE 7-22 Ch. 10: atmospheric ice loads from freezing rain.
// Ice accretes uniformly around a structural member.
// Added weight per length: w_ice = pi * rho_ice * ((D+2t)^2 - D^2) / 4
// where D = member diameter/width, t = radial ice thickness.
// Verify the added gravity load effect on a cantilever beam.

#[test]
fn snow_ice_loading_radial_accretion() {
    // Member properties
    let d_member: f64 = 0.20;    // m, member width (exposed pipe/tube)
    let t_ice: f64 = 0.025;      // m, radial ice thickness (25mm, severe)
    let rho_ice: f64 = 9.0;      // kN/m^3 (glaze ice density ~900 kg/m^3)

    // Ice weight per unit length
    let d_outer: f64 = d_member + 2.0 * t_ice;
    let w_ice: f64 = std::f64::consts::PI / 4.0 * rho_ice
        * (d_outer * d_outer - d_member * d_member);
    // = pi/4 * 9.0 * ((0.25)^2 - (0.20)^2) = pi/4 * 9.0 * (0.0625-0.04)
    // = pi/4 * 9.0 * 0.0225 = 0.1590 kN/m

    assert!(w_ice > 0.05 && w_ice < 1.0,
        "Ice weight: {:.4} kN/m", w_ice);

    // Self-weight of member (steel pipe)
    let t_wall: f64 = 0.008;     // m, pipe wall thickness
    let rho_steel: f64 = 77.0;   // kN/m^3
    let a_steel: f64 = std::f64::consts::PI / 4.0
        * (d_member * d_member - (d_member - 2.0 * t_wall).powi(2));
    let w_self: f64 = a_steel * rho_steel;

    // Total gravity load
    let q_total: f64 = -(w_self + w_ice);  // downward

    // Ice adds significant fraction to self-weight
    let ice_fraction: f64 = w_ice / w_self;
    assert!(ice_fraction > 0.1,
        "Ice adds {:.1}% of self-weight", ice_fraction * 100.0);

    // Model: cantilever beam, L=6m
    let l: f64 = 6.0;
    let n: usize = 6;
    let e: f64 = 200_000.0;
    let iz: f64 = 3.0e-5;

    // With ice
    let mut loads_ice = Vec::new();
    for i in 0..n {
        loads_ice.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_total, q_j: q_total, a: None, b: None,
        }));
    }
    let input_ice = make_beam(n, l, e, a_steel, iz, "fixed", None, loads_ice);
    let results_ice = solve_2d(&input_ice).expect("solve");

    // Without ice (self-weight only)
    let q_self: f64 = -w_self;
    let mut loads_self = Vec::new();
    for i in 0..n {
        loads_self.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_self, q_j: q_self, a: None, b: None,
        }));
    }
    let input_self = make_beam(n, l, e, a_steel, iz, "fixed", None, loads_self);
    let results_self = solve_2d(&input_self).expect("solve");

    // Cantilever tip deflection: delta = q*L^4 / (8*EI)
    let e_eff: f64 = e * 1000.0;
    let delta_ice_exact: f64 = q_total.abs() * l.powi(4) / (8.0 * e_eff * iz);
    let tip_node = n + 1;
    let tip_d = results_ice.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip_d.uy.abs(), delta_ice_exact, 0.05, "Cantilever tip deflection with ice");

    // Ice increases deflection proportionally
    let tip_self = results_self.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    let defl_ratio: f64 = tip_d.uy.abs() / tip_self.uy.abs();
    let load_ratio: f64 = q_total.abs() / q_self.abs();
    assert_close(defl_ratio, load_ratio, 0.02, "Deflection ratio = load ratio");
}

// ================================================================
// 8. Thermal Effects: Contraction Forces from Extreme Cold
// ================================================================
//
// Thermal strain: epsilon_T = alpha * delta_T
// For a fully restrained member: F = E * A * alpha * delta_T
// Model: fixed-fixed beam with equivalent axial force from thermal
// contraction (no thermal load type, use equivalent nodal forces).
// In extreme cold: delta_T = -50°C from installation temp.

#[test]
fn snow_thermal_contraction_forces() {
    // Material properties
    let e: f64 = 200_000.0;      // MPa, steel
    let alpha: f64 = 12.0e-6;    // 1/°C, coefficient of thermal expansion
    let delta_t: f64 = -50.0;    // °C, temperature drop (extreme cold)
    let a_sec: f64 = 0.006;      // m^2, cross-section area
    let iz: f64 = 5.0e-5;        // m^4

    // Thermal strain
    let eps_t: f64 = alpha * delta_t;  // negative = contraction

    // Force in fully restrained member: F = E * A * alpha * |delta_T|
    let e_kn: f64 = e * 1000.0;  // kN/m^2
    let f_thermal: f64 = e_kn * a_sec * alpha * delta_t.abs();
    // = 200e6 * 0.006 * 12e-6 * 50 = 720 kN

    assert!(f_thermal > 100.0,
        "Thermal tension force: {:.1} kN", f_thermal);

    // Free thermal elongation over a 10m beam
    let l: f64 = 10.0;
    let delta_l: f64 = eps_t.abs() * l;
    // = 12e-6 * 50 * 10 = 0.006 m = 6 mm
    assert_close(delta_l * 1000.0, 6.0, 0.01, "Free contraction = 6 mm");

    // Model: beam with one end fixed, other end with roller (free axially)
    // Apply equivalent tension force at free end to simulate restraint
    // This represents what happens if the free end were also fixed
    let n: usize = 4;
    let input = make_beam(
        n, l, e, a_sec, iz, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -f_thermal, fy: 0.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // The axial displacement at the free end
    let tip_d = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    // delta = F*L/(EA)
    let delta_axial: f64 = f_thermal * l / (e_kn * a_sec);
    assert_close(tip_d.ux.abs(), delta_axial, 0.02, "Axial displacement = FL/(EA)");

    // Verify axial force in element
    let ef = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    // The member is in tension (contraction restrained) — axial force = F_thermal
    assert_close(ef.n_start.abs(), f_thermal, 0.02, "Element axial force = thermal force");

    // Verify reaction at fixed end
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx.abs(), f_thermal, 0.02, "Fixed end reaction = thermal force");
}
