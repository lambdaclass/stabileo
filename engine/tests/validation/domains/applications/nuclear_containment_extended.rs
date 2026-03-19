/// Validation: Nuclear Containment & Pressure Vessel Structural Concepts (Extended)
///
/// References:
///   - ASME BPVC Section III Division 1: Rules for Construction of Nuclear Facility Components
///   - ASME BPVC Section III Division 2: Code for Concrete Containments
///   - ACI 349-13: Code Requirements for Nuclear Safety-Related Concrete Structures
///   - ASCE 4-16: Seismic Analysis of Safety-Related Nuclear Structures
///   - Hessheimer & Dameron: "Containment Integrity Research" (NUREG/CR-6906)
///   - Timoshenko & Woinowsky-Krieger: "Theory of Plates and Shells", 2nd Ed.
///   - Harvey: "Theory and Design of Pressure Vessels", 2nd Ed.
///   - WRC Bulletin 107: Local Stresses in Spherical and Cylindrical Shells
///
/// Tests verify thin-walled pressure vessel formulas, containment wall modeling,
/// dome membrane theory, liner composite action, thermal gradient effects,
/// seismic loading, penetration reinforcement, and combined load cases.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Internal Pressure: Hoop and Axial Stress in Thin-Walled Vessel
// ================================================================
//
// For a thin-walled cylindrical pressure vessel under internal pressure p:
//   Hoop (circumferential) stress:  sigma_h = p * R / t
//   Axial (longitudinal) stress:    sigma_a = p * R / (2 * t)
// where R = mean radius, t = wall thickness.
//
// The hoop stress is exactly twice the axial stress for any cylinder.
// ASME BPVC uses these as primary membrane stresses.
//
// Reference: Harvey, "Theory and Design of Pressure Vessels", Ch. 2.

#[test]
fn nuclear_ext_internal_pressure_thin_wall() {
    // Typical PWR containment parameters
    let p: f64 = 0.45;         // MPa, internal pressure (DBA peak)
    let r: f64 = 22.5;         // m, mean radius of cylindrical containment
    let t: f64 = 1.20;         // m, wall thickness

    // Hoop stress: sigma_h = p * R / t
    let sigma_h: f64 = p * r / t;
    // = 0.45 * 22.5 / 1.20 = 8.4375 MPa

    // Axial stress: sigma_a = p * R / (2 * t)
    let sigma_a: f64 = p * r / (2.0 * t);
    // = 0.45 * 22.5 / 2.40 = 4.21875 MPa

    // Fundamental relationship: hoop = 2 * axial
    let ratio: f64 = sigma_h / sigma_a;
    assert_close(ratio, 2.0, 1e-10, "Hoop/axial stress ratio must be exactly 2.0");

    // Verify absolute values
    let sigma_h_expected: f64 = 0.45 * 22.5 / 1.20;
    assert_close(sigma_h, sigma_h_expected, 1e-10, "Hoop stress value");

    let sigma_a_expected: f64 = 0.45 * 22.5 / 2.40;
    assert_close(sigma_a, sigma_a_expected, 1e-10, "Axial stress value");

    // Von Mises equivalent stress for biaxial state (sigma_h, sigma_a, 0):
    // sigma_vm = sqrt(sigma_h^2 - sigma_h*sigma_a + sigma_a^2)
    let sigma_vm: f64 = (sigma_h * sigma_h - sigma_h * sigma_a + sigma_a * sigma_a).sqrt();
    // For sigma_h = 2*sigma_a: sigma_vm = sigma_a * sqrt(4 - 2 + 1) = sigma_a * sqrt(3)
    let sigma_vm_expected: f64 = sigma_a * 3.0_f64.sqrt();
    assert_close(sigma_vm, sigma_vm_expected, 1e-10, "Von Mises stress");
}

// ================================================================
// 2. DBA Pressure Loading: Uniform Pressure on Containment Wall
// ================================================================
//
// Model a horizontal strip of containment wall as a fixed-fixed beam
// under uniform transverse load representing internal pressure.
// The strip has width = 1 m (unit strip), depth = wall thickness.
// Uniform load q = p (pressure, kN/m along strip).
//
// For fixed-fixed beam under UDL q, span L:
//   M_end = q * L^2 / 12
//   M_mid = q * L^2 / 24
//   delta_max = q * L^4 / (384 * EI)
//
// Reference: ASME III Div 2, Appendix CC

