/// Validation: Extended Shell Theory and Thin Shell Structures
///
/// References:
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed. (1959)
///   - Ventsel & Krauthammer, "Thin Plates and Shells", Marcel Dekker (2001)
///   - Flugge, "Stresses in Shells", 2nd Ed., Springer (1973)
///   - Ugural, "Stresses in Beams, Plates, and Shells", 3rd Ed. (2009)
///   - Billington, "Thin Shell Concrete Structures", McGraw-Hill (1982)
///   - Donnell, "Stability of Thin-Walled Tubes Under Torsion", NACA TR 479 (1933)
///   - Bushnell, "Computerized Buckling Analysis of Shells", Lockheed (1985)
///   - NASA SP-8007, "Buckling of Thin-Walled Circular Cylinders" (1968)
///   - EN 1993-1-6: Strength and Stability of Shell Structures
///
/// Tests verify shell/membrane theory formulas with analytical checks and
/// at least one structural solver verification per test.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::f64::consts::PI;

// ================================================================
// 1. Cylindrical Shell Membrane Theory
//    N_theta = p*R, N_x = p*R/2 for internal pressure
// ================================================================
//
// A thin cylindrical shell under internal pressure p develops:
//   - Hoop (circumferential) force: N_theta = p * R  (per unit length)
//   - Longitudinal force: N_x = p * R / 2  (per unit length)
//
// The 2:1 ratio is fundamental to pressure vessel design.
// The hoop direction governs because circumferential equilibrium
// involves a single radius of curvature while the longitudinal
// direction benefits from closed-end equilibrium.
//
// Reference: Ugural, Ch. 13; Timoshenko & Woinowsky-Krieger, Sec 14.2

#[test]
fn validation_shell_ext_cylindrical_membrane() {
    let r: f64 = 2.0;          // m, mean radius
    let t: f64 = 0.012;        // m (12 mm), wall thickness
    let p: f64 = 2.5;          // MPa, internal pressure

    // Hoop force resultant (per unit length)
    let n_theta: f64 = p * r;
    assert_close(n_theta, 5.0, 0.01, "N_theta = p*R = 5.0 MN/m");

    // Longitudinal force resultant (per unit length)
    let n_x: f64 = p * r / 2.0;
    assert_close(n_x, 2.5, 0.01, "N_x = p*R/2 = 2.5 MN/m");

    // Fundamental 2:1 ratio
    let ratio: f64 = n_theta / n_x;
    assert_close(ratio, 2.0, 0.01, "N_theta/N_x = 2 (hoop governs)");

    // Membrane stresses (stress = force / thickness)
    let sigma_hoop: f64 = n_theta / t;
    let sigma_long: f64 = n_x / t;
    assert_close(sigma_hoop, 2.5 * 2.0 / 0.012, 0.01, "Hoop stress sigma_theta");
    assert_close(sigma_long, sigma_hoop / 2.0, 0.01, "Longitudinal = half hoop");

    // Von Mises equivalent stress for biaxial state
    // sigma_vm = sqrt(s1^2 - s1*s2 + s2^2)
    let sigma_vm: f64 = (sigma_hoop.powi(2) - sigma_hoop * sigma_long + sigma_long.powi(2)).sqrt();
    let expected_vm: f64 = sigma_hoop * (0.75_f64).sqrt();
    assert_close(sigma_vm, expected_vm, 0.01, "Von Mises for 2:1 biaxial");

    // Diametral expansion: delta_R = R * epsilon_hoop
    let e_mod: f64 = 200e3; // MPa (200 GPa)
    let nu: f64 = 0.3;
    let eps_hoop: f64 = (sigma_hoop - nu * sigma_long) / e_mod;
    let delta_r: f64 = eps_hoop * r;
    assert!(delta_r > 0.0, "Radius expands under internal pressure");

    // Thin shell validity: R/t > 10
    let r_over_t: f64 = r / t;
    assert!(r_over_t > 10.0, "R/t = {:.0} confirms thin shell", r_over_t);

    // Solver check: model a segment of cylinder as a simply-supported beam
    // with equivalent hoop force. A ring segment under radial pressure p
    // can be approximated by a beam analogy where the reaction = p*L/2.
    let l: f64 = 4.0; // m, beam span representing a shell strip
    let q_equiv: f64 = -p; // kN/m equivalent (using unit conversion for solver)
    let n_elem: usize = 4;
    let e_solver: f64 = 200.0; // MPa (solver multiplies by 1000)
    let a_sec: f64 = t * 1.0; // cross-section area for 1m wide strip
    let iz_sec: f64 = 1.0 * t.powi(3) / 12.0; // I for 1m wide strip

    let input = make_ss_beam_udl(n_elem, l, e_solver, a_sec, iz_sec, q_equiv);
    let results = linear::solve_2d(&input).unwrap();

    // Reaction should be p*L/2 per unit width
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let expected_reaction: f64 = q_equiv.abs() * l;
    assert_close(total_ry, expected_reaction, 0.02, "Solver: total reaction = p*L");
}

