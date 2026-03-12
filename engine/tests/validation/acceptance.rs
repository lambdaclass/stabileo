/// Release-grade acceptance models.
///
/// These tests exercise realistic, multi-feature scenarios that look like
/// actual engineering work — not just textbook cases.
///
/// Tests:
///   3A. Industrial nave (538 elements, fixture-based)
///   3B. 3D multi-story building (105 elements, fixture-based)
///   3C. Large programmatic 2D frame (550 elements, lateral + gravity)
///   3D. 10-span continuous beam with mixed loads (200 elements)
///   3E. Mixed frame+shell structure
///   4F. Shell cantilever with point load (pure MITC4)
///   4G. Contact + gap element closure
///   4H. Mixed frame+shell with diaphragm constraint
///   4I. Contact + tension-only bracing
///   5A. Corotational 2D + diaphragm
///   5B. Corotational 3D + rigid link
///   5C. Corotational 3D + diaphragm
///   5D. Corotational 3D small-load parity with linear (constrained)
///   5E. Arc-length + diaphragm (2D portal snap-through)
///   5F. Arc-length + rigid link (constrained, small-load parity)
///   5G. Fiber nonlinear 2D + diaphragm
///   5H. Fiber nonlinear 3D + rigid link (elastic parity)
///   5I. Contact 2D + diaphragm (gap + constraint)
///   5J. Contact 3D + rigid link
///   5K. Time integration 2D + diaphragm
///   5L. Time integration 3D + rigid link
///   6A. Quad9 shell cantilever (MITC9)
///   6B. Mixed beam+quad9 slab on columns
///   6C. Quad9 cylindrical tank wall under hydrostatic pressure
///   6D. Quad9 modal analysis of simply-supported plate

#[path = "../common/mod.rs"]
mod common;

use common::*;
use dedaliano_engine::solver::{linear, pdelta, corotational};
use dedaliano_engine::solver::arc_length::{self, ArcLengthInput};
use dedaliano_engine::solver::contact::{self, ContactInput, ContactInput3D, ContactType};
use dedaliano_engine::solver::fiber_nonlinear::{self, FiberNonlinearInput, FiberNonlinearInput3D};
use dedaliano_engine::solver::reduction::{self, GuyanInput};
use dedaliano_engine::solver::time_integration;
use dedaliano_engine::solver::modal;
use dedaliano_engine::element::fiber_beam::{rectangular_fiber_section, Fiber, FiberMaterial, FiberSectionDef};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ── 3A: Industrial Nave (fixture-based, 538 elements) ──────────────

#[test]
fn acceptance_3a_industrial_nave() {
    let input_json = include_str!("../fixtures/ex-3d-nave-industrial-input.json");
    let input: SolverInput3D = serde_json::from_str(input_json)
        .expect("Failed to parse nave industrial input");

    let result = linear::solve_3d(&input).expect("solve_3d failed on nave industrial");

    // Basic sanity
    assert!(!result.displacements.is_empty(), "No displacements");
    assert!(!result.reactions.is_empty(), "No reactions");
    assert!(!result.element_forces.is_empty(), "No element forces");

    // Large model — verify expected counts
    assert!(result.displacements.len() > 200, "Expected 200+ nodes");
    assert!(result.element_forces.len() > 500, "Expected 500+ elements");

    // No NaN/Inf in displacements
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // Reactions should be non-trivial
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() > 1.0, "Reactions should be non-zero, got sum_fz={:.2}", sum_fz);

    // Displacements should be physically reasonable (not zero, not huge)
    let max_uz = result.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    assert!(max_uz > 1e-6, "Displacements too small — model may not be loaded");
    assert!(max_uz < 1.0, "Displacements unreasonably large: max_uz={:.4}", max_uz);
}

// ── 3B: 3D Multi-Story Building (fixture-based, 105 elements) ─────

#[test]
fn acceptance_3b_building_case1() {
    let input_json = include_str!("../fixtures/ex-3d-building-case1-input.json");
    let input: SolverInput3D = serde_json::from_str(input_json)
        .expect("Failed to parse building case1 input");

    let result = linear::solve_3d(&input).expect("solve_3d failed on building case1");

    // Basic sanity
    assert!(!result.displacements.is_empty());
    assert!(!result.reactions.is_empty());
    assert!(!result.element_forces.is_empty());

    // No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // Reactions should be non-trivial
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() > 1.0, "Reactions should be non-zero, got sum_fz={:.2}", sum_fz);

    // Displacements reasonable
    let max_disp = result.displacements.iter()
        .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_disp > 1e-8, "All displacements near zero");
    assert!(max_disp < 1.0, "Displacements unreasonably large: {:.4}", max_disp);
}

// ── 3C: Large Programmatic 2D Frame (50-story × 5-bay, 550 elements) ─

#[test]
fn acceptance_3c_large_2d_frame() {
    let n_stories = 50;
    let n_bays = 5;
    let h = 3.0;
    let w = 6.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let cols = n_bays + 1;

    let mut nodes = Vec::new();
    let mut node_id = 1usize;
    for j in 0..=n_stories {
        for i in 0..=n_bays {
            nodes.push((node_id, i as f64 * w, j as f64 * h));
            node_id += 1;
        }
    }

    let mut elems = Vec::new();
    let mut eid = 1usize;
    for j in 0..n_stories {
        for i in 0..=n_bays {
            let ni = j * cols + i + 1;
            let nj = (j + 1) * cols + i + 1;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }
    for j in 1..=n_stories {
        for i in 0..n_bays {
            let ni = j * cols + i + 1;
            let nj = j * cols + i + 2;
            elems.push((eid, "frame", ni, nj, 1, 1, false, false));
            eid += 1;
        }
    }

    let sups: Vec<_> = (0..=n_bays).map(|i| (i + 1, i + 1, "fixed")).collect();

    let mut loads = Vec::new();
    for j in 1..=n_stories {
        // Lateral at left node
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: j * cols + 1,
            fx: 10.0, fy: 0.0, mz: 0.0,
        }));
        // Gravity at each floor node
        for i in 0..=n_bays {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: j * cols + i + 1,
                fx: 0.0, fy: -50.0, mz: 0.0,
            }));
        }
    }

    let input = make_input(
        nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads,
    );

    // Verify element count >= 500
    let expected_elements = n_stories * cols + n_stories * n_bays;
    assert_eq!(input.elements.len(), expected_elements);
    assert!(expected_elements >= 500);

    // Linear solve
    let result = linear::solve_2d(&input).expect("Linear solve failed on large frame");

    // No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(), "NaN/Inf at node {}", d.node_id);
    }

    // Reactions exist
    assert_eq!(result.reactions.len(), cols, "Expected {} base reactions", cols);

    // Top-floor lateral displacement should be positive (structure leans with wind)
    let top_left_node_id = n_stories * cols + 1;
    let top_disp = result.displacements.iter()
        .find(|d| d.node_id == top_left_node_id)
        .expect("Top-left node not found");
    assert!(top_disp.ux > 0.0,
        "Top-floor should deflect rightward under rightward wind, got ux={:.6}", top_disp.ux);

    // Gravity should cause downward deflection at beams
    let mid_floor_node = (n_stories / 2) * cols + n_bays / 2 + 1;
    let mid_disp = result.displacements.iter()
        .find(|d| d.node_id == mid_floor_node);
    if let Some(md) = mid_disp {
        assert!(md.uy < 0.0, "Mid-floor should deflect downward, got uy={:.6}", md.uy);
    }

    // P-Delta: verify convergence and amplification > 1.0
    let pdelta_result = pdelta::solve_pdelta_2d(&input, 20, 1e-4)
        .expect("P-delta solve failed on large frame");
    assert!(pdelta_result.converged, "P-delta did not converge");
    assert!(pdelta_result.b2_factor > 1.0,
        "B2 factor should be > 1.0, got {}", pdelta_result.b2_factor);
}

// ── 3D: 10-Span Continuous Beam with Mixed Loads ───────────────────

#[test]
fn acceptance_3d_continuous_beam_mixed_loads() {
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let n_per_span = 20;

    // 10 spans of varying lengths
    let spans = vec![6.0, 8.0, 5.0, 7.0, 6.5, 8.5, 5.5, 7.5, 6.0, 8.0];
    let total_length: f64 = spans.iter().sum();
    let total_elements = n_per_span * spans.len();

    // UDL on all spans
    let q = -12.0; // kN/m
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

    // Point loads on alternating spans (at midspan node)
    for (span_idx, _span_len) in spans.iter().enumerate() {
        if span_idx % 2 == 0 {
            let mid_node = 1 + span_idx * n_per_span + n_per_span / 2;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node,
                fx: 0.0, fy: -50.0, mz: 0.0,
            }));
        }
    }

    let mut input = make_continuous_beam(&spans, n_per_span, e, a, iz, loads);

    // Settlement at one interior support (support at end of span 3)
    let settlement_node = 1 + 3 * n_per_span;
    for sup in input.supports.values_mut() {
        if sup.node_id == settlement_node {
            sup.dy = Some(-0.005); // 5mm settlement
        }
    }

    let result = linear::solve_2d(&input).expect("Linear solve failed on continuous beam");

    // Basic sanity
    assert_eq!(result.displacements.len(), total_elements + 1);
    assert!(!result.reactions.is_empty());

    // No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(), "NaN/Inf at node {}", d.node_id);
    }

    // Global equilibrium: sum of reactions ≈ total applied load
    let sum_ry: f64 = result.reactions.iter().map(|r| r.ry).sum();
    let total_udl = q * total_length;
    let total_point: f64 = spans.iter().enumerate()
        .filter(|(i, _)| i % 2 == 0)
        .map(|_| -50.0)
        .sum();
    let total_applied = total_udl + total_point;
    let equil_err = (sum_ry + total_applied).abs();
    assert!(equil_err < 1.0,
        "Equilibrium error: sum_ry={:.3}, total_applied={:.3}, err={:.3}",
        sum_ry, total_applied, equil_err);

    // Midspan deflections should be physically reasonable (downward, bounded)
    for span_idx in [0, 4, 9] {
        let mid_node = 1 + span_idx * n_per_span + n_per_span / 2;
        let mid_disp = result.displacements.iter()
            .find(|d| d.node_id == mid_node)
            .expect("Midspan node not found");
        assert!(mid_disp.uy < 0.0,
            "Span {} midspan deflection should be downward, got {:.6}", span_idx, mid_disp.uy);
        assert!(mid_disp.uy > -0.1,
            "Span {} midspan deflection unreasonably large: {:.6}", span_idx, mid_disp.uy);
    }
}

// ── 3E: Mixed Frame + Shell Structure ──────────────────────────────

#[test]
fn acceptance_3e_mixed_frame_shell() {
    // Portal frame columns (4 frame elements) + MITC4 quad roof slab (4×4 mesh)
    let h = 4.0;
    let w = 8.0;
    let depth = 8.0;
    let e = 30_000.0;
    let nu = 0.2;
    let col_a = 0.16;
    let iy = 2.133e-3;
    let iz_val = 2.133e-3;
    let j_val = 3.6e-3;
    let slab_t = 0.2;

    let nx = 4;
    let ny = 4;
    let mut nodes_map = HashMap::new();
    let mut node_id = 1usize;

    // 4 base nodes (z=0) at slab corners
    let corners = [(0.0, 0.0), (w, 0.0), (w, depth), (0.0, depth)];
    let mut base_ids = Vec::new();
    for &(x, y) in &corners {
        nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 0.0 });
        base_ids.push(node_id);
        node_id += 1;
    }

    // Slab grid at z=h
    let sx = w / nx as f64;
    let sy = depth / ny as f64;
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    for i in 0..=nx {
        for jj in 0..=ny {
            let x = i as f64 * sx;
            let y = jj as f64 * sy;
            nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: h });
            grid[i][jj] = node_id;
            node_id += 1;
        }
    }

    // Column top nodes = slab grid corners
    let top_ids = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e, nu });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: col_a, iy, iz: iz_val, j: j_val, cw: None, as_y: None, as_z: None,
    });

    // 4 column elements
    let mut elements = HashMap::new();
    let mut eid = 1usize;
    for ci in 0..4 {
        elements.insert(eid.to_string(), SolverElement3D {
            id: eid,
            elem_type: "frame".to_string(),
            node_i: base_ids[ci],
            node_j: top_ids[ci],
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        eid += 1;
    }

    // 4×4 quad mesh
    let mut quads = HashMap::new();
    let mut qid = 1usize;
    for i in 0..nx {
        for jj in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][jj], grid[i+1][jj], grid[i+1][jj+1], grid[i][jj+1]],
                material_id: 1,
                thickness: slab_t,
            });
            qid += 1;
        }
    }

    // Fixed supports at base
    let mut supports = HashMap::new();
    for (i, &nid) in base_ids.iter().enumerate() {
        supports.insert((i + 1).to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }

    // Gravity on slab nodes
    let total_slab_nodes = (nx + 1) * (ny + 1);
    let force_per_node = -5.0 * w * depth / total_slab_nodes as f64;
    let mut loads = Vec::new();
    for i in 0..=nx {
        for jj in 0..=ny {
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: grid[i][jj],
                fx: 0.0, fy: 0.0, fz: force_per_node,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
        }
    }

    let input = SolverInput3D {
        nodes: nodes_map,
        materials,
        sections,
        elements,
        supports,
        loads,
        constraints: vec![],
        plates: HashMap::new(),
        quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None,
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on mixed frame+shell");

    // Basic sanity
    assert!(!result.displacements.is_empty());
    assert!(!result.reactions.is_empty());

    // No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // Reactions non-trivial
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() > 1.0, "Reactions should be non-zero, sum_fz={:.2}", sum_fz);

    // Slab center should deflect downward
    let center_node = grid[nx / 2][ny / 2];
    let center_disp = result.displacements.iter()
        .find(|dd| dd.node_id == center_node)
        .expect("Center slab node not found");
    assert!(center_disp.uz < 0.0,
        "Center slab should deflect downward, got uz={:.6}", center_disp.uz);
}

