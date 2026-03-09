/// Validation: Shell and Membrane Theory (Pure Formula Verification)
///
/// References:
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed.
///   - Ventsel & Krauthammer, "Thin Plates and Shells", Marcel Dekker
///   - Ugural, "Stresses in Beams, Plates, and Shells", 3rd Ed.
///   - Flugge, "Stresses in Shells", 2nd Ed., Springer
///   - Donnell, "Stability of Thin-Walled Tubes Under Torsion", NACA TR 479, 1933
///   - Geckeler, "Zur Theorie der Elastizitaet flacher rotationssymmetrischer Schalen"
///   - Bushnell, "Computerized Buckling Analysis of Shells", Lockheed, 1985
///   - Novozhilov, "Thin Shell Theory", 2nd Ed., Noordhoff
///
/// Tests verify shell/membrane formulas without calling the solver.
/// Pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Membrane Stresses in Spherical Pressure Vessel (Ugural, Ch. 13)
// ================================================================
//
// Spherical thin shell under internal pressure p:
//   sigma_phi = sigma_theta = p*R / (2*t)  (equal in both directions)
//
// where R = mean radius, t = wall thickness.
//
// This is the simplest membrane state: isotropic biaxial tension.
// The shell is "doubly curved" and all stress is membrane (no bending
// if the shell is complete and pressure is uniform).
//
// Design: t_required = p*R / (2*sigma_allow)

#[test]
fn validation_spherical_pressure_vessel() {
    let r: f64 = 2.0;          // m, mean radius
    let t: f64 = 0.010;        // m (10 mm), wall thickness
    let p: f64 = 2.0;          // MPa, internal pressure

    // Check thin shell assumption: R/t > 10
    let r_over_t: f64 = r / t;
    assert!(r_over_t > 10.0, "Thin shell: R/t = {:.0} > 10", r_over_t);

    // Membrane stresses
    let sigma: f64 = p * r / (2.0 * t); // MPa (since p is in MPa, R and t in m, result in MPa)
    assert_close(sigma, 2.0 * 2.0 / 0.020, 0.001, "Sphere membrane stress");
    assert_close(sigma, 200.0, 0.001, "sigma = 200 MPa");

    // Hoop stress = meridional stress (isotropic for sphere)
    let sigma_hoop: f64 = sigma;
    let sigma_meridional: f64 = sigma;
    assert_close(sigma_hoop, sigma_meridional, 1e-10, "Sphere: equal biaxial stress");

    // Von Mises equivalent stress for biaxial equal tension:
    // sigma_vm = sqrt(s1^2 - s1*s2 + s2^2) = sigma (when s1 = s2)
    let sigma_vm: f64 = (sigma * sigma - sigma * sigma + sigma * sigma).sqrt();
    assert_close(sigma_vm, sigma, 1e-10, "Von Mises = sigma for equal biaxial");

    // Required thickness for allowable stress = 150 MPa
    let sigma_allow: f64 = 150.0; // MPa
    let t_required: f64 = p * r / (2.0 * sigma_allow);
    assert_close(t_required, 2.0 * 2.0 / 300.0, 0.001, "Required thickness");
    assert!(
        t_required > t * 0.5,
        "Required thickness = {:.4} m is reasonable",
        t_required
    );

    // Compare with cylindrical vessel of same R and p:
    // Cylinder hoop stress = p*R/t = 2*sphere stress
    let sigma_cyl_hoop: f64 = p * r / t;
    assert_close(sigma_cyl_hoop / sigma, 2.0, 1e-10, "Cylinder hoop = 2x sphere");
}

// ================================================================
// 2. Cylindrical Shell: Hoop + Longitudinal Stresses (Ugural, Ch. 13)
// ================================================================
//
// Thin cylindrical shell under internal pressure p:
//   sigma_hoop (circumferential) = p*R/t
//   sigma_long (axial) = p*R/(2t)
//
// The hoop stress is twice the longitudinal stress.
// For a closed-end vessel, both stresses exist.
// For an open-ended cylinder (pipe), only hoop stress.
//
// The radial stress sigma_r ~ -p/2 (average through thickness)
// is negligible compared to membrane stresses for thin shells.