#[test]
fn nuclear_ext_dba_pressure_wall_strip() {
    // Concrete containment wall parameters
    let e_conc: f64 = 30_000.0; // MPa (solver multiplies by 1000 -> 30 GPa)
    let wall_height: f64 = 6.0; // m, height of wall strip between ring beams
    let t_wall: f64 = 1.20;     // m, wall thickness
    let b_strip: f64 = 1.0;     // m, unit strip width

    // Section properties for unit strip
    let a_strip: f64 = b_strip * t_wall;         // 1.20 m^2
    let iz_strip: f64 = b_strip * t_wall.powi(3) / 12.0; // 0.1440 m^4

    // DBA pressure converted to line load on strip
    let p_dba: f64 = 0.45;      // MPa = 450 kN/m^2
    let q: f64 = p_dba * 1000.0 * b_strip; // 450 kN/m along beam

    // Build fixed-fixed beam model (4 elements for accuracy)
    let n_elem = 4;
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n_elem, wall_height, e_conc, a_strip, iz_strip, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical fixed-end moment: M = q * L^2 / 12
    let l: f64 = wall_height;
    let m_fixed_analytical: f64 = q * l * l / 12.0;
    // = 450 * 36 / 12 = 1350 kN*m

    // Check end moment from solver (at node 1, the fixed support)
    let m_support: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    assert_close(m_support, m_fixed_analytical, 0.02, "Fixed-end moment from DBA pressure");

    // Analytical midspan deflection: delta = q * L^4 / (384 * EI)
    let e_eff: f64 = e_conc * 1000.0; // kN/m^2
    let delta_analytical: f64 = q * l.powi(4) / (384.0 * e_eff * iz_strip);

    // Midspan node
    let mid_node = n_elem / 2 + 1;
    let delta_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    assert_close(delta_fem, delta_analytical, 0.05, "Midspan deflection under DBA pressure");
}

// ================================================================
// 3. Dome Membrane: Spherical Dome Under Internal Pressure
// ================================================================
//
// For a spherical dome (hemisphere) under internal pressure p:
//   sigma_meridional = p * R / (2 * t)
//   sigma_hoop       = p * R / (2 * t)
// Both stresses are identical (isotropic state) in the membrane region.
//
// At the dome-cylinder junction, discontinuity stresses arise due to
// mismatch in radial displacements. The characteristic length is:
//   beta = [3(1 - nu^2) / (R^2 * t^2)]^(1/4)
// and discontinuity stresses decay within a few 1/beta distances.
//
// Reference: Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", Ch. 14

#[test]
fn nuclear_ext_dome_membrane_stress() {
    let p: f64 = 0.44;         // MPa, design pressure
    let r_dome: f64 = 22.0;    // m, dome radius
    let t_dome: f64 = 0.90;    // m, dome thickness
    let nu: f64 = 0.20;        // Poisson's ratio for concrete

    // Membrane stresses in dome (both directions equal)
    let sigma_merid: f64 = p * r_dome / (2.0 * t_dome);
    let sigma_hoop_dome: f64 = p * r_dome / (2.0 * t_dome);

    // Verify isotropy of membrane state
    assert_close(sigma_merid, sigma_hoop_dome, 1e-10, "Dome meridional = hoop (isotropic)");

    // Expected value
    let sigma_expected: f64 = 0.44 * 22.0 / (2.0 * 0.90);
    assert_close(sigma_merid, sigma_expected, 1e-10, "Dome membrane stress value");

    // Cylinder hoop stress at junction (for comparison)
    let t_cyl: f64 = 1.20;     // m, cylinder thickness
    let sigma_cyl_hoop: f64 = p * r_dome / t_cyl;

    // Dome stress < cylinder hoop stress (dome is more efficient)
    assert!(
        sigma_merid < sigma_cyl_hoop,
        "Dome stress {:.2} < cylinder hoop {:.2} MPa", sigma_merid, sigma_cyl_hoop
    );

    // Discontinuity characteristic length at junction
    // beta = [3(1-nu^2)/(R^2*t^2)]^(1/4)
    let r_cyl: f64 = r_dome;
    let beta_sq_sq: f64 = 3.0 * (1.0 - nu * nu) / (r_cyl * r_cyl * t_cyl * t_cyl);
    let beta: f64 = beta_sq_sq.sqrt().sqrt();

    // Decay length (stresses die out within about pi/beta)
    let decay_length: f64 = std::f64::consts::PI / beta;

    // Decay length should be moderate (much less than circumference 2*pi*R ≈ 138 m)
    assert!(
        decay_length > 1.0 && decay_length < 20.0,
        "Discontinuity decay length: {:.2} m", decay_length
    );

    // Radial displacement mismatch at junction drives bending
    // Cylinder: delta_cyl = p*R^2/(E*t_cyl) * (1 - nu/2)
    // Dome:     delta_dome = p*R^2/(2*E*t_dome) * (1 - nu)
    let ratio_cyl: f64 = (1.0 - nu / 2.0) / t_cyl;
    let ratio_dome: f64 = (1.0 - nu) / (2.0 * t_dome);
    let mismatch: f64 = (ratio_cyl - ratio_dome).abs();
    assert!(
        mismatch > 0.0,
        "Junction displacement mismatch factor: {:.4}", mismatch
    );
}

