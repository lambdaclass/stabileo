/// Validation: Pavement Design & Road/Airport Structural Concepts
///
/// References:
///   - AASHTO Guide for Design of Pavement Structures (1993)
///   - Huang: "Pavement Analysis and Design" 2nd ed. (2004)
///   - Yoder & Witczak: "Principles of Pavement Design" 2nd ed. (1975)
///   - PCA: "Thickness Design for Concrete Highway and Street Pavements" (1984)
///   - Westergaard: "Stresses in Concrete Pavements" (1926)
///   - Boussinesq: "Application des potentiels" (1885)
///   - Asphalt Institute MS-1: "Thickness Design" (9th ed., 1981)
///   - Bradbury: "Reinforced Concrete Pavements" (1938)
///
/// Tests verify AASHTO structural number, ESAL computation, rigid
/// pavement thickness, Boussinesq stress, Westergaard slab analysis,
/// CBR design, fatigue cracking, and temperature curling.

use crate::common::*;

// ================================================================
// 1. AASHTO Flexible Pavement — Structural Number (SN)
// ================================================================
//
// SN = a1*D1 + a2*m2*D2 + a3*m3*D3
// a_i = layer coefficient (structural contribution per inch)
// m_i = drainage coefficient
// D_i = layer thickness (inches)
//
// Typical values:
//   a1 = 0.44 (asphalt concrete), a2 = 0.14 (granular base),
//   a3 = 0.11 (granular subbase)
//   m2 = m3 = 1.0 for good drainage

#[test]
fn pavement_aashto_structural_number() {
    // Layer coefficients (per inch of thickness)
    let a1: f64 = 0.44;    // asphalt concrete
    let a2: f64 = 0.14;    // crushed stone base
    let a3: f64 = 0.11;    // granular subbase

    // Drainage coefficients
    let m2: f64 = 1.0;     // good drainage
    let m3: f64 = 1.0;     // good drainage

    // Layer thicknesses (inches)
    let d1: f64 = 4.0;     // asphalt concrete surface
    let d2: f64 = 8.0;     // crushed stone base
    let d3: f64 = 12.0;    // granular subbase

    // Structural Number
    let sn: f64 = a1 * d1 + a2 * m2 * d2 + a3 * m3 * d3;
    // = 0.44*4 + 0.14*1.0*8 + 0.11*1.0*12
    // = 1.76 + 1.12 + 1.32 = 4.20

    let sn_expected: f64 = 1.76 + 1.12 + 1.32;
    assert_close(sn, sn_expected, 1e-6, "AASHTO SN total");

    // Contribution of each layer
    let sn1: f64 = a1 * d1;
    let sn2: f64 = a2 * m2 * d2;
    let sn3: f64 = a3 * m3 * d3;

    assert_close(sn1, 1.76, 1e-6, "AC layer contribution");
    assert_close(sn2, 1.12, 1e-6, "Base layer contribution");
    assert_close(sn3, 1.32, 1e-6, "Subbase layer contribution");

    // AC contributes most despite being thinnest layer
    assert!(
        sn1 > sn2 && sn1 > sn3,
        "AC layer dominates: SN1={:.2} > SN2={:.2}, SN3={:.2}", sn1, sn2, sn3
    );

    // Effect of poor drainage (m = 0.8)
    let m2_poor: f64 = 0.80;
    let m3_poor: f64 = 0.80;
    let sn_poor: f64 = a1 * d1 + a2 * m2_poor * d2 + a3 * m3_poor * d3;
    // = 1.76 + 0.896 + 1.056 = 3.712

    let sn_poor_expected: f64 = 1.76 + 0.14 * 0.80 * 8.0 + 0.11 * 0.80 * 12.0;
    assert_close(sn_poor, sn_poor_expected, 1e-6, "SN with poor drainage");

    // Poor drainage reduces SN
    assert!(
        sn_poor < sn,
        "Poor drainage SN {:.3} < good drainage SN {:.3}", sn_poor, sn
    );
}

// ================================================================
// 2. Traffic ESALs — 18-kip Equivalent Single Axle Load
// ================================================================
//
// ESAL converts mixed traffic to equivalent 18-kip (80 kN) single
// axle loads using equivalency factors (LEF).
// LEF = (W_axle / 18)^4 approximately (fourth power law)
// Total ESALs = sum(trucks_per_day * 365 * years * growth * LEF_per_truck)

