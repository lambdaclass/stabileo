//! The shells against statics and against each other.
//!
//! A cantilever strip along x, fixed at x = 0, with an upward line load F across its tip. Every
//! section carries the whole load in shear, so Qx = F/b everywhere, and the tip moves by
//! F·L³/(3·D·b) plus the shear flexibility.
//!
//! The MITC4 quad reads Q from its assumed shear field. The DKT triangle, a Kirchhoff element, has
//! none to read and reports no Q. What both must do is carry the strip the same way: the same tip
//! deflection, converging as the mesh is refined, the same sign of moment, and the same sense of
//! curvature under the same temperature gradient.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const L: f64 = 4.0;
const B: f64 = 1.0;
const T: f64 = 0.2;
const F: f64 = 10.0;
const E: f64 = 30_000.0; // MPa
const NU: f64 = 0.2;

fn fixed(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Mesh { Quads, Triangles }
enum Load { Tip, Gradient(f64) }

struct Strip { grid: Vec<Vec<usize>>, r: AnalysisResults3D }

fn strip(mesh: Mesh, nx: usize, ny: usize, load: Load) -> Strip {
    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: L * i as f64 / nx as f64, y: B * j as f64 / ny as f64, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }
    let mut supports = HashMap::new();
    for j in 0..=ny { supports.insert(j.to_string(), fixed(grid[0][j])); }
    let (mut plates, mut quads, mut loads) = (HashMap::new(), HashMap::new(), Vec::new());
    let mut id = 1;
    for i in 0..nx {
        for j in 0..ny {
            let mut add = |loads: &mut Vec<SolverLoad3D>, id: usize, tri: bool| {
                if let Load::Gradient(dt) = load {
                    let l = SolverPlateThermalLoad { element_id: id, dt_uniform: 0.0, dt_gradient: dt, alpha: Some(1e-5) };
                    loads.push(if tri { SolverLoad3D::PlateThermal(l) } else { SolverLoad3D::QuadThermal(l) });
                }
            };
            match mesh {
                Mesh::Quads => {
                    quads.insert(id.to_string(), SolverQuadElement { id, nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], material_id: 1, thickness: T });
                    add(&mut loads, id, false); id += 1;
                }
                Mesh::Triangles => {
                    for ns in [[grid[i][j], grid[i + 1][j], grid[i + 1][j + 1]], [grid[i][j], grid[i + 1][j + 1], grid[i][j + 1]]] {
                        plates.insert(id.to_string(), SolverPlateElement { id, nodes: ns, material_id: 1, thickness: T });
                        add(&mut loads, id, true); id += 1;
                    }
                }
            }
        }
    }
    if let Load::Tip = load {
        // A uniform line load over the width, as its nodal shares.
        for j in 0..=ny {
            let share = if j == 0 || j == ny { 0.5 } else { 1.0 } * F / ny as f64;
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: grid[nx][j], fx: 0.0, fy: 0.0, fz: share, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
        }
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });
    let input = SolverInput3D {
        solver_options: None,
        nodes, materials, sections: HashMap::new(), elements: HashMap::new(),
        supports, loads, constraints: vec![], left_hand: None,
        plates, quads, quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(),
    };
    Strip { grid, r: linear::solve_3d(&input).expect("solves") }
}

fn tip(s: &Strip) -> f64 {
    let nx = s.grid.len() - 1;
    let row = &s.grid[nx];
    row.iter().map(|n| s.r.displacements.iter().find(|d| d.node_id == *n).unwrap().uz).sum::<f64>() / row.len() as f64
}

/// The Kirchhoff tip deflection of the strip, F·L³/(3·D·b).
fn kirchhoff_tip() -> f64 {
    let d = E * 1000.0 * T.powi(3) / (12.0 * (1.0 - NU * NU));
    F * L.powi(3) / (3.0 * d * B)
}

