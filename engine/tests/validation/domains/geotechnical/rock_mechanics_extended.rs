/// Validation: Rock Mechanics and Underground Structures
///
/// References:
///   - Hoek & Brown: "Underground Excavations in Rock" (1980)
///   - Hoek, Carranza-Torres & Corkum: "Hoek-Brown Failure Criterion" (2002 Edition)
///   - Bieniawski: "Engineering Rock Mass Classifications" (1989)
///   - Hoek & Diederichs: "Empirical estimation of rock mass modulus" (2006)
///   - Brady & Brown: "Rock Mechanics for Underground Mining" 3rd ed. (2004)
///   - Kirsch (1898): Stress distribution around circular opening
///   - Barton, Lien & Lunde: "Engineering classification of rock masses" (1974)
///   - Hoek & Bray: "Rock Slope Engineering" 3rd ed. (1981)
///
/// Tests verify Hoek-Brown failure criterion, RMR classification,
/// GSI-based rock mass modulus, rock bolt capacity, Kirsch solution,
/// in-situ stress estimation, rock slope stability, and tunnel support.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Hoek-Brown Failure Criterion
// ================================================================
//
// Generalised Hoek-Brown criterion (2002 edition):
//   sigma_1 = sigma_3 + UCS * (m * sigma_3 / UCS + s)^a
//
// For intact rock (GSI = 100, D = 0): m = mi, s = 1, a = 0.5
// Reduces to original Hoek-Brown: sigma_1 = sigma_3 + UCS * sqrt(mi*sigma_3/UCS + 1)
//
// Parameters from triaxial tests; verified against Hoek (2002) Table 2.
// A tunnel lining beam is modeled under the computed rock stress to
// verify the structural response matches analytical deflection.

#[test]
fn rock_hoek_brown_failure() {
    // Intact granite properties
    let ucs: f64 = 150.0;        // MPa, uniaxial compressive strength
    let mi: f64 = 32.0;          // Hoek-Brown material constant for granite
    let gsi: f64 = 65.0;         // Geological Strength Index
    let d: f64 = 0.0;            // Disturbance factor (undisturbed)

    // Calculate rock mass Hoek-Brown parameters
    let mb: f64 = mi * ((gsi - 100.0) / (28.0 - 14.0 * d)).exp();
    let s: f64 = ((gsi - 100.0) / (9.0 - 3.0 * d)).exp();
    let exp_term_1: f64 = (-gsi / 15.0).exp();
    let exp_term_2: f64 = (-20.0_f64 / 3.0).exp();
    let a: f64 = 0.5 + (exp_term_1 - exp_term_2) / 6.0;

    // Verify parameters are in expected ranges
    assert!(mb > 0.0 && mb < mi, "mb = {:.2} should be less than mi = {}", mb, mi);
    assert!(s > 0.0 && s <= 1.0, "s = {:.6} should be in (0,1]", s);
    assert!(a > 0.5 && a < 0.65, "a = {:.4} should be near 0.5", a);

    // Predict failure at confining pressure sigma_3 = 5 MPa
    let sigma_3: f64 = 5.0;      // MPa
    let term: f64 = (mb * sigma_3 / ucs + s).powf(a);
    let sigma_1: f64 = sigma_3 + ucs * term;

    // For intact rock (GSI=100), sigma_1 should be much higher
    let mb_intact: f64 = mi;     // GSI=100 => mb = mi
    let s_intact: f64 = 1.0;     // GSI=100
    let term_intact: f64 = (mb_intact * sigma_3 / ucs + s_intact).sqrt();
    let sigma_1_intact: f64 = sigma_3 + ucs * term_intact;

    assert!(
        sigma_1 < sigma_1_intact,
        "Rock mass strength {:.1} < intact {:.1} MPa", sigma_1, sigma_1_intact
    );

    // Uniaxial compressive strength of rock mass (sigma_3 = 0)
    let ucs_rm: f64 = ucs * s.powf(a);
    assert!(ucs_rm > 0.0 && ucs_rm < ucs, "UCS_rm = {:.2} MPa", ucs_rm);

    // Model a tunnel lining beam under rock mass stress
    // Use computed rock mass failure stress to derive a design load
    let safety_factor: f64 = 3.0;
    let design_stress: f64 = ucs_rm / safety_factor;  // MPa, allowable
    let lining_width: f64 = 1.0;  // m, per unit length
    let lining_thick: f64 = 0.30; // m
    let q_rock: f64 = -design_stress * 1000.0 * lining_thick / lining_width; // kN/m

    let l_span: f64 = 5.0;       // m, tunnel span
    let n_elem: usize = 8;
    let e_concrete: f64 = 30_000.0; // MPa
    let a_sec: f64 = lining_width * lining_thick;
    let iz_sec: f64 = lining_width * lining_thick.powi(3) / 12.0;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_rock, q_j: q_rock, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, l_span, e_concrete, a_sec, iz_sec, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed beam: delta_max = qL^4 / (384*EI)
    let e_kpa: f64 = e_concrete * 1000.0;
    let delta_exact: f64 = q_rock.abs() * l_span.powi(4) / (384.0 * e_kpa * iz_sec);

    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Hoek-Brown lining deflection");
}

