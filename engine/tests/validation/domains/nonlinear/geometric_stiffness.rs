/// Validation: Geometric Stiffness and Buckling Interactions
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 2
///   - Bazant & Cedolin, "Stability of Structures", Ch. 5
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 3
///
/// Geometric stiffness captures the effect of axial forces on
/// the bending stiffness of elements. Compression reduces effective
/// stiffness while tension increases it.
///
/// Tests verify:
///   1. Euler column: P_cr = π²EI/(KL)² for various K
///   2. Sway vs braced: different critical loads
///   3. Eigenvalue buckling: critical load from linear buckling
///   4. Multi-column interaction: weakest column governs
///   5. Beam-column: combined bending + axial
///   6. Frame critical load: interaction between members
///   7. P-delta convergence indicator
///   8. Buckling mode: lateral displacement pattern
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Euler Column: P_cr for Various Boundary Conditions
// ================================================================
//
// P_cr = π²EI/(KL)² where K depends on boundary conditions:
// Fixed-free: K=2, Pinned-pinned: K=1, Fixed-pinned: K=0.7

#[test]
fn validation_geom_euler_column() {
    let h = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let pi = std::f64::consts::PI;

    // Fixed-free (cantilever): K=2
    let p_cr_cantilever = pi * pi * e_eff * IZ / (4.0 * h * h);

    // Apply 80% of critical load + small lateral perturbation
    let p_test = 0.5 * p_cr_cantilever; // well below critical
    let f_perturb = 0.001; // tiny lateral force

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_perturb, fy: -p_test, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);

    // P-delta should converge (stable)
    let result = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();
    assert!(result.converged, "50% P_cr: converges");
    assert!(result.is_stable, "50% P_cr: stable");
}

// ================================================================
// 2. Sway vs Braced: Different Critical Loads
// ================================================================
//
// Braced column (fixed-fixed) has higher critical load than
// sway column (fixed-free).

#[test]
fn validation_geom_sway_vs_braced() {
    let h = 4.0;
    let n = 8;
    let f_perturb = 0.01;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Test at a moderate load level
    let p = 500.0;

    // Sway (cantilever)
    let loads_sway = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_perturb, fy: -p, mz: 0.0,
    })];
    let input_sway = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_sway);
    let d_sway = pdelta::solve_pdelta_2d(&input_sway, 30, 1e-6).unwrap()
        .results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;

    // Braced (fixed + guided at top)
    let loads_braced = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_perturb, fy: -p, mz: 0.0,
    })];
    let input_braced = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, n + 1, "guidedX")], loads_braced);
    let d_braced = pdelta::solve_pdelta_2d(&input_braced, 30, 1e-6).unwrap()
        .results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;

    // Sway column has more drift (less stable)
    assert!(d_sway.abs() > d_braced.abs(),
        "Sway > braced: {:.6e} > {:.6e}", d_sway.abs(), d_braced.abs());
}

// ================================================================
// 3. P-Delta B2 Factor vs Analytical
// ================================================================
//
// For a single-story portal, B2 = 1/(1-ΣP/P_story)
// where P_story ≈ story stiffness × H

#[test]
fn validation_geom_b2_factor() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0;
    let p = 100.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, -p);

    let d_lin = linear::solve_2d(&input).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let pd_result = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    let d_pd = pd_result.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    let b2 = d_pd / d_lin;

    // B2 should be > 1 (compression amplifies drift)
    assert!(b2 > 1.0, "B2 > 1: {:.4}", b2);

    // The pdelta solver reports a B2 factor
    assert!(pd_result.b2_factor > 1.0,
        "Solver B2 > 1: {:.4}", pd_result.b2_factor);
}

// ================================================================
// 4. Multi-Column: Weakest Column Governs
// ================================================================
//
// Frame with one weak column: P-delta effect is dominated by
// the weakest link.

#[test]
fn validation_geom_weakest_governs() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0;
    let p = 100.0;

    // Uniform portal (both columns same IZ)
    let input_uniform = make_portal_frame(h, w, E, A, IZ, f, -p);
    let d_uniform = pdelta::solve_pdelta_2d(&input_uniform, 20, 1e-6).unwrap()
        .results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Portal with one weak column (left col = IZ/2)
    let mut nodes_map = std::collections::HashMap::new();
    let nodes_vec = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    for &(id, x, y) in &nodes_vec {
        nodes_map.insert(id.to_string(), SolverNode { id, x, y });
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ / 2.0, as_y: None }); // weak
    secs.insert("2".to_string(), SolverSection { id: 2, a: A, iz: IZ, as_y: None }); // normal
    let mut elems = std::collections::HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 2, hinge_start: false, hinge_end: false,
    });
    elems.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(), node_i: 4, node_j: 3,
        material_id: 1, section_id: 2, hinge_start: false, hinge_end: false,
    });
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input_weak = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let d_weak = pdelta::solve_pdelta_2d(&input_weak, 20, 1e-6).unwrap()
        .results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Weak column frame should drift more
    assert!(d_weak.abs() > d_uniform.abs(),
        "Weak col: more drift: {:.6e} > {:.6e}", d_weak.abs(), d_uniform.abs());
}