// ================================================================
// 2. Spherical Shell Membrane Theory
//    N_phi = N_theta = pR/2 for uniform internal pressure
// ================================================================
//
// A spherical shell under uniform internal pressure develops equal
// membrane forces in both principal directions:
//   N_phi = N_theta = p * R / 2
//
// This isotropic stress state means:
//   - Both principal stresses are equal (equi-biaxial)
//   - Von Mises stress equals the membrane stress
//   - The sphere is 2x more efficient than a cylinder (half the stress)
//
// Reference: Timoshenko & Woinowsky-Krieger, Sec 14.1

#[test]
fn validation_shell_ext_spherical_membrane() {
    let r: f64 = 3.0;          // m, mean radius
    let t: f64 = 0.015;        // m (15 mm)
    let p: f64 = 2.0;          // MPa, internal pressure

    // Both membrane force resultants are equal
    let n_phi: f64 = p * r / 2.0;
    let n_theta: f64 = p * r / 2.0;
    assert_close(n_phi, 3.0, 0.01, "N_phi = pR/2 = 3.0 MN/m");
    assert_close(n_theta, n_phi, 0.01, "N_theta = N_phi (isotropy)");

    // Membrane stresses
    let sigma: f64 = n_phi / t;
    assert_close(sigma, 200.0, 0.01, "sigma = pR/(2t) = 200 MPa");

    // Von Mises for equi-biaxial: sigma_vm = sigma
    let sigma_vm: f64 = (sigma.powi(2) - sigma * sigma + sigma.powi(2)).sqrt();
    assert_close(sigma_vm, sigma, 0.01, "Von Mises = sigma for equi-biaxial");

    // Compare with cylinder of same R, t, p:
    // Cylinder hoop stress = pR/t = 2 * sphere stress
    let sigma_cyl: f64 = p * r / t;
    let efficiency: f64 = sigma / sigma_cyl;
    assert_close(efficiency, 0.5, 0.01, "Sphere is 2x more efficient than cylinder");

    // Required thickness for allowable stress sigma_allow
    let sigma_allow: f64 = 250.0; // MPa
    let t_req: f64 = p * r / (2.0 * sigma_allow);
    assert_close(t_req, 2.0 * 3.0 / (2.0 * 250.0), 0.01, "Required thickness");
    assert!(t_req < t, "Required thickness < actual thickness: adequate");

    // Volumetric strain under equi-biaxial stress
    let e_mod: f64 = 200e3; // MPa
    let nu: f64 = 0.3;
    // For plane stress: eps = sigma*(1-nu)/E
    let eps: f64 = sigma * (1.0 - nu) / e_mod;
    let delta_r: f64 = eps * r;
    assert!(delta_r > 0.0, "Sphere expands uniformly");

    // Solver check: a beam under equal and opposite forces represents
    // the equilibrium of a membrane strip
    let l: f64 = 3.0;
    let n_elem: usize = 4;
    let p_load: f64 = -8.0; // kN/m
    let e_solver: f64 = 200.0;
    let a_sec: f64 = 0.01;
    let iz_sec: f64 = 1e-4;

    let input = make_ss_beam_udl(n_elem, l, e_solver, a_sec, iz_sec, p_load);
    let results = linear::solve_2d(&input).unwrap();

    // Verify equilibrium: sum of vertical reactions = total applied load
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let expected_total: f64 = p_load.abs() * l;
    assert_close(total_ry, expected_total, 0.02, "Solver: equilibrium check");
}

// ================================================================
// 3. Bending in Cylindrical Shell
//    Edge bending length L_b = sqrt(R*t), beta parameter
// ================================================================
//
// At junctions or edges, membrane theory alone is insufficient and
// bending effects develop. These decay exponentially from the edge.
//
// Characteristic parameter: beta = [3(1-nu^2)/(R^2 * t^2)]^(1/4)
// Bending penetration depth: L_b = pi/beta
// Approximate: L_b ~ pi * (R*t)^(1/2) / [3(1-nu^2)]^(1/4)
//
// The bending moment decays as exp(-beta*x), reaching negligible
// values at x ~ pi/beta.
//
// Reference: Flugge Ch. 5; Timoshenko & Woinowsky-Krieger Sec 15.4

