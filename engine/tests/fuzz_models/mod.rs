//! Random structural model generators shared by the fuzz tests
//! (fuzz_crash_free.rs, certify.rs) and the assembly-path oracle
//! (assembly_paths.rs). `random_2d_model`/`random_3d_model` are kept stable
//! (other tests pin seeds against them); the `_rich` generators exercise
//! every feature the assemblers branch on.
#![allow(dead_code)]

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
    let mut elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();
    elem_ids.sort_unstable();

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
        solver_options: None, masses: Default::default(),
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
                shear_center_y: None,
                shear_center_z: None,
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
    let mut elem_ids: Vec<usize> = elems_map.values().map(|e| e.id).collect();
    elem_ids.sort_unstable();

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
        solver_options: None, masses: Default::default(),
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

// ==================== Rich generators (assembly-path oracle) ====================
//
// Smaller and better conditioned than the crash fuzzers above, but every
// branch of the assemblers is reachable: springs with angles and on
// restrained DOFs, inclined rollers/supports, hinges and releases, truss-only
// nodes inside frame models, Timoshenko shear areas, partial and thermal
// member loads, prescribed displacements, connectors, warping, local axis
// overrides, and in 3D every surface element family.

fn spring_k(rng: &mut StdRng) -> f64 {
    10f64.powf(rng.gen_range(2.0..5.0))
}

fn small_disp(rng: &mut StdRng) -> f64 {
    rng.gen_range(-0.01..0.01)
}

/// Spanning tree over `1..=n` plus a few extra edges, without duplicates.
fn random_edges(rng: &mut StdRng, n: usize) -> Vec<(usize, usize)> {
    let mut edges: Vec<(usize, usize)> = Vec::new();
    for j in 2..=n {
        edges.push((rng.gen_range(1..j), j));
    }
    for _ in 0..rng.gen_range(0..=n / 2) {
        let a = rng.gen_range(1..=n);
        let b = rng.gen_range(1..=n);
        if a != b && !edges.iter().any(|&(p, q)| (p == a && q == b) || (p == b && q == a)) {
            edges.push((a, b));
        }
    }
    // Random orientation, so node_i > node_j happens too.
    edges.into_iter().map(|(a, b)| if rng.gen_bool(0.5) { (a, b) } else { (b, a) }).collect()
}

fn random_densities(rng: &mut StdRng, n_mats: usize) -> HashMap<String, f64> {
    let mut d = HashMap::new();
    for i in 1..=n_mats {
        if rng.gen_bool(0.9) {
            d.insert(i.to_string(), rng.gen_range(1000.0..8000.0));
        }
    }
    d
}

