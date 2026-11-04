//! Model-aware target: `arbitrary` builds small 2D/3D frame models directly
//! (valid ids, coordinates on a grid, stiffnesses over many decades, any
//! support layout including none) so the solver and certificates run on every
//! input instead of only on the rare bytes that parse as JSON.
//!
//! Checks: the linear solve, the linear certificate, buckling and modal
//! certificates return `Err` or finite results; certificates are consistent;
//! a certified linear result with nodal loads is in global equilibrium; the
//! JSON round trip the WASM layer does is lossless for the model; several
//! supports on one node are rejected unless all are plain rigid restraints.
#![no_main]

use arbitrary::Arbitrary;
use dedaliano_engine::certify::{self, buckling as cbuck, modal as cmodal, Certificate};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use dedaliano_engine_fuzz::{check_equilibrium_2d, check_equilibrium_3d, check_output, within_bounds};
use libfuzzer_sys::fuzz_target;
use std::collections::HashMap;

const MAX_NODES: usize = 16;
const MAX_ELEMS: usize = 32;

#[derive(Arbitrary, Debug)]
struct Elem {
    i: u8,
    j: u8,
    truss: bool,
    rel_i: bool,
    rel_j: bool,
    mat: u8,
    sec: u8,
}

/// Mask bit that keeps a support on an already supported node (merged if all
/// are plain rigid restraints, rejected otherwise); without it such supports
/// are dropped, so most models have one support per node.
const DUPLICATE_SUPPORT: u8 = 0x80;

#[derive(Arbitrary, Debug)]
struct Support {
    node: u8,
    /// Restraint bits (low 2 pick the 2D type, low 6 the 3D flags), plus
    /// `DUPLICATE_SUPPORT`.
    mask: u8,
    settlement: Option<i8>,
    spring: Option<u8>,
}

#[derive(Arbitrary, Debug)]
enum Load {
    Nodal { node: u8, f: [i8; 3], m: i8 },
    Distributed { elem: u8, qi: i8, qj: i8 },
    Point { elem: u8, a: u8, p: i8 },
}

#[derive(Arbitrary, Debug)]
struct Model {
    three_d: bool,
    /// Grid coordinates (×0.5 m).
    nodes: Vec<[i8; 3]>,
    elems: Vec<Elem>,
    /// log10 of E (MPa), clamped to [-3, 9].
    e_exp: Vec<i8>,
    /// log10 of A and I, clamped to [-9, 1].
    sec_exp: Vec<(i8, i8)>,
    supports: Vec<Support>,
    loads: Vec<Load>,
    num_modes: u8,
    analyses: u8,
}

fn pick(idx: u8, n: usize) -> usize {
    idx as usize % n + 1
}

fn pow10(e: i8, lo: i8, hi: i8) -> f64 {
    10f64.powi(e.clamp(lo, hi) as i32)
}

fn materials(m: &Model) -> HashMap<String, SolverMaterial> {
    let exps: Vec<i8> = if m.e_exp.is_empty() { vec![5] } else { m.e_exp.iter().copied().take(4).collect() };
    exps.iter()
        .enumerate()
        .map(|(k, &x)| ((k + 1).to_string(), SolverMaterial { id: k + 1, e: pow10(x, -3, 9), nu: 0.3 }))
        .collect()
}

fn n_secs(m: &Model) -> usize {
    m.sec_exp.len().clamp(1, 4)
}

fn sec_props(m: &Model, k: usize) -> (f64, f64) {
    m.sec_exp.get(k).map_or((1e-2, 1e-4), |&(a, i)| (pow10(a, -9, 1), pow10(i, -9, 1)))
}