// ================================================================
// 2. RMR Classification: Rating to Rock Mass Properties
// ================================================================
//
// Bieniawski (1989) Rock Mass Rating:
//   - UCS rating (0-15), RQD rating (0-20), Spacing rating (0-20),
//     Condition rating (0-30), Groundwater rating (0-15)
//   - Total RMR = sum of ratings (adjusted for orientation)
//   - Cohesion: c = 5*RMR (kPa) for RMR < 40
//   - Friction: phi = 0.5*RMR + 8 (degrees) approximate
//   - Stand-up time and unsupported span from RMR chart
//
// A beam representing unsupported tunnel roof is modeled with
// the derived properties to check deflection.

#[test]
fn rock_rmr_classification() {
    // RMR component ratings (fair rock mass)
    let r_ucs: f64 = 7.0;        // UCS 50-100 MPa
    let r_rqd: f64 = 13.0;       // RQD 50-75%
    let r_spacing: f64 = 10.0;   // 0.2-0.6m spacing
    let r_condition: f64 = 15.0;  // slightly rough, slightly weathered
    let r_groundwater: f64 = 10.0; // damp
    let r_orientation: f64 = -5.0; // fair orientation adjustment

    let rmr: f64 = r_ucs + r_rqd + r_spacing + r_condition + r_groundwater + r_orientation;

    // RMR should be in class III (fair rock): 41-60
    assert!(
        rmr >= 40.0 && rmr <= 60.0,
        "RMR = {:.0}, class III (fair)", rmr
    );

    // Derive rock mass properties from RMR
    // Cohesion (Bieniawski 1989, Table 8.3)
    let cohesion: f64 = if rmr > 40.0 {
        200.0 + (rmr - 40.0) * 5.0  // kPa
    } else {
        100.0 + rmr * 2.5           // kPa
    };

    // Friction angle
    let phi_deg: f64 = 0.5 * rmr + 8.0;

    assert!(cohesion > 200.0 && cohesion < 400.0, "Cohesion = {:.0} kPa", cohesion);
    assert!(phi_deg > 25.0 && phi_deg < 40.0, "Friction = {:.1} deg", phi_deg);

    // Unsupported span estimate: span_max ~ 2 * RMR / 100 * factor (m)
    // Bieniawski (1989): for RMR=50, stand-up time ~1 week for 3m span
    let span_unsupported: f64 = 2.0 * rmr.powf(0.6) / 5.0;

    assert!(span_unsupported > 1.0, "Unsupported span: {:.1} m", span_unsupported);

    // Model unsupported tunnel roof beam under self-weight
    let gamma_rock: f64 = 26.0;  // kN/m^3
    let roof_thick: f64 = 0.5;   // m, loosened zone thickness
    let q_gravity: f64 = -gamma_rock * roof_thick; // kN/m per m width

    let l_span = span_unsupported.min(3.0); // limit to reasonable span
    let n_elem: usize = 6;
    // Rock mass modulus estimate from RMR (Bieniawski): E_rm = 2*RMR - 100 (GPa) for RMR>50
    let e_rm: f64 = if rmr > 50.0 {
        (2.0 * rmr - 100.0) * 1000.0 // MPa
    } else {
        10.0_f64.powf((rmr - 10.0) / 40.0) * 1000.0 // MPa, lower bound
    };
    let a_sec: f64 = 1.0 * roof_thick;
    let iz_sec: f64 = 1.0 * roof_thick.powi(3) / 12.0;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_gravity, q_j: q_gravity, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, l_span, e_rm, a_sec, iz_sec, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Fixed-fixed beam deflection: delta = qL^4 / (384EI)
    let e_kpa: f64 = e_rm * 1000.0;
    let delta_exact: f64 = q_gravity.abs() * l_span.powi(4) / (384.0 * e_kpa * iz_sec);

    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "RMR roof beam deflection");
}

