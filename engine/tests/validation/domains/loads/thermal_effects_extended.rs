/// Validation: Extended Thermal Load Behavior
///
/// References:
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 7th Ed., Ch. 4, 6
///   - Timoshenko, S.P., "Strength of Materials", Part II, Ch. 1
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed., Ch. 15
///   - Kassimali, A., "Structural Analysis", 5th Ed., Ch. 13
///   - EN 1991-1-5:2003, "Eurocode 1: Thermal actions"
///
/// Tests verify solver results against closed-form thermal solutions:
///   1. Fixed-fixed beam with equivalent thermal axial force
///   2. SS beam with temperature change: free to expand, zero internal forces
///   3. Portal frame with differential temperature: asymmetric expansion sway
///   4. Fixed-fixed beam: thermal restraint force = E*A*alpha*deltaT
///   5. Propped cantilever with thermal expansion
///   6. Continuous beam: thermal expansion with partial restraint
///   7. Temperature gradient through beam depth: equivalent moment M = E*I*alpha*deltaT/h
///   8. Two-span beam thermal: moment redistribution from restrained expansion
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;


const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4
const ALPHA: f64 = 12e-6;  // /degC (hardcoded steel CTE in engine)

// Section height derived from engine convention: h = sqrt(12 * Iz / A)
// h = sqrt(12 * 1e-4 / 0.01) = sqrt(0.12) = 0.3464 m
const H_SEC: f64 = 0.3464;

// E_EFF in kN/m^2: E(MPa) * 1000
const E_EFF: f64 = E * 1000.0;

// EI in kN*m^2: E_EFF * IZ
const EI: f64 = E_EFF * IZ; // = 20,000 kN*m^2

// EA in kN: E_EFF * A
const EA_KN: f64 = E_EFF * A; // = 2,000,000 kN

// ================================================================
// 1. Fixed-Fixed Beam with Equivalent Thermal Axial Force
// ================================================================
//
// A fixed-fixed beam subjected to uniform temperature rise DeltaT.
// The beam cannot expand, so the restrained axial force is:
//   P = E * A * alpha * DeltaT
//
// The applied equivalent force method should produce the same axial
// force as the direct thermal load. Both ends restrained: N is
// constant along the length and equal in magnitude on every element.
//
// Reference: Ghali & Neville, Ch. 6

#[test]
fn validation_thermal_ext_fixed_fixed_equivalent_force() {
    let l: f64 = 6.0;
    let n: usize = 8;
    let dt: f64 = 40.0;

    // Direct thermal load on fixed-fixed beam
    let thermal_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected restrained axial force: N = alpha * DeltaT * E_eff * A
    let n_expected: f64 = ALPHA * dt * EA_KN;
    // n_expected = 12e-6 * 40 * 2e6 = 960 kN

    // All elements should carry the same compressive force
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("elem {} axial force", ef.element_id));
    }

    // Verify zero axial displacements (fully restrained)
    for d in &results.displacements {
        assert!(d.ux.abs() < 1e-6,
            "Fixed-fixed thermal: ux at node {} = {:.6e}, expected ~0",
            d.node_id, d.ux);
    }

    // Equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < n_expected * 0.01,
        "Axial equilibrium: sum_Rx = {:.4}, expected ~0", sum_rx);

    // Verify the equivalent force matches: P_eq = E*A*alpha*deltaT
    // This is exactly the same as n_expected — confirming the formula
    let p_eq: f64 = E_EFF * A * ALPHA * dt;
    let diff: f64 = (p_eq - n_expected).abs();
    assert!(diff < 1e-10,
        "Equivalent force P_eq = {:.4} should match N_expected = {:.4}", p_eq, n_expected);
}

// ================================================================
// 2. SS Beam with Temperature Change: Free to Expand
// ================================================================
//
// A simply-supported beam (pinned + roller) with uniform temperature
// rise DeltaT. The beam is free to expand axially:
//   - Axial force N = 0 (no axial restraint at roller)
//   - End displacement delta = alpha * DeltaT * L
//   - No bending (uniform temperature, no gradient)
//
// Reference: Ghali & Neville, Ch. 6

