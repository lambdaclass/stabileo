/// Validation: Extended Stress Analysis Fundamentals
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 5-8
///   - Hibbeler, "Mechanics of Materials", 10th Ed., Ch. 6-9
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Pilkey, "Formulas for Stress, Strain and Structural Matrices", 2nd Ed.
///
/// These tests verify fundamental stress analysis computations by solving
/// structures with the engine, extracting element forces (N, V, M), and
/// computing stresses analytically from those forces to verify consistency.
///
/// Tests:
///   1. Normal stress at extreme fiber: sigma = M*y/I
///   2. Shear stress distribution: tau_max = V*Q/(I*b) at neutral axis
///   3. Combined bending + axial: sigma = N/A + M*y/I
///   4. Principal stress transformation
///   5. Von Mises equivalent stress
///   6. Stress at multiple sections along a beam
///   7. Biaxial bending stress (3D): sigma = N/A + Mz*y/Iz + My*z/Iy
///   8. Stress reversal in a continuous beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver internally multiplies by 1000 -> kN/m^2)
const A: f64 = 0.01;      // m^2 (100mm x 100mm equivalent)
const IZ: f64 = 8.333e-6; // m^4 (b*h^3/12 for 100mm x 100mm section)
const REL_TOL: f64 = 0.05;

// Section dimensions for stress calculations (square 100mm x 100mm)
const B_SEC: f64 = 0.1;   // width (m)
const H_SEC: f64 = 0.1;   // depth (m)

// ================================================================
// 1. Normal Stress at Extreme Fiber: sigma = M*y/I
// ================================================================
//
// Simply-supported beam L=6m, 8 elements, UDL q=-10kN/m.
// Analytical: M_max = q*L^2/8 at midspan.
// Normal stress at extreme fiber: sigma = M*y/I where y = h/2.
// Verify by extracting M from the solver at midspan elements.

#[test]
fn stress_analysis_normal_stress_extreme_fiber() {
    let l = 6.0;
    let n = 8;
    let q = -10.0; // kN/m downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical maximum moment at midspan: M_max = |q|*L^2/8
    let m_max_analytical = q.abs() * l * l / 8.0; // kN*m

    // Find the elements at midspan (elements 4 and 5 straddle midspan)
    let ef4 = results.element_forces.iter().find(|f| f.element_id == 4).unwrap();
    // The moment at the junction between elements 4 and 5 (midspan node)
    let m_midspan = ef4.m_end; // = ef5.m_start

    // Verify the midspan moment matches the analytical value
    assert_close(m_midspan.abs(), m_max_analytical, REL_TOL, "M_midspan vs qL^2/8");

    // Now compute the normal stress at the extreme fiber
    // sigma = M*y/I where y = h/2, and E*1000 converts to kN/m^2
    // The stress in MPa: sigma = M * y / I / 1000 (since M is in kN*m, I in m^4)
    // Actually sigma = M * y / I gives kN/m^2, divide by 1000 for MPa
    let y_extreme = H_SEC / 2.0;
    let sigma_from_solver = m_midspan.abs() * y_extreme / IZ; // kN/m^2
    let sigma_analytical = m_max_analytical * y_extreme / IZ;  // kN/m^2

    assert_close(sigma_from_solver, sigma_analytical, REL_TOL,
        "sigma = M*y/I at extreme fiber");

    // Verify the actual value: M_max = 10*36/8 = 45 kN*m
    // sigma = 45 * 0.05 / 8.333e-6 = 270,000 kN/m^2 = 270 MPa
    let sigma_expected = 45.0 * 0.05 / IZ;
    assert_close(sigma_from_solver, sigma_expected, REL_TOL,
        "sigma numerical value check");
}

// ================================================================
// 2. Shear Stress Distribution: tau_max = V*Q/(I*b)
// ================================================================
//
// Simply-supported beam L=6m, 4 elements, point load P=-40kN at midspan.
// Analytical: V at supports = P/2 = 20 kN.
// For a rectangular section: tau_max at NA = 1.5*V/A = V*Q/(I*b)
// where Q = b*h^2/8 for rectangle at neutral axis.