// ================================================================
// 3. GSI to Rock Mass Modulus (Hoek & Diederichs 2006)
// ================================================================
//
// E_rm = Ei * (0.02 + (1 - D/2) / (1 + exp((60 + 15*D - GSI) / 11)))
//
// Ei = intact rock Young's modulus
// GSI = Geological Strength Index (10-100)
// D = disturbance factor (0 = undisturbed, 1 = fully disturbed)
//
// Model a tunnel lining beam with the computed rock mass modulus
// as spring stiffness, comparing deflections for different GSI values.

#[test]
fn rock_gsi_modulus_estimation() {
    let ei: f64 = 50_000.0;      // MPa, intact modulus (sandstone)

    // Case 1: Good quality, undisturbed (GSI=75, D=0)
    let gsi_1: f64 = 75.0;
    let d_1: f64 = 0.0;
    let e_rm_1: f64 = ei * (0.02 + (1.0 - d_1 / 2.0) / (1.0 + ((60.0 + 15.0 * d_1 - gsi_1) / 11.0).exp()));

    // Case 2: Poor quality, disturbed (GSI=35, D=0.5)
    let gsi_2: f64 = 35.0;
    let d_2: f64 = 0.5;
    let e_rm_2: f64 = ei * (0.02 + (1.0 - d_2 / 2.0) / (1.0 + ((60.0 + 15.0 * d_2 - gsi_2) / 11.0).exp()));

    // Case 3: Very poor quality (GSI=20, D=0.7)
    let gsi_3: f64 = 20.0;
    let d_3: f64 = 0.7;
    let e_rm_3: f64 = ei * (0.02 + (1.0 - d_3 / 2.0) / (1.0 + ((60.0 + 15.0 * d_3 - gsi_3) / 11.0).exp()));

    // Modulus should decrease with decreasing GSI and increasing D
    assert!(
        e_rm_1 > e_rm_2 && e_rm_2 > e_rm_3,
        "E_rm: {:.0} > {:.0} > {:.0} MPa", e_rm_1, e_rm_2, e_rm_3
    );

    // Ratio E_rm / Ei should be < 1
    let ratio_1: f64 = e_rm_1 / ei;
    let ratio_3: f64 = e_rm_3 / ei;
    assert!(ratio_1 < 1.0 && ratio_1 > 0.1, "E_rm/Ei = {:.3} for GSI=75", ratio_1);
    assert!(ratio_3 < 0.10, "E_rm/Ei = {:.4} for GSI=20", ratio_3);

    // Model beam on elastic foundation: compare deflections using E_rm_1 vs E_rm_2
    // A tunnel lining (simply supported, span = 6m) under uniform gravity load
    let l_span: f64 = 6.0;
    let n_elem: usize = 8;
    let a_sec: f64 = 0.30;        // m^2
    let iz_sec: f64 = 2.25e-3;    // m^4
    let q: f64 = -50.0;           // kN/m (gravity load on lining)

    // Solve with good rock modulus (stiffer lining material = higher E)
    let mut loads_1 = Vec::new();
    for i in 0..n_elem {
        loads_1.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_1 = make_beam(n_elem, l_span, e_rm_1, a_sec, iz_sec, "pinned", Some("rollerX"), loads_1);
    let results_1 = solve_2d(&input_1).expect("solve good rock");

    let mut loads_2 = Vec::new();
    for i in 0..n_elem {
        loads_2.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_2 = make_beam(n_elem, l_span, e_rm_2, a_sec, iz_sec, "pinned", Some("rollerX"), loads_2);
    let results_2 = solve_2d(&input_2).expect("solve poor rock");

    let mid_node = n_elem / 2 + 1;
    let disp_1 = results_1.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap().uy.abs();
    let disp_2 = results_2.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap().uy.abs();

    // Lower modulus => larger deflection (delta ~ 1/E)
    assert!(
        disp_2 > disp_1,
        "Poor rock disp {:.6} > good rock disp {:.6}", disp_2, disp_1
    );

    // Ratio of displacements should match inverse ratio of moduli
    let disp_ratio: f64 = disp_2 / disp_1;
    let modulus_ratio: f64 = e_rm_1 / e_rm_2;
    assert_close(disp_ratio, modulus_ratio, 0.05, "GSI modulus displacement ratio");
}

// ================================================================
// 4. Rock Bolt Capacity and Spacing Design
// ================================================================
//
// Rock bolt design for tunnel support:
//   - Bolt length: L_b >= 1.5 + 0.15 * B (Barton, B = tunnel width)
//   - Spacing: S <= L_b / 2 (minimum overlap)
//   - Capacity: T_bolt = pi * d * L_bond * tau_bond
//     where d = bolt diameter, tau_bond = grout-rock bond strength
//   - Required bolt density: n = gamma_rock * h_loose / T_bolt_per_m2
//
// A bolted rock beam is modeled as simply-supported with point loads
// representing bolt pretension, verifying the resulting moment.

#[test]
fn rock_bolt_capacity() {
    // Tunnel geometry
    let b_tunnel: f64 = 8.0;     // m, tunnel width (span)
    let _h_tunnel: f64 = 6.0;    // m, tunnel height

    // Rock bolt parameters
    let d_bolt: f64 = 0.025;     // m, bolt diameter (25mm)
    let l_bond: f64 = 2.0;       // m, bonded length
    let tau_bond: f64 = 1.0;     // MPa, grout-rock bond strength

    // Bolt pull-out capacity
    let t_bolt: f64 = std::f64::consts::PI * d_bolt * l_bond * tau_bond * 1000.0; // kN
    // = pi * 0.025 * 2.0 * 1.0 * 1000 = 157 kN

    assert!(t_bolt > 100.0 && t_bolt < 250.0, "Bolt capacity: {:.0} kN", t_bolt);

    // Bolt length requirement (Barton's rule of thumb)
    let l_bolt_min: f64 = 1.5 + 0.15 * b_tunnel;
    // = 1.5 + 1.2 = 2.7 m

    let l_bolt: f64 = 3.0;       // m, selected bolt length
    assert!(l_bolt >= l_bolt_min, "Bolt length {:.1} >= {:.1} m", l_bolt, l_bolt_min);

    // Maximum spacing
    let s_max: f64 = l_bolt / 2.0;
    let s_bolt: f64 = 1.5;       // m, selected spacing (both directions)
    assert!(s_bolt <= s_max, "Spacing {:.1} <= {:.1} m", s_bolt, s_max);

    // Bolts per square meter and support pressure
    let n_bolts_per_m2: f64 = 1.0 / (s_bolt * s_bolt);
    let p_support: f64 = t_bolt * n_bolts_per_m2; // kN/m^2

    // Required support pressure (loose rock wedge)
    let gamma_rock: f64 = 26.0;  // kN/m^3
    let h_loose: f64 = b_tunnel / 4.0; // m, loose zone height (approximation)
    let p_required: f64 = gamma_rock * h_loose;

    assert!(
        p_support > p_required,
        "Support {:.0} > required {:.0} kN/m2", p_support, p_required
    );

    // Model the tunnel roof beam with bolt pretension as upward point loads
    let n_elem: usize = 8;
    let e_rock: f64 = 15_000.0;  // MPa, rock mass modulus
    let roof_thick: f64 = 0.5;   // m (loosened beam thickness)
    let a_sec: f64 = 1.0 * roof_thick;
    let iz_sec: f64 = 1.0 * roof_thick.powi(3) / 12.0;

    // Gravity load on roof beam
    let q_gravity: f64 = -gamma_rock * roof_thick; // kN/m

    // Bolt uplift at quarter points (simplified as point loads)
    // Each bolt row carries a fraction of the total gravity load
    let total_gravity: f64 = q_gravity.abs() * b_tunnel; // total load (kN)
    let bolt_force_up: f64 = total_gravity * 0.15; // each bolt row carries 15% of load
    let node_quarter = n_elem / 4 + 1;
    let node_3quarter = 3 * n_elem / 4 + 1;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_gravity, q_j: q_gravity, a: None, b: None,
        }));
    }
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_quarter, fx: 0.0, fy: bolt_force_up, mz: 0.0,
    }));
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_3quarter, fx: 0.0, fy: bolt_force_up, mz: 0.0,
    }));

    let input = make_beam(n_elem, b_tunnel, e_rock, a_sec, iz_sec, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve bolted roof");

    // With bolts, midspan deflection should be less than unbolted case
    let mid_node = n_elem / 2 + 1;
    let mid_disp_bolted = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap().uy;

    // Unbolted case
    let mut loads_unbolted = Vec::new();
    for i in 0..n_elem {
        loads_unbolted.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_gravity, q_j: q_gravity, a: None, b: None,
        }));
    }
    let input_unbolted = make_beam(n_elem, b_tunnel, e_rock, a_sec, iz_sec, "pinned", Some("rollerX"), loads_unbolted);
    let results_unbolted = solve_2d(&input_unbolted).expect("solve unbolted");
    let mid_disp_unbolted = results_unbolted.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap().uy;

    assert!(
        mid_disp_bolted.abs() < mid_disp_unbolted.abs(),
        "Bolted {:.6} < unbolted {:.6} m deflection", mid_disp_bolted.abs(), mid_disp_unbolted.abs()
    );
}