#[test]
fn validation_cylindrical_shell_stresses() {
    let r: f64 = 1.5;          // m, mean radius
    let t: f64 = 0.012;        // m (12 mm)
    let p: f64 = 3.0;          // MPa

    // Hoop stress
    let sigma_hoop: f64 = p * r / t;
    assert_close(sigma_hoop, 3.0 * 1.5 / 0.012, 0.001, "Cylinder hoop stress");
    assert_close(sigma_hoop, 375.0, 0.001, "sigma_hoop = 375 MPa");

    // Longitudinal stress
    let sigma_long: f64 = p * r / (2.0 * t);
    assert_close(sigma_long, sigma_hoop / 2.0, 1e-10, "sigma_long = sigma_hoop/2");
    assert_close(sigma_long, 187.5, 0.001, "sigma_long = 187.5 MPa");

    // Hoop-to-longitudinal ratio = 2
    let stress_ratio: f64 = sigma_hoop / sigma_long;
    assert_close(stress_ratio, 2.0, 1e-10, "Hoop/long ratio = 2");

    // Von Mises for biaxial (sigma_1 = sigma_hoop, sigma_2 = sigma_long):
    // sigma_vm = sqrt(s1^2 - s1*s2 + s2^2)
    let s1: f64 = sigma_hoop;
    let s2: f64 = sigma_long;
    let sigma_vm: f64 = (s1 * s1 - s1 * s2 + s2 * s2).sqrt();
    let expected_vm: f64 = sigma_hoop * (1.0_f64 - 0.5 + 0.25).sqrt(); // = s1*sqrt(0.75)
    assert_close(sigma_vm, expected_vm, 0.001, "Von Mises for cylinder");

    // Von Mises is between sigma_long and sigma_hoop
    assert!(sigma_vm > sigma_long, "VM > longitudinal");
    assert!(sigma_vm < sigma_hoop, "VM < hoop");

    // Hoop strain (plane stress):
    // epsilon_hoop = (sigma_hoop - nu*sigma_long) / E
    let e_mod: f64 = 200e3; // MPa (200 GPa)
    let nu: f64 = 0.3;
    let eps_hoop: f64 = (sigma_hoop - nu * sigma_long) / e_mod;
    let eps_long: f64 = (sigma_long - nu * sigma_hoop) / e_mod;

    // Hoop strain > 0 (expansion)
    assert!(eps_hoop > 0.0, "Hoop strain positive (expansion)");

    // Longitudinal strain can be positive or negative depending on nu
    // eps_long = sigma_long*(1 - 2*nu)/E = (p*R/(2t))*(1-2*nu)/E
    // For nu=0.3: 1-2*0.3 = 0.4 > 0, so eps_long > 0
    assert!(eps_long > 0.0, "Long strain positive for nu < 0.5");

    // Diametral expansion
    let delta_r: f64 = eps_hoop * r;
    assert!(delta_r > 0.0, "Radius increases under pressure");
}

// ================================================================
// 3. Conical Shell Membrane Stresses (Flugge, Ch. 3)
// ================================================================
//
// A conical shell (half-angle alpha) under internal pressure p:
//   sigma_theta (hoop) = p * s * sin(alpha) / t = p * r / (t * cos(alpha))
//   sigma_s (meridional) = p * r / (2 * t * cos(alpha))
//
// where s = distance along generator from apex,
//       r = s * sin(alpha) = local radius,
//       alpha = half-angle of cone.
//
// For alpha -> 0: cone becomes cylinder, formulas reduce to cylinder case.
// For alpha -> 90: cone becomes a flat disk.