fn build_2d(m: &Model) -> Option<SolverInput> {
    let nn = m.nodes.len().min(MAX_NODES);
    if nn < 2 {
        return None;
    }
    let nodes = (0..nn)
        .map(|k| (k + 1).to_string())
        .zip((0..nn).map(|k| SolverNode { id: k + 1, x: m.nodes[k][0] as f64 * 0.5, z: m.nodes[k][1] as f64 * 0.5 }))
        .collect();
    let mats = materials(m);
    let ns = n_secs(m);
    let sections = (0..ns)
        .map(|k| {
            let (a, iz) = sec_props(m, k);
            ((k + 1).to_string(), SolverSection { id: k + 1, a, iz, as_y: None })
        })
        .collect();
    let elements: HashMap<String, SolverElement> = m
        .elems
        .iter()
        .take(MAX_ELEMS)
        .enumerate()
        .map(|(k, e)| {
            let el = SolverElement {
                id: k + 1,
                elem_type: if e.truss { "truss" } else { "frame" }.to_string(),
                node_i: pick(e.i, nn),
                node_j: pick(e.j, nn),
                material_id: pick(e.mat, mats.len()),
                section_id: pick(e.sec, ns),
                hinge_start: e.rel_i,
                hinge_end: e.rel_j,
            };
            ((k + 1).to_string(), el)
        })
        .collect();
    if elements.is_empty() {
        return None;
    }
    let mut supported = std::collections::HashSet::new();
    let supports = m
        .supports
        .iter()
        .take(nn)
        .filter(|s| supported.insert(pick(s.node, nn)) || s.mask & DUPLICATE_SUPPORT != 0)
        .enumerate()
        .map(|(k, s)| {
            let support_type = match (s.spring, s.mask % 4) {
                (Some(_), _) => "spring",
                (None, 0) => "fixed",
                (None, 1) => "pinned",
                (None, 2) => "rollerX",
                _ => "rollerZ",
            };
            let k_val = s.spring.map(|x| 10f64.powi((x % 12) as i32));
            let sup = SolverSupport {
                id: k + 1,
                node_id: pick(s.node, nn),
                support_type: support_type.to_string(),
                kx: k_val,
                ky: k_val,
                kz: k_val,
                dx: s.settlement.map(|d| d as f64 * 1e-3),
                dz: None,
                dry: None,
                angle: None,
            };
            ((k + 1).to_string(), sup)
        })
        .collect();
    let ne = elements.len();
    let loads = m
        .loads
        .iter()
        .take(16)
        .map(|l| match *l {
            Load::Nodal { node, f, m: my } => SolverLoad::Nodal(SolverNodalLoad {
                node_id: pick(node, nn),
                fx: f[0] as f64,
                fz: f[1] as f64,
                my: my as f64,
            }),
            Load::Distributed { elem, qi, qj } => SolverLoad::Distributed(SolverDistributedLoad {
                element_id: pick(elem, ne),
                q_i: qi as f64,
                q_j: qj as f64,
                a: None,
                b: None,
            }),
            Load::Point { elem, a, p } => SolverLoad::PointOnElement(SolverPointLoadOnElement {
                element_id: pick(elem, ne),
                a: a as f64 / 255.0,
                p: p as f64,
                px: None,
                my: None,
            }),
        })
        .collect();
    Some(SolverInput {
        nodes,
        materials: mats,
        sections,
        elements,
        supports,
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None, masses: Default::default(),
    })
}