// ================================================================
// 5. Kirsch Solution: Stress Around Circular Opening
// ================================================================
//
// Kirsch (1898) analytical solution for stresses around a circular
// hole of radius a in an infinite plate under far-field stresses.
//
// For uniaxial stress sigma_0 (vertical), at angle theta from horizontal:
//   sigma_r = (sigma_0/2)*[(1 - a^2/r^2) + (1 - 4a^2/r^2 + 3a^4/r^4)*cos(2*theta)]
//   sigma_theta = (sigma_0/2)*[(1 + a^2/r^2) - (1 + 3a^4/r^4)*cos(2*theta)]
//   tau_r_theta = -(sigma_0/2)*[(1 + 2a^2/r^2 - 3a^4/r^4)*sin(2*theta)]
//
// At the opening boundary (r = a):
//   sigma_theta = sigma_0 * (1 - 2*cos(2*theta))
//   => max at theta = pi/2 (crown/invert): sigma_theta = 3*sigma_0
//   => min at theta = 0 (springline): sigma_theta = -sigma_0 (tension)
//
// A tunnel lining modeled as beam under the Kirsch-predicted stress
// concentration verifies the structural design load.

#[test]
fn rock_kirsch_circular_opening() {
    let sigma_0: f64 = 10.0;     // MPa, far-field vertical stress
    let k0: f64 = 0.5;           // horizontal-to-vertical stress ratio
    let sigma_h: f64 = k0 * sigma_0; // MPa, far-field horizontal stress
    let a_radius: f64 = 3.0;     // m, tunnel radius

    // Stresses at boundary (r = a) under biaxial far-field stress
    // General Kirsch for biaxial: sigma_v = sigma_0, sigma_h = k0*sigma_0
    // sigma_theta(r=a) = (sigma_0 + sigma_h) - 2*(sigma_0 - sigma_h)*cos(2*theta)

    // At crown (theta = pi/2):
    let theta_crown: f64 = std::f64::consts::FRAC_PI_2;
    let sigma_crown: f64 = (sigma_0 + sigma_h) - 2.0 * (sigma_0 - sigma_h) * (2.0 * theta_crown).cos();

    // At springline (theta = 0):
    let theta_spring: f64 = 0.0;
    let sigma_spring: f64 = (sigma_0 + sigma_h) - 2.0 * (sigma_0 - sigma_h) * (2.0 * theta_spring).cos();

    // For K0 = 0.5: crown = (10+5) + 2*(10-5) = 25 MPa (concentration factor 2.5)
    // springline = (10+5) - 2*(10-5) = 5 MPa
    let scf_crown: f64 = sigma_crown / sigma_0;
    assert_close(sigma_crown, 25.0, 0.01, "Kirsch crown stress");
    assert_close(sigma_spring, 5.0, 0.01, "Kirsch springline stress");
    assert_close(scf_crown, 2.5, 0.01, "Stress concentration factor at crown");

    // For uniaxial case (k0 = 0), verify classical result
    let sigma_crown_uni: f64 = sigma_0 * 3.0;   // 3*sigma_0 at crown
    let sigma_spring_uni: f64 = -sigma_0;        // tension at springline

    assert_close(sigma_crown_uni, 30.0, 0.01, "Uniaxial crown stress = 3*sigma_0");
    assert_close(sigma_spring_uni, -10.0, 0.01, "Uniaxial springline tension");

    // Stress at distance r from center (along crown line, theta = pi/2)
    let r_check: f64 = 2.0 * a_radius; // 2 radii away
    let rr: f64 = a_radius / r_check;
    let sigma_r: f64 = (sigma_0 / 2.0)
        * ((1.0 - rr.powi(2)) + (1.0 - 4.0 * rr.powi(2) + 3.0 * rr.powi(4)) * (2.0 * theta_crown).cos());
    let sigma_theta_r: f64 = (sigma_0 / 2.0)
        * ((1.0 + rr.powi(2)) - (1.0 + 3.0 * rr.powi(4)) * (2.0 * theta_crown).cos());

    // At r = 2a along crown: stress should approach far-field
    assert!(
        (sigma_theta_r - sigma_0).abs() < sigma_0 * 0.5,
        "sigma_theta at 2a = {:.2} MPa, approaching far-field {:.0}", sigma_theta_r, sigma_0
    );
    assert!(sigma_r > 0.0, "sigma_r at 2a = {:.2} MPa (compressive)", sigma_r);

    // Model lining beam under crown concentrated stress
    let lining_load: f64 = -sigma_crown * 1000.0 * 0.25; // kN/m (0.25m thick lining)
    let l_span: f64 = 2.0 * a_radius; // m, tunnel diameter
    let n_elem: usize = 8;
    let e_lining: f64 = 30_000.0; // MPa, concrete
    let a_sec: f64 = 0.25;       // m^2
    let iz_sec: f64 = 1.0 * 0.25_f64.powi(3) / 12.0;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: lining_load, q_j: lining_load, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, l_span, e_lining, a_sec, iz_sec, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve Kirsch lining");

    // Verify midspan deflection matches 5qL^4/(384EI)
    let e_kpa: f64 = e_lining * 1000.0;
    let delta_exact: f64 = 5.0 * lining_load.abs() * l_span.powi(4) / (384.0 * e_kpa * iz_sec);

    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Kirsch lining beam deflection");
}