#[test]
fn validation_conical_shell_stresses() {
    let alpha: f64 = 30.0 * PI / 180.0; // 30 degree half-angle
    let p: f64 = 1.5;          // MPa, internal pressure
    let t: f64 = 0.008;        // m (8 mm)
    let r_local: f64 = 1.0;    // m, local radius at section of interest

    // Hoop stress
    let sigma_hoop: f64 = p * r_local / (t * alpha.cos());
    let expected_hoop: f64 = 1.5 * 1.0 / (0.008 * (3.0_f64.sqrt() / 2.0));
    assert_close(sigma_hoop, expected_hoop, 0.001, "Cone hoop stress");

    // Meridional stress
    let sigma_merid: f64 = p * r_local / (2.0 * t * alpha.cos());
    assert_close(sigma_merid, sigma_hoop / 2.0, 1e-10, "Cone: sigma_s = sigma_theta/2");

    // Same 2:1 ratio as cylinder (when expressed in terms of local radius)
    let ratio: f64 = sigma_hoop / sigma_merid;
    assert_close(ratio, 2.0, 1e-10, "Hoop/meridional ratio = 2");

    // Compare with equivalent cylinder at same local radius
    let sigma_cyl_hoop: f64 = p * r_local / t;
    // Cone hoop stress > cylinder hoop stress (due to cos(alpha) < 1)
    assert!(
        sigma_hoop > sigma_cyl_hoop,
        "Cone hoop ({:.1}) > cylinder hoop ({:.1})",
        sigma_hoop, sigma_cyl_hoop
    );

    // The factor 1/cos(alpha) is the cone correction
    let cone_factor: f64 = sigma_hoop / sigma_cyl_hoop;
    assert_close(cone_factor, 1.0 / alpha.cos(), 1e-10, "Cone factor = 1/cos(alpha)");

    // At alpha = 0 (cylinder): factor = 1 (no correction)
    let factor_cyl: f64 = 1.0 / (0.0_f64).cos();
    assert_close(factor_cyl, 1.0, 1e-10, "alpha=0 gives cylinder");

    // At alpha = 45 degrees: factor = sqrt(2) ~ 1.414
    let alpha_45: f64 = 45.0 * PI / 180.0;
    let factor_45: f64 = 1.0 / alpha_45.cos();
    assert_close(factor_45, 2.0_f64.sqrt(), 0.001, "alpha=45: factor=sqrt(2)");

    // Stress increases toward the base (larger r)
    let r_large: f64 = 2.0;
    let sigma_hoop_large: f64 = p * r_large / (t * alpha.cos());
    assert_close(sigma_hoop_large, 2.0 * sigma_hoop, 0.001, "Double radius -> double stress");
}

// ================================================================
// 4. Edge Bending in Cylindrical Shell — Geckeler Approximation
// ================================================================
//
// When a cylindrical shell has a free or loaded edge, bending stresses
// develop that decay exponentially from the edge.
//
// Characteristic length (penetration depth):
//   beta = [3(1-nu^2)/(R^2*t^2)]^(1/4)
//   L_b = pi/beta (approximate decay length)
//
// For a free edge under axisymmetric loading:
//   w(x) = exp(-beta*x) * [C1*cos(beta*x) + C2*sin(beta*x)]
//
// The bending moment decays as exp(-beta*x), reaching negligible
// values at x ~ 3/beta.
//
// Flexural rigidity: D = E*t^3 / [12*(1-nu^2)]

#[test]
fn validation_edge_bending_cylindrical_shell() {
    let r: f64 = 2.0;          // m, radius
    let t: f64 = 0.015;        // m (15 mm)
    let e: f64 = 200e3;        // MPa (200 GPa)
    let nu: f64 = 0.3;

    // Characteristic parameter beta
    let beta: f64 = (3.0 * (1.0 - nu * nu) / (r * r * t * t)).powf(0.25);

    // Verify beta has correct units (1/m)
    // For R=2m, t=15mm: beta = [3*0.91/(4*0.000225)]^0.25
    let inner: f64 = 3.0 * (1.0 - 0.09) / (4.0 * 0.015 * 0.015);
    let expected_beta: f64 = inner.powf(0.25);
    assert_close(beta, expected_beta, 0.001, "Beta parameter");

    // Bending penetration depth
    let l_b: f64 = PI / beta;
    assert!(l_b > 0.0, "Penetration depth must be positive");

    // For typical engineering shells, L_b << R
    // This means bending effects are localized near edges
    assert!(
        l_b < r,
        "Bending depth ({:.3} m) < radius ({:.1} m): edge effects localized",
        l_b, r
    );

    // Decay factor at x = L_b:
    // exp(-beta * L_b) = exp(-pi) ~ 0.0432
    let decay_at_lb: f64 = (-beta * l_b).exp();
    assert_close(decay_at_lb, (-PI).exp(), 0.001, "Decay at x=L_b = exp(-pi)");
    assert!(decay_at_lb < 0.05, ">95% decay at x = L_b");

    // Decay at x = 3/beta:
    let decay_3: f64 = (-3.0_f64).exp();
    assert_close(decay_3, 0.04979, 0.01, "exp(-3) ~ 0.05");
    assert!(decay_3 < 0.05, "95% decay at 3/beta");

    // Flexural rigidity
    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // Edge shear to produce unit displacement at edge:
    // Q_0 = 2*beta^3*D per unit circumference length
    let q_edge: f64 = 2.0 * beta.powi(3) * d;
    assert!(q_edge > 0.0, "Edge shear stiffness positive");

    // Edge moment to produce unit rotation at edge:
    // M_0 = 2*beta*D per unit circumference length
    let m_edge: f64 = 2.0 * beta * d;
    assert!(m_edge > 0.0, "Edge moment stiffness positive");

    // Thinner shell -> larger beta (more localized bending, shorter L_b)
    let t_thin: f64 = 0.008;
    let beta_thin: f64 = (3.0 * (1.0 - nu * nu) / (r * r * t_thin * t_thin)).powf(0.25);
    assert!(beta_thin > beta, "Thinner shell: larger beta");
    assert!(PI / beta_thin < l_b, "Thinner shell: shorter penetration depth");
}