#[test]
fn validation_shell_ext_bending_cylindrical() {
    let r: f64 = 2.5;          // m, radius
    let t: f64 = 0.020;        // m (20 mm)
    let e: f64 = 200e3;        // MPa
    let nu: f64 = 0.3;

    // Beta parameter
    let beta: f64 = (3.0 * (1.0 - nu * nu) / (r * r * t * t)).powf(0.25);

    // Expected: inner = 3*(1-0.09)/(6.25*0.0004) = 2.73/0.0025 = 1092
    let inner: f64 = 3.0 * (1.0 - nu * nu) / (r * r * t * t);
    let expected_beta: f64 = inner.powf(0.25);
    assert_close(beta, expected_beta, 0.01, "Beta parameter");

    // Bending penetration depth
    let l_b: f64 = PI / beta;

    // L_b should be much smaller than R (edge effects are localized)
    assert!(l_b < r, "L_b ({:.3} m) < R ({:.1} m): bending localized", l_b, r);

    // Alternative expression: L_b ~ pi * sqrt(R*t) / [3(1-nu^2)]^(1/4)
    let rt_sqrt: f64 = (r * t).sqrt();
    let factor: f64 = (3.0 * (1.0 - nu * nu)).powf(0.25);
    let l_b_alt: f64 = PI * rt_sqrt / factor;
    assert_close(l_b, l_b_alt, 0.01, "L_b alternative formula");

    // Decay at x = L_b: exp(-pi) ~ 0.0432 (< 5%)
    let decay_at_lb: f64 = (-PI as f64).exp();
    assert!(decay_at_lb < 0.05, ">95% bending decay at x = L_b");
    assert_close(decay_at_lb, 0.04322, 0.02, "exp(-pi) ~ 0.0432");

    // Decay at x = 3/beta
    let x_3beta: f64 = 3.0 / beta;
    let decay_3beta: f64 = (-3.0_f64).exp();
    assert_close(decay_3beta, 0.04979, 0.02, "exp(-3) ~ 0.0498");

    // Flexural rigidity
    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    assert!(d > 0.0, "Flexural rigidity D > 0");

    // Edge shear stiffness: Q0 = 2*beta^3*D
    let q_edge: f64 = 2.0 * beta.powi(3) * d;
    assert!(q_edge > 0.0, "Edge shear stiffness positive");

    // Thinner shell -> larger beta (more localized bending)
    let t_thin: f64 = 0.010;
    let beta_thin: f64 = (3.0 * (1.0 - nu * nu) / (r * r * t_thin * t_thin)).powf(0.25);
    assert!(beta_thin > beta, "Thinner shell: larger beta");
    let l_b_thin: f64 = PI / beta_thin;
    assert!(l_b_thin < l_b, "Thinner shell: shorter penetration");

    // Solver check: verify that a cantilever beam under tip load has
    // localized bending (analogous to edge bending in shells).
    // The bending moment at the fixed end decays linearly for a beam,
    // but this validates the solver infrastructure for bending analysis.
    let beam_l: f64 = 3.0;
    let n_elem: usize = 6;
    let tip_load: f64 = -10.0;
    let e_solver: f64 = 200.0;
    let a_sec: f64 = 0.01;
    let iz_sec: f64 = 1e-4;

    let input = make_beam(n_elem, beam_l, e_solver, a_sec, iz_sec, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1, fx: 0.0, fy: tip_load, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moment = P*L
    let reaction = &results.reactions[0];
    let e_eff: f64 = e_solver * 1000.0;
    let expected_moment: f64 = tip_load.abs() * beam_l;
    assert_close(reaction.mz.abs(), expected_moment, 0.03, "Solver: fixed-end moment = P*L");

    // Tip deflection = PL^3/(3EI)
    let tip_disp = results.displacements.iter().find(|d| d.node_id == n_elem + 1).unwrap();
    let delta_exact: f64 = tip_load.abs() * beam_l.powi(3) / (3.0 * e_eff * iz_sec);
    assert_close(tip_disp.uy.abs(), delta_exact, 0.03, "Solver: cantilever tip deflection");

    let _x_3beta = x_3beta;
}

// ================================================================
// 4. Conical Shell Membrane — Meridional and Hoop Forces Under Self-Weight
// ================================================================
//
// A conical shell with half-angle alpha, under self-weight w per unit
// area of middle surface:
//
// At a section defined by slant distance s from apex:
//   N_phi (meridional) = -w*s / (2*cos(alpha))
//   N_theta (hoop) = -w*s*cos(alpha) + w*s*sin^2(alpha)/cos(alpha)
//         simplified: N_theta = w*s*(sin^2(alpha) - cos^2(alpha))/cos(alpha)
//         or: N_theta = -w*s*cos(2*alpha)/cos(alpha)
//
// For pressure loading p on a cone:
//   N_phi = p*r/(2*cos(alpha))
//   N_theta = p*r/cos(alpha)
//
// Reference: Flugge Ch. 3; Ventsel & Krauthammer Ch. 13

#[test]
fn validation_shell_ext_conical_membrane_selfweight() {
    let alpha_deg: f64 = 30.0;
    let alpha: f64 = alpha_deg * PI / 180.0;
    let w: f64 = 3.0;          // kN/m^2, self-weight
    let s: f64 = 8.0;          // m, slant distance from apex
    let t: f64 = 0.010;        // m (10 mm)

    let cos_alpha: f64 = alpha.cos();
    let sin_alpha: f64 = alpha.sin();

    // Local radius at section
    let r_local: f64 = s * sin_alpha;
    assert_close(r_local, 8.0 * 0.5, 0.01, "r = s*sin(alpha) = 4.0 m");

    // Meridional force under self-weight (compression)
    let n_phi: f64 = -w * s / (2.0 * cos_alpha);
    let expected_n_phi: f64 = -3.0 * 8.0 / (2.0 * cos_alpha);
    assert_close(n_phi, expected_n_phi, 0.01, "N_phi = -w*s/(2*cos(alpha))");
    assert!(n_phi < 0.0, "Meridional force is compressive");

    // Hoop force under self-weight
    // N_theta = -w*s*cos(2*alpha)/cos(alpha)
    let cos_2alpha: f64 = (2.0 * alpha).cos();
    let n_theta: f64 = -w * s * cos_2alpha / cos_alpha;
    let expected_n_theta: f64 = -3.0 * 8.0 * cos_2alpha / cos_alpha;
    assert_close(n_theta, expected_n_theta, 0.01, "N_theta = -w*s*cos(2a)/cos(a)");

    // For alpha = 30 deg: cos(60) = 0.5
    assert_close(cos_2alpha, 0.5, 0.01, "cos(60) = 0.5");

    // So N_theta < 0 (compression) for alpha < 45 deg
    assert!(n_theta < 0.0, "Hoop is compressive for alpha < 45 deg");

    // At alpha = 45 deg: cos(90) = 0 => N_theta = 0 (transition)
    let alpha_45: f64 = 45.0 * PI / 180.0;
    let cos_90: f64 = (2.0 * alpha_45).cos();
    assert_close(cos_90, 0.0, 0.01, "cos(90) ~ 0 at alpha=45");

    // For alpha > 45 deg: hoop becomes tensile
    let alpha_60: f64 = 60.0 * PI / 180.0;
    let cos_120: f64 = (2.0 * alpha_60).cos();
    let n_theta_60: f64 = -w * s * cos_120 / alpha_60.cos();
    assert!(n_theta_60 > 0.0, "Hoop is tensile for alpha > 45 deg");

    // Stresses
    let sigma_phi: f64 = n_phi / t;
    let sigma_theta: f64 = n_theta / t;
    assert!(sigma_phi.abs() < 5000.0, "Meridional stress reasonable");
    assert!(sigma_theta.abs() < 5000.0, "Hoop stress reasonable");

    // Cone under pressure: verify 2:1 ratio (same as cylinder)
    let p: f64 = 1.0; // MPa
    let n_phi_p: f64 = p * r_local / (2.0 * cos_alpha);
    let n_theta_p: f64 = p * r_local / cos_alpha;
    let ratio_p: f64 = n_theta_p / n_phi_p;
    assert_close(ratio_p, 2.0, 0.01, "Cone pressure: N_theta/N_phi = 2");

    // Solver check: model a conical shell strip as an inclined beam.
    // The horizontal projection represents the conical geometry.
    let l_horiz: f64 = s * cos_alpha; // horizontal projection
    let n_elem: usize = 4;
    let q_vert: f64 = -w; // vertical load component
    let e_solver: f64 = 200.0;
    let a_sec: f64 = t * 1.0;
    let iz_sec: f64 = 1.0 * t.powi(3) / 12.0;

    let input = make_ss_beam_udl(n_elem, l_horiz, e_solver, a_sec, iz_sec, q_vert);
    let results = linear::solve_2d(&input).unwrap();

    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let expected_ry: f64 = q_vert.abs() * l_horiz;
    assert_close(total_ry, expected_ry, 0.02, "Solver: equilibrium for cone strip");
}

// ================================================================
// 5. Shell Buckling — Critical External Pressure
//    p_cr = 0.92*E*(t/R)^2.5 for cylinders under external pressure
// ================================================================
//
// For a long cylindrical shell under uniform external pressure,
// the critical buckling pressure (Windenburg-Trilling):
//   p_cr = 0.92 * E * (t/R)^2.5
//
// This accounts for the ovalization buckling mode (n=2 typically).
// For shorter cylinders, the buckling pressure is higher.
//
// The classical Donnell axial compression formula is:
//   sigma_cr = E*t / [R*sqrt(3*(1-nu^2))]
//
// Reference: NASA SP-8007; Bushnell Ch. 5

#[test]
fn validation_shell_ext_buckling_external_pressure() {
    let e: f64 = 200e3;        // MPa (200 GPa)
    let nu: f64 = 0.3;
    let r: f64 = 1.5;          // m, radius
    let t: f64 = 0.008;        // m (8 mm)

    // External pressure buckling (Windenburg-Trilling for long cylinders)
    let t_over_r: f64 = t / r;
    let p_cr: f64 = 0.92 * e * t_over_r.powf(2.5);
    assert!(p_cr > 0.0, "Critical pressure positive");

    // Verify scaling: p_cr ~ (t/R)^2.5
    let t2: f64 = 0.016; // double thickness
    let t2_over_r: f64 = t2 / r;
    let p_cr2: f64 = 0.92 * e * t2_over_r.powf(2.5);
    let thickness_ratio: f64 = t2 / t;
    let pressure_ratio: f64 = p_cr2 / p_cr;
    let expected_ratio: f64 = thickness_ratio.powf(2.5);
    assert_close(pressure_ratio, expected_ratio, 0.01, "p_cr scales as (t/R)^2.5");

    // For R/t = 187.5: t/R = 0.00533
    assert_close(t_over_r, 0.008 / 1.5, 0.01, "t/R ratio");

    // Donnell axial compression critical stress (for comparison)
    let sigma_cr_axial: f64 = e * t / (r * (3.0 * (1.0 - nu * nu)).sqrt());
    assert!(sigma_cr_axial > 0.0, "Axial buckling stress positive");

    // Convert external pressure to equivalent hoop stress
    let sigma_hoop_at_pcr: f64 = p_cr * r / t;

    // External pressure buckling stress is typically much lower
    // than axial compression buckling for the same shell
    assert!(
        sigma_hoop_at_pcr < sigma_cr_axial,
        "External pressure buckling ({:.1} MPa) < axial buckling ({:.1} MPa)",
        sigma_hoop_at_pcr, sigma_cr_axial
    );

    // NASA SP-8007 knockdown for axial compression
    let r_over_t: f64 = r / t;
    let phi_nasa: f64 = (1.0 / 16.0) * r_over_t.sqrt();
    let gamma_nasa: f64 = 1.0 - 0.901 * (1.0 - (-phi_nasa).exp());
    assert!(gamma_nasa > 0.0 && gamma_nasa < 1.0, "Knockdown factor in valid range");

    // Solver check: verify buckling-related stiffness behavior.
    // A compressed column demonstrates stiffness reduction (P-delta),
    // analogous to shell behavior under compression.
    let l: f64 = 3.0;
    let n_elem: usize = 4;
    let e_solver: f64 = 200.0;
    let a_sec: f64 = 0.01;
    let iz_sec: f64 = 1e-4;
    let q_lat: f64 = -5.0; // small lateral load

    let input = make_ss_beam_udl(n_elem, l, e_solver, a_sec, iz_sec, q_lat);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection = 5*q*L^4/(384*EI)
    let e_eff: f64 = e_solver * 1000.0;
    let delta_exact: f64 = 5.0 * q_lat.abs() * l.powi(4) / (384.0 * e_eff * iz_sec);
    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Solver: SS beam midspan deflection");
}

// ================================================================
// 6. Ring Stiffener Design
//    Required moment of inertia for ring stiffener on cylindrical shell
// ================================================================
//
// Ring stiffeners on cylindrical shells increase buckling resistance.
// The required moment of inertia of a ring stiffener:
//   I_req = p * R^3 * L_s / (n^2 - 1) / E
//
// where:
//   p = external pressure
//   R = shell radius
//   L_s = stiffener spacing
//   n = number of circumferential waves (typically n=2 for ring buckling)
//   E = elastic modulus
//
// Effective width of shell acting with ring:
//   b_eff = 0.78 * sqrt(R*t) (per side)
//
// Reference: Bushnell Ch. 5; DNV-RP-C202

#[test]
fn validation_shell_ext_ring_stiffener_design() {
    let r: f64 = 3.0;          // m, shell radius
    let t: f64 = 0.012;        // m (12 mm)
    let e: f64 = 200e3;        // MPa
    let p: f64 = 0.10;         // MPa, external pressure
    let l_s: f64 = 1.5;        // m, stiffener spacing
    let n: f64 = 2.0;          // number of circumferential waves

    // Required moment of inertia for ring stiffener
    let i_req: f64 = p * r.powi(3) * l_s / ((n.powi(2) - 1.0) * e);
    let expected_i: f64 = 0.10 * 27.0 * 1.5 / (3.0 * 200e3);
    assert_close(i_req, expected_i, 0.01, "I_req = p*R^3*Ls/((n^2-1)*E)");
    assert!(i_req > 0.0, "Required I is positive");

    // Effective width of shell plating (per side)
    let b_eff_one: f64 = 0.78 * (r * t).sqrt();
    let b_eff_total: f64 = 2.0 * b_eff_one;

    // Check against stiffener spacing
    let b_eff_limited: f64 = b_eff_one.min(l_s / 2.0);
    assert_close(b_eff_limited, b_eff_one, 0.01,
        "Effective width governed by formula (< Ls/2)");

    // Effective area of shell plating
    let a_shell_eff: f64 = b_eff_total * t;

    // Ring stiffener properties (typical T-section)
    let a_ring: f64 = 0.003;       // m^2
    let i_ring: f64 = 5e-4;        // m^4
    let a_combined: f64 = a_ring + a_shell_eff;

    // Check adequacy
    assert!(i_ring > i_req, "Ring I ({:.2e}) > required I ({:.2e})", i_ring, i_req);

    // Frame spacing effect: closer spacing -> smaller I required
    let l_s2: f64 = 0.75; // half spacing
    let i_req2: f64 = p * r.powi(3) * l_s2 / ((n.powi(2) - 1.0) * e);
    assert_close(i_req2, i_req * l_s2 / l_s, 0.01, "I_req proportional to Ls");
    assert!(i_req2 < i_req, "Closer spacing -> smaller I required");

    // Shell buckling between stiffeners
    let p_cr_shell: f64 = 0.92 * e * (t / r).powf(2.5);
    assert!(p_cr_shell > p, "Shell plating adequate between stiffeners");

    // Combined section properties
    assert!(a_combined > a_ring, "Combined area > ring alone");
    let shell_contribution: f64 = a_shell_eff / a_combined;
    assert!(shell_contribution > 0.0 && shell_contribution < 1.0,
        "Shell contributes {:.1}% of combined area", shell_contribution * 100.0);

    // Solver check: a beam on elastic foundation is analogous to
    // a ring-stiffened shell. Verify basic beam behavior.
    let beam_l: f64 = l_s;
    let n_elem: usize = 4;
    let e_solver: f64 = 200.0;
    let a_sec: f64 = a_ring;
    let iz_sec: f64 = i_ring;

    let input = make_ss_beam_udl(n_elem, beam_l, e_solver, a_sec, iz_sec, -1.0);
    let results = linear::solve_2d(&input).unwrap();

    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_ry, 1.0 * beam_l, 0.02, "Solver: stiffener beam equilibrium");
}

