/// Validation: Extended Modal Analysis Tests
///
/// Tests covering additional modal analysis scenarios beyond basic beam BCs:
///   1. SS beam multiple modes: f_n = n^2 * f_1
///   2. Cantilever first 3 modes: beta_n*L = 1.875, 4.694, 7.855
///   3. Portal frame sway frequency: shear building approximation
///   4. Two-story shear building: 2 mode shapes
///   5. Added mass effect: frequency decreases with mass
///   6. Stiffness effect: frequency increases with stiffness
///   7. Mode shape orthogonality: phi_i^T * M * phi_j = 0 for i!=j
///   8. Rayleigh quotient: upper bound estimate
///
/// References:
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed, Ch. 12-13
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed, Ch. 10-12
///   - Bathe, K.J., "Finite Element Procedures", 2014, Ch. 10
mod helpers;

use dedaliano_engine::solver::{assembly, dof, mass_matrix, modal};
use dedaliano_engine::solver::modal::ModeShape;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4
const DENSITY: f64 = 7_850.0; // kg/m^3

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

/// Reconstruct eigenvector in global DOF ordering from ModeShape displacements.
fn mode_to_dof_vec(mode: &ModeShape, dof_num: &dof::DofNumbering) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut phi = vec![0.0; n];
    for d in &mode.displacements {
        if dof_num.dofs_per_node >= 1 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 0) { phi[idx] = d.ux; }
        }
        if dof_num.dofs_per_node >= 2 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 1) { phi[idx] = d.uy; }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 2) { phi[idx] = d.rz; }
        }
    }
    phi
}

/// Matrix-vector product for dense square matrix: y = M * x
fn mat_vec(m: &[f64], x: &[f64], n: usize) -> Vec<f64> {
    let mut y = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            y[i] += m[i * n + j] * x[j];
        }
    }
    y
}

/// Dot product
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(ai, bi)| ai * bi).sum()
}

// ================================================================
// 1. Simply-Supported Beam Multiple Modes: f_n = n^2 * f_1
// ================================================================
//
// For a simply-supported (pinned-pinned) Euler-Bernoulli beam, the
// natural frequencies follow: omega_n = (n*pi/L)^2 * sqrt(EI/rhoA).
// Therefore omega_n / omega_1 = n^2.
//
// Reference: Chopra, "Dynamics of Structures", Table 16.2.1

#[test]
fn validation_ss_beam_multiple_modes() {
    let length = 5.0;
    let n_elem = 16; // fine mesh for higher modes

    let mut input = make_ss_beam_udl(n_elem, length, E, A, IZ, 0.0);
    input.loads.clear();

    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(
        result.modes.len() >= 3,
        "Expected at least 3 modes, got {}",
        result.modes.len()
    );

    let omega_1 = result.modes[0].omega;

    // Mode 2: omega_2 / omega_1 = 4.0 (= 2^2)
    let ratio_2 = result.modes[1].omega / omega_1;
    assert!(
        (ratio_2 - 4.0).abs() < 0.5,
        "SS beam: omega_2/omega_1 = {:.3}, expected ~4.0",
        ratio_2
    );

    // Mode 3: omega_3 / omega_1 = 9.0 (= 3^2)
    let ratio_3 = result.modes[2].omega / omega_1;
    assert!(
        (ratio_3 - 9.0).abs() < 1.5,
        "SS beam: omega_3/omega_1 = {:.3}, expected ~9.0",
        ratio_3
    );

    // Also verify first frequency against closed form
    let e_eff = E * 1000.0; // solver internal E
    let ei = e_eff * IZ;
    let rho_a = DENSITY * A / 1000.0; // tonnes/m
    let omega_exact = (std::f64::consts::PI / length).powi(2) * (ei / rho_a).sqrt();
    let rel_err = (omega_1 - omega_exact).abs() / omega_exact;
    assert!(
        rel_err < 0.02,
        "SS beam omega_1 = {:.4}, exact = {:.4}, error = {:.2}%",
        omega_1, omega_exact, rel_err * 100.0
    );
}

// ================================================================
// 2. Cantilever First 3 Modes: beta_n*L = 1.875, 4.694, 7.855
// ================================================================
//
// For a fixed-free (cantilever) beam, the characteristic equation is:
//   cos(beta*L) * cosh(beta*L) + 1 = 0
// The first three roots are beta_n*L = 1.8751, 4.6941, 7.8548.
// omega_n = (beta_n)^2 * sqrt(EI / rhoA)
//
// Reference: Timoshenko, "Vibration Problems in Engineering", 4th Ed