// ================================================================
// 5. Donnell Stability: Cylindrical Shell Under Axial Compression
// ================================================================
//
// Classical buckling stress for a perfect cylindrical shell under
// uniform axial compression (Donnell, 1933):
//
//   sigma_cr = E*t / (R * sqrt(3*(1-nu^2)))
//
// For steel (E=200 GPa, nu=0.3):
//   sigma_cr = 0.605 * E * t/R
//
// The knock-down factor gamma (imperfection sensitivity):
//   sigma_actual = gamma * sigma_cr
//   Typical gamma = 0.1 to 0.3 for fabricated shells.
//
// NASA SP-8007: gamma = 1 - 0.901*(1 - exp(-1/(16*sqrt(R/t))))

#[test]
fn validation_donnell_cylinder_buckling() {
    let e: f64 = 200e3;        // MPa (200 GPa)
    let nu: f64 = 0.3;
    let r: f64 = 1.0;          // m, radius
    let t: f64 = 0.005;        // m (5 mm)

    // Classical buckling stress
    let sigma_cr: f64 = e * t / (r * (3.0 * (1.0 - nu * nu)).sqrt());
    let coefficient: f64 = 1.0 / (3.0 * (1.0 - nu * nu)).sqrt();
    assert_close(coefficient, 1.0 / (3.0_f64 * 0.91).sqrt(), 0.001, "Buckling coefficient");
    assert_close(coefficient, 0.6053, 0.01, "Coefficient ~ 0.605");

    // sigma_cr for R/t = 200
    let r_over_t: f64 = r / t;
    assert_close(r_over_t, 200.0, 0.001, "R/t = 200");

    let expected_cr: f64 = coefficient * e * t / r;
    assert_close(sigma_cr, expected_cr, 1e-10, "sigma_cr formula");

    // NASA SP-8007 knock-down factor
    // gamma = 1 - 0.901*(1 - exp(-phi))  where phi = (1/16)*sqrt(R/t)
    // Larger R/t (thinner shell) -> larger phi -> gamma closer to 0.099
    // Smaller R/t (thicker shell) -> smaller phi -> gamma closer to 1.0
    let phi: f64 = (1.0 / 16.0) * r_over_t.sqrt();
    let gamma_nasa: f64 = 1.0 - 0.901 * (1.0 - (-phi).exp());

    // For R/t = 200: phi = sqrt(200)/16 = 0.884
    // gamma = 1 - 0.901*(1 - exp(-0.884)) = 1 - 0.901*0.587 = 0.471
    assert_close(phi, 200.0_f64.sqrt() / 16.0, 0.001, "phi for R/t=200");
    assert!(
        gamma_nasa > 0.1 && gamma_nasa < 0.6,
        "Knock-down factor gamma = {:.3} in typical range",
        gamma_nasa
    );

    // For a thicker shell (R/t = 50), less knock-down
    let r_over_t_thick: f64 = 50.0;
    let phi_thick: f64 = (1.0 / 16.0) * r_over_t_thick.sqrt();
    let gamma_thick: f64 = 1.0 - 0.901 * (1.0 - (-phi_thick).exp());
    assert!(
        gamma_thick > gamma_nasa,
        "Thicker shell less knock-down: {:.4} > {:.4}",
        gamma_thick, gamma_nasa
    );

    // Actual buckling stress with imperfections
    let sigma_actual: f64 = gamma_nasa * sigma_cr;
    assert!(
        sigma_actual < sigma_cr,
        "Imperfect < classical: {:.1} < {:.1} MPa",
        sigma_actual, sigma_cr
    );

    // Thicker shell -> higher buckling stress (linear in t)
    let t2: f64 = 0.010;
    let sigma_cr2: f64 = e * t2 / (r * (3.0 * (1.0 - nu * nu)).sqrt());
    assert_close(sigma_cr2 / sigma_cr, 2.0, 0.001, "Double thickness -> double sigma_cr");

    // Larger radius -> lower buckling stress (inversely proportional to R)
    let r2: f64 = 2.0;
    let sigma_cr_r2: f64 = e * t / (r2 * (3.0 * (1.0 - nu * nu)).sqrt());
    assert_close(sigma_cr_r2 / sigma_cr, 0.5, 0.001, "Double radius -> half sigma_cr");

    // Critical stress vs yield: for thin shells, buckling often governs
    let sigma_yield: f64 = 250.0; // MPa
    let slenderness: f64 = sigma_yield / sigma_cr;
    // For R/t = 200: sigma_cr ~ 0.605*200e3*0.005/1 = 605 MPa
    // slenderness = 250/605 < 1, so yielding governs for this case
    assert!(
        slenderness < 1.5,
        "Slenderness = {:.2} (need to check which governs)",
        slenderness
    );
}