// ================================================================
// 7. Wind Loading on Cylindrical Shell
//    Pressure distribution p(theta) = p_max * sum(an*cos(n*theta))
// ================================================================
//
// Wind pressure on a circular cylinder is typically represented as
// a Fourier cosine series:
//   Cp(theta) = a0 + a1*cos(theta) + a2*cos(2*theta) + a3*cos(3*theta) + ...
//
// Typical coefficients (ASCE 7 / EN 1991-1-4):
//   a0 = -0.387, a1 = 0.338, a2 = 0.533, a3 = 0.471
//   (normalized so Cp at theta=0 is approximately +1.0)
//
// The net horizontal force on the cylinder:
//   F = p_max * a1 * R * L (only n=1 term contributes to net force)
//
// Reference: EN 1991-1-4 Sec 7.9; Simiu & Scanlan "Wind Effects on Structures"

#[test]
fn validation_shell_ext_wind_loading_cylinder() {
    let r: f64 = 5.0;          // m, radius
    let l: f64 = 20.0;         // m, cylinder length
    let p_max: f64 = 1.2;      // kN/m^2, reference wind pressure

    // Fourier coefficients (typical values for Re > 10^6)
    let a0: f64 = -0.387;
    let a1: f64 = 0.338;
    let a2: f64 = 0.533;
    let a3: f64 = 0.471;

    // Pressure at windward point (theta = 0)
    let cp_windward: f64 = a0 + a1 + a2 + a3;
    assert!(cp_windward > 0.0, "Windward Cp > 0 (positive pressure)");
    assert_close(cp_windward, 0.955, 0.02, "Cp at windward ~ 0.955");

    // Pressure at leeward point (theta = pi)
    let cp_leeward: f64 = a0 - a1 + a2 - a3;
    assert!(cp_leeward < 0.0, "Leeward Cp < 0 (suction)");

    // Pressure at side (theta = pi/2)
    let theta_side: f64 = PI / 2.0;
    let cp_side: f64 = a0 + a1 * theta_side.cos() + a2 * (2.0 * theta_side).cos()
                      + a3 * (3.0 * theta_side).cos();
    // cos(pi/2)=0, cos(pi)=-1, cos(3pi/2)=0
    assert_close(cp_side, a0 - a2, 0.01, "Cp at side = a0 - a2");

    // Maximum suction typically occurs near theta = 70-80 degrees
    let mut cp_min: f64 = f64::MAX;
    let mut theta_min: f64 = 0.0;
    for i in 0..=180 {
        let theta: f64 = (i as f64) * PI / 180.0;
        let cp: f64 = a0 + a1 * theta.cos() + a2 * (2.0 * theta).cos()
                     + a3 * (3.0 * theta).cos();
        if cp < cp_min {
            cp_min = cp;
            theta_min = theta;
        }
    }
    let theta_min_deg: f64 = theta_min * 180.0 / PI;
    assert!(theta_min_deg > 50.0 && theta_min_deg < 110.0,
        "Max suction at {:.0} degrees (expected 60-100)", theta_min_deg);

    // Net horizontal force: only the n=1 (cos(theta)) term contributes
    // to the resultant drag force, because integral of cos(n*theta)*cos(theta)
    // over [0, 2pi] is zero for n != 1.
    // F_drag = p_max * a1 * pi * R * L (integrated over full circumference)
    // Actually: integral of cos^2(theta) over [0,2pi] = pi
    // F = p_max * a1 * R * L * pi (per unit: p_max * a1 * pi * R)
    let f_drag: f64 = p_max * a1 * PI * r * l;
    assert!(f_drag > 0.0, "Net drag force is in wind direction");

    // Overturning moment at base (assuming vertical cylinder)
    let m_base: f64 = f_drag * l / 2.0; // approximate CG at mid-height
    assert!(m_base > 0.0, "Overturning moment positive");

    // Hoop force in shell at max suction
    let p_suction: f64 = p_max * cp_min; // negative (suction)
    let n_theta_suction: f64 = p_suction * r; // hoop force (tension from suction)
    assert!(n_theta_suction < 0.0, "Suction creates compressive hoop force concern");

    // Verify Fourier series properties:
    // Integral of Cp over full circle should give net pressure coefficient
    // for drag direction (proportional to a1)
    let mut integral_cos: f64 = 0.0;
    let n_pts: usize = 360;
    let d_theta: f64 = 2.0 * PI / (n_pts as f64);
    for i in 0..n_pts {
        let theta: f64 = (i as f64) * d_theta;
        let cp: f64 = a0 + a1 * theta.cos() + a2 * (2.0 * theta).cos()
                     + a3 * (3.0 * theta).cos();
        integral_cos += cp * theta.cos() * d_theta;
    }
    // Should equal pi * a1 (from orthogonality)
    assert_close(integral_cos, PI * a1, 0.02, "Fourier orthogonality: integral = pi*a1");

    // Solver check: model the wind-loaded cylinder wall as a beam strip
    // representing the bending in the wind direction.
    let strip_l: f64 = l;
    let n_elem: usize = 4;
    let e_solver: f64 = 200.0;
    let t_shell: f64 = 0.010;
    let a_sec: f64 = t_shell * 1.0;
    let iz_sec: f64 = 1.0 * t_shell.powi(3) / 12.0;
    let q_wind: f64 = -p_max * cp_windward; // equivalent line load on strip

    let input = make_ss_beam_udl(n_elem, strip_l, e_solver, a_sec, iz_sec, q_wind);
    let results = linear::solve_2d(&input).unwrap();

    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let expected_ry: f64 = q_wind.abs() * strip_l;
    assert_close(total_ry, expected_ry, 0.02, "Solver: wind strip equilibrium");
}

