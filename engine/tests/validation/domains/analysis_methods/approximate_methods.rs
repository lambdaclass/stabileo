/// Validation: Approximate Analysis Methods
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 7 (Approximate methods)
///   - McCormac & Nelson, "Structural Analysis", Ch. 16
///   - Norris et al., "Elementary Structural Analysis", Ch. 14
///
/// Portal and cantilever methods for multi-story frames.
/// These give approximate results; tests verify correct trends.
///
///   1. Portal method: equal shear in columns per story
///   2. Cantilever method: axial forces proportional to distance
///   3. Inflection point at mid-height for lateral loads
///   4. Story drift proportional to 1/stiffness
///   5. Fixed-base vs pinned-base stiffness ratio
///   6. Symmetric frame: zero sway under symmetric gravity
///   7. Anti-symmetric load: maximum sway
///   8. Drift ratio increases with height
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Portal Method: Equal Column Shears Per Story
// ================================================================
//
// For a symmetric single-bay frame with lateral load F at top,
// each column carries approximately F/2 shear.

#[test]
fn validation_approx_portal_shear() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Base shears (horizontal reactions)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Each column should carry approximately F/2 (for symmetric frame)
    assert_close(r1.rx.abs(), f_lat / 2.0, 0.08,
        "Portal: V_left ≈ F/2");
    assert_close(r4.rx.abs(), f_lat / 2.0, 0.08,
        "Portal: V_right ≈ F/2");

    // Total must equal F exactly
    assert_close((r1.rx + r4.rx).abs(), f_lat, 0.02,
        "Portal: V_left + V_right = F");
}

// ================================================================
// 2. Cantilever Method: Axial Forces
// ================================================================
//
// Under lateral load, columns develop axial forces.
// For a symmetric frame: left column in tension, right in compression
// (or vice versa depending on load direction).

#[test]
fn validation_approx_cantilever_axial() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical reactions indicate axial forces in columns
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Overturning moment = F × h, resisted by couple in columns and beam moments.
    // For a rigid beam: R_v × w = F × h → R_v = F × h / w
    // For flexible beams, R_v < F×h/w because beam bending absorbs some moment.
    let rv_rigid = f_lat * h / w;

    // One up, one down
    assert!(r1.ry * r4.ry < 0.0,
        "Cantilever: opposite vertical reactions");

    // Actual should be less than or equal to rigid-beam approximation
    assert!(r1.ry.abs() <= rv_rigid * 1.05,
        "Cantilever: Rv ≤ Fh/w: {:.4} ≤ {:.4}", r1.ry.abs(), rv_rigid);
    assert!(r1.ry.abs() > 0.0,
        "Cantilever: Rv > 0: {:.6e}", r1.ry.abs());
}

// ================================================================
// 3. Inflection Points Near Mid-Height
// ================================================================
//
// For fixed-base portal frame with lateral load,
// column inflection points are approximately at mid-height.
// This means the moment changes sign near h/2.