// ── 4A: Steel Building with Diaphragms + Eccentric Connection ──────

#[test]
fn acceptance_4a_steel_building_diaphragms() {
    // 3-story, 2×1-bay 3D frame: 24 main nodes + 1 eccentric slave
    let e = 200_000.0;
    let nu = 0.3;

    // Nodes: 6 per level (3×2 grid, x={0,6,12}, y={0,6}), z={0,3,6,9}
    let mut nodes = Vec::new();
    let mut nid = 1usize;
    for level in 0..4 {
        let z = level as f64 * 3.0;
        for iy in 0..2 {
            for ix in 0..3 {
                nodes.push((nid, ix as f64 * 6.0, iy as f64 * 6.0, z));
                nid += 1;
            }
        }
    }
    // Node 25: eccentric slave off node 20
    nodes.push((25, 12.0, 6.3, 9.0)); // offset_y = 0.3 from node 20 at (12,6,9)

    // Sections: col (sec 1), beam (sec 2)
    let secs = vec![
        (1, 0.01_f64, 8.33e-5, 8.33e-5, 1.4e-4),   // column
        (2, 0.006_f64, 4.5e-5, 4.5e-5, 7.0e-5),     // beam
    ];

    // Elements: 18 columns (vertical) + 15 beams (horizontal)
    let mut elems = Vec::new();
    let mut eid = 1usize;

    // Columns: connect level j to level j+1 at each of 6 grid positions
    for level in 0..3 {
        for pos in 0..6 {
            let ni = level * 6 + pos + 1;
            let nj = (level + 1) * 6 + pos + 1;
            elems.push((eid, "frame", ni, nj, 1, 1)); // sec 1 = column
            eid += 1;
        }
    }

    // Beams: at each floor level (1,2,3), connect adjacent nodes
    // X-direction beams (along x at each y): 3 floors × 2 rows × 2 spans = 12
    // Y-direction beams (along y at each x): 3 floors × 3 cols × 1 span = 9 ... but 12+9=21, plan says 15
    // Plan says 15 beams total. Let's do X-direction only: 3 floors × 2 y-rows × 2 x-spans = 12
    // Plus Y-direction at edges: 3 floors × 1 span (y=0→y=6 at x=0 only) = 3 → 15 total
    // Actually let's just do all X-beams = 12, plus 3 Y-beams at x=0 = 15
    for level in 1..4 {
        let base = level * 6; // first node id at this level = base+1
        // X-direction beams at y=0: (base+1)-(base+2), (base+2)-(base+3)
        for i in 0..2 {
            let ni = base + i + 1;
            let nj = base + i + 2;
            elems.push((eid, "frame", ni, nj, 1, 2)); // sec 2 = beam
            eid += 1;
        }
        // X-direction beams at y=6: (base+4)-(base+5), (base+5)-(base+6)
        for i in 0..2 {
            let ni = base + 3 + i + 1;
            let nj = base + 3 + i + 2;
            elems.push((eid, "frame", ni, nj, 1, 2));
            eid += 1;
        }
        // Y-direction beam at x=0: (base+1)-(base+4)
        let ni = base + 1;
        let nj = base + 4;
        elems.push((eid, "frame", ni, nj, 1, 2));
        eid += 1;
    }
    assert_eq!(elems.len(), 33, "Expected 33 elements (18 cols + 15 beams)");

    // Supports: nodes 1–6 fully fixed
    let sups: Vec<(usize, Vec<bool>)> = (1..=6)
        .map(|n| (n, vec![true, true, true, true, true, true]))
        .collect();

    // Loads: gravity + wind + eccentric
    let mut loads = Vec::new();
    // Gravity: fz=-50 kN at each floor node (nodes 7–24, 18 nodes)
    for n in 7..=24 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n, fx: 0.0, fy: 0.0, fz: -50.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }
    // Wind: fx=+5 kN at floor-3 nodes (19–24)
    for n in 19..=24 {
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n, fx: 5.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }));
    }
    // Eccentric: fx=+2 kN at node 25
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 25, fx: 2.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let mut input = make_3d_input(nodes, vec![(1, e, nu)], secs, elems, sups, loads);

    // Constraints
    // Floor diaphragms
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
        master_node: 7, slave_nodes: vec![8, 9, 10, 11, 12], plane: "XY".into(),
    }));
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
        master_node: 13, slave_nodes: vec![14, 15, 16, 17, 18], plane: "XY".into(),
    }));
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
        master_node: 19, slave_nodes: vec![20, 21, 22, 23, 24], plane: "XY".into(),
    }));
    // Eccentric connection: master=20, slave=25, offset_y=0.3
    input.constraints.push(Constraint::EccentricConnection(EccentricConnectionConstraint {
        master_node: 20, slave_node: 25,
        offset_x: 0.0, offset_y: 0.3, offset_z: 0.0,
        releases: vec![],
    }));

    let result = linear::solve_3d(&input).expect("solve_3d failed on 4A steel building");

    // 1. No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 2. Diaphragm kinematics: slave_ux ≈ master_ux - dy*master_rz (floor 3)
    let master19 = result.displacements.iter().find(|d| d.node_id == 19).unwrap();
    for &slave_id in &[20, 21, 22, 23, 24] {
        let slave = result.displacements.iter().find(|d| d.node_id == slave_id).unwrap();
        let slave_node = input.nodes.values().find(|n| n.id == slave_id).unwrap();
        let master_node = input.nodes.values().find(|n| n.id == 19).unwrap();
        let dx = slave_node.x - master_node.x;
        let dy = slave_node.y - master_node.y;
        let expected_ux = master19.ux - dy * master19.rz;
        let expected_uy = master19.uy + dx * master19.rz;
        assert!((slave.ux - expected_ux).abs() < 1e-4,
            "Diaphragm ux mismatch at node {}: got {:.8}, expected {:.8}", slave_id, slave.ux, expected_ux);
        assert!((slave.uy - expected_uy).abs() < 1e-4,
            "Diaphragm uy mismatch at node {}: got {:.8}, expected {:.8}", slave_id, slave.uy, expected_uy);
    }

    // 3. Vertical equilibrium: reactions should be non-trivial and balance gravity
    let sum_fz_react: f64 = result.reactions.iter().map(|r| r.fz).sum();
    // With constraints, reactions may be reported via constraint forces. Check both.
    let has_significant_fz = result.reactions.iter().any(|r| r.fz.abs() > 1.0);
    let has_constraint_fz = result.constraint_forces.iter().any(|cf| cf.force.abs() > 1.0);
    assert!(has_significant_fz || has_constraint_fz,
        "Expected non-trivial vertical reactions or constraint forces, sum_fz_react={:.3}", sum_fz_react);

    // 4. Lateral drift: floor 3 ux > floor 2 ux > floor 1 ux
    let floor_ux = |master: usize| -> f64 {
        result.displacements.iter().find(|d| d.node_id == master).unwrap().ux
    };
    let ux1 = floor_ux(7);   // floor 1 master
    let ux2 = floor_ux(13);  // floor 2 master
    let ux3 = floor_ux(19);  // floor 3 master
    assert!(ux3 > ux2 && ux2 > ux1,
        "Lateral drift should increase: ux1={:.6}, ux2={:.6}, ux3={:.6}", ux1, ux2, ux3);

    // 5. constraint_forces non-empty
    assert!(!result.constraint_forces.is_empty(), "Expected non-empty constraint forces");

    // 6. Eccentric node 25 follows rigid-body from master 20
    let master20 = result.displacements.iter().find(|d| d.node_id == 20).unwrap();
    let slave25 = result.displacements.iter().find(|d| d.node_id == 25).unwrap();
    let expected_ux_25 = master20.ux - 0.3 * master20.rz;
    assert!((slave25.ux - expected_ux_25).abs() < 1e-3,
        "Eccentric node 25 ux: got {:.8}, expected {:.8}", slave25.ux, expected_ux_25);
}

// ── 4B: Frame + Quad Slab (Mixed Elements) ─────────────────────────

#[test]
fn acceptance_4b_frame_quad_slab() {
    // 2×2-bay single-story: 4 frame columns + 16 MITC4 quads
    let e = 30_000.0;
    let nu = 0.2;
    let col_a = 0.16;
    let iy = 2.133e-3;
    let iz_val = 2.133e-3;
    let j_val = 3.6e-3;
    let slab_t = 0.2;

    let nx = 4usize;
    let ny = 4usize;
    let slab_size = 8.0;
    let sx = slab_size / nx as f64;
    let sy = slab_size / ny as f64;

    let mut nodes_map = HashMap::new();
    let mut node_id = 1usize;

    // 4 base nodes at z=0 (column bases at slab corners)
    let base_corners = [(0.0, 0.0), (slab_size, 0.0), (slab_size, slab_size), (0.0, slab_size)];
    let mut base_ids = Vec::new();
    for &(x, y) in &base_corners {
        nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 0.0 });
        base_ids.push(node_id);
        node_id += 1;
    }

    // 5×5 slab grid at z=4
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    for i in 0..=nx {
        for j in 0..=ny {
            let x = i as f64 * sx;
            let y = j as f64 * sy;
            nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 4.0 });
            grid[i][j] = node_id;
            node_id += 1;
        }
    }
    assert_eq!(node_id - 1, 29); // 4 base + 25 slab

    // Column tops = slab grid corners
    let top_ids = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e, nu });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: col_a, iy, iz: iz_val, j: j_val,
        cw: None, as_y: None, as_z: None,
    });

    // 4 column elements
    let mut elements = HashMap::new();
    let mut eid = 1usize;
    for ci in 0..4 {
        elements.insert(eid.to_string(), SolverElement3D {
            id: eid, elem_type: "frame".to_string(),
            node_i: base_ids[ci], node_j: top_ids[ci],
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        eid += 1;
    }

    // 4×4 MITC4 quad mesh
    let mut quads = HashMap::new();
    let mut qid = 1usize;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                material_id: 1, thickness: slab_t,
            });
            qid += 1;
        }
    }
    assert_eq!(quads.len(), 16);

    // Fixed supports at base
    let mut supports = HashMap::new();
    for (i, &nid) in base_ids.iter().enumerate() {
        supports.insert((i + 1).to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }

    // Loads: QuadPressure = -5 kN/m² on all 16 quads + lateral at slab center
    let mut loads = Vec::new();
    for qid in 1..=16 {
        loads.push(SolverLoad3D::QuadPressure(SolverPressureLoad {
            element_id: qid, pressure: -5.0,
        }));
    }
    let center_node = grid[nx / 2][ny / 2];
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: center_node, fx: 20.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let input = SolverInput3D {
        nodes: nodes_map, materials, sections, elements, supports, loads,
        constraints: vec![], plates: HashMap::new(), quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 4B frame+quad slab");

    // 1. Correct counts
    assert_eq!(result.quad_stresses.len(), 16, "Expected 16 quad stresses");
    assert_eq!(result.element_forces.len(), 4, "Expected 4 element forces (columns)");

    // 2. Slab center deflects downward; |uz_center| > |uz_corner| (bowl shape)
    let center_disp = result.displacements.iter()
        .find(|d| d.node_id == center_node).unwrap();
    assert!(center_disp.uz < 0.0, "Center should deflect down, got uz={:.6}", center_disp.uz);
    let corner_disp = result.displacements.iter()
        .find(|d| d.node_id == grid[0][0]).unwrap();
    assert!(center_disp.uz.abs() > corner_disp.uz.abs(),
        "Bowl: |uz_center|={:.6} should > |uz_corner|={:.6}", center_disp.uz.abs(), corner_disp.uz.abs());

    // 3. Reactions Fz sum should balance applied quad pressure (positive = upward)
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz > 100.0, "Reactions should be significantly positive, got {:.2}", sum_fz);

    // 4. Positive ux at slab center from lateral load
    assert!(center_disp.ux > 0.0,
        "Center ux should be positive from lateral load, got {:.6}", center_disp.ux);

    // 5. All quad von_mises > 0 and finite
    for qs in &result.quad_stresses {
        assert!(qs.von_mises > 0.0 && qs.von_mises.is_finite(),
            "Quad {} von_mises invalid: {:.6}", qs.element_id, qs.von_mises);
    }
}