#[test]
fn validation_cantilever_first_three_modes() {
    let length = 5.0;
    let n_elem = 16; // fine mesh for 3rd mode accuracy

    let input = make_beam(n_elem, length, E, A, IZ, "fixed", None, vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(
        result.modes.len() >= 3,
        "Expected at least 3 modes, got {}",
        result.modes.len()
    );

    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let rho_a = DENSITY * A / 1000.0;

    let beta_l = [1.8751, 4.6941, 7.8548];
    let tol = [0.02, 0.03, 0.05]; // relaxed tolerance for higher modes

    for (i, (&bl, &t)) in beta_l.iter().zip(tol.iter()).enumerate() {
        let beta = bl / length;
        let omega_exact = beta * beta * (ei / rho_a).sqrt();
        let omega_fe = result.modes[i].omega;
        let rel_err = (omega_fe - omega_exact).abs() / omega_exact;

        assert!(
            rel_err < t,
            "Cantilever mode {}: omega_FE = {:.4}, omega_exact = {:.4}, error = {:.2}% (tol = {:.0}%)",
            i + 1, omega_fe, omega_exact, rel_err * 100.0, t * 100.0
        );
    }

    // Verify frequency ratios (beta_n_L values squared)
    // omega_2/omega_1 = (4.6941/1.8751)^2 = 6.267
    let ratio_21 = result.modes[1].omega / result.modes[0].omega;
    assert!(
        (ratio_21 - 6.267).abs() < 1.0,
        "Cantilever: omega_2/omega_1 = {:.3}, expected ~6.267",
        ratio_21
    );

    // omega_3/omega_1 = (7.8548/1.8751)^2 = 17.55
    let ratio_31 = result.modes[2].omega / result.modes[0].omega;
    assert!(
        (ratio_31 - 17.55).abs() < 2.5,
        "Cantilever: omega_3/omega_1 = {:.3}, expected ~17.55",
        ratio_31
    );
}

// ================================================================
// 3. Portal Frame Sway Frequency: Shear Building Approximation
// ================================================================
//
// A portal frame (2 fixed-base columns + rigid beam) approximates a
// single-story shear building. The lateral stiffness is:
//   k = 2 * 12*E*I / h^3  (two fixed-fixed columns)
// The total mass lumped at roof level: m = rho*A*(2*h + w) / 1000
// Approximate fundamental frequency: omega ~= sqrt(k/m)
//
// The FE result should be close to this estimate, though not exact
// because the beam is not perfectly rigid and mass is distributed.

#[test]
fn validation_portal_frame_sway_frequency() {
    let h = 4.0; // column height
    let w = 6.0; // beam span

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let result = modal::solve_modal_2d(&input, &make_densities(), 3).unwrap();

    let e_eff = E * 1000.0;

    // Shear building lateral stiffness: 2 fixed-fixed columns
    let k_lateral = 2.0 * 12.0 * e_eff * IZ / h.powi(3);

    // Total mass in structure (distributed)
    let total_length = 2.0 * h + w;
    let total_mass = DENSITY * A * total_length / 1000.0; // tonnes

    // Approximate sway frequency (lumped mass at roof)
    let omega_approx = (k_lateral / total_mass).sqrt();

    // The first mode of a portal frame is typically the sway mode.
    // FE result with distributed mass will differ from lumped approximation,
    // but should be in the right ballpark (within ~50%).
    let omega_fe = result.modes[0].omega;
    let ratio = omega_fe / omega_approx;

    assert!(
        ratio > 0.5 && ratio < 2.0,
        "Portal frame: omega_FE = {:.4}, omega_approx = {:.4}, ratio = {:.3} (expected 0.5-2.0)",
        omega_fe, omega_approx, ratio
    );

    // The fundamental mode should have significant X participation (sway mode)
    // or Y participation depending on frame orientation.
    // At minimum, the solver should return valid positive frequencies.
    assert!(
        omega_fe > 0.0,
        "Portal frame: fundamental frequency must be positive"
    );

    // Verify period = 1/frequency
    let f1 = result.modes[0].frequency;
    let t1 = result.modes[0].period;
    assert_close(t1, 1.0 / f1, 0.001, "Portal frame: T = 1/f");
}

// ================================================================
// 4. Two-Story Shear Building: 2 Mode Shapes
// ================================================================
//
// A two-story frame (3 levels: ground, floor 1, roof) should exhibit
// at least 2 lateral sway modes. For a shear building with equal
// story stiffness k and equal floor mass m:
//   omega_1 = sqrt(k/m) * sqrt(2 - sqrt(2)) = 0.765 * sqrt(k/m)
//   omega_2 = sqrt(k/m) * sqrt(2 + sqrt(2)) = 1.848 * sqrt(k/m)
//   ratio omega_2/omega_1 = 2.414
//
// We build this as 4 columns + 2 beams.

#[test]
fn validation_two_story_shear_building() {
    let h = 3.5; // story height
    let w = 6.0; // bay width

    // Nodes: 1,4 at ground; 2,5 at floor 1; 3,6 at roof
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, 0.0, 2.0 * h),
        (4, w, 0.0),
        (5, w, h),
        (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 2, 3, 1, 1, false, false), // left col, story 2
        (3, "frame", 4, 5, 1, 1, false, false), // right col, story 1
        (4, "frame", 5, 6, 1, 1, false, false), // right col, story 2
        (5, "frame", 2, 5, 1, 1, false, false), // beam, floor 1
        (6, "frame", 3, 6, 1, 1, false, false), // beam, roof
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        vec![],
    );

    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();
    assert!(
        result.modes.len() >= 2,
        "Two-story building: expected at least 2 modes, got {}",
        result.modes.len()
    );

    // Both modes should have positive frequencies with omega_2 > omega_1
    let omega_1 = result.modes[0].omega;
    let omega_2 = result.modes[1].omega;
    assert!(omega_1 > 0.0, "omega_1 must be positive");
    assert!(
        omega_2 > omega_1,
        "omega_2 = {:.4} must be > omega_1 = {:.4}",
        omega_2, omega_1
    );

    // For a shear building, omega_2/omega_1 ~ 2.414.
    // The actual FE frame is not a pure shear building (beams flex, mass is
    // distributed), so we accept a wider range.
    let ratio = omega_2 / omega_1;
    assert!(
        ratio > 1.5 && ratio < 5.0,
        "Two-story: omega_2/omega_1 = {:.3}, expected in range 1.5-5.0",
        ratio
    );

    // Verify mass conservation
    let total_length = 4.0 * h + 2.0 * w; // 4 columns + 2 beams
    let expected_mass = DENSITY * A * total_length / 1000.0;
    assert_close(
        result.total_mass, expected_mass, 0.01,
        "Two-story: mass conservation"
    );
}

