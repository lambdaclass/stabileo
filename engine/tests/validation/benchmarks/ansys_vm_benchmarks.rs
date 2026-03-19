/// Validation: ANSYS Verification Manual — Benchmark Problems
///
/// References:
///   - ANSYS Mechanical APDL Verification Manual, Release 2024
///   - VM22: Cantilever with Combined Axial and Bending (P-delta)
///   - VM23: Beam on Elastic (Winkler) Foundation
///   - VM26: Two-Span Continuous Beam (Partial UDL)
///   - VM27: Simply Supported Beam with Thermal Gradient
///   - VM30: Pin-Jointed Space Truss (3D)
///   - VM33: Statically Indeterminate Truss (3-bar, 45/90/135)
///   - VM34: Two-Bar Truss with Thermal Load
///   - VM40: Large Deflection of a Cantilever (Corotational)
///
/// These tests cover problems NOT already in validation_ansys_vm.rs,
/// validation_ansys_vm_extended.rs, or validation_ansys_vm_additional.rs.
use dedaliano_engine::solver::{corotational, linear, pdelta, winkler};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective)
const ALPHA: f64 = 12e-6; // /degC (hardcoded in engine)

// ================================================================
// 1. VM22: Cantilever with Combined Axial and Bending
// ================================================================
//
// Cantilever beam, L=10m, EI=2e7 N*m^2, P=1000N lateral at tip,
// N=50000N axial compression at tip.
//
// First-order tip deflection: delta_1 = P*L^3/(3EI)
// With P-delta: amplified by approximately 1/(1 - N/Pcr)
// where Pcr = pi^2*EI/(4L^2) for cantilever (K=2, Le=2L).
//
// Reference: ANSYS VM22, tip deflection with second-order effects.

#[test]
fn validation_ansys_vm22_cantilever_axial_bending() {
    // Map to engine units: EI = 2e7 N*m^2 = 20000 kN*m^2
    // So E_eff * Iz = 20000 => Iz = 20000 / E_EFF = 20000 / 200e6 = 1e-4 m^4
    // P = 1000 N = 1.0 kN, N = 50000 N = 50 kN
    let l = 10.0;
    let iz = 1e-4;
    let a_sec = 0.01;
    let p_lat = 1.0; // kN lateral at tip
    let n_axial = 50.0; // kN axial compression
    let n_elem = 10;

    let ei = E_EFF * iz; // 20000 kN*m^2

    // Euler critical load for cantilever: Pcr = pi^2*EI/(Le^2) where Le=2L
    let pcr = std::f64::consts::PI.powi(2) * ei / (4.0 * l * l);

    // First-order tip deflection
    let delta_1st = p_lat * l.powi(3) / (3.0 * ei);

    // Amplification factor for cantilever with axial compression
    // Using secant-based amplification: AF ~ 1/(1 - N/Pcr) as approximation
    let af_approx = 1.0 / (1.0 - n_axial / pcr);

    let elem_len = l / n_elem as f64;
    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_elem + 1,
        fx: -n_axial, // compression
        fz: -p_lat,   // lateral
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    // Linear solution (first-order)
    let lin = linear::solve_2d(&input).unwrap();
    let tip_lin = lin
        .displacements
        .iter()
        .find(|d| d.node_id == n_elem + 1)
        .unwrap();
    assert_close(tip_lin.uz.abs(), delta_1st, 0.03, "VM22 1st-order tip deflection");

    // P-delta solution (second-order)
    let pd = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(pd.converged, "VM22 P-delta should converge");
    assert!(pd.is_stable, "VM22 should be stable (N < Pcr)");

    let tip_pd = pd
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n_elem + 1)
        .unwrap();

    // P-delta deflection should exceed linear
    assert!(
        tip_pd.uz.abs() > tip_lin.uz.abs(),
        "VM22: P-delta deflection ({:.6}) should exceed linear ({:.6})",
        tip_pd.uz.abs(),
        tip_lin.uz.abs()
    );

    // Amplification should be close to analytical 1/(1-N/Pcr)
    let actual_af = tip_pd.uz.abs() / tip_lin.uz.abs();
    assert!(
        (actual_af - af_approx).abs() / af_approx < 0.15,
        "VM22: amplification actual={:.4}, expected~{:.4}",
        actual_af,
        af_approx
    );
}