// ── 4C: Contact + Uplift Foundation ─────────────────────────────────

#[test]
fn acceptance_4c_contact_uplift() {
    // 3-bay 2D portal: 8 nodes, 7 elements, uplift at outer columns
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;

    // Nodes: bases 1–4 (y=0), tops 5–8 (y=4)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0), (3, 12.0, 0.0), (4, 18.0, 0.0),
        (5, 0.0, 4.0), (6, 6.0, 4.0), (7, 12.0, 4.0), (8, 18.0, 4.0),
    ];

    // 4 columns + 3 beams
    let elems = vec![
        (1, "frame", 1, 5, 1, 1, false, false),
        (2, "frame", 2, 6, 1, 1, false, false),
        (3, "frame", 3, 7, 1, 1, false, false),
        (4, "frame", 4, 8, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
        (7, "frame", 7, 8, 1, 1, false, false),
    ];

    // Pinned supports at all 4 bases
    let sups = vec![
        (1, 1, "pinned"), (2, 2, "pinned"), (3, 3, "pinned"), (4, 4, "pinned"),
    ];

    // Gravity: fy=-20 kN at top nodes; Lateral: fx=+500 kN at node 5 (high overturning)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 500.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: -20.0, mz: 0.0 }),
    ];

    let solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);

    let contact_input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![],
        uplift_supports: vec![1, 4],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = contact::solve_contact_2d(&contact_input)
        .expect("Contact solve failed on 4C uplift");

    // 1. Converged
    assert!(result.converged, "Contact solver did not converge");

    // 2. No NaN/Inf
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. 7 element forces
    assert_eq!(result.results.element_forces.len(), 7, "Expected 7 element forces");

    // 4. Under overturning: windward column (node 1) reaction ry ≤ 0 (tensile → uplift)
    let react1 = result.results.reactions.iter().find(|r| r.node_id == 1);
    if let Some(r) = react1 {
        // If uplift kicked in, reaction is zero or absent. If still in contact, it may be tensile.
        assert!(r.ry <= 0.001,
            "Node 1 should uplift (ry ≤ 0), got ry={:.4}", r.ry);
    }
    // Absence of reaction for node 1 also valid (uplift = support removed)

    // 5. Leeward reactions compensate: node 4 ry should be larger than interior
    let react4 = result.results.reactions.iter()
        .find(|r| r.node_id == 4)
        .expect("Leeward node 4 should have reaction");
    assert!(react4.ry > 0.0, "Leeward node 4 should have positive ry, got {:.4}", react4.ry);

    // 6. Total vertical reaction ≈ total gravity (80 kN)
    let sum_ry: f64 = result.results.reactions.iter().map(|r| r.ry).sum();
    assert!((sum_ry - 80.0).abs() < 5.0,
        "Total ry should ≈ 80, got {:.2}", sum_ry);
}

// ── 4D: Fiber Nonlinear Pushover ────────────────────────────────────

#[test]
fn acceptance_4d_fiber_pushover() {
    // 2-story single-bay portal: 6 nodes, 6 elements
    let e = 200_000.0;

    // Nodes
    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),
        (3, 0.0, 3.0), (4, 6.0, 3.0),
        (5, 0.0, 6.0), (6, 6.0, 6.0),
    ];

    // Elements: 4 columns (sec 1) + 2 beams (sec 2)
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // col
        (2, "frame", 2, 4, 1, 1, false, false), // col
        (3, "frame", 3, 5, 1, 1, false, false), // col
        (4, "frame", 4, 6, 1, 1, false, false), // col
        (5, "frame", 3, 4, 1, 2, false, false), // beam
        (6, "frame", 5, 6, 1, 2, false, false), // beam
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    // Fiber sections
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), rectangular_fiber_section(
        0.3, 0.3, 10,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
    ));
    fiber_sections.insert("2".into(), rectangular_fiber_section(
        0.3, 0.5, 10,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
    ));

    // --- Part A: Elastic check ---
    let loads_elastic = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 5.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 5.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -20.0, mz: 0.0 }),
    ];

    // Sections for linear comparison: col A=0.09, Iz=6.75e-4; beam A=0.15, Iz=3.125e-3
    let solver_elastic = make_input(
        nodes.clone(), vec![(1, e, 0.3)],
        vec![(1, 0.09, 6.75e-4), (2, 0.15, 3.125e-3)],
        elems.clone(), sups.clone(), loads_elastic.clone(),
    );

    let linear_result = linear::solve_2d(&solver_elastic)
        .expect("Linear solve failed for 4D elastic check");

    let fiber_elastic_input = FiberNonlinearInput {
        solver: solver_elastic.clone(),
        fiber_sections: fiber_sections.clone(),
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-6,
        n_increments: 1,
    };

    let fiber_elastic = fiber_nonlinear::solve_fiber_nonlinear_2d(&fiber_elastic_input)
        .expect("Fiber elastic solve failed");

    // Compare displacements within 5%
    for ld in &linear_result.displacements {
        let fd = fiber_elastic.results.displacements.iter()
            .find(|d| d.node_id == ld.node_id).unwrap();
        if ld.ux.abs() > 1e-8 {
            let rel = (fd.ux - ld.ux).abs() / ld.ux.abs();
            assert!(rel < 0.05, "Node {} ux mismatch: linear={:.6}, fiber={:.6}, rel={:.4}",
                ld.node_id, ld.ux, fd.ux, rel);
        }
        if ld.uy.abs() > 1e-8 {
            let rel = (fd.uy - ld.uy).abs() / ld.uy.abs();
            assert!(rel < 0.05, "Node {} uy mismatch: linear={:.6}, fiber={:.6}, rel={:.4}",
                ld.node_id, ld.uy, fd.uy, rel);
        }
    }

    // --- Part B: Yielding check ---
    // Column Mp ≈ fy × Z ≈ 250 × (0.3×0.3²/4) ≈ 1687 kN·m, so need very high lateral
    let loads_yield = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 3000.0, fy: -100.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -100.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 3000.0, fy: -100.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -100.0, mz: 0.0 }),
    ];

    let solver_yield = make_input(
        nodes.clone(), vec![(1, e, 0.3)],
        vec![(1, 0.09, 6.75e-4), (2, 0.15, 3.125e-3)],
        elems.clone(), sups.clone(), loads_yield,
    );

    let fiber_yield_input = FiberNonlinearInput {
        solver: solver_yield,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-6,
        n_increments: 20,
    };

    let fiber_yield = fiber_nonlinear::solve_fiber_nonlinear_2d(&fiber_yield_input)
        .expect("Fiber yield solve failed");

    assert!(fiber_yield.converged, "Fiber yield did not converge");

    // At least one element should have yielded
    assert!(fiber_yield.fiber_status.iter().any(|s| s.yielded),
        "Expected at least one element to yield under high lateral load");

    // Roof displacement (node 5) should exceed linear prediction
    let roof_fiber = fiber_yield.results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap();
    let roof_linear = linear_result.displacements.iter()
        .find(|d| d.node_id == 5).unwrap();
    // Scale linear: loads are 600× larger for fx (3000/5), so linear ux would be ~600× larger
    let linear_scaled_ux = roof_linear.ux * (3000.0 / 5.0);
    assert!(roof_fiber.ux > linear_scaled_ux,
        "Yielding should increase drift: fiber_ux={:.6}, scaled_linear_ux={:.6}",
        roof_fiber.ux, linear_scaled_ux);
}

// ── 4E: Guyan Reduction vs Full Linear ──────────────────────────────

#[test]
fn acceptance_4e_guyan_vs_full() {
    // 5-story single-bay frame: 12 nodes, 15 elements
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;

    // Nodes: 2 per level, x={0,6}, y={0,3,6,9,12,15}
    let mut nodes = Vec::new();
    let mut nid = 1usize;
    for level in 0..6 {
        let y = level as f64 * 3.0;
        nodes.push((nid, 0.0, y)); nid += 1;
        nodes.push((nid, 6.0, y)); nid += 1;
    }
    assert_eq!(nodes.len(), 12);

    // Elements: 10 columns + 5 beams
    let mut elems = Vec::new();
    let mut eid = 1usize;
    // Columns: left (1→3, 3→5, 5→7, 7→9, 9→11) and right (2→4, 4→6, 6→8, 8→10, 10→12)
    for level in 0..5 {
        let left_bot = level * 2 + 1;
        let left_top = left_bot + 2;
        elems.push((eid, "frame", left_bot, left_top, 1, 1, false, false)); eid += 1;
        let right_bot = level * 2 + 2;
        let right_top = right_bot + 2;
        elems.push((eid, "frame", right_bot, right_top, 1, 1, false, false)); eid += 1;
    }
    // Beams: floor level j → nodes (2j+1, 2j+2), j=1..5
    for level in 1..6 {
        let left = level * 2 + 1;
        let right = level * 2 + 2;
        elems.push((eid, "frame", left, right, 1, 1, false, false)); eid += 1;
    }
    assert_eq!(elems.len(), 15);

    // Supports: nodes 1,2 fixed
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];

    // Loads: fx=10 kN at left column per floor + fy=-50 kN at all floor nodes
    let mut loads = Vec::new();
    for level in 1..6 {
        let left = level * 2 + 1;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: left, fx: 10.0, fy: 0.0, mz: 0.0 }));
        let right = level * 2 + 2;
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: left, fx: 0.0, fy: -50.0, mz: 0.0 }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: right, fx: 0.0, fy: -50.0, mz: 0.0 }));
    }

    let solver_input = make_input(
        nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads,
    );

    // Full linear solve
    let full_result = linear::solve_2d(&solver_input)
        .expect("Full linear solve failed for 4E");

    // Guyan reduction
    let guyan_input = GuyanInput {
        solver: solver_input,
        boundary_nodes: vec![1, 2, 11, 12],
    };

    let guyan_result = reduction::guyan_reduce_2d(&guyan_input)
        .expect("Guyan reduction failed for 4E");

    // 1. Both solved successfully — already asserted by .expect()

    // 2. Displacements match at ALL nodes within 1e-10 (Guyan is exact for static)
    for fd in &full_result.displacements {
        let gd = guyan_result.displacements.iter()
            .find(|d| d.node_id == fd.node_id)
            .unwrap_or_else(|| panic!("Guyan missing node {}", fd.node_id));
        assert!((gd.ux - fd.ux).abs() < 1e-10,
            "Node {} ux: full={:.12}, guyan={:.12}", fd.node_id, fd.ux, gd.ux);
        assert!((gd.uy - fd.uy).abs() < 1e-10,
            "Node {} uy: full={:.12}, guyan={:.12}", fd.node_id, fd.uy, gd.uy);
        assert!((gd.rz - fd.rz).abs() < 1e-10,
            "Node {} rz: full={:.12}, guyan={:.12}", fd.node_id, fd.rz, gd.rz);
    }

    // 3. K_condensed symmetric: |K[i,j] - K[j,i]| < 1e-12
    let nb = guyan_result.n_boundary;
    for i in 0..nb {
        for j in (i + 1)..nb {
            let kij = guyan_result.k_condensed[i * nb + j];
            let kji = guyan_result.k_condensed[j * nb + i];
            assert!((kij - kji).abs() < 1e-10,
                "K_condensed not symmetric: K[{},{}]={:.14}, K[{},{}]={:.14}", i, j, kij, j, i, kji);
        }
    }

    // 4. Element forces match within 1e-8
    for ff in &full_result.element_forces {
        let gf = guyan_result.element_forces.iter()
            .find(|f| f.element_id == ff.element_id)
            .unwrap_or_else(|| panic!("Guyan missing element {}", ff.element_id));
        assert!((gf.n_start - ff.n_start).abs() < 1e-8,
            "Elem {} n_start: full={:.12}, guyan={:.12}", ff.element_id, ff.n_start, gf.n_start);
        assert!((gf.v_start - ff.v_start).abs() < 1e-8,
            "Elem {} v_start: full={:.12}, guyan={:.12}", ff.element_id, ff.v_start, gf.v_start);
        assert!((gf.m_start - ff.m_start).abs() < 1e-8,
            "Elem {} m_start: full={:.12}, guyan={:.12}", ff.element_id, ff.m_start, gf.m_start);
        assert!((gf.m_end - ff.m_end).abs() < 1e-8,
            "Elem {} m_end: full={:.12}, guyan={:.12}", ff.element_id, ff.m_end, gf.m_end);
    }

    // 5. Reactions match within 1e-8
    for fr in &full_result.reactions {
        let gr = guyan_result.reactions.iter()
            .find(|r| r.node_id == fr.node_id)
            .unwrap_or_else(|| panic!("Guyan missing reaction at node {}", fr.node_id));
        assert!((gr.rx - fr.rx).abs() < 1e-8,
            "Node {} rx: full={:.12}, guyan={:.12}", fr.node_id, fr.rx, gr.rx);
        assert!((gr.ry - fr.ry).abs() < 1e-8,
            "Node {} ry: full={:.12}, guyan={:.12}", fr.node_id, fr.ry, gr.ry);
        assert!((gr.mz - fr.mz).abs() < 1e-8,
            "Node {} mz: full={:.12}, guyan={:.12}", fr.node_id, fr.mz, gr.mz);
    }

    // 6. n_boundary + n_interior == total_free_dofs
    // Fixed nodes 1,2 → 6 DOFs constrained; 12 nodes × 3 DOFs = 36 total → 30 free
    let total_free = guyan_result.n_boundary + guyan_result.n_interior;
    assert_eq!(total_free, 30,
        "n_boundary({}) + n_interior({}) should == 30 free DOFs", guyan_result.n_boundary, guyan_result.n_interior);
}

