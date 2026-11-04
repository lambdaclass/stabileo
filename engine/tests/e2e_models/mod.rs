//! Random but stable frame models for the end-to-end certificate tests: every
//! feature the re-assembly covers, on structures that are not mechanisms, so
//! almost every model reaches the certificate.
#![allow(dead_code)]

use dedaliano_engine::types::*;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::collections::HashMap;

fn pick<T: Copy>(rng: &mut StdRng, xs: &[T]) -> T {
    xs[rng.gen_range(0..xs.len())]
}

/// Multi-bay, multi-storey 2D frame with jittered geometry, braces, hinges,
/// shear areas, varied supports, settlements, every load type, and
/// sometimes constraints.
pub fn stable_2d(seed: u64) -> SolverInput {
    let mut rng = StdRng::seed_from_u64(seed ^ 0x2D2D);
    let bays = rng.gen_range(1..=3);
    let storeys = rng.gen_range(1..=3);
    let mut nodes = HashMap::new();
    let mut id_of = HashMap::new();
    let mut nid = 0;
    for s in 0..=storeys {
        for b in 0..=bays {
            nid += 1;
            let x = b as f64 * rng.gen_range(3.0..6.0) + if s > 0 { rng.gen_range(-0.4..0.4) } else { 0.0 };
            let z = s as f64 * 3.2 + if s > 0 { rng.gen_range(-0.3..0.3) } else { 0.0 };
            nodes.insert(nid.to_string(), SolverNode { id: nid, x, z });
            id_of.insert((s, b), nid);
        }
    }
    let materials: HashMap<String, SolverMaterial> = (1..=2)
        .map(|i| (i.to_string(), SolverMaterial { id: i, e: rng.gen_range(2.0e4..2.1e5), nu: rng.gen_range(0.15..0.35) }))
        .collect();
    let mut sections = HashMap::new();
    for i in 1..=3 {
        let a = rng.gen_range(0.004..0.03);
        let iz = a * a * rng.gen_range(0.5..3.0);
        let as_y = if rng.gen_bool(0.5) { Some(a * rng.gen_range(0.3..0.9)) } else { None };
        sections.insert(i.to_string(), SolverSection { id: i, a, iz, as_y });
    }
    let mut elements = HashMap::new();
    let mut eid = 0;
    let mut add = |elements: &mut HashMap<String, SolverElement>, rng: &mut StdRng, i: usize, j: usize, t: &str, hs: bool, he: bool| {
        eid += 1;
        elements.insert(
            eid.to_string(),
            SolverElement {
                id: eid,
                elem_type: t.into(),
                node_i: i,
                node_j: j,
                material_id: rng.gen_range(1..=2),
                section_id: rng.gen_range(1..=3),
                hinge_start: hs,
                hinge_end: he,
            },
        );
        eid
    };
    let mut beams = Vec::new();
    for s in 0..storeys {
        for b in 0..=bays {
            add(&mut elements, &mut rng, id_of[&(s, b)], id_of[&(s + 1, b)], "frame", false, false);
        }
    }
    for s in 1..=storeys {
        for b in 0..bays {
            let (hs, he) = match rng.gen_range(0..4) {
                0 => (true, false),
                1 => (false, true),
                _ => (false, false),
            };
            beams.push(add(&mut elements, &mut rng, id_of[&(s, b)], id_of[&(s, b + 1)], "frame", hs, he));
        }
    }
    for s in 0..storeys {
        for b in 0..bays {
            if rng.gen_bool(0.4) {
                let t = pick(&mut rng, &["truss", "cable", "truss"]);
                add(&mut elements, &mut rng, id_of[&(s, b)], id_of[&(s + 1, b + 1)], t, false, false);
            }
        }
    }
    let mut supports = HashMap::new();
    for b in 0..=bays {
        let node_id = id_of[&(0, b)];
        let mut sup = SolverSupport {
            id: b + 1, node_id, support_type: "fixed".into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        };
        match if b == 0 { 0 } else { rng.gen_range(0..5) } {
            0 => {
                if rng.gen_bool(0.3) {
                    sup.dz = Some(rng.gen_range(-0.01..0.0));
                    sup.dry = Some(rng.gen_range(-0.002..0.002));
                }
            }
            1 => sup.support_type = "pinned".into(),
            2 => {
                sup.support_type = "inclinedRoller".into();
                sup.angle = Some(rng.gen_range(-1.2..1.2));
                if rng.gen_bool(0.4) {
                    sup.dx = Some(rng.gen_range(-0.005..0.005));
                    sup.dz = Some(rng.gen_range(-0.005..0.005));
                }
            }
            3 => {
                sup.support_type = "spring".into();
                sup.kx = Some(rng.gen_range(1e3..1e5));
                sup.ky = Some(rng.gen_range(1e4..1e6));
                sup.kz = Some(rng.gen_range(1e3..1e5));
                if rng.gen_bool(0.5) {
                    sup.angle = Some(rng.gen_range(-1.0..1.0));
                }
            }
            _ => {
                sup.support_type = "pinned".into();
                sup.kz = Some(rng.gen_range(1e2..1e4));
            }
        }
        supports.insert((b + 1).to_string(), sup);
    }
    let mut loads = Vec::new();
    let top: Vec<usize> = (0..=bays).map(|b| id_of[&(storeys, b)]).collect();
    loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: top[0], fx: rng.gen_range(-30.0..30.0), fz: rng.gen_range(-30.0..0.0), my: rng.gen_range(-10.0..10.0) }));
    let n_el = elements.len();
    for _ in 0..rng.gen_range(2..6) {
        let element_id = rng.gen_range(1..=n_el);
        let el = &elements[&element_id.to_string()];
        let (ni, nj) = (&nodes[&el.node_i.to_string()], &nodes[&el.node_j.to_string()]);
        let l = ((nj.x - ni.x).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        match rng.gen_range(0..4) {
            0 => loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id, q_i: rng.gen_range(-20.0..5.0), q_j: rng.gen_range(-20.0..5.0), a: None, b: None,
            })),
            1 => {
                let a = rng.gen_range(0.0..0.6 * l);
                let b = rng.gen_range(a + 0.1 * l..l);
                loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                    element_id, q_i: rng.gen_range(-20.0..5.0), q_j: rng.gen_range(-20.0..5.0), a: Some(a), b: Some(b),
                }));
            }
            2 => loads.push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id, a: rng.gen_range(0.0..l), p: rng.gen_range(-40.0..10.0),
                px: if rng.gen_bool(0.5) { Some(rng.gen_range(-10.0..10.0)) } else { None },
                my: if rng.gen_bool(0.5) { Some(rng.gen_range(-10.0..10.0)) } else { None },
            })),
            _ => loads.push(SolverLoad::Thermal(SolverThermalLoad {
                element_id, dt_uniform: rng.gen_range(-30.0..30.0), dt_gradient: rng.gen_range(-15.0..15.0),
                // Some members state α and depth (#407), without drawing from the RNG.
                alpha: if element_id % 2 == 0 { Some(23e-6) } else { None }, depth: if element_id % 3 == 0 { Some(0.3) } else { None },
            })),
        }
    }
    let mut constraints = Vec::new();
    if storeys >= 1 && bays >= 1 && rng.gen_bool(0.35) {
        let s = rng.gen_range(1..=storeys);
        let (m, sl) = (id_of[&(s, 0)], id_of[&(s, bays)]);
        constraints.push(if rng.gen_bool(0.5) {
            Constraint::EqualDOF(EqualDOFConstraint { master_node: m, slave_node: sl, dofs: vec![0] })
        } else {
            Constraint::LinearMPC(LinearMPCConstraint { terms: vec![
                MPCTerm { node_id: sl, dof: 0, coefficient: 1.0 },
                MPCTerm { node_id: m, dof: 0, coefficient: -rng.gen_range(0.8..1.2) },
            ] })
        });
    }
    SolverInput { nodes, materials, sections, elements, supports, loads, constraints, connectors: HashMap::new(), solver_options: None, masses: Default::default() }
}