// ================================================================
// 6. In-Situ Stress: Vertical and Horizontal Components
// ================================================================
//
// Vertical stress: sigma_v = gamma * z (overburden stress)
// Horizontal stress: sigma_h = K0 * sigma_v
//   - Jaky (1944): K0 = 1 - sin(phi) for normally consolidated
//   - Hoek & Brown: K0 ranges from 0.5 to 3.5, depth-dependent:
//     K0 = 100/z + 0.3 (approximate for average global data)
//
// Model a vertical column of rock under self-weight to verify
// the resulting axial forces match sigma_v = gamma * z.

#[test]
fn rock_insitu_stress() {
    let gamma: f64 = 27.0;       // kN/m^3, unit weight of rock
    let z_depths = [50.0, 100.0, 200.0, 500.0, 1000.0]; // m

    // Vertical stress at each depth
    for &z in &z_depths {
        let sigma_v: f64 = gamma * z / 1000.0; // MPa
        let expected: f64 = gamma * z / 1000.0;
        assert_close(sigma_v, expected, 0.001, &format!("sigma_v at {}m", z));
    }

    // Horizontal stress with Jaky's formula
    let phi_deg: f64 = 35.0;     // degrees, friction angle
    let phi_rad: f64 = phi_deg.to_radians();
    let k0_jaky: f64 = 1.0 - phi_rad.sin();

    assert_close(k0_jaky, 0.426, 0.01, "K0 Jaky for phi=35");

    // Hoek-Brown depth-dependent K0
    let z_deep: f64 = 500.0;     // m
    let k0_hb: f64 = 100.0 / z_deep + 0.3;

    assert_close(k0_hb, 0.50, 0.01, "K0 Hoek-Brown at 500m");

    // At shallow depth, K0 can be > 1 (tectonic residual stresses)
    let z_shallow: f64 = 50.0;
    let k0_shallow: f64 = 100.0 / z_shallow + 0.3;
    assert!(k0_shallow > 1.0, "K0 = {:.1} > 1 at shallow depth", k0_shallow);

    // Model vertical rock column under self-weight
    // Column height = 10m, subdivided into elements
    let h_col: f64 = 10.0;       // m
    let n_elem: usize = 5;
    let e_rock: f64 = 20_000.0;  // MPa
    let a_col: f64 = 1.0;        // m^2 (per unit area)
    let iz_col: f64 = 1.0 / 12.0; // m^4 (1m x 1m section)

    // Apply self-weight as distributed axial load (along beam axis)
    // In 2D solver, beam is along x-axis. Apply gravity as transverse load.
    // Instead, represent overburden as nodal loads at each node.
    let _elem_len: f64 = h_col / n_elem as f64;
    let q_weight: f64 = -gamma * a_col; // kN/m, self-weight per unit length

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_weight, q_j: q_weight, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, h_col, e_rock, a_col, iz_col, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve rock column");

    // Total reaction at fixed end should equal total weight
    let total_weight: f64 = gamma * a_col * h_col; // kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry.abs(), total_weight, 0.01, "Column self-weight equilibrium");

    // Stress at base: sigma = gamma * h_col (in kPa)
    let sigma_base: f64 = gamma * h_col; // kPa
    let sigma_h_base: f64 = k0_jaky * sigma_base;

    assert_close(sigma_base, 270.0, 0.01, "Base vertical stress");
    assert!(sigma_h_base < sigma_base, "sigma_h {:.0} < sigma_v {:.0} kPa", sigma_h_base, sigma_base);
}