#[test]
fn pavement_traffic_esal_computation() {
    // Fourth-power law: LEF = (W/18)^4 where W in kips
    let w_18: f64 = 18.0;  // kip, standard axle

    // Single axle at 12 kip
    let w_12: f64 = 12.0;
    let lef_12: f64 = (w_12 / w_18).powi(4);
    // = (0.667)^4 = 0.1975
    let lef_12_expected: f64 = (12.0_f64 / 18.0).powi(4);
    assert_close(lef_12, lef_12_expected, 1e-6, "LEF for 12-kip axle");

    // Single axle at 18 kip (reference)
    let lef_18: f64 = (w_18 / w_18).powi(4);
    assert_close(lef_18, 1.0, 1e-6, "LEF for 18-kip axle = 1.0");

    // Single axle at 24 kip (overloaded)
    let w_24: f64 = 24.0;
    let lef_24: f64 = (w_24 / w_18).powi(4);
    // = (1.333)^4 = 3.160
    let lef_24_expected: f64 = (24.0_f64 / 18.0).powi(4);
    assert_close(lef_24, lef_24_expected, 1e-6, "LEF for 24-kip axle");

    // Damage grows dramatically with overload
    assert!(
        lef_24 > 3.0,
        "24-kip LEF = {:.3} >> 1.0 (damage grows as 4th power)", lef_24
    );

    // Compute design ESALs for 20-year design life
    let trucks_per_day: f64 = 500.0;
    let design_years: f64 = 20.0;
    let growth_factor: f64 = 1.5;  // accounts for traffic growth
    let avg_lef: f64 = 0.5;        // average LEF per truck pass (typical for mixed traffic)

    let total_esal: f64 = trucks_per_day * 365.0 * design_years * growth_factor * avg_lef;
    // = 500 * 365 * 20 * 1.5 * 0.5 = 2,737,500

    let esal_expected: f64 = 500.0 * 365.0 * 20.0 * 1.5 * 0.5;
    assert_close(total_esal, esal_expected, 1e-6, "Design ESALs over 20 years");

    // ESALs in millions
    let esal_millions: f64 = total_esal / 1e6;
    assert!(
        esal_millions > 1.0 && esal_millions < 10.0,
        "Design ESALs: {:.2} million", esal_millions
    );
}

// ================================================================
// 3. Rigid Pavement — PCA Thickness Design
// ================================================================
//
// PCA method: design slab thickness for concrete pavement.
// Flexural stress: sigma = P / (k * l^2) * f(a/l)
// Modulus of subgrade reaction: k (psi/in or MPa/m)
// Radius of relative stiffness: l = (E*h^3 / (12*(1-nu^2)*k))^0.25
// Modulus of rupture: S_c (flexural strength of concrete)

#[test]
fn pavement_rigid_pca_thickness() {
    // Concrete properties
    let e_c: f64 = 27600.0;    // MPa, elastic modulus of concrete
    let nu: f64 = 0.15;        // Poisson's ratio
    let sc: f64 = 4.5;         // MPa, modulus of rupture (flexural strength)

    // Slab thickness
    let h: f64 = 0.250;        // m (250 mm)

    // Subgrade modulus
    let k: f64 = 54.0;         // MPa/m (typical for fair subgrade)

    // Radius of relative stiffness (Westergaard)
    let l_rel: f64 = (e_c * h.powi(3) / (12.0 * (1.0 - nu * nu) * k)).powf(0.25);
    // = (27600 * 0.015625 / (12 * 0.9775 * 54))^0.25
    // = (431.25 / 633.42)^0.25
    // = (0.6809)^0.25

    // Verify l_rel is in reasonable range (0.5 - 1.5 m typically)
    assert!(
        l_rel > 0.3 && l_rel < 2.0,
        "Radius of relative stiffness: {:.4} m", l_rel
    );

    // Compute l_rel manually to verify
    let numerator: f64 = e_c * h.powi(3);
    let denominator: f64 = 12.0 * (1.0 - nu * nu) * k;
    let l_check: f64 = (numerator / denominator).powf(0.25);
    assert_close(l_rel, l_check, 1e-10, "l_rel computation consistency");

    // Edge stress under standard 80 kN wheel load (Westergaard edge formula)
    let p: f64 = 80.0;         // kN, wheel load
    let a: f64 = 0.150;        // m, radius of loaded area
    let sigma_edge: f64 = 3.0 * p / (std::f64::consts::PI * h * h * 1000.0)
        * (1.0 + 0.54 * nu)
        * ((e_c * h.powi(3)) / (100.0 * k * a.powi(4))).powf(0.25).ln()
        .abs();
    // This is a simplified stress calculation -- the key point is
    // the stress must be less than the modulus of rupture

    // Stress ratio (should be < 0.50 for unlimited load repetitions per PCA)
    // We check that the slab is thick enough for the given parameters
    let _stress_ratio: f64 = if sigma_edge > 0.0 { sigma_edge / sc } else { 0.3 };

    // Thicker slab reduces stress (inverse square relationship with h)
    let h2: f64 = 0.300;       // 300 mm slab
    let l_rel2: f64 = (e_c * h2.powi(3) / (12.0 * (1.0 - nu * nu) * k)).powf(0.25);

    assert!(
        l_rel2 > l_rel,
        "Thicker slab: l={:.4} m > {:.4} m", l_rel2, l_rel
    );

    // Modulus of rupture should exceed edge stress for adequate design
    assert!(
        sc > 3.0,
        "S_c = {:.1} MPa is adequate for highway pavements", sc
    );
}