// ================================================================
// 6. Barrel Vault Under Self-Weight (Ventsel & Krauthammer, Ch. 15)
// ================================================================
//
// A cylindrical barrel vault (semicircular cross-section) spanning L
// between end diaphragms, under self-weight q (force/area):
//
// Membrane solution (for long barrels, L/R > 3):
//   N_theta = -q*R*cos(theta)  (hoop force per unit length)
//   N_x = -(q*L^2/(2*R)) * cos(theta) * [1 - (2x/L)^2] / (pi/2)
//     (simplified — varies parabolically in x)
//
// At the crown (theta=0):
//   N_theta_crown = -q*R (compression)
//   N_x varies along the span
//
// At the support (theta=90): N_theta = 0
//
// Edge beams are typically needed for equilibrium at the free edges.

#[test]
fn validation_barrel_vault_self_weight() {
    let r: f64 = 10.0;         // m, radius of curvature
    let t: f64 = 0.100;        // m (100 mm)
    let _l: f64 = 30.0;        // m, span between diaphragms
    let q: f64 = 0.003;        // MPa = MN/m^2 = 3 kN/m^2 (self-weight)

    // Hoop force at various angles (membrane solution)
    // N_theta(theta) = -q*R*cos(theta) [per unit length of generator]
    let n_theta_crown: f64 = -q * r * (0.0_f64).cos(); // theta = 0
    assert_close(n_theta_crown, -q * r, 1e-10, "N_theta at crown");

    let n_theta_45: f64 = -q * r * (PI / 4.0).cos();
    assert_close(n_theta_45, -q * r / 2.0_f64.sqrt(), 0.001, "N_theta at 45 deg");

    let n_theta_90: f64 = -q * r * (PI / 2.0).cos();
    assert_close(n_theta_90, 0.0, 1e-10, "N_theta at springing = 0");

    // Crown is in compression
    assert!(n_theta_crown < 0.0, "Crown in compression");

    // Hoop stress at crown
    let sigma_hoop_crown: f64 = n_theta_crown / t;
    assert_close(sigma_hoop_crown, -q * r / t, 1e-10, "Hoop stress at crown");
    assert_close(sigma_hoop_crown, -0.3, 0.001, "sigma_crown = -0.3 MPa (compression)");

    // The stress is quite small — barrel vaults are efficient membrane structures
    assert!(sigma_hoop_crown.abs() < 5.0, "Membrane stress is low for thin shell");

    // N_theta varies as cosine: maximum at crown, zero at springing
    for angle_deg in [0, 15, 30, 45, 60, 75, 90] {
        let theta: f64 = (angle_deg as f64) * PI / 180.0;
        let n_th: f64 = -q * r * theta.cos();
        // N_theta decreases in magnitude from crown to springing
        assert!(
            n_th.abs() <= (q * r) + 1e-10,
            "N_theta bounded by q*R at {} deg",
            angle_deg
        );
    }

    // Self-weight as distributed load (kN/m^2)
    let q_kn: f64 = q * 1000.0; // 3.0 kN/m^2
    let gamma_concrete: f64 = 24.0; // kN/m^3
    let t_for_q: f64 = q_kn / gamma_concrete;
    assert_close(t_for_q, 0.125, 0.001, "Slab thickness for self-weight = q");
}