// ================================================================
// 2. VM23: Beam on Elastic (Winkler) Foundation
// ================================================================
//
// Simply supported beam on elastic foundation with UDL.
// L=10m, EI, kf=1000 kN/m/m, q=10 kN/m.
//
// For a beam on Winkler foundation with UDL:
// Midspan deflection = q/kf (for long beam where foundation dominates)
// For finite beam: delta_mid from beam-on-foundation theory.
//
// The key relationship: for very stiff foundation, delta -> q/kf.
// For moderate foundation: verify FE result is between pure beam and q/kf.

#[test]
fn validation_ansys_vm23_winkler_foundation() {
    let l = 10.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let kf = 1000.0; // kN/m/m (foundation modulus)
    let q = -10.0; // kN/m downward
    let n = 10;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n + 1, "rollerX")];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let solver_input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        sups,
        loads,
    );

    // Foundation springs on all elements
    let foundation_springs: Vec<_> = (0..n)
        .map(|i| winkler::FoundationSpring {
            element_id: i + 1,
            kf,
        })
        .collect();

    let winkler_input = winkler::WinklerInput {
        solver: solver_input.clone(),
        foundation_springs,
    };

    // Solve with Winkler foundation
    let res_winkler = winkler::solve_winkler_2d(&winkler_input).unwrap();

    // Solve without foundation (plain beam)
    let res_beam = linear::solve_2d(&solver_input).unwrap();

    let mid = n / 2 + 1;
    let d_winkler = res_winkler
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uz
        .abs();
    let d_beam = res_beam
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap()
        .uz
        .abs();

    // Foundation should significantly reduce deflection
    assert!(
        d_winkler < d_beam,
        "VM23: Winkler deflection ({:.6}) should be less than plain beam ({:.6})",
        d_winkler,
        d_beam
    );

    // For infinite beam on Winkler foundation: delta = q/kf = 10/1000 = 0.01 m
    // Finite SS beam will have slightly different value, but should be in the right ballpark
    let d_foundation_limit = q.abs() / kf;

    // The Winkler deflection should be between the pure foundation limit
    // and the plain beam deflection
    assert!(
        d_winkler < d_beam && d_winkler > d_foundation_limit * 0.5,
        "VM23: Winkler deflection ({:.6e}) should be between foundation limit ({:.6e}) and beam ({:.6e})",
        d_winkler,
        d_foundation_limit,
        d_beam
    );

    // Characteristic length: lambda = (kf / (4*EI))^0.25
    let ei = E_EFF * iz;
    let lambda = (kf / (4.0 * ei)).powf(0.25);
    let lambda_l = lambda * l;

    // For lambda*L > pi, the beam is "long" and midspan approaches q/kf
    // For lambda*L < 1, the beam is "short" and foundation has less effect
    // Our lambda*L should be moderate
    assert!(
        lambda_l > 0.5,
        "VM23: lambda*L={:.4} should be moderate for meaningful test",
        lambda_l
    );

    // Equilibrium: sum of reactions + foundation forces should equal total load
    let total_load = q.abs() * l;
    let sum_ry: f64 = res_winkler.reactions.iter().map(|r| r.rz).sum();
    // Foundation carries some load too, so reactions < total_load
    assert!(
        sum_ry < total_load,
        "VM23: reactions ({:.4}) should be less than total load ({:.4}) — foundation carries the rest",
        sum_ry,
        total_load
    );
    assert!(
        sum_ry > 0.0,
        "VM23: reactions ({:.4}) should be positive",
        sum_ry
    );
}

// ================================================================
// 3. VM26: Two-Span Continuous Beam with Partial UDL
// ================================================================
//
// Two equal spans L each. UDL q on span 1 only (span 2 unloaded).
// Three supports: A (left), B (interior), C (right).
//
// By three-moment equation:
//   R_B = (5/8)*q*L (interior reaction for single-span loaded)
//   R_A = q*L - R_B/2 (from equilibrium of span 1)
//
// Reference: ANSYS VM26, Timoshenko beam tables.