#[test]
fn stress_analysis_shear_stress_distribution() {
    let l = 6.0;
    let n = 4;
    let p = -40.0; // kN downward at midspan

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Shear at supports (elements 1 and 4)
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_at_support = ef1.v_start.abs(); // should be |P|/2 = 20 kN

    let v_expected = p.abs() / 2.0; // 20 kN
    assert_close(v_at_support, v_expected, REL_TOL, "V at support = P/2");

    // For rectangular section, tau_max = 1.5 * V / A at the neutral axis
    let tau_max = 1.5 * v_at_support / A; // kN/m^2

    // Equivalently, using Jourawski formula: tau = V*Q/(I*b)
    // For rectangle at NA: Q = b*h^2/8
    let q_na = B_SEC * H_SEC * H_SEC / 8.0;
    let tau_jourawski = v_at_support * q_na / (IZ * B_SEC); // kN/m^2

    assert_close(tau_max, tau_jourawski, REL_TOL,
        "tau_max: 1.5*V/A = V*Q/(I*b)");

    // Verify numerical value: tau_max = 1.5 * 20 / 0.01 = 3000 kN/m^2 = 3 MPa
    let tau_expected = 1.5 * 20.0 / A;
    assert_close(tau_max, tau_expected, REL_TOL,
        "tau_max numerical value");

    // At the extreme fiber (y = h/2), shear stress should be zero
    // Q at extreme fiber = 0 by definition, so tau = 0
    // This is a fundamental property of the parabolic distribution
    // We verify by computing Q at y = h/2: Q = b/2 * (h^2/4 - y^2) = 0
    let q_extreme = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - (H_SEC / 2.0).powi(2));
    assert!(q_extreme.abs() < 1e-12, "Q at extreme fiber should be zero");
}

// ================================================================
// 3. Combined Bending + Axial: sigma = N/A + M*y/I
// ================================================================
//
// Beam-column: cantilever L=4m, 6 elements, simultaneous axial load
// and transverse tip load. The normal stress at any section is the
// superposition of axial and bending stresses.

#[test]
fn stress_analysis_combined_bending_axial() {
    let l = 4.0;
    let n = 6;
    let p_axial = 50.0;   // kN tension (positive fx at tip)
    let p_trans = -10.0;   // kN downward at tip

    let tip_node = n + 1;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: p_axial, fy: 0.0, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: p_trans, mz: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // At the fixed end (element 1), the internal forces should be:
    // N = axial load (tension through the beam)
    // M = P_trans * L (moment from transverse tip load about fixed end)
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();

    // Axial force should be approximately p_axial (tension)
    let n_force = ef1.n_start;
    assert_close(n_force.abs(), p_axial, REL_TOL, "N at fixed end = P_axial");

    // Moment at fixed end: M = P_trans * L = 10 * 4 = 40 kN*m
    let m_fixed = ef1.m_start.abs();
    let m_expected = p_trans.abs() * l;
    assert_close(m_fixed, m_expected, REL_TOL, "M at fixed end = P*L");

    // Combined stress at extreme fiber (bottom, tension side):
    // sigma = N/A + M*y/I
    let y_extreme = H_SEC / 2.0;
    let sigma_axial = n_force.abs() / A;             // kN/m^2
    let sigma_bending = m_fixed * y_extreme / IZ;     // kN/m^2
    let sigma_combined = sigma_axial + sigma_bending;  // max tensile stress

    // Verify superposition: the combined stress should be the sum
    // of the individual contributions
    let sigma_check = p_axial / A + (p_trans.abs() * l) * y_extreme / IZ;
    assert_close(sigma_combined, sigma_check, REL_TOL,
        "sigma_combined = N/A + M*y/I");

    // The bending stress should dominate over the axial stress
    // sigma_axial = 50/0.01 = 5000 kN/m^2
    // sigma_bending = 40*0.05/8.333e-6 = 240,000 kN/m^2
    assert!(sigma_bending > sigma_axial,
        "Bending stress ({:.0}) should dominate over axial ({:.0})",
        sigma_bending, sigma_axial);
}

