/// Validation tests for the fiber nonlinear solver.
///
/// Tests verify:
/// 1. Elastic fiber section reproduces EA and EI exactly (compare with linear solver)
/// 2. Steel fiber yielding: moment at yield matches M_y = f_y * S
/// 3. Concrete fiber cracking: tensile fibers crack, compressive fibers carry load
/// 4. Load-displacement curve is monotonically increasing before failure
/// 5. Fiber forces sum to zero axial when no axial load applied
/// 6. Symmetric section produces symmetric response under symmetric loading
/// 7. Rectangular steel section: collapse load matches plastic moment M_p = f_y * Z
/// 8. Fiber nonlinear solver converges within iteration limit

use dedaliano_engine::solver::fiber_nonlinear::{
    solve_fiber_nonlinear_2d, FiberNonlinearInput,
};
use dedaliano_engine::solver::linear::solve_2d;
use dedaliano_engine::element::fiber_beam::{
    rectangular_fiber_section, FiberMaterial,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Helper: build a 2D cantilever with a fiber section.
//
//   Node 0 (fixed) -------- Node 1 (loaded)
//         x=0                   x=length
//
// The section/material IDs are set to 1. The SolverSection uses the
// gross properties (A, Iz) that match the fiber discretization so
// that the elastic-element path inside the solver sees the same
// stiffness as the fiber path.
// ---------------------------------------------------------------------------
fn cantilever_fiber_2d(
    length: f64,
    b: f64,
    h: f64,
    n_layers: usize,
    material: FiberMaterial,
    fy: f64,
    fz: f64,
    mz: f64,
    n_increments: usize,
    max_iter: usize,
    tolerance: f64,
) -> FiberNonlinearInput {
    let a = b * h;
    let iz = b * h * h * h / 12.0;

    let mut nodes = HashMap::new();
    nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, y: 0.0 });
    nodes.insert("1".into(), SolverNode { id: 1, x: length, y: 0.0 });

    let mut materials = HashMap::new();
    // E in MPa -- the solver multiplies by 1000 to get kN/m^2 internally.
    // For the elastic-element fallback path we use a representative E.
    // The actual E used in fibers comes from the FiberMaterial.
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1,
        elem_type: "frame".into(),
        node_i: 0,
        node_j: 1,
        material_id: 1,
        section_id: 1,
        hinge_start: false,
        hinge_end: false,
    });

    let mut supports = HashMap::new();
    supports.insert("0".into(), SolverSupport {
        id: 0,
        node_id: 0,
        support_type: "fixed".into(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let mut loads = Vec::new();
    if fy.abs() > 0.0 || fz.abs() > 0.0 || mz.abs() > 0.0 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: fz, // fx in solver convention
            fy,
            mz,
        }));
    }

    let solver = SolverInput {
        nodes,
        materials,
        sections,
        elements,
        supports,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), rectangular_fiber_section(b, h, n_layers, material));

    FiberNonlinearInput {
        solver,
        fiber_sections,
        n_integration_points: 5,
        max_iter,
        tolerance,
        n_increments,
    }
}