#[test]
fn validation_ansys_vm26_two_span_partial_udl() {
    let l = 6.0; // each span
    let q = -10.0; // kN/m on span 1 only
    let n_per_span = 6;

    let total_elems = n_per_span * 2;
    let total_nodes = total_elems + 1;

    // UDL only on span 1 (elements 1 to n_per_span)
    let mut loads = Vec::new();
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, 0.01, 1e-4, loads);
    let results = linear::solve_2d(&input).unwrap();

    let node_a = 1;
    let node_b = n_per_span + 1; // interior support
    let node_c = total_nodes; // right end

    let r_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_a)
        .unwrap()
        .rz;
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_b)
        .unwrap()
        .rz;
    let r_c = results
        .reactions
        .iter()
        .find(|r| r.node_id == node_c)
        .unwrap()
        .rz;

    // Three-moment equation for two equal spans, UDL on span 1:
    // M_B = -q*L^2/16 (hogging at interior support)
    //
    // Span AB (moments about B):
    //   R_A*L = qL^2/2 - |M_B| = qL^2/2 - qL^2/16 = 7qL^2/16
    //   R_A = 7qL/16
    //
    // Interior reaction R_B has contributions from both spans:
    //   R_B_left  = qL - R_A = 9qL/16   (from span AB equilibrium)
    //   R_B_right = |M_B|/L = qL/16     (from span BC, unloaded)
    //   R_B = R_B_left + R_B_right = 10qL/16 = 5qL/8
    //
    // R_C from span BC:
    //   R_C + R_B_right = 0 => R_C = -qL/16 (downward, uplift at far end)
    let total_load = q.abs() * l; // = 60 kN
    let r_a_expected = 7.0 * q.abs() * l / 16.0; // = 26.25 kN
    let r_b_expected = 5.0 * q.abs() * l / 8.0; // = 37.5 kN
    let r_c_expected = -q.abs() * l / 16.0; // = -3.75 kN (downward)

    assert_close(r_a, r_a_expected, 0.03, "VM26 R_A = 7qL/16");
    assert_close(r_b, r_b_expected, 0.03, "VM26 R_B = 5qL/8");
    assert_close(r_c, r_c_expected, 0.10, "VM26 R_C = -qL/16");

    // Equilibrium: R_A + R_B + R_C = total load on span 1
    let sum_ry = r_a + r_b + r_c;
    assert_close(sum_ry, total_load, 0.02, "VM26 equilibrium");

    // Interior moment at B: |M_B| = qL^2/16
    let m_b_expected = q.abs() * l * l / 16.0; // 22.5 kN*m
    let ef_b = results
        .element_forces
        .iter()
        .find(|f| f.element_id == n_per_span)
        .unwrap();
    assert_close(
        ef_b.m_end.abs(),
        m_b_expected,
        0.05,
        "VM26 M_B = qL^2/16",
    );
}

// ================================================================
// 4. VM27: Simply Supported Beam with Thermal Gradient
// ================================================================
//
// SS beam with temperature linearly varying through depth.
// Thermal moment = alpha * dT * E * I / h.
// For SS beam: zero bending moments, parabolic deflection.
// Midspan deflection: delta = alpha * dT * L^2 / (8 * h).
//
// Reference: ANSYS VM27, thermal bending of SS beam.