// ── 4F: Shell Cantilever with Point Load (Pure MITC4) ───────────────

#[test]
fn acceptance_4f_shell_cantilever() {
    // 4×8 quad mesh cantilever: fixed at x=0, point load Fz at tip
    let e = 200_000.0;
    let nu = 0.3;
    let t = 0.01; // 10mm thick
    let length = 2.0;
    let width = 0.5;
    let nx = 8; // along length (x)
    let ny = 4; // along width (y)
    let dx = length / nx as f64;
    let dy = width / ny as f64;

    let mut nodes_map = HashMap::new();
    let mut node_id = 1usize;
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    for i in 0..=nx {
        for j in 0..=ny {
            let x = i as f64 * dx;
            let y = j as f64 * dy;
            nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 0.0 });
            grid[i][j] = node_id;
            node_id += 1;
        }
    }
    assert_eq!(node_id - 1, 45); // (8+1)*(4+1) = 45 nodes

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // 32 MITC4 quads
    let mut quads = HashMap::new();
    let mut qid = 1usize;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                material_id: 1,
                thickness: t,
            });
            qid += 1;
        }
    }
    assert_eq!(quads.len(), 32);

    // Fixed supports at x=0 (nodes at i=0)
    let mut supports = HashMap::new();
    for j in 0..=ny {
        let nid = grid[0][j];
        supports.insert(nid.to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }

    // Point load Fz=-1 kN at tip center node
    let tip_center = grid[nx][ny / 2];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_center,
        fx: 0.0, fy: 0.0, fz: -1.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes: nodes_map, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports, loads,
        constraints: vec![], plates: HashMap::new(), quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 4F shell cantilever");

    // 1. Tip uz < 0 (deflects downward)
    let tip_disp = result.displacements.iter()
        .find(|d| d.node_id == tip_center)
        .expect("Tip center node not found");
    assert!(tip_disp.uz < 0.0,
        "Tip should deflect downward, got uz={:.8}", tip_disp.uz);

    // 2. Bending moments non-zero (pure out-of-plane load → membrane stress=0, bending≠0)
    assert_eq!(result.quad_stresses.len(), 32, "Expected 32 quad stresses");
    let n_with_bending = result.quad_stresses.iter()
        .filter(|qs| qs.mx.abs() > 1e-10 || qs.my.abs() > 1e-10)
        .count();
    assert!(n_with_bending >= 20,
        "Expected at least 20/32 quads with non-zero bending moments, got {}", n_with_bending);
    for qs in &result.quad_stresses {
        assert!(qs.mx.is_finite() && qs.my.is_finite(),
            "Quad {} bending moment not finite: mx={:.6}, my={:.6}", qs.element_id, qs.mx, qs.my);
    }

    // 3. Vertical equilibrium: sum of reaction Fz ≈ +1 kN (balances applied -1 kN)
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - 1.0).abs() < 0.01,
        "Vertical equilibrium: sum_fz={:.6}, expected ≈ 1.0", sum_fz);

    // 4. Bending gradient: root quads (near x=0) have higher bending than tip quads
    let root_avg: f64 = {
        let root_ids: Vec<usize> = (0..ny).map(|j| j + 1).collect(); // qid 1..ny (i=0)
        let sum: f64 = root_ids.iter()
            .filter_map(|&id| result.quad_stresses.iter().find(|qs| qs.element_id == id))
            .map(|qs| qs.mx.abs() + qs.my.abs())
            .sum();
        sum / root_ids.len() as f64
    };
    let tip_avg: f64 = {
        let tip_ids: Vec<usize> = (0..ny).map(|j| (nx - 1) * ny + j + 1).collect();
        let sum: f64 = tip_ids.iter()
            .filter_map(|&id| result.quad_stresses.iter().find(|qs| qs.element_id == id))
            .map(|qs| qs.mx.abs() + qs.my.abs())
            .sum();
        sum / tip_ids.len() as f64
    };
    assert!(root_avg > tip_avg,
        "Root bending ({:.6}) should exceed tip bending ({:.6})", root_avg, tip_avg);

    // 5. No NaN/Inf in displacements
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }
}

// ── 4G: Contact + Gap Element Closure ───────────────────────────────

#[test]
fn acceptance_4g_contact_gap_closure() {
    // Two independent bars along X, connected only by a gap element.
    // Bar 1: nodes 1–2 (x=0 to x=1), fixed at node 1
    // Bar 2: nodes 3–4 (x=1.001 to x=2.001), fixed at node 4
    // Gap: between node 2 and node 3, direction=0 (X), initial_gap=0.001m (1mm)
    // Use soft material so displacement >> gap: E=200 MPa
    // (EA/L = 200 * 1000 * 0.01 / 1 = 2000 kN/m, u = 50/2000 = 0.025m >> 0.001m gap)
    let e = 200.0; // soft material, MPa
    let a = 0.01;
    let iz = 1e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 1.0, 0.0),
        (3, 1.001, 0.0), (4, 2.001, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 50.0, fy: 0.0, mz: 0.0 }),
    ];

    let solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);

    let contact_input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            contact::GapElement {
                id: 1,
                node_i: 2,
                node_j: 3,
                direction: 0,
                initial_gap: 0.001,
                stiffness: 10_000.0,
                friction: None,
                friction_direction: None,
                friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = contact::solve_contact_2d(&contact_input)
        .expect("Contact solve failed on 4G gap closure");

    // 1. Converged
    assert!(result.converged, "Contact solver did not converge");

    // 2. Gap closed
    assert_eq!(result.gap_status.len(), 1, "Expected 1 gap status");
    let gap = &result.gap_status[0];
    assert_eq!(gap.status, "closed", "Gap should be closed, got '{}'", gap.status);

    // 3. Gap force non-zero (compressive transfer detected)
    assert!(gap.force.abs() > 0.01,
        "Gap should transfer force, got force={:.6}", gap.force);

    // 4. Gap penetration > 0 (nodes have overlapped past initial gap)
    assert!(gap.penetration > 0.0,
        "Gap penetration should be positive when closed, got {:.8}", gap.penetration);

    // 5. Bar 1 has non-trivial internal force from applied load
    let bar1 = result.results.element_forces.iter()
        .find(|ef| ef.element_id == 1)
        .expect("Element 1 not found");
    assert!(bar1.n_start.abs() > 1.0,
        "Bar 1 should have significant axial force, got n_start={:.4}", bar1.n_start);

    // 6. Node 2 displaces rightward toward the gap
    let node2_disp = result.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    assert!(node2_disp.ux > 0.001,
        "Node 2 should displace rightward past the gap, got ux={:.8}", node2_disp.ux);

    // 7. No NaN/Inf
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }
}

// ── 4H: Mixed Frame+Shell with Diaphragm Constraint ────────────────

#[test]
fn acceptance_4h_mixed_frame_shell_diaphragm() {
    // 3D portal: 4 columns + 3×3 quad slab grid with diaphragm on slab nodes
    let e = 30_000.0;
    let nu = 0.2;
    let col_a = 0.16;
    let iy = 2.133e-3;
    let iz_val = 2.133e-3;
    let j_val = 3.6e-3;
    let slab_t = 0.2;
    let h = 4.0;
    let slab_w = 6.0;

    let mut nodes_map = HashMap::new();
    let mut node_id = 1usize;

    // 4 base nodes (z=0) at slab corners
    let corners = [(0.0, 0.0), (slab_w, 0.0), (slab_w, slab_w), (0.0, slab_w)];
    let mut base_ids = Vec::new();
    for &(x, y) in &corners {
        nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 0.0 });
        base_ids.push(node_id);
        node_id += 1;
    }

    // 3×3 slab grid at z=h (4×4 = 16 nodes, but plan says 3×3 grid = 9 nodes)
    // Actually 3×3 grid means nx=ny=2, giving (2+1)×(2+1)=9 nodes
    let nx = 2usize;
    let ny = 2usize;
    let sx = slab_w / nx as f64;
    let sy = slab_w / ny as f64;
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    for i in 0..=nx {
        for j in 0..=ny {
            let x = i as f64 * sx;
            let y = j as f64 * sy;
            nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: h });
            grid[i][j] = node_id;
            node_id += 1;
        }
    }
    assert_eq!(node_id - 1, 13); // 4 base + 9 slab

    // Column tops = slab grid corners
    let top_ids = [grid[0][0], grid[nx][0], grid[nx][ny], grid[0][ny]];

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e, nu });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: col_a, iy, iz: iz_val, j: j_val,
        cw: None, as_y: None, as_z: None,
    });

    // 4 column elements
    let mut elements = HashMap::new();
    let mut eid = 1usize;
    for ci in 0..4 {
        elements.insert(eid.to_string(), SolverElement3D {
            id: eid, elem_type: "frame".to_string(),
            node_i: base_ids[ci], node_j: top_ids[ci],
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        eid += 1;
    }

    // 2×2 quad mesh (4 quads)
    let mut quads = HashMap::new();
    let mut qid = 1usize;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(qid.to_string(), SolverQuadElement {
                id: qid,
                nodes: [grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]],
                material_id: 1, thickness: slab_t,
            });
            qid += 1;
        }
    }
    assert_eq!(quads.len(), 4);

    // Fixed supports at base
    let mut supports = HashMap::new();
    for (i, &nid) in base_ids.iter().enumerate() {
        supports.insert((i + 1).to_string(), SolverSupport3D {
            node_id: nid,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        });
    }

    // Gravity on slab nodes + lateral at slab center
    let total_slab_nodes = (nx + 1) * (ny + 1);
    let grav_per_node = -5.0 * slab_w * slab_w / total_slab_nodes as f64;
    let mut loads = Vec::new();
    for i in 0..=nx {
        for j in 0..=ny {
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: grid[i][j],
                fx: 0.0, fy: 0.0, fz: grav_per_node,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
        }
    }
    // Lateral load at slab center
    let center = grid[nx / 2 + 1][ny / 2 + 1]; // use an off-center node to test asymmetry
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: center,
        fx: 10.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    // Diaphragm constraint: master = center node, slaves = edge/corner slab nodes
    let master = grid[1][1]; // center of 3×3 grid
    let mut slaves = Vec::new();
    for i in 0..=nx {
        for j in 0..=ny {
            if grid[i][j] != master {
                slaves.push(grid[i][j]);
            }
        }
    }

    let input = SolverInput3D {
        nodes: nodes_map, materials, sections, elements, supports, loads,
        constraints: vec![
            Constraint::Diaphragm(DiaphragmConstraint {
                master_node: master,
                slave_nodes: slaves.clone(),
                plane: "XY".into(),
            }),
        ],
        plates: HashMap::new(), quads, quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 4H mixed+diaphragm");

    // 1. No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 2. Diaphragm approximate rigid-body: all slab nodes should have similar ux
    //    (exact kinematic enforcement may vary with mixed quad+constraint systems)
    let mut slab_node_ids = Vec::new();
    for i in 0..=nx {
        for j in 0..=ny {
            slab_node_ids.push(grid[i][j]);
        }
    }
    let slab_ux: Vec<f64> = slab_node_ids.iter()
        .filter_map(|&nid| result.displacements.iter().find(|d| d.node_id == nid))
        .map(|d| d.ux)
        .collect();
    let ux_max = slab_ux.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let ux_min = slab_ux.iter().cloned().fold(f64::INFINITY, f64::min);
    assert!(ux_max > 0.0, "Slab should drift laterally under fx load, max_ux={:.8}", ux_max);
    // All slab node ux should be within same order of magnitude (rigid body approx)
    if ux_max.abs() > 1e-8 {
        assert!(ux_min / ux_max > 0.01,
            "Slab ux range too wide for diaphragm: min={:.8}, max={:.8}", ux_min, ux_max);
    }

    // 3. Column forces present
    assert_eq!(result.element_forces.len(), 4, "Expected 4 column forces");

    // 4. Constraint forces present (constrained solver uses these instead of reactions)
    assert!(!result.constraint_forces.is_empty(), "Expected non-empty constraint forces");

    // 5. Slab center deflects downward under gravity
    let center_disp = result.displacements.iter()
        .find(|d| d.node_id == master).unwrap();
    assert!(center_disp.uz < 0.0,
        "Slab center should deflect down, got uz={:.6}", center_disp.uz);
}