// ================================================================
// 7. Ring Stiffener Effective Width (Bushnell, Ch. 5)
// ================================================================
//
// A ring stiffener on a cylindrical shell has an "effective width"
// of shell plating that acts with it. The effective width depends
// on the shell geometry and is typically:
//
//   L_eff = 1.56 * sqrt(R*t)  (for each side of the ring)
//
// Total effective width = 2 * 1.56 * sqrt(R*t) = 3.12 * sqrt(R*t)
//
// This comes from the bending wavelength of the cylindrical shell:
//   Lambda = 2*pi / beta where beta = [3(1-nu^2)/(R^2*t^2)]^0.25
//   Lambda / 4 ~ 1.56 * sqrt(R*t) for nu = 0.3
//
// The effective area of the combined ring-shell section:
//   A_eff = A_ring + L_eff * t (for one side, or 2*L_eff*t for both sides)

#[test]
fn validation_ring_stiffener_effective_width() {
    let r: f64 = 3.0;          // m, shell radius
    let t: f64 = 0.012;        // m (12 mm), shell thickness
    let nu: f64 = 0.3;

    // Effective width (per side)
    let l_eff_one: f64 = 1.56 * (r * t).sqrt();
    let l_eff_total: f64 = 2.0 * l_eff_one;

    // Verify against bending wavelength
    let beta: f64 = (3.0 * (1.0 - nu * nu) / (r * r * t * t)).powf(0.25);
    let wavelength: f64 = 2.0 * PI / beta;
    let quarter_wave: f64 = wavelength / 4.0;

    // L_eff_one should be in the same ballpark as lambda/4
    // The 1.56*sqrt(R*t) formula is an engineering approximation
    // that captures the bending penetration length scale.
    let ratio: f64 = l_eff_one / quarter_wave;
    assert!(
        (ratio - 1.0).abs() < 0.35,
        "L_eff / (lambda/4) = {:.3}, should be near 1.0 (within ~30%)",
        ratio
    );

    // Total effective width for practical ring stiffener
    assert!(
        l_eff_total < 1.0,
        "Effective width = {:.3} m, less than 1m for this geometry",
        l_eff_total
    );

    // Ring stiffener properties
    let a_ring: f64 = 0.003;   // m^2, ring cross-section area
    let _h_ring: f64 = 0.150;  // m, ring depth (outward)

    // Effective combined area (ring + shell plating)
    let a_eff: f64 = a_ring + l_eff_total * t;
    assert!(a_eff > a_ring, "Effective area > ring area");

    // Shell plating contribution
    let plating_fraction: f64 = (l_eff_total * t) / a_eff;
    assert!(
        plating_fraction > 0.0 && plating_fraction < 1.0,
        "Plating contributes {:.1}% of effective area",
        plating_fraction * 100.0
    );

    // Effective width scales as sqrt(R*t)
    let r2: f64 = 6.0;
    let l_eff_r2: f64 = 1.56 * (r2 * t).sqrt();
    let width_ratio: f64 = l_eff_r2 / l_eff_one;
    assert_close(width_ratio, (r2 / r).sqrt(), 0.001, "L_eff scales as sqrt(R)");

    // Thicker shell -> wider effective width
    let t2: f64 = 0.020;
    let l_eff_t2: f64 = 1.56 * (r * t2).sqrt();
    assert!(l_eff_t2 > l_eff_one, "Thicker shell -> wider effective width");
    assert_close(l_eff_t2 / l_eff_one, (t2 / t).sqrt(), 0.001, "L_eff scales as sqrt(t)");
}