// ================================================================
// 4. Principal Stress Transformation
// ================================================================
//
// At a point in a beam where we know sigma_x (from bending) and
// tau_xy (from shear), the principal stresses are:
// sigma_1,2 = (sx+sy)/2 +/- sqrt(((sx-sy)/2)^2 + txy^2)
// For a beam with sy = 0 (no transverse normal stress).
//
// Use a cantilever with tip load, evaluate at the neutral axis
// of the fixed end element where sigma = 0 and tau = max.

#[test]
fn stress_analysis_principal_stress_transformation() {
    let l = 5.0;
    let n = 4;
    let p = -30.0; // kN downward at tip

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();

    // At neutral axis (y=0): sigma_x = 0, tau = 1.5*V/A
    let v_force = ef1.v_start.abs();
    let tau_na = 1.5 * v_force / A; // kN/m^2

    let sigma_x: f64 = 0.0; // at neutral axis, no bending stress
    let sigma_y: f64 = 0.0; // beam theory: no transverse normal stress

    // Principal stresses for pure shear: sigma_1,2 = +/- tau
    let avg = (sigma_x + sigma_y) / 2.0;
    let radius = (((sigma_x - sigma_y) / 2.0).powi(2) + tau_na.powi(2)).sqrt();
    let sigma_1 = avg + radius;
    let sigma_2 = avg - radius;

    // For pure shear: sigma_1 = +tau, sigma_2 = -tau
    assert_close(sigma_1, tau_na, REL_TOL, "sigma_1 = +tau (pure shear)");
    assert_close(sigma_2, -tau_na, REL_TOL, "sigma_2 = -tau (pure shear)");

    // At extreme fiber (y = h/2): sigma_x = M*y/I, tau = 0
    let m_force = ef1.m_start.abs();
    let y_ext = H_SEC / 2.0;
    let sigma_fiber = m_force * y_ext / IZ;

    // For uniaxial stress (tau=0): sigma_1 = sigma_x, sigma_2 = 0
    let avg_f = sigma_fiber / 2.0;
    let radius_f = (((sigma_fiber) / 2.0).powi(2)).sqrt();
    let sigma_1_fiber = avg_f + radius_f;
    let sigma_2_fiber = avg_f - radius_f;

    assert_close(sigma_1_fiber, sigma_fiber, REL_TOL,
        "sigma_1 = sigma_x at extreme fiber");
    assert_close(sigma_2_fiber, 0.0, REL_TOL,
        "sigma_2 = 0 at extreme fiber (uniaxial)");

    // At an intermediate point (y = h/4): both sigma and tau are nonzero
    let y_mid = H_SEC / 4.0;
    let sigma_mid = m_force * y_mid / IZ;
    // Q at y = h/4 for rectangle: Q = b/2 * (h^2/4 - y^2)
    let q_mid = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - y_mid * y_mid);
    let tau_mid = v_force * q_mid / (IZ * B_SEC);

    let avg_mid = sigma_mid / 2.0;
    let radius_mid = ((sigma_mid / 2.0).powi(2) + tau_mid.powi(2)).sqrt();
    let s1_mid = avg_mid + radius_mid;
    let s2_mid = avg_mid - radius_mid;

    // Verify: sigma_1 >= sigma_x (principal stress is always >= normal stress component)
    assert!(s1_mid >= sigma_mid - 1e-6,
        "sigma_1 ({:.2}) should be >= sigma_x ({:.2})", s1_mid, sigma_mid);
    // Verify: sigma_1 * sigma_2 = sigma_x*sigma_y - tau_xy^2 (determinant of stress tensor)
    let det_expected = sigma_mid * 0.0 - tau_mid * tau_mid;
    let det_actual = s1_mid * s2_mid;
    assert_close(det_actual, det_expected, REL_TOL, "principal stress determinant");
}

// ================================================================
// 5. Von Mises Equivalent Stress
// ================================================================
//
// sigma_vm = sqrt(sigma^2 + 3*tau^2) for plane stress with sy=0.
// Verify at multiple points of a cantilever beam cross-section.