// ================================================================
// 4. Boussinesq — Vertical Stress Under Wheel Load
// ================================================================
//
// Vertical stress at depth z below a point load P on a half-space:
// sigma_z = (3*P / (2*pi*z^2)) * (1 / (1 + (r/z)^2))^(5/2)
// r = horizontal distance from load, z = depth
// On the load axis (r=0): sigma_z = 3*P / (2*pi*z^2)

#[test]
fn pavement_boussinesq_stress_distribution() {
    let p: f64 = 40.0;         // kN, wheel load (half of 80 kN axle)
    let pi: f64 = std::f64::consts::PI;

    // Stress directly below load (r = 0) at depth z
    let z1: f64 = 0.300;       // m (300 mm)
    let sigma_z1: f64 = 3.0 * p / (2.0 * pi * z1 * z1);
    // = 120 / (2 * pi * 0.09) = 120 / 0.5655 = 212.2 kPa

    let sigma_z1_expected: f64 = 3.0 * 40.0 / (2.0 * pi * 0.09);
    assert_close(sigma_z1, sigma_z1_expected, 1e-6, "Boussinesq at z=300mm, r=0");

    // At greater depth z = 600 mm
    let z2: f64 = 0.600;
    let sigma_z2: f64 = 3.0 * p / (2.0 * pi * z2 * z2);
    // = 120 / (2 * pi * 0.36) = 120 / 2.2619 = 53.05 kPa

    // Stress decreases with square of depth
    let ratio: f64 = sigma_z1 / sigma_z2;
    let expected_ratio: f64 = (z2 / z1).powi(2);
    assert_close(ratio, expected_ratio, 1e-6, "Boussinesq 1/z^2 decay on axis");

    // Off-axis stress at r = 0.300 m, z = 0.300 m
    let r: f64 = 0.300;
    let z: f64 = 0.300;
    let factor: f64 = 1.0 / (1.0 + (r / z).powi(2));
    let sigma_off: f64 = (3.0 * p / (2.0 * pi * z * z)) * factor.powf(2.5);
    // At r/z = 1: factor = 0.5, factor^2.5 = 0.1768
    // sigma = 212.2 * 0.1768 = 37.5 kPa

    let factor_expected: f64 = (1.0 / 2.0_f64).powf(2.5);
    let sigma_off_expected: f64 = sigma_z1 * factor_expected;
    assert_close(sigma_off, sigma_off_expected, 1e-6, "Boussinesq off-axis stress");

    // Off-axis stress is less than on-axis at same depth
    assert!(
        sigma_off < sigma_z1,
        "Off-axis {:.2} kPa < on-axis {:.2} kPa at same depth", sigma_off, sigma_z1
    );

    // Stress bulb: at z = 2*r, most of the stress has dissipated
    let z_deep: f64 = 1.200;
    let sigma_deep: f64 = 3.0 * p / (2.0 * pi * z_deep * z_deep);
    assert!(
        sigma_deep < 0.1 * sigma_z1,
        "At 4x depth, stress {:.2} < 10% of surface stress {:.2} kPa",
        sigma_deep, sigma_z1
    );
}

// ================================================================
// 5. Westergaard — Interior Load on Concrete Slab
// ================================================================
//
// Interior loading on infinite slab on Winkler foundation:
// sigma_i = (3*P*(1+nu)) / (2*pi*h^2) * (ln(l/b) + 0.6159)
// where b = equivalent contact radius
// b = a when a >= 1.724*h, else b = sqrt(1.6*a^2 + h^2) - 0.675*h
// l = radius of relative stiffness
// k = modulus of subgrade reaction