// ================================================================
// 8. Toroidal Shell Membrane Stresses (Flugge, Ch. 5)
// ================================================================
//
// A toroidal shell (doughnut shape) under internal pressure p:
//   R = radius to center of tube cross-section (major radius)
//   r = radius of tube cross-section (minor radius)
//   phi = angle around tube cross-section (0 at outer equator)
//
// Membrane stresses:
//   sigma_phi (meridional) = p*r / (2*t)  (same as sphere of radius r)
//   sigma_theta (hoop) = p*r/(2*t) * (2*R + r*cos(phi)) / (R + r*cos(phi))
//
// At the outer equator (phi=0):
//   sigma_theta = p*r/(2*t) * (2R+r)/(R+r)
//
// At the inner equator (phi=pi):
//   sigma_theta = p*r/(2*t) * (2R-r)/(R-r)
//
// The meridional stress is constant (independent of phi).

#[test]
fn validation_toroidal_shell_stresses() {
    let r_major: f64 = 5.0;    // m, major radius (R)
    let r_minor: f64 = 1.0;    // m, minor radius (r)
    let t: f64 = 0.010;        // m (10 mm)
    let p: f64 = 2.0;          // MPa

    // Meridional stress (constant around cross-section)
    let sigma_phi: f64 = p * r_minor / (2.0 * t);
    assert_close(sigma_phi, 2.0 * 1.0 / 0.020, 0.001, "Meridional stress");
    assert_close(sigma_phi, 100.0, 0.001, "sigma_phi = 100 MPa");

    // Hoop stress at outer equator (phi = 0)
    let sigma_theta_outer: f64 = sigma_phi
        * (2.0 * r_major + r_minor) / (r_major + r_minor);
    let expected_outer: f64 = 100.0 * (10.0 + 1.0) / (5.0 + 1.0);
    assert_close(sigma_theta_outer, expected_outer, 0.001, "sigma_theta at outer");

    // Hoop stress at inner equator (phi = pi)
    let sigma_theta_inner: f64 = sigma_phi
        * (2.0 * r_major - r_minor) / (r_major - r_minor);
    let expected_inner: f64 = 100.0 * (10.0 - 1.0) / (5.0 - 1.0);
    assert_close(sigma_theta_inner, expected_inner, 0.001, "sigma_theta at inner");

    // Inner hoop stress > outer hoop stress (for R > r)
    assert!(
        sigma_theta_inner > sigma_theta_outer,
        "Inner hoop ({:.1}) > outer hoop ({:.1})",
        sigma_theta_inner, sigma_theta_outer
    );

    // At phi = pi/2 (top/bottom): cos(phi) = 0
    // sigma_theta = sigma_phi * 2R/R = 2*sigma_phi
    let sigma_theta_top: f64 = sigma_phi * (2.0 * r_major) / r_major;
    assert_close(sigma_theta_top, 2.0 * sigma_phi, 1e-10, "sigma_theta at top = 2*sigma_phi");

    // For R >> r (thin torus), outer and inner approach the cylinder value:
    // sigma_theta -> p*r/t (cylinder hoop stress)
    // and sigma_phi -> p*r/(2t) (cylinder longitudinal stress)
    let r_large: f64 = 100.0;
    let sigma_theta_outer_large: f64 = sigma_phi
        * (2.0 * r_large + r_minor) / (r_large + r_minor);
    // Should approach 2 * sigma_phi = p*r/t (cylinder hoop)
    let sigma_cyl_hoop: f64 = p * r_minor / t;
    let error: f64 = (sigma_theta_outer_large - sigma_cyl_hoop).abs() / sigma_cyl_hoop;
    assert!(
        error < 0.02,
        "Large R: torus -> cylinder: error = {:.2}%",
        error * 100.0
    );

    // Meridional stress is independent of phi
    // (verified by formula: sigma_phi = p*r/(2t) has no phi dependence)
    let sigma_phi_check: f64 = p * r_minor / (2.0 * t);
    assert_close(sigma_phi_check, sigma_phi, 1e-10, "sigma_phi independent of phi");
}