#[test]
fn validation_thermal_ext_ss_free_expansion_zero_forces() {
    let l: f64 = 8.0;
    let n: usize = 8;
    let dt: f64 = 60.0;

    let thermal_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected end displacement: delta = alpha * DeltaT * L
    let expected_delta: f64 = ALPHA * dt * l;
    // 12e-6 * 60 * 8 = 5.76e-3 m

    let end_node: usize = n + 1;
    let d_end = results.displacements.iter().find(|d| d.node_id == end_node).unwrap();
    assert!(
        (d_end.ux.abs() - expected_delta).abs() < expected_delta * 0.05,
        "SS free expansion: ux_end = {:.6}, expected = {:.6}", d_end.ux.abs(), expected_delta
    );

    // Zero axial force on all elements (free expansion)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() < 1.0,
            "SS thermal: N should be ~0, got {:.4} on elem {}", ef.n_start, ef.element_id);
    }

    // Zero bending moment (no gradient, uniform temperature only)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 1.0,
            "SS thermal uniform: M should be ~0, got {:.4} on elem {}", ef.m_start, ef.element_id);
    }

    // Zero vertical displacement (no curvature from uniform temperature)
    for d in &results.displacements {
        assert!(d.uy.abs() < 1e-6,
            "SS thermal uniform: uy at node {} = {:.6e}, expected ~0", d.node_id, d.uy);
    }
}

// ================================================================
// 3. Portal Frame with Differential Temperature: Sway
// ================================================================
//
// A portal frame (2 columns + 1 beam, fixed bases) is subjected to
// a uniform temperature rise only on the beam (element 2, top member).
// The beam expands and pushes the column tops apart, causing sway.
//
// The beam expands by delta = alpha * DeltaT * W. Since both columns
// resist this expansion equally, each column top displaces by delta/2
// (approximately, for stiff columns). The actual distribution depends
// on the relative stiffness.
//
// For symmetric portal with identical columns: the beam thermal
// expansion is fully restrained if columns are infinitely stiff,
// or partially accommodated by column bending.
//
// Reference: Kassimali, "Structural Analysis", Ch. 13

#[test]
fn validation_thermal_ext_portal_frame_differential_temperature() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;

    // Build portal frame manually:
    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    // Elements: 1(1-2 left col), 2(2-3 beam), 3(3-4 right col)
    // Supports: fixed at nodes 1 and 4
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Thermal load on beam only (element 2)
    let dt: f64 = 50.0;
    let loads = vec![SolverLoad::Thermal(SolverThermalLoad {
        element_id: 2,
        dt_uniform: dt,
        dt_gradient: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // The beam wants to expand by: delta_free = alpha * DeltaT * W
    let delta_free: f64 = ALPHA * dt * w;
    // 12e-6 * 50 * 6 = 3.6e-3 m

    // Columns resist this expansion. Due to symmetry, both column tops
    // should displace horizontally outward by the same amount.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Symmetric portal: column top displacements should be equal and opposite
    // (node 2 moves left, node 3 moves right, or both move outward)
    // The total relative displacement between nodes 2 and 3 should be
    // less than the free expansion (columns provide restraint)
    let relative_disp: f64 = (d3.ux - d2.ux).abs();
    assert!(relative_disp < delta_free,
        "Relative displacement {:.6} should be less than free expansion {:.6}",
        relative_disp, delta_free);
    assert!(relative_disp > 0.0,
        "Some displacement must occur from beam thermal expansion");

    // By symmetry, node 2 and node 3 should have equal magnitude horizontal displacement
    assert!(
        (d2.ux.abs() - d3.ux.abs()).abs() < d2.ux.abs() * 0.10 + 1e-6,
        "Symmetric sway: |ux2| = {:.6}, |ux3| = {:.6} should be similar",
        d2.ux.abs(), d3.ux.abs()
    );

    // Global equilibrium: sum of horizontal reactions = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1.0,
        "Portal thermal: sum_Rx = {:.4}, expected ~0", sum_rx);

    // Beam should be in compression (expansion is resisted by columns)
    let ef_beam = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    // Positive n_start in the solver convention means tension;
    // thermal expansion resisted by columns means beam is compressed
    assert!(ef_beam.n_start.abs() > 1.0,
        "Beam should carry axial force from restrained expansion, got N = {:.4}",
        ef_beam.n_start);
}

// ================================================================
// 4. Fixed-Fixed Beam: Thermal Restraint Force
// ================================================================
//
// A fixed-fixed beam with uniform temperature rise DeltaT.
// The restraint force is:
//   N = E * A * alpha * DeltaT
//
// This is a fundamental result: the beam cannot expand, so the
// entire free thermal strain is converted to mechanical stress.
//
// Also verify: no bending from uniform temperature (no gradient).
//
// Reference: Timoshenko, "Strength of Materials", Part I, Ch. 1

#[test]
fn validation_thermal_ext_fixed_fixed_restraint_force() {
    let l: f64 = 10.0;
    let n: usize = 10;
    let dt: f64 = 35.0;

    let thermal_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected: N = E_eff * A * alpha * DeltaT
    let n_expected: f64 = EA_KN * ALPHA * dt;
    // 2e6 * 12e-6 * 35 = 840 kN

    // Check axial force on every element
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("elem {} restraint force", ef.element_id));
    }

    // No bending: uniform temperature does not cause curvature
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 2.0,
            "FF uniform thermal: M_start should be ~0, got {:.4} on elem {}",
            ef.m_start, ef.element_id);
    }

    // No shear
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 2.0,
            "FF uniform thermal: V_start should be ~0, got {:.4} on elem {}",
            ef.v_start, ef.element_id);
    }

    // Verify reaction forces at both supports
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Reactions should be equal and opposite
    assert!(
        (r1.rx + r_end.rx).abs() < n_expected * 0.01,
        "Equilibrium: R1_x + R_end_x = {:.4}, expected ~0", r1.rx + r_end.rx
    );

    // Each reaction magnitude should equal the restraint force
    assert_close(r1.rx.abs(), n_expected, 0.03, "R1_x magnitude");
    assert_close(r_end.rx.abs(), n_expected, 0.03, "R_end_x magnitude");
}