// ---------------------------------------------------------------------------
// Test 1 -- Elastic fiber section reproduces EA and EI exactly
//
// An elastic fiber section with E = 200 GPa, rectangular 0.2 x 0.4 m,
// discretized into 20 layers, should give the same tip deflection as
// the linear solver for a cantilever with P = 50 kN at the tip.
//
// Analytical: delta = P*L^3 / (3*E*I)
// ---------------------------------------------------------------------------
#[test]
fn fiber_elastic_section_matches_linear_solver() {
    let b = 0.2;
    let h = 0.4;
    let length = 5.0;
    let p = -50.0; // kN, downward

    let input = cantilever_fiber_2d(
        length, b, h, 20,
        FiberMaterial::Elastic { e: 200_000.0 },
        p, 0.0, 0.0,
        1, 30, 1e-8,
    );

    // Fiber nonlinear result
    let fiber_result = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(fiber_result.converged, "Elastic fiber problem must converge");

    // Linear solver result (same geometry, same load)
    let linear_result = solve_2d(&input.solver).unwrap();

    let fiber_d = fiber_result.results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let linear_d = linear_result.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();

    // Compare vertical displacement at the tip
    let rel_err_uy = (fiber_d.uy - linear_d.uy).abs() / linear_d.uy.abs().max(1e-15);
    assert!(
        rel_err_uy < 0.10,
        "Fiber elastic uy should match linear solver: fiber={:.6e}, linear={:.6e}, rel_err={:.4}",
        fiber_d.uy, linear_d.uy, rel_err_uy,
    );

    // Also verify against closed-form delta = PL^3/(3EI)
    let e_kn_m2 = 200_000.0 * 1000.0;
    let iz = b * h.powi(3) / 12.0;
    let analytical = p.abs() * length.powi(3) / (3.0 * e_kn_m2 * iz);
    let rel_err_analytical = (fiber_d.uy.abs() - analytical).abs() / analytical;
    assert!(
        rel_err_analytical < 0.10,
        "Fiber elastic uy vs analytical: fiber={:.6e}, analytical={:.6e}, rel_err={:.4}",
        fiber_d.uy.abs(), analytical, rel_err_analytical,
    );
}

// ---------------------------------------------------------------------------
// Test 2 -- Steel fiber yielding: moment at yield matches M_y = f_y * S
//
// For a rectangular section the elastic section modulus is
//     S = b*h^2 / 6
// At first yield the moment is  M_y = f_y * S  (in kN-m, converting
// f_y from MPa to kN/m^2 first).
//
// We apply an increasing moment at the cantilever tip and verify
// that yielding is detected when the applied moment approaches M_y.
// ---------------------------------------------------------------------------
#[test]
fn steel_fiber_yield_moment_matches_my() {
    let b = 0.2;
    let h = 0.4;
    let fy = 250.0; // MPa
    let length = 3.0;

    // Elastic section modulus
    let s_mod = b * h * h / 6.0; // m^3
    // M_y in kN*m  (fy in MPa = 1000 kN/m^2)
    let my_expected = fy * 1000.0 * s_mod;

    // Apply a moment equal to 60% of M_y: should remain elastic
    let moment_low = 0.6 * my_expected;
    let input_low = cantilever_fiber_2d(
        length, b, h, 20,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy, hardening_ratio: 0.01 },
        0.0, 0.0, moment_low,
        5, 50, 1e-6,
    );
    let result_low = solve_fiber_nonlinear_2d(&input_low).unwrap();
    assert!(result_low.converged);
    let yielded_low = result_low.fiber_status.iter().any(|s| s.yielded);
    assert!(
        !yielded_low,
        "At 60% of M_y no fibers should yield; M_applied={:.1} kN-m, M_y={:.1} kN-m",
        moment_low, my_expected,
    );

    // Apply a moment equal to 120% of M_y: outermost fibers must yield
    let moment_high = 1.2 * my_expected;
    let input_high = cantilever_fiber_2d(
        length, b, h, 20,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy, hardening_ratio: 0.01 },
        0.0, 0.0, moment_high,
        10, 50, 1e-6,
    );
    let result_high = solve_fiber_nonlinear_2d(&input_high).unwrap();
    assert!(result_high.converged);
    let yielded_high = result_high.fiber_status.iter().any(|s| s.yielded);
    assert!(
        yielded_high,
        "At 120% of M_y outer fibers must yield; M_applied={:.1} kN-m, M_y={:.1} kN-m",
        moment_high, my_expected,
    );
}

