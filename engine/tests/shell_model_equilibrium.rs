//! Shell elements inside a model: the same structure answers the same way whichever shell
//! element it is built from, and its reactions balance its loads.
//!
//! `shell_rigid_body_modes.rs` checks each element on its own. These check what that means in a
//! solved model: a nodal moment on a shell has the sign every other element gives it, and a
//! shell carrying a load does not hand part of it to the ground through a stabilisation term.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 30_000.0; // MPa; the solver works in kN/m² internally
const NU: f64 = 0.2;
const T: f64 = 0.1;
const L: f64 = 2.0;
const W: f64 = 0.5;
const NX: usize = 8;
const NY: usize = 2;

#[derive(Clone, Copy, PartialEq)]
enum Kind { Mitc4, Curved, Mitc9, Dkt }

const KINDS: [Kind; 4] = [Kind::Mitc4, Kind::Curved, Kind::Mitc9, Kind::Dkt];

fn name(kind: Kind) -> &'static str {
    match kind { Kind::Mitc4 => "MITC4", Kind::Curved => "curved", Kind::Mitc9 => "MITC9", Kind::Dkt => "DKT" }
}

fn support(node_id: usize) -> SolverSupport3D {
    SolverSupport3D {
        node_id,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None,
        is_inclined: None, rw: None, kw: None,
    }
}

fn nodal(node_id: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None,
    })
}

/// A strip along X in the XY plane, clamped at x = 0. `grid[i][j]` are its corner nodes (the
/// nodes every element kind shares), column i, row j.
fn strip(kind: Kind) -> (SolverInput3D, Vec<Vec<usize>>) {
    // MITC9 needs mid-side and centre nodes: build the node lattice at half spacing for it.
    let sub = if kind == Kind::Mitc9 { 2 } else { 1 };
    let (mx, my) = (NX * sub, NY * sub);
    let mut nodes = HashMap::new();
    let mut lattice = vec![vec![0usize; my + 1]; mx + 1];
    let mut id = 1;
    for i in 0..=mx {
        for j in 0..=my {
            nodes.insert(id.to_string(), SolverNode3D { id, x: L * i as f64 / mx as f64, y: W * j as f64 / my as f64, z: 0.0 });
            lattice[i][j] = id;
            id += 1;
        }
    }
    let grid: Vec<Vec<usize>> = (0..=NX).map(|i| (0..=NY).map(|j| lattice[i * sub][j * sub]).collect()).collect();
    let mut quads = HashMap::new();
    let mut curved = HashMap::new();
    let mut quad9s = HashMap::new();
    let mut plates = HashMap::new();
    let mut eid = 1;
    for i in 0..NX {
        for j in 0..NY {
            let n = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
            match kind {
                Kind::Mitc4 => { quads.insert(eid.to_string(), SolverQuadElement { id: eid, nodes: n, material_id: 1, thickness: T }); }
                Kind::Curved => { curved.insert(eid.to_string(), SolverCurvedShellElement { id: eid, nodes: n, material_id: 1, thickness: T, normals: None }); }
                Kind::Mitc9 => {
                    let (a, b) = (2 * i, 2 * j);
                    let n9 = [
                        lattice[a][b], lattice[a + 2][b], lattice[a + 2][b + 2], lattice[a][b + 2],
                        lattice[a + 1][b], lattice[a + 2][b + 1], lattice[a + 1][b + 2], lattice[a][b + 1],
                        lattice[a + 1][b + 1],
                    ];
                    quad9s.insert(eid.to_string(), SolverQuad9Element { id: eid, nodes: n9, material_id: 1, thickness: T });
                }
                Kind::Dkt => {
                    plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[1], n[2]], material_id: 1, thickness: T });
                    eid += 1;
                    plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes: [n[0], n[2], n[3]], material_id: 1, thickness: T });
                }
            }
            eid += 1;
        }
    }
    let mut supports = HashMap::new();
    for (k, nid) in lattice[0].iter().enumerate() {
        supports.insert((k + 1).to_string(), support(*nid));
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: NU });
    let input = SolverInput3D {
        nodes, materials, sections: HashMap::new(), elements: HashMap::new(), supports, loads: vec![],
        constraints: vec![], left_hand: None,
        plates, quads, quad9s, solid_shells: HashMap::new(), curved_shells: curved,
        curved_beams: vec![], connectors: HashMap::new(),
    };
    (input, grid)
}

fn tip_uz(res: &AnalysisResults3D, grid: &[Vec<usize>]) -> f64 {
    let tip: Vec<f64> = grid[NX].iter().map(|n| res.displacements.iter().find(|d| d.node_id == *n).unwrap().uz).collect();
    tip.iter().sum::<f64>() / tip.len() as f64
}

/// Moment about Y at the tip, M in total: a clamped strip curls with the sign of M.
fn tip_moment(kind: Kind, m: f64) -> f64 {
    let (mut input, grid) = strip(kind);
    for n in &grid[NX] {
        input.loads.push(nodal(*n, [0.0, 0.0, 0.0, 0.0, m / (NY + 1) as f64, 0.0]));
    }
    tip_uz(&linear::solve_3d(&input).unwrap(), &grid)
}