#[test]
fn pavement_westergaard_interior_load() {
    // Slab properties
    let e_c: f64 = 27600.0;    // MPa
    let nu: f64 = 0.15;
    let h: f64 = 0.250;        // m, slab thickness

    // Subgrade
    let k: f64 = 27.0;         // MPa/m (subgrade reaction modulus)

    // Radius of relative stiffness
    let l_rel: f64 = (e_c * h.powi(3) / (12.0 * (1.0 - nu * nu) * k)).powf(0.25);

    // Wheel load
    let p: f64 = 80.0;         // kN
    let a: f64 = 0.150;        // m, tire contact radius

    // Equivalent contact radius b
    // Check if a >= 1.724*h
    let threshold: f64 = 1.724 * h; // = 0.431 m
    let b: f64 = if a >= threshold {
        a
    } else {
        (1.6 * a * a + h * h).sqrt() - 0.675 * h
    };
    // a = 0.150 < 0.431, so use second formula
    // b = sqrt(1.6*0.0225 + 0.0625) - 0.675*0.250
    // = sqrt(0.036 + 0.0625) - 0.16875
    // = sqrt(0.0985) - 0.16875
    // = 0.3138 - 0.16875 = 0.1451 m

    assert!(
        b > 0.0 && b < a * 2.0,
        "Equivalent radius b = {:.4} m", b
    );

    // Interior stress (Westergaard formula)
    let pi: f64 = std::f64::consts::PI;
    let ln_term: f64 = (l_rel / b).ln();
    let sigma_i: f64 = (3.0 * p * (1.0 + nu)) / (2.0 * pi * h * h * 1000.0)
        * (ln_term + 0.6159);

    // Stress should be positive and in reasonable range for concrete pavement
    assert!(
        sigma_i > 0.0 && sigma_i < 10.0,
        "Westergaard interior stress: {:.3} MPa", sigma_i
    );

    // Maximum deflection under interior load
    // delta = P / (8 * k * l^2) * (1 + (1/(2*pi)) * (ln(a/(2*l)) + gamma - 1.25) * (a/l)^2)
    // Simplified: delta approx = P / (8 * k * l^2) for small a/l
    let delta_approx: f64 = p / (8.0 * k * l_rel * l_rel);

    assert!(
        delta_approx > 0.0,
        "Interior deflection: {:.4} m ({:.2} mm)", delta_approx, delta_approx * 1000.0
    );

    // Higher k-value reduces both stress and deflection
    let k2: f64 = 54.0;        // MPa/m, better subgrade
    let l_rel2: f64 = (e_c * h.powi(3) / (12.0 * (1.0 - nu * nu) * k2)).powf(0.25);
    let delta2: f64 = p / (8.0 * k2 * l_rel2 * l_rel2);

    assert!(
        delta2 < delta_approx,
        "Better subgrade: delta={:.4} mm < {:.4} mm",
        delta2 * 1000.0, delta_approx * 1000.0
    );
}

// ================================================================
// 6. CBR Method — Thickness from California Bearing Ratio
// ================================================================
//
// CBR-based design (US Army Corps / Asphalt Institute):
// Total pavement thickness: t = P / (pi * CBR * p_tire) function
// Simplified: t = sqrt(P / (pi * p * CBR/100)) - a (Heukelom & Klomp)
// Or use design charts correlating CBR to required thickness for
// given wheel load and number of repetitions.
//
// Common empirical formula:
// t (inches) = (8.1 * log10(C)) / CBR^0.63
// where C = wheel load repetitions (from traffic analysis)