#[test]
fn validation_ansys_vm27_ss_beam_thermal_gradient() {
    let l = 5.0;
    let a_sec = 0.01;
    let iz = 1e-4;
    let dt_grad = 50.0; // temperature gradient (top - bottom)
    let n = 8;

    let h_sec = (12.0_f64 * iz / a_sec).sqrt(); // section depth from I = bh^3/12

    let input = make_beam(
        n,
        l,
        E,
        a_sec,
        iz,
        "pinned",
        Some("rollerX"),
        (0..n)
            .map(|i| {
                SolverLoad::Thermal(SolverThermalLoad {
                    element_id: i + 1,
                    dt_uniform: 0.0,
                    dt_gradient: dt_grad,
                })
            })
            .collect(),
    );

    let results = linear::solve_2d(&input).unwrap();

    // Expected midspan deflection: delta = alpha * dT * L^2 / (8 * h)
    let delta_expected = ALPHA * dt_grad * l * l / (8.0 * h_sec);

    let mid = n / 2 + 1;
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid)
        .unwrap();

    assert_close(
        d_mid.uz.abs(),
        delta_expected,
        0.05,
        "VM27 midspan deflection = alpha*dT*L^2/(8h)",
    );

    // For SS beam with uniform thermal gradient: zero bending moments
    // (beam is free to bow without restraint)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 1.0 && ef.m_end.abs() < 1.0,
            "VM27: M should be ~0 in SS beam, got m_start={:.4} on elem {}",
            ef.m_start,
            ef.element_id
        );
    }

    // Zero vertical reactions (no transverse load)
    let r_left = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert!(
        r_left.rz.abs() < 0.5,
        "VM27: left reaction Ry={:.4} should be ~0",
        r_left.rz
    );
    assert!(
        r_right.rz.abs() < 0.5,
        "VM27: right reaction Ry={:.4} should be ~0",
        r_right.rz
    );
}

// ================================================================
// 5. VM30: Pin-Jointed Space Truss (3D)
// ================================================================
//
// 3D space truss with 3 members meeting at a point.
// Applied vertical load at the junction.
// Base nodes at known positions; apex loaded vertically.
//
// Geometry: 3 bars from base plane converge at apex.
//   Node 1: (2, 0, 0), Node 2: (-1, sqrt(3), 0), Node 3: (-1, -sqrt(3), 0)
//   Node 4 (apex): (0, 0, 4) — loaded with Fz = -120 kN
//
// By symmetry, each bar carries the same axial force.
// F_bar = P / (3 * cos_phi) where cos_phi = h / L_bar.

#[test]
fn validation_ansys_vm30_3d_space_truss() {
    let h = 4.0;
    let r = 2.0;
    let p = 120.0; // kN downward at apex

    // Base nodes at 120-degree intervals, radius r from origin at z=0
    let s3 = 3.0_f64.sqrt();
    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, -r / 2.0, r * s3 / 2.0, 0.0),
        (3, -r / 2.0, -r * s3 / 2.0, 0.0),
        (4, 0.0, 0.0, h),
    ];

    let elems: Vec<_> = (0..3)
        .map(|i| (i + 1, "truss", i + 1, 4, 1, 1))
        .collect();

    // All base nodes fully restrained in translation
    let sups: Vec<_> = (0..3)
        .map(|i| (i + 1, vec![true, true, true, false, false, false]))
        .collect();

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4,
        fx: 0.0,
        fz: 0.0,
        fy: -p,
        mx: 0.0,
        my: 0.0,
        mz: 0.0,
        bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 0.005, 1e-10, 1e-10, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Bar length: each base node is at distance r from origin in XY-plane
    // apex at (0,0,h), so L = sqrt(r^2 + h^2)
    let bar_len = (r * r + h * h).sqrt();
    let cos_phi = h / bar_len;

    // By symmetry, vertical component of each bar force = P/3
    // F_bar * cos_phi = P/3
    // F_bar = P / (3 * cos_phi)
    let f_bar_expected = p / (3.0 * cos_phi);

    for ef in &results.element_forces {
        assert_close(
            ef.n_start.abs(),
            f_bar_expected,
            0.02,
            &format!("VM30 bar {} force", ef.element_id),
        );
    }

    // Global equilibrium in z
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, p, 0.01, "VM30 vertical equilibrium");

    // Horizontal equilibrium (by symmetry, net Fx = Fy = 0)
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fx.abs() < 0.1, "VM30 sum_fx={:.4} should be ~0", sum_fx);
    assert!(sum_fz.abs() < 0.1, "VM30 sum_fz={:.4} should be ~0", sum_fz);

    // Apex displacement should be purely downward (by symmetry)
    let apex = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap();
    assert!(
        apex.ux.abs() < 1e-6 && apex.uz.abs() < 1e-6,
        "VM30: apex should have no lateral displacement, got ux={:.6e}, uy={:.6e}",
        apex.ux,
        apex.uz
    );
    assert!(
        apex.uz < 0.0,
        "VM30: apex should deflect downward, uz={:.6e}",
        apex.uz
    );
}