fn build_3d(m: &Model) -> Option<SolverInput3D> {
    let nn = m.nodes.len().min(MAX_NODES);
    if nn < 2 {
        return None;
    }
    let nodes = (0..nn)
        .map(|k| {
            let [x, y, z] = m.nodes[k];
            ((k + 1).to_string(), SolverNode3D { id: k + 1, x: x as f64 * 0.5, y: y as f64 * 0.5, z: z as f64 * 0.5 })
        })
        .collect();
    let mats = materials(m);
    let ns = n_secs(m);
    let sections = (0..ns)
        .map(|k| {
            let (a, i) = sec_props(m, k);
            let sec = SolverSection3D { id: k + 1, name: None, a, iy: i, iz: i * 0.5, j: i * 0.3, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None };
            ((k + 1).to_string(), sec)
        })
        .collect();
    let elements: HashMap<String, SolverElement3D> = m
        .elems
        .iter()
        .take(MAX_ELEMS)
        .enumerate()
        .map(|(k, e)| {
            let el = SolverElement3D {
                id: k + 1,
                elem_type: if e.truss { "truss" } else { "frame" }.to_string(),
                node_i: pick(e.i, nn),
                node_j: pick(e.j, nn),
                material_id: pick(e.mat, mats.len()),
                section_id: pick(e.sec, ns),
                release_my_start: e.rel_i,
                release_my_end: e.rel_j,
                release_mz_start: e.rel_i,
                release_mz_end: e.rel_j,
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            };
            ((k + 1).to_string(), el)
        })
        .collect();
    if elements.is_empty() {
        return None;
    }
    let mut supported = std::collections::HashSet::new();
    let supports = m
        .supports
        .iter()
        .take(nn)
        .filter(|s| supported.insert(pick(s.node, nn)) || s.mask & DUPLICATE_SUPPORT != 0)
        .enumerate()
        .map(|(k, s)| {
            let b = |bit: u8| s.mask & (1 << bit) != 0;
            let k_val = s.spring.map(|x| 10f64.powi((x % 12) as i32));
            let sup = SolverSupport3D {
                node_id: pick(s.node, nn),
                rx: b(0),
                ry: b(1),
                rz: b(2),
                rrx: b(3),
                rry: b(4),
                rrz: b(5),
                kx: k_val,
                ky: None,
                kz: None,
                krx: None,
                kry: None,
                krz: None,
                dx: s.settlement.map(|d| d as f64 * 1e-3),
                dy: None,
                dz: None,
                drx: None,
                dry: None,
                drz: None,
                rw: None,
                kw: None,
                normal_x: None,
                normal_y: None,
                normal_z: None,
                is_inclined: None,
            };
            ((k + 1).to_string(), sup)
        })
        .collect();
    let ne = elements.len();
    let loads = m
        .loads
        .iter()
        .take(16)
        .map(|l| match *l {
            Load::Nodal { node, f, m: mm } => SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: pick(node, nn),
                fx: f[0] as f64,
                fy: f[1] as f64,
                fz: f[2] as f64,
                mx: mm as f64,
                my: 0.0,
                mz: 0.0,
                bw: None,
            }),
            Load::Distributed { elem, qi, qj } => SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: pick(elem, ne),
                q_xi: 0.0,
                q_xj: 0.0,
                q_yi: qi as f64,
                q_yj: qj as f64,
                q_zi: 0.0,
                q_zj: 0.0,
                a: None,
                b: None,
            }),
            Load::Point { elem, a, p } => SolverLoad3D::PointOnElement(SolverPointLoad3D {
                element_id: pick(elem, ne),
                a: a as f64 / 255.0,
                py: 0.0,
                pz: p as f64,
            }),
        })
        .collect();
    Some(SolverInput3D {
        nodes,
        materials: mats,
        sections,
        elements,
        supports,
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
        solver_options: None, masses: Default::default(),
    })
}

/// The model survives the JSON round trip the WASM layer does.
fn round_trips<T: serde::Serialize + serde::de::DeserializeOwned>(input: &T) {
    let a = serde_json::to_value(input).expect("model serializes");
    let back: T = serde_json::from_value(a.clone()).expect("serialized model parses back");
    assert_eq!(a, serde_json::to_value(&back).unwrap(), "JSON round trip changed the model");
}

fn densities(input_mats: usize) -> HashMap<String, f64> {
    (1..=input_mats).map(|k| (k.to_string(), 7850.0)).collect()
}