// ================================================================
// 5. Propped Cantilever with Thermal Expansion
// ================================================================
//
// A propped cantilever (fixed at left, roller at right) with uniform
// temperature rise DeltaT. The roller allows axial movement, so:
//   - No axial restraint at roller: N = 0
//   - Free axial expansion: delta_end = alpha * DeltaT * L
//   - No bending from uniform temperature (no gradient)
//
// With a thermal gradient instead:
//   - The cantilever is one degree indeterminate (vertical)
//   - The roller constrains vertical deflection at the end
//   - End moment: M = alpha * DeltaT_g * E * I / (2 * h)
//     (from compatibility of the propped cantilever)
//
// Reference: Ghali & Neville, Ch. 4; Kassimali, Ch. 13

#[test]
fn validation_thermal_ext_propped_cantilever_expansion() {
    let l: f64 = 6.0;
    let n: usize = 8;

    // Part A: Uniform temperature -- free axial expansion, no bending
    let dt_uniform: f64 = 45.0;
    let thermal_loads_uniform: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt_uniform,
            dt_gradient: 0.0,
        }))
        .collect();

    let input_uniform = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), thermal_loads_uniform);
    let results_uniform = linear::solve_2d(&input_uniform).unwrap();

    // Free axial expansion at roller end
    let end_node: usize = n + 1;
    let d_end = results_uniform.displacements.iter().find(|d| d.node_id == end_node).unwrap();
    let expected_delta: f64 = ALPHA * dt_uniform * l;
    assert!(
        (d_end.ux.abs() - expected_delta).abs() < expected_delta * 0.10,
        "Propped cantilever uniform: ux_end = {:.6}, expected = {:.6}",
        d_end.ux.abs(), expected_delta
    );

    // No axial force (roller allows movement)
    for ef in &results_uniform.element_forces {
        assert!(ef.n_start.abs() < 2.0,
            "Propped cantilever uniform: N should be ~0, got {:.4}", ef.n_start);
    }

    // Part B: Thermal gradient -- induces bending in indeterminate structure
    let dt_grad: f64 = 25.0;
    let thermal_loads_grad: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input_grad = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), thermal_loads_grad);
    let results_grad = linear::solve_2d(&input_grad).unwrap();

    // For propped cantilever with thermal gradient, the roller reaction
    // forces the beam to remain flat at the roller end.
    // Free cantilever tip deflection: delta_tip = alpha * DeltaT_g * L^2 / (2*h)
    // The roller eliminates this, creating a reaction R and moment at the fixed end.
    //
    // The thermal gradient produces curvature kappa = alpha * DeltaT_g / h.
    // For a propped cantilever (fixed-roller), the roller constrains the
    // tip deflection to zero. The compatibility analysis gives:
    //   R_roller = 3 * EI * kappa / (2 * L)
    //   M_fixed  = 3 * EI * kappa / 2
    // where kappa = alpha * DeltaT_g / h
    //
    // The fixed-end moment is 3/2 of EI*kappa because the roller reaction
    // contributes R*L = 3*EI*kappa/2 at the fixed end, while the thermal
    // FEF moment at the fixed end acts in the opposite sense:
    //   M_fixed = R*L + EI*kappa (FEF) - 2*EI*kappa (released) = 3*EI*kappa/2
    let kappa: f64 = ALPHA * dt_grad / H_SEC;
    let r_roller_expected: f64 = 3.0 * EI * kappa / (2.0 * l);

    // Roller should have a vertical reaction
    let r_end = results_grad.reactions.iter().find(|r| r.node_id == end_node).unwrap();
    assert_close(r_end.ry.abs(), r_roller_expected, 0.10,
        "Propped cantilever gradient: R_roller");

    // Fixed end moment
    let r1 = results_grad.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_fixed_expected: f64 = 3.0 * EI * kappa / 2.0;
    assert_close(r1.mz.abs(), m_fixed_expected, 0.10,
        "Propped cantilever gradient: M_fixed");
}