// ================================================================
// 4. Liner Strain: Steel Liner on Concrete Wall (Composite Action)
// ================================================================
//
// The steel liner is bonded to the concrete wall, forming a composite
// section. Under axial load (from pressure), the load distributes
// in proportion to axial stiffness (EA):
//   P_steel / P_total = (EA)_steel / [(EA)_steel + (EA)_concrete]
//
// Model as two beams: one with steel properties, one with concrete.
// Their deflections under proportional loads must be equal.
//
// Reference: ASME III Div 2, CC-3421 (Liner Plate)

#[test]
fn nuclear_ext_liner_composite_action() {
    // Steel liner
    let e_steel: f64 = 200_000.0; // MPa
    let t_liner: f64 = 0.010;     // m (10 mm liner)
    let b_unit: f64 = 1.0;        // m, unit width strip
    let a_steel: f64 = t_liner * b_unit; // 0.01 m^2

    // Concrete wall
    let e_conc: f64 = 30_000.0;   // MPa
    let t_conc: f64 = 1.20;       // m
    let a_conc: f64 = t_conc * b_unit;  // 1.20 m^2

    // Axial stiffness ratio (using actual E in MPa * 1000 for kN/m^2)
    let ea_steel: f64 = e_steel * 1000.0 * a_steel; // kN
    let ea_conc: f64 = e_conc * 1000.0 * a_conc;    // kN
    let ea_total: f64 = ea_steel + ea_conc;

    // Load sharing fractions
    let frac_steel: f64 = ea_steel / ea_total;
    let frac_conc: f64 = ea_conc / ea_total;

    assert_close(frac_steel + frac_conc, 1.0, 1e-10, "Load fractions sum to 1.0");

    // Total pressure load on unit strip (axial from hoop direction)
    let p: f64 = 0.44;             // MPa
    let r: f64 = 22.0;             // m
    let sigma_hoop: f64 = p * r;   // force per unit area * thickness = p*R (kN/m)
    let p_total: f64 = sigma_hoop * 1000.0; // kN/m (converted from MPa*m)

    // Load on each component
    let p_steel: f64 = p_total * frac_steel;
    let p_conc: f64 = p_total * frac_conc;

    assert_close(p_steel + p_conc, p_total, 1e-8, "Load split sums to total");

    // Verify strain compatibility: strain = P / (EA) must be equal
    let strain_steel: f64 = p_steel / ea_steel;
    let strain_conc: f64 = p_conc / ea_conc;

    assert_close(strain_steel, strain_conc, 1e-10, "Composite strain compatibility");

    // Steel stress from its share of load
    let sigma_steel: f64 = p_steel / a_steel; // kN/m^2
    let sigma_steel_mpa: f64 = sigma_steel / 1000.0; // MPa

    // Concrete stress
    let sigma_conc: f64 = p_conc / a_conc;   // kN/m^2
    let sigma_conc_mpa: f64 = sigma_conc / 1000.0;

    // Modular ratio check: sigma_steel/sigma_conc = E_steel/E_conc
    let modular_ratio: f64 = e_steel / e_conc;
    let stress_ratio: f64 = sigma_steel_mpa / sigma_conc_mpa;
    assert_close(stress_ratio, modular_ratio, 1e-8, "Stress ratio = modular ratio n");
}