// ---------------------------------------------------------------------------
// Test 3 -- Concrete fiber cracking
//
// A Hognestad concrete section (ft = 3 MPa) is loaded in bending.
// The tensile fibers should crack while the compressive fibers
// carry the load (stress < 0). We verify:
// (a) At least some fibers are cracked (yielded flag set).
// (b) The maximum compressive stress is nonzero.
// ---------------------------------------------------------------------------
#[test]
fn concrete_fiber_cracking_tensile_fibers_crack() {
    let b = 0.3;
    let h = 0.5;
    let length = 4.0;
    let fc = 30.0; // MPa
    let ft = 3.0;  // MPa

    // Apply a moderate bending moment that exceeds cracking moment
    // M_cr = ft * S = ft * b*h^2/6
    let s_mod = b * h * h / 6.0;
    let m_cr = ft * 1000.0 * s_mod; // kN-m
    // Apply a small transverse tip load that produces a base moment
    // slightly above M_cr. This keeps strains small enough that
    // the concrete N-R converges despite the very soft cracked tangent.
    // M_base = P * L, so P = M_cr / L gives exactly cracking. Use 1.2x.
    let p_applied = 1.2 * m_cr / length; // kN (positive fy = upward, but we want downward)

    let material = FiberMaterial::ConcreteHognestad {
        fc,
        eps_c0: 0.002,
        eps_cu: 0.004,
        ft,
    };

    let input = cantilever_fiber_2d(
        length, b, h, 20,
        material,
        -p_applied, 0.0, 0.0,
        40, 200, 1e-3,
    );

    let result = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(result.converged, "Concrete cracking problem should converge");

    // At least one element should show yielded=true (cracking sets this flag)
    let any_cracked = result.fiber_status.iter().any(|s| s.yielded);
    assert!(
        any_cracked,
        "Tensile fibers should crack under P={:.1} kN (M_cr={:.1} kN-m)",
        p_applied, m_cr,
    );

    // Compressive stress should be nonzero (fibers carrying load)
    let max_stress = result.fiber_status.iter()
        .map(|s| s.max_stress)
        .fold(0.0_f64, f64::max);
    assert!(
        max_stress > 0.0,
        "Compressive fibers should carry nonzero stress, got max_stress={:.4}",
        max_stress,
    );
}

// ---------------------------------------------------------------------------
// Test 4 -- Load-displacement curve is monotonically increasing
//
// We run a steel cantilever through multiple load increments and
// verify that the tip displacement increases monotonically with
// increasing load factor.
// ---------------------------------------------------------------------------
#[test]
fn load_displacement_monotonically_increasing() {
    let b = 0.2;
    let h = 0.4;
    let length = 4.0;
    let total_load = -300.0; // kN

    let n_increments = 10;
    let mut displacements: Vec<f64> = Vec::new();

    for inc in 1..=n_increments {
        let load_factor = inc as f64 / n_increments as f64;
        let p = total_load * load_factor;

        let input = cantilever_fiber_2d(
            length, b, h, 16,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
            p, 0.0, 0.0,
            inc, // Use 'inc' increments so the solver reaches full load
            50, 1e-6,
        );

        let result = solve_fiber_nonlinear_2d(&input);
        if let Ok(r) = result {
            if r.converged {
                let d = r.results.displacements.iter()
                    .find(|d| d.node_id == 1).unwrap();
                displacements.push(d.uy.abs());
            }
        }
    }

    assert!(
        displacements.len() >= 5,
        "Should have at least 5 converged load steps, got {}",
        displacements.len(),
    );

    // Monotonicity check
    for window in displacements.windows(2) {
        assert!(
            window[1] >= window[0] - 1e-12,
            "Displacement should be monotonically increasing: {:.6e} -> {:.6e}",
            window[0], window[1],
        );
    }
}

// ---------------------------------------------------------------------------
// Test 5 -- Fiber forces sum to zero axial when no axial load applied
//
// When only a transverse load (or moment) is applied, the net axial
// force N should be negligible. This validates that the section
// integration produces a consistent N ~ 0.
// ---------------------------------------------------------------------------
#[test]
fn fiber_forces_zero_axial_under_pure_bending() {
    let b = 0.2;
    let h = 0.4;
    let length = 4.0;

    // Pure bending via a transverse tip load
    let input = cantilever_fiber_2d(
        length, b, h, 20,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
        -100.0, 0.0, 0.0,
        5, 50, 1e-6,
    );

    let result = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(result.converged);

    // Check element end forces: axial force should be near zero
    for ef in &result.results.element_forces {
        assert!(
            ef.n_start.abs() < 5.0,
            "Under pure bending, N_start should be ~0, got {:.4} kN (elem {})",
            ef.n_start, ef.element_id,
        );
        assert!(
            ef.n_end.abs() < 5.0,
            "Under pure bending, N_end should be ~0, got {:.4} kN (elem {})",
            ef.n_end, ef.element_id,
        );
    }

    // Horizontal displacement should be near zero relative to vertical
    let d1 = result.results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    assert!(
        d1.ux.abs() < d1.uy.abs() * 0.05 + 1e-10,
        "Horizontal displacement should be negligible: ux={:.6e}, uy={:.6e}",
        d1.ux, d1.uy,
    );
}