/// A 2D model reaching every branch of the 2D assemblers, and per-material
/// densities for the mass matrix.
pub fn random_2d_model_rich(seed: u64) -> (SolverInput, HashMap<String, f64>) {
    let mut rng = StdRng::seed_from_u64(seed);
    let truss_only = rng.gen_bool(0.12);

    let n_nodes = rng.gen_range(3..=10);
    let mut pts: Vec<(f64, f64)> = Vec::new();
    while pts.len() < n_nodes {
        let p = (rng.gen_range(-8.0..8.0), rng.gen_range(-8.0..8.0));
        if pts.iter().all(|q| ((p.0 - q.0).powi(2) + (p.1 - q.1).powi(2)).sqrt() > 0.5) {
            pts.push(p);
        }
    }
    let mut nodes = HashMap::new();
    for (i, &(x, z)) in pts.iter().enumerate() {
        nodes.insert((i + 1).to_string(), SolverNode { id: i + 1, x, z });
    }

    let n_mats = rng.gen_range(1..=2);
    let mut materials = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(4.0..5.5));
        materials.insert(i.to_string(), SolverMaterial { id: i, e, nu: rng.gen_range(0.15..0.4) });
    }
    let n_secs = rng.gen_range(1..=2);
    let mut sections = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-3.0..-1.0));
        let iz = 10f64.powf(rng.gen_range(-6.0..-3.0));
        let as_y = if rng.gen_bool(0.5) { Some(a * rng.gen_range(0.4..0.9)) } else { None };
        sections.insert(i.to_string(), SolverSection { id: i, a, iz, as_y });
    }

    let mut elements = HashMap::new();
    for (k, (ni, nj)) in random_edges(&mut rng, n_nodes).into_iter().enumerate() {
        let id = k + 1;
        let frame = !truss_only && rng.gen_bool(0.75);
        elements.insert(id.to_string(), SolverElement {
            id,
            elem_type: if frame { "frame" } else { "truss" }.to_string(),
            node_i: ni,
            node_j: nj,
            material_id: rng.gen_range(1..=n_mats),
            section_id: rng.gen_range(1..=n_secs),
            hinge_start: frame && rng.gen_bool(0.15),
            hinge_end: frame && rng.gen_bool(0.15),
        });
    }

    let mut supports = HashMap::new();
    let blank = |id: usize, node_id: usize, t: &str| SolverSupport {
        id, node_id, support_type: t.to_string(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    };
    let mut first = blank(1, 1, if truss_only { "pinned" } else { "fixed" });
    if rng.gen_bool(0.2) {
        first.dz = Some(small_disp(&mut rng));
    }
    supports.insert("1".to_string(), first);
    let kinds = ["pinned", "rollerX", "rollerZ", "guidedX", "guidedZ", "spring", "spring", "inclinedRoller"];
    for node in 2..=n_nodes {
        if !rng.gen_bool(0.35) {
            continue;
        }
        let id = supports.len() + 1;
        let kind = kinds[rng.gen_range(0..kinds.len())];
        let mut s = blank(id, node, kind);
        match kind {
            "spring" => {
                if rng.gen_bool(0.6) { s.kx = Some(spring_k(&mut rng)); }
                if rng.gen_bool(0.6) { s.ky = Some(spring_k(&mut rng)); }
                if rng.gen_bool(0.5) { s.kz = Some(spring_k(&mut rng)); }
                if s.kx.is_none() && s.ky.is_none() && s.kz.is_none() { s.ky = Some(spring_k(&mut rng)); }
                if rng.gen_bool(0.5) { s.angle = Some(rng.gen_range(-3.1..3.1)); }
            }
            _ => {
                if kind == "inclinedRoller" && rng.gen_bool(0.9) {
                    s.angle = Some(rng.gen_range(-3.1..3.1));
                }
                // Springs on a non-spring support: on whichever DOF they land,
                // restrained or not.
                if rng.gen_bool(0.2) { s.kx = Some(spring_k(&mut rng)); }
                if rng.gen_bool(0.2) { s.ky = Some(spring_k(&mut rng)); }
                if rng.gen_bool(0.3) { s.dx = Some(small_disp(&mut rng)); }
                if rng.gen_bool(0.3) { s.dz = Some(small_disp(&mut rng)); }
                if rng.gen_bool(0.2) { s.dry = Some(small_disp(&mut rng)); }
            }
        }
        supports.insert(id.to_string(), s);
    }

    let elem_list: Vec<(usize, f64)> = {
        let mut v: Vec<(usize, f64)> = elements.values().map(|e: &SolverElement| {
            let (a, b) = (&nodes[&e.node_i.to_string()], &nodes[&e.node_j.to_string()]);
            (e.id, ((b.x - a.x).powi(2) + (b.z - a.z).powi(2)).sqrt())
        }).collect();
        v.sort_by_key(|x| x.0);
        v
    };
    let mut loads = Vec::new();
    for _ in 0..rng.gen_range(2..=6) {
        let (eid, l) = elem_list[rng.gen_range(0..elem_list.len())];
        match rng.gen_range(0..4) {
            0 => loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: rng.gen_range(1..=n_nodes),
                fx: rng.gen_range(-50.0..50.0),
                fz: rng.gen_range(-50.0..50.0),
                my: rng.gen_range(-20.0..20.0),
            })),
            1 => {
                let (a, b) = if rng.gen_bool(0.4) {
                    let a = rng.gen_range(0.0..0.8) * l;
                    (Some(a), Some(a + rng.gen_range(0.1..1.0) * (l - a)))
                } else {
                    (None, None)
                };
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id: eid, q_i: rng.gen_range(-20.0..20.0), q_j: rng.gen_range(-20.0..20.0), a, b,
                }));
            }
            2 => loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: eid,
                a: rng.gen_range(0.0..1.0) * l,
                p: rng.gen_range(-50.0..50.0),
                px: if rng.gen_bool(0.5) { Some(rng.gen_range(-50.0..50.0)) } else { None },
                my: if rng.gen_bool(0.3) { Some(rng.gen_range(-20.0..20.0)) } else { None },
            })),
            _ => loads.push(SolverLoad::Thermal(SolverThermalLoad {
                element_id: eid, dt_uniform: rng.gen_range(-40.0..40.0), dt_gradient: rng.gen_range(-20.0..20.0),
                // Some members state α and depth (#407), without drawing from the RNG.
                alpha: if eid % 2 == 0 { Some(23e-6) } else { None }, depth: if eid % 3 == 0 { Some(0.3) } else { None },
            })),
        }
    }

    let mut connectors = HashMap::new();
    if rng.gen_bool(0.25) {
        let a = rng.gen_range(1..=n_nodes);
        let b = rng.gen_range(1..=n_nodes);
        if a != b {
            connectors.insert("1".to_string(), ConnectorElement {
                id: 1, node_i: a, node_j: b,
                k_axial: spring_k(&mut rng), k_shear: spring_k(&mut rng),
                k_moment: if truss_only { 0.0 } else { spring_k(&mut rng) },
                k_shear_z: 0.0, k_bend_y: 0.0, k_bend_z: 0.0,
            });
        }
    }

    let densities = random_densities(&mut rng, n_mats);
    let input = SolverInput {
        solver_options: None, masses: Default::default(), nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors,
    };
    (input, densities)
}