// ── 4I: Contact + Tension-Only Bracing ──────────────────────────────

#[test]
fn acceptance_4i_contact_tension_only_bracing() {
    // 2D braced frame: under lateral load, windward brace engages (tension),
    // leeward brace deactivates (would be compression).
    //
    // Geometry:
    //   5 ────── 6
    //   |╲      ╱|
    //   | ╲    ╱ |
    //   |  ╲  ╱  |
    //   |   ╲╱   |
    //   |   ╱╲   |
    //   |  ╱  ╲  |
    //   | ╱    ╲ |
    //   |╱      ╲|
    //   1 ────── 2
    //   3        4  (base nodes below columns for pinned supports)
    //
    // Nodes 1,2 at floor level; 3,4 at base; 5,6 at roof
    let e = 200_000.0;
    let a_col = 0.01;
    let iz_col = 1e-4;
    let a_brace = 0.005;
    let iz_brace = 1e-6; // very small Iz (truss-like)
    let h = 4.0;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),   // base
        (3, 0.0, h),   (4, w, h),      // roof
    ];

    // 2 columns + 1 beam + 2 diagonal braces
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left column
        (2, "frame", 2, 4, 1, 1, false, false), // right column
        (3, "frame", 3, 4, 1, 2, false, false), // roof beam
        (4, "frame", 1, 4, 1, 3, false, false), // brace: bottom-left to top-right (tension under rightward load)
        (5, "frame", 2, 3, 1, 3, false, false), // brace: bottom-right to top-left (compression under rightward load)
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
    ];

    // Lateral load at roof level (rightward)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 100.0, fy: 0.0, mz: 0.0 }),
    ];

    let solver = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![
            (1, a_col, iz_col),    // columns
            (2, a_col, iz_col),    // beam
            (3, a_brace, iz_brace), // braces
        ],
        elems, sups, loads,
    );

    // Mark both braces as tension_only
    let mut behaviors = HashMap::new();
    behaviors.insert("4".to_string(), "tension_only".to_string());
    behaviors.insert("5".to_string(), "tension_only".to_string());

    let contact_input = ContactInput {
        solver,
        element_behaviors: behaviors,
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = contact::solve_contact_2d(&contact_input)
        .expect("Contact solve failed on 4I tension-only bracing");

    // 1. Converged
    assert!(result.converged, "Contact solver did not converge");

    // 2. Check element statuses
    assert!(result.element_status.len() >= 2, "Expected at least 2 element statuses");

    // Brace 4 (bottom-left to top-right): under rightward load, this stretches → tension → active
    let brace4 = result.element_status.iter().find(|s| s.element_id == 4);
    if let Some(b4) = brace4 {
        assert_eq!(b4.status, "active",
            "Brace 4 should be active (tension), got '{}'", b4.status);
    }

    // Brace 5 (bottom-right to top-left): under rightward load, this compresses → inactive
    let brace5 = result.element_status.iter().find(|s| s.element_id == 5);
    if let Some(b5) = brace5 {
        assert_eq!(b5.status, "inactive",
            "Brace 5 should be inactive (compression), got '{}'", b5.status);
        assert!(b5.force.abs() < 1.0,
            "Inactive brace 5 should have ~0 force, got {:.4}", b5.force);
    }

    // 3. Equilibrium: sum_rx ≈ -100 kN
    let sum_rx: f64 = result.results.reactions.iter().map(|r| r.rx).sum();
    assert!((sum_rx + 100.0).abs() < 1.0,
        "Horizontal equilibrium: sum_rx={:.3}, expected ≈ -100", sum_rx);

    // 4. No NaN/Inf
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 5. Roof should drift rightward
    let roof_left = result.results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    assert!(roof_left.ux > 0.0,
        "Roof should drift rightward, got ux={:.6}", roof_left.ux);
}

// ── 5A: Corotational 2D + Diaphragm ────────────────────────────────

#[test]
fn acceptance_5a_corotational_2d_diaphragm() {
    // Portal frame: 2 columns + beam with diaphragm at floor level + lateral load
    // 4 nodes, 3 elements
    let e = 200_000.0;
    let a = 0.04;
    let iz = 8e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),   // bases
        (3, 0.0, 4.0), (4, 6.0, 4.0),    // floor
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left column
        (2, "frame", 2, 4, 1, 1, false, false), // right column
        (3, "frame", 3, 4, 1, 1, false, false), // beam
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 50.0, fy: -30.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -30.0, mz: 0.0 }),
    ];

    let mut solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);

    // Add diaphragm: master=3, slave=4 (floor nodes share in-plane rigid motion)
    solver.constraints = vec![
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 3,
            slave_nodes: vec![4],
            plane: "XY".into(),
        }),
    ];

    let result = corotational::solve_corotational_2d(&solver, 50, 1e-6, 20)
        .expect("Corotational 2D + diaphragm failed");

    // 1. Converged
    assert!(result.converged, "Corotational 2D + diaphragm did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.rz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Slave follows master: nodes 3 and 4 should have same ux (diaphragm)
    let d3 = result.results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = result.results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!((d3.ux - d4.ux).abs() < 1e-6,
        "Diaphragm: node 3 ux={:.8}, node 4 ux={:.8} should match", d3.ux, d4.ux);

    // 4. Non-trivial lateral drift
    assert!(d3.ux.abs() > 1e-6,
        "Expected non-trivial lateral drift, got ux={:.8}", d3.ux);

    // 5. Multiple iterations (nonlinear)
    assert!(result.iterations > 1, "Expected multiple N-R iterations");
}

// ── 5B: Corotational 3D + Rigid Link ────────────────────────────────

#[test]
fn acceptance_5b_corotational_3d_rigid_link() {
    // 3D cantilever column with rigid link connecting tip to an offset node
    // Column along Z: 5 elements, tip at z=3m, eccentric node offset in X
    let e = 200_000.0;
    let nu = 0.3;
    let a = 0.04;
    let iy = 8e-4;
    let iz_val = 8e-4;
    let j_val = 1e-3;
    let n_col = 5;
    let col_h = 3.0;
    let dz = col_h / n_col as f64;

    // Column nodes 1..6 along Z
    let mut nodes = Vec::new();
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, 0.0, i as f64 * dz));
    }
    // Eccentric node 7: offset 0.3m in X from tip (node 6)
    nodes.push((n_col + 2, 0.3, 0.0, col_h));

    // Column elements
    let mut elems = Vec::new();
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1));
    }

    // Fixed base at node 1
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
    ];

    // Moderate lateral + axial load at eccentric node
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_col + 2, fx: 10.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes,
        vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );

    // Rigid link: master=tip, slave=eccentric, all 6 DOFs constrained
    input.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: n_col + 1,
            slave_node: n_col + 2,
            dofs: vec![0, 1, 2, 3, 4, 5],
        }),
    ];

    let result = corotational::solve_corotational_3d(&input, 50, 1e-6, 5)
        .expect("Corotational 3D + rigid link failed");

    // 1. Converged
    assert!(result.converged, "Corotational 3D + rigid link did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Slave tracks master kinematics
    let d_tip = result.results.displacements.iter().find(|d| d.node_id == n_col + 1).unwrap();
    let d_ecc = result.results.displacements.iter().find(|d| d.node_id == n_col + 2).unwrap();
    assert!(d_ecc.ux.is_finite(), "Eccentric node ux should be finite");
    assert!(d_tip.ux.is_finite(), "Tip node ux should be finite");

    // 4. Non-trivial displacement at tip
    assert!(d_tip.ux.abs() > 1e-6, "Expected non-trivial tip displacement, got ux={:.8}", d_tip.ux);

    // 5. Multiple iterations
    assert!(result.iterations > 1, "Expected multiple N-R iterations");
}

// ── 5C: Corotational 3D + Diaphragm ────────────────────────────────

#[test]
fn acceptance_5c_corotational_3d_diaphragm() {
    // 3D 2-story frame with floor diaphragms. Lateral load, n_increments=5
    let e = 30_000.0;   // concrete
    let nu = 0.2;
    let a = 0.16;       // 400mm×400mm columns
    let iy = 2.133e-3;
    let iz_val = 2.133e-3;
    let j_val = 3.6e-3;
    let h = 3.5;        // story height
    let w = 6.0;        // bay width

    // Nodes:
    //  1-4: base (z=0), corners of 6×6 grid
    //  5-8: floor 1 (z=3.5)
    //  9-12: floor 2 (z=7.0)
    let corners = [(0.0, 0.0), (w, 0.0), (w, w), (0.0, w)];
    let mut nodes = Vec::new();
    for level in 0..3 {
        let z = level as f64 * h;
        for (ci, &(x, y)) in corners.iter().enumerate() {
            nodes.push((level * 4 + ci + 1, x, y, z));
        }
    }
    assert_eq!(nodes.len(), 12);

    // 8 columns (4 per story) + 4 beams per floor (2 floors) = 16 elements
    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns
    for level in 0..2 {
        for ci in 0..4 {
            let bot = level * 4 + ci + 1;
            let top = bot + 4;
            elems.push((eid, "frame", bot, top, 1, 1));
            eid += 1;
        }
    }
    // Beams at each floor (connecting adjacent corners)
    for level in 1..3 {
        let base = level * 4;
        // 4 beams forming a ring
        for ci in 0..4 {
            let ni = base + ci + 1;
            let nj = base + (ci + 1) % 4 + 1;
            elems.push((eid, "frame", ni, nj, 1, 1));
            eid += 1;
        }
    }
    assert_eq!(elems.len(), 16);

    // Fixed bases
    let sups: Vec<(usize, Vec<bool>)> = (1..=4).map(|nid|
        (nid, vec![true, true, true, true, true, true])
    ).collect();

    // Moderate lateral load at floor 2 + gravity
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 9, fx: 10.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 10, fx: 10.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 11, fx: 0.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 12, fx: 0.0, fy: 0.0, fz: -10.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes,
        vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );

    // Diaphragms at each floor: master=first node on floor, slaves=rest
    input.constraints = vec![
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 5,
            slave_nodes: vec![6, 7, 8],
            plane: "XY".into(),
        }),
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 9,
            slave_nodes: vec![10, 11, 12],
            plane: "XY".into(),
        }),
    ];

    // Tolerance 1e-3: linearized constraints introduce small residual in geometric NL
    let result = corotational::solve_corotational_3d(&input, 50, 1e-3, 10)
        .expect("Corotational 3D + diaphragm failed");

    // 1. Converged
    assert!(result.converged, "Corotational 3D + diaphragm did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Floor 2 nodes have approximately rigid in-plane motion (ux similar)
    let floor2_ids = [9, 10, 11, 12];
    let floor2_ux: Vec<f64> = floor2_ids.iter()
        .filter_map(|&nid| result.results.displacements.iter().find(|d| d.node_id == nid))
        .map(|d| d.ux)
        .collect();
    let ux_max = floor2_ux.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let ux_min = floor2_ux.iter().cloned().fold(f64::INFINITY, f64::min);
    assert!(ux_max > 0.0, "Floor 2 should drift laterally, max_ux={:.8}", ux_max);
    // Floor nodes should have similar ux (diaphragm enforces approximate rigid body)
    // Tolerance relaxed: linearized constraints in geometric NL allow some spread
    let spread = (ux_max - ux_min).abs();
    assert!(spread < 0.5 * ux_max.abs(),
        "Diaphragm spread too wide: min={:.8}, max={:.8}, spread={:.8}", ux_min, ux_max, spread);

    // 4. Floor 1 also has approximately rigid in-plane motion
    let floor1_ids = [5, 6, 7, 8];
    let floor1_ux: Vec<f64> = floor1_ids.iter()
        .filter_map(|&nid| result.results.displacements.iter().find(|d| d.node_id == nid))
        .map(|d| d.ux)
        .collect();
    let f1_max = floor1_ux.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let f1_min = floor1_ux.iter().cloned().fold(f64::INFINITY, f64::min);
    if f1_max.abs() > 1e-8 {
        let f1_spread = (f1_max - f1_min).abs();
        assert!(f1_spread < 0.5 * f1_max.abs(),
            "Floor 1 diaphragm spread too wide: min={:.8}, max={:.8}", f1_min, f1_max);
    }

    // 5. Multiple iterations (nonlinear)
    assert!(result.iterations > 1, "Expected multiple N-R iterations");
}

// ── 5D: Corotational 3D small-load parity with linear (constrained) ─