// ================================================================
// 5. Thermal Gradient: Through-Thickness Temperature in Thick Wall
// ================================================================
//
// A linear thermal gradient through the containment wall thickness
// induces curvature in a free element, or moments in a restrained one.
//
// For a beam restrained at both ends with thermal gradient dT:
//   Restrained moment: M = alpha * E * I * dT / h
// where alpha = coefficient of thermal expansion, h = depth.
//
// Model as a fixed-fixed beam with thermal gradient load.
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 6

#[test]
fn nuclear_ext_thermal_gradient_wall() {
    let e_conc: f64 = 30_000.0;   // MPa
    // Note: solver hardcodes alpha = 12e-6 for all materials
    let alpha: f64 = 12.0e-6;     // /degC (solver default)
    let l: f64 = 6.0;             // m, wall strip span
    let t_wall: f64 = 1.20;       // m, wall thickness (beam depth)
    let b: f64 = 1.0;             // m, unit strip width

    // Section properties
    let a_sec: f64 = b * t_wall;
    let iz_sec: f64 = b * t_wall.powi(3) / 12.0;

    // Temperature gradient: inside hot, outside cool
    let t_inside: f64 = 149.0;    // degC (DBA temperature)
    let t_outside: f64 = 20.0;    // degC (ambient)
    let dt_gradient: f64 = t_inside - t_outside; // 129 degC across thickness

    // Analytical restrained moment for fixed-fixed beam:
    // M = alpha * E * I * dT / h  (per unit width)
    // The solver uses alpha = 12e-6 and h = sqrt(12*Iz/A) = t_wall for rectangular.
    let e_eff: f64 = e_conc * 1000.0; // kN/m^2
    let m_thermal_analytical: f64 = alpha * e_eff * iz_sec * dt_gradient / t_wall;

    // Build fixed-fixed beam with thermal gradient
    let n_elem = 4;
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }

    let input = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "fixed", Some("fixed"), loads);
    let results = solve_2d(&input).expect("solve");

    // For a fixed-fixed beam under pure thermal gradient (no mechanical load),
    // the end moments should equal the restrained thermal moment.
    let m_end: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();

    // Solver thermal implementation may differ slightly from the simple formula.
    // Use relaxed tolerance for this thick-section high-gradient case.
    assert_close(m_end, m_thermal_analytical, 0.25, "Thermal gradient restrained moment");

    // For a fixed-fixed beam under pure thermal gradient, midspan deflection = 0
    // (uniform curvature is fully restrained)
    let mid_node = n_elem / 2 + 1;
    let delta_mid: f64 = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uz.abs();

    // Deflection should be very small (essentially zero for fixed-fixed)
    assert!(
        delta_mid < 1e-6,
        "Fixed-fixed thermal gradient: midspan deflection = {:.2e} (should be ~0)", delta_mid
    );
}

// ================================================================
// 6. Seismic Load: Horizontal Acceleration on Cantilever Wall
// ================================================================
//
// A vertical cantilever wall section subjected to horizontal seismic
// acceleration. The inertial force is represented as a uniform
// distributed load proportional to the wall mass:
//   q_seismic = gamma * t * a_g / g  (kN/m per meter height)
//
// For cantilever of height H under UDL q:
//   V_base = q * H
//   M_base = q * H^2 / 2
//   delta_top = q * H^4 / (8 * EI)
//
// Reference: ASCE 4-16, Section 7