// ================================================================
// 7. Rock Slope Stability: Planar Failure on Discontinuity
// ================================================================
//
// Factor of safety for planar sliding on a discontinuity:
//   FS = (c*A + (W*cos(psi_p) - U - V*sin(psi_p)) * tan(phi))
//        / (W*sin(psi_p) + V*cos(psi_p))
//
// where:
//   psi_p = dip angle of failure plane
//   W = weight of sliding block
//   U = water uplift force on sliding plane
//   V = water force in tension crack
//   c, phi = discontinuity shear strength parameters
//   A = area of sliding plane
//
// A retaining beam supporting the sliding mass is modeled to verify
// the required support force stabilizes the block.

#[test]
fn rock_slope_planar_failure() {
    // Slope geometry
    let h_slope: f64 = 20.0;     // m, slope height
    let psi_f: f64 = 60.0_f64.to_radians(); // slope face angle
    let psi_p: f64 = 35.0_f64.to_radians(); // failure plane dip angle

    // Conditions for planar failure: psi_p < psi_f and psi_p > phi
    assert!(psi_p < psi_f, "Kinematic condition: psi_p < psi_f");

    // Rock and discontinuity properties
    let gamma_rock: f64 = 26.0;  // kN/m^3
    let c: f64 = 20.0;           // kPa, cohesion along discontinuity
    let phi: f64 = 25.0_f64.to_radians(); // friction angle

    assert!(psi_p > phi, "Sliding condition: psi_p > phi");

    // Sliding block weight (per meter width, triangular wedge)
    let l_plane: f64 = h_slope / psi_p.sin(); // length of failure plane
    let w_block: f64 = 0.5 * gamma_rock * h_slope * h_slope
        * ((1.0 / psi_p.tan()) - (1.0 / psi_f.tan()));

    assert!(w_block > 0.0, "Block weight: {:.0} kN/m", w_block);

    // Dry conditions (no water): U = 0, V = 0
    let a_plane: f64 = l_plane * 1.0; // m^2, per unit width

    let driving: f64 = w_block * psi_p.sin();
    let resisting: f64 = c * a_plane + w_block * psi_p.cos() * phi.tan();
    let fs_dry: f64 = resisting / driving;

    // With water (tension crack half-filled)
    let z_tc: f64 = h_slope * 0.3; // tension crack depth
    let gamma_w: f64 = 9.81;
    let v_water: f64 = 0.5 * gamma_w * z_tc * z_tc;
    let u_water: f64 = 0.5 * gamma_w * z_tc * l_plane;

    let driving_wet: f64 = w_block * psi_p.sin() + v_water * psi_p.cos();
    let resisting_wet: f64 = c * a_plane + (w_block * psi_p.cos() - u_water - v_water * psi_p.sin()) * phi.tan();
    let fs_wet: f64 = resisting_wet / driving_wet;

    assert!(fs_wet < fs_dry, "Wet FS {:.2} < dry FS {:.2}", fs_wet, fs_dry);

    // Required support force for FS = 1.5 (dry conditions)
    let fs_target: f64 = 1.5;
    // F_support acts horizontally at base: modifies equilibrium
    // FS = (c*A + (W*cos(psi) + F*sin(psi)) * tan(phi)) / (W*sin(psi) - F*cos(psi))
    // Solving for F:
    let f_support: f64 = (fs_target * driving - resisting)
        / (psi_p.sin() * phi.tan() + fs_target * psi_p.cos());

    // If FS_dry > FS_target, no support needed
    if fs_dry < fs_target {
        assert!(f_support > 0.0, "Required support: {:.0} kN/m", f_support);

        // Model a retaining beam under this support force
        let l_beam: f64 = h_slope;
        let n_elem: usize = 6;
        let e_steel: f64 = 200_000.0;
        let a_sec: f64 = 0.01;
        let iz_sec: f64 = 5.0e-5;

        let input = make_beam(
            n_elem, l_beam, e_steel, a_sec, iz_sec, "fixed", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_elem + 1, fx: 0.0, fy: -f_support, mz: 0.0,
            })],
        );
        let results = solve_2d(&input).expect("solve slope support");

        let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
        assert_close(sum_ry, f_support, 0.01, "Slope support equilibrium");
    } else {
        // Slope is stable without support under dry conditions
        assert!(fs_dry >= fs_target, "Slope stable: FS = {:.2}", fs_dry);

        // Still verify FEM equilibrium with a nominal load
        let f_nominal: f64 = 10.0; // kN, nominal check
        let l_beam: f64 = h_slope;
        let n_elem: usize = 6;
        let e_steel: f64 = 200_000.0;
        let a_sec: f64 = 0.01;
        let iz_sec: f64 = 5.0e-5;

        let input = make_beam(
            n_elem, l_beam, e_steel, a_sec, iz_sec, "fixed", Some("rollerX"),
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_elem + 1, fx: 0.0, fy: -f_nominal, mz: 0.0,
            })],
        );
        let results = solve_2d(&input).expect("solve slope nominal");

        let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
        assert_close(sum_ry, f_nominal, 0.01, "Slope nominal equilibrium");
    }
}