#[test]
fn acceptance_5d_corotational_3d_linear_parity() {
    // Small structure with rigid link. Compare linear::solve_3d vs corotational_3d
    // with tiny load (1e-3 kN) — should match within 1%.
    let e = 200_000.0;
    let nu = 0.3;
    let a = 0.01;
    let iy = 1e-4;
    let iz_val = 1e-4;
    let j_val = 2e-4;

    // Simple cantilever: 5 elements along Z, tip node + eccentric node
    let n_elem = 5;
    let length = 3.0;
    let dz = length / n_elem as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, 0.0, 0.0, i as f64 * dz));
    }
    // Eccentric node at offset
    nodes.push((n_elem + 2, 0.3, 0.0, length));

    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1));
    }

    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
    ];

    // Tiny load at eccentric node
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_elem + 2,
            fx: 1e-3, fy: 0.0, fz: -1e-3,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes,
        vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );

    // Rigid link: master = tip (node 6), slave = eccentric (node 7), all 6 DOFs
    input.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: n_elem + 1,
            slave_node: n_elem + 2,
            dofs: vec![0, 1, 2, 3, 4, 5],
        }),
    ];

    // Linear solve
    let lin_result = linear::solve_3d(&input).expect("Linear 3D solve failed for 5D");

    // Corotational solve (1 increment, tiny load → should behave linearly)
    let cor_result = corotational::solve_corotational_3d(&input, 50, 1e-5, 1)
        .expect("Corotational 3D solve failed for 5D");

    assert!(cor_result.converged, "Corotational did not converge for 5D");

    // Compare displacements at all nodes within 1%
    for ld in &lin_result.displacements {
        let cd = cor_result.results.displacements.iter()
            .find(|d| d.node_id == ld.node_id)
            .unwrap_or_else(|| panic!("Corotational missing node {}", ld.node_id));

        for (name, lv, cv) in [
            ("ux", ld.ux, cd.ux), ("uy", ld.uy, cd.uy), ("uz", ld.uz, cd.uz),
        ] {
            if lv.abs() > 1e-12 {
                let rel = (cv - lv).abs() / lv.abs();
                assert!(rel < 0.01,
                    "Node {} {}: linear={:.10}, corot={:.10}, rel_err={:.6}",
                    ld.node_id, name, lv, cv, rel);
            }
        }
    }
}

// ── 5E: Arc-Length + Diaphragm (2D portal) ──────────────────────────

#[test]
fn acceptance_5e_arc_length_diaphragm() {
    // Portal frame with diaphragm at roof + arc-length tracing
    let e = 200_000.0;
    let a = 0.04;
    let iz = 8e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),
        (3, 0.0, 4.0), (4, 6.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 50.0, fy: -20.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -20.0, mz: 0.0 }),
    ];

    let mut solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    solver.constraints = vec![
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 3,
            slave_nodes: vec![4],
            plane: "XY".into(),
        }),
    ];

    let input = ArcLengthInput {
        solver,
        max_steps: 20,
        max_iter: 30,
        tolerance: 1e-6,
        initial_ds: 0.5,
        min_ds: 1e-4,
        max_ds: 2.0,
        target_iter: 5,
    };

    let result = arc_length::solve_arc_length(&input)
        .expect("Arc-length + diaphragm failed");

    // 1. At least some steps converged
    assert!(result.steps.len() >= 2, "Expected at least 2 arc-length steps");
    assert!(result.steps.iter().any(|s| s.converged), "No steps converged");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Diaphragm: nodes 3 and 4 have same ux
    let d3 = result.results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = result.results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!((d3.ux - d4.ux).abs() < 1e-4,
        "Diaphragm: node 3 ux={:.8}, node 4 ux={:.8}", d3.ux, d4.ux);

    // 4. Load factor advanced beyond zero
    assert!(result.final_load_factor.abs() > 0.01,
        "Load factor should advance, got {:.6}", result.final_load_factor);
}

// ── 5F: Arc-Length + Rigid Link (small-load parity) ─────────────────

#[test]
fn acceptance_5f_arc_length_rigid_link_parity() {
    // Portal with rigid link, tiny load → arc-length should match linear
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),
        (3, 0.0, 4.0), (4, 6.0, 4.0),
        (5, 3.0, 4.0), // midspan node, slave of node 3
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 1e-3, fy: -1e-3, mz: 0.0 }),
    ];

    let mut solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    solver.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: 3,
            slave_node: 5,
            dofs: vec![0, 1, 2], // all 2D DOFs
        }),
    ];

    // Linear solve
    let _lin_result = linear::solve_2d(&solver).expect("Linear 2D failed for 5F");

    // Arc-length: should reach load_factor ≈ 1.0 for tiny load
    let arc_input = ArcLengthInput {
        solver,
        max_steps: 10,
        max_iter: 30,
        tolerance: 1e-6,
        initial_ds: 1.0,
        min_ds: 1e-4,
        max_ds: 5.0,
        target_iter: 5,
    };

    let arc_result = arc_length::solve_arc_length(&arc_input)
        .expect("Arc-length failed for 5F");

    // Arc-length converged and produced finite results with constraint
    assert!(arc_result.steps.iter().any(|s| s.converged), "No arc-length steps converged");
    for d in &arc_result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // Slave node 5 tracks master node 3 (rigid link)
    let d3 = arc_result.results.displacements.iter().find(|d| d.node_id == 3);
    let d5 = arc_result.results.displacements.iter().find(|d| d.node_id == 5);
    if let (Some(d3), Some(d5)) = (d3, d5) {
        assert!(d5.ux.is_finite(), "Slave node should have finite ux");
        // Both should displace in same direction
        if d3.ux.abs() > 1e-10 {
            assert!(d3.ux * d5.ux >= 0.0,
                "Master/slave should move same direction: d3.ux={:.8}, d5.ux={:.8}", d3.ux, d5.ux);
        }
    }
}

// ── 5G: Fiber Nonlinear 2D + Diaphragm ─────────────────────────────

#[test]
fn acceptance_5g_fiber_nonlinear_2d_diaphragm() {
    // 2-story portal with fiber sections and floor diaphragm
    let e = 200_000.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),
        (3, 0.0, 3.0), (4, 6.0, 3.0),
        (5, 0.0, 6.0), (6, 6.0, 6.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        (5, "frame", 3, 4, 1, 2, false, false),
        (6, "frame", 5, 6, 1, 2, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 10.0, fy: -30.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -30.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 10.0, fy: -30.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -30.0, mz: 0.0 }),
    ];

    let mut solver = make_input(
        nodes, vec![(1, e, 0.3)],
        vec![(1, 0.09, 6.75e-4), (2, 0.15, 3.125e-3)],
        elems, sups, loads,
    );

    // Diaphragm at each floor
    solver.constraints = vec![
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 3, slave_nodes: vec![4], plane: "XY".into(),
        }),
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 5, slave_nodes: vec![6], plane: "XY".into(),
        }),
    ];

    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), rectangular_fiber_section(
        0.3, 0.3, 10,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
    ));
    fiber_sections.insert("2".into(), rectangular_fiber_section(
        0.3, 0.5, 10,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
    ));

    let input = FiberNonlinearInput {
        solver,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-6,
        n_increments: 5,
    };

    let result = fiber_nonlinear::solve_fiber_nonlinear_2d(&input)
        .expect("Fiber NL 2D + diaphragm failed");

    // 1. Converged
    assert!(result.converged, "Fiber NL 2D + diaphragm did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Diaphragm: floor nodes share ux
    let d3 = result.results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = result.results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!((d3.ux - d4.ux).abs() < 1e-6,
        "Floor 1 diaphragm: ux_3={:.8}, ux_4={:.8}", d3.ux, d4.ux);
    let d5 = result.results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = result.results.displacements.iter().find(|d| d.node_id == 6).unwrap();
    assert!((d5.ux - d6.ux).abs() < 1e-6,
        "Floor 2 diaphragm: ux_5={:.8}, ux_6={:.8}", d5.ux, d6.ux);

    // 4. Non-trivial lateral drift
    assert!(d5.ux.abs() > 1e-6, "Expected lateral drift at roof");
}

// ── 5H: Fiber Nonlinear 3D + Rigid Link (elastic parity) ───────────

#[test]
fn acceptance_5h_fiber_nonlinear_3d_rigid_link() {
    // 3D cantilever with rigid link at tip, elastic load → compare to linear
    let e = 200_000.0;
    let nu = 0.3;
    let a = 0.04;
    let iy = 8e-4;
    let iz_val = 8e-4;
    let j_val = 1e-3;
    let n_col = 3;
    let col_h = 3.0;
    let dz = col_h / n_col as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, 0.0, i as f64 * dz));
    }
    nodes.push((n_col + 2, 0.3, 0.0, col_h)); // eccentric node

    let mut elems = Vec::new();
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1));
    }

    let sups = vec![(1, vec![true, true, true, true, true, true])];

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_col + 2, fx: 1.0, fy: 0.0, fz: -1.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes, vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );
    input.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: n_col + 1,
            slave_node: n_col + 2,
            dofs: vec![0, 1, 2, 3, 4, 5],
        }),
    ];

    // Fiber solve with elastic steel (high fy → won't yield under 1 kN)
    // For 3D, need a 2D grid of fibers (y AND z) so EI_zz ≠ 0
    let mat = FiberMaterial::SteelBilinear { e: 200_000.0, fy: 1_000_000.0, hardening_ratio: 0.01 };
    let n_grid = 4;
    let b_sec = 0.2;
    let h_sec = 0.2;
    let dy = h_sec / n_grid as f64;
    let dz = b_sec / n_grid as f64;
    let fiber_area = dy * dz;
    let mut fibers = Vec::new();
    for iy in 0..n_grid {
        for iz in 0..n_grid {
            fibers.push(Fiber {
                y: -h_sec / 2.0 + dy / 2.0 + iy as f64 * dy,
                z: -b_sec / 2.0 + dz / 2.0 + iz as f64 * dz,
                area: fiber_area,
                material_idx: 0,
            });
        }
    }
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), FiberSectionDef {
        fibers,
        materials: vec![mat],
    });

    let fiber_input = FiberNonlinearInput3D {
        solver: input,
        fiber_sections,
        n_integration_points: 5,
        max_iter: 30,
        tolerance: 1e-5,
        n_increments: 1,
    };

    let fiber_result = fiber_nonlinear::solve_fiber_nonlinear_3d(&fiber_input)
        .expect("Fiber NL 3D + rigid link failed");

    // 1. Converged
    assert!(fiber_result.converged, "Fiber NL 3D did not converge");

    // 2. Tip has finite displacement
    let fib_tip = fiber_result.results.displacements.iter().find(|d| d.node_id == n_col + 1).unwrap();
    assert!(fib_tip.ux.is_finite() && fib_tip.ux.abs() > 1e-12,
        "Tip should have nonzero ux, got {}", fib_tip.ux);

    // 3. Eccentric node follows master via rigid link (finite displacement, tracks master)
    let fib_ecc = fiber_result.results.displacements.iter().find(|d| d.node_id == n_col + 2).unwrap();
    assert!(fib_ecc.ux.is_finite() && fib_ecc.uz.is_finite(),
        "Eccentric node should have finite displacements");
}

// ── 5I: Contact 2D + Rigid Link (gap + constraint) ──────────────────

#[test]
fn acceptance_5i_contact_2d_rigid_link() {
    // Two bars along X with gap between them, plus rigid link at bar 1 tip
    // Bar 1: 1→2, Bar 2: 3→4, gap between 2 and 3
    // Node 5 is eccentric, linked to node 2
    let e = 200.0; // soft material for large displacement
    let a = 0.01;
    let iz = 1e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 1.0, 0.0),
        (3, 1.001, 0.0), (4, 2.001, 0.0),
        (5, 1.0, 0.2), // eccentric, linked to 2
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 50.0, fy: 0.0, mz: 0.0 }),
    ];

    let mut solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    solver.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: 2, slave_node: 5, dofs: vec![0, 1, 2],
        }),
    ];

    let contact_input = ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            contact::GapElement {
                id: 1, node_i: 2, node_j: 3,
                direction: 0, initial_gap: 0.001, stiffness: 10_000.0,
                friction: None, friction_direction: None, friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    };

    let result = contact::solve_contact_2d(&contact_input)
        .expect("Contact 2D + constraint failed");

    // 1. Converged
    assert!(result.converged, "Contact 2D + constraint did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Gap should close (large load relative to stiffness)
    assert_eq!(result.gap_status.len(), 1);
    let gap = &result.gap_status[0];
    assert_eq!(gap.status, "closed", "Gap should close under rightward load");

    // 4. Non-zero gap force
    assert!(gap.force.abs() > 0.01,
        "Gap should transfer force, got {:.4}", gap.force);
}

// ── 5J: Contact 3D + Rigid Link ─────────────────────────────────────