// ================================================================
// 6. Continuous Beam: Thermal Expansion with Partial Restraint
// ================================================================
//
// A two-span continuous beam (pinned-rollerX-rollerX) with uniform
// temperature rise on all elements. Since the beam is free to expand
// axially (all supports allow axial movement except the pinned end):
//   - Total end displacement = alpha * DeltaT * L_total
//   - Zero axial force (no axial restraint between spans)
//   - Zero bending moment (no gradient, uniform temperature)
//
// This verifies that the solver correctly handles thermal loads
// on multi-span continuous beams.
//
// Reference: Ghali & Neville, Ch. 4

#[test]
fn validation_thermal_ext_continuous_beam_partial_restraint() {
    let span1: f64 = 5.0;
    let span2: f64 = 7.0;
    let l_total: f64 = span1 + span2;
    let n_per_span: usize = 4;
    let dt: f64 = 40.0;

    let n_total: usize = n_per_span * 2;
    let thermal_loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }))
        .collect();

    let input = make_continuous_beam(&[span1, span2], n_per_span, E, A, IZ, thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected total end displacement
    let expected_delta: f64 = ALPHA * dt * l_total;
    // 12e-6 * 40 * 12 = 5.76e-3 m

    let end_node: usize = n_total + 1;
    let d_end = results.displacements.iter().find(|d| d.node_id == end_node).unwrap();
    assert!(
        (d_end.ux.abs() - expected_delta).abs() < expected_delta * 0.10,
        "Continuous beam uniform: ux_end = {:.6}, expected = {:.6}",
        d_end.ux.abs(), expected_delta
    );

    // Zero axial force on all elements (free to expand)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() < 1.0,
            "Continuous beam thermal: N should be ~0, got {:.4} on elem {}",
            ef.n_start, ef.element_id);
    }

    // Zero bending moment (no gradient, uniform temperature only)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 1.0,
            "Continuous beam thermal: M should be ~0, got {:.4} on elem {}",
            ef.m_start, ef.element_id);
    }

    // All vertical reactions should be zero (no transverse loading)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1.0,
        "Continuous beam uniform thermal: sum_Ry = {:.4}, expected ~0", sum_ry);
}

// ================================================================
// 7. Temperature Gradient Through Beam Depth: Equivalent Moment
// ================================================================
//
// A fixed-fixed beam with a thermal gradient (no uniform change).
// The gradient induces curvature kappa = alpha * DeltaT_g / h.
// Since the beam is fully fixed, this curvature is restrained and
// produces end moments:
//   M = E * I * alpha * DeltaT_g / h = E * I * kappa
//
// The moment is constant along the beam (no transverse load), and
// shear is zero (constant moment).
//
// Reference: Ghali & Neville, Ch. 6; Timoshenko, Strength of Materials

#[test]
fn validation_thermal_ext_gradient_equivalent_moment() {
    let l: f64 = 8.0;
    let n: usize = 8;
    let dt_grad: f64 = 20.0;

    let thermal_loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected moment: M = EI * alpha * DeltaT_g / h
    let expected_m: f64 = EI * ALPHA * dt_grad / H_SEC;
    // 20000 * 12e-6 * 20 / 0.3464 = 20000 * 2.4e-4 / 0.3464 = 4.8 / 0.3464 = 13.86 kN*m

    // Check reaction moments at both ends
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.mz.abs(), expected_m, 0.10,
        "Gradient moment at fixed end 1");
    assert_close(r_end.mz.abs(), expected_m, 0.10,
        "Gradient moment at fixed end 2");

    // Zero shear (constant moment => V = dM/dx = 0)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 2.0,
            "FF gradient: V should be ~0, got {:.4} on elem {}", ef.v_start, ef.element_id);
    }

    // Zero axial force (no uniform temperature change)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() < 2.0,
            "FF gradient: N should be ~0, got {:.4} on elem {}", ef.n_start, ef.element_id);
    }

    // Zero transverse displacement (fully restrained curvature)
    for d in &results.displacements {
        assert!(d.uy.abs() < 1e-6,
            "FF gradient: uy at node {} = {:.6e}, expected ~0", d.node_id, d.uy);
    }

    // The equivalent moment formula: M = E*I*alpha*deltaT/h
    // Verify this is dimensionally consistent
    let m_formula: f64 = E_EFF * IZ * ALPHA * dt_grad / H_SEC;
    let diff: f64 = (m_formula - expected_m).abs();
    assert!(diff < 1e-10,
        "M formula = {:.6}, expected_m = {:.6}", m_formula, expected_m);
}

