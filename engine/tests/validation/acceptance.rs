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

#[path = "../common/mod.rs"]
mod common;

use common::*;
use dedaliano_engine::solver::{linear, pdelta};
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
        quads,
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