#[test]
fn stress_analysis_von_mises_equivalent() {
    let l = 4.0;
    let n = 4;
    let p = -25.0; // kN downward at tip

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_force = ef1.v_start.abs();
    let m_force = ef1.m_start.abs();

    // Check Von Mises at three key points across the cross-section:

    // Point A: Extreme fiber (y = h/2) - pure bending, no shear
    let sigma_a = m_force * (H_SEC / 2.0) / IZ;
    let tau_a: f64 = 0.0;
    let vm_a = (sigma_a.powi(2) + 3.0 * tau_a.powi(2)).sqrt();
    assert_close(vm_a, sigma_a, REL_TOL, "VM at extreme fiber = sigma (pure bending)");

    // Point B: Neutral axis (y = 0) - pure shear, no bending
    let sigma_b: f64 = 0.0;
    let tau_b = 1.5 * v_force / A;
    let vm_b = (sigma_b.powi(2) + 3.0 * tau_b.powi(2)).sqrt();
    let vm_b_expected = 3.0_f64.sqrt() * tau_b;
    assert_close(vm_b, vm_b_expected, REL_TOL, "VM at NA = sqrt(3)*tau");

    // Point C: Quarter depth (y = h/4) - combined sigma and tau
    let y_c = H_SEC / 4.0;
    let sigma_c = m_force * y_c / IZ;
    let q_c = B_SEC / 2.0 * (H_SEC * H_SEC / 4.0 - y_c * y_c);
    let tau_c = v_force * q_c / (IZ * B_SEC);
    let vm_c = (sigma_c.powi(2) + 3.0 * tau_c.powi(2)).sqrt();

    // Von Mises should be >= max(|sigma|, sqrt(3)*|tau|) - the envelope property
    assert!(vm_c >= sigma_c.abs() - 1e-6,
        "VM ({:.2}) should be >= |sigma| ({:.2})", vm_c, sigma_c.abs());
    assert!(vm_c >= 3.0_f64.sqrt() * tau_c.abs() - 1e-6,
        "VM ({:.2}) should be >= sqrt(3)*|tau| ({:.2})", vm_c, 3.0_f64.sqrt() * tau_c.abs());

    // Verify VM is computed correctly as sqrt(sigma^2 + 3*tau^2)
    let vm_c_check = (sigma_c * sigma_c + 3.0 * tau_c * tau_c).sqrt();
    assert_close(vm_c, vm_c_check, 1e-10, "VM formula consistency");

    // The maximum VM stress at the fixed end should be at the extreme fiber
    // (for a cantilever where M >> V in terms of stress contribution)
    assert!(vm_a > vm_b,
        "VM at extreme fiber ({:.0}) should exceed VM at NA ({:.0}) for long beam",
        vm_a, vm_b);
}

// ================================================================
// 6. Stress at Multiple Sections Along a Beam
// ================================================================
//
// SS beam L=10m, 10 elements, UDL q=-12kN/m.
// The bending stress at the extreme fiber follows the parabolic
// moment diagram: sigma(x) = M(x)*y/I where M(x) = qx(L-x)/2.
// Verify that stresses from solver element forces match the
// analytical parabolic shape.

#[test]
fn stress_analysis_stress_diagram_shape() {
    let l = 10.0;
    let n = 10;
    let q = -12.0; // kN/m downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let h = l / n as f64; // 1.0m per element
    let y_ext = H_SEC / 2.0;

    // Sort element forces by ID
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|f| f.element_id);

    // Verify stress at the start of each element follows parabolic shape
    for (i, ef) in sorted_forces.iter().enumerate() {
        let x = i as f64 * h; // position of element start

        // Analytical moment at x: M(x) = |q|*x*(L-x)/2
        let m_analytical = q.abs() * x * (l - x) / 2.0;

        // Stress from solver moment
        let sigma_solver = ef.m_start.abs() * y_ext / IZ;

        // Stress from analytical moment
        let sigma_analytical = m_analytical * y_ext / IZ;

        // Allow larger tolerance at supports where both are near zero
        if m_analytical.abs() > 1.0 {
            assert_close(sigma_solver, sigma_analytical, REL_TOL,
                &format!("sigma at x={:.1}m", x));
        }
    }

    // The maximum stress should be at midspan
    let m_max = q.abs() * l * l / 8.0;
    let sigma_max_expected = m_max * y_ext / IZ;

    // Find maximum moment magnitude from all elements
    let max_m = sorted_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    let sigma_max_solver = max_m * y_ext / IZ;

    assert_close(sigma_max_solver, sigma_max_expected, REL_TOL,
        "max sigma at midspan");

    // Stress should be symmetric: sigma(x) = sigma(L-x)
    let ef_left = sorted_forces[2];  // element 3 (x ≈ 2m)
    let ef_right = sorted_forces[7]; // element 8 (x ≈ 8m, symmetric to 2m)
    let sigma_left = ef_left.m_end.abs() * y_ext / IZ;
    let sigma_right = ef_right.m_start.abs() * y_ext / IZ;
    assert_close(sigma_left, sigma_right, REL_TOL, "stress symmetry: sigma(3) = sigma(7)");
}

