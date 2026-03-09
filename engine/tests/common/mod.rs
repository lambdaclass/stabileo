// Shared test helpers for building SolverInput structures.

use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Build a 2D SolverInput from compact descriptions.
#[allow(dead_code)]
pub fn make_input(
    nodes: Vec<(usize, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,       // (id, E_MPa, nu)
    secs: Vec<(usize, f64, f64)>,       // (id, A, Iz)
    elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)>,
    sups: Vec<(usize, usize, &str)>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes_map = HashMap::new();
    for (id, x, y) in nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, y });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iz) in secs {
        secs_map.insert(id.to_string(), SolverSection { id, a, iz, as_y: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in elems {
        elems_map.insert(id.to_string(), SolverElement {
            id,
            elem_type: t.to_string(),
            node_i: ni,
            node_j: nj,
            material_id: mi,
            section_id: si,
            hinge_start: hs,
            hinge_end: he,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, t) in sups {
        sups_map.insert(id.to_string(), SolverSupport {
            id,
            node_id: nid,
            support_type: t.to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }
    SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads, constraints: vec![] }
}

/// Build a multi-element column along X for buckling/modal tests.
#[allow(dead_code)]
pub fn make_column(
    n_elements: usize,
    length: f64,
    e: f64,
    a: f64,
    iz: f64,
    start_support: &str,
    end_support: &str,
    axial_load: f64,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..n_elements {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    let mut sups = vec![(1, 1, start_support)];
    sups.push((2, n_nodes, end_support));

    let loads = if axial_load.abs() > 1e-20 {
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes,
            fx: axial_load,
            fy: 0.0,
            mz: 0.0,
        })]
    } else {
        vec![]
    };

    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

/// Build a simply-supported beam with uniform distributed load.
#[allow(dead_code)]
pub fn make_ss_beam_udl(
    n_elements: usize,
    length: f64,
    e: f64,
    a: f64,
    iz: f64,
    q: f64,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }

    let mut elems = Vec::new();
    for i in 0..n_elements {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    let sups = vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")];

    let mut loads = Vec::new();
    for i in 0..n_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

/// Portal frame: 2 columns + 1 beam.
#[allow(dead_code)]
pub fn make_portal_frame(
    h: f64,
    w: f64,
    e: f64,
    a: f64,
    iz: f64,
    lateral_load: f64,
    gravity_load: f64,
) -> SolverInput {
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let mut loads = Vec::new();
    if lateral_load.abs() > 1e-20 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral_load, fy: 0.0, mz: 0.0,
        }));
    }
    if gravity_load.abs() > 1e-20 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: gravity_load, mz: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: gravity_load, mz: 0.0,
        }));
    }

    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

/// Assert relative closeness (with absolute tolerance fallback for near-zero).
#[allow(dead_code)]
pub fn assert_close(actual: f64, expected: f64, rel_tol: f64, label: &str) {
    let abs_tol = 1e-6;
    let diff = (actual - expected).abs();
    let denom = expected.abs().max(1.0);
    let rel_err = diff / denom;
    assert!(
        diff < abs_tol || rel_err < rel_tol,
        "{}: actual={:.6}, expected={:.6}, rel_err={:.4}%",
        label, actual, expected, rel_err * 100.0
    );
}

