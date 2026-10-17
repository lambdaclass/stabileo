//! Random structural model generators shared by the fuzz tests
//! (fuzz_crash_free.rs, certify.rs).

use dedaliano_engine::types::*;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::collections::HashMap;

// ==================== 2D Random Model Generator ====================

pub fn random_2d_model(seed: u64) -> SolverInput {
    let mut rng = StdRng::seed_from_u64(seed);

    // 2-20 nodes
    let n_nodes = rng.gen_range(2..=20);
    let mut nodes_map = HashMap::new();
    for i in 1..=n_nodes {
        let x = rng.gen_range(-100.0..100.0);
        let z = rng.gen_range(-100.0..100.0);
        nodes_map.insert(
            i.to_string(),
            SolverNode {
                id: i,
                x,
                z,
            },
        );
    }

    // 1-3 materials
    let n_mats = rng.gen_range(1..=3);
    let mut mats_map = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(3.0..9.0)); // 1e3..1e9
        let nu = rng.gen_range(0.1..0.45);
        mats_map.insert(
            i.to_string(),
            SolverMaterial { id: i, e, nu },
        );
    }

    // 1-3 sections
    let n_secs = rng.gen_range(1..=3);
    let mut secs_map = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-4.0..0.0)); // 1e-4..1.0
        let iz = 10f64.powf(rng.gen_range(-8.0..-2.0)); // 1e-8..1e-2
        secs_map.insert(
            i.to_string(),
            SolverSection {
                id: i,
                a,
                iz,
                as_y: None,
            },
        );
    }

    // 1-10 elements connecting random node pairs (no zero-length)
    let n_elems = rng.gen_range(1..=10.min(n_nodes * (n_nodes - 1) / 2).max(1));
    let mut elems_map = HashMap::new();
    let elem_types = ["frame", "truss"];
    for i in 1..=n_elems {
        let mut ni = rng.gen_range(1..=n_nodes);
        let mut nj = rng.gen_range(1..=n_nodes);
        // Avoid self-loop; also avoid coincident nodes
        let mut attempts = 0;
        while attempts < 20 {
            if ni != nj {
                let n_i = &nodes_map[&ni.to_string()];
                let n_j = &nodes_map[&nj.to_string()];
                let dist = ((n_i.x - n_j.x).powi(2) + (n_i.z - n_j.z).powi(2)).sqrt();
                if dist > 0.01 {
                    break;
                }
            }
            nj = rng.gen_range(1..=n_nodes);
            if ni == nj {
                ni = rng.gen_range(1..=n_nodes);
            }
            attempts += 1;
        }
        if ni == nj {
            // Skip this element if we can't find distinct non-coincident nodes
            continue;
        }

        let elem_type = elem_types[rng.gen_range(0..2)];
        let mat_id = rng.gen_range(1..=n_mats);
        let sec_id = rng.gen_range(1..=n_secs);
        let hinge_start = elem_type == "frame" && rng.gen_bool(0.15);
        let hinge_end = elem_type == "frame" && rng.gen_bool(0.15);

        elems_map.insert(
            i.to_string(),
            SolverElement {
                id: i,
                elem_type: elem_type.to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mat_id,
                section_id: sec_id,
                hinge_start,
                hinge_end,
            },
        );
    }

    // If no elements were created (e.g., all coincident), add at least one valid element
    if elems_map.is_empty() {
        // Force two well-separated nodes and connect them
        nodes_map.insert(
            "1".to_string(),
            SolverNode { id: 1, x: 0.0, z: 0.0 },
        );
        nodes_map.insert(
            "2".to_string(),
            SolverNode { id: 2, x: 5.0, z: 0.0 },
        );
        elems_map.insert(
            "1".to_string(),
            SolverElement {
                id: 1,
                elem_type: "frame".to_string(),
                node_i: 1,
                node_j: 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    // Supports: at least 1 fixed or pinned, then random additional supports
    let support_types = ["fixed", "pinned", "rollerX", "rollerZ"];
    let mut sups_map = HashMap::new();

    // First support: always fixed or pinned on node 1 to ensure stability
    let first_type = if rng.gen_bool(0.5) { "fixed" } else { "pinned" };
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: first_type.to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        },
    );

    // Additional random supports
    let n_extra_sups = rng.gen_range(0..=3.min(n_nodes - 1));
    for i in 0..n_extra_sups {
        let node_id = rng.gen_range(2..=n_nodes);
        let sup_type = support_types[rng.gen_range(0..support_types.len())];
        let sup_id = i + 2;
        sups_map.insert(
            sup_id.to_string(),
            SolverSupport {
                id: sup_id,
                node_id,
                support_type: sup_type.to_string(),
                kx: None, ky: None, kz: None,
                dx: None, dz: None, dry: None, angle: None,
            },
        );
    }

    // Loads: 1-5 random loads
    let n_loads = rng.gen_range(1..=5);
    let mut loads = Vec::new();
    let elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();

    for _ in 0..n_loads {
        let load_kind = rng.gen_range(0..3);
        match load_kind {
            0 => {
                // Nodal load
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id,
                    fx: rng.gen_range(-1000.0..1000.0),
                    fz: rng.gen_range(-1000.0..1000.0),
                    my: rng.gen_range(-500.0..500.0),
                }));
            }
            1 if !elem_ids.is_empty() => {
                // Distributed load
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: elem_id,
                    q_i: rng.gen_range(-100.0..100.0),
                    q_j: rng.gen_range(-100.0..100.0),
                    a: None,
                    b: None,
                }));
            }
            2 if !elem_ids.is_empty() => {
                // Point load on element
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                    element_id: elem_id,
                    a: rng.gen_range(0.1..0.9),
                    p: rng.gen_range(-500.0..500.0),
                    px: None,
                    my: None,
                }));
            }
            _ => {
                // Fallback: nodal load
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad::Nodal(SolverNodalLoad {
                    node_id,
                    fx: rng.gen_range(-1000.0..1000.0),
                    fz: rng.gen_range(-1000.0..1000.0),
                    my: 0.0,
                }));
            }
        }
    }

    SolverInput {
        solver_options: None,
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
    }
}