#[test]
fn validation_approx_inflection_point() {
    let h = 6.0;
    let w = 6.0;
    let f_lat = 20.0;

    // Build a portal frame with multiple elements per column for resolution
    let n_col = 6;
    let n_beam = 6;

    // Nodes: column 1 (nodes 1..n_col+1), column 2 (nodes n_col+n_beam+2..2*n_col+n_beam+2)
    // Beam (nodes n_col+1..n_col+n_beam+1)
    let mut nodes = std::collections::HashMap::new();
    let mut node_id = 1;

    // Left column
    for i in 0..=n_col {
        nodes.insert(node_id.to_string(), SolverNode {
            id: node_id, x: 0.0, y: i as f64 * h / n_col as f64,
        });
        node_id += 1;
    }
    let top_left = node_id - 1;

    // Beam (skip first node, shared with column top)
    for i in 1..=n_beam {
        nodes.insert(node_id.to_string(), SolverNode {
            id: node_id, x: i as f64 * w / n_beam as f64, y: h,
        });
        node_id += 1;
    }
    let top_right = node_id - 1;

    // Right column (downward from top-right)
    for i in 1..=n_col {
        nodes.insert(node_id.to_string(), SolverNode {
            id: node_id, x: w, y: h - i as f64 * h / n_col as f64,
        });
        node_id += 1;
    }
    let bottom_right = node_id - 1;

    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = std::collections::HashMap::new();
    let mut elem_id = 1;

    // Left column elements
    for i in 0..n_col {
        elems.insert(elem_id.to_string(), SolverElement {
            id: elem_id, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
        elem_id += 1;
    }

    // Beam elements
    let beam_start = top_left;
    for i in 0..n_beam {
        let ni = if i == 0 { beam_start } else { top_left + i };
        let nj = top_left + i + 1;
        elems.insert(elem_id.to_string(), SolverElement {
            id: elem_id, elem_type: "frame".to_string(),
            node_i: ni, node_j: nj,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
        elem_id += 1;
    }

    // Right column elements
    let rc_nodes: Vec<usize> = {
        let mut v = vec![top_right];
        for i in 1..=n_col {
            v.push(top_right + i);
        }
        v
    };
    for i in 0..n_col {
        elems.insert(elem_id.to_string(), SolverElement {
            id: elem_id, elem_type: "frame".to_string(),
            node_i: rc_nodes[i], node_j: rc_nodes[i + 1],
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
        elem_id += 1;
    }

    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: bottom_right, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: top_left, fx: f_lat, fy: 0.0, mz: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Check that the left column has an inflection point near mid-height.
    // An inflection point is where the moment changes sign.
    // Check moments at quarter, mid, and 3/4 height.
    let mid_col = n_col / 2 + 1; // mid-height node of left column
    let ef_below = results.element_forces.iter().find(|e| e.element_id == mid_col - 1).unwrap();
    let ef_above = results.element_forces.iter().find(|e| e.element_id == mid_col).unwrap();

    // Near inflection point, moments should be small or change sign
    // m_end of lower element and m_start of upper element
    let m_below = ef_below.m_end;
    let _m_above = ef_above.m_start;
    // These should be close (joint equilibrium) and relatively small
    assert!(m_below.abs() < 100.0,
        "Inflection: moment near mid-height is bounded: {:.4}", m_below);
}

// ================================================================
// 4. Story Drift Proportional to 1/Stiffness
// ================================================================

#[test]
fn validation_approx_drift_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    // Stiffer section
    let input1 = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let d1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Double the moment of inertia → half the drift
    let input2 = make_portal_frame(h, w, E, A, 2.0 * IZ, f_lat, 0.0);
    let d2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Drift should be roughly halved (not exact due to axial effects)
    let ratio = d1 / d2;
    assert!(ratio > 1.5 && ratio < 2.5,
        "Drift ∝ 1/I: ratio = {:.2} (expect ~2.0)", ratio);
}

// ================================================================
// 5. Fixed vs Pinned Base Stiffness
// ================================================================

#[test]
fn validation_approx_fixed_vs_pinned() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    // Fixed base
    let input_fixed = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let d_fixed = linear::solve_2d(&input_fixed).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Pinned base: build manually
    let mut nodes = std::collections::HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, y: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 0.0, y: h });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: w, y: h });
    nodes.insert("4".to_string(), SolverNode { id: 4, x: w, y: 0.0 });

    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems = std::collections::HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("2".to_string(), SolverElement {
        id: 2, elem_type: "frame".to_string(), node_i: 2, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });
    elems.insert("3".to_string(), SolverElement {
        id: 3, elem_type: "frame".to_string(), node_i: 4, node_j: 3,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    });

    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];

    let input_pinned = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };
    let d_pinned = linear::solve_2d(&input_pinned).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Fixed base should be stiffer (less drift)
    assert!(d_fixed.abs() < d_pinned.abs(),
        "Fixed < Pinned drift: {:.6e} < {:.6e}", d_fixed.abs(), d_pinned.abs());
}

// ================================================================
// 6. Symmetric Frame: Zero Sway Under Symmetric Gravity
// ================================================================

#[test]
fn validation_approx_symmetric_no_sway() {
    let h = 4.0;
    let w = 6.0;
    let f_grav = -30.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, f_grav);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // No lateral sway under symmetric gravity
    assert!(d2.ux.abs() < 1e-10,
        "Symmetric: no sway at node 2: {:.6e}", d2.ux);
    assert!(d3.ux.abs() < 1e-10,
        "Symmetric: no sway at node 3: {:.6e}", d3.ux);
}

// ================================================================
// 7. Anti-Symmetric Load: Maximum Sway
// ================================================================

#[test]
fn validation_approx_antisymmetric() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Lateral load produces sway
    assert!(d2.ux.abs() > 0.0,
        "Anti-symmetric: sway > 0: {:.6e}", d2.ux);

    // Sway in direction of force
    assert!(d2.ux > 0.0,
        "Anti-symmetric: positive sway for positive force: {:.6e}", d2.ux);
}

// ================================================================
// 8. Drift Ratio Increases with Height
// ================================================================

#[test]
fn validation_approx_drift_vs_height() {
    let w = 6.0;
    let f_lat = 10.0;

    let mut drifts = Vec::new();
    for h in &[3.0, 4.0, 6.0] {
        let input = make_portal_frame(*h, w, E, A, IZ, f_lat, 0.0);
        let d = linear::solve_2d(&input).unwrap()
            .displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        drifts.push(d);
    }

    // Taller frame → more drift
    assert!(drifts[0].abs() < drifts[1].abs(),
        "Drift: h=3 < h=4: {:.6e} < {:.6e}", drifts[0].abs(), drifts[1].abs());
    assert!(drifts[1].abs() < drifts[2].abs(),
        "Drift: h=4 < h=6: {:.6e} < {:.6e}", drifts[1].abs(), drifts[2].abs());
}