fuzz_target!(|m: Model| {
    let n = 1 + (m.num_modes % 4) as usize;
    if m.three_d {
        let Some(input) = build_3d(&m) else { return };
        if !within_bounds(&input) {
            return;
        }
        round_trips(&input);
        if ambiguous_shared_node(input.supports.values().map(|s| (s.node_id, plain_3d(s)))) {
            assert!(linear::solve_3d(&input).is_err(), "solve_3d accepted an ambiguous shared support node");
            assert!(certify::certify_linear_3d_full(&input).is_err(), "certify_linear_3d accepted an ambiguous shared support node");
            assert!(cbuck::certify_buckling_3d(&input, n).is_err(), "certify_buckling_3d accepted an ambiguous shared support node");
            return;
        }
        if let Ok(r) = linear::solve_3d(&input) {
            check_output("solve_3d", &r);
        }
        if let Ok(out) = certify::certify_linear_3d_full(&input) {
            check_output("certify_linear_3d", &out);
            check_equilibrium_3d(&input, &out.results, &out.certificate);
            only_certified_if_finite(&out.certificate);
        }
        if m.analyses & 1 != 0 {
            if let Ok(out) = cbuck::certify_buckling_3d(&input, n) {
                check_output("certify_buckling_3d", &out);
            }
        }
        if m.analyses & 2 != 0 {
            let d = densities(input.materials.len());
            if let Ok(out) = cmodal::certify_modal_3d(&input, &d, n) {
                check_output("certify_modal_3d", &out);
            }
        }
    } else {
        let Some(input) = build_2d(&m) else { return };
        round_trips(&input);
        if ambiguous_shared_node(input.supports.values().map(|s| (s.node_id, plain_2d(s)))) {
            assert!(linear::solve_2d(&input).is_err(), "solve_2d accepted an ambiguous shared support node");
            assert!(certify::certify_linear_2d_full(&input).is_err(), "certify_linear_2d accepted an ambiguous shared support node");
            assert!(cbuck::certify_buckling_2d(&input, n).is_err(), "certify_buckling_2d accepted an ambiguous shared support node");
            return;
        }
        if let Ok(r) = linear::solve_2d(&input) {
            check_output("solve_2d", &r);
        }
        if let Ok(out) = certify::certify_linear_2d_full(&input) {
            check_output("certify_linear_2d", &out);
            check_equilibrium_2d(&input, &out.results, &out.certificate);
            only_certified_if_finite(&out.certificate);
        }
        if m.analyses & 1 != 0 {
            if let Ok(out) = cbuck::certify_buckling_2d(&input, n) {
                check_output("certify_buckling_2d", &out);
            }
        }
        if m.analyses & 2 != 0 {
            let d = densities(input.materials.len());
            if let Ok(out) = cmodal::certify_modal_2d(&input, &d, n) {
                check_output("certify_modal_2d", &out);
            }
        }
    }
});

/// A certified linear result carries a finite bound.
fn only_certified_if_finite(c: &Certificate) {
    if let Certificate::Certified { abs_bound, residual_norm, sigma, .. } = c {
        assert!(abs_bound.is_finite() && residual_norm.is_finite() && sigma.is_finite(), "certified with a non-finite bound: {c:?}");
    }
}

/// Some node has several supports and one of them is not a plain rigid
/// restraint (the engine merges plain ones by OR and rejects the rest).
fn ambiguous_shared_node(sups: impl Iterator<Item = (usize, bool)>) -> bool {
    let mut at: HashMap<usize, (usize, bool)> = HashMap::new();
    for (node, plain) in sups {
        let e = at.entry(node).or_insert((0, true));
        e.0 += 1;
        e.1 &= plain;
    }
    at.values().any(|&(count, all_plain)| count > 1 && !all_plain)
}

fn zero(v: Option<f64>) -> bool {
    v.is_none_or(|x| x == 0.0)
}

fn plain_2d(s: &SolverSupport) -> bool {
    s.support_type != "spring" && [s.kx, s.ky, s.kz, s.dx, s.dz, s.dry, s.angle].into_iter().all(zero)
}

fn plain_3d(s: &SolverSupport3D) -> bool {
    !s.is_inclined.unwrap_or(false)
        && [s.kx, s.ky, s.kz, s.krx, s.kry, s.krz, s.kw, s.dx, s.dy, s.dz, s.drx, s.dry, s.drz].into_iter().all(zero)
}