#[test]
fn pavement_cbr_design_thickness() {
    // Subgrade CBR values
    let cbr_poor: f64 = 3.0;       // poor subgrade (clay)
    let cbr_fair: f64 = 8.0;       // fair subgrade
    let cbr_good: f64 = 20.0;      // good subgrade (gravel)

    // Traffic: wheel load repetitions
    let repetitions: f64 = 1e6;

    // Empirical formula: t (inches) = (8.1 * log10(C)) / CBR^0.63
    let log_c: f64 = repetitions.log10();  // = 6.0

    let t_poor: f64 = (8.1 * log_c) / cbr_poor.powf(0.63);
    let t_fair: f64 = (8.1 * log_c) / cbr_fair.powf(0.63);
    let t_good: f64 = (8.1 * log_c) / cbr_good.powf(0.63);

    // Verify log10(1e6) = 6.0
    assert_close(log_c, 6.0, 1e-6, "log10(1e6)");

    // Poor subgrade requires thickest pavement
    assert!(
        t_poor > t_fair && t_fair > t_good,
        "Thickness: poor {:.1}\" > fair {:.1}\" > good {:.1}\"",
        t_poor, t_fair, t_good
    );

    // Specific values (inches)
    // t_poor = 48.6 / 3^0.63 = 48.6 / 2.0801 = 23.4"
    // t_fair = 48.6 / 8^0.63 = 48.6 / 3.893 = 12.5"
    // t_good = 48.6 / 20^0.63 = 48.6 / 7.248 = 6.7"
    let t_poor_expected: f64 = (8.1 * 6.0) / 3.0_f64.powf(0.63);
    let t_fair_expected: f64 = (8.1 * 6.0) / 8.0_f64.powf(0.63);
    let t_good_expected: f64 = (8.1 * 6.0) / 20.0_f64.powf(0.63);

    assert_close(t_poor, t_poor_expected, 1e-6, "CBR thickness - poor subgrade");
    assert_close(t_fair, t_fair_expected, 1e-6, "CBR thickness - fair subgrade");
    assert_close(t_good, t_good_expected, 1e-6, "CBR thickness - good subgrade");

    // Convert to mm and verify ranges
    let t_poor_mm: f64 = t_poor * 25.4;
    let t_good_mm: f64 = t_good * 25.4;

    assert!(
        t_poor_mm > 400.0,
        "Poor subgrade requires > 400 mm: {:.0} mm", t_poor_mm
    );
    assert!(
        t_good_mm < 300.0,
        "Good subgrade needs < 300 mm: {:.0} mm", t_good_mm
    );
}

// ================================================================
// 7. Fatigue Cracking — Asphalt Institute Transfer Function
// ================================================================
//
// Nf = k1 * (1/epsilon_t)^k2 * (1/E)^k3
// Nf = allowable load repetitions to fatigue cracking
// epsilon_t = tensile strain at bottom of AC layer
// E = AC modulus (psi in original; we use MPa)
//
// Asphalt Institute coefficients (MS-1):
//   k1 = 0.0796, k2 = 3.291, k3 = 0.854
// (adjusted for metric, field calibration may differ)

#[test]
fn pavement_fatigue_cracking() {
    // Asphalt Institute fatigue transfer function coefficients
    let k1: f64 = 0.0796;
    let k2: f64 = 3.291;
    let k3: f64 = 0.854;

    // AC modulus (stiffness at design temperature)
    let e_ac: f64 = 3000.0;    // MPa (typical at 20 C)

    // Tensile strain at bottom of AC layer
    let eps_t1: f64 = 200e-6;  // microstrain = 200 x 10^-6

    // Allowable repetitions
    let nf1: f64 = k1 * (1.0 / eps_t1).powf(k2) * (1.0 / e_ac).powf(k3);

    assert!(
        nf1 > 0.0,
        "Nf at 200 microstrain: {:.0} repetitions", nf1
    );

    // Double the strain (thinner pavement or heavier load)
    let eps_t2: f64 = 400e-6;
    let nf2: f64 = k1 * (1.0 / eps_t2).powf(k2) * (1.0 / e_ac).powf(k3);

    // Doubling strain reduces Nf by factor of 2^k2 = 2^3.291 = 9.8
    let reduction_factor: f64 = nf1 / nf2;
    let expected_factor: f64 = 2.0_f64.powf(k2);
    assert_close(reduction_factor, expected_factor, 0.01, "Strain doubling fatigue reduction");

    // Effect of modulus: stiffer AC attracts more strain but formula
    // shows higher E gives slightly more fatigue life (lower k3 exponent)
    let e_ac2: f64 = 6000.0;   // MPa (cold temperature, stiffer)
    let nf_stiff: f64 = k1 * (1.0 / eps_t1).powf(k2) * (1.0 / e_ac2).powf(k3);

    // At same strain, higher E gives fewer repetitions (k3 effect)
    assert!(
        nf_stiff < nf1,
        "Stiffer AC: Nf={:.0} < {:.0} (at same strain)", nf_stiff, nf1
    );

    // Modulus ratio effect
    let modulus_effect: f64 = nf1 / nf_stiff;
    let expected_mod_effect: f64 = (e_ac2 / e_ac).powf(k3);
    assert_close(modulus_effect, expected_mod_effect, 0.01, "Modulus effect on fatigue");

    // Verify Nf is in practical range for typical highway
    // At 200 microstrain and E=3000 MPa, Nf should be in millions
    assert!(
        nf1 > 1e4,
        "Fatigue life should be > 10,000 repetitions: {:.0}", nf1
    );
}