// ================================================================
// 5. Added Mass Effect: Frequency Decreases with Mass
// ================================================================
//
// Increasing the density (mass) while keeping stiffness constant
// should lower all natural frequencies, since omega = sqrt(K/M).
//
// We compare a beam with density rho vs 2*rho and verify:
//   omega(2*rho) / omega(rho) ~ 1/sqrt(2) ~ 0.707

#[test]
fn validation_added_mass_effect() {
    let length = 5.0;
    let n_elem = 8;

    let input = make_beam(n_elem, length, E, A, IZ, "fixed", None, vec![]);

    // Base density
    let mut densities_1 = HashMap::new();
    densities_1.insert("1".to_string(), DENSITY);
    let result_1 = modal::solve_modal_2d(&input, &densities_1, 3).unwrap();

    // Double density (doubled mass, same stiffness)
    let mut densities_2 = HashMap::new();
    densities_2.insert("1".to_string(), 2.0 * DENSITY);
    let result_2 = modal::solve_modal_2d(&input, &densities_2, 3).unwrap();

    // omega should decrease by factor of 1/sqrt(2) ~ 0.707
    let expected_ratio = 1.0 / (2.0_f64).sqrt(); // 0.7071

    for i in 0..result_1.modes.len().min(result_2.modes.len()) {
        let omega_1 = result_1.modes[i].omega;
        let omega_2 = result_2.modes[i].omega;

        // Frequency should decrease
        assert!(
            omega_2 < omega_1,
            "Mode {}: doubling mass should decrease frequency. omega_1={:.4}, omega_2={:.4}",
            i + 1, omega_1, omega_2
        );

        // Check the ratio is close to 1/sqrt(2)
        let actual_ratio = omega_2 / omega_1;
        let rel_err = (actual_ratio - expected_ratio).abs() / expected_ratio;
        assert!(
            rel_err < 0.05,
            "Mode {}: omega(2rho)/omega(rho) = {:.4}, expected {:.4}, error = {:.2}%",
            i + 1, actual_ratio, expected_ratio, rel_err * 100.0
        );
    }

    // Also verify total mass doubled
    assert_close(
        result_2.total_mass, 2.0 * result_1.total_mass, 0.01,
        "Total mass should double with doubled density"
    );
}