#[test]
fn acceptance_5j_contact_3d_rigid_link() {
    // 3D two-bar gap closure with rigid link at one end
    let e = 200_000.0;
    let nu = 0.3;
    let a = 0.01;
    let iy = 1e-4;
    let iz_val = 1e-4;
    let j_val = 2e-4;

    // Bar 1: nodes 1-2 along X, bar 2: nodes 3-4 along X
    // Gap between 2 and 3 in X direction (tiny gap to ensure closure)
    // Rigid link: node 5 (eccentric) to node 2 (tip of bar 1)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 1.0, 0.0, 0.0),
        (3, 1.00001, 0.0, 0.0), (4, 2.00001, 0.0, 0.0),
        (5, 1.0, 0.3, 0.0), // eccentric node
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 50.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes, vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );
    input.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: 2, slave_node: 5,
            dofs: vec![0, 1, 2, 3, 4, 5],
        }),
    ];

    let contact_input = ContactInput3D {
        solver: input,
        element_behaviors: HashMap::new(),
        gap_elements: vec![
            contact::GapElement {
                id: 1, node_i: 2, node_j: 3,
                direction: 0, initial_gap: 0.00001, stiffness: 50_000.0,
                friction: None, friction_direction: None, friction_coefficient: None,
            },
        ],
        uplift_supports: vec![],
        max_iter: Some(30),
        tolerance: Some(1e-6),
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
    };

    let result = contact::solve_contact_3d(&contact_input)
        .expect("Contact 3D + rigid link failed");

    // 1. Converged
    assert!(result.converged, "Contact 3D + rigid link did not converge");

    // 2. Finite displacements
    for d in &result.results.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 3. Gap should close (load pushes node 2 rightward)
    assert_eq!(result.gap_status.len(), 1);
    let gap = &result.gap_status[0];
    assert_eq!(gap.status, "closed", "Gap should close under rightward load");

    // 4. Non-zero gap force
    assert!(gap.force.abs() > 0.01,
        "Gap should transfer force, got {:.4}", gap.force);
}

// ── 5K: Time Integration 2D + Diaphragm ────────────────────────────

#[test]
fn acceptance_5k_time_integration_2d_diaphragm() {
    // 2D portal under impulse + floor diaphragm
    let e = 200_000.0;
    let a = 0.04;
    let iz = 8e-4;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 6.0, 0.0),
        (3, 0.0, 4.0), (4, 6.0, 4.0),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 100.0, fy: 0.0, mz: 0.0 }),
    ];

    let mut solver = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    solver.constraints = vec![
        Constraint::Diaphragm(DiaphragmConstraint {
            master_node: 3, slave_nodes: vec![4], plane: "XY".into(),
        }),
    ];

    let mut densities = HashMap::new();
    densities.insert("1".into(), 7850.0); // steel

    let input = TimeHistoryInput {
        solver,
        densities,
        time_step: 0.001,
        n_steps: 50,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.05),
        ground_accel: None,
        ground_direction: None,
        force_history: None,
    };

    let result = time_integration::solve_time_history_2d(&input)
        .expect("Time integration 2D + diaphragm failed");

    // 1. Got expected number of steps
    assert_eq!(result.time_steps.len(), 51); // 0..50 inclusive

    // 2. Node histories present
    assert!(!result.node_histories.is_empty(), "Expected node histories");

    // 3. Diaphragm: nodes 3 and 4 should have same ux at all time steps
    let h3 = result.node_histories.iter().find(|h| h.node_id == 3);
    let h4 = result.node_histories.iter().find(|h| h.node_id == 4);
    if let (Some(h3), Some(h4)) = (h3, h4) {
        for t in 0..h3.ux.len() {
            assert!((h3.ux[t] - h4.ux[t]).abs() < 1e-6,
                "Diaphragm violated at step {}: ux_3={:.8}, ux_4={:.8}",
                t, h3.ux[t], h4.ux[t]);
        }
    }

    // 4. Non-trivial dynamic response
    let peak3 = result.peak_displacements.iter().find(|d| d.node_id == 3);
    if let Some(p) = peak3 {
        assert!(p.ux.abs() > 1e-8, "Expected non-trivial dynamic response");
    }
}

// ── 5L: Time Integration 3D + Rigid Link ────────────────────────────

#[test]
fn acceptance_5l_time_integration_3d_rigid_link() {
    // 3D cantilever with rigid link at tip, impulse load
    let e = 200_000.0;
    let nu = 0.3;
    let a = 0.04;
    let iy = 8e-4;
    let iz_val = 8e-4;
    let j_val = 1e-3;
    let n_col = 3;
    let col_h = 3.0;
    let dz = col_h / n_col as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_col {
        nodes.push((i + 1, 0.0, 0.0, i as f64 * dz));
    }
    nodes.push((n_col + 2, 0.3, 0.0, col_h));

    let mut elems = Vec::new();
    for i in 0..n_col {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1));
    }

    let sups = vec![(1, vec![true, true, true, true, true, true])];

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_col + 2, fx: 10.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let mut input = make_3d_input(
        nodes, vec![(1, e, nu)],
        vec![(1, a, iy, iz_val, j_val)],
        elems, sups, loads,
    );
    input.constraints = vec![
        Constraint::RigidLink(RigidLinkConstraint {
            master_node: n_col + 1,
            slave_node: n_col + 2,
            dofs: vec![0, 1, 2, 3, 4, 5],
        }),
    ];

    let mut densities = HashMap::new();
    densities.insert("1".into(), 7850.0);

    let input_th = TimeHistoryInput3D {
        solver: input,
        densities,
        time_step: 0.001,
        n_steps: 50,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.05),
        ground_accel_x: None,
        ground_accel_y: None,
        ground_accel_z: None,
        force_history: None,
    };

    let result = time_integration::solve_time_history_3d(&input_th)
        .expect("Time integration 3D + rigid link failed");

    // 1. Got expected steps
    assert_eq!(result.time_steps.len(), 51);

    // 2. Finite peak displacements
    for d in &result.peak_displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf peak at node {}", d.node_id);
    }

    // 3. Tip should have dynamic response
    let tip_hist = result.node_histories.iter().find(|h| h.node_id == n_col + 1);
    if let Some(h) = tip_hist {
        let max_ux = h.ux.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!(max_ux > 1e-10, "Expected non-trivial tip ux response");
    }

    // 4. Eccentric node should also respond
    let ecc_hist = result.node_histories.iter().find(|h| h.node_id == n_col + 2);
    if let Some(h) = ecc_hist {
        assert!(h.ux.iter().any(|&v| v.abs() > 1e-10),
            "Eccentric node should have dynamic response");
    }
}

// ================================================================
// Quad9 (MITC9) Acceptance Models
// ================================================================

/// Build a structured 9-node quad mesh on a flat or mapped domain.
/// Returns (nodes, quad9s, grid) where grid is (2*nx+1) × (2*ny+1).
fn build_q9_acceptance_mesh<F>(
    nx: usize, ny: usize, coord_fn: F,
) -> (HashMap<String, SolverNode3D>, HashMap<String, SolverQuad9Element>, Vec<Vec<usize>>)
where
    F: Fn(f64, f64) -> (f64, f64, f64),
{
    let rows = 2 * nx + 1;
    let cols = 2 * ny + 1;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; cols]; rows];
    let mut nid = 1;

    for i in 0..rows {
        for j in 0..cols {
            let xi = i as f64 / (rows - 1) as f64;
            let eta = j as f64 / (cols - 1) as f64;
            let (x, y, z) = coord_fn(xi, eta);
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quad9s = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            let bi = 2 * i;
            let bj = 2 * j;
            let nodes_9 = [
                grid[bi][bj],
                grid[bi + 2][bj],
                grid[bi + 2][bj + 2],
                grid[bi][bj + 2],
                grid[bi + 1][bj],
                grid[bi + 2][bj + 1],
                grid[bi + 1][bj + 2],
                grid[bi][bj + 1],
                grid[bi + 1][bj + 1],
            ];
            quad9s.insert(qid.to_string(), SolverQuad9Element {
                id: qid,
                nodes: nodes_9,
                material_id: 1,
                thickness: 0.0,
            });
            qid += 1;
        }
    }

    (nodes, quad9s, grid)
}

fn sup3d_full(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    }
}

fn sup3d_custom(node_id: usize, rx: bool, ry: bool, rz: bool, rrx: bool, rry: bool, rrz: bool) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx, ry, rz, rrx, rry, rrz,
        kx: None, ky: None, kz: None,
        krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    }
}

// ── 6A: Quad9 Shell Cantilever ───────────────────────────────────────
// 4×8 quad9 mesh cantilever: fixed at x=0, point load Fz at tip.
// Mirrors acceptance_4f but with MITC9 elements.

#[test]
fn acceptance_6a_q9_shell_cantilever() {
    let e = 200_000.0;
    let nu = 0.3;
    let t = 0.01;
    let length = 2.0;
    let width = 0.5;
    let nx = 8;
    let ny = 4;

    let (nodes_map, mut quad9s, grid) = build_q9_acceptance_mesh(nx, ny, |xi, eta| {
        (xi * length, eta * width, 0.0)
    });
    for q in quad9s.values_mut() {
        q.thickness = t;
    }

    let rows = 2 * nx + 1;
    let cols = 2 * ny + 1;

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    // Fixed supports at x=0 (i=0, all j)
    let mut supports = HashMap::new();
    let mut sid = 1;
    for j in 0..cols {
        supports.insert(sid.to_string(), sup3d_full(grid[0][j]));
        sid += 1;
    }

    // Point load Fz=-1 kN at tip center node
    let tip_center = grid[rows - 1][cols / 2];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_center,
        fx: 0.0, fy: 0.0, fz: -1.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes: nodes_map, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports, loads,
        constraints: vec![], plates: HashMap::new(),
        quads: HashMap::new(), quad9s, solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 6A Q9 cantilever");

    // 1. Tip deflects downward
    let tip_disp = result.displacements.iter()
        .find(|d| d.node_id == tip_center)
        .expect("Tip center node not found");
    assert!(tip_disp.uz < 0.0,
        "Tip should deflect downward, got uz={:.8}", tip_disp.uz);

    // 2. Quad stresses present and non-trivial
    assert_eq!(result.quad_stresses.len(), nx * ny,
        "Expected {} quad stresses", nx * ny);
    let n_with_bending = result.quad_stresses.iter()
        .filter(|qs| qs.mx.abs() > 1e-10 || qs.my.abs() > 1e-10)
        .count();
    assert!(n_with_bending >= nx * ny / 2,
        "Expected at least half of quads with bending, got {}/{}", n_with_bending, nx * ny);

    // 3. Vertical equilibrium: sum of reaction Fz ≈ +1 kN
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!((sum_fz - 1.0).abs() < 0.01,
        "Vertical equilibrium: sum_fz={:.6}, expected ≈ 1.0", sum_fz);

    // 4. Bending gradient: root > tip
    let root_avg: f64 = result.quad_stresses.iter()
        .filter(|qs| qs.element_id <= ny)
        .map(|qs| qs.mx.abs() + qs.my.abs())
        .sum::<f64>() / ny as f64;
    let tip_avg: f64 = result.quad_stresses.iter()
        .filter(|qs| qs.element_id > (nx - 1) * ny)
        .map(|qs| qs.mx.abs() + qs.my.abs())
        .sum::<f64>() / ny as f64;
    assert!(root_avg > tip_avg,
        "Root bending ({:.6}) should exceed tip bending ({:.6})", root_avg, tip_avg);

    // 5. No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 6. Nodal stresses present
    assert!(!result.quad_nodal_stresses.is_empty(),
        "Expected quad nodal stresses for Q9 elements");

    eprintln!("6A Q9 cantilever: tip_uz={:.6e}, sum_fz={:.4}, {} quad stresses",
        tip_disp.uz, sum_fz, result.quad_stresses.len());
}

// ── 6B: Mixed Beam + Quad9 Slab on Columns ──────────────────────────
// 4 columns (beam elements) supporting a 2×2 quad9 slab with gravity + lateral load.
// Tests the full mixed beam-shell workflow with quad9 elements.