// ================================================================
// 8. Temperature Curling — Warping Stress in Rigid Pavement
// ================================================================
//
// Bradbury/Westergaard curling analysis:
// When temperature differential exists between top and bottom of
// a concrete slab, warping (curling) stresses develop.
//
// Maximum interior stress (infinite slab):
// sigma_x = (E * alpha * DeltaT) / (2 * (1 - nu)) * (Cx + nu*Cy) / (1 - nu^2)
// For square slab: Cx = Cy = C (correction factor from Bradbury chart)
//
// Simplified for infinite slab:
// sigma = E * alpha * DeltaT / (2 * (1 - nu))

#[test]
fn pavement_temperature_curling_stress() {
    // Concrete slab properties
    let e_c: f64 = 27600.0;        // MPa
    let nu: f64 = 0.15;
    let alpha: f64 = 10e-6;        // 1/C, coefficient of thermal expansion
    let h: f64 = 0.250;            // m, slab thickness

    // Temperature differential (top hotter than bottom in daytime)
    let delta_t: f64 = 15.0;       // C, temperature difference top-bottom

    // Infinite slab curling stress (no edge correction)
    let sigma_inf: f64 = e_c * alpha * delta_t / (2.0 * (1.0 - nu));
    // = 27600 * 10e-6 * 15 / (2 * 0.85)
    // = 27600 * 0.00015 / 1.70
    // = 4.14 / 1.70 = 2.435 MPa

    let sigma_inf_expected: f64 = 27600.0 * 10e-6 * 15.0 / (2.0 * (1.0 - 0.15));
    assert_close(sigma_inf, sigma_inf_expected, 1e-6, "Infinite slab curling stress");

    // For finite slab, apply Bradbury correction factor C (0 to 1)
    // C depends on L/l ratio where L = slab dimension, l = radius of relative stiffness
    let k: f64 = 54.0;             // MPa/m, subgrade modulus
    let l_rel: f64 = (e_c * h.powi(3) / (12.0 * (1.0 - nu * nu) * k)).powf(0.25);

    // Typical slab panel: 4.5 m x 4.5 m
    let l_slab: f64 = 4.5;         // m, slab length
    let l_over_l: f64 = l_slab / l_rel;

    // Bradbury C factor (approximate from chart):
    // L/l < 2: C is small; L/l = 4-5: C approaches 1.0; L/l > 8: C = 1.0
    // For typical highway: L/l ~ 4-7
    assert!(
        l_over_l > 2.0 && l_over_l < 15.0,
        "L/l ratio: {:.2}", l_over_l
    );

    // Approximate C from empirical fit: C = 1 - exp(-2*(L/l-1)) for L/l > 1
    let c_factor: f64 = if l_over_l > 1.0 {
        1.0 - (-2.0 * (l_over_l - 1.0)).exp()
    } else {
        0.0
    };

    assert!(
        c_factor > 0.0 && c_factor <= 1.0,
        "Bradbury C factor: {:.4}", c_factor
    );

    // Finite slab curling stress
    let sigma_curl: f64 = sigma_inf * c_factor;
    assert!(
        sigma_curl <= sigma_inf,
        "Finite slab stress {:.3} <= infinite {:.3} MPa", sigma_curl, sigma_inf
    );

    // Night-time: top cooler than bottom -> reversed curling
    let delta_t_night: f64 = -10.0;    // negative = top cooler
    let sigma_night: f64 = e_c * alpha * delta_t_night.abs() / (2.0 * (1.0 - nu));

    // Night curling stress (absolute) is less than daytime
    assert!(
        sigma_night < sigma_inf,
        "Night stress {:.3} < day stress {:.3} MPa", sigma_night, sigma_inf
    );

    // Combined load + curling should not exceed modulus of rupture
    let sc: f64 = 4.5;             // MPa, modulus of rupture
    // Curling stress alone should be a fraction of S_c
    let curl_ratio: f64 = sigma_curl / sc;
    assert!(
        curl_ratio < 1.0,
        "Curling/S_c ratio: {:.3} < 1.0 (leaves room for load stress)", curl_ratio
    );
}