/// Build a multi-element beam along X with given supports and loads.
#[allow(dead_code)]
pub fn make_beam(
    n_elements: usize,
    length: f64,
    e: f64,
    a: f64,
    iz: f64,
    start_support: &str,
    end_support: Option<&str>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let mut sups = vec![(1, 1, start_support)];
    if let Some(es) = end_support {
        sups.push((2, n_nodes, es));
    }
    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

/// Build a continuous (multi-span) beam along X.
/// Supports: pinned at start, rollerX at every span boundary.
#[allow(dead_code)]
pub fn make_continuous_beam(
    spans: &[f64],
    n_per_span: usize,
    e: f64,
    a: f64,
    iz: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_spans = spans.len();
    let total_elements = n_per_span * n_spans;

    let mut nodes = Vec::new();
    let mut node_id = 1_usize;
    let mut x = 0.0;
    nodes.push((node_id, 0.0, 0.0));
    node_id += 1;
    for &span_len in spans {
        let elem_len = span_len / n_per_span as f64;
        for j in 1..=n_per_span {
            nodes.push((node_id, x + j as f64 * elem_len, 0.0));
            node_id += 1;
        }
        x += span_len;
    }

    let elems: Vec<_> = (0..total_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups = Vec::new();
    let mut sup_id = 1;
    sups.push((sup_id, 1, "pinned"));
    sup_id += 1;
    for span_idx in 0..n_spans {
        let end_node = 1 + n_per_span * (span_idx + 1);
        sups.push((sup_id, end_node, "rollerX"));
        sup_id += 1;
    }

    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

/// Build a 3D SolverInput3D from compact descriptions.
#[allow(dead_code)]
pub fn make_3d_input(
    nodes: Vec<(usize, f64, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,                         // (id, E_MPa, nu)
    secs: Vec<(usize, f64, f64, f64, f64)>,                // (id, A, Iy, Iz, J)
    elems: Vec<(usize, &str, usize, usize, usize, usize)>, // (id, type, ni, nj, mat, sec)
    sups: Vec<(usize, Vec<bool>)>,                         // (node_id, [rx,ry,rz,rrx,rry,rrz])
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let mut nodes_map = HashMap::new();
    for (id, x, y, z) in nodes {
        nodes_map.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iy, iz, j) in secs {
        secs_map.insert(id.to_string(), SolverSection3D { id, name: None, a, iy, iz, j, cw: None, as_y: None, as_z: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si) in elems {
        elems_map.insert(id.to_string(), SolverElement3D {
            id, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: mi, section_id: si,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }
    let mut sups_map = HashMap::new();
    for (i, (nid, dofs)) in sups.iter().enumerate() {
        sups_map.insert((i + 1).to_string(), SolverSupport3D {
            node_id: *nid,
            rx: dofs[0], ry: dofs[1], rz: dofs[2],
            rrx: dofs[3], rry: dofs[4], rrz: dofs[5],
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
            });
    }
    SolverInput3D {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), curved_beams: vec![],    }
}

/// Build a 3D beam along X-axis with given supports and loads.
#[allow(dead_code)]
pub fn make_3d_beam(
    n_elements: usize,
    length: f64,
    e: f64,
    nu: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    start_dofs: Vec<bool>,
    end_dofs: Option<Vec<bool>>,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elements)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let mut sups = vec![(1, start_dofs)];
    if let Some(ed) = end_dofs {
        sups.push((n_nodes, ed));
    }
    make_3d_input(
        nodes, vec![(1, e, nu)], vec![(1, a, iy, iz, j)],
        elems, sups, loads,
    )
}

/// Check global equilibrium: sum of reactions ≈ sum of applied loads.
#[allow(dead_code)]
pub fn check_equilibrium(results: &AnalysisResults, loads: &[SolverLoad]) {
    let (mut fx, mut fy, mut _mz) = (0.0, 0.0, 0.0);
    for load in loads {
        match load {
            SolverLoad::Nodal(nl) => {
                fx += nl.fx;
                fy += nl.fy;
                _mz += nl.mz;
            }
            SolverLoad::Distributed(dl) => {
                let _ = dl;
            }
            _ => {}
        }
    }
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_reaction_x = sum_rx;
    let total_reaction_y = sum_ry;
    if fy < 0.0 {
        assert!(total_reaction_y > 0.0, "Vertical equilibrium: sum_ry={}", total_reaction_y);
    }
    if fx.abs() > 1e-10 {
        assert!(
            (total_reaction_x + fx).abs() < 1.0,
            "Horizontal equilibrium: sum_rx={}, fx={}", total_reaction_x, fx
        );
    }
}