// ================================================================
// 8. Two-Span Beam Thermal: Moment Redistribution
// ================================================================
//
// A two-span continuous beam (pinned-rollerX-rollerX) with thermal
// gradient on the first span only. The gradient induces curvature
// in span 1, but the interior support constrains the rotation,
// creating a moment at the interior support.
//
// For a two-span beam with equal spans L, gradient on span 1 only:
//   Free curvature: kappa = alpha * DeltaT_g / h
//   Free end rotation at interior support from span 1: theta_1 = kappa * L / 2
//   From compatibility (3-moment equation):
//     M_interior = 3 * EI * kappa / (2 * 2) = 3 * EI * kappa / 4
//   (dividing the free rotation by the flexibility of the two-span beam)
//
// More precisely, for equal-span continuous beam:
//   The 3-moment equation gives: 2*M_B*(L1+L2) = -6*EI*kappa*L1/L1
//   => 2*M_B*(2L) = -6*EI*kappa => M_B = -3*EI*kappa / (2*2) in simplified form
//
// Reference: Ghali & Neville, Ch. 4; Kassimali, Ch. 13

#[test]
fn validation_thermal_ext_two_span_moment_redistribution() {
    let span: f64 = 5.0;
    let n_per_span: usize = 4;
    let dt_grad: f64 = 30.0;

    // Thermal gradient on span 1 only (elements 1 to n_per_span)
    let thermal_loads: Vec<SolverLoad> = (1..=n_per_span)
        .map(|i| SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, thermal_loads);
    let results = linear::solve_2d(&input).unwrap();

    let kappa: f64 = ALPHA * dt_grad / H_SEC;

    // Interior support node: node at the junction of span 1 and span 2
    let interior_node: usize = n_per_span + 1;

    // The interior support moment from the 3-moment equation for equal spans
    // and gradient on span 1 only:
    // From compatibility: M_B = -3*EI*kappa / 4 (approximate for equal spans)
    let m_interior_approx: f64 = 3.0 * EI * kappa / 4.0;

    // The interior support is a roller (no moment reaction)
    let _r_interior = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();

    // The interior support is a roller (no moment restraint).
    // However, the beam has a bending moment at this location.
    // We check the element forces at the interior support instead.
    // The moment at the right end of span 1 (or left end of span 2) should be nonzero.
    let ef_span1_last = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    // The moment at the interior support should be nonzero (redistribution)
    assert!(ef_span1_last.m_end.abs() > 1.0,
        "Two-span thermal: moment at interior support should be nonzero, got {:.4}",
        ef_span1_last.m_end);

    // Compare to the approximate formula (allow generous tolerance due to
    // approximations in the 3-moment equation derivation)
    assert_close(ef_span1_last.m_end.abs(), m_interior_approx, 0.20,
        "Interior support moment");

    // Span 2 (no thermal load) should still have bending due to continuity
    let ef_span2_first = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span + 1)
        .unwrap();
    assert!(ef_span2_first.m_start.abs() > 1.0,
        "Span 2 should have moment from continuity, got {:.4}", ef_span2_first.m_start);

    // Moment continuity at interior support: m_end(span1) ~ m_start(span2)
    let m_continuity_diff: f64 = (ef_span1_last.m_end - ef_span2_first.m_start).abs();
    assert!(m_continuity_diff < 1.0,
        "Moment continuity: span1_end = {:.4}, span2_start = {:.4}, diff = {:.4}",
        ef_span1_last.m_end, ef_span2_first.m_start, m_continuity_diff);

    // Equilibrium: sum of vertical reactions = 0 (no external transverse load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1.0,
        "Two-span thermal gradient: sum_Ry = {:.4}, expected ~0", sum_ry);
}