/// Nodes without a support, sorted.
fn unsupported_nodes(all: impl Iterator<Item = usize>, supported: impl Iterator<Item = usize>) -> Vec<usize> {
    let sup: std::collections::HashSet<usize> = supported.collect();
    let mut v: Vec<usize> = all.filter(|n| !sup.contains(n)).collect();
    v.sort();
    v
}

/// One to two constraints between distinct unsupported nodes (no chains),
/// for the constrained-reduction comparisons. A no-op when too few nodes
/// are free.
pub fn add_random_constraints_2d(input: &mut SolverInput, seed: u64) {
    let mut rng = StdRng::seed_from_u64(seed ^ 0xC0457);
    let mut free = unsupported_nodes(input.nodes.values().map(|n| n.id), input.supports.values().map(|s| s.node_id));
    let rot = input.elements.values().any(|e| e.elem_type == "frame");
    for _ in 0..rng.gen_range(1..=2) {
        if free.len() < 2 {
            return;
        }
        let master = free.remove(rng.gen_range(0..free.len()));
        let slave = free.remove(rng.gen_range(0..free.len()));
        let c = match rng.gen_range(0..3) {
            0 => {
                let mut dofs: Vec<usize> = (0..if rot { 3 } else { 2 }).filter(|_| rng.gen_bool(0.6)).collect();
                if dofs.is_empty() { dofs.push(0); }
                Constraint::EqualDOF(EqualDOFConstraint { master_node: master, slave_node: slave, dofs })
            }
            1 if rot => Constraint::RigidLink(RigidLinkConstraint { master_node: master, slave_node: slave, dofs: vec![] }),
            _ => Constraint::LinearMPC(LinearMPCConstraint { terms: vec![
                MPCTerm { node_id: slave, dof: 1, coefficient: 1.0 },
                MPCTerm { node_id: master, dof: 1, coefficient: -rng.gen_range(0.5..2.0) },
            ] }),
        };
        input.constraints.push(c);
    }
}

fn unit3(v: [f64; 3]) -> [f64; 3] {
    let m = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    [v[0] / m, v[1] / m, v[2] / m]
}