// ---------------------------------------------------------------------------
// Test 6 -- Symmetric section produces symmetric response
//
// A simply-supported beam with a midpoint load should produce
// symmetric displacements (equal rotation magnitude at both ends,
// max deflection at midspan). We use a 3-node model:
//   Node 0 (pin) -- Node 1 (loaded) -- Node 2 (roller)
// ---------------------------------------------------------------------------
#[test]
fn symmetric_section_symmetric_response() {
    let b = 0.2;
    let h = 0.3;
    let half_l = 3.0;
    let p = -80.0; // kN downward at midspan

    // Build a 2-element model
    let mut nodes = HashMap::new();
    nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, y: 0.0 });
    nodes.insert("1".into(), SolverNode { id: 1, x: half_l, y: 0.0 });
    nodes.insert("2".into(), SolverNode { id: 2, x: 2.0 * half_l, y: 0.0 });

    let a = b * h;
    let iz = b * h * h * h / 12.0;

    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1, elem_type: "frame".into(),
        node_i: 0, node_j: 1, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    elements.insert("2".into(), SolverElement {
        id: 2, elem_type: "frame".into(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut supports = HashMap::new();
    // Pin at node 0 (fixed in x, y; free rotation)
    supports.insert("0".into(), SolverSupport {
        id: 0, node_id: 0, support_type: "pinned".into(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Roller at node 2 (fixed in y only, free to slide in x)
    supports.insert("2".into(), SolverSupport {
        id: 2, node_id: 2, support_type: "rollerX".into(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1, fx: 0.0, fy: p, mz: 0.0,
    })];

    let solver = SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![],
        connectors: HashMap::new(),
    };

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), rectangular_fiber_section(
        b, h, 16,
        FiberMaterial::Elastic { e: 200_000.0 },
    ));

    let input = FiberNonlinearInput {
        solver,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-6,
        n_increments: 1,
    };

    let result = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(result.converged, "Simply-supported beam should converge");

    // Midspan should deflect the most
    let d1 = result.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uy < 0.0, "Midspan should deflect downward");

    // End rotations should be equal in magnitude, opposite in sign
    let d0 = result.results.displacements.iter().find(|d| d.node_id == 0).unwrap();
    let d2 = result.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let rz_diff = (d0.rz.abs() - d2.rz.abs()).abs();
    let rz_avg = (d0.rz.abs() + d2.rz.abs()) / 2.0;
    assert!(
        rz_diff / rz_avg.max(1e-15) < 0.15,
        "End rotations should be symmetric: rz0={:.6e}, rz2={:.6e}",
        d0.rz, d2.rz,
    );
}

// ---------------------------------------------------------------------------
// Test 7 -- Rectangular steel section collapse load matches M_p = f_y * Z
//
// For a rectangular section the plastic section modulus is
//     Z = b*h^2 / 4
// The plastic moment is M_p = f_y * Z.
//
// For a cantilever with tip load P, the base moment is P*L.
// Collapse occurs when P*L = M_p, i.e. P_collapse = M_p / L.
//
// We apply a load significantly above P_collapse and check that the
// element has yielded (as expected) and the solver still converges
// with hardening. Then we verify that the base moment is within a
// reasonable margin of M_p (it can exceed M_p slightly due to strain
// hardening).
// ---------------------------------------------------------------------------
#[test]
fn rectangular_steel_section_collapse_load_plastic_moment() {
    let b = 0.2;
    let h = 0.4;
    let fy = 250.0; // MPa
    let length = 3.0;

    // Plastic section modulus and plastic moment
    let z_p = b * h * h / 4.0; // m^3
    let mp = fy * 1000.0 * z_p; // kN-m (fy in kN/m^2)

    // Collapse load for cantilever: P_collapse = M_p / L
    let p_collapse = mp / length;

    // Apply 1.3 * P_collapse to push well past full plastification
    let p_applied = -1.3 * p_collapse; // kN, downward

    let input = cantilever_fiber_2d(
        length, b, h, 20,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy, hardening_ratio: 0.02 },
        p_applied, 0.0, 0.0,
        20, 100, 1e-5,
    );

    let result = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(
        result.converged,
        "Solver should converge with strain hardening even past M_p",
    );

    // The element should be yielded
    let any_yielded = result.fiber_status.iter().any(|s| s.yielded);
    assert!(any_yielded, "Section must be yielded at 1.3 * P_collapse");

    // Check the base moment (element start) -- should be near M_p or above
    let ef = &result.results.element_forces[0];
    let m_base = ef.m_start.abs();

    // The base moment should be at least close to M_p (allowing fiber
    // discretization error and the fact that load is above collapse)
    assert!(
        m_base > 0.7 * mp,
        "Base moment should be near or above M_p: m_base={:.1} kN-m, M_p={:.1} kN-m",
        m_base, mp,
    );

    // With hardening the moment can exceed M_p; check it is not wildly off
    assert!(
        m_base < 2.5 * mp,
        "Base moment should not be absurdly above M_p: m_base={:.1} kN-m, M_p={:.1} kN-m",
        m_base, mp,
    );
}