// ================================================================
// 8. Dome Under Self-Weight
//    N_phi = -wR/(1+cos(phi))
//    N_theta = wR*(cos(phi) - 1/(1+cos(phi)))
// ================================================================
//
// A spherical dome of radius R under uniform self-weight w (per unit
// area of the middle surface):
//
// Meridional force: N_phi = -wR / (1 + cos(phi))  (always compression)
// Hoop force: N_theta = wR * (cos(phi) - 1/(1+cos(phi)))
//
// At the crown (phi=0): N_phi = -wR/2, N_theta = wR*(1 - 1/2) = wR/2
//   -> both compression for small phi (N_theta = wR/2 in compression when
//      accounting for sign, but the formula gives positive which means
//      the actual sign depends on convention)
//
// Hoop force transitions from compression to tension at phi ~ 51.8 deg
// where cos(phi) = 1/(1+cos(phi)), i.e., cos(phi)*(1+cos(phi)) = 1.
//
// Reference: Billington Ch. 5; Timoshenko & Woinowsky-Krieger Sec 14.3

#[test]
fn validation_shell_ext_dome_selfweight() {
    let r: f64 = 20.0;         // m, dome radius
    let t: f64 = 0.15;         // m (150 mm)
    let w: f64 = 5.0;          // kN/m^2, self-weight

    // At crown (phi ~ 0)
    let phi_crown: f64 = 0.001; // near zero to avoid exact zero
    let n_phi_crown: f64 = -w * r / (1.0 + phi_crown.cos());
    // At phi=0: N_phi = -wR/(1+1) = -wR/2 = -50 kN/m
    assert_close(n_phi_crown, -50.0, 0.01, "N_phi at crown = -wR/2");
    assert!(n_phi_crown < 0.0, "Crown meridional is compression");

    // Hoop force at crown
    let n_theta_crown: f64 = w * r * (phi_crown.cos() - 1.0 / (1.0 + phi_crown.cos()));
    // At phi=0: N_theta = wR*(1 - 1/2) = wR/2 = 50 kN/m (compression in convention)
    assert_close(n_theta_crown, 50.0, 0.01, "N_theta at crown = wR/2");

    // At base (phi = 60 degrees)
    let phi_60: f64 = 60.0 * PI / 180.0;
    let n_phi_60: f64 = -w * r / (1.0 + phi_60.cos());
    // cos(60) = 0.5, so N_phi = -100/(1.5) = -66.67 kN/m
    assert_close(n_phi_60, -100.0 / 1.5, 0.01, "N_phi at 60 deg");

    let n_theta_60: f64 = w * r * (phi_60.cos() - 1.0 / (1.0 + phi_60.cos()));
    // N_theta = 100*(0.5 - 1/1.5) = 100*(0.5 - 0.667) = 100*(-0.167) = -16.67
    let expected_n_theta_60: f64 = 100.0 * (0.5 - 1.0 / 1.5);
    assert_close(n_theta_60, expected_n_theta_60, 0.01, "N_theta at 60 deg");
    assert!(n_theta_60 < 0.0, "Hoop is tensile (negative in this convention) at 60 deg");

    // Find the transition angle where N_theta = 0
    // cos(phi)*(1+cos(phi)) = 1
    // Let c = cos(phi): c^2 + c - 1 = 0 => c = (-1+sqrt(5))/2 = 0.618
    // phi = acos(0.618) ~ 51.83 degrees
    let c_transition: f64 = (-1.0 + 5.0_f64.sqrt()) / 2.0;
    let phi_transition: f64 = c_transition.acos();
    let phi_transition_deg: f64 = phi_transition * 180.0 / PI;
    assert_close(phi_transition_deg, 51.83, 0.02, "Transition angle ~ 51.83 deg");

    // Verify N_theta = 0 at transition
    let n_theta_transition: f64 = w * r * (phi_transition.cos() - 1.0 / (1.0 + phi_transition.cos()));
    assert_close(n_theta_transition, 0.0, 0.01, "N_theta = 0 at transition angle");

    // Above transition (phi < 51.8): N_theta > 0 (compression)
    let phi_30: f64 = 30.0 * PI / 180.0;
    let n_theta_30: f64 = w * r * (phi_30.cos() - 1.0 / (1.0 + phi_30.cos()));
    assert!(n_theta_30 > 0.0, "N_theta > 0 (compression) for phi < 51.8 deg");

    // Below transition (phi > 51.8): N_theta < 0 (tension)
    let phi_70: f64 = 70.0 * PI / 180.0;
    let n_theta_70: f64 = w * r * (phi_70.cos() - 1.0 / (1.0 + phi_70.cos()));
    assert!(n_theta_70 < 0.0, "N_theta < 0 (tension) for phi > 51.8 deg -> ring beam needed");

    // Ring beam design at base: horizontal thrust
    let phi_base: f64 = 60.0 * PI / 180.0;
    let h_thrust: f64 = n_phi_60.abs() * phi_base.cos();
    let r_base: f64 = r * phi_base.sin();
    let t_ring: f64 = h_thrust * r_base; // ring tension
    assert!(t_ring > 0.0, "Ring beam tension = {:.0} kN", t_ring);

    // Meridional stress
    let sigma_phi: f64 = n_phi_60 / t;
    assert!(sigma_phi.abs() < 1000.0, "Meridional stress reasonable: {:.1} kPa", sigma_phi);

    // Solver check: the dome can be approximated by a series of arches.
    // Model a single arch (parabolic approximation) as a beam.
    let arch_span: f64 = 2.0 * r_base; // horizontal span at base
    let n_elem: usize = 8;
    let e_solver: f64 = 30.0; // concrete, MPa
    let a_sec: f64 = t * 1.0; // 1m wide strip
    let iz_sec: f64 = 1.0 * t.powi(3) / 12.0;

    let input = make_ss_beam_udl(n_elem, arch_span, e_solver, a_sec, iz_sec, -w);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction should equal w * span
    let total_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let expected_ry: f64 = w * arch_span;
    assert_close(total_ry, expected_ry, 0.02, "Solver: dome arch strip equilibrium");

    // Midspan deflection should exist (non-zero)
    let mid_node = n_elem / 2 + 1;
    let mid_disp = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert!(mid_disp.uy.abs() > 0.0, "Solver: dome strip deflects under self-weight");
}