// ================================================================
// 6. Stiffness Effect: Frequency Increases with Stiffness
// ================================================================
//
// Increasing E (stiffness) while keeping mass constant should
// raise all natural frequencies, since omega = sqrt(K/M).
//
// We compare E vs 4*E and verify:
//   omega(4E) / omega(E) ~ sqrt(4) = 2.0

#[test]
fn validation_stiffness_effect() {
    let length = 5.0;
    let n_elem = 8;

    // Base stiffness
    let input_1 = make_beam(n_elem, length, E, A, IZ, "fixed", None, vec![]);
    let result_1 = modal::solve_modal_2d(&input_1, &make_densities(), 3).unwrap();

    // Quadrupled stiffness (E -> 4E)
    let e_4 = 4.0 * E;
    let input_2 = make_beam(n_elem, length, e_4, A, IZ, "fixed", None, vec![]);
    let result_2 = modal::solve_modal_2d(&input_2, &make_densities(), 3).unwrap();

    // omega should increase by factor of sqrt(4) = 2.0
    let expected_ratio = 2.0;

    for i in 0..result_1.modes.len().min(result_2.modes.len()) {
        let omega_1 = result_1.modes[i].omega;
        let omega_2 = result_2.modes[i].omega;

        // Frequency should increase
        assert!(
            omega_2 > omega_1,
            "Mode {}: quadrupling stiffness should increase frequency. omega_1={:.4}, omega_2={:.4}",
            i + 1, omega_1, omega_2
        );

        // Check the ratio is close to 2.0
        let actual_ratio = omega_2 / omega_1;
        let rel_err = (actual_ratio - expected_ratio).abs() / expected_ratio;
        assert!(
            rel_err < 0.05,
            "Mode {}: omega(4E)/omega(E) = {:.4}, expected {:.4}, error = {:.2}%",
            i + 1, actual_ratio, expected_ratio, rel_err * 100.0
        );
    }

    // Total mass should be unchanged (same density)
    assert_close(
        result_2.total_mass, result_1.total_mass, 0.001,
        "Total mass should be unchanged when only E changes"
    );
}

// ================================================================
// 7. Mode Shape Orthogonality: phi_i^T * M * phi_j = 0 for i != j
// ================================================================
//
// Eigenvectors of the generalized eigenvalue problem K*phi = w^2*M*phi
// are M-orthogonal. This is tested on a two-story frame (a more complex
// topology than a single beam) to validate orthogonality in a frame
// with both sway and vertical modes.
//
// Reference: Bathe, "Finite Element Procedures", Theorem 10.1

#[test]
fn validation_mode_shape_orthogonality() {
    let h = 4.0;
    let w = 6.0;

    // Portal frame: gives diverse mode shapes (sway, symmetric, antisymmetric)
    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let dof_num = dof::DofNumbering::build_2d(&input);

    let m_full = mass_matrix::assemble_mass_matrix_2d(&input, &dof_num, &make_densities());
    let modal_res = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let n_total = dof_num.n_total;

    for i in 0..modal_res.modes.len() {
        let phi_i = mode_to_dof_vec(&modal_res.modes[i], &dof_num);
        let m_phi_i = mat_vec(&m_full, &phi_i, n_total);
        let diag_i = dot(&phi_i, &m_phi_i);

        for j in (i + 1)..modal_res.modes.len() {
            let phi_j = mode_to_dof_vec(&modal_res.modes[j], &dof_num);
            let m_phi_j = mat_vec(&m_full, &phi_j, n_total);
            let diag_j = dot(&phi_j, &m_phi_j);

            let cross = dot(&phi_i, &m_phi_j);

            // Normalize by geometric mean of diagonal products
            let scale = (diag_i.abs() * diag_j.abs()).sqrt().max(1e-20);
            let normalized_cross = cross.abs() / scale;

            assert!(
                normalized_cross < 0.05,
                "Modes {} and {}: phi_i^T*M*phi_j / sqrt(m_ii*m_jj) = {:.6e}, should be ~0",
                i + 1, j + 1, normalized_cross
            );
        }
    }
}