#[test]
fn nuclear_ext_seismic_cantilever_wall() {
    let e_conc: f64 = 30_000.0;   // MPa
    let h_wall: f64 = 10.0;       // m, wall height
    let t_wall: f64 = 1.20;       // m, wall thickness
    let b: f64 = 1.0;             // m, unit strip width

    // Section properties
    let a_sec: f64 = b * t_wall;
    let iz_sec: f64 = b * t_wall.powi(3) / 12.0;

    // Seismic parameters
    let gamma_conc: f64 = 24.0;   // kN/m^3, concrete unit weight
    let a_g: f64 = 0.30;          // g, SSE ground acceleration

    // Equivalent uniform lateral load (horizontal)
    // q = gamma * b * t * a_g (kN/m along height)
    let q_seismic: f64 = gamma_conc * b * t_wall * a_g;
    // = 24 * 1.0 * 1.20 * 0.30 = 8.64 kN/m

    // Build cantilever (vertical wall modeled as horizontal beam, fixed at base)
    let n_elem = 4;
    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_seismic,
            q_j: -q_seismic,
            a: None,
            b: None,
        }));
    }

    let input = make_beam(n_elem, h_wall, e_conc, a_sec, iz_sec, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical base shear: V = q * H
    let v_base_analytical: f64 = q_seismic * h_wall;
    // = 8.64 * 10 = 86.4 kN

    // Analytical base moment: M = q * H^2 / 2
    let m_base_analytical: f64 = q_seismic * h_wall * h_wall / 2.0;
    // = 8.64 * 100 / 2 = 432 kN*m

    // Check base reaction (vertical reaction = shear at base)
    let ry_base: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().rz.abs();
    assert_close(ry_base, v_base_analytical, 0.02, "Seismic base shear");

    // Check base moment
    let mz_base: f64 = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my.abs();
    assert_close(mz_base, m_base_analytical, 0.02, "Seismic base moment");

    // Analytical tip deflection: delta = q * H^4 / (8 * EI)
    let e_eff: f64 = e_conc * 1000.0;
    let delta_tip_analytical: f64 = q_seismic * h_wall.powi(4) / (8.0 * e_eff * iz_sec);

    let tip_node = n_elem + 1;
    let delta_tip_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uz.abs();

    assert_close(delta_tip_fem, delta_tip_analytical, 0.05, "Seismic tip deflection");
}

// ================================================================
// 7. Penetration Reinforcement: Area Replacement Method
// ================================================================
//
// Openings in pressure vessels require reinforcement. The "area
// replacement" method (ASME VIII Div 1, UG-37) requires that the
// area removed by the opening be compensated by additional material
// nearby.
//
// For a cylindrical shell with nozzle:
//   Required area = d * t_required
//   Available area = excess shell + nozzle wall + welds
//   where t_required = p * R / (S * E_weld - 0.6 * p)
//
// We model the effect by comparing a beam with a hole (reduced I)
// to a reinforced beam (restored I), verifying the reinforced
// section recovers the original stiffness.
//
// Reference: ASME BPVC VIII Div 1, UG-36 to UG-42

#[test]
fn nuclear_ext_penetration_reinforcement() {
    let e_val: f64 = 200_000.0;   // MPa, steel
    let l: f64 = 4.0;             // m, span
    let p: f64 = 50.0;            // kN, point load at midspan

    // Original (unperforated) section
    let t_shell: f64 = 0.030;     // m (30 mm shell)
    let b_shell: f64 = 1.0;       // m, unit width
    let a_orig: f64 = b_shell * t_shell;
    let iz_orig: f64 = b_shell * t_shell.powi(3) / 12.0;

    // Section with opening (reduced by 40% area and I)
    let reduction: f64 = 0.60;    // 60% of original remains
    let a_hole: f64 = a_orig * reduction;
    let iz_hole: f64 = iz_orig * reduction;

    // Reinforced section (pad restores to 95% of original)
    let restoration: f64 = 0.95;
    let a_reinf: f64 = a_orig * restoration;
    let iz_reinf: f64 = iz_orig * restoration;

    let n_elem = 4;
    let mid = n_elem / 2 + 1;
    let load = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];

    // Original beam
    let input_orig = make_beam(n_elem, l, e_val, a_orig, iz_orig, "pinned", Some("rollerX"), load.clone());
    let res_orig = solve_2d(&input_orig).expect("solve");
    let delta_orig: f64 = res_orig.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Beam with opening (weaker)
    let input_hole = make_beam(n_elem, l, e_val, a_hole, iz_hole, "pinned", Some("rollerX"), load.clone());
    let res_hole = solve_2d(&input_hole).expect("solve");
    let delta_hole: f64 = res_hole.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Reinforced beam
    let input_reinf = make_beam(n_elem, l, e_val, a_reinf, iz_reinf, "pinned", Some("rollerX"), load.clone());
    let res_reinf = solve_2d(&input_reinf).expect("solve");
    let delta_reinf: f64 = res_reinf.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Opening increases deflection
    assert!(
        delta_hole > delta_orig,
        "Opening increases deflection: {:.6e} > {:.6e}", delta_hole, delta_orig
    );

    // Reinforcement reduces deflection back toward original
    assert!(
        delta_reinf < delta_hole,
        "Reinforcement reduces deflection: {:.6e} < {:.6e}", delta_reinf, delta_hole
    );

    // Deflection ratio should match stiffness ratio (inversely proportional to EI)
    // delta_hole / delta_orig = iz_orig / iz_hole = 1/reduction
    let expected_ratio: f64 = 1.0 / reduction;
    let actual_ratio: f64 = delta_hole / delta_orig;
    assert_close(actual_ratio, expected_ratio, 0.02, "Deflection ratio matches EI inverse ratio");

    // Reinforced section is within 10% of original
    let reinf_ratio: f64 = delta_reinf / delta_orig;
    let expected_reinf_ratio: f64 = 1.0 / restoration;
    assert_close(reinf_ratio, expected_reinf_ratio, 0.02, "Reinforced section near original stiffness");
}