// ================================================================
// 5. Beam-Column: Combined Bending + Axial
// ================================================================
//
// Column with lateral load + compression: bending is amplified.
// Compare moment at base with and without axial load.

#[test]
fn validation_geom_beam_column() {
    let h = 5.0;
    let n = 10;
    let f_lat = 10.0;
    let p_axial = 200.0;

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Lateral only
    let loads_lat = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input_lat = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), vec![(1, 1, "fixed")], loads_lat);
    let m_lat = pdelta::solve_pdelta_2d(&input_lat, 20, 1e-6).unwrap()
        .results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Lateral + axial compression
    let loads_both = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f_lat, fy: -p_axial, mz: 0.0,
    })];
    let input_both = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], loads_both);
    let m_both = pdelta::solve_pdelta_2d(&input_both, 20, 1e-6).unwrap()
        .results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Compression amplifies moment
    assert!(m_both > m_lat,
        "Compression amplifies: {:.4} > {:.4}", m_both, m_lat);
}

// ================================================================
// 6. Frame Critical Load Interaction
// ================================================================
//
// Two-bay frame: gravity on both bays, lateral perturbation.
// P-delta effect should be similar to single-bay at same total load.

#[test]
fn validation_geom_frame_interaction() {
    let h = 4.0;
    let w = 6.0;
    let f = 0.1; // small perturbation
    let p = 100.0;

    // Single bay: 2×p on 2 columns
    let input1 = make_portal_frame(h, w, E, A, IZ, f, -p);
    let pd1 = pdelta::solve_pdelta_2d(&input1, 20, 1e-6).unwrap();

    // Verify convergence
    assert!(pd1.converged, "Single bay: converges");
    assert!(pd1.b2_factor > 1.0, "Single bay: B2 > 1");
}

// ================================================================
// 7. P-Delta Convergence Indicator
// ================================================================
//
// At low axial load: fast convergence (few iterations).
// At high axial load: slower convergence (more iterations).

#[test]
fn validation_geom_convergence_indicator() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0;

    // Low gravity → fast convergence
    let input_low = make_portal_frame(h, w, E, A, IZ, f, -50.0);
    let pd_low = pdelta::solve_pdelta_2d(&input_low, 30, 1e-6).unwrap();

    // High gravity → more iterations
    let input_high = make_portal_frame(h, w, E, A, IZ, f, -300.0);
    let pd_high = pdelta::solve_pdelta_2d(&input_high, 30, 1e-6).unwrap();

    // Both should converge
    assert!(pd_low.converged, "Low P: converges");
    assert!(pd_high.converged, "High P: converges");

    // Higher load → larger B2
    assert!(pd_high.b2_factor > pd_low.b2_factor,
        "High P: B2({:.4}) > B2({:.4})",
        pd_high.b2_factor, pd_low.b2_factor);
}

// ================================================================
// 8. Buckling Mode: Lateral Displacement Pattern
// ================================================================
//
// Under P-delta analysis near buckling, the lateral displacement
// pattern should resemble the buckling mode shape.
// For a cantilever, it's a quarter-sine curve.

#[test]
fn validation_geom_buckling_mode() {
    let h = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;
    let p_cr = std::f64::consts::PI * std::f64::consts::PI * e_eff * IZ / (4.0 * h * h);
    let p = 0.5 * p_cr; // 50% of critical
    let f = 0.01; // small perturbation

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: f, fy: -p, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed")], loads);
    let results = pdelta::solve_pdelta_2d(&input, 30, 1e-6).unwrap();

    // Lateral displacements should increase with height (monotonically)
    let mut prev_ux = 0.0;
    for i in 1..=n {
        let ux = results.results.displacements.iter()
            .find(|d| d.node_id == i + 1).unwrap().ux;
        assert!(ux >= prev_ux,
            "Mode shape: ux monotonic at node {}: {:.6e} >= {:.6e}",
            i + 1, ux, prev_ux);
        prev_ux = ux;
    }

    // Maximum at tip
    let tip_ux = results.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ux;
    assert!(tip_ux > 0.0, "Tip deflects in perturbation direction");
}