// ================================================================
// 8. Rayleigh Quotient: Upper Bound Estimate
// ================================================================
//
// The Rayleigh quotient R(phi) = phi^T*K*phi / (phi^T*M*phi) provides
// an upper bound estimate of the lowest eigenvalue. For each computed
// mode, R(phi_n) should equal omega_n^2 (eigenvalue consistency).
//
// Additionally, using a coarser mesh gives a higher (worse) estimate
// that converges from above as the mesh is refined. We test both:
//   (a) R(phi) = omega^2 for each mode (eigenvalue consistency)
//   (b) omega_FE >= omega_exact (upper bound property)
//
// Reference: Bathe, "Finite Element Procedures", Section 10.2

#[test]
fn validation_rayleigh_quotient_upper_bound() {
    let length = 5.0;

    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let rho_a = DENSITY * A / 1000.0;

    // Exact first frequency for pinned-pinned beam
    let omega_exact = (std::f64::consts::PI / length).powi(2) * (ei / rho_a).sqrt();

    // (a) Test with fine mesh: Rayleigh quotient consistency for each mode
    let n_fine = 12;
    let input = make_beam(n_fine, length, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let dof_num = dof::DofNumbering::build_2d(&input);

    let asm = assembly::assemble_2d(&input, &dof_num);
    let m_full = mass_matrix::assemble_mass_matrix_2d(&input, &dof_num, &make_densities());
    let modal_res = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    let n_total = dof_num.n_total;

    for (idx, mode) in modal_res.modes.iter().enumerate() {
        let phi = mode_to_dof_vec(mode, &dof_num);

        let k_phi = mat_vec(&asm.k, &phi, n_total);
        let m_phi = mat_vec(&m_full, &phi, n_total);

        let phi_k_phi = dot(&phi, &k_phi);
        let phi_m_phi = dot(&phi, &m_phi);

        if phi_m_phi.abs() > 1e-20 {
            let omega_sq_rayleigh = phi_k_phi / phi_m_phi;
            let omega_sq_modal = mode.omega * mode.omega;

            let rel_err = (omega_sq_rayleigh - omega_sq_modal).abs()
                / omega_sq_modal.abs().max(1e-20);

            assert!(
                rel_err < 0.10,
                "Mode {}: R(phi) = {:.4}, omega^2 = {:.4}, rel_err = {:.2}%",
                idx + 1, omega_sq_rayleigh, omega_sq_modal, rel_err * 100.0
            );
        }
    }

    // (b) FE frequency is an upper bound to the exact value
    let omega_fe = modal_res.modes[0].omega;
    assert!(
        omega_fe >= omega_exact * 0.99,
        "Rayleigh upper bound: omega_FE = {:.4} should be >= omega_exact = {:.4}",
        omega_fe, omega_exact
    );

    // (c) Coarser mesh gives higher frequency (convergence from above)
    let meshes = [4, 8, 12];
    let mut omegas: Vec<f64> = Vec::new();
    for &n in &meshes {
        let inp = make_beam(n, length, E, A, IZ, "pinned", Some("rollerX"), vec![]);
        let res = modal::solve_modal_2d(&inp, &make_densities(), 1).unwrap();
        omegas.push(res.modes[0].omega);
    }

    // All should be upper bounds
    for (i, &omega) in omegas.iter().enumerate() {
        assert!(
            omega >= omega_exact * 0.99,
            "Mesh n={}: omega_FE = {:.4} should be >= omega_exact = {:.4}",
            meshes[i], omega, omega_exact
        );
    }

    // Monotonic convergence from above: omega decreases as mesh refines
    for i in 1..omegas.len() {
        assert!(
            omegas[i] <= omegas[i - 1] * 1.01,
            "Convergence from above: omega(n={}) = {:.6} should be <= omega(n={}) = {:.6}",
            meshes[i], omegas[i], meshes[i - 1], omegas[i - 1]
        );
    }
}