// ==================== 3D Random Model Generator ====================

pub fn random_3d_model(seed: u64) -> SolverInput3D {
    let mut rng = StdRng::seed_from_u64(seed);

    // 2-15 nodes
    let n_nodes = rng.gen_range(2..=15);
    let mut nodes_map = HashMap::new();
    for i in 1..=n_nodes {
        nodes_map.insert(
            i.to_string(),
            SolverNode3D {
                id: i,
                x: rng.gen_range(-50.0..50.0),
                y: rng.gen_range(-50.0..50.0),
                z: rng.gen_range(-50.0..50.0),
            },
        );
    }

    // 1-3 materials
    let n_mats = rng.gen_range(1..=3);
    let mut mats_map = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(3.0..9.0));
        let nu = rng.gen_range(0.1..0.45);
        mats_map.insert(
            i.to_string(),
            SolverMaterial { id: i, e, nu },
        );
    }

    // 1-3 sections
    let n_secs = rng.gen_range(1..=3);
    let mut secs_map = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-4.0..0.0));
        let iy = 10f64.powf(rng.gen_range(-8.0..-2.0));
        let iz = 10f64.powf(rng.gen_range(-8.0..-2.0));
        let j = 10f64.powf(rng.gen_range(-8.0..-2.0));
        secs_map.insert(
            i.to_string(),
            SolverSection3D {
                id: i,
                name: None,
                a,
                iy,
                iz,
                j,
                cw: None,
                as_y: None,
                as_z: None,
            },
        );
    }

    // 1-8 frame elements connecting random node pairs
    let n_elems = rng.gen_range(1..=8.min(n_nodes * (n_nodes - 1) / 2).max(1));
    let mut elems_map = HashMap::new();
    for i in 1..=n_elems {
        let mut ni = rng.gen_range(1..=n_nodes);
        let mut nj = rng.gen_range(1..=n_nodes);
        let mut attempts = 0;
        while attempts < 20 {
            if ni != nj {
                let n_i = &nodes_map[&ni.to_string()];
                let n_j = &nodes_map[&nj.to_string()];
                let dist = ((n_i.x - n_j.x).powi(2)
                    + (n_i.y - n_j.y).powi(2)
                    + (n_i.z - n_j.z).powi(2))
                .sqrt();
                if dist > 0.01 {
                    break;
                }
            }
            nj = rng.gen_range(1..=n_nodes);
            if ni == nj {
                ni = rng.gen_range(1..=n_nodes);
            }
            attempts += 1;
        }
        if ni == nj {
            continue;
        }

        let mat_id = rng.gen_range(1..=n_mats);
        let sec_id = rng.gen_range(1..=n_secs);

        elems_map.insert(
            i.to_string(),
            SolverElement3D {
                id: i,
                elem_type: "frame".to_string(),
                node_i: ni,
                node_j: nj,
                material_id: mat_id,
                section_id: sec_id,
                release_my_start: rng.gen_bool(0.1),
                release_my_end: rng.gen_bool(0.1),
                release_mz_start: rng.gen_bool(0.1),
                release_mz_end: rng.gen_bool(0.1),
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }

    // Fallback: ensure at least one element
    if elems_map.is_empty() {
        nodes_map.insert(
            "1".to_string(),
            SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 },
        );
        nodes_map.insert(
            "2".to_string(),
            SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 },
        );
        elems_map.insert(
            "1".to_string(),
            SolverElement3D {
                id: 1,
                elem_type: "frame".to_string(),
                node_i: 1,
                node_j: 2,
                material_id: 1,
                section_id: 1,
                release_my_start: false,
                release_my_end: false,
                release_mz_start: false,
                release_mz_end: false,
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            },
        );
    }

    // Supports: at least 1 fully fixed, plus random ones
    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport3D {
            node_id: 1,
            rx: true, ry: true, rz: true,
            rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    // Additional random supports
    let n_extra_sups = rng.gen_range(0..=2.min(n_nodes - 1));
    for i in 0..n_extra_sups {
        let node_id = rng.gen_range(2..=n_nodes);
        let sup_id = i + 2;
        sups_map.insert(
            sup_id.to_string(),
            SolverSupport3D {
                node_id,
                rx: rng.gen_bool(0.6),
                ry: rng.gen_bool(0.6),
                rz: rng.gen_bool(0.6),
                rrx: rng.gen_bool(0.4),
                rry: rng.gen_bool(0.4),
                rrz: rng.gen_bool(0.4),
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
    }

    // Loads: 1-4 random nodal and distributed loads
    let n_loads = rng.gen_range(1..=4);
    let mut loads = Vec::new();
    let elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();

    for _ in 0..n_loads {
        let load_kind = rng.gen_range(0..3);
        match load_kind {
            0 => {
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id,
                    fx: rng.gen_range(-500.0..500.0),
                    fy: rng.gen_range(-500.0..500.0),
                    fz: rng.gen_range(-500.0..500.0),
                    mx: rng.gen_range(-200.0..200.0),
                    my: rng.gen_range(-200.0..200.0),
                    mz: rng.gen_range(-200.0..200.0),
                    bw: None,
                }));
            }
            1 if !elem_ids.is_empty() => {
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    q_xi: 0.0, q_xj: 0.0,
                    element_id: elem_id,
                    q_yi: rng.gen_range(-100.0..100.0),
                    q_yj: rng.gen_range(-100.0..100.0),
                    q_zi: rng.gen_range(-100.0..100.0),
                    q_zj: rng.gen_range(-100.0..100.0),
                    a: None,
                    b: None,
                }));
            }
            2 if !elem_ids.is_empty() => {
                let elem_id = elem_ids[rng.gen_range(0..elem_ids.len())];
                loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                    element_id: elem_id,
                    a: rng.gen_range(0.1..0.9),
                    py: rng.gen_range(-500.0..500.0),
                    pz: rng.gen_range(-500.0..500.0),
                }));
            }
            _ => {
                let node_id = rng.gen_range(1..=n_nodes);
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id,
                    fx: rng.gen_range(-500.0..500.0),
                    fy: rng.gen_range(-500.0..500.0),
                    fz: rng.gen_range(-500.0..500.0),
                    mx: 0.0, my: 0.0, mz: 0.0,
                    bw: None,
                }));
            }
        }
    }

    SolverInput3D {
        solver_options: None,
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}