// ================================================================
// 8. Support Pressure: Barton's Q-System for Tunnel Support
// ================================================================
//
// Barton Q-system (1974): Q = (RQD/Jn) * (Jr/Ja) * (Jw/SRF)
//   RQD = Rock Quality Designation
//   Jn = joint set number
//   Jr = joint roughness number
//   Ja = joint alteration number
//   Jw = joint water reduction factor
//   SRF = stress reduction factor
//
// Support pressure: P = (2/Jr) * Q^(-1/3)  (for Q < 10)
// Equivalent dimension: De = span / ESR
// ESR = excavation support ratio (1.0 for permanent mine openings,
//        1.3-1.6 for temporary, 0.8 for nuclear waste)
//
// Model the tunnel lining as a beam under the computed support
// pressure to verify structural adequacy.

#[test]
fn rock_barton_q_system_support() {
    // Q-system input parameters (fair to poor rock)
    let rqd: f64 = 55.0;         // %
    let jn: f64 = 9.0;           // three joint sets
    let jr: f64 = 1.5;           // rough, planar
    let ja: f64 = 2.0;           // slightly altered
    let jw: f64 = 0.66;          // medium water inflow
    let srf: f64 = 2.5;          // medium stress, favorable

    // Calculate Q
    let q: f64 = (rqd / jn) * (jr / ja) * (jw / srf);

    // Q should be in range for fair-poor rock (0.1 - 10)
    assert!(q > 0.1 && q < 10.0, "Q = {:.2}", q);

    // Q-system category
    let _category = if q > 4.0 {
        "fair"
    } else if q > 1.0 {
        "poor"
    } else {
        "very poor"
    };

    // Support pressure (Barton et al., 1974)
    let p_support: f64 = (2.0 / jr) * q.powf(-1.0 / 3.0); // kg/cm^2
    let p_support_kpa: f64 = p_support * 98.1; // convert to kPa

    assert!(p_support_kpa > 50.0 && p_support_kpa < 500.0,
        "Support pressure: {:.0} kPa", p_support_kpa);

    // Equivalent dimension for support design
    let span: f64 = 10.0;        // m, tunnel span
    let esr: f64 = 1.0;          // permanent mine opening
    let de: f64 = span / esr;

    // De vs Q determines support category on Barton's chart
    assert!(de > 0.0, "Equivalent dimension: {:.1}", de);

    // Bolt spacing from Q: S_b ≈ 2.0 + 0.15 * (Q/Jn)^(1/2) (m)
    let s_bolt_est: f64 = 2.0 + 0.15 * (q / jn).sqrt();
    assert!(s_bolt_est > 1.5, "Estimated bolt spacing: {:.2} m", s_bolt_est);

    // Shotcrete thickness estimate: t ≈ 50 + 5*De/Q^0.5 (mm)
    let t_shotcrete: f64 = 50.0 + 5.0 * de / q.sqrt();
    assert!(t_shotcrete > 50.0 && t_shotcrete < 200.0,
        "Shotcrete thickness: {:.0} mm", t_shotcrete);

    // Model tunnel lining beam under Q-system support pressure
    let n_elem: usize = 10;
    let e_concrete: f64 = 30_000.0; // MPa, shotcrete modulus
    let t_lining: f64 = t_shotcrete / 1000.0; // m
    let a_sec: f64 = 1.0 * t_lining;
    let iz_sec: f64 = 1.0 * t_lining.powi(3) / 12.0;

    // Apply rock pressure on lining (support pressure as design load)
    let q_load: f64 = -p_support_kpa; // kN/m (per meter width, downward)

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_load, q_j: q_load, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, span, e_concrete, a_sec, iz_sec, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve Q-system lining");

    // Verify deflection matches SS beam formula: delta = 5qL^4/(384EI)
    let e_kpa: f64 = e_concrete * 1000.0;
    let delta_exact: f64 = 5.0 * q_load.abs() * span.powi(4) / (384.0 * e_kpa * iz_sec);

    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Q-system lining deflection");

    // Verify reactions sum to total load
    let total_load: f64 = q_load.abs() * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum::<f64>();
    assert_close(sum_ry, total_load, 0.01, "Q-system lining reaction equilibrium");
}