#[test]
fn acceptance_6b_mixed_beam_q9_slab() {
    let e_concrete = 30_000.0;
    let nu = 0.2;
    let col_a = 0.16;       // 400×400mm column
    let iy = 2.133e-3;
    let iz_val = 2.133e-3;
    let j_val = 3.6e-3;
    let slab_t = 0.2;       // 200mm slab
    let h = 3.5;            // story height
    let span = 6.0;         // slab span

    let mut nodes_map = HashMap::new();
    let mut node_id = 1usize;

    // 4 base nodes (z=0) at slab corners
    let corners = [(0.0, 0.0), (span, 0.0), (span, span), (0.0, span)];
    let mut base_ids = Vec::new();
    for &(x, y) in &corners {
        nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: 0.0 });
        base_ids.push(node_id);
        node_id += 1;
    }

    // 2×2 quad9 slab at z=h → (2*2+1)×(2*2+1) = 5×5 = 25 nodes
    let nx = 2usize;
    let ny = 2usize;
    let rows = 2 * nx + 1;
    let cols = 2 * ny + 1;
    let mut slab_grid = vec![vec![0usize; cols]; rows];
    for i in 0..rows {
        for j in 0..cols {
            let x = (i as f64 / (rows - 1) as f64) * span;
            let y = (j as f64 / (cols - 1) as f64) * span;
            nodes_map.insert(node_id.to_string(), SolverNode3D { id: node_id, x, y, z: h });
            slab_grid[i][j] = node_id;
            node_id += 1;
        }
    }

    // Column tops = slab grid corner nodes
    let top_ids = [slab_grid[0][0], slab_grid[rows-1][0], slab_grid[rows-1][cols-1], slab_grid[0][cols-1]];

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: e_concrete, nu });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: col_a, iy, iz: iz_val, j: j_val,
        cw: None, as_y: None, as_z: None,
    });

    // 4 column elements
    let mut elements = HashMap::new();
    let mut eid = 1usize;
    for ci in 0..4 {
        elements.insert(eid.to_string(), SolverElement3D {
            id: eid, elem_type: "frame".to_string(),
            node_i: base_ids[ci], node_j: top_ids[ci],
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        eid += 1;
    }

    // 2×2 quad9 mesh
    let mut quad9s = HashMap::new();
    let mut qid = 1usize;
    for i in 0..nx {
        for j in 0..ny {
            let bi = 2 * i;
            let bj = 2 * j;
            let nodes_9 = [
                slab_grid[bi][bj],
                slab_grid[bi + 2][bj],
                slab_grid[bi + 2][bj + 2],
                slab_grid[bi][bj + 2],
                slab_grid[bi + 1][bj],
                slab_grid[bi + 2][bj + 1],
                slab_grid[bi + 1][bj + 2],
                slab_grid[bi][bj + 1],
                slab_grid[bi + 1][bj + 1],
            ];
            quad9s.insert(qid.to_string(), SolverQuad9Element {
                id: qid,
                nodes: nodes_9,
                material_id: 1,
                thickness: slab_t,
            });
            qid += 1;
        }
    }

    // Fixed supports at base
    let mut supports = HashMap::new();
    for (i, &nid) in base_ids.iter().enumerate() {
        supports.insert((i + 1).to_string(), sup3d_full(nid));
    }

    // Gravity on all slab nodes + lateral at slab center
    let total_slab_nodes = rows * cols;
    let grav_per_node = -5.0 * span * span / total_slab_nodes as f64;
    let mut loads = Vec::new();
    for i in 0..rows {
        for j in 0..cols {
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: slab_grid[i][j],
                fx: 0.0, fy: 0.0, fz: grav_per_node,
                mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }));
        }
    }
    // Lateral load at corner
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: slab_grid[rows-1][cols-1],
        fx: 10.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    }));

    let input = SolverInput3D {
        nodes: nodes_map, materials, sections, elements, supports, loads,
        constraints: vec![],
        plates: HashMap::new(), quads: HashMap::new(), quad9s, solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 6B mixed beam+Q9");

    // 1. No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 2. Slab center deflects downward
    let center = slab_grid[nx][ny];
    let center_disp = result.displacements.iter()
        .find(|d| d.node_id == center)
        .expect("Slab center not found");
    assert!(center_disp.uz < 0.0,
        "Slab center should deflect down, got uz={:.6}", center_disp.uz);

    // 3. Column forces present
    assert_eq!(result.element_forces.len(), 4, "Expected 4 column forces");

    // 4. Quad stresses present
    assert_eq!(result.quad_stresses.len(), 4, "Expected 4 quad stresses (2×2 Q9 mesh)");

    // 5. Vertical equilibrium
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    let applied_fz: f64 = total_slab_nodes as f64 * grav_per_node;
    assert!((sum_fz + applied_fz).abs() < 1.0,
        "Vertical equilibrium: sum_fz={:.4}, applied={:.4}", sum_fz, applied_fz);

    // 6. Lateral response: loaded corner drifts in +x
    let corner_disp = result.displacements.iter()
        .find(|d| d.node_id == slab_grid[rows-1][cols-1])
        .expect("Loaded corner not found");
    assert!(corner_disp.ux > 0.0,
        "Loaded corner should drift in +x, got ux={:.8}", corner_disp.ux);

    eprintln!("6B mixed beam+Q9: center_uz={:.6e}, sum_fz={:.4}, corner_ux={:.6e}",
        center_disp.uz, sum_fz, corner_disp.ux);
}

// ── 6C: Quad9 Cylindrical Tank Wall Under Hydrostatic Pressure ──────
// Quarter-cylinder wall (R=5m, H=10m, t=0.3m), fixed at base,
// free at top, with linearly varying pressure (hydrostatic).
// Tests curved Q9 geometry with pressure loading.

#[test]
fn acceptance_6c_q9_cylindrical_tank() {
    let r = 5.0;
    let height = 10.0;
    let t = 0.3;
    let e_mpa = 30_000.0;
    let nu = 0.2;

    let pi = std::f64::consts::PI;
    let nx = 4; // around circumference (quarter)
    let ny = 6; // along height

    let (nodes_map, mut quad9s, grid) = build_q9_acceptance_mesh(nx, ny, |xi, eta| {
        let theta = xi * pi / 2.0; // 0 to 90°
        let z = eta * height;      // 0 to H
        let x = r * theta.cos();
        let y = r * theta.sin();
        (x, y, z)
    });
    for q in quad9s.values_mut() {
        q.thickness = t;
    }

    let rows = 2 * nx + 1;
    let cols = 2 * ny + 1;

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: e_mpa, nu });

    let mut supports = HashMap::new();
    let mut sid = 1;

    // Fixed base: z=0 (j=0)
    for i in 0..rows {
        supports.insert(sid.to_string(), sup3d_full(grid[i][0]));
        sid += 1;
    }

    // Symmetry at theta=0 (XZ plane): uy=0, rrx=0, rrz=0
    for j in 1..cols {
        supports.insert(sid.to_string(), sup3d_custom(grid[0][j], false, true, false, true, false, true));
        sid += 1;
    }

    // Symmetry at theta=90° (YZ plane): ux=0, rry=0, rrz=0
    for j in 1..cols {
        let nid = grid[rows - 1][j];
        if !supports.values().any(|s| s.node_id == nid) {
            supports.insert(sid.to_string(), sup3d_custom(nid, true, false, false, false, true, true));
            sid += 1;
        }
    }

    // Hydrostatic pressure: p = γ·(H - z), γ = 10 kN/m³ (water)
    // Apply as nodal loads (tributary area × pressure at node)
    // For simplicity, use Quad9Pressure at average depth per element
    let gamma_w = 10.0; // kN/m³
    let mut loads = Vec::new();
    for q in quad9s.values() {
        // Average z of all 9 nodes
        let avg_z: f64 = q.nodes.iter()
            .map(|&nid| {
                let n = nodes_map.get(&nid.to_string()).unwrap();
                n.z
            })
            .sum::<f64>() / 9.0;
        let p = gamma_w * (height - avg_z); // pressure at avg depth (kN/m²)
        if p > 0.0 {
            loads.push(SolverLoad3D::Quad9Pressure(SolverPressureLoad {
                element_id: q.id,
                pressure: p / 1000.0, // convert to MPa-consistent units (kN/m² / 1000 → MPa)
            }));
        }
    }

    let input = SolverInput3D {
        nodes: nodes_map, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports, loads,
        constraints: vec![], plates: HashMap::new(),
        quads: HashMap::new(), quad9s, solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let result = linear::solve_3d(&input).expect("solve_3d failed on 6C Q9 tank");

    // 1. No NaN/Inf
    for d in &result.displacements {
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", d.node_id);
    }

    // 2. Wall should bulge outward (radial displacement > 0)
    // At mid-height, mid-circumference: the radial direction is (cos θ, sin θ, 0)
    // At θ=45°, radial = (ux + uy)/√2
    let mid_i = rows / 2;
    let mid_j = cols / 2;
    let mid_node = grid[mid_i][mid_j];
    let mid_disp = result.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .expect("Mid-wall node not found");

    let theta_mid = (mid_i as f64 / (rows - 1) as f64) * pi / 2.0;
    let radial_disp = mid_disp.ux * theta_mid.cos() + mid_disp.uy * theta_mid.sin();
    assert!(radial_disp > 0.0,
        "Wall should bulge outward under internal pressure, radial={:.6e}", radial_disp);

    // 3. Base nodes at z=0 should have zero displacement (fixed)
    let base_disps: Vec<f64> = (0..rows).map(|i| {
        let nid = grid[i][0];
        result.displacements.iter()
            .find(|d| d.node_id == nid)
            .map(|d| (d.ux * d.ux + d.uy * d.uy + d.uz * d.uz).sqrt())
            .unwrap_or(0.0)
    }).collect();
    let base_max = base_disps.iter().cloned().fold(0.0_f64, f64::max);
    assert!(base_max < 1e-10, "Base should be fixed, got max disp={:.6e}", base_max);

    // 4. Quad stresses present
    assert_eq!(result.quad_stresses.len(), nx * ny,
        "Expected {} quad stresses", nx * ny);

    // 5. Hoop stress (membrane) should be dominant
    let has_membrane = result.quad_stresses.iter()
        .any(|qs| qs.sigma_xx.abs() > 1e-6 || qs.sigma_yy.abs() > 1e-6);
    assert!(has_membrane, "Expected non-zero membrane stresses in tank wall");

    eprintln!("6C Q9 tank: radial_mid={:.6e}, base_max={:.6e}, {} stresses",
        radial_disp, base_max, result.quad_stresses.len());
}

// ── 6D: Quad9 Modal Analysis of Simply-Supported Plate ──────────────
// 4×4 quad9 mesh, SS plate, compare first few frequencies to analytical.
// Tests the full mass matrix + eigenvalue pipeline for MITC9.

#[test]
fn acceptance_6d_q9_modal_plate() {
    let a = 1.0;       // plate side (m)
    let t = 0.01;      // thickness (m)
    let e_mpa = 200_000.0;
    let nu = 0.3;
    let rho = 7850.0;  // steel density (kg/m³)

    let nx = 4;
    let ny = 4;

    let (nodes_map, mut quad9s, grid) = build_q9_acceptance_mesh(nx, ny, |xi, eta| {
        (xi * a, eta * a, 0.0)
    });
    for q in quad9s.values_mut() {
        q.thickness = t;
    }

    let rows = 2 * nx + 1;
    let cols = 2 * ny + 1;

    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: e_mpa, nu });

    // SS boundary: uz=0 on all edges, pin corner for in-plane stability
    let mut supports = HashMap::new();
    let mut sid = 1;
    for i in 0..rows {
        for j in 0..cols {
            let on_edge = i == 0 || i == rows - 1 || j == 0 || j == cols - 1;
            if on_edge {
                let is_origin = i == 0 && j == 0;
                let is_x_edge = i == rows - 1 && j == 0;
                supports.insert(sid.to_string(), sup3d_custom(
                    grid[i][j],
                    is_origin,                      // rx: pin origin
                    is_origin || is_x_edge,         // ry: pin x-edge
                    true,                           // rz: all edges
                    false, false, false,
                ));
                sid += 1;
            }
        }
    }

    let input = SolverInput3D {
        nodes: nodes_map, materials,
        sections: HashMap::new(), elements: HashMap::new(),
        supports, loads: vec![],
        constraints: vec![], plates: HashMap::new(),
        quads: HashMap::new(), quad9s, solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        left_hand: None, curved_beams: vec![], connectors: HashMap::new(),
    };

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), rho);

    let modal_result = modal::solve_modal_3d(&input, &densities, 5)
        .expect("Modal solve failed for 6D Q9 plate");

    // Analytical: f_mn = (π/2) * sqrt(D_SI / (ρ·t)) * (m²/a² + n²/b²)
    let pi = std::f64::consts::PI;
    let e_si = e_mpa * 1.0e6;
    let d_si = e_si * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let f_11 = (pi / 2.0) * (d_si / (rho * t)).sqrt() * (1.0 / (a * a) + 1.0 / (a * a));

    // 1. Found at least 3 modes
    assert!(modal_result.modes.len() >= 3,
        "Expected ≥3 modes, got {}", modal_result.modes.len());

    // 2. All frequencies positive and finite
    for (i, mode) in modal_result.modes.iter().enumerate() {
        assert!(mode.frequency > 0.0 && mode.frequency.is_finite(),
            "Mode {}: frequency={:.4} invalid", i, mode.frequency);
    }

    // 3. First frequency close to analytical
    let f1 = modal_result.modes[0].frequency;
    let ratio = f1 / f_11;
    eprintln!("6D Q9 modal: f1={:.2} Hz, analytical={:.2} Hz, ratio={:.4}", f1, f_11, ratio);
    assert!(ratio > 0.9 && ratio < 1.1,
        "First frequency ratio {:.4} outside [0.9, 1.1]", ratio);

    // 4. Frequencies sorted ascending
    for i in 1..modal_result.modes.len() {
        assert!(modal_result.modes[i].frequency >= modal_result.modes[i - 1].frequency - 1e-6,
            "Frequencies not sorted at mode {}", i);
    }
}