// ================================================================
// 6. VM33: Statically Indeterminate 3-Bar Truss
// ================================================================
//
// Three bars meeting at a point: left bar at 45 deg, center bar
// vertical (90 deg), right bar at 135 deg. Loaded vertically at apex.
//
// All bars: same E, same A, same length for inclined bars.
// Center bar length = L * cos(45) = L/sqrt(2).
//
// Analytical (compatibility):
//   F_center = P / (1 + 2*cos^2(theta))     where theta = 45 deg
//   F_outer  = P * cos(theta) / (1 + 2*cos^2(theta))
//
// Reference: ANSYS VM33, Timoshenko *Strength of Materials*.

#[test]
fn validation_ansys_vm33_indeterminate_3bar_truss() {
    let theta = 45.0_f64.to_radians();
    let l_outer = 2.0; // inclined bar length
    let p = 100.0; // kN downward at apex

    let cos_t = theta.cos();
    let sin_t = theta.sin();

    // Height of apex below support level = L_outer * cos(theta)
    let h = l_outer * cos_t;
    // Horizontal span = L_outer * sin(theta)
    let span = l_outer * sin_t;

    // Nodes: 1=left support, 2=center support (directly above apex), 3=right support
    //        4=apex (loaded point)
    let nodes = vec![
        (1, -span, h),  // left top
        (2, 0.0, h),    // center top
        (3, span, h),   // right top
        (4, 0.0, 0.0),  // apex bottom
    ];

    // All bars have same area and material
    let a_truss = 0.005; // m^2

    let elems = vec![
        (1, "truss", 1, 4, 1, 1, false, false), // left inclined
        (2, "truss", 2, 4, 1, 1, false, false), // center vertical
        (3, "truss", 3, 4, 1, 1, false, false), // right inclined
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 1e-10)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Analytical solution for same A, E:
    // The center bar has length h = L_outer * cos(theta).
    // The outer bars have length L_outer.
    //
    // Stiffness contributions (vertical projection):
    //   k_center = EA / h = EA / (L_outer * cos_t)
    //   k_outer_vert = EA * cos_t^2 / L_outer (projection stiffness)
    //
    // Vertical apex displacement:
    //   delta = P / (k_center + 2 * k_outer_vert)
    //         = P * L_outer / (EA * (1/cos_t + 2*cos_t^2))
    //
    // Force in center bar:
    //   F_center = k_center * delta = P / (1 + 2*cos_t^3)
    //
    // Force along outer bar (axial):
    //   The outer bar elongation = delta * cos_t
    //   F_outer = EA/L_outer * delta * cos_t
    //           = P * cos_t / (1/cos_t + 2*cos_t^2)
    //           = P * cos_t^2 / (1 + 2*cos_t^3)
    //
    // For theta=45: cos_t = 1/sqrt(2), cos_t^3 = 1/(2*sqrt(2))
    //   denom = 1 + 2/(2*sqrt(2)) = 1 + 1/sqrt(2) = 1.7071
    //   F_center = 100/1.7071 = 58.58 kN
    //   F_outer_bar = 100 * (1/sqrt(2))^2 / 1.7071 = 100*0.5/1.7071 = 29.29 kN

    let denom = 1.0 + 2.0 * cos_t.powi(3);
    let f_center_expected = p / denom;
    let f_outer_bar_expected = p * cos_t.powi(2) / denom;

    // Center bar (element 2)
    let ef_center = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();
    assert_close(
        ef_center.n_start.abs(),
        f_center_expected,
        0.03,
        "VM33 F_center",
    );

    // Outer bars (elements 1, 3) - axial force along bar
    let ef_left = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef_right = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();

    assert_close(
        ef_left.n_start.abs(),
        f_outer_bar_expected,
        0.03,
        "VM33 F_outer_left",
    );
    assert_close(
        ef_right.n_start.abs(),
        f_outer_bar_expected,
        0.03,
        "VM33 F_outer_right",
    );

    // Symmetry: outer bars carry equal force
    assert_close(
        ef_left.n_start.abs(),
        ef_right.n_start.abs(),
        0.01,
        "VM33 symmetry",
    );

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "VM33 equilibrium");
}