fn cross3(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

fn random_unit3(rng: &mut StdRng) -> [f64; 3] {
    loop {
        let v: [f64; 3] = [rng.gen_range(-1.0..1.0), rng.gen_range(-1.0..1.0), rng.gen_range(-1.0..1.0)];
        let m = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        if m > 0.2 && m <= 1.0 {
            return unit3(v);
        }
    }
}

fn blank_support_3d(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

/// A 3D model reaching every branch of the 3D assemblers (frames, trusses,
/// releases, local axes, Timoshenko, warping, plates, MITC4/MITC9 quads,
/// solid and curved shells, connectors, springs, inclined supports,
/// prescribed displacements, every load type), and per-material densities.
pub fn random_3d_model_rich(seed: u64) -> (SolverInput3D, HashMap<String, f64>) {
    let mut rng = StdRng::seed_from_u64(seed);
    let warping = rng.gen_bool(0.2);

    let mut nodes: HashMap<String, SolverNode3D> = HashMap::new();
    let mut add_node = |nodes: &mut HashMap<String, SolverNode3D>, p: [f64; 3]| -> usize {
        let id = nodes.len() + 1;
        nodes.insert(id.to_string(), SolverNode3D { id, x: p[0], y: p[1], z: p[2] });
        id
    };
    let n_frame_nodes = rng.gen_range(2..=7);
    let mut pts: Vec<[f64; 3]> = Vec::new();
    while pts.len() < n_frame_nodes {
        let p = [rng.gen_range(-6.0..6.0), rng.gen_range(-6.0..6.0), rng.gen_range(-6.0..6.0)];
        if pts.iter().all(|q| ((p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2) + (p[2] - q[2]).powi(2)).sqrt() > 0.5) {
            pts.push(p);
        }
    }
    for &p in &pts {
        add_node(&mut nodes, p);
    }

    let n_mats = rng.gen_range(1..=2);
    let mut materials = HashMap::new();
    for i in 1..=n_mats {
        let e = 10f64.powf(rng.gen_range(4.0..5.5));
        materials.insert(i.to_string(), SolverMaterial { id: i, e, nu: rng.gen_range(0.15..0.4) });
    }
    let n_secs = rng.gen_range(1..=2);
    let mut sections = HashMap::new();
    for i in 1..=n_secs {
        let a = 10f64.powf(rng.gen_range(-3.0..-1.0));
        sections.insert(i.to_string(), SolverSection3D {
            id: i, name: None, a,
            iy: 10f64.powf(rng.gen_range(-6.0..-3.0)),
            iz: 10f64.powf(rng.gen_range(-6.0..-3.0)),
            j: 10f64.powf(rng.gen_range(-6.0..-3.0)),
            // With warping on, section 1 carries it and any other does not
            // (a non-warping element in a 7-DOF model).
            cw: if warping && i == 1 { Some(10f64.powf(rng.gen_range(-8.0..-5.0))) } else { None },
            as_y: if rng.gen_bool(0.4) { Some(a * rng.gen_range(0.4..0.9)) } else { None },
            as_z: if rng.gen_bool(0.4) { Some(a * rng.gen_range(0.4..0.9)) } else { None },
            shear_center_y: None,
            shear_center_z: None,
        });
    }

    let mut elements = HashMap::new();
    for (k, (ni, nj)) in random_edges(&mut rng, n_frame_nodes).into_iter().enumerate() {
        let id = k + 1;
        let frame = rng.gen_bool(0.75);
        let dir = {
            let (a, b) = (pts[ni - 1], pts[nj - 1]);
            unit3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
        };
        let (mut lyx, mut lyy, mut lyz) = (None, None, None);
        if frame && rng.gen_bool(0.3) {
            let v = random_unit3(&mut rng);
            let c = cross3(dir, v);
            if (c[0] * c[0] + c[1] * c[1] + c[2] * c[2]).sqrt() > 0.3 {
                lyx = Some(v[0]); lyy = Some(v[1]); lyz = Some(v[2]);
            }
        }
        elements.insert(id.to_string(), SolverElement3D {
            id,
            elem_type: if frame { "frame" } else { "truss" }.to_string(),
            node_i: ni,
            node_j: nj,
            material_id: rng.gen_range(1..=n_mats),
            section_id: rng.gen_range(1..=n_secs),
            release_my_start: frame && rng.gen_bool(0.1),
            release_my_end: frame && rng.gen_bool(0.1),
            release_mz_start: frame && rng.gen_bool(0.1),
            release_mz_end: frame && rng.gen_bool(0.1),
            release_t_start: frame && rng.gen_bool(0.05),
            release_t_end: false,
            local_yx: lyx, local_yy: lyy, local_yz: lyz,
            roll_angle: if frame && rng.gen_bool(0.3) { Some(rng.gen_range(-180.0..180.0)) } else { None },
        });
    }

    // Surface patches, each in a random plane, half of them hanging off a
    // frame node so the families share DOFs with the frames.
    let mut plates = HashMap::new();
    let mut quads = HashMap::new();
    let mut quad9s = HashMap::new();
    let mut solid_shells = HashMap::new();
    let mut curved_shells = HashMap::new();
    for family in 0..5 {
        if !rng.gen_bool(0.3) {
            continue;
        }
        let u = random_unit3(&mut rng);
        let v = unit3(cross3(cross3(u, random_unit3(&mut rng)), u));
        let nrm = cross3(u, v);
        let (sa, sb) = (rng.gen_range(1.0..3.0), rng.gen_range(1.0..3.0));
        let shared = rng.gen_bool(0.5);
        let origin_id = if shared { rng.gen_range(1..=n_frame_nodes) } else { 0 };
        let o = if shared {
            pts[origin_id - 1]
        } else {
            [rng.gen_range(-6.0..6.0), rng.gen_range(-6.0..6.0), rng.gen_range(-6.0..6.0)]
        };
        let at = |s: f64, t: f64, w: f64| [
            o[0] + s * sa * u[0] + t * sb * v[0] + w * nrm[0],
            o[1] + s * sa * u[1] + t * sb * v[1] + w * nrm[1],
            o[2] + s * sa * u[2] + t * sb * v[2] + w * nrm[2],
        ];
        let first = |nodes: &mut HashMap<String, SolverNode3D>, add: &mut dyn FnMut(&mut HashMap<String, SolverNode3D>, [f64; 3]) -> usize| {
            if shared { origin_id } else { add(nodes, at(0.0, 0.0, 0.0)) }
        };
        let mat = rng.gen_range(1..=n_mats);
        let thick = rng.gen_range(0.05..0.3);
        match family {
            0 => {
                let n0 = first(&mut nodes, &mut add_node);
                let n1 = add_node(&mut nodes, at(1.0, 0.0, 0.0));
                let n2 = add_node(&mut nodes, at(1.0, 1.0, 0.0));
                let n3 = add_node(&mut nodes, at(0.0, 1.0, 0.0));
                plates.insert("1".to_string(), SolverPlateElement { id: 1, nodes: [n0, n1, n2], material_id: mat, thickness: thick });
                plates.insert("2".to_string(), SolverPlateElement { id: 2, nodes: [n0, n2, n3], material_id: mat, thickness: thick });
            }
            1 => {
                let warp = if rng.gen_bool(0.3) { 0.05 * sa.min(sb) } else { 0.0 };
                let n0 = first(&mut nodes, &mut add_node);
                let n1 = add_node(&mut nodes, at(1.0, 0.0, 0.0));
                let n2 = add_node(&mut nodes, at(1.0, 1.0, warp));
                let n3 = add_node(&mut nodes, at(0.0, 1.0, 0.0));
                let n4 = add_node(&mut nodes, at(2.0, 0.0, 0.0));
                let n5 = add_node(&mut nodes, at(2.0, 1.0, 0.0));
                quads.insert("1".to_string(), SolverQuadElement { id: 1, nodes: [n0, n1, n2, n3], material_id: mat, thickness: thick });
                quads.insert("2".to_string(), SolverQuadElement { id: 2, nodes: [n1, n4, n5, n2], material_id: mat, thickness: thick });
            }
            2 => {
                let n0 = first(&mut nodes, &mut add_node);
                let rest: Vec<usize> = [(1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5), (0.5, 0.5)]
                    .iter().map(|&(s, t)| add_node(&mut nodes, at(s, t, 0.0))).collect();
                let mut ns = [0usize; 9];
                ns[0] = n0;
                ns[1..].copy_from_slice(&rest);
                quad9s.insert("1".to_string(), SolverQuad9Element { id: 1, nodes: ns, material_id: mat, thickness: thick });
            }
            3 => {
                let n0 = first(&mut nodes, &mut add_node);
                let mut ns = [n0, 0, 0, 0, 0, 0, 0, 0];
                for (k, &(s, t, w)) in [(1.0, 0.0, 0.0), (1.0, 1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, thick), (1.0, 0.0, thick), (1.0, 1.0, thick), (0.0, 1.0, thick)].iter().enumerate() {
                    ns[k + 1] = add_node(&mut nodes, at(s, t, w));
                }
                solid_shells.insert("1".to_string(), SolverSolidShellElement { id: 1, nodes: ns, material_id: mat });
            }
            _ => {
                let bulge = rng.gen_range(0.0..0.3);
                let n0 = first(&mut nodes, &mut add_node);
                let n1 = add_node(&mut nodes, at(1.0, 0.0, bulge));
                let n2 = add_node(&mut nodes, at(1.0, 1.0, bulge));
                let n3 = add_node(&mut nodes, at(0.0, 1.0, 0.0));
                curved_shells.insert("1".to_string(), SolverCurvedShellElement { id: 1, nodes: [n0, n1, n2, n3], material_id: mat, thickness: thick, normals: None });
            }
        }
    }
    let n_nodes = nodes.len();

    let mut supports = HashMap::new();
    let mut s1 = blank_support_3d(1);
    s1.rx = true; s1.ry = true; s1.rz = true; s1.rrx = true; s1.rry = true; s1.rrz = true;
    if warping { s1.rw = Some(true); }
    if rng.gen_bool(0.2) { s1.dz = Some(small_disp(&mut rng)); }
    supports.insert("1".to_string(), s1);
    for node in 2..=n_nodes {
        if !rng.gen_bool(0.3) {
            continue;
        }
        let mut s = blank_support_3d(node);
        if rng.gen_bool(0.15) {
            let nv = random_unit3(&mut rng);
            s.is_inclined = Some(true);
            s.normal_x = Some(nv[0]); s.normal_y = Some(nv[1]); s.normal_z = Some(nv[2]);
            s.rrx = rng.gen_bool(0.3); s.rry = rng.gen_bool(0.3); s.rrz = rng.gen_bool(0.3);
        } else {
            s.rx = rng.gen_bool(0.5); s.ry = rng.gen_bool(0.5); s.rz = rng.gen_bool(0.5);
            s.rrx = rng.gen_bool(0.3); s.rry = rng.gen_bool(0.3); s.rrz = rng.gen_bool(0.3);
            if warping { s.rw = Some(rng.gen_bool(0.3)); }
            let ks = [&mut s.kx, &mut s.ky, &mut s.kz, &mut s.krx, &mut s.kry, &mut s.krz];
            for k in ks {
                if rng.gen_bool(0.15) { *k = Some(spring_k(&mut rng)); }
            }
            if warping && rng.gen_bool(0.2) { s.kw = Some(spring_k(&mut rng)); }
            if s.rx && rng.gen_bool(0.3) { s.dx = Some(small_disp(&mut rng)); }
            if s.ry && rng.gen_bool(0.3) { s.dy = Some(small_disp(&mut rng)); }
            if s.rz && rng.gen_bool(0.3) { s.dz = Some(small_disp(&mut rng)); }
            if s.rrx && rng.gen_bool(0.2) { s.drx = Some(small_disp(&mut rng)); }
            if s.rry && rng.gen_bool(0.2) { s.dry = Some(small_disp(&mut rng)); }
            if s.rrz && rng.gen_bool(0.2) { s.drz = Some(small_disp(&mut rng)); }
        }
        supports.insert(node.to_string(), s);
    }

    let elem_list: Vec<(usize, f64)> = {
        let mut v: Vec<(usize, f64)> = elements.values().map(|e: &SolverElement3D| {
            let (a, b) = (pts[e.node_i - 1], pts[e.node_j - 1]);
            (e.id, ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2) + (b[2] - a[2]).powi(2)).sqrt())
        }).collect();
        v.sort_by_key(|x| x.0);
        v
    };
    let mut loads = Vec::new();
    let q = |rng: &mut StdRng| rng.gen_range(-20.0..20.0);
    for _ in 0..rng.gen_range(2..=6) {
        let (eid, l) = elem_list[rng.gen_range(0..elem_list.len())];
        match rng.gen_range(0..5) {
            0 => loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: rng.gen_range(1..=n_nodes),
                fx: q(&mut rng), fy: q(&mut rng), fz: q(&mut rng),
                mx: q(&mut rng), my: q(&mut rng), mz: q(&mut rng),
                bw: if warping && rng.gen_bool(0.3) { Some(q(&mut rng)) } else { None },
            })),
            1 => {
                let (a, b) = if rng.gen_bool(0.4) {
                    let a = rng.gen_range(0.0..0.8) * l;
                    (Some(a), Some(a + rng.gen_range(0.1..1.0) * (l - a)))
                } else {
                    (None, None)
                };
                let axial = rng.gen_bool(0.4);
                loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: eid,
                    q_xi: if axial { q(&mut rng) } else { 0.0 },
                    q_xj: if axial { q(&mut rng) } else { 0.0 },
                    q_yi: q(&mut rng), q_yj: q(&mut rng), q_zi: q(&mut rng), q_zj: q(&mut rng),
                    a, b,
                }));
            }
            2 => loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                element_id: eid, a: rng.gen_range(0.0..1.0) * l, py: q(&mut rng), pz: q(&mut rng),
            })),
            3 => loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D {
                element_id: eid, dt_uniform: rng.gen_range(-40.0..40.0),
                dt_gradient_y: rng.gen_range(-20.0..20.0), dt_gradient_z: rng.gen_range(-20.0..20.0),
                alpha: if eid % 2 == 0 { Some(23e-6) } else { None },
                depth_y: if eid % 3 == 0 { Some(0.15) } else { None }, depth_z: if eid % 3 != 1 { Some(0.3) } else { None },
            })),
            _ if warping => loads.push(SolverLoad3D::Bimoment(SolverBimomentLoad {
                node_id: rng.gen_range(1..=n_nodes), bimoment: q(&mut rng),
            })),
            _ => {}
        }
    }
    let pl = |rng: &mut StdRng| SolverPlateThermalLoad {
        element_id: 1, dt_uniform: rng.gen_range(-30.0..30.0), dt_gradient: rng.gen_range(-10.0..10.0),
        alpha: if rng.gen_bool(0.5) { Some(1e-5) } else { None },
    };
    let sw = |rng: &mut StdRng| SolverQuadSelfWeightLoad {
        element_id: 1, density: rng.gen_range(1000.0..3000.0), gx: q(rng) / 2.0, gy: q(rng) / 2.0, gz: -9.81,
    };
    let edge = |rng: &mut StdRng| SolverQuadEdgeLoad { element_id: 1, edge: rng.gen_range(0..4), qn: q(rng), qt: q(rng) };
    if !plates.is_empty() {
        loads.push(SolverLoad3D::Pressure(SolverPressureLoad { element_id: 2, pressure: q(&mut rng) }));
        loads.push(SolverLoad3D::PlateThermal(pl(&mut rng)));
    }
    if !quads.is_empty() {
        loads.push(SolverLoad3D::QuadPressure(SolverPressureLoad { element_id: 1, pressure: q(&mut rng) }));
        loads.push(SolverLoad3D::QuadThermal(pl(&mut rng)));
        loads.push(SolverLoad3D::QuadSelfWeight(sw(&mut rng)));
        loads.push(SolverLoad3D::QuadEdge(edge(&mut rng)));
    }
    if !quad9s.is_empty() {
        loads.push(SolverLoad3D::Quad9Pressure(SolverPressureLoad { element_id: 1, pressure: q(&mut rng) }));
        loads.push(SolverLoad3D::Quad9Thermal(pl(&mut rng)));
        loads.push(SolverLoad3D::Quad9SelfWeight(sw(&mut rng)));
        loads.push(SolverLoad3D::Quad9Edge(edge(&mut rng)));
    }
    if !solid_shells.is_empty() {
        loads.push(SolverLoad3D::SolidShellPressure(SolverPressureLoad { element_id: 1, pressure: q(&mut rng) }));
        loads.push(SolverLoad3D::SolidShellSelfWeight(SolverSolidShellSelfWeightLoad {
            element_id: 1, density: rng.gen_range(1000.0..3000.0), gx: 0.0, gy: 0.0, gz: -9.81,
        }));
    }
    if !curved_shells.is_empty() {
        loads.push(SolverLoad3D::CurvedShellPressure(SolverPressureLoad { element_id: 1, pressure: q(&mut rng) }));
        loads.push(SolverLoad3D::CurvedShellThermal(pl(&mut rng)));
        loads.push(SolverLoad3D::CurvedShellSelfWeight(sw(&mut rng)));
        loads.push(SolverLoad3D::CurvedShellEdge(edge(&mut rng)));
    }

    let mut connectors = HashMap::new();
    if rng.gen_bool(0.25) {
        let a = rng.gen_range(1..=n_nodes);
        let b = rng.gen_range(1..=n_nodes);
        if a != b {
            connectors.insert("1".to_string(), ConnectorElement {
                id: 1, node_i: a, node_j: b,
                k_axial: spring_k(&mut rng), k_shear: spring_k(&mut rng), k_moment: spring_k(&mut rng),
                k_shear_z: spring_k(&mut rng), k_bend_y: spring_k(&mut rng), k_bend_z: spring_k(&mut rng),
            });
        }
    }

    let densities = random_densities(&mut rng, n_mats);
    let input = SolverInput3D {
        solver_options: None, masses: Default::default(), nodes, materials, sections, elements, supports, loads,
        constraints: vec![],
        left_hand: if rng.gen_bool(0.2) { Some(true) } else { None },
        plates, quads, quad9s, solid_shells, curved_shells,
        curved_beams: vec![],
        connectors,
    };
    (input, densities)
}