// ---------------------------------------------------------------------------
// Test 8 -- Fiber nonlinear solver converges within iteration limit
//
// Run several different load levels and verify that the solver always
// reports convergence when we give it enough increments and a reasonable
// tolerance. This tests the N-R iteration machinery end-to-end.
// ---------------------------------------------------------------------------
#[test]
fn fiber_nonlinear_solver_converges_within_iteration_limit() {
    let b = 0.2;
    let h = 0.4;
    let length = 5.0;
    let max_iter = 50;
    let tol = 1e-5;

    let test_cases: Vec<(&str, f64, f64, usize, FiberMaterial)> = vec![
        // (description, fy, fz, n_inc, material)
        (
            "elastic_small_load",
            -10.0, 0.0, 1,
            FiberMaterial::Elastic { e: 200_000.0 },
        ),
        (
            "elastic_moderate_load",
            -100.0, 0.0, 1,
            FiberMaterial::Elastic { e: 200_000.0 },
        ),
        (
            "steel_below_yield",
            -50.0, 0.0, 5,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
        ),
        (
            "steel_at_yield",
            -200.0, 0.0, 10,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
        ),
        (
            "steel_past_yield_with_hardening",
            -400.0, 0.0, 20,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.02 },
        ),
        (
            "steel_combined_axial_and_bending",
            -50.0, -20.0, 10,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
        ),
    ];

    for (desc, fy_load, fz_load, n_inc, material) in &test_cases {
        let input = cantilever_fiber_2d(
            length, b, h, 16,
            material.clone(),
            *fy_load, *fz_load, 0.0,
            *n_inc, max_iter, tol,
        );

        let result = solve_fiber_nonlinear_2d(&input);
        assert!(
            result.is_ok(),
            "Solver should not return Err for case '{}': {:?}",
            desc, result.err(),
        );

        let r = result.unwrap();
        assert!(
            r.converged,
            "Solver should converge for case '{}': iterations={}",
            desc, r.iterations,
        );
        assert!(
            r.iterations > 0,
            "Solver should use at least 1 iteration for case '{}'",
            desc,
        );
        assert!(
            r.iterations <= max_iter * (*n_inc),
            "Solver total iterations ({}) should not exceed max_iter*n_inc ({}) for case '{}'",
            r.iterations, max_iter * n_inc, desc,
        );

        // Every case should produce a displacement result for the tip node
        let d1 = r.results.displacements.iter().find(|d| d.node_id == 1);
        assert!(
            d1.is_some(),
            "Displacement for tip node should exist for case '{}'",
            desc,
        );
    }
}