// ================================================================
// 7. VM34: Two-Bar Truss with Thermal Load (No External Force)
// ================================================================
//
// Two colinear bars between rigid walls. Bar 1 (left) heated by dT,
// bar 2 (right) unheated. Both ends fixed axially.
//
// Setup:
//   Node 1 (x=0, fixed) -- bar 1 (L1) -- node 2 (free) -- bar 2 (L2) -- node 3 (x=L1+L2, fixed)
//   Both bars: same material E, areas A1 and A2, lengths L1 and L2.
//
// Analytical:
//   Bar 1 wants to expand by alpha*dT*L1.
//   Total stiffness: EA1/L1 + EA2/L2 (in series for displacement, parallel for force).
//   Actually for bars in series between two fixed walls:
//     Compatibility: delta1 + delta2 = 0 (total expansion = 0)
//     delta1 = alpha*dT*L1 + F*L1/(E*A1)  (thermal + mechanical)
//     delta2 = F*L2/(E*A2)  (mechanical only, same force F through both bars)
//     alpha*dT*L1 + F*L1/(EA1) + F*L2/(EA2) = 0
//     F = -alpha*dT*L1 / (L1/(EA1) + L2/(EA2))
//     F = -E*alpha*dT / (1/A1 + L2/(A2*L1))  (for L1 = L2: F = -E*A*alpha*dT/2 if A1=A2)
//
// For equal bars (A1=A2=A, L1=L2=L):
//   F = -E*A*alpha*dT / 2  (compressive in both bars)
//
// Reference: ANSYS VM34, Timoshenko *Strength of Materials*.

#[test]
fn validation_ansys_vm34_thermal_two_bar_truss() {
    // Two colinear bars between walls, bar 1 heated
    let l1 = 2.0;
    let l2 = 3.0;
    let a1 = 0.005; // m^2
    let a2 = 0.008; // m^2
    let dt = 100.0; // temperature increase in bar 1
    let iz = 1e-4; // need nonzero for frame element bending stiffness

    // Nodes along x-axis
    let nodes = vec![
        (1, 0.0, 0.0),        // left wall
        (2, l1, 0.0),          // junction
        (3, l1 + l2, 0.0),    // right wall
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // bar 1 (heated), section 1
        (2, "frame", 2, 3, 1, 2, false, false), // bar 2 (unheated), section 2
    ];

    // Fixed at both ends (walls)
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];

    // Thermal load on bar 1 only
    let loads = vec![SolverLoad::Thermal(SolverThermalLoad {
        element_id: 1,
        dt_uniform: dt,
        dt_gradient: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a1, iz), (2, a2, iz)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Analytical force (compressive, same in both bars by equilibrium):
    // F = -E_eff * alpha * dT * L1 / (L1/A1 + L2/A2)
    //   = -E_eff * alpha * dT / (1/A1 + L2/(A2*L1))
    let f_expected = E_EFF * ALPHA * dt * l1 / (l1 / a1 + l2 / a2);

    let ef1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef2 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2)
        .unwrap();

    // Both bars carry the same axial force (equilibrium at junction node)
    assert_close(
        ef1.n_start.abs(),
        f_expected,
        0.03,
        "VM34 bar 1 thermal axial force",
    );
    assert_close(
        ef2.n_start.abs(),
        f_expected,
        0.03,
        "VM34 bar 2 thermal axial force",
    );

    // Equal force in both bars (by equilibrium at junction)
    assert_close(
        ef1.n_start.abs(),
        ef2.n_start.abs(),
        0.02,
        "VM34 equal force in both bars",
    );

    // No transverse displacement at junction (bars are colinear, thermal is axial only)
    let d2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap();
    assert!(
        d2.uz.abs() < 1e-8,
        "VM34: junction should have no lateral displacement, uy={:.6e}",
        d2.uz
    );

    // Junction displacement: bar 1 expands, but force constrains it
    // delta_junction = alpha*dT*L1 - F*L1/(E_eff*A1)
    let delta_expected = ALPHA * dt * l1 - f_expected * l1 / (E_EFF * a1);
    assert_close(
        d2.ux.abs(),
        delta_expected.abs(),
        0.05,
        "VM34 junction displacement",
    );

    // No external load, so horizontal reactions should balance
    let r1 = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let r3 = results
        .reactions
        .iter()
        .find(|r| r.node_id == 3)
        .unwrap();
    assert!(
        (r1.rx + r3.rx).abs() < 0.1,
        "VM34: horizontal equilibrium, rx1={:.4} + rx3={:.4}",
        r1.rx,
        r3.rx
    );
}