/// The 3D counterpart of `add_random_constraints_2d`.
pub fn add_random_constraints_3d(input: &mut SolverInput3D, seed: u64) {
    let mut rng = StdRng::seed_from_u64(seed ^ 0xC0457);
    let mut free = unsupported_nodes(input.nodes.values().map(|n| n.id), input.supports.values().map(|s| s.node_id));
    for _ in 0..rng.gen_range(1..=2) {
        if free.len() < 2 {
            return;
        }
        let master = free.remove(rng.gen_range(0..free.len()));
        let slave = free.remove(rng.gen_range(0..free.len()));
        let c = match rng.gen_range(0..4) {
            0 => {
                let mut dofs: Vec<usize> = (0..6).filter(|_| rng.gen_bool(0.5)).collect();
                if dofs.is_empty() { dofs.push(2); }
                Constraint::EqualDOF(EqualDOFConstraint { master_node: master, slave_node: slave, dofs })
            }
            1 => Constraint::RigidLink(RigidLinkConstraint { master_node: master, slave_node: slave, dofs: vec![] }),
            2 => Constraint::Diaphragm(DiaphragmConstraint { master_node: master, slave_nodes: vec![slave], plane: "XY".into() }),
            _ => Constraint::LinearMPC(LinearMPCConstraint { terms: vec![
                MPCTerm { node_id: slave, dof: 2, coefficient: 1.0 },
                MPCTerm { node_id: master, dof: 0, coefficient: -rng.gen_range(0.5..2.0) },
            ] }),
        };
        input.constraints.push(c);
    }
}