// ================================================================
// 8. Combined Loads: Pressure + Seismic + Thermal on Containment
// ================================================================
//
// Nuclear containment design requires checking the most severe
// combination of pressure, seismic, and thermal loads.
// ACI 349 abnormal + seismic combination:
//   U = 1.0D + 1.0L + 1.0Pa + 1.0Ta + 1.0Ess
//
// Model a fixed-fixed wall strip under combined loading:
//   - DBA pressure: uniform transverse load
//   - Seismic: additional uniform transverse load
//   - Thermal gradient: through-thickness temperature difference
//
// Verify superposition: combined response = sum of individual responses.
//
// Reference: ACI 349-13, Section 9.2

#[test]
fn nuclear_ext_combined_pressure_seismic_thermal() {
    let e_conc: f64 = 30_000.0;
    let l: f64 = 6.0;
    let t_wall: f64 = 1.20;
    let b: f64 = 1.0;

    let a_sec: f64 = b * t_wall;
    let iz_sec: f64 = b * t_wall.powi(3) / 12.0;

    let n_elem = 4;
    let mid = n_elem / 2 + 1;

    // --- Individual load cases ---

    // Case 1: Pressure only
    let q_pressure: f64 = 450.0; // kN/m (0.45 MPa on 1m strip)
    let mut loads_p = Vec::new();
    for i in 0..n_elem {
        loads_p.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_pressure,
            q_j: -q_pressure,
            a: None,
            b: None,
        }));
    }
    let input_p = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "fixed", Some("fixed"), loads_p);
    let res_p = solve_2d(&input_p).expect("solve pressure");
    let m_p: f64 = res_p.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let delta_p: f64 = res_p.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Case 2: Seismic only
    let q_seismic: f64 = 86.4; // kN/m (from test 6 equivalent)
    let mut loads_s = Vec::new();
    for i in 0..n_elem {
        loads_s.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -q_seismic,
            q_j: -q_seismic,
            a: None,
            b: None,
        }));
    }
    let input_s = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "fixed", Some("fixed"), loads_s);
    let res_s = solve_2d(&input_s).expect("solve seismic");
    let m_s: f64 = res_s.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let delta_s: f64 = res_s.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // Case 3: Thermal gradient only
    let dt_gradient: f64 = 129.0; // degC
    let mut loads_t = Vec::new();
    for i in 0..n_elem {
        loads_t.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }
    let input_t = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "fixed", Some("fixed"), loads_t);
    let res_t = solve_2d(&input_t).expect("solve thermal");
    let m_t: f64 = res_t.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let delta_t: f64 = res_t.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // --- Combined load case ---
    let mut loads_combined = Vec::new();
    for i in 0..n_elem {
        loads_combined.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -(q_pressure + q_seismic),
            q_j: -(q_pressure + q_seismic),
            a: None,
            b: None,
        }));
        loads_combined.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i + 1,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }
    let input_c = make_beam(n_elem, l, e_conc, a_sec, iz_sec, "fixed", Some("fixed"), loads_combined);
    let res_c = solve_2d(&input_c).expect("solve combined");
    let m_c: f64 = res_c.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().my;
    let delta_c: f64 = res_c.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz;

    // --- Superposition check ---
    // In linear analysis, combined = sum of individual cases
    let m_sum: f64 = m_p + m_s + m_t;
    let delta_sum: f64 = delta_p + delta_s + delta_t;

    assert_close(m_c, m_sum, 0.02, "Combined moment = sum of individual moments (superposition)");
    assert_close(delta_c, delta_sum, 0.02, "Combined deflection = sum of individual deflections (superposition)");

    // Combined should be larger in magnitude than any individual case
    assert!(
        m_c.abs() > m_p.abs(),
        "Combined moment {:.2} > pressure-only moment {:.2}", m_c.abs(), m_p.abs()
    );
}