// ================================================================
// 8. VM40: Large Deflection of a Cantilever Beam
// ================================================================
//
// Cantilever beam with tip load approaching Euler critical.
// Using the engine's corotational solver.
//
// Setup: L=5m, rectangular section, E*I known.
// Tip load P such that P*L^2/(EI) = 1.0 (Mattiasson benchmark).
//
// Reference: Mattiasson (1981), Bisshopp & Drucker (1945)
// For P*L^2/(EI) = 1.0:
//   u_tip/L = 0.0566 (horizontal shortening)
//   v_tip/L = 0.3015 (vertical deflection)
//
// Also compare with linear solution to verify large deflection
// effects are captured (linear overestimates deflection for this case).

#[test]
fn validation_ansys_vm40_large_deflection_cantilever() {
    let l = 1.0;
    // Choose E and section so EI_eff = 1000:
    // E_mpa = 12 -> E_eff = 12000, I = 1/12 -> EI = 1000
    let e_mpa = 12.0;
    let e_eff = e_mpa * 1000.0;
    let a_sec = 1.0;
    let iz = 1.0 / 12.0;
    let ei = e_eff * iz; // = 1000

    // P*L^2/(EI) = 1.0 -> P = EI/L^2 = 1000
    let p_load = ei / (l * l);

    let n = 10;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, e_mpa, 0.3)],
        vec![(1, a_sec, iz)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: -p_load,
            my: 0.0,
        })],
    );

    // Linear solution for comparison
    let lin = linear::solve_2d(&input).unwrap();
    let tip_lin = lin
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    let delta_lin = tip_lin.uz.abs();

    // Linear theory: delta = P*L^3/(3EI) = 1000*1/(3*1000) = 1/3 = 0.3333L
    let delta_lin_expected = p_load * l.powi(3) / (3.0 * ei);
    assert_close(
        delta_lin,
        delta_lin_expected,
        0.02,
        "VM40 linear tip deflection",
    );

    // Corotational large displacement solution
    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 20, false).unwrap();
    assert!(result.converged, "VM40 should converge");

    let tip = result
        .results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Mattiasson reference: v_tip/L = 0.3015 for P*L^2/(EI) = 1.0
    let v_tip_ref = 0.3015 * l;
    let v_tip_computed = tip.uz.abs();

    // u_tip/L = 0.0566 (horizontal shortening)
    let u_tip_ref = 0.0566 * l;
    let u_tip_computed = tip.ux.abs();

    // Large deflection should give smaller vertical deflection than linear
    // (because beam shortens and stiffens geometrically)
    assert!(
        v_tip_computed < delta_lin,
        "VM40: corotational v_tip ({:.4}) should be less than linear ({:.4})",
        v_tip_computed,
        delta_lin
    );

    // Check vertical deflection against Mattiasson
    let err_v = (v_tip_computed - v_tip_ref).abs() / v_tip_ref;
    assert!(
        err_v < 0.10,
        "VM40: v_tip/L computed={:.4}, reference={:.4}, error={:.1}%",
        v_tip_computed / l,
        v_tip_ref / l,
        err_v * 100.0
    );

    // Check horizontal shortening against Mattiasson
    let err_u = (u_tip_computed - u_tip_ref).abs() / u_tip_ref;
    assert!(
        err_u < 0.15,
        "VM40: u_tip/L computed={:.4}, reference={:.4}, error={:.1}%",
        u_tip_computed / l,
        u_tip_ref / l,
        err_u * 100.0
    );

    // Verify that the beam has indeed shortened (nonlinear effect)
    assert!(
        u_tip_computed > 0.01 * l,
        "VM40: beam should show measurable shortening, u_tip={:.6e}",
        u_tip_computed
    );
}