fn blank_support_3d(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

fn fixed_3d(node_id: usize) -> SolverSupport3D {
    SolverSupport3D { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true, ..blank_support_3d(node_id) }
}

/// 3D building frame with jittered geometry, braces, releases, shear areas,
/// reference vectors, roll angles, left-handed axes, springs, an inclined
/// support, settlements, every member load type, and sometimes diaphragms,
/// rigid links and equal-DOF constraints.
pub fn stable_3d(seed: u64) -> SolverInput3D {
    let mut rng = StdRng::seed_from_u64(seed ^ 0x3D3D);
    let (nx, ny, nz) = (rng.gen_range(1..=2), rng.gen_range(1..=2), rng.gen_range(1..=2));
    let jitter = rng.gen_bool(0.6);
    let mut nodes = HashMap::new();
    let mut id_of = HashMap::new();
    let mut nid = 0;
    for k in 0..=nz {
        for j in 0..=ny {
            for i in 0..=nx {
                nid += 1;
                let jit = |rng: &mut StdRng| if jitter && k > 0 { rng.gen_range(-0.25..0.25) } else { 0.0 };
                let x = i as f64 * 4.0 + jit(&mut rng);
                let y = j as f64 * 3.5 + jit(&mut rng);
                let z = k as f64 * 3.0 + jit(&mut rng);
                nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z });
                id_of.insert((i, j, k), nid);
            }
        }
    }
    let materials: HashMap<String, SolverMaterial> = (1..=2)
        .map(|i| (i.to_string(), SolverMaterial { id: i, e: rng.gen_range(2.0e4..2.1e5), nu: rng.gen_range(0.15..0.35) }))
        .collect();
    let mut sections = HashMap::new();
    for i in 1..=3 {
        let a = rng.gen_range(0.004..0.03);
        let iy = a * a * rng.gen_range(0.5..3.0);
        let iz = a * a * rng.gen_range(0.3..2.0);
        let j = (iy + iz) * rng.gen_range(0.05..0.5);
        let as_y = if rng.gen_bool(0.5) { Some(a * rng.gen_range(0.3..0.9)) } else { None };
        let as_z = if rng.gen_bool(0.5) { Some(a * rng.gen_range(0.3..0.9)) } else { None };
        sections.insert(i.to_string(), SolverSection3D { id: i, name: None, a, iy, iz, j, cw: None, as_y, as_z, shear_center_y: None, shear_center_z: None });
    }
    let mut elements = HashMap::new();
    let mut eid = 0;
    let mut add = |elements: &mut HashMap<String, SolverElement3D>, rng: &mut StdRng, a: usize, b: usize, t: &str, releases: bool| {
        eid += 1;
        let mut el = SolverElement3D {
            id: eid, elem_type: t.into(), node_i: a, node_j: b,
            material_id: rng.gen_range(1..=2), section_id: rng.gen_range(1..=3),
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        };
        if t == "frame" {
            match rng.gen_range(0..5) {
                0 => {
                    // reference vector not parallel to the member
                    let v = [rng.gen_range(-1.0..1.0), rng.gen_range(-1.0..1.0), rng.gen_range(0.3..1.0)];
                    el.local_yx = Some(v[0]);
                    el.local_yy = Some(v[1]);
                    el.local_yz = Some(v[2]);
                }
                1 => el.roll_angle = Some(rng.gen_range(-90.0..90.0)),
                _ => {}
            }
            if releases {
                match rng.gen_range(0..6) {
                    0 => el.release_mz_start = true,
                    1 => el.release_my_end = true,
                    2 => {
                        el.release_my_start = true;
                        el.release_mz_start = true;
                    }
                    3 => {
                        el.release_mz_start = true;
                        el.release_mz_end = true;
                    }
                    _ => {}
                }
            }
        }
        elements.insert(eid.to_string(), el);
        eid
    };
    for k in 0..nz {
        for j in 0..=ny {
            for i in 0..=nx {
                add(&mut elements, &mut rng, id_of[&(i, j, k)], id_of[&(i, j, k + 1)], "frame", false);
            }
        }
    }
    for k in 1..=nz {
        for j in 0..=ny {
            for i in 0..nx {
                add(&mut elements, &mut rng, id_of[&(i, j, k)], id_of[&(i + 1, j, k)], "frame", true);
            }
        }
        for j in 0..ny {
            for i in 0..=nx {
                add(&mut elements, &mut rng, id_of[&(i, j, k)], id_of[&(i, j + 1, k)], "frame", true);
            }
        }
    }
    for k in 0..nz {
        if rng.gen_bool(0.5) {
            let t = pick(&mut rng, &["truss", "cable"]);
            add(&mut elements, &mut rng, id_of[&(0, 0, k)], id_of[&(1, 0, k + 1)], t, false);
        }
    }
    let mut supports = HashMap::new();
    let mut sid = 0;
    let mut inclined_done = false;
    for j in 0..=ny {
        for i in 0..=nx {
            let node = id_of[&(i, j, 0)];
            let mut s = fixed_3d(node);
            match if i == 0 && j == 0 { 0 } else { rng.gen_range(0..5) } {
                0 => {
                    if rng.gen_bool(0.3) {
                        s.dz = Some(rng.gen_range(-0.01..0.0));
                        s.dry = Some(rng.gen_range(-0.001..0.001));
                    }
                }
                1 => {
                    s.rrx = false;
                    s.rry = false;
                    s.krx = Some(rng.gen_range(1e2..1e4));
                    s.kry = Some(rng.gen_range(1e2..1e4));
                }
                2 => {
                    s.kz = Some(rng.gen_range(1e4..1e6)); // spring makes uz free
                }
                3 if !inclined_done => {
                    inclined_done = true;
                    s.is_inclined = Some(true);
                    let n = [rng.gen_range(-0.5..0.5), rng.gen_range(-0.5..0.5), 1.0];
                    s.normal_x = Some(n[0]);
                    s.normal_y = Some(n[1]);
                    s.normal_z = Some(n[2]);
                    if rng.gen_bool(0.4) {
                        s.dz = Some(rng.gen_range(-0.005..0.0));
                    }
                }
                _ => {}
            }
            sid += 1;
            supports.insert(sid.to_string(), s);
        }
    }
    let mut loads = Vec::new();
    let top = id_of[&(nx, ny, nz)];
    loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: top, fx: rng.gen_range(-20.0..20.0), fy: rng.gen_range(-20.0..20.0), fz: rng.gen_range(-30.0..0.0),
        mx: rng.gen_range(-5.0..5.0), my: rng.gen_range(-5.0..5.0), mz: rng.gen_range(-5.0..5.0), bw: None,
    }));
    let n_el = elements.len();
    for _ in 0..rng.gen_range(2..7) {
        let element_id = rng.gen_range(1..=n_el);
        let el = &elements[&element_id.to_string()];
        let (ni, nj) = (&nodes[&el.node_i.to_string()], &nodes[&el.node_j.to_string()]);
        let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        match rng.gen_range(0..4) {
            0 | 1 => {
                let partial = rng.gen_bool(0.5);
                let a = if partial { rng.gen_range(0.0..0.5 * l) } else { 0.0 };
                let b = if partial { rng.gen_range(a + 0.1 * l..l) } else { l };
                loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    q_xi: rng.gen_range(-3.0..3.0), q_xj: rng.gen_range(-3.0..3.0),
                    element_id,
                    q_yi: rng.gen_range(-10.0..10.0), q_yj: rng.gen_range(-10.0..10.0),
                    q_zi: rng.gen_range(-15.0..5.0), q_zj: rng.gen_range(-15.0..5.0),
                    a: if partial { Some(a) } else { None },
                    b: if partial { Some(b) } else { None },
                }));
            }
            2 => loads.push(SolverLoad3D::PointOnElement(SolverPointLoad3D {
                element_id, a: rng.gen_range(0.0..l), py: rng.gen_range(-20.0..20.0), pz: rng.gen_range(-30.0..10.0),
            })),
            _ => loads.push(SolverLoad3D::Thermal(SolverThermalLoad3D {
                element_id, dt_uniform: rng.gen_range(-30.0..30.0),
                dt_gradient_y: rng.gen_range(-10.0..10.0), dt_gradient_z: rng.gen_range(-10.0..10.0),
                alpha: if element_id % 2 == 0 { Some(23e-6) } else { None },
                depth_y: if element_id % 3 == 0 { Some(0.15) } else { None }, depth_z: if element_id % 3 != 1 { Some(0.3) } else { None },
            })),
        }
    }
    let mut constraints = Vec::new();
    match rng.gen_range(0..5) {
        0 => {
            let k = nz;
            let master = id_of[&(0, 0, k)];
            let slaves = (0..=ny).flat_map(|j| (0..=nx).map(move |i| (i, j))).filter(|&(i, j)| (i, j) != (0, 0)).map(|(i, j)| id_of[&(i, j, k)]).collect();
            constraints.push(Constraint::Diaphragm(DiaphragmConstraint { master_node: master, slave_nodes: slaves, plane: "XY".into() }));
        }
        1 => {
            constraints.push(Constraint::RigidLink(RigidLinkConstraint {
                master_node: id_of[&(0, 0, nz)], slave_node: id_of[&(nx, 0, nz)], dofs: vec![],
            }));
        }
        2 => {
            constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
                master_node: id_of[&(0, 0, nz)], slave_node: id_of[&(nx, ny, nz)], dofs: vec![0, 1, 5],
            }));
        }
        _ => {}
    }
    SolverInput3D {
        nodes, materials, sections, elements, supports, loads, constraints, masses: Default::default(),
        // The engine refuses `leftHand: true` before the solve; the draw stays so the seeds
        // give the same models.
        left_hand: { let _ = rng.gen_bool(0.2); None },
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: Vec::new(), connectors: HashMap::new(), solver_options: None,
    }
}