#[test]
fn a_tip_moment_bends_every_shell_the_same_way() {
    // Beam theory for the strip: uz(L) = −M·L² / (2·E·I) for M about +Y (right hand: +My lifts
    // the tip toward −Z along +X). Both shells must agree with each other and with that sign.
    let m = 1.0;
    let ei = E * 1000.0 * W * T.powi(3) / 12.0;
    let beam = -m * L * L / (2.0 * ei);
    for kind in KINDS {
        let r = tip_moment(kind, m) / beam;
        // The sign is the point; plate action stiffens the strip by up to 1/(1−ν²).
        assert!(r > 0.9 && r < 1.05, "{}: tip uz / beam = {r:.4}", name(kind));
    }
}

/// A strip with an edge beam sharing its nodes, carrying an in-plane tip load, with its
/// reactions summed about the clamp.
///
/// The beam is what makes it bite. On a flat shell alone the drilling DOF couples to nothing and
/// stays at zero; a beam bending in the shell's plane turns those nodes about the normal, and a
/// drilling term that resists rigid rotation then carries part of the load to the ground.
fn reaction_balance(kind: Kind) -> (f64, f64) {
    let (mut input, grid) = strip(kind);
    input.sections.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: 0.08, iy: 0.2 * 0.4f64.powi(3) / 12.0, iz: 0.2 * 0.4f64.powi(3) / 12.0, j: 1e-3,
        cw: None, as_y: None, as_z: None,
    });
    for i in 0..NX {
        input.elements.insert((i + 1).to_string(), SolverElement3D {
            id: i + 1, elem_type: "frame".to_string(), node_i: grid[i][0], node_j: grid[i + 1][0],
            material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }
    // In-plane: a tip shear along Y, which bends strip and beam in their own plane.
    let p = 10.0;
    for n in &grid[NX] {
        input.loads.push(nodal(*n, [0.0, p / (NY + 1) as f64, 0.0, 0.0, 0.0, 0.0]));
    }
    let res = linear::solve_3d(&input).unwrap();
    // Moment of the reactions about the clamp's centre (0, W/2, 0), about Z: Σ(x·Ry − (y − W/2)·Rx) + Σ Mz.
    let mut mz = 0.0;
    for r in &res.reactions {
        let n = &input.nodes[&r.node_id.to_string()];
        mz += n.x * r.fy - (n.y - W / 2.0) * r.fx + r.mz;
    }
    // Applied: P at x = L, about Z: +P·L. The reactions must return −P·L.
    (mz, -p * L)
}

#[test]
fn reactions_balance_an_in_plane_load() {
    for kind in KINDS {
        let (got, want) = reaction_balance(kind);
        assert!(((got - want) / want).abs() < 1e-9, "{}: reaction moment {got:.6} against {want:.6}", name(kind));
    }
}

/// Tip deflection of the clamped strip under a through-thickness gradient `dt` (top − bottom).
fn thermal_tip(kind: Kind, dt: f64, alpha: f64) -> f64 {
    let (mut input, grid) = strip(kind);
    let ids: Vec<usize> = match kind {
        Kind::Mitc4 => input.quads.values().map(|q| q.id).collect(),
        Kind::Curved => input.curved_shells.values().map(|q| q.id).collect(),
        Kind::Mitc9 => input.quad9s.values().map(|q| q.id).collect(),
        Kind::Dkt => input.plates.values().map(|q| q.id).collect(),
    };
    for id in ids {
        let l = SolverPlateThermalLoad { element_id: id, dt_uniform: 0.0, dt_gradient: dt, alpha: Some(alpha) };
        input.loads.push(match kind {
            Kind::Mitc4 => SolverLoad3D::QuadThermal(l),
            Kind::Curved => SolverLoad3D::CurvedShellThermal(l),
            Kind::Mitc9 => SolverLoad3D::Quad9Thermal(l),
            Kind::Dkt => SolverLoad3D::PlateThermal(l),
        });
    }
    tip_uz(&linear::solve_3d(&input).unwrap(), &grid)
}

#[test]
fn a_hotter_top_curls_the_strip_down() {
    // Top (+Z, the element normal) hotter by ΔT: the top fibre lengthens, the strip curves with
    // its top convex, and a strip clamped level at x = 0 curls down. Unrestrained plate curvature
    // is α·ΔT/h in both directions; the clamp holds it in the width, so the tip reads between
    // −α·ΔT·L²/(2h) and (1 + ν) times that.
    let (dt, alpha) = (20.0, 1.0e-5);
    let free = -alpha * dt * L * L / (2.0 * T);
    for kind in KINDS {
        eprintln!("{}: tip / free = {:.4}", name(kind), thermal_tip(kind, dt, alpha) / free);
    }
    for kind in KINDS {
        let r = thermal_tip(kind, dt, alpha) / free;
        assert!(r > 0.95 && r < 1.0 + NU + 0.05, "{}: tip / (−αΔTL²/2h) = {r:.4}", name(kind));
    }
}