#[test]
fn mitc4_quads_carry_the_tip_load_as_qx() {
    let s = strip(Mesh::Quads, 8, 2, Load::Tip);
    assert_eq!(s.r.quad_stresses.len(), 16);
    for q in &s.r.quad_stresses {
        let qx = q.qx.expect("a MITC4 quad reports Qx");
        assert!((qx - F / B).abs() < 1e-6 * F, "quad {}: Qx = {qx}, statics F/b = {}", q.element_id, F / B);
    }
    // Qy is the clamped edge's Poisson effect: antisymmetric about the strip's axis, so the two
    // rows of quads cancel at every station.
    let by_id: HashMap<usize, f64> = s.r.quad_stresses.iter().map(|q| (q.element_id, q.qy.unwrap())).collect();
    for i in 0..8 {
        let (a, b) = (by_id[&(2 * i + 1)], by_id[&(2 * i + 2)]);
        assert!((a + b).abs() < 1e-9 * F, "station {i}: Qy {a} and {b} do not cancel");
    }
    // Not at the corners, where the assumed field is poor: none rather than a wrong number.
    assert!(s.r.quad_nodal_stresses.iter().all(|n| n.qx.is_none() && n.qy.is_none()));
}

#[test]
fn dkt_triangles_report_no_shear_rather_than_a_coarse_one() {
    let s = strip(Mesh::Triangles, 8, 2, Load::Tip);
    assert!(s.r.plate_stresses.iter().all(|p| p.qx.is_none() && p.qy.is_none()));
}

#[test]
fn dkt_triangles_converge_to_the_strip_the_quads_give() {
    // The DKT used to grow STIFFER as the mesh was refined (its w terms had no length in them): 10
    // times too stiff on 8×2 and 15 times on 32×8. A clamped strip lies between the plate in
    // cylindrical bending, F·L³/(3·D·b), and the beam, F·L³/(3·E·I); the triangles must land there,
    // settle as the mesh is refined, and agree with the quads.
    let plate = kirchhoff_tip();
    let beam = plate / (1.0 - NU * NU);
    let meshes = [(4, 1), (8, 2), (16, 4), (32, 8)];
    let w: Vec<f64> = meshes.iter().map(|&(nx, ny)| tip(&strip(Mesh::Triangles, nx, ny, Load::Tip))).collect();
    for (k, &(nx, ny)) in meshes.iter().enumerate() {
        assert!(w[k] > 0.99 * plate && w[k] < 1.01 * beam, "{nx}×{ny}: tip {} outside [{plate}, {beam}]", w[k]);
    }
    let steps: Vec<f64> = w.windows(2).map(|p| (p[1] - p[0]).abs()).collect();
    assert!(steps.windows(2).all(|s| s[1] < s[0] + 1e-9), "the tip does not settle: {w:?}");
    let q = tip(&strip(Mesh::Quads, 32, 8, Load::Tip));
    assert!((q - w[3]).abs() / q < 0.01, "quads {q} and triangles {} carry the strip differently", w[3]);
}

#[test]
fn quads_and_triangles_share_the_moment_sign_and_the_thermal_sense() {
    let q = strip(Mesh::Quads, 8, 2, Load::Tip);
    let t = strip(Mesh::Triangles, 8, 2, Load::Tip);
    let root_q = q.r.quad_stresses.iter().map(|s| s.mx).fold(f64::MIN, f64::max);
    let root_t = t.r.plate_stresses.iter().map(|s| s.mx).fold(f64::MIN, f64::max);
    assert!(root_q > 0.0 && root_t > 0.0, "root moments {root_q} and {root_t} have different signs");
    // Free curvature under a gradient: κ = α·ΔT/t, so the tip rises or falls by κ·L²/2, and both
    // elements must move it the same way.
    let dt = 20.0;
    let kl = 1e-5 * dt / T * L * L / 2.0;
    let wq = tip(&strip(Mesh::Quads, 8, 2, Load::Gradient(dt)));
    let wt = tip(&strip(Mesh::Triangles, 8, 2, Load::Gradient(dt)));
    assert!(wq * wt > 0.0, "quads {wq} and triangles {wt} bend opposite ways under one gradient");
    assert!((wq.abs() - kl).abs() / kl < 0.05 && (wt.abs() - kl).abs() / kl < 0.05, "{wq}, {wt} against {kl}");
}