// ================================================================
// 7. Biaxial Bending Stress (3D): sigma = N/A + Mz*y/Iz + My*z/Iy
// ================================================================
//
// 3D cantilever beam with loads in both Y and Z directions plus axial.
// The normal stress at any fiber point is the superposition of three
// contributions: axial, strong-axis bending, and weak-axis bending.

#[test]
fn stress_analysis_biaxial_bending_3d() {
    let l = 5.0;
    let n = 4;
    let nu = 0.3;

    // Square section 100mm x 100mm
    let a = 0.01;       // m^2
    let iy = 8.333e-6;  // m^4 (same as iz for square)
    let iz = 8.333e-6;  // m^4
    let j = 1.406e-5;   // m^4

    let n_axial = 100.0; // kN tension
    let fy = -15.0;      // kN downward (Y direction)
    let fz = -10.0;      // kN lateral (Z direction)

    let tip_node = n + 1;

    let input = make_3d_beam(
        n, l, E, nu, a, iy, iz, j,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: tip_node,
            fx: n_axial, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Element at the fixed end (element 1) has the maximum forces
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();

    // Internal forces at the fixed end:
    // N should be ~ n_axial (tension)
    // Mz should be ~ fy * L (bending about z from fy load)
    // My should be ~ fz * L (bending about y from fz load)
    let n_force = ef1.n_start.abs();
    let mz_force = ef1.mz_start.abs();
    let my_force = ef1.my_start.abs();

    assert_close(n_force, n_axial, REL_TOL, "N at fixed end");
    assert_close(mz_force, fy.abs() * l, REL_TOL, "Mz at fixed end = Fy*L");
    assert_close(my_force, fz.abs() * l, REL_TOL, "My at fixed end = Fz*L");

    // Navier formula: sigma(y,z) = N/A + Mz*y/Iz + My*z/Iy
    // (sign convention: positive N is tension, positive sigma is tension)
    // E_eff = E * 1000 = 200e6 kN/m^2, but stress is in kN/m^2 from forces in kN

    let e_eff = E * 1000.0;
    let _ = e_eff; // for reference

    // Stress at corner fiber (y = h/2, z = b/2) - maximum compression
    let y_corner = H_SEC / 2.0;
    let z_corner = B_SEC / 2.0;

    let sigma_axial = n_force / a;                     // kN/m^2
    let sigma_mz = mz_force * y_corner / iz;           // kN/m^2
    let sigma_my = my_force * z_corner / iy;            // kN/m^2
    let sigma_total = sigma_axial + sigma_mz + sigma_my; // superposition

    // Verify superposition principle: total = sum of parts
    let parts_sum = sigma_axial + sigma_mz + sigma_my;
    assert_close(sigma_total, parts_sum, 1e-10, "superposition principle");

    // Verify each contribution is positive (all are absolute values)
    assert!(sigma_axial > 0.0, "axial stress should be positive (tension)");
    assert!(sigma_mz > 0.0, "Mz bending stress should be positive at y > 0");
    assert!(sigma_my > 0.0, "My bending stress should be positive at z > 0");

    // Numerical check:
    // sigma_axial = 100/0.01 = 10,000 kN/m^2
    // sigma_mz = 75*0.05/8.333e-6 = 450,000 kN/m^2
    // sigma_my = 50*0.05/8.333e-6 = 300,006 kN/m^2
    let sigma_axial_expected = 100.0 / 0.01;
    let sigma_mz_expected = (fy.abs() * l) * (H_SEC / 2.0) / iz;
    let sigma_my_expected = (fz.abs() * l) * (B_SEC / 2.0) / iy;

    assert_close(sigma_axial, sigma_axial_expected, REL_TOL, "sigma_axial numerical");
    assert_close(sigma_mz, sigma_mz_expected, REL_TOL, "sigma_Mz numerical");
    assert_close(sigma_my, sigma_my_expected, REL_TOL, "sigma_My numerical");
}

// ================================================================
// 8. Stress Reversal in a Continuous Beam
// ================================================================
//
// Two-span continuous beam (spans 5m + 5m), UDL q=-15kN/m.
// Key property: moment is negative (hogging) at the interior support
// and positive (sagging) at midspans.
// This means the extreme fiber stress changes sign (reversal):
// - At midspan: tension on the bottom fiber
// - At support: tension on the top fiber (compression on bottom)

#[test]
fn stress_analysis_stress_reversal_continuous_beam() {
    let q = -15.0;       // kN/m downward
    let n_per_span = 4;  // 4 elements per span = 8 total
    let span = 5.0;

    let total_elements = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[span, span], n_per_span, E, A, IZ, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Sort element forces
    let mut sorted_forces: Vec<_> = results.element_forces.iter().collect();
    sorted_forces.sort_by_key(|f| f.element_id);

    // For a two-span continuous beam with uniform load:
    // M at interior support = -q*L^2/8 (approximate, exact is -qL^2/8 for equal spans)
    // M at midspan ≈ +9qL^2/128 (approximate)

    // The interior support is at the junction of elements 4 and 5
    let ef4 = sorted_forces[3]; // element 4 (end of first span)
    let ef5 = sorted_forces[4]; // element 5 (start of second span)

    let m_support = ef4.m_end; // moment at interior support

    // The midspan of span 1 is approximately at elements 2-3 junction
    let ef2 = sorted_forces[1]; // element 2
    let m_midspan1 = ef2.m_end; // moment at midspan of span 1

    // Key verification: stress reversal
    // At interior support, moment should be negative (hogging)
    // At midspan, moment should be positive (sagging)
    // The product of the two moments should be negative (opposite signs)
    assert!(m_support * m_midspan1 < 0.0,
        "Moment should reverse sign between support ({:.4}) and midspan ({:.4})",
        m_support, m_midspan1);

    // Normal stress at the bottom fiber (y = -h/2)
    let y_bottom = -H_SEC / 2.0;

    // Stress at interior support (bottom fiber)
    let sigma_support_bottom = m_support * y_bottom / IZ;

    // Stress at midspan (bottom fiber)
    let sigma_midspan_bottom = m_midspan1 * y_bottom / IZ;

    // The stress should also reverse sign
    assert!(sigma_support_bottom * sigma_midspan_bottom < 0.0,
        "Bottom fiber stress should reverse: support={:.2}, midspan={:.2}",
        sigma_support_bottom, sigma_midspan_bottom);

    // For the two-span beam, analytical interior support moment:
    // Using three-moment equation: M_B = -q*L^2/8
    let m_support_analytical = -q.abs() * span * span / 8.0;

    // The solver's support moment should be close to the analytical value
    // (negative = hogging convention in the solver)
    assert_close(m_support.abs(), m_support_analytical.abs(), REL_TOL,
        "M at interior support ≈ qL^2/8");

    // Verify moment continuity at the interior support
    assert_close(ef4.m_end, ef5.m_start, REL_TOL,
        "Moment continuity at interior support");

    // Verify by computing stress at both fibers at support:
    // Top fiber stress and bottom fiber stress should have opposite signs
    let y_top = H_SEC / 2.0;
    let sigma_support_top = m_support * y_top / IZ;
    assert!(sigma_support_top * sigma_support_bottom < 0.0,
        "Top and bottom fiber stresses should be opposite at support");
}
